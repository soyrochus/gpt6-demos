# Native Europa window and local Crosstalk configuration

Follow-up investigation, 2026-09-12. This supersedes the initial report's untested native-media assumptions. Application code and the Crumb checkout remain unchanged; the native binding was rebuilt in `/tmp/europa-native-investigation`.

## Result

**The native window, Three.js scene, and Crosstalk application controls work inside one compiled Linux executable. Microphone capture works with a small native permission patch. The existing WebRTC voice transport still cannot run in this machine's system WebKit. A WebSocket audio transport is the recommended next implementation.**

The temporary executable is `/tmp/europa-native-investigation/europa-native-probe` (86,078,664 bytes, about 82.1 MiB). It embeds the native addon, Bun, the UI, and the Crosstalk service. It launches the service on an automatically selected loopback port and opens that URL in the native window. Its test run closes automatically. It is an investigation harness, not a finished desktop release.

Photographs are omitted. The test bundle removes the UI's photograph elements and remote Google Fonts import, using system font fallbacks. The Three.js building renders independently of those assets. Production UI changes have not been applied.

## Native checks performed

Environment: Ubuntu package `libwebkit2gtk-4.1-0` version `2.52.6-0ubuntu0.26.04.1`, native Wayland, Bun 1.4.0, Crumb's pinned wry-based native binding.

| Check | Result |
| --- | --- |
| Compiled executable loads native addon | Pass |
| Europa loads and renders Three.js canvas | Pass, 1196 × 627 canvas |
| Photographs required for scene | No; `document.images.length` was zero |
| Crosstalk registration through its actual WebSocket protocol | Pass |
| `set_lighting({lighting:'golden'})` through the actual ToolRouter | Pass |
| `show_side({side:'back'})` through the actual ToolRouter | Pass; returned settled state and 190° camera bearing |
| Canvas PNG extraction | Pass; image visually inspected below |
| Patched microphone acquisition | Pass for both embedded and localhost origins |
| Web Audio context | Running |
| Microphone → AudioWorklet | 15,360 samples delivered during a 350 ms probe at 44.1 kHz |
| WebRTC API after setting `enable-webrtc=true` | Still absent on both origins |
| Real GPT-Live audio / assistant playback | Not tested; no live API call made |
| macOS | Not tested |

The AudioWorklet probe counts samples without recording, logging, or transmitting their contents; its output buffers are silent and all capture tracks are stopped at completion. Audio capture is established, but audible output, echo cancellation quality, resampling, streaming latency, and sustained full-duplex behavior still need acceptance tests.

![Canvas captured from the native executable after Crosstalk selected golden-hour lighting and the rear view](native-investigation/europa-native.png)

## Microphone patch and the WebRTC limit

The [diagnostic native patch](native-investigation/linux-media-probe.patch) adds WebKitGTK access to the copied binding. It enables the WebRTC setting when `allowMicrophone` is true, and installs an audio-only media permission callback for a configured trusted page origin. Camera requests are denied. The original binding warning remains in this diagnostic build and is no longer accurate for its patched Linux microphone path.

That patch changed `getUserMedia` from `NotAllowedError` to success. The subsequent AudioWorklet test proves that the resulting stream delivers audio samples, rather than merely returning an empty capability object.

WebRTC is a separate issue. The native setting reads back as **true**, but `typeof RTCPeerConnection` remains **undefined**. Repeating the check with `http://127.0.0.1` produced the same result, so switching away from Crumb's custom origin does not fix it.

The exact installed Ubuntu package's [packaging sources](https://packages.ubuntu.com/source/resolute/webkit2gtk) were inspected. Its rules do not opt into WebRTC/experimental features, while [upstream WebKit 2.52.6's GTK configuration](https://github.com/WebKit/WebKit/blob/webkitgtk-2.52.6/Source/cmake/OptionsGTK.cmake#L132) ties `ENABLE_WEB_RTC` to `ENABLE_EXPERIMENTAL_FEATURES`. Together with the runtime probes, this points to a build-time WebRTC limitation, beyond Crumb's runtime setting. Merely installing GStreamer's `webrtcbin` and Opus components is insufficient; both are already present on this host.

A custom WebKit build might resolve this, but it would add a substantial browser-engine build and distribution dependency. The investigation did not rebuild or replace system WebKit.

The patch is not a production permission design: a release must keep an exact application-origin allowlist, prevent untrusted frames/navigation, request capture from the conversation control, handle denial clearly, and preserve camera denial. The current no-network Crumb bootstrap also needs an explicit supported network-capable mode for this loopback architecture.

## Recommended native audio path

```text
Native WebView: Europa + microphone + AudioWorklet capture/playback
        ↕ local audio channel
Same executable: Bun + Crosstalk + primary GPT-Live WebSocket
        ↕ authenticated TLS WebSocket
GPT-Live
```

OpenAI's [GPT-Live WebSocket guide](https://developers.openai.com/api/docs/guides/voice-websockets) documents primary audio sessions over `wss://api.openai.com/v1/live/sessions`, started with `session.start`, and streaming input/output audio events. This preserves GPT-Live and the current reasoning model; a model migration is unnecessary. The API key stays in the Bun host.

The required implementation is narrower than replacing Crosstalk:

1. Add a desktop audio transport alongside the existing browser WebRTC transport. Capture through AudioWorklet, convert/resample to the configured PCM format, and schedule returned audio through a bounded playback buffer. The probe's 44.1 kHz input needs conversion for the documented default 24 kHz PCM format.
2. Add a primary-WebSocket Live adapter. It receives audio and conversation events and can send commentary itself, so a second sideband connection is unnecessary in this mode. Preserve client delegation and Crosstalk's existing validation, permissions, tool execution, and cancellation behavior.
3. Generalize the current `LiveAdapter.connect(sdp, ...)` / `SessionManager.start(app, offer)` boundary so audio transport does not pretend to be an SDP offer. Add authenticated local audio transport messages or a dedicated channel bound to the existing Crosstalk session. Bound payload size, queue duration, and send rate; do not let raw audio messages become generic host commands.
4. Preserve startup/ready/error/close semantics and cancel microphone capture, playback, pending actions, upstream connections, and the local listener when the window closes.

Using a WebSocket means the application takes responsibility for buffering, sample conversion, congestion/backpressure, playback timing, and interruption behavior that WebRTC currently handles. The documented upstream capability and local audio capture are verified; this integrated transport has not yet been implemented or tested live.

The current browser path can continue using WebRTC. The new desktop path can share the application manifest, the nine Europa tools, the reasoning/delegation engine, and the UI.

## `.env` and `$HOME/.conf/crosstalk`

The requested configuration layout is practical:

```text
Development: existing bun --env-file=../cross-talk/.env command
Installed app: $HOME/.conf/crosstalk/.env as shared defaults
Local override: normal working-directory .env loading
```

Use the requested `.conf` directory; this proposal does not silently substitute `.config`.

Recommended precedence, highest first:

1. Environment supplied by the shell/launcher.
2. The app's normal Bun `.env` configuration, including the current explicitly selected development file.
3. Missing values filled from `$HOME/.conf/crosstalk/.env`.
4. Crosstalk's code defaults.

The shared directory is runtime configuration, not a bundled asset. Resolve it from the user's home directory, regardless of where the executable lives or the file manager launches it. Load it before constructing `CrosstalkServer`. Keep the existing `dev` and `start` scripts and their explicit sibling `.env` path.

Crumb's release compiler currently sets `autoloadDotenv: false`; the desktop app's release configuration must enable it to preserve normal local `.env` loading. Bun's default support for `.env`, mode-specific files, and `.env.local` is documented in [environment variables](https://bun.com/docs/runtime/environment-variables).

A separate compiled probe verified startup loading and fallback using **synthetic values only**:

| Inputs | Observed result |
| --- | --- |
| Working-directory `.env` + shared file | Local values win; missing shared values are filled |
| Shell variable + both files | Shell value wins |

The probe used `process.loadEnvFile(sharedPath)` after Bun startup. That function is available in the installed Bun and leaves existing variables intact. One compatibility detail matters: unlike Bun's startup dotenv reader, its shared-file parser did **not** expand `$VARIABLE` references in the test. Literal API keys and model settings work; if shared files must support Bun-style interpolation too, implement and test that explicitly rather than claiming the parsers are identical. Do not change the existing startup loader to this parser.

A release should treat an absent shared file as optional and report other read/parse failures without printing secret values. The existing key or user home configuration was not modified during these tests.

## Reproduction artifacts and remaining work

The [native capability probe](native-investigation/probe.ts.txt), [Europa harness](native-investigation/europa-window.ts.txt), and [temporary page builder](native-investigation/build-europa-page.ts.txt) are preserved as text artifacts for review, outside TypeScript's project compilation. They retain the investigation's absolute `/tmp` and checkout paths and are not production build scripts. The patch applies to the pinned native crate after Crumb's existing Wayland patch.

Actual temporary build sequence:

```sh
cd /tmp/europa-native-investigation/webview
CARGO_TARGET_DIR=/tmp/europa-native-investigation/target cargo build --release --offline
cp /tmp/europa-native-investigation/target/release/libnative_window.so /tmp/europa-native-investigation/native-window.node
cd /tmp/europa-native-investigation
bun build-europa-page.ts
bun build --compile --no-compile-autoload-dotenv --no-compile-autoload-bunfig europa-window.ts --outfile=europa-native-probe
```

The harness deliberately disables dotenv loading and supplies an empty key because it tests local rendering and tool actions only. This is separate from the recommended production configuration above.

Next implementation milestone: add the WebSocket audio path and shared config loader, then exercise a live conversation that changes Europa, hears the assistant, handles interruption, and shuts down cleanly. Also verify production 4K saving, fullscreen, external links, platform dependencies, and macOS microphone/launch metadata before calling it a fully working desktop release.
