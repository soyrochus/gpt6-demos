# Edificio Europa architectural explorer

A Bun + Three.js interactive reconstruction of Edificio Europa in Valencia, available in the browser and as a Linux native desktop executable with Crosstalk voice control. Reference photographs in `stock-images/` informed the model; the desktop build renders the building procedurally and does not include those photographs.

## Run

```sh
cd ../cross-talk
bun install
# Configure OPENAI_API_KEY in cross-talk/.env for voice.
cd ../edificio-europa
bun install
bun run dev
```

Open http://localhost:3000. These commands run the browser version and load the server key and model configuration from `../cross-talk/.env`.

## Native executable (Linux)

### Compile

From the repository root, install both sibling projects' dependencies and compile:

```sh
cd cross-talk
bun install --frozen-lockfile
cd ../edificio-europa
bun install --frozen-lockfile
bun run build:desktop
```

The output is `edificio-europa/dist/edificio-europa-linux-x64`. After source changes, run `bun run build:desktop` again; it replaces the executable without launching it.

### Configure and launch

After compiling, launch with the existing Crosstalk `.env` configuration:

```sh
cd ../cross-talk
../edificio-europa/dist/edificio-europa-linux-x64
```

Alternatively, initialize shared local-app settings from that `.env`. From `cross-talk/`, run once:

```sh
mkdir -p "$HOME/.conf/crosstalk"
(umask 077; cp -n .env "$HOME/.conf/crosstalk/crosstalk.cfg")
chmod 600 "$HOME/.conf/crosstalk/crosstalk.cfg"
```

This preserves an existing shared file. Edit that file if you need to change it. It uses dotenv assignments such as `OPENAI_API_KEY=your-key`, with the full settings documented in the [configuration reference](docs/native-desktop.md#configuration). Then launch from the application directory:

```sh
cd ../edificio-europa
./dist/edificio-europa-linux-x64
```

Click **CROSSTALK** in the window to start voice. Without an API key, the manual Three.js explorer still works. The compiled application loads `.env` from its working directory; it does not automatically look in the sibling `cross-talk` directory. Existing environment and `.env` values take priority over the shared configuration. Restart after changing settings.

Building requires Bun 1.4.0, Rust/Cargo, a C toolchain, pkg-config, patch/tar, and GTK3/WebKitGTK 4.1 development libraries. These are installed on the reference machine. The first build downloads and compiles the native binding; later builds reuse its cache. See the [complete setup and build walkthrough](docs/native-desktop.md#build-and-launch) for a fresh machine.

The executable contains the Three.js explorer, Crosstalk service, and Bun runtime, and opens a native Wayland window. You do not start a separate Crosstalk server or need Bun installed to run the compiled file. The target computer still needs compatible GTK/WebKitGTK and audio libraries; voice requires network access. Photographs and remote fonts are omitted.

### Desktop behavior and troubleshooting

Voice and manual controls operate the same scene. Fullscreen uses the native window and can be requested by voice; Escape exits fullscreen. Saving a 4K PNG opens a system save dialog, and the location link opens the external browser. **End conversation** stops the microphone and voice session; closing the window also stops the embedded service.

If the panel says **Voice unavailable**, check configuration from the same directory where you launch the application:

```sh
./dist/edificio-europa-linux-x64 --diagnostics
```

Expect `voiceEnabled: true` and API-key provenance of `shared` or `environment/.env`. A missing key produces `voiceEnabled: false`; create the shared config above or launch from `cross-talk/`. Diagnostics print no key values. If configuration is enabled but voice still fails, check microphone access and network connectivity; detailed verification commands are in the [native guide](docs/native-desktop.md#verification-commands).

For development, `bun run dev:desktop` builds and runs the source host using `../cross-talk/.env`. For local checks use `bun run test:desktop`; native window and package checks use `bun run test:desktop:native` and `bun run test:desktop:package`. `--licenses` prints the notices bundled in the executable without opening a window.

See [native build, configuration, tests, and release status](docs/native-desktop.md). This is a Linux release candidate with remaining manual acceptance checks; macOS is not yet supported.

## Features

- Crosstalk voice control: ask about the current view, change lighting, explore viewpoints, zoom, rotate, or save a view.
- Three smoothly animated camera presets: urban perspective, street level, and skyline.
- Free orbit, pan, zoom, auto-rotation, reset, and fullscreen.
- Building-side and compass navigation, with a live orientation indicator shared with the AI.
- Daylight, golden-hour, and blue-hour lighting with refreshed environment reflections.
- 3840 × 2160 PNG export of the current viewpoint.
- Responsive mouse, touch, and keyboard controls.
- Single recessed crown-window row, gridded rear service core, and continuous mirror strips.
- Narrow-end entrance with a slender lift shaft, overhanging crown, bronze-framed glazed lobby, radial canopy seams, entrance steps, and spherical bollards.
- Recessed rooftop plant court, sloping metal perimeter, terracotta plant room, ventilation fans, pipes, and maintenance rails.
- Planting, streetscape, and surrounding urban context.

Drag to orbit; right-drag to pan; scroll or pinch to zoom. Focus the canvas and use arrow keys to pan, +/− to zoom, and R to reset.

## Crosstalk: from conversation to action

Europa supplies its description, current scene state, and registered tools to Crosstalk. GPT-Live-1 handles speech and conversation; GPT-6 Astra uses that context to choose actions. Crosstalk validates the actions and checks permissions, Europa executes them, and the results feed back into the conversation. Try “Show me around” for a tour of the available perspectives or “Show it at sunset” to change the lighting.

See [how Crosstalk works: diagram and walkthrough](../cross-talk/README.md#from-natural-conversation-to-application-action) for the illustrated flow and each component's role.

To integrate Crosstalk into your own web application, follow the [integration guide](../cross-talk/INTEGRATION.md), which uses Europa as the canonical example for server setup, application state, tools, and browser lifecycle.

## Validate and build

```sh
bun test
bun run typecheck
bun run build
```

These are browser build commands. Static output is written to `dist/`; browser voice requires the Bun server (or a reverse proxy forwarding `/crosstalk/*` to it). A standalone static host only serves the explorer. The development server uses Bun HTML imports directly, without Vite. Use `bun run build:desktop` for the executable with its embedded service.

## Accuracy and verification

This is an interpretive photo-based model, not photogrammetry or a measured survey. Dimensions, unseen surfaces, landscaping, and neighboring buildings are approximations. Reference images are supplied by the user.

The Crosstalk adapter in `crosstalk/` exposes nine semantic tools through a shared `EuropaController`. Manual controls and voice actions update the same scene, UI and state. Camera transitions support cancellation and report completion only after settling. When users freely orbit or rotate, semantic state marks the view as adjusted and does not claim an exact set of visible features.

The geographic reference supplied for the model is **39°28′18.4″N 0°21′25.5″W** (39.471778, −0.357083). The entrance is the **front**, facing **010°**; the opposite end is the **back**, facing **190°**. Left and right are defined as seen standing outside facing the entrance: **left 100°**, **right 280°**. These are fixed building sides, independent of the camera.

Use the Front / Left / Back / Right buttons, or ask “Show me the back”, “Show the north side”, or “Move around to my right 30 degrees”. `show_side` accepts building sides and eight compass directions; `orbit_view` moves the camera left/right relative to its current position. Both stop auto-rotation, recenter on the building, and follow an exterior arc. The compass dot marks where the camera is around a north-up outline of the building; the dark end marks the entrance. Reset returns to the last selected camera preset.

The AI's `spatial` state is computed from the actual camera, including after orbiting, panning and auto-rotation. Camera location bearing and looking direction are separate: a view **from north** looks roughly **south**. State describes geometry, not guaranteed feature visibility. Coordinates and orientation are user-supplied; distances remain approximate model units, and lighting presets are artistic rather than a geographic sun simulation. See the [spatial navigation specification](../cross-talk/specs/europa-spatial-navigation.md).

**In browser mode, fullscreen is an example of browser limits on AI tools.** `set_fullscreen({ enabled: true | false })` requests fullscreen or a return to normal view, but entering fullscreen by voice is not reliable: the browser requires user activation, such as a recent click. When blocked, the tool returns `USER_ACTIVATION_REQUIRED` and a toast directs the user to the fullscreen button. Exiting fullscreen needs no click. In the desktop executable, the same tool operates the native window without that browser activation requirement. Both modes report the actual fullscreen state and keep Crosstalk accessible inside fullscreen.

See [Crosstalk's README](../cross-talk/README.md) for protocol details, configuration, offline/browser tests, and opt-in live API checks. The previous one-off WebMCP bridge has been replaced by this application contract.
