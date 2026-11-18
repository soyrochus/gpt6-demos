# Fuel Left

Implementation specification for a Three.js homage to the 1995 Windows pinball table shown in the reference photograph.

Any reference to the name ¨CADET¨ should be interpreted/replaced by ¨Fuel Left¨ to avoid copyright issues

**Status:** normative. An implementing agent follows this document and does not invent a different game.
**Product name to ship:** `Cadet` (window title: `Cadet`). Never title it with a Microsoft, Maxis, or Cinematronics mark.
**Reference photograph:** the portrait playfield supplied with the request. Use it as a composition target only. Do not texture the table with it.

---

## 0. Agent bootstrap

Read this entire document before writing code.

1. Build only the game described here. Do not add multiball, a second table, a story mode, or modern pinball missions.
2. Do not download, decompile, or embed the original game, its `PINBALL.DAT` / `CADET.DAT`, `table.bmp`, WAV, MIDI, icons, fonts, or strings. Do not call the decompilation projects. Recreate behavior from this spec.
3. All magic numbers live in `src/rules/constants.ts`. If a number in this spec and a number in code disagree, the spec wins until a tuning note in §26 says otherwise.
4. Implement in the phase order in §21. Do not start the mission state machine before a ball can be cradled, plunged, and drained.
5. Physics is a custom 2D simulator rendered by Three.js. Do not drive the ball with Cannon, Ammo, Rapier, or Physijs. Those solvers will not cradle or flip correctly.
6. After Phase 1 and after Phase 5, stop and compare a screenshot to the reference photograph before continuing.
7. The Windows ruleset is the target, not the Full Tilt retail ruleset. Differences are listed in §3.3 and are out of scope unless marked OPTIONAL.

Language of the spec: **MUST** / **MUST NOT** / **SHOULD** / **MAY**.

---

## 1. Intent

Ship a browser pinball table that a person who played the Windows 95 / XP table will recognize in one second, and whose shots, ranks, and failure modes match that game's memory.

The feel to hit:

- A heavy silver ball on a dark, back-lit navy field.
- Fast flippers that can cradle, pass, and send the ball the length of the table.
- A purple launch ramp as the main shot.
- A copper plunger lane down the right.
- Three angry white bumpers at the top and three more sitting on the left ramp.
- A ring of cyan progress lights around an amber rank core in the middle of the table.
- Death by the outlanes, survival by nudging, and a tilt that actually punishes you.
- Rank climbing from Cadet to Fleet Admiral by selecting a mission and finishing it before the fuel lights go out.

The original is not real-time 3D. It is a pre-rendered sprite table with a 2D physics tick. This project is real-time 3D **art** of that same table, with 2D physics that are tuned to the same decisions. The camera never becomes a toy.

---

## 2. Intellectual property

MUST:

- Model, texture, and animate every mesh originally. Procedural canvas textures are preferred (cracks, scuffs, plastic grain).
- Write original sound by synthesis (Web Audio). No ripped effects.
- Write an original music loop. Style guidance is in §19. Music defaults **off**.
- Use an original bitmap-style UI font (a small hand-drawn or freely licensed pixel face). Do not copy the original's bitmap glyphs.
- Invent an apron wordmark. The reference photo shows publisher marks on the apron; do not reproduce those words or logos. A plain `CADET` in small tracked capitals is enough.

MUST NOT:

- Ship the original high-score names, cheat strings, or dialog copy verbatim. Paraphrase the status lines in §18.3; they are functional, not decorative.
- Claim endorsement. About box text: "An original homage to 1990s desktop pinball. Not affiliated with the original publishers."

---

## 3. Historical target

### 3.1 What the reference is

The photograph is the **Space Cadet** playfield:

- Designed at Cinematronics, published by Maxis in *Full Tilt! Pinball* (1995).
- Ported at Microsoft (programmer David Plummer) and shipped in Microsoft Plus! for Windows 95 on 24 August 1995, then in Windows NT 4.0, Windows 2000, Windows Me, and Windows XP.
- It was **not** part of the Windows 98 base install. People still mean this table when they say "Windows 95/98 pinball."

### 3.2 Ruleset to implement

Implement the **Microsoft Windows** rules, as observed in play and as recorded by the strategy guide that shipped beside the game, reconciled in §25:

- 1 to 4 players, 3 balls each.
- No multiball.
- Re-entry lane lights and launch-lane lights **toggle off** if the ball passes them while lit.
- A matching wormhole awards a **replay** (ball save), not multiball.
- Missions abort when fuel is exhausted.

### 3.3 Explicitly out of scope (Full Tilt differences)

- Multiball.
- Lane lights that stay lit once collected.
- A mission-complete ball save that the retail table awarded and the Windows table did not.
- The other two retail tables.
- Three-track music selection. One original loop is enough.

---

## 4. Player-facing experience

### 4.1 First session

A new player who has never read this spec must be able to:

1. Press Space (or the on-screen plunger) and launch.
2. See which plunge power made a skill shot, because six lights along the plunger lane show how far the ball climbed.
3. Find the mission by reading one sentence in the side panel: "Hit the mission targets, then shoot the launch ramp."
4. Lose a ball down an outlane and understand why the flippers died if they nudged too hard ("TILT").
5. Finish Cadet rank without opening a help file. The three single-target missions are short and the panel names the required shot.

### 4.2 Session length

A lost ball should feel frequent in the first five minutes and rare once the player can cradle and dead-bounce. A careful player completes Cadet (first rank) inside two balls. Fleet Admiral is a long game, not a tutorial.

### 4.3 Presentation

Desktop: landscape page, portrait table on the left, information panel on the right, the same information architecture as the old 640×480 window. The table art keeps a tall aspect. Do not stretch it.

Narrow viewports: the table fills the width; the panel collapses to a top strip (score, ball, rank) and a bottom strip (one status line plus flipper and plunger controls).

---

## 5. Composition target

Match this reading of the reference photograph. Coordinates in this section are normalized: `x = -1` left inner rail, `x = +1` right inner rail, `y = 0` apron, `y = 1` top arch. They are **starting positions**. Adjust within ±0.03 until a straight screenshot satisfies the visual test in §24.2. Do not "improve" the layout into a symmetric modern table.

| Region         | What the photo shows                                 | Starting placement                                                 |
| -------------- | ---------------------------------------------------- | ------------------------------------------------------------------ |
| Cabinet        | Dark metal bezel, black outside                      | Bezel ~4% of width, outside color `#000`                         |
| Playfield      | Navy field, cyan lightning cracks                    | Full inner rect                                                    |
| Top arch       | Curved rail with a row of red lamps                  | `y = 0.93` to `1.0`                                            |
| Upper bumpers  | Three white circular caps, red/blue rings            | Triangle around `(±0.18, 0.78)` and `(0.0, 0.70)`             |
| Upper-left pod | Small yellow-lit housing, one more bumper            | Satellite bumper `(-0.72, 0.86)`; fuel spots just below it       |
| Left mass      | Large purple plastic ramp, pale chevron stripes      | Sweeps `(-0.05, 0.40)` → left wall → `(-0.35, 0.74)`         |
| Ramp bumpers   | Three white/blue circles stacked on that purple deck | `x ≈ -0.62`, `y ≈ 0.40, 0.50, 0.60`                          |
| Center         | Cyan dot ring, amber inner ring, yellow core         | Center `(0.02, 0.46)`, outer radius `0.16`                     |
| Mid inlays     | Red and blue triangular art flanking the ring        | Art only, not colliders                                            |
| Right tube     | Copper cylinder, yellow band, ball in the lane       | Plunger channel `x = 0.78` to `0.96`, `y = 0.06` to `0.88` |
| Lower guides   | Silver wires, yellow arrow lamps in the lanes        | Inlanes and outlanes, `y = 0.06` to `0.28`                     |
| Slingshots     | Red triangular kickers above the flippers            | `(±0.48, 0.20)`                                                 |
| Flippers       | White bats, red rubber tips                          | Pivots `(±0.26, 0.09)`                                          |
| Apron art      | Purple starburst between the flippers                | `y = 0.02` to `0.16`, art only                                 |
| Bottom corners | Small wordmark                                       | Original `CADET` only                                            |

The ball in the photograph sits in the right channel. At rest before a plunge, that is where the ball is.

---

## 6. Technology

| Choice      | Requirement                                                     |
| ----------- | --------------------------------------------------------------- |
| Language    | TypeScript, `strict`                                          |
| Bundler     | Vite                                                            |
| Renderer    | Three.js, current stable. Import from `three`.                |
| Post        | One restrained bloom pass. No SSAO, no motion blur.             |
| Physics lib | None                                                            |
| UI          | DOM over the canvas. Do not render paragraphs as Three.js text. |
| Audio       | Web Audio API, synthesized                                      |
| Persistence | `localStorage` key `cadet.scores.v1`                        |
| Network     | None                                                            |
| Input       | Keyboard plus pointer. Gamepad OPTIONAL.                        |

Target: 60 fps on a 2018 integrated GPU at the internal resolution in §8.4. Draw calls under 250. One ball.

Fixed timestep: physics at **240 Hz**. Render interpolated. Never step physics from raw frame delta.

---

## 7. Architecture

```
src/
  main.ts                 canvas, loop, resize
  render/scene.ts         renderer, lights, bloom
  render/tableMesh.ts     static meshes from layout
  render/ballView.ts      ball mesh + interpolation
  render/lamps.ts         emissive lamp instances bound to light state
  render/flipperView.ts
  sim/world.ts            integrate, broadphase, resolve
  sim/geom.ts             segment, circle, arc, endpoint
  sim/flipper.ts
  sim/ball.ts
  sim/spatial.ts          uniform grid
  table/layout.ts         every collider and lamp anchor
  table/devices.ts        bumper, sling, kicker, target, spinner, rollover, plunger
  rules/constants.ts      the only numeric rules
  rules/lights.ts         light groups, timers, rotation
  rules/score.ts
  rules/missions.ts       pure state machine, no Three.js imports
  rules/game.ts           players, balls, tilt, flow
  ui/hud.ts
  ui/touch.ts
  audio/sfx.ts
  input/keys.ts
```

Rules MUST NOT import Three.js. The renderer reads sim state; it does not decide collisions. Devices emit typed events (`bumperHit`, `rollover`, `rampExit`, `captured`, `drained`). `rules/game.ts` is the only subscriber that mutates score, lights, and missions.

---

## 8. World, camera, cabinet

### 8.1 Playfield coordinates

Use meters, origin at the **center of the flipper line**, `+y` up the table, `+x` toward the right outlane.

| Quantity                                  | Value                                             |
| ----------------------------------------- | ------------------------------------------------- |
| Inner playfield width                     | `0.514 m` (20.25 in)                            |
| Inner playfield length, apron to top arch | `1.067 m` (42 in)                               |
| Incline                                   | 6.5° (used only to derive downhill acceleration) |
| Ball diameter                             | `0.027 m` (1 1/16 in)                           |
| Ball mass                                 | `0.080 kg`                                      |

Normalized photo coordinates map as:

```
X = xNorm * (width / 2)
Y = (yNorm - 0.09) * length
```

because the photo's `y = 0.09` is the flipper pivot line, which is the sim origin. Apply this mapping in `table/layout.ts` only.

### 8.2 Gravity

Down-table acceleration:

```
a = 9.80665 * sin(6.5°) = 1.110 m/s²
```

along `-y`. There is no sideways gravity unless the gravity well is active (§13.6) or a nudge impulse is applied (§12.3).

### 8.3 Camera

MUST be a `PerspectiveCamera`, FOV **28°** vertical, locked.

- Position: behind the apron, slightly above the playfield, looking up-table.
- Pitch: about **18°** off straight-down, so the near edge reads wider and the right wall of the cabinet is visible, as in the photograph.
- Framing: the entire inner playfield plus bezel is visible with a few pixels of black margin. The flippers are near the bottom of the canvas.
- MUST NOT allow orbit, zoom, or screenshake beyond the nudge shake in §12.3.
- A `?debug=camera` query MAY enable an orbit helper. Default build MUST NOT.

### 8.4 Resolution

Render the table view at `devicePixelRatio` clamped to **2**. Internal aspect of the table viewport is **20.25 : 46** (playfield plus bezel and a little black). Bloom at half resolution.

---

## 9. Visual style

The table should look like a photograph of a plastic toy playfield, evenly lit, not like a nightclub.

### 9.1 Palette

| Surface         | Hex                                                | Notes                                             |
| --------------- | -------------------------------------------------- | ------------------------------------------------- |
| Outside         | `#000000`                                        |                                                   |
| Bezel           | `#2c3136`                                        | Beveled, darker inner lip `#14171a`             |
| Playfield       | `#071433`                                        |                                                   |
| Cracks          | `#47d4ff`                                        | Add with a multiply/add overlay, not a solid line |
| Ramp plastic    | `#6e3ea3`                                        | Stripe `#d9ccff`                                |
| Bumper dome     | `#f2f5f8`                                        |                                                   |
| Bumper skirt    | `#d5dbe3`                                        |                                                   |
| Cap, level 0–3 | `#3c7dff`, `#3ddc6a`, `#ffd23a`, `#ff3b3b` | Blue, green, yellow, red                          |
| Center dots     | `#3ad7ff`                                        | 18 lamps                                          |
| Center amber    | `#d2651a`                                        | Inner disc                                        |
| Rank core       | `#ffcf3a`                                        | 9 lamps                                           |
| Slingshot       | `#d02323`                                        |                                                   |
| Flipper         | `#f7f8fb`                                        | Tip rubber `#e23b3b`                            |
| Lane arrow      | `#f0d325`                                        |                                                   |
| Copper lane     | `#c4843e`                                        | Band `#e6c84a`                                  |
| Rail lamps      | `#ff2a2a`                                        | Along the arch                                    |
| Starburst       | `#5c2d86`                                        | Apron art                                         |

### 9.2 Materials

- Playfield: `MeshStandardMaterial`, roughness `0.72`, metalness `0.04`. Cracks are a second map in the emissive slot at low intensity (`#0a3a55`), so the field glows the way the photo does.
- Ramp: roughness `0.38`, a clearcoat-like second layer MAY be faked with a soft specular; do not make it glass.
- Bumpers: roughness `0.25` on the dome. The colored cap is emissive and is the only part that changes with upgrade level.
- Ball: `MeshStandardMaterial`, metalness `0.92`, roughness `0.18`. One env map generated from the scene once at load (or a static room probe painted in the same palette). The ball MUST read as chrome.
- Flippers: mostly dielectric. A small metal bushing at the pivot.
- Copper lane: metalness `0.85`, roughness `0.35`.

### 9.3 Lamps

Every scoring lamp in §14 is a small mesh (circle or capsule), `MeshBasicMaterial` or unlit, fed by the light state. Off state is the same hue at about 8% intensity, never invisible — the photo shows the unlit inserts. On state is full color. Blink is a square wave, 8 Hz for "hurry" and 2 Hz for "available."

Bloom: threshold high enough that the playfield cracks barely bloom and the bumper caps, center core, and arch lamps do. If the whole table glows, the threshold is wrong.

### 9.4 Ball shadow

A blob shadow under the ball, 40% opacity, no raytraced shadows. When the ball is on the ramp layer, raise the shadow with it.

### 9.5 What not to render

No sparkles, no speed lines, no floating "+500" that follows the ball for ordinary hits. Score changes are the rolling digits in the panel. Reserve a one-line status flash for awards only (§18.3).

---

## 10. Devices and layout

All colliders are in the meter frame of §8.1. Radii below are **additional to the ball radius** unless noted; the solver treats the ball as a point expanded by `ballRadius`, so store raw solid radii.

### 10.1 Static guides

- Inner wall: a closed loop of segments. Top end is a semicircle (the arch).
- Left and right outlane channels, each about `0.04 m` wide, from the slingshot mouth to the apron.
- Left and right return (inlane) channels, feeding the flipper tips.
- One-way gates at the top of each inlane, opening downward only. Elasticity low so the ball settles.
- A center post socket at `(0, 0.02)`. The post itself is a circle of radius `0.012`, present only while raised.
- Six small posts (radius `0.008`) protecting the slingshot corners and the mission-target alley. Place them so a slow ball can be trapped into a cradle and a fast ball is not swallowed by an invisible corner.

Wall elasticity `0.45`. Inlane rubber `0.35`. Outlane walls `0.2` so a ball that enters tends to stay in.

### 10.2 Flippers

Two flippers.

|            | Left                                                                                | Right            |
| ---------- | ----------------------------------------------------------------------------------- | ---------------- |
| Pivot      | `(-0.078, 0.0)`                                                                   | `(0.078, 0.0)` |
| Length     | `0.078 m`                                                                         | `0.078 m`      |
| Rest angle | `+32°` from +x toward up                                                         | `180° - 32°` |
| Flip angle | `+58°` sweep upward                                                              | mirrored         |
| Rise time  | `45 ms`                                                                           |                  |
| Fall time  | `90 ms`                                                                           |                  |
| Shape      | capsule of radius `0.008 m` along the blade, plus a tip circle radius `0.012 m` |                  |

Motion is a cosine ease, not a linear spin. The collision response is specified in §11.4 and is the most important code in the project.

A ball resting on a held flipper MUST stay there (cradle). A ball hitting the falling flipper MUST NOT be launched up the table.

### 10.3 Slingshots

Two triangular slingshots above the flippers.

- Each is two segments in a shallow V, plus a face sensor.
- On face contact: play the kick animation (the triangle flashes and recoils 6 mm for 40 ms) and replace the ball's outgoing velocity with a fixed impulse of **3.2 m/s** along the sling normal, plus the incoming parallel component times `0.2`.
- Score: `500` before the field multiplier.

### 10.4 Bumpers

Seven round pop bumpers. A bumper is a circle plus a skirt sensor slightly larger than the solid.

| Id                                  | Role                                  | Starting center (norm x, y)                            | Solid radius |
| ----------------------------------- | ------------------------------------- | ------------------------------------------------------ | ------------ |
| `attackA` `attackB` `attackC` | Top triangle                          | `(−0.18, 0.78)`, `(0.18, 0.78)`, `(0.00, 0.70)` | `0.020 m`  |
| `satellite`                       | Top-left lone bumper                  | `(−0.72, 0.86)`                                     | `0.020 m`  |
| `engineA` `engineB` `engineC` | Column on the purple ramp, ramp layer | `(−0.62, 0.40/0.50/0.60)`                           | `0.018 m`  |

On hit: instant velocity change, not a spring. Set speed to the bumper's kick speed along the contact normal (keep a little of the tangential speed, factor `0.15`). Kick speeds:

- Attack bumpers: `3.4 m/s`
- Satellite and engine bumpers: `3.8 m/s`

Base scores, by cap color. Level rises from 0 (blue) to 3 (red) and then stays at red.

| Level    | Attack | Satellite and engine |
| -------- | ------ | -------------------- |
| 0 blue   | 500    | 1500                 |
| 1 green  | 1000   | 2500                 |
| 2 yellow | 1500   | 3500                 |
| 3 red    | 2000   | 4500                 |

Upgrade rules are in §14.3. These scores take the field multiplier.

Attack bumpers and the satellite share one level. Engine bumpers have their own level. The satellite counts as an attack bumper for missions that say "hit attack bumpers," and it is the only bumper that counts for Satellite Retrieval.

### 10.5 Spot targets

A spot target is a small disc, radius `0.012 m`, that flashes and scores when the ball's swept circle overlaps it. It does not strongly redirect the ball (elasticity `0.4`, no extra kick) so the ball can hit a bank of three in one pass.

| Bank                    | Count      | Where                                                          | Score each | Effect when the bank completes               |
| ----------------------- | ---------- | -------------------------------------------------------------- | ---------- | -------------------------------------------- |
| Mission                 | 3 vertical | In the crook of the purple ramp, just above the left slingshot | 750        | Selects the mission (§16)                   |
| Fuel                    | 3          | Around the satellite bumper                                    | 750        | Relight all 6 fuel lamps                     |
| Left hazard (radiation) | 3          | Upper-left, beside the green wormhole approach                 | 750        | Reopen the left outlane kicker               |
| Right hazard (comet)    | 3          | Upper-right, right of the attack bumpers                       | 750        | Reopen the right outlane kicker              |
| Space warp              | 1          | Upper playfield, between wormholes                             | 1000       | Open wormholes or cycle their color (§13.5) |

Mission-bank indices, top to bottom: `0`, `1`, `2`. Hitting one marks it selected and clears the other two. Hitting all three before any one of them is hit again (or hitting the third while the other two are still lit) selects the rank's **all-targets** mission instead. The panel must say which mission is armed. Selection does nothing until the launch ramp is shot.

### 10.6 Drop targets

A drop target is a short segment that is solid until hit, then lowers for a timeout and stops colliding.

| Bank       | Count | Resets                                                                                   | Score                                                     | Completion                                                                                                                                           |
| ---------- | ----- | ---------------------------------------------------------------------------------------- | --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Multiplier | 3     | individual target pops back after `30 s`; bank completion resets the drops immediately | 1000                                                      | Advance field multiplier (§15.2)                                                                                                                    |
| Medal      | 3     | same 30 s                                                                                | 1000                                                      | If the medal lamp is lit, light the extra-ball lanes; else advance the medal lamp one step (three steps, then the next completion lights extra ball) |
| Booster    | 3     | same 30 s                                                                                | 500, and the third target of a completion scores `5000` | Advance booster mode (§15.4)                                                                                                                        |

There are exactly **9** drop targets. "Hit 9 drop targets" means 9 drop-target hits, not 9 banks, and the same target counts again after it resets.

Place the multiplier bank at the upper left in front of the green wormhole, the medal bank near the center-right approach, and the booster bank where the right flipper can reach it with a clean shot (right of the medallion, above the right slingshot). If a bank is not reachable from a flipper, move it. Unreachable rules are wrong even if the coordinates above were pretty.

### 10.7 Spinners (flags)

Two spinners. Each is a thin cross that spins visually in proportion to the passing ball's speed and scores once per revolution.

| Id            | Where                                | Score                                 |
| ------------- | ------------------------------------ | ------------------------------------- |
| `fuelFlag`  | In the fuel-chute path               | 500, or 2500 after flags are upgraded |
| `hyperFlag` | At the mouth of the hyperspace chute | same                                  |

Minimum speed to count a spin: `0.8 m/s`. Cap at 12 scored spins per passage so a stuck ball cannot farm. Cosmic Plague counts these spins.

### 10.8 Rollovers

A rollover is a segment the ball must cross in the legal direction. Score once per crossing.

| Group              | Count                                                                            | Score                                             | Rule                                                                                                                     |
| ------------------ | -------------------------------------------------------------------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Re-entry lanes     | 3 across the top, above the attack bumpers                                       | 2000                                              | Toggle that lane's lamp (§14.3)                                                                                         |
| Launch lanes       | 3 on the ramp, just above the engine bumpers                                     | 500                                               | Toggle that lane's lamp                                                                                                  |
| Return lanes       | 2, the inlanes                                                                   | 5000, or 25000 if that return lamp is lit         | Lamp is lit by the space-warp rollover                                                                                   |
| Outlanes           | 2                                                                                | 20000                                             | Counts for Doomsday; then kicker or drain (§13.4)                                                                       |
| Bonus lane         | 1, the habitrail return that feeds the upper lanes after a full launch-ramp shot | 10000 base                                        | Also refills all fuel                                                                                                    |
| Fuel               | 6 along the fuel chute                                                           | 500 each; the top lamp scores 2000 if it was dark | Relights that fuel lamp                                                                                                  |
| Space warp         | 1                                                                                | 2000                                              | Lights both return-lane lamps                                                                                            |
| Extra ball         | 2, just above the outlane kickers                                                | 0                                                 | If the extra-ball lamp is lit, award an extra ball and clear the lamp                                                    |
| Launch-ramp sensor | 1 red lamp partway up the ramp                                                   | 5000                                              | This crossing is what missions mean by "shoot the launch ramp." A ball that falls back before the sensor does not count. |
| Deployment         | 6 along the plunger lane                                                         | 0 by themselves                                   | Skill shot (§15.3)                                                                                                      |

### 10.9 The center medallion

The cyan ring (18 lamps) and the amber core (9 lamps) are **inserts**, not a hole. The ball rolls across the art on the main layer. Do not put a collider on the ring. The gravity well, when active, is a separate capture disc at the same center (§13.6).

---

## 11. Physics

### 11.1 Integration

Semi-implicit Euler at `dt = 1/240` s.

```
v += a * dt
v *= (1 - friction)          // friction = 0.35 * dt, so the coast is long
p += v * dt
```

Maximum speed `14 m/s`. If a step would move the ball more than `ballRadius * 0.5`, subdivide that step. This is the anti-tunnel guarantee; do not replace it with a speed cap alone.

### 11.2 Broadphase

Uniform grid, cell size `0.05 m`. Test the ball against solids in the current cell and its neighbors. The ball only collides with solids on its current **layer** (§13.1).

### 11.3 Circle versus segment

Swept test. If the closest point on the segment over the timestep is within `ballRadius + shapeRadius`:

1. Push the ball out along the normal so the shapes just touch.
2. Let `vn` be the velocity component along the normal (incoming negative).
3. If `vn < 0`, set `vn = -elasticity * vn`.
4. Tangential component is multiplied by `0.98` (almost no rub).

Solve each contact once per substep, largest penetration first, up to 8 contacts. Then integrate. Do not use a penalty spring.

### 11.4 Flipper contact

This is not the generic resolver.

While the flipper angle is changing with angular speed `ω`:

1. Compute the contact point on the blade.
2. Surface velocity `vs = ω × r` from the pivot.
3. Positional: if the ball penetrates, move it out along the normal **before** changing velocity, by the full penetration. A rising flipper must push the ball; it must not spawn the ball inside the blade.
4. Velocity: remove the normal component of `v - vs`, then add `elasticity *` the approaching normal component of `vs - v` back to the ball, and add the tangential part of `vs` in full.
5. Clamp to max speed.

Elasticity of a flipper during the rise is `0.35` (the launch comes from `vs`, not from bounce). At rest or while falling, elasticity is `0.2` and `ω` is only the fall speed, which is too small to launch.

Cradle test, and it is an acceptance test: hold a flipper up, drop the ball onto it from `0.15 m`, and wait 2 seconds. The ball is still on the blade. If it jitters off, the positional correction is fighting the next substep; damp the correction and do not add energy when `ω ≈ 0`.

### 11.5 Bumpers and slingshots

Do not model them as stiff circles. On sensor overlap, set the outgoing velocity directly as §10.3 and §10.4 say, then ignore that solid for `80 ms` so the ball can leave.

### 11.6 Layers and one-ways

Each solid has a layer mask and an optional one-way normal. A one-way ignores the ball if `dot(v, normal) > 0` and the ball is already on the open side. Use one-ways for inlane entries, the skill-shot gate, and ramp entrances.

---

## 12. Input

### 12.1 Keyboard (default)

Match the Windows defaults. Remapping MUST be possible and persisted under `cadet.keys.v1`.

| Action                                      | Default           |
| ------------------------------------------- | ----------------- |
| Left flipper                                | `Z`             |
| Right flipper                               | `/`             |
| Plunger                                     | `Space` (hold)  |
| Nudge left (ball is shoved toward the left) | `X`             |
| Nudge right                                 | `.`             |
| Nudge up (toward the top of the table)      | `ArrowUp`       |
| New game                                    | `F2`            |
| Pause                                       | `F3` or `Esc` |
| Controls                                    | `F8`            |

Also accept `Left Shift` as left flipper and `Right Shift` as right flipper, because that is how many people actually played. Both bindings are live.

Flipper keys are level-triggered: down starts the rise (or holds the end angle), up starts the fall. Retrigger is allowed the instant the key comes up; there is no lockout.

### 12.2 Plunger

Hold time charges a spring, shown as a pull-back of the plunger mesh (max travel 40 mm over 900 ms). Release applies an impulse up the deployment lane:

```
speed = 1.2 + 6.5 * charge    // m/s, charge in 0..1
```

`charge = 0` if released before 40 ms (a tap still launches weakly). Autofire if held past 900 ms is wrong; wait for release. At the start of a ball the plunger is armed and the panel says "Launch ball."

### 12.3 Nudge

A nudge is an instant `0.45 m/s` added to the ball velocity in the table plane, plus a visual shake of the **mesh** (not the colliders) of 3 mm for 70 ms.

Tilt is a single charge `T` in `0..1`:

- A nudge adds `0.34`.
- Holding a nudge key longer than `180 ms` adds `0.5` per second.
- `T` decays at `0.25` per second once no nudge key is down.
- `T` crosses `0.55`: status "Warning."
- `T` crosses `0.85`: the foul lamp lights.
- `T` reaches `1`: **TILT**.

On tilt: flippers go dead and fall, nudges are ignored, devices do not score, the replay save will not fire, the ball is allowed to drain. When it drains, no end-of-ball bonus is paid. Extra balls already earned are kept. Clear tilt at the next ball.

If the player tilts before launching, auto-launch a weak plunge and leave the flippers dead so the ball drains.

### 12.4 Pointer

- Mouse down on the left half of the table view: left flipper. Right half: right flipper. This is for desktop users without remembering keys.
- Touch, narrow layout: the same halves. A plunger control sits at the lower right: press-and-hold, release to launch, with a vertical fill showing charge.
- Three small nudge buttons along the bottom, labeled subtly. They must exist because a phone has no `X` key.
- Do not capture the pointer in a way that breaks scrolling the page outside the table.

### 12.5 Flippers also rotate lane lamps

On the **rising edge** of each flipper key (not while held):

- Left flipper rotates the re-entry lamp pattern one step and the launch-lane pattern one step, both in one direction.
- Right flipper rotates both patterns one step in the other direction.

Rotation moves which physical lanes are lit; it does not change how many are lit. This is how a player lines up three lits to upgrade bumpers. Specify the direction in code and keep it stable.

---

## 13. Ramps, captures, kickers

### 13.1 Layers

| Layer        | Contents                                                                |
| ------------ | ----------------------------------------------------------------------- |
| `main`     | Everything the ball starts on                                           |
| `ramp`     | Launch ramp surface, engine bumpers, launch-lane rollovers, ramp sensor |
| `hyper`    | Hyperspace chute                                                        |
| `plunger`  | Deployment lane                                                         |
| `captured` | Ball is not simulating; a device owns it                                |

Transitions happen only at gates and captures. Never free-fly between layers.

### 13.2 Launch ramp

Entrance gate on `main`, in the crook of the purple plastic, aimed so either flipper can make the shot. A ball crossing the gate upward faster than `1.4 m/s` moves to `ramp`.

On `ramp` the ball follows the visible purple surface. Gravity still pulls toward `-y`, so a weak entry rolls back out the entrance onto `main`. The red sensor sits far enough up that a rollback does not score it.

Past the sensor, the ramp crests and becomes a habitrail: script the ball along a polyline to the top arch and drop it onto `main` at the bonus-lane gate with speed `2.2 m/s` down the bonus lane. That drop always crosses the bonus lane.

Ramp polyline MUST be visible as the purple structure. Do not teleport.

Failing the entrance (too slow, or wrong angle) leaves the ball on `main`, bounced by the ramp's outer wall.

### 13.3 Hyperspace chute

A lane on the left, above the ramp entrance, feeding a kicker at the top of that lane. Shot from the left flipper, or by a nudge off the ramp return.

Capture duration `450 ms`, then eject onto `main` toward the upper flipper gap with speed `3.0 m/s`. Awards: §15.5. The "hyperspace reflex" lamp lights for `4 s` after an eject. Re-entering either the hyperspace kicker or the launch-ramp sensor while it is lit scores the reflex `25000` (field multiplier applies) and consumes the lamp.

### 13.4 Outlane kickers

Each outlane ends in a kicker that is **closed** at the start of the game.

- Closed: the ball falls through to the drain. The outlane rollover still scores and still counts as an outlane pass.
- Open: capture `300 ms`, then kick. Left kicker feeds the bottom of the fuel chute at `2.4 m/s`. Right kicker feeds the right re-entry lane approach at `2.6 m/s`.

A kicker closes when it fires. It reopens when its hazard bank is completed (§10.5). Both MAY be open at once.

### 13.5 Wormholes

Three holes: yellow (left, flipper-reachable), red (right, flipper-reachable), green (upper, not a direct flipper shot; reached from bumper chaos or a kickout).

Each hole is a capture disc, radius `0.018 m`.

- If wormholes are **closed**: eject back out after `200 ms` at `2.0 m/s` along the entry normal, score `2000`.
- If **open**: the ball disappears for `600 ms` and exits from the hole whose color is currently marked, at `2.2 m/s`. Exiting a different hole scores `7500`. Exiting the same hole scores `5000` and lights the replay (ball save).

The space-warp target opens the system if it is closed, and cycles the exit color `yellow → red → green → yellow` if it is already open. Either spinner passage also cycles the color while open. Lamps: a lamp over each hole, and an arrow lamp showing the current exit.

### 13.6 Black hole and gravity well

**Black hole:** a kicker hidden in the launch-ramp structure, reachable by a left-flipper shot that misses the ramp entrance and sneaks into the side mouth. Capture `400 ms`, score `20000`, eject up and to the right at `4.5 m/s`. This shot is allowed to be dangerous. It often feeds the right outlane. That is correct.

**Gravity well:** inactive and non-colliding until hyperspace step 5. Then, for `25 s` or until the ball is captured:

- Add an acceleration of `2.4 m/s²` toward the medallion center, on `main` only.
- If the ball enters a disc of radius `0.03 m` at the center slower than `1.2 m/s`, capture it, score `50000`, status "Gravity normalized", wait `500 ms`, and eject at `2.5 m/s` along a random angle in the upper 180°. Then the well deactivates.

Do not leave the well on for the rest of the ball. It is a reward and a hazard, then it is gone.

### 13.7 Drain

A sensor below the flippers across the full width. On enter: if replay is armed and the game is not tilted, consume replay, return the ball to the plunger, keep all mission and light state, do not pay bonus, do not increment the ball number. Otherwise end the ball (§17).

### 13.8 Deployment lane and skill-shot gate

The plunger lane is layer `plunger`, separated from `main` by a wall with two exits:

1. A side gate about 40% of the way up, one-way onto the right inlane. The ball falls through it if its upward speed dies before the crest.
2. A crest at the top into the rightmost re-entry lane, taken only if the ball still has `speed > 1 m/s` at the crest.

Six deployment lamps divide the lane. The skill-shot value is determined by the highest lamp the ball reached before falling out the side gate. Going over the crest scores **no** skill shot; it is the long launch instead, and it may toggle re-entry lamps.

| Highest lamp | Skill shot |
| ------------ | ---------- |
| 1            | 15000      |
| 2            | 30000      |
| 3            | 75000      |
| 4            | 30000      |
| 5            | 15000      |
| 6            | 7500       |

Skill shot is not paid on a replay relaunch. Field multiplier applies.

---

## 14. Lights

Represent every lamp as `{ id, on, blink }`. Groups with their own rules:

### 14.1 Progress and rank

- 18 progress lamps, the cyan ring, indexed clockwise from the top.
- 9 rank lamps, the amber ring.
- A new game lights rank lamp 0 only. The player is Cadet.
- Completing a mission lights the next `N` dark progress lamps, clockwise.
- When a completion would light past 18, light the remainder, perform a promotion, turn all progress lamps off, then light any leftover count on the fresh ring.
- Promotion turns on the next rank lamp and shows the new rank name. At Fleet Admiral (all 9 rank lamps), further promotions do not add a rank; leftover progress still resets the ring and the panel says "Fleet Admiral".
- Time Warp Forward promotes **one extra rank** immediately (same rank-lamp rules) in addition to its progress lights. Time Warp Backward turns **one rank lamp off** (minimum Cadet) and awards **zero** progress lights. Both still pay their points.

### 14.2 Fuel

Six lamps in chute order, bottom to top. A mission starts with all six lit. While a mission is active, the lowest lit lamp begins blinking and goes out after:

| Lamp index from the bottom | Time to extinguish |
| -------------------------- | ------------------ |
| 0                          | 10 s               |
| 1                          | 12 s               |
| 2                          | 14 s               |
| 3                          | 16 s               |
| 4                          | 18 s               |
| 5                          | 20 s               |

Only one lamp runs this timer at a time: always the lowest lamp that is still lit. Total from full to empty is `90 s`. Rolling the matching rollover relights that lamp and restarts the timer. These events refill all six: launch-ramp sensor, bonus lane, completing the fuel spot bank.

When the last lamp goes out during a mission: status "Mission aborted", clear the active mission, leave the armed selection empty, and require a refill of at least one fuel lamp before a new mission can be accepted. Selecting targets while empty is allowed but acceptance fails with "Re-fuel ship".

Fuel does not drain while no mission is active.

### 14.3 Lane patterns

Re-entry and launch lanes are three booleans each. Passing the lane toggles that boolean (Windows rule). Flipper edges rotate the pattern (§12.5). The frame the pattern becomes `[true, true, true]`:

- Re-entry pattern upgrades attack+satellite one level and clears to `[false, false, false]`. Status "Weapons upgraded".
- Launch pattern upgrades engine bumpers one level and clears. Status "Engines upgraded".

Each bumper group stores `level` (0–3) and `expireAt`. On upgrade, `expireAt = now + 60 s`. When it expires, `level = max(0, level - 1)` and if `level > 0` set a new 60 s expiry. Upgrading refreshes the timer and increments once.

### 14.4 Other timed lamps

| Lamp              | Duration                                                   | Notes                       |
| ----------------- | ---------------------------------------------------------- | --------------------------- |
| Return lanes      | until used or ball ends                                    | Lit by space-warp rollover  |
| Hyperspace ladder | each lit step starts a 60 s decay of the highest step      | See §15.5                  |
| Center post       | 60 s                                                       | Raised by hyperspace step 3 |
| Reflex            | 4 s                                                        | §13.3                      |
| Extra ball lanes  | until collected or ball ends                               |                             |
| Replay            | until the next drain                                       |                             |
| Deploy-save       | 10 s after the ball first enters `main` from the plunger | §17.2                      |
| Field multiplier  | 60 s then reset to 1×                                     | §15.2                      |
| Medal lamp steps  | 30 s                                                       | §10.6                      |
| Foul              | until next ball                                            |                             |

---

## 15. Scoring

### 15.1 Application order

On every scoring event:

```
paid = base
if event.multiplied: paid *= fieldMultiplier
score += paid
```

`fieldMultiplier` is `1`, `2`, `3`, `5`, or `10`.

Multiplied: bumper, sling, target, spinner, rollover, ramp sensor, wormhole, black hole, skill shot, reflex, gravity-well capture.

Not multiplied: mission accept, mission complete, jackpot, hyperspace step awards, end-of-ball bonus.

Show the score as a grouped integer. Internal score is a JavaScript `number` used only as an integer; values stay under `1e15`. Display at least 10 digits of capacity. Crossing `1_000_000_000` shows "Around the clock" once.

### 15.2 Field multiplier

Completing the multiplier drop bank advances `1× → 2× → 3× → 5× → 10×` and refreshes a 60 s timer. When the timer fires, multiplier returns to `1×` immediately (it does not step down). The panel shows `2x`, `3x`, `5x`, `10x` while active.

### 15.3 Skill shot

§13.8. Pay once, when the ball leaves the plunger lane through the side gate.

### 15.4 Booster modes

Completing the booster bank advances a persistent mode. Modes stack; later completions do not remove earlier ones. Mode survives balls and is per player. It resets on a new game.

| Completion  | Effect                                                                                                                |
| ----------- | --------------------------------------------------------------------------------------------------------------------- |
| 1           | Flag spins pay 2500 instead of 500                                                                                    |
| 2           | Jackpot becomes eligible and its value increases                                                                      |
| 3           | End-of-ball bonus uses the boosted bonus value                                                                        |
| 4 and after | Bonus hold: the boosted bonus is kept even after a drain. Further completions add one more step to the jackpot value. |

Jackpot value:

```
jackpot = min(5_000_000, 20_000 * 5^(completionsAfterFirst))
```

At the moment mode 2 is first reached, `completionsAfterFirst` is 1, so the jackpot is `100_000`. Each later booster completion multiplies by 5, capped at `5_000_000`.

Bonus value used at end of ball:

```
bonus = mode >= 3 ? min(5_000_000, 10_000 * 5^(mode - 2)) : 10_000
```

With bonus hold (mode ≥ 4), a drain does not reset `mode`. Without it, a drain resets the bonus **value** back to mode 0's effects? No. Read this carefully:

- Modes 1 and 2 persist across balls always.
- The inflated end-of-ball bonus persists across balls only when mode ≥ 4.
- When mode is 3, paying the end-of-ball bonus resets the bonus value to `10_000` for the next ball but does **not** cancel flag upgrade or jackpot eligibility.

### 15.5 Hyperspace ladder

Five steps. Entering the kicker lights the next step and pays that step. If the highest lit step has waited `60 s`, it goes dark (one step), so the ladder can decay.

| Step entered | Award                                                                                                                                                     |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1            | 10,000. Status "Hyperspace bonus"                                                                                                                         |
| 2            | 20,000 plus the jackpot if mode ≥ 2, otherwise just 20,000. Status "Jackpot" only when the jackpot pays. Paying the jackpot does not reset booster mode. |
| 3            | 20,000 and raise the center post for 60 s                                                                                                                 |
| 4            | 50,000 and light both extra-ball lanes                                                                                                                    |
| 5            | 150,000 and activate the gravity well. Then clear the ladder to zero.                                                                                     |

### 15.6 End of ball

If the ball ended without a tilt:

```
endBonus = bonusValue + crashBonus
```

`crashBonus` equals `bonusValue` (same base, same boost). So a default drain pays `20_000` and a fully boosted drain pays up to `10_000_000`. Count the bonus up on the panel over at most `2.5 s` (the player may skip by pressing a flipper). Field multiplier does **not** apply.

Then pass the turn (§17).

---

## 16. Missions

### 16.1 Lifecycle

```
idle
  --mission targets armed, fuel ≥ 1, launch-ramp sensor--> accepted
accepted
  --objectives complete--> completed → idle (progress paid)
  --fuel hits 0--> aborted → idle
  --ball drains (not a replay)--> still accepted on the next ball
  --tilt drain--> still accepted on the next ball
```

A mission survives a drain. It does not survive fuel exhaustion. It is per player.

Accept award is paid on the ramp sensor that accepts, once.

Switching the armed target **before** acceptance changes which mission will start. Switching targets **during** a mission does not change the active mission.

### 16.2 Ranks and mission menus

The three mission targets are top, middle, bottom. The fourth mission is armed by lighting all three targets.

| Rank lamps lit | Rank                   | Top                 | Middle            | Bottom            | All three     |
| -------------- | ---------------------- | ------------------- | ----------------- | ----------------- | ------------- |
| 1              | Cadet                  | Launch Training     | Re-entry Training | Target Practice   | Science       |
| 2–3           | Ensign, Lieutenant     | Bug Hunt            | Rescue            | Alien Menace      | Secret        |
| 4–5           | Captain, Lt. Commander | Stray Comet         | Space Radiation   | Black Hole Threat | Cosmic Plague |
| 6–7           | Commander, Commodore   | Satellite Retrieval | Recon             | Doomsday Machine  | Time Warp     |
| 8–9           | Admiral, Fleet Admiral | Cosmic Plague       | Secret            | Time Warp         | Maelstrom     |

Same menu for both ranks in a pair. Promotion happens when progress fills, which may be mid-mission; the active mission keeps its original objectives and payout.

### 16.3 Objectives, accept pay, complete pay, progress

Hits count only while that mission is accepted. "Lanes" means any of: re-entry, return, outlane, bonus. It does not mean the fuel chute or the plunger lane.

| Mission             | Accept | Complete  | Lights  | Objectives, in any order unless numbered                                                                                                                                                                                                                                                                       |
| ------------------- | ------ | --------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Launch Training     | 10,000 | 500,000   | 6       | Cross the launch-ramp sensor 3 times                                                                                                                                                                                                                                                                           |
| Re-entry Training   | 10,000 | 500,000   | 6       | Cross any re-entry lanes 3 times                                                                                                                                                                                                                                                                               |
| Target Practice     | 10,000 | 500,000   | 6       | Hit attack bumpers (including satellite) 8 times                                                                                                                                                                                                                                                               |
| Science             | 10,000 | 750,000   | 9       | Hit drop targets 9 times                                                                                                                                                                                                                                                                                       |
| Bug Hunt            | 20,000 | 750,000   | 7       | Hit any spot or drop targets 15 times                                                                                                                                                                                                                                                                          |
| Rescue              | 20,000 | 750,000   | 7       | (1) Reach booster mode ≥ 1, flags upgraded. (2) Then enter hyperspace                                                                                                                                                                                                                                         |
| Alien Menace        | 20,000 | 750,000   | 7       | (1) Upgrade attack bumpers at least once after accept. (2) Then hit attack bumpers 8 times. The 8 hits still count if the upgrade later decays                                                                                                                                                                 |
| Secret              | 30,000 | 1,500,000 | 10      | Enter yellow wormhole, then red, then green, in that order. A wrong hole does not reset progress. Closed holes do not count                                                                                                                                                                                    |
| Stray Comet         | 20,000 | 1,000,000 | 8       | (1) Complete the right hazard bank. (2) Then enter hyperspace                                                                                                                                                                                                                                                  |
| Space Radiation     | 20,000 | 1,000,000 | 8       | (1) Complete the left hazard bank. (2) Then enter any open wormhole                                                                                                                                                                                                                                            |
| Black Hole Threat   | 20,000 | 1,000,000 | 8       | (1) Upgrade engine bumpers at least once after accept. (2) Then enter the black hole. If the engine level decays before the black hole, step 1 must be done again                                                                                                                                              |
| Cosmic Plague       | 30,000 | 1,750,000 | 11      | (1) Score 75 flag spins. (2) Then cross the space-warp rollover                                                                                                                                                                                                                                                |
| Satellite Retrieval | 20,000 | 1,250,000 | 9       | Hit the satellite bumper 3 times                                                                                                                                                                                                                                                                               |
| Recon               | 20,000 | 1,250,000 | 9       | Cross lanes 15 times                                                                                                                                                                                                                                                                                           |
| Doomsday Machine    | 20,000 | 1,250,000 | 9       | Cross either outlane 3 times                                                                                                                                                                                                                                                                                   |
| Time Warp           | 30,000 | 2,000,000 | 12 or 0 | (1) Hit slingshots or any other rebound 25 times. The four rebounds are the two slingshots and the two upper rebound posts beside the lowest attack bumper; those posts score 500 and count. (2) Then either the launch-ramp sensor (Forward: +1 rank, 12 lights) or hyperspace (Backward: −1 rank, 0 lights) |
| Maelstrom           | 30,000 | 5,000,000 | 18      | Strict order: (1) 3 drop-target hits (2) 3 spot-target hits (3) 5 lane crosses (4) cross the top fuel rollover (5) launch-ramp sensor (6) one flag spin (7) any open wormhole (8) hyperspace. Also light extra-ball lanes and raise the center post when step 8 completes                                      |

On-screen completion names, paraphrased, one line each:

- "Launch training passed"
- "Re-entry passed"
- "Target practice passed"
- "Science complete"
- "Bug hunt complete"
- "Rescue complete"
- "Alien menace cleared"
- "Secret complete"
- "Comet destroyed"
- "Radiation cleared"
- "Black hole stabilized"
- "Plague purged"
- "Satellite retrieved"
- "Recon complete"
- "Doomsday machine destroyed"
- "Time warp forward" / "Time warp backward"
- "Maelstrom"

### 16.4 Mission panel copy while active

One line of what is left, not a paragraph. Examples:

- "Launch ramp: 2 left"
- "Attack bumpers: 5 left"
- "Wormholes: red, then green"
- "Maelstrom: fuel chute"

If nothing is armed: "Hit mission targets to choose."

---

## 17. Balls, players, turn flow

### 17.1 Game

- Players: 1 to 4, chosen before the first plunge. Default 1. A player is a full copy of score, rank, progress, mission, fuel, bumper levels, booster mode, multiplier, lamps, and balls remaining.
- Balls: 3 each.
- Order: player 1's ball 1, player 2's ball 1, … then ball 2. Restore that player's lamp state when their turn starts. The physical ball is always the one ball.
- High scores: top 5, each `{ name: string[0..12], score }`. Default rows are empty, not fake famous names. On qualifying, ask for a name. Store locally.

### 17.2 Deploy save

When a ball first leaves the plunger lane onto `main`, light the "ball in play" lamp by the right flipper for `10 s`. A drain during that window, if not tilted, returns the ball to the plunger and does not consume a ball, a replay, or an extra ball. It does not reset mission progress. It does not pay bonus. This exists so a weak plunge is not an instant loss. It must not refresh on bumper hits, or it becomes infinite.

### 17.3 Replay and extra ball

- **Replay** (matching wormhole): the next drain is cancelled. The same ball continues, mission kept, no bonus paid. Lost if tilted.
- **Extra ball**: increments a counter. When a ball truly ends, if the counter is `> 0`, decrement it and serve another ball to the same player without advancing the ball index. The HUD shows the ball number plus an extra-ball marker.
- If both could apply, replay happens at the moment of the drain. Extra ball is only considered when a ball actually ends.

### 17.4 Serving a ball

Place the ball on the plunger. Reset deploy-save. Do not reset missions, rank, fuel (fuel timers pause while the ball is held), bumper levels, or booster mode. Do clear tilt and the foul lamp. Skill-shot lamps arm unless this serve is a replay continuation.

### 17.5 Game over

After the last ball of the last player: count bonus, then if the score qualifies, take the name, then return to the attract state.

---

## 18. HUD

### 18.1 Desktop

Right panel, about 280 px, on a near-black field `#070b14` with a faint star speckle (original art, low contrast).

From top:

1. Player and ball: `PLAYER 2` / `BALL 3`. If an extra ball is queued, a small dot.
2. Score, tabular, large.
3. High score, smaller, labeled `HIGH`.
4. Rank name.
5. Status box, three lines, the mission text.
6. A fuel readout of 6 pips, mirroring the table so the player need not hunt.
7. Multiplier, if not 1×.
8. Buttons: New game, Players, Sound, Music, Controls.

Menu equivalents: `F2`, `F3`, `F8`. Sound defaults on. Music defaults off.

### 18.2 Narrow

Top overlay: score and `B3`. Bottom overlay: the status line, fuel pips, flipper zones, plunger.

### 18.3 Status lines

Short, mechanical, no exclamation spam except the awards that deserve it.

| Event                | Line                                    |
| -------------------- | --------------------------------------- |
| Nothing armed        | Hit mission targets to choose.          |
| Armed                | Armed: Launch training. Shoot the ramp. |
| Accepted             | Mission accepted.                       |
| Fuel empty           | Re-fuel ship.                           |
| Aborted              | Mission aborted.                        |
| Upgrade              | Weapons upgraded. / Engines upgraded.   |
| Skill shot           | Skill shot.                             |
| Jackpot              | Jackpot.                                |
| Replay               | Replay ball.                            |
| Extra ball lit       | Extra ball lit.                         |
| Extra ball collected | Extra ball.                             |
| Tilt warning         | Warning.                                |
| Tilt                 | Tilt.                                   |
| Rank up              | Promoted: Lieutenant.                   |
| Around the clock     | Around the clock.                       |

Use the completion lines from §16.3.

### 18.4 Attract

After 20 s with no game in progress, dim the table slightly and cycle: title `Cadet`, the high scores, and the line "Press Space". A scripted demo ball is OPTIONAL and not required for acceptance.

---

## 19. Audio

All synthesis. Master gain `0.4`. A mute that does not destroy the audio context.

| Event            | Recipe                                                                                      |
| ---------------- | ------------------------------------------------------------------------------------------- |
| Flipper up       | 8 ms noise burst, bandpass 1800 Hz, plus a 120 Hz sine, 30 ms                               |
| Flipper down     | same, quieter, lower                                                                        |
| Bumper           | 40 ms square blip, pitch by level: 180, 220, 270, 330 Hz, fast decay. Stereo pan by table x |
| Sling            | noise burst 50 ms, bandpass 800 Hz                                                          |
| Target           | short wood tick, 2 kHz sine 20 ms                                                           |
| Spinner          | a click per scored revolution, 1 kHz                                                        |
| Ramp             | rising filtered noise 300 ms                                                                |
| Wormhole         | sine sweep 400 → 90 Hz over 400 ms                                                         |
| Mission accept   | two notes, a fifth, 120 ms each                                                             |
| Mission complete | four-note major arpeggio, total under 700 ms                                                |
| Rank up          | the complete cue a fifth higher                                                             |
| Tilt             | sawtooth 70 Hz, 250 ms, harsh                                                               |
| Drain            | falling sine 300 → 80 Hz, 400 ms                                                           |
| Plunger          | spring: noise with rising resonant filter during the hold, tick on release                  |
| Jackpot          | the complete cue plus a lower octave                                                        |

Music, off by default: an original loop, 100 BPM, A minor, simple square-wave arpeggio and a soft pad, no lead melody that could be mistaken for a commercial theme. Crossfade 200 ms when toggled. It must not duck the slingshots into silence; sidechain gently or keep music quiet (`−16 dB` against effects).

---

## 20. Game states

```
boot → attract → playerSelect → ballHeld → simulating → ballEnd → (ballHeld | attract)
                     ↑                          |
                     └──────── tiltDrain ───────┘
pause overlays any state except boot; physics does not step.
```

`playerSelect` is skipped when the player count is already chosen and the user pressed New Game; default straight into `ballHeld` for one player so the classic "press space, immediately play" path stays one keystroke from attract.

---

## 21. Build phases

Do them in order. Each phase ends with the checks listed.

**Phase 1 — Table you can lose.**
Cabinet, playfield material, camera, ball, walls, flippers, plunger lane, drain, HUD score that stays 0. Checks: cradle test, full plunge reaches the top, weak plunge returns down the side gate, ball drains and a second ball is served, 240 Hz step does not depend on frame rate.

**Phase 2 — Lower table.**
Slingshots, inlanes, outlanes, center post (forced up via a debug key), nudges, tilt. Checks: nudge moves the ball, third nudge tilts and flippers die, outlane drains.

**Phase 3 — Shots.**
Launch ramp, hyperspace chute, bumpers, rollover lanes, skill shot. Checks: skill-shot table for charges that reach lamps 1, 3, and 6; ramp sensor does not fire on a rollback; bumper kick speed matches §10.4.

**Phase 4 — Devices.**
All targets, wormholes, kickers, flags, black hole, fuel chute. Checks: every device reachable on purpose from a flipper or named feed; nothing is only reachable by a random bounce except the green wormhole and the space-warp rollover.

**Phase 5 — Rules.**
Lights, multiplier, boosters, hyperspace ladder, gravity well, fuel timers, full mission machine, rank, replay, extra ball, two players. Checks: the mission table in §24.3, fuel abort at 90 s, two-player state isolation.

**Phase 6 — Finish.**
Audio, attract, high scores, remap UI, touch controls, bloom tuned, pause, reduced-motion (if `prefers-reduced-motion`, disable shake and shorten bonus count-up). Screenshot against the reference.

Do not start Phase 6 polish before Phase 5 tests pass.

---

## 22. Constants

`src/rules/constants.ts` exports a single frozen object `RULES` containing every number in §10–§17. Components read `RULES`. Tests import `RULES`. Tuning means editing that file, not hunting literals.

In particular, these disagreed in public writeups and are settled here:

| Constant                   | Value                   | Note                                            |
| -------------------------- | ----------------------- | ----------------------------------------------- |
| `satelliteHits`          | 3                       | Printed guide says 5. See §25.                 |
| `launchTrainingComplete` | 500000                  | Not 50,000.                                     |
| `timeWarpComplete`       | 2000000                 |                                                 |
| `maelstromComplete`      | 5000000                 |                                                 |
| `bugHuntHits`            | 15                      | One older FAQ says 7.                           |
| `fuelSeconds`            | `[10,12,14,16,18,20]` | Sum 90.                                         |
| `hyperspaceAwards`       | §15.5                  | Printed guide's wording differs; follow §15.5. |

---

## 23. File and code rules

- No `any`. Events are a discriminated union.
- `rules/missions.ts` is a pure function `(state, event) => state`. It is the unit-test surface.
- The renderer may be replaced without touching rules.
- No global mutable score. The `Game` object owns it.
- Do not allocate inside the 240 Hz loop. Reuse contact objects.
- Seeded RNG (`mulberry32`) for the gravity-well eject angle and any other randomness, seed stored on the game, so a test can replay.

---

## 24. Acceptance tests

### 24.1 Automated

Unit-test `missions.ts` and `score.ts` without a DOM:

1. Arming the top target and sending `rampSensor` from Cadet yields Launch Training, `+10000`, and objective counter 3.
2. Three `rampSensor` events then yield `+500000` and 6 progress.
3. A 9th drop hit during Science pays 750000 and 9 progress.
4. Progress 16 plus a 6-light mission promotes, leaves 4 progress lit, and advances the rank.
5. Time Warp backward from Commander (6th rank lamp) leaves 5 rank lamps and adds 0 progress, and still adds 2,000,000.
6. Fuel timer of 90 s with no rollovers aborts.
7. Secret ignores a red hole before a yellow hole.
8. Maelstrom ignores a step performed out of order.
9. Field multiplier 10× multiplies a bumper and does not multiply a mission complete.
10. Skill shot lamp 3 pays 75,000; crest exit pays 0.
11. Tilted drain pays 0 bonus and does not consume a replay (replay is forfeited, not spent to save).
12. Player 2's mission is unchanged after player 1 completes one.

A headless sim test drives flippers with scripted key times and asserts the cradle test (§11.4) and that a full plunger charge's ball reaches `y` above the attack bumpers.

### 24.2 Visual

Side-by-side with the reference photograph, a still of the idle table must satisfy all of:

- Tall navy field, cyan cracks, not a generic green pinball.
- Purple ramp mass on the left with three bumpers on it.
- Three bumpers in the upper field, copper lane on the right.
- Cyan ring and amber core at mid-table.
- White flippers with red tips, red slingshots, yellow lane arrows.
- No readable third-party logos.

### 24.3 Playtest script (ten minutes)

1. Skill-shot a 3-lamp plunge. Score includes 75,000.
2. Hit the bottom mission target, shoot the ramp, hit attack bumpers eight times. Rank progress moves. Panel says target practice passed. Score includes 500,000.
3. Open a wormhole, enter and exit the same hole. Drain. The ball comes back.
4. Force a tilt. Flippers die.
5. Start a 2-player game. Confirm player 2 starts at Cadet with score 0 while player 1's score is kept.

---

## 25. Source conflicts

Public descriptions of this table disagree. This spec already picked a side. Do not "correct" these from a random FAQ.

| Topic                    | This spec                                       | The other claim                                                                                                                                                                                                              |
| ------------------------ | ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Satellite Retrieval hits | 3                                               | The printed Plus! strategy sheet says five. OCR of that sheet is unreliable, and table walkthroughs that point at the lone upper-left bumper say three.                                                                      |
| Launch Training payout   | 500,000 and 6 lights                            | A secondary summary has dropped a zero to 50,000. The message list and the printed sheet say 500,000.                                                                                                                        |
| Bug Hunt count           | 15 targets                                      | One FAQ says seven marked targets.                                                                                                                                                                                           |
| Time Warp payout         | 2,000,000; 12 lights forward; 0 lights backward | A wiki paragraph says 1,500,000.                                                                                                                                                                                             |
| Hyperspace money         | §15.5                                          | The printed sheet lists "0 lights → 5,000, 1 → bonus, 2 → center post + 20,000, 3 → extra ball + 50,000, 4 → gravity well + 150,000" without a separate jackpot line. Jackpot-on-step-2 is too widely observed to drop. |
| Lane lights              | Toggle off when passed while lit                | Retail Full Tilt leaves them lit. Windows behavior is the toggle.                                                                                                                                                            |
| Multiball                | Absent                                          | Retail Full Tilt has it.                                                                                                                                                                                                     |
| Attack bumper count      | 3 plus a satellite that shares their level      | Some guides say "four attack bumpers" and mean 3+satellite. Both descriptions are the same hardware.                                                                                                                         |

Where this spec is silent, prefer the Windows XP behavior over Full Tilt, and prefer a simpler rule over a clever one. Write the choice down in `constants.ts` rather than improvising in a component.

---

## 26. Tuning

Change feel only by editing `RULES` and re-running §24.1. The intended feel, once numbers are honest:

- A full flip from a cradle reaches the top arch.
- A dead flip (tap and release early) dies around the medallion.
- Outlanes are the main way to lose, not a center drain between two perfect flippers. The gap between the flipper tips, with the post down, is about one ball wide.
- With the center post up, a ball falling straight down is saved.
- Nudging once is a tool. Nudging three times is a tilt.
- The launch ramp is makeable from either flipper. If only one flipper can hit it, move the entrance, do not raise the ball speed.

Physics constants that may be tuned without editing the rules text: flipper rise time ±10 ms, bumper kick ±15%, gravity ±10%. Scoring constants may not be tuned to make the game "more fun." They are the game.

---

## 27. Definition of done

- Phases 1–6 complete.
- §24.1 automated tests pass.
- §24.2 visual check passes against the reference photograph.
- §24.3 playtest script passes.
- `git grep` of the repo finds no original asset filenames (`PINBALL.DAT`, `table.bmp`, `pinball.exe`) and no publisher trademarks used as the product name.
- A clean machine can run `npm install` and `npm run dev` and play.
