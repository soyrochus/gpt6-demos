import type { Point } from "../table/layout";
// Distance along a visible guide, measured in metres, for constrained ball travel.
export class Track {
  readonly lengths = [0];
  readonly length: number;
  constructor(readonly points: Point[]) {
    for (let i = 1; i < points.length; i++)
      this.lengths.push(
        this.lengths[i - 1] +
          Math.hypot(
            points[i].x - points[i - 1].x,
            points[i].y - points[i - 1].y,
          ),
      );
    this.length = this.lengths[this.lengths.length - 1];
  }
  place(p: Point, d: number, lateral = 0) {
    let i = 1;
    while (i < this.lengths.length - 1 && d > this.lengths[i]) i++;
    const a = this.points[i - 1],
      b = this.points[i],
      t = Math.max(
        0,
        Math.min(
          1,
          (d - this.lengths[i - 1]) / (this.lengths[i] - this.lengths[i - 1]),
        ),
      );
    p.x = a.x + (b.x - a.x) * t + lateral;
    p.y = a.y + (b.y - a.y) * t;
  }
}
