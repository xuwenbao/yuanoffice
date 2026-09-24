# Web architecture

Status of the browser host and the external-agent control layer.
Counts and paths below were checked at commit `8355a8f` (official
`genspark-ai/genoffice` `main` at the time this document was added) unless a
later section names a newer commit.

This file is the design of record. Update it in the same change that moves a
protocol, a tool result, a save rule, or a security boundary. Each phase
close also updates the phase table, the known gaps, and any place the landed
code differs from the plan.

## 1. Overview

The desktop Electron host stays, and its behaviour stays the same. A second
host runs the editors in a browser. An external agent drives documents through
the existing CLI and MCP. It does not talk to a model inside this product.

Non-goals:

- No model calls from the web host, the control service, or this distribution's
  default CLI (`search`, `image`, and `media` stay in the tree but are not
  registered unless `GENOFFICE_ENABLE_CLOUD=1`).
- No AI BFF and no provider credentials in the browser.
- No File System Access handles. The browser never receives a disk path it
  can write on its own; the control service is the only writer.

```mermaid
flowchart LR
  Agent[External agent] --> CliMcp[CLI and stdio MCP]
  Agent --> LiveMcp[Live MCP over HTTP]
  CliMcp -->|"file not open"| Engines[File engines]
  CliMcp -->|"genoffice editor"| Svc[Local control service]
  LiveMcp --> Svc
  Svc -->|"open-documents.json"| CliMcp
  Svc <-->|"WebSocket editor channel"| Editor[Editor iframe]
  Svc <-->|"WebSocket shell channel"| WebShell[Web shell]
  WebShell <-->|"frame protocol"| Editor
  Editor --> Executors[Existing editor executors]
  Svc -->|"/api/files inside allowed roots"| Disk[Disk files]
```

## 2. Decisions

| Date | Decision | Why |
| --- | --- | --- |
| 2026-09-24 | Base is official GenOffice, not a fork merge of ALI-startup/genoffice (SamuGen). | That tree was 401 commits behind and 61 ahead, had deleted Electron, renamed packages to `@samugen/*`, and added an AI BFF. Re-implement the seam; do not cherry-pick. |
| 2026-09-24 | Keep both hosts. | Desktop behaviour is unchanged. Web is a second build (`dist/web`, never `apps/*/out`). |
| 2026-09-24 | Files are read and written only by the control service, addressed by absolute path (`DocumentRef` is `{ kind: 'local', path }`). | The agent can target a path, and a background write can see that the file is open. |
| 2026-09-24 | Live tools keep the official names (`read_document`, `insert_content`, `replace_blocks`, `apply_ops`, `save_document`, `open_documents`) plus `document_status`. | External skills written for the desktop MCP keep working. Save semantics differ and are stated on the tool. |
| 2026-09-24 | `search` / `image` / `media` are off unless `GENOFFICE_ENABLE_CLOUD=1`. | This distribution does not call a model. |
| 2026-09-24 | `@genoffice/file-parse` does not depend on `@genoffice/ai-provider`. | The only mention is a comment in `packages/file-parse/src/parse.ts`. Nothing to strip. |

Upstream sync: `upstream` is `https://github.com/genspark-ai/genoffice.git`.
Fast-forward this branch onto `upstream/main` when it is a strict descendant.
Record each merge in section 9. Conflict policy: keep desktop behaviour, replay
web-only files on top.

## 3. Platform seam

`@genoffice/platform` holds the slot factory and the shared ports. No port
member is optional. A capability a host does not have is a required key typed
`X | null`, and the caller branches. The renderer never parses a path out of a
ref; the host supplies the display name.

Shared ports: `language`, `window`, `attachments`, `agentControl`. There is no
AI port on the web host. Desktop editors keep their in-app agent behind
`ai: { enabled: true } | null`.

Per app:

```
src/renderer/platform.ts
src/renderer/platform-electron.ts   only module that reads the preload global
src/renderer/platform-web.ts
src/renderer/host-electron.ts
src/renderer/host-web.ts
vite.web.config.ts                  base /app/<kind>/, outDir dist/web/app/<kind>
```

`@host` is a Vite alias resolved at build time. The Electron bundle does not
contain the web host module as its entry, and the web bundle does not contain
the preload bridge.

`@genoffice/platform-web` holds the frame protocol, the file client, the
WebSocket client, language persistence, downloads, and IndexedDB drafts.

`@genoffice/platform-electron` holds the small helpers shared by desktop
adapters. App-specific preload types stay in the app.

## 4. Control service

Package `@genoffice/control-service`, started with `genoffice serve`.

| Surface | Role |
| --- | --- |
| static `dist/web` | Shell at `/`, editors at `/app/<kind>/`, same origin. `.mjs` is served as JavaScript so the PDF.js worker can load, and `.wasm` is served as `application/wasm` |
| `GET/PUT /api/files/*` | List, stat, read, atomic write, and create a blank docx/xlsx/pptx/pdf inside the allowed roots. An empty list path returns those roots as directories. List and stat include `mtimeMs` and `sizeBytes` |
| `GET /ws` | Editor channel and shell channel |
| `POST /mcp` | JSON-RPC MCP: `initialize`, `tools/list`, `tools/call` |
| `control.json` + socket | Same discovery as the desktop shell, protocol 2 |
| `open-documents.json` | Same shape as the desktop registry, plus `source: "control-service"` |

Security:

- Binds loopback only.
- A per-run token is written to `control.json` (mode `0600` on POSIX). The
  browser receives it as an `HttpOnly`, `SameSite=Strict` cookie set by
  `GET /api/session`. CLI reads the file.
- `/api` and `/ws` require the token and a loopback `Host`. Browser requests
  must also send an `Origin` equal to `http://<host>`.
- A path is allowed only after `realpath` of the existing ancestor, and the
  resolved path must stay inside a root passed to `--root` or
  `GENOFFICE_ALLOWED_ROOTS`.

The service holds no model key and does not import `@genoffice/ai-provider`.

## 5. Live editing protocol

Editors register `{ editorId, path, family, title, revision, dirty }` and send
a `state` message whenever those change. Commands for one editor run one at a
time. The desktop shell's socket accepts the same command names and answers
`unsupported`: live editing is the control service's job, so a desktop
`control.json` cannot be mistaken for a successful edit.

| Tool | Result |
| --- | --- |
| `read_document` / `insert_content` / `replace_blocks` / `apply_ops` | `{ applied, revision, dirty: true, persisted: false }` |
| `document_status` | `{ dirty, revision, savedRevision, lastSavedAt, connected }` |
| `save_document` | `{ persisted: true, savedRevision, path }` written back to the document's own path unless `path` is set; an existing target needs `overwrite: true` |
| `open_documents` `close` | Refuses a dirty document with `unsaved_changes` unless `unsaved` is `save` or `discard` |

`apply_ops` may include `baseRevision`. A mismatch returns `revision_conflict`
and does not run.

Stable errors: `editor_disconnected`, `unsaved_changes`, `revision_conflict`,
`file_open_in_gui`, `file_not_found`, `unsupported`.

After the socket drops, the registration stays for a lease (default 15s).
During the lease, live commands return `editor_disconnected` and background
CLI writes return `file_open_in_gui`. A clean unregister with `dirty: false`
drops the registration immediately. Nothing falls through to a disk write.

`--force` does not override a `source: "control-service"` registration.
Desktop registrations keep the old `--force` behaviour.

## 6. Save and conflict rules

- The open document's memory is the source of truth. An agent edit shows up
  in the page before it is a file.
- Edit and save are different tools. `persisted` says whether bytes were written.
- A background `docs apply` / `sheet apply` / `slides apply` / `convert` /
  `create` cannot replace a file the control service has registered.
- A closed page or a dead socket is an error, not a silent disk write.

## 7. Phase status

| Phase | State | What landed |
| --- | --- | --- |
| 0 Upstream | done | `upstream` remote; fast-forward `f36446f` to `8355a8f` |
| 1 Docs web | done | Platform packages, docs seam (`docsPlatform()`), web host at `dist/web/app/docs`, control-service file API. Web bundle has no `window.desktop`, `electron`, or `ai-provider`. Docx bytes round-trip through `/api/files`. |
| 2 Live control | done | `editor-control`, `/mcp`, `genoffice editor`, lease, `--force` ignored for `source: "control-service"`. Playwright opens `/harness/editor.html`: apply changes the page and leaves the file unchanged. |
| 3 Web shell | done | `apps/shell/src/web`: same-origin iframes, frame protocol, shell WebSocket (`open` / `focus`), IndexedDB drafts, route priority in `tabs.ts` (tested). The home page follows the desktop home (recent, starred, folders, new file) and talks only to the file API. |
| 4 PDF, slides, sheets | done with gaps | The shell iframe for every kind is `/app/{kind}/index.html` (the desktop page). PDF opens through `ServiceFiles` into the existing viewer. Slides open, render, text, transform, and save live in `src/domain/document.ts`; the browser holds the deck with `pptx-engine` and the desktop main process calls those functions. Sheets mounts the Univer page. Opening a workbook needs the wasm reactor (see gaps). |

## 8. Known gaps

Absent on purpose, not a silent success:

- Docs PDF export in the browser (`exportPdf` rejects; print uses `window.print`).
- Docs crash-recovery is an IndexedDB draft, not the desktop userData copy.
- Encrypted docx open, Zotero, headless export, and the in-app AI panel are
  desktop-only. When `ai` is null the panel, the Genspark ribbon group, the
  one-click AI actions, and the chat dock are not mounted. `ai/tools.ts`
  stays, so an external command can still run the editor executors.
- PDF annotation, drawing, form, and page-op saves need the desktop pdfium
  pipeline. The browser host reads and writes the file bytes. A save that
  includes those edits returns an error instead of writing a partial file.
  System OCR and native dialogs are unavailable.
- Slides ribbon commands beyond open, text, transform, undo, and save (layouts,
  animations, comments, export, print) answer unavailable. The browser media
  resolver serves archive bytes as data URLs and does not transcode TIFF.
- The slides web host installs a small `Buffer` stand-in before the engine
  loads, and package hashing uses `@noble/hashes` instead of `node:crypto`.
  Inserting audio or video still needs Node `zlib` on the desktop. A
  browser-safety test guards `bytes.ts` only.
- Sheets `open` / `read_range` / `close` live in `protocol.rs` and `wasm_api.rs`.
  `apps/sheets/scripts/build-wasm.ts` adds the `wasm32-wasip1` target and looks
  for a wasi-sdk clang plus sysroot (`WASI_SDK_PATH` or `/opt/wasi-sdk`). This
  machine has neither: Apple clang reports `wasm32-unknown-wasip1` as an
  unknown target, and `zstd-sys` (pulled by the engine's C dependencies) fails
  the same way. There is no `xlsx-sidecar.wasm`. The Univer page still mounts.
  `selectWorkbook` throws and does not invent a workbook. Applying cell edits
  is not in the reactor; an unchanged save writes the original bytes back
  through the control service. The desktop sidecar command set stays in `main.rs`.

## 9. Upstream sync log

| Date | Range | Notes |
| --- | --- | --- |
| 2026-09-24 | `f36446f`..`8355a8f` | Fast-forward. Three upstream fixes (chart extrema, slides redo routing, macOS font test assets). No web files existed yet, so no conflicts. |
