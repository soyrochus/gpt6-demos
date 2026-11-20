import * as A from "astronomy-engine";
import type { Star } from "../catalog/catalog";

export interface Observer {
  latitudeDeg: number;
  longitudeDeg: number;
  elevationM: number;
  timeZoneId: string;
  label: string;
  elevationSource: "manual" | "assumed";
}
export type Site = Pick<
  Observer,
  "latitudeDeg" | "longitudeDeg" | "elevationM"
>;
export interface View {
  azimuthDeg: number;
  altitudeDeg: number;
  verticalFovDeg: number;
}
export const rad = Math.PI / 180,
  deg = 1 / rad;
export const clamp = (v: number, min: number, max: number) =>
  Math.min(max, Math.max(min, v));
export const wrap = (az: number) => ((az % 360) + 360) % 360;
export type Vec = [number, number, number];
export const normalize = ([x, y, z]: Vec): Vec => {
  const n = Math.hypot(x, y, z);
  return [x / n, y / n, z / n];
};
export function horizontal(azimuthDeg: number, altitudeDeg: number): Vec {
  const az = azimuthDeg * rad,
    h = altitudeDeg * rad;
  return [Math.cos(h) * Math.sin(az), Math.sin(h), Math.cos(h) * Math.cos(az)];
}
export function equatorial(raDeg: number, decDeg: number): Vec {
  const a = raDeg * rad,
    d = decDeg * rad;
  return [Math.cos(d) * Math.cos(a), Math.cos(d) * Math.sin(a), Math.sin(d)];
}
export function stellarMotion(star: Star): Vec {
  const a = star.raDeg * rad,
    d = star.decDeg * rad,
    ma = ((star.pmRaStarMasPerYear || 0) * rad) / 3.6e6,
    md = ((star.pmDecMasPerYear || 0) * rad) / 3.6e6;
  return [
    -ma * Math.sin(a) - md * Math.sin(d) * Math.cos(a),
    ma * Math.cos(a) - md * Math.sin(d) * Math.sin(a),
    md * Math.cos(d),
  ];
}
export const yearsSinceJ2000 = (ms: number) =>
  (ms - Date.UTC(2000, 0, 1, 12)) / (365.25 * 86400000);
export const siteObserver = (s: Site) =>
  new A.Observer(s.latitudeDeg, s.longitudeDeg, s.elevationM);
export function orientation(site: Site, ms: number) {
  // Astronomy Engine columns are [north, west, up]. Return column-major [east, up, north].
  return A.Rotation_EQJ_HOR(new Date(ms), siteObserver(site)).rot.flatMap(
    ([n, w, u]) => [-w, u, n],
  );
}
export function rotate(m: number[], [x, y, z]: Vec): Vec {
  return [
    m[0] * x + m[3] * y + m[6] * z,
    m[1] * x + m[4] * y + m[7] * z,
    m[2] * x + m[5] * y + m[8] * z,
  ];
}
export function starDirection(star: Star, matrix: number[], years: number) {
  const v = equatorial(star.raDeg, star.decDeg),
    pm = stellarMotion(star);
  const w = rotate(
    matrix,
    normalize([
      v[0] + pm[0] * years,
      v[1] + pm[1] * years,
      v[2] + pm[2] * years,
    ]),
  );
  const alt = Math.asin(clamp(w[1], -1, 1)) * deg;
  return {
    azimuthDeg: wrap(Math.atan2(w[0], w[2]) * deg),
    geometricAltitudeDeg: alt,
    apparentAltitudeDeg: alt + A.Refraction("normal", alt),
  };
}
const radii = {
  Sun: 695700,
  Moon: 1737.4,
  Mercury: 2439.7,
  Venus: 6051.8,
  Mars: 3389.5,
  Jupiter: 69911,
  Saturn: 58232,
  Uranus: 25362,
  Neptune: 24622,
};
export type BodyName = keyof typeof radii;
export const bodyNames = Object.keys(radii) as BodyName[];
export function bodyDirection(name: BodyName, site: Site, ms: number) {
  const date = new Date(ms),
    observer = siteObserver(site),
    body = A.Body[name];
  const eq = A.Equator(body, date, observer, true, true);
  const h = A.Horizon(date, observer, eq.ra, eq.dec);
  const light = A.Illumination(body, date);
  return {
    name,
    azimuthDeg: h.azimuth,
    geometricAltitudeDeg: h.altitude,
    apparentAltitudeDeg: h.altitude + A.Refraction("normal", h.altitude),
    raDeg: eq.ra * 15,
    decDeg: eq.dec,
    magnitudeV: light.mag,
    illuminatedFraction: light.phase_fraction,
    distanceAu: eq.dist,
    angularDiameterDeg:
      2 * Math.asin(radii[name] / (eq.dist * A.KM_PER_AU)) * deg,
  };
}
export const snapshot = (site: Site, ms: number) => ({
  matrix: orientation(site, ms),
  years: yearsSinceJ2000(ms),
  bodies: bodyNames.map((n) => bodyDirection(n, site, ms)),
});
export type Snapshot = ReturnType<typeof snapshot>;
export type Direction = ReturnType<typeof starDirection>;
export const altitude = (d: Direction, refraction: boolean) =>
  refraction ? d.apparentAltitudeDeg : d.geometricAltitudeDeg;
export const compass = (az: number) =>
  ["N", "NE", "E", "SE", "S", "SW", "W", "NW"][Math.round(wrap(az) / 45) % 8];
