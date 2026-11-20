import { createReadStream } from "node:fs";
import { mkdir, rename } from "node:fs/promises";
import { parse } from "csv-parse";
import {
  headerBytes,
  recordBytes,
  type NameRecord,
} from "../src/catalog/catalog";

const revision = "c7f7f883fe678cc7680169a50ccd7dcc49b060ce";
const url = `https://raw.githubusercontent.com/astronexus/HYG-Database/${revision}/hyg/CURRENT/hygdata_v41.csv`;
const checksum =
  "d9f69fd86bbf90a4e4d52b4c5c53eacfa6dfc0bfdef85bfd94f095e0bebe4ebd";
const sha = (data: Uint8Array | string) =>
  new Bun.CryptoHasher("sha256").update(data).digest("hex");
const file = Bun.argv[2] || ".cache/hygdata_v41.csv";
if (!(await Bun.file(file).exists())) {
  if (Bun.argv[2])
    throw Error("Supplied HYG v4.1 file does not exist: " + file);
  console.log("Downloading pinned HYG v4.1 …");
  await mkdir(".cache", { recursive: true });
  const response = await fetch(url).catch(() => {
    throw Error(
      "Download unavailable. Supply the official CSV: bun run catalog:build /path/to/hygdata_v41.csv",
    );
  });
  if (!response.ok) throw Error(`HYG download failed (${response.status}).`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (sha(bytes) !== checksum) throw Error("Upstream HYG checksum mismatch.");
  await Bun.write(file, bytes);
}
if (sha(new Uint8Array(await Bun.file(file).arrayBuffer())) !== checksum)
  throw Error("Source checksum differs from pinned HYG v4.1.");
const cutoff = Number(process.env.HYG_MAG_LIMIT || 8);
if (!Number.isFinite(cutoff)) throw Error("Invalid HYG_MAG_LIMIT.");
const records: number[][] = [],
  names: NameRecord[] = [];
const skipped = { sun: 0, invalid: 0, faint: 0 };
const required = "id hip hd proper ra dec mag ci pmra pmdec bf con".split(" ");
const rows = createReadStream(file).pipe(
  parse({
    columns: (keys: string[]) => {
      if (required.some((k) => !keys.includes(k)))
        throw Error("Changed HYG schema.");
      return keys;
    },
    skip_empty_lines: true,
  }),
);
const W = 256,
  H = 128,
  bins = new Float64Array(W * H);
for await (const row of rows) {
  const num = (k: string) => (row[k]?.trim() ? Number(row[k]) : NaN);
  const id = num("id"),
    ra = num("ra") * 15,
    dec = num("dec"),
    mag = num("mag");
  if (id === 0) {
    skipped.sun++;
    continue;
  }
  if (!(
    Number.isInteger(id) &&
    ra >= 0 &&
    ra < 360 &&
    dec >= -90 &&
    dec <= 90 &&
    Number.isFinite(mag)
  )) {
    skipped.invalid++;
    continue;
  }
  // Equal-solid-angle bins count unresolved sources only. Longitude is RA, latitude is sin(dec).
  if (mag > 8 && mag <= 10) {
    const x = Math.floor((ra * W) / 360),
      y = Math.min(
        H - 1,
        Math.floor(((1 + Math.sin((dec * Math.PI) / 180)) * H) / 2),
      );
    bins[y * W + x]++;
  }
  if (mag > cutoff) {
    skipped.faint++;
    continue;
  }
  records.push([id, ra, dec, num("pmra"), num("pmdec"), mag, num("ci")]);
  names.push([
    id,
    row.proper,
    row.hip,
    row.bf.trim() ||
      [row.bayer, row.con]
        .filter((v, i) => i === 0 || row.bayer)
        .join(" ")
        .trim(),
    row.con,
    row.hd,
  ]);
}
const binary = new Uint8Array(headerBytes + recordBytes * records.length),
  d = new DataView(binary.buffer);
binary.set(new TextEncoder().encode("SKY1"));
d.setUint16(4, 1, true);
d.setUint16(6, recordBytes, true);
d.setUint32(8, records.length, true);
d.setFloat64(16, 2000, true);
records.forEach(([id, ra, dec, ...rest], i) => {
  const o = headerBytes + i * recordBytes;
  d.setUint32(o, id, true);
  d.setFloat64(o + 4, ra, true);
  d.setFloat64(o + 12, dec, true);
  rest.forEach((v, j) => d.setFloat32(o + 20 + j * 4, v, true));
});
const nameJson = JSON.stringify(names),
  root = "public/catalog/v1/";
await mkdir(root, { recursive: true });
await Bun.write(root + "bright-stars.bin", binary);
await Bun.write(root + "bright-names.json", nameJson);
const density = new Uint8Array(W * H);
for (let y = 0; y < H; y++)
  for (let x = 0; x < W; x++) {
    let sum = 0,
      weight = 0;
    for (let j = -4; j <= 4; j++)
      for (let i = -4; i <= 4; i++) {
        const yy = y + j;
        if (yy < 0 || yy >= H) continue;
        const w = Math.exp(-(i * i + j * j) / 6);
        sum += w * bins[yy * W + ((x + i + W) % W)];
        weight += w;
      }
    density[y * W + x] = Math.min(255, Math.round((60 * sum) / weight));
  }
await Bun.write("public/sky/hyg-density.bin", density);
const manifest = {
  source: "HYG v4.1",
  revision,
  url,
  sourceSha256: checksum,
  epoch: 2000,
  magnitudeLimit: cutoff,
  count: records.length,
  skipped,
  sha256: sha(binary),
  namesSha256: sha(nameJson),
  densitySha256: sha(density),
  built: new Date().toISOString(),
  license: "CC BY-SA 4.0",
};
await Bun.write(
  root + "manifest.tmp",
  JSON.stringify(manifest, null, 2) + "\n",
);
await rename(root + "manifest.tmp", root + "manifest.json");
console.log(manifest);
