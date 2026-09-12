import { Resampler, pcmSample } from './resampler';
declare const sampleRate: number;
declare class AudioWorkletProcessor { port: MessagePort }
declare function registerProcessor(name: string, ctor: typeof AudioWorkletProcessor): void;
class EuropaAudio extends AudioWorkletProcessor {
  private capture = new Resampler(sampleRate, 24000);
  private playback = new Resampler(24000, sampleRate);
  private packet = new ArrayBuffer(960);
  private packetView = new DataView(this.packet);
  private packetAt = 0;
  private pending = 0;
  private active = false;
  private failed = false;
  private ring = new Float32Array(Math.ceil(sampleRate / 2));
  private read = 0; private write = 0; private queued = 0;
  private primed = false; private primeWait = 0;
  constructor() {
    super();
    this.port.onmessage = ({ data }) => {
      if (data.type === 'start') this.active = true;
      else if (data.type === 'ack') this.pending = Math.max(0, this.pending - 1);
      else if (data.type === 'stop') { this.active = false; this.queued = 0; this.primed = false; }
      else if (data.type === 'flush') { this.queued = 0; this.read = this.write = 0; this.primed = false; this.playback = new Resampler(24000, sampleRate); }
      else if (data.type === 'play' && !this.failed) {
        const pcm = new DataView(data.pcm); const values = new Float32Array(pcm.byteLength / 2);
        for (let i = 0; i < values.length; i++) values[i] = pcm.getInt16(i * 2, true) / 32768;
        const samples = this.playback.push(values);
        if (samples.length + this.queued > this.ring.length) { this.fail(); return; }
        for (const sample of samples) { this.ring[this.write] = sample; this.write = (this.write + 1) % this.ring.length; }
        this.queued += samples.length;
        this.port.postMessage({ type: 'played-accepted', samples: values.length });
      }
    };
  }
  private fail() { if (!this.failed) this.port.postMessage({ type: 'error' }); this.failed = true; this.active = false; this.queued = 0; }
  process(inputs: Float32Array[][], outputs: Float32Array[][]) {
    const output = outputs[0]?.[0]; if (!output) return true;
    output.fill(0);
    if (this.failed) return true;
    if (!this.primed && this.queued) { this.primeWait += output.length; if (this.queued >= sampleRate * .04 || this.primeWait >= sampleRate * .06) { this.primed = true; this.primeWait = 0; } }
    if (!this.queued) this.primeWait = 0;
    if (this.primed) for (let i = 0; i < output.length; i++) {
      if (!this.queued) { this.primed = false; break; }
      output[i] = this.ring[this.read]!; this.read = (this.read + 1) % this.ring.length; this.queued--;
    }
    const channels = inputs[0];
    if (this.active && channels?.[0]) {
      const mono = new Float32Array(channels[0].length);
      for (const channel of channels) for (let i = 0; i < mono.length; i++) mono[i]! += channel[i]! / channels.length;
      for (const sample of this.capture.push(mono)) {
        this.packetView.setInt16(this.packetAt++ * 2, pcmSample(sample), true);
        if (this.packetAt === 480) {
          if (++this.pending > 12) { this.fail(); break; }
          this.port.postMessage({ type: 'capture', pcm: this.packet }, [this.packet]);
          this.packet = new ArrayBuffer(960); this.packetView = new DataView(this.packet); this.packetAt = 0;
        }
      }
    }
    return true;
  }
}
registerProcessor('europa-audio', EuropaAudio);
