use crate::data_format::Collection;
use serde::de::DeserializeOwned;
use serde::{Deserialize, Serialize};
use std::fs::File;
use std::io::{BufReader, BufWriter};
use std::path::{Path, PathBuf};

pub struct ManagedFile {
    path: PathBuf,
    contents: Collection,
    password: String,
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

#[derive(Deserialize, Debug)]
pub enum MessageToManager {}

impl ManagedFile {
    pub fn new(path: PathBuf, password: String) -> anyhow::Result<ManagedFile> {
        let contents = read_json_file(&path)?;
        Ok(ManagedFile {
            path,
            contents,
            password,
        })
    }

    pub fn handle_message(&mut self, message: MessageToManager) {
        match message {}
    }
}
