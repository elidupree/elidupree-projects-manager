use crate::data_format::Collection;
use crate::webserver_glue::Session;
use actix::{Actor, Addr, Context, Handler, Message};
use serde::de::DeserializeOwned;
use serde::{Deserialize, Serialize};
use std::fs::File;
use std::io::{BufReader, BufWriter};
use std::path::{Path, PathBuf};

pub struct Manager {
    collection_file_path: PathBuf,
    collection: Collection,
    password: String,
    clients: Vec<Addr<Session>>,
}

impl Actor for Manager {
    type Context = Context<Self>;
}

pub fn read_json_file<P: AsRef<Path>, T: DeserializeOwned>(path: P) -> anyhow::Result<T> {
    Ok(serde_json::from_reader(BufReader::new(File::open(path)?))?)
}

pub fn write_json_file<P: AsRef<Path>, T: Serialize>(path: P, value: &T) -> anyhow::Result<()> {
    Ok(serde_json::to_writer_pretty(
        BufWriter::new(File::create(path)?),
        value,
    )?)
}

#[derive(Deserialize, Debug, Message)]
#[rtype(result = "()")]
pub enum MessageToManager {}

#[derive(Clone, Serialize, Debug, Message)]
#[rtype(result = "()")]
pub enum MessageToClient {}

impl Manager {
    pub fn new(path: PathBuf, password: String) -> anyhow::Result<Manager> {
        let contents = read_json_file(&path)?;
        Ok(Manager {
            collection_file_path: path,
            collection: contents,
            password,
            clients: vec![],
        })
    }

    pub fn broadcast_message(&mut self, message: MessageToClient) {
        for client in &self.clients {
            client.do_send(message.clone());
        }
    }
}

impl Handler<MessageToManager> for Manager {
    type Result = ();

    fn handle(&mut self, message: MessageToManager, context: &mut Self::Context) -> Self::Result {
        match message {}
    }
}
