//! Starts the APIM policy language server. The server is a single JavaScript
//! bundle compiled into the extension (see server/), written to the
//! extension's work directory and run with Zed's own Node.js.

use std::fs;
use zed_extension_api::{self as zed, LanguageServerId, Result};

const SERVER: &str = include_str!("../server/bundle/apim-language-server.cjs");
const SERVER_FILE: &str = "apim-language-server.cjs";

struct ApimExtension;

impl zed::Extension for ApimExtension {
    fn new() -> Self {
        ApimExtension
    }

    fn language_server_command(
        &mut self,
        _language_server_id: &LanguageServerId,
        _worktree: &zed::Worktree,
    ) -> Result<zed::Command> {
        // Rewritten on every start so an updated extension never runs a stale server.
        fs::write(SERVER_FILE, SERVER).map_err(|error| format!("writing {SERVER_FILE}: {error}"))?;
        let path = std::env::current_dir()
            .map_err(|error| format!("locating the work directory: {error}"))?
            .join(SERVER_FILE);
        Ok(zed::Command {
            command: zed::node_binary_path()?,
            args: vec![path.to_string_lossy().into_owned(), "--stdio".into()],
            env: Default::default(),
        })
    }
}

zed::register_extension!(ApimExtension);
