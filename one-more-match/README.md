# One More Match

A playable 7-a-side football game: choose one of 20 countries, play the computer, and go straight into another match. Three.js renders the pitch; a Bun service runs the match, physics, computer players, and saves. The same client runs in a browser or an Electrobun desktop window.

## Run

Use **Bun 1.4.4** for development and the browser server. Electrobun packages the desktop runtime.

```sh
bun install --frozen-lockfile
bun run dev
```

`dev` builds the client and opens the native window. The first desktop launch downloads Electrobun's verified build tools, Bun runtime, and Chromium engine. Subsequent app launches work offline. Set `HUTCH_HOME` if you want those tools cached in a specific directory.

For a browser with Bun's HTML development server and hot reload:

```sh
bun run dev:web
```

Open **http://127.0.0.1:3210**. `PORT=3211 bun run dev:web` selects a different port. For production browser mode:

```sh
bun run build
bun run start
```

For a standalone desktop distribution:

```sh
bun run desktop:build
```

Host-specific installers are written to `artifacts/`. Linux output includes `linux-x64-OneMoreMatch-Setup.tar.gz`: extract it and run the included launcher. The installed app includes Bun and its browser engine, so players do not need Bun, Node, or a terminal.

**Verified desktop target:** Linux x64. Windows x64 and macOS arm64 configuration is included; those targets still need builds and testing on their respective operating systems. The first native build can be large because Chromium is bundled.

## Play

1. Choose **Let’s play**, then your country, opponent, and difficulty.
2. Choose **Kick off**. Aim and press **J** to take a restart; idle restarts happen automatically after five seconds.
3. Play two 150-second halves. The clock stops at dead balls and pauses. Draws are allowed.
4. **One more match** keeps your country and difficulty. A manually chosen opponent stays selected; Random draws again.

| Action                    | Keyboard           | Standard gamepad                 |
| ------------------------- | ------------------ | -------------------------------- |
| Move / aim                | WASD or arrows     | Left stick                       |
| Sprint                    | Left Shift         | Right trigger                    |
| Pass / standing tackle    | J                  | A / south button                 |
| Charge and release a shot | Hold and release K | Hold and release X / west button |
| Switch outfield player    | L                  | Left bumper                      |
| Pause                     | Escape             | Menu / Start                     |
| Navigate menus            | Tab, Enter         | D-pad up/down, A                 |

Movement is relative to the screen. Your teammates and goalkeeper act automatically. Passing selects a teammate in your aim direction; without an aim, it favours a useful forward/lateral option. The selected player has a lime ring and number. The radar shows players outside the camera view.

Settings include graphics quality, render scale, sound levels, mute, reduced camera motion, text size, and keyboard bindings. The game pauses on focus loss, controller disconnect, or a lost connection. Resume explicitly when ready. A second window can take control through the displayed reconnect action.

## Saves

There is **no database**. `packages/storage` exposes repositories and supplies a versioned JSON file adapter. Replacing it with a database implementation does not require changing football rules or the client.

- Browser/development defaults to `.data/` under the application directory.
- Desktop uses Electrobun's OS-specific application user-data directory.
- `ONE_MORE_MATCH_DATA_DIR=/path/to/data` overrides either location.
- Preferences save on confirmation; active matches checkpoint every five seconds and at significant transitions.
- Reloading offers a saved match. Process recovery starts paused and can lose up to five seconds of recent play.
- Atomic replacement, previous-version backups, corruption recovery, exclusive process ownership, and revision checks protect saves.
- Completion is keyed by match ID, making repeated result writes safe. The last 100 completed results are retained.
- Failed writes show a warning while play continues in memory. Do not assume a warned save will survive closing the app.

One active local profile and one controlled match are supported. This is a local application, not an authenticated public multiplayer service. Its backend binds only to loopback.

## Project map

| Directory             | Responsibility                                                               |
| --------------------- | ---------------------------------------------------------------------------- |
| `apps/client`         | Three.js scene, animated GLB players, React menus/HUD, input and sound       |
| `apps/server`         | Bun HTTP/WebSocket service, sessions, lifecycle and persistence coordination |
| `apps/desktop`        | Native window, display sizing, application lifecycle and OS paths            |
| `packages/simulation` | Headless 60 Hz football rules, Rapier ball physics and team tactics          |
| `packages/contracts`  | Shared state, input validation and persisted record types                    |
| `packages/catalogue`  | Countries, original kit colours, clash handling and gameplay tuning          |
| `packages/storage`    | Storage interfaces and atomic file adapter                                   |
| `public/assets`       | Original skinned player GLB, icon and asset manifest                         |
| `tests`               | Simulation, storage, service and browser tests                               |

The server owns the ball, possession, movement, AI, clock, score and statistics. The client sends validated input and receives 20 Hz snapshots. It interpolates movement and makes a small local movement prediction; scoring always comes from the server. No remote AI service or asset CDN is involved.

## Verification

```sh
bun run typecheck
bun run lint
bun test
```

`bun test` also discovers the browser test. To run only headless simulation/storage/service tests, use `bun run test`.

Install the browser test engine once, then run the end-to-end test:

```sh
bunx playwright install chromium
bun run test:e2e
```

`PLAYWRIGHT_CHROMIUM_EXECUTABLE=/absolute/path/to/chrome` can select an existing Chromium executable. The browser test creates its own isolated temporary data directory and server; it does not touch your matches. It accelerates the fixture clock to test half-time/results and 20 rendered rematches. The separate simulation soak plays 100 complete seeded matches at the normal fixed timestep.

After the Electrobun devkit has been prepared, `bun run typecheck:desktop` checks native code against the actual SDK. `bun scripts/check-performance.ts` measures simulation tick cost. `bun scripts/native-smoke.ts` checks an already-open fresh development window through its local debugging port. Release builds disable that port by default; a test launch can explicitly set `ELECTROBUN_CEF_REMOTE_DEBUGGING_PORT` and the smoke script's `CDP_URL`.

See [VALIDATION.md](VALIDATION.md) for measured results and remaining platform verification. See [DECISIONS.md](DECISIONS.md) for implementation choices relative to the spec. The original [specification](specs/one-more-match.md) is preserved.

## Linux launch messages

A delayed `*** stack smashing detected ***: terminated` message was traced to a CEF helper compatibility issue. The Linux launch configuration includes the documented stack-canary workaround. Close an older running window and run `bun run dev` again to rebuild with the correction. Saves do not need to be deleted. Previously built installers require `bun run desktop:build` to pick up configuration changes.

The GTK locale and unsupported application-menu messages originate in the desktop framework and are separate from that helper issue. The game's menus are inside its own interface.

To run the isolated, five-minute native stability check:

```sh
bun run test:native
```
