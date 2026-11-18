import type { Game } from "../rules/game";
import { solids, dropBank } from "../table/layout";
import { RULES as R } from "../rules/constants";
export function lampIntensity(g: Game, group: string, i: number): number {
  const s = g.p.mission,
    l = g.l,
    w = g.world;
  const blink = Math.floor((g.idle + w.clock) * 4) % 2 === 0;
  const show = g.phase === "attract",
    chase = Math.floor(g.idle * 5);
  let active = false;
  switch (group) {
    case "arch":
      active = (i + chase) % 5 !== 0;
      break;
    case "cap":
      return 1.5;
    case "rank":
      active = i <= s.rank;
      break;
    case "progress":
      active = i < s.progress || (show && (i + chase) % 18 < 4);
      break;
    case "fuel":
      active = !!(s.fuel & (1 << i));
      if (s.active && (s.fuel & -s.fuel) === 1 << i)
        active = active && Math.floor(w.clock * 16) % 2 === 0;
      break;
    case "skill":
      active =
        !g.relaunch &&
        (i < w.highest ||
          (w.held &&
            w.charging &&
            i < Math.ceil((w.charge / R.chargeTime) * 6)));
      break;
    case "reentry":
    case "launch":
      active = !!(l[group] & (1 << i));
      break;
    case "return":
      active = !!(l.returns & (1 << i));
      break;
    case "out":
      active = g.kicker(i);
      break;
    case "extra":
      active = l.extraLit && blink;
      break;
    case "hole":
      active = l.open && (i === l.exit ? blink : true);
      break;
    case "hyper":
      active = i < l.hyper;
      break;
    case "save":
      active = g.saveUntil > g.p.time;
      break;
    case "foul":
      active = g.foul;
      break;
    case "replay":
      active = l.replay;
      break;
    case "reflex":
      active = l.reflexEnd > g.p.time && blink;
      break;
    case "sensor":
      active = !!s.armed && blink;
      break;
    case "target": {
      const e = solids[i].event;
      if (e?.type !== "target") break;
      if (e.bank === "mission")
        active =
          !!(s.bank & (1 << e.index)) || (!s.armed && !s.active && blink);
      else if (dropBank(e.bank)) active = !g.isDown(e.bank, e.index);
      else if (e.bank === "warp") active = l.open;
      else if (
        e.bank === "fuel" ||
        e.bank === "hazardL" ||
        e.bank === "hazardR"
      )
        active = !!(l.hazards[e.bank] & (1 << e.index));
      if (w.flashes[i] && w.clock - w.flashes[i] < R.kickLock) active = true;
      break;
    }
    case "well":
      active = g.well && blink;
      break;
    case "medal":
      active = i < l.medal;
      break;
    case "boost":
      active = i < l.mode;
      break;
    case "multi":
      active = i < l.multiIndex;
      break;
    case "flash":
      active = w.flashes[i] > 0 && w.clock - w.flashes[i] < R.slingFlash;
      break;
    default:
      active = show && blink;
  }
  return active ? 1.55 : 0.08;
}
