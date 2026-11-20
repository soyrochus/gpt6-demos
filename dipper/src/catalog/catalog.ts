export const headerBytes = 24,
  recordBytes = 36;
export type NameRecord = [
  id: number,
  proper: string,
  hip: string,
  designation: string,
  constellation: string,
  hd: string,
];
export interface Star {
  id: number;
  raDeg: number;
  decDeg: number;
  pmRaStarMasPerYear: number;
  pmDecMasPerYear: number;
  magnitudeV: number;
  colorIndexBV: number;
}
export interface Manifest {
  count: number;
  epoch: number;
  magnitudeLimit: number;
  sha256: string;
  namesSha256: string;
}
export interface Catalogue {
  stars: Star[];
  names: NameRecord[];
  byId: Map<number, Star>;
  manifest: Manifest;
  parseMs: number;
}

export function parseStars(buffer: ArrayBuffer): Star[] {
  const d = new DataView(buffer);
  if (
    d.byteLength < headerBytes ||
    d.getUint32(0) !== 0x534b5931 ||
    d.getUint16(4, true) !== 1 ||
    d.getUint16(6, true) !== recordBytes ||
    d.getUint32(12, true) !== 0 ||
    d.getFloat64(16, true) !== 2000
  )
    throw Error("Unrecognised SKY1 catalogue header.");
  const count = d.getUint32(8, true);
  if (!count || d.byteLength !== headerBytes + count * recordBytes)
    throw Error("Incomplete star catalogue.");
  const result: Star[] = [];
  for (let i = 0; i < count; i++) {
    const p = headerBytes + i * recordBytes;
    const raDeg = d.getFloat64(p + 4, true),
      decDeg = d.getFloat64(p + 12, true),
      magnitudeV = d.getFloat32(p + 28, true);
    if (!(
      raDeg >= 0 &&
      raDeg < 360 &&
      decDeg >= -90 &&
      decDeg <= 90 &&
      Number.isFinite(magnitudeV)
    ))
      throw Error("Invalid catalogue coordinates or magnitude.");
    result.push({
      id: d.getUint32(p, true),
      raDeg,
      decDeg,
      pmRaStarMasPerYear: d.getFloat32(p + 20, true),
      pmDecMasPerYear: d.getFloat32(p + 24, true),
      magnitudeV,
      colorIndexBV: d.getFloat32(p + 32, true),
    });
  }
  return result;
}
export async function digest(buffer: ArrayBuffer) {
  const hash = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(hash), (x) =>
    x.toString(16).padStart(2, "0"),
  ).join("");
}
export async function readAsset(url: string, signal?: AbortSignal) {
  const res = await fetch(import.meta.env.BASE_URL + url, { signal });
  if (!res.ok) throw Error(`Could not load ${url} (HTTP ${res.status}).`);
  return res;
}
export async function loadCatalogue(signal?: AbortSignal): Promise<Catalogue> {
  const path = "catalog/v1/";
  const [manifest, bin, labels] = await Promise.all([
    readAsset(path + "manifest.json", signal).then(
      (r) => r.json() as Promise<Manifest>,
    ),
    readAsset(path + "bright-stars.bin", signal).then((r) => r.arrayBuffer()),
    readAsset(path + "bright-names.json", signal).then((r) => r.arrayBuffer()),
  ]);
  if (
    (await digest(bin)) !== manifest.sha256 ||
    (await digest(labels)) !== manifest.namesSha256
  )
    throw Error("Star catalogue checksum mismatch.");
  const start = performance.now(),
    stars = parseStars(bin);
  const names: NameRecord[] = JSON.parse(new TextDecoder().decode(labels));
  if (stars.length !== manifest.count || stars.length !== names.length)
    throw Error("Mismatched catalogue and index.");
  return {
    stars,
    names,
    byId: new Map(stars.map((s) => [s.id, s])),
    manifest,
    parseMs: performance.now() - start,
  };
}
export const starName = (n: NameRecord) =>
  n[1] || n[3] || (n[2] ? "HIP " + n[2] : "HYG " + n[0]);
