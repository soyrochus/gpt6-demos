import type { Solid } from "../table/layout";
import { RULES as R } from "../rules/constants";

export interface Contact {
  nx: number;
  ny: number;
  depth: number;
}
// Sweep a circle along a segment against the two straight faces and both
// round ends of a capsule. Keep the earliest entering contact in caller storage.
export function sweptContact(
  s: Solid,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  out: Contact,
) {
  const vx = x1 - x0,
    vy = y1 - y0,
    speed2 = vx * vx + vy * vy;
  if (!speed2) return false;
  const r = s.radius + R.radius,
    dx = s.b.x - s.a.x,
    dy = s.b.y - s.a.y,
    len = Math.hypot(dx, dy);
  let first = Infinity,
    nx = 0,
    ny = 0;
  if (len) {
    const ux = dx / len,
      uy = dy / len,
      offset = (x0 - s.a.x) * -uy + (y0 - s.a.y) * ux;
    const speed = -uy * vx + ux * vy,
      side = offset < 0 ? -1 : 1;
    if (side * speed < 0) {
      const t = (side * r - offset) / speed;
      const along = (x0 + vx * t - s.a.x) * ux + (y0 + vy * t - s.a.y) * uy;
      if (t >= 0 && t <= 1 && along >= 0 && along <= len) {
        first = t;
        nx = -uy * side;
        ny = ux * side;
      }
    }
  }
  for (let i = 0; i < (len ? 2 : 1); i++) {
    const p = i ? s.b : s.a,
      ox = x0 - p.x,
      oy = y0 - p.y,
      b = ox * vx + oy * vy,
      c = ox * ox + oy * oy - r * r;
    const det = b * b - speed2 * c;
    if (b >= 0 || det < 0) continue;
    const t = (-b - Math.sqrt(det)) / speed2;
    if (t >= 0 && t <= 1 && t < first) {
      first = t;
      nx = (ox + t * vx) / r;
      ny = (oy + t * vy) / r;
    }
  }
  if (first === Infinity) return false;
  out.nx = nx;
  out.ny = ny;
  out.depth = Math.max(0, -(vx * nx + vy * ny) * (1 - first));
  return true;
}
