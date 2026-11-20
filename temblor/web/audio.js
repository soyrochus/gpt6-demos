// SPDX-License-Identifier: GPL-2.0-or-later
// Short game-owned oscillator envelopes. No media/network access.
export class ArenaAudio {
  async unlock() {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.connect(this.ctx.destination);
    }
    await this.ctx.resume();
  }
  async prepare(speakers, pack) {
    if (!this.ctx) return [];
    const buffers = new Map();
    for (const { file } of speakers)
      if (!buffers.has(file))
        buffers.set(
          file,
          await this.ctx.decodeAudioData(pack.sound(file).buffer),
        );
    return speakers
      .filter((s) => s.flags & 1)
      .map((s) => ({ ...s, buffer: buffers.get(s.file) }));
  }
  replace(sounds) {
    for (const s of this.loops ?? []) {
      s.source.stop();
      s.source.disconnect();
      s.gain.disconnect();
      s.pan.disconnect();
    }
    this.loops = sounds.map((s) => {
      const ctx = this.ctx,
        source = ctx.createBufferSource(),
        gain = ctx.createGain(),
        pan = ctx.createStereoPanner();
      source.buffer = s.buffer;
      source.loop = true;
      gain.gain.value = 0;
      source.connect(gain).connect(pan).connect(this.master);
      source.start();
      return { ...s, source, gain, pan };
    });
  }
  position(state, volume) {
    for (const s of this.loops ?? []) {
      const dx = s.pos[0] - state.pos[0],
        dy = s.pos[1] - state.pos[1],
        dz = s.pos[2] - state.pos[2],
        d = Math.hypot(dx, dy, dz);
      s.gain.gain.value = volume * 0.1 * Math.max(0, 1 - d / 660) ** 2;
      s.pan.pan.value = Math.max(
        -1,
        Math.min(
          1,
          (dx * Math.sin(state.yaw) - dy * Math.cos(state.yaw)) /
            Math.max(d, 32),
        ),
      );
    }
  }
  pause() {
    for (const oscillator of this.cues ?? []) {
      oscillator.disconnect();
      oscillator.stop();
    }
    this.cues?.clear();
    if (this.ctx?.state === "running") this.ctx.suspend().catch(() => {});
  }
  play(e, s, level) {
    if (!this.ctx || this.ctx.state !== "running") return;
    const [dx, dy, dz] = e.pos.map((n, i) => n - s.pos[i]);
    const distance = Math.hypot(dx, dy, dz);
    const cues = {
      shot: [e.detail === "Rocket launcher" ? 100 : 170, 35, 0.092, "sawtooth"],
      impact: [135, 45, 0.055, "triangle"],
      pickup: [540, 940, 0.115, "sine"],
      pain: [138, 85, 0.11, "square"],
      death: [175, 36, 0.32, "sawtooth"],
      respawn: [260, 620, 0.25, "triangle"],
      "jump pad": [180, 720, 0.21, "sine"],
      intermission: [440, 880, 0.48, "triangle"],
    };
    const cue = cues[e.kind];
    if (!cue || !level) return;
    const [start, end, len, wave] = cue,
      ctx = this.ctx,
      t = ctx.currentTime;
    const osc = ctx.createOscillator(),
      gain = ctx.createGain(),
      pan = ctx.createStereoPanner();
    osc.type = wave;
    osc.frequency.setValueAtTime(start, t);
    osc.frequency.exponentialRampToValueAtTime(end, t + len);
    pan.pan.value = Math.max(
      -1,
      Math.min(
        1,
        (dx * Math.sin(s.yaw) - dy * Math.cos(s.yaw)) / Math.max(distance, 50),
      ),
    );
    gain.gain.setValueAtTime(
      Math.max(0.00012, (0.13 * level) / (1 + distance / 360)),
      t,
    );
    gain.gain.exponentialRampToValueAtTime(0.0001, t + len);
    osc.connect(gain).connect(pan).connect(this.master);
    (this.cues ??= new Set()).add(osc);
    osc.onended = () => {
      this.cues.delete(osc);
      osc.disconnect();
      gain.disconnect();
      pan.disconnect();
    };
    osc.start(t);
    osc.stop(t + len);
  }
}
