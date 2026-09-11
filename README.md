# GPT6 Demos

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE.md)
[![Bun](https://img.shields.io/badge/Runtime-Bun-14151a?logo=bun&logoColor=white)](https://bun.sh/)
[![TypeScript](https://img.shields.io/badge/Language-TypeScript-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Three.js](https://img.shields.io/badge/3D-Three.js-000000?logo=threedotjs&logoColor=white)](https://threejs.org/)
[![Contributions welcome](https://img.shields.io/badge/Contributions-welcome-brightgreen.svg)](#principles-of-participation)

A collection of interactive web demos exploring 3D graphics, visual design, and browser-based experiences. Built with Bun, TypeScript, and Three.js, the projects include an architectural explorer, a tarot reading room, a helicopter cave expedition, a music composition desk, an orbital mechanics laboratory, a digital logic laboratory, and a generative canvas and stop-motion studio. Each demo is a standalone application with its own source code and setup instructions. YouTube walkthroughs are included where available.

The repository also includes **Crosstalk**, a reusable voice control service that lets an AI explain and operate an application through its registered tools. Edificio Europa is its first integration.

Use this repository to try the demos, explore how they work, or build on their ideas. Follow the linked project READMEs for installation, development, and build instructions.

## Run all demos

With [Bun](https://bun.sh/) installed, run from the repository root:

```sh
./run-all.sh
```

The launcher starts Edificio Europa on [port 3001](http://localhost:3001), InfiniCave on [port 3002](http://localhost:3002), Tonada on [port 3003](http://localhost:3003), Tarot Spread on [port 3004](http://localhost:3004), Orbital on [port 3005](http://localhost:3005), Digital Logic Laboratory on [port 3006](http://localhost:3006), Flip-slop on [port 3007](http://localhost:3007), and Codex Canvas on [port 3008](http://localhost:3008). A separate portal process runs on [port 3000](http://localhost:3000). Logs are labelled by service. Press **Ctrl+C** to stop all eight demos and the portal; if any process exits, the launcher stops the others too. The assigned ports must be free.

Before starting Flip-slop, follow its [environment setup](./flip-slop/README.md#run): copy `flip-slop/example.env` to `flip-slop/.env` and set the OpenAI API key only in `.env`. The launcher assigns port 3007, overriding the standalone default.

For Codex Canvas, follow its [setup instructions](./codexcanvas/README.md#run). The launcher assigns port 3008, overriding the standalone default of 3030.

For Crosstalk voice control in Europa, first run `bun install` in `cross-talk/` and configure `cross-talk/.env` using its [setup instructions](./cross-talk/README.md#run-europa-with-voice). Europa loads that file and hosts the service itself, so the launcher needs no additional Crosstalk process. Without an API key, the architectural explorer remains usable through its normal controls.

### Demo portal

![GPT6 Demos portal showing all seven interactive demos](./images/portal.png)

Open [http://localhost:3000](http://localhost:3000) after starting the launcher, or open the root [index.html](./index.html) directly from disk. The white portal presents the eight demos in a four-column, two-row grid on desktop, with two columns on tablets and one on phones. Each card uses its screenshot from `images/`, a short description, and a link to the demo’s assigned localhost port.

The page uses plain HTML, inline CSS, and relative image paths, so it needs no build, JavaScript, or external assets and works over HTTP or `file://`. The demo servers must still be running for the links to open. To serve only the portal, run `bun run portal-server.ts` from the repository root (default port 3000; override with `PORT`). If you change a demo port in `run-all.sh`, update its link in `index.html` too.

Browser saves are specific to each address and port. Export existing projects or saves before moving a demo to a different port, then import them at its new address.

## Crosstalk — Conversational application control

Crosstalk adds a spoken interface to Bun web applications. GPT-Live-1 handles speech and conversation, while GPT-6 Astra uses the application's description, current state, and registered tools to answer questions and carry out requests. Each application supplies its own knowledge and actions through an adapter. The service works with those explicit capabilities and state updates; it does not inspect the screen.

In Edificio Europa, press **Crosstalk**, allow microphone access, and try “What am I looking at?”, “Show it at sunset”, “Show me around”, or “Save this view”. Tools control camera perspectives, building and compass sides, relative orbit, lighting, automatic rotation, zoom, view reset, and 4K image downloads. Voice actions and manual controls share the same controller, keeping the scene, buttons, and AI state synchronized.

Europa also shares live camera orientation with the AI. Its entrance is the front, facing 010° using the supplied geographic reference. Try “Show me the back”, “View it from the east”, or “Move around to my right a little”. An orientation indicator tracks the camera after voice and mouse navigation.

**Fullscreen illustrates the limits of tool access.** The `set_fullscreen` tool is retained as an example of a browser restriction: exposing a web application action to an AI does not give it capabilities beyond those the browser permits. Fullscreen entry requires user activation, such as a recent click, which a voice request alone does not provide. As a result, entering fullscreen by voice is not reliable. The tool reports the restriction and directs the user to the fullscreen button. Exiting fullscreen can still work by voice, and the conversation panel remains accessible in fullscreen.

The service includes validated tool arguments, interruption of camera navigation, and confirmation for downloads that were not directly requested. The OpenAI API key stays on the server, and browser audio connects to OpenAI over WebRTC. Use **End conversation** to stop the microphone and voice session.

[How Crosstalk works: diagram and walkthrough](./cross-talk/README.md#from-natural-conversation-to-application-action) · [Source, setup, and integration guide](./cross-talk/README.md) · [Service specification](./cross-talk/specs/cross-talk.md)

## Current demos

### Edificio Europa — Architectural explorer

An interactive, photo-based reconstruction of Edificio Europa in Valencia. Explore the building with free orbit, pan, and zoom, or use three animated camera presets. Switch between daylight, golden-hour, and blue-hour lighting, and export the current view as a 4K PNG. The model is an interpretive reconstruction rather than a measured architectural survey.

Its integrated [Crosstalk voice controls](#crosstalk--conversational-application-control) let you ask about the building, request a guided tour, and operate the explorer conversationally.

[![Edificio Europa — 3D demo](https://i.ytimg.com/vi/YwKfrL4P3N4/hqdefault.jpg)](https://youtu.be/YwKfrL4P3N4)

[Edificio Europa — 3D demo](https://youtu.be/YwKfrL4P3N4)

[Source and setup](./edificio-europa/README.md)

### Arcana — The Reading Room

An Art Deco tarot experience with animated Three.js cards, four spreads, and card-by-card explanations and combined readings in English and Spanish. Choose between Rider–Waite–Smith and Grand Etteilla decks, switch among three visual themes, and enlarge cards for a closer look. New decks can be added through folders of consistently named images.

[![Tarot Spread — Arcana demo](https://i.ytimg.com/vi/7ZIemecE9Cg/hqdefault.jpg)](https://youtu.be/7ZIemecE9Cg)

[Tarot Spread — Arcana demo](https://youtu.be/7ZIemecE9Cg)

[Source and setup](./tarot-spead/README.md) · [Adding a deck](./tarot-spead/DECKS.md)

### InfiniCave — Helicopter cave expedition

A single-player, side-view exploration game inspired by John Vanderaart’s Eindeloos. Pilot an armed helicopter through seeded caverns and mechanical ruins, activate relays, and shut down the cave’s heart. Choose from three finite map sizes, discover optional routes, survive enemies and timed hazards, and recover at repair checkpoints. Each expedition keeps its own local save, with autosaving and JSON import/export.

[![InfiniCave — Helicopter cave expedition demo](https://i.ytimg.com/vi/m6Nl7rRFqCg/hqdefault.jpg)](https://youtu.be/m6Nl7rRFqCg)

[InfiniCave — Helicopter cave expedition demo](https://youtu.be/m6Nl7rRFqCg)

[Source and setup](./infinicave/README.md) · [Game specification](./infinicave/specs/infinicave.md)

### Tonada — Music composition desk

A local music composition desk built with Three.js and Web Audio. Create patterns with a zoomable piano roll, drum grid, and chord tools, or start from five arrangement templates. Shape sounds with synthesis, FM, and sampling, mix tracks in a 3D room, and chain patterns into songs. Projects stay on your device, with JSON import/export and WAV and MIDI export; classic house and ambient soul example projects are included.

[![Tonada — Music composition desk demo](https://i.ytimg.com/vi/8P9yiukoHns/hqdefault.jpg)](https://youtu.be/8P9yiukoHns)

[Tonada — Music composition desk demo](https://youtu.be/8P9yiukoHns)

[Source and setup](./tonada/README.md) · [Example projects](./tonada/examples/README.md)

### Orbital — Mechanics laboratory

An interactive spacecraft dynamics and mission-planning workspace built with Three.js and a physics simulation running in a Web Worker. Place spacecraft in orbit, plan impulsive or finite-duration burns, and inspect how their trajectories and orbital elements change. Explore Earth–Moon transfers and lunar capture, compare planned and coasting paths, switch reference frames, and accelerate or replay mission time. Includes a simplified Earth–Mars scenario, a Hohmann transfer helper, analysis charts, and local mission saves with JSON import/export.

[![Orbital — Mechanics laboratory demo](https://i.ytimg.com/vi/hqoUdaAgZiw/hqdefault.jpg)](https://youtu.be/hqoUdaAgZiw)

[Orbital — Mechanics laboratory demo](https://youtu.be/hqoUdaAgZiw)

[Source and setup](./orbital-mechanics-laboratory/README.md) · [Demo specification](./orbital-mechanics-laboratory/specs/orbital-mechanics-laboratory.md)

### Digital Logic Laboratory — The Machine

An interactive digital circuit workbench and inspectable 16-bit H16 computer built with Three.js and a simulation worker. Connect NAND gates, build reusable circuits, test truth tables, and explore adders and clocked registers. Assemble programs and follow execution one CPU phase at a time, with plain-language explanations, active hardware highlights, breakpoints, and signal traces. Drill into the running ALU down to individual NAND gates, or run examples from addition to Pong, whose graphics and game logic execute on H16. Projects stay on your device, with local saves and JSON import/export.

[![Digital Logic Laboratory — The Machine demo](https://i.ytimg.com/vi/BAAoFSgP6QM/hqdefault.jpg)](https://youtu.be/BAAoFSgP6QM)

[Digital Logic Laboratory — The Machine demo](https://youtu.be/BAAoFSgP6QM)

[Source and setup](./digital-logic-laboratory/README.md) · [User manual](./digital-logic-laboratory/docs/user-manual.md) · [H16 architecture](./digital-logic-laboratory/docs/H16.md)

### Flip-slop — Generative canvas and stop-motion studio

A local-first creative studio built with Bun, TypeScript, and Canvas 2D. Generate images with OpenAI image models, guide edits with selections, masks, sketches, comments, and motion arrows, and keep every revision. Turn images into stop-motion frames, generate motion between keyframes, repair individual frames, and inspect continuity with onion skinning. Projects stay in the browser, with portable project import/export, image sequences, GIF, and WebM export. Image generation requires an OpenAI API key configured in the local `.env` file.

[![Flip-slop — Generative canvas and stop-motion studio demo](https://i.ytimg.com/vi/gxoiedhvGsc/hqdefault.jpg)](https://youtu.be/gxoiedhvGsc)

[Flip-slop — Generative canvas and stop-motion studio demo](https://youtu.be/gxoiedhvGsc)

[Source and setup](./flip-slop/README.md) · [Demo specification](./flip-slop/specs/flip-slop.md)

### Codex Canvas — Spatial coding workspace

A local graphical client for Codex built with Bun and TypeScript. Work with existing Codex sessions on a persistent canvas, with conversation, plans, file changes, and expandable activity grouped by turn. Keep selected results on the canvas, browse earlier turns, and maximize any card with adjustable text for easier reading. Stream responses, steer or stop active work, and review approval requests. Codex manages conversation history while SQLite preserves the canvas layout; the app uses your existing Codex authentication.

[![Codex Canvas — Spatial coding workspace demo](https://i.ytimg.com/vi/WrBpo7HGLT0/hqdefault.jpg)](https://youtu.be/WrBpo7HGLT0)

[Codex Canvas — Spatial coding workspace demo](https://youtu.be/WrBpo7HGLT0)

[Source and setup](./codexcanvas/README.md) · [Demo specification](./codexcanvas/specs/codexcanvas.md)

---

## Principles of Participation

Everyone is invited and welcome to contribute: open issues, propose pull requests, share ideas, or help improve documentation. Participation is open to all, regardless of background or viewpoint.

This project follows the [FOSS Pluralism Manifesto](./FOSS_PLURALISM_MANIFESTO.md), which affirms respect for people, freedom to critique ideas, and space for diverse perspectives.

Before submitting a change, complete its verification tasks and update the
relevant OpenSpec artifacts when behavior or requirements change.

## License and Copyright

Copyright (c) 2026 Iwan van der Kleijn

This project is licensed under the MIT License. See the [LICENSE.md](LICENSE.md) file for details.
