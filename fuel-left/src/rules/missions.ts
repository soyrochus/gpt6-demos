import { RULES as R } from "./constants";

export type Signal =
  | "rampSensor"
  | "reentry"
  | "attack"
  | "satellite"
  | "drop"
  | "spot"
  | "boost"
  | "hyper"
  | "attackUp"
  | "engineUp"
  | "engineDecay"
  | "yellow"
  | "red"
  | "green"
  | "hazardL"
  | "hazardR"
  | "black"
  | "spin"
  | "warpLane"
  | "return"
  | "out"
  | "bonus"
  | "rebound"
  | "fuelTop";
type Goal = Signal | "target" | "lane" | "hole" | "warpExit";
interface Step {
  goal: Goal;
  count: number;
  label: string;
}
const step = (goal: Goal, label: string, count = 1): Step => ({
  goal,
  count,
  label,
});
const g = R.goals,
  pay = R.missionPay;
const mission = (
  name: string,
  payout: readonly [number, number, number],
  steps: Step[],
  done: string,
) => ({ name, payout, steps, done });
export const missions = {
  launch: mission(
    "Launch Training",
    pay.training,
    [step("rampSensor", "Launch ramp", g.launch)],
    "Launch training passed",
  ),
  reentry: mission(
    "Re-entry Training",
    pay.training,
    [step("reentry", "Re-entry lanes", g.reentry)],
    "Re-entry training passed",
  ),
  practice: mission(
    "Target Practice",
    pay.training,
    [step("attack", "Attack bumpers", g.practice)],
    "Target practice passed",
  ),
  science: mission(
    "Science",
    pay.science,
    [step("drop", "Drop targets", g.science)],
    "Science survey complete",
  ),
  bug: mission(
    "Bug Hunt",
    pay.ensign,
    [step("target", "Spot or drop targets", g.bug)],
    "Bug hunt complete",
  ),
  rescue: mission(
    "Rescue",
    pay.ensign,
    [step("boost", "Upgrade the flags"), step("hyper", "Enter hyperspace")],
    "Rescue complete",
  ),
  alien: mission(
    "Alien Menace",
    pay.ensign,
    [
      step("attackUp", "Upgrade attack bumpers"),
      step("attack", "Attack bumpers", g.alien),
    ],
    "Alien menace cleared",
  ),
  secret: mission(
    "Secret",
    pay.secret,
    [
      step("yellow", "Enter yellow wormhole"),
      step("red", "Enter red wormhole"),
      step("green", "Enter green wormhole"),
    ],
    "Secret route complete",
  ),
  comet: mission(
    "Stray Comet",
    pay.captain,
    [
      step("hazardR", "Complete right hazard bank"),
      step("hyper", "Enter hyperspace"),
    ],
    "Comet destroyed",
  ),
  radiation: mission(
    "Space Radiation",
    pay.captain,
    [
      step("hazardL", "Complete left hazard bank"),
      step("hole", "Enter an open wormhole"),
    ],
    "Radiation cleared",
  ),
  threat: mission(
    "Black Hole Threat",
    pay.captain,
    [
      step("engineUp", "Upgrade engine bumpers"),
      step("black", "Enter the black hole"),
    ],
    "Black hole stabilized",
  ),
  plague: mission(
    "Cosmic Plague",
    pay.plague,
    [
      step("spin", "Flag spins", g.plague),
      step("warpLane", "Cross space warp"),
    ],
    "Plague purged",
  ),
  satellite: mission(
    "Satellite Retrieval",
    pay.commander,
    [step("satellite", "Satellite bumper", g.satellite)],
    "Satellite retrieved",
  ),
  recon: mission(
    "Recon",
    pay.commander,
    [step("lane", "Lane crossings", g.recon)],
    "Recon complete",
  ),
  doomsday: mission(
    "Doomsday Machine",
    pay.commander,
    [step("out", "Outlane passes", g.doomsday)],
    "Doomsday machine destroyed",
  ),
  time: mission(
    "Time Warp",
    pay.warp,
    [
      step("rebound", "Rebounds", g.warp),
      step("warpExit", "Shoot ramp or hyperspace"),
    ],
    "Time warp",
  ),
  maelstrom: mission(
    "Maelstrom",
    pay.maelstrom,
    [
      step("drop", "Drop targets", g.stormDrop),
      step("spot", "Spot targets", g.stormSpot),
      step("lane", "Lane crossings", g.stormLane),
      step("fuelTop", "Cross the top fuel lamp"),
      step("rampSensor", "Shoot the ramp"),
      step("spin", "Spin a flag"),
      step("hole", "Enter an open wormhole"),
      step("hyper", "Enter hyperspace"),
    ],
    "Maelstrom complete",
  ),
};
export type MissionId = keyof typeof missions;
const menus: MissionId[][] = [
  ["launch", "reentry", "practice", "science"],
  ["bug", "rescue", "alien", "secret"],
  ["comet", "radiation", "threat", "plague"],
  ["satellite", "recon", "doomsday", "time"],
  ["plague", "secret", "time", "maelstrom"],
];
export const fullFuel = (1 << R.fuelSeconds.length) - 1;
export interface MissionState {
  rank: number;
  progress: number;
  armed: MissionId | null;
  active: MissionId | null;
  bank: number;
  stage: number;
  remaining: number;
  fuel: number;
  elapsed: number;
  awards: number;
  notice: string;
  revision: number;
  completed: MissionId | null;
}
export function initialMission(): MissionState {
  return {
    rank: 0,
    progress: 0,
    armed: null,
    active: null,
    bank: 0,
    stage: 0,
    remaining: 0,
    fuel: fullFuel,
    elapsed: 0,
    awards: 0,
    notice: "",
    revision: 0,
    completed: null,
  };
}
export type MissionEvent =
  | { type: "select"; index: number }
  | { type: "shot"; signal: Signal; count?: number; boosted?: boolean }
  | { type: "time"; seconds: number }
  | { type: "fuel"; index?: number };
function matches(goal: Goal, s: Signal) {
  if (goal === s) return true;
  switch (goal) {
    case "lane":
      return s === "reentry" || s === "return" || s === "out" || s === "bonus";
    case "target":
      return s === "spot" || s === "drop";
    case "attack":
      return s === "satellite";
    case "hole":
      return s === "yellow" || s === "red" || s === "green";
    case "warpExit":
      return s === "rampSensor" || s === "hyper";
    default:
      return false;
  }
}
function lowest(mask: number) {
  return 31 - Math.clz32(mask & -mask);
}
export function missionReducer(
  state: MissionState,
  event: MissionEvent,
): MissionState {
  if (event.type === "fuel") {
    const fuel =
      event.index === undefined ? fullFuel : state.fuel | (1 << event.index);
    const reset = event.index === undefined || event.index === lowest(fuel);
    return { ...state, fuel, elapsed: reset ? 0 : state.elapsed };
  }
  if (event.type === "time") {
    if (!state.active || event.seconds <= 0) return state;
    let elapsed = state.elapsed + event.seconds,
      fuel = state.fuel;
    while (fuel && elapsed + 1e-8 >= R.fuelSeconds[lowest(fuel)]) {
      elapsed = Math.max(0, elapsed - R.fuelSeconds[lowest(fuel)]);
      fuel &= fuel - 1;
    }
    return fuel
      ? { ...state, fuel, elapsed }
      : {
          ...state,
          active: null,
          armed: null,
          remaining: 0,
          bank: 0,
          elapsed: 0,
          fuel,
          completed: null,
          notice: "Mission aborted. Fuel exhausted.",
          revision: state.revision + 1,
        };
  }
  if (event.type === "select") {
    if (state.active) return state;
    const bit = 1 << event.index,
      mask = state.bank & bit ? bit : state.bank | bit;
    const all = mask === (1 << R.bankSize) - 1;
    const armed =
      menus[Math.ceil(state.rank / 2)][all ? R.bankSize : event.index];
    return {
      ...state,
      bank: mask,
      armed,
      completed: null,
      notice: missions[armed].name + " armed",
      revision: state.revision + 1,
    };
  }
  const s = event.signal,
    isRamp = s === "rampSensor";
  if (!state.active) {
    if (!isRamp) return state;
    if (!state.armed) return missionReducer(state, { type: "fuel" });
    if (!state.fuel)
      return {
        ...state,
        fuel: fullFuel,
        elapsed: 0,
        notice: "Refuel before mission launch",
        revision: state.revision + 1,
      };
    const id = state.armed,
      stage = id === "rescue" && event.boosted ? 1 : 0;
    return {
      ...state,
      active: id,
      armed: null,
      stage,
      remaining: missions[id].steps[stage].count,
      bank: 0,
      fuel: fullFuel,
      elapsed: 0,
      awards: state.awards + missions[id].payout[0],
      completed: null,
      notice: "Mission accepted",
      revision: state.revision + 1,
    };
  }
  const id = state.active,
    m = missions[id],
    current = isRamp ? { ...state, fuel: fullFuel, elapsed: 0 } : state;
  if (id === "threat" && s === "engineDecay" && state.stage > 0)
    return { ...current, stage: 0, remaining: 1 };
  if (!matches(m.steps[state.stage].goal, s)) return current;
  const remaining = state.remaining - (event.count ?? 1);
  if (remaining > 0) return { ...current, remaining };
  const stage = state.stage + 1;
  if (stage < m.steps.length)
    return { ...current, stage, remaining: m.steps[stage].count };
  const backward = id === "time" && s === "hyper",
    warp = id === "time" ? (backward ? -1 : 1) : 0;
  const total = state.progress + (backward ? 0 : m.payout[2]);
  const rank = Math.max(
    0,
    Math.min(
      R.ranks.length - 1,
      state.rank + warp + Math.floor(total / R.progressLamps),
    ),
  );
  const line =
    id === "time"
      ? backward
        ? "Time warp backward"
        : "Time warp forward"
      : m.done;
  return {
    ...current,
    rank,
    progress: total % R.progressLamps,
    completed: id,
    active: null,
    remaining: 0,
    stage: 0,
    bank: 0,
    awards: state.awards + m.payout[1],
    notice: line + (rank > state.rank ? " · " + R.ranks[rank] : ""),
    revision: state.revision + 1,
  };
}

export function objective(s: MissionState) {
  if (s.active) {
    const step = missions[s.active].steps[s.stage];
    return step.label + (step.count > 1 ? " · " + s.remaining + " left" : "");
  }
  if (s.armed) return "Shoot the launch ramp to accept.";
  return "Hit mission targets, then shoot the launch ramp.";
}
