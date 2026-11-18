import { RULES as R } from "../rules/constants";

export type Layer = "main" | "ramp" | "plunger" | "hyper" | "captured";
export interface Point {
  x: number;
  y: number;
}
export const pos = (x: number, y: number): Point => ({
  x: (x * R.width) / 2,
  y: (y - R.pivotLine) * R.length,
});
export const seat = pos(0.893, 0.095);
export const crest = pos(0.893, 0.93);
export const center = pos(0.02, 0.46);
export const ramp = [
  [-0.13, 0.355],
  [-0.22, 0.418],
  [-0.45, 0.47],
  [-0.73, 0.53],
  [-0.78, 0.63],
  [-0.66, 0.7],
  [-0.39, 0.765],
  [-0.47, 0.85],
  [-0.27, 0.921],
  [0.09, 0.931],
  [0.29, 0.89],
].map(([x, y]) => pos(x, y));
export const hyper = [
  [-0.26, 0.444],
  [-0.53, 0.53],
  [-0.83, 0.64],
  [-0.83, 0.735],
].map(([x, y]) => pos(x, y));
export type Bank =
  | "mission"
  | "fuel"
  | "hazardL"
  | "hazardR"
  | "warp"
  | "medal"
  | "booster"
  | "multiplier";
export type Lane =
  "reentry" | "launch" | "return" | "out" | "bonus" | "fuel" | "warp" | "extra";
export type Color = "yellow" | "red" | "green";
export const colors: readonly Color[] = ["yellow", "red", "green"];
export type Event =
  | { type: "bumper"; group: "attack" | "satellite" | "engine"; index: number }
  | { type: "target"; bank: Bank; index: number }
  | { type: "lane"; lane: Lane; index: number }
  | { type: "spin"; count: number; index: number }
  | { type: "sling" | "rebound"; index: number }
  | { type: "hole"; color: Color }
  | { type: "deploy"; highest: number; crest: boolean }
  | {
      type: "rampSensor" | "hyper" | "hyperEject" | "black" | "well" | "drain";
    };
export interface Solid {
  a: Point;
  b: Point;
  radius: number;
  bounce: number;
  layer: Layer;
  event?: Event;
  downGate?: boolean;
}
export interface Sensor {
  a: Point;
  b: Point;
  layer: Layer;
  event: Event;
  direction: number;
}
export const solids: Solid[] = [];
export const sensors: Sensor[] = [];
function wall(
  a: Point,
  b: Point,
  radius = 0.002,
  bounce: number = R.wall,
  layer: Layer = "main",
  event?: Event,
  downGate = false,
) {
  solids.push({ a, b, radius, bounce, layer, event, downGate });
}
const line = (
  x: number,
  y: number,
  u: number,
  v: number,
  bounce: number = R.wall,
) => wall(pos(x, y), pos(u, v), 0.002, bounce);
line(-0.97, 0, -0.97, 0.86);
line(0.79, 0, 0.79, 0.86);
let last = pos(0.79, 0.86);
for (let i = 1; i <= 22; i++) {
  const t = (Math.PI * i) / 22,
    next = pos(-0.09 + 0.88 * Math.cos(t), 0.86 + 0.125 * Math.sin(t));
  wall(last, next);
  last = next;
}
for (const side of [-1, 1]) {
  const edge = side === -1 ? 0.95 : 0.77;
  const divider = side * (edge - 0.13);
  line(divider, 0.29, divider, 0.1, R.outlaneWall);
  line(divider, 0.1, side * (edge - 0.2), 0.015, R.outlaneWall);
  wall(
    pos(divider, 0.27),
    pos(side * (edge - 0.29), 0.265),
    0.001,
    R.rubber,
    "main",
    undefined,
    true,
  );
  wall(
    pos(divider, 0.1),
    { x: side * (R.pivot + 0.012), y: -0.003 },
    0.004,
    R.rubber,
  );
}
export function addDevices() {
  for (const [i, side] of [-1, 1].entries()) {
    const offset = side === 1 ? 0.065 : 0;
    const top = pos(side * (0.49 - offset), 0.32),
      outer = pos(side * (0.53 - offset), 0.175),
      inner = pos(side * 0.315, 0.135);
    wall(top, outer, 0.004, R.rubber);
    wall(outer, inner, 0.004, R.rubber);
    wall(inner, top, 0.004, R.rubber, "main", { type: "sling", index: i });
    for (const p of [top, outer]) wall(p, p, R.pegRadius, R.rubber);
    const rebound = pos(side * 0.24, 0.686);
    wall(rebound, rebound, R.pegRadius, R.rubber, "main", {
      type: "rebound",
      index: i,
    });
  }
  for (const [i, [x, y]] of [
    [-0.18, 0.78],
    [0.18, 0.78],
    [0, 0.7],
    [-0.72, 0.86],
    [-0.62, 0.4],
    [-0.62, 0.5],
    [-0.62, 0.6],
  ].entries()) {
    const p = pos(x, y),
      engine = i >= 4;
    wall(
      p,
      p,
      engine ? R.engineRadius : R.attackRadius,
      R.wall,
      engine ? "ramp" : "main",
      {
        type: "bumper",
        group: engine ? "engine" : i === 3 ? "satellite" : "attack",
        index: i,
      },
    );
  }
  const banks: [Bank, number, number, number, number][] = [
    ["mission", -0.4, 0.405, 0.006, -0.033],
    ["fuel", -0.8, 0.82, 0.105, 0.014],
    ["hazardL", -0.72, 0.73, 0.085, 0.012],
    ["hazardR", 0.41, 0.83, 0.095, 0.014],
    ["warp", 0.05, 0.88, 0, 0],
    ["multiplier", -0.56, 0.77, 0.085, 0.012],
    ["medal", 0.41, 0.62, 0.06, 0.026],
    ["booster", 0.33, 0.43, 0.096, -0.011],
  ];
  for (const [bank, x, y, dx, dy] of banks) {
    for (let i = 0; i < (bank === "warp" ? 1 : 3); i++) {
      const p = pos(x + i * dx, y + i * dy);
      wall(
        p,
        p,
        bank === "mission" ||
          bank === "warp" ||
          bank.startsWith("hazard") ||
          bank === "fuel"
          ? R.targetRadius
          : 0.009,
        R.spotBounce,
        "main",
        { type: "target", bank, index: i },
      );
    }
  }
  const sense = (
    x: number,
    y: number,
    w: number,
    event: Event,
    layer: Layer = "main",
    direction = -1,
  ) =>
    sensors.push({
      a: pos(x - w / 2, y),
      b: pos(x + w / 2, y),
      event,
      layer,
      direction,
    });
  for (let i = 0; i < 3; i++) {
    sense(-0.28 + i * 0.245, 0.885, 0.225, {
      type: "lane",
      lane: "reentry",
      index: i,
    });
    sense(
      -0.75 + i * 0.12,
      0.665,
      0.12,
      { type: "lane", lane: "launch", index: i },
      "ramp",
      1,
    );
  }
  for (let i = 0; i < 2; i++) {
    const x = i === 0 ? -0.885 : 0.705;
    sense(x, 0.14, 0.175, { type: "lane", lane: "extra", index: i });
    sense(x, 0.11, 0.18, { type: "lane", lane: "out", index: i });
    sense(i === 0 ? -0.695 : 0.515, 0.14, 0.17, {
      type: "lane",
      lane: "return",
      index: i,
    });
  }
  for (let i = 0; i < R.fuelSeconds.length; i++)
    sense(
      -0.875,
      0.4 + i * 0.053,
      0.19,
      { type: "lane", lane: "fuel", index: i },
      "main",
      0,
    );
  sense(0.24, 0.806, 0.17, { type: "lane", lane: "warp", index: 0 }, "main", 0);
  sense(-0.875, 0.355, 0.2, { type: "spin", count: 1, index: 0 }, "main", 0);
  sense(-0.48, 0.48, 0.22, { type: "spin", count: 1, index: 1 }, "hyper", 1);
}
export const holes = {
  yellow: pos(-0.55, 0.555),
  red: pos(0.62, 0.535),
  green: pos(-0.28, 0.825),
};
export const black = pos(-0.33, 0.5);
export const dropBank = (bank: Bank) =>
  bank === "medal" || bank === "booster" || bank === "multiplier";
addDevices();
export const skillGateY = pos(0, R.skillGate).y;
export const leftFeed = pos(-0.875, 0.34);
export const rightFeed = pos(0.52, 0.82);
export const deckMouth = pos(-0.62, 0.35);
export const deckCrest = pos(-0.62, 0.689);
