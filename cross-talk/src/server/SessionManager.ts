import type { PcmAdapter } from '../desktop/OpenAIPcmAdapter';
import type { ReasoningAgent } from '../openai/AstraAgent';
import type { LiveAdapter, LiveConnection, LiveEvent } from '../openai/OpenAILiveAdapter';
import type { RegisteredApplication } from './ApplicationRegistry';
import { DelegationEngine, type Transcript } from './DelegationEngine';
import { ToolRouter, type Logger } from './ToolRouter';
export type SessionRequest = { kind: 'webrtc'; sdp: string } | { kind: 'pcm-websocket'; adapter: PcmAdapter; onAudio: (pcm: Uint8Array) => void; onEnd: () => void };
export class SessionManager {
  private closing = new Set<Promise<void>>();
  private sessions = new Map<string, { controller: AbortController; connection?: LiveConnection; engine: DelegationEngine; startedAt: number; onEnd?: () => void }>();
  constructor(private live: LiveAdapter, private astra: ReasoningAgent, private log: Logger, private options: { maxToolCalls?: number; delegationTimeoutMs?: number; logTranscripts?: boolean } = {}) {}
  async start(app: RegisteredApplication, request: SessionRequest) {
    if (this.sessions.has(app.sessionId)) throw new Error('A voice session is already active.');
    const transcript: Transcript[] = [];
    const session = { controller: new AbortController(), connection: undefined as LiveConnection | undefined,
      engine: new DelegationEngine(app, this.astra, new ToolRouter(undefined, this.log), (id, text) => {
        try { session.connection?.commentary(id, text); }
        catch { this.log('live.error', { sessionId: app.sessionId, code: 'LIVE_SEND_FAILED' }); void this.end(app.sessionId); app.send({ type: 'session.status', status: 'error', message: 'Voice connection was lost. Please try again.' }); }
      }, this.log, this.options.maxToolCalls, this.options.delegationTimeoutMs), startedAt: Date.now(), onEnd: request.kind === 'pcm-websocket' ? request.onEnd : undefined };
    this.sessions.set(app.sessionId, session);
    const onEvent = (event: LiveEvent) => {
      if (session.controller.signal.aborted) return;
      if (event.type === 'transcript') {
        const { role, text, startMs, endMs } = event;
        transcript.push({ role, text, startMs, endMs });
        while (transcript.length > 600) transcript.shift();
        app.send({ type: 'transcript', role, text });
        if (this.options.logTranscripts) this.log('transcript', { sessionId: app.sessionId, role, text });
      } else if (event.type === 'delegation') {
        const context = transcript.filter(t => t.startMs <= event.offsetMs);
        void session.engine.handle(event.id, context);
      } else if (event.type === 'commentary.sent') {
        this.log('live.commentary.sent', { sessionId: app.sessionId, eventId: event.eventId });
      } else if (event.type === 'commentary.accepted') {
        this.log('live.commentary.accepted', { sessionId: app.sessionId, eventId: event.eventId });
      } else if (event.type === 'closed') {
        void this.end(app.sessionId); app.send({ type: 'session.status', status: 'idle' });
      } else if (event.type === 'error') {
        this.log('live.error', { sessionId: app.sessionId, code: event.code });
        app.send({ type: 'session.status', status: 'error', message: 'The voice connection encountered an error. End and try again.' });
        void this.end(app.sessionId);
      }
    };
    try {
      session.connection = request.kind === 'pcm-websocket'
        ? await request.adapter.connectPcm(request.onAudio, onEvent, session.controller.signal)
        : await this.live.connect(request.sdp, onEvent, session.controller.signal);
      if (session.controller.signal.aborted || app.closed) { await session.connection.close(); throw new Error('Application disconnected.'); }
      this.log('session.started', { sessionId: app.sessionId, application: app.registration.manifest.application.id });
      return session.connection;
    } catch (error) { if (this.sessions.get(app.sessionId) === session) await this.end(app.sessionId); else await session.connection?.close(); throw error; }
  }
  async end(id: string) {
    const session = this.sessions.get(id); if (!session) return;
    this.sessions.delete(id); session.engine.cancel(); session.controller.abort(); session.onEnd?.();
    const completion = (async () => {
      await session.connection?.close();
      this.log('session.ended', { sessionId: id, durationMs: Date.now() - session.startedAt });
    })();
    this.closing.add(completion);
    try { await completion; } finally { this.closing.delete(completion); }
  }
  async dispose() { const ending = [...this.sessions.keys()].map(id => this.end(id)); await Promise.all([...ending, ...this.closing]); }
}
