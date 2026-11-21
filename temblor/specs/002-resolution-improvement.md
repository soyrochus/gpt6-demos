# 002 — Character, weapon and rendering detail

**Status** Proposed

Improve the visual fidelity of a normal match in the bundled OpenArena level *Trial by Error* (`oa_rpg3dm2`). The player should be able to recognize the opponent’s pose and equipment across a corridor, see surface detail on the weapon held in front of the camera, and use the resolution of a Linux or macOS display. Use Quake III Arena gameplay as the visual reference. Keep the existing level so before-and-after captures show what the renderer and assets contribute. This proposal extends the [original engine specification](001-quake3-engine.md).

## 1. Give the opponent a textured, animated model

The current bot’s boots and arms are boxes, and its torso and helmet are eight-sided plates. Each face has a fixed tint. More screen pixels would reveal those shapes more clearly. The first change is to replace them with an authored OpenArena player model. [Current bot geometry](../src/draw.rs)

- Select one redistributable character with a complete mesh, skin and animation set. Bundle it through the existing asset manifest and record its source revision, notices and required source files. The public **Play** path must load the character on a clean installation.
- Support the MD3 features used by that character. Load the lower body, torso and head, resolve surface skins, and interpolate animation frames and attachment tags. Attach the torso, head and weapon at the model’s tags so the parts stay connected when the legs run and the torso aims.
- Drive standing, running, firing, pain, death and respawn poses from existing match state and events. Light the textured surfaces consistently with the surrounding arena. Match the model’s scale and foot position to the existing player bounds so its visible pose agrees with where the player can aim and hit.
- Use the bundled character on both the default arena and supported local map imports. The character is a game asset independent of the selected BSP.

## 2. Show the equipped weapon in first person

The current renderer builds the foreground gun from the same tubes and blocks used for weapons in the world. Replace the first-person representation for all six supported weapons, covering the gauntlet, machinegun, shotgun, grenade launcher, rocket launcher and lightning gun. Start with the machinegun and rocket launcher so the first spawn, pickup and weapon switch exercise the complete path. [Current weapon geometry](../src/draw.rs) · [Supported loadout](../README.md)

Use redistributable textured weapon assets and the same provenance checks as the character. Respect each model’s authored orientation, scale and attachment points. Align its firing effect with the visible muzzle and drive it from the existing shot event. Use the appropriate world representation for the bot’s held weapon. At normal field of view, the player should recognize the equipped weapon by its silhouette and surface detail with the HUD hidden or cropped from a capture.

## 3. Preserve the detail already present in the arena

Temblor resamples every material image into a 256 × 256 square before upload. The bundled `concrete_dark.jpg` is 512 × 512, `bluemetalsupport2e.jpg` is 256 × 128 and `metfloor1.jpg` is 128 × 128. These give three fixtures for checking loss of detail, rectangular textures and unnecessary enlargement. [Material loader](../src/material.rs) · [GPU texture upload](../src/renderer.rs)

Preserve the source width and height at the highest-detail mip level for supported images. Generate the remaining mip levels from that image, handling each dimension independently down to 1 × 1. Keep the authored texture coordinates, repetition, filtering, transparency and shader-stage order. Continue to sample the BSP’s baked lightmaps at their stored resolution. Bound decoded and GPU allocations for imported content and identify the affected asset if it exceeds a supported limit.

## 4. Render at the chosen display resolution

The browser currently caps the drawing buffer at 1,280 pixels wide. Rust independently clamps the surface to 2,560 × 1,440. Both layers must agree on the actual dimensions, including on Retina and ultrawide displays. [Browser sizing](../web/host.js) · [Surface sizing](../src/renderer.rs)

Provide **Native** as the default and **Performance** as an explicit lower-cost option. Native targets the canvas’s CSS dimensions multiplied by the device pixel ratio. Performance retains the current maximum width of 1,280 physical pixels. If the GPU limits either dimension, scale both by the same factor to preserve aspect ratio. Use the resulting dimensions for the canvas, GPU surface, depth buffer and camera aspect ratio. Recalculate on resize, fullscreen transitions and display scale changes. Keep HUD sizing in CSS pixels and preserve mouse sensitivity across modes.

## Acceptance

Run the shipping browser build with the bundled map. For each visual comparison, record the build, map, camera position and direction, field of view, and actual render dimensions. Compare model and texture changes at the **same** resolution first, then compare display modes at the same viewpoint.

| Check | Passing observation |
| --- | --- |
| Opponent in combat | A short gameplay sequence shows the skinned character at close range and across a corridor, running, firing, taking a hit, dying and respawning. Feet meet the floor, attached parts follow the pose, and the weapon stays in hand. |
| First-person weapon | Capture each supported weapon equipped. During a normal match, collect the rocket launcher, switch from the starting machinegun and fire. The silhouette and skin change with the selection, the effect begins at the muzzle, and ammo and damage match the existing rules. |
| Arena textures | Verify the three named fixtures’ source and uploaded base dimensions match. Capture the same wall or floor head-on and at a grazing angle. Check close detail, distant filtering, lightmaps and alpha-tested grates along the route. |
| Display sizing | On hardware WebGPU in desktop Chromium on Linux and macOS, record CSS size, device pixel ratio, GPU limit and actual surface size. Exercise Native and Performance, resize the window, and include a high-DPI case. At 1920 × 1080 physical pixels, a capable adapter yields 1920 × 1080 in Native and 1280 × 720 in Performance. Verify aim, crosshair centering and HUD readability in both. |
| Match and performance | Complete a first-to-five match and rematch. Repeat the original warm-up, two-minute combat measurement and five-rematch resource check. Retain the original 1280 × 720 target on the named reference machine (median ≤ 16.7 ms, p95 ≤ 33.3 ms). Report Native timings separately with their actual resolution and adapter. |

Record automated measurements and human visual observations separately. Report each operating system’s results against the revised build. An unavailable host or licensed retail fixture remains an open verification item for that target.
