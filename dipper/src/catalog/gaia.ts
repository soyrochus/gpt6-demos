// Gaia DR3 archive astrometry at J2016.0. Never coerce source_id to Number.
export type GaiaRow = [
  id: string,
  raDeg: number,
  decDeg: number,
  pmRaStar: number | null,
  pmDec: number | null,
  g: number,
  bpRp: number | null,
];
export type GaiaTile = {
  file: string;
  ra: number;
  dec: number;
  size: number;
  count: number;
  sha256: string;
  query: string;
  sourceSha256: string;
  matched: number;
};
export const estimateV = (g: number, bpRp: number | null) => {
  if (bpRp === null || bpRp <= -0.5 || bpRp >= 5) return null;
  return (
    g - (-0.02704 + 0.01424 * bpRp - 0.2156 * bpRp ** 2 + 0.01426 * bpRp ** 3)
  );
};
