"""CLI entry point for Peer Review Assistant."""

import json
import os
import sys
from datetime import datetime, timezone, timedelta

import click

JST = timezone(timedelta(hours=9))


def emit(event_type, **kwargs):
    """Write a JSON Lines event to stdout."""
    obj = {"event": event_type}
    obj.update(kwargs)
    sys.stdout.write(json.dumps(obj, ensure_ascii=False) + "\n")
    sys.stdout.flush()


def error(code, message):
    """Emit an error event and exit."""
    emit("error", code=code, message=message)
    sys.exit(1)


def is_under_release(path):
    """Check if a path is inside a release/ directory."""
    target = os.path.abspath(path).replace("\\", "/").lower()
    parts = target.split("/")
    return "release" in parts


@click.group()
def main():
    """Peer Review Assistant — Python CLI engine."""


@main.command()
def healthcheck():
    """Verify the CLI is functional."""
    emit("healthcheck",
         status="ok",
         python_version=sys.version.split()[0],
         package_version="0.1.0")


@main.command()
@click.option("--project", "project_dir", required=True,
              type=click.Path(file_okay=False, writable=True),
              help="Path to the project working folder.")
def init_project(project_dir):
    """Create a new project working folder structure."""
    emit("progress", task="init-project", step="validate", percent=0)

    # Reject release/ paths
    if is_under_release(project_dir):
        error("RELEASE_FOLDER_REJECTED",
              "Project folder must not be inside a release/ directory.")

    # Reject if project.json already exists
    if os.path.isfile(os.path.join(project_dir, "project.json")):
        error("PROJECT_EXISTS",
              "project.json already exists. Use an empty or new folder.")

    emit("progress", task="init-project", step="create_dirs", percent=10)

    # Create root
    os.makedirs(project_dir, exist_ok=True)

    # Subdirectories
    dirs = [
        "source",
        "sections",
        "citations",
        "lines",
        "prompts",
        "outputs/structure",
        "outputs/expression",
        "outputs/methods_stats",
        "outputs/citation",
        "outputs/originality",
        "outputs/final",
        "status",
        "logs",
    ]
    for d in dirs:
        os.makedirs(os.path.join(project_dir, d), exist_ok=True)

    emit("progress", task="init-project", step="create_logs", percent=40)

    # Empty log files
    log_files = ["preprocess.log", "llm_calls.log", "citation_db.log", "errors.log"]
    for lf in log_files:
        path = os.path.join(project_dir, "logs", lf)
        with open(path, "w", encoding="utf-8") as f:
            f.write("")

    emit("progress", task="init-project", step="create_json", percent=60)

    now = datetime.now(JST)
    ts = now.isoformat()
    project_id = os.path.basename(os.path.abspath(project_dir))

    # project.json
    project_json = {
        "project_id": project_id,
        "created_at": ts,
        "updated_at": ts,
        "source": {
            "docx_path": None,
            "pdf_path": None,
            "docx_sha256": None,
            "pdf_sha256": None,
        },
        "manuscript": {
            "title": None,
            "language": None,
            "article_type": None,
            "journal": None,
        },
        "preprocess": {
            "status": "not_started",
            "docx_pdf_match_ratio": None,
            "line_extraction_status": "not_started",
            "line_alignment_confidence": None,
            "location_mode": "paragraph_sentence",
        },
        "settings": {
            "location_display": "both",
            "secure_mode": False,
        },
    }
    with open(os.path.join(project_dir, "project.json"), "w", encoding="utf-8") as f:
        json.dump(project_json, f, indent=2, ensure_ascii=False)

    emit("progress", task="init-project", step="create_status", percent=80)

    # task_status.json
    check_default = {
        "llm01": "not_started",
        "llm02": "not_started",
        "llm03": "not_started",
        "manual": "not_used",
        "merged": "not_started",
    }
    task_status = {
        "preprocess": "not_started",
        "citation_db": "not_started",
        "summary": "not_started",
        "checks": {
            "structure": dict(check_default),
            "expression": dict(check_default),
            "methods_stats": dict(check_default),
            "citation": dict(check_default),
            "originality": dict(check_default),
        },
        "final_merge": "not_started",
    }
    with open(os.path.join(project_dir, "status", "task_status.json"), "w", encoding="utf-8") as f:
        json.dump(task_status, f, indent=2, ensure_ascii=False)

    emit("done",
         task="init-project",
         project=os.path.abspath(project_dir),
         message="Project folder created successfully.")


if __name__ == "__main__":
    main()
