// NDJSON output utilities.
// All stdout output goes through this module to ensure the protocol is consistent.

use serde::Serialize;

/// Write a single NDJSON event line to stdout.
pub fn emit_event(event: &impl Serialize) {
    println!(
        "{}",
        serde_json::to_string(event).expect("failed to serialize NDJSON event")
    );
}

/// Emit a terminal "done" event and exit with code 0.
pub fn done() -> ! {
    emit_event(&DoneEvent {
        event: "done",
        status: "ok",
    });
    std::process::exit(0);
}

/// Emit an error event to stdout and exit with code 1.
/// `code` is a machine-readable error tag (e.g. "json_parse_failed").
/// `message` is a human-readable description.
pub fn fail(code: &str, message: &str) -> ! {
    emit_event(&ErrorEvent {
        event: "error",
        code,
        message,
    });
    std::process::exit(1);
}

#[derive(Serialize)]
struct DoneEvent<'a> {
    event: &'a str,
    status: &'a str,
}

#[derive(Serialize)]
struct ErrorEvent<'a> {
    event: &'a str,
    code: &'a str,
    message: &'a str,
}
