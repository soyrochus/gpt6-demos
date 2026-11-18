# Implementation decisions

- **Bun HTML tooling:** use Bun's HTML bundler and HTML-import development server, following this project's Bun guidance. Vite is unnecessary. Desktop packaging copies the same production assets served by the browser backend.
- **Electrobun 2.0.6:** the desktop app selects the Bun 1.4.4 main process. Cottontail is used by Electrobun's build tooling, not as this app's backend runtime. The core and browser engine are pinned through Electrobun/Hutch.
- **GPU rendering:** remove Electrobun's default `disable-gpu` setting. Keep Chromium's software WebGL fallback available for hardware where acceleration is unavailable. Runtime smoke tests verify the actual renderer rather than treating a successful native launch as proof of WebGL support.
- **Original player asset:** generate and check in a skinned GLB with an eleven-bone rig, six material groups, and nine clips. Geometry and animations are original to this project. This avoids external asset licensing/network dependencies and allows kit material reuse. `bun run assets` regenerates it.
- **Football physics:** Rapier owns the free ball, ground, goalposts and crossbars. Kinematic movement, assisted dribbling, player separation, swept interceptions and football boundary rules live in the headless simulation. Stored transforms and velocities rebuild the small physics world on recovery; contact caches are reconstructed.
- **Computer players:** rule-based tactics maintain formation, press, support, carry, pass and shoot. Country attributes are equal. Difficulty changes computer decision delays and shot error, not physical speed.
- **Audio:** original synthesized kicks/whistles/menu effects and a filtered crowd bed. Browser audio begins only after a user gesture. No downloaded sound recordings are required.
- **Local profile:** one persistent local profile, one active match, one input controller. HTTP cookies and same-origin/host checks protect loopback APIs. A native launch token is exchanged once and removed from the URL. The renderer is sandboxed and has no native filesystem/RPC access.
- **Persistence:** concrete file adapter behind profile, checkpoint and result repositories. Result-before-checkpoint deletion makes completion recoverable without cross-file transactions. The schema is version one; newer unsupported versions are refused rather than silently rewritten. Add explicit migrations when the schema first changes.
- **Fonts:** local system font stacks with serif and sans-serif fallbacks. There are no runtime font downloads. Typography can vary slightly between operating systems.
- **Distribution:** build and verify the available Linux x64 target. Other configured platforms remain unverified until tested on their actual hosts. No signing credentials or update service have been configured.

## Linux CEF helper compatibility

Electrobun 2.0.1's Linux helper processes can report `stack smashing detected` after Chromium changes the stack canary during a zygote fork. The running helper command lines had `change-stack-guard-on-fork=enable`, matching the mechanism described in [CEF issue 3912](https://github.com/chromiumembedded/cef/issues/3912). [Chromium's diagnostic source](https://chromium.googlesource.com/chromium/src/+/main/base/stack_canary_linux.cc) documents `--change-stack-guard-on-fork=disable` as a compatibility workaround.

The Linux-only configuration now applies that workaround. It keeps stack-protector checks active but forgoes per-fork canary re-randomisation. Hardware graphics and the current sandbox configuration are unchanged. Remove this workaround when a tested Electrobun helper build handles canary changes correctly.

`bun run test:native` builds a separate app with its own identifier, browser profile, data directory, and debugging port. It checks the backend and WebGL over 310 seconds, scans native stderr for helper crashes, and verifies graceful shutdown. Its log and report are written to `test-results/`; it does not connect to a user's existing match.
