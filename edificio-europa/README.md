# Edificio Europa architectural explorer

A Bun + Three.js interactive reconstruction of Edificio Europa in Valencia, based on the reference photographs in `stock-images/`.

## Run

```sh
cd ../cross-talk
bun install
# Configure OPENAI_API_KEY in cross-talk/.env for voice.
cd ../edificio-europa
bun install
bun run dev
```

Open http://localhost:3000. The startup command loads the server key and model configuration from `../cross-talk/.env`.

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

The static output is written to `dist/`. Voice requires the Bun server (or a reverse proxy forwarding `/crosstalk/*` to it); a standalone static host only serves the explorer. The development server uses Bun HTML imports directly, without Vite.

## Accuracy and verification

This is an interpretive photo-based model, not photogrammetry or a measured survey. Dimensions, unseen surfaces, landscaping, and neighboring buildings are approximations. Reference images are supplied by the user.

The Crosstalk adapter in `crosstalk/` exposes nine semantic tools through a shared `EuropaController`. Manual controls and voice actions update the same scene, UI and state. Camera transitions support cancellation and report completion only after settling. When users freely orbit or rotate, semantic state marks the view as adjusted and does not claim an exact set of visible features.

The geographic reference supplied for the model is **39°28′18.4″N 0°21′25.5″W** (39.471778, −0.357083). The entrance is the **front**, facing **010°**; the opposite end is the **back**, facing **190°**. Left and right are defined as seen standing outside facing the entrance: **left 100°**, **right 280°**. These are fixed building sides, independent of the camera.

Use the Front / Left / Back / Right buttons, or ask “Show me the back”, “Show the north side”, or “Move around to my right 30 degrees”. `show_side` accepts building sides and eight compass directions; `orbit_view` moves the camera left/right relative to its current position. Both stop auto-rotation, recenter on the building, and follow an exterior arc. The compass dot marks where the camera is around a north-up outline of the building; the dark end marks the entrance. Reset returns to the last selected camera preset.

The AI's `spatial` state is computed from the actual camera, including after orbiting, panning and auto-rotation. Camera location bearing and looking direction are separate: a view **from north** looks roughly **south**. State describes geometry, not guaranteed feature visibility. Coordinates and orientation are user-supplied; distances remain approximate model units, and lighting presets are artistic rather than a geographic sun simulation. See the [spatial navigation specification](../cross-talk/specs/europa-spatial-navigation.md).

**Fullscreen is retained as an example of browser limits on AI tools.** `set_fullscreen({ enabled: true | false })` requests fullscreen or a return to normal view, but entering fullscreen by voice is not reliable: the browser requires user activation, such as a recent click, which a voice request alone does not provide. Exposing the action as a tool cannot bypass that requirement. When blocked for lack of activation, the tool returns `USER_ACTIVATION_REQUIRED` and a toast directs the user to the fullscreen button. Exiting fullscreen needs no click. Native fullscreen changes (including the button and Escape) update the AI's `fullscreen` state, and Crosstalk remains accessible inside fullscreen.

See [Crosstalk's README](../cross-talk/README.md) for protocol details, configuration, offline/browser tests, and opt-in live API checks. The previous one-off WebMCP bridge has been replaced by this application contract.
