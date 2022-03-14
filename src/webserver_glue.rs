use crate::management::{Manager, MessageFromClient, MessageToClient, NewClient};
use actix::{Actor, Addr, AsyncContext, Handler, StreamHandler};
use actix_files::NamedFile;
use actix_web::dev::ServiceRequest;
use actix_web::{get, web, App, Error, HttpRequest, HttpResponse, HttpServer, Responder};
use actix_web_actors::ws;
use actix_web_httpauth::extractors::basic::BasicAuth;
use actix_web_httpauth::extractors::AuthenticationError;
use actix_web_httpauth::middleware::HttpAuthentication;
use std::fs;
use std::path::PathBuf;

struct WebserverState {
    manager: Addr<Manager>,
}

pub struct Session {
    manager: Addr<Manager>,
}

impl Actor for Session {
    type Context = ws::WebsocketContext<Self>;

    fn started(&mut self, context: &mut Self::Context) {
        self.manager.do_send(NewClient {
            session: context.address(),
        });
    }
}

impl Handler<MessageToClient> for Session {
    type Result = ();

    fn handle(&mut self, message: MessageToClient, context: &mut Self::Context) -> Self::Result {
        context.text(serde_json::to_string(&message).unwrap());
    }
}

impl StreamHandler<Result<ws::Message, ws::ProtocolError>> for Session {
    fn handle(&mut self, msg: Result<ws::Message, ws::ProtocolError>, ctx: &mut Self::Context) {
        match msg {
            Ok(ws::Message::Ping(msg)) => ctx.pong(&msg),
            Ok(ws::Message::Text(text)) => {
                if let Ok(message) = serde_json::from_str::<MessageFromClient>(&text) {
                    self.manager.do_send(message)
                }
            }
            _ => (),
        }
    }
}

#[get("/session")]
async fn session(
    req: HttpRequest,
    stream: web::Payload,
    webserver_state: web::Data<WebserverState>,
) -> Result<HttpResponse, Error> {
    ws::start(
        Session {
            manager: webserver_state.manager.clone(),
        },
        &req,
        stream,
    )
}

#[get("/")]
async fn index() -> impl Responder {
    NamedFile::open_async("./static/index.html").await.unwrap()
}

pub async fn launch(
    manager: Addr<Manager>,
    port: u16,
    username: String,
    password: String,
    cert_file_path: PathBuf,
    private_key_file_path: PathBuf,
) {
    let cert = rustls::Certificate(fs::read(&cert_file_path).unwrap());
    let private_key = rustls::PrivateKey(fs::read(&private_key_file_path).unwrap());

    let config = rustls::ServerConfig::builder()
        .with_safe_default_cipher_suites()
        .with_safe_default_kx_groups()
        .with_safe_default_protocol_versions()
        .unwrap()
        .with_no_client_auth()
        .with_single_cert(vec![cert], private_key)
        .expect("bad certificate/key");

    let auth = HttpAuthentication::basic(move |req: ServiceRequest, credentials: BasicAuth| {
        let username = username.clone();
        let password = password.clone();
        async move {
            if *credentials.user_id() == username
                && matches!(credentials.password(), Some(p) if *p == password)
            {
                Ok(req)
            } else {
                let config = actix_web_httpauth::extractors::basic::Config::default();
                Err(AuthenticationError::from(config).into())
            }
        }
    });

    let state = web::Data::new(WebserverState { manager });

    HttpServer::new(move || {
        App::new()
            .wrap(auth.clone())
            .app_data(state.clone())
            .service(index)
            .service(session)
    })
    .workers(1)
    .bind_rustls(("0.0.0.0", port), config)
    .unwrap()
    .run()
    .await
    .unwrap();
}
