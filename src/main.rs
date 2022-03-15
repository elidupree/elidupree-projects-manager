use crate::utils::read_json_file;
use actix::Actor;
use clap::{App, AppSettings, Arg, SubCommand};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;

mod data_format;
mod management;
mod utils;
mod webserver_glue;

#[derive(Serialize, Deserialize, Debug)]
pub struct ServerConfig {
    pub port: u16,
    pub collection_file_path: PathBuf,
    pub password: String,
    pub cert_file_path: PathBuf,
    pub private_key_file_path: PathBuf,
}

#[actix_web::main]
async fn main() {
    let matches = App::new("EliDupree Projects Manager")
        .version("0.1")
        .author("Eli Dupree <vcs@elidupree.com>")
        .setting(AppSettings::SubcommandRequiredElseHelp)
        .subcommand(
            SubCommand::with_name("serve")
                .long_about("Serve the web app")
                .arg(Arg::with_name("config-file")),
        )
        .get_matches();

    match matches.subcommand() {
        ("serve", Some(matches)) => {
            let ServerConfig {
                port,
                collection_file_path,
                password,
                cert_file_path,
                private_key_file_path,
            } = read_json_file(matches.value_of("config-file").unwrap()).unwrap();
            webserver_glue::launch(
                management::Manager::new(collection_file_path)
                    .unwrap()
                    .start(),
                port,
                password,
                cert_file_path,
                private_key_file_path,
            )
            .await;
        }
        _ => {
            unreachable!()
        }
    }
}
