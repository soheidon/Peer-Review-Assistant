"""CLI entry point for Peer Review Assistant."""

import hashlib
import json
import os
import re
import shutil
import sys
from datetime import datetime, timezone, timedelta

# Force UTF-8 encoding for stdout/stderr on all platforms.
# On Windows, Python defaults to the system code page (e.g. cp932),
# which breaks the Tauri plugin-shell's strict UTF-8 decode of subprocess output.
sys.stdout.reconfigure(encoding="utf-8")
sys.stderr.reconfigure(encoding="utf-8")
# Also set environment variables so any child processes inherit UTF-8.
os.environ.setdefault("PYTHONIOENCODING", "utf-8")
os.environ.setdefault("PYTHONUTF8", "1")

import click


def _get_env(key):
    """Get environment variable with user-env fallback (Windows only).

    On Windows, os.environ only returns process-level variables.
    User environment variables set via [Environment]::SetEnvironmentVariable
    are not visible to subprocesses launched from non-Windows shells (bash).
    This function checks the Windows registry as a fallback.
    """
    val = os.environ.get(key)
    if val:
        return val
    # Fallback: check user environment via Windows registry
    if sys.platform == "win32":
        try:
            import winreg
            with winreg.OpenKey(
                winreg.HKEY_CURRENT_USER,
                "Environment",
            ) as regkey:
                val, _ = winreg.QueryValueEx(regkey, key)
                return val if val else ""
        except (OSError, ImportError):
            pass
    return ""


def _resolve_api_key(api_key, api_key_env, slot):
    """Resolve API key from direct value, env var name, or slot convention.

    Priority:
      1. Direct --api-key value
      2. Environment variable named by --api-key-env
      3. PRA_LLM_KEY_{SLOT} environment variable
    """
    resolved = api_key
    if not resolved and api_key_env:
        resolved = _get_env(api_key_env).strip()
    if not resolved:
        resolved = _get_env(f"PRA_LLM_KEY_{slot.upper()}").strip()
    return resolved


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


def _extract_md_table(llm_response: str) -> str:
    """Extract the Markdown table portion from an LLM response.

    Looks for content after the closing ``` of a JSON code fence.
    Falls back to the full response if no JSON fence is found.
    """
    json_fence_start = llm_response.find("```json")
    if json_fence_start >= 0:
        first_close = llm_response.find("```", json_fence_start + 7)
        if first_close > 0:
            after_json = llm_response[first_close + 3:].strip()
            if after_json:
                return after_json
    # Fallback: return the full response
    return llm_response


def _update_journal_search_status(project_dir: str, method: str):
    """Update task_status.json for journal search completion."""
    status_dir = os.path.join(project_dir, "status")
    os.makedirs(status_dir, exist_ok=True)
    status_path = os.path.join(status_dir, "task_status.json")
    task_status = {}
    if os.path.isfile(status_path):
        with open(status_path, "r", encoding="utf-8") as f:
            task_status = json.load(f)
    task_status.setdefault("checks", {}).setdefault("novelty", {}).setdefault("find_journals", {})["merged"] = "done"
    task_status["checks"]["novelty"]["find_journals"]["method"] = method
    with open(status_path, "w", encoding="utf-8") as f:
        json.dump(task_status, f, indent=2, ensure_ascii=False)


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


def validate_input_files(docx_path, pdf_path=None):
    """Validate input docx and PDF files. PDF is optional. Returns (ok, errors)."""
    errors = []

    if not os.path.isfile(docx_path):
        errors.append(f"docx file not found: {docx_path}")
    else:
        if not docx_path.lower().endswith(".docx"):
            errors.append(f"docx file extension is not .docx: {docx_path}")
        if os.path.getsize(docx_path) == 0:
            errors.append(f"docx file is empty: {docx_path}")

    if pdf_path:
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
              "このフォルダには既にプロジェクトがあります。"
              "別のフォルダを選ぶか、GUIの「既存プロジェクトを開く」を使用してください。 "
              "project.json already exists. Use an empty folder for new project, "
              "or open as existing project.")

    emit("progress", task="init-project", step="create_dirs", percent=10)

    # Create root
    os.makedirs(project_dir, exist_ok=True)

    # Subdirectories
    dirs = [
        "source",
        "source/supplemental",
        "sections",
        "citations",
        "lines",
        "prompts",
        "outputs/structure",
        "outputs/expression",
        "outputs/methods_stats",
        "outputs/logic_argument",
        "outputs/figure_table",
        "outputs/ethics",
        "outputs/citation",
        "outputs/originality",
        "outputs/final",
        "status",
        "logs",
        "translations",
    ]
    for d in dirs:
        os.makedirs(os.path.join(project_dir, d), exist_ok=True)

    emit("progress", task="init-project", step="create_logs", percent=40)

    # Empty log files
    log_files = ["preprocess.log", "llm_calls.log", "citation_db.log", "errors.log", "merge.log"]
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
            "source_mode": "docx_only",
            "line_numbers_available": False,
            "supplemental_files": [],
        },
        "manuscript": {
            "title": None,
            "language": None,
            "article_type": None,
            "journal": None,
        },
        "preprocess": {
            "status": "not_started",
            "numbering_status": "not_started",
            "sections_status": "not_started",
            "citation_extraction_status": "not_started",
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
            "logic_argument": dict(check_default),
            "figure_table": dict(check_default),
            "ethics": dict(check_default),
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
@click.option("--pdf", "pdf_path", required=False, default=None,
              type=click.Path(exists=True, dir_okay=False, readable=True),
              help="Path to the PDF file (optional; line-numbered recommended).")
def validate_input(docx_path, pdf_path):
    """Validate input docx and optional PDF files without copying."""
    emit("progress", task="validate-input", step="check_files", percent=0)

    ok, errors = validate_input_files(docx_path, pdf_path)

    if not ok:
        for e in errors:
            emit("progress", task="validate-input", step="error", message=e)
        error("INPUT_VALIDATION_FAILED",
              "; ".join(errors))

    emit("progress", task="validate-input", step="compute_hash", percent=50)

    docx_sha = compute_sha256(docx_path)
    pdf_sha = compute_sha256(pdf_path) if pdf_path else None
    docx_size = os.path.getsize(docx_path)
    pdf_size = os.path.getsize(pdf_path) if pdf_path else None

    emit("done",
         task="validate-input",
         docx_path=os.path.abspath(docx_path),
         pdf_path=os.path.abspath(pdf_path) if pdf_path else None,
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
@click.option("--pdf", "pdf_path", required=False, default=None,
              type=click.Path(exists=True, dir_okay=False, readable=True),
              help="Path to the PDF file (optional; line-numbered recommended).")
def attach_source(project_dir, docx_path, pdf_path):
    """Validate input files and copy them into project with standard names."""
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
    pdf_sha = compute_sha256(pdf_path) if pdf_path else None
    docx_size = os.path.getsize(docx_path)
    pdf_size = os.path.getsize(pdf_path) if pdf_path else None

    # Determine source mode
    if pdf_path:
        source_mode = "docx_with_pdf"
        line_numbers_available = False  # May be updated later by line extraction
    else:
        source_mode = "docx_only"
        line_numbers_available = False

    # Check for existing files in project/source/
    source_dir = os.path.join(project_dir, "source")
    os.makedirs(source_dir, exist_ok=True)

    dest_docx = os.path.join(source_dir, "manuscript.docx")
    dest_pdf = os.path.join(source_dir, "manuscript_line_numbered.pdf") if pdf_path else None

    emit("progress", task="attach-source", step="check_existing", percent=50)

    existing = []
    if os.path.exists(dest_docx):
        existing.append("manuscript.docx")
    if dest_pdf and os.path.exists(dest_pdf):
        existing.append("manuscript_line_numbered.pdf")
    if existing:
        error("SOURCE_EXISTS",
              f"source/ already contains: {', '.join(existing)}. "
              "Remove them first or use a different project folder.")

    emit("progress", task="attach-source", step="copy_files", percent=70)

    shutil.copy2(docx_path, dest_docx)
    if pdf_path and dest_pdf:
        shutil.copy2(pdf_path, dest_pdf)

    emit("progress", task="attach-source", step="update_project_json", percent=85)

    # Update project.json
    with open(proj_path, "r", encoding="utf-8") as f:
        proj = json.load(f)

    now = datetime.now(JST)
    proj["updated_at"] = now.isoformat()
    proj["source"]["original_docx_path"] = os.path.abspath(docx_path)
    proj["source"]["original_pdf_path"] = os.path.abspath(pdf_path) if pdf_path else None
    proj["source"]["docx_path"] = "source/manuscript.docx"
    proj["source"]["pdf_path"] = "source/manuscript_line_numbered.pdf" if pdf_path else None
    proj["source"]["docx_sha256"] = docx_sha
    proj["source"]["pdf_sha256"] = pdf_sha
    proj["source"]["docx_size_bytes"] = docx_size
    proj["source"]["pdf_size_bytes"] = pdf_size
    proj["source"]["input_validation_status"] = "ok"
    proj["source"]["source_mode"] = source_mode
    proj["source"]["line_numbers_available"] = line_numbers_available

    with open(proj_path, "w", encoding="utf-8") as f:
        json.dump(proj, f, indent=2, ensure_ascii=False)

    emit("done",
         task="attach-source",
         docx_path="source/manuscript.docx",
         pdf_path="source/manuscript_line_numbered.pdf" if pdf_path else None,
         docx_sha256=docx_sha,
         pdf_sha256=pdf_sha,
         source_mode=source_mode,
         line_numbers_available=line_numbers_available,
         message="Source files attached successfully.")


@main.command(name="attach-supplemental")
@click.option("--project", "project_dir", required=True,
              type=click.Path(file_okay=False, writable=True),
              help="Path to the project working folder.")
@click.option("--files", "file_paths", required=True, multiple=True,
              type=click.Path(exists=True, dir_okay=False, readable=True),
              help="Paths to supplemental files (PDF, DOCX, images).")
def attach_supplemental(project_dir, file_paths):
    """Attach supplemental files (figures, tables, etc.) to the project."""
    emit("progress", task="attach-supplemental", step="validate", percent=0)

    proj_path = os.path.join(project_dir, "project.json")
    if not os.path.isfile(proj_path):
        error("NO_PROJECT",
              "project.json not found. Run init-project first.")

    # Reject release/ paths
    if is_under_release(project_dir):
        error("RELEASE_FOLDER_REJECTED",
              "Project folder must not be inside a release/ directory.")

    # Ensure supplemental directory exists
    supp_dir = os.path.join(project_dir, "source", "supplemental")
    os.makedirs(supp_dir, exist_ok=True)

    # Load project.json
    with open(proj_path, "r", encoding="utf-8") as f:
        proj = json.load(f)

    existing = proj.get("source", {}).get("supplemental_files", [])
    existing_names = {e["stored_path"] for e in existing}

    now = datetime.now(JST)
    new_entries = []

    for fp in file_paths:
        emit("progress", task="attach-supplemental", step="copy_file",
             percent=30, file=os.path.basename(fp))

        fname = os.path.basename(fp)
        dest = os.path.join(supp_dir, fname)

        # Handle duplicate filenames
        counter = 1
        base, ext = os.path.splitext(fname)
        while os.path.exists(dest) or f"source/supplemental/{fname}" in existing_names:
            fname = f"{base}_{counter}{ext}"
            dest = os.path.join(supp_dir, fname)
            counter += 1

        shutil.copy2(fp, dest)
        sha = compute_sha256(fp)
        size = os.path.getsize(fp)

        stored_path = f"source/supplemental/{fname}"
        existing_names.add(stored_path)
        new_entries.append({
            "original_path": os.path.abspath(fp),
            "stored_path": stored_path,
            "filename": fname,
            "size_bytes": size,
            "sha256": sha,
        })

        emit("progress", task="attach-supplemental", step="copied",
             percent=60, file=fname)

    # Update project.json
    emit("progress", task="attach-supplemental", step="update_json", percent=85)
    proj["updated_at"] = now.isoformat()
    proj.setdefault("source", {})["supplemental_files"] = existing + new_entries

    with open(proj_path, "w", encoding="utf-8") as f:
        json.dump(proj, f, indent=2, ensure_ascii=False)

    emit("done",
         task="attach-supplemental",
         count=len(new_entries),
         files=[e["stored_path"] for e in new_entries],
         message=f"{len(new_entries)} supplemental file(s) attached.")


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

    out_path = os.path.join(project_dir, "lines", "paragraph_sentence_map.json")
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
    proj.setdefault("preprocess", {})["numbering_status"] = "done"
    with open(proj_path, "w", encoding="utf-8") as f:
        json.dump(proj, f, indent=2, ensure_ascii=False)

    emit("done",
         task="preprocess-numbering",
         paragraph_count=result["paragraph_count"],
         sentence_count=result["sentence_count"],
         message="Paragraph and sentence numbering complete.")


# Math Unicode → ASCII mapping for LLM tokenizer compatibility.
# LLM tokenizers often drop or mishandle Unicode math symbols (e.g. U+03C9 ω),
# so we replace them with ASCII equivalents before sending text to the LLM.
_MATH_UNICODE_NORMALIZE = {
    # Greek letters (lowercase)
    "α": "alpha",   # α
    "β": "beta",    # β
    "γ": "gamma",   # γ
    "δ": "delta",   # δ
    "ε": "epsilon", # ε
    "η": "eta",     # η
    "θ": "theta",   # θ
    "μ": "mu",      # μ
    "σ": "sigma",   # σ
    "τ": "tau",     # τ
    "χ": "chi",     # χ
    "ω": "omega",   # ω
    # Greek letters (uppercase)
    "Δ": "Delta",   # Δ
    "Σ": "Sigma",   # Σ
    # Superscript numbers
    "¹": "^1",      # ¹
    "²": "^2",      # ²
    "³": "^3",      # ³
    # Math operators
    "±": "+/-",     # ±
    "×": "x",       # ×
    "≤": "<=",      # ≤
    "≥": ">=",      # ≥
}


def _normalize_math_unicode(text: str) -> str:
    """Replace math Unicode symbols with ASCII equivalents for LLM consumption."""
    result = text
    for symbol, replacement in _MATH_UNICODE_NORMALIZE.items():
        result = result.replace(symbol, replacement)
    return result


@main.command()
@click.option("--project", "project_dir", required=True,
              type=click.Path(file_okay=False, writable=True),
              help="Path to the project working folder.")
def preprocess_sections(project_dir):
    """Split manuscript into sections based on heading styles."""
    from peer_review_assistant.preprocess import split_sections, build_parent_child_map

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
        lines = []
        for p in sec["paragraphs"]:
            if not p["text"].strip():
                continue
            pnum = p.get("paragraph_number") or (p.get("index", 0) + 1)
            lines.append(f"[P{pnum}] {p['text']}")
        text = _normalize_math_unicode("\n".join(lines))
        with open(fpath, "w", encoding="utf-8") as f:
            f.write(text)

    # Compute parent-child relationships for aggregation
    parent_child = build_parent_child_map(result["sections"])
    has_subsections = parent_child["has_subsections"]
    children_of = parent_child["children_of"]

    # Generate aggregated files for parent sections with subsections
    aggregated_dir = os.path.join(sections_dir, "_aggregated")
    aggregated_text_paths = {}

    for sec in result["sections"]:
        if has_subsections.get(sec["name"]):
            children = children_of.get(sec["name"], [])
            parts = []
            if sec["heading"]:
                parts.append(sec["heading"])
            # Include parent section's own body text (before children)
            parent_txt_path = os.path.join(sections_dir, f"{sec['name']}.txt")
            if os.path.isfile(parent_txt_path):
                with open(parent_txt_path, "r", encoding="utf-8") as pf:
                    parent_text = pf.read().strip()
                    if parent_text:
                        parts.append(parent_text)
            for child in children:
                child_heading = child.get("heading")
                if child_heading:
                    child_level = child.get("level", 2)
                    if child_level is not None and child_level >= 1:
                        prefix = "#" * (child_level + 1) + " "
                    else:
                        prefix = "## "
                    parts.append(f"{prefix}{child_heading}")
                child_txt_path = os.path.join(sections_dir, f"{child['name']}.txt")
                if os.path.isfile(child_txt_path):
                    with open(child_txt_path, "r", encoding="utf-8") as cf:
                        child_text = cf.read().strip()
                        if child_text:
                            parts.append(child_text)
            if len(parts) > 0:
                os.makedirs(aggregated_dir, exist_ok=True)
                agg_text = _normalize_math_unicode("\n\n".join(parts) + "\n")
                agg_path = os.path.join(aggregated_dir, f"{sec['name']}.txt")
                with open(agg_path, "w", encoding="utf-8") as af:
                    af.write(agg_text)
                aggregated_text_paths[sec["name"]] = f"sections/_aggregated/{sec['name']}.txt"

    # Save section_map.json
    section_map = {
        "section_count": result["section_count"],
        "sections": [
            {
                "name": s["name"],
                "heading": s["heading"],
                "level": s["level"],
                "parent_section": s["parent_section"],
                "start_paragraph": s["start_paragraph"],
                "end_paragraph": s["end_paragraph"],
                "has_subsections": has_subsections.get(s["name"], False),
                "aggregated_text_path": aggregated_text_paths.get(s["name"]),
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
    proj.setdefault("preprocess", {})["sections_status"] = "done"
    with open(proj_path, "w", encoding="utf-8") as f:
        json.dump(proj, f, indent=2, ensure_ascii=False)

    emit("done",
         task="preprocess-sections",
         section_count=result["section_count"],
         message="Section splitting complete.")


@main.command()
@click.option("--project", "project_dir", required=True,
              type=click.Path(file_okay=False, writable=True),
              help="Path to the project working folder.")
def extract_citations(project_dir):
    """Extract and split references, find in-text citation markers."""
    from peer_review_assistant.citations import (
        split_references,
        extract_in_text_citations,
        build_citation_contexts,
    )

    emit("progress", task="extract-citations", step="validate", percent=0)

    proj_path = os.path.join(project_dir, "project.json")
    if not os.path.isfile(proj_path):
        error("NO_PROJECT", "project.json not found. Run init-project first.")

    refs_path = os.path.join(project_dir, "sections", "references.txt")
    if not os.path.isfile(refs_path):
        error("NO_REFERENCES",
              "sections/references.txt not found. Run preprocess-sections first.")

    ps_path = os.path.join(project_dir, "lines", "paragraph_sentence_map.json")
    if not os.path.isfile(ps_path):
        error("NO_PARAGRAPH_SENTENCE_MAP",
              "lines/paragraph_sentence_map.json not found. "
              "Run preprocess-numbering first.")

    section_map_path = os.path.join(project_dir, "sections", "section_map.json")
    if not os.path.isfile(section_map_path):
        error("NO_SECTION_MAP",
              "section_map.json not found. Run preprocess-sections first.")

    emit("progress", task="extract-citations", step="load", percent=20)

    with open(refs_path, "r", encoding="utf-8") as f:
        references_text = f.read()

    with open(ps_path, "r", encoding="utf-8") as f:
        paragraph_sentence_map = json.load(f)

    with open(section_map_path, "r", encoding="utf-8") as f:
        section_map = json.load(f)

    emit("progress", task="extract-citations", step="split_references", percent=40)

    references_split = split_references(references_text)

    emit("progress", task="extract-citations", step="extract_citations", percent=60)

    in_text_citations = extract_in_text_citations(
        paragraph_sentence_map, section_map)

    emit("progress", task="extract-citations", step="build_contexts", percent=75)

    citation_contexts = build_citation_contexts(
        references_split, in_text_citations, paragraph_sentence_map, section_map)

    emit("progress", task="extract-citations", step="save", percent=85)

    citations_dir = os.path.join(project_dir, "citations")
    os.makedirs(citations_dir, exist_ok=True)

    for name, data in [
        ("references_split.json", references_split),
        ("in_text_citations.json", in_text_citations),
        ("citation_contexts.json", citation_contexts),
    ]:
        path = os.path.join(citations_dir, name)
        with open(path, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)

    emit("progress", task="extract-citations", step="update_status", percent=95)

    log_path = os.path.join(project_dir, "logs", "preprocess.log")
    now = datetime.now(JST).isoformat()
    log_entry = (f"[{now}] extract-citations: "
                 f"references={references_split['total_references']}, "
                 f"citations={in_text_citations['total_citations']}\n")
    with open(log_path, "a", encoding="utf-8") as f:
        f.write(log_entry)

    with open(proj_path, "r", encoding="utf-8") as f:
        proj = json.load(f)
    proj["updated_at"] = datetime.now(JST).isoformat()
    proj.setdefault("preprocess", {})["citation_extraction_status"] = "done"
    with open(proj_path, "w", encoding="utf-8") as f:
        json.dump(proj, f, indent=2, ensure_ascii=False)

    emit("done",
         task="extract-citations",
         reference_count=references_split["total_references"],
         citation_count=in_text_citations["total_citations"],
         message="Citation extraction complete.")


@main.command()
@click.option("--project", "project_dir", required=True,
              type=click.Path(file_okay=False, writable=True),
              help="Path to the project working folder.")
def citation_db_crossref(project_dir):
    """Verify references against Crossref API."""
    from peer_review_assistant.citations.db_verify import verify_crossref

    emit("progress", task="citation-db-crossref", step="validate", percent=0)

    proj_path = os.path.join(project_dir, "project.json")
    if not os.path.isfile(proj_path):
        error("NO_PROJECT", "project.json not found. Run init-project first.")

    refs_path = os.path.join(project_dir, "citations", "references_split.json")
    if not os.path.isfile(refs_path):
        error("NO_REFERENCES_SPLIT",
              "citations/references_split.json not found. "
              "Run extract-citations first.")

    emit("progress", task="citation-db-crossref", step="load", percent=20)

    with open(refs_path, "r", encoding="utf-8") as f:
        references_split = json.load(f)

    emit("progress", task="citation-db-crossref", step="verify", percent=40,
         reference_count=references_split["total_references"])

    result = verify_crossref(references_split)

    emit("progress", task="citation-db-crossref", step="save", percent=85)

    citations_dir = os.path.join(project_dir, "citations")
    os.makedirs(citations_dir, exist_ok=True)

    # db_crossref_results.json — full results
    crossref_path = os.path.join(citations_dir, "db_crossref_results.json")
    with open(crossref_path, "w", encoding="utf-8") as f:
        json.dump(result, f, indent=2, ensure_ascii=False)

    # db_verified_references.json — matched only
    verified = {
        "items": [it for it in result["items"] if it["status"] == "matched"],
    }
    verified_path = os.path.join(citations_dir, "db_verified_references.json")
    with open(verified_path, "w", encoding="utf-8") as f:
        json.dump(verified, f, indent=2, ensure_ascii=False)

    # db_unmatched_references.json — unmatched + errors
    unmatched = {
        "items": [it for it in result["items"] if it["status"] != "matched"],
    }
    unmatched_path = os.path.join(citations_dir, "db_unmatched_references.json")
    with open(unmatched_path, "w", encoding="utf-8") as f:
        json.dump(unmatched, f, indent=2, ensure_ascii=False)

    emit("progress", task="citation-db-crossref", step="update_status", percent=95)

    log_path = os.path.join(project_dir, "logs", "citation_db.log")
    now = datetime.now(JST).isoformat()
    log_entry = (f"[{now}] citation-db-crossref: "
                 f"matched={result['matched_count']}, "
                 f"unmatched={result['unmatched_count']}\n")
    with open(log_path, "a", encoding="utf-8") as f:
        f.write(log_entry)

    # Update task_status.json
    status_path = os.path.join(project_dir, "status", "task_status.json")
    if os.path.isfile(status_path):
        with open(status_path, "r", encoding="utf-8") as f:
            task_status = json.load(f)
        task_status["citation_db"] = "done"
        with open(status_path, "w", encoding="utf-8") as f:
            json.dump(task_status, f, indent=2, ensure_ascii=False)

    with open(proj_path, "r", encoding="utf-8") as f:
        proj = json.load(f)
    proj["updated_at"] = datetime.now(JST).isoformat()
    with open(proj_path, "w", encoding="utf-8") as f:
        json.dump(proj, f, indent=2, ensure_ascii=False)

    emit("done",
         task="citation-db-crossref",
         matched=result["matched_count"],
         unmatched=result["unmatched_count"],
         message="Crossref verification complete.")


@main.command()
@click.option("--project", "project_dir", required=True,
              type=click.Path(file_okay=False, writable=True),
              help="Path to the project working folder.")
def citation_db_pubmed(project_dir):
    """Verify references against PubMed / NCBI E-utilities."""
    from peer_review_assistant.citations.db_pubmed import verify_pubmed

    emit("progress", task="citation-db-pubmed", step="validate", percent=0)

    proj_path = os.path.join(project_dir, "project.json")
    if not os.path.isfile(proj_path):
        error("NO_PROJECT", "project.json not found. Run init-project first.")

    refs_path = os.path.join(project_dir, "citations", "references_split.json")
    if not os.path.isfile(refs_path):
        error("NO_REFERENCES_SPLIT",
              "citations/references_split.json not found. "
              "Run extract-citations first.")

    # Check API key
    api_key = _get_env("NCBI_API_KEY").strip()
    if not api_key:
        error("NCBI_API_KEY_MISSING",
              "NCBI_API_KEY environment variable is not set.")

    emit("progress", task="citation-db-pubmed", step="load", percent=20)

    with open(refs_path, "r", encoding="utf-8") as f:
        references_split = json.load(f)

    emit("progress", task="citation-db-pubmed", step="verify", percent=40,
         reference_count=references_split["total_references"])

    try:
        result = verify_pubmed(references_split)
    except RuntimeError as e:
        error("NCBI_API_KEY_MISSING", str(e))
    except Exception as e:
        error("CITATION_DB_ERROR",
              f"PubMed verification failed: {e}")

    emit("progress", task="citation-db-pubmed", step="save", percent=85)

    citations_dir = os.path.join(project_dir, "citations")
    os.makedirs(citations_dir, exist_ok=True)

    # db_pubmed_results.json — full results
    pubmed_path = os.path.join(citations_dir, "db_pubmed_results.json")
    with open(pubmed_path, "w", encoding="utf-8") as f:
        json.dump(result, f, indent=2, ensure_ascii=False)

    # db_pubmed_unmatched.json — unmatched only
    unmatched = {
        "items": [it for it in result["items"] if it["status"] != "matched"],
    }
    unmatched_path = os.path.join(citations_dir, "db_pubmed_unmatched.json")
    with open(unmatched_path, "w", encoding="utf-8") as f:
        json.dump(unmatched, f, indent=2, ensure_ascii=False)

    # db_verified_references.json — merge PubMed + Crossref matched
    _merge_verified_references(citations_dir, result)

    emit("progress", task="citation-db-pubmed", step="update_status", percent=95)

    # Log
    log_path = os.path.join(project_dir, "logs", "citation_db.log")
    now = datetime.now(JST).isoformat()
    log_entry = (f"[{now}] citation-db-pubmed: "
                 f"matched={result['matched_count']}, "
                 f"unmatched={result['unmatched_count']}\n")
    os.makedirs(os.path.dirname(log_path), exist_ok=True)
    with open(log_path, "a", encoding="utf-8") as f:
        f.write(log_entry)

    # Update task_status.json
    status_path = os.path.join(project_dir, "status", "task_status.json")
    if os.path.isfile(status_path):
        with open(status_path, "r", encoding="utf-8") as f:
            task_status = json.load(f)
        # Set citation_db to done or partial based on crossref existence
        if "crossref" in str(task_status.get("citation_db", "")):
            task_status["citation_db"] = "done"
        else:
            task_status["citation_db"] = "partial"
        with open(status_path, "w", encoding="utf-8") as f:
            json.dump(task_status, f, indent=2, ensure_ascii=False)

    with open(proj_path, "r", encoding="utf-8") as f:
        proj = json.load(f)
    proj["updated_at"] = datetime.now(JST).isoformat()
    with open(proj_path, "w", encoding="utf-8") as f:
        json.dump(proj, f, indent=2, ensure_ascii=False)

    emit("done",
         task="citation-db-pubmed",
         matched=result["matched_count"],
         unmatched=result["unmatched_count"],
         message="PubMed verification complete.")


def _merge_verified_references(citations_dir, pubmed_result):
    """Merge PubMed results into the existing db_verified_references.json.

    Combines Crossref matched (if present) with PubMed matched into a
    consolidated db_verified_references.json. Each reference appears once
    with its best match from either source.
    """
    verified_path = os.path.join(citations_dir, "db_verified_references.json")

    # Load existing verified (Crossref) if present, normalizing to sources format
    existing_items = {}
    if os.path.isfile(verified_path):
        with open(verified_path, "r", encoding="utf-8") as f:
            existing = json.load(f)
        for item in existing.get("items", []):
            ref_id = item["reference_id"]
            # Normalize: ensure sources list exists
            if "sources" not in item:
                # Convert legacy format (db_source + crossref_result at top level)
                db_source = item.pop("db_source", "Crossref")
                crossref_result = item.pop("crossref_result", None)
                comparison = item.pop("comparison", None)
                status = item.pop("status", "matched")
                method = item.pop("method", "unknown")
                # Reconstruct as sources format
                item["status"] = status
                item["method"] = method
                item["sources"] = [{
                    "db_source": db_source,
                }]
                if db_source == "Crossref":
                    item["sources"][0]["crossref_result"] = crossref_result
                else:
                    item["sources"][0]["pubmed_result"] = crossref_result
                if comparison:
                    item["sources"][0]["comparison"] = comparison
            existing_items[ref_id] = item

    # Add PubMed matched items
    for item in pubmed_result["items"]:
        if item["status"] != "matched":
            continue
        ref_id = item["reference_id"]
        if ref_id in existing_items:
            # Already verified by Crossref — add PubMed as secondary source
            existing = existing_items[ref_id]
            existing.setdefault("sources", [])
            source_keys = [s.get("db_source") for s in existing["sources"]]
            if "PubMed" not in source_keys:
                existing["sources"].append({
                    "db_source": "PubMed",
                    "pubmed_result": item.get("pubmed_result"),
                    "comparison": item.get("comparison"),
                })
            # Update status if we have more info now
            if existing.get("status") != "matched":
                existing["status"] = "matched"
        else:
            # New PubMed match — add as primary
            item["sources"] = [{
                "db_source": "PubMed",
                "pubmed_result": item.get("pubmed_result"),
                "comparison": item.get("comparison"),
            }]
            existing_items[ref_id] = item

    # Write consolidated
    verified = {"items": list(existing_items.values())}
    with open(verified_path, "w", encoding="utf-8") as f:
        json.dump(verified, f, indent=2, ensure_ascii=False)


@main.command()
@click.option("--project", "project_dir", required=True,
              type=click.Path(file_okay=False, writable=True),
              help="Path to the project working folder.")
@click.option("--appid", required=False, default=None,
              help="CiNii Research API application ID (required for search).")
def citation_db_cinii(project_dir, appid):
    """Verify references against CiNii Research API (Japanese papers)."""
    from peer_review_assistant.citations.db_cinii import verify_cinii

    emit("progress", task="citation-db-cinii", step="validate", percent=0)

    proj_path = os.path.join(project_dir, "project.json")
    if not os.path.isfile(proj_path):
        error("NO_PROJECT", "project.json not found. Run init-project first.")

    refs_path = os.path.join(project_dir, "citations", "references_split.json")
    if not os.path.isfile(refs_path):
        error("NO_REFERENCES_SPLIT",
              "citations/references_split.json not found. "
              "Run extract-citations first.")

    # Appid is optional — if not provided, skip gracefully
    if not appid or not appid.strip():
        emit("progress", task="citation-db-cinii", step="skip", percent=100)
        emit("done",
             task="citation-db-cinii",
             matched=0,
             unmatched=0,
             message="CiNii API appid not provided; skipping.")
        return

    emit("progress", task="citation-db-cinii", step="load", percent=20)

    with open(refs_path, "r", encoding="utf-8") as f:
        references_split = json.load(f)

    # ── Filter: skip references already verified by earlier DBs ─────────
    # CiNii should only query references that remain unmatched after
    # Crossref, PubMed, Google Books, and Semantic Scholar.
    citations_dir = os.path.join(project_dir, "citations")
    skip_ids = set()

    # 1. Crossref + PubMed + Semantic Scholar matches (db_verified_references.json)
    verified_path = os.path.join(citations_dir, "db_verified_references.json")
    if os.path.isfile(verified_path):
        with open(verified_path, "r", encoding="utf-8") as f:
            verified = json.load(f)
        for item in verified.get("items", []):
            if isinstance(item, dict) and item.get("reference_id"):
                skip_ids.add(item["reference_id"])

    # 2. Google Books candidates (db_google_books_candidates.json)
    gb_path = os.path.join(citations_dir, "db_google_books_candidates.json")
    if os.path.isfile(gb_path):
        with open(gb_path, "r", encoding="utf-8") as f:
            gb_data = json.load(f)
        for item in gb_data.get("items", []):
            if isinstance(item, dict) and item.get("reference_id"):
                if item.get("best_candidate") or item.get("all_candidates"):
                    skip_ids.add(item["reference_id"])

    all_items = references_split.get("items", [])
    target_items = [ref for ref in all_items
                    if ref.get("reference_id") not in skip_ids]
    skipped = len(all_items) - len(target_items)

    references_filtered = {
        **references_split,
        "items": target_items,
        "total_references": len(target_items),
    }

    emit("progress", task="citation-db-cinii", step="verify", percent=40,
         reference_count=len(target_items),
         skipped_count=skipped,
         total_count=len(all_items))

    try:
        result = verify_cinii(references_filtered, appid)
    except Exception as e:
        error("CITATION_DB_ERROR",
              f"CiNii verification failed: {e}")

    emit("progress", task="citation-db-cinii", step="save", percent=85)

    os.makedirs(citations_dir, exist_ok=True)

    # db_cinii_results.json — full results
    cinii_path = os.path.join(citations_dir, "db_cinii_results.json")
    with open(cinii_path, "w", encoding="utf-8") as f:
        json.dump(result, f, indent=2, ensure_ascii=False)

    # db_cinii_unmatched.json — unmatched + errors
    unmatched = {
        "items": [it for it in result["items"] if it["status"] != "matched"],
    }
    unmatched_path = os.path.join(citations_dir, "db_cinii_unmatched.json")
    with open(unmatched_path, "w", encoding="utf-8") as f:
        json.dump(unmatched, f, indent=2, ensure_ascii=False)

    # db_verified_references.json — merge CiNii matched
    _merge_cinii_to_verified(citations_dir, result)

    emit("progress", task="citation-db-cinii", step="update_status", percent=95)

    # Log
    log_path = os.path.join(project_dir, "logs", "citation_db.log")
    now = datetime.now(JST).isoformat()
    log_entry = (f"[{now}] citation-db-cinii: "
                 f"matched={result['matched_count']}, "
                 f"unmatched={result['unmatched_count']}\n")
    os.makedirs(os.path.dirname(log_path), exist_ok=True)
    with open(log_path, "a", encoding="utf-8") as f:
        f.write(log_entry)

    # Update task_status.json
    status_path = os.path.join(project_dir, "status", "task_status.json")
    if os.path.isfile(status_path):
        with open(status_path, "r", encoding="utf-8") as f:
            task_status = json.load(f)
        task_status["citation_db_cinii"] = "done"
        with open(status_path, "w", encoding="utf-8") as f:
            json.dump(task_status, f, indent=2, ensure_ascii=False)

    with open(proj_path, "r", encoding="utf-8") as f:
        proj = json.load(f)
    proj["updated_at"] = datetime.now(JST).isoformat()
    with open(proj_path, "w", encoding="utf-8") as f:
        json.dump(proj, f, indent=2, ensure_ascii=False)

    emit("done",
         task="citation-db-cinii",
         matched=result["matched_count"],
         unmatched=result["unmatched_count"],
         message="CiNii verification complete.")


def _merge_cinii_to_verified(citations_dir, cinii_result):
    """Merge CiNii matched items into db_verified_references.json."""
    verified_path = os.path.join(citations_dir, "db_verified_references.json")

    # Load existing verified if present
    existing_items = {}
    if os.path.isfile(verified_path):
        with open(verified_path, "r", encoding="utf-8") as f:
            existing = json.load(f)
        for item in existing.get("items", []):
            ref_id = item.get("reference_id")
            if ref_id:
                existing_items[ref_id] = item

    # Add CiNii matched items
    for item in cinii_result["items"]:
        if item.get("status") != "matched":
            continue
        ref_id = item.get("reference_id")
        if not ref_id:
            continue
        if ref_id in existing_items:
            # Already verified by Crossref/PubMed — add CiNii as extra source
            existing = existing_items[ref_id]
            existing.setdefault("sources", [])
            source_keys = [s.get("db_source") for s in existing["sources"]]
            if "CiNii" not in source_keys:
                existing["sources"].append({
                    "db_source": "CiNii",
                    "cinii_result": item.get("cinii_result"),
                    "comparison": item.get("comparison"),
                })
            if existing.get("status") != "matched":
                existing["status"] = "matched"
        else:
            # New CiNii match — add as primary
            item["sources"] = [{
                "db_source": "CiNii",
                "cinii_result": item.get("cinii_result"),
                "comparison": item.get("comparison"),
            }]
            existing_items[ref_id] = item

    # Write consolidated
    verified = {"items": list(existing_items.values())}
    with open(verified_path, "w", encoding="utf-8") as f:
        json.dump(verified, f, indent=2, ensure_ascii=False)


@main.command()
@click.option("--project", "project_dir", required=True,
              type=click.Path(file_okay=False, writable=True),
              help="Path to the project working folder.")
@click.option("--api-key", required=False, default=None,
              help="Semantic Scholar API key (optional, improves rate limits).")
@click.option("--api-key-env", required=False, default=None,
              help="Env var name for Semantic Scholar API key.")
def citation_db_semantic_scholar(project_dir, api_key, api_key_env):
    """Verify references against Semantic Scholar Academic Graph API."""
    from peer_review_assistant.citations.db_semantic_scholar import verify_semantic_scholar

    emit("progress", task="citation-db-semantic-scholar", step="validate", percent=0)

    proj_path = os.path.join(project_dir, "project.json")
    if not os.path.isfile(proj_path):
        error("NO_PROJECT", "project.json not found. Run init-project first.")

    refs_path = os.path.join(project_dir, "citations", "references_split.json")
    if not os.path.isfile(refs_path):
        error("NO_REFERENCES_SPLIT",
              "citations/references_split.json not found. "
              "Run extract-citations first.")

    # Resolve API key: direct arg > env var name > S2_API_KEY env
    resolved_api_key = api_key
    if not resolved_api_key and api_key_env:
        resolved_api_key = _get_env(api_key_env)
    if not resolved_api_key:
        resolved_api_key = _get_env("SEMANTIC_SCHOLAR_API_KEY")

    if not resolved_api_key:
        emit("progress", task="citation-db-semantic-scholar", step="skip", percent=100)
        emit("done",
             task="citation-db-semantic-scholar",
             matched=0,
             unmatched=0,
             message="Semantic Scholar API key not provided; skipping.")
        return

    emit("progress", task="citation-db-semantic-scholar", step="load", percent=20)

    with open(refs_path, "r", encoding="utf-8") as f:
        references_split = json.load(f)

    # ── Filter: skip references already verified by earlier DBs ─────────
    # Semantic Scholar API has limited capacity. Only query references
    # that remain unmatched after Crossref, PubMed, and Google Books.
    citations_dir = os.path.join(project_dir, "citations")
    skip_ids = set()

    # 1. Crossref + PubMed matches (db_verified_references.json)
    verified_path = os.path.join(citations_dir, "db_verified_references.json")
    if os.path.isfile(verified_path):
        with open(verified_path, "r", encoding="utf-8") as f:
            verified = json.load(f)
        for item in verified.get("items", []):
            if isinstance(item, dict) and item.get("reference_id"):
                skip_ids.add(item["reference_id"])

    # 2. Google Books candidates (db_google_books_candidates.json)
    gb_path = os.path.join(citations_dir, "db_google_books_candidates.json")
    if os.path.isfile(gb_path):
        with open(gb_path, "r", encoding="utf-8") as f:
            gb_data = json.load(f)
        for item in gb_data.get("items", []):
            if isinstance(item, dict) and item.get("reference_id"):
                if item.get("best_candidate") or item.get("all_candidates"):
                    skip_ids.add(item["reference_id"])

    all_items = references_split.get("items", [])
    target_items = [ref for ref in all_items
                    if ref.get("reference_id") not in skip_ids]
    skipped = len(all_items) - len(target_items)

    references_filtered = {
        **references_split,
        "items": target_items,
        "total_references": len(target_items),
    }

    emit("progress", task="citation-db-semantic-scholar", step="verify", percent=40,
         reference_count=len(target_items),
         skipped_count=skipped,
         total_count=len(all_items))

    try:
        result = verify_semantic_scholar(references_filtered, resolved_api_key)
    except Exception as e:
        error("CITATION_DB_ERROR",
              f"Semantic Scholar verification failed: {e}")

    emit("progress", task="citation-db-semantic-scholar", step="save", percent=85)

    os.makedirs(citations_dir, exist_ok=True)

    # db_semantic_scholar_results.json — full results
    ss_path = os.path.join(citations_dir, "db_semantic_scholar_results.json")
    with open(ss_path, "w", encoding="utf-8") as f:
        json.dump(result, f, indent=2, ensure_ascii=False)

    # db_semantic_scholar_unmatched.json — unmatched + errors
    unmatched = {
        "items": [it for it in result["items"] if it["status"] != "matched"],
    }
    unmatched_path = os.path.join(citations_dir, "db_semantic_scholar_unmatched.json")
    with open(unmatched_path, "w", encoding="utf-8") as f:
        json.dump(unmatched, f, indent=2, ensure_ascii=False)

    # db_verified_references.json — merge Semantic Scholar matched
    _merge_ss_to_verified(citations_dir, result)

    emit("progress", task="citation-db-semantic-scholar", step="update_status", percent=95)

    # Log
    log_path = os.path.join(project_dir, "logs", "citation_db.log")
    now = datetime.now(JST).isoformat()
    log_entry = (f"[{now}] citation-db-semantic-scholar: "
                 f"matched={result['matched_count']}, "
                 f"unmatched={result['unmatched_count']}\n")
    os.makedirs(os.path.dirname(log_path), exist_ok=True)
    with open(log_path, "a", encoding="utf-8") as f:
        f.write(log_entry)

    # Update task_status.json
    status_path = os.path.join(project_dir, "status", "task_status.json")
    if os.path.isfile(status_path):
        with open(status_path, "r", encoding="utf-8") as f:
            task_status = json.load(f)
        task_status["citation_db_semantic_scholar"] = "done"
        with open(status_path, "w", encoding="utf-8") as f:
            json.dump(task_status, f, indent=2, ensure_ascii=False)

    with open(proj_path, "r", encoding="utf-8") as f:
        proj = json.load(f)
    proj["updated_at"] = datetime.now(JST).isoformat()
    with open(proj_path, "w", encoding="utf-8") as f:
        json.dump(proj, f, indent=2, ensure_ascii=False)

    emit("done",
         task="citation-db-semantic-scholar",
         matched=result["matched_count"],
         unmatched=result["unmatched_count"],
         message="Semantic Scholar verification complete.")


def _merge_ss_to_verified(citations_dir, ss_result):
    """Merge Semantic Scholar matched items into db_verified_references.json."""
    verified_path = os.path.join(citations_dir, "db_verified_references.json")

    # Load existing verified if present
    existing_items = {}
    if os.path.isfile(verified_path):
        with open(verified_path, "r", encoding="utf-8") as f:
            existing = json.load(f)
        for item in existing.get("items", []):
            ref_id = item.get("reference_id")
            if ref_id:
                existing_items[ref_id] = item

    # Add Semantic Scholar matched items
    for item in ss_result["items"]:
        if item.get("status") != "matched":
            continue
        ref_id = item.get("reference_id")
        if not ref_id:
            continue
        if ref_id in existing_items:
            # Already verified by Crossref/PubMed/CiNii — add SS as extra source
            existing = existing_items[ref_id]
            existing.setdefault("sources", [])
            source_keys = [s.get("db_source") for s in existing["sources"]]
            if "Semantic Scholar" not in source_keys:
                existing["sources"].append({
                    "db_source": "Semantic Scholar",
                    "ss_result": item.get("ss_result"),
                    "comparison": item.get("comparison"),
                })
            if existing.get("status") != "matched":
                existing["status"] = "matched"
        else:
            # New Semantic Scholar match — add as primary
            item["sources"] = [{
                "db_source": "Semantic Scholar",
                "ss_result": item.get("ss_result"),
                "comparison": item.get("comparison"),
            }]
            existing_items[ref_id] = item

    # Write consolidated
    verified = {"items": list(existing_items.values())}
    with open(verified_path, "w", encoding="utf-8") as f:
        json.dump(verified, f, indent=2, ensure_ascii=False)


@main.command(name="citation-db-unmatched-report")
@click.option("--project", "project_dir", required=True,
              type=click.Path(file_okay=False, writable=True),
              help="Path to the project working folder.")
def citation_db_unmatched_report_cmd(project_dir):
    """Generate unmatched references review report from DB results."""
    from peer_review_assistant.citations.unmatched_report import generate_reports

    emit("progress", task="unmatched-report", step="validate", percent=0)

    proj_path = os.path.join(project_dir, "project.json")
    if not os.path.isfile(proj_path):
        error("NO_PROJECT", "project.json not found. Run init-project first.")

    refs_path = os.path.join(project_dir, "citations", "references_split.json")
    if not os.path.isfile(refs_path):
        error("NO_REFERENCES_SPLIT",
              "citations/references_split.json not found. "
              "Run extract-citations first.")

    emit("progress", task="unmatched-report", step="classify", percent=30)

    try:
        summary = generate_reports(project_dir)
    except Exception as e:
        error("CITATION_DB_ERROR",
              f"Failed to generate unmatched report: {e}")

    emit("progress", task="unmatched-report", step="save", percent=80)

    # Log
    log_path = os.path.join(project_dir, "logs", "citation_db.log")
    now = datetime.now(JST).isoformat()
    log_entry = (
        f"[{now}] citation-db-unmatched-report: "
        f"verified={summary['total_verified']}, "
        f"suspicious={summary['suspicious_matches']}, "
        f"unmatched={summary['unmatched']}\n"
    )
    os.makedirs(os.path.dirname(log_path), exist_ok=True)
    with open(log_path, "a", encoding="utf-8") as f:
        f.write(log_entry)

    with open(proj_path, "r", encoding="utf-8") as f:
        proj = json.load(f)
    proj["updated_at"] = datetime.now(JST).isoformat()
    with open(proj_path, "w", encoding="utf-8") as f:
        json.dump(proj, f, indent=2, ensure_ascii=False)

    emit("done",
         task="unmatched-report",
         total_verified=summary["total_verified"],
         suspicious=summary["suspicious_matches"],
         unmatched=summary["unmatched"],
         total=summary["total"],
         message=(f"Unmatched report complete: "
                  f"{summary['total_verified']} verified, "
                  f"{summary['suspicious_matches']} suspicious, "
                  f"{summary['unmatched']} unmatched."))


@main.command(name="citation-db-unmatched-export")
@click.option("--project", "project_dir", required=True,
              type=click.Path(file_okay=False, writable=True),
              help="Path to the project working folder.")
@click.option("--format", "fmt", default="csv",
              type=click.Choice(["csv", "json"]),
              help="Export format: csv (default) or json.")
def citation_db_unmatched_export_cmd(project_dir, fmt):
    """Export unmatched references as CSV or JSON for analysis."""
    import csv
    import io

    emit("progress", task="unmatched-export", step="validate", percent=0)

    proj_path = os.path.join(project_dir, "project.json")
    if not os.path.isfile(proj_path):
        error("NO_PROJECT", "project.json not found. Run init-project first.")

    citations_dir = os.path.join(project_dir, "citations")
    unmatched_path = os.path.join(citations_dir, "db_unmatched_references.json")
    refs_path = os.path.join(citations_dir, "references_split.json")

    if not os.path.isfile(unmatched_path):
        error("NO_UNMATCHED",
              "citations/db_unmatched_references.json not found. "
              "Run citation-db-unmatched-report first.")

    emit("progress", task="unmatched-export", step="load", percent=30)

    with open(unmatched_path, "r", encoding="utf-8") as f:
        unmatched = json.load(f)

    ref_map = {}
    if os.path.isfile(refs_path):
        with open(refs_path, "r", encoding="utf-8") as f:
            refs = json.load(f)
        for ref in refs.get("items", []):
            ref_map[ref["reference_id"]] = ref

    items = unmatched.get("items", [])
    rows = []
    for item in items:
        rid = item.get("reference_id", "?")
        ref = ref_map.get(rid, {})
        raw_text = ref.get("raw_text", "")
        parsed = ref.get("parsed", {})
        error_msg = item.get("error", "")
        status = item.get("status", "unmatched")
        self_contained = ref.get("self_contained_reference", False)

        rows.append({
            "reference_id": rid,
            "status": status,
            "raw_text": raw_text,
            "parsed_title": parsed.get("title", "") or "",
            "parsed_journal": parsed.get("journal", "") or "",
            "parsed_year": parsed.get("year", "") or "",
            "parsed_volume": parsed.get("volume", "") or "",
            "parsed_issue": parsed.get("issue", "") or "",
            "parsed_pages": parsed.get("pages", "") or "",
            "parsed_doi": parsed.get("doi", "") or "",
            "parse_confidence": ref.get("parse_confidence", ""),
            "error": error_msg,
            "self_contained": self_contained,
            "contains_url": "http://" in raw_text or "https://" in raw_text,
            "contains_isbn": "ISBN" in raw_text.upper(),
        })

    emit("progress", task="unmatched-export", step="write", percent=70)

    if fmt == "json":
        out_path = os.path.join(citations_dir, "unmatched_export.json")
        with open(out_path, "w", encoding="utf-8") as f:
            json.dump({
                "generated_at": datetime.now(JST).isoformat(),
                "total": len(rows),
                "items": rows,
            }, f, indent=2, ensure_ascii=False)
    else:
        out_path = os.path.join(citations_dir, "unmatched_export.csv")
        with open(out_path, "w", newline="", encoding="utf-8-sig") as f:
            writer = csv.DictWriter(f, fieldnames=[
                "reference_id", "status", "raw_text", "parsed_title",
                "parsed_journal", "parsed_year", "parsed_volume",
                "parsed_issue", "parsed_pages", "parsed_doi",
                "parse_confidence", "error", "self_contained",
                "contains_url", "contains_isbn",
            ])
            writer.writeheader()
            writer.writerows(rows)

    emit("done",
         task="unmatched-export",
         total=len(rows),
         format=fmt,
         output=out_path,
         message=f"Exported {len(rows)} unmatched references to {out_path}")


@main.command(name="citation-open-log")
@click.option("--project", "project_dir", required=True,
              type=click.Path(file_okay=False, writable=True),
              help="Path to the project working folder.")
@click.option("--log-name", default="llm_search",
              help="Log file name without extension (default: llm_search).")
def citation_open_log(project_dir, log_name):
    """Open a log file with the OS default application."""
    log_path = os.path.join(project_dir, "logs", f"{log_name}.log")
    if not os.path.isfile(log_path):
        error("NO_LOG_FILE",
              f"Log file not found: {log_path}")
    try:
        os.startfile(log_path)
    except Exception as e:
        error("OPEN_LOG_FAILED",
              f"Failed to open log file: {e}")
    emit("done", task="citation-open-log",
         path=log_path,
         message=f"Opened {log_path}")


@main.command(name="citation-db-google-books")
@click.option("--project", "project_dir", required=True,
              type=click.Path(file_okay=False, writable=True),
              help="Path to the project working folder.")
@click.option("--max-results", default=5,
              help="Max Google Books candidates per reference.")
@click.option("--api-key", default=None,
              help="Google Books API key (optional). "
                   "Takes precedence over --api-key-env and "
                   "GOOGLE_BOOKS_API_KEY env var.")
@click.option("--api-key-env", default=None,
              help="Name of environment variable containing the "
                   "API key (optional). "
                   "Falls back to GOOGLE_BOOKS_API_KEY env var.")
def citation_db_google_books(project_dir, max_results, api_key, api_key_env):
    """Search Google Books for book-like unmatched references."""
    from peer_review_assistant.citations.google_books import search_google_books

    emit("progress", task="citation-db-google-books", step="validate",
         percent=0)

    proj_path = os.path.join(project_dir, "project.json")
    if not os.path.isfile(proj_path):
        error("NO_PROJECT", "project.json not found. Run init-project first.")

    refs_path = os.path.join(project_dir, "citations", "references_split.json")
    if not os.path.isfile(refs_path):
        error("NO_REFERENCES_SPLIT",
              "citations/references_split.json not found. "
              "Run extract-citations first.")

    # Resolve API key:
    #   --api-key arg > --api-key-env arg > GOOGLE_BOOKS_API_KEY env > None
    resolved_api_key = api_key
    if not resolved_api_key and api_key_env:
        resolved_api_key = _get_env(api_key_env).strip()
    if not resolved_api_key:
        resolved_api_key = _get_env("GOOGLE_BOOKS_API_KEY").strip()
    if not resolved_api_key:
        resolved_api_key = None

    emit("progress", task="citation-db-google-books", step="load",
         percent=20)

    with open(refs_path, "r", encoding="utf-8") as f:
        references_split = json.load(f)

    # Load LLM repairs (optional — used for book detection flags)
    llm_repairs = None
    llm_path = os.path.join(project_dir, "citations",
                            "references_repaired_llm.json")
    if os.path.isfile(llm_path):
        with open(llm_path, "r", encoding="utf-8") as f:
            llm_repairs = json.load(f)

    emit("progress", task="citation-db-google-books", step="search",
         percent=30)

    result = search_google_books(references_split, llm_repairs,
                                 resolved_api_key, max_results)

    emit("progress", task="citation-db-google-books", step="save",
         percent=85)

    citations_dir = os.path.join(project_dir, "citations")
    os.makedirs(citations_dir, exist_ok=True)

    # db_google_books_results.json — full results (raw API responses,
    # no API key)
    gb_path = os.path.join(citations_dir, "db_google_books_results.json")
    with open(gb_path, "w", encoding="utf-8") as f:
        json.dump(result, f, indent=2, ensure_ascii=False)

    # db_google_books_candidates.json — cleaned candidates for GUI
    candidates = {
        "total_searched": result["total_searched"],
        "candidate_count": result["candidate_count"],
        "no_candidate_count": result["no_candidate_count"],
        "generated_at": datetime.now(JST).isoformat(),
        "items": [],
    }
    for item in result.get("items", []):
        cands = item.get("candidates", [])
        entry = {
            "reference_id": item["reference_id"],
            "best_candidate": cands[0] if cands else None,
            "all_candidates": cands,
            "status": (
                "book_candidate_" + cands[0]["confidence"]
                if cands and cands[0].get("confidence")
                else "book_candidate_high" if cands
                else "no_google_books_candidate"
            ),
        }
        candidates["items"].append(entry)

    candidates_path = os.path.join(citations_dir,
                                   "db_google_books_candidates.json")
    with open(candidates_path, "w", encoding="utf-8") as f:
        json.dump(candidates, f, indent=2, ensure_ascii=False)

    emit("progress", task="citation-db-google-books", step="update_status",
         percent=95)

    # Log
    log_path = os.path.join(project_dir, "logs", "citation_db.log")
    now = datetime.now(JST).isoformat()
    log_entry = (
        f"[{now}] citation-db-google-books: "
        f"searched={result['total_searched']}, "
        f"candidates={result['candidate_count']}, "
        f"no_candidate={result['no_candidate_count']}\n"
    )
    os.makedirs(os.path.dirname(log_path), exist_ok=True)
    with open(log_path, "a", encoding="utf-8") as f:
        f.write(log_entry)

    # Update task_status.json
    status_path = os.path.join(project_dir, "status", "task_status.json")
    if os.path.isfile(status_path):
        with open(status_path, "r", encoding="utf-8") as f:
            task_status = json.load(f)
        task_status["google_books"] = "done"
        with open(status_path, "w", encoding="utf-8") as f:
            json.dump(task_status, f, indent=2, ensure_ascii=False)

    # Mark relevant project flags for the GUI
    with open(proj_path, "r", encoding="utf-8") as f:
        proj = json.load(f)
    proj["updated_at"] = datetime.now(JST).isoformat()
    proj["google_books_done"] = True
    with open(proj_path, "w", encoding="utf-8") as f:
        json.dump(proj, f, indent=2, ensure_ascii=False)

    emit("done",
         task="citation-db-google-books",
         candidates_found=result["candidate_count"],
         no_candidate=result["no_candidate_count"],
         searched=result["total_searched"],
         message=(f"Google Books search complete: "
                  f"{result['candidate_count']} candidates found, "
                  f"{result['no_candidate_count']} with no candidates."))


@main.command(name="check-env")
@click.option("--name", "env_name", required=True,
              help="Name of the environment variable to check.")
def check_env_cmd(env_name):
    """Check whether an environment variable is set (no value revealed)."""
    val = _get_env(env_name).strip()
    emit("env_check", name=env_name, set=bool(val))


@main.command(name="test-google-books")
@click.option("--api-key", default=None,
              help="Google Books API key (optional).")
@click.option("--api-key-env", default=None,
              help="Name of environment variable containing the "
                   "API key (optional).")
def test_google_books_cmd(api_key, api_key_env):
    """Lightweight connection test against the Google Books API.

    Queries a known ISBN (9780261103573) and reports success/failure.
    Does NOT log the API key value.
    """
    import urllib.request
    import urllib.error

    # Resolve API key
    resolved_key = api_key
    if not resolved_key and api_key_env:
        resolved_key = _get_env(api_key_env).strip()
    if not resolved_key:
        resolved_key = _get_env("GOOGLE_BOOKS_API_KEY").strip()
    if not resolved_key:
        resolved_key = None

    # Lightweight query: The Hobbit (known ISBN)
    url = "https://www.googleapis.com/books/v1/volumes?q=isbn:9780261103573"
    if resolved_key:
        url += f"&key={resolved_key}"

    emit("progress", task="test-google-books", step="request", percent=30)

    try:
        req = urllib.request.Request(url)
        req.add_header("User-Agent", "PeerReviewAssistant/0.1")
        with urllib.request.urlopen(req, timeout=15) as resp:
            body = resp.read().decode("utf-8")
            data = json.loads(body)
            total = data.get("totalItems", 0)
            emit("done",
                 task="test-google-books",
                 status="ok",
                 total_items=total,
                 message=f"Google Books API connection OK "
                         f"(totalItems={total}).")
    except urllib.error.HTTPError as e:
        code = e.code
        if code == 401:
            emit("done", task="test-google-books", status="error",
                 error_code=401,
                 message="Google Books API returned 401 Unauthorized. "
                         "Check your API key.")
        elif code == 403:
            emit("done", task="test-google-books", status="error",
                 error_code=403,
                 message="Google Books API returned 403 Forbidden. "
                         "Check your API key permissions.")
        elif code == 429:
            emit("done", task="test-google-books", status="error",
                 error_code=429,
                 message="Google Books API returned 429 Too Many Requests. "
                         "An API key may help increase the rate limit.")
        else:
            emit("done", task="test-google-books", status="error",
                 error_code=code,
                 message=f"Google Books API returned HTTP {code}.")
    except (urllib.error.URLError, OSError) as e:
        emit("done", task="test-google-books", status="error",
             error_code="network",
             message=f"Network error reaching Google Books API: {e}")
    except Exception as e:
        emit("done", task="test-google-books", status="error",
             error_code="unknown",
             message=f"Unexpected error: {e}")


@main.command(name="search-reference-candidates")
@click.option("--project", "project_dir", required=True,
              type=click.Path(file_okay=False, writable=True),
              help="Path to the project working folder.")
@click.option("--reference-id", required=True,
              help="Reference ID (e.g., R001).")
@click.option("--source", required=True,
              type=click.Choice(["crossref", "pubmed", "google_books", "semantic_scholar", "cinii"]),
              help="Source to search: crossref, pubmed, google_books, semantic_scholar, cinii.")
@click.option("--fields", default="title,author,year",
              help="Comma-separated field keys to build the search query.")
@click.option("--max-results", default=5, type=int,
              help="Maximum candidates to return.")
@click.option("--api-key", default=None,
              help="API key for the source (Google Books or Semantic Scholar).")
@click.option("--api-key-env", default=None,
              help="Name of environment variable containing the API key.")
def search_reference_candidates_cmd(project_dir, reference_id, source,
                                     fields, max_results, api_key, api_key_env):
    """Search a single reference against a specific source.

    Reads the reference from references_split.json (and LLM repairs if
    available), builds a search query from the selected fields, and
    returns candidates as JSON Lines events.
    """
    from peer_review_assistant.citations.manual_search import (
        search_manual, _fields_hash,
    )

    emit("progress", task="search-reference-candidates", step="validate",
         percent=0)

    proj_path = os.path.join(project_dir, "project.json")
    if not os.path.isfile(proj_path):
        error("NO_PROJECT", "project.json not found. Run init-project first.")

    # Resolve API key based on source
    resolved_api_key = api_key
    if not resolved_api_key and api_key_env:
        resolved_api_key = _get_env(api_key_env).strip()
    if not resolved_api_key:
        if source == "google_books":
            resolved_api_key = _get_env("GOOGLE_BOOKS_API_KEY").strip()
        elif source == "semantic_scholar":
            resolved_api_key = _get_env("SEMANTIC_SCHOLAR_API_KEY").strip()
        elif source == "cinii":
            resolved_api_key = _get_env("CINII_APPID").strip()
    if not resolved_api_key:
        resolved_api_key = None

    emit("progress", task="search-reference-candidates", step="search",
         percent=30, reference_id=reference_id, source=source, fields=fields)

    try:
        candidates = search_manual(
            project_dir, reference_id, source, fields,
            max_results=max_results, api_key=resolved_api_key,
        )
    except ValueError as e:
        error("SEARCH_ERROR", str(e))
    except Exception as e:
        error("SEARCH_ERROR", f"Search failed: {e}")

    emit("progress", task="search-reference-candidates", step="save",
         percent=80)

    # Emit each candidate as a JSON Lines event
    for cand in candidates:
        emit("candidate", **cand)

    # Save to file
    out_dir = os.path.join(project_dir, "citations",
                           "manual_search_candidates")
    os.makedirs(out_dir, exist_ok=True)
    fhash = _fields_hash(source, fields)
    out_name = f"{reference_id}_{source}_{fhash}.json"
    out_path = os.path.join(out_dir, out_name)
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump({
            "reference_id": reference_id,
            "source": source,
            "fields": fields,
            "candidates": candidates,
            "generated_at": datetime.now(JST).isoformat(),
        }, f, indent=2, ensure_ascii=False)

    emit("done",
         task="search-reference-candidates",
         reference_id=reference_id,
         source=source,
         candidate_count=len(candidates),
         saved_to=out_name,
         message=f"Found {len(candidates)} candidates for {reference_id}")


@main.command(name="accept-reference-candidate")
@click.option("--project", "project_dir", required=True,
              type=click.Path(file_okay=False, writable=True),
              help="Path to the project working folder.")
@click.option("--reference-id", required=True,
              help="Reference ID (e.g., R001).")
@click.option("--candidate-id", required=True,
              help="Candidate ID (e.g., google_books:abc123).")
def accept_reference_candidate_cmd(project_dir, reference_id, candidate_id):
    """Accept a manually selected candidate for a reference.

    Reads the candidate from manual_search_candidates/ and writes to
    human_verified_references.json.
    """
    emit("progress", task="accept-reference-candidate", step="validate",
         percent=0)

    proj_path = os.path.join(project_dir, "project.json")
    if not os.path.isfile(proj_path):
        error("NO_PROJECT", "project.json not found.")

    # Find the candidate in manual_search_candidates/
    search_dir = os.path.join(project_dir, "citations",
                              "manual_search_candidates")
    candidate = None
    if os.path.isdir(search_dir):
        for fname in os.listdir(search_dir):
            if not fname.endswith(".json"):
                continue
            fpath = os.path.join(search_dir, fname)
            try:
                with open(fpath, "r", encoding="utf-8") as f:
                    data = json.load(f)
                if data.get("reference_id") != reference_id:
                    continue
                for cand in data.get("candidates", []):
                    if cand.get("candidate_id") == candidate_id:
                        candidate = cand
                        break
                if candidate:
                    break
            except (json.JSONDecodeError, OSError):
                continue

    if not candidate:
        error("CANDIDATE_NOT_FOUND",
              f"Candidate {candidate_id} not found for {reference_id}")

    emit("progress", task="accept-reference-candidate", step="save",
         percent=50)

    # Load human_verified_references.json
    hv_path = os.path.join(project_dir, "citations",
                           "human_verified_references.json")
    hv_data = {"total_verified": 0, "items": []}
    if os.path.isfile(hv_path):
        try:
            with open(hv_path, "r", encoding="utf-8") as f:
                hv_data = json.load(f)
        except (json.JSONDecodeError, OSError):
            pass  # Start fresh if corrupt

    # Remove any existing entry for this reference (idempotent)
    hv_data["items"] = [
        it for it in hv_data.get("items", [])
        if it.get("reference_id") != reference_id
    ]

    entry = {
        "reference_id": reference_id,
        "status": "human_verified",
        "source": "human_selected",
        "accepted_candidate_id": candidate_id,
        "accepted_at": datetime.now(JST).isoformat(),
        "candidate": candidate,
    }
    hv_data["items"].append(entry)
    hv_data["total_verified"] = len(hv_data["items"])

    os.makedirs(os.path.dirname(hv_path), exist_ok=True)
    with open(hv_path, "w", encoding="utf-8") as f:
        json.dump(hv_data, f, indent=2, ensure_ascii=False)

    emit("done",
         task="accept-reference-candidate",
         reference_id=reference_id,
         candidate_id=candidate_id,
         message=f"Accepted candidate {candidate_id} for {reference_id}")


@main.command(name="accept-reference-as-is")
@click.option("--project", "project_dir", required=True,
              type=click.Path(file_okay=False, writable=True),
              help="Path to the project working folder.")
@click.option("--reference-id", required=True,
              help="Reference ID (e.g., R024).")
@click.option("--reason", default="",
              help="Optional reason for accepting as-is.")
def accept_reference_as_is_cmd(project_dir, reference_id, reason):
    """Accept a reference as-is without a database candidate.

    Suitable for government documents, web documents, and reports
    where URLs serve as the primary identifier.
    """
    emit("progress", task="accept-reference-as-is", step="validate",
         percent=0)

    proj_path = os.path.join(project_dir, "project.json")
    if not os.path.isfile(proj_path):
        error("NO_PROJECT", "project.json not found.")

    # Load reference from references_split.json (as lightweight original)
    refs_path = os.path.join(project_dir, "citations",
                             "references_split.json")
    if not os.path.isfile(refs_path):
        error("NO_REFERENCES_SPLIT",
              "citations/references_split.json not found.")
    with open(refs_path, "r", encoding="utf-8") as f:
        refs = json.load(f)
    ref = next(
        (r for r in refs.get("items", [])
         if r.get("reference_id") == reference_id),
        None,
    )
    if not ref:
        error("REFERENCE_NOT_FOUND",
              f"Reference {reference_id} not found.")

    emit("progress", task="accept-reference-as-is", step="save", percent=50)

    # Load human_verified_references.json
    hv_path = os.path.join(project_dir, "citations",
                           "human_verified_references.json")
    hv_data = {"total_verified": 0, "items": []}
    if os.path.isfile(hv_path):
        try:
            with open(hv_path, "r", encoding="utf-8") as f:
                hv_data = json.load(f)
        except (json.JSONDecodeError, OSError):
            pass

    # Remove any existing entry for this reference (idempotent)
    hv_data["items"] = [
        it for it in hv_data.get("items", [])
        if it.get("reference_id") != reference_id
    ]

    entry = {
        "reference_id": reference_id,
        "status": "accepted_as_is",
        "source": "manuscript_reference",
        "accepted_at": datetime.now(JST).isoformat(),
        "reason": reason,
    }
    hv_data["items"].append(entry)
    hv_data["total_verified"] = len(hv_data["items"])

    os.makedirs(os.path.dirname(hv_path), exist_ok=True)
    with open(hv_path, "w", encoding="utf-8") as f:
        json.dump(hv_data, f, indent=2, ensure_ascii=False)

    emit("done",
         task="accept-reference-as-is",
         reference_id=reference_id,
         message=f"Accepted {reference_id} as-is")


@main.command(name="accept-llm-reference-candidate")
@click.option("--project", "project_dir", required=True,
              type=click.Path(file_okay=False, writable=True),
              help="Path to the project working folder.")
@click.option("--reference-id", required=True,
              help="Reference ID (e.g., R001).")
def accept_llm_reference_candidate_cmd(project_dir, reference_id):
    """Accept an LLM-repaired reference candidate as-is.

    Reads the LLM-repaired data from references_repaired_llm.json
    and saves it as a human-verified reference. Suitable when the
    LLM has cleanly parsed the reference and no external DB candidate
    is available or needed.
    """
    emit("progress", task="accept-llm-reference-candidate",
         step="validate", percent=0)

    proj_path = os.path.join(project_dir, "project.json")
    if not os.path.isfile(proj_path):
        error("NO_PROJECT", "project.json not found.")

    # Load LLM-repaired data
    llm_path = os.path.join(project_dir, "citations",
                            "references_repaired_llm.json")
    if not os.path.isfile(llm_path):
        error("NO_LLM_REPAIR",
              "references_repaired_llm.json not found. Run repair-references-llm first.")
    with open(llm_path, "r", encoding="utf-8") as f:
        llm_data = json.load(f)
    llm_item = next(
        (it for it in llm_data.get("items", [])
         if it.get("reference_id") == reference_id),
        None,
    )
    if not llm_item:
        error("REFERENCE_NOT_FOUND",
              f"Reference {reference_id} not found in LLM-repaired data.")

    # Load original reference
    refs_path = os.path.join(project_dir, "citations",
                             "references_split.json")
    with open(refs_path, "r", encoding="utf-8") as f:
        refs = json.load(f)
    ref = next(
        (r for r in refs.get("items", [])
         if r.get("reference_id") == reference_id),
        None,
    )

    emit("progress", task="accept-llm-reference-candidate",
         step="save", percent=50)

    # Load human_verified_references.json
    hv_path = os.path.join(project_dir, "citations",
                           "human_verified_references.json")
    hv_data = {"total_verified": 0, "items": []}
    if os.path.isfile(hv_path):
        try:
            with open(hv_path, "r", encoding="utf-8") as f:
                hv_data = json.load(f)
        except (json.JSONDecodeError, OSError):
            pass

    # Remove any existing entry for this reference (idempotent)
    hv_data["items"] = [
        it for it in hv_data.get("items", [])
        if it.get("reference_id") != reference_id
    ]

    llm_parsed = llm_item.get("parsed") or {}

    entry = {
        "reference_id": reference_id,
        "status": "human_verified",
        "source": "llm_reparsed_reference",
        "accepted_at": datetime.now(JST).isoformat(),
        "accepted_reference": {
            "title": llm_parsed.get("title"),
            "book_title": llm_parsed.get("book_title"),
            "authors": llm_parsed.get("authors", []),
            "year": llm_parsed.get("year"),
            "journal": llm_parsed.get("journal"),
            "publisher": llm_parsed.get("publisher"),
            "volume": llm_parsed.get("volume"),
            "issue": llm_parsed.get("issue"),
            "pages": llm_parsed.get("pages"),
            "doi": llm_parsed.get("doi"),
            "url": llm_parsed.get("url"),
            "isbn": llm_parsed.get("isbn"),
            "type": llm_parsed.get("publication_type"),
        },
        "raw_reference_text": ref.get("raw_text", "") if ref else llm_item.get("raw_reference_text", ""),
        "llm_confidence": llm_item.get("confidence"),
        "llm_warnings": llm_item.get("warnings", []),
        "llm_flags": llm_item.get("flags", {}),
    }
    hv_data["items"].append(entry)
    hv_data["total_verified"] = len(hv_data["items"])

    os.makedirs(os.path.dirname(hv_path), exist_ok=True)
    with open(hv_path, "w", encoding="utf-8") as f:
        json.dump(hv_data, f, indent=2, ensure_ascii=False)

    emit("done",
         task="accept-llm-reference-candidate",
         reference_id=reference_id,
         message=f"Accepted LLM candidate for {reference_id}")


@main.command(name="accept-llm-search-result")
@click.option("--project", "project_dir", required=True,
              type=click.Path(file_okay=False, writable=True),
              help="Path to the project working folder.")
@click.option("--reference-id", required=True,
              help="Reference ID (e.g., R001).")
def accept_llm_search_result_cmd(project_dir, reference_id):
    """Accept an LLM search result as the verified reference."""
    citations_dir = os.path.join(project_dir, "citations")

    # Load search results
    sr_path = os.path.join(citations_dir, "references_searched_llm.json")
    if not os.path.isfile(sr_path):
        error("NO_SEARCH_RESULTS",
              "references_searched_llm.json not found. "
              "Run search-references-llm first.")

    with open(sr_path, "r", encoding="utf-8") as f:
        sr_data = json.load(f)

    sr_item = None
    for it in sr_data.get("items", []):
        if it.get("reference_id") == reference_id:
            sr_item = it
            break

    if not sr_item:
        error("REFERENCE_NOT_FOUND",
              f"Reference {reference_id} not found in "
              f"references_searched_llm.json")

    if not sr_item.get("identified"):
        error("NOT_IDENTIFIED",
              f"Reference {reference_id} was not identified by LLM search. "
              f"Cannot accept.")

    # Load or create human_verified_references.json
    hv_path = os.path.join(citations_dir, "human_verified_references.json")
    if os.path.isfile(hv_path):
        with open(hv_path, "r", encoding="utf-8") as f:
            hv_data = json.load(f)
    else:
        hv_data = {"total_verified": 0, "items": []}

    # Remove any existing entry for this reference (idempotent)
    hv_data["items"] = [
        it for it in hv_data.get("items", [])
        if it.get("reference_id") != reference_id
    ]

    corrected = sr_item.get("corrected") or {}

    entry = {
        "reference_id": reference_id,
        "status": "human_verified",
        "source": "llm_search_result",
        "accepted_at": datetime.now(JST).isoformat(),
        "accepted_reference": {
            "title": corrected.get("title"),
            "book_title": corrected.get("book_title"),
            "authors": corrected.get("authors", []),
            "year": corrected.get("year"),
            "journal": corrected.get("journal"),
            "publisher": corrected.get("publisher"),
            "volume": corrected.get("volume"),
            "issue": corrected.get("issue"),
            "pages": corrected.get("pages"),
            "doi": corrected.get("doi"),
            "url": corrected.get("url"),
            "isbn": corrected.get("isbn"),
            "type": sr_item.get("publication_type"),
        },
        "search_confidence": sr_item.get("confidence"),
        "search_notes": sr_item.get("notes", ""),
        "search_source_urls": sr_item.get("source_urls", []),
    }
    hv_data["items"].append(entry)
    hv_data["total_verified"] = len(hv_data["items"])

    os.makedirs(os.path.dirname(hv_path), exist_ok=True)
    with open(hv_path, "w", encoding="utf-8") as f:
        json.dump(hv_data, f, indent=2, ensure_ascii=False)

    emit("done",
         task="accept-llm-search-result",
         reference_id=reference_id,
         message=f"Accepted LLM search result for {reference_id}")


@main.command(name="generate-llm-search-suggestions")
@click.option("--project", "project_dir", required=True,
              type=click.Path(file_okay=False, writable=True),
              help="Path to the project working folder.")
@click.option("--slot", required=True,
              help="LLM slot name (e.g., reviewer_reasoning).")
@click.option("--provider", required=True,
              help="LLM provider (e.g., deepseek, openai).")
@click.option("--base-url", required=True,
              help="LLM API base URL.")
@click.option("--model", required=True,
              help="LLM model name.")
@click.option("--api-key", default="",
              help="LLM API key.")
@click.option("--api-key-env", default=None,
              help="Environment variable name containing the API key.")
def generate_llm_search_suggestions_cmd(project_dir, slot, provider,
                                         base_url, model, api_key, api_key_env):
    """Generate LLM-powered search queries for unmatched references.

    Reads unmatched/suspicious references and asks an LLM to suggest
    search queries for Semantic Scholar, Google Scholar, Web search, etc.
    Outputs llm_search_suggestions.json and .md report.
    """
    from peer_review_assistant.llm import LLMProvider
    from peer_review_assistant.citations.llm_search_support import (
        generate_search_suggestions,
    )

    # Resolve API key: 1. --api-key  2. --api-key-env  3. PRA_LLM_KEY_<SLOT>
    if not api_key and api_key_env:
        api_key = _get_env(api_key_env).strip()
    if not api_key:
        api_key = _get_env(f"PRA_LLM_KEY_{slot.upper()}").strip()

    emit("progress", task="generate-llm-search-suggestions",
         step="validate", percent=0, slot=slot)

    proj_path = os.path.join(project_dir, "project.json")
    if not os.path.isfile(proj_path):
        error("NO_PROJECT", "project.json not found.")

    emit("progress", task="generate-llm-search-suggestions",
         step="load_inputs", percent=20, slot=slot,
         provider=provider, model=model)

    prov = LLMProvider(
        name=slot,
        provider=provider,
        base_url=base_url,
        model=model,
        api_key=api_key,
    )

    emit("progress", task="generate-llm-search-suggestions",
         step="calling_llm", percent=40, slot=slot, model=model)

    try:
        summary = generate_search_suggestions(project_dir, prov)
    except Exception as e:
        error("SEARCH_SUGGESTIONS_FAILED",
              f"LLM search suggestions failed: {e}")

    emit("progress", task="generate-llm-search-suggestions",
         step="saving", percent=90, slot=slot)

    # Update project.json status
    try:
        with open(proj_path, "r", encoding="utf-8") as f:
            proj = json.load(f)
        proj.setdefault("search_suggestions", {})[slot] = {
            "status": "done",
            "generated_at": datetime.now(JST).isoformat(),
        }
        with open(proj_path, "w", encoding="utf-8") as f:
            json.dump(proj, f, indent=2, ensure_ascii=False)
    except Exception:
        pass

    emit("done",
         task="generate-llm-search-suggestions",
         slot=slot,
         **{k: v for k, v in summary.items() if k != "message"},
         message=summary["message"])


@main.command(name="generate-llm-reference-flags")
@click.option("--project", "project_dir", required=True,
              type=click.Path(file_okay=False, writable=True),
              help="Path to the project working folder.")
@click.option("--slot", required=True,
              help="LLM slot name (e.g., reviewer1).")
@click.option("--provider", required=True,
              help="LLM provider (e.g., openai, deepseek).")
@click.option("--base-url", required=True,
              help="LLM API base URL.")
@click.option("--model", required=True,
              help="LLM model name.")
@click.option("--api-key", default=None,
              help="LLM API key.")
@click.option("--api-key-env", default=None,
              help="Environment variable name containing the API key.")
def generate_llm_reference_flags_cmd(project_dir, slot, provider, base_url,
                                      model, api_key, api_key_env):
    """Generate per-reference LLM flags for later-check classification.

    Analyzes unmatched references and sets flags for:
    - possible_missing_doi
    - likely_government_or_web_document
    - likely_book
    - year_mismatch_possible_edition
    - metadata_incomplete
    - reference_style_needs_check
    - bibliographic_accuracy_needs_check
    - citation_context_needs_check
    - needs_later_llm_check (overall)

    Outputs citations/reference_llm_flags.json.
    The API key value is never logged.
    """
    from peer_review_assistant.llm import LLMProvider
    from peer_review_assistant.citations.llm_reference_flags import (
        generate_reference_flags,
    )

    # Resolve API key
    if not api_key and api_key_env:
        api_key = _get_env(api_key_env).strip()
    if not api_key:
        api_key = _get_env(f"PRA_LLM_KEY_{slot.upper()}").strip()
    if not api_key:
        error("NO_API_KEY",
              f"No API key provided. Use --api-key, --api-key-env, or set "
              f"PRA_LLM_KEY_{slot.upper()} environment variable.")

    emit("progress", task="generate-llm-reference-flags",
         step="validate", percent=0, slot=slot)

    proj_path = os.path.join(project_dir, "project.json")
    if not os.path.isfile(proj_path):
        error("NO_PROJECT", "project.json not found.")

    emit("progress", task="generate-llm-reference-flags",
         step="analyze", percent=30, slot=slot,
         provider=provider, model=model)

    prov = LLMProvider(
        name=slot,
        provider=provider,
        base_url=base_url,
        model=model,
        api_key=api_key,
    )

    result = generate_reference_flags(project_dir, prov)

    emit("progress", task="generate-llm-reference-flags",
         step="save", percent=80)

    # Save to file
    out_path = os.path.join(project_dir, "citations",
                            "reference_llm_flags.json")
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(result, f, indent=2, ensure_ascii=False)

    later_count = sum(
        1 for it in result.get("items", [])
        if it.get("llm_flags", {}).get("needs_later_llm_check")
    )

    emit("done",
         task="generate-llm-reference-flags",
         total_analyzed=result.get("total_analyzed", 0),
         flagged_for_later=later_count,
         saved_to=os.path.basename(out_path),
         message=(f"LLM flags generated: {result.get('total_analyzed', 0)} "
                  f"analyzed, {later_count} flagged for later LLM check."))


@main.command(name="generate-journal-profile")
@click.option("--project", "project_dir", required=True,
              type=click.Path(file_okay=False, writable=True),
              help="Path to the project working folder.")
@click.option("--slot", required=True,
              help="LLM slot name (e.g., summary, reviewer1).")
@click.option("--provider", required=True,
              help="LLM provider (e.g., openai, anthropic, deepseek).")
@click.option("--base-url", required=True,
              help="LLM API base URL.")
@click.option("--model", required=True,
              help="LLM model name.")
@click.option("--api-key", default=None,
              help="LLM API key.")
@click.option("--api-key-env", default=None,
              help="Environment variable name containing the API key.")
@click.option("--journal-name", default="",
              help="Target journal name (e.g., 'Scientific Reports').")
@click.option("--journal-url", default="",
              help="Journal homepage or submission guidelines URL.")
@click.option("--article-type", default="Article",
              help="Article type (Article, Review, etc.).")
def generate_journal_profile_cmd(project_dir, slot, provider, base_url,
                                  model, api_key, api_key_env,
                                  journal_name, journal_url, article_type):
    """Generate journal_profile.json using LLM research.

    The LLM researches the target journal and fills in submission guidelines,
    citation style, and review policy information. Output is saved as a DRAFT
    — the user should review and confirm before using it for checks.

    Writes journal_profile.json and journal_profile_draft.md to the project
    directory. The API key value is never logged.
    """
    from peer_review_assistant.llm import LLMProvider, chat_completion
    from peer_review_assistant.llm.json_repair import parse_llm_json
    from peer_review_assistant.journal_profile import (
        build_journal_profile_messages,
        apply_defaults,
        save_journal_profile,
    )

    emit("progress", task="generate-journal-profile",
         step="validate", percent=0, slot=slot)

    proj_path = os.path.join(project_dir, "project.json")
    if not os.path.isfile(proj_path):
        error("NO_PROJECT", "project.json not found.")

    # Resolve API key
    if not api_key and api_key_env:
        api_key = _get_env(api_key_env).strip()
    if not api_key:
        api_key = _get_env(f"PRA_LLM_KEY_{slot.upper()}").strip()
    if not api_key:
        error("NO_API_KEY",
              f"No API key provided. Use --api-key, --api-key-env, or set "
              f"PRA_LLM_KEY_{slot.upper()} environment variable.")

    emit("progress", task="generate-journal-profile",
         step="calling_llm", percent=40, slot=slot,
         journal=journal_name or "(not specified)", model=model)

    prov = LLMProvider(
        name=slot,
        provider=provider,
        base_url=base_url,
        model=model,
        api_key=api_key,
    )

    messages = build_journal_profile_messages(
        journal_name=journal_name,
        journal_url=journal_url,
        article_type=article_type,
    )

    result = chat_completion(prov, messages, max_tokens=4096, timeout_seconds=60)

    if not result or not result.get("content"):
        error("LLM_EMPTY", "LLM returned empty response for journal profile.")

    emit("progress", task="generate-journal-profile",
         step="parsing", percent=70, slot=slot)

    parsed = parse_llm_json(result["content"])
    if not parsed:
        error("LLM_PARSE_FAILED",
              "Failed to parse LLM response as JSON. "
              "The model may have returned an unsupported format.")

    profile = apply_defaults(parsed)
    profile["source"] = "llm"
    profile["source_details"] = f"Generated via {slot} ({model})"

    json_path, md_path = save_journal_profile(project_dir, profile)

    # Update project.json
    with open(proj_path, "r", encoding="utf-8") as f:
        proj = json.load(f)
    proj.setdefault("journal_profile", {})["status"] = "draft"
    proj["journal_profile"]["generated_at"] = datetime.now(JST).isoformat()
    proj["updated_at"] = datetime.now(JST).isoformat()
    with open(proj_path, "w", encoding="utf-8") as f:
        json.dump(proj, f, indent=2, ensure_ascii=False)

    emit("done",
         task="generate-journal-profile",
         journal=profile.get("journal_name", journal_name),
         source=profile.get("source"),
         saved_json=os.path.basename(json_path),
         saved_md=os.path.basename(md_path),
         message=(f"Journal profile saved for "
                  f"'{profile.get('journal_name', journal_name)}'."))


@main.command(name="defer-reference")
@click.option("--project", "project_dir", required=True,
              type=click.Path(file_okay=False, writable=True),
              help="Path to the project working folder.")
@click.option("--reference-id", required=True,
              help="Reference ID (e.g., R018).")
@click.option("--reason", required=True,
              type=click.Choice([
                  "reference_style",
                  "bibliographic_accuracy",
                  "metadata_completion",
                  "citation_context_match",
              ]),
              help="Reason for deferral.")
@click.option("--note", default="",
              help="Optional free-text note.")
def defer_reference_cmd(project_dir, reference_id, reason, note):
    """Defer a reference for later review.

    Marks a reference as deferred when it cannot be found in any database
    and the human reviewer decides to revisit it later.
    """
    emit("progress", task="defer-reference", step="validate", percent=0)

    proj_path = os.path.join(project_dir, "project.json")
    if not os.path.isfile(proj_path):
        error("NO_PROJECT", "project.json not found.")

    # Load existing deferred references
    deferred_path = os.path.join(project_dir, "citations",
                                  "deferred_references.json")
    deferred_data = {"total_deferred": 0, "items": []}
    if os.path.isfile(deferred_path):
        try:
            with open(deferred_path, "r", encoding="utf-8") as f:
                deferred_data = json.load(f)
        except (json.JSONDecodeError, OSError):
            pass

    emit("progress", task="defer-reference", step="save", percent=50)

    # Remove existing entry for this reference (idempotent)
    deferred_data["items"] = [
        it for it in deferred_data.get("items", [])
        if it.get("reference_id") != reference_id
    ]

    # Load reference text
    refs_path = os.path.join(project_dir, "citations",
                             "references_split.json")
    with open(refs_path, "r", encoding="utf-8") as f:
        refs = json.load(f)
    ref = next(
        (r for r in refs.get("items", [])
         if r.get("reference_id") == reference_id),
        None,
    )

    entry = {
        "reference_id": reference_id,
        "deferred_at": datetime.now(JST).isoformat(),
        "reason": reason,
        "note": note,
        "raw_reference_text": ref.get("raw_text", "") if ref else "",
    }
    deferred_data["items"].append(entry)
    deferred_data["total_deferred"] = len(deferred_data["items"])

    os.makedirs(os.path.dirname(deferred_path), exist_ok=True)
    with open(deferred_path, "w", encoding="utf-8") as f:
        json.dump(deferred_data, f, indent=2, ensure_ascii=False)

    emit("done",
         task="defer-reference",
         reference_id=reference_id,
         reason=reason,
         message=f"Deferred {reference_id} ({reason})")


@main.command(name="citation-viewer-data")
@click.option("--project", "project_dir", required=True,
              type=click.Path(file_okay=False, writable=True),
              help="Path to the project working folder.")
def citation_viewer_data_cmd(project_dir):
    """Generate unified citation viewer data JSON for the GUI."""
    from peer_review_assistant.citations.viewer_data import generate_viewer_data

    emit("progress", task="viewer-data", step="validate", percent=0)

    proj_path = os.path.join(project_dir, "project.json")
    if not os.path.isfile(proj_path):
        error("NO_PROJECT", "project.json not found. Run init-project first.")

    refs_path = os.path.join(project_dir, "citations", "references_split.json")
    if not os.path.isfile(refs_path):
        error("NO_REFERENCES_SPLIT",
              "citations/references_split.json not found. "
              "Run extract-citations first.")

    emit("progress", task="viewer-data", step="assemble", percent=30)

    try:
        viewer_data = generate_viewer_data(project_dir)
    except Exception as e:
        error("CITATION_DB_ERROR",
              f"Failed to generate viewer data: {e}")

    emit("progress", task="viewer-data", step="save", percent=80)

    # Save viewer data
    out_path = os.path.join(project_dir, "citations", "citation_viewer_data.json")
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(viewer_data, f, indent=2, ensure_ascii=False)

    # Log
    log_path = os.path.join(project_dir, "logs", "citation_db.log")
    now = datetime.now(JST).isoformat()
    s = viewer_data["summary"]
    log_entry = (
        f"[{now}] citation-viewer-data: "
        f"total={s['total']}, verified={s['verified']}, "
        f"unmatched={s['unmatched']}, suspicious={s['suspicious']}\n"
    )
    os.makedirs(os.path.dirname(log_path), exist_ok=True)
    with open(log_path, "a", encoding="utf-8") as f:
        f.write(log_entry)

    with open(proj_path, "r", encoding="utf-8") as f:
        proj = json.load(f)
    proj["updated_at"] = datetime.now(JST).isoformat()
    with open(proj_path, "w", encoding="utf-8") as f:
        json.dump(proj, f, indent=2, ensure_ascii=False)

    emit("done",
         task="viewer-data",
         total=s["total"],
         verified=s["verified"],
         unmatched=s["unmatched"],
         suspicious=s["suspicious"],
         message=(f"Viewer data generated: {s['total']} references, "
                  f"{s['verified']} verified, "
                  f"{s['unmatched']} unmatched, "
                  f"{s['suspicious']} suspicious."))


@main.command(name="repair-references-llm")
@click.option("--project", "project_dir", required=True,
              type=click.Path(file_okay=False, writable=True),
              help="Path to the project working folder.")
@click.option("--slot", required=True,
              help="LLM slot name (summary, reviewer1, reviewer2, reviewer3).")
@click.option("--provider", required=True,
              help="Provider name (e.g., openai, anthropic, deepseek, openrouter).")
@click.option("--base-url", required=True,
              help="Base URL for the chat completions endpoint.")
@click.option("--model", required=True,
              help="Model name.")
@click.option("--api-key", default=None,
              help="API key. Falls back to --api-key-env or PRA_LLM_KEY_<SLOT> env var.")
@click.option("--api-key-env", default=None,
              help="Environment variable name containing the API key.")
def repair_references_llm_cmd(project_dir, slot, provider, base_url, model, api_key, api_key_env):
    """Use LLM to re-parse unmatched/suspicious reference text into structured fields."""
    from peer_review_assistant.llm import LLMProvider
    from peer_review_assistant.citations.repair_llm import generate_llm_repairs

    emit("progress", task="repair-references-llm", step="validate", percent=0,
         slot=slot)

    # Validate project
    proj_path = os.path.join(project_dir, "project.json")
    if not os.path.isfile(proj_path):
        error("NO_PROJECT", "project.json not found. Run init-project first.")

    refs_path = os.path.join(project_dir, "citations", "references_split.json")
    if not os.path.isfile(refs_path):
        error("NO_REFERENCES_SPLIT",
              "citations/references_split.json not found. "
              "Run extract-citations first.")

    # Resolve API key: 1. --api-key  2. --api-key-env  3. PRA_LLM_KEY_<SLOT>
    if not api_key and api_key_env:
        api_key = _get_env(api_key_env).strip()
    if not api_key:
        api_key = _get_env(f"PRA_LLM_KEY_{slot.upper()}").strip()
    if not api_key:
        error("NO_API_KEY",
              f"No API key provided. Use --api-key, --api-key-env, or set "
              f"PRA_LLM_KEY_{slot.upper()} environment variable.")

    emit("progress", task="repair-references-llm", step="load_inputs", percent=20,
         slot=slot, provider=provider, model=model)

    prov = LLMProvider(
        name=slot,
        provider=provider,
        base_url=base_url,
        model=model,
        api_key=api_key,
    )

    emit("progress", task="repair-references-llm", step="calling_llm", percent=40,
         slot=slot, model=model)

    try:
        summary = generate_llm_repairs(project_dir, prov)
    except Exception as e:
        error("REPAIR_LLM_FAILED",
              f"LLM reference repair failed: {e}")

    emit("progress", task="repair-references-llm", step="saving", percent=90,
         slot=slot)

    # Log
    log_path = os.path.join(project_dir, "logs", "citation_db.log")
    now = datetime.now(JST).isoformat()
    log_entry = (
        f"[{now}] repair-references-llm ({slot}): "
        f"processed={summary['total_processed']}, "
        f"repaired={summary['repaired']}, "
        f"with_url={summary.get('with_url', 0)}, "
        f"likely_book={summary.get('likely_book', 0)}, "
        f"missing_doi={summary.get('possible_missing_doi', 0)}\n"
    )
    os.makedirs(os.path.dirname(log_path), exist_ok=True)
    with open(log_path, "a", encoding="utf-8") as lf:
        lf.write(log_entry)

    # Update project.json
    proj_path = os.path.join(project_dir, "project.json")
    with open(proj_path, "r", encoding="utf-8") as f:
        proj = json.load(f)
    proj["updated_at"] = datetime.now(JST).isoformat()
    with open(proj_path, "w", encoding="utf-8") as f:
        json.dump(proj, f, indent=2, ensure_ascii=False)

    emit("done",
         task="repair-references-llm",
         slot=slot,
         **{k: v for k, v in summary.items() if k != "message"},
         message=summary["message"])


@main.command(name="resolve-journals-llm")
@click.option("--project", "project_dir", required=True,
              type=click.Path(file_okay=False, writable=True),
              help="Path to the project working folder.")
@click.option("--slot", required=True,
              help="LLM slot name (summary, reviewer1, reviewer2, reviewer3).")
@click.option("--provider", required=True,
              help="Provider name (e.g., openai, anthropic, deepseek, openrouter).")
@click.option("--base-url", required=True,
              help="Base URL for the chat completions endpoint.")
@click.option("--model", required=True,
              help="Model name.")
@click.option("--api-key", default=None,
              help="API key. Falls back to --api-key-env or PRA_LLM_KEY_<SLOT> env var.")
@click.option("--api-key-env", default=None,
              help="Environment variable name containing the API key.")
def resolve_journals_llm_cmd(project_dir, slot, provider, base_url, model, api_key, api_key_env):
    """Use LLM to disambiguate journal names that appear to mismatch."""
    from peer_review_assistant.llm import LLMProvider
    from peer_review_assistant.citations.journal_resolve_llm import resolve_journals_llm

    emit("progress", task="resolve-journals-llm", step="validate", percent=0,
         slot=slot)

    # Validate project
    proj_path = os.path.join(project_dir, "project.json")
    if not os.path.isfile(proj_path):
        error("NO_PROJECT", "project.json not found. Run init-project first.")

    refs_path = os.path.join(project_dir, "citations", "references_split.json")
    if not os.path.isfile(refs_path):
        error("NO_REFERENCES_SPLIT",
              "citations/references_split.json not found. "
              "Run extract-citations first.")

    crossref_path = os.path.join(project_dir, "citations", "db_crossref_results.json")
    pubmed_path = os.path.join(project_dir, "citations", "db_pubmed_results.json")
    if not os.path.isfile(crossref_path) and not os.path.isfile(pubmed_path):
        error("NO_DB_RESULTS",
              "Neither db_crossref_results.json nor db_pubmed_results.json found. "
              "Run citation-db-crossref or citation-db-pubmed first.")

    # Resolve API key: 1. --api-key  2. --api-key-env  3. PRA_LLM_KEY_<SLOT>
    if not api_key and api_key_env:
        api_key = _get_env(api_key_env).strip()
    if not api_key:
        api_key = _get_env(f"PRA_LLM_KEY_{slot.upper()}").strip()
    if not api_key:
        error("NO_API_KEY",
              f"No API key provided. Use --api-key, --api-key-env, or set "
              f"PRA_LLM_KEY_{slot.upper()} environment variable.")

    emit("progress", task="resolve-journals-llm", step="load_inputs", percent=20,
         slot=slot, provider=provider, model=model)

    prov = LLMProvider(
        name=slot,
        provider=provider,
        base_url=base_url,
        model=model,
        api_key=api_key,
    )

    emit("progress", task="resolve-journals-llm", step="calling_llm", percent=40,
         slot=slot, model=model)

    try:
        summary = resolve_journals_llm(project_dir, prov)
    except Exception as e:
        error("RESOLVE_JOURNALS_FAILED",
              f"LLM journal disambiguation failed: {e}")

    emit("progress", task="resolve-journals-llm", step="saving", percent=90,
         slot=slot)

    # Log
    log_path = os.path.join(project_dir, "logs", "citation_db.log")
    now = datetime.now(JST).isoformat()
    log_entry = (
        f"[{now}] resolve-journals-llm ({slot}): "
        f"pairs={summary['total_pairs']}, "
        f"identity={summary['resolved_identity']}, "
        f"style={summary['resolved_style']}, "
        f"mismatch={summary['still_mismatch']}, "
        f"refs_updated={summary['total_references_updated']}\n"
    )
    os.makedirs(os.path.dirname(log_path), exist_ok=True)
    with open(log_path, "a", encoding="utf-8") as lf:
        lf.write(log_entry)

    # Update project.json
    with open(proj_path, "r", encoding="utf-8") as f:
        proj = json.load(f)
    proj["updated_at"] = datetime.now(JST).isoformat()
    with open(proj_path, "w", encoding="utf-8") as f:
        json.dump(proj, f, indent=2, ensure_ascii=False)

    emit("done",
         task="resolve-journals-llm",
         slot=slot,
         **{k: v for k, v in summary.items() if k != "message"},
         message=summary["message"])


@main.command(name="search-references-llm")
@click.option("--project", "project_dir", required=True,
              type=click.Path(file_okay=False, writable=True),
              help="Path to the project working folder.")
@click.option("--slot", required=True,
              help="LLM slot name (summary, reviewer1, reviewer2, reviewer3).")
@click.option("--provider", required=True,
              help="Provider name (e.g., openai, anthropic, deepseek, openrouter).")
@click.option("--base-url", required=True,
              help="Base URL for the chat completions endpoint.")
@click.option("--model", required=True,
              help="Model name.")
@click.option("--api-key", default=None,
              help="API key. Falls back to --api-key-env or PRA_LLM_KEY_<SLOT> env var.")
@click.option("--api-key-env", default=None,
              help="Environment variable name containing the API key.")
def search_references_llm_cmd(project_dir, slot, provider, base_url, model, api_key, api_key_env):
    """Use LLM to identify unmatched references using its training knowledge."""
    from peer_review_assistant.llm import LLMProvider
    from peer_review_assistant.citations.search_references_llm import search_references_llm

    emit("progress", task="search-references-llm", step="validate", percent=0,
         slot=slot)

    # Validate project
    proj_path = os.path.join(project_dir, "project.json")
    if not os.path.isfile(proj_path):
        error("NO_PROJECT", "project.json not found. Run init-project first.")

    refs_path = os.path.join(project_dir, "citations", "references_split.json")
    if not os.path.isfile(refs_path):
        error("NO_REFERENCES_SPLIT",
              "citations/references_split.json not found. "
              "Run extract-citations first.")

    unmatched_path = os.path.join(project_dir, "citations", "db_unmatched_references.json")
    if not os.path.isfile(unmatched_path):
        error("NO_UNMATCHED",
              "citations/db_unmatched_references.json not found. "
              "Run citation-db-unmatched-report first.")

    # Resolve API key: 1. --api-key  2. --api-key-env  3. PRA_LLM_KEY_<SLOT>
    if not api_key and api_key_env:
        api_key = _get_env(api_key_env).strip()
    if not api_key:
        api_key = _get_env(f"PRA_LLM_KEY_{slot.upper()}").strip()
    if not api_key:
        error("NO_API_KEY",
              f"No API key provided. Use --api-key, --api-key-env, or set "
              f"PRA_LLM_KEY_{slot.upper()} environment variable.")

    emit("progress", task="search-references-llm", step="load_inputs", percent=20,
         slot=slot, provider=provider, model=model)

    prov = LLMProvider(
        name=slot,
        provider=provider,
        base_url=base_url,
        model=model,
        api_key=api_key,
    )

    emit("progress", task="search-references-llm", step="calling_llm", percent=40,
         slot=slot, model=model)

    try:
        def _progress_callback(percent, data):
            emit("progress", task="search-references-llm",
                 step="batch_complete", percent=percent,
                 slot=slot, **data)
        summary = search_references_llm(project_dir, prov,
                                        progress_callback=_progress_callback)
    except Exception as e:
        error("SEARCH_REFERENCES_FAILED",
              f"LLM reference search failed: {e}")

    emit("progress", task="search-references-llm", step="saving", percent=90,
         slot=slot)

    # Log
    log_path = os.path.join(project_dir, "logs", "citation_db.log")
    now = datetime.now(JST).isoformat()
    log_entry = (
        f"[{now}] search-references-llm ({slot}): "
        f"processed={summary['total_processed']}, "
        f"identified={summary['identified']}, "
        f"uncertain={summary['uncertain']}, "
        f"batches={summary['batches']}\n"
    )
    os.makedirs(os.path.dirname(log_path), exist_ok=True)
    with open(log_path, "a", encoding="utf-8") as lf:
        lf.write(log_entry)

    # Update project.json
    with open(proj_path, "r", encoding="utf-8") as f:
        proj = json.load(f)
    proj["updated_at"] = datetime.now(JST).isoformat()
    with open(proj_path, "w", encoding="utf-8") as f:
        json.dump(proj, f, indent=2, ensure_ascii=False)

    emit("done",
         task="search-references-llm",
         slot=slot,
         **{k: v for k, v in summary.items() if k != "message"},
         message=summary["message"])


@main.command(name="search-single-reference-llm")
@click.option("--project", "project_dir", required=True,
              type=click.Path(file_okay=False, writable=True),
              help="Path to the project working folder.")
@click.option("--reference-id", required=True,
              help="Reference ID (e.g., R032).")
@click.option("--slot", required=True,
              help="LLM slot name (summary, reviewer1, reviewer2, reviewer3).")
@click.option("--provider", required=True,
              help="Provider name (e.g., openai, anthropic, deepseek, openrouter).")
@click.option("--base-url", required=True,
              help="Base URL for the chat completions endpoint.")
@click.option("--model", required=True,
              help="Model name (e.g., gpt-4o, claude-opus-4-7).")
@click.option("--api-key", default=None,
              help="API key. Falls back to --api-key-env or PRA_LLM_KEY_<SLOT> env var.")
@click.option("--api-key-env", default=None,
              help="Environment variable name containing the API key.")
def search_single_reference_llm_cmd(project_dir, reference_id, slot, provider,
                                     base_url, model, api_key, api_key_env):
    """Use LLM to identify a single unmatched reference.

    Searches the LLM's training knowledge for a specific reference and
    saves the result both to llm_search_single/ and (upserted into)
    references_searched_llm.json so viewer data picks it up.
    """
    from peer_review_assistant.llm import LLMProvider
    from peer_review_assistant.citations.search_references_llm import (
        search_single_reference_llm,
    )

    emit("progress", task="search-single-reference-llm", step="validate",
         percent=0, reference_id=reference_id, slot=slot)

    # Validate project
    proj_path = os.path.join(project_dir, "project.json")
    if not os.path.isfile(proj_path):
        error("NO_PROJECT", "project.json not found. Run init-project first.")

    refs_path = os.path.join(project_dir, "citations", "references_split.json")
    if not os.path.isfile(refs_path):
        error("NO_REFERENCES_SPLIT",
              "citations/references_split.json not found. "
              "Run extract-citations first.")

    # Resolve API key: 1. --api-key  2. --api-key-env  3. PRA_LLM_KEY_<SLOT>
    if not api_key and api_key_env:
        api_key = _get_env(api_key_env).strip()
    if not api_key:
        api_key = _get_env(f"PRA_LLM_KEY_{slot.upper()}").strip()
    if not api_key:
        error("NO_API_KEY",
              f"No API key provided. Use --api-key, --api-key-env, or set "
              f"PRA_LLM_KEY_{slot.upper()} environment variable.")

    emit("progress", task="search-single-reference-llm", step="calling_llm",
         percent=30, reference_id=reference_id, slot=slot, model=model)

    prov = LLMProvider(
        name=slot,
        provider=provider,
        base_url=base_url,
        model=model,
        api_key=api_key,
    )

    try:
        item = search_single_reference_llm(project_dir, reference_id, prov)
    except Exception as e:
        error("SEARCH_SINGLE_FAILED",
              f"Single-reference LLM search failed: {e}")

    emit("progress", task="search-single-reference-llm", step="saving",
         percent=80, reference_id=reference_id, slot=slot)

    # Log
    log_path = os.path.join(project_dir, "logs", "citation_db.log")
    now = datetime.now(JST).isoformat()
    log_entry = (
        f"[{now}] search-single-reference-llm ({slot}): "
        f"reference_id={reference_id}, "
        f"identified={item.get('identified', False)}, "
        f"confidence={item.get('confidence', 'none')}\n"
    )
    os.makedirs(os.path.dirname(log_path), exist_ok=True)
    with open(log_path, "a", encoding="utf-8") as lf:
        lf.write(log_entry)

    emit("done",
         task="search-single-reference-llm",
         reference_id=reference_id,
         slot=slot,
         identified=item.get("identified", False),
         confidence=item.get("confidence", "none"),
         message=f"LLM search for {reference_id} complete "
                 f"(identified={item.get('identified', False)}, "
                 f"confidence={item.get('confidence', 'none')})")


@main.command()
@click.option("--slot", required=True,
              help="LLM slot name (summary, reviewer1, reviewer2, reviewer3).")
@click.option("--provider", required=True,
              help="Provider name (e.g., openai, anthropic, deepseek, openrouter).")
@click.option("--base-url", required=True,
              help="Base URL for the chat completions endpoint.")
@click.option("--model", required=True,
              help="Model name (e.g., gpt-4o, claude-opus-4-7).")
@click.option("--api-key", default=None,
              help="API key. Falls back to --api-key-env or PRA_LLM_KEY_<SLOT> env var.")
@click.option("--api-key-env", default=None,
              help="Environment variable name containing the API key.")
@click.option("--thinking-enabled", is_flag=True, default=False,
              help="Enable thinking/reasoning mode (Moonshot/Kimi K2.6 etc.).")
@click.option("--temperature", type=float, default=None,
              help="Temperature (0.0-2.0). Kimi/Moonshot auto-normalized to 1.")
def test_llm(slot, provider, base_url, model, api_key, api_key_env, thinking_enabled, temperature):
    """Test connection to an LLM endpoint."""
    from peer_review_assistant.llm import LLMProvider, test_connection

    # Resolve API key: 1. --api-key  2. --api-key-env  3. PRA_LLM_KEY_<SLOT>  4. none
    if not api_key and api_key_env:
        api_key = _get_env(api_key_env).strip()
    if not api_key:
        api_key = _get_env(f"PRA_LLM_KEY_{slot.upper()}").strip()
    if not api_key:
        error("NO_API_KEY",
              f"No API key provided. Use --api-key, --api-key-env, or set "
              f"PRA_LLM_KEY_{slot.upper()} environment variable.")

    emit("progress", task="test-llm", step="connect", percent=30,
         slot=slot, provider=provider, model=model,
         thinking_enabled=thinking_enabled)

    prov = LLMProvider(
        name=slot,
        provider=provider,
        base_url=base_url,
        model=model,
        api_key=api_key,
    )

    result = test_connection(prov, thinking_enabled=thinking_enabled, temperature=temperature)

    if result["ok"]:
        has_reasoning = bool(result.get("reasoning_content"))
        emit("done",
             task="test-llm",
             slot=slot,
             model=result["model"],
             latency_ms=result["latency_ms"],
             response_sample=result["response_sample"],
             reasoning_content_present=has_reasoning,
             message=f"Connection to {slot} ({model}) successful.")
    else:
        emit("error",
             task="test-llm",
             slot=slot,
             code="LLM_CONNECTION_FAILED",
             message=result["error"] or "Unknown error",
             latency_ms=result.get("latency_ms"))


@main.command(name="test-pubmed")
@click.option("--api-key", default=None,
              help="NCBI API key. Falls back to --api-key-env or NCBI_API_KEY env var.")
@click.option("--api-key-env", default=None,
              help="Environment variable name containing the NCBI API key.")
@click.option("--email", default=None,
              help="Email address (NCBI recommends). Falls back to NCBI_EMAIL env var.")
@click.option("--email-env", default=None,
              help="Environment variable name containing the email.")
@click.option("--tool", default="peer-review-assistant",
              help="Tool name (default: peer-review-assistant).")
def test_pubmed_cmd(api_key, api_key_env, email, email_env, tool):
    """Test connection to PubMed / NCBI E-utilities API.

    Uses a lightweight ESearch query. The API key value is never logged.
    """
    import urllib.request
    import urllib.parse
    import urllib.error

    # Resolve API key: 1. --api-key  2. --api-key-env  3. NCBI_API_KEY
    resolved_key = api_key
    if not resolved_key and api_key_env:
        resolved_key = _get_env(api_key_env).strip()
    if not resolved_key:
        resolved_key = _get_env("NCBI_API_KEY").strip()

    # Resolve email: 1. --email  2. --email-env  3. NCBI_EMAIL
    resolved_email = email
    if not resolved_email and email_env:
        resolved_email = _get_env(email_env).strip()
    if not resolved_email:
        resolved_email = _get_env("NCBI_EMAIL").strip()

    # Resolve tool
    resolved_tool = tool

    emit("progress", task="test-pubmed", step="connect", percent=30,
         key_provided=bool(resolved_key),
         email_provided=bool(resolved_email),
         tool_provided=bool(resolved_tool))

    params = {
        "db": "pubmed",
        "term": "child maltreatment",
        "retmode": "json",
        "retmax": "1",
    }
    if resolved_key:
        params["api_key"] = resolved_key
    if resolved_email:
        params["email"] = resolved_email
    if resolved_tool:
        params["tool"] = resolved_tool

    url = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?" \
          + urllib.parse.urlencode(params)

    emit("progress", task="test-pubmed", step="request", percent=60)

    try:
        req = urllib.request.Request(url)
        with urllib.request.urlopen(req, timeout=30) as resp:
            body = resp.read().decode("utf-8")
            data = json.loads(body)
            count = data.get("esearchresult", {}).get("count", "0")
            emit("done",
                 task="test-pubmed",
                 status="ok",
                 result_count=count,
                 message=f"PubMed API connection OK "
                         f"(count={count}).")
    except urllib.error.HTTPError as e:
        if e.code == 401:
            emit("done", task="test-pubmed", status="error",
                 error_code=401,
                 message="PubMed API returned 401 Unauthorized. "
                         "Check your API key.")
        elif e.code == 403:
            emit("done", task="test-pubmed", status="error",
                 error_code=403,
                 message="PubMed API returned 403 Forbidden. "
                         "Check your API key permissions.")
        elif e.code == 429:
            emit("done", task="test-pubmed", status="error",
                 error_code=429,
                 message="PubMed API returned 429 Too Many Requests. "
                         "An API key may help increase the rate limit.")
        else:
            emit("done", task="test-pubmed", status="error",
                 error_code=e.code,
                 message=f"PubMed API returned HTTP {e.code}.")
    except (urllib.error.URLError, OSError) as e:
        emit("done", task="test-pubmed", status="error",
             error_code="network",
             message=f"Network error reaching PubMed API: {e}")
    except Exception as e:
        emit("done", task="test-pubmed", status="error",
             error_code="unknown",
             message=f"Unexpected error: {e}")


@main.command(name="test-semantic-scholar")
@click.option("--api-key", default=None,
              help="Semantic Scholar API key. Falls back to --api-key-env or SEMANTIC_SCHOLAR_API_KEY env var.")
@click.option("--api-key-env", default=None,
              help="Environment variable name containing the Semantic Scholar API key.")
def test_semantic_scholar_cmd(api_key, api_key_env):
    """Test connection to Semantic Scholar API.

    Uses a lightweight paper search query. The API key value is never logged.
    """
    import urllib.request
    import urllib.parse
    import urllib.error

    # Resolve API key: 1. --api-key  2. --api-key-env  3. SEMANTIC_SCHOLAR_API_KEY
    resolved_key = api_key
    if not resolved_key and api_key_env:
        resolved_key = _get_env(api_key_env).strip()
    if not resolved_key:
        resolved_key = _get_env("SEMANTIC_SCHOLAR_API_KEY").strip()

    emit("progress", task="test-semantic-scholar", step="connect", percent=30,
         key_provided=bool(resolved_key))

    # Lightweight search for a known paper
    params = {"query": "attention is all you need", "limit": "1",
              "fields": "title"}
    url = "https://api.semanticscholar.org/graph/v1/paper/search?" \
          + urllib.parse.urlencode(params)

    emit("progress", task="test-semantic-scholar", step="request", percent=60)

    try:
        req = urllib.request.Request(url)
        req.add_header("User-Agent", "PeerReviewAssistant/0.1")
        if resolved_key:
            req.add_header("x-api-key", resolved_key)
        with urllib.request.urlopen(req, timeout=30) as resp:
            body = resp.read().decode("utf-8")
            data = json.loads(body)
            total = data.get("total", 0)
            emit("done",
                 task="test-semantic-scholar",
                 status="ok",
                 total_results=total,
                 message=f"Semantic Scholar API connection OK "
                         f"(total={total}).")
    except urllib.error.HTTPError as e:
        if e.code == 401:
            emit("done", task="test-semantic-scholar", status="error",
                 error_code=401,
                 message="Semantic Scholar API returned 401 Unauthorized. "
                         "Check your API key.")
        elif e.code == 403:
            emit("done", task="test-semantic-scholar", status="error",
                 error_code=403,
                 message="Semantic Scholar API returned 403 Forbidden. "
                         "Check your API key permissions.")
        elif e.code == 429:
            emit("done", task="test-semantic-scholar", status="error",
                 error_code=429,
                 message="Semantic Scholar API returned 429 Too Many Requests. "
                         "An API key may help increase the rate limit.")
        else:
            emit("done", task="test-semantic-scholar", status="error",
                 error_code=e.code,
                 message=f"Semantic Scholar API returned HTTP {e.code}.")
    except (urllib.error.URLError, OSError) as e:
        emit("done", task="test-semantic-scholar", status="error",
             error_code="network",
             message=f"Network error reaching Semantic Scholar API: {e}")
    except Exception as e:
        emit("done", task="test-semantic-scholar", status="error",
             error_code="unknown",
             message=f"Unexpected error: {e}")


@main.command(name="test-db")
@click.option("--db", "db_name", required=True,
              help="Database to test (e.g., pubmed).")
@click.option("--query", default="cancer",
              help="Test query term (default: cancer).")
def test_db_cmd(db_name, query):
    """Test connection to an external database (e.g., PubMed)."""
    import urllib.request
    import urllib.parse
    import urllib.error

    if db_name != "pubmed":
        error("UNSUPPORTED_DB",
              f"Database '{db_name}' is not supported. "
              "Currently supported: pubmed.")

    # --- read credentials from environment ---
    api_key = _get_env("NCBI_API_KEY").strip()
    email = _get_env("NCBI_EMAIL").strip()
    tool = _get_env("NCBI_TOOL").strip()

    if not api_key:
        error("NCBI_API_KEY_MISSING",
              "NCBI_API_KEY environment variable is not set. "
              "Set it to your NCBI API key to use PubMed.")

    warnings = []
    if not email:
        warnings.append("NCBI_EMAIL is not set; NCBI recommends including an "
                        "email for better service.")
    if not tool:
        warnings.append("NCBI_TOOL is not set; NCBI recommends including a "
                        "tool name.")

    emit("progress", task="test-db", step="connect", percent=30,
         db=db_name,
         key_provided=True,
         email_provided=bool(email),
         tool_provided=bool(tool))

    # --- build request URL (api_key never logged) ---
    params = {
        "db": "pubmed",
        "term": query,
        "retmode": "json",
        "retmax": "1",
        "api_key": api_key,
    }
    if email:
        params["email"] = email
    if tool:
        params["tool"] = tool

    url = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?" \
          + urllib.parse.urlencode(params)

    # --- make the request ---
    emit("progress", task="test-db", step="request", percent=60,
         db=db_name, query=query)

    try:
        req = urllib.request.Request(url)
        with urllib.request.urlopen(req, timeout=30) as resp:
            body = resp.read().decode("utf-8")
    except urllib.error.HTTPError as e:
        emit("progress", task="test-db", step="request", percent=60,
             db=db_name, query=query, http_status=e.code)
        error("PUBMED_REQUEST_FAILED",
              f"PubMed API returned HTTP {e.code}: {e.reason}")
    except urllib.error.URLError as e:
        emit("progress", task="test-db", step="request", percent=60,
             db=db_name, query=query)
        error("PUBMED_TIMEOUT",
              f"PubMed API request failed: {e.reason}")

    # --- parse response ---
    emit("progress", task="test-db", step="parse", percent=80,
         db=db_name)

    try:
        data = json.loads(body)
    except json.JSONDecodeError as e:
        error("PUBMED_INVALID_RESPONSE",
              f"Failed to parse PubMed response as JSON: {e}")

    esearchresult = data.get("esearchresult", {})
    result_count = int(esearchresult.get("count", 0))
    idlist = esearchresult.get("idlist", [])
    sample_pmid = idlist[0] if idlist else None

    if result_count == 0 and not idlist:
        error("PUBMED_INVALID_RESPONSE",
              f"PubMed response contained no results. "
              f"Raw keys: {list(data.keys())}")

    # --- success ---
    extra = {}
    if warnings:
        extra["warnings"] = warnings

    emit("done",
         task="test-db",
         db=db_name,
         ok=True,
         result_count=result_count,
         sample_pmid=sample_pmid,
         key_provided=True,
         **extra)


_VALID_CHECKS = {"structure", "expression", "methods_stats", "logic_argument", "figure_table", "ethics"}


@main.command()
@click.option("--project", "project_dir", required=True,
              type=click.Path(file_okay=False, writable=True),
              help="Path to the project working folder.")
@click.option("--check", "check_name", required=True,
              help="Check type. Currently only 'structure' is supported.")
@click.option("--slot", required=True,
              help="LLM slot name (summary, reviewer1, reviewer2, reviewer3).")
@click.option("--provider", required=True,
              help="Provider name (e.g., openai, deepseek).")
@click.option("--base-url", required=True,
              help="Base URL for the chat completions endpoint.")
@click.option("--model", required=True,
              help="Model name.")
@click.option("--api-key", default=None,
              help="API key. Falls back to --api-key-env or PRA_LLM_KEY_<SLOT> env var.")
@click.option("--api-key-env", default=None,
              help="Environment variable name containing the API key.")
@click.option("--thinking-enabled", is_flag=True, default=False,
              help="Enable reasoning/thinking mode (DeepSeek/OpenAI reasoning models).")
@click.option("--temperature", type=float, default=None,
              help="LLM temperature (Kimi/Moonshot requires 1.0).")
def run_check(project_dir, check_name, slot, provider, base_url, model, api_key, api_key_env,
              thinking_enabled, temperature):
    """Run an LLM review check on the manuscript."""
    from peer_review_assistant.llm import LLMProvider, chat_completion
    from peer_review_assistant.llm.prompts import (
        build_structure_check_messages,
        build_expression_check_messages,
        build_methods_stats_check_messages,
        build_logic_argument_check_messages,
        build_figure_table_check_messages,
        build_ethics_check_messages,
        get_provider_system_hints,
    )
    from peer_review_assistant.llm.json_repair import parse_llm_json
    from peer_review_assistant.preprocess.section_normalizer import normalize_sections

    emit("progress", task="run-check", step="validate", percent=0,
         check=check_name, slot=slot)

    # Gate: only structure check is implemented (check before project for fast failure)
    if check_name not in _VALID_CHECKS:
        error("CHECK_NOT_IMPLEMENTED",
              f"Check '{check_name}' is not implemented. "
              f"Available: {', '.join(sorted(_VALID_CHECKS))}")

    # Validate project
    proj_path = os.path.join(project_dir, "project.json")
    if not os.path.isfile(proj_path):
        error("NO_PROJECT", "project.json not found. Run init-project first.")

    # Resolve API key: 1. --api-key  2. --api-key-env  3. PRA_LLM_KEY_<SLOT>
    if not api_key and api_key_env:
        api_key = _get_env(api_key_env).strip()
    if not api_key:
        api_key = _get_env(f"PRA_LLM_KEY_{slot.upper()}").strip()
    if not api_key:
        error("NO_API_KEY",
              f"No API key provided. Use --api-key, --api-key-env, or set "
              f"PRA_LLM_KEY_{slot.upper()} environment variable.")

    key_info = "key=provided" if api_key else "key=missing"

    # Load inputs
    emit("progress", task="run-check", step="load_inputs", percent=20,
         check=check_name, slot=slot)

    manuscript_path = os.path.join(project_dir, "manuscript_full.json")
    if not os.path.isfile(manuscript_path):
        error("NO_MANUSCRIPT_JSON",
              "manuscript_full.json not found. Run preprocess-docx first.")

    with open(manuscript_path, "r", encoding="utf-8") as f:
        manuscript_data = json.load(f)

    # Load section_map for hierarchy info (before section_texts for fallback)
    section_map = None
    section_map_path = os.path.join(project_dir, "sections", "section_map.json")
    if os.path.isfile(section_map_path):
        with open(section_map_path, "r", encoding="utf-8") as f:
            section_map = json.load(f)

    # Load section texts with aggregated fallback for empty parent sections
    section_texts = {}
    sections_dir = os.path.join(project_dir, "sections")
    section_names = ["abstract", "introduction", "aim_objective", "methods",
                     "results", "discussion", "conclusion"]
    for name in section_names:
        path = os.path.join(sections_dir, f"{name}.txt")
        content = None
        if os.path.isfile(path):
            with open(path, "r", encoding="utf-8") as f:
                content = f.read().strip()
        if content:
            section_texts[name] = content
        elif section_map:
            # Individual .txt is empty or missing — try aggregated fallback
            sec_entry = next(
                (s for s in section_map.get("sections", [])
                 if s["name"] == name),
                None
            )
            if sec_entry and sec_entry.get("has_subsections"):
                agg_rel = sec_entry.get("aggregated_text_path")
                if agg_rel:
                    agg_abs = os.path.join(project_dir, agg_rel)
                    if os.path.isfile(agg_abs):
                        with open(agg_abs, "r", encoding="utf-8") as af:
                            agg_content = af.read().strip()
                            if agg_content:
                                section_texts[name] = agg_content

    # Load journal profile if available (for journal-aware prompts)
    journal_profile = None
    jp_path = os.path.join(project_dir, "journal_profile.json")
    if os.path.isfile(jp_path):
        try:
            with open(jp_path, "r", encoding="utf-8") as f:
                journal_profile = json.load(f)
        except (json.JSONDecodeError, OSError):
            pass

    # Load novelty assessment data for prior-research-aware review checks
    novelty_data = None
    novelty_dir = os.path.join(project_dir, "outputs", "novelty")
    summary_path = os.path.join(novelty_dir, "novelty_summary.json")
    assessment_path = os.path.join(novelty_dir, "novelty_assessment.md")
    if os.path.isfile(summary_path):
        try:
            with open(summary_path, "r", encoding="utf-8") as f:
                novelty_summary = json.load(f)
            novelty_data = {"summary": novelty_summary}
            if os.path.isfile(assessment_path):
                with open(assessment_path, "r", encoding="utf-8") as f:
                    novelty_data["assessment"] = f.read()
        except (json.JSONDecodeError, OSError):
            pass  # Graceful fallback: run without novelty context

    # Load methods/stats merged findings for logic_argument dedup
    methods_stats_context = None
    if check_name == "logic_argument":
        ms_merged_path = os.path.join(project_dir, "outputs", "methods_stats", "merged.section.json")
        if os.path.isfile(ms_merged_path):
            try:
                with open(ms_merged_path, "r", encoding="utf-8") as f:
                    ms_merged = json.load(f)
                ms_comments = ms_merged.get("comments", [])
                if ms_comments:
                    lines = []
                    for c in ms_comments:
                        sev = c.get("severity", "minor")
                        cat = c.get("category", "")
                        iss = c.get("issue", "")
                        loc = c.get("location", {})
                        sec = loc.get("section", "") if loc else ""
                        # Build a one-line summary for each finding
                        parts = [f"- [{sev.upper()}]"]
                        if cat:
                            parts.append(f"({cat})")
                        if sec:
                            parts.append(f"@{sec}")
                        parts.append(iss)
                        lines.append(" ".join(parts))
                    methods_stats_context = "\n".join(lines)
                    # Truncate to avoid blowing up the prompt
                    if len(methods_stats_context) > 5000:
                        methods_stats_context = methods_stats_context[:5000] + "\n...(truncated)"
            except (json.JSONDecodeError, OSError):
                pass  # Graceful fallback

    # Normalize section headings using journal-specific aliases and rules
    normalized_sections = normalize_sections(section_map, journal_profile)

    # Extract supplemental file texts for figure_table check
    supplemental_texts = None
    if check_name == "figure_table":
        supp_dir = os.path.join(project_dir, "source", "supplemental")
        if os.path.isdir(supp_dir):
            supplemental_texts = {}
            for fname in os.listdir(supp_dir):
                fpath = os.path.join(supp_dir, fname)
                if not os.path.isfile(fpath):
                    continue
                try:
                    ext = os.path.splitext(fname)[1].lower()
                    if ext == ".docx":
                        from peer_review_assistant.preprocess import extract_docx_text
                        doc = extract_docx_text(fpath)
                        text = "\n".join(p["text"] for p in doc.get("paragraphs", []))
                        supplemental_texts[fname] = text
                    elif ext == ".pdf":
                        import fitz
                        doc = fitz.open(fpath)
                        text = "\n".join(page.get_text() for page in doc)
                        doc.close()
                        supplemental_texts[fname] = text
                    elif ext in (".png", ".jpg", ".jpeg", ".gif", ".bmp", ".tiff", ".tif"):
                        size_kb = os.path.getsize(fpath) // 1024
                        supplemental_texts[fname] = f"[Image file: {fname} ({size_kb} KB) — visual quality cannot be assessed from text alone]"
                    else:
                        size_kb = os.path.getsize(fpath) // 1024
                        supplemental_texts[fname] = f"[File: {fname} ({size_kb} KB, type: {ext}) — text extraction not supported]"
                except Exception:
                    supplemental_texts[fname] = f"[Error extracting text from {fname}]"

    # Load ethics-relevant sections for the ethics check (COI, funding, etc.)
    if check_name == "ethics":
        for name in ["conflict_of_interest", "funding", "acknowledgments",
                     "author_contributions", "data_and_code_availability"]:
            if name not in section_texts:
                path = os.path.join(sections_dir, f"{name}.txt")
                if os.path.isfile(path):
                    with open(path, "r", encoding="utf-8") as f:
                        content = f.read().strip()
                    if content:
                        section_texts[name] = content

    # Build prompt
    emit("progress", task="run-check", step="building_prompt", percent=40,
         check=check_name, slot=slot)

    if check_name == "expression":
        # ── Split expression check: process manuscript in 2 parts to avoid
        #     token limits, then combine findings ──
        part_a_sections = ["abstract", "introduction", "aim_objective", "methods"]
        part_b_sections = ["results", "discussion", "conclusion"]

        section_texts_a = {k: v for k, v in section_texts.items() if k in part_a_sections}
        section_texts_b = {k: v for k, v in section_texts.items() if k in part_b_sections}

        all_findings = []
        combined_summary_parts = []
        part_results = []

        for part_label, part_texts in [("A", section_texts_a), ("B", section_texts_b)]:
            if not part_texts:
                continue
            emit("log", message=f"  [split] expression Part {part_label}: "
                 f"sections={list(part_texts.keys())}")

            part_messages = build_expression_check_messages(
                manuscript_data, part_texts, section_map,
                journal_profile=journal_profile)

            # Inject provider-specific hints for LLMs with tokenizer limitations
            provider_hints = get_provider_system_hints(provider)
            if provider_hints:
                part_messages[0]["content"] += provider_hints

            prov = LLMProvider(name=slot, provider=provider, base_url=base_url,
                               model=model, api_key=api_key)
            is_kimi = ("kimi" in provider.lower() or "moonshot" in provider.lower()
                       or "moonshot.ai" in base_url.lower())
            if thinking_enabled or is_kimi:
                timeout = 900
                max_tokens = 24576
            else:
                timeout = 600
                max_tokens = 16384

            part_result = None
            for attempt in range(2):
                part_result = chat_completion(prov, part_messages,
                                              max_tokens=max_tokens,
                                              temperature=temperature,
                                              timeout_seconds=timeout,
                                              thinking_enabled=thinking_enabled)
                if part_result["ok"]:
                    break
                err_msg = part_result.get("error", "")
                if "timeout" in str(err_msg).lower() or "timed out" in str(err_msg).lower():
                    if attempt == 0:
                        emit("progress", task="run-check", step="retrying",
                             percent=60, check=check_name, slot=slot,
                             message=f"Part {part_label} timeout, retrying...")
                        continue
                break

            if not part_result["ok"]:
                emit("log", message=f"  [split] Part {part_label} FAILED: "
                     f"{part_result.get('error', 'Unknown')}")
                continue

            part_parsed = parse_llm_json(part_result["content"])
            if part_parsed is None:
                _save_failed_response(project_dir, f"{check_name}_part{part_label}",
                                      slot, model,
                                      part_result.get("content", ""),
                                      part_result.get("usage", {}))
                emit("log", message=f"  [split] Part {part_label} JSON parse failed, "
                     f"raw response saved")
                continue

            part_findings = part_parsed.get("findings", [])
            for f in part_findings:
                if "finding_id" not in f:
                    f["finding_id"] = f"{check_name}_{slot}_{len(all_findings) + 1:03d}"
            all_findings.extend(part_findings)
            if part_parsed.get("summary"):
                combined_summary_parts.append(part_parsed["summary"])
            part_results.append(part_result)
            emit("log", message=f"  [split] Part {part_label}: {len(part_findings)} findings, "
                 f"latency={part_result.get('latency_ms', '?')}ms")

        if not all_findings:
            _log_llm_call(project_dir, slot, check_name, model, key_info,
                          success=False, error="LLM_INVALID_JSON",
                          latency_ms=None)
            error("LLM_INVALID_JSON",
                  "Expression check: all split parts failed to produce valid JSON.")

        # Use last successful result's metadata for logging
        last_result = part_results[-1] if part_results else {}
        emit("progress", task="run-check", step="parsing_response", percent=80,
             check=check_name, slot=slot,
             latency_ms=sum(r.get("latency_ms", 0) for r in part_results),
             usage=last_result.get("usage"))

        # Build combined parsed result
        parsed = {
            "summary": "\n\n".join(combined_summary_parts),
            "findings": all_findings,
        }
        # Use the combined findings with the logging function
        emit("log", message=f"  [split] expression combined: {len(all_findings)} total findings "
             f"(from {len(part_results)} parts)")

    elif check_name == "methods_stats":
        messages = build_methods_stats_check_messages(manuscript_data, section_texts, section_map, journal_profile=journal_profile, novelty_data=novelty_data)
    elif check_name == "logic_argument":
        messages = build_logic_argument_check_messages(manuscript_data, section_texts, section_map, journal_profile=journal_profile, novelty_data=novelty_data, methods_stats_context=methods_stats_context)
    elif check_name == "figure_table":
        messages = build_figure_table_check_messages(manuscript_data, section_texts, section_map, journal_profile=journal_profile, supplemental_texts=supplemental_texts)
    elif check_name == "ethics":
        messages = build_ethics_check_messages(manuscript_data, section_texts, section_map, journal_profile=journal_profile)
    else:
        messages = build_structure_check_messages(manuscript_data, section_texts, section_map, journal_profile=journal_profile, normalized_sections=normalized_sections, novelty_data=novelty_data)

    # ── Call LLM (skip for expression — handled in split logic above) ──
    if check_name != "expression":
        emit("progress", task="run-check", step="calling_llm", percent=60,
             check=check_name, slot=slot, model=model, provider=provider)

        prov = LLMProvider(
            name=slot,
            provider=provider,
            base_url=base_url,
            model=model,
            api_key=api_key,
        )

        # Inject provider-specific hints for LLMs with tokenizer limitations
        provider_hints = get_provider_system_hints(provider)
        if provider_hints:
            messages[0]["content"] += provider_hints

        # Set timeout and max_tokens. When thinking is enabled, reasoning tokens
        # consume part of the max_tokens budget on OpenAI-compatible APIs (kimi,
        # deepseek) and generation takes longer, so we need more of both.
        # Kimi/Moonshot is especially slow — use extended timeouts.
        is_kimi = ("kimi" in provider.lower() or "moonshot" in provider.lower()
                   or "moonshot.ai" in base_url.lower())
        if thinking_enabled or is_kimi:
            timeout = 900   # thinking + kimi models need generous time
            max_tokens = 24576  # room for both reasoning (~13k) and JSON output (~11k)
        else:
            timeout = 600
            max_tokens = 16384

        # Retry once on timeout/connection failure (common with Kimi/slow providers)
        result = None
        for attempt in range(2):
            result = chat_completion(prov, messages, max_tokens=max_tokens, temperature=temperature,
                                     timeout_seconds=timeout, thinking_enabled=thinking_enabled)
            if result["ok"]:
                break
            err_msg = result.get("error", "")
            if "timeout" in str(err_msg).lower() or "timed out" in str(err_msg).lower():
                if attempt == 0:
                    emit("progress", task="run-check", step="retrying", percent=60,
                         check=check_name, slot=slot,
                         message=f"Timeout, retrying (attempt {attempt + 2}/2)...")
                    continue
            break

        if not result["ok"]:
            _log_llm_call(project_dir, slot, check_name, model, key_info,
                          success=False, error=result.get("error"), latency_ms=result.get("latency_ms"))
            error("LLM_CONNECTION_FAILED",
                  f"LLM call failed for {slot}: {result.get('error', 'Unknown error')}")

        emit("progress", task="run-check", step="parsing_response", percent=80,
             check=check_name, slot=slot,
             latency_ms=result.get("latency_ms"),
             usage=result.get("usage"))

        # Parse JSON response
        parsed = parse_llm_json(result["content"])
        if parsed is None:
            _log_llm_call(project_dir, slot, check_name, model, key_info,
                          success=False, error="LLM_INVALID_JSON", latency_ms=result.get("latency_ms"))
            # Save raw response for debugging
            _save_failed_response(project_dir, check_name, slot, model,
                                  result.get("content", ""),
                                  result.get("usage", {}))
            error("LLM_INVALID_JSON",
                  "Failed to parse LLM response as JSON. The model may not have returned valid JSON.")
    else:
        # expression: result is set from the split logic above
        result = last_result

    # Build output
    now = datetime.now(JST)
    findings = parsed.get("findings", [])
    for i, finding in enumerate(findings):
        if "finding_id" not in finding:
            finding["finding_id"] = f"{check_name}_{slot}_{i + 1:03d}"

    # Extract reasoning_tokens from usage for frontend display
    usage = result.get("usage") or {}
    reasoning_tokens = (
        usage.get("completion_tokens_details", {}).get("reasoning_tokens", 0)
        if isinstance(usage, dict) else 0
    )

    output = {
        "check_name": check_name,
        "source": slot,
        "status": "done",
        "generated_at": now.isoformat(),
        "model": result.get("model"),
        "thinking_enabled": thinking_enabled,
        "reasoning_tokens": reasoning_tokens,
        "summary": parsed.get("summary", ""),
        "findings": findings,
    }

    # Save output
    emit("progress", task="run-check", step="save_output", percent=90,
         check=check_name, slot=slot)

    out_dir = os.path.join(project_dir, "outputs", check_name)
    os.makedirs(out_dir, exist_ok=True)
    out_path = os.path.join(out_dir, f"{slot}.raw.json")
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(output, f, indent=2, ensure_ascii=False)

    # Update task_status.json
    status_path = os.path.join(project_dir, "status", "task_status.json")
    if os.path.isfile(status_path):
        with open(status_path, "r", encoding="utf-8") as f:
            task_status = json.load(f)
        task_status.setdefault("checks", {}).setdefault(check_name, {})[slot] = "done"
        with open(status_path, "w", encoding="utf-8") as f:
            json.dump(task_status, f, indent=2, ensure_ascii=False)

    # Log LLM call
    _log_llm_call(project_dir, slot, check_name, model, key_info,
                  success=True, latency_ms=result.get("latency_ms"),
                  usage=result.get("usage"))

    # Update project.json timestamp
    with open(proj_path, "r", encoding="utf-8") as f:
        proj = json.load(f)
    proj["updated_at"] = now.isoformat()
    with open(proj_path, "w", encoding="utf-8") as f:
        json.dump(proj, f, indent=2, ensure_ascii=False)

    finding_count = len(findings)
    emit("done",
         task="run-check",
         check=check_name,
         slot=slot,
         model=result.get("model"),
         finding_count=finding_count,
         latency_ms=result.get("latency_ms"),
         message=f"{check_name.title()} check complete ({finding_count} findings).")


def _log_llm_call(project_dir, slot, check_name, model, key_info,
                  success, error=None, latency_ms=None, usage=None):
    """Append a timestamped entry to logs/llm_calls.log. Never logs API key."""
    log_path = os.path.join(project_dir, "logs", "llm_calls.log")
    now = datetime.now(JST).isoformat()
    status = "ok" if success else f"failed: {error}"
    usage_str = ""
    if usage:
        usage_str = (f" prompt_tokens={usage.get('prompt_tokens', '?')}"
                     f" completion_tokens={usage.get('completion_tokens', '?')}"
                     f" total_tokens={usage.get('total_tokens', '?')}")
    latency_str = f" latency={latency_ms}ms" if latency_ms else ""
    entry = (f"[{now}] run-check slot={slot} check={check_name} "
             f"model={model} {key_info} {status}{latency_str}{usage_str}\n")
    os.makedirs(os.path.dirname(log_path), exist_ok=True)
    with open(log_path, "a", encoding="utf-8") as f:
        f.write(entry)


def _save_failed_response(project_dir, check_name, slot, model, raw_content, usage):
    """Save raw LLM response to disk when JSON parsing fails, for debugging."""
    ts = datetime.now(JST).strftime("%Y%m%d_%H%M%S")
    filename = f"failed_{check_name}_{slot}_{model}_{ts}.txt"
    out_dir = os.path.join(project_dir, "logs", "failed_responses")
    os.makedirs(out_dir, exist_ok=True)
    out_path = os.path.join(out_dir, filename)
    with open(out_path, "w", encoding="utf-8") as f:
        f.write(f"# Failed JSON parse — {check_name} / {slot} / {model}\n")
        f.write(f"# Timestamp: {datetime.now(JST).isoformat()}\n")
        if usage:
            f.write(f"# Usage: prompt={usage.get('prompt_tokens','?')} "
                    f"completion={usage.get('completion_tokens','?')} "
                    f"total={usage.get('total_tokens','?')}\n")
        f.write(f"# Raw content length: {len(raw_content) if raw_content else 0} chars\n")
        f.write("# " + "=" * 60 + "\n\n")
        f.write(raw_content if raw_content else "(empty)")
    emit("log", message=f"  [debug] saved raw response → logs/failed_responses/{filename}")


@main.command(name="translate-check-result")
@click.option("--project", "project_dir", required=True,
              type=click.Path(file_okay=False, writable=True),
              help="Path to the project working folder.")
@click.option("--check", "check_name", required=True,
              type=click.Choice(["structure", "expression", "methods_stats", "logic_argument", "figure_table", "ethics"]),
              help="Check type.")
@click.option("--slot", required=True,
              help="LLM slot name (reviewer1, reviewer2, reviewer3).")
@click.option("--provider", required=True,
              help="LLM provider (e.g., openai, deepseek).")
@click.option("--base-url", required=True,
              help="LLM API base URL.")
@click.option("--model", required=True,
              help="LLM model name (use a fast/cheap model for translation).")
@click.option("--api-key", default=None,
              help="API key. Falls back to --api-key-env or PRA_LLM_KEY_<SLOT> env var.")
@click.option("--api-key-env", default=None,
              help="Environment variable name containing the API key.")
def translate_check_result(project_dir, check_name, slot, provider, base_url, model,
                           api_key, api_key_env):
    """Translate a check result (summary + findings) from English to Japanese."""
    from peer_review_assistant.llm import LLMProvider, chat_completion
    from peer_review_assistant.llm.json_repair import parse_llm_json

    emit("progress", task="translate-check", step="validate", percent=0,
         check=check_name, slot=slot)

    # Resolve API key
    if not api_key and api_key_env:
        api_key = _get_env(api_key_env).strip()
    if not api_key:
        api_key = _get_env(f"PRA_LLM_KEY_{slot.upper()}").strip()
    if not api_key:
        error("NO_API_KEY",
              f"No API key provided for translation.")

    # Load check result
    if slot == "merged":
        src_path = os.path.join(project_dir, "outputs", check_name, "merged.section.json")
    else:
        src_path = os.path.join(project_dir, "outputs", check_name, f"{slot}.raw.json")
    if not os.path.isfile(src_path):
        error("NO_CHECK_RESULT",
              f"Check result not found: {src_path}. Run the check first.")

    with open(src_path, "r", encoding="utf-8") as f:
        result = json.load(f)

    if slot == "merged":
        summary = result.get("summary", "")
        findings = result.get("comments", [])
        # Remap merged JSON fields to match individual raw.json schema
        for ci in findings:
            ci["finding_id"] = ci.get("comment_id", "")
            ci["suggested_comment"] = ci.get("suggested_author_comment", "")
    else:
        summary = result.get("summary", "")
        findings = result.get("findings", [])

    # Build compact translation payload: only translate summary + issue + comment
    items_to_translate = []
    if summary.strip():
        items_to_translate.append({"kind": "summary", "text": summary})
    for fi in findings:
        items_to_translate.append({
            "kind": "finding",
            "finding_id": fi.get("finding_id", ""),
            "issue": fi.get("issue", ""),
            "suggested_comment": fi.get("suggested_comment", ""),
        })

    if not items_to_translate:
        emit("done", task="translate-check", check=check_name, slot=slot,
             translated=False, message="Nothing to translate.")
        return

    emit("progress", task="translate-check", step="calling_llm", percent=50,
         check=check_name, slot=slot, item_count=len(items_to_translate))

    system_prompt = (
        "You are a professional academic translator. "
        "Translate the following peer review content from English to Japanese. "
        "Use formal academic Japanese appropriate for scholarly peer review. "
        "Preserve technical terms accurately. "
        "Respond ONLY with a JSON object in this exact format:\n"
        '{"translated":[{"kind":"summary","text_ja":"..."},'
        '{"kind":"finding","finding_id":"...","issue_ja":"..."}]}'
    )

    user_msg = "Translate these peer review items to Japanese:\n\n"
    for item in items_to_translate:
        if item["kind"] == "summary":
            user_msg += f"[SUMMARY]\n{item['text']}\n\n"
        else:
            user_msg += (
                f"[FINDING {item['finding_id']}]\n"
                f"ISSUE: {item['issue']}\n\n"
            )

    prov = LLMProvider(name=slot, provider=provider, base_url=base_url, model=model, api_key=api_key)
    llm_result = chat_completion(prov, [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_msg},
    ], max_tokens=16384, temperature=0.0, timeout_seconds=300)

    if not llm_result["ok"]:
        error("LLM_CONNECTION_FAILED",
              f"Translation LLM call failed: {llm_result.get('error', 'Unknown error')}")

    emit("progress", task="translate-check", step="parsing", percent=80,
         check=check_name, slot=slot)

    parsed = parse_llm_json(llm_result["content"])
    if parsed is None:
        error("LLM_INVALID_JSON", "Failed to parse translation response as JSON.")

    translated_items = parsed.get("translated", [])

    # Build output matching source structure
    summary_ja = ""
    findings_ja = []
    for ti in translated_items:
        if ti.get("kind") == "summary":
            summary_ja = ti.get("text_ja", "")
        elif ti.get("kind") == "finding":
            findings_ja.append({
                "finding_id": ti.get("finding_id", ""),
                "issue_ja": ti.get("issue_ja", ""),
            })

    output = {
        "check_name": check_name,
        "source": slot,
        "translated_at": datetime.now(JST).isoformat(),
        "model": llm_result.get("model"),
        "summary_ja": summary_ja,
        "findings_ja": findings_ja,
    }

    # Save translation
    out_dir = os.path.join(project_dir, "outputs", check_name)
    os.makedirs(out_dir, exist_ok=True)
    out_path = os.path.join(out_dir, f"{slot}.translation.json")
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(output, f, indent=2, ensure_ascii=False)

    emit("done",
         task="translate-check",
         check=check_name,
         slot=slot,
         model=llm_result.get("model"),
         translated_count=len(findings_ja),
         latency_ms=llm_result.get("latency_ms"),
         message=f"Translation complete ({len(findings_ja)} findings translated).")


def _normalize_for_matching(text: str) -> str:
    """Collapse whitespace and remove spaces around common special chars.

    Handles mismatches like "81.3 %" vs "81.3%" between the text_excerpt
    stored in merged.section.json and the PDF-extracted body text.
    Also normalises hyphens so "cross-species" and "cross species" match.
    """
    import re
    # Collapse all whitespace sequences to a single space
    text = re.sub(r'\s+', ' ', text.strip())
    # Normalise hyphens: replace hyphen with space (so "cross-species" ↔ "cross species")
    text = text.replace('-', ' ')
    # Remove spaces before percent/permille/degree signs
    text = re.sub(r'\s+([%‰°])', r'\1', text)
    # Remove spaces around comparison/equality operators
    text = re.sub(r'\s*([<>=±])\s*', r'\1', text)
    # Remove spaces before trailing punctuation
    text = re.sub(r'\s+(?=[,.;:)])', '', text)
    # Collapse again after hyphen→space replacement
    text = re.sub(r'\s+', ' ', text.strip())
    return text


def _find_line_for_excerpt(target: str, line_map: dict) -> tuple[int | None, str]:
    """Find the PDF line number where target appears, using progressive
    word N-gram search across the FULL excerpt (not just prefixes).

    Pipeline:
    1. 8-word → 5-word → 3-word consecutive N-gram exact substring match
    2. If all fail: word-overlap fallback (find body line with most
       excerpt words in common, min 2-word overlap required)

    Returns (line_number, method) where method is "ngram", "overlap(N)", or
    (None, "none") if no match found.
    """
    words = _normalize_for_matching(target).split()
    if not words:
        return None, "none"

    # ── Phase 0: short text (1-2 words) — exact phrase match ──
    if len(words) <= 2:
        phrase = " ".join(words)
        for lnum, info in line_map.items():
            if phrase in info["normalized"]:
                return lnum, "short"
        # For 1-word: also try case-insensitive substring in raw text
        if len(words) == 1:
            w = words[0].lower()
            for lnum, info in line_map.items():
                if w in info["normalized"].lower():
                    return lnum, "short"
        return None, "none"

    # ── Phase 1: progressive N-gram exact match ──
    for window_size in (8, 5, 3):
        if len(words) < window_size:
            continue
        for i in range(len(words) - window_size + 1):
            phrase = " ".join(words[i:i + window_size])
            for lnum, info in line_map.items():
                if phrase in info["normalized"]:
                    return lnum, "ngram"

    # ── Phase 2: word-overlap fallback ──
    # Count how many unique excerpt words appear in each body line.
    # Return the earliest line with the highest overlap (min 2 words).
    excerpt_word_set = set(words)
    best_lnum = None
    best_overlap = 1  # require at least 2 words
    for lnum, info in line_map.items():
        line_words = set(info["normalized"].split())
        overlap = len(excerpt_word_set & line_words)
        if overlap > best_overlap:
            best_overlap = overlap
            best_lnum = lnum
    if best_lnum is not None:
        return best_lnum, f"overlap({best_overlap})"
    return None, "none"


@main.command(name="get-line-numbers")
@click.option("--project", "project_dir", required=True,
              type=click.Path(file_okay=False, writable=True),
              help="Path to the project working folder.")
def get_line_numbers(project_dir):
    """Map paragraph numbers to PDF line numbers using the line-numbered PDF.

    Uses PyMuPDF word-level extraction to detect line numbers in the left
    margin and match them to body text.  Then searches each text_excerpt
    from merged.section.json against the body text to find the exact line
    number(s) where the excerpt appears.
    """
    import fitz
    from collections import defaultdict

    emit("progress", task="get-line-numbers", step="validate", percent=0)

    # ── Load project config ──
    proj_path = os.path.join(project_dir, "project.json")
    if not os.path.isfile(proj_path):
        error("NO_PROJECT", "project.json not found.")
    with open(proj_path, "r", encoding="utf-8") as f:
        proj = json.load(f)

    pdf_rel = (proj.get("source") or {}).get("pdf_path", "")
    if not pdf_rel:
        error("NO_PDF", "No line-numbered PDF found in project.")
    pdf_abs = os.path.join(project_dir, pdf_rel)
    if not os.path.isfile(pdf_abs):
        error("NO_PDF", f"PDF not found: {pdf_abs}")

    # ── Load manuscript paragraphs ──
    ms_path = os.path.join(project_dir, "manuscript_full.json")
    if not os.path.isfile(ms_path):
        error("NO_MANUSCRIPT", "manuscript_full.json not found.")
    with open(ms_path, "r", encoding="utf-8") as f:
        manuscript = json.load(f)

    # ── Collect text_excerpts from all merged.section.json ──
    emit("progress", task="get-line-numbers", step="collect_excerpts", percent=10)
    excerpts: list[dict] = []  # [{check, comment_id, paragraph_start, text_excerpt}]
    check_names = ["structure", "expression", "methods_stats",
                   "logic_argument", "figure_table", "ethics"]
    for cname in check_names:
        merged_path = os.path.join(project_dir, "outputs", cname, "merged.section.json")
        if not os.path.isfile(merged_path):
            continue
        try:
            with open(merged_path, "r", encoding="utf-8") as f:
                merged = json.load(f)
            for c in merged.get("comments", []):
                loc = c.get("location") or {}
                excerpt = (loc.get("text_excerpt") or "").strip()
                if not excerpt:
                    continue
                excerpts.append({
                    "check": cname,
                    "comment_id": c.get("comment_id", ""),
                    "paragraph_start": loc.get("paragraph_start"),
                    "text_excerpt": excerpt,
                })
        except (json.JSONDecodeError, OSError):
            pass

    emit("progress", task="get-line-numbers", step="parse_pdf", percent=30,
         excerpt_count=len(excerpts))

    # ── Parse PDF: extract margin line numbers + body text ──
    doc = fitz.open(pdf_abs)

    # line_map: {line_number: {"text": str, "normalized": str, "page": int}}
    line_map: dict[int, dict] = {}
    # page_body_lines: [{y, text, words}] per page
    page_body_lines: list[list[dict]] = []

    for page_num in range(len(doc)):
        page = doc[page_num]
        words = page.get_text("words")

        # Separate margin line numbers (x0 < 40pt, numeric) from body text (x0 > 45pt)
        margin_candidates: list[tuple[float, int]] = []  # [(y, line_number)]
        body_words: list[tuple[float, float, str]] = []  # [(y, x0, text)]

        for w in words:
            x0, y0, x1, y1, text = w[0], w[1], w[2], w[3], w[4]
            if x0 < 40:
                stripped = text.strip()
                if stripped.isdigit():
                    margin_candidates.append((y0, int(stripped)))
                elif stripped.rstrip(".'\"").isdigit():
                    # Handle "1." or "1'" style markers
                    num_part = stripped.rstrip(".'\"")
                    if num_part.isdigit():
                        margin_candidates.append((y0, int(num_part)))
            elif x0 > 45:
                body_words.append((y0, x0, text))

        if not body_words:
            continue

        # Group body words into lines by y-coordinate (tolerance ~8pt)
        Y_TOLERANCE = 8.0
        body_words.sort(key=lambda bw: bw[0])
        current_lines: list[dict] = []
        current_line_words: list[str] = []
        current_y = body_words[0][0]

        for y, x0, text in body_words:
            if y - current_y > Y_TOLERANCE:
                current_lines.append({
                    "y": current_y,
                    "text": " ".join(current_line_words),
                })
                current_line_words = [text]
                current_y = y
            else:
                if abs(y - current_y) < abs(y - (current_y + Y_TOLERANCE)):
                    current_line_words.append(text)
                else:
                    current_line_words.append(text)
                    current_y = y

        if current_line_words:
            current_lines.append({
                "y": current_y,
                "text": " ".join(current_line_words),
            })

        page_body_lines.append(current_lines)

        # Match body lines to margin line numbers by y proximity
        margin_candidates.sort(key=lambda m: m[0])
        sorted_lines = sorted(current_lines, key=lambda l: l["y"])

        for body_line in sorted_lines:
            ly = body_line["y"]
            best_num = None
            best_dist = float("inf")
            for my, mnum in margin_candidates:
                dist = abs(my - ly)
                if dist < best_dist and dist < 60:  # within 60pt tolerance
                    best_dist = dist
                    best_num = mnum
            if best_num is not None:
                line_map[best_num] = {
                    "text": body_line["text"],
                    "normalized": _normalize_for_matching(body_line["text"]),
                    "page": page_num + 1,
                }

    doc.close()

    emit("progress", task="get-line-numbers", step="match_excerpts", percent=60,
         line_count=len(line_map))

    # ── Match each text_excerpt against body lines ──
    # Uses progressive word N-gram search (8→5→3 words) across the
    # full excerpt, not just prefixes.  Also handles:
    # - whitespace normalisation ("81.3 %" ↔ "81.3%")
    # - line-wrapping (excerpt spans multiple PDF lines)
    para_line: dict[int, int] = {}

    # Build paragraph lookup for text verification: {paragraph_number: normalized_text}
    paragraphs = manuscript.get("paragraphs", [])
    para_texts: dict[int, str] = {}
    for para in paragraphs:
        idx = para.get("index")
        text = (para.get("text") or "").strip()
        if idx is not None and text:
            para_texts[idx + 1] = _normalize_for_matching(text)
    # For meta detection: concatenated full manuscript text for N-gram search
    manuscript_full_norm = " ".join(para_texts.values())
    # comment_id → line_number for excerpts without paragraph_start
    comment_line: dict[str, int] = {}

    # First, build paragraph→line via text_excerpt search
    emit("log", message=f"Matching {len(excerpts)} excerpts against {len(line_map)} PDF lines")
    ngram_matches = 0
    overlap_matches = 0
    misses: list[str] = []
    skipped_no_pstart = 0
    skipped_matched = 0  # excerpts without pstart that still matched
    meta_skipped = 0  # meta-comments (not actual manuscript text)
    meta_comment_ids: list[str] = []  # track which IDs are meta

    for ex in excerpts:
        target = ex["text_excerpt"]
        pstart = ex.get("paragraph_start")
        cid = ex.get("comment_id", "")

        # ── Meta-comment detection ──
        # Check if the excerpt is actual manuscript text by searching for
        # a 3-word N-gram that appears in the full manuscript text.
        # LLM-generated structural comments like "Tables are listed,
        # followed by Figures" use common words but in combinations that
        # never appear verbatim in the manuscript.
        target_norm = _normalize_for_matching(target)
        target_words = target_norm.split()
        is_meta = False
        if len(target_words) >= 3:
            found_in_manuscript = False
            for i in range(len(target_words) - 2):
                if " ".join(target_words[i:i + 3]) in manuscript_full_norm:
                    found_in_manuscript = True
                    break
            if not found_in_manuscript:
                is_meta = True

        if is_meta:
            meta_skipped += 1
            if cid:
                meta_comment_ids.append(cid)
            if meta_skipped <= 5:
                emit("log", message=f"  [meta] skipped: \"{target[:80]}...\"")
            continue

        lnum, method = _find_line_for_excerpt(target, line_map)
        if pstart is None:
            skipped_no_pstart += 1
            if lnum is not None:
                skipped_matched += 1
                if cid:
                    comment_line[cid] = lnum
                else:
                    emit("log", message=f"  (no P#, no cid) → line {lnum} [{method}] \"{target[:60]}...\"")
                if skipped_matched <= 5:  # show first few
                    emit("log", message=f"  (no P#) → line {lnum} [{method}] \"{target[:70]}...\"")
            continue
        if lnum is not None:
            para_line[pstart] = lnum
            if method == "ngram":
                ngram_matches += 1
            else:
                overlap_matches += 1
                emit("log", message=f"  P{pstart} → line {lnum} [{method}] \"{target[:80]}...\"")
        else:
            misses.append(f"  P{pstart} MISS \"{target[:60]}...\"")

    emit("log", message=f"excerpts: {meta_skipped} meta skipped, {skipped_no_pstart} no-pstart "
                         f"(of which {skipped_matched} matchable), "
                         f"{ngram_matches} N-gram, {overlap_matches} overlap, {len(misses)} misses")
    for m in misses[:10]:
        emit("log", message=m)
    if len(misses) > 10:
        emit("log", message=f"  ... and {len(misses) - 10} more misses")

    # ── Reverse lookup: for excerpts without pstart that matched a line,
    #     find which paragraph they belong to by word overlap ──
    if skipped_matched > 0:
        reverse_matched = 0
        for ex in excerpts:
            pstart = ex.get("paragraph_start")
            if pstart is not None:
                continue  # already handled above
            target = ex["text_excerpt"]
            # Re-check meta: skip excerpts that aren't manuscript text
            target_norm = _normalize_for_matching(target)
            target_words = target_norm.split()
            if len(target_words) >= 3:
                found = False
                for i in range(len(target_words) - 2):
                    if " ".join(target_words[i:i + 3]) in manuscript_full_norm:
                        found = True
                        break
                if not found:
                    continue  # meta comment, skip
            lnum, method = _find_line_for_excerpt(target, line_map)
            if lnum is None:
                continue

            # Find best-matching paragraph by word overlap
            target_words = set(_normalize_for_matching(target).split())
            best_pnum = None
            best_overlap = 2  # require at least 3 words
            for pnum, ptext in para_texts.items():
                if pnum in para_line:
                    continue  # already mapped
                pwords = set(ptext.split())
                overlap = len(target_words & pwords)
                if overlap > best_overlap:
                    best_overlap = overlap
                    best_pnum = pnum

            if best_pnum is not None:
                para_line[best_pnum] = lnum
                reverse_matched += 1
                if reverse_matched <= 5:
                    emit("log", message=f"  reverse: P{best_pnum} → line {lnum} [{method}] \"{target[:70]}...\"")

        emit("log", message=f"reverse lookup matches: {reverse_matched}")

    # Fallback: for paragraphs without text_excerpt, use paragraph text
    # fingerprint with the same progressive N-gram search
    fb_matches = 0
    fb_misses = 0
    fb_miss_samples: list[str] = []
    for para in paragraphs:
        idx = para.get("index")
        if idx is None:
            continue
        pnum = idx + 1
        if pnum in para_line:
            continue
        text = (para.get("text") or "").strip()
        if not text:
            continue
        lnum, method = _find_line_for_excerpt(text, line_map)
        if lnum is not None:
            para_line[pnum] = lnum
            fb_matches += 1
        else:
            fb_misses += 1
            if len(fb_miss_samples) < 15:
                # Show normalized form for debugging
                norm = _normalize_for_matching(text[:120])
                fb_miss_samples.append(f"  P{pnum}: \"{norm[:100]}\"")

    emit("log", message=f"paragraph fallback matches: {fb_matches}, misses: {fb_misses}")
    for s in fb_miss_samples:
        emit("log", message=s)

    emit("progress", task="get-line-numbers", step="save", percent=90,
         mapped_count=len(para_line))

    # ── Save mapping ──
    # Build per-finding match details for frontend verification
    finding_matches: dict[str, dict] = {}
    for ex in excerpts:
        cid = ex.get("comment_id", "")
        if not cid:
            continue
        pstart = ex.get("paragraph_start")
        lnum = None
        method = "none"
        assigned_pnum = None

        # Get line number from comment_line or paragraph mapping
        if cid in comment_line:
            lnum = comment_line[cid]
        elif pstart is not None and pstart in para_line:
            lnum = para_line[pstart]

        if lnum is not None:
            # Re-run match to get method
            target = ex["text_excerpt"]
            _, method = _find_line_for_excerpt(target, line_map)
            # Find which paragraph this belongs to
            if pstart is not None:
                assigned_pnum = pstart
            else:
                # Find by reverse lookup
                target_words = set(_normalize_for_matching(target).split())
                best_pnum = None
                best_overlap = 2
                for pnum, ptext in para_texts.items():
                    pwords = set(ptext.split())
                    overlap = len(target_words & pwords)
                    if overlap > best_overlap:
                        best_overlap = overlap
                        best_pnum = pnum
                assigned_pnum = best_pnum

            finding_matches[cid] = {
                "line": lnum,
                "method": method,
                "paragraph": assigned_pnum,
                "excerpt": target[:100],
            }

    out = {
        "generated_at": datetime.now(JST).isoformat(),
        "paragraph_count": len(paragraphs),
        "mapped_count": len(para_line),
        "total_pdf_lines": len(line_map),
        "mapping": para_line,
        "comment_line_map": comment_line,
        "finding_matches": finding_matches,
        "meta_comment_ids": meta_comment_ids,
    }
    out_dir = os.path.join(project_dir, "lines")
    os.makedirs(out_dir, exist_ok=True)
    out_path = os.path.join(out_dir, "paragraph_line_map.json")
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(out, f, indent=2, ensure_ascii=False)

    emit("done",
         task="get-line-numbers",
         mapped_count=len(para_line),
         total_paragraphs=len(paragraphs),
         message=f"Mapped {len(para_line)}/{len(paragraphs)} paragraphs to PDF line numbers.")


@main.command(name="merge-section")
@click.option("--project", "project_dir", required=True,
              type=click.Path(file_okay=False, writable=True),
              help="Path to the project working folder.")
@click.option("--check", "check_name", required=True,
              help="Check type. Currently only 'structure' is supported.")
def merge_section_cmd(project_dir, check_name):
    """Merge individual reviewer raw.json files into merged.section.json."""
    from peer_review_assistant.merge import merge_section, _build_markdown

    emit("progress", task="merge-section", step="validate", percent=0,
         check=check_name)

    # Gate: only structure is implemented
    if check_name not in _VALID_CHECKS:
        error("CHECK_NOT_IMPLEMENTED",
              f"Check '{check_name}' is not implemented. "
              f"Available: {', '.join(sorted(_VALID_CHECKS))}")

    # Validate project
    proj_path = os.path.join(project_dir, "project.json")
    if not os.path.isfile(proj_path):
        error("NO_PROJECT", "project.json not found. Run init-project first.")

    emit("progress", task="merge-section", step="load", percent=20,
         check=check_name)

    try:
        result = merge_section(check_name, project_dir)
    except FileNotFoundError:
        error("NO_RAW_CHECK_RESULTS",
              f"No done raw.json files found in outputs/{check_name}/. "
              f"Run run-check --check {check_name} first.")

    emit("progress", task="merge-section", step="merge", percent=50,
         check=check_name,
         sources=result["source_count"],
         total_findings=result["total_findings"],
         merged_count=result["merged_count"])

    # Update timestamps
    now = datetime.now(JST)
    result["merged"]["generated_at"] = now.isoformat()

    emit("progress", task="merge-section", step="save", percent=80,
         check=check_name)

    out_dir = os.path.join(project_dir, "outputs", check_name)
    os.makedirs(out_dir, exist_ok=True)

    json_path = os.path.join(out_dir, "merged.section.json")
    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(result["merged"], f, indent=2, ensure_ascii=False)

    md_content = _build_markdown(result["merged"])
    md_path = os.path.join(out_dir, "merged.section.md")
    with open(md_path, "w", encoding="utf-8") as f:
        f.write(md_content)

    # Update task_status.json
    status_path = os.path.join(project_dir, "status", "task_status.json")
    if os.path.isfile(status_path):
        with open(status_path, "r", encoding="utf-8") as f:
            task_status = json.load(f)
        task_status.setdefault("checks", {}).setdefault(check_name, {})["merged"] = "done"
        with open(status_path, "w", encoding="utf-8") as f:
            json.dump(task_status, f, indent=2, ensure_ascii=False)

    # Append merge.log
    log_path = os.path.join(project_dir, "logs", "merge.log")
    entry = (f"[{now.isoformat()}] merge-section check={check_name} "
             f"sources={result['source_count']} "
             f"findings={result['total_findings']} "
             f"merged={result['merged_count']} "
             f"conflicts={len(result['merged'].get('conflicts', []))}\n")
    os.makedirs(os.path.dirname(log_path), exist_ok=True)
    with open(log_path, "a", encoding="utf-8") as f:
        f.write(entry)

    # Update project.json
    with open(proj_path, "r", encoding="utf-8") as f:
        proj = json.load(f)
    proj["updated_at"] = now.isoformat()
    with open(proj_path, "w", encoding="utf-8") as f:
        json.dump(proj, f, indent=2, ensure_ascii=False)

    emit("done",
         task="merge-section",
         check=check_name,
         sources=result["source_count"],
         total_findings=result["total_findings"],
         merged_count=result["merged_count"],
         message=f"Section merge complete ({result['merged_count']} comments).")


@main.command(name="final-merge")
@click.option("--project", "project_dir", required=True,
              type=click.Path(file_okay=False, writable=True),
              help="Path to the project working folder.")
@click.option("--lang", default="en",
              type=click.Choice(["en", "ja"]),
              help="Output language: en (Review_comments.md) or ja (Review_comments_jp.md).")
@click.option("--format", "output_format", default="all",
              help="Output format(s): md, docx, txt, all. Comma-separated (e.g. md,docx). Default: all.")
def final_merge_cmd(project_dir, lang, output_format):
    """Generate final review documents from merged section results."""
    from peer_review_assistant.output.final import final_merge

    # Parse comma-separated formats
    formats = [f.strip() for f in output_format.split(",") if f.strip()]
    if not formats:
        formats = ["all"]
    valid = {"md", "docx", "txt", "all"}
    formats = [f for f in formats if f in valid]
    if not formats:
        formats = ["all"]

    emit("progress", task="final-merge", step="validate", percent=0)

    # Gate: project.json exists
    proj_path = os.path.join(project_dir, "project.json")
    if not os.path.isfile(proj_path):
        error("NO_PROJECT", "project.json not found. Run init-project first.")

    # Gate: merged.section.json exists
    merged_path = os.path.join(project_dir, "outputs", "structure",
                               "merged.section.json")
    if not os.path.isfile(merged_path):
        error("NO_MERGED_STRUCTURE",
              "outputs/structure/merged.section.json not found. "
              "Run merge-section --check structure first.")

    emit("progress", task="final-merge", step="generate", percent=30)

    try:
        result = final_merge(project_dir, lang=lang, output_format=formats)
    except FileNotFoundError as e:
        error("NO_MERGED_STRUCTURE", str(e))
    except json.JSONDecodeError as e:
        error("FINAL_MERGE_ERROR",
              f"Failed to parse merged.section.json: {e}")
    except Exception as e:
        error("FINAL_MERGE_ERROR",
              f"Final merge generation failed: {e}")

    emit("progress", task="final-merge", step="save", percent=70,
         comments=result["total_comments"],
         major=result["major_count"],
         minor=result["minor_count"])

    out_dir = os.path.join(project_dir, "outputs", "final")
    data_dir = os.path.join(out_dir, "_data")
    os.makedirs(out_dir, exist_ok=True)
    os.makedirs(data_dir, exist_ok=True)

    content = result["content"]
    review_filename = "final_review.md" if lang == "en" else "final_review_jp.md"
    # Main review files stay at outputs/final/
    main_files = [
        (review_filename, content["final_review_md"]),
    ]
    for fname, text in main_files:
        fpath = os.path.join(out_dir, fname)
        with open(fpath, "w", encoding="utf-8") as f:
            f.write(text)

    # Write DOCX and TXT versions alongside the markdown (conditional on --format)
    fmt_set = set(formats)
    _want = lambda f: "all" in fmt_set or f in fmt_set

    if _want("docx"):
        docx_bytes = content.get("final_review_docx")
        if docx_bytes is not None:
            docx_filename = "final_review.docx" if lang == "en" else "final_review_jp.docx"
            docx_path = os.path.join(out_dir, docx_filename)
            with open(docx_path, "wb") as f:
                f.write(docx_bytes)

    if _want("txt"):
        txt_text = content.get("final_review_txt")
        if txt_text is not None:
            txt_filename = "final_review.txt" if lang == "en" else "final_review_jp.txt"
            txt_path = os.path.join(out_dir, txt_filename)
            with open(txt_path, "w", encoding="utf-8") as f:
                f.write(txt_text)

    # Supporting files go to outputs/final/_data/
    data_files = [
        ("comments_to_authors.md", content["comments_to_authors_md"]),
        ("confidential_comments_to_editor.md",
         content["confidential_comments_md"]),
        ("recommendation.md", content["recommendation_md"]),
    ]
    for fname, text in data_files:
        fpath = os.path.join(data_dir, fname)
        # Preserve existing Japanese translation if present
        if fname == "comments_to_authors.md" and os.path.isfile(fpath):
            try:
                with open(fpath, "r", encoding="utf-8") as f:
                    existing = f.read()
                sep_match = re.search(r"\n\n---\n\n", existing)
                if sep_match:
                    ja_part = existing[:sep_match.start()].strip()
                    if ja_part and re.search(r"#\s*(著者へのコメント|査読コメント)", ja_part):
                        # Preserve Japanese section, update only English part
                        text = f"{ja_part}\n\n---\n\n{text}\n"
            except (IOError, UnicodeDecodeError):
                pass
        with open(fpath, "w", encoding="utf-8") as f:
            f.write(text)

    audit_path = os.path.join(data_dir, "audit_trail.json")
    with open(audit_path, "w", encoding="utf-8") as f:
        json.dump(content["audit_trail"], f, indent=2, ensure_ascii=False)

    emit("progress", task="final-merge", step="update_status", percent=90)

    # Update task_status.json
    status_path = os.path.join(project_dir, "status", "task_status.json")
    if os.path.isfile(status_path):
        with open(status_path, "r", encoding="utf-8") as f:
            task_status = json.load(f)
        task_status["final_merge"] = "done"
        with open(status_path, "w", encoding="utf-8") as f:
            json.dump(task_status, f, indent=2, ensure_ascii=False)

    # Append merge.log
    now = datetime.now(JST)
    log_path = os.path.join(project_dir, "logs", "merge.log")
    expr_path = os.path.join(project_dir, "outputs", "expression",
                              "merged.section.json")
    ms_path = os.path.join(project_dir, "outputs", "methods_stats",
                            "merged.section.json")
    la_path = os.path.join(project_dir, "outputs", "logic_argument",
                            "merged.section.json")
    ft_path = os.path.join(project_dir, "outputs", "figure_table",
                            "merged.section.json")
    eth_path = os.path.join(project_dir, "outputs", "ethics",
                            "merged.section.json")
    checks_used = ["structure"]
    if os.path.isfile(expr_path):
        checks_used.append("expression")
    if os.path.isfile(ms_path):
        checks_used.append("methods_stats")
    if os.path.isfile(la_path):
        checks_used.append("logic_argument")
    if os.path.isfile(ft_path):
        checks_used.append("figure_table")
    if os.path.isfile(eth_path):
        checks_used.append("ethics")
    rec = result.get("recommendation", {})
    rec_str = rec.get("level_ja", str(rec)) if isinstance(rec, dict) else str(rec)
    log_entry = (f"[{now.isoformat()}] final-merge checks={','.join(checks_used)} "
                 f"comments={result['total_comments']} "
                 f"major={result['major_count']} "
                 f"minor={result['minor_count']} "
                 f"recommendation=\"{rec_str}\"\n")
    os.makedirs(os.path.dirname(log_path), exist_ok=True)
    with open(log_path, "a", encoding="utf-8") as f:
        f.write(log_entry)

    # Update project.json timestamp
    with open(proj_path, "r", encoding="utf-8") as f:
        proj = json.load(f)
    proj["updated_at"] = now.isoformat()
    with open(proj_path, "w", encoding="utf-8") as f:
        json.dump(proj, f, indent=2, ensure_ascii=False)

    rec = result.get("recommendation", {})
    rec_str = rec.get("level_ja", str(rec)) if isinstance(rec, dict) else str(rec)
    emit("done",
         task="final-merge",
         comments=result["total_comments"],
         major=result["major_count"],
         minor=result["minor_count"],
         recommendation=rec_str,
         message=f"Final review generated ({result['total_comments']} comments, "
                 f"recommendation: {rec_str}).")


@main.command(name="re-evaluate")
@click.option("--project", "project_dir", required=True,
              type=click.Path(file_okay=False, writable=True),
              help="Path to the project working folder.")
@click.option("--check", "check_name", required=True,
              help="Check type: structure, expression, methods_stats, or logic_argument.")
@click.option("--slot", "slot", required=True,
              help="Reviewer slot name to use for re-evaluation (e.g. reviewer1).")
@click.option("--provider", "provider", required=True,
              help="LLM provider name (e.g. openai, deepseek, openai-compatible).")
@click.option("--base-url", "base_url", required=True,
              help="LLM API base URL.")
@click.option("--model", "model", required=True,
              help="LLM model name.")
@click.option("--api-key", "api_key", default=None,
              help="API key (pass directly or omit to use --api-key-env).")
@click.option("--api-key-env", "api_key_env_name", default=None,
              help="Environment variable name containing the API key.")
@click.option("--thinking-enabled", "thinking_enabled", is_flag=True, default=False,
              help="Enable thinking/reasoning mode for the model.")
@click.option("--temperature", "temperature", type=float, default=None,
              help="LLM temperature (default: None, model default).")
def re_evaluate_cmd(project_dir, check_name, slot, provider, base_url, model,
                    api_key, api_key_env_name, thinking_enabled, temperature):
    """Re-evaluate disputed findings using a reviewer LLM as adjudicator.

    Reads external_check.json, extracts disagree/partial verdicts,
    sends each to the reviewer LLM for a final ruling, and saves
    the result as reevaluation.json.
    """
    from .llm import LLMProvider, chat_completion
    from .llm.json_repair import parse_llm_json

    # Resolve API key
    if api_key_env_name:
        api_key = os.environ.get(api_key_env_name)
        if not api_key:
            error("MISSING_API_KEY",
                  f"Environment variable {api_key_env_name} is not set.")
    if not api_key:
        error("MISSING_API_KEY",
              "No API key provided (use --api-key or --api-key-env).")

    # Load external evaluation
    ec_path = os.path.join(project_dir, "outputs", check_name, "external_check.json")
    if not os.path.isfile(ec_path):
        error("NO_EXTERNAL_CHECK",
              "No external evaluation found. Run external check first.")

    with open(ec_path, "r", encoding="utf-8") as f:
        ec_data = json.load(f)

    # Extract disagree and partial verdicts
    disputed = [v for v in ec_data.get("verdicts", [])
                if v.get("verdict") in ("disagree", "partial")]
    if not disputed:
        emit("done", task="re-evaluate", check=check_name, slot=slot,
             disputed_count=0,
             message="No disputed items found — nothing to re-evaluate.")
        return

    emit("progress", task="re-evaluate", step="load", percent=10,
         check=check_name, disputed_count=len(disputed))

    # Load merged section for comment details
    merged_path = os.path.join(project_dir, "outputs", check_name, "merged.section.json")
    if not os.path.isfile(merged_path):
        error("NO_MERGED_RESULT",
              "No merged result found. Run merge-section first.")

    with open(merged_path, "r", encoding="utf-8") as f:
        merged = json.load(f)

    # Build lookup of comment details
    comment_map = {c.get("comment_id"): c for c in merged.get("comments", [])}

    # Set up LLM provider
    prov = LLMProvider(
        name=slot,
        provider=provider,
        base_url=base_url,
        model=model,
        api_key=api_key,
    )

    # Process each disputed item
    verdicts = []
    for i, dv in enumerate(disputed):
        cid = dv.get("comment_id", "")
        comment = comment_map.get(cid)
        if not comment:
            continue

        verdict_label = {"disagree": "disagree (this criticism is unnecessary)", "partial": "partial (partially agree)"}.get(
            dv.get("verdict", ""), dv.get("verdict", ""))

        messages = [
            {"role": "system", "content": (
                "You are a peer reviewer for a scientific journal. "
                "An AI review tool and an external evaluation AI disagree "
                "about the finding below. Judge which opinion is correct, "
                "then write the final comment text that will be shown to "
                "the paper's authors. Respond in JSON."
            )},
            {"role": "user", "content": (
                f"## Review Tool's Finding\n"
                f"- Severity: {comment.get('severity', 'unknown')}\n"
                f"- Category: {comment.get('category', '')}\n"
                f"- Issue: {comment.get('issue', '')}\n"
                f"- Suggested revision: {comment.get('suggested_author_comment', comment.get('suggested_comment', ''))}\n"
                f"\n"
                f"## External Evaluation's Objection\n"
                f"- Verdict: {verdict_label}\n"
                f"- Reasoning: {dv.get('reasoning', '')}\n"
                f"\n"
                f"## Instructions\n"
                f"1. Judge whose opinion is correct and respond in JSON.\n"
                f"2. Write the final comment text (author_comment / author_comment_ja) "
                f"as if addressing the paper's authors directly. Use polite, "
                f"constructive academic language. Do NOT mention the tool, "
                f"external evaluation, or this adjudication process.\n"
                f"3. If verdict is tool_correct: restate the tool's finding "
                f"in clear, author-facing language.\n"
                f"4. If verdict is external_correct: set author_comment to null "
                f"(the criticism should be dismissed).\n"
                f"5. If verdict is partial: write a modified version incorporating "
                f"the valid portions of both sides.\n"
                f"\n"
                f"Respond in this JSON format:\n"
                f'{{"comment_id": "{cid}", "verdict": "tool_correct"|"external_correct"|"partial",'
                f' "reasoning": "Brief explanation of your judgment (English, internal use only)",'
                f' "reasoning_ja": "Brief explanation of your judgment (Japanese, internal use only)",'
                f' "author_comment": "Final comment for authors (English, or null if dismissed)",'
                f' "author_comment_ja": "Final comment for authors (Japanese, or null if dismissed)"}}'
            )},
        ]

        emit("progress", task="re-evaluate", step="calling_llm",
             percent=20 + int((i / max(len(disputed), 1)) * 60),
             check=check_name, current=i + 1, total=len(disputed),
             comment_id=cid)

        # Use increased max_tokens for thinking-enabled models
        if thinking_enabled:
            max_tok = 16384
            timeout_sec = 300
        else:
            max_tok = 4096
            timeout_sec = 120

        result = chat_completion(prov, messages, max_tokens=max_tok,
                                 temperature=temperature or 0.0,
                                 timeout_seconds=timeout_sec,
                                 thinking_enabled=thinking_enabled)

        if not result["ok"]:
            # Log error but continue with remaining items
            verdicts.append({
                "comment_id": cid,
                "verdict": "error",
                "reasoning": f"LLM call failed: {result.get('error', 'Unknown')}",
            })
            continue

        parsed = parse_llm_json(result["content"])
        if parsed is None:
            verdicts.append({
                "comment_id": cid,
                "verdict": "error",
                "reasoning": "Failed to parse LLM response as JSON",
            })
            continue

        verdicts.append({
            "comment_id": cid,
            "verdict": parsed.get("verdict", "unknown"),
            "reasoning": parsed.get("reasoning", ""),
            "reasoning_ja": parsed.get("reasoning_ja", ""),
            "author_comment": parsed.get("author_comment"),
            "author_comment_ja": parsed.get("author_comment_ja"),
        })

    # Save results
    emit("progress", task="re-evaluate", step="save", percent=90,
         check=check_name)

    now = datetime.now(JST)
    output = {
        "check_name": check_name,
        "generated_at": now.isoformat(),
        "model": model,
        "slot": slot,
        "verdicts": verdicts,
    }

    out_dir = os.path.join(project_dir, "outputs", check_name)
    os.makedirs(out_dir, exist_ok=True)
    out_path = os.path.join(out_dir, "reevaluation.json")
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(output, f, indent=2, ensure_ascii=False)

    tool_correct = sum(1 for v in verdicts if v["verdict"] == "tool_correct")
    external_correct = sum(1 for v in verdicts if v["verdict"] == "external_correct")
    partial = sum(1 for v in verdicts if v["verdict"] == "partial")
    errors = sum(1 for v in verdicts if v["verdict"] == "error")

    emit("done", task="re-evaluate", check=check_name, slot=slot,
         disputed_count=len(disputed),
         tool_correct=tool_correct,
         external_correct=external_correct,
         partial=partial,
         errors=errors,
         message=f"Re-evaluation complete ({tool_correct} tool, "
                 f"{external_correct} external, {partial} partial"
                 + (f", {errors} errors" if errors > 0 else "") + ").")


@main.command(name="translate-external-check")
@click.option("--project", "project_dir", required=True,
              type=click.Path(exists=True, file_okay=False, dir_okay=True))
@click.option("--check", "check_name", required=True)
@click.option("--slot", required=True)
@click.option("--provider", required=True)
@click.option("--base-url", default="")
@click.option("--model", required=True)
@click.option("--api-key", default="")
@click.option("--api-key-env", "api_key_env_name", default=None,
              help="Environment variable name containing the API key.")
@click.option("--temperature", type=float, default=0.0)
def translate_external_check_cmd(project_dir, check_name, slot, provider,
                                  base_url, model, api_key, api_key_env_name,
                                  temperature):
    """Translate external check reasoning fields to Japanese."""
    from .llm import LLMProvider, chat_completion
    from .llm.json_repair import parse_llm_json

    # Resolve API key
    if api_key_env_name:
        api_key = os.environ.get(api_key_env_name)
        if not api_key:
            error("MISSING_API_KEY",
                  f"Environment variable {api_key_env_name} is not set.")
    if not api_key:
        error("MISSING_API_KEY",
              "No API key provided (use --api-key or --api-key-env).")

    ec_path = os.path.join(project_dir, "outputs", check_name, "external_check.json")
    if not os.path.isfile(ec_path):
        error("NO_EXTERNAL_CHECK", "No external check found.")

    with open(ec_path, "r", encoding="utf-8") as f:
        ec_data = json.load(f)

    verdicts = ec_data.get("verdicts", [])
    needs_translation = [v for v in verdicts
                         if v.get("reasoning") and not v.get("reasoning_ja")]

    if not needs_translation:
        emit("done", task="translate-external-check", check=check_name,
             translated=0, message="No untranslated items found.")
        return

    prov = LLMProvider(
        name=slot, provider=provider, base_url=base_url,
        model=model, api_key=api_key,
    )

    translated = 0
    for v in verdicts:
        reasoning = v.get("reasoning", "").strip()
        if not reasoning or v.get("reasoning_ja"):
            continue

        messages = [
            {"role": "system", "content": (
                "Translate the following English text to Japanese. "
                "Respond in JSON format."
            )},
            {"role": "user", "content": (
                f"Translate to Japanese:\n\n{reasoning}\n\n"
                f'JSON: {{"translation": "Japanese translation here"}}'
            )},
        ]

        result = chat_completion(prov, messages, max_tokens=2048,
                                 temperature=temperature or 0.0,
                                 timeout_seconds=60)
        if result["ok"]:
            parsed = parse_llm_json(result["content"])
            if parsed and parsed.get("translation"):
                v["reasoning_ja"] = parsed["translation"]
                translated += 1

    # Write back
    ec_data["verdicts"] = verdicts
    with open(ec_path, "w", encoding="utf-8") as f:
        json.dump(ec_data, f, indent=2, ensure_ascii=False)

    emit("done", task="translate-external-check", check=check_name,
         translated=translated,
         message=f"Translated {translated} reasoning(s) to Japanese.")


@main.command(name="translate-card-ja")
@click.option("--project", "project_dir", required=True,
              type=click.Path(exists=True, file_okay=False, dir_okay=True))
@click.option("--check", "check_name", required=True)
@click.option("--slot", required=True)
@click.option("--provider", required=True)
@click.option("--base-url", default="")
@click.option("--model", required=True)
@click.option("--api-key", default="")
@click.option("--api-key-env", "api_key_env_name", default=None,
              help="Environment variable name containing the API key.")
@click.option("--temperature", type=float, default=0.0)
def translate_card_ja_cmd(project_dir, check_name, slot, provider,
                           base_url, model, api_key, api_key_env_name,
                           temperature):
    """Translate untranslated external check + reevaluation reasoning to Japanese."""
    from .llm import LLMProvider, chat_completion
    from .llm.json_repair import parse_llm_json

    if api_key_env_name:
        api_key = os.environ.get(api_key_env_name)
        if not api_key:
            error("MISSING_API_KEY",
                  f"Environment variable {api_key_env_name} is not set.")
    if not api_key:
        error("MISSING_API_KEY",
              "No API key provided.")

    prov = LLMProvider(
        name=slot, provider=provider, base_url=base_url,
        model=model, api_key=api_key,
    )

    def translate_text(text):
        """Call LLM to translate a single text to Japanese."""
        messages = [
            {"role": "system", "content": (
                "Translate the following English text to Japanese. "
                "Respond in JSON format."
            )},
            {"role": "user", "content": (
                f"Translate to Japanese:\n\n{text}\n\n"
                f'JSON: {{"translation": "Japanese translation here"}}'
            )},
        ]
        result = chat_completion(prov, messages, max_tokens=2048,
                                 temperature=temperature or 0.0,
                                 timeout_seconds=60)
        if result["ok"]:
            parsed = parse_llm_json(result["content"])
            if parsed and parsed.get("translation"):
                return parsed["translation"]
        return None

    total = 0

    # 1. External check
    ec_path = os.path.join(project_dir, "outputs", check_name, "external_check.json")
    if os.path.isfile(ec_path):
        with open(ec_path, "r", encoding="utf-8") as f:
            ec_data = json.load(f)
        changed = False
        for v in ec_data.get("verdicts", []):
            if v.get("reasoning") and not v.get("reasoning_ja"):
                ja = translate_text(v["reasoning"])
                if ja:
                    v["reasoning_ja"] = ja
                    changed = True
                    total += 1
        if changed:
            with open(ec_path, "w", encoding="utf-8") as f:
                json.dump(ec_data, f, indent=2, ensure_ascii=False)

    # 2. Reevaluation
    re_path = os.path.join(project_dir, "outputs", check_name, "reevaluation.json")
    if os.path.isfile(re_path):
        with open(re_path, "r", encoding="utf-8") as f:
            re_data = json.load(f)
        changed = False
        for v in re_data.get("verdicts", []):
            if v.get("reasoning") and not v.get("reasoning_ja"):
                ja = translate_text(v["reasoning"])
                if ja:
                    v["reasoning_ja"] = ja
                    changed = True
                    total += 1
            if v.get("author_comment") and not v.get("author_comment_ja"):
                ja = translate_text(v["author_comment"])
                if ja:
                    v["author_comment_ja"] = ja
                    changed = True
                    total += 1
        if changed:
            with open(re_path, "w", encoding="utf-8") as f:
                json.dump(re_data, f, indent=2, ensure_ascii=False)

    emit("done", task="translate-card-ja", check=check_name,
         translated=total,
         message=f"Translated {total} untranslated reasoning(s) to Japanese.")


@main.command(name="suggest-solution")
@click.option("--project", "project_dir", required=True,
              type=click.Path(exists=True, file_okay=False, dir_okay=True))
@click.option("--check", "check_name", required=True)
@click.option("--slot", required=True)
@click.option("--finding-id", required=True)
@click.option("--default-prompt", required=True)
@click.option("--additional-prompt", default="")
@click.option("--include-in-output", is_flag=True, default=False)
@click.option("--system-prompt", "system_prompt_override", default="",
              help="Override the default system prompt for solution generation.")
@click.option("--provider", required=True)
@click.option("--base-url", default="")
@click.option("--model", required=True)
@click.option("--api-key", default="")
@click.option("--api-key-env", "api_key_env_name", default=None,
              help="Environment variable name containing the API key.")
@click.option("--temperature", type=float, default=0.3)
@click.option("--thinking-enabled", is_flag=True, default=False,
              help="Enable model thinking/reasoning (increases max_tokens).")
def suggest_solution_cmd(project_dir, check_name, slot, finding_id,
                          default_prompt, additional_prompt, include_in_output,
                          system_prompt_override,
                          provider, base_url, model, api_key, api_key_env_name,
                          temperature, thinking_enabled):
    """Generate a concrete solution suggestion for a specific review finding.

    Reads the finding from merged.section.json, loads manuscript context,
    calls LLM to generate a solution, and saves to solutions.json.
    """
    from .llm import LLMProvider, chat_completion
    from .llm.json_repair import parse_llm_json
    from .llm.prompts import build_solution_suggestion_messages

    if api_key_env_name:
        api_key = os.environ.get(api_key_env_name)
        if not api_key:
            error("MISSING_API_KEY",
                  f"Environment variable {api_key_env_name} is not set.")
    if not api_key:
        error("MISSING_API_KEY",
              "No API key provided.")

    # Load the finding from merged.section.json
    merged_path = os.path.join(project_dir, "outputs", check_name, "merged.section.json")
    if not os.path.isfile(merged_path):
        error("NO_MERGED_RESULT",
              f"merged.section.json not found in outputs/{check_name}/. "
              "Run merge-section first.")

    with open(merged_path, "r", encoding="utf-8") as f:
        merged = json.load(f)

    # Find the specific finding
    finding = None
    for c in merged.get("comments", []):
        if c.get("comment_id") == finding_id:
            finding = c
            break

    if finding is None:
        error("FINDING_NOT_FOUND",
              f"Finding with comment_id '{finding_id}' not found in merged result.")

    # Load manuscript excerpt from sections
    manuscript_excerpt = ""
    section_name = (finding.get("location") or {}).get("section", "")
    if section_name:
        sections_dir = os.path.join(project_dir, "outputs", "sections")
        # Try to find a matching section file
        for fname in os.listdir(sections_dir) if os.path.isdir(sections_dir) else []:
            if fname.endswith(".txt") and section_name.lower() in fname.lower():
                sec_path = os.path.join(sections_dir, fname)
                with open(sec_path, "r", encoding="utf-8") as f:
                    manuscript_excerpt = f.read()
                break
        # Fallback: try manuscript_full.json
        if not manuscript_excerpt:
            mf_path = os.path.join(project_dir, "outputs", "manuscript_full.json")
            if os.path.isfile(mf_path):
                with open(mf_path, "r", encoding="utf-8") as f:
                    mf = json.load(f)
                for para in mf.get("paragraphs", []):
                    if para.get("section", "").lower() == section_name.lower():
                        manuscript_excerpt += para.get("text", "") + "\n"
                if not manuscript_excerpt:
                    # Use abstract as fallback context
                    for para in mf.get("paragraphs", []):
                        if para.get("section", "").lower() in ("abstract", "概要"):
                            manuscript_excerpt += para.get("text", "") + "\n"

    # Build messages
    messages = build_solution_suggestion_messages(
        finding=finding,
        manuscript_excerpt=manuscript_excerpt,
        default_prompt=default_prompt,
        additional_prompt=additional_prompt if additional_prompt.strip() else None,
        system_prompt_override=system_prompt_override if system_prompt_override.strip() else None,
    )

    # Set up LLM provider
    prov = LLMProvider(
        name=slot,
        provider=provider,
        base_url=base_url,
        model=model,
        api_key=api_key,
    )

    emit("progress", task="suggest-solution", step="calling_llm",
         check=check_name, finding_id=finding_id)

    # Use increased max_tokens for thinking-enabled models
    if thinking_enabled:
        max_tok = 16384
        timeout_sec = 300
    else:
        max_tok = 4096
        timeout_sec = 120

    result = chat_completion(prov, messages, max_tokens=max_tok,
                             temperature=temperature,
                             timeout_seconds=timeout_sec,
                             thinking_enabled=thinking_enabled)

    if not result["ok"]:
        error("LLM_CALL_FAILED",
              f"LLM call failed: {result.get('error', 'Unknown error')}")

    raw_content = result.get("content", "")
    reasoning = result.get("reasoning_content", "")
    parsed = parse_llm_json(raw_content)
    # If content parse fails, try reasoning_content (some thinking models
    # put the final answer there)
    if parsed is None and reasoning:
        parsed = parse_llm_json(reasoning)
    if parsed is None:
        # Emit debug info so we can see what the model returned
        if raw_content:
            preview = raw_content[:500]
        elif reasoning:
            preview = f"(content empty, reasoning_content: {reasoning[:500]})"
        else:
            preview = "(both content and reasoning_content empty)"
        error("PARSE_ERROR",
              f"Failed to parse LLM response as JSON. "
              f"Raw content (first 500 chars): {preview}")

    solution_en = parsed.get("solution", "")
    solution_ja = parsed.get("solution_ja", "")

    if not solution_en and not solution_ja:
        error("EMPTY_SOLUTION",
              "LLM returned empty solution")

    # Load existing solutions.json (if any) and upsert
    out_dir = os.path.join(project_dir, "outputs", check_name)
    os.makedirs(out_dir, exist_ok=True)
    solutions_path = os.path.join(out_dir, "solutions.json")

    solutions_data = None
    if os.path.isfile(solutions_path):
        try:
            with open(solutions_path, "r", encoding="utf-8") as f:
                solutions_data = json.load(f)
        except (json.JSONDecodeError, OSError):
            pass

    now = datetime.now(JST)
    solution_entry = {
        "finding_id": finding_id,
        "default_prompt": default_prompt,
        "additional_prompt": additional_prompt,
        "include_in_output": include_in_output,
        "solution": solution_en,
        "solution_ja": solution_ja,
        "generated_at": now.isoformat(),
    }

    if solutions_data and isinstance(solutions_data, dict):
        existing = solutions_data.get("solutions", [])
        # Remove old entry for this finding_id if exists
        existing = [s for s in existing if s.get("finding_id") != finding_id]
        existing.append(solution_entry)
        solutions_data["solutions"] = existing
        solutions_data["generated_at"] = now.isoformat()
    else:
        solutions_data = {
            "check_name": check_name,
            "generated_at": now.isoformat(),
            "solutions": [solution_entry],
        }

    with open(solutions_path, "w", encoding="utf-8") as f:
        json.dump(solutions_data, f, indent=2, ensure_ascii=False)

    emit("done", task="suggest-solution", check=check_name,
         finding_id=finding_id,
         message="Solution suggestion generated successfully.")


def _translate_en_to_ja(prov, en_text: str, section_key: str, label_ja: str) -> str:
    """Translate English text to Japanese for a single candidate."""
    from .llm import chat_completion
    section_labels = {
        "novelty_theme": "新規性",
        "journal_fit": "適合性",
        "achievements": "達成点",
        "key_issues": "問題点",
    }
    section_name = section_labels.get(section_key, label_ja)
    messages = [
        {"role": "system", "content": f"""\
You are a professional academic translator. Translate the following English
peer review text into natural, fluent Japanese.

CRITICAL — Tone in Japanese:
- Use tentative, constructive, collegial language
- Use 「〜が考えられます」「〜するとよいかもしれません」
  「〜という印象を受けます」
- NEVER use 「〜すべきだ」「〜しなさい」
- Maintain the original meaning precisely

Output ONLY the Japanese translation, nothing else."""},
        {"role": "user", "content": f"Translate this peer review text about {section_name}:\n\n{en_text}"},
    ]
    result = chat_completion(prov, messages, max_tokens=2048,
                             temperature=0.0, timeout_seconds=60)
    if not result["ok"]:
        # Fallback: return empty string
        return ""
    return result["content"].strip()


@main.command(name="overall-assessment-candidates")
@click.option("--project", "project_dir", required=True,
              type=click.Path(exists=True, file_okay=False, dir_okay=True))
@click.option("--slot", required=True)
@click.option("--provider", required=True)
@click.option("--base-url", default="")
@click.option("--model", required=True)
@click.option("--api-key", default="")
@click.option("--api-key-env", "api_key_env_name", default=None,
              help="Environment variable name containing the API key.")
@click.option("--temperature", type=float, default=0.3)
@click.option("--thinking-enabled", is_flag=True, default=False,
              help="Enable model thinking/reasoning.")
@click.option("--volume", type=click.Choice(["brief", "standard", "detailed"]),
              default="standard",
              help="Candidate verbosity level: brief (~1 line), standard (~2 lines), detailed (~3 lines).")
@click.option("--section", "section_key", default=None,
              type=click.Choice(["novelty_theme", "journal_fit", "achievements", "key_issues"]),
              help="Regenerate only this section (merges into existing candidates).")
@click.option("--focus", "focus_keys", default=None, multiple=True,
              type=click.Choice(["theme", "data", "analysis", "writing", "general"]),
              help="Content focus for single-section regeneration. Repeatable. "
                   "Generates 1 focused candidate instead of multiple variations.")
@click.option("--tone", "tone_key", default="neutral",
              type=click.Choice(["positive", "mild_positive", "neutral",
                                 "mild_negative", "negative"]),
              help="Tone for focused regeneration: positive, mild_positive, neutral, "
                   "mild_negative, negative.")
def overall_assessment_candidates_cmd(project_dir, slot, provider, base_url,
                                       model, api_key, api_key_env_name,
                                       temperature, thinking_enabled, volume,
                                       section_key, focus_keys, tone_key):
    """Generate candidate blocks for the overall assessment (全体所感).

    Produces candidates for four sections:
    1. テーマ性・新規性 (Theme and Novelty) — from novelty data
    2. 投稿ジャーナル適合性 (Journal Fit) — from novelty + journal profile
    3. 達成点 (Achieved Points) — 5 style variants
    4. 主要問題点 (Key Issues) — 5 style variants

    Saves to outputs/final/overall_assessment_candidates.json.

    With --section, regenerates only the specified section and merges it into
    the existing candidates file (which must already exist).
    """
    from .llm import LLMProvider, chat_completion
    from .llm.json_repair import parse_llm_json
    from .llm.prompts import (
        build_overall_assessment_candidates_messages,
        build_single_section_candidates_messages,
    )

    task_id = "overall-assessment-candidates"

    # Resolve API key
    if api_key_env_name:
        api_key = os.environ.get(api_key_env_name)
        if not api_key:
            error("MISSING_API_KEY",
                  f"Environment variable {api_key_env_name} is not set.")
    if not api_key:
        error("MISSING_API_KEY", "No API key provided.")

    emit("progress", task=task_id, step="validate", percent=0, slot=slot)

    # Check labels for prompt context
    check_labels = {
        "structure": "構成 (Structure)",
        "expression": "表現 (Expression)",
        "methods_stats": "方法・統計 (Methods & Statistics)",
        "logic_argument": "論理・主張 (Logic & Argument)",
        "figure_table": "図表 (Figures & Tables)",
        "ethics": "倫理・利益相反 (Ethics & COI)",
    }

    # Load abstract
    abstract = None
    abstract_path = os.path.join(project_dir, "sections", "abstract.txt")
    if os.path.isfile(abstract_path):
        with open(abstract_path, "r", encoding="utf-8") as f:
            abstract = f.read().strip()

    # Load novelty data (for sections 1 & 2)
    emit("progress", task=task_id, step="load_novelty", percent=10, slot=slot)

    novelty_summary = None
    novelty_summary_path = os.path.join(project_dir, "outputs", "novelty",
                                         "novelty_summary.json")
    if os.path.isfile(novelty_summary_path):
        with open(novelty_summary_path, "r", encoding="utf-8") as f:
            novelty_summary = json.load(f)

    novelty_assessment = None
    novelty_assessment_path = os.path.join(project_dir, "outputs", "novelty",
                                            "novelty_assessment.md")
    if os.path.isfile(novelty_assessment_path):
        with open(novelty_assessment_path, "r", encoding="utf-8") as f:
            novelty_assessment = f.read()

    # Load journal profile (for section 2)
    journal_profile = None
    jp_path = os.path.join(project_dir, "journal_profile.json")
    if os.path.isfile(jp_path):
        with open(jp_path, "r", encoding="utf-8") as f:
            journal_profile = json.load(f)

    # Load all available merged.section.json files (for section 3)
    emit("progress", task=task_id, step="load_checks", percent=20, slot=slot)

    check_data = []
    for check_name in ["structure", "expression", "methods_stats",
                        "logic_argument", "figure_table", "ethics"]:
        merged_path = os.path.join(
            project_dir, "outputs", check_name, "merged.section.json"
        )
        if not os.path.isfile(merged_path):
            continue

        with open(merged_path, "r", encoding="utf-8") as f:
            merged = json.load(f)

        comments = merged.get("comments", [])
        total = len(comments)
        major = sum(1 for c in comments if c.get("severity") == "major")
        minor = total - major

        # Extract key findings: major severity + high confidence
        key_findings = []
        for c in comments:
            if c.get("severity") == "major" and c.get("confidence") == "high":
                loc = c.get("location") or {}
                key_findings.append({
                    "category": c.get("category", ""),
                    "section": loc.get("section", "N/A"),
                    "issue": (c.get("issue") or "")[:300],
                    "comment_id": c.get("comment_id", ""),
                })

        # Keep all major+high findings (no per-check limit for candidates)
        check_data.append({
            "check_name": check_name,
            "label_ja": check_labels.get(check_name, check_name),
            "summary": merged.get("summary", "No summary available."),
            "total": total,
            "major": major,
            "minor": minor,
            "key_findings": key_findings,
        })

    if not check_data:
        error("NO_MERGED_DATA",
              "No merged.section.json files found. "
              "Run merge-section for at least one check type first.")

    # ── Single-section regeneration ──
    if section_key:
        candidates_path = os.path.join(project_dir, "outputs", "final", "_data",
                                       "overall_assessment_candidates.json")
        if not os.path.isfile(candidates_path):
            error("NO_CANDIDATES",
                  "overall_assessment_candidates.json not found. "
                  "Run without --section first to generate all candidates.")
        with open(candidates_path, "r", encoding="utf-8") as f:
            existing = json.load(f)

        emit("progress", task=task_id, step="building_prompt", percent=40,
             slot=slot, section=section_key)

        # Load novelty achievement for novelty_theme and achievements sections
        novelty_achievement = None
        if section_key in ("novelty_theme", "achievements"):
            na_path = os.path.join(project_dir, "outputs", "novelty",
                                   "novelty_achievement.md")
            if os.path.isfile(na_path):
                with open(na_path, "r", encoding="utf-8") as f:
                    novelty_achievement = f.read()

        # Convert focus_keys tuple to list (empty tuple → None for general mode)
        focus_list = list(focus_keys) if focus_keys else None

        messages = build_single_section_candidates_messages(
            section_key, abstract, check_data, novelty_summary,
            novelty_assessment, journal_profile, volume=volume,
            focus=focus_list, novelty_achievement=novelty_achievement,
            tone=tone_key)

        prov = LLMProvider(name=slot, provider=provider, base_url=base_url,
                           model=model, api_key=api_key)

        emit("progress", task=task_id, step="calling_llm", percent=60,
             slot=slot, model=model, provider=provider, section=section_key)

        max_tok = 4096
        timeout_sec = 120
        result = chat_completion(prov, messages, max_tokens=max_tok,
                                 temperature=temperature,
                                 timeout_seconds=timeout_sec)

        if not result["ok"]:
            error("LLM_CALL_FAILED",
                  f"LLM call failed: {result.get('error', 'Unknown error')}")

        emit("progress", task=task_id, step="parsing", percent=80,
             slot=slot, latency_ms=result.get("latency_ms"))

        parsed = parse_llm_json(result["content"])
        if parsed is None:
            raw_content = result.get("content", "")
            preview = raw_content[:500] if raw_content else "(content empty)"
            error("PARSE_ERROR",
                  f"Failed to parse LLM response as JSON. "
                  f"Raw content (first 500 chars): {preview}")

        new_section = parsed.get("sections", {}).get(section_key)
        if not new_section:
            error("INVALID_RESPONSE",
                  f"LLM response missing section '{section_key}'.")

        # ── Focused mode: translate EN → JA ──
        if focus_list:
            emit("progress", task=task_id, step="translating", percent=70,
                 slot=slot, section=section_key)
            candidates = new_section.get("candidates", [])
            for c in candidates:
                en_text = c.get("text_en", "")
                if en_text and not c.get("text_ja", "").strip():
                    ja_text = _translate_en_to_ja(
                        prov, en_text, section_key,
                        new_section.get("label_ja", section_key))
                    c["text_ja"] = ja_text
            new_section["candidates"] = candidates

        # Merge into existing: APPEND new candidates (don't replace)
        new_candidates = new_section.get("candidates", [])
        if new_candidates:
            old_section = existing["sections"].get(section_key, {})
            old_candidates = old_section.get("candidates", [])
            # Renumber new IDs to avoid collisions
            existing_ids = {c["id"] for c in old_candidates}
            for i, c in enumerate(new_candidates):
                base_id = c.get("id", f"{section_key}_focused")
                unique_id = base_id
                suffix = 1
                while unique_id in existing_ids:
                    suffix += 1
                    unique_id = f"{base_id}_{suffix}"
                c["id"] = unique_id
                existing_ids.add(unique_id)
            # Keep section metadata (label_ja, label_en) from existing if present
            merged_section = {
                **old_section,
                "candidates": old_candidates + new_candidates,
            }
            existing["sections"][section_key] = merged_section
        else:
            existing["sections"][section_key] = new_section
        existing["generated_at"] = datetime.now(JST).isoformat()
        existing["model"] = result.get("model")

        with open(candidates_path, "w", encoding="utf-8") as f:
            json.dump(existing, f, indent=2, ensure_ascii=False)

        # Update project timestamp
        proj_path = os.path.join(project_dir, "project.json")
        if os.path.isfile(proj_path):
            with open(proj_path, "r", encoding="utf-8") as f:
                proj = json.load(f)
            proj["updated_at"] = datetime.now(JST).isoformat()
            if "overall_assessment" not in proj:
                proj["overall_assessment"] = {}
            proj["overall_assessment"]["candidates_at"] = \
                datetime.now(JST).isoformat()
            with open(proj_path, "w", encoding="utf-8") as f:
                json.dump(proj, f, indent=2, ensure_ascii=False)

        emit("done", task=task_id, section=section_key,
             slot=slot, model=result.get("model"),
             message=f"Section '{section_key}' regenerated and merged.")
        return

    # ── Full generation (all sections) ──
    emit("progress", task=task_id, step="building_prompt", percent=40, slot=slot)

    messages = build_overall_assessment_candidates_messages(
        abstract, check_data, novelty_summary, novelty_assessment, journal_profile,
        volume=volume)

    prov = LLMProvider(
        name=slot,
        provider=provider,
        base_url=base_url,
        model=model,
        api_key=api_key,
    )

    emit("progress", task=task_id, step="calling_llm", percent=60,
         slot=slot, model=model, provider=provider)

    max_tok = 16384 if thinking_enabled else 8192
    timeout_sec = 300 if thinking_enabled else 120

    result = chat_completion(prov, messages, max_tokens=max_tok,
                             temperature=temperature,
                             timeout_seconds=timeout_sec,
                             thinking_enabled=thinking_enabled)

    if not result["ok"]:
        error("LLM_CALL_FAILED",
              f"LLM call failed: {result.get('error', 'Unknown error')}")

    emit("progress", task=task_id, step="parsing", percent=80,
         slot=slot, latency_ms=result.get("latency_ms"))

    # Parse JSON
    parsed = parse_llm_json(result["content"])
    if parsed is None:
        raw_content = result.get("content", "")
        preview = raw_content[:500] if raw_content else "(content empty)"
        error("PARSE_ERROR",
              f"Failed to parse LLM response as JSON. "
              f"Raw content (first 500 chars): {preview}")

    # Validate structure
    if "sections" not in parsed:
        error("INVALID_RESPONSE",
              "LLM response missing 'sections' key.")

    # Write output file
    out_dir = os.path.join(project_dir, "outputs", "final", "_data")
    os.makedirs(out_dir, exist_ok=True)

    now = datetime.now(JST)

    candidates_path = os.path.join(out_dir, "overall_assessment_candidates.json")
    output_data = {
        "generated_at": now.isoformat(),
        "model": result.get("model"),
        "sections": parsed["sections"],
    }
    with open(candidates_path, "w", encoding="utf-8") as f:
        json.dump(output_data, f, indent=2, ensure_ascii=False)

    # Also save the selection with default (all recommendation=high selected)
    selection_path = os.path.join(out_dir, "overall_assessment_selection.json")
    selected_ids = []
    for section_key, section in parsed["sections"].items():
        for c in section.get("candidates", []):
            if c.get("recommendation") == "high":
                selected_ids.append(c["id"])
    selection_data = {"selected_ids": selected_ids}
    with open(selection_path, "w", encoding="utf-8") as f:
        json.dump(selection_data, f, indent=2, ensure_ascii=False)

    # Update project timestamp
    proj_path = os.path.join(project_dir, "project.json")
    if os.path.isfile(proj_path):
        with open(proj_path, "r", encoding="utf-8") as f:
            proj = json.load(f)
        proj["updated_at"] = now.isoformat()
        proj.setdefault("overall_assessment", {})["candidates_at"] = now.isoformat()
        with open(proj_path, "w", encoding="utf-8") as f:
            json.dump(proj, f, indent=2, ensure_ascii=False)

    # Count candidates per section
    section_counts = {}
    for sk, s in parsed["sections"].items():
        section_counts[sk] = len(s.get("candidates", []))

    emit("done", task=task_id, slot=slot, model=result.get("model"),
         content=json.dumps(output_data, ensure_ascii=False),
         section_counts=section_counts,
         default_selected=len(selected_ids),
         message=f"Generated {sum(section_counts.values())} candidates "
                 f"across {len(section_counts)} sections.")


@main.command(name="overall-assessment-compose")
@click.option("--project", "project_dir", required=True,
              type=click.Path(exists=True, file_okay=False, dir_okay=True))
@click.option("--slot", required=True)
@click.option("--provider", required=True)
@click.option("--base-url", default="")
@click.option("--model", required=True)
@click.option("--api-key", default="")
@click.option("--api-key-env", "api_key_env_name", default=None,
              help="Environment variable name containing the API key.")
@click.option("--selected-ids", default="",
              help="Comma-separated candidate IDs to include in the assessment.")
@click.option("--thinking-enabled", is_flag=True, default=False,
              help="Enable model thinking/reasoning.")
def overall_assessment_compose_cmd(project_dir, slot, provider, base_url,
                                    model, api_key, api_key_env_name,
                                    selected_ids, thinking_enabled):
    """Compose the final overall assessment (全体所感) from selected candidates.

    Reads the candidate list and user selection, then calls the LLM to
    generate a cohesive overall assessment in both English and Japanese.

    Saves to outputs/final/overall_assessment.md and .json.
    """
    from .llm import LLMProvider, chat_completion
    from .llm.json_repair import parse_llm_json
    from .llm.prompts import (
        build_overall_assessment_compose_messages,
        build_overall_assessment_translate_messages,
    )

    task_id = "overall-assessment-compose"
    out_dir = os.path.join(project_dir, "outputs", "final", "_data")
    os.makedirs(out_dir, exist_ok=True)

    # Resolve API key
    if api_key_env_name:
        api_key = os.environ.get(api_key_env_name)
        if not api_key:
            error("MISSING_API_KEY",
                  f"Environment variable {api_key_env_name} is not set.")
    if not api_key:
        error("MISSING_API_KEY", "No API key provided.")

    emit("progress", task=task_id, step="validate", percent=0, slot=slot)

    # Load candidates
    emit("progress", task=task_id, step="load_candidates", percent=20, slot=slot)

    candidates_path = os.path.join(out_dir, "overall_assessment_candidates.json")
    if not os.path.isfile(candidates_path):
        error("NO_CANDIDATES",
              "overall_assessment_candidates.json not found. "
              "Run overall-assessment-candidates first.")
    with open(candidates_path, "r", encoding="utf-8") as f:
        candidates_data = json.load(f)

    # Filter by selected IDs
    if selected_ids.strip():
        id_list = [x.strip() for x in selected_ids.split(",") if x.strip()]
    else:
        # Default: load from selection file
        selection_path = os.path.join(out_dir, "overall_assessment_selection.json")
        if os.path.isfile(selection_path):
            with open(selection_path, "r", encoding="utf-8") as f:
                sel = json.load(f)
            id_list = sel.get("selected_ids", [])
        else:
            # Fallback: select all recommendation=high
            id_list = []
            for sk, s in candidates_data.get("sections", {}).items():
                for c in s.get("candidates", []):
                    if c.get("recommendation") == "high":
                        id_list.append(c["id"])

    if not id_list:
        error("NO_SELECTED_CANDIDATES",
              "No candidates selected. Provide --selected-ids or "
              "ensure the selection file has selected_ids.")

    # Build filtered candidates JSON
    filtered_candidates = {}
    for sk, s in candidates_data.get("sections", {}).items():
        filtered = [c for c in s.get("candidates", []) if c.get("id") in id_list]
        if filtered:
            filtered_candidates[sk] = {
                "label_ja": s.get("label_ja", sk),
                "label_en": s.get("label_en", sk),
                "candidates": filtered,
            }

    selected_json = json.dumps(filtered_candidates, ensure_ascii=False, indent=2)

    # Load abstract
    abstract = None
    abstract_path = os.path.join(project_dir, "sections", "abstract.txt")
    if os.path.isfile(abstract_path):
        with open(abstract_path, "r", encoding="utf-8") as f:
            abstract = f.read().strip()

    # Load free text
    free_text = None
    free_text_path = os.path.join(out_dir, "free_text.md")
    if os.path.isfile(free_text_path):
        with open(free_text_path, "r", encoding="utf-8") as f:
            free_text = f.read().strip()

    # ── Step 1: Generate English assessment ──
    emit("progress", task=task_id, step="building_prompt", percent=30, slot=slot)

    messages = build_overall_assessment_compose_messages(
        selected_json, abstract, free_text)

    prov = LLMProvider(
        name=slot,
        provider=provider,
        base_url=base_url,
        model=model,
        api_key=api_key,
    )

    emit("progress", task=task_id, step="composing_en", percent=40,
         slot=slot, model=model, provider=provider)

    max_tok = 16384 if thinking_enabled else 8192
    timeout_sec = 300 if thinking_enabled else 120

    result = chat_completion(prov, messages, max_tokens=max_tok,
                             temperature=0.3,
                             timeout_seconds=timeout_sec,
                             thinking_enabled=thinking_enabled)

    if not result["ok"]:
        error("LLM_CALL_FAILED",
              f"English composition failed: {result.get('error', 'Unknown error')}")

    # Parse JSON
    parsed = parse_llm_json(result["content"])
    if parsed is None:
        raw_content = result.get("content", "")
        preview = raw_content[:500] if raw_content else "(content empty)"
        error("PARSE_ERROR",
              f"Failed to parse LLM response as JSON. "
              f"Raw content (first 500 chars): {preview}")

    assessment_en = parsed.get("assessment_en", "")
    summary_en = parsed.get("summary_en", "")

    if not assessment_en:
        error("EMPTY_ASSESSMENT", "LLM returned empty English assessment.")

    # ── Step 2: Translate EN → JA ──
    emit("progress", task=task_id, step="translating_ja", percent=70,
         slot=slot)

    translate_messages = build_overall_assessment_translate_messages(
        assessment_en)

    # Use flash model if available (cheaper for translation)
    translate_result = chat_completion(
        prov, translate_messages,
        max_tokens=min(max_tok, 8192),
        temperature=0.0,
        timeout_seconds=120)

    assessment_ja = ""
    summary_ja = ""
    if translate_result["ok"]:
        assessment_ja = translate_result["content"].strip()
        # Generate short Japanese summary from the full translation
        summary_ja = assessment_ja[:300] if len(assessment_ja) > 300 else assessment_ja
    else:
        # Fallback: leave Japanese empty
        assessment_ja = ""

    # ── Save outputs ──
    emit("progress", task=task_id, step="save", percent=90, slot=slot)

    now = datetime.now(JST)

    # Write markdown
    md_path = os.path.join(out_dir, "overall_assessment.md")
    md_content = f"# 全体所感\n\n{assessment_ja}\n\n---\n\n# General Impressions\n\n{assessment_en}\n"
    with open(md_path, "w", encoding="utf-8") as f:
        f.write(md_content)

    # Write JSON with metadata
    json_path = os.path.join(out_dir, "overall_assessment.json")
    json_data = {
        "assessment_en": assessment_en,
        "assessment_ja": assessment_ja,
        "summary_en": summary_en,
        "summary_ja": summary_ja,
        "generated_at": now.isoformat(),
        "model": result.get("model"),
        "translate_model": translate_result.get("model") if translate_result["ok"] else None,
        "selected_ids": id_list,
        "selected_count": len(id_list),
    }
    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(json_data, f, indent=2, ensure_ascii=False)

    # Update project timestamp
    proj_path = os.path.join(project_dir, "project.json")
    if os.path.isfile(proj_path):
        with open(proj_path, "r", encoding="utf-8") as f:
            proj = json.load(f)
        proj["updated_at"] = now.isoformat()
        proj.setdefault("overall_assessment", {})["compose_at"] = now.isoformat()
        with open(proj_path, "w", encoding="utf-8") as f:
            json.dump(proj, f, indent=2, ensure_ascii=False)

    emit("done", task=task_id, slot=slot, model=result.get("model"),
         content=json.dumps(json_data, ensure_ascii=False),
         assessment_length=len(assessment_en) + len(assessment_ja),
         selected_count=len(id_list),
         message=f"Overall assessment composed from {len(id_list)} candidates.")


@main.command(name="move-finding")
@click.option("--project", "project_dir", required=True,
              type=click.Path(exists=True, file_okay=False, dir_okay=True))
@click.option("--source-check", required=True,
              help="Source check type (structure, expression, methods_stats, logic_argument, figure_table, ethics)")
@click.option("--dest-check", required=True,
              help="Destination check type")
@click.option("--finding-id", required=True,
              help="comment_id of the finding to move (e.g., structure_003)")
def move_finding_cmd(project_dir, source_check, dest_check, finding_id):
    """Move a finding from one check type's merged.section.json to another.

    Updates the category field, re-sorts and re-numbers comments in both files,
    and regenerates the markdown output for both checks.
    """
    from peer_review_assistant.merge import _build_markdown

    # 1. Validate
    if source_check not in _VALID_CHECKS:
        error("INVALID_SOURCE_CHECK",
              f"Source check '{source_check}' is not valid. "
              f"Must be one of: {', '.join(sorted(_VALID_CHECKS))}")
    if dest_check not in _VALID_CHECKS:
        error("INVALID_DEST_CHECK",
              f"Destination check '{dest_check}' is not valid. "
              f"Must be one of: {', '.join(sorted(_VALID_CHECKS))}")
    if source_check == dest_check:
        error("SAME_CHECK",
              "Source and destination checks must be different.")

    _CATEGORY_LABELS = {
        "structure": "Structure",
        "expression": "Expression",
        "methods_stats": "Methods and Statistics",
        "logic_argument": "Logic and Argument",
        "figure_table": "Figures and Tables",
        "ethics": "Ethics and Conflict of Interest",
    }

    emit("progress", task="move-finding", step="load_source", percent=5,
         source=source_check, dest=dest_check, finding_id=finding_id)

    # 2. Load source merged.section.json
    out_dir = os.path.join(project_dir, "outputs")
    src_path = os.path.join(out_dir, source_check, "merged.section.json")
    if not os.path.isfile(src_path):
        error("NO_SOURCE_MERGED",
              f"merged.section.json not found for {source_check}. "
              "Run merge-section first.")

    with open(src_path, "r", encoding="utf-8") as f:
        src_data = json.load(f)

    # 3. Find and remove the target comment
    moved_comment = None
    new_src_comments = []
    for c in src_data.get("comments", []):
        if c.get("comment_id") == finding_id:
            moved_comment = dict(c)
        else:
            new_src_comments.append(c)

    if moved_comment is None:
        error("FINDING_NOT_FOUND",
              f"Finding with comment_id '{finding_id}' not found in "
              f"{source_check}/merged.section.json")

    emit("progress", task="move-finding", step="load_dest", percent=30,
         source=source_check, dest=dest_check, finding_id=finding_id)

    # 4. Load destination merged.section.json
    dst_path = os.path.join(out_dir, dest_check, "merged.section.json")
    if not os.path.isfile(dst_path):
        error("NO_DEST_MERGED",
              f"merged.section.json not found for {dest_check}. "
              "Run merge-section first.")

    with open(dst_path, "r", encoding="utf-8") as f:
        dst_data = json.load(f)

    # 5. Update category on moved finding
    moved_comment["category"] = _CATEGORY_LABELS.get(
        dest_check, moved_comment.get("category", ""))

    # 6. Append to destination comments
    dst_comments = list(dst_data.get("comments", []))
    dst_comments.append(moved_comment)

    # 7. Re-sort both sides (severity → confidence, same as merge_section)
    severity_order = {"major": 0, "minor": 1}
    confidence_order = {"high": 0, "medium": 1, "low": 2}

    def _sort_key(c):
        return (
            severity_order.get(c.get("severity", "minor"), 2),
            confidence_order.get(c.get("confidence", "low"), 3),
        )

    new_src_comments.sort(key=_sort_key)
    dst_comments.sort(key=_sort_key)

    # 8. Re-assign sequential IDs
    for i, c in enumerate(new_src_comments):
        c["comment_id"] = f"{source_check}_{i + 1:03d}"

    new_finding_id = None
    for i, c in enumerate(dst_comments):
        cid = f"{dest_check}_{i + 1:03d}"
        c["comment_id"] = cid
        # Track the new ID of the moved finding
        if c is moved_comment:
            new_finding_id = cid

    emit("progress", task="move-finding", step="save", percent=70,
         source=source_check, dest=dest_check,
         finding_id=finding_id, new_id=new_finding_id)

    # 9. Update and save both files
    now = datetime.now(JST)
    src_data["comments"] = new_src_comments
    src_data["generated_at"] = now.isoformat()
    dst_data["comments"] = dst_comments
    dst_data["generated_at"] = now.isoformat()

    with open(src_path, "w", encoding="utf-8") as f:
        json.dump(src_data, f, indent=2, ensure_ascii=False)
    with open(dst_path, "w", encoding="utf-8") as f:
        json.dump(dst_data, f, indent=2, ensure_ascii=False)

    # 10. Regenerate markdown for both
    for check, data in [(source_check, src_data), (dest_check, dst_data)]:
        md = _build_markdown(data)
        md_path = os.path.join(out_dir, check, "merged.section.md")
        with open(md_path, "w", encoding="utf-8") as f:
            f.write(md)

    # 11. Update project.json timestamp
    proj_path = os.path.join(project_dir, "project.json")
    if os.path.isfile(proj_path):
        with open(proj_path, "r", encoding="utf-8") as f:
            proj = json.load(f)
        proj["updated_at"] = now.isoformat()
        with open(proj_path, "w", encoding="utf-8") as f:
            json.dump(proj, f, indent=2, ensure_ascii=False)

    emit("done", task="move-finding",
         source=source_check, dest=dest_check,
         old_id=finding_id, new_id=new_finding_id,
         message=(f"Moved {finding_id} from {source_check} to "
                  f"{dest_check} (new id: {new_finding_id})."))


def _save_translations(translations_dir, sections_map, project_dir):
    """Write translations JSON and update project.json timestamp."""
    os.makedirs(translations_dir, exist_ok=True)
    now = datetime.now(JST)
    output = {
        "sections": sections_map,
        "generated_at": now.isoformat(),
    }
    out_path = os.path.join(translations_dir, "section_translations_ja.json")
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(output, f, indent=2, ensure_ascii=False)

    proj_path = os.path.join(project_dir, "project.json")
    if os.path.isfile(proj_path):
        with open(proj_path, "r", encoding="utf-8") as f:
            proj = json.load(f)
        proj["updated_at"] = now.isoformat()
        with open(proj_path, "w", encoding="utf-8") as f:
            json.dump(proj, f, indent=2, ensure_ascii=False)


TRANSLATION_SYSTEM_PROMPT = (
    "あなたは医学・心理学・社会科学分野の学術論文を正確に読むための翻訳支援AIです。\n"
    "以下の英語本文を、日本語で正確に翻訳してください。\n"
    "\n"
    "要件：\n"
    "- 原文の意味を変えない\n"
    "- 査読用なので、意訳しすぎない\n"
    "- 統計用語、尺度名、固有名詞、引用表記は保持する\n"
    "- 見出し構造を保持する\n"
    "- 省略しない\n"
    "- 原文にない解釈や評価を加えない\n"
    "- 出力は日本語訳のみ"
)


@main.command(name="translate-sections-ja")
@click.option("--project", "project_dir", required=True,
              type=click.Path(file_okay=False, writable=True),
              help="Path to the project working folder.")
@click.option("--slot", required=True,
              help="LLM slot name (e.g., summary).")
@click.option("--provider", required=True,
              help="LLM provider (e.g., openai, deepseek).")
@click.option("--base-url", required=True,
              help="LLM API base URL.")
@click.option("--model", required=True,
              help="LLM model name (use the Pro model for best translation quality).")
@click.option("--api-key", default=None,
              help="API key. Falls back to --api-key-env or PRA_LLM_KEY_<SLOT> env var.")
@click.option("--api-key-env", default=None,
              help="Environment variable name containing the API key.")
@click.option("--thinking-enabled", is_flag=True, default=False,
              help="Enable reasoning/thinking mode (Moonshot/Kimi K2.6 etc.).")
@click.option("--temperature", type=float, default=None,
              help="LLM temperature (Kimi/Moonshot auto-adjusted to 1.0).")
@click.option("--force", "force_retranslate", is_flag=True, default=False,
              help="Re-translate all sections even if hashes match existing translations.")
@click.option("--section-id", "section_id", default=None,
              help="Translate only the specified section ID (e.g., 'introduction').")
def translate_sections_ja(project_dir, slot, provider, base_url, model,
                          api_key, api_key_env, thinking_enabled,
                          temperature, force_retranslate, section_id):
    """Translate manuscript sections from English to Japanese using LLM.

    Translates each H1/H2 section independently and saves results with
    SHA-256 hashes for staleness detection. Uses the specified LLM slot's
    Pro model. Partial results are saved on error.
    """
    from peer_review_assistant.llm import LLMProvider, chat_completion

    # ── Resolve API key ──────────────────────────────────────────
    if not api_key and api_key_env:
        api_key = _get_env(api_key_env).strip()
    if not api_key:
        api_key = _get_env(f"PRA_LLM_KEY_{slot.upper()}").strip()
    if not api_key:
        error("NO_API_KEY",
              f"No API key provided. Use --api-key, --api-key-env, or set "
              f"PRA_LLM_KEY_{slot.upper()} environment variable.")

    # ── Validate project ─────────────────────────────────────────
    proj_path = os.path.join(project_dir, "project.json")
    if not os.path.isfile(proj_path):
        error("NO_PROJECT", "project.json not found. Run init-project first.")

    section_map_path = os.path.join(project_dir, "sections", "section_map.json")
    if not os.path.isfile(section_map_path):
        error("NO_SECTION_MAP",
              "sections/section_map.json not found. Run preprocess-docx first.")

    with open(section_map_path, "r", encoding="utf-8") as f:
        section_map = json.load(f)

    all_sections = section_map.get("sections", [])
    if not all_sections:
        error("NO_SECTIONS", "No sections found in section_map.json.")

    # ── Collect sections to translate ────────────────────────────
    all_sec_by_name = {s["name"]: s for s in all_sections}

    if section_id:
        # Single-section mode
        if section_id not in all_sec_by_name:
            error("BAD_SECTION_ID",
                  f"Section '{section_id}' not found in section_map.json.")
        sections_to_translate = [all_sec_by_name[section_id]]
    else:
        # Full mode: all H1 + H2 sections that have text
        priority_names = [
            "abstract", "introduction", "aim_objective",
            "methods", "results", "discussion", "conclusion",
        ]
        sections_to_translate = []
        seen = set()
        for sec in all_sections:
            name = sec["name"]
            level = sec.get("level")
            if name in priority_names or level in (0, 1, None):
                if name not in seen:
                    sections_to_translate.append(sec)
                    seen.add(name)

    # ── Load section text ────────────────────────────────────────
    # IMPORTANT: Only use the section's OWN .txt file for translation.
    # Never fall back to aggregated text (which includes children).
    # H1 sections with no direct text (e.g., "Results") will be skipped.
    sections_dir = os.path.join(project_dir, "sections")
    section_texts = {}
    for sec in sections_to_translate:
        name = sec["name"]
        path = os.path.join(sections_dir, f"{name}.txt")
        content = None
        if os.path.isfile(path):
            with open(path, "r", encoding="utf-8") as f:
                content = f.read().strip()
        if content:
            section_texts[name] = content

    if not section_texts:
        error("NO_SECTION_TEXT", "No section text files found.")

    # ── Load existing translations ───────────────────────────────
    translations_dir = os.path.join(project_dir, "translations")
    existing = {}
    existing_path = os.path.join(translations_dir, "section_translations_ja.json")
    if os.path.isfile(existing_path):
        with open(existing_path, "r", encoding="utf-8") as f:
            existing_data = json.load(f)
        existing = existing_data.get("sections", {})

    # ── Build LLM provider ───────────────────────────────────────
    prov = LLMProvider(
        name=slot,
        provider=provider,
        base_url=base_url,
        model=model,
        api_key=api_key,
    )

    # ── Translate each section ───────────────────────────────────
    translations = dict(existing)  # Preserve existing translations
    total = len([s for s in sections_to_translate if s["name"] in section_texts])
    completed = sum(
        1 for s in sections_to_translate
        if s["name"] in existing
        and existing[s["name"]].get("original_text_hash")
        == hashlib.sha256(
            section_texts.get(s["name"], "").encode("utf-8")
        ).hexdigest()
    )

    for sec in sections_to_translate:
        name = sec["name"]
        text = section_texts.get(name)
        if not text:
            continue

        text_hash = hashlib.sha256(text.encode("utf-8")).hexdigest()

        # Skip if already translated and hash matches (unless forced)
        if not force_retranslate and name in existing:
            if existing[name].get("original_text_hash") == text_hash:
                continue

        # Emit progress
        emit("progress",
             task="translate-sections-ja",
             step="translating",
             section=name,
             heading=sec.get("heading") or name,
             index=completed + 1,
             total=total)

        try:
            messages = [
                {"role": "system", "content": TRANSLATION_SYSTEM_PROMPT},
                {"role": "user",
                 "content": f"## Section: {sec.get('heading') or name}\n\n{text}"},
            ]
            # Estimate tokens: Japanese typically needs ~2x characters
            max_tok = min(len(text) * 4, 16384)
            max_tok = max(max_tok, 256)

            result = chat_completion(
                prov, messages,
                max_tokens=max_tok,
                temperature=temperature,
                timeout_seconds=120,
                thinking_enabled=thinking_enabled,
            )

            if not result["ok"]:
                # Save partial results before exiting
                _save_translations(translations_dir, translations, project_dir)
                error("LLM_TRANSLATION_FAILED",
                      f"Translation failed for section '{name}': "
                      f"{result.get('error', 'Unknown error')}")

            translations[name] = {
                "original_text_hash": text_hash,
                "translated_text": result["content"].strip() if result["content"] else "",
                "translated_at": datetime.now(JST).isoformat(),
            }
            completed += 1

            # Save after each section (incremental persistence)
            _save_translations(translations_dir, translations, project_dir)

        except Exception as e:
            _save_translations(translations_dir, translations, project_dir)
            error("LLM_TRANSLATION_FAILED",
                  f"Translation failed for section '{name}': {e}")

    emit("done",
         task="translate-sections-ja",
         sections_translated=len(translations),
         total=total,
         message=f"Translation complete: {len(translations)}/{total} sections translated.")


# ═══════════════════════════════════════════════════════════════════════════════
#  Section Translation Delete Commands
# ═══════════════════════════════════════════════════════════════════════════════

@main.command(name="delete-section-translation-ja")
@click.option("--project", "project_dir", required=True,
              type=click.Path(file_okay=False, writable=True),
              help="Path to the project working folder.")
@click.option("--section-id", required=True,
              help="Section ID whose translation to delete (e.g., 'introduction').")
def delete_section_translation_ja(project_dir, section_id):
    """Delete the Japanese translation for a specific section.

    Removes the entry from translations/section_translations_ja.json.
    If the section has no translation, emits a warning and exits cleanly.
    """
    translations_dir = os.path.join(project_dir, "translations")
    translations_path = os.path.join(translations_dir, "section_translations_ja.json")

    if not os.path.isfile(translations_path):
        emit("done", task="delete-section-translation-ja",
             section_id=section_id, deleted=False,
             message=f"No translations file found. Nothing to delete.")
        return

    with open(translations_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    sections = data.get("sections", {})
    if section_id not in sections:
        emit("done", task="delete-section-translation-ja",
             section_id=section_id, deleted=False,
             message=f"Section '{section_id}' has no translation. Nothing to delete.")
        return

    del sections[section_id]
    _save_translations(translations_dir, sections, project_dir)

    emit("done", task="delete-section-translation-ja",
         section_id=section_id, deleted=True,
         message=f"Deleted translation for section '{section_id}'.")


@main.command(name="delete-all-section-translations-ja")
@click.option("--project", "project_dir", required=True,
              type=click.Path(file_okay=False, writable=True),
              help="Path to the project working folder.")
def delete_all_section_translations_ja(project_dir):
    """Delete ALL Japanese section translations.

    Removes translations/section_translations_ja.json entirely.
    If no translations file exists, exits cleanly.
    """
    translations_path = os.path.join(
        project_dir, "translations", "section_translations_ja.json")

    if not os.path.isfile(translations_path):
        emit("done", task="delete-all-section-translations-ja",
             deleted_count=0,
             message="No translations file found. Nothing to delete.")
        return

    # Count before deleting
    with open(translations_path, "r", encoding="utf-8") as f:
        data = json.load(f)
    deleted_count = len(data.get("sections", {}))

    os.remove(translations_path)

    # Update project.json timestamp
    proj_path = os.path.join(project_dir, "project.json")
    if os.path.isfile(proj_path):
        with open(proj_path, "r", encoding="utf-8") as f:
            proj = json.load(f)
        proj["updated_at"] = datetime.now(JST).isoformat()
        with open(proj_path, "w", encoding="utf-8") as f:
            json.dump(proj, f, indent=2, ensure_ascii=False)

    emit("done", task="delete-all-section-translations-ja",
         deleted_count=deleted_count,
         message=f"Deleted all {deleted_count} section translations.")


@main.command(name="clear-check")
@click.option("--project", "project_dir", required=True,
              type=click.Path(file_okay=False, writable=True),
              help="Path to the project working folder.")
@click.option("--check", "check_name", required=True,
              help="Check name to clear (structure/expression/methods_stats/logic_argument/figure_table/ethics).")
def clear_check_cmd(project_dir, check_name):
    """Delete all cached results for a specific check so it can be re-run.

    Removes all files under outputs/{check_name}/ and resets the
    check's entry in status/task_status.json. The check output directory
    is left in place (empty) so subsequent runs can write to it.
    """
    if check_name not in _VALID_CHECKS:
        raise click.BadParameter(
            f"Invalid check name: {check_name}. "
            f"Available: {', '.join(sorted(_VALID_CHECKS))}"
        )

    out_dir = os.path.join(project_dir, "outputs", check_name)
    deleted = 0
    if os.path.isdir(out_dir):
        for f in os.listdir(out_dir):
            fp = os.path.join(out_dir, f)
            if os.path.isfile(fp):
                os.remove(fp)
                deleted += 1

    # Reset task_status for this check
    status_path = os.path.join(project_dir, "status", "task_status.json")
    if os.path.isfile(status_path):
        with open(status_path, "r", encoding="utf-8") as fh:
            task_status = json.load(fh)
        if "checks" in task_status and check_name in task_status["checks"]:
            del task_status["checks"][check_name]
        with open(status_path, "w", encoding="utf-8") as fh:
            json.dump(task_status, fh, indent=2, ensure_ascii=False)

    emit("done", task="clear-check", check_name=check_name,
         deleted_count=deleted,
         message=f"Cleared {deleted} file(s) for {check_name}")


# =========================================================================
# Novelty Check commands
# =========================================================================


@main.command(name="novelty-summarize")
@click.option("--project", "project_dir", required=True,
              type=click.Path(file_okay=False, writable=True),
              help="Path to the project working folder.")
@click.option("--target-journal", default="",
              help="Target journal name for fit assessment (optional).")
@click.option("--slot", required=True,
              help="LLM slot name (summary, reviewer1, reviewer2, reviewer3).")
@click.option("--provider", required=True,
              help="Provider name (e.g., openai, anthropic, deepseek).")
@click.option("--base-url", required=True,
              help="Base URL for the chat completions endpoint.")
@click.option("--model", required=True,
              help="Model name.")
@click.option("--api-key", default=None,
              help="API key. Falls back to --api-key-env or PRA_LLM_KEY_<SLOT> env var.")
@click.option("--api-key-env", default=None,
              help="Environment variable name containing the API key.")
@click.option("--thinking-enabled", is_flag=True, default=False,
              help="Enable the thinking/reasoning parameter in the API request.")
def novelty_summarize_cmd(project_dir, target_journal, slot, provider, base_url,
                           model, api_key, api_key_env, thinking_enabled):
    """Extract paper summary and multi-angle novelty candidates via LLM.

    Reads manuscript_full.json and section texts, then calls the LLM
    to produce a structured summary with novelty assessment from
    multiple angles (theme, sample, methods, statistics, data rarity,
    practical significance).

    Saves to outputs/novelty/novelty_summary.json.
    """
    from peer_review_assistant.llm import LLMProvider, chat_completion
    from peer_review_assistant.llm.json_repair import parse_llm_json
    from peer_review_assistant.novelty.prompts import build_novelty_summary_messages

    emit("progress", task="novelty-summarize", step="validate", percent=0, slot=slot)

    # Validate project
    proj_path = os.path.join(project_dir, "project.json")
    if not os.path.isfile(proj_path):
        error("NO_PROJECT", "project.json not found. Run init-project first.")

    # Resolve API key
    if not api_key and api_key_env:
        api_key = _get_env(api_key_env).strip()
    if not api_key:
        api_key = _get_env(f"PRA_LLM_KEY_{slot.upper()}").strip()
    if not api_key:
        error("NO_API_KEY",
              f"No API key provided. Use --api-key, --api-key-env, or set "
              f"PRA_LLM_KEY_{slot.upper()} environment variable.")

    key_info = "key=provided" if api_key else "key=missing"

    # Load manuscript data
    emit("progress", task="novelty-summarize", step="load_inputs", percent=20, slot=slot)

    manuscript_path = os.path.join(project_dir, "manuscript_full.json")
    if not os.path.isfile(manuscript_path):
        error("NO_MANUSCRIPT_JSON",
              "manuscript_full.json not found. Run preprocess-docx first.")

    with open(manuscript_path, "r", encoding="utf-8") as f:
        manuscript_data = json.load(f)

    # Load section map
    section_map = None
    section_map_path = os.path.join(project_dir, "sections", "section_map.json")
    if os.path.isfile(section_map_path):
        with open(section_map_path, "r", encoding="utf-8") as f:
            section_map = json.load(f)

    # Load section texts with aggregated fallback
    section_texts = {}
    sections_dir = os.path.join(project_dir, "sections")
    section_names = ["abstract", "introduction", "aim_objective", "methods",
                     "results", "discussion", "conclusion"]
    for name in section_names:
        path = os.path.join(sections_dir, f"{name}.txt")
        content = None
        if os.path.isfile(path):
            with open(path, "r", encoding="utf-8") as f:
                content = f.read().strip()
        if content:
            section_texts[name] = content
        elif section_map:
            sec_entry = next(
                (s for s in section_map.get("sections", [])
                 if s["name"] == name),
                None
            )
            if sec_entry and sec_entry.get("has_subsections"):
                agg_rel = sec_entry.get("aggregated_text_path")
                if agg_rel:
                    agg_abs = os.path.join(project_dir, agg_rel)
                    if os.path.isfile(agg_abs):
                        with open(agg_abs, "r", encoding="utf-8") as af:
                            agg_content = af.read().strip()
                            if agg_content:
                                section_texts[name] = agg_content

    # Build prompt
    emit("progress", task="novelty-summarize", step="building_prompt", percent=40, slot=slot)

    messages = build_novelty_summary_messages(
        manuscript_data, section_texts, section_map, target_journal)

    # Call LLM
    emit("progress", task="novelty-summarize", step="calling_llm", percent=60,
         slot=slot, model=model, provider=provider)

    prov = LLMProvider(
        name=slot,
        provider=provider,
        base_url=base_url,
        model=model,
        api_key=api_key,
    )

    result = chat_completion(prov, messages, max_tokens=16384, temperature=0.0,
                             timeout_seconds=120,
                             thinking_enabled=thinking_enabled)

    if not result["ok"]:
        _log_llm_call(project_dir, slot, "novelty-summarize", model, key_info,
                      success=False, error=result.get("error"),
                      latency_ms=result.get("latency_ms"))
        error("LLM_CONNECTION_FAILED",
              f"LLM call failed for {slot}: {result.get('error', 'Unknown error')}")

    emit("progress", task="novelty-summarize", step="parsing_response", percent=80,
         slot=slot, latency_ms=result.get("latency_ms"), usage=result.get("usage"))

    # Parse JSON response
    parsed = parse_llm_json(result["content"])
    if parsed is None:
        content_preview = (result["content"] or "")[:200]
        detail = "Model returned empty or invalid JSON content."
        if not result["content"] or not result["content"].strip():
            detail = ("Model returned empty content (all 16384 tokens may have "
                      "been consumed by reasoning). Try a higher max_tokens or "
                      "a non-reasoning model.")
        _log_llm_call(project_dir, slot, "novelty-summarize", model, key_info,
                      success=False, error="LLM_INVALID_JSON",
                      latency_ms=result.get("latency_ms"))
        error("LLM_INVALID_JSON",
              f"{detail} Content preview: {content_preview}")

    # Save output
    emit("progress", task="novelty-summarize", step="save_output", percent=90, slot=slot)

    now = datetime.now(JST)
    output = {
        "generated_at": now.isoformat(),
        "model": result.get("model"),
        "slot": slot,
        "target_journal": target_journal.strip() if target_journal else "",
        **parsed,
    }

    out_dir = os.path.join(project_dir, "outputs", "novelty")
    os.makedirs(out_dir, exist_ok=True)
    out_path = os.path.join(out_dir, "novelty_summary.json")
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(output, f, indent=2, ensure_ascii=False)

    # Log LLM call
    _log_llm_call(project_dir, slot, "novelty-summarize", model, key_info,
                  success=True, latency_ms=result.get("latency_ms"),
                  usage=result.get("usage"))

    # Update project.json timestamp
    with open(proj_path, "r", encoding="utf-8") as f:
        proj = json.load(f)
    proj["updated_at"] = now.isoformat()
    with open(proj_path, "w", encoding="utf-8") as f:
        json.dump(proj, f, indent=2, ensure_ascii=False)

    emit("done",
         task="novelty-summarize",
         slot=slot,
         model=result.get("model"),
         latency_ms=result.get("latency_ms"),
         message="Novelty summary generated successfully.")


@main.command(name="novelty-deep-research-prompt")
@click.option("--project", "project_dir", required=True,
              type=click.Path(file_okay=False, writable=True),
              help="Path to the project working folder.")
@click.option("--target-journal", default="",
              help="Target journal name (optional, overrides summary value).")
@click.option("--prompt-kind", default="both",
              type=click.Choice(["broad", "critical", "both"]),
              help="Which prompt to generate: broad (comprehensive search), "
                   "critical (verification/weakness), or both (default).")
def novelty_deep_research_prompt_cmd(project_dir, target_journal, prompt_kind):
    """Generate Deep Research prompt(s) from the novelty summary.

    Loads outputs/novelty/novelty_summary.json, fills the Deep Research
    prompt template(s), and saves to:
      - outputs/novelty/deep_research_prompt_broad.md
      - outputs/novelty/deep_research_prompt_critical.md

    This command does NOT call any LLM — it only fills templates.
    """
    from peer_review_assistant.novelty.prompts import (
        NOVELTY_DEEP_RESEARCH_PROMPT_BROAD,
        NOVELTY_DEEP_RESEARCH_PROMPT_CRITICAL,
    )

    task_id = "novelty-deep-research-prompt"
    emit("progress", task=task_id, step="validate", percent=0)

    # Validate project
    proj_path = os.path.join(project_dir, "project.json")
    if not os.path.isfile(proj_path):
        error("NO_PROJECT", "project.json not found. Run init-project first.")

    # Load novelty summary
    emit("progress", task=task_id, step="load_summary", percent=20)

    summary_path = os.path.join(project_dir, "outputs", "novelty", "novelty_summary.json")
    if not os.path.isfile(summary_path):
        error("NO_NOVELTY_SUMMARY",
              "novelty_summary.json not found. Run novelty-summarize first.")

    with open(summary_path, "r", encoding="utf-8") as f:
        summary = json.load(f)

    # Resolve target journal
    journal = (target_journal or summary.get("target_journal", "")).strip()

    # Extract fields for templates, with safe defaults
    fields = {
        "research_topic": summary.get("research_topic", "（論文から抽出できませんでした）"),
        "objective": summary.get("objective", "（論文から抽出できませんでした）"),
        "sample_summary": summary.get("sample_summary", "（記載なし）"),
        "design": summary.get("design", "（記載なし）"),
        "methods_summary": summary.get("methods_summary", "（記載なし）"),
        "measures": summary.get("measures", "（記載なし）"),
        "statistics": summary.get("statistics", "（記載なし）"),
        "findings": summary.get("findings", "（記載なし）"),
        "claimed_contributions": summary.get("claimed_contributions", "（記載なし）"),
        "target_journal": journal or "（未指定）",
    }

    out_dir = os.path.join(project_dir, "outputs", "novelty")
    os.makedirs(out_dir, exist_ok=True)

    result = {}

    # Generate broad prompt
    if prompt_kind in ("broad", "both"):
        emit("progress", task=task_id, step="fill_broad", percent=40)
        try:
            broad_text = NOVELTY_DEEP_RESEARCH_PROMPT_BROAD.format(**fields)
        except KeyError as e:
            error("TEMPLATE_FILL_FAILED",
                  f"Missing template field in broad prompt: {e}.")
        broad_path = os.path.join(out_dir, "deep_research_prompt_broad.md")
        with open(broad_path, "w", encoding="utf-8") as f:
            f.write(broad_text)
        result["prompt_broad"] = broad_text
        result["prompt_broad_length"] = len(broad_text)
        result["prompt_broad_path"] = broad_path

    # Generate critical prompt
    if prompt_kind in ("critical", "both"):
        emit("progress", task=task_id,
             step="fill_critical", percent=60 if prompt_kind == "both" else 40)
        try:
            critical_text = NOVELTY_DEEP_RESEARCH_PROMPT_CRITICAL.format(**fields)
        except KeyError as e:
            error("TEMPLATE_FILL_FAILED",
                  f"Missing template field in critical prompt: {e}.")
        critical_path = os.path.join(out_dir, "deep_research_prompt_critical.md")
        with open(critical_path, "w", encoding="utf-8") as f:
            f.write(critical_text)
        result["prompt_critical"] = critical_text
        result["prompt_critical_length"] = len(critical_text)
        result["prompt_critical_path"] = critical_path

    # Update project.json timestamp
    now = datetime.now(JST)
    with open(proj_path, "r", encoding="utf-8") as f:
        proj = json.load(f)
    proj["updated_at"] = now.isoformat()
    with open(proj_path, "w", encoding="utf-8") as f:
        json.dump(proj, f, indent=2, ensure_ascii=False)

    result["message"] = (
        f"Deep Research prompt(s) generated: {prompt_kind}. "
        f"Saved to outputs/novelty/."
    )
    emit("done", task=task_id, **result)


# ── novelty-merge-research ─────────────────────────────────────────────

@main.command(name="novelty-merge-research")
@click.option("--project", "project_dir", required=True,
              type=click.Path(file_okay=False, writable=True),
              help="Path to the project working folder.")
@click.option("--slot", required=True,
              help="LLM slot name (uses Pro model).")
@click.option("--provider", required=True,
              help="Provider name.")
@click.option("--base-url", required=True,
              help="LLM API base URL.")
@click.option("--model", required=True,
              help="LLM model name.")
@click.option("--api-key", default=None,
              help="LLM API key (direct value).")
@click.option("--api-key-env", default=None,
              help="Environment variable name for LLM API key.")
@click.option("--thinking-enabled", is_flag=True, default=False,
              help="Enable the thinking/reasoning parameter in the API request.")
def novelty_merge_research_cmd(project_dir, slot, provider, base_url, model,
                                api_key, api_key_env, thinking_enabled):
    """Merge two Deep Research results (A and B) via LLM.

    Loads Deep Research results A and B, the novelty summary, and
    optionally the journal profile. Calls the LLM to compare, integrate,
    and structure the findings.

    Saves:
      - outputs/novelty/deep_research_merged.md  (Markdown)
      - outputs/novelty/deep_research_merged.json (structured JSON)
    """
    from peer_review_assistant.llm import LLMProvider, chat_completion
    from peer_review_assistant.novelty.prompts import build_novelty_merge_messages

    task_id = "novelty-merge-research"
    out_dir = os.path.join(project_dir, "outputs", "novelty")
    os.makedirs(out_dir, exist_ok=True)

    emit("progress", task=task_id, step="validate", percent=0)

    # Validate project
    proj_path = os.path.join(project_dir, "project.json")
    if not os.path.isfile(proj_path):
        error("NO_PROJECT", "project.json not found. Run init-project first.")

    # Resolve API key
    resolved_key = _resolve_api_key(api_key, api_key_env, slot)
    if not resolved_key:
        error("NO_API_KEY",
              f"No API key found for slot '{slot}'. "
              f"Provide --api-key or --api-key-env, or set "
              f"PRA_LLM_KEY_{slot.upper()} in the environment.")

    # Load novelty summary
    emit("progress", task=task_id, step="load_inputs", percent=10)
    summary_path = os.path.join(out_dir, "novelty_summary.json")
    if not os.path.isfile(summary_path):
        error("NO_NOVELTY_SUMMARY",
              "novelty_summary.json not found. Run novelty-summarize first.")
    with open(summary_path, "r", encoding="utf-8") as f:
        summary = json.load(f)

    # Load Deep Research A
    dr_a_path = os.path.join(out_dir, "deep_research_a.txt")
    dr_a_text = ""
    if os.path.isfile(dr_a_path):
        with open(dr_a_path, "r", encoding="utf-8") as f:
            dr_a_text = f.read()

    # Load Deep Research B
    dr_b_path = os.path.join(out_dir, "deep_research_b.txt")
    dr_b_text = ""
    if os.path.isfile(dr_b_path):
        with open(dr_b_path, "r", encoding="utf-8") as f:
            dr_b_text = f.read()

    # Load meta
    meta_path = os.path.join(out_dir, "deep_research_meta.json")
    meta = None
    if os.path.isfile(meta_path):
        with open(meta_path, "r", encoding="utf-8") as f:
            meta = json.load(f)

    # Load journal profile
    jp_path = os.path.join(project_dir, "journal_profile.json")
    journal_profile = None
    if os.path.isfile(jp_path):
        with open(jp_path, "r", encoding="utf-8") as f:
            journal_profile = json.load(f)

    has_a = bool(dr_a_text.strip())
    has_b = bool(dr_b_text.strip())

    if not has_a and not has_b:
        error("NO_DR_RESULTS",
              "Neither deep_research_a.txt nor deep_research_b.txt found. "
              "Save at least one Deep Research result first.")
    elif not has_a or not has_b:
        key_info = {
            "deep_research_count": 1,
            "note": "Only one Deep Research result available — merge is partial.",
        }
    else:
        key_info = {"deep_research_count": 2}

    # Build messages
    emit("progress", task=task_id, step="llm_call", percent=30)
    msgs = build_novelty_merge_messages(
        novelty_summary=summary,
        deep_research_a_text=dr_a_text,
        deep_research_b_text=dr_b_text,
        deep_research_meta=meta,
        journal_profile=journal_profile,
    )

    prov = LLMProvider(
        name=slot,
        provider=provider,
        base_url=base_url,
        model=model,
        api_key=resolved_key,
    )

    result = chat_completion(prov, msgs, max_tokens=8192, temperature=0.0,
                             timeout_seconds=120,
                             thinking_enabled=thinking_enabled)

    if not result["ok"]:
        _log_llm_call(project_dir, slot, "novelty-merge-research", model,
                      f"key={'provided' if resolved_key else 'missing'}",
                      success=False, error=result.get("error"),
                      latency_ms=result.get("latency_ms"))
        error("LLM_CONNECTION_FAILED",
              f"LLM call failed for {slot}: {result.get('error', 'Unknown error')}")

    raw = result["content"]

    # Save markdown
    emit("progress", task=task_id, step="save", percent=80)
    md_path = os.path.join(out_dir, "deep_research_merged.md")
    with open(md_path, "w", encoding="utf-8") as f:
        f.write(raw)

    # Try to extract structured JSON from the markdown
    merged_json = {"raw_markdown": raw, "deep_research_count": key_info["deep_research_count"]}
    try:
        # Look for JSON code fence
        fence_start = raw.find("```json")
        if fence_start >= 0:
            fence_start = raw.find("\n", fence_start) + 1
            fence_end = raw.find("```", fence_start)
            if fence_end > fence_start:
                json_text = raw[fence_start:fence_end].strip()
                parsed = json.loads(json_text)
                merged_json.update(parsed)
    except (json.JSONDecodeError, Exception):
        pass

    json_path = os.path.join(out_dir, "deep_research_merged.json")
    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(merged_json, f, indent=2, ensure_ascii=False)

    # Update project.json
    now = datetime.now(JST)
    with open(proj_path, "r", encoding="utf-8") as f:
        proj = json.load(f)
    proj.setdefault("novelty", {})["merge_research_at"] = now.isoformat()
    proj["updated_at"] = now.isoformat()
    with open(proj_path, "w", encoding="utf-8") as f:
        json.dump(proj, f, indent=2, ensure_ascii=False)

    emit("done",
         task=task_id,
         content=raw,
         merged_path=md_path,
         merged_json_path=json_path,
         deep_research_count=key_info["deep_research_count"],
         message=f"Merged {key_info['deep_research_count']} Deep Research result(s).")


@main.command(name="novelty-assess")
@click.option("--project", "project_dir", required=True,
              type=click.Path(file_okay=False, writable=True),
              help="Path to the project working folder.")
@click.option("--target-journal", default="",
              help="Target journal name (required for fit assessment).")
@click.option("--slot", required=True,
              help="LLM slot name.")
@click.option("--provider", required=True,
              help="Provider name.")
@click.option("--base-url", required=True,
              help="Base URL for the chat completions endpoint.")
@click.option("--model", required=True,
              help="Model name.")
@click.option("--api-key", default=None,
              help="API key.")
@click.option("--api-key-env", default=None,
              help="Environment variable name containing the API key.")
@click.option("--thinking-enabled", is_flag=True, default=False,
              help="Enable the thinking/reasoning parameter in the API request.")
def novelty_assess_cmd(project_dir, target_journal, slot, provider, base_url,
                        model, api_key, api_key_env, thinking_enabled):
    """Assess novelty using Deep Research results and journal profile.

    Loads novelty_summary.json, merged Deep Research (or individual A/B),
    and journal_profile.json. Calls the LLM to produce a journal-aware
    novelty assessment.

    Saves to outputs/novelty/novelty_assessment.md.
    """
    from peer_review_assistant.llm import LLMProvider, chat_completion
    from peer_review_assistant.novelty.prompts import build_novelty_assessment_messages

    task_id = "novelty-assess"
    emit("progress", task=task_id, step="validate", percent=0, slot=slot)

    # Validate project
    proj_path = os.path.join(project_dir, "project.json")
    if not os.path.isfile(proj_path):
        error("NO_PROJECT", "project.json not found. Run init-project first.")

    # Resolve API key
    if not api_key and api_key_env:
        api_key = _get_env(api_key_env).strip()
    if not api_key:
        api_key = _get_env(f"PRA_LLM_KEY_{slot.upper()}").strip()
    if not api_key:
        error("NO_API_KEY",
              f"No API key provided. Use --api-key, --api-key-env, or set "
              f"PRA_LLM_KEY_{slot.upper()} environment variable.")

    key_info = "key=provided" if api_key else "key=missing"

    # Load novelty summary
    emit("progress", task=task_id, step="load_inputs", percent=20, slot=slot)

    out_dir = os.path.join(project_dir, "outputs", "novelty")
    summary_path = os.path.join(out_dir, "novelty_summary.json")
    if not os.path.isfile(summary_path):
        error("NO_NOVELTY_SUMMARY",
              "novelty_summary.json not found. Run novelty-summarize first.")

    with open(summary_path, "r", encoding="utf-8") as f:
        novelty_summary = json.load(f)

    # Load Deep Research (prefer merged, fall back to individual)
    dr_text = ""
    dr_count = 0

    merged_path = os.path.join(out_dir, "deep_research_merged.md")
    dr_a_path = os.path.join(out_dir, "deep_research_a.txt")
    dr_b_path = os.path.join(out_dir, "deep_research_b.txt")
    dr_old_path = os.path.join(out_dir, "deep_research_input.txt")

    if os.path.isfile(merged_path):
        with open(merged_path, "r", encoding="utf-8") as f:
            dr_text = f.read()
        dr_count = 2  # merged implies 2 inputs were available
    else:
        has_a = os.path.isfile(dr_a_path)
        has_b = os.path.isfile(dr_b_path)
        if has_a:
            with open(dr_a_path, "r", encoding="utf-8") as f:
                dr_text += f.read()
            dr_count += 1
        if has_b:
            with open(dr_b_path, "r", encoding="utf-8") as f:
                if dr_text:
                    dr_text += "\n\n---\n\n"
                dr_text += f.read()
            dr_count += 1
        if dr_count == 0 and os.path.isfile(dr_old_path):
            # Legacy single file
            with open(dr_old_path, "r", encoding="utf-8") as f:
                dr_text = f.read()
            dr_count = 1

    # Load journal profile
    journal_profile = None
    jp_path = os.path.join(project_dir, "journal_profile.json")
    if os.path.isfile(jp_path):
        with open(jp_path, "r", encoding="utf-8") as f:
            journal_profile = json.load(f)

    # Resolve target journal
    journal = (target_journal or novelty_summary.get("target_journal", "")).strip()
    if not journal and journal_profile:
        journal = journal_profile.get("journal_name", "").strip()

    # Build prompt
    emit("progress", task=task_id, step="building_prompt", percent=40, slot=slot)

    messages = build_novelty_assessment_messages(
        novelty_summary=novelty_summary,
        deep_research_text=dr_text,
        journal_profile=journal_profile,
        deep_research_count=dr_count,
        target_journal=journal,
    )

    # Call LLM
    emit("progress", task=task_id, step="calling_llm", percent=60,
         slot=slot, model=model, provider=provider)

    prov = LLMProvider(
        name=slot,
        provider=provider,
        base_url=base_url,
        model=model,
        api_key=api_key,
    )

    result = chat_completion(prov, messages, max_tokens=8192, temperature=0.0,
                             timeout_seconds=120,
                             thinking_enabled=thinking_enabled)

    if not result["ok"]:
        _log_llm_call(project_dir, slot, "novelty-assess", model, key_info,
                      success=False, error=result.get("error"),
                      latency_ms=result.get("latency_ms"))
        error("LLM_CONNECTION_FAILED",
              f"LLM call failed for {slot}: {result.get('error', 'Unknown error')}")

    emit("progress", task=task_id, step="save_output", percent=90,
         slot=slot, latency_ms=result.get("latency_ms"), usage=result.get("usage"))

    # Save output (Markdown)
    now = datetime.now(JST)
    content = result["content"]

    os.makedirs(out_dir, exist_ok=True)
    out_path = os.path.join(out_dir, "novelty_assessment.md")
    with open(out_path, "w", encoding="utf-8") as f:
        f.write(content)

    # Log LLM call
    _log_llm_call(project_dir, slot, "novelty-assess", model, key_info,
                  success=True, latency_ms=result.get("latency_ms"),
                  usage=result.get("usage"))

    # Update project.json timestamp
    with open(proj_path, "r", encoding="utf-8") as f:
        proj = json.load(f)
    proj["updated_at"] = now.isoformat()
    with open(proj_path, "w", encoding="utf-8") as f:
        json.dump(proj, f, indent=2, ensure_ascii=False)

    emit("done",
         task="novelty-assess",
         slot=slot,
         model=result.get("model"),
         content=content,
         content_length=len(content),
         latency_ms=result.get("latency_ms"),
         message="Novelty assessment generated successfully.")


# ── novelty-review-comment-candidates ──────────────────────────────────

@main.command(name="novelty-review-comment-candidates")
@click.option("--project", "project_dir", required=True,
              type=click.Path(file_okay=False, writable=True),
              help="Path to the project working folder.")
@click.option("--slot", required=True,
              help="LLM slot name.")
@click.option("--provider", required=True,
              help="Provider name.")
@click.option("--base-url", required=True,
              help="Base URL for the chat completions endpoint.")
@click.option("--model", required=True,
              help="Model name.")
@click.option("--api-key", default=None,
              help="API key.")
@click.option("--api-key-env", default=None,
              help="Environment variable name containing the API key.")
@click.option("--thinking-enabled", is_flag=True, default=False,
              help="Enable the thinking/reasoning parameter in the API request.")
def novelty_review_comment_candidates_cmd(project_dir, slot, provider, base_url,
                                          model, api_key, api_key_env,
                                          thinking_enabled):
    """Generate per-item review comment candidates.

    Produces 12 candidate items (theme, sample, context, methods, measures,
    statistics, data rarity, clinical significance, theoretical contribution,
    overlap, cautions, journal-fit expression) with Japanese + English text.

    Saves to outputs/novelty/novelty_review_comment_candidates.json.
    """
    from peer_review_assistant.llm import LLMProvider, chat_completion
    from peer_review_assistant.llm.json_repair import parse_llm_json
    from peer_review_assistant.novelty.prompts import build_novelty_comment_candidates_messages

    task_id = "novelty-review-comment-candidates"
    out_dir = os.path.join(project_dir, "outputs", "novelty")
    os.makedirs(out_dir, exist_ok=True)

    emit("progress", task=task_id, step="validate", percent=0, slot=slot)

    proj_path = os.path.join(project_dir, "project.json")
    if not os.path.isfile(proj_path):
        error("NO_PROJECT", "project.json not found.")

    # Resolve API key
    resolved_key = _resolve_api_key(api_key, api_key_env, slot)
    if not resolved_key:
        error("NO_API_KEY", f"No API key for slot '{slot}'.")

    # Load inputs
    emit("progress", task=task_id, step="load_inputs", percent=20, slot=slot)

    summary_path = os.path.join(out_dir, "novelty_summary.json")
    if not os.path.isfile(summary_path):
        error("NO_NOVELTY_SUMMARY", "novelty_summary.json not found.")
    with open(summary_path, "r", encoding="utf-8") as f:
        novelty_summary = json.load(f)

    assessment_path = os.path.join(out_dir, "novelty_assessment.md")
    if not os.path.isfile(assessment_path):
        error("NO_NOVELTY_ASSESSMENT", "novelty_assessment.md not found.")
    with open(assessment_path, "r", encoding="utf-8") as f:
        novelty_assessment = f.read()

    # Load journal profile
    jp_path = os.path.join(project_dir, "journal_profile.json")
    journal_profile = None
    if os.path.isfile(jp_path):
        with open(jp_path, "r", encoding="utf-8") as f:
            journal_profile = json.load(f)

    # Build prompt
    emit("progress", task=task_id, step="building_prompt", percent=40, slot=slot)

    messages = build_novelty_comment_candidates_messages(
        novelty_summary, novelty_assessment, journal_profile)

    # Call LLM
    emit("progress", task=task_id, step="calling_llm", percent=60,
         slot=slot, model=model, provider=provider)

    prov = LLMProvider(
        name=slot, provider=provider, base_url=base_url,
        model=model, api_key=resolved_key,
    )

    result = chat_completion(prov, messages, max_tokens=8192, temperature=0.0,
                             timeout_seconds=120, thinking_enabled=thinking_enabled)

    if not result["ok"]:
        _log_llm_call(project_dir, slot, task_id, model,
                      f"key={'provided' if resolved_key else 'missing'}",
                      success=False, error=result.get("error"),
                      latency_ms=result.get("latency_ms"))
        error("LLM_CONNECTION_FAILED",
              f"LLM call failed: {result.get('error', 'Unknown error')}")

    emit("progress", task=task_id, step="parsing", percent=80,
         slot=slot, latency_ms=result.get("latency_ms"))

    # Parse JSON
    parsed = parse_llm_json(result["content"])
    if parsed is None:
        error("LLM_INVALID_JSON", "Failed to parse candidates JSON.")

    # Save
    emit("progress", task=task_id, step="save", percent=90, slot=slot)
    out_path = os.path.join(out_dir, "novelty_review_comment_candidates.json")
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(parsed, f, indent=2, ensure_ascii=False)

    now = datetime.now(JST)
    with open(proj_path, "r", encoding="utf-8") as f:
        proj = json.load(f)
    proj.setdefault("novelty", {})["comment_candidates_at"] = now.isoformat()
    proj["updated_at"] = now.isoformat()
    with open(proj_path, "w", encoding="utf-8") as f:
        json.dump(proj, f, indent=2, ensure_ascii=False)

    cand_count = len(parsed.get("candidates", []))
    emit("done", task=task_id, slot=slot, model=result.get("model"),
         content=json.dumps(parsed, ensure_ascii=False),
         candidate_count=cand_count,
         message=f"Generated {cand_count} review comment candidates.")


# ── novelty-review-comment-compose ─────────────────────────────────────

@main.command(name="novelty-review-comment-compose")
@click.option("--project", "project_dir", required=True,
              type=click.Path(file_okay=False, writable=True),
              help="Path to the project working folder.")
@click.option("--slot", required=True,
              help="LLM slot name.")
@click.option("--provider", required=True,
              help="Provider name.")
@click.option("--base-url", required=True,
              help="Base URL for the chat completions endpoint.")
@click.option("--model", required=True,
              help="Model name.")
@click.option("--api-key", default=None,
              help="API key.")
@click.option("--api-key-env", default=None,
              help="Environment variable name containing the API key.")
@click.option("--language", default="both",
              type=click.Choice(["ja", "en", "both"]),
              help="Output language(s).")
@click.option("--selected-ids", default="",
              help="Comma-separated candidate IDs to include.")
@click.option("--thinking-enabled", is_flag=True, default=False,
              help="Enable the thinking/reasoning parameter in the API request.")
def novelty_review_comment_compose_cmd(project_dir, slot, provider, base_url,
                                       model, api_key, api_key_env,
                                       language, selected_ids,
                                       thinking_enabled):
    """Compose a final review comment from selected candidates.

    Takes only the user-selected candidates and generates a cohesive
    'Novelty and Overlap' section for the final review comments.

    Saves to outputs/novelty/novelty_review_comment_final.md.
    """
    from peer_review_assistant.llm import LLMProvider, chat_completion
    from peer_review_assistant.novelty.prompts import build_novelty_comment_compose_messages

    task_id = "novelty-review-comment-compose"
    out_dir = os.path.join(project_dir, "outputs", "novelty")
    os.makedirs(out_dir, exist_ok=True)

    emit("progress", task=task_id, step="validate", percent=0, slot=slot)

    proj_path = os.path.join(project_dir, "project.json")
    if not os.path.isfile(proj_path):
        error("NO_PROJECT", "project.json not found.")

    resolved_key = _resolve_api_key(api_key, api_key_env, slot)
    if not resolved_key:
        error("NO_API_KEY", f"No API key for slot '{slot}'.")

    # Load candidates
    emit("progress", task=task_id, step="load_inputs", percent=20, slot=slot)

    candidates_path = os.path.join(out_dir, "novelty_review_comment_candidates.json")
    if not os.path.isfile(candidates_path):
        error("NO_CANDIDATES", "novelty_review_comment_candidates.json not found.")
    with open(candidates_path, "r", encoding="utf-8") as f:
        all_candidates = json.load(f)

    # Filter by selected IDs
    if selected_ids.strip():
        id_list = [x.strip() for x in selected_ids.split(",") if x.strip()]
        filtered = [
            c for c in all_candidates.get("candidates", [])
            if c.get("id") in id_list
        ]
    else:
        # Default: select candidates with recommendation high or medium
        filtered = [
            c for c in all_candidates.get("candidates", [])
            if c.get("recommendation") in ("high", "medium")
        ]

    if not filtered:
        error("NO_SELECTED_CANDIDATES",
              "No candidates match the selection criteria.")

    selected_json = json.dumps({"candidates": filtered}, ensure_ascii=False, indent=2)

    # Load journal profile
    jp_path = os.path.join(project_dir, "journal_profile.json")
    journal_profile = None
    if os.path.isfile(jp_path):
        with open(jp_path, "r", encoding="utf-8") as f:
            journal_profile = json.load(f)

    # Build prompt
    emit("progress", task=task_id, step="building_prompt", percent=40, slot=slot)

    messages = build_novelty_comment_compose_messages(
        selected_json, language, journal_profile)

    # Call LLM
    emit("progress", task=task_id, step="calling_llm", percent=60,
         slot=slot, model=model, provider=provider)

    prov = LLMProvider(
        name=slot, provider=provider, base_url=base_url,
        model=model, api_key=resolved_key,
    )

    result = chat_completion(prov, messages, max_tokens=8192, temperature=0.0,
                             timeout_seconds=120,
                             thinking_enabled=thinking_enabled)

    if not result["ok"]:
        _log_llm_call(project_dir, slot, task_id, model,
                      f"key={'provided' if resolved_key else 'missing'}",
                      success=False, error=result.get("error"),
                      latency_ms=result.get("latency_ms"))
        error("LLM_CONNECTION_FAILED",
              f"LLM call failed: {result.get('error', 'Unknown error')}")

    content = result["content"]

    # Save
    emit("progress", task=task_id, step="save", percent=90, slot=slot)
    out_path = os.path.join(out_dir, "novelty_review_comment_final.md")
    with open(out_path, "w", encoding="utf-8") as f:
        f.write(content)

    now = datetime.now(JST)
    with open(proj_path, "r", encoding="utf-8") as f:
        proj = json.load(f)
    proj.setdefault("novelty", {})["comment_compose_at"] = now.isoformat()
    proj["updated_at"] = now.isoformat()
    with open(proj_path, "w", encoding="utf-8") as f:
        json.dump(proj, f, indent=2, ensure_ascii=False)

    emit("done", task=task_id, slot=slot, model=result.get("model"),
         content=content, content_length=len(content),
         selected_count=len(filtered), language=language,
         message=f"Composed review comment from {len(filtered)} candidates ({language}).")


# ── novelty-review-comment-auto ────────────────────────────────────────

@main.command(name="novelty-review-comment-auto")
@click.option("--project", "project_dir", required=True,
              type=click.Path(file_okay=False, writable=True),
              help="Path to the project working folder.")
@click.option("--slot", required=True,
              help="LLM slot name.")
@click.option("--provider", required=True,
              help="Provider name.")
@click.option("--base-url", required=True,
              help="Base URL for the chat completions endpoint.")
@click.option("--model", required=True,
              help="Model name.")
@click.option("--api-key", default=None,
              help="API key.")
@click.option("--api-key-env", default=None,
              help="Environment variable name containing the API key.")
@click.option("--language", default="both",
              type=click.Choice(["ja", "en", "both"]),
              help="Output language(s).")
@click.option("--thinking-enabled", is_flag=True, default=False,
              help="Enable the thinking/reasoning parameter in the API request.")
def novelty_review_comment_auto_cmd(project_dir, slot, provider, base_url,
                                     model, api_key, api_key_env, language,
                                     thinking_enabled):
    """Fully automated review comment generation.

    Generates candidates, then composes a final review comment from all
    candidates with recommendation 'high' or 'medium' in one step.

    This is a convenience command that runs both candidates + compose.

    Saves to outputs/novelty/novelty_review_comment_auto.md.
    Also saves candidates to novelty_review_comment_candidates.json.
    """
    from peer_review_assistant.llm import LLMProvider, chat_completion
    from peer_review_assistant.llm.json_repair import parse_llm_json
    from peer_review_assistant.novelty.prompts import (
        build_novelty_comment_candidates_messages,
        build_novelty_comment_compose_messages,
    )

    task_id = "novelty-review-comment-auto"
    out_dir = os.path.join(project_dir, "outputs", "novelty")
    os.makedirs(out_dir, exist_ok=True)

    emit("progress", task=task_id, step="validate", percent=0, slot=slot)

    proj_path = os.path.join(project_dir, "project.json")
    if not os.path.isfile(proj_path):
        error("NO_PROJECT", "project.json not found.")

    resolved_key = _resolve_api_key(api_key, api_key_env, slot)
    if not resolved_key:
        error("NO_API_KEY", f"No API key for slot '{slot}'.")

    # Load inputs
    emit("progress", task=task_id, step="load_inputs", percent=10, slot=slot)

    summary_path = os.path.join(out_dir, "novelty_summary.json")
    if not os.path.isfile(summary_path):
        error("NO_NOVELTY_SUMMARY", "novelty_summary.json not found.")
    with open(summary_path, "r", encoding="utf-8") as f:
        novelty_summary = json.load(f)

    assessment_path = os.path.join(out_dir, "novelty_assessment.md")
    if not os.path.isfile(assessment_path):
        error("NO_NOVELTY_ASSESSMENT", "novelty_assessment.md not found.")
    with open(assessment_path, "r", encoding="utf-8") as f:
        novelty_assessment = f.read()

    jp_path = os.path.join(project_dir, "journal_profile.json")
    journal_profile = None
    if os.path.isfile(jp_path):
        with open(jp_path, "r", encoding="utf-8") as f:
            journal_profile = json.load(f)

    prov = LLMProvider(
        name=slot, provider=provider, base_url=base_url,
        model=model, api_key=resolved_key,
    )

    # Step 1: Generate candidates
    emit("progress", task=task_id, step="generating_candidates", percent=30,
         slot=slot, model=model)

    cand_msgs = build_novelty_comment_candidates_messages(
        novelty_summary, novelty_assessment, journal_profile)

    cand_result = chat_completion(prov, cand_msgs, max_tokens=8192,
                                   temperature=0.0, timeout_seconds=120,
                                   thinking_enabled=thinking_enabled)

    if not cand_result["ok"]:
        _log_llm_call(project_dir, slot, task_id, model, "key=provided",
                      success=False, error=cand_result.get("error"),
                      latency_ms=cand_result.get("latency_ms"))
        error("LLM_CONNECTION_FAILED",
              f"Candidate generation failed: {cand_result.get('error', 'Unknown')}")

    parsed = parse_llm_json(cand_result["content"])
    if parsed is None:
        error("LLM_INVALID_JSON", "Failed to parse candidates JSON.")

    # Save candidates
    cand_path = os.path.join(out_dir, "novelty_review_comment_candidates.json")
    with open(cand_path, "w", encoding="utf-8") as f:
        json.dump(parsed, f, indent=2, ensure_ascii=False)

    cand_count = len(parsed.get("candidates", []))

    # Step 2: Auto-select high+medium candidates and compose
    emit("progress", task=task_id, step="composing", percent=70,
         slot=slot, candidate_count=cand_count)

    selected = [
        c for c in parsed.get("candidates", [])
        if c.get("recommendation") in ("high", "medium")
    ]
    if not selected:
        selected = parsed.get("candidates", [])  # fallback: use all

    selected_json = json.dumps({"candidates": selected}, ensure_ascii=False, indent=2)

    comp_msgs = build_novelty_comment_compose_messages(
        selected_json, language, journal_profile)

    comp_result = chat_completion(prov, comp_msgs, max_tokens=8192,
                                   temperature=0.0, timeout_seconds=120,
                                   thinking_enabled=thinking_enabled)

    if not comp_result["ok"]:
        _log_llm_call(project_dir, slot, task_id, model, "key=provided",
                      success=False, error=comp_result.get("error"),
                      latency_ms=comp_result.get("latency_ms"))
        error("LLM_CONNECTION_FAILED",
              f"Compose failed: {comp_result.get('error', 'Unknown')}")

    content = comp_result["content"]

    # Save
    emit("progress", task=task_id, step="save", percent=90, slot=slot)
    out_path = os.path.join(out_dir, "novelty_review_comment_auto.md")
    with open(out_path, "w", encoding="utf-8") as f:
        f.write(content)

    now = datetime.now(JST)
    with open(proj_path, "r", encoding="utf-8") as f:
        proj = json.load(f)
    proj.setdefault("novelty", {})["comment_auto_at"] = now.isoformat()
    proj["updated_at"] = now.isoformat()
    with open(proj_path, "w", encoding="utf-8") as f:
        json.dump(proj, f, indent=2, ensure_ascii=False)

    emit("done", task=task_id, slot=slot, model=comp_result.get("model"),
         content=content, content_length=len(content),
         candidate_count=cand_count, selected_count=len(selected),
         language=language,
         message=f"Auto-generated review comment from {len(selected)}/{cand_count} candidates ({language}).")


# ═══════════════════════════════════════════════════════════════════════════════
#  Novelty Review: Journal Fit Assessment (for ReviewChecksPanel)
# ═══════════════════════════════════════════════════════════════════════════════

@main.command(name="novelty-review-journal-fit")
@click.option("--project", "project_dir", required=True,
              type=click.Path(file_okay=False, writable=True),
              help="Path to the project working folder.")
@click.option("--slot", required=True,
              help="LLM slot name.")
@click.option("--provider", required=True,
              help="LLM provider (e.g., openai, deepseek).")
@click.option("--base-url", required=True,
              help="LLM API base URL.")
@click.option("--model", required=True,
              help="LLM model name (pro model recommended).")
@click.option("--api-key", default=None,
              help="API key. Falls back to --api-key-env or PRA_LLM_KEY_<SLOT> env var.")
@click.option("--api-key-env", default=None,
              help="Environment variable name containing the API key.")
@click.option("--thinking-enabled", is_flag=True, default=False,
              help="Enable extended thinking (for supported models).")
@click.option("--temperature", type=float, default=None,
              help="LLM temperature (Kimi/Moonshot requires 1.0).")
def novelty_review_journal_fit_cmd(project_dir, slot, provider, base_url, model,
                                    api_key, api_key_env, thinking_enabled, temperature):
    """Generate a journal-fit assessment for the review checks panel.

    Loads novelty_summary.json, novelty_assessment.md, and journal_profile.json.
    Produces a focused assessment of whether the target journal is appropriate
    given the novelty and thematic contribution.

    Saves to outputs/novelty/novelty_review_journal_fit.md.
    """
    from peer_review_assistant.llm import LLMProvider, chat_completion
    from peer_review_assistant.novelty.prompts import build_novelty_review_journal_fit_messages

    task_id = "novelty-review-journal-fit"
    emit("progress", task=task_id, step="validate", percent=0, slot=slot)

    # Validate project
    proj_path = os.path.join(project_dir, "project.json")
    if not os.path.isfile(proj_path):
        error("NO_PROJECT", f"project.json not found: {proj_path}")
    with open(proj_path, "r", encoding="utf-8") as f:
        proj = json.load(f)

    # Resolve API key
    api_key = _resolve_api_key(api_key, api_key_env, slot)

    emit("progress", task=task_id, step="load_inputs", percent=10, slot=slot)

    # Load novelty summary (required)
    novelty_dir = os.path.join(project_dir, "outputs", "novelty")
    summary_path = os.path.join(novelty_dir, "novelty_summary.json")
    if not os.path.isfile(summary_path):
        error("NO_NOVELTY_SUMMARY",
              "novelty_summary.json not found. Run novelty-summarize first.")
    with open(summary_path, "r", encoding="utf-8") as f:
        novelty_summary = json.load(f)

    # Load novelty assessment (required)
    assessment_path = os.path.join(novelty_dir, "novelty_assessment.md")
    if not os.path.isfile(assessment_path):
        error("NO_NOVELTY_ASSESSMENT",
              "novelty_assessment.md not found. Run novelty-assess first.")
    with open(assessment_path, "r", encoding="utf-8") as f:
        novelty_assessment = f.read()

    # Load journal profile (optional)
    journal_profile = None
    jp_path = os.path.join(project_dir, "journal_profile.json")
    if os.path.isfile(jp_path):
        with open(jp_path, "r", encoding="utf-8") as f:
            journal_profile = json.load(f)

    emit("progress", task=task_id, step="building_prompt", percent=30,
         slot=slot)

    messages = build_novelty_review_journal_fit_messages(
        novelty_summary,
        novelty_assessment,
        journal_profile,
    )

    emit("progress", task=task_id, step="calling_llm", percent=60,
         slot=slot, model=model)

    prov = LLMProvider(name=slot, provider=provider, base_url=base_url,
                       model=model, api_key=api_key)
    temp = temperature if temperature is not None else 0.0
    result = chat_completion(prov, messages, max_tokens=8192, temperature=temp,
                             timeout_seconds=120,
                             thinking_enabled=thinking_enabled)

    if not result["ok"]:
        _log_llm_call(project_dir, slot, task_id, model, "key=provided",
                      False, error=result.get("error", ""))
        error("LLM_CONNECTION_FAILED",
              f"LLM call failed: {result.get('error', 'Unknown error')}")

    content = (result.get("content") or "").strip()
    if not content:
        error("EMPTY_RESPONSE", "LLM returned empty response.")

    emit("progress", task=task_id, step="save_output", percent=90, slot=slot)

    os.makedirs(novelty_dir, exist_ok=True)
    out_path = os.path.join(novelty_dir, "novelty_review_journal_fit.md")
    with open(out_path, "w", encoding="utf-8") as f:
        f.write(content)

    _log_llm_call(project_dir, slot, task_id, model, "key=provided", True)

    # Update project timestamp
    proj["updated_at"] = datetime.now(JST).isoformat()
    with open(proj_path, "w", encoding="utf-8") as f:
        json.dump(proj, f, indent=2, ensure_ascii=False)

    emit("done", task=task_id, slot=slot, model=result.get("model"),
         content=content, content_length=len(content),
         message="Journal fit assessment generated.")


@main.command(name="novelty-review-universal")
@click.option("--project", "project_dir", required=True,
              type=click.Path(file_okay=False, writable=True),
              help="Path to the project working folder.")
@click.option("--slot", required=True,
              help="LLM slot name.")
@click.option("--provider", required=True,
              help="LLM provider (e.g., openai, deepseek).")
@click.option("--base-url", required=True,
              help="LLM API base URL.")
@click.option("--model", required=True,
              help="LLM model name (pro model recommended).")
@click.option("--api-key", default=None,
              help="API key. Falls back to --api-key-env or PRA_LLM_KEY_<SLOT> env var.")
@click.option("--api-key-env", default=None,
              help="Environment variable name containing the API key.")
@click.option("--thinking-enabled", is_flag=True, default=False,
              help="Enable extended thinking (for supported models).")
@click.option("--temperature", type=float, default=None,
              help="LLM temperature (Kimi/Moonshot requires 1.0).")
def novelty_review_universal_cmd(project_dir, slot, provider, base_url, model,
                                  api_key, api_key_env, thinking_enabled, temperature):
    """Generate a universal thematic novelty assessment for the review checks panel.

    Loads novelty_summary.json and novelty_assessment.md.
    Produces a journal-agnostic thematic novelty evaluation with a journal-tier
    estimation at the top.

    Saves to outputs/novelty/novelty_review_universal.md.
    """
    from peer_review_assistant.llm import LLMProvider, chat_completion
    from peer_review_assistant.novelty.prompts import build_novelty_review_universal_messages

    task_id = "novelty-review-universal"
    emit("progress", task=task_id, step="validate", percent=0, slot=slot)

    # Validate project
    proj_path = os.path.join(project_dir, "project.json")
    if not os.path.isfile(proj_path):
        error("NO_PROJECT", f"project.json not found: {proj_path}")
    with open(proj_path, "r", encoding="utf-8") as f:
        proj = json.load(f)

    # Resolve API key
    api_key = _resolve_api_key(api_key, api_key_env, slot)

    emit("progress", task=task_id, step="load_inputs", percent=10, slot=slot)

    # Load novelty summary (required)
    novelty_dir = os.path.join(project_dir, "outputs", "novelty")
    summary_path = os.path.join(novelty_dir, "novelty_summary.json")
    if not os.path.isfile(summary_path):
        error("NO_NOVELTY_SUMMARY",
              "novelty_summary.json not found. Run novelty-summarize first.")
    with open(summary_path, "r", encoding="utf-8") as f:
        novelty_summary = json.load(f)

    # Load novelty assessment (required)
    assessment_path = os.path.join(novelty_dir, "novelty_assessment.md")
    if not os.path.isfile(assessment_path):
        error("NO_NOVELTY_ASSESSMENT",
              "novelty_assessment.md not found. Run novelty-assess first.")
    with open(assessment_path, "r", encoding="utf-8") as f:
        novelty_assessment = f.read()

    emit("progress", task=task_id, step="building_prompt", percent=30,
         slot=slot)

    messages = build_novelty_review_universal_messages(
        novelty_summary,
        novelty_assessment,
    )

    emit("progress", task=task_id, step="calling_llm", percent=60,
         slot=slot, model=model)

    prov = LLMProvider(name=slot, provider=provider, base_url=base_url,
                       model=model, api_key=api_key)
    temp = temperature if temperature is not None else 0.0
    result = chat_completion(prov, messages, max_tokens=8192, temperature=temp,
                             timeout_seconds=120,
                             thinking_enabled=thinking_enabled)

    if not result["ok"]:
        _log_llm_call(project_dir, slot, task_id, model, "key=provided",
                      False, error=result.get("error", ""))
        error("LLM_CONNECTION_FAILED",
              f"LLM call failed: {result.get('error', 'Unknown error')}")

    content = (result.get("content") or "").strip()
    if not content:
        error("EMPTY_RESPONSE", "LLM returned empty response.")

    emit("progress", task=task_id, step="save_output", percent=90, slot=slot)

    os.makedirs(novelty_dir, exist_ok=True)
    out_path = os.path.join(novelty_dir, "novelty_review_universal.md")
    with open(out_path, "w", encoding="utf-8") as f:
        f.write(content)

    _log_llm_call(project_dir, slot, task_id, model, "key=provided", True)

    # Update project timestamp
    proj["updated_at"] = datetime.now(JST).isoformat()
    with open(proj_path, "w", encoding="utf-8") as f:
        json.dump(proj, f, indent=2, ensure_ascii=False)

    emit("done", task=task_id, slot=slot, model=result.get("model"),
         content=content, content_length=len(content),
         message="Universal thematic novelty assessment generated.")


@main.command(name="novelty-review-journal-tier")
@click.option("--project", "project_dir", required=True,
              type=click.Path(file_okay=False, writable=True),
              help="Path to the project working folder.")
@click.option("--slot", required=True,
              help="LLM slot name.")
@click.option("--provider", required=True,
              help="LLM provider (e.g., openai, deepseek).")
@click.option("--base-url", required=True,
              help="LLM API base URL.")
@click.option("--model", required=True,
              help="LLM model name (pro model recommended).")
@click.option("--api-key", default=None,
              help="API key. Falls back to --api-key-env or PRA_LLM_KEY_<SLOT> env var.")
@click.option("--api-key-env", default=None,
              help="Environment variable name containing the API key.")
@click.option("--thinking-enabled", is_flag=True, default=False,
              help="Enable extended thinking (OpenAI o1/o3, Claude extended thinking).")
@click.option("--temperature", type=float, default=None,
              help="LLM temperature (Kimi/Moonshot requires 1.0).")
def novelty_review_journal_tier_cmd(project_dir, slot, provider, base_url, model,
                                     api_key, api_key_env, thinking_enabled, temperature):
    """Generate a journal tier estimation for the review checks panel.

    Loads novelty_summary.json and novelty_assessment.md.
    Produces an estimated journal tier based solely on thematic novelty.

    Saves to outputs/novelty/novelty_review_journal_tier.md.
    """
    from peer_review_assistant.llm import LLMProvider, chat_completion
    from peer_review_assistant.novelty.prompts import build_novelty_review_journal_tier_messages

    task_id = "novelty-review-journal-tier"
    emit("progress", task=task_id, step="validate", percent=0, slot=slot)

    # Validate project
    proj_path = os.path.join(project_dir, "project.json")
    if not os.path.isfile(proj_path):
        error("NO_PROJECT", f"project.json not found: {proj_path}")
    with open(proj_path, "r", encoding="utf-8") as f:
        proj = json.load(f)

    # Resolve API key
    api_key = _resolve_api_key(api_key, api_key_env, slot)

    emit("progress", task=task_id, step="load_inputs", percent=10, slot=slot)

    # Load novelty summary (required)
    novelty_dir = os.path.join(project_dir, "outputs", "novelty")
    summary_path = os.path.join(novelty_dir, "novelty_summary.json")
    if not os.path.isfile(summary_path):
        error("NO_SUMMARY",
              f"Novelty summary not found: {summary_path}. Run phase 5 assessment first.")
    with open(summary_path, "r", encoding="utf-8") as f:
        novelty_summary = json.load(f)

    # Load novelty assessment (required)
    assess_path = os.path.join(novelty_dir, "novelty_assessment.md")
    if not os.path.isfile(assess_path):
        error("NO_ASSESSMENT",
              f"Novelty assessment not found: {assess_path}. Run phase 5 assessment first.")
    with open(assess_path, "r", encoding="utf-8") as f:
        novelty_assessment = f.read()

    emit("progress", task=task_id, step="calling_llm", percent=30, slot=slot)

    # Build messages
    messages = build_novelty_review_journal_tier_messages(
        novelty_summary=novelty_summary,
        novelty_assessment=novelty_assessment,
    )

    # Call LLM
    prov = LLMProvider(name=slot, provider=provider, base_url=base_url, model=model, api_key=api_key)
    temp = 0.0
    temp = temperature if temperature is not None else 0.0
    if thinking_enabled:
        prov.thinking_enabled = True
        if temperature is None:
            temp = 0.1
    result = chat_completion(prov, messages, max_tokens=8192, temperature=temp, timeout_seconds=120)

    if not result["ok"]:
        error("LLM_CONNECTION_FAILED",
              f"LLM call failed: {result.get('error', 'Unknown error')}")

    content = (result.get("content") or "").strip()

    emit("progress", task=task_id, step="save", percent=60, slot=slot)

    # Save to outputs/novelty/novelty_review_journal_tier.md
    out_path = os.path.join(novelty_dir, "novelty_review_journal_tier.md")
    with open(out_path, "w", encoding="utf-8") as f:
        f.write(content)

    _log_llm_call(project_dir, slot, task_id, model, "key=provided", True)

    # Update project timestamp
    proj["updated_at"] = datetime.now(JST).isoformat()
    with open(proj_path, "w", encoding="utf-8") as f:
        json.dump(proj, f, indent=2, ensure_ascii=False)

    emit("done", task=task_id, slot=slot, model=result.get("model"),
         content=content, content_length=len(content),
         message="Journal tier estimation generated.")


# ═══════════════════════════════════════════════════════════════════════════════
#  Journal Search: internal LLM (single-call) + external AI copy-paste (A/B merge)
# ═══════════════════════════════════════════════════════════════════════════════

# ── Internal method: single LLM call ──────────────────────────────────────

@main.command(name="novelty-find-journals")
@click.option("--project", "project_dir", required=True,
              type=click.Path(file_okay=False, writable=True),
              help="Path to the project working folder.")
@click.option("--slot", required=True,
              help="LLM slot name (e.g., summary).")
@click.option("--provider", required=True,
              help="LLM provider (e.g., openai, deepseek).")
@click.option("--base-url", required=True,
              help="LLM API base URL.")
@click.option("--model", required=True,
              help="LLM model name (pro model recommended).")
@click.option("--api-key", default=None,
              help="API key. Falls back to --api-key-env or PRA_LLM_KEY_<SLOT> env var.")
@click.option("--api-key-env", default=None,
              help="Environment variable name containing the API key.")
@click.option("--thinking-enabled", is_flag=True, default=False,
              help="Enable reasoning/thinking mode.")
@click.option("--temperature", type=float, default=None,
              help="LLM temperature (Kimi/Moonshot requires 1.0).")
def novelty_find_journals_cmd(project_dir, slot, provider, base_url, model,
                               api_key, api_key_env, thinking_enabled, temperature):
    """Internal method: single LLM call to find suitable journals.

    Reads novelty_summary.json and novelty_review_journal_tier.md.
    One LLM call produces a JSON array + Markdown table directly.

    Saves to outputs/novelty/novelty_find_journals_merged.json and .md.
    """
    from peer_review_assistant.llm import LLMProvider, chat_completion
    from peer_review_assistant.llm.json_repair import parse_llm_json
    from peer_review_assistant.novelty.prompts import build_novelty_find_journals_messages

    task_id = "novelty-find-journals"
    emit("progress", task=task_id, step="validate", percent=0, slot=slot)

    # Validate project
    proj_path = os.path.join(project_dir, "project.json")
    if not os.path.isfile(proj_path):
        error("NO_PROJECT", f"project.json not found: {proj_path}")
    with open(proj_path, "r", encoding="utf-8") as f:
        proj = json.load(f)

    # Resolve API key
    api_key = _resolve_api_key(api_key, api_key_env, slot)

    emit("progress", task=task_id, step="load_inputs", percent=10, slot=slot)

    novelty_dir = os.path.join(project_dir, "outputs", "novelty")

    # Load novelty summary (required)
    summary_path = os.path.join(novelty_dir, "novelty_summary.json")
    if not os.path.isfile(summary_path):
        error("NO_SUMMARY",
              f"Novelty summary not found: {summary_path}. Run phase 5 assessment first.")
    with open(summary_path, "r", encoding="utf-8") as f:
        novelty_summary = json.load(f)

    # Load journal tier estimation (required)
    tier_path = os.path.join(novelty_dir, "novelty_review_journal_tier.md")
    if not os.path.isfile(tier_path):
        error("NO_TIER",
              f"Journal tier estimation not found: {tier_path}. "
              f"Run novelty-review-journal-tier first.")
    with open(tier_path, "r", encoding="utf-8") as f:
        tier_estimation = f.read()

    emit("progress", task=task_id, step="calling_llm", percent=30, slot=slot)

    # Build messages
    messages = build_novelty_find_journals_messages(
        novelty_summary=novelty_summary,
        tier_estimation=tier_estimation,
    )

    # Call LLM
    prov = LLMProvider(name=slot, provider=provider, base_url=base_url, model=model, api_key=api_key)
    temp = temperature if temperature is not None else 0.0
    if thinking_enabled:
        prov.thinking_enabled = True
        if temperature is None:
            temp = 0.1
    result = chat_completion(prov, messages, max_tokens=16384, temperature=temp, timeout_seconds=180)

    if not result["ok"]:
        error("LLM_CONNECTION_FAILED",
              f"LLM call failed: {result.get('error', 'Unknown error')}")

    content = (result.get("content") or "").strip()
    if not content:
        error("LLM_EMPTY", "LLM returned empty response for journal search.")

    emit("progress", task=task_id, step="parsing", percent=70, slot=slot)

    # Parse JSON from response
    parsed = parse_llm_json(content)
    if not parsed:
        error("LLM_PARSE_FAILED",
              "Failed to parse LLM response as JSON. "
              "The model may have returned an unsupported format.")

    # Ensure it's a list
    if isinstance(parsed, dict):
        for key in ("journals", "results", "candidates", "ranked"):
            if key in parsed and isinstance(parsed[key], list):
                parsed = parsed[key]
                break
        else:
            parsed = [parsed]
    if not isinstance(parsed, list):
        error("LLM_FORMAT",
              f"Expected JSON array, got {type(parsed).__name__}")

    emit("progress", task=task_id, step="save", percent=85, slot=slot)

    # Save merged JSON
    json_path = os.path.join(novelty_dir, "novelty_find_journals_merged.json")
    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(parsed, f, indent=2, ensure_ascii=False)

    # Extract and save Markdown table from the response
    md_content = _extract_md_table(content)

    md_path = os.path.join(novelty_dir, "novelty_find_journals_merged.md")
    with open(md_path, "w", encoding="utf-8") as f:
        f.write(md_content)

    # Update task_status.json
    _update_journal_search_status(project_dir, "internal")

    _log_llm_call(project_dir, slot, task_id, model, "key=provided", True)

    # Update project timestamp
    proj["updated_at"] = datetime.now(JST).isoformat()
    with open(proj_path, "w", encoding="utf-8") as f:
        json.dump(proj, f, indent=2, ensure_ascii=False)

    emit("done", task=task_id, slot=slot, model=result.get("model"),
         count=len(parsed),
         message=f"Journal search complete ({len(parsed)} candidates).")


# ── External method: prompt generation ───────────────────────────────────

@main.command(name="novelty-journal-search-prompt")
@click.option("--project", "project_dir", required=True,
              type=click.Path(file_okay=False, writable=True),
              help="Path to the project working folder.")
def novelty_journal_search_prompt_cmd(project_dir):
    """Generate a search prompt for external AI (ChatGPT/Gemini etc.) to find journals.

    Loads novelty_summary.json and novelty_review_journal_tier.md,
    fills the JOURNAL_SEARCH_PROMPT_TEMPLATE, and saves to:
      outputs/novelty/novelty_journal_search_prompt.md

    This command does NOT call any LLM — it only fills a template.
    """
    from peer_review_assistant.novelty.prompts import JOURNAL_SEARCH_PROMPT_TEMPLATE

    task_id = "novelty-journal-search-prompt"
    emit("progress", task=task_id, step="validate", percent=0)

    # Validate project
    proj_path = os.path.join(project_dir, "project.json")
    if not os.path.isfile(proj_path):
        error("NO_PROJECT", "project.json not found. Run init-project first.")

    # Load novelty summary
    emit("progress", task=task_id, step="load_summary", percent=20)

    novelty_dir = os.path.join(project_dir, "outputs", "novelty")
    summary_path = os.path.join(novelty_dir, "novelty_summary.json")
    if not os.path.isfile(summary_path):
        error("NO_SUMMARY",
              "novelty_summary.json not found. Run phase 5 assessment first.")
    with open(summary_path, "r", encoding="utf-8") as f:
        summary = json.load(f)

    # Load journal tier estimation (required)
    emit("progress", task=task_id, step="load_tier", percent=40)

    tier_path = os.path.join(novelty_dir, "novelty_review_journal_tier.md")
    if not os.path.isfile(tier_path):
        error("NO_TIER",
              f"Journal tier estimation not found: {tier_path}. "
              f"Run novelty-review-journal-tier first.")
    with open(tier_path, "r", encoding="utf-8") as f:
        tier_estimation = f.read()

    # Extract fields with safe defaults
    emit("progress", task=task_id, step="fill_template", percent=60)

    fields = {
        "research_topic": summary.get("research_topic", "（Not extracted）"),
        "objective": summary.get("objective", "（Not extracted）"),
        "sample_summary": summary.get("sample_summary", "（Not specified）"),
        "design": summary.get("design", "（Not specified）"),
        "methods_summary": summary.get("methods_summary", "（Not specified）"),
        "findings": summary.get("findings", "（Not specified）"),
        "tier_estimation": tier_estimation,
    }

    try:
        prompt_text = JOURNAL_SEARCH_PROMPT_TEMPLATE.format(**fields)
    except KeyError as e:
        error("TEMPLATE_FILL_FAILED",
              f"Missing template field: {e}.")

    emit("progress", task=task_id, step="save", percent=80)

    out_dir = os.path.join(project_dir, "outputs", "novelty")
    os.makedirs(out_dir, exist_ok=True)
    out_path = os.path.join(out_dir, "novelty_journal_search_prompt.md")
    with open(out_path, "w", encoding="utf-8") as f:
        f.write(prompt_text)

    # Update project.json timestamp
    now = datetime.now(JST)
    with open(proj_path, "r", encoding="utf-8") as f:
        proj = json.load(f)
    proj["updated_at"] = now.isoformat()
    with open(proj_path, "w", encoding="utf-8") as f:
        json.dump(proj, f, indent=2, ensure_ascii=False)

    emit("done", task=task_id,
         prompt_length=len(prompt_text),
         message="Journal search prompt generated. Saved to outputs/novelty/.")


# ── novelty-achievement ─────────────────────────────────────────────────

@main.command(name="novelty-achievement")
@click.option("--project", "project_dir", required=True,
              type=click.Path(exists=True, file_okay=False, dir_okay=True))
@click.option("--slot", required=True)
@click.option("--provider", required=True)
@click.option("--base-url", default="")
@click.option("--model", required=True)
@click.option("--api-key", default="")
@click.option("--api-key-env", "api_key_env_name", default=None,
              help="Environment variable name containing the API key.")
@click.option("--thinking-enabled", is_flag=True, default=False,
              help="Enable model thinking/reasoning.")
def novelty_achievement_cmd(project_dir, slot, provider, base_url,
                              model, api_key, api_key_env_name,
                              thinking_enabled):
    """Evaluate whether the manuscript actually achieves its claimed novelty.

    Cross-references novelty claims with problems found in expression,
    methods/statistics, and logic/argument review checks to produce a
    5-section evaluation:
    1. Assurance of Novelty
    2. Achieved Points
    3. Unachieved Points / Problems
    4. General Impressions
    5. Publication Prospects for the top-ranked journal

    Saves to outputs/novelty/novelty_achievement.md.
    """
    from peer_review_assistant.llm import LLMProvider, chat_completion
    from peer_review_assistant.novelty.prompts import build_novelty_achievement_messages

    task_id = "novelty-achievement"
    out_dir = os.path.join(project_dir, "outputs", "novelty")
    os.makedirs(out_dir, exist_ok=True)

    emit("progress", task=task_id, step="validate", percent=0, slot=slot)

    # Resolve API key
    if api_key_env_name:
        api_key = os.environ.get(api_key_env_name)
        if not api_key:
            error("MISSING_API_KEY",
                  f"Environment variable {api_key_env_name} is not set.")
    if not api_key:
        error("MISSING_API_KEY", "No API key provided.")

    # Load novelty data
    emit("progress", task=task_id, step="load_novelty", percent=10, slot=slot)

    summary_path = os.path.join(out_dir, "novelty_summary.json")
    if not os.path.isfile(summary_path):
        error("NO_NOVELTY_SUMMARY",
              "novelty_summary.json not found. Run novelty-summarize first.")
    with open(summary_path, "r", encoding="utf-8") as f:
        novelty_summary = json.load(f)

    assessment_path = os.path.join(out_dir, "novelty_assessment.md")
    if not os.path.isfile(assessment_path):
        error("NO_NOVELTY_ASSESSMENT",
              "novelty_assessment.md not found. Run novelty-assess first.")
    with open(assessment_path, "r", encoding="utf-8") as f:
        novelty_assessment = f.read()

    # Load abstract
    abstract = None
    abstract_path = os.path.join(project_dir, "sections", "abstract.txt")
    if os.path.isfile(abstract_path):
        with open(abstract_path, "r", encoding="utf-8") as f:
            abstract = f.read().strip()

    # Load check findings from expression, methods_stats, logic_argument
    emit("progress", task=task_id, step="load_checks", percent=20, slot=slot)

    check_labels = {
        "expression": "表現 (Expression)",
        "methods_stats": "方法・統計 (Methods & Statistics)",
        "logic_argument": "論理・主張 (Logic & Argument)",
    }

    check_findings = []
    for check_name in ["expression", "methods_stats", "logic_argument"]:
        merged_path = os.path.join(
            project_dir, "outputs", check_name, "merged.section.json"
        )
        if not os.path.isfile(merged_path):
            continue

        with open(merged_path, "r", encoding="utf-8") as f:
            merged = json.load(f)

        findings = []
        for c in merged.get("comments", []):
            if c.get("severity") == "major":
                loc = c.get("location") or {}
                findings.append({
                    "comment_id": c.get("comment_id", ""),
                    "issue": (c.get("issue") or "")[:300],
                    "section": loc.get("section", "N/A"),
                    "category": c.get("category", ""),
                    "confidence": c.get("confidence", ""),
                })

        check_findings.append({
            "check_name": check_name,
            "label_ja": check_labels.get(check_name, check_name),
            "findings": findings,
        })

    if not check_findings:
        error("NO_CHECK_DATA",
              "No merged.section.json files found for expression, "
              "methods_stats, or logic_argument. Run merge-section for "
              "at least one of these check types first.")

    # Load top journal from journal search results
    emit("progress", task=task_id, step="load_journal", percent=30, slot=slot)

    top_journal = None
    journal_path = os.path.join(out_dir, "novelty_find_journals_merged.json")
    if os.path.isfile(journal_path):
        with open(journal_path, "r", encoding="utf-8") as f:
            journal_data = json.load(f)
        # Handle both list format and {"journals": [...]} format
        if isinstance(journal_data, list):
            journals = journal_data
        else:
            journals = journal_data.get("journals", [])
        if journals:
            top = journals[0]
            top_journal = {
                "journal_name": top.get("journal_name", "Unknown"),
                "impact_factor": top.get("impact_factor", "N/A"),
                "rationale": top.get("rationale", ""),
            }

    # Build messages and call LLM
    emit("progress", task=task_id, step="building_prompt", percent=40, slot=slot)

    messages = build_novelty_achievement_messages(
        novelty_summary, novelty_assessment, check_findings,
        top_journal, abstract)

    prov = LLMProvider(
        name=slot,
        provider=provider,
        base_url=base_url,
        model=model,
        api_key=api_key,
    )

    emit("progress", task=task_id, step="calling_llm", percent=60,
         slot=slot, model=model, provider=provider)

    max_tok = 16384 if thinking_enabled else 8192
    timeout_sec = 300 if thinking_enabled else 120

    result = chat_completion(prov, messages, max_tokens=max_tok,
                             temperature=0.0,
                             timeout_seconds=timeout_sec,
                             thinking_enabled=thinking_enabled)

    if not result["ok"]:
        error("LLM_CALL_FAILED",
              f"LLM call failed: {result.get('error', 'Unknown error')}")

    content = result["content"]

    emit("progress", task=task_id, step="save", percent=90, slot=slot,
         latency_ms=result.get("latency_ms"))

    # Save output
    out_path = os.path.join(out_dir, "novelty_achievement.md")
    with open(out_path, "w", encoding="utf-8") as f:
        f.write(content)

    # Update project timestamp
    now = datetime.now(JST)
    proj_path = os.path.join(project_dir, "project.json")
    if os.path.isfile(proj_path):
        with open(proj_path, "r", encoding="utf-8") as f:
            proj = json.load(f)
        proj.setdefault("novelty", {})["achievement_at"] = now.isoformat()
        proj["updated_at"] = now.isoformat()
        with open(proj_path, "w", encoding="utf-8") as f:
            json.dump(proj, f, indent=2, ensure_ascii=False)

    emit("done", task=task_id, slot=slot, model=result.get("model"),
         content=content, content_length=len(content),
         has_journal=top_journal is not None,
         check_count=len(check_findings),
         message="Novelty achievement evaluation generated.")


@main.command(name="novelty-journal-search-parse")
@click.option("--project", "project_dir", required=True,
              type=click.Path(file_okay=False, writable=True),
              help="Path to the project working folder.")
@click.option("--slot", required=True,
              help="LLM slot name for parsing (e.g., summary).")
@click.option("--provider", required=True,
              help="LLM provider (e.g., openai, deepseek).")
@click.option("--base-url", required=True,
              help="LLM API base URL.")
@click.option("--model", required=True,
              help="LLM model name (pro model recommended).")
@click.option("--api-key", default=None,
              help="API key. Falls back to --api-key-env or PRA_LLM_KEY_<SLOT> env var.")
@click.option("--api-key-env", default=None,
              help="Environment variable name containing the API key.")
@click.option("--thinking-enabled", is_flag=True, default=False,
              help="Enable reasoning/thinking mode.")
@click.option("--temperature", type=float, default=None,
              help="LLM temperature (Kimi/Moonshot requires 1.0).")
def novelty_journal_search_parse_cmd(project_dir, slot, provider, base_url, model,
                                      api_key, api_key_env, thinking_enabled, temperature):
    """Parse external AI journal search results into structured JSON + Markdown table.

    Reads novelty_summary.json, novelty_review_journal_tier.md, and
    novelty_journal_search_result.txt (user-pasted external AI results).
    Calls an LLM to parse and structure the results.

    Saves to outputs/novelty/novelty_find_journals_merged.json and .md.
    """
    from peer_review_assistant.llm import LLMProvider, chat_completion
    from peer_review_assistant.llm.json_repair import parse_llm_json
    from peer_review_assistant.novelty.prompts import build_journal_search_parse_messages

    task_id = "novelty-journal-search-parse"
    emit("progress", task=task_id, step="validate", percent=0, slot=slot)

    # Validate project
    proj_path = os.path.join(project_dir, "project.json")
    if not os.path.isfile(proj_path):
        error("NO_PROJECT", f"project.json not found: {proj_path}")
    with open(proj_path, "r", encoding="utf-8") as f:
        proj = json.load(f)

    # Resolve API key
    api_key = _resolve_api_key(api_key, api_key_env, slot)

    emit("progress", task=task_id, step="load_inputs", percent=10, slot=slot)

    novelty_dir = os.path.join(project_dir, "outputs", "novelty")

    # Load novelty summary (required)
    summary_path = os.path.join(novelty_dir, "novelty_summary.json")
    if not os.path.isfile(summary_path):
        error("NO_SUMMARY",
              f"Novelty summary not found: {summary_path}. Run phase 5 assessment first.")
    with open(summary_path, "r", encoding="utf-8") as f:
        novelty_summary = json.load(f)

    # Load journal tier estimation (required)
    tier_path = os.path.join(novelty_dir, "novelty_review_journal_tier.md")
    if not os.path.isfile(tier_path):
        error("NO_TIER",
              f"Journal tier estimation not found: {tier_path}. "
              f"Run novelty-review-journal-tier first.")
    with open(tier_path, "r", encoding="utf-8") as f:
        tier_estimation = f.read()

    # Load external AI results (at least slot A is required)
    result_a_path = os.path.join(novelty_dir, "novelty_journal_search_result_a.txt")
    result_b_path = os.path.join(novelty_dir, "novelty_journal_search_result_b.txt")

    if not os.path.isfile(result_a_path):
        error("NO_RESULT_A",
              f"External AI result A not found: {result_a_path}. "
              f"Paste the external AI's response and save first.")
    with open(result_a_path, "r", encoding="utf-8") as f:
        external_results_a = f.read()

    external_results_b = ""
    if os.path.isfile(result_b_path):
        with open(result_b_path, "r", encoding="utf-8") as f:
            external_results_b = f.read()
        emit("progress", task=task_id, step="loaded_b", percent=25, slot=slot)

    emit("progress", task=task_id, step="calling_llm", percent=30, slot=slot)

    # Build messages (coordinator merges A + B if both present)
    messages = build_journal_search_parse_messages(
        novelty_summary=novelty_summary,
        tier_estimation=tier_estimation,
        external_results_a=external_results_a,
        external_results_b=external_results_b,
    )

    # Call LLM
    prov = LLMProvider(name=slot, provider=provider, base_url=base_url, model=model, api_key=api_key)
    temp = temperature if temperature is not None else 0.0
    if thinking_enabled:
        prov.thinking_enabled = True
        if temperature is None:
            temp = 0.1
    result = chat_completion(prov, messages, max_tokens=16384, temperature=temp, timeout_seconds=180)

    if not result["ok"]:
        error("LLM_CONNECTION_FAILED",
              f"LLM call failed: {result.get('error', 'Unknown error')}")

    content = (result.get("content") or "").strip()
    if not content:
        error("LLM_EMPTY", "LLM returned empty response for journal parse.")

    emit("progress", task=task_id, step="parsing", percent=70, slot=slot)

    # Parse JSON from response
    parsed = parse_llm_json(content)
    if not parsed:
        error("LLM_PARSE_FAILED",
              "Failed to parse LLM response as JSON. "
              "The model may have returned an unsupported format.")

    # Ensure it's a list
    if isinstance(parsed, dict):
        for key in ("journals", "results", "candidates", "ranked"):
            if key in parsed and isinstance(parsed[key], list):
                parsed = parsed[key]
                break
        else:
            parsed = [parsed]
    if not isinstance(parsed, list):
        error("LLM_FORMAT",
              f"Expected JSON array, got {type(parsed).__name__}")

    emit("progress", task=task_id, step="save", percent=85, slot=slot)

    # Save merged JSON
    json_path = os.path.join(novelty_dir, "novelty_find_journals_merged.json")
    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(parsed, f, indent=2, ensure_ascii=False)

    # Extract and save Markdown table from the response
    md_content = _extract_md_table(content)

    md_path = os.path.join(novelty_dir, "novelty_find_journals_merged.md")
    with open(md_path, "w", encoding="utf-8") as f:
        f.write(md_content)

    # Update task_status.json
    _update_journal_search_status(project_dir, "external")

    _log_llm_call(project_dir, slot, task_id, model, "key=provided", True)

    # Update project timestamp
    proj["updated_at"] = datetime.now(JST).isoformat()
    with open(proj_path, "w", encoding="utf-8") as f:
        json.dump(proj, f, indent=2, ensure_ascii=False)

    emit("done", task=task_id, slot=slot, model=result.get("model"),
         count=len(parsed), json_path=json_path, md_path=md_path,
         message=f"Journal parse complete ({len(parsed)} ranked candidates).")


# ── Journal table translation (Reason → Japanese) ───────────────────────

@main.command(name="novelty-journal-search-translate")
@click.option("--project", "project_dir", required=True,
              type=click.Path(file_okay=False, writable=True),
              help="Path to the project working folder.")
@click.option("--slot", required=True,
              help="LLM slot name for translation (e.g., summary).")
@click.option("--provider", required=True,
              help="LLM provider (e.g., openai, deepseek).")
@click.option("--base-url", required=True,
              help="LLM API base URL.")
@click.option("--model", required=True,
              help="LLM model name (flash model OK for translation).")
@click.option("--api-key", default=None,
              help="API key.")
@click.option("--api-key-env", default=None,
              help="Environment variable name for API key.")
@click.option("--thinking-enabled", is_flag=True, default=False,
              help="Enable reasoning/thinking mode.")
@click.option("--temperature", type=float, default=None,
              help="LLM temperature.")
def novelty_journal_search_translate_cmd(project_dir, slot, provider, base_url, model,
                                          api_key, api_key_env, thinking_enabled, temperature):
    """Translate the Reason column of the journal candidates table to Japanese.

    Reads novelty_find_journals_merged.md, translates only the Reason column,
    and saves to novelty_find_journals_merged_ja.md.
    """
    from peer_review_assistant.llm import LLMProvider, chat_completion
    from peer_review_assistant.novelty.prompts import build_journal_search_translate_messages

    task_id = "novelty-journal-search-translate"
    emit("progress", task=task_id, step="validate", percent=0, slot=slot)

    # Validate project
    proj_path = os.path.join(project_dir, "project.json")
    if not os.path.isfile(proj_path):
        error("NO_PROJECT", f"project.json not found: {proj_path}")
    with open(proj_path, "r", encoding="utf-8") as f:
        proj = json.load(f)

    # Resolve API key
    api_key = _resolve_api_key(api_key, api_key_env, slot)

    emit("progress", task=task_id, step="load_inputs", percent=10, slot=slot)

    novelty_dir = os.path.join(project_dir, "outputs", "novelty")

    # Load EN table (required)
    en_path = os.path.join(novelty_dir, "novelty_find_journals_merged.md")
    if not os.path.isfile(en_path):
        error("NO_TABLE",
              f"Journal candidates table not found: {en_path}. "
              f"Run novelty-find-journals or novelty-journal-search-parse first.")
    with open(en_path, "r", encoding="utf-8") as f:
        en_table = f.read()

    emit("progress", task=task_id, step="calling_llm", percent=30, slot=slot)

    # Build messages
    messages = build_journal_search_translate_messages(en_table=en_table)

    # Call LLM (flash model is fine for translation)
    prov = LLMProvider(name=slot, provider=provider, base_url=base_url, model=model, api_key=api_key)
    temp = temperature if temperature is not None else 0.0
    if thinking_enabled:
        prov.thinking_enabled = True
        if temperature is None:
            temp = 0.1
    result = chat_completion(prov, messages, max_tokens=8192, temperature=temp, timeout_seconds=120)

    if not result["ok"]:
        error("LLM_CONNECTION_FAILED",
              f"LLM call failed: {result.get('error', 'Unknown error')}")

    content = (result.get("content") or "").strip()
    if not content:
        error("LLM_EMPTY", "LLM returned empty response for table translation.")

    emit("progress", task=task_id, step="save", percent=80, slot=slot)

    # Save Japanese table
    ja_path = os.path.join(novelty_dir, "novelty_find_journals_merged_ja.md")
    with open(ja_path, "w", encoding="utf-8") as f:
        f.write(content)

    _log_llm_call(project_dir, slot, task_id, model, "key=provided", True)

    # Update project timestamp
    proj["updated_at"] = datetime.now(JST).isoformat()
    with open(proj_path, "w", encoding="utf-8") as f:
        json.dump(proj, f, indent=2, ensure_ascii=False)

    emit("done", task=task_id, slot=slot, model=result.get("model"),
         message="Journal table Reason column translated to Japanese.")


# ═══════════════════════════════════════════════════════════════════════════════
#  Novelty Content Translation
# ═══════════════════════════════════════════════════════════════════════════════

@main.command(name="translate-novelty-content")
@click.option("--project", "project_dir", required=True,
              type=click.Path(file_okay=False, writable=True),
              help="Path to the project working folder.")
@click.option("--kind", "content_kind", required=True,
              type=click.Choice(["summary", "merge", "assess", "journal_fit", "universal", "journal_tier", "achievement"]),
              help="Which novelty content to translate (summary/merge/assess/novelty review: journal_fit/universal/journal_tier/achievement).")
@click.option("--slot", required=True,
              help="LLM slot name for translation model.")
@click.option("--provider", required=True,
              help="LLM provider (e.g., openai, deepseek).")
@click.option("--base-url", required=True,
              help="LLM API base URL.")
@click.option("--model", required=True,
              help="LLM model name (use a fast/cheap model for translation).")
@click.option("--api-key", default=None,
              help="API key. Falls back to --api-key-env or PRA_LLM_KEY_<SLOT> env var.")
@click.option("--api-key-env", default=None,
              help="Environment variable name containing the API key.")
def translate_novelty_content_cmd(project_dir, content_kind, slot, provider, base_url, model,
                                  api_key, api_key_env):
    """Translate novelty check content (summary/merge/assess) from English to Japanese."""
    from peer_review_assistant.llm import LLMProvider, chat_completion
    from peer_review_assistant.llm.json_repair import parse_llm_json

    task_id = "translate-novelty-content"
    emit("progress", task=task_id, step="validate", percent=0,
         kind=content_kind, slot=slot)

    # Resolve API key
    if not api_key and api_key_env:
        api_key = _get_env(api_key_env).strip()
    if not api_key:
        api_key = _get_env(f"PRA_LLM_KEY_{slot.upper()}").strip()
    if not api_key:
        error("NO_API_KEY",
              f"No API key provided for translation.")

    # Load source content
    novelty_dir = os.path.join(project_dir, "outputs", "novelty")
    src_map = {
        "summary": ("novelty_summary.json", "json"),
        "merge": ("deep_research_merged.md", "text"),
        "assess": ("novelty_assessment.md", "text"),
        "journal_fit": ("novelty_review_journal_fit.md", "text"),
        "universal": ("novelty_review_universal.md", "text"),
        "journal_tier": ("novelty_review_journal_tier.md", "text"),
        "achievement": ("novelty_achievement.md", "text"),
    }
    src_file, src_type = src_map[content_kind]
    src_path = os.path.join(novelty_dir, src_file)
    if not os.path.isfile(src_path):
        error("NO_CONTENT",
              f"Novelty content not found: {src_path}. Run the corresponding step first.")

    emit("progress", task=task_id, step="read_source", percent=20, kind=content_kind)

    if src_type == "json":
        with open(src_path, "r", encoding="utf-8") as f:
            data = json.load(f)
        # Build a readable text representation of the summary JSON
        lines = []
        for key in ["research_topic", "objective", "sample_summary", "design",
                     "methods_summary", "measures", "statistics", "findings",
                     "claimed_contributions"]:
            val = data.get(key, "")
            if val:
                label = key.replace("_", " ").title()
                lines.append(f"{label}: {val}")
        for nkey in ["novelty_theme", "novelty_sample", "novelty_methods",
                      "novelty_statistics", "novelty_data_rarity",
                      "novelty_practical_significance"]:
            val = data.get(nkey, "")
            if val and "No particular novelty" not in str(val):
                label = nkey.replace("novelty_", "").replace("_", " ").title()
                lines.append(f"{label}: {val}")
        source_text = "\n\n".join(lines)
    else:
        with open(src_path, "r", encoding="utf-8") as f:
            source_text = f.read()

    if not source_text.strip():
        emit("done", task=task_id, kind=content_kind,
             translated=False, message="No content to translate.")
        return

    emit("progress", task=task_id, step="calling_llm", percent=50,
         kind=content_kind, slot=slot, text_length=len(source_text))

    system_prompt = (
        "You are a professional academic translator specializing in medicine, psychology, "
        "and social sciences. Translate the following content from English to Japanese. "
        "Use formal academic Japanese appropriate for scholarly contexts. "
        "Preserve technical terms accurately (e.g., RCT → RCT, GEE → GEE). "
        "Preserve all Markdown formatting, JSON structure references, and section headers. "
        "Output ONLY the translated text, with no additional commentary."
    )

    user_msg = f"Translate the following {content_kind} content to Japanese:\n\n{source_text}"

    # Truncate if too long
    if len(user_msg) > 60000:
        user_msg = user_msg[:60000] + "\n\n[Content truncated for translation]"

    prov = LLMProvider(name=slot, provider=provider, base_url=base_url, model=model, api_key=api_key)
    llm_result = chat_completion(prov, [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_msg},
    ], max_tokens=16384, temperature=0.0, timeout_seconds=300)

    if not llm_result["ok"]:
        error("LLM_CONNECTION_FAILED",
              f"Translation LLM call failed: {llm_result.get('error', 'Unknown error')}")

    translated_text = (llm_result.get("content") or "").strip()

    emit("progress", task=task_id, step="save", percent=80, kind=content_kind)

    # Save translation
    out_map = {
        "summary": "novelty_summary_ja.txt",
        "merge": "merged_research_ja.md",
        "assess": "novelty_assessment_ja.md",
        "journal_fit": "novelty_review_journal_fit_ja.md",
        "universal": "novelty_review_universal_ja.md",
        "journal_tier": "novelty_review_journal_tier_ja.md",
        "achievement": "novelty_achievement_ja.md",
    }
    out_path = os.path.join(novelty_dir, out_map[content_kind])
    with open(out_path, "w", encoding="utf-8") as f:
        f.write(translated_text)

    emit("done", task=task_id, kind=content_kind, slot=slot,
         model=llm_result.get("model"),
         translated_text=translated_text,
         translated_length=len(translated_text),
         message=f"Translated {content_kind} content to Japanese ({len(translated_text)} chars).")


# ── translate-result-content ──────────────────────────────────────────

@main.command(name="translate-result-content")
@click.option("--project", "project_dir", required=True,
              type=click.Path(file_okay=False, writable=True),
              help="Path to the project working folder.")
@click.option("--kind", "content_kind", required=True,
              type=click.Choice(["overall_assessment", "verdict", "comments_to_authors"]),
              help="Which result file to translate.")
@click.option("--slot", required=True,
              help="LLM slot name for translation model.")
@click.option("--provider", required=True,
              help="LLM provider (e.g., openai, deepseek).")
@click.option("--base-url", required=True,
              help="LLM API base URL.")
@click.option("--model", required=True,
              help="LLM model name (use a fast/cheap model for translation).")
@click.option("--api-key", default=None,
              help="API key. Falls back to --api-key-env or PRA_LLM_KEY_<SLOT> env var.")
@click.option("--api-key-env", default=None,
              help="Environment variable name containing the API key.")
def translate_result_content_cmd(project_dir, content_kind, slot, provider, base_url, model,
                                  api_key, api_key_env):
    """Translate result file content from English to Japanese."""
    from peer_review_assistant.llm import LLMProvider, chat_completion

    task_id = "translate-result-content"
    emit("progress", task=task_id, step="validate", percent=0,
         kind=content_kind, slot=slot)

    # Resolve API key
    if not api_key and api_key_env:
        api_key = _get_env(api_key_env).strip()
    if not api_key:
        api_key = _get_env(f"PRA_LLM_KEY_{slot.upper()}").strip()
    if not api_key:
        error("NO_API_KEY",
              f"No API key provided for translation.")

    # Load source file
    final_dir = os.path.join(project_dir, "outputs", "final", "_data")
    file_map = {
        "overall_assessment": "overall_assessment.md",
        "verdict": "Review_comments.md",
        "comments_to_authors": "comments_to_authors.md",
    }
    src_file = file_map[content_kind]
    src_path = os.path.join(final_dir, src_file)
    if not os.path.isfile(src_path):
        error("NO_CONTENT",
              f"Result file not found: {src_path}. Generate the file first.")

    emit("progress", task=task_id, step="read_source", percent=20, kind=content_kind)

    with open(src_path, "r", encoding="utf-8") as f:
        source_text = f.read()

    # For overall_assessment.md, extract EN section (after --- separator)
    # For other files, use the whole content
    en_text = source_text
    sep_match = re.search(r"\n\n---\n\n", source_text)
    if sep_match:
        # Content after separator is the EN section
        en_text = source_text[sep_match.end():].strip()
        # Remove leading "# ..." header line if present
        en_text = re.sub(r"^#[^\n]*\n+", "", en_text)

    if not en_text.strip():
        emit("done", task=task_id, kind=content_kind,
             translated=False, message="No English content to translate.")
        return

    emit("progress", task=task_id, step="calling_llm", percent=50,
         kind=content_kind, slot=slot, text_length=len(en_text))

    system_prompt = (
        "You are a professional academic translator specializing in medicine, psychology, "
        "and social sciences. Translate the following content from English to Japanese. "
        "Use formal academic Japanese appropriate for scholarly contexts. "
        "Preserve technical terms accurately (e.g., RCT → RCT, GEE → GEE). "
        "Translate ALL text including section headers to Japanese. "
        "Preserve Markdown formatting (##, **, -, etc.) but translate the header text. "
        "For example, '## Verdict' should become '## 判定', "
        "'## Reasoning' should become '## 理由', "
        "'## Key Strengths' should become '## 主な強み', "
        "'## Key Concerns' should become '## 主な懸念'. "
        "Output ONLY the translated text, with no additional commentary."
    )

    user_msg = f"Translate the following content to Japanese:\n\n{en_text}"

    # Truncate if too long
    if len(user_msg) > 60000:
        user_msg = user_msg[:60000] + "\n\n[Content truncated for translation]"

    prov = LLMProvider(name=slot, provider=provider, base_url=base_url, model=model, api_key=api_key)
    llm_result = chat_completion(prov, [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_msg},
    ], max_tokens=16384, temperature=0.0, timeout_seconds=300)

    if not llm_result["ok"]:
        error("LLM_CONNECTION_FAILED",
              f"Translation LLM call failed: {llm_result.get('error', 'Unknown error')}")

    translated_text = (llm_result.get("content") or "").strip()

    emit("progress", task=task_id, step="save", percent=80, kind=content_kind)

    # Rebuild with JA first then EN (same format as overall_assessment)
    ja_header_map = {
        "overall_assessment": "# 全体所感",
        "verdict": "# 採否決定",
        "comments_to_authors": "# 査読コメント",
    }
    en_header_map = {
        "overall_assessment": "# General Impressions",
        "verdict": "# Publication Decision",
        "comments_to_authors": "# Comments to Authors",
    }

    ja_header = ja_header_map.get(content_kind, "# Translated")
    en_header = en_header_map.get(content_kind, "# English")

    # Try to extract existing EN header from source
    en_header_match = re.search(r"\n\n---\n\n(#.*)", source_text)
    if en_header_match:
        en_header = en_header_match.group(1)

    new_content = f"{ja_header}\n\n{translated_text}\n\n---\n\n{en_header}\n\n{en_text}\n"
    with open(src_path, "w", encoding="utf-8") as f:
        f.write(new_content)

    emit("done", task=task_id, kind=content_kind, slot=slot,
         model=llm_result.get("model"),
         translated_length=len(translated_text),
         message=f"Translated {content_kind} to Japanese ({len(translated_text)} chars).")


# ── edit-result-content ──────────────────────────────────────────────

@main.command(name="edit-result-content")
@click.option("--project", "project_dir", required=True,
              type=click.Path(file_okay=False, writable=True),
              help="Path to the project working folder.")
@click.option("--instruction", required=True,
              help="User instruction for how to modify the text.")
@click.option("--slot", required=True,
              help="LLM slot name.")
@click.option("--provider", required=True,
              help="LLM provider.")
@click.option("--base-url", required=True,
              help="LLM API base URL.")
@click.option("--model", required=True,
              help="LLM model name.")
@click.option("--api-key", default=None,
              help="API key.")
@click.option("--api-key-env", default=None,
              help="Environment variable name containing the API key.")
def edit_result_content_cmd(project_dir, instruction, slot, provider, base_url, model,
                             api_key, api_key_env):
    """Apply user instructions to edit the overall assessment."""
    from peer_review_assistant.llm import LLMProvider, chat_completion

    task_id = "edit-result-content"
    emit("progress", task=task_id, step="validate", percent=0, slot=slot)

    # Resolve API key
    if not api_key and api_key_env:
        api_key = _get_env(api_key_env).strip()
    if not api_key:
        api_key = _get_env(f"PRA_LLM_KEY_{slot.upper()}").strip()
    if not api_key:
        error("NO_API_KEY", "No API key provided.")

    # Load current assessment
    src_path = os.path.join(project_dir, "outputs", "final", "_data", "overall_assessment.md")
    if not os.path.isfile(src_path):
        error("NO_CONTENT", "overall_assessment.md not found. Generate it first.")

    with open(src_path, "r", encoding="utf-8") as f:
        current_text = f.read()

    emit("progress", task=task_id, step="calling_llm", percent=40,
         slot=slot, instruction_length=len(instruction))

    system_prompt = (
        "You are an academic editor. You are given a peer review assessment "
        "and a user instruction. Apply the instruction to modify the assessment text. "
        "You must ONLY work with the existing text — do NOT introduce new facts, "
        "references, data, or information from outside the provided text. "
        "You may adjust wording, tone, emphasis, structure, and phrasing. "
        "Preserve the overall Markdown structure (headers, sections). "
        "The assessment has two parts separated by '\\n\\n---\\n\\n': "
        "the first part is the Japanese version (# 全体所感), "
        "the second part is the English version (# General Impressions). "
        "Apply the user's instruction to BOTH language versions consistently. "
        "Output the COMPLETE modified assessment including both Japanese and English sections, "
        "with the same '\\n\\n---\\n\\n' separator between them. "
        "Output ONLY the final text, no commentary."
    )

    user_msg = (
        f"## Current assessment:\n\n{current_text}\n\n"
        f"## Instruction:\n\n{instruction}\n\n"
        f"Apply the instruction above to modify the assessment. "
        f"Return the complete modified assessment with both Japanese and English sections."
    )

    if len(user_msg) > 50000:
        user_msg = user_msg[:50000] + "\n\n[Content truncated]"

    prov = LLMProvider(name=slot, provider=provider, base_url=base_url, model=model, api_key=api_key)
    llm_result = chat_completion(prov, [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_msg},
    ], max_tokens=16384, temperature=0.3, timeout_seconds=300)

    if not llm_result["ok"]:
        error("LLM_CONNECTION_FAILED",
              f"Edit LLM call failed: {llm_result.get('error', 'Unknown error')}")

    edited_text = (llm_result.get("content") or "").strip()

    if not edited_text:
        error("EMPTY_RESULT", "LLM returned empty content.")

    # Save back
    with open(src_path, "w", encoding="utf-8") as f:
        f.write(edited_text)

    emit("done", task=task_id, slot=slot,
         model=llm_result.get("model"),
         edited_length=len(edited_text),
         message=f"Applied edit instruction ({len(edited_text)} chars).")


# ── generate-verdict ─────────────────────────────────────────────────

@main.command(name="generate-verdict")
@click.option("--project", "project_dir", required=True,
              type=click.Path(file_okay=False, writable=True),
              help="Path to the project working folder.")
@click.option("--slot", required=True,
              help="LLM slot name.")
@click.option("--provider", required=True,
              help="LLM provider.")
@click.option("--base-url", required=True,
              help="LLM API base URL.")
@click.option("--model", required=True,
              help="LLM model name.")
@click.option("--api-key", default=None,
              help="API key.")
@click.option("--api-key-env", default=None,
              help="Environment variable name containing the API key.")
@click.option("--verdict-only", is_flag=True, default=False,
              help="Generate only the Verdict section (skip Reasoning, Key Strengths, Key Concerns).")
def generate_verdict_cmd(project_dir, slot, provider, base_url, model,
                          api_key, api_key_env, verdict_only):
    """Generate an accept/reject verdict based on all review check findings."""
    from peer_review_assistant.llm import LLMProvider, chat_completion

    task_id = "generate-verdict"
    emit("progress", task=task_id, step="validate", percent=0, slot=slot)

    # Resolve API key
    if not api_key and api_key_env:
        api_key = _get_env(api_key_env).strip()
    if not api_key:
        api_key = _get_env(f"PRA_LLM_KEY_{slot.upper()}").strip()
    if not api_key:
        error("NO_API_KEY", "No API key provided.")

    # Collect all review check findings
    check_dirs = {
        "structure": "構成",
        "expression": "表現",
        "methods_stats": "方法・統計",
        "logic_argument": "論理・主張",
        "figure_table": "図表",
        "ethics": "倫理・利益相反",
    }

    all_findings_text = []
    for check_key, label_ja in check_dirs.items():
        merged_path = os.path.join(project_dir, "outputs", check_key, "merged.section.json")
        if not os.path.isfile(merged_path):
            continue
        try:
            with open(merged_path, "r", encoding="utf-8") as f:
                data = json.load(f)
            all_findings_text.append(f"## {label_ja} ({check_key})\n")
            summary = data.get("summary", "")
            if summary:
                all_findings_text.append(f"Summary: {summary}\n")
            findings = data.get("findings", [])
            if findings:
                for fi in findings:
                    sev = fi.get("severity", "")
                    issue = fi.get("issue", "")
                    category = fi.get("category", "")
                    all_findings_text.append(
                        f"- [{sev}] [{category}] {issue}"
                    )
            else:
                all_findings_text.append("(No findings)")
            all_findings_text.append("")
        except Exception:
            all_findings_text.append(f"## {label_ja} — (could not read)\n")

    # Read novelty assessment
    novelty_path = os.path.join(project_dir, "outputs", "novelty", "novelty_assessment.md")
    novelty_text = ""
    if os.path.isfile(novelty_path):
        with open(novelty_path, "r", encoding="utf-8") as f:
            novelty_text = f.read()[:3000]

    # Read novelty achievement
    achievement_path = os.path.join(project_dir, "outputs", "novelty", "novelty_achievement.md")
    achievement_text = ""
    if os.path.isfile(achievement_path):
        with open(achievement_path, "r", encoding="utf-8") as f:
            achievement_text = f.read()[:2000]

    # Read abstract
    abstract_path = os.path.join(project_dir, "outputs", "sections", "abstract.txt")
    abstract_text = ""
    if os.path.isfile(abstract_path):
        with open(abstract_path, "r", encoding="utf-8") as f:
            abstract_text = f.read()[:1500]

    findings_combined = "\n".join(all_findings_text)
    if not findings_combined.strip():
        error("NO_FINDINGS", "No review check findings found. Run review checks first.")

    emit("progress", task=task_id, step="calling_llm", percent=50, slot=slot)

    if verdict_only:
        system_prompt = (
            "You are a senior academic journal editor making a publication decision. "
            "You are given the findings from a comprehensive peer review of a manuscript, "
            "covering 構成 (Structure), 表現 (Expression), 方法・統計 (Methods & Statistics), "
            "論理・主張 (Logic & Argument), 図表 (Figures & Tables), and 倫理・利益相反 (Ethics & COI). "
            "You also have novelty assessment data. "
            "Based on ALL of these, evaluate the appropriateness of each possible verdict. "
            "Assign a confidence percentage (0-100) to each of the four options. "
            "The four percentages MUST sum to exactly 100. "
            "Consider whether the problems are fundamental (reject) or fixable (minor/major revision). "
            "Output ONLY the confidence distribution in the following format:\n\n"
            "## Verdict\n\n"
            "**Confidence Distribution:**\n\n"
            "- Accept: <percent>%\n"
            "- Minor Revision: <percent>%\n"
            "- Major Revision: <percent>%\n"
            "- Reject: <percent>%\n\n"
            "Do NOT include Reasoning, Key Strengths, or Key Concerns. "
            "Output ONLY the Verdict section with confidence distribution, no additional commentary."
        )
    else:
        system_prompt = (
            "You are a senior academic journal editor making a publication decision. "
            "You are given the findings from a comprehensive peer review of a manuscript, "
            "covering 構成 (Structure), 表現 (Expression), 方法・統計 (Methods & Statistics), "
            "論理・主張 (Logic & Argument), 図表 (Figures & Tables), and 倫理・利益相反 (Ethics & COI). "
            "You also have novelty assessment data. "
            "Based on ALL of these, make a publication recommendation. "
            "Choose one: Accept, Minor Revision, Major Revision, or Reject. "
            "Provide your reasoning, weighing the severity and number of issues across all categories. "
            "Consider whether the problems are fundamental (reject) or fixable (minor/major revision). "
            "Output in the following format:\n\n"
            "## Verdict\n\n**Verdict: [Accept / Minor Revision / Major Revision / Reject]**\n\n"
            "## Reasoning\n\n(Your detailed reasoning here, referencing specific findings)\n\n"
            "## Key Strengths\n\n- ...\n\n"
            "## Key Concerns\n\n- ...\n"
            "Output ONLY the verdict and reasoning, no additional commentary."
        )

    user_msg_parts = []
    user_msg_parts.append("## Review Check Findings\n\n")
    user_msg_parts.append(findings_combined)
    if novelty_text:
        user_msg_parts.append(f"\n## Novelty Assessment\n\n{novelty_text}\n")
    if achievement_text:
        user_msg_parts.append(f"\n## Novelty Achievement\n\n{achievement_text}\n")
    if abstract_text:
        user_msg_parts.append(f"\n## Abstract\n\n{abstract_text}\n")
    user_msg = "".join(user_msg_parts)

    if len(user_msg) > 50000:
        user_msg = user_msg[:50000] + "\n\n[Content truncated]"

    prov = LLMProvider(name=slot, provider=provider, base_url=base_url, model=model, api_key=api_key)
    llm_result = chat_completion(prov, [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_msg},
    ], max_tokens=8192, temperature=0.3, timeout_seconds=300)

    if not llm_result["ok"]:
        error("LLM_CONNECTION_FAILED",
              f"Verdict LLM call failed: {llm_result.get('error', 'Unknown error')}")

    verdict_text = (llm_result.get("content") or "").strip()

    if not verdict_text:
        error("EMPTY_RESULT", "LLM returned empty content.")

    # Save to Review_comments.md
    out_dir = os.path.join(project_dir, "outputs", "final", "_data")
    os.makedirs(out_dir, exist_ok=True)
    out_path = os.path.join(out_dir, "Review_comments.md")
    with open(out_path, "w", encoding="utf-8") as f:
        f.write(verdict_text)

    emit("done", task=task_id, slot=slot,
         model=llm_result.get("model"),
         verdict_length=len(verdict_text),
         message=f"Verdict {'(only) ' if verdict_only else ''}generated ({len(verdict_text)} chars).")


# ── generate-verdict-detail ─────────────────────────────────────────────

@main.command(name="generate-verdict-detail")
@click.option("--project", "project_dir", required=True,
              type=click.Path(file_okay=False, writable=True),
              help="Path to the project working folder.")
@click.option("--slot", required=True,
              help="LLM slot name.")
@click.option("--provider", required=True,
              help="LLM provider.")
@click.option("--base-url", required=True,
              help="LLM API base URL.")
@click.option("--model", required=True,
              help="LLM model name.")
@click.option("--api-key", default=None,
              help="API key.")
@click.option("--api-key-env", default=None,
              help="Environment variable name containing the API key.")
def generate_verdict_detail_cmd(project_dir, slot, provider, base_url, model,
                                 api_key, api_key_env):
    """Generate Reasoning, Key Strengths, and Key Concerns based on an existing Verdict."""
    from peer_review_assistant.llm import LLMProvider, chat_completion

    task_id = "generate-verdict-detail"
    emit("progress", task=task_id, step="validate", percent=0, slot=slot)

    # Read existing Verdict
    verdict_path = os.path.join(project_dir, "outputs", "final", "_data", "Review_comments.md")
    if not os.path.isfile(verdict_path):
        error("NO_CONTENT", "Review_comments.md not found. Generate the verdict first.")
    with open(verdict_path, "r", encoding="utf-8") as f:
        raw_content = f.read().strip()

    # Extract only the Verdict section — strip any existing Reasoning/KS/KC
    # so re-running doesn't duplicate content.
    # Normalize line endings first (Windows \r\n → \n)
    import re
    normalized = raw_content.replace('\r\n', '\n').replace('\r', '\n')
    verdict_only = re.split(
        r'\n(?=## (?:Reasoning|Key Strengths|Key Concerns|Verdict Confidence))',
        normalized
    )[0].strip()
    # Also strip trailing separator lines
    verdict_only = re.sub(r'\n*---\s*$', '', verdict_only).strip()

    # Resolve API key
    if not api_key and api_key_env:
        api_key = _get_env(api_key_env).strip()
    if not api_key:
        api_key = _get_env(f"PRA_LLM_KEY_{slot.upper()}").strip()
    if not api_key:
        error("NO_API_KEY", "No API key provided.")

    # Collect all review check findings (same as generate-verdict)
    check_dirs = {
        "structure": "構成",
        "expression": "表現",
        "methods_stats": "方法・統計",
        "logic_argument": "論理・主張",
        "figure_table": "図表",
        "ethics": "倫理・利益相反",
    }

    all_findings_text = []
    for check_key, label_ja in check_dirs.items():
        merged_path = os.path.join(project_dir, "outputs", check_key, "merged.section.json")
        if not os.path.isfile(merged_path):
            continue
        try:
            with open(merged_path, "r", encoding="utf-8") as f:
                data = json.load(f)
            all_findings_text.append(f"## {label_ja} ({check_key})\n")
            summary = data.get("summary", "")
            if summary:
                all_findings_text.append(f"Summary: {summary}\n")
            findings = data.get("findings", [])
            if findings:
                for fi in findings:
                    sev = fi.get("severity", "")
                    issue = fi.get("issue", "")
                    category = fi.get("category", "")
                    all_findings_text.append(
                        f"- [{sev}] [{category}] {issue}"
                    )
            else:
                all_findings_text.append("(No findings)")
            all_findings_text.append("")
        except Exception:
            all_findings_text.append(f"## {label_ja} — (could not read)\n")

    # Read novelty assessment
    novelty_path = os.path.join(project_dir, "outputs", "novelty", "novelty_assessment.md")
    novelty_text = ""
    if os.path.isfile(novelty_path):
        with open(novelty_path, "r", encoding="utf-8") as f:
            novelty_text = f.read()[:3000]

    # Read novelty achievement
    achievement_path = os.path.join(project_dir, "outputs", "novelty", "novelty_achievement.md")
    achievement_text = ""
    if os.path.isfile(achievement_path):
        with open(achievement_path, "r", encoding="utf-8") as f:
            achievement_text = f.read()[:2000]

    # Read abstract
    abstract_path = os.path.join(project_dir, "outputs", "sections", "abstract.txt")
    abstract_text = ""
    if os.path.isfile(abstract_path):
        with open(abstract_path, "r", encoding="utf-8") as f:
            abstract_text = f.read()[:1500]

    findings_combined = "\n".join(all_findings_text)
    if not findings_combined.strip():
        error("NO_FINDINGS", "No review check findings found. Run review checks first.")

    emit("progress", task=task_id, step="calling_llm", percent=50, slot=slot)

    system_prompt = (
        "You are a senior academic journal editor. "
        "You are given a Verdict (Accept/Minor Revision/Major Revision/Reject) that has already been made "
        "for a manuscript, along with the full review check findings. "
        "Your task is to write the Reasoning, Key Strengths, and Key Concerns "
        "that justify and support the given Verdict. "
        "CRITICAL: The Reasoning MUST be consistent with the specific Verdict given below. "
        "If the Verdict is Accept, write reasoning that emphasizes the manuscript's strengths and why it meets the journal's standards. "
        "If the Verdict is Minor Revision, explain what minor issues need fixing and why they don't undermine the core contribution. "
        "If the Verdict is Major Revision, detail the significant weaknesses and explain what major changes are required. "
        "If the Verdict is Reject, explain the fundamental flaws that make the manuscript unacceptable. "
        "Output in the following format:\n\n"
        "## Reasoning\n\n(Detailed reasoning referencing specific findings, explaining why this verdict was reached)\n\n"
        "## Key Strengths\n\n- ...\n\n"
        "## Key Concerns\n\n- ...\n\n"
        "Output ONLY these three sections, no additional commentary. "
        "Do NOT include a Verdict section."
    )

    user_msg_parts = []
    user_msg_parts.append("## Verdict\n\n")
    user_msg_parts.append(verdict_only)
    user_msg_parts.append("\n\n## Review Check Findings\n\n")
    user_msg_parts.append(findings_combined)
    if novelty_text:
        user_msg_parts.append(f"\n## Novelty Assessment\n\n{novelty_text}\n")
    if achievement_text:
        user_msg_parts.append(f"\n## Novelty Achievement\n\n{achievement_text}\n")
    if abstract_text:
        user_msg_parts.append(f"\n## Abstract\n\n{abstract_text}\n")
    user_msg = "".join(user_msg_parts)

    if len(user_msg) > 50000:
        user_msg = user_msg[:50000] + "\n\n[Content truncated]"

    prov = LLMProvider(name=slot, provider=provider, base_url=base_url, model=model, api_key=api_key)
    llm_result = chat_completion(prov, [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_msg},
    ], max_tokens=8192, temperature=0.3, timeout_seconds=300)

    if not llm_result["ok"]:
        error("LLM_CONNECTION_FAILED",
              f"Verdict detail LLM call failed: {llm_result.get('error', 'Unknown error')}")

    detail_text = (llm_result.get("content") or "").strip()

    if not detail_text:
        error("EMPTY_RESULT", "LLM returned empty content.")

    # Combine: verdict only + generated detail (clear old Reasoning/KS/KC)
    full_text = verdict_only + "\n\n" + detail_text

    out_dir = os.path.join(project_dir, "outputs", "final", "_data")
    os.makedirs(out_dir, exist_ok=True)
    out_path = os.path.join(out_dir, "Review_comments.md")
    with open(out_path, "w", encoding="utf-8") as f:
        f.write(full_text)

    emit("done", task=task_id, slot=slot,
         model=llm_result.get("model"),
         verdict_length=len(verdict_only),
         detail_length=len(detail_text),
         message=f"Verdict detail generated ({len(detail_text)} chars).")

@main.command(name="edit-verdict")
@click.option("--project", "project_dir", required=True,
              type=click.Path(file_okay=False, writable=True),
              help="Path to the project working folder.")
@click.option("--instruction", required=True,
              help="User instruction for how to modify the verdict.")
@click.option("--slot", required=True,
              help="LLM slot name.")
@click.option("--provider", required=True,
              help="LLM provider.")
@click.option("--base-url", required=True,
              help="LLM API base URL.")
@click.option("--model", required=True,
              help="LLM model name.")
@click.option("--api-key", default=None,
              help="API key.")
@click.option("--api-key-env", default=None,
              help="Environment variable name containing the API key.")
def edit_verdict_cmd(project_dir, instruction, slot, provider, base_url, model,
                      api_key, api_key_env):
    """Apply user instructions to edit the verdict using all review check data."""
    from peer_review_assistant.llm import LLMProvider, chat_completion

    task_id = "edit-verdict"
    emit("progress", task=task_id, step="validate", percent=0, slot=slot)

    # Resolve API key
    if not api_key and api_key_env:
        api_key = _get_env(api_key_env).strip()
    if not api_key:
        api_key = _get_env(f"PRA_LLM_KEY_{slot.upper()}").strip()
    if not api_key:
        error("NO_API_KEY", "No API key provided.")

    # Load current verdict and extract EN part for editing
    verdict_path = os.path.join(project_dir, "outputs", "final", "_data", "Review_comments.md")
    if not os.path.isfile(verdict_path):
        error("NO_CONTENT", "Review_comments.md not found. Generate the verdict first.")

    with open(verdict_path, "r", encoding="utf-8") as f:
        current_verdict = f.read()

    # Parse JA+EN bilingual format: JA above ---, EN below ---
    normalized = current_verdict.replace("\r\n", "\n")
    sep_match = re.search(r"\n\n---\n\n", normalized)
    ja_text = ""
    en_text = normalized
    if sep_match:
        before = normalized[:sep_match.start()].strip()
        after = normalized[sep_match.end():].strip()
        # Determine which side is JA vs EN
        ja_like = bool(re.search(r"[぀-ゟ゠-ヿ一-鿿]", before)) or before.startswith("# 採否決定")
        if ja_like:
            ja_text = before
            en_text = after
        else:
            ja_text = after
            en_text = before

    # Extract just the JA body (without the header line) and EN body
    ja_header = "# 採否決定"
    ja_body = ja_text
    en_header_line = "# Publication Decision"
    if ja_text.startswith("# "):
        first_nl = ja_text.find("\n")
        if first_nl >= 0:
            ja_header = ja_text[:first_nl].strip()
            ja_body = ja_text[first_nl:].strip()

    if en_text.startswith("# "):
        first_nl = en_text.find("\n")
        if first_nl >= 0:
            en_header_line = en_text[:first_nl].strip()
            en_text = en_text[first_nl:].strip()

    # Work on the EN content for editing

    # Collect all review check findings (same as generate-verdict)
    check_dirs = {
        "structure": "構成",
        "expression": "表現",
        "methods_stats": "方法・統計",
        "logic_argument": "論理・主張",
        "figure_table": "図表",
        "ethics": "倫理・利益相反",
    }

    all_findings_text = []
    for check_key, label_ja in check_dirs.items():
        merged_path = os.path.join(project_dir, "outputs", check_key, "merged.section.json")
        if not os.path.isfile(merged_path):
            continue
        try:
            with open(merged_path, "r", encoding="utf-8") as f:
                data = json.load(f)
            all_findings_text.append(f"## {label_ja} ({check_key})\n")
            summary = data.get("summary", "")
            if summary:
                all_findings_text.append(f"Summary: {summary}\n")
            findings = data.get("findings", [])
            if findings:
                for fi in findings:
                    sev = fi.get("severity", "")
                    issue = fi.get("issue", "")
                    category = fi.get("category", "")
                    all_findings_text.append(
                        f"- [{sev}] [{category}] {issue}"
                    )
            else:
                all_findings_text.append("(No findings)")
            all_findings_text.append("")
        except Exception:
            all_findings_text.append(f"## {label_ja} — (could not read)\n")

    # Read novelty assessment
    novelty_path = os.path.join(project_dir, "outputs", "novelty", "novelty_assessment.md")
    novelty_text = ""
    if os.path.isfile(novelty_path):
        with open(novelty_path, "r", encoding="utf-8") as f:
            novelty_text = f.read()[:3000]

    # Read novelty achievement
    achievement_path = os.path.join(project_dir, "outputs", "novelty", "novelty_achievement.md")
    achievement_text = ""
    if os.path.isfile(achievement_path):
        with open(achievement_path, "r", encoding="utf-8") as f:
            achievement_text = f.read()[:2000]

    # Read abstract
    abstract_path = os.path.join(project_dir, "outputs", "sections", "abstract.txt")
    abstract_text = ""
    if os.path.isfile(abstract_path):
        with open(abstract_path, "r", encoding="utf-8") as f:
            abstract_text = f.read()[:1500]

    findings_combined = "\n".join(all_findings_text)

    # Extract Verdict section (to protect from editing) and the rest
    verdict_section = ""
    editable_sections = en_text
    v_match = re.match(r"(## Verdict\s*\n\s*\*\*Verdict:.*?\*\*\s*)", en_text, re.DOTALL)
    if v_match:
        verdict_section = v_match.group(1)
        editable_sections = en_text[v_match.end():].strip()

    emit("progress", task=task_id, step="calling_llm", percent=50, slot=slot)

    system_prompt = (
        "You are a senior academic journal editor. You are given:\n"
        "1. The Reasoning, Key Strengths, and Key Concerns sections of a publication decision\n"
        "2. The complete peer review findings across 構成 (Structure), "
        "表現 (Expression), 方法・統計 (Methods & Statistics), "
        "論理・主張 (Logic & Argument), 図表 (Figures & Tables), "
        "and 倫理・利益相反 (Ethics & COI)\n"
        "3. Novelty assessment data\n\n"
        "Apply the user's instruction to modify the Reasoning, Key Strengths, "
        "and Key Concerns. "
        "Base all changes on the provided review findings and data — "
        "do NOT introduce new facts, references, or information from outside. "
        "Preserve the overall Markdown structure and section headers "
        "(## Reasoning, ## Key Strengths, ## Key Concerns). "
        "Do NOT include a ## Verdict section in your output. "
        "Output ONLY the modified Reasoning, Key Strengths, and Key Concerns "
        "in English, no additional commentary."
    )

    user_msg_parts = []
    user_msg_parts.append("## Current Reasoning, Key Strengths, and Key Concerns\n\n")
    user_msg_parts.append(editable_sections)
    user_msg_parts.append("\n\n## Review Check Findings\n\n")
    user_msg_parts.append(findings_combined)
    if novelty_text:
        user_msg_parts.append(f"\n## Novelty Assessment\n\n{novelty_text}\n")
    if achievement_text:
        user_msg_parts.append(f"\n## Novelty Achievement\n\n{achievement_text}\n")
    if abstract_text:
        user_msg_parts.append(f"\n## Abstract\n\n{abstract_text}\n")
    user_msg_parts.append(f"\n## Instruction\n\n{instruction}\n\n")
    user_msg_parts.append(
        "Apply the instruction above to modify the verdict. "
        "Return the complete modified verdict in English."
    )
    user_msg = "".join(user_msg_parts)

    if len(user_msg) > 60000:
        user_msg = user_msg[:60000] + "\n\n[Content truncated]"

    prov = LLMProvider(name=slot, provider=provider, base_url=base_url, model=model, api_key=api_key)
    llm_result = chat_completion(prov, [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_msg},
    ], max_tokens=16384, temperature=0.3, timeout_seconds=300)

    if not llm_result["ok"]:
        error("LLM_CONNECTION_FAILED",
              f"Edit verdict LLM call failed: {llm_result.get('error', 'Unknown error')}")

    edited_en = (llm_result.get("content") or "").strip()

    if not edited_en:
        error("EMPTY_RESULT", "LLM returned empty content.")

    # Re-attach the protected Verdict section
    full_en = f"{verdict_section}\n\n{edited_en}" if verdict_section else edited_en

    # Rebuild bilingual format: JA header + JA body + --- + EN header + full EN
    new_content = f"{ja_header}\n\n{ja_body}\n\n---\n\n{en_header_line}\n\n{full_en}\n"
    with open(verdict_path, "w", encoding="utf-8") as f:
        f.write(new_content)

    emit("done", task=task_id, slot=slot,
         model=llm_result.get("model"),
         edited_length=len(edited_en),
         message=f"Applied edit instruction to verdict detail ({len(edited_en)} chars).")


if __name__ == "__main__":
    main()
