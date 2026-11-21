# Acceptance and reproduction

The tested public fixture is the unmodified OpenArena BSP `maps/oa_rpg3dm2.bsp`. The source allowlist gives its SHA-256 and the companion AAS digest. The [map inventory](oa_rpg3dm2.json) records the actual entity properties, submodel bounds, surface materials and texture origins. The runtime pause menu produces a fresh inventory for each import.

## Automated acceptance

| ID | Observation |
| --- | --- |
| A1 | Clean headed Chrome loaded the shipping Wasm and both public PK3s. The match recording follows the first sighting through a fight. |
| A2 | Browser input reached the west jump pad. The pause check held forward and fire, released both, and checked position and shot count after resume. The independent movement replay covers stair climbing, braking, jumping and wall contact. |
| A3 | Normal keyboard and mouse input collected the rocket launcher and scored player frags. The timestamped match log records shots, impacts, damage, deaths and respawns. |
| A4 | The bot collected pickups, navigated out of sight, reacquired the player and scored. The seeded native test and browser matches run to the frag limit. |
| A5 | Native tests cover a blocked hitscan, a miss that consumes ammo, empty ammo, armor absorption, pickup return, projectile flight, wall shielding, splash and suicide scoring. |
| A6 | Both sides won browser matches. Intermission froze native scoring. The browser regression checks zero scores, an empty feed and a neutral reticle after restarting. |
| A7 | Open pending licensed retail archives. |
| A8 | The shipping picker passed both mount orders, cancellation, missing dependency, corrupt archive, invalid BSP and unsupported version. Failed replacements preserved the public session. |
| A9 | See the release measurements and reproducibility observations below. |

The [normal-input route](browser-route.json), [headless Rust test output](native.txt), [headed Chrome smoke test](browser-smoke.json), [local import checks](import.json), and [timestamped match evidence](release-matches.json) preserve the observations. Match traces sample normal input and positions once per second. The event log records transitions at simulation ticks. The [in-match capture](release-fight.png) and [final score](release-intermission.png) accompany that sequence.

## Reference

The movement oracle calls unmodified id Software Pmove, with analytic test brushes, fixed 8 ms commands, gravity 800, speed 320 and nearest-integer velocity snapping. Each of four independent runs starts at (0, 0, 24.125) facing +X. Run `scripts/reference.sh PATH_TO_PINNED_ID_CHECKOUT` to regenerate [the CSV](reference-movement.csv). The script runs twice and compares the files byte for byte. The native test compares each recorded coordinate at matching command times with a 0.5-unit allowance (four 0.125-unit trace epsilons). It covers acceleration and release, a standing jump and landing, a 16-unit step, and diagonal movement into an axial wall.

The native arena reference used ioquake3 revision 52088b9eae247d8e321c8dc1fb49a879652854f9. Build with CMake, BUILD_STANDALONE=ON and the read-only telemetry patch in tests/reference. Mount the upstream pak0, pak1-maps, pak4-textures and pak6-misc directories as .pk3dir under baseq3 in the build's Release directory. Start the built dedicated executable with:

```sh
ioq3ded +set com_basegame baseq3 +set fs_basepath "$REF_RELEASE" +set fs_homepath "$REF_HOME" +set vm_game 0 +set sv_pure 0 +set net_enabled 0 +set sv_fps 125 +set pmove_fixed 1 +set pmove_msec 8 +set fraglimit 5 +set bot_enable 1 +map oa_rpg3dm2 +addbot Major 4 +addbot Grism 4
```

[The reference sequence](reference-arena.log) records positions, selected weapons, pickups and kills. TRACE columns are match ms, client, weapon, X, Y, Z, health and score. This is a native reference match between two original bots.

## Human playtest and original-data procedure

1. Open the static release in a clean desktop Chromium profile. Click Play. Confirm mouse capture, perspective, floor contact, ambient sound and the moving opponent.
2. From the default spawn, turn toward the launcher east of the starting position. Cross the floor to collect it. Miss once, fire at the opponent, listen for the impact, and check ammo and score. Use the side passages and central steps to break sight. Try the jump pad at the west end and return from the water.
3. Hold forward and fire, press Escape, release both, then Resume. Confirm control resumes without a new shot or continued acceleration. Test crouch, jump, sensitivity and volume.
4. Let the bot score, respawn, win or lose a five-frag match and rematch. Record aim readability, audio direction, floor/wall contacts and the displayed result.
5. Repeat using an owner's original baseq3 PK3s and select maps/q3dm1.bsp. Reverse selection order and omit a required archive in a separate attempt. Record the map SHA-256, browser configuration, traversal, both victories and rematch privately. Report only cleared observations.

No human playtest feedback or licensed retail data was supplied. Retail A7 and human acceptance remain open.

## Fixture coverage and visual differences

The public BSP SHA-256 is `0f8cca68b7c2eecff3815dfd7c3733377eb0ab56f1461b9b71c5efea8368976d`. Its 89 entities include four starts, 31 speakers and one inline trigger brush. The world has 4,196 surfaces, 1,953 brushes and eight lightmaps. Rendering resolves 34 texture inputs across the visible materials. The two sky stages in `textures/skies/nitesky` use direction-based spherical coordinates. The fixture supplies no six-face skybox named `full`, and the renderer approximates the reference cloud projection. Q3Map lighting directives are represented by the BSP's baked lighting. Major and the six equipped weapons use OpenArena MD3 meshes and skins. Health, armor, ammunition and combat effects use procedural geometry. Ambient audio uses the seven original OpenArena recordings and combat cues use synthesized positional sound.

`tests/route.mjs` drives a real browser from the first deathmatch start through the rocket pickup and the inline jump pad. It also exercises an unsupported adapter and a denied pointer-lock attempt followed by a successful retry. The import test reconstructs two temporary PK3s from the public fixture, checks both selection orders and verifies that errors leave the prior arena playable. The retail procedure can be run with `node tests/match.mjs --retail /path/to/baseq3`. Only that run uses the owner's archives.

The browser importer and native inspector accept Quake III Arena IBSP version 46 maps by their contents. The match and movement observations above apply to the named fixtures. A complete Quake shader interpreter, third-party game-code mods, additional game types and network play are outside the current release.

## Character, weapon and resolution checks

The character and resolution measurements below used revision `94cf0912733dab7694051f9fde0d4cddb7b77e0eab3ca40acead8f0c16a266f4`. The map package is byte-identical to the previous release. Camera-matched comparisons use seed 1813, a 76° vertical field of view and a 1280 × 720 GPU surface. The replay drives the shipping Wasm with fixed 8 ms gameplay commands. It records eye position, yaw, pitch and time for each capture and checks that each before/after pair agrees. The public Play and local import checks also exercise the normal host and pointer-lock controls. [Camera, texture and display records](detail/observations.json)

| Capture | Previous build | Revised build |
| --- | --- | --- |
| First spawn | [Machinegun](detail/before-spawn.jpg) | [Machinegun](detail/spawn.jpg) |
| Opponent in combat | [Close](detail/before-combat-close.jpg) · [Corridor](detail/before-combat-corridor.jpg) | [Close](detail/combat-close.jpg) · [Corridor](detail/combat-corridor.jpg) · [Combat sequence](detail/combat.mp4) |
| Arena floor | [Head-on](detail/before-floor-head-on.jpg) · [Grazing](detail/before-floor-grazing.jpg) | [Head-on](detail/floor-head-on.jpg) · [Grazing](detail/floor-grazing.jpg) |
| Alpha-tested east grate | [Before](detail/before-east-grate.jpg) | [After](detail/east-grate.jpg) |
| Display modes at the spawn | | [Native](detail/display-native.jpg) · [Performance](detail/display-performance.jpg) |

The HUD-free weapon captures show the [gauntlet](detail/weapon-1.jpg), [machinegun](detail/weapon-2.jpg), [shotgun](detail/weapon-3.jpg), [grenade launcher](detail/weapon-4.jpg), [rocket launcher](detail/weapon-5.jpg) and [lightning gun](detail/weapon-6.jpg). The replay walks to the four map pickups, switches equipment and verifies that a rocket shot consumes one round. [Firing frame](detail/rocket-shot.jpg)

### Automated macOS measurements

Hardware Chrome 157.0.8103.80 used Apple Metal 3 on the M4 Pro running macOS 27.2.1. Each mode completed six first-to-five matches. The two-minute samples exclude the first five seconds of each sampled match. The measurements are animation-frame intervals at the browser refresh rate.

| Mode | Actual surface | Combat sample | Median | p95 | Five rematches |
| --- | --- | --- | --- | --- | --- |
| Performance | 1280 × 720 | 120.01 s across matches 1 and 3 | 16.7 ms | 16.7 ms | Stable observed resource counts |
| Native | 1920 × 1080 | 120.01 s in match 5 | 16.7 ms | 16.7 ms | Stable observed resource counts |

The Performance run met both reference-machine targets. Startup and intermission can take considerably longer than combat frames. The longest intervals across the entire six-match runs were 249.9 ms in Performance and 266.7 ms in Native. The resource check counts browser objects after garbage collection, including 31 active ambient loops. [Performance summary](acceptance.json) · [Performance frames and events](release-matches.json) · [Native summary](detail/native/acceptance.json) · [Native frames and events](detail/native/release-matches.json)

The headed desktop reported 1200 × 919 CSS pixels at DPR 1. Hardware headless Chrome with a 960 × 540 viewport and emulated DPR 2 produced 1920 × 1080 in Native and 1280 × 720 in Performance. Each sample checked the canvas, acquired GPU surface, depth texture and centered crosshair. The tests also exercised resize, fullscreen and a live DPR change. At the 16,384-pixel GPU limit, an 18,000 × 320 request yielded 16,384 × 291 and a 200 × 18,000 request yielded 182 × 16,384. The two modes preserved the HUD font size and a 20-pixel relative mouse movement changed yaw by −0.044 radians in both. [Headed smoke check](browser-smoke.json) · [Display samples](detail/observations.json)

The image decoder and observed GPU uploads retained 512 × 512 for concrete_dark, 256 × 128 for bluemetalsupport2e and 128 × 128 for metfloor1. The browser recorded every mip extent down to 1 × 1. Baked BSP lightmaps use a separate 128 × 128 array. The imported OpenArena map passed in both patch orders with the bundled actor package. [GPU uploads](detail/observations.json) · [Local import results](import.json)

### Visual review and remaining hosts

The close combat capture shows Major’s face, armor and held shotgun. The firing frame puts the effect at the end of the equipped barrel. The floor and grate comparisons retain the same geometry, lighting and camera. The video joins short excerpts around first contact, firing, pain, the close encounter, death and the first sighting after respawn.

Human playtest feedback is pending for pose readability, foot contact and distant filtering during play. Linux hardware WebGPU and a licensed retail q3dm1 fixture were unavailable for this revision. Their acceptance checks remain open.

To reproduce, serve the static release and set `TEMBLOR_URL` to its origin. Run `node tests/detail.mjs` with FFmpeg installed, optionally setting `BASELINE_URL` to the previous build. For the match measurements use `HEADLESS=1 MATCHES=6 RENDER_MODE=performance node tests/match.mjs`. Repeat with `RENDER_MODE=native VIEW_WIDTH=1920 VIEW_HEIGHT=1080 EVIDENCE_DIR=evidence/detail/native`. Run `scripts/summarize.py` with the host's machine and OS and the matching evidence directory.

## Bot levels and Peek

The level and Peek checks used release `64fbbb55ab6e65be0694987b1458d8f0d29b9a7e16d382b25b5380b9eff42e3a`. Two complete matches from the previous shipping Wasm were recorded before tuning. The comparison hashes both positions, player aim, health, armor, weapons, ammunition, scores and the complete event stream at every 8 ms step. Standard reproduced both hashes, including a 0–5 idle match and a 2–5 match in which the player returned fire. Run `node tests/standard.mjs` against the current release. [Original release ID, seeds, counts and hashes](standard-replays.json)

The native encounter fixture runs the same inputs across levels. In the crossing test the player reverses strafe every 480 ms for two seconds. The cover test measures the time from first sight past a pillar to the bot’s first shot. In the pickup race both actors can reach the same rocket launcher.

| Level | First shot | Hits on crossing player | Shot after clearing pillar | First to rocket |
| --- | ---: | ---: | ---: | --- |
| Rookie | 1,064 ms | 1 | 1,064 ms | Player |
| Easy | 696 ms | 3 | 696 ms | Player |
| Standard | 376 ms | 11 | 376 ms | Player |
| Veteran | 264 ms | 14 | 528 ms | Bot |
| Expert | 176 ms | 16 | 400 ms | Bot |

In a separate rocket encounter, Veteran and Expert each hit a steady strafe for 100 damage. Reversing just after launch avoided the hit at both levels. The Explore test switches from Expert at close range, exhausts the bot’s machinegun ammunition, and lets the player finish five frags across bot respawns. It checks that the bot moves and issues zero attacks. Reproduce with `cargo test --release --locked --lib -- --nocapture`.

`node tests/peek.mjs` checks keyboard level selection, the paused clock and pose, drag, zoom, held P, movement after closing, level changes, rematch and local PK3 import. It opens the map from both play and paused Controls. The import uses the bundled OpenArena fixture through the file picker. [Peek in Trial by Error](peek.png)

Human tuning remains open. First-time players should try Rookie and Easy. For experienced Quake duelists, alternate Standard, Veteran and Expert after a warm-up and keep each measured match at one level. Record final scores and which mistakes were punished. The Veteran target is 40–60% wins against this group, with Expert winning more often. Licensed retail map verification also remains open.

## Texture batching

Chrome 158 on Linux with AMD GCN 5 graphics imported Arena Gate from the Quake III Arena demo. The scene, including the bundled actor skins and white fallback, used 18 distinct image dimensions in two bind groups. Map details reported the original 66 × 640 column texture. The torch cycled through flame images and the lava channel displayed its lava texture. The torch still showed a dark rectangular edge. The material interpreter also reported unsupported flame brightness waveforms and lava UV turbulence.

The standard match driver completed two rounds on Arena Gate, both won by the bot. In a separate keyboard-and-mouse run, the driver pursued the nearby shotgun and won 5–1 on Rookie. The rematch reset both scores to zero and the Standard bot won 5–0 against an idle player. Both rounds retained the same two bind groups. The demo PK3 and its captures stayed private.

Run `node tests/texture-batches.mjs` against the release to reproduce the public rendering comparison. It builds two versions of Trial by Error with identical solid colors and animated frames. Four camera views matched pixel for pixel between scenes using 5 and 38 image dimensions. A third fixture put 16 sizes into one animated material. The load error named the material, and redrawing the previous scene produced the same pixels.

## Map discovery and compatibility

Chrome listed all four maps in the unmodified Quake III demo PK3. Arena Gate, The Longest Yard, Temple of Retribution and The Proving Grounds each entered a match, accepted movement, opened Peek with the correct map title and resumed play. Temple of Retribution contains a fog material with no image stages. Temblor skips drawing that volume and reports the missing fog effect in **Map details**.

A separate native replay used seed 1813 and a scripted player that pursued and fired at the Standard bot. Arena Gate, Temple of Retribution and The Proving Grounds reached five frags and reset the scores on rematch. The Longest Yard reached 1 to −1 after ten simulated minutes. A second run with an idle player also ended the ten-minute observation window below the frag limit on The Longest Yard and The Proving Grounds.

The public import regression builds a PK3 with a renamed arena and an incompatible sibling. It selects the incompatible level, checks the version error, then starts the valid one from the same archive. It also checks an archive with no maps and both archive selection orders. [Import test](../tests/import.mjs) · [Results](import.json)
