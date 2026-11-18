import * as T from "three";
import type { TableView } from "./scene";
import {
  center,
  crest,
  seat,
  pos,
  solids,
  sensors,
  ramp,
  hyper,
  holes,
  black,
  colors,
  type Point,
} from "../table/layout";
import { RULES as R } from "../rules/constants";
import { playfield } from "./playfield";

export type Indicator = {
  group: string;
  index: number;
  p: Point;
  size: number;
  color: number;
  z: number;
  oval: number;
};
export function buildTable(v: TableView) {
  const lamps: Indicator[] = [];
  function lamp(
    id: string,
    p: Point,
    size: number,
    color: number,
    z = 0.002,
    oval = 1,
  ) {
    const group = id.replace(/\d+$/, ""),
      index = Number(id.slice(group.length));
    lamps.push({ group, index, p, size, color, z, oval });
    v.disc(p, size * 1.28, 0.003, z - 0.0015, "#16232c", 0.52);
  }
  function ring(p: Point, r: number, tube: number, z: number, color: string) {
    v.bake(
      new T.TorusGeometry(r, tube, 8, 46),
      v.mat(color, 0.62),
      p.x,
      p.y,
      z,
    );
  }
  function plate(
    points: Point[],
    z: number,
    h: number,
    color: string,
    solid?: number,
  ) {
    const shape = new T.Shape();
    points.forEach((p, i) =>
      i ? shape.lineTo(p.x, p.y) : shape.moveTo(p.x, p.y),
    );
    shape.closePath();
    const geo = new T.ExtrudeGeometry(shape, {
      depth: h,
      bevelEnabled: true,
      bevelSegments: 2,
      bevelSize: 0.0016,
      bevelThickness: 0.0015,
      curveSegments: 6,
    });
    if (solid !== undefined) {
      geo.translate(0, 0, z);
      const mesh = new T.Mesh(geo, v.mat(color));
      mesh.userData.solid = solid;
      v.slings.push(mesh);
      v.root.add(mesh);
    } else v.bake(geo, v.mat(color), 0, 0, z);
  }
  function ribbon(
    points: Point[],
    width: number,
    z: number,
    color: string,
    stripe = false,
  ) {
    const curve = new T.CatmullRomCurve3(
      points.map((p) => new T.Vector3(p.x, p.y, 0)),
    );
    points = curve.getPoints((points.length - 1) * 5);
    const l: Point[] = [],
      r: Point[] = [];
    for (let i = 0; i < points.length; i++) {
      const a = points[Math.max(0, i - 1)],
        b = points[Math.min(points.length - 1, i + 1)],
        p = points[i];
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      const nx = (b.y - a.y) / len,
        ny = (a.x - b.x) / len;
      l.push({ x: p.x - width * nx, y: p.y - width * ny });
      r.push({ x: p.x + width * nx, y: p.y + width * ny });
    }
    plate([...l, ...r.slice().reverse()], z - 0.005, 0.005, color);
    for (let i = 1; i < l.length; i++) {
      for (const side of [l, r])
        v.rail(
          side[i - 1],
          side[i],
          0.0025,
          z + 0.003,
          stripe ? "#af91ca" : "#788d9b",
        );
      if (stripe && i % 3 === 0)
        for (const t of [0.4]) {
          const mix = (a: Point, b: Point, t: number) => ({
            x: a.x + (b.x - a.x) * t,
            y: a.y + (b.y - a.y) * t,
          });
          const a = mix(l[i - 1], l[i], t),
            b = mix(r[i - 1], r[i], t),
            m = mix(points[i - 1], points[i], t + 0.15);
          v.rail(a, m, 0.002, z + 0.001, "#e3c8f1");
          v.rail(b, m, 0.002, z + 0.001, "#e3c8f1");
        }
    }
  }
  const floor = playfield();
  floor.position.set(0, pos(0, 0.5).y, 0.0001);
  v.root.add(floor);
  const engineDeck = [
    [-0.91, 0.365],
    [-0.74, 0.352],
    [-0.51, 0.408],
    [-0.48, 0.6],
    [-0.65, 0.695],
    [-0.88, 0.65],
    [-0.94, 0.55],
  ].map(([x, y]) => pos(x, y));
  plate(engineDeck, 0.005, 0.008, "#673996");
  ribbon(ramp.slice(0, 7), 0.032, 0.022, "#7845a6", true);
  const returnRail = ramp.slice(6);
  for (let i = 1; i < returnRail.length; i++)
    for (const d of [-0.012, 0.012]) {
      const a = returnRail[i - 1],
        b = returnRail[i];
      v.rail(
        { x: a.x + d, y: a.y },
        { x: b.x + d, y: b.y },
        0.0024,
        0.025,
        "#c7dae2",
      );
    }
  ribbon(hyper, 0.015, 0.008, "#512c4e");
  for (const [index, s] of solids.entries()) {
    const e = s.event;
    if (!e) {
      if (s.a === s.b) v.disc(s.a, R.pegRadius, 0.014, 0.008, "#aebac4", 0.8);
      continue;
    }
    if (e.type === "bumper") {
      const z = e.group === "engine" ? 0.018 : 0.002,
        r = s.radius,
        p = s.a;
      v.disc(p, r * 1.3, 0.008, z + 0.003, "#292036");
      v.disc(
        p,
        r * 1.17,
        0.009,
        z + 0.009,
        e.group === "engine" ? "#5550a4" : "#ac3a45",
      );
      ring(p, r * 1.09, 0.0024, z + 0.015, "#dce2ea");
      const dome = new T.SphereGeometry(r, 32, 18);
      dome.scale(1, 1, 0.49);
      v.bake(dome, v.mat("#f2f5f8", 0.12), p.x, p.y, z + 0.016);
      ring(p, r * 0.61, 0.0027, z + 0.025, "#384970");
      lamp("cap" + index, p, r * 0.47, 0x6598ff, z + 0.026);
      v.disc(p, r * 0.18, 0.002, z + 0.029, "#e6ecf1");
      for (let i = 0; i < 6; i++) {
        const a = (i * Math.PI) / 3,
          q = {
            x: p.x + Math.cos(a) * r * 0.8,
            y: p.y + Math.sin(a) * r * 0.8,
          };
        v.disc(q, 0.0017, 0.001, z + 0.023, "#545166");
      }
    } else if (e.type === "sling") {
      const sgn = e.index ? 1 : -1,
        offset = e.index === 1 ? 0.065 : 0,
        p = [
          pos(sgn * (0.49 - offset), 0.32),
          pos(sgn * (0.53 - offset), 0.175),
          pos(sgn * 0.315, 0.135),
        ];
      plate(p, 0.002, 0.009, "#ad2434", index);
      for (let j = 0; j < 3; j++) {
        v.rail(p[j], p[(j + 1) % 3], 0.0034, 0.013, "#de6563");
        v.disc(p[j], 0.003, 0.003, 0.017, "#d6d9d8", 0.8);
      }
      lamp("flash" + index, pos(sgn * 0.458, 0.205), 0.004, 0xff4e3d, 0.016);
    } else if (e.type === "target") {
      const color = {
        mission: 0xffba39,
        fuel: 0x8aca55,
        hazardL: 0xffdb40,
        hazardR: 0xf6803d,
        warp: 0x8dd3f4,
        medal: 0xf3a84a,
        booster: 0x64a4f1,
        multiplier: 0xd3ba68,
      }[e.bank];
      const frame = new T.Mesh(
        new T.BoxGeometry(0.021, 0.012, 0.01),
        v.mat("#41505c", 0.32),
      );
      frame.position.set(s.a.x, s.a.y, 0.007);
      v.movingTargets.set(index, frame);
      v.root.add(frame);
      lamp("target" + index, s.a, 0.005, color, 0.013, 1.4);
    } else if (e.type === "rebound") {
      v.disc(s.a, 0.01, 0.011, 0.008, "#a63d42");
      ring(s.a, 0.008, 0.0017, 0.015, "#c6cdd1");
    }
  }
  v.disc(center, 0.07, 0.002, 0.001, "#21324b");
  ring(center, 0.067, 0.0015, 0.003, "#3d6e89");
  for (let i = 0; i < R.progressLamps; i++) {
    const a = (2 * Math.PI * i) / R.progressLamps;
    lamp(
      "progress" + i,
      { x: center.x + 0.06 * Math.sin(a), y: center.y + 0.06 * Math.cos(a) },
      0.0051,
      0x39d7ff,
      0.004,
    );
  }
  v.disc(center, 0.047, 0.002, 0.003, "#895024");
  ring(center, 0.044, 0.0018, 0.005, "#e79c55");
  for (let i = 0; i < R.ranks.length; i++) {
    const a = (2 * Math.PI * i) / R.ranks.length;
    lamp(
      "rank" + i,
      { x: center.x + 0.034 * Math.sin(a), y: center.y + 0.034 * Math.cos(a) },
      0.0043,
      0xffc555,
      0.006,
    );
  }
  v.disc(center, 0.024, 0.002, 0.005, "#956520");
  ring(center, 0.02, 0.0018, 0.007, "#ffbc51");
  const star: Point[] = [];
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4,
      r = i % 2 ? 0.005 : 0.017;
    star.push({ x: center.x + r * Math.sin(a), y: center.y + r * Math.cos(a) });
  }
  plate(star, 0.007, 0.001, "#ffda65");
  for (const [i, color] of colors.entries()) {
    const p = holes[color];
    v.disc(p, R.holeRadius * 1.14, 0.003, 0.002, "#111524");
    ring(p, R.holeRadius, 0.003, 0.004, ["#d6a23e", "#bc4047", "#50a077"][i]);
    lamp(
      "hole" + i,
      { x: p.x, y: p.y + 0.023 },
      0.0038,
      [0xffdb54, 0xff645d, 0x6ed788][i],
    );
  }
  v.disc(black, R.holeRadius, 0.004, 0.003, "#0a0a14");
  ring(black, R.holeRadius, 0.0025, 0.005, "#68677d");
  for (const s of sensors) {
    const p = { x: (s.a.x + s.b.x) / 2, y: s.a.y },
      e = s.event;
    if (e.type === "lane") {
      lamp(
        e.lane + e.index,
        p,
        0.0043,
        e.lane === "fuel" ? 0x8fd86f : 0xffdb39,
        e.lane === "fuel" || e.lane === "launch" ? 0.027 : 0.005,
        1.4,
      );
      if (["out", "return", "reentry"].includes(e.lane)) {
        plate(
          [
            { x: p.x, y: p.y - 0.018 },
            { x: p.x - 0.006, y: p.y - 0.004 },
            { x: p.x + 0.006, y: p.y - 0.004 },
          ],
          0.0005,
          0.001,
          "#e9c543",
        );
      }
    } else if (e.type === "spin") {
      const flag = new T.Mesh(
        new T.BoxGeometry(0.021, 0.012, 0.002),
        v.mat("#e9bd63", 0.65),
      );
      flag.position.set(p.x, p.y, 0.016);
      v.spinners[e.index] = flag;
      v.root.add(flag);
      v.rail(
        { x: p.x - 0.013, y: p.y },
        { x: p.x + 0.013, y: p.y },
        0.0026,
        0.016,
        "#ccb277",
      );
    }
  }
  for (let i = 0; i < 3; i++)
    lamp(
      "medal" + i,
      pos(0.36 + i * 0.059, 0.625 + i * 0.025),
      0.0032,
      0xffac4a,
    );
  for (let i = 0; i < 4; i++) {
    lamp("boost" + i, pos(0.35 + i * 0.055, 0.45), 0.003, 0x6dceff);
    lamp("multi" + i, pos(-0.52 + i * 0.055, 0.8), 0.003, 0xdfb763);
  }
  lamp("well", center, 0.0045, 0xc7e1ff, 0.012);
  for (let i = 0; i < 6; i++) {
    const y = seat.y + ((crest.y - seat.y) * (i + 1 - 0.6)) / 6;
    lamp("skill" + i, { x: seat.x, y }, 0.005, 0xffbe52, 0.002);
  }
  for (let i = 0; i < 17; i++) {
    const a = (Math.PI * (i + 0.5)) / 17;
    lamp(
      "arch" + i,
      pos(-0.09 + 0.85 * Math.cos(a), 0.86 + 0.104 * Math.sin(a)),
      0.004,
      0xff5148,
      0.007,
    );
  }
  for (let i = 0; i < 5; i++)
    lamp("hyper" + i, pos(-0.87, 0.69 + i * 0.016), 0.003, 0xde76ef, 0.016);
  for (const [id, x, y, c] of [
    ["save", 0.35, 0.097, 0x7cc9ed],
    ["replay", -0.35, 0.097, 0xedc64f],
    ["foul", 0.64, 0.075, 0xf14439],
    ["reflex", -0.34, 0.51, 0xfe796a],
    ["sensor", -0.74, 0.685, 0xff4838],
  ] as const)
    lamp(id, pos(x, y), 0.004, c, 0.025);
  // The trough is machined into the copper sleeve. Its centre remains open
  // around the seated ball and the six illuminated skill inserts.
  for (const side of [-1, 1]) {
    const x = 0.893 + side * 0.059;
    plate(
      [
        pos(x - side * 0.026, 0.042),
        pos(x + side * 0.021, 0.04),
        pos(x + side * 0.021, 0.89),
        pos(x - side * 0.014, 0.91),
      ],
      0.002,
      0.004,
      "#985c34",
    );
    v.rail(pos(x, 0.075), pos(x, 0.89), 0.003, 0.012, "#d99b58");
  }
  for (let i = 0; i < 8; i++) {
    const y = 0.035 + i * 0.0042;
    v.rail(pos(0.854, y), pos(0.931, y + 0.0025), 0.0015, 0.018, "#776c60");
  }
  for (let i = 0; i < 7; i++) {
    const y = 0.185 + i * 0.107;
    v.rail(
      pos(0.813, y),
      pos(0.97, y + 0.012),
      0.0038,
      0.022,
      i % 2 ? "#d4b754" : "#a77e54",
    );
  }
  for (const side of [-1, 1])
    for (const y of [0.015, 0.985]) {
      const p = pos(side * 0.99, y);
      v.disc(p, 0.0045, 0.002, 0.004, "#b2b3af", 0.85);
    }
  v.flush();
  return lamps;
}
