# Assemblavatar

A local 3D modelling studio where GPT-6 Astra writes procedural TypeScript, builds it in an isolated runtime, inspects rendered views, and refines the result. Bun serves the application; Three.js powers geometry, the interactive viewer and GLB/GLTF export.

## Run

```sh
bun install --production
bun run start
```

Open **http://127.0.0.1:3000**. Use the existing `.env`, or create one using `.env.example` as a guide. Set `OPENAI_API_KEY` and leave `OPENAI_MODEL=gpt-6-astra`. Bun loads `.env` on the server. The key is never sent to the browser. `.env`, `.env.*` (except `.env.example`), `data/` and generated build files are ignored by Git.

The modelling validator uses the TypeScript 5.9.3 compiler API to parse and check generated programs. TypeScript 7.0.2 no longer exports the functions it uses, including `createSourceFile` and `createProgram`.


AI requests have a configurable ten-minute deadline (`AI_REQUEST_TIMEOUT_MS=600000`). Long photo-guided generations display their AI phase; refreshing an assemblage reconnects to its current job.

`bun run start` runs in production mode without hot reloading. Previews, image decoding and GLB/GLTF processing run in an isolated frame in your open Assemblavatar tab. Keep the tab open while generating or importing; refreshes reconnect pending rendering work. No Playwright or separate Chromium installation is required at runtime. `run-all.sh` uses this mode automatically.

For development, use `bun install` and `bun run dev`. Hot reload restarts the server when backend code changes and interrupts active jobs. Playwright is used only by the development browser tests.

## Use the studio

1. Create an assemblage, or open a clearly labelled handwritten example.
2. Describe a model in the **AI** panel. Choose an object, architecture, stylised-avatar or realistic-avatar profile.
3. Optionally add photographs in **References**. Choose the view and distinguish reference photos from model textures.
4. Generate. The job validates the source, builds in isolation, renders seven viewpoints, requests Astra's evaluation and optionally refines within the selected pass limit. Each rendered pass appears immediately in the interactive viewport, before evaluation. **Results** retains every pass; drafts remain visible during later steps, after refresh, cancellation or errors. Quality shortfalls end as **Needs review**, with feedback and an editable/exportable draft. Cancel is available during generation.
5. Select objects in the viewport or hierarchy. Edit transforms/materials, hide/remove objects, or group/ungroup. **Save object edits** rebuilds and records the override layer as a revision.
6. Inspect or edit **Source**, then **Validate & build**. The example programs work without an OpenAI key.
7. Use **History** to compare previews or restore a prior revision. The next build branches from that revision; revision numbers remain unique.
8. Export **GLB**, embedded **GLTF**, or a **PNG** thumbnail. Import an existing self-contained GLB to view it.

Source, parameters and manual overrides are authoritative for generated models. Exported files are derived artifacts. Reference photos are never silently assigned as textures.

## Modelling contract

```ts
export function buildModel(ctx: ModelBuildContext): ModelBuildOutput {
  const r = ctx.runtime;
  const root = r.create.group("Example");
  const body = r.create.box({
    name: "Body", width: 1, height: 0.5, depth: 1,
    material: { baseColor: "#a1754b", roughness: 0.7 }
  });
  r.transform.position(body, [0, 0.25, 0]);
  root.add(body);
  return { root };
}
```

The complete versioned API is [src/shared/modelling-contract.ts](src/shared/modelling-contract.ts). It is supplied to Astra and used by the TypeScript compiler. Async build functions are supported for locally settling promises. Use `ctx.runtime`, optional type imports from `@assemblavatar/runtime`, metres, Y-up and radians. The front of a model faces +Z.

The toolkit includes primitives, transformations, PBR materials, CSG union/subtract/intersect, bevelled extrusion, lathe, loft, subdivision, smoothing, duplication/mirroring, bounded vertex construction, regional scaling, bend/taper/twist/inflate/displacement/curve warp, and asset-ID-based textures. Use seeded `runtime.utility.random(seed)` for procedural variation.

## Architecture

Read the [architecture guide](docs/architecture.md) for component responsibilities, data flow, isolation boundaries, draft/revision persistence, progress handling and extension points.

```text
React editor / Three.js viewer
          ↓ HTTP + server-sent events
Bun API → workspace and generation services → filesystem repositories
                       ↓
              GPT-6 Astra Responses API
                       ↓ procedural TypeScript
              disposable Bun worker
                ├─ AST + TypeScript validation
                └─ QuickJS WASM VM with memory/time limits
                       ↓ validated scene JSON
              isolated frame in the open browser tab
                ├─ deterministic seven-view Three.js render
                ├─ GLTFExporter + GLB reload validation
                └─ Astra review → bounded refinement
                       ↓
              atomic revision-head update
```

Generated JavaScript runs **only inside QuickJS**. The VM has no filesystem, network, environment, module loader or host-function bindings. The browser receives scene JSON, never generated executable code. The default VM heap limit is 128 MiB; execution, scene size, source length, segment counts, dimensions, object count and triangles are bounded. Parser/typechecking work also runs in the disposable worker, with an outer timeout.

The renderer receives data in a fresh sandboxed frame with external requests blocked by Content Security Policy. Reference uploads are signature-checked and decoded before storage. Only PNG/JPEG/WebP up to 4096 × 4096 are accepted. GLB imports must embed resources and must not require extensions. All export builds are reloaded to verify geometry.

The application is intended for a **single local user**. It binds to loopback by default and checks Host/Origin to prevent cross-origin API access. This release does not supply account authentication or a multi-user deployment configuration.

### Storage

`data/` contains separate repositories for assemblages, source programs, revisions, model artifacts, jobs, build attempts, messages and AI request metrics. Assets have opaque server-generated IDs, MIME metadata, ownership and SHA-256 hashes. Mutable JSON documents are written through temporary files and atomic renames. The assemblage head is updated after all revision dependencies are written.

Restarted jobs are marked failed; the last accepted revision remains available. Removed references stay in storage for revision reproducibility until the entire assemblage is deleted. This implementation supports one server process per data directory.

### API

The specification's `/api/assemblages`, reference, generate/refine/chat/build, revision, model-content and job endpoints are implemented. Additional operations include:

| Endpoint | Purpose |
|---|---|
| `GET /api/config` | Public capabilities; never credentials |
| `POST /api/examples` | Build a handwritten house, robot or head |
| `POST /api/assemblages/:id/duplicate` | Duplicate a procedural assemblage |
| `POST /api/assemblages/:id/import` | Import self-contained GLB |
| `POST /api/assemblages/:id/revisions` | Restore a revision by `revisionId` |
| `GET /api/jobs/:id/events` | SSE progress |
| `POST /api/jobs/:id/cancel` | Interrupt a generation job |
| `GET /api/jobs/:id/attempts` | Inspect intermediate diagnostics/source |
| `GET /api/models/:id/content?format=glb` | Export GLB (also `gltf`, `png`, `scene`) |

Generation accepts `prompt` (or `instruction` for refinement), `profile`, `automaticRefinement`, `maxIterations`, optional `selectedObjectId`, `parameters`, `overrides`, `parentRevisionId` and `incorporateOverrides`. A source build also requires `code` and performs no AI call. Errors use `{ error: { code, message } }`.

The optional, feature-detected WebMCP surface lists or opens existing assemblages. Unsupported browsers use the normal interface.

## Verify

```sh
bun install
bun run typecheck
bun run build
bun test
```

`bun test` includes browser rendering tests. Install their development-only browser with `bunx playwright install chromium`, or set `CHROMIUM_PATH` to a compatible test browser. To run separately:

```sh
bun run test        # unit, geometry, API, sandbox and generation orchestration
bun run test:render # deterministic renders, export round-trip and API edit workflow
```

Live tests use the server's OpenAI key and incur API usage. Start the app and keep its browser tab open first:

```sh
bun run test:live house
bun scripts/live-refine.ts
```

Other benchmark prompts: `chair`, `mug`, `robot`, `head`, `cartoon`. Reports and generated workspaces stay in ignored `data/`. Live refinement uses an explicitly labelled synthetic image from the house's first revision to test multimodal context; it does not establish fidelity to real photographs.

## Delivery scope and limitations

See [implementation-state.md](implementation-state.md) for completed phases and verification evidence against [the full specification](specs/assemblavatar.md).

- Real-photo avatar likeness remains an empirical evaluation task. The profiles and pipeline are implemented; photorealistic reconstruction is not established by the house benchmark.
- GLB import is for viewing and re-export; imported geometry has explicit imported provenance, not inferred procedural source. Generate a procedural version before using source-driven edits or duplication.
- The runtime has no standalone arbitrary-mesh bevel, automatic UV unwrapping, animation/rigging, local face-landmark extraction, collaboration or source-diff UI. Bevelled extrusions and preview comparison are available.
- Security tests exercise isolation and budgets; this is not an independently audited multi-tenant sandbox. The user browser and the TypeScript compiler need normal host resources in addition to the bounded QuickJS heap.

The OpenAI integration follows the official [Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs) and [model documentation](https://developers.openai.com/api/docs/models). GPT-6 Astra is the only generative model; there is no fallback 3D provider.

### Long AI requests and recovery

Astra requests use Responses background mode with status polling and a configurable ten-minute overall deadline (`AI_REQUEST_TIMEOUT_MS`). `store: false` remains set; OpenAI temporarily retains background response data for polling (roughly ten minutes), as described in the [official documentation](https://developers.openai.com/api/docs/guides/background). Cancellation attempts to cancel the provider response as well. Exhausted-credit failures report the billing problem explicitly.

A failed or cancelled job with a successfully built attempt can be resumed through the generate endpoint by supplying `resumeAttemptId` alongside the normal prompt/profile/refinement settings. Recovery validates ownership, rebuilds the source and evaluates its renders before accepting anything. Photos do not need re-uploading.
