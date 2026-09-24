//! JSON dispatcher for the wasm reactor.
//!
//! The desktop sidecar keeps its full command enum in `main.rs`. This module
//! is the browser subset: open, read a range, close. Paths are used as given;
//! the host preopens the directory that contains the workbook.

use std::path::PathBuf;

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

use crate::{CellRange, SidecarError, WorkbookSessions};

#[derive(Debug, Deserialize)]
#[serde(tag = "command", rename_all = "snake_case")]
enum Command {
    Open { path: PathBuf },
    ReadRange {
        #[serde(rename = "sessionId")]
        session_id: String,
        #[serde(rename = "sheetId")]
        sheet_id: String,
        range: CellRange,
    },
    Close {
        #[serde(rename = "sessionId")]
        session_id: String,
    },
}

#[derive(Debug, Deserialize)]
struct Request {
    command: Command,
}

#[derive(Serialize)]
struct Reply {
    ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    result: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
}

pub fn dispatch(line: &str, sessions: &mut WorkbookSessions) -> String {
    let reply = match serde_json::from_str::<Request>(line) {
        Ok(request) => run(request, sessions),
        Err(error) => Reply {
            ok: false,
            result: None,
            error: Some(format!("invalid json: {error}")),
        },
    };
    serde_json::to_string(&reply).unwrap_or_else(|_| {
        json!({ "ok": false, "error": "reply encoding failed" }).to_string()
    })
}

fn run(request: Request, sessions: &mut WorkbookSessions) -> Reply {
    let result = match request.command {
        Command::Open { path } => sessions.open(&path).map(|meta| json!(meta)),
        Command::ReadRange {
            session_id,
            sheet_id,
            range,
        } => sessions
            .read_range(&session_id, &sheet_id, &range)
            .map(|range| json!(range)),
        Command::Close { session_id } => sessions.close(&session_id).map(|_| json!({ "closed": true })),
    };
    match result {
        Ok(value) => Reply {
            ok: true,
            result: Some(value),
            error: None,
        },
        Err(error) => Reply {
            ok: false,
            result: None,
            error: Some(error_text(error)),
        },
    }
}

fn error_text(error: SidecarError) -> String {
    error.to_string()
}
