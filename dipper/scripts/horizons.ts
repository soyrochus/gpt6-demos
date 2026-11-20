// Fixture preparation only. NASA requests one Horizons query at a time.
import { sites, instants } from "./reference-sites";
const targets = {
  Sun: 10,
  Moon: 301,
  Mercury: 199,
  Venus: 299,
  Mars: 499,
  Jupiter: 599,
  Saturn: 699,
  Uranus: 799,
  Neptune: 899,
};
const results = [];
for (const [site, latitudeDeg, longitudeDeg, elevationM] of sites) {
  for (const [name, id] of Object.entries(targets)) {
    const params = new URLSearchParams({
      format: "json",
      COMMAND: String(id),
      OBJ_DATA: "NO",
      MAKE_EPHEM: "YES",
      EPHEM_TYPE: "OBSERVER",
      CENTER: "coord@399",
      COORD_TYPE: "GEODETIC",
      SITE_COORD: `'${longitudeDeg},${latitudeDeg},${elevationM / 1000}'`,
      TLIST:
        "'" +
        instants.map((t) => Date.parse(t) / 86400000 + 2440587.5).join(",") +
        "'",
      QUANTITIES: "'4,10,13'",
      CSV_FORMAT: "YES",
      ANG_FORMAT: "DEG",
      APPARENT: "AIRLESS",
      EXTRA_PREC: "YES",
    });
    const url = "https://ssd.jpl.nasa.gov/api/horizons.api?" + params;
    const res = await fetch(url, { signal: AbortSignal.timeout(60000) });
    if (!res.ok) throw Error(`${res.status} ${url}`);
    const { result, signature } = await res.json();
    const table = result
      ?.split("$$SOE")[1]
      ?.split("$$EOE")[0]
      .trim()
      .split("\n");
    if (table?.length !== instants.length)
      throw Error(result || "Missing Horizons table");
    results.push({
      site,
      latitudeDeg,
      longitudeDeg,
      elevationM,
      name,
      url,
      signature,
      rows: table.map((line: string, i: number) => {
        const [, , , az, alt, illum, diam] = line.split(",");
        return {
          instant: instants[i],
          azimuthDeg: +az,
          altitudeDeg: +alt,
          illuminatedFraction: Number.isFinite(+illum) ? +illum / 100 : null,
          diameterDeg: +diam / 3600,
        };
      }),
    });
    console.log(site, name);
  }
}
await Bun.write(
  "tests/fixtures/horizons.json",
  JSON.stringify(results, null, 2) + "\n",
);
