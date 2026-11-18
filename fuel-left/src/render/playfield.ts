import * as T from "three";
import { mulberry32, RULES as R } from "../rules/constants";

// Original screen-printed artwork in the coordinate system of the playfield.
export function playfield() {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 2048;
  const c = canvas.getContext("2d")!,
    w = canvas.width,
    h = canvas.height,
    rnd = mulberry32(9942);
  const X = (x: number) => ((1 + x) * w) / 2,
    Y = (y: number) => (1 - y) * h;
  function polygon(
    points: number[][],
    fill: string,
    stroke?: string,
    weight = 2,
  ) {
    c.beginPath();
    points.forEach(([x, y], i) =>
      i ? c.lineTo(X(x), Y(y)) : c.moveTo(X(x), Y(y)),
    );
    c.closePath();
    c.fillStyle = fill;
    c.fill();
    if (stroke) {
      c.lineWidth = weight;
      c.strokeStyle = stroke;
      c.stroke();
    }
  }
  function label(
    x: number,
    y: number,
    s: string,
    size: number,
    color: string,
    angle = 0,
  ) {
    c.save();
    c.translate(X(x), Y(y));
    c.rotate(angle);
    c.fillStyle = color;
    c.textAlign = "center";
    c.font = "bold " + size + "px monospace";
    c.fillText(s, 0, 0);
    c.restore();
  }
  const bg = c.createLinearGradient(0, h, w, 0);
  bg.addColorStop(0, "#120f38");
  bg.addColorStop(0.38, "#152447");
  bg.addColorStop(0.72, "#0a1734");
  bg.addColorStop(1, "#202e51");
  c.fillStyle = bg;
  c.fillRect(0, 0, w, h);
  for (let i = 0; i < 1450; i++) {
    const x = rnd() * w,
      y = rnd() * h,
      r = 0.4 + rnd() ** 5 * 2.7;
    c.globalAlpha = 0.2 + rnd() * 0.62;
    c.fillStyle = rnd() > 0.5 ? "#b3e8f4" : "#d8dfee";
    c.fillRect(x, y, r, r);
    if (r > 2.8) {
      c.fillRect(x - 4, y + 1, 10, 1);
      c.fillRect(x + 1, y - 4, 1, 10);
    }
  }
  c.globalAlpha = 1;
  function crack(
    x: number,
    y: number,
    a: number,
    steps: number,
    weight: number,
  ) {
    c.beginPath();
    c.moveTo(x, y);
    let branchX = x,
      branchY = y;
    for (let j = 0; j < steps; j++) {
      a += (rnd() - 0.5) * 1.22;
      const len = 12 + rnd() * 25;
      x += Math.cos(a) * len;
      y += Math.sin(a) * len;
      c.lineTo(x, y);
      if (j === 3) {
        branchX = x;
        branchY = y;
      }
    }
    c.lineWidth = weight;
    c.strokeStyle = weight > 2 ? "#286377" : "#204860";
    c.stroke();
    if (weight > 2) crack(branchX, branchY, a + 0.9, 8, 1.7);
  }
  for (let i = 0; i < 79; i++)
    crack(
      rnd() * w,
      rnd() * h,
      rnd() * 6.28,
      5 + Math.floor(rnd() * 8),
      1 + rnd() * 2,
    );
  // Engraved orbital arcs and registration marks around the rank instrument.
  const cx = X(0.02),
    cy = Y(0.46);
  for (let i = 0; i < 7; i++) {
    c.beginPath();
    c.ellipse(
      cx,
      cy,
      110 + i * 22,
      116 + i * 22,
      -0.35,
      -0.9 + i * 0.14,
      3.9 + i * 0.07,
    );
    c.strokeStyle = i % 2 ? "#435d7b" : "#253750";
    c.lineWidth = i % 3 === 0 ? 4 : 2;
    c.stroke();
  }
  for (let i = 0; i < 72; i++) {
    const a = (i * Math.PI) / 36,
      r = 161;
    c.beginPath();
    c.moveTo(cx + r * Math.sin(a), cy + r * Math.cos(a));
    c.lineTo(
      cx + (r + (i % 3 ? 5 : 12)) * Math.sin(a),
      cy + (r + (i % 3 ? 5 : 12)) * Math.cos(a),
    );
    c.lineWidth = 2;
    c.strokeStyle = "#7195ad";
    c.stroke();
  }
  // A pair of hand-plotted interceptors are printed into the lacquer.
  function ship(x: number, y: number, s: number, turn: number) {
    c.save();
    c.translate(X(x), Y(y));
    c.rotate(turn);
    c.scale(s, s);
    function facet(points: number[][], fill: string) {
      c.beginPath();
      points.forEach(([a, b], i) => (i ? c.lineTo(a, b) : c.moveTo(a, b)));
      c.closePath();
      c.fillStyle = fill;
      c.fill();
      c.strokeStyle = "#121c32";
      c.lineWidth = 4;
      c.stroke();
    }
    facet(
      [
        [0, -100],
        [17, -26],
        [61, 52],
        [24, 39],
        [11, 66],
        [-10, 66],
        [-26, 38],
        [-62, 52],
        [-16, -27],
      ],
      "#c38a5c",
    );
    facet(
      [
        [0, -100],
        [-4, 15],
        [-26, 38],
        [-62, 52],
        [-16, -27],
      ],
      "#cedce1",
    );
    facet(
      [
        [0, -64],
        [12, 10],
        [0, 27],
        [-10, 8],
      ],
      "#385a81",
    );
    facet(
      [
        [-59, 52],
        [-14, 23],
        [-21, 44],
      ],
      "#bb4543",
    );
    facet(
      [
        [59, 52],
        [13, 25],
        [22, 44],
      ],
      "#dd503d",
    );
    facet(
      [
        [-7, 68],
        [1, 107],
        [9, 66],
      ],
      "#eaa359",
    );
    c.restore();
  }
  ship(-0.24, 0.6, 1, -0.69);
  ship(0.4, 0.505, 1.1, 0.54);
  for (let i = 0; i < 13; i++) {
    const a = Math.PI + (i * Math.PI) / 12;
    const b = a + 0.095;
    polygon(
      [
        [0, 0.028],
        [0.83 * Math.cos(a), 0.03 - 0.3 * Math.sin(a)],
        [0.55 * Math.cos(b), 0.03 - 0.23 * Math.sin(b)],
      ],
      i % 2 ? "#673c8c" : "#492b73",
    );
  }
  for (const s of [-1, 1]) {
    polygon(
      [
        [s * 0.96, 0.02],
        [s * 0.85, 0.114],
        [s * 0.36, 0.026],
        [s * 0.15, 0.003],
      ],
      "#1b2434",
      "#79808a",
      4,
    );
    polygon(
      [
        [s * 0.8, 0.092],
        [s * 0.74, 0.085],
        [s * 0.39, 0.032],
        [s * 0.45, 0.033],
      ],
      "#b7453e",
    );
    for (let i = 0; i < 3; i++)
      polygon(
        [
          [s * (0.26 + i * 0.026), 0.346 + i * 0.022],
          [s * (0.25 + i * 0.026), 0.363 + i * 0.022],
          [s * (0.2 + i * 0.026), 0.349 + i * 0.022],
        ],
        "#d6a733",
      );
  }
  label(0, 0.935, "F U E L   L E F T", 22, "#ddcfa8");
  label(0.02, 0.347, "R A N K   O R B I T", 14, "#b1cbd3");
  label(0.45, 0.395, "BOOSTER", 12, "#e6be8a");
  label(-0.44, 0.302, "MISSIONS", 13, "#e4daed");
  label(-0.87, 0.49, "F U E L", 13, "#d3dcaa", -Math.PI / 2);
  label(0.9, 0.48, "D E P L O Y M E N T", 16, "#d5ab78", -Math.PI / 2);
  label(0, 0.016, "F U E L   L E F T", 19, "#dfd7cd");
  const texture = new T.CanvasTexture(canvas);
  texture.colorSpace = T.SRGBColorSpace;
  texture.anisotropy = 4;
  const m = new T.MeshStandardMaterial({
    map: texture,
    roughness: 0.72,
    metalness: 0.04,
    envMapIntensity: 0.075,
    emissiveMap: texture,
    emissive: 0x0a3a55,
    emissiveIntensity: 0.4,
  });
  return new T.Mesh(new T.PlaneGeometry(R.width, R.length), m);
}
