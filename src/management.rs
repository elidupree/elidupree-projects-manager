use crate::data_format::Collection;
use crate::utils::{read_json_file, write_json_file};
use crate::webserver_glue::Session;
use actix::{Actor, Addr, Context, Handler, Message};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;

pub struct Manager {
    collection_file_path: PathBuf,
    collection: Collection,
    clients: Vec<Addr<Session>>,
}

impl Actor for Manager {
    type Context = Context<Self>;
}

#[derive(Debug, Message)]
#[rtype(result = "()")]
pub struct NewClient {
    pub(crate) session: Addr<Session>,
}

#[derive(Deserialize, Debug, Message)]
#[rtype(result = "()")]
pub enum MessageFromClient {}

#[derive(Clone, Serialize, Debug, Message)]
#[rtype(result = "()")]
pub enum MessageToClient {
    UpdateRecords {},
}

impl Manager {
    pub fn new(path: PathBuf) -> anyhow::Result<Manager> {
        let contents = read_json_file(&path)?;
        Ok(Manager {
            collection_file_path: path,
            collection: contents,
            clients: vec![],
        })
    }

    pub fn broadcast_message(&mut self, message: MessageToClient) {
        for client in &self.clients {
            client.do_send(message.clone());
        }
    }

    fn save_file(&self) {
        let _ = write_json_file(&self.collection_file_path, &self.collection);
    }
}

impl Handler<NewClient> for Manager {
    type Result = ();

    fn handle(&mut self, message: NewClient, _context: &mut Self::Context) -> Self::Result {
        self.clients.push(message.session);
    }
}

impl Handler<MessageFromClient> for Manager {
    type Result = ();

    fn handle(&mut self, message: MessageFromClient, _context: &mut Self::Context) -> Self::Result {
        match message {}
    }
}
