# Elfspace

Built with **GPT-6.2 Astra in 15 minutes total**, Elfspace is a single-file Three.js experience inspired by accounts of DMT “machine elf” encounters. Twelve jeweled figures inhabit a floating crystal cavern. Pause in flight and they gather around you.

## Run with Bun

From the repository root, run:

```sh
cd dmt-experience
bun install --frozen-lockfile
bun run dev
```

Open [Elfspace on localhost](http://localhost:3012/) in a browser with WebGL 2. To use another port, run `PORT=4000 bun run dev`. The repository’s `./run-all.sh [BASE_PORT]` launcher serves Elfspace at the base port plus 12.

You can also open **index.html** directly in your browser. On macOS, run `open index.html` from this directory. The HTML bundles the library for offline use.

## First encounter

1. Click **Turn sound on** to hear the score. Click the scene and move the mouse to look around.
2. Stay in place for more than six seconds. You can keep looking around as the elves begin to gather. Watch one mask long enough to see its brows, lids, cheeks, and mouth settle into another expression.
3. Look toward the distant rose window and strafe sideways. The nearby shards cross your view faster than the portal rings. Flying toward an elf also makes it yield space.
4. Press **Esc** to release the pointer. **Reset position** returns you to the opening view.

## Controls

| Action | Input |
|---|---|
| Look around | Click the scene for mouse capture, or drag to look |
| Fly forward or backward | W / S, along the viewing direction |
| Strafe left or right | A / D |
| Move up or down relative to the view | Space / either Shift key |
| Release the captured mouse | Esc |
| Fly on a touchscreen | Drag to look and hold an on-screen arrow to move |
| Enable or mute the score | **Turn sound on** / **Turn sound off** |

To share a runnable copy, send **index.html**. It contains the scene, generated artwork, audio synthesis, and offline runtime. The three JPEGs in `images/` are design references. For encounter timing, rendering, audio behavior, and repeatable checks, see the [as-built specification](spec-dmt-experience.md).
