import type { Status } from '../protocol';
import { decodeFrame, encodeFrame, PCM_FORMAT } from './protocol';
export interface DesktopVoiceOptions { endpoint: URL; instanceId: string; sessionId: string; token: string; worklet: string }
export class DesktopTransport {
  private socket?: WebSocket; private context?: AudioContext; private stream?: MediaStream; private node?: AudioWorkletNode;
  private stopped = false; private generation = 0; private epoch = 0; private sequenceIn = 0; private sequenceOut = 0; private pendingPlayback = 0;
  private ready = false;
  constructor(private options: DesktopVoiceOptions, private status: (status: Status, message?: string) => void) {}
  async start() {
    // Start in the original click gesture. Permission time is outside the upstream startup deadline.
    const context = this.context = new AudioContext();
    const resume = context.resume();
    context.onstatechange = () => { if (this.ready && !this.stopped && context.state !== 'running') this.fail('Audio was suspended. Click Start conversation to enable audio again.'); };
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true }, video: false });
    if (this.stopped) { stream.getTracks().forEach(track => track.stop()); return; }
    this.stream = stream;
    stream.getTracks().forEach(track => track.onended = () => this.fail('Microphone disconnected. Start again after selecting an available device.'));
    await resume;
    if (context.state !== 'running') throw new Error('Audio is blocked. Click Start conversation to enable audio.');
    await context.audioWorklet.addModule(this.options.worklet);
    if (this.stopped) return;
    const node = this.node = new AudioWorkletNode(context, 'europa-audio', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1] });
    context.createMediaStreamSource(stream).connect(node); node.connect(context.destination);
    const url = new URL('audio', this.options.endpoint); url.protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = this.socket = new WebSocket(url); ws.binaryType = 'arraybuffer';
    node.port.onmessage = ({ data }) => {
      if (this.stopped) return;
      if (data.type === 'error') { this.fail('Audio processing stalled. Start the conversation again.'); return; }
      if (data.type === 'played-accepted') { this.pendingPlayback = Math.max(0, this.pendingPlayback - data.samples); return; }
      if (data.type !== 'capture') return;
      node.port.postMessage({ type: 'ack' });
      if (!this.ready) return;
      if (ws.readyState !== 1 || ws.bufferedAmount > 12000 || this.sequenceIn === 0xffffffff) { this.fail('Audio input connection stalled. Start again.'); return; }
      ws.send(encodeFrame({ kind: 1, generation: this.generation, epoch: 0, sequence: this.sequenceIn++, pcm: new Uint8Array(data.pcm) }));
    };
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => { this.fail('Voice startup timed out. Start again.'); reject(new Error('Voice startup timed out.')); }, 20000);
      const fail = () => { clearTimeout(timer); if (!this.stopped) this.fail('Voice connection closed. Start again.'); reject(new Error('Voice connection closed.')); };
      ws.onopen = () => ws.send(JSON.stringify({ type: 'audio.hello', protocol: 'desktop-audio/1', instanceId: this.options.instanceId, sessionId: this.options.sessionId, token: this.options.token }));
      ws.onmessage = ({ data }) => {
        if (this.stopped) return;
        try {
          if (data instanceof ArrayBuffer) {
            const frame = decodeFrame(new Uint8Array(data));
            if (frame.generation !== this.generation || frame.epoch < this.epoch) return;
            if (!this.ready || frame.kind !== 2 || frame.epoch !== this.epoch || frame.sequence !== this.sequenceOut++ || this.pendingPlayback + frame.pcm.length / 2 > 12000) throw new Error('Invalid playback stream');
            this.pendingPlayback += frame.pcm.length / 2;
            const pcm = frame.pcm.slice().buffer; node.port.postMessage({ type: 'play', pcm }, [pcm]); return;
          }
          if (typeof data !== 'string' || data.length > 16384) throw new Error('Invalid audio control');
          const m = JSON.parse(data);
          if (m.type === 'audio.authenticated') { if (m.protocol !== 'desktop-audio/1') throw new Error('Unsupported audio protocol'); ws.send(JSON.stringify({ type: 'audio.start' })); }
          else if (m.type === 'audio.starting') { if (!Number.isInteger(m.generation) || m.generation < 1 || m.generation > 0xffffffff || this.generation) throw new Error('Invalid generation'); this.generation = m.generation; }
          else if (m.type === 'audio.started') {
            if (this.ready || m.generation !== this.generation || m.epoch !== 0 || Object.keys(PCM_FORMAT).some(k => m.format?.[k] !== PCM_FORMAT[k as keyof typeof PCM_FORMAT])) throw new Error('Unsupported audio format');
            clearTimeout(timer); this.ready = true; node.port.postMessage({ type: 'start' }); this.status('listening'); resolve();
          } else if (m.type === 'audio.flush') {
            if (m.generation !== this.generation) return;
            if (!Number.isInteger(m.epoch) || m.epoch !== this.epoch + 1) throw new Error('Invalid playback epoch');
            this.epoch = m.epoch; this.sequenceOut = 0; node.port.postMessage({ type: 'flush' });
          } else if (m.type === 'audio.error') { clearTimeout(timer); this.fail(typeof m.message === 'string' ? m.message.slice(0, 256) : 'Voice is unavailable.'); reject(new Error('Voice unavailable.')); }
          else if (m.type === 'audio.stopped') { clearTimeout(timer); this.dispose(); this.status('idle'); resolve(); }
          else throw new Error('Unknown audio message');
        } catch { clearTimeout(timer); this.fail('Audio protocol error. Start the conversation again.'); reject(new Error('Audio protocol error.')); }
      };
      ws.onerror = fail; ws.onclose = fail;
    });
  }
  private fail(message: string) { this.dispose(); this.status('error', message); }
  async stop() { this.dispose(); }
  dispose() {
    if (this.stopped) return; this.stopped = true; this.ready = false;
    this.stream?.getTracks().forEach(track => { track.onended = null; track.stop(); });
    this.node?.port.postMessage({ type: 'stop' }); this.node?.disconnect(); this.node?.port.close();
    void this.context?.close().catch(() => {});
    if (this.socket?.readyState === 1) this.socket.send(JSON.stringify({ type: 'audio.stop' }));
    this.socket?.close(); this.pendingPlayback = 0;
  }
}
