# Native desktop implementation

The Linux implementation builds one executable containing Europa, Crosstalk, Bun, the native binding, browser assets, the audio worklet, and third-party notices. It uses the operating system's GTK/WebKitGTK and audio libraries. AI inference still uses the configured network services.

The current artifact is 87,008,456 bytes (about 83 MiB), including license notices. Its SHA-256 is `ed9af0d8b8363c22b5fd22617c96360bdd7d54d926072faab4a0fef4ffd4fb77`.

The implementation follows [the native executable specification](../specs/native-window-and-exec.md). This is a **Linux release candidate**: the automated native and synthetic-speech live checks pass, but the full human listening, interruption/device, sustained-conversation, and distribution acceptance matrix remains open. macOS is not implemented or claimed as supported by this build.

## Build and launch

### 1. Check the build machine

Use Linux x64 with a native Wayland desktop session. The reference machine already has the required tools. Check them with:

```sh
bun --version                 # reference: 1.4.0
rustc --version
cargo --version
cc --version
pkg-config --modversion gtk+-3.0 webkit2gtk-4.1
printenv XDG_SESSION_TYPE     # expected: wayland
```

For a fresh Ubuntu build machine, install the native development dependencies:

```sh
sudo apt update
sudo apt install build-essential pkg-config patch tar libssl-dev \
  libgtk-3-dev libwebkit2gtk-4.1-dev xdg-utils gstreamer1.0-plugins-good
```

Bun 1.4.0 and Rust/Cargo must also be installed and available on `PATH`. The first build needs network access for package dependencies, the pinned native source archive, and Cargo crates. No API key is needed to compile.

### 2. Install project dependencies and compile

Keep `cross-talk` and `edificio-europa` as sibling directories. For this checkout:

```sh
cd /home/iwk/src/gpt6-demos/cross-talk
bun install --frozen-lockfile
cd ../edificio-europa
bun install --frozen-lockfile
bun run build:desktop
```

The output is `/home/iwk/src/gpt6-demos/edificio-europa/dist/edificio-europa-linux-x64`. After source changes, run `bun run build:desktop` again to replace it. The build command does not launch the application.

The first build downloads a checksum-pinned nativewindow/webview source archive and builds it with `cargo --locked`; subsequent builds reuse the project-local `.build/native` cache. The native fingerprint includes the source checksum, full patch (including its Cargo.lock changes), Rust version, OS, and architecture. No Crumb checkout or investigation cache is consulted.

### 3. Configure voice and launch

To reuse the existing `cross-talk/.env`, launch from that directory:

```sh
cd /home/iwk/src/gpt6-demos/cross-talk
../edificio-europa/dist/edificio-europa-linux-x64
```

For shared local-app settings, create or edit `$HOME/.conf/crosstalk/crosstalk.cfg` with the assignments in [Configuration](#configuration), then launch:

```sh
cd /home/iwk/src/gpt6-demos/edificio-europa
./dist/edificio-europa-linux-x64
```

The compiled file loads local `.env` settings from the **current working directory**, not automatically from the executable's directory or the sibling `cross-talk` project. Shell environment and local `.env` settings override shared settings. Restart the application after editing configuration.

The native window opens with the building rendered by Three.js. Click **CROSSTALK** to begin voice, allow microphone access if prompted, and try “Show it at sunset.” Without an API key, the manual explorer remains available. Close the window to stop the application and its embedded Crosstalk service.

The executable includes Bun and Crosstalk; running it requires no separate server, Bun installation, source checkout, or photographs. Compatible system GTK/WebKitGTK and audio libraries are still required, and voice needs an API key and network access.

### Platform and development details

The native source is pinned to `acfbe3ce4be2b70dc664bdd6c5feb53c52f9ce3e`. [The maintained patch](../native/europa-webview.patch) includes the Crumb-derived Wayland container fix, exact-origin navigation, audio-only microphone permission, observed fullscreen state, and asynchronous GTK save/cancel operations. It does not enable experimental WebRTC.

The reference build machine is Linux x64, Ubuntu 26.04, glibc 2.43, native Wayland, GTK3, and WebKitGTK API 4.1 / engine 2.52.6. The resulting native addon links dynamically to these OS libraries, including libsoup 3 and JavaScriptCoreGTK 4.1. It is **not a promise of compatibility with older Linux distributions**, X11/XWayland, Windows, or macOS. Build on the oldest intended supported Linux environment and complete its acceptance before publishing more broadly.

Development and existing browser commands:

```sh
bun run dev:desktop   # source host; retains --env-file=../cross-talk/.env
bun run dev           # existing browser host and WebRTC voice
bun run start         # existing browser server
bun run build         # existing static browser build, including its reference images
```

Desktop output does not delete the browser build. `.build/desktop/manifest.json` records embedded asset sizes and hashes. The native executable contains no reference photographs, photograph URLs, remote font requests, development test routes, or HMR code from the browser application. Desktop typography uses system fallbacks; the perspective cards use numbered building icons.

```sh
./dist/edificio-europa-linux-x64 --diagnostics
./dist/edificio-europa-linux-x64 --licenses
```

Diagnostics report configuration provenance and whether voice is enabled, never configuration values. Both commands work without opening a window. License notices include the bundled JS dependencies, the locked Linux native dependency graph, and Bun's runtime/relinking notice. Release distribution should retain access to the corresponding source and rebuild instructions.

## Configuration

Shared configuration is exactly `$HOME/.conf/crosstalk/crosstalk.cfg`. The file uses dotenv assignments, comments, quoted/multiline values, escaped dollar signs, helper variables, forward references, and `${NAME:-fallback}` expansion. It is not INI or shell code.

```dotenv
OPENAI_API_KEY=replace-with-your-key
CROSSTALK_LIVE_MODEL=gpt-live-1
CROSSTALK_REASONING_MODEL=gpt-6-astra
CROSSTALK_REASONING_EFFORT=medium
CROSSTALK_VOICE=quartz
CROSSTALK_LOG_TRANSCRIPTS=false
CROSSTALK_DEBUG=false
```

The application does not create this file. Existing launcher environment and Bun-loaded `.env` values win; the shared file supplies missing settings; built-in defaults fill the rest. An explicitly empty `OPENAI_API_KEY` disables voice even if the shared file contains a key. Unrecognized settings cannot configure the native host or listener. An invalid shared file is rejected atomically and disables voice, while manual exploration remains available. The loader accepts at most 64 KiB and bounds interpolation depth and expanded values. It never evaluates shell substitutions.

Normal Bun startup dotenv behavior is enabled in the compiled artifact; startup bunfig loading is disabled. `--env-file` remains a Bun development command, not a flag promised by the compiled application. There is no shared-file hot reload and no lookup of the superseded shared `.env` or `.config/crosstalk` paths. Restart after changing configuration. Transcript logging requires explicit opt-in.

## Runtime boundaries

The process binds `127.0.0.1` on an OS-selected port, ignoring browser-mode `HOST`/`PORT`. A single-use 256-bit bootstrap capability exchanges for an HTTP-only, SameSite=Strict cookie. Exact Host and Origin checks protect the listener, WebSockets, native operations, and embedded resources. The native origin includes that launch's port; release devtools are disabled. Startup has a 15-second failure deadline; shutdown starts all cancellations immediately and shares one three-second deadline.

Crosstalk's control protocol stays at version 1.0 and advertises the optional `desktop-audio/1` capability. Its separate audio socket authenticates against the live control session, instance and token. The host owns generation IDs. Only one audio channel can own a control session; control loss ends its audio. A primary GPT-Live WebSocket handles input/output audio, transcripts, delegations and commentary, sharing the existing SessionManager, ToolRouter, permissions and Astra agent. There is no second sideband or automatic upstream session retry.

Audio is mono PCM16LE at 24 kHz with 20-byte headers and normally 20 ms frames. The worklet uses a continuous 32-tap windowed-sinc converter with 1,024 fractional phases, preserving history across chunk boundaries. It downmixes channels, clips non-finite/out-of-range samples, and emits no microphone monitoring. Capture has a 250 ms credit window; playback and upstream output are limited to 500 ms per stage. Playback primes for 40–60 ms and drains short tails. Stop disconnects the graph, closes the context, releases microphone tracks, and clears buffers immediately.

The inspected Live protocol describes continuous output audio, without a separate output invalidation event. The host therefore emits epoch zero and preserves delivery order; it does not flush on transcript changes. The local receiver supports explicit future epoch invalidation. See [the upstream WebSocket guide](https://developers.openai.com/api/docs/guides/voice-websockets).

Desktop fullscreen reports the observed GTK window state, including OS changes and Escape. PNG export snapshots with asynchronous `toBlob` encoding, restores the renderer immediately, then transfers bounded chunks to the host. The model never supplies a filesystem path: the native dialog selects it. The host validates PNG dimensions/signature, writes through a temporary file, and reports success after completion. Cancellation is a non-retryable save result; duplicate completion requests reuse the transaction result. The Maps operation accepts only `building-location` and uses one fixed HTTPS URL with an argument-array launcher.

The desktop browser bundle precompiles Europa's finite JSON schema set. This preserves validation without `unsafe-eval`; adding tools or changing schemas requires a rebuild. Browser and server modes retain their general Ajv validator.

## Verification commands

```sh
bun run typecheck
bun run test:desktop           # local protocol/fake-upstream tests; no AI traffic
bun run test:desktop:native    # actual Wayland window, microphone and GTK dialog
bun run test:desktop:package   # executable-only relocation and compiled configuration
```

The native harness exercises all nine tools, native fullscreen, a 3840 × 2160 export through the real write path, real GTK dialog cancellation, actual microphone capture, camera refusal, and authenticated startup. For automated successful export it substitutes only the chooser's destination callback with a temporary path. Human file-dialog selection and external browser launch remain part of manual acceptance.

The opt-in live harness makes **one bounded billable session**, sends the checked-in synthetic sunset speech fixture instead of recording the user's microphone, observes the real scene/tool result, waits for commentary acknowledgment, and measures nonzero samples from the native playback graph:

```sh
CROSSTALK_DESKTOP_LIVE=1 bun run test:desktop:live
```

Ordinary builds, tests and application launch never invoke that live harness. Human listening, built-in-speaker echo, speaking over the assistant, the full nine-tool spoken journey, device removal, and a 20-minute conversation still require the specification's manual acceptance.

## Recorded results, 2026-09-12

- Europa and Crosstalk typechecks passed.
- Combined application, desktop audio, configuration, export, worklet, protocol and governance suite passed: 41 tests, 4,414 assertions.
- Native integration passed: zero images, procedural scene rendered, all nine tools, back bearing 190°, observed fullscreen, a 4,085,786-byte 4K PNG, GTK dialog cancellation, and camera denial. A 600 ms microphone probe delivered 15,360 converted samples from a 44.1 kHz device.
- Live synthetic-speech journey passed with configured `gpt-live-1`, `gpt-6-astra`, and `quartz`. The strengthened check recorded 187,680 microphone-path samples, output peak 0.253, zero worklet errors, successful lighting mutation and acknowledged commentary. This proves rendered audio samples, not a human judgment of loudspeaker quality.
- The compiled executable launched from a temporary directory without Bun on PATH. Shared-file/local-dotenv/shell precedence and an empty-key override passed. Its authenticated loopback listener rejected unauthenticated access; measured shutdown was 14–33 ms across two runs. The source checkout was not hidden with a mount namespace.
- A synthetic key supplied to the build was absent from the executable. Asset scanning found no Crumb/investigation paths or test routes. The final photo-module separation also removes photograph path strings from the desktop bundle.
- Browser Playwright acceptance remains unresolved on this machine. Both installed Chrome engines timed out during interaction. An isolated checkout of the untouched committed source reproduced the same `set_lighting` failure at the same test assertion. An experiment isolating external font requests did not resolve the failures and was removed. This is not recorded as a passing browser release gate.

Release gates R1 (browser acceptance), R4 (human chooser/external-link checks), R5 (complete spoken journey and sustained/interruptible listening), and broader R6/R7 failure/platform matrices remain open. Do not publish the Linux build as fully release-certified until these are completed. macOS needs its own implementation, microphone metadata, build, and acceptance.
