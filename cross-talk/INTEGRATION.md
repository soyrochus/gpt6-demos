# Integrate Crosstalk into a web application

Crosstalk adds conversation and voice control to a web application through a small application contract: a description, a current state snapshot, and executable tools. Your application keeps control of its UI and business logic. GPT-Live-1 handles conversation, GPT-6 Astra reasons about application requests, and Crosstalk validates and routes actions to your browser code.

This guide follows the working [Edificio Europa integration](../edificio-europa/README.md). The supplied server runs on Bun; the browser client can be used with any web UI that can bundle its TypeScript dependencies. Start with the [illustrated conversation-to-action walkthrough](./README.md#from-natural-conversation-to-application-action) for the overall flow.

## 1. Install the local packages

The packages in this repository are private source packages, not published registry packages. Keep `cross-talk/` available alongside your application, as Europa does:

```text
workspace/
  cross-talk/
    .env
    packages/client/
    packages/server/
    src/
  my-app/
    package.json
    index.ts
    index.html
    frontend.ts
    crosstalk/adapter.ts
```

Merge these dependencies and scripts into your application's `package.json`:

```json
{
  "type": "module",
  "dependencies": {
    "@crosstalk/client": "file:../cross-talk/packages/client",
    "@crosstalk/server": "file:../cross-talk/packages/server"
  },
  "scripts": {
    "dev": "bun --env-file=../cross-talk/.env --hot index.ts",
    "start": "bun --env-file=../cross-talk/.env index.ts"
  }
}
```

Run `bun install` in `cross-talk/`, then in your application. The package entry points reference `cross-talk/src/`, so copying only `packages/` is insufficient. See [Europa's package.json](../edificio-europa/package.json).

## 2. Configure the server environment

If you do not already have `cross-talk/.env`, copy [.env.example](./.env.example) to it. Preserve an existing `.env` and edit its values instead of overwriting it. Configure:

```env
OPENAI_API_KEY=your-server-side-key
CROSSTALK_LIVE_MODEL=gpt-live-1
CROSSTALK_REASONING_MODEL=gpt-6-astra
CROSSTALK_REASONING_EFFORT=medium
CROSSTALK_VOICE=quartz
CROSSTALK_LOG_TRANSCRIPTS=false
CROSSTALK_DEBUG=false
```

The startup scripts explicitly load this file into the server's environment. `.env.example` is a template and is never loaded by Crosstalk. The server reads all seven settings above; it does not read `OPENAI_TEXT_MODEL` or `OPENAI_TTS_MODEL`.

For models, voice, reasoning effort, and transcript logging, explicit `CrosstalkServer` constructor options take precedence over environment values. If those settings are absent, the implementation has defaults matching the example above. `CROSSTALK_DEBUG=true` enables extra error details in selected server logs. Reasoning effort accepts `low`, `medium`, or `high`; the boolean settings enable only when their value is `true`. Restart the server after changing `.env`. Check the launching environment for overrides if effective values differ from the file.

Keep the API key in server code. A browser bundle must never import a module that reads or embeds it. Without a key, application registration and manual controls can still work, but starting voice reports a configuration error.

## 3. Attach Crosstalk to the Bun server

Serve the application and `/crosstalk/*` from the same origin. This is Europa's deployment pattern and needs no separate Crosstalk process.

```ts
// my-app/index.ts
import page from './index.html';
import { CrosstalkServer, type CrosstalkSocketData } from '@crosstalk/server';

const crosstalk = new CrosstalkServer();
const server = Bun.serve<CrosstalkSocketData>({
  hostname: process.env.HOST || '127.0.0.1',
  port: Number(process.env.PORT || 3000),
  routes: { '/': page },
  websocket: crosstalk.websocket,
  maxRequestBodySize: 128 * 1024,
  async fetch(request, server) {
    if (new URL(request.url).pathname.startsWith('/crosstalk/')) {
      return crosstalk.handler(request, server);
    }
    return new Response('Not found', { status: 404 });
  },
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    void crosstalk.dispose().finally(() => {
      server.stop(true);
      process.exit(0);
    });
  });
}
```

Keep your existing application routes and add the Crosstalk branch. Return its handler result directly: a successful WebSocket upgrade returns `undefined`. If your server already handles WebSockets, dispatch callbacks according to connection type; the example assumes Crosstalk is the only WebSocket handler. A custom `endpoint` must match in the server options, route dispatch, and browser client.

The two application endpoints are `GET /crosstalk/ws` for registration, state, and tools, and `POST /crosstalk/live/session` for voice setup. Audio then travels directly between the browser and OpenAI over WebRTC. See [Europa's server](../edificio-europa/index.ts).

## 4. Put application actions behind a shared controller

Use the same controller methods for manual controls and voice tools. A method should perform the action, update application state, refresh the UI, and notify state subscribers. This prevents voice actions from changing the scene while leaving buttons or the AI's state stale.

Europa's [EuropaController](../edificio-europa/crosstalk/EuropaController.ts) wraps the explorer and exposes methods such as `setLighting`, `setPerspective`, and `capture`. Its [frontend](../edificio-europa/frontend.ts) connects visible controls and the Crosstalk adapter to that same controller.

Expose semantic state: selected view, lighting, readiness, selection, or current document status. Avoid sending DOM nodes, renderer instances, large data stores, secrets, or screenshots. State should describe what is true now. For example, Europa distinguishes the last selected camera preset from a view the user subsequently adjusted by dragging, and computes spatial orientation from the live camera.

## 5. Describe the application and register tools

An adapter implements `CrosstalkApplication`:

| Member | Responsibility | Europa reference |
| --- | --- | --- |
| `manifest` | Identity, domain concepts and knowledge, limitations, conversation guidance, and state schema | [manifest.ts](../edificio-europa/crosstalk/manifest.ts) |
| `getState()` | Return a fresh, serializable object matching `stateSchema`; may be asynchronous | [EuropaController.ts](../edificio-europa/crosstalk/EuropaController.ts) |
| `tools` | Tool definitions and browser-local execution handlers | [adapter.ts](../edificio-europa/crosstalk/adapter.ts) |
| `subscribe(listener)` | Optionally notify Crosstalk of semantic changes; return an unsubscribe function | [EuropaController.ts](../edificio-europa/crosstalk/EuropaController.ts) |

The following complete adapter is a reduced version of Europa's lighting integration. Implement `LightingController` using your application's existing scene and UI code. If you return additional state fields, add them to the schema too.

```ts
// my-app/crosstalk/adapter.ts
import type {
  CrosstalkApplication,
  CrosstalkApplicationEvent,
  CrosstalkTool,
} from '@crosstalk/client';

type Lighting = 'day' | 'golden' | 'blue';
type LightingState = { ready: boolean; lighting: Lighting };

export interface LightingController {
  getState(): LightingState;
  setLighting(lighting: Lighting): void;
  subscribe(listener: (event: CrosstalkApplicationEvent) => void): () => void;
}

export function createLightingAdapter(
  controller: LightingController,
): CrosstalkApplication<LightingState> {
  const setLighting: CrosstalkTool<{ lighting: Lighting }, { lighting: Lighting }> = {
    definition: {
      name: 'set_lighting',
      title: 'Change environmental lighting',
      description: 'Choose day for daylight, golden for sunset, or blue for dusk.',
      inputSchema: {
        type: 'object',
        properties: { lighting: { type: 'string', enum: ['day', 'golden', 'blue'] } },
        required: ['lighting'],
        additionalProperties: false,
      },
      effect: 'navigation',
      confirmation: 'never',
      interruptible: false,
    },
    execute({ lighting }, { signal }) {
      signal.throwIfAborted();
      controller.setLighting(lighting);
      return { lighting: controller.getState().lighting };
    },
  };

  return {
    manifest: {
      schemaVersion: '1.0',
      application: {
        id: 'my-explorer',
        name: 'My Explorer',
        version: '1.0.0',
        summary: 'An interactive scene with selectable lighting.',
        purpose: 'Explore the scene in daylight, sunset, or dusk.',
      },
      domain: {
        concepts: [{
          id: 'lighting',
          name: 'Lighting',
          description: 'day is daylight; golden is sunset; blue is dusk.',
        }],
        knowledge: [],
        limitations: ['Lighting presets are artistic, not a sun simulation.'],
      },
      interaction: { conversationalGuidance: ['Speak in the user’s language.'] },
      stateSchema: {
        type: 'object',
        properties: {
          ready: { type: 'boolean' },
          lighting: { type: 'string', enum: ['day', 'golden', 'blue'] },
        },
        required: ['ready', 'lighting'],
        additionalProperties: false,
      },
    },
    getState: () => controller.getState(),
    subscribe: listener => controller.subscribe(listener),
    tools: [setLighting],
  };
}
```

For “Show it at sunset”, Astra can choose `set_lighting({ lighting: 'golden' })` from the tool description and domain concepts. No phrase-matching code is needed in your application. Keep the manifest specific to your app; copy Europa's structure without copying its building knowledge or spatial assumptions.

### Tool contracts and results

Tool names must be unique, start with a lowercase letter, and contain only lowercase letters, digits, and underscores, up to 64 characters. Input schemas must be JSON Schema objects with `additionalProperties: false`. Use enums and bounds where applicable. Registration validates the manifest, initial state, and tool definitions; arguments are validated on the server and again in the browser.

Return serializable action data from `execute`, such as `{ lighting: 'golden' }`. Crosstalk adds the `{ ok, data, stateChanged }` envelope; do not return that envelope yourself. An optional `outputSchema` validates the returned data. For an actionable failure, throw `CrosstalkError(code, message, retryable)`. That runtime class is currently available from `cross-talk/src/protocol`, as Europa imports it; the client/server package entry points export protocol types but do not export the runtime class. Unexpected exceptions become a generic `TOOL_FAILED` result.

Use these effect and confirmation fields deliberately:

| Field | Values and behavior |
| --- | --- |
| `effect` | `read` for inspection; `navigation` for views and presentation controls; `mutation` for application edits; `external` for actions such as downloads. Effects also determine timeouts and the result's `stateChanged` flag. |
| `confirmation` | `never` executes without a prompt; `always` requires browser approval; `when-not-explicit` requires approval unless the user directly requested the action. The effect alone does not impose confirmation. |
| `interruptible` | Set `true` for work that can stop when a newer request supersedes it. Pass `context.signal` into the actual operation. |
| `expectedDurationMs` | Describes expected duration; it does not override execution timeouts. |

Europa's `capture_view` uses `effect: 'external'` and `confirmation: 'when-not-explicit'`. A direct “Save this view” can execute immediately; a question about whether saving is possible should not trigger a download. Browser approval is bound to the exact tool invocation and arguments.

For animated navigation, follow Europa's `show_perspective`: await the controller transition, honor cancellation during animation, and return only after the camera settles. Checking the signal once at entry is insufficient for a long operation. Completed effects are not rolled back when a conversation is interrupted.

Current execution limits are 5 seconds for navigation, 10 seconds for ordinary tools, and 30 seconds for external tools. State pulls have a 2-second timeout and confirmation a 30-second timeout. Delegations default to 12 tool calls and 120 seconds, configurable with `maxToolCalls` and `delegationTimeoutMs` on the server.

### Keep state fresh

Crosstalk pulls state at delegation start and after successful actions. `subscribe` additionally keeps it informed after manual controls or other application changes. Emit events such as `{ type: 'lighting.changed', timestamp: Date.now() }` after updating state, and remove listeners in the returned unsubscribe function. The bridge debounces event-driven snapshots by 80 ms; emit meaningful changes rather than every animation frame.

A valid initial state is required even while the app loads. If it includes `ready: false`, the browser executor rejects actions with `APPLICATION_NOT_READY`. Set readiness when your application can execute tools. Keep `getState` fast and free of side effects.

## 6. Mount the browser client

After constructing your controller, register the adapter in the browser entry point loaded by `index.html`:

```ts
// Add to my-app/frontend.ts, where controller is your LightingController instance.
import { CrosstalkClient } from '@crosstalk/client';
import { createLightingAdapter } from './crosstalk/adapter';

const crosstalk = new CrosstalkClient({ endpoint: '/crosstalk' });
crosstalk.mountButton({ position: 'bottom-right' });
void crosstalk.register(createLightingAdapter(controller)).catch(error => {
  console.error('Crosstalk registration failed:', error);
  // Also show your application's non-blocking connection message here.
});
window.addEventListener('pagehide', () => crosstalk.dispose(), { once: true });
```

Create one client and register one application per page. In a component-based app, construct it once on mount and call `dispose()` on unmount. The supplied panel starts voice on user interaction and displays status, transcripts, and confirmation prompts. It can be mounted at `bottom-right` or `bottom-left`. `start()` and `end()` are also available for your own controls; retain the panel for the supplied confirmation UI.

Use localhost or HTTPS for microphone access. On disconnection, the client closes voice, cancels work, and attempts to register again; the user starts a new conversation after reconnecting. Disposal releases the microphone, connection, panel, and adapter subscription. See [Europa's frontend](../edificio-europa/frontend.ts) for the canonical wiring.

## 7. Verify the integration

First check your adapter without paid API calls. Europa's [adapter tests](../edificio-europa/crosstalk/adapter.test.ts) exercise real controller behavior with a fake explorer. Crosstalk's [protocol tests](./tests/protocol.test.ts) inject `liveAdapter` and `astraAgent` implementations to exercise routing without OpenAI requests.

For a new app, verify that registration accepts the initial state; invalid tool arguments are rejected; manual and voice actions produce the same UI and state; navigation settles and can be interrupted; confirmations gate the intended actions; and errors describe the actual outcome. Then check in a browser that ending the conversation releases the microphone and reconnecting does not replay actions.

The existing canonical integration can be checked with:

```sh
# In cross-talk/
bun test
bun run typecheck
bun run test:browser

# In edificio-europa/
bun test
bun run typecheck
bun run build
```

See [verification setup](./README.md#verify) for Playwright installation and the optional, billable `test:astra` and `test:live` checks. Those live scripts target Europa; adapt their manifests and assertions when testing a different application.

Start your app with `bun run dev`, press **Crosstalk**, and try a state question, one action, a short sequence, an interruption, and a capability question. For Europa: “What am I looking at?”, “Show it at sunset”, “Show me around”, “Stop”, and “Can you save this view?” cover those different paths.

## Deployment and troubleshooting

A static build alone does not provide voice. Run the Bun server alongside your app, or proxy `/crosstalk/*` to a separate Bun service. The proxy must forward WebSocket upgrades, voice setup requests, and authorization headers. Keep the browser endpoint on the application's origin; configuring `allowedOrigins` alone does not add cross-origin HTTP/CORS support.

The server checks exact origins, defaulting to the request URL's origin. With a proxy, ensure its view of that origin matches the browser or supply `allowedOrigins` explicitly. The standalone [index.ts](./index.ts) reads a comma-separated `CROSSTALK_ALLOWED_ORIGINS`; embedded integrations must pass `allowedOrigins` themselves.

For a shared deployment, supply `authorize(request)` using your host application's authentication. It is called for both the WebSocket handshake and voice setup. Account for the fact that the voice setup `Authorization` header carries Crosstalk's session token; host session cookies are one way to authenticate both routes. Origin checks and Crosstalk tokens do not authenticate your users. Tools that call your application's backend must still use its normal authorization rules.

| Symptom | What to check |
| --- | --- |
| Registration fails or times out | Server route and WebSocket upgrade, matching endpoints, initial state schema, duplicate tool names, and invalid schemas. |
| `Unexpected origin` | Exact scheme, host, and port; reverse-proxy routing; configured `allowedOrigins`. |
| Voice reports a missing key or cannot start | Server `.env` path, key presence, configured model access, and a restart after environment edits. |
| Voice action works but buttons or reported state lag | Route both control paths through the shared controller and emit state events after updates. |
| Tool times out or continues after cancellation | Await actual completion, fit the effect's timeout, and honor `context.signal` inside ongoing work. |
| Fullscreen entry fails | Browsers may require a recent click. Return the failure and direct the user to the fullscreen button, as [EuropaFullscreen](../edificio-europa/crosstalk/EuropaFullscreen.ts) does. |

The current implementation keeps sessions in memory and supports one application registration per client. It does not inspect the screen or provide durable history or resumable tasks. Describe application limitations in the manifest so the conversation can explain them accurately.

For the full contracts and lifecycle, see the [Crosstalk README](./README.md), [protocol types](./src/protocol/index.ts), and [server options](./src/server/CrosstalkServer.ts).
