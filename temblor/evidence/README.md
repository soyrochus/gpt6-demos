# Acceptance and reproduction

The tested public fixture is the unmodified OpenArena BSP `maps/oa_rpg3dm2.bsp`. The source allowlist gives its SHA-256 and the companion AAS digest. The [map inventory](oa_rpg3dm2.json) records the actual entity properties, submodel bounds, surface materials and texture origins. The runtime pause menu produces a fresh inventory for each import.

## Automated acceptance

| ID | Observation |
| --- | --- |
| A1 | Clean headed Chrome loaded the shipping Wasm and public PK3. The match recording follows the first sighting through a fight. |
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
2. From the default spawn, turn toward the orange launcher east of the starting position. Cross the floor to collect it. Miss once, fire at the opponent, listen for the impact, and check ammo and score. Use the side passages and central steps to break sight. Try the jump pad at the west end and return from the water.
3. Hold forward and fire, press Escape, release both, then Resume. Confirm control resumes without a new shot or continued acceleration. Test crouch, jump, sensitivity and volume.
4. Let the bot score, respawn, win or lose a five-frag match and rematch. Record aim readability, audio direction, floor/wall contacts and the displayed result.
5. Repeat using an owner's original baseq3 PK3s and select maps/q3dm1.bsp. Reverse selection order and omit a required archive in a separate attempt. Record the map SHA-256, browser configuration, traversal, both victories and rematch privately. Report only cleared observations.

No human playtest feedback or licensed retail data was supplied. Retail A7 and human acceptance remain open.

## Fixture coverage and visual differences

The public BSP SHA-256 is `0f8cca68b7c2eecff3815dfd7c3733377eb0ab56f1461b9b71c5efea8368976d`. Its 89 entities include four starts, 31 speakers and one inline trigger brush. The world has 4,196 surfaces, 1,953 brushes and eight lightmaps. Rendering resolves 34 texture inputs across the visible materials. The two sky stages in `textures/skies/nitesky` use direction-based spherical coordinates. The fixture supplies no six-face skybox named `full`, and the renderer approximates the reference cloud projection. Q3Map lighting directives are represented by the BSP's baked lighting. All pickup, opponent and view-weapon geometry is authored in Rust. Ambient audio uses the seven original OpenArena recordings and combat cues use synthesized positional sound.

`tests/route.mjs` drives a real browser from the first deathmatch start through the rocket pickup and the inline jump pad. It also exercises an unsupported adapter and a denied pointer-lock attempt followed by a successful retry. The import test reconstructs two temporary PK3s from the public fixture, checks both selection orders and verifies that errors leave the prior arena playable. The retail procedure can be run with `node tests/match.mjs --retail /path/to/baseq3`. Only that run uses the owner's archives.

The target covers local free-for-all on the supported maps. Input code accepts additional BSPs through the native inspector. A complete Quake shader interpreter, third-party mods, additional game types and network play are outside the current release.

## Release measurements

On an Apple M4 Pro running macOS 27.2.1 (26B131), hardware-accelerated headless Chrome 157.0.8103.80 used the Apple Metal 3 adapter at 1280 × 720 internal resolution and DPR 1. Headed desktop Chrome also completed the [recorded player victory](headed-match.json) and the input and pause checks. The Wasm SHA-256 is `025c76a0e9901c9d5d6d64d6458437166049f35c0995a069d64b744bcc95d676`.

After a five-second warm-up per sampled match, 7,201 frame intervals covered 120.01 seconds of active play in match(es) 1, 3. Median frame time was **16.7 ms** and p95 was **16.8 ms**. The longest sampled interval was 16.8 ms, with 0 over 50 ms. Across all six matches, including startup frames, the longest interval was 133.3 ms. The two frame-time targets passed on this configuration.

Fresh profile navigation to control took 538 ms on localhost, including the automated Play click. The Wasm was 853,009 bytes and the bundled arena was 3,891,059 bytes. Resource Timing recorded 4,849,940 transferred bytes for subresources. This excludes the HTML navigation and the separately downloadable source archive.

In six consecutive matches the player–bot scores were 5–1, 0–5, 5–2, 0–5, 5–4, 0–5. All five rematches reset the score and HUD. At intermission, instrumentation saw the same 43 host listener registrations, 31 active ambient loops and GPU wrapper counts after garbage collection. These counters measure browser objects. GPU texture views may retain native storage after a texture wrapper is collected.

See [the machine-readable summary](acceptance.json), [raw frame intervals and match events](release-matches.json), and the native test log. To reproduce the summary, run `python3 scripts/summarize.py --machine "Apple M4 Pro" --os "macOS 27.2.1 (26B131)"` after the six-match browser check. Build verification extracted the corresponding-source archive into a new checkout and rebuilt with the documented toolchain and cached locked crates. The shipped Wasm, JS, PK3 and complete source archive reproduced byte for byte.
