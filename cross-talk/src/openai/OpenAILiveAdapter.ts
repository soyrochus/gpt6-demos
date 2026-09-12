import OpenAI from 'openai';
import type { ServerEvent } from 'openai/resources/live/live';
import { liveInstructions } from './PromptBuilder';
export type LiveEvent =
  | { type: 'transcript'; role: 'user' | 'assistant'; text: string; startMs: number; endMs: number }
  | { type: 'delegation'; id: string; offsetMs: number }
  | { type: 'commentary.sent'; eventId: string }
  | { type: 'commentary.accepted'; eventId?: string }
  | { type: 'closed' }
  | { type: 'error'; code?: string | null };
export function normalizeLiveEvent(event: ServerEvent): LiveEvent | undefined {
  if (event.type === 'session.input_transcript.delta' || event.type === 'session.output_transcript.delta') return { type: 'transcript', role: event.type === 'session.input_transcript.delta' ? 'user' : 'assistant', text: event.delta, startMs: event.start_ms, endMs: event.end_ms };
  if (event.type === 'session.delegation.created' && event.delegation.target === 'client') return { type: 'delegation', id: event.delegation.id, offsetMs: event.offset_ms };
  if (event.type === 'session.commentary.appended') return { type: 'commentary.accepted', eventId: event.client_event_id };
  if (event.type === 'session.closed') return { type: 'closed' };
  if (event.type === 'error') return { type: 'error', code: event.error.code };
}
export interface LiveConnection {
  id: string; sdp?: string;
  commentary(delegationId: string | null, text: string): void;
  close(): Promise<void>;
}
export interface LiveAdapter {
  connect(sdp: string, onEvent: (event: LiveEvent) => void, signal: AbortSignal): Promise<LiveConnection>;
}
/** Only this module knows OpenAI's session setup and outgoing wire protocol. */
export class OpenAILiveAdapter implements LiveAdapter {
  constructor(private client: OpenAI, private apiKey: string, private model = 'gpt-live-1', private voice = 'quartz') {}
  async connect(sdp: string, onEvent: (event: LiveEvent) => void, signal: AbortSignal): Promise<LiveConnection> {
    const result = await this.client.live.create({
      session: { model: this.model, instructions: liveInstructions, delegation: { type: 'client' }, audio: { output: { voice: this.voice } }, store: false, client: { data_channel: { allowed_client_events: ['session.close'] } } },
      transport: { type: 'webrtc', sdp },
    }, { signal });
    const BunWebSocket = WebSocket as unknown as { new(url: string, options: Bun.WebSocketOptions): WebSocket };
    const ws = new BunWebSocket(`wss://api.openai.com/v1/live/sessions/${encodeURIComponent(result.session.id)}/attach`, { headers: { Authorization: `Bearer ${this.apiKey}` } });
    let closing: Promise<void> | undefined, finishClose: (() => void) | undefined, closed = false;
    const send = (event: object) => { if (ws.readyState !== WebSocket.OPEN) throw new Error('Live control connection is not open.'); ws.send(JSON.stringify(event)); };
    ws.addEventListener('message', ({ data }) => {
      try {
        const event = JSON.parse(String(data)) as ServerEvent;
        // Reflected audio is deliberately neither retained nor logged.
        if (event.type === 'session.input_audio.append' || event.type === 'session.output_audio.delta') return;
        if (event.type === 'session.closed') { closed = true; finishClose?.(); }
        const normalized = normalizeLiveEvent(event); if (normalized) onEvent(normalized);
      } catch { /* Unrecognized upstream payloads never become application commands. */ }
    });
    await new Promise<void>((resolve, reject) => {
      const cleanup = () => { clearTimeout(timer); signal.removeEventListener('abort', abort); ws.removeEventListener('open', open); ws.removeEventListener('error', fail); ws.removeEventListener('close', fail); };
      const fail = () => { cleanup(); ws.close(); reject(new Error('Could not attach Live control connection.')); };
      const open = () => { cleanup(); resolve(); };
      const abort = () => { cleanup(); if (ws.readyState === WebSocket.OPEN) send({ type: 'session.close' }); ws.close(); reject(new DOMException('Cancelled', 'AbortError')); };
      const timer = setTimeout(fail, 10_000);
      ws.addEventListener('open', open, { once: true }); ws.addEventListener('error', fail, { once: true }); ws.addEventListener('close', fail, { once: true }); signal.addEventListener('abort', abort, { once: true });
      if (signal.aborted) abort();
    });
    ws.addEventListener('close', () => { finishClose?.(); if (!closed && !closing) onEvent({ type: 'error', code: 'LIVE_DISCONNECTED' }); });
    return {
      id: result.session.id, sdp: result.transport.sdp,
      commentary(delegationId, text) {
        // <=500 tokens even for non-Latin text: conservatively cap each UTF-8 chunk to 480 bytes.
        let chunk = '';
        const flush = () => { if (chunk) { const eventId = crypto.randomUUID(); send({ type: 'session.commentary.append', event_id: eventId, delegation_id: delegationId, content: chunk }); onEvent({ type: 'commentary.sent', eventId }); } chunk = ''; };
        for (const char of text.slice(0, 4000)) { if (new TextEncoder().encode(chunk + char).length > 480) flush(); chunk += char; } flush();
      },
      close() {
        if (closing) return closing;
        closing = new Promise<void>(resolve => {
          const timer = setTimeout(() => { ws.close(); resolve(); }, 3000);
          finishClose = () => { clearTimeout(timer); ws.close(); resolve(); };
          if (closed || ws.readyState !== WebSocket.OPEN) finishClose(); else send({ type: 'session.close' });
        }); return closing;
      },
    };
  }
}
