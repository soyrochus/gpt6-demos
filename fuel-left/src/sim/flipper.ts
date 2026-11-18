import { RULES as R } from "../rules/constants";
export class Flipper {
  progress = 0;
  angle = 0;
  previous = 0;
  omega = 0;
  down = false;
  readonly x: number;
  tipX = 0;
  tipY = 0;
  constructor(readonly side: number) {
    this.x = side * R.pivot;
    this.update(0);
    this.previous = this.angle;
  }
  update(dt: number) {
    const last = this.angle;
    this.progress = Math.max(
      0,
      Math.min(1, this.progress + (this.down ? dt / R.rise : -dt / R.fall)),
    );
    const a = R.rest + (R.sweep * (1 - Math.cos(Math.PI * this.progress))) / 2;
    this.angle = this.side < 0 ? a : Math.PI - a;
    this.tipX = this.x + Math.cos(this.angle) * R.batLength;
    this.tipY = Math.sin(this.angle) * R.batLength;
    this.omega = dt ? (this.angle - last) / dt : 0;
  }
}
