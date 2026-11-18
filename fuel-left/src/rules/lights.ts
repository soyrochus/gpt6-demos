import { RULES as R } from "./constants";
export const bankMask = (1 << R.bankSize) - 1;
export function rotate(mask: number, left: boolean) {
  return left
    ? ((mask << 1) | (mask >> (R.bankSize - 1))) & bankMask
    : (mask >> 1) | ((mask & 1) << (R.bankSize - 1));
}
export function lights() {
  return {
    reentry: 0,
    launch: 0,
    level: [0, 0],
    levelEnd: [0, 0],
    returns: 0,
    kickers: 0,
    hazards: { fuel: 0, hazardL: 0, hazardR: 0 },
    drops: { multiplier: [0, 0, 0], medal: [0, 0, 0], booster: [0, 0, 0] },
    medal: 0,
    medalEnd: 0,
    mode: 0,
    bonus: Number(R.bonusBase),
    multiIndex: 0,
    multiEnd: 0,
    hyper: 0,
    hyperEnd: 0,
    postEnd: 0,
    wellEnd: 0,
    reflexEnd: 0,
    extraLit: false,
    replay: false,
    open: false,
    exit: 0,
  };
}
