import type { Cue } from "../rules/game";

export class AudioDesk {
  sound = true;
  music = false;
  private context?: AudioContext;
  private effects?: GainNode;
  private musicGain?: GainNode;
  private noise?: AudioBuffer;
  private spring?: AudioBufferSourceNode;
  private nextBeat = 0;
  private beat = 0;
  unlock() {
    if (!this.context) {
      try {
        this.context = new AudioContext();
      } catch {
        return;
      }
      const c = this.context,
        master = c.createGain();
      master.gain.value = 0.4;
      master.connect(c.destination);
      this.effects = c.createGain();
      this.effects.gain.value = this.sound ? 1 : 0;
      this.effects.connect(master);
      this.musicGain = c.createGain();
      this.musicGain.gain.value = this.music ? 0.14 : 0;
      this.musicGain.connect(master);
      this.noise = c.createBuffer(1, c.sampleRate, c.sampleRate);
      const data = this.noise.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    }
    if (this.context.state === "suspended")
      void this.context.resume().catch(() => {});
  }
  setSound(on: boolean) {
    this.sound = on;
    if (this.effects) this.effects.gain.value = on ? 1 : 0;
  }
  setMusic(on: boolean) {
    this.music = on;
    const c = this.context;
    if (!c || !this.musicGain) return;
    this.musicGain.gain.cancelScheduledValues(c.currentTime);
    this.musicGain.gain.setTargetAtTime(on ? 0.14 : 0, c.currentTime, 0.045);
    if (on) {
      this.nextBeat = c.currentTime;
      this.beat = 0;
    }
  }
  private tone(
    freq: number,
    duration: number,
    wave: OscillatorType,
    vol: number,
    delay = 0,
    end = freq,
    pan = 0,
    music = false,
  ) {
    const c = this.context;
    if (!c) return;
    const t = c.currentTime + delay,
      o = c.createOscillator(),
      g = c.createGain(),
      p = c.createStereoPanner();
    o.type = wave;
    o.frequency.setValueAtTime(freq, t);
    o.frequency.exponentialRampToValueAtTime(end, t + duration);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    p.pan.value = Math.max(-1, Math.min(1, pan));
    o.connect(g)
      .connect(p)
      .connect((music ? this.musicGain : this.effects)!);
    o.onended = () => {
      o.disconnect();
      g.disconnect();
      p.disconnect();
    };
    o.start(t);
    o.stop(t + duration);
  }
  private hiss(freq: number, duration: number, vol: number, end = freq) {
    const c = this.context;
    if (!c || !this.noise) return;
    const s = c.createBufferSource(),
      g = c.createGain(),
      f = c.createBiquadFilter();
    s.buffer = this.noise;
    f.type = "bandpass";
    f.frequency.setValueAtTime(freq, c.currentTime);
    f.frequency.exponentialRampToValueAtTime(end, c.currentTime + duration);
    g.gain.setValueAtTime(vol, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + duration);
    s.connect(f).connect(g).connect(this.effects!);
    s.onended = () => {
      s.disconnect();
      f.disconnect();
      g.disconnect();
    };
    s.start();
    s.stop(c.currentTime + duration);
  }
  releaseSpring() {
    if (this.spring) {
      this.spring.stop();
      this.spring = undefined;
    }
  }
  play(cue: Cue, x = 0, level = 0) {
    const c = this.context;
    if (!c) return;
    if (cue === "plunge" || cue === "tilt") this.releaseSpring();
    if (!this.sound) return;
    switch (cue) {
      case "charge": {
        this.releaseSpring();
        const s = c.createBufferSource(),
          f = c.createBiquadFilter(),
          g = c.createGain();
        s.buffer = this.noise!;
        s.loop = true;
        f.type = "bandpass";
        f.frequency.setValueAtTime(200, c.currentTime);
        f.frequency.exponentialRampToValueAtTime(1700, c.currentTime + 0.9);
        g.gain.value = 0.075;
        s.connect(f).connect(g).connect(this.effects!);
        s.onended = () => {
          s.disconnect();
          f.disconnect();
          g.disconnect();
        };
        s.start();
        this.spring = s;
        break;
      }
      case "up":
      case "down":
        this.hiss(cue === "up" ? 1800 : 1200, 0.008, 0.6);
        this.tone(cue === "up" ? 120 : 85, 0.03, "sine", 0.42);
        break;
      case "bumper":
        this.tone([180, 220, 270, 330][level], 0.04, "square", 0.24, 0, 130, x);
        break;
      case "sling":
        this.hiss(800, 0.05, 0.85);
        break;
      case "target":
      case "plunge":
        this.tone(2000, 0.02, "sine", 0.35, 0, 800);
        break;
      case "spin":
        for (let i = 0; i < level; i++)
          this.tone(1000, 0.014, "sine", 0.24, i * 0.025);
        break;
      case "ramp":
        this.hiss(390, 0.3, 0.42, 2900);
        break;
      case "hole":
      case "drain":
        this.tone(
          cue === "hole" ? 400 : 300,
          0.4,
          "sine",
          0.5,
          0,
          cue === "hole" ? 90 : 80,
        );
        break;
      case "tilt":
        this.tone(70, 0.25, "sawtooth", 0.36);
        break;
      case "accept":
      case "rank":
      case "complete":
      case "jackpot": {
        const ns = cue === "accept" ? [0, 7] : [0, 4, 7, 12];
        ns.forEach((n, i) => {
          const f = (cue === "rank" ? 330 : 220) * 2 ** (n / 12);
          this.tone(f, 0.15, "triangle", 0.43, i * 0.12);
          if (cue === "jackpot") this.tone(f / 2, 0.15, "sine", 0.35, i * 0.12);
        });
        break;
      }
    }
  }
  update(paused: boolean) {
    const c = this.context;
    if (!this.music || !c || paused || c.state !== "running") return;
    if (this.nextBeat < c.currentTime) this.nextBeat = c.currentTime;
    const roots = [220, 174.614, 196, 164.814],
      intervals = [0, 7, 12, 3, 7, 15, 10, 7];
    while (this.nextBeat < c.currentTime + 0.12) {
      const root = roots[Math.floor(this.beat / 8) % roots.length],
        delay = this.nextBeat - c.currentTime;
      this.tone(
        root * 2 ** (intervals[this.beat % 8] / 12),
        0.24,
        "square",
        0.22,
        delay,
        root * 2 ** (intervals[this.beat % 8] / 12),
        0,
        true,
      );
      if (this.beat % 8 === 0)
        this.tone(root / 2, 1.16, "sine", 0.45, delay, root / 2, 0, true);
      this.beat++;
      this.nextBeat += 60 / 100 / 4;
    }
  }
}
