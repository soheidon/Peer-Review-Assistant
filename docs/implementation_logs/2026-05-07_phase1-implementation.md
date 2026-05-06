# Phase 1 Implementation Log

**Date**: 2026-05-07
**Branch**: `master`
**Commit**: `385da16`
**Status**: Complete

---

## 1. Environment

| Tool | Version | Install Command |
|------|---------|-----------------|
| Windows 11 Pro | 10.0.26200 | — |
| Python | 3.12.11 | (pre-installed via Anaconda) |
| pip | 26.0.1 | — |
| Node.js | v24.13.0 | (pre-installed) |
| npm | 11.13.0 | — |
| Rust | 1.95.0 | `winget install Rustlang.Rustup` |
| Cargo | 1.95.0 | (bundled with Rust) |
| Pillow (PIL) | pre-installed | Used for icon generation |

### Rust installation detail
```bash
winget install Rustlang.Rustup --accept-source-agreements --accept-package-agreements
# Version: 1.29.0 (rustup-init)
# Toolchain: 1.95.0 (59807616e 2026-04-14), x86_64-pc-windows-msvc
```

---

## 2. Python CLI — `python/`

### 2.1 Package skeleton

```
python/
  pyproject.toml
  peer_review_assistant/
    __init__.py               # Package init, __version__ = "0.1.0"
    cli.py                    # Main CLI entry point (click)
    project/__init__.py       # Stub
    preprocess/__init__.py    # Stub
    citations/__init__.py     # Stub
    llm/__init__.py           # Stub
    merge/__init__.py         # Stub
    output/__init__.py        # Stub
    utils/__init__.py         # Stub
```

### 2.2 pyproject.toml

```toml
[project]
name = "peer-review-assistant"
version = "0.1.0"
description = "Python CLI engine for Peer Review Assistant"
requires-python = ">=3.11"
dependencies = ["click>=8.0"]

[project.scripts]
pra-cli = "peer_review_assistant.cli:main"

[build-system]
requires = ["setuptools>=68.0"]
build-backend = "setuptools.build_meta"

[tool.setuptools.packages.find]
where = ["."]
```

### 2.3 CLI Architecture

- **Framework**: Click 8.1.8
- **Entry point**: `pra-cli` (console_scripts → `peer_review_assistant.cli:main`)
- **Communication**: JSON Lines on stdout, one JSON object per line
- **Error handling**: `emit("error", code=..., message=...)` → `sys.exit(1)`

### 2.4 Commands

#### `pra-cli healthcheck`

```bash
pra-cli healthcheck
# Output:
# {"event": "healthcheck", "status": "ok", "python_version": "3.12.11", "package_version": "0.1.0"}
# Exit: 0
```

Implementation (`cli.py:61-66`):
```python
@main.command()
def healthcheck():
    emit("healthcheck",
         status="ok",
         python_version=sys.version.split()[0],
         package_version="0.1.0")
```

#### `pra-cli init-project --project <path>`

```bash
pra-cli init-project --project C:/tmp/test001
# Output (JSON Lines, one per step):
# {"event":"progress","task":"init-project","step":"validate","percent":0}
# {"event":"progress","task":"init-project","step":"create_dirs","percent":10}
# {"event":"progress","task":"init-project","step":"create_logs","percent":40}
# {"event":"progress","task":"init-project","step":"create_json","percent":60}
# {"event":"progress","task":"init-project","step":"create_status","percent":80}
# {"event":"done","task":"init-project","project":"C:\\...","message":"Project folder created successfully."}
# Exit: 0
```

**Validation steps** (in order):
1. Check target is not under `release/` → `RELEASE_FOLDER_REJECTED`
2. Check `project.json` doesn't already exist → `PROJECT_EXISTS`
3. Create directory tree
4. Create 4 empty log files
5. Write `project.json` (initial schema, ISO 8601 JST timestamps)
6. Write `status/task_status.json` (all `not_started`/`not_used`)

**Directory tree created**:
```
<project>/
  project.json
  source/
  sections/
  citations/
  lines/
  prompts/
  outputs/
    structure/
    expression/
    methods_stats/
    citation/
    originality/
    final/
  status/
    task_status.json
  logs/
    preprocess.log     (empty)
    llm_calls.log      (empty)
    citation_db.log    (empty)
    errors.log         (empty)
```

**release/ path detection** (`cli.py:28-31`):
```python
def is_under_release(path):
    target = os.path.abspath(path).replace("\\", "/").lower()
    parts = target.split("/")
    return "release" in parts
```

### 2.5 project.json Initial Schema

```json
{
  "project_id": "<folder-basename>",
  "created_at": "2026-05-07T04:27:50.945084+09:00",
  "updated_at": "2026-05-07T04:27:50.945084+09:00",
  "source": {
    "docx_path": null,
    "pdf_path": null,
    "docx_sha256": null,
    "pdf_sha256": null
  },
  "manuscript": {
    "title": null,
    "language": null,
    "article_type": null,
    "journal": null
  },
  "preprocess": {
    "status": "not_started",
    "docx_pdf_match_ratio": null,
    "line_extraction_status": "not_started",
    "line_alignment_confidence": null,
    "location_mode": "paragraph_sentence"
  },
  "settings": {
    "location_display": "both",
    "secure_mode": false
  }
}
```

### 2.6 task_status.json Initial Schema

```json
{
  "preprocess": "not_started",
  "citation_db": "not_started",
  "summary": "not_started",
  "checks": {
    "structure":      {"llm01":"not_started","llm02":"not_started","llm03":"not_started","manual":"not_used","merged":"not_started"},
    "expression":     {"llm01":"not_started","llm02":"not_started","llm03":"not_started","manual":"not_used","merged":"not_started"},
    "methods_stats":  {"llm01":"not_started","llm02":"not_started","llm03":"not_started","manual":"not_used","merged":"not_started"},
    "citation":       {"llm01":"not_started","llm02":"not_started","llm03":"not_started","manual":"not_used","merged":"not_started"},
    "originality":    {"llm01":"not_started","llm02":"not_started","llm03":"not_started","manual":"not_used","merged":"not_started"}
  },
  "final_merge": "not_started"
}
```

### 2.7 Install & Test Results

```bash
# Install in dev mode
pip install -e "C:\Users\Sohei\dev\Peer Review Assistant\python"
# → Successfully installed peer-review-assistant-0.1.0

# Test healthcheck
pra-cli healthcheck
# → {"event":"healthcheck","status":"ok","python_version":"3.12.11","package_version":"0.1.0"} ✓

# Test release/ rejection
pra-cli init-project --project "<repo>/release/test_project"
# → {"event":"error","code":"RELEASE_FOLDER_REJECTED",...} exit:1 ✓

# Test successful project creation
pra-cli init-project --project "<repo>/examples/test001"
# → All 6 JSON Lines events emitted, exit:0 ✓
# → 22 files/dirs created ✓
# → project.json schema matches spec ✓
# → task_status.json schema matches spec ✓
```

---

## 3. Tauri App — `app/`

### 3.1 Scaffold method

Manual scaffold (non-interactive terminal blocks `npm create tauri-app`).

### 3.2 Frontend (`app/src/`)

| File | Purpose |
|------|---------|
| `index.html` | Entry HTML, mounts `#root` |
| `src/main.tsx` | React 18 entry, `<App />` render |
| `src/App.tsx` | Main component (~160 lines) |
| `src/App.css` | Dark theme styles (~150 lines) |
| `src/vite-env.d.ts` | Vite type reference |
| `tsconfig.json` | TypeScript config (strict, ES2020, react-jsx) |
| `tsconfig.node.json` | TypeScript config for vite.config.ts |
| `vite.config.ts` | Vite + React plugin, port 1420 |
| `package.json` | Dependencies and scripts |

### 3.3 Dependencies

```json
{
  "dependencies": {
    "@tauri-apps/api": "^2.0.0",
    "@tauri-apps/plugin-dialog": "^2.0.0",
    "@tauri-apps/plugin-shell": "^2.0.0",
    "react": "^18.3.1",
    "react-dom": "^18.3.1"
  },
  "devDependencies": {
    "@tauri-apps/cli": "^2.0.0",
    "@types/react": "^18.3.0",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.0",
    "typescript": "^5.6.0",
    "vite": "^5.4.0"
  }
}
```

### 3.4 Backend (`app/src-tauri/`)

| File | Purpose |
|------|---------|
| `Cargo.toml` | Rust crate config, Tauri v2 + plugins |
| `build.rs` | Tauri build script |
| `tauri.conf.json` | Window config (900x700), shell scope |
| `src/main.rs` | Binary entry, calls `lib::run()` |
| `src/lib.rs` | App setup, plugin registration |
| `capabilities/default.json` | Permissions for dialog + shell |
| `icons/` | Generated icons (PNG, ICO, ICNS, Android, iOS) |

### 3.5 Cargo.toml

```toml
[package]
name = "peer-review-assistant"
version = "0.1.0"
edition = "2021"
rust-version = "1.77"

[build-dependencies]
tauri-build = { version = "2", features = [] }

[dependencies]
tauri = { version = "2", features = [] }
tauri-plugin-dialog = "2"
tauri-plugin-shell = "2"
serde = { version = "1", features = ["derive"] }
serde_json = "1"

[features]
default = ["custom-protocol"]
custom-protocol = ["tauri/custom-protocol"]
```

### 3.6 lib.rs — Rust entry point

```rust
use tauri::Manager;

#[tauri::command]
fn get_release_path(app: tauri::AppHandle) -> Result<String, String> {
    let resource_dir = app.path().resource_dir().map_err(|e| e.to_string())?;
    Ok(resource_dir.to_string_lossy().to_string())
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![get_release_path])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

### 3.7 tauri.conf.json

```json
{
  "productName": "Peer Review Assistant",
  "version": "0.1.0",
  "identifier": "com.peerreviewassistant.app",
  "build": {
    "beforeDevCommand": "npm run dev",
    "devUrl": "http://localhost:1420",
    "beforeBuildCommand": "npm run build",
    "frontendDist": "../dist"
  },
  "app": {
    "windows": [{
      "title": "Peer Review Assistant / 査読アシスタント",
      "width": 900,
      "height": 700
    }],
    "security": { "csp": null }
  },
  "plugins": {
    "shell": {
      "open": true,
      "scope": [{
        "name": "pra-cli",
        "cmd": "pra-cli",
        "args": true
      }]
    }
  }
}
```

### 3.8 Capabilities (permissions)

```json
{
  "identifier": "default",
  "windows": ["main"],
  "permissions": [
    "core:default",
    "dialog:default",
    "dialog:allow-open",
    "shell:default",
    "shell:allow-execute",
    "shell:allow-spawn",
    "shell:allow-open"
  ]
}
```

**Fix applied**: Removed non-existent `shell:allow-shell-open` permission (build error).

### 3.9 Icon Generation

```bash
# Generated source icon (512x512) with Python/Pillow
python -c "
from PIL import Image, ImageDraw
# Dark red rounded rectangle with white 'document' shape
# Saved as src-tauri/icons/icon.png
"

# Generated all platform icons
npx tauri icon src-tauri/icons/icon.png
# → ICO, ICNS, PNG (32, 64, 128, 128@2x)
# → Android (mipmap-hdpi → xxxhdpi)
# → iOS (AppIcon 20x20 → 512@2x)
# → StoreLogo, Square*Logo (Appx)
```

### 3.10 Build Results

```bash
# Frontend build
npx vite build
# ✓ 36 modules transformed
# dist/index.html                 0.41 kB
# dist/assets/index-JjFhwnrY.css  1.46 kB
# dist/assets/index-MfzXZ3RY.js   2.20 kB
# dist/assets/index-DWijytQn.js  148.45 kB
# ✓ built in 332ms

# Rust check
cargo check
# → Finished dev profile [unoptimized + debuginfo] in 0.52s ✓

# Rust build
cargo build
# → Finished dev profile [unoptimized + debuginfo] in 37.53s ✓
```

---

## 4. GUI Component Design

### 4.1 App.tsx State

```typescript
// State variables
const [logs, setLogs] = useState<LogEntry[]>([]);
const [projectPath, setProjectPath] = useState("");
const [healthcheckStatus, setHealthcheckStatus] = useState<string | null>(null);
const [projectCreated, setProjectCreated] = useState(false);
```

### 4.2 Screen Layout

```
┌─────────────────────────────────────────┐
│ Peer Review Assistant                   │
│ 査読アシスタント v0.1.0                  │
├─────────────────────────────────────────┤
│ SYSTEM                                  │
│ [Python CLI healthcheck]  OK            │
├─────────────────────────────────────────┤
│ PROJECT                                 │
│ [___________________________] [Browse]  │
│ [Create New Project]  Created           │
├─────────────────────────────────────────┤
│ LOG                          [Clear]    │
│ ┌─────────────────────────────────────┐ │
│ │ {"event":"healthcheck","status"...} │ │
│ │ {"event":"progress","step"...}      │ │
│ │ {"event":"done","message"...}       │ │
│ └─────────────────────────────────────┘ │
└─────────────────────────────────────────┘
```

### 4.3 Subprocess Invocation Pattern

```typescript
// Dynamic import of shell plugin (Tauri v2)
const { Command } = await import("@tauri-apps/plugin-shell");

// healthcheck
const cmd = Command.create("pra-cli", ["healthcheck"]);
const output = await cmd.execute();
// Parse output.stdout line by line as JSON Lines

// init-project
const cmd = Command.create("pra-cli", ["init-project", "--project", projectPath]);
const output = await cmd.execute();
// Parse output.stdout line by line as JSON Lines
```

### 4.4 release/ Protection (Two Layers)

**Client-side (App.tsx, before calling CLI)**:
```typescript
const normalized = projectPath.replace(/\\/g, "/").toLowerCase();
if (normalized.includes("/release/") || normalized.endsWith("/release")) {
  addLog({ event: "error", message: "Project folder must not be inside a release/ directory." });
  return; // Don't call CLI
}
```

**CLI-side (cli.py, during validation)**:
```python
def is_under_release(path):
    target = os.path.abspath(path).replace("\\", "/").lower()
    parts = target.split("/")
    return "release" in parts
```

### 4.5 Log Line Color Coding

| Event Type | Color | CSS |
|---|---|---|
| `done`, `healthcheck`, `status: "ok"` | Green `#4f4` | Success |
| `error` | Red `#f44` | Error |
| `progress` | Orange `#fa0` | In progress |
| All others | Gray `#ccc` | Default |

---

## 5. .gitignore

```
# Python
__pycache__/
*.py[cod]
*.egg-info/
dist/
build/
.venv/
venv/

# Node / Tauri
node_modules/
app/src-tauri/target/

# IDE
.vscode/
.idea/

# OS
Thumbs.db
.DS_Store

# Secrets
.env
*.pem
credentials.json

# Claude Code
.claude/

# Workspaces (user data)
workspaces/
```

**Note**: `app/dist/` is covered by the global `dist/` pattern. `app/src-tauri/gen/` (auto-generated Android/iOS project files) intentionally NOT committed — regenerated by `tauri build`.

---

## 6. Git Commits

```
9fda1e3 — Initial commit: project specification documents
385da16 — Phase 1: project skeleton implementation (81 files, +7593/-1)
```

---

## 7. Known Limitations / Notes

1. **Tauri window not tested interactively**: `cargo build` succeeds but `cargo tauri dev` requires a desktop environment with WebView2. Windows 11 has this pre-installed.
2. **Icon is placeholder**: Simple colored shape, should be replaced with proper artwork before release.
3. **`cargo tauri dev` untested in this session**: Requires interactive desktop. Test manually with:
   ```bash
   cd app
   npx tauri dev
   ```
4. **Rust `gen/` directory not committed**: Auto-generated by Tauri build; regenerated on each build.
5. **npm vulnerabilities**: 2 moderate severity (from scaffolding); run `npm audit fix` if needed.

---

## 8. How to Run

### Python CLI only
```bash
pip install -e python/
pra-cli healthcheck
pra-cli init-project --project D:/PeerReviewProjects/test001
```

### Full Tauri app
```bash
cd app
npm install
npx tauri dev
```

### Frontend only (browser)
```bash
cd app
npm run dev
# → http://localhost:1420
# Note: subprocess calls won't work in browser (needs Tauri runtime)
```
