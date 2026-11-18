# Elfspace — as-built experience specification

This document describes the single-file application in repository revision `1dde9b0`. The runtime source is [index.html](index.html). Launch instructions are in the [README](README.md).

## Experience and opening composition

Elfspace is an artistic interpretation of a DMT breakthrough encounter. The player can fly through a luminous chamber, watch the faces of 12 geometric beings, and hear an optional score respond to their proximity. The encounter is open-ended. Its rhythm comes from staying still, letting the beings gather, then moving through them.

The camera starts level at world position `(0, 0.35, 7)`, looking along negative Z. A large teal figure floats slightly left of center. Two more figures frame the opening view, others occupy the space ahead, and three start behind the viewer. Far down the chamber, a five-layer rose window provides a landmark for judging depth and direction.

## Runtime and startup

| Component | Implemented behavior |
|---|---|
| Distribution | One HTML file contains the markup, CSS, application module, shaders, generated asset definitions, and offline library bundle. It opens directly from disk. |
| Online loading | An import map pins Three.js to 0.170.0 on jsDelivr. The loader requests the core module, `EffectComposer`, `RenderPass`, `UnrealBloomPass`, and `OutputPass` together. |
| Offline loading | If the imports fail or take longer than 1.6 seconds, the loader decodes the embedded Base64 payload, inflates it with `DecompressionStream('gzip')`, imports the resulting blob as a module, and revokes its URL. |
| Browser capabilities | Rendering uses WebGL 2, JavaScript modules, and Canvas 2D for mask painting. The optional score uses Web Audio. Mouse-look supports pointer lock and dragging. |
| Startup feedback | “Entering the chamber…” appears during initialization. A caught startup failure logs the error and displays guidance to open the file in a current browser with WebGL 2 enabled. |
| Session state | The scene, flight position, animation clocks, and sound switch live in page memory. Reloading starts a fresh, silent encounter. The procedural layout uses a fixed random seed of 21315. |

## Navigation and interface

The canvas fills the browser viewport and resizes with it. The upper-left corner carries the Elfspace mark and “Crystalline encounter.” Sound and reset controls sit in the upper-right corner. The desktop footer shows movement keys, a mouse-capture hint, and flight coordinates rounded to one decimal place.

The opening instruction reads “Move with WASD, look with mouse. You are entering the space of the self-transforming machine elves.” It begins fading 6.9 seconds after initialization and fades over 1.2 seconds. The control buttons remain available throughout the encounter.

| Input or event | Response |
|---|---|
| Click and move the mouse | Focuses the canvas and requests pointer lock. Horizontal movement changes yaw, vertical movement changes pitch. Sensitivity is 0.0022 radians per pointer unit and pitch is limited to ±1.52 radians. |
| Drag on the canvas | Changes the view on touch devices and when mouse capture is unavailable. |
| W / S, A / D, Space / Shift | Fly forward/backward, left/right, or up/down in the camera’s local axes. Input is normalized so diagonal flight has the same target speed of 6.5 world units per second. Velocity eases toward the requested speed and decays on release. |
| Coarse pointer | Four hold-to-move arrow buttons replace the keyboard legend. Up and down arrows mean forward and backward. Looking up or down steers vertical travel. |
| Esc or window focus loss | Esc releases pointer lock. A lock change clears held movement keys and updates the hint. Losing window focus clears held keys and the active drag. |
| Reset position | Restores the opening position and orientation, zeros velocity and camera sway, clears movement input and the gathering timer, and returns all figures to their home positions. The animation and score clocks continue. |

Flight is bounded to X from −48 to 48, Y from −6 to 32, and Z from −85 to 44. Geometry can be flown through. The coordinate display samples the flight position every eight frames and excludes the small visual sway. At viewport widths of 600 CSS pixels or less, the interface hides the coordinates and compacts the header.

## Machine elves

The 12 figures share three mask and costume designs, four instances of each. Their palettes combine teal and amber, violet and pink, or crimson and gold. Each figure has a sculpted head, pointed ears, a ceremonial crown, flared shoulder wings, a breastplate, segmented armor, jointed limbs, and three-fingered hands. The opening figure is scaled to 1.29 times its base size.

Recognizable faces are central to the design. Eye sockets, nose, cheeks, lips, and jaw have modeled depth. A procedurally painted 1024 × 768 enamel texture supplies irises, pupils, eyelid rims, brows, lip outlines, forehead jewels, and engraved cheek patterns. The texture follows the face as it deforms. The visual references used during design are [dmt-1.jpeg](images/dmt-1.jpeg), [dmt-2.jpeg](images/dmt-2.jpeg), and [dmt-3.jpeg](images/dmt-3.jpeg).

### Facial expression

Each mask uses a 112 × 80 segment surface with six relative position morph targets. Every figure cycles through the following poses in order, starting at a different phase.

| Pose | Visible cues |
|---|---|
| Happy | Mouth corners and cheeks lift, and the lips open into a smile. |
| Sad | Mouth corners fall, inner brows rise, and the head tips forward slightly. |
| Content | A smaller smile accompanies relaxed lids and slightly raised cheeks. |
| Angry | Inner brows press down, eyes narrow, and the mouth tightens. |
| Serene | Lids lower deeply and the lips settle into a slight, quiet smile. |
| Occupied | One brow rises higher, the eye region shifts sideways, and the head tilts and turns as if attending to something nearby. |

A pose interval lasts 11.5, 12.2, 12.9, or 13.6 simulation seconds depending on figure index. The face holds for the first 42% of the interval, then blends smoothly into the next pose over approximately 6.7–7.9 seconds. A full cycle takes 69–81.6 seconds. Facial timing runs independently of player movement and the separate crown transformation.

### Approach, orbit, and transformation

| Condition | Figure behavior |
|---|---|
| Opening or dispersed | Each figure floats near its own home position with small horizontal and vertical oscillations. Its body turns toward the camera, with gentle rotational motion superimposed. |
| More than six seconds without translational input | Each target position gradually shifts from home to a moving ring around the camera. Looking around allows the timer to continue. The orbit radii are 4.6, 5.6, and 6.6 units, with staggered angles and up to 1.6 units of vertical variation. |
| Flight resumes | The gathering influence decays and targets move back toward home. Figures within eight units receive an additional outward displacement, strongest at close range. |
| Transformation | On staggered periods of 14–18.95 seconds, each figure has a two-second expansion and reassembly. Crown and wing vanes unfold while small jewels scatter, rotate, shrink, and return. A continuous ripple runs through the vanes between bursts. |

## Chamber, light, and parallax

| Layer | Construction and motion |
|---|---|
| Distant sky | A camera-centered sphere with slowly evolving auroral bands fills the dark vault. Its center follows camera translation, making it the distant visual reference. |
| Rose window | Five layers of star polygons, interlaced petals, ticks, and circular outlines sit around Z = −38. Each has 24 radial sectors. Successive radii shrink by a factor of 0.66. Alternate layers rotate in opposite directions, tilt, and oscillate in depth. The whole assembly bobs vertically. |
| Banks and ceiling | Two banks contain 190 clusters of four octahedral spires. Another 96 icosahedral formations hang overhead. Time-driven gradient noise changes their facets while position-dependent phases make them tilt, rise, and drift in waves. |
| Suspended crystals | Sixteen clusters of five shards occupy different world-space depths, including positions behind the starting camera. They hover and roll. Nearby clusters cross the portal more quickly in screen space during lateral flight. |
| Floor | A 150 × 155 unit triangulated, uneven surface catches colored specular highlights. A network of three-branched luminous seams marks the riverbed. |
| Motes and orbs | A single point cloud draws 2,500 particles with varying sizes and colors. They drift continuously. Nearby particles shift against the direction of travel, with the displacement falling off with distance from the camera. |

Parallax comes from perspective projection and translation through these layers. At rest, the camera also moves laterally by up to 0.105 units and vertically by up to 0.038 units in view space. The sway fades with speed, reaching zero target amplitude at three units per second. Its offset is separate from the player’s flight position.

Two colored point lights change hue and position over time, alongside ambient light. The crystal shader uses gradient noise for deformation, face normals for faceting, barycentric coordinates for luminous edges, and a view-dependent color response for iridescence. Exponential fog, shader depth fading, auroral light, and additive particles supply the sense of volume.

## Soundscape

The encounter starts silent. **Turn sound on** creates or resumes the audio context and fades in the score. The button changes to **Turn sound off**, which stops scheduling new notes and fades the master output to silence. Turning it on again resumes the sequence at its next beat.

Four eight-beat harmonies support a low sine bass, staggered chord tones, and glassy bell phrases with rests. Each bell combines a fundamental with a short upper partial. Occasional triangle-wave answers enter between beats, bend slightly downward, and sound across the stereo field from the lead. Phrase selection shifts against the chord cycle on successive groups of four bars.

The nearest elf’s distance sets the beat duration between approximately 0.54 and 0.62 seconds and increases the level of answering notes as it approaches. Its horizontal bearing relative to the camera places the bells in stereo. A 320 ms feedback delay provides an echo. Notes use the Web Audio clock, with the render loop scheduling up to 160 ms ahead. All tones are synthesized in the browser.

## Rendering and performance

The perspective camera has a 64° vertical field of view and clipping distances of 0.08 and 210 units. The rendering sequence is **scene → bloom → output**. `UnrealBloomPass` uses strength 0.42, radius 0.35, and threshold 0.88. The output uses ACES filmic tone mapping at exposure 1.12.

Instanced meshes batch the crystal banks, ceiling, shards, armor, and jewels. The three mask designs share geometry and textures among their instances, with separate expression weights per elf. Both renderer and post-processing buffers start at the device pixel ratio capped at 1.35. Every 120 frames, an average frame time above 23 ms reduces the rendering ratio by 17%, down to 0.65. The viewport size stays fixed in CSS pixels. Animation advances by at most 60 ms per frame to limit jumps after a stall.

## Verification

The following checks can be repeated from a local copy of the HTML.

| Check | Procedure and expected result |
|---|---|
| Standalone startup | Open the HTML from disk with CDN requests blocked. The loading message clears, the scene animates, and the encounter starts silent. |
| Flight and reset | Capture the mouse, turn, and fly. Coordinates change. Release with Esc and select **Reset position**. The opening view and starting coordinates return. |
| Encounter response | Keep looking around for more than six seconds without translating. Figures begin to gather. Resume flight near one and observe it yield space. |
| Expression and transformation | Follow one face for a full cycle. Observe six gradually changing poses. During the quicker crown and jewel bursts, the facial expression continues on its own timing. |
| Depth and motion | Face the rose window and strafe sideways. Foreground shards travel farther across the view than the portal. Stop and observe floating banks, ceiling formations, and independently moving rings. |
| Audio | Enable the score for several bars. Listen for harmonic changes, rests, and answering phrases. Turn past a nearby elf to hear the lead shift in stereo, then mute and check the button label. |
| Responsive controls | Resize the viewport and inspect the HUD. On a coarse-pointer device, hold a directional arrow and drag the scene to turn. |

During development, local Chromium checks exercised offline startup, pointer lock, flight, reset, and sound toggling. An audio check detected scheduled notes and measured silence after muting. All six expressions were also rendered from a fixed viewpoint for comparison. A short local run measured 60 fps at 1100 × 700. That measurement applies to the tested browser and viewport. Touch interaction and performance on other devices are documented from the implementation.
