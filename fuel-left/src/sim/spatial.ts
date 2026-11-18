import { RULES as R } from "../rules/constants";
import type { Solid } from "../table/layout";
export class SpatialGrid {
  private cells = new Map<number, number[]>();
  constructor(shapes: Solid[]) {
    shapes.forEach(({ a, b, radius }, i) => {
      const pad = radius + R.radius * 1.5;
      for (
        let x = Math.floor((Math.min(a.x, b.x) - pad) / R.grid);
        x <= Math.floor((Math.max(a.x, b.x) + pad) / R.grid);
        x++
      ) {
        for (
          let y = Math.floor((Math.min(a.y, b.y) - pad) / R.grid);
          y <= Math.floor((Math.max(a.y, b.y) + pad) / R.grid);
          y++
        ) {
          const key = x * 1024 + y,
            cell = this.cells.get(key);
          if (cell) cell.push(i);
          else this.cells.set(key, [i]);
        }
      }
    });
  }
  at(x: number, y: number) {
    return this.cells.get(
      Math.floor(x / R.grid) * 1024 + Math.floor(y / R.grid),
    );
  }
}
