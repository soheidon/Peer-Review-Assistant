"""CLI entry point for Peer Review Assistant."""

import hashlib
import json
import os
import shutil
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


def compute_sha256(filepath):
    """Compute SHA256 hash of a file."""
    h = hashlib.sha256()
    with open(filepath, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


def validate_input_files(docx_path, pdf_path):
    """Validate input docx and PDF files. Returns (ok, errors)."""
    errors = []

    if not os.path.isfile(docx_path):
        errors.append(f"docx file not found: {docx_path}")
    else:
        if not docx_path.lower().endswith(".docx"):
            errors.append(f"docx file extension is not .docx: {docx_path}")
        if os.path.getsize(docx_path) == 0:
            errors.append(f"docx file is empty: {docx_path}")

    if not os.path.isfile(pdf_path):
        errors.append(f"PDF file not found: {pdf_path}")
    else:
        if not pdf_path.lower().endswith(".pdf"):
            errors.append(f"PDF file extension is not .pdf: {pdf_path}")
        if os.path.getsize(pdf_path) == 0:
            errors.append(f"PDF file is empty: {pdf_path}")

    return len(errors) == 0, errors


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
            "original_docx_path": None,
            "original_pdf_path": None,
            "docx_path": None,
            "pdf_path": None,
            "docx_sha256": None,
            "pdf_sha256": None,
            "docx_size_bytes": None,
            "pdf_size_bytes": None,
            "input_validation_status": "not_started",
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


@main.command()
@click.option("--docx", "docx_path", required=True,
              type=click.Path(exists=True, dir_okay=False, readable=True),
              help="Path to the manuscript .docx file.")
@click.option("--pdf", "pdf_path", required=True,
              type=click.Path(exists=True, dir_okay=False, readable=True),
              help="Path to the line-numbered .pdf file.")
def validate_input(docx_path, pdf_path):
    """Validate input docx and PDF files without copying."""
    emit("progress", task="validate-input", step="check_files", percent=0)

    ok, errors = validate_input_files(docx_path, pdf_path)

    if not ok:
        for e in errors:
            emit("progress", task="validate-input", step="error", message=e)
        error("INPUT_VALIDATION_FAILED",
              "; ".join(errors))

    emit("progress", task="validate-input", step="compute_hash", percent=50)

    docx_sha = compute_sha256(docx_path)
    pdf_sha = compute_sha256(pdf_path)
    docx_size = os.path.getsize(docx_path)
    pdf_size = os.path.getsize(pdf_path)

    emit("done",
         task="validate-input",
         docx_path=os.path.abspath(docx_path),
         pdf_path=os.path.abspath(pdf_path),
         docx_sha256=docx_sha,
         pdf_sha256=pdf_sha,
         docx_size_bytes=docx_size,
         pdf_size_bytes=pdf_size,
         message="Input files are valid.")


@main.command()
@click.option("--project", "project_dir", required=True,
              type=click.Path(file_okay=False, writable=True),
              help="Path to the project working folder.")
@click.option("--docx", "docx_path", required=True,
              type=click.Path(exists=True, dir_okay=False, readable=True),
              help="Path to the manuscript .docx file.")
@click.option("--pdf", "pdf_path", required=True,
              type=click.Path(exists=True, dir_okay=False, readable=True),
              help="Path to the line-numbered .pdf file.")
def attach_source(project_dir, docx_path, pdf_path):
    """Validate input files and copy them into work/source/ with standard names."""
    emit("progress", task="attach-source", step="validate", percent=0)

    # Load project.json
    proj_path = os.path.join(project_dir, "project.json")
    if not os.path.isfile(proj_path):
        error("NO_PROJECT",
              "project.json not found. Run init-project first.")

    # Reject release/ paths
    if is_under_release(project_dir):
        error("RELEASE_FOLDER_REJECTED",
              "Project folder must not be inside a release/ directory.")

    emit("progress", task="attach-source", step="validate_inputs", percent=10)

    ok, errors = validate_input_files(docx_path, pdf_path)
    if not ok:
        for e in errors:
            emit("progress", task="attach-source", step="error", message=e)
        error("INPUT_VALIDATION_FAILED",
              "; ".join(errors))

    emit("progress", task="attach-source", step="compute_hash", percent=30)

    docx_sha = compute_sha256(docx_path)
    pdf_sha = compute_sha256(pdf_path)
    docx_size = os.path.getsize(docx_path)
    pdf_size = os.path.getsize(pdf_path)

    # Check for existing files in work/source/
    source_dir = os.path.join(project_dir, "source")
    os.makedirs(source_dir, exist_ok=True)

    dest_docx = os.path.join(source_dir, "manuscript.docx")
    dest_pdf = os.path.join(source_dir, "manuscript_line_numbered.pdf")

    emit("progress", task="attach-source", step="check_existing", percent=50)

    if os.path.exists(dest_docx) or os.path.exists(dest_pdf):
        error("SOURCE_EXISTS",
              "work/source/ already contains manuscript.docx or manuscript_line_numbered.pdf. "
              "Remove them first or use a different project folder.")

    emit("progress", task="attach-source", step="copy_files", percent=70)

    shutil.copy2(docx_path, dest_docx)
    shutil.copy2(pdf_path, dest_pdf)

    emit("progress", task="attach-source", step="update_project_json", percent=85)

    # Update project.json
    with open(proj_path, "r", encoding="utf-8") as f:
        proj = json.load(f)

    now = datetime.now(JST)
    proj["updated_at"] = now.isoformat()
    proj["source"]["original_docx_path"] = os.path.abspath(docx_path)
    proj["source"]["original_pdf_path"] = os.path.abspath(pdf_path)
    proj["source"]["docx_path"] = "source/manuscript.docx"
    proj["source"]["pdf_path"] = "source/manuscript_line_numbered.pdf"
    proj["source"]["docx_sha256"] = docx_sha
    proj["source"]["pdf_sha256"] = pdf_sha
    proj["source"]["docx_size_bytes"] = docx_size
    proj["source"]["pdf_size_bytes"] = pdf_size
    proj["source"]["input_validation_status"] = "ok"

    with open(proj_path, "w", encoding="utf-8") as f:
        json.dump(proj, f, indent=2, ensure_ascii=False)

    emit("done",
         task="attach-source",
         docx_path="source/manuscript.docx",
         pdf_path="source/manuscript_line_numbered.pdf",
         docx_sha256=docx_sha,
         pdf_sha256=pdf_sha,
         message="Source files attached successfully.")


@main.command()
@click.option("--project", "project_dir", required=True,
              type=click.Path(file_okay=False, writable=True),
              help="Path to the project working folder.")
def preprocess_docx(project_dir):
    """Extract text and paragraph structure from source/manuscript.docx."""
    from peer_review_assistant.preprocess import extract_docx_text

    emit("progress", task="preprocess-docx", step="read_docx", percent=0)

    # Validate project
    proj_path = os.path.join(project_dir, "project.json")
    if not os.path.isfile(proj_path):
        error("NO_PROJECT",
              "project.json not found. Run init-project first.")

    # Check source file exists
    docx_path = os.path.join(project_dir, "source", "manuscript.docx")
    if not os.path.isfile(docx_path):
        error("NO_SOURCE_FILE",
              "source/manuscript.docx not found. Run attach-source first.")

    emit("progress", task="preprocess-docx", step="extract_text", percent=30)

    try:
        result = extract_docx_text(docx_path)
    except Exception as e:
        error("DOCX_READ_ERROR",
              f"Failed to read docx: {e}")

    emit("progress", task="preprocess-docx", step="save_txt", percent=60)

    # Save plain text
    txt_path = os.path.join(project_dir, "manuscript_full.txt")
    full_text = "\n".join(p["text"] for p in result["paragraphs"])
    with open(txt_path, "w", encoding="utf-8") as f:
        f.write(full_text)

    emit("progress", task="preprocess-docx", step="save_json", percent=80)

    # Save structured JSON (paragraphs only, not full text)
    json_output = {
        "paragraph_count": result["paragraph_count"],
        "character_count": result["character_count"],
        "paragraphs": result["paragraphs"],
    }
    json_path = os.path.join(project_dir, "manuscript_full.json")
    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(json_output, f, indent=2, ensure_ascii=False)

    emit("progress", task="preprocess-docx", step="update_status", percent=90)

    # Update task_status.json
    status_path = os.path.join(project_dir, "status", "task_status.json")
    if os.path.isfile(status_path):
        with open(status_path, "r", encoding="utf-8") as f:
            task_status = json.load(f)
        task_status["preprocess"] = "done"
        with open(status_path, "w", encoding="utf-8") as f:
            json.dump(task_status, f, indent=2, ensure_ascii=False)

    # Update project.json updated_at
    with open(proj_path, "r", encoding="utf-8") as f:
        proj = json.load(f)
    proj["updated_at"] = datetime.now(JST).isoformat()
    proj["preprocess"]["status"] = "done"
    with open(proj_path, "w", encoding="utf-8") as f:
        json.dump(proj, f, indent=2, ensure_ascii=False)

    # Append to preprocess.log
    log_path = os.path.join(project_dir, "logs", "preprocess.log")
    now = datetime.now(JST).isoformat()
    log_entry = (f"[{now}] preprocess-docx: "
                 f"paragraphs={result['paragraph_count']}, "
                 f"chars={result['character_count']}\n")
    with open(log_path, "a", encoding="utf-8") as f:
        f.write(log_entry)

    emit("done",
         task="preprocess-docx",
         paragraph_count=result["paragraph_count"],
         character_count=result["character_count"],
         message="docx preprocessing complete.")


@main.command()
@click.option("--project", "project_dir", required=True,
              type=click.Path(file_okay=False, writable=True),
              help="Path to the project working folder.")
def preprocess_numbering(project_dir):
    """Add paragraph and sentence numbers to extracted text."""
    from peer_review_assistant.preprocess import number_paragraphs_and_sentences

    emit("progress", task="preprocess-numbering", step="validate", percent=0)

    proj_path = os.path.join(project_dir, "project.json")
    if not os.path.isfile(proj_path):
        error("NO_PROJECT", "project.json not found. Run init-project first.")

    json_path = os.path.join(project_dir, "manuscript_full.json")
    if not os.path.isfile(json_path):
        error("NO_MANUSCRIPT",
              "manuscript_full.json not found. Run preprocess-docx first.")

    emit("progress", task="preprocess-numbering", step="load", percent=20)

    with open(json_path, "r", encoding="utf-8") as f:
        manuscript = json.load(f)

    emit("progress", task="preprocess-numbering", step="number", percent=50)

    result = number_paragraphs_and_sentences(manuscript["paragraphs"])

    emit("progress", task="preprocess-numbering", step="save", percent=80)

    out_path = os.path.join(project_dir, "paragraph_sentence_map.json")
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(result, f, indent=2, ensure_ascii=False)

    emit("progress", task="preprocess-numbering", step="update_status", percent=90)

    # Append log
    log_path = os.path.join(project_dir, "logs", "preprocess.log")
    now = datetime.now(JST).isoformat()
    log_entry = (f"[{now}] preprocess-numbering: "
                 f"paragraphs={result['paragraph_count']}, "
                 f"sentences={result['sentence_count']}\n")
    with open(log_path, "a", encoding="utf-8") as f:
        f.write(log_entry)

    # Update project.json
    with open(proj_path, "r", encoding="utf-8") as f:
        proj = json.load(f)
    proj["updated_at"] = datetime.now(JST).isoformat()
    with open(proj_path, "w", encoding="utf-8") as f:
        json.dump(proj, f, indent=2, ensure_ascii=False)

    emit("done",
         task="preprocess-numbering",
         paragraph_count=result["paragraph_count"],
         sentence_count=result["sentence_count"],
         message="Paragraph and sentence numbering complete.")


@main.command()
@click.option("--project", "project_dir", required=True,
              type=click.Path(file_okay=False, writable=True),
              help="Path to the project working folder.")
def preprocess_sections(project_dir):
    """Split manuscript into sections based on heading styles."""
    from peer_review_assistant.preprocess import split_sections

    emit("progress", task="preprocess-sections", step="validate", percent=0)

    proj_path = os.path.join(project_dir, "project.json")
    if not os.path.isfile(proj_path):
        error("NO_PROJECT", "project.json not found. Run init-project first.")

    json_path = os.path.join(project_dir, "manuscript_full.json")
    if not os.path.isfile(json_path):
        error("NO_MANUSCRIPT",
              "manuscript_full.json not found. Run preprocess-docx first.")

    emit("progress", task="preprocess-sections", step="load", percent=20)

    with open(json_path, "r", encoding="utf-8") as f:
        manuscript = json.load(f)

    emit("progress", task="preprocess-sections", step="split", percent=50)

    result = split_sections(manuscript["paragraphs"])

    emit("progress", task="preprocess-sections", step="save", percent=80)

    sections_dir = os.path.join(project_dir, "sections")
    os.makedirs(sections_dir, exist_ok=True)

    for sec in result["sections"]:
        fname = f"{sec['name']}.txt"
        fpath = os.path.join(sections_dir, fname)
        text = "\n".join(p["text"] for p in sec["paragraphs"] if p["text"].strip())
        with open(fpath, "w", encoding="utf-8") as f:
            f.write(text)

    # Save section_map.json
    section_map = {
        "section_count": result["section_count"],
        "sections": [
            {
                "name": s["name"],
                "heading": s["heading"],
                "start_paragraph": s["start_paragraph"],
                "end_paragraph": s["end_paragraph"],
            }
            for s in result["sections"]
        ],
    }
    map_path = os.path.join(sections_dir, "section_map.json")
    with open(map_path, "w", encoding="utf-8") as f:
        json.dump(section_map, f, indent=2, ensure_ascii=False)

    emit("progress", task="preprocess-sections", step="update_status", percent=90)

    # Append log
    log_path = os.path.join(project_dir, "logs", "preprocess.log")
    now = datetime.now(JST).isoformat()
    log_entry = (f"[{now}] preprocess-sections: "
                 f"sections={result['section_count']}\n")
    with open(log_path, "a", encoding="utf-8") as f:
        f.write(log_entry)

    # Update project.json
    with open(proj_path, "r", encoding="utf-8") as f:
        proj = json.load(f)
    proj["updated_at"] = datetime.now(JST).isoformat()
    with open(proj_path, "w", encoding="utf-8") as f:
        json.dump(proj, f, indent=2, ensure_ascii=False)

    emit("done",
         task="preprocess-sections",
         section_count=result["section_count"],
         message="Section splitting complete.")


if __name__ == "__main__":
    main()
