use actix::Actor;
use clap::{App, AppSettings, Arg, SubCommand};
use std::path::PathBuf;

mod data_format;
mod management;
mod webserver_glue;

#[actix_web::main]
async fn main() {
    let matches = App::new("EliDupree Projects Manager")
        .version("0.1")
        .author("Eli Dupree <vcs@elidupree.com>")
        .setting(AppSettings::SubcommandRequiredElseHelp)
        .subcommand(
            SubCommand::with_name("serve")
                .long_about("Serve the web app")
                .arg(
                    Arg::with_name("port")
                        .long("port")
                        .required(true)
                        .takes_value(true),
                )
                .arg(
                    Arg::with_name("collection-file")
                        .long("collection-file")
                        .required(true)
                        .takes_value(true),
                )
                .arg(
                    Arg::with_name("password")
                        .long("password")
                        .required(true)
                        .takes_value(true),
                ),
        )
        .get_matches();

    match matches.subcommand() {
        ("serve", Some(matches)) => {
            let port = matches.value_of("port").unwrap().parse::<u16>().unwrap();
            let password = matches.value_of("password").unwrap();
            let collection_file = matches.value_of("collection-file").unwrap();
            webserver_glue::launch(
                management::Manager::new(PathBuf::from(collection_file), password.to_string())
                    .unwrap()
                    .start(),
                port,
            )
            .await;
        }
        _ => {
            unreachable!()
        }
    }
}
