use crate::management::{Manager, MessageFromClient, MessageToClient, NewClient};
use actix::{Actor, ActorContext, Addr, AsyncContext, Handler, StreamHandler};
use actix_files::NamedFile;
use actix_web::{get, web, App, Error, HttpRequest, HttpResponse, HttpServer, Responder};
use actix_web_actors::ws;
use std::fs::File;
use std::io::BufReader;
use std::path::PathBuf;

struct WebserverState {
    manager: Addr<Manager>,
    password: String,
}

pub struct Session {
    manager: Addr<Manager>,
    password: String,
    authenticated: bool,
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
                println!("Received from client: {}", text);
                if self.authenticated {
                    if let Ok(message) = serde_json::from_str::<MessageFromClient>(&text) {
                        self.manager.do_send(message)
                    }
                } else if text == self.password {
                    self.authenticated = true;
                } else {
                    ctx.stop();
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
            password: webserver_state.password.clone(),
            authenticated: false,
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
    password: String,
    cert_file_path: PathBuf,
    private_key_file_path: PathBuf,
) {
    let cert_chain =
        rustls_pemfile::certs(&mut BufReader::new(File::open(&cert_file_path).unwrap()))
            .unwrap()
            .into_iter()
            .map(rustls::Certificate)
            .collect();
    let private_key = rustls::PrivateKey(
        rustls_pemfile::pkcs8_private_keys(&mut BufReader::new(
            File::open(&private_key_file_path).unwrap(),
        ))
        .unwrap()
        .remove(0),
    );

    let config = rustls::ServerConfig::builder()
        .with_safe_default_cipher_suites()
        .with_safe_default_kx_groups()
        .with_safe_default_protocol_versions()
        .unwrap()
        .with_no_client_auth()
        .with_single_cert(cert_chain, private_key)
        .expect("bad certificate/key");

    let state = web::Data::new(WebserverState { manager, password });

    HttpServer::new(move || {
        App::new()
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
