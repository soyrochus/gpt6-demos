export const AUDIO_PROTOCOL = 'desktop-audio/1';
export const PCM_FORMAT = { encoding: 'pcm16le', sampleRate: 24000, channels: 1 } as const;
export const MAX_FRAME = 4820;
export interface AudioFrame { kind: 1 | 2; generation: number; epoch: number; sequence: number; pcm: Uint8Array }
export function encodeFrame(frame: AudioFrame): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(20 + frame.pcm.byteLength); const view = new DataView(bytes.buffer);
  view.setUint8(0, 1); view.setUint8(1, frame.kind);
  for (const [offset, value] of [[4, frame.generation], [8, frame.epoch], [12, frame.sequence], [16, frame.pcm.byteLength / 2]] as const) {
    if (!Number.isInteger(value) || value < 0 || value > 0xffffffff) throw new Error('Invalid audio counter');
    view.setUint32(offset, value, true);
  }
  bytes.set(frame.pcm, 20); decodeFrame(bytes); return bytes;
}
export function decodeFrame(bytes: Uint8Array): AudioFrame {
  if (bytes.byteLength < 22 || bytes.byteLength > MAX_FRAME) throw new Error('Invalid audio frame length');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const kind = view.getUint8(1), samples = view.getUint32(16, true), epoch = view.getUint32(8, true);
  if (view.getUint8(0) !== 1 || (kind !== 1 && kind !== 2) || view.getUint16(2, true) !== 0 || samples === 0 || samples > 2400 || bytes.length !== 20 + samples * 2 || (kind === 1 && epoch !== 0)) throw new Error('Invalid audio frame');
  return { kind, generation: view.getUint32(4, true), epoch, sequence: view.getUint32(12, true), pcm: bytes.subarray(20) };
}
export type AudioClientMessage = { type: 'audio.hello'; protocol: typeof AUDIO_PROTOCOL; instanceId: string; sessionId: string; token: string } | { type: 'audio.start' } | { type: 'audio.stop' };
export function parseAudioMessage(raw: string): AudioClientMessage {
  if (new TextEncoder().encode(raw).length > 16384) throw new Error('Audio control too large');
  const m = JSON.parse(raw);
  if (!m || Array.isArray(m) || typeof m !== 'object') throw new Error('Invalid audio control');
  const fields = m.type === 'audio.hello' ? ['type', 'protocol', 'instanceId', 'sessionId', 'token'] : ['type'];
  if (Object.keys(m).length !== fields.length || fields.some(k => typeof m[k] !== 'string' || !m[k].length || m[k].length > 256)) throw new Error('Invalid audio control fields');
  if (m.type === 'audio.hello' ? m.protocol !== AUDIO_PROTOCOL : !['audio.start', 'audio.stop'].includes(m.type)) throw new Error('Unknown audio control');
  return m;
}
