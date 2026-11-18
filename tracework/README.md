# Tracework

A local solution-engineering workbench built from [TRACEWORK-PRODUCT-SPEC.md](specs/TRACEWORK-PRODUCT-SPEC.md). Source evidence, reviewed semantic models, architecture decisions, artifacts and change findings persist in SQLite. The separate Loom reference was not used for implementation.

## Run

Requires **Bun 1.4.4**. All application, build and test commands run under Bun.

```sh
cd tracework
bun install --frozen-lockfile
bun run build
bun run start
```

Open **http://localhost:4310**. Development: `bun run dev`, then open http://localhost:4311. Production serves the built React interface and API from one loopback-only `Bun.serve` process. Vite follows the product specification and overrides the starter AGENTS.md preference for HTML imports.

Use **New workspace** for your own documents, or **Open repair-service example** for the labelled synthetic demonstration. The app works without an API key for source extraction, manual modelling, proposal review, projections, deterministic artifacts, validation, repository import and backups.

## Configuration

Create a local `.env` in this directory for `OPENAI_API_KEY`. It is ignored by Git; never commit it. Bun loads it on startup. Restart the server after changing credentials.

| Variable | Default / behavior |
| --- | --- |
| `OPENAI_API_KEY` | Server-only credential; enables actual OpenAI Agents SDK calls |
| `OPENAI_MODEL` | `gpt-6-astra`; an unavailable model fails visibly, with no fallback |
| `TRACEWORK_DATA_DIR` | `.tracework-data`, resolved relative to the process working directory |
| `PORT` | `4310`; binds only `127.0.0.1` |
| `TRACEWORK_EXTERNAL_TRACING` | Disabled unless exactly `true`; sensitive trace content disabled |
| `TRACEWORK_LIVE` | Set to `1` to opt into billed live qualification calls |

New sources default to **internal**. Public sources may be sent to the model; internal sources need workspace-level consent. Restricted sources are never submitted. Classification is checked during assembly and again when tools read data, including historical sources. Uploaded text and repository code are data, not tool instructions. Review the explicit task scope before running an AI task.

## Workflows

- **Discover:** upload PDF, DOCX, Markdown/text, JSON, YAML, CSV or HTML; click a source name to open its document. PDFs support page navigation, zoom, rotation and text selection. Markdown has formatted and CodeMirror source views with syntax colouring, line numbers and search (Ctrl/Cmd+F), including highlighting inside fenced code blocks. Markdown/text can be edited and saved as new immutable versions; Markdown undo/redo history survives switching to Preview. The row's inspector action retains evidence, policy and citation details. Search evidence or ask scoped, cited questions.
- **Model:** create typed objects through forms, or run interpretation and review proposals. Accept a dependency-complete subset, reject with a reason, edit into a derived proposal, or request revision. Accepted changes create immutable context versions with optimistic concurrency and idempotency.
- **Design:** inspect semantic, bounded-context, C4 system and container projections in Excalidraw. Moving/hiding shapes changes layouts only. Proposal overlays remain drafts; semantic edits use reviewed forms. Decisions and executable/advisory guardrails have historical revisions.
- **Build:** generate specifications, architecture/ADR documents, OpenAPI 3.1, JSON Schema 2020-12, mapped test plans and implementation packages. Preview, inspect provenance, download, and review artifact versions separately from model acceptance. Register a local Git root to import committed text without modifying its checkout.
- **Validate:** introduce source replacements, inspect dependency paths and selective staleness, run deterministic checks, review advisory findings and request remediation. Dismissing a failed check never makes it pass.

Source, model and artifact edit drafts persist in browser storage; canvas drafts survive view conflicts. Source edits require the newest version, preserve earlier originals and citations, and queue fresh evidence extraction. Markdown HTML stays inert and image references are shown as placeholders without external requests. Accepted records live on disk, independently of the browser. Recorded runs are explicitly labelled and replay saved events without inference or execution.

## Data and recovery

`apps/server/src/storage/store.ts` owns SQLite WAL, foreign keys, migration setup, immutable revision/membership records, audit history, FTS5, durable runs and SDK sessions. Content blobs are SHA-256 addressed and installed before referencing transactions. Evidence verification checks the excerpt and locator against immutable extraction bytes. Parsing runs in a bounded child process (25 MiB originals, 200 PDF pages, 30-second extraction deadline); scanned PDFs require external OCR and are reported unsupported.

Create backups from Settings. A backup uses a consistent SQLite snapshot plus hash-verified referenced blobs. Restore writes a **separate recovery directory**, preserving active data; stop the server and select that directory with `TRACEWORK_DATA_DIR` to use it. Copy the complete backup directory when moving machines. Do not copy a live SQLite file alone. Checkpoint clones remap workspace-owned IDs and never resume recorded SDK approvals or executions.

## Optional generated-service execution

Docker is optional and never replaced by host-shell execution. Code generation is constrained to the reviewed Bun/TypeScript/SQLite template, generated source files, numbered SQL migrations and generated tests. Dependencies, entry point and independent acceptance harness are protected.

```sh
bun run execution:prepare
bun run test:execution
```

Preparation resolves a pinned Linux/amd64 Bun image and builds the trusted harness. After upgrading the Bun version or template, rerun both commands to qualify the new image. Containers have no external network, read-only root and input mounts, a non-root user, no added capabilities, limited CPU/memory/PIDs and a deadline. Execution reports bind to exact artifact bytes. Unexecuted code is exportable as a draft but cannot receive verified acceptance.

The initial behavioral execution profile covers named-record collection GET/POST operations backed by SQLite. Other API shapes require a reviewed extension of the trusted profile; an exported draft is not a claim of general application correctness.

## Verification

```sh
bun run typecheck
bun test
bun run build
bun run test:e2e
bun run benchmark
TRACEWORK_LIVE=1 bun run test:live
bun run test:execution
```

The live suite passed its SDK/discovery/architecture/artifact checks and the corrected targeted change-analysis rerun using the configured key. Bounded code generation and export also passed in a separate live check (`TRACEWORK_LIVE=1 bun scripts/live-code.ts`). Docker checks remain **not run**. See the ledger for prior failures and their fixes.

Install Playwright Chromium with `bun --bun node_modules/@playwright/test/cli.js install chromium` if needed. `TRACEWORK_CHROMIUM_PATH` can select an installed executable. Browser tests start an isolated server on port 4312 with data under `/tmp/tracework-e2e-data`. `TRACEWORK_E2E_EXTERNAL=1` instead tests an already running server on 4310 and creates labelled test workspaces there.

See [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) for current verification status, integration qualifications and remaining limitations. [benchmark-results.json](benchmark-results.json) records the measured host and workload. Ordinary tests use explicit synthetic fixtures; production AI tasks always use the actual SDK. Live and Docker qualifications are opt-in and cannot be inferred from deterministic test success.

## Repository layout

| Path | Purpose |
| --- | --- |
| `apps/server/src` | Bun server, SQLite adapter, domain modules, SDK and durable jobs |
| `apps/web/src` | React workbench, forms/tables and lazy Excalidraw canvas |
| `packages/contracts` | Shared strict Zod commands and semantic types |
| `templates/bun-service` | Pinned independently runnable generated-service template |
| `fixtures` | Labelled repair-service and library examples |
| `tests`, `browser-tests` | Deterministic and browser verification |
| `scripts` | Development, examples, benchmarks and opt-in qualifications |

[API guide](docs/API.md) · [Demonstration guide](docs/DEMO.md) · [Implementation ledger](IMPLEMENTATION_PLAN.md)
