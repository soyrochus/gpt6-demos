/** Streaming 32-tap windowed-sinc converter. Fractional phase and history survive chunk boundaries. */
export class Resampler {
  private ring = new Float32Array(8192);
  private total = 0;
  private position = 0;
  private ratio: number;
  private table = new Float32Array(1024 * 32);
  constructor(readonly inputRate: number, readonly outputRate: number) {
    if (![inputRate, outputRate].every(n => Number.isFinite(n) && n >= 8000 && n <= 192000)) throw new Error('Unsupported audio sample rate');
    this.ratio = inputRate / outputRate;
    const cutoff = Math.min(1, outputRate / inputRate) * .9;
    for (let phase = 0; phase < 1024; phase++) {
      let sum = 0;
      for (let tap = 0; tap < 32; tap++) {
        const distance = tap - 15 - phase / 1024;
        const sinc = Math.abs(distance) < 1e-8 ? cutoff : Math.sin(Math.PI * cutoff * distance) / (Math.PI * distance);
        const weight = sinc * (.5 + .5 * Math.cos(Math.PI * distance / 16));
        this.table[phase * 32 + tap] = weight; sum += weight;
      }
      for (let tap = 0; tap < 32; tap++) this.table[phase * 32 + tap]! /= sum;
    }
  }
  push(input: Float32Array): Float32Array {
    if (input.length > 4096) throw new Error('Resampler chunk too large');
    for (const value of input) this.ring[this.total++ % this.ring.length] = Number.isFinite(value) ? Math.max(-1, Math.min(1, value)) : 0;
    const output = new Float32Array(Math.max(0, Math.ceil((this.total - 16 - this.position) / this.ratio)));
    let count = 0;
    while (this.position + 16 < this.total) {
      const center = Math.floor(this.position), phase = Math.min(1023, Math.floor((this.position - center) * 1024));
      let sum = 0;
      for (let tap = 0; tap < 32; tap++) { const i = center + tap - 15; if (i >= 0) sum += this.ring[i % this.ring.length]! * this.table[phase * 32 + tap]!; }
      output[count++] = sum; this.position += this.ratio;
    }
    return output.subarray(0, count);
  }
}
export function pcmSample(value: number) { return !Number.isFinite(value) ? 0 : Math.round(Math.max(-1, Math.min(1, value)) * (value < 0 ? 32768 : 32767)); }
