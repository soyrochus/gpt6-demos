import { RULES as R } from "./constants";
export const points = (base: number, multiplier: number, multiplied = true) =>
  base * (multiplied ? multiplier : 1);
export const skillShot = (highest: number, crest: boolean, replay = false) =>
  crest || replay ? 0 : (R.skill[highest] ?? 0);
export const jackpot = (mode: number) =>
  mode < 2
    ? 0
    : Math.min(R.boostCap, R.jackpotBase * R.boostFactor ** (mode - 1));
export const bonusValue = (mode: number) =>
  mode < 3
    ? R.bonusBase
    : Math.min(R.boostCap, R.bonusBase * R.boostFactor ** (mode - 2));
export const endBonus = (base: number, tilted: boolean) =>
  tilted ? 0 : base * R.bonusParts;

export interface HighScore {
  name: string;
  score: number;
}
export function readScores(raw: string | null): HighScore[] {
  try {
    const rows: unknown = JSON.parse(raw ?? "[]");
    if (!Array.isArray(rows)) return [];
    return rows
      .filter(
        (r): r is HighScore =>
          r &&
          typeof r.name === "string" &&
          Number.isSafeInteger(r.score) &&
          r.score >= 0,
      )
      .map((r) => ({ name: r.name.slice(0, R.nameLength), score: r.score }))
      .sort((a, b) => b.score - a.score)
      .slice(0, R.scores);
  } catch {
    return [];
  }
}
