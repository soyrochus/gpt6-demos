import {
  digest,
  parseStars,
  type Manifest,
  type NameRecord,
} from "../src/catalog/catalog";
const path = "public/catalog/v1/";
const manifest: Manifest = await Bun.file(path + "manifest.json").json();
const bin = await Bun.file(path + "bright-stars.bin").arrayBuffer(),
  names = await Bun.file(path + "bright-names.json").arrayBuffer();
const stars = parseStars(bin);
const index: NameRecord[] = JSON.parse(new TextDecoder().decode(names));
if (
  stars.length !== manifest.count ||
  stars.length !== index.length ||
  (await digest(bin)) !== manifest.sha256 ||
  (await digest(names)) !== manifest.namesSha256 ||
  stars.some(
    (s, i) => s.id !== index[i][0] || s.magnitudeV > manifest.magnitudeLimit,
  ) ||
  new Set(stars.map((s) => s.id)).size !== stars.length
)
  throw Error("Catalogue validation failed.");
console.log(
  `Validated ${stars.length} HYG v4.1 stars, names and SHA-256 checksums.`,
);
