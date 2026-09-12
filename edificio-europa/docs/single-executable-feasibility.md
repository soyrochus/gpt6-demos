# Europa and Crosstalk: single-executable feasibility

**Follow-up:** See [native window investigation](native-window-investigation.md) for the tested native executable, successful microphone/AudioWorklet patch, remaining WebRTC limitation, recommended WebSocket audio path, and `.env` / `$HOME/.conf/crosstalk` configuration. Photographs are not needed for Three.js rendering and are omitted in the native prototype; the photo-embedding checks below describe the original unmodified-UI investigation.

Investigated 2026-09-12. Europa checkout: `264c23b`; Crumb checkout: `6e71b9f`. Local tools: Bun 1.4.0, Linux x64, native Wayland, WebKitGTK 4.1 API / library 2.52.6.

## Conclusion

**A single executable containing Europa, its assets, and the Crosstalk service is feasible. Packaging and the local service were demonstrated without changing application source. A fully working Crumb desktop version needs additional native media and integration work; it is not a drop-in migration.**

| Delivery model | Assessment |
| --- | --- |
| One executable serving Europa and Crosstalk in an installed browser | Lowest-risk route. Compiled, relocated, and verified at the HTTP/WebSocket level. Real voice and browser acceptance remain to be exercised against the release binary. |
| One executable with a native window and the existing loopback service | Plausible and preserves the current Crosstalk protocol. Requires a network-capable adaptation of Crumb plus native media fixes. |
| Stock Crumb's embedded document, with no local listener | Requires a Crosstalk host transport, browser/host event handling, asset conversion, and native media fixes. Larger migration. |

The native route is gated first on successful microphone capture, WebRTC SDP/data-channel negotiation, and bidirectional audio in the target WebView. Building the executable is not the main uncertainty.

## What was verified

The following command was run from the Europa directory, using existing installed dependencies:

```sh
bun build --compile \
  --asset=./stock-images \
  --no-compile-autoload-dotenv \
  --no-compile-autoload-bunfig \
  ./index.ts \
  --outfile=/tmp/europa-feasibility-with-assets
```

It bundled 374 modules and produced an approximately **85 MiB** Linux executable. Without the explicit asset directory, the executable was approximately 81 MiB and dynamically referenced photographs returned 404. With the asset directory, the existing `Bun.file(new URL(..., import.meta.url))` handler served the embedded files successfully.

The executable was copied alone to `/tmp/europa-executable-check/europa` and launched from that directory with a cleared environment, no API key, and a PATH containing only `/usr/bin:/bin`. It did not require a Bun executable, node_modules, or adjacent application assets to perform these checks:

- Root HTML: HTTP 200.
- Embedded JavaScript and CSS: HTTP 200.
- All **12 reference photographs**: HTTP 200 and byte-identical to the originals.
- Crosstalk WebSocket hello: protocol 1.0 and session token issued.
- Validated application registration: `application.registered`.
- Authenticated voice-session route: expected HTTP 503 explaining that `OPENAI_API_KEY` must be configured.

This was a relocation test, not a filesystem-isolated container test. The original checkouts remained on the machine. No production API key was inspected, copied into the executable, or used in a live API call.

Existing automated suites also passed: Europa **6 tests / 4,155 expectations**; Crosstalk **23 tests / 82 expectations**. The Crosstalk suite uses fake upstream adapters, so it verifies local protocol, routing, delegation, validation, and lifecycle behavior, not live audio. Its loopback protocol test required running outside the restricted execution sandbox.

## Why Crosstalk can be included

[`index.ts`](../index.ts) already constructs `CrosstalkServer` inside the same Bun process that serves the UI. There is no separate Crosstalk daemon to package or launch. The file dependencies in [`package.json`](../package.json) resolve sibling TypeScript packages at build time; the compiled module graph includes their implementation, OpenAI client code, and validation dependencies.

The existing `build.ts` is a static browser build and does not package the service. A dedicated executable build command should coexist with it.

The remaining browser-delivery work is product behavior: launch the preferred browser if desired, choose a free loopback port or report a collision clearly, provide a usable configuration flow, and define how the user stops the server. The current signal handlers already dispose Crosstalk on SIGINT/SIGTERM.

## Native Crumb findings

The actual patched addon used by the local Crumb checkout was exercised in a temporary window with `allowMicrophone: true`. The page attempted microphone acquisition only for capability detection, with immediate track shutdown on success and no recording or network transmission.

```json
{
  "origin": "nativewindow://localhost",
  "secure": true,
  "webgl2": true,
  "rtc": "undefined",
  "media": true,
  "rtcError": "ReferenceError: Can't find variable: RTCPeerConnection",
  "microphone": "NotAllowedError"
}
```

This establishes WebGL2 context creation, not complete Europa rendering, performance, 4K export, or WebRTC compatibility.

The native binding's `platform/unified.rs` explicitly states that its camera/microphone flags are not enforced by the wry backend. Setting `allowMicrophone` emits a warning rather than installing a permission handler. The local WebKitGTK introspection data lists `enable-webrtc` with a default of `FALSE`; Crumb/wry does not enable it in the inspected path. The successful secure-context check rules out an insecure page as the immediate explanation for the probe's missing API.

WebKitGTK provides an [enable-webrtc setting](https://webkitgtk.org/reference/webkit2gtk/2.41.4/property.Settings.enable-webrtc.html) and a [permission-request signal](https://webkitgtk.org/reference/webkit2gtk/stable/signal.WebView.permission-request.html). A concrete candidate fix is to configure WebRTC on the underlying WebView and handle audio-only capture permissions for the application origin. **Whether those changes produce working voice on the installed WebKit/GStreamer stack remains unverified.**

Crosstalk's [`LiveTransport.ts`](../../cross-talk/src/client/LiveTransport.ts) directly uses `getUserMedia`, `RTCPeerConnection`, a data channel, and remote audio playback. Its present transport cannot run in the tested Crumb window.

Other native integration work:

- **Networking:** Crumb's bootstrap loads an embedded document with a restrictive CSP. Europa uses HTTP and WebSocket routes under `/crosstalk`. For a hybrid, launch the in-process loopback server first and load its URL in the window; configure the exact trusted origin and retain origin/session validation. This changes Crumb's no-local-server architecture. Merely allowing a different origin in Crosstalk is insufficient for cross-origin fetch, since its handler does not currently implement CORS preflight responses.
- **No-listener alternative:** Extract a typed transport boundary around Crosstalk's core rather than pretending its HTTP handler is a Crumb operation. Preserve registration, state requests, tool invocation/results, confirmation, cancellation, transcript/status events, and disconnect cleanup. Crumb's current bridge resolves request/response operations and does not itself provide the unsolicited event stream Crosstalk expects.
- **Assets:** The Bun server variant already embeds photos with `--asset`. Crumb's document variant needs to turn dynamically generated image URLs into embedded data or supported resource URLs. Its UI builder also expects particular HTML script/stylesheet placeholders, which differ from Europa's current HTML.
- **Fonts:** `style.css` imports Google Fonts remotely. Vendor the font files for a fully packaged visual appearance and offline explorer, or explicitly accept system fallback typography.
- **PNG export:** Europa currently clicks a data-URL download link. Native download/save behavior needs verification and potentially a validated host save operation.
- **Fullscreen and links:** Validate actual fullscreen behavior and preserve state synchronization. Crumb's binding denies new-window requests, so Europa's `target="_blank"` Maps links need an explicit external-browser action.
- **Shutdown:** Closing the window must stop microphone capture, close peer connections, dispose Crosstalk/upstream sessions, and stop the loopback listener when using the hybrid.

## What “single executable” does and does not cover

One distributable can contain the app, frontend assets, Crosstalk implementation, Bun runtime, and the target native addon. It does not make the current voice service offline: the code calls OpenAI over HTTPS and a server sideband WebSocket, while browser audio uses WebRTC.

Users still need network access and a credential with access to the configured models for voice. Supply credentials at runtime through environment/configuration or a host-side settings flow. The current scripts' `../cross-talk/.env` path should not become a release dependency. Do not embed a shared developer API key in a redistributable binary; a client-side executable cannot keep that key secret from its recipient.

Crumb's native executable still depends on the operating system's WebView stack. Its documented supported targets are Linux x64 on Wayland and macOS arm64, with builds performed on their target OS. It is not one universal binary, and stock Crumb does not support Windows, X11/XWayland, or Intel Macs. Linux distribution/runtime compatibility needs an explicit supported baseline.

macOS voice remains a separate acceptance task, including microphone privacy metadata and OS consent. Crumb currently emits raw unsigned executables rather than `.app` bundles; the appropriate [microphone usage description](https://developer.apple.com/documentation/bundleresources/information-property-list/nsmicrophoneusagedescription), launch identity, and release packaging must be proven on a Mac. Linux results do not establish macOS behavior.

## Suggested next step

If a native window is required, first make a minimal Crumb media spike pass on each target: WebRTC enabled, microphone permission accepted, real SDP exchange, data channel opened, assistant audio audible, and capture/session cleanup on close. Keep that work independent of the full Europa migration.

Once media passes, the lowest-change native implementation is a Crumb-derived window plus the already proven single-process loopback server. If Crumb's no-listener constraint is essential, use the typed in-process Crosstalk transport instead and budget for a more substantial integration.

Release acceptance should then cover the complete explorer, all nine semantic tools through live voice, reference photos, fonts, external links, fullscreen, 4K export, cancellation/reconnection, and clean shutdown from a relocated executable. No fully working native release or live-voice success is claimed by this investigation.

General bundling behavior is documented in [Bun's standalone executable guide](https://bun.sh/docs/bundler/executables); the packaging findings above were tested with the locally installed Bun 1.4.0.
