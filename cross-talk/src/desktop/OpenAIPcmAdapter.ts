import type { ServerEvent, SessionStartEvent } from 'openai/resources/live/live';
import { liveInstructions } from '../openai/PromptBuilder';
import { normalizeLiveEvent, type LiveConnection, type LiveEvent } from '../openai/OpenAILiveAdapter';
export interface PcmConnection extends LiveConnection { sendAudio(pcm: Uint8Array): void }
export interface PcmAdapter { connectPcm(onAudio: (pcm: Uint8Array) => void, onEvent: (event: LiveEvent) => void, signal: AbortSignal): Promise<PcmConnection> }
/** Primary Live WebSocket: audio, transcripts, delegation and commentary share one connection. */
export class OpenAIPcmAdapter implements PcmAdapter {
  constructor(private key: string, private model = 'gpt-live-1', private voice = 'quartz', private endpoint = 'wss://api.openai.com/v1/live/sessions') {}
  connectPcm(onAudio: (pcm: Uint8Array) => void, onEvent: (event: LiveEvent) => void, signal: AbortSignal): Promise<PcmConnection> {
    const Socket = WebSocket as unknown as { new(url: string, options: Bun.WebSocketOptions): WebSocket };
    const ws = new Socket(this.endpoint, { headers: { Authorization: `Bearer ${this.key}` } });
    let ready = false, closing = false, settleClose: (() => void) | undefined;
    let closePromise: Promise<void> | undefined;
    const send = (message: object) => { if (ws.readyState !== 1) throw new Error('Voice connection closed'); ws.send(JSON.stringify(message)); };
    const close = () => {
      if (closePromise) return closePromise;
      closing = true;
      closePromise = new Promise<void>(resolve => {
        const timer = setTimeout(() => { ws.close(); resolve(); }, 2000);
        settleClose = () => { clearTimeout(timer); ws.close(); resolve(); };
        if (ws.readyState === 1 && ready) { try { send({ type: 'session.close' }); } catch { settleClose(); } }
        else settleClose();
      });
      return closePromise;
    };
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => fail('LIVE_START_TIMEOUT'), 15000);
      const fail = (code: string) => {
        clearTimeout(timer); void close();
        if (!ready) reject(new Error(code)); else onEvent({ type: 'error', code });
      };
      const abort = () => { clearTimeout(timer); void close(); reject(new DOMException('Cancelled', 'AbortError')); };
      signal.addEventListener('abort', abort, { once: true });
      ws.onopen = () => {
        if (signal.aborted || closing) { void close(); return; }
        const event: SessionStartEvent = { type: 'session.start', session: { model: this.model, instructions: liveInstructions, delegation: { type: 'client' }, store: false, audio: { format: { type: 'audio/pcm', rate: 24000 }, output: { voice: this.voice } } } };
        send(event);
      };
      ws.onmessage = ({ data }) => {
        if (closing) { try { if (JSON.parse(String(data)).type === 'session.closed') settleClose?.(); } catch {} return; }
        try {
          if (typeof data !== 'string' || data.length > 256 * 1024) throw new Error('Invalid upstream payload');
          const event = JSON.parse(data) as ServerEvent;
          if (event.type === 'session.started') {
            if (ready) throw new Error('Duplicate session startup');
            if (event.session.audio?.format?.type !== 'audio/pcm' || event.session.audio.format.rate !== 24000) throw new Error('Unexpected PCM format');
            ready = true; clearTimeout(timer);
            resolve({ id: event.session.id, sendAudio(pcm) {
              if (closing || !ready || !pcm.length || pcm.length > 4800 || pcm.length % 2) throw new Error('Invalid microphone frame');
              // 250 ms of base64 PCM plus protocol overhead. Never replay a stalled backlog.
              if (ws.bufferedAmount > 18000) { fail('AUDIO_INPUT_STALLED'); throw new Error('Audio input stalled'); }
              send({ type: 'session.input_audio.append', audio: Buffer.from(pcm).toString('base64') });
            }, commentary(delegationId, text) {
              let chunk = '';
              const flush = () => { if (!chunk || closing) return; const eventId = crypto.randomUUID(); send({ type: 'session.commentary.append', event_id: eventId, delegation_id: delegationId, content: chunk }); onEvent({ type: 'commentary.sent', eventId }); chunk = ''; };
              for (const char of text.slice(0, 4000)) { if (Buffer.byteLength(chunk + char) > 480) flush(); chunk += char; } flush();
            }, close });
          } else if (event.type === 'session.output_audio.delta') {
            if (!ready || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(event.delta)) throw new Error('Invalid audio output');
            const bytes = Buffer.from(event.delta, 'base64');
            if (!bytes.length || bytes.length % 2 || bytes.length > 24000) throw new Error('Audio output exceeds 500 ms');
            onAudio(bytes);
          } else {
            const normalized = normalizeLiveEvent(event);
            if (normalized?.type === 'error') fail('LIVE_UPSTREAM_ERROR');
            else if (normalized) onEvent(normalized);
          }
        } catch { fail('LIVE_PROTOCOL_ERROR'); }
      };
      ws.onerror = () => fail('LIVE_CONNECTION_FAILED');
      ws.onclose = () => { clearTimeout(timer); signal.removeEventListener('abort', abort); settleClose?.(); if (!closing) fail('LIVE_DISCONNECTED'); };
      if (signal.aborted) abort();
    });
  }
}
