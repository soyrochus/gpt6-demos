import type { ServerWebSocket, WebSocketHandler } from 'bun';
import type { CrosstalkServer } from '../server/CrosstalkServer';
import type { RegisteredApplication } from '../server/ApplicationRegistry';
import type { PcmAdapter, PcmConnection } from './OpenAIPcmAdapter';
import { decodeFrame, encodeFrame, parseAudioMessage, PCM_FORMAT } from './protocol';
export interface AudioSocketData { audio: true; state?: AudioState }
interface AudioState { app?: RegisteredApplication; timer?: ReturnType<typeof setTimeout>; connection?: PcmConnection; generation: number; active: boolean; sequenceIn: number; sequenceOut: number; frames: number; frameAt: number; samples: number; sampleAt: number; controls: number; controlAt: number }
export class AudioServer {
  private sockets = new Set<ServerWebSocket<AudioSocketData>>();
  private generation = 0;
  constructor(private core: CrosstalkServer, private adapter: PcmAdapter) {}
  private send(ws: ServerWebSocket<AudioSocketData>, message: object) { if (ws.readyState === 1) ws.send(JSON.stringify(message)); }
  private stop(ws: ServerWebSocket<AudioSocketData>) {
    const state = ws.data.state!; state.active = false; state.connection = undefined;
    if (state.app) void this.core.endAudio(state.app.sessionId);
    this.send(ws, { type: 'audio.stopped', generation: state.generation });
  }
  private fail(ws: ServerWebSocket<AudioSocketData>, code: string) {
    this.send(ws, { type: 'audio.error', code, recoverable: true, message: code === 'VOICE_NOT_CONFIGURED' ? 'Configure OPENAI_API_KEY to enable voice.' : 'Voice audio stopped. Check your connection and audio device, then start again.' }); this.stop(ws); ws.close(1008, code);
  }
  readonly websocket: WebSocketHandler<AudioSocketData> = {
    maxPayloadLength: 16384, idleTimeout: 30, sendPings: true, backpressureLimit: 26000, closeOnBackpressureLimit: true,
    open: ws => {
      if (this.sockets.size >= 4) { ws.close(1008, 'Connection limit'); return; }
      this.sockets.add(ws);
      ws.data.state = { generation: 0, active: false, sequenceIn: 0, sequenceOut: 0, frames: 0, frameAt: performance.now(), samples: 0, sampleAt: performance.now(), controls: 0, controlAt: performance.now(), timer: setTimeout(() => this.fail(ws, 'AUDIO_AUTH_TIMEOUT'), 5000) };
    },
    message: (ws, raw) => {
      const state = ws.data.state; if (!state) return;
      try {
        if (typeof raw !== 'string') {
          if (!state.active || !state.connection) throw new Error('Audio not ready');
          const frame = decodeFrame(new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength));
          if (frame.kind !== 1 || frame.generation !== state.generation || frame.sequence !== state.sequenceIn || state.sequenceIn === 0xffffffff) throw new Error('Audio sequence mismatch');
          const now = performance.now();
          state.frames = Math.max(0, state.frames - (now - state.frameAt) / 10); state.frameAt = now;
          if (++state.frames > 20) throw new Error('Audio rate exceeded');
          state.samples = Math.max(0, state.samples - (now - state.sampleAt) * 24); state.sampleAt = now;
          state.samples += frame.pcm.length / 2;
          if (state.samples > 6000) throw new Error('Audio duration rate exceeded');
          state.sequenceIn++; state.connection.sendAudio(frame.pcm); return;
        }
        const now = performance.now(); if (now - state.controlAt > 1000) { state.controls = 0; state.controlAt = now; }
        if (++state.controls > 20) throw new Error('Audio control rate exceeded');
        const m = parseAudioMessage(raw);
        if (m.type === 'audio.hello') {
          if (state.app) throw new Error('Already authenticated');
          const app = this.core.audioOwner(m.instanceId, m.sessionId, m.token);
          if (!app || [...this.sockets].some(other => other !== ws && other.data.state?.app === app)) throw new Error('Invalid audio owner');
          state.app = app; clearTimeout(state.timer); this.send(ws, { type: 'audio.authenticated', protocol: 'desktop-audio/1' }); return;
        }
        if (!state.app || state.app.closed) throw new Error('Audio owner disconnected');
        if (m.type === 'audio.stop') { this.stop(ws); return; }
        if (state.active || this.generation === 0xffffffff) throw new Error('Audio already started');
        state.active = true; state.generation = ++this.generation; state.sequenceIn = state.sequenceOut = 0;
        const generation = state.generation;
        const pendingOutput: Uint8Array[] = []; let pendingBytes = 0;
        this.send(ws, { type: 'audio.starting', generation });
        void (async () => {
          const output = (pcm: Uint8Array) => {
            if (!state.active || state.generation !== generation) return;
            if (!state.connection) { if (pendingBytes + pcm.length > 24000) throw new Error('Startup output queue exceeded'); pendingOutput.push(pcm); pendingBytes += pcm.length; return; }
            if (ws.getBufferedAmount() + pcm.byteLength > 25000) { this.fail(ws, 'AUDIO_OUTPUT_STALLED'); return; }
            for (let offset = 0; offset < pcm.length; offset += 960) {
              if (state.sequenceOut === 0xffffffff) throw new Error('Audio counter exhausted');
              ws.send(encodeFrame({ kind: 2, generation, epoch: 0, sequence: state.sequenceOut++, pcm: pcm.subarray(offset, offset + 960) }));
            }
          };
          const connection = await this.core.startAudio(state.app!, this.adapter, output, () => {
            if (state.generation === generation) { const connected = !!state.connection; state.active = false; state.connection = undefined; if (connected) this.send(ws, { type: 'audio.stopped', generation }); }
          }) as PcmConnection;
          if (!state.active || state.generation !== generation || ws.readyState !== 1) { await connection.close(); return; }
          state.connection = connection;
          this.send(ws, { type: 'audio.started', generation, epoch: 0, format: PCM_FORMAT });
          for (const pcm of pendingOutput) output(pcm); pendingOutput.length = 0; pendingBytes = 0;
        })().catch(error => { if (state.generation === generation && ws.readyState === 1) this.fail(ws, error instanceof Error && error.message === 'VOICE_NOT_CONFIGURED' ? error.message : 'AUDIO_START_FAILED'); });
      } catch { this.fail(ws, 'AUDIO_PROTOCOL_ERROR'); }
    },
    close: ws => { if (!ws.data.state) return; clearTimeout(ws.data.state.timer); this.stop(ws); this.sockets.delete(ws); },
  };
  invalidate(sessionId: string) { for (const ws of this.sockets) if (ws.data.state?.app?.sessionId === sessionId) { this.stop(ws); ws.close(1001, 'Control disconnected'); } }
  dispose() { for (const ws of this.sockets) { this.stop(ws); ws.close(1001, 'Host closing'); } }
}
