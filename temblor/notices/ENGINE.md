# Temblor source and content

Temblor contributors, 2026. Original runtime, host, procedural character, pickup and weapon geometry, synthesized combat cues and tools are licensed GPL-2.0-or-later. Quake III Arena is the compatibility target. Quake and Quake III Arena are trademarks of their respective owners.

Movement and brush clipping translate algorithms from id Software's Quake III Arena, copyright © 1999–2005 id Software, Inc., GPL-2.0-or-later, revision dbe4ddb10315479fc00086f08e25d968b4b43c49. Movement constants, friction, acceleration, stepping and clipping derive from code/game/bg_pmove.c, bg_slidemove.c and code/qcommon/cm_trace.c. The Rust base-game tables and rules refer to code/game/bg_misc.c, bg_public.h, g_items.c, g_client.c, g_missile.c, g_combat.c and g_weapon.c. Binary format contracts follow code/qcommon/qfiles.h and code/botlib/aasfile.h, be_aas_file.c. See COPYING.

The map is Trial by Error, copyright © 2003 Robert P. Gove Jr. (R.P.G.), retextured for OpenArena. The unchanged compiled BSP and editable OpenArena map come from Debian openarena-maps 0.8.5split. The companion AAS comes from openarena-misc 0.8.5split. The same release supplies OpenArena shaders, levelshot, textures and ambient recordings. assets/manifest.json identifies each original file, package, path and SHA-256. All listed inputs are copied unchanged. Runtime processing resamples textures and tessellates patches. See assets/source/editable/rpg3dm2source.txt, the package copyright files and upstream credits. System fonts come from the player's browser.

The public release allowlist excludes commercial game content. The corresponding source archive beside index.html includes the build inputs and exact crate source packages used for the deployed Wasm. Each dependency retains its own notices and license terms in its source package. The generated dependency inventory lists license expressions and archive checksums.

The Wasm build enables ZIP inflation through flate2. The retained crate sources carry MIT, BSD, Zlib, Unicode or equivalent permissive terms, including dual licenses that permit the MIT choice. See the exact SPDX expressions in dependencies.json and the full upstream terms in the corresponding source archive.

## Pinned content inputs

The Debian source tarballs below contain the originals identified in the asset manifest. The preferred editable map is included in the corresponding source. The game does not need any upstream download at launch.

| Source package | Original tarball SHA-256 |
| --- | --- |
| [openarena-maps 0.8.5split](https://deb.debian.org/debian/pool/main/o/openarena-maps/openarena-maps_0.8.5split.orig.tar.bz2) | f9922a8e080e5f1de3e190deb355f50f8ca1700dcbe28aab88be07e6a45dea60 |
| [openarena-misc 0.8.5split](https://deb.debian.org/debian/pool/main/o/openarena-misc/openarena-misc_0.8.5split.orig.tar.bz2) | ba65afb212c6909e974b32d9f0b2696e33c579bf63e44e1d9320c7b183f00c6c |
| [openarena-textures 0.8.5split](https://deb.debian.org/debian/pool/main/o/openarena-textures/openarena-textures_0.8.5split.orig.tar.bz2) | 40229bb6852675e29684817af80b66a839c89b7062043ff3df5f3f420846bb0a |
| [openarena-data 0.8.5split](https://deb.debian.org/debian/pool/main/o/openarena-data/openarena-data_0.8.5split.orig.tar.bz2) | 66c7bcf44022ce96331c15718e7145d5367aa23bff95e2fce7abfc844ae6e588 |
