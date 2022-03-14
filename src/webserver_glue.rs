use crate::management::{Manager, MessageToClient};
use actix::{Actor, Addr, Handler, StreamHandler};
use actix_files::NamedFile;
use actix_web::{get, web, App, Error, HttpRequest, HttpResponse, HttpServer, Responder};
use actix_web_actors::ws;

struct WebserverState {
    manager: Addr<Manager>,
}

pub struct Session {
    manager: Addr<Manager>,
}

impl Actor for Session {
    type Context = ws::WebsocketContext<Self>;
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
                if let Ok(message) = serde_json::from_str(&text) {
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

pub async fn launch(manager: Addr<Manager>, port: u16) {
    let state = web::Data::new(WebserverState { manager });
    HttpServer::new(move || {
        App::new()
            .app_data(state.clone())
            .service(index)
            .service(session)
    })
    .workers(1)
    .bind(("0.0.0.0", port))
    .unwrap()
    .run()
    .await
    .unwrap();
}
