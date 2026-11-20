import { test, expect } from "bun:test";
import {
  bodyDirection,
  horizontal,
  rad,
  orientation,
  starDirection,
  yearsSinceJ2000,
  equatorial,
  stellarMotion,
  type BodyName,
} from "../src/astro/sky";
import { civilInstants, stepDay, clockAt, presets } from "../src/astro/time";
import { parseStars } from "../src/catalog/catalog";
import starsFixture from "./fixtures/stars.json";
import horizons from "./fixtures/horizons.json";
const bin = await Bun.file(
  new URL("../public/catalog/v1/bright-stars.bin", import.meta.url),
).arrayBuffer();
const stars = parseStars(bin),
  byId = new Map(stars.map((s) => [s.id, s]));
function separation(a: number, b: number, c: number, d: number) {
  const p = horizontal(a, b),
    q = horizontal(c, d);
  return (
    ((2 *
      Math.asin(
        Math.min(1, Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]) / 2),
      )) /
      rad) *
    60
  );
}
test("five geographic cardinal directions and aligned J2000 vectors", () => {
  for (const [az, alt, v] of [
    [0, 0, [0, 0, 1]],
    [90, 0, [1, 0, 0]],
    [180, 0, [0, 0, -1]],
    [270, 0, [-1, 0, 0]],
    [203, 90, [0, 1, 0]],
  ] as const) {
    horizontal(az, alt).forEach((n, i) => expect(n).toBeCloseTo(v[i], 12));
  }
  expect(
    Math.max(
      ...stars.map((s) =>
        Math.abs(Math.hypot(...equatorial(s.raDeg, s.decDeg)) - 1),
      ),
    ),
  ).toBeLessThan(1e-5);
});
test("catalogue and tangent-plane proper motion retain the HYG convention", () => {
  expect(stars.length).toBe(41487);
  const sirius = byId.get(32263)!;
  expect(sirius.raDeg).toBeCloseTo(101.287215, 6);
  expect(sirius.decDeg).toBeCloseTo(-16.716116, 6);
  const g = byId.get(57767)!;
  expect(g.pmRaStarMasPerYear).toBeCloseTo(4003.69, 2);
  const a = g.raDeg * rad,
    pm = stellarMotion(g);
  expect(
    ((-pm[0] * Math.sin(a) + pm[1] * Math.cos(a)) / rad) * 3.6e6,
  ).toBeCloseTo(4003.69, 2);
  expect(sirius.magnitudeV).toBeLessThan(g.magnitudeV);
  expect(() => parseStars(bin.slice(0, -1))).toThrow("Incomplete");
  const corrupt = bin.slice(0);
  new Uint8Array(corrupt)[0] = 0;
  expect(() => parseStars(corrupt)).toThrow("header");
});
test("stellar directions meet two arcminutes against Astropy/ERFA", () => {
  let max = 0,
    n = 0;
  for (const r of starsFixture.rows) {
    if (r.altitudeDeg <= 10) continue;
    const ms = Date.parse(r.instant),
      d = starDirection(
        byId.get(r.id)!,
        orientation(r, ms),
        yearsSinceJ2000(ms),
      );
    max = Math.max(
      max,
      separation(
        d.azimuthDeg,
        d.geometricAltitudeDeg,
        r.azimuthDeg,
        r.altitudeDeg,
      ),
    );
    n++;
  }
  console.log("Astropy above 10°", n, "max arcmin", max);
  expect(max).toBeLessThanOrEqual(2);
});
test("topocentric ephemerides, lunar diameter and phase match NASA Horizons", () => {
  let maxPlanet = 0,
    maxMoon = 0,
    maxPhase = 0,
    n = 0;
  for (const group of horizons)
    for (const row of group.rows) {
      if (row.altitudeDeg <= 10) continue;
      const d = bodyDirection(
        group.name as BodyName,
        group,
        Date.parse(row.instant),
      );
      const err = separation(
        d.azimuthDeg,
        d.geometricAltitudeDeg,
        row.azimuthDeg,
        row.altitudeDeg,
      );
      if (group.name === "Moon") {
        maxMoon = Math.max(maxMoon, err);
        maxPhase = Math.max(
          maxPhase,
          Math.abs(d.illuminatedFraction - row.illuminatedFraction!),
        );
        expect(Math.abs(d.angularDiameterDeg - row.diameterDeg)).toBeLessThan(
          0.001,
        );
      } else maxPlanet = Math.max(maxPlanet, err);
      n++;
    }
  console.log(
    "Horizons above 10°",
    n,
    "max planet, Moon (arcmin), phase",
    maxPlanet,
    maxMoon,
    maxPhase,
  );
  expect(maxPlanet).toBeLessThanOrEqual(2);
  expect(maxMoon).toBeLessThanOrEqual(5);
  expect(maxPhase).toBeLessThan(0.02);
});
test("hemispheres, sidereal rotation and date line", () => {
  const s = byId.get(11734)!,
    ms = Date.UTC(2026, 0, 15, 21);
  const calc = (site: (typeof presets)[number], t: number) =>
    starDirection(s, orientation(site, t), yearsSinceJ2000(t));
  const north = calc(presets[0], ms),
    south = calc(presets[1], ms);
  expect(north.geometricAltitudeDeg).toBeGreaterThan(0);
  expect(south.apparentAltitudeDeg).toBeLessThan(-5);
  const vega = byId.get(90979)!;
  const alt = (lon: number, t: number) =>
    starDirection(
      vega,
      orientation({ ...presets[4], longitudeDeg: lon }, t),
      yearsSinceJ2000(t),
    );
  const early = alt(0, ms),
    later = alt(0, ms + 3600000),
    east = alt(15.041, ms);
  expect(
    separation(
      later.azimuthDeg,
      later.geometricAltitudeDeg,
      east.azimuthDeg,
      east.geometricAltitudeDeg,
    ),
  ).toBeLessThan(0.1);
  expect(
    Math.abs(early.geometricAltitudeDeg - later.geometricAltitudeDeg),
  ).toBeGreaterThan(1);
  expect(
    Math.abs(
      alt(179.9, ms).geometricAltitudeDeg -
        alt(-179.9, ms).geometricAltitudeDeg,
    ),
  ).toBeLessThan(0.21);
});
test("DST, local calendar days and signed simulation time", () => {
  const zone = "Europe/Madrid";
  expect(() => civilInstants("2026-03-29T02:30", zone)).toThrow(
    "does not exist",
  );
  const choices = civilInstants("2026-10-25T02:30", zone);
  expect(choices.map((d) => d.toUTC().toISO())).toEqual([
    "2026-10-25T00:30:00.000Z",
    "2026-10-25T01:30:00.000Z",
  ]);
  const t = Date.parse("2026-03-28T12:00:00Z");
  expect(stepDay(t, zone, 1) - t).toBe(23 * 3600000);
  expect(
    clockAt(
      { anchorUtcMs: t, rate: -60, anchorRealMs: 200, paused: false },
      1200,
    ),
  ).toBe(t - 60000);
});

test("lunar parallax and observer elevation are present", async () => {
  const A = await import("astronomy-engine");
  const g = horizons.find(
    (g) =>
      g.name === "Moon" &&
      g.rows.some((r) => r.altitudeDeg > 10 && r.altitudeDeg < 40),
  )!;
  const r = g.rows.find((r) => r.altitudeDeg > 10 && r.altitudeDeg < 40)!,
    date = new Date(r.instant);
  const observer = new A.Observer(g.latitudeDeg, g.longitudeDeg, g.elevationM);
  const geo = A.RotateVector(
    A.Rotation_EQJ_HOR(date, observer),
    A.GeoVector(A.Body.Moon, date, true),
  );
  const geocentricAltitude = Math.asin(geo.z / geo.Length()) / rad;
  const topo = bodyDirection("Moon", g, +date);
  expect(Math.abs(geocentricAltitude - r.altitudeDeg)).toBeGreaterThan(0.5);
  expect(Math.abs(topo.geometricAltitudeDeg - r.altitudeDeg)).toBeLessThan(
    0.0834,
  );
  expect(
    bodyDirection("Moon", { ...g, elevationM: 5000 }, +date)
      .geometricAltitudeDeg,
  ).not.toBe(topo.geometricAltitudeDeg);
});
test("Gaia tile checksums and 64-bit identifiers survive packing", async () => {
  const { digest } = await import("../src/catalog/catalog"),
    { estimateV } = await import("../src/catalog/gaia");
  const manifest = await Bun.file("public/catalog/gaia/manifest.json").json();
  const ids = new Set<string>();
  for (const t of manifest.tiles) {
    const file = Bun.file("public/catalog/gaia/" + t.file);
    expect(await digest(await file.arrayBuffer())).toBe(t.sha256);
    const rows = await file.json();
    expect(rows.length).toBe(t.count);
    for (const [id] of rows) ids.add(id);
  }
  expect(ids.size).toBe(4446);
  expect(
    [...ids].every(
      (id) =>
        typeof id === "string" && BigInt(id) > BigInt(Number.MAX_SAFE_INTEGER),
    ),
  ).toBe(true);
  expect(estimateV(10, 1)).toBeCloseTo(10.21414, 5);
  expect(estimateV(10, null)).toBeNull();
});
