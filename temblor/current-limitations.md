# Temblor compared with Quake III Arena

Temblor 0.1.0 runs local, first-to-five duels on Quake III Arena maps (IBSP version 46). **Arena Gate from the Quake III Arena demo is playable** through a full match and rematch. The retail edition of the same map still awaits verification. This comparison covers the original base game (`baseq3`). [Release record](release/build.json) · [Match evidence](evidence/README.md#texture-batching)

## Playing the game

| Area | What differs in Temblor |
| --- | --- |
| Matches and multiplayer | One human plays one local bot with a fixed five-frag limit. The original also offered a tiered single-player campaign, free-for-all with multiple opponents, tournament play, team deathmatch and capture the flag. Temblor has no network client, dedicated server or spectator mode. [Original game modes][modes] · [Original campaign][campaign] |
| Choosing a map | Temblor lists every `.bsp` level in the `maps/` folder of the PK3s you select, including community maps. When you choose a level, Temblor checks its format, looks up its assets and needs at least two clear spawn positions for the duel. A map can load and still use effects or game rules Temblor only partly supports. [Map picker](web/host.js) · [Map loader](src/browser.rs) |
| Mods that change the rules | Loading an arena brings in its layout, textures and sounds. Temblor still decides how weapons fire and how players score. If a Quake III mod includes a program that gives a weapon a new attack, Temblor cannot run that program. [Engine scope](specs/001-quake3-engine.md) |
| Bots | The opponent can navigate, collect items and fight. Explore and the five combat levels use Temblor’s own aim, reaction and movement settings. The original roster’s individual bot personalities and chat are absent. On *The Longest Yard*, two ten-minute automated duels fell short of the five-frag limit. [Bot checks](evidence/README.md#bot-levels-and-peek) · [Demo map checks](evidence/README.md#map-discovery-and-compatibility) |
| Items and hazards | Weapons, ammunition, armor and health pickups work. Timed power-ups such as Quad Damage and Haste, and holdable items such as the Medkit, have no gameplay effect. Swimming works, but staying underwater never causes drowning. Lava and slime share one damage rule. [Temblor gameplay](src/game.rs) · [Original items][items] · [Original environmental damage][hazards] |
| Map mechanisms | Jump pads, teleport triggers, damage triggers, sliding doors and lifts work. Buttons, trains, rotating machinery and timers lack their original behavior. Map authors can see how Temblor classified each entity in **Map details**. [Entity inventory](src/inventory.rs) · [Original map entities][entities] |

## What looks and sounds different

- **Torches and lava in Arena Gate.** The torch cycles through its flame images, but a dark rectangular edge is visible around it. The material interpreter skips the sawtooth brightness changes used by the flame. The lava channel displays its texture but lacks the rippling distortion specified by `tcMod turb`. These are visible even with the original demo PK3. [Arena Gate observations](evidence/README.md#texture-batching) · [Original shader interpreter][shaders]
- **Sky, fog and lighting.** Temblor uses baked lightmaps and samples the map’s light grid for models. It approximates sky layers with spherical texture coordinates and omits fog volumes and dynamic lights from weapon fire. A rocket explosion therefore does not light nearby walls. [World shader](src/arena.wgsl) · [Combat effects](src/draw.rs)
- **Characters, weapons and pickups.** Imported maps still use OpenArena’s Major and the six bundled weapon models. The railgun, plasma gun and BFG have firing logic, but use simplified geometry. Health, armor, ammo, projectiles and impacts also use shapes drawn by Temblor. Picking up the plasma gun on Arena Gate makes this difference visible. [Weapon and pickup rendering](src/draw.rs) · [Model sources](notices/ENGINE.md#player-and-weapon-sources)
- **Sound and music.** Temblor plays map speakers marked to start looping when the level loads. Triggered speakers and the map soundtrack stay silent. Shots, hits, pickups and deaths use synthesized cues, and the original announcer calls are absent. [Temblor audio](web/audio.js) · [Original client audio and music][audio]

## Browser and texture limits

The supported target is desktop Chromium on Linux or macOS with hardware WebGPU, keyboard and captured mouse input. The controls expose mouse sensitivity and render resolution. Key bindings and the 76° vertical field of view are fixed. There is no in-game Quake console for loading maps or changing settings. [Controls and browser setup](README.md#browser-setup-and-controls) · [Input handling](web/host.js)

Each draw can use **15 distinct color texture sizes** plus a separate lightmap array. All stages and animation frames of one material must fit in the same draw. Arena Gate used 18 sizes across two batches and retained its 66 × 640 column texture. A scene allows 249 source image layers plus the white fallback, up to 4,096 pixels per axis and 192 MiB for material textures including their mipmaps. [Texture batching spec](specs/004-texture-batching.md) · [Rendering checks](evidence/README.md#texture-batching)

[modes]: https://github.com/id-Software/Quake-III-Arena/blob/dbe4ddb10315479fc00086f08e25d968b4b43c49/code/game/bg_public.h
[campaign]: https://github.com/id-Software/Quake-III-Arena/blob/dbe4ddb10315479fc00086f08e25d968b4b43c49/code/q3_ui/ui_splevel.c
[items]: https://github.com/id-Software/Quake-III-Arena/blob/dbe4ddb10315479fc00086f08e25d968b4b43c49/code/game/bg_misc.c
[hazards]: https://github.com/id-Software/Quake-III-Arena/blob/dbe4ddb10315479fc00086f08e25d968b4b43c49/code/game/g_active.c
[entities]: https://github.com/id-Software/Quake-III-Arena/blob/dbe4ddb10315479fc00086f08e25d968b4b43c49/code/game/g_spawn.c
[shaders]: https://github.com/id-Software/Quake-III-Arena/blob/dbe4ddb10315479fc00086f08e25d968b4b43c49/code/renderer/tr_shader.c
[audio]: https://github.com/id-Software/Quake-III-Arena/blob/dbe4ddb10315479fc00086f08e25d968b4b43c49/code/cgame/cg_main.c
