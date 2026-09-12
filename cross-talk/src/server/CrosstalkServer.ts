import OpenAI from 'openai';
import type { PcmAdapter } from '../desktop/OpenAIPcmAdapter';
import type { Server, ServerWebSocket, WebSocketHandler } from 'bun';
import { ApplicationRegistry, type RegisteredApplication } from './ApplicationRegistry';
import { SessionManager } from './SessionManager';
import { AstraAgent, type ReasoningAgent } from '../openai/AstraAgent';
import { OpenAILiveAdapter, type LiveAdapter } from '../openai/OpenAILiveAdapter';
import { CrosstalkError, type ClientMessage, type ServerMessage } from '../protocol';
import { objectSchema, validate } from '../protocol/validation';
import type { Logger } from './ToolRouter';
export interface CrosstalkServerOptions {
  openAIKey?: string; endpoint?: string; liveModel?: string; reasoningModel?: string; reasoningEffort?: 'low' | 'medium' | 'high'; voice?: string;
  allowedOrigins?: string[]; authorize?: (request: Request) => boolean | Promise<boolean>;
  debug?: boolean; maxConnections?: number; maxToolCalls?: number; delegationTimeoutMs?: number; logTranscripts?: boolean; logger?: Logger;
  desktopAudio?: boolean; liveAdapter?: LiveAdapter; astraAgent?: ReasoningAgent;
}
export interface CrosstalkSocketData { sessionId: string; token: string; instanceId?: string; identity?: { id: string; version: string }; app?: RegisteredApplication; count: number; windowAt: number; handshakeTimer?: ReturnType<typeof setTimeout> }
const str = { type: 'string', minLength: 1, maxLength: 256 };
const messageSchemas: Record<string, object> = {
  'client.hello': objectSchema({ type: { const: 'client.hello' }, protocolVersion: { const: '1.0' }, instanceId: str, application: objectSchema({ id: str, version: str }) }),
  'state.result': objectSchema({ type: { const: 'state.result' }, requestId: str, state: {} }),
  'state.error': objectSchema({ type: { const: 'state.error' }, requestId: str }),
  'tool.result': objectSchema({ type: { const: 'tool.result' }, invocationId: str, result: { type: 'object' } }),
  'confirmation.result': objectSchema({ type: { const: 'confirmation.result' }, requestId: str, approved: { type: 'boolean' } }),
  'session.end': objectSchema({ type: { const: 'session.end' } }),
  'application.event': objectSchema({ type: { const: 'application.event' }, state: {}, event: objectSchema({ type: str, timestamp: { type: 'number' }, data: {} }, ['type', 'timestamp']) }),
};
export class CrosstalkServer {
  readonly registry = new ApplicationRegistry();
  readonly websocket: WebSocketHandler<CrosstalkSocketData>;
  private sessions?: SessionManager;
  private sockets = new Set<ServerWebSocket<CrosstalkSocketData>>();
  private endpoint: string;
  private log: Logger;
  constructor(private options: CrosstalkServerOptions = {}) {
    this.endpoint = (options.endpoint ?? '/crosstalk').replace(/\/$/, '');
    this.log = options.logger ?? ((event, fields) => console.info(JSON.stringify({ timestamp: new Date().toISOString(), event, ...fields })));
    const key = options.openAIKey ?? process.env.OPENAI_API_KEY;
    if (key || (options.liveAdapter && options.astraAgent)) {
      const client = new OpenAI({ apiKey: key ?? 'injected-test-adapter', maxRetries: 0, timeout: 60_000 });
      const effort = options.reasoningEffort ?? process.env.CROSSTALK_REASONING_EFFORT ?? 'medium';
      if (!['low', 'medium', 'high'].includes(effort)) throw new Error('CROSSTALK_REASONING_EFFORT must be low, medium, or high.');
      this.sessions = new SessionManager(
        options.liveAdapter ?? new OpenAILiveAdapter(client, key!, options.liveModel ?? process.env.CROSSTALK_LIVE_MODEL, options.voice ?? process.env.CROSSTALK_VOICE),
        options.astraAgent ?? new AstraAgent(client, options.reasoningModel ?? process.env.CROSSTALK_REASONING_MODEL, effort as 'low' | 'medium' | 'high'),
        this.log, { ...options, logTranscripts: options.logTranscripts ?? process.env.CROSSTALK_LOG_TRANSCRIPTS === 'true' });
    }
    this.websocket = {
      maxPayloadLength: 128 * 1024, idleTimeout: 60, sendPings: true,
      open: ws => {
        this.sockets.add(ws);
        ws.data.handshakeTimer = setTimeout(() => { if (!ws.data.app) ws.close(1008, 'Registration timed out'); }, 10_000);
      },
      message: (ws, raw) => {
        try {
          if (Date.now() - ws.data.windowAt > 1000) { ws.data.windowAt = Date.now(); ws.data.count = 0; }
          if (++ws.data.count > 100) { ws.close(1008, 'Rate limit'); return; }
          const message = JSON.parse(String(raw));
          this.receive(ws, message);
        } catch (error) {
          const code = error instanceof CrosstalkError ? error.code : 'INVALID_MESSAGE';
          ws.send(JSON.stringify({ type: 'error', code, message: 'Invalid Crosstalk request.' }));
          this.log('protocol.error', { sessionId: ws.data.sessionId, code, ...((this.options.debug ?? process.env.CROSSTALK_DEBUG === 'true') ? { phase: ws.data.app ? 'registered' : 'handshake' } : {}) });
        }
      },
      close: ws => {
        clearTimeout(ws.data.handshakeTimer); this.sockets.delete(ws);
        void this.sessions?.end(ws.data.sessionId);
        if (ws.data.app) this.registry.unregister(ws.data.app.instanceId);
      },
    };
  }
  private receive(ws: ServerWebSocket<CrosstalkSocketData>, value: unknown) {
    if (!value || typeof value !== 'object' || !('type' in value) || typeof value.type !== 'string') throw new Error('Invalid message');
    if (value.type !== 'application.register') {
      const schema = messageSchemas[value.type]; if (!schema) throw new Error('Unknown message'); validate(schema as Record<string, unknown>, value);
    }
    const message = value as ClientMessage;
    const send = (m: ServerMessage) => { if (ws.readyState === 1) ws.send(JSON.stringify(m)); };
    if (message.type === 'client.hello') {
      if (ws.data.instanceId) throw new Error('Already initialized');
      ws.data.instanceId = message.instanceId; ws.data.identity = message.application;
      send({ type: 'server.hello', protocolVersion: '1.0', sessionId: ws.data.sessionId, token: ws.data.token, status: 'ready', ...(this.options.desktopAudio ? { capabilities: ['desktop-audio/1'] } : {}) }); return;
    }
    if (!ws.data.instanceId) throw new Error('Hello required');
    if (message.type === 'application.register') {
      if (ws.data.app) throw new Error('Already registered');
      const { type, ...registration } = message;
      const app = this.registry.register(ws.data.instanceId, ws.data.sessionId, registration, send);
      if (app.registration.manifest.application.id !== ws.data.identity?.id || app.registration.manifest.application.version !== ws.data.identity.version) {
        this.registry.unregister(app.instanceId); throw new Error('Identity mismatch');
      }
      ws.data.app = app; clearTimeout(ws.data.handshakeTimer); send({ type: 'application.registered' }); return;
    }
    const app = ws.data.app; if (!app) throw new Error('Registration required');
    switch (message.type) {
      case 'state.result': app.receive(message.requestId, 'state', message.state); break;
      case 'state.error': app.pending.get(message.requestId)?.reject(new CrosstalkError('STATE_UNAVAILABLE', 'Application state is unavailable.', true)); break;
      case 'tool.result': app.receive(message.invocationId, 'tool', message.result); break;
      case 'confirmation.result': app.receive(message.requestId, 'confirmation', message.approved); break;
      case 'application.event': app.setState(message.state); break;
      case 'session.end': void this.sessions?.end(ws.data.sessionId); break;
    }
  }
  handler = async (req: Request, server: Server<CrosstalkSocketData>): Promise<Response | undefined> => {
    const url = new URL(req.url);
    if (!url.pathname.startsWith(this.endpoint + '/')) return new Response('Not found', { status: 404 });
    const origin = req.headers.get('origin');
    if (!origin || !(this.options.allowedOrigins ?? [url.origin]).includes(origin)) return Response.json({ error: 'Unexpected origin.' }, { status: 403 });
    if (this.options.authorize && !await this.options.authorize(req)) return Response.json({ error: 'Unauthorized.' }, { status: 401 });
    if (url.pathname === this.endpoint + '/ws' && req.method === 'GET') {
      if (this.sockets.size >= (this.options.maxConnections ?? 32)) return new Response('Connection limit', { status: 429 });
      return server.upgrade(req, { data: { sessionId: crypto.randomUUID(), token: crypto.randomUUID(), count: 0, windowAt: Date.now() } }) ? undefined : new Response('WebSocket upgrade required', { status: 400 });
    }
    if (url.pathname === this.endpoint + '/live/session' && req.method === 'POST') {
      try {
        if (Number(req.headers.get('content-length') ?? 0) > 65536) return new Response('Offer too large', { status: 413 });
        const raw = await req.text(); if (raw.length > 65536) return new Response('Offer too large', { status: 413 });
        const body = JSON.parse(raw);
        validate(objectSchema({ applicationInstanceId: str, sdp: { type: 'string', minLength: 1, maxLength: 64000 } }), body);
        const app = this.registry.get(body.applicationInstanceId);
        const socket = [...this.sockets].find(ws => ws.data.app === app);
        if (!socket || req.headers.get('authorization') !== `Bearer ${socket.data.token}`) return new Response('Forbidden', { status: 403 });
        if (!this.sessions) return Response.json({ error: 'Set OPENAI_API_KEY on the server to enable voice.' }, { status: 503 });
        const answer = await this.sessions.start(app, { kind: 'webrtc', sdp: body.sdp });
        return Response.json({ sdp: answer.sdp }, { status: 201, headers: { 'Cache-Control': 'no-store' } });
      } catch (error) {
        this.log('session.error', { code: error instanceof CrosstalkError ? error.code : 'SESSION_FAILED' });
        return Response.json({ error: 'Could not start voice. Check server configuration and model access, then retry.' }, { status: 400 });
      }
    }
    return new Response('Not found', { status: 404 });
  };
  /** Audio ownership is validated against the live registered control socket, never an app ID alone. */
  audioOwner(instanceId: string, sessionId: string, token: string) {
    return [...this.sockets].find(ws => ws.data.instanceId === instanceId && ws.data.sessionId === sessionId && ws.data.token === token && ws.readyState === 1)?.data.app;
  }
  startAudio(app: RegisteredApplication, adapter: PcmAdapter, onAudio: (pcm: Uint8Array) => void, onEnd: () => void) {
    if (!this.sessions) throw new Error('VOICE_NOT_CONFIGURED');
    return this.sessions.start(app, { kind: 'pcm-websocket', adapter, onAudio, onEnd });
  }
  endAudio(sessionId: string) { return this.sessions?.end(sessionId) ?? Promise.resolve(); }
  async dispose() { await this.sessions?.dispose(); for (const ws of this.sockets) ws.close(1001, 'Server closing'); }
}
