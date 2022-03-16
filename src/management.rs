use crate::data_format::{Collection, Task};
use crate::utils::{read_json_file, write_json_file};
use crate::webserver_glue::Session;
use actix::{Actor, Addr, Context, Handler, Message};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use uuid::Uuid;

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
pub enum MessageFromClient {
    CreateTask(Task),
    UpdateTask(Task),
}

#[derive(Clone, Serialize, Debug, Message)]
#[rtype(result = "()")]
pub enum MessageToClient {
    UpdateRecords(Collection),
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

    fn broadcast_message(&self, message: MessageToClient) {
        for client in &self.clients {
            client.do_send(message.clone());
        }
    }

    fn broadcast_everything(&self) {
        self.broadcast_message(MessageToClient::UpdateRecords(self.collection.clone()));
    }

    fn save_file(&self) {
        let _ = write_json_file(&self.collection_file_path, &self.collection);
    }

    fn broadcast_and_save_everything(&self) {
        self.broadcast_everything();
        self.save_file();
    }
}

impl Handler<NewClient> for Manager {
    type Result = ();

    fn handle(&mut self, message: NewClient, _context: &mut Self::Context) -> Self::Result {
        message
            .session
            .do_send(MessageToClient::UpdateRecords(self.collection.clone()));
        self.clients.push(message.session);
    }
}

impl Handler<MessageFromClient> for Manager {
    type Result = ();

    fn handle(&mut self, message: MessageFromClient, _context: &mut Self::Context) -> Self::Result {
        match message {
            MessageFromClient::CreateTask(task) => {
                self.collection.tasks.push(task);
                self.broadcast_and_save_everything();
            }
            MessageFromClient::UpdateTask(task) => {
                if let Some(existing) = self.collection.tasks.iter_mut().find(|e| e.id == task.id) {
                    *existing = task;
                    self.broadcast_and_save_everything();
                }
            }
        }
    }
}
