import { parse } from "csv-parse/sync";
import { mkdir, rename } from "node:fs/promises";
import { parseStars } from "../src/catalog/catalog";
import { estimateV, type GaiaRow, type GaiaTile } from "../src/catalog/gaia";
import { equatorial, stellarMotion, normalize, rad } from "../src/astro/sky";
const dir = "public/catalog/gaia/",
  size = 5,
  limit = 15000;
await mkdir(dir, { recursive: true });
const indexPath = dir + "manifest.json";
const manifest: { version: number; epoch: number; tiles: GaiaTile[] } =
  (await Bun.file(indexPath).exists())
    ? await Bun.file(indexPath).json()
    : { version: 1, epoch: 2016, tiles: [] };
const sha = (s: string) =>
  new Bun.CryptoHasher("sha256").update(s).digest("hex");
const hyg = parseStars(
  await Bun.file("public/catalog/v1/bright-stars.bin").arrayBuffer(),
).map((s) => {
  const v = equatorial(s.raDeg, s.decDeg),
    pm = stellarMotion(s);
  const p = normalize([
    v[0] + 16 * pm[0],
    v[1] + 16 * pm[1],
    v[2] + 16 * pm[2],
  ]);
  return {
    p,
    mag: s.magnitudeV,
    ra: (Math.atan2(p[1], p[0]) / rad + 360) % 360,
    dec: Math.asin(p[2]) / rad,
  };
});
for (const ra of [80, 85])
  for (const dec of [-10, -5]) {
    const file = `dr3-${ra}-${dec}.json`,
      old = manifest.tiles.find((t) => t.file === file);
    if (
      old &&
      (await Bun.file(dir + file).exists()) &&
      sha(await Bun.file(dir + file).text()) === old.sha256
    ) {
      console.log("Verified", file);
      continue;
    }
    const query = `SELECT TOP ${limit + 1} source_id,ra,dec,ref_epoch,pmra,pmdec,phot_g_mean_mag,bp_rp FROM gaiadr3.gaia_source WHERE ra>=${ra} AND ra<${ra + size} AND dec>=${dec} AND dec<${dec + size} AND phot_g_mean_mag>7 AND phot_g_mean_mag<=11.5 ORDER BY source_id`;
    const params = new URLSearchParams({
      REQUEST: "doQuery",
      LANG: "ADQL",
      FORMAT: "csv",
      MAXREC: String(limit + 1),
      QUERY: query,
    });
    const source = new URL(
      "https://gea.esac.esa.int/tap-server/tap/sync?" + params,
    );
    const local = Bun.file(".cache/" + file + ".csv");
    const res = (await local.exists())
      ? new Response(local)
      : await fetch(source, { signal: AbortSignal.timeout(120000) });
    if (!res.ok)
      throw Error(
        `Gaia TAP HTTP ${res.status}. Re-run to resume completed tiles.`,
      );
    const csv = await res.text(),
      rows: Record<string, string>[] = parse(csv, {
        columns: true,
        skip_empty_lines: true,
      });
    if (!rows.length || rows.length > limit)
      throw Error("Empty or truncated Gaia extraction. Reduce tile size.");
    const stars = hyg.filter(
      (h) =>
        h.ra >= ra - 0.02 &&
        h.ra < ra + size + 0.02 &&
        h.dec >= dec - 0.02 &&
        h.dec < dec + size + 0.02,
    );
    const records: GaiaRow[] = [],
      ids = new Set<string>();
    let matched = 0;
    for (const r of rows) {
      const id = r.source_id,
        x = +r.ra,
        y = +r.dec,
        g = +r.phot_g_mean_mag;
      const nullable = (k: string) => (r[k]?.trim() ? Number(r[k]) : null);
      if (
        !/^\d+$/.test(id) ||
        ids.has(id) ||
        +r.ref_epoch !== 2016 ||
        !(
          x >= ra &&
          x < ra + size &&
          y >= dec &&
          y < dec + size &&
          g > 7 &&
          g <= 11.5
        )
      )
        throw Error("Invalid Gaia row.");
      ids.add(id);
      const bpRp = nullable("bp_rp"),
        v = estimateV(g, bpRp),
        p = equatorial(x, y);
      // Conservative inter-catalogue match only; retain close components within each input catalogue.
      if (
        stars.some(
          (h) =>
            Math.hypot(h.p[0] - p[0], h.p[1] - p[1], h.p[2] - p[2]) <
              (3 * rad) / 3600 &&
            (v === null || Math.abs(v - h.mag) < 1.5),
        )
      ) {
        matched++;
        continue;
      }
      records.push([id, x, y, nullable("pmra"), nullable("pmdec"), g, bpRp]);
    }
    const data = JSON.stringify(records),
      tile = {
        file,
        ra,
        dec,
        size,
        count: records.length,
        sha256: sha(data),
        query,
        sourceSha256: sha(csv),
        matched,
      };
    await Bun.write(dir + file + ".tmp", data);
    await rename(dir + file + ".tmp", dir + file);
    manifest.tiles = manifest.tiles.filter((t) => t.file !== file).concat(tile);
    await Bun.write(
      indexPath + ".tmp",
      JSON.stringify(manifest, null, 2) + "\n",
    );
    await rename(indexPath + ".tmp", indexPath);
    console.log(file, records.length, "sources");
  }
