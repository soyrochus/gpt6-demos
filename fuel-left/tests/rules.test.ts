import { expect, test } from "bun:test";
import { RULES as R } from "../src/rules/constants";
import { Game } from "../src/rules/game";
import {
  initialMission,
  missionReducer as send,
  missions,
  type MissionId,
  type Signal,
} from "../src/rules/missions";
import { skillShot } from "../src/rules/score";

const shot = (signal: Signal, count = 1) => ({
  type: "shot" as const,
  signal,
  count,
});
const accept = (id: MissionId) =>
  send({ ...initialMission(), armed: id }, shot("rampSensor"));
test("top target arms Launch Training, acceptance and completion pay once", () => {
  let s = send(initialMission(), { type: "select", index: 0 });
  expect(s.armed).toBe("launch");
  s = send(s, shot("rampSensor"));
  expect([s.active, s.awards, s.remaining]).toEqual(["launch", 10000, 3]);
  for (let i = 0; i < 3; i++) s = send(s, shot("rampSensor"));
  expect([s.active, s.awards, s.progress]).toEqual([null, 510000, 6]);
});
test("Science pays on the ninth drop and promotion carries overflow", () => {
  let s = initialMission();
  for (const index of [2, 0, 1]) s = send(s, { type: "select", index });
  expect(s.armed).toBe("science");
  s = send(s, shot("rampSensor"));
  for (let i = 0; i < 8; i++) s = send(s, shot("drop"));
  expect(s.remaining).toBe(1);
  s = send(s, shot("drop"));
  expect([s.awards, s.progress]).toEqual([760000, 9]);
  s = send({ ...accept("practice"), progress: 16 }, shot("attack", 8));
  expect([s.progress, s.rank]).toEqual([4, 1]);
});
test("Time Warp backward removes one rank lamp and pays two million", () => {
  let s = send({ ...accept("time"), rank: 5 }, shot("rebound", 25));
  s = send(s, shot("hyper"));
  expect([s.rank + 1, s.progress, s.awards]).toEqual([5, 0, 2030000]);
});
test("fuel extinguishes sequentially, refills and aborts at exactly ninety seconds", () => {
  let s = send(accept("reentry"), { type: "time", seconds: 89.9 });
  expect(s.fuel).toBe(32);
  const refreshed = send(s, { type: "fuel", index: 0 });
  expect(refreshed.fuel).toBe(33);
  s = send(s, { type: "time", seconds: 0.1 });
  expect([s.active, s.armed, s.fuel]).toEqual([null, null, 0]);
  s = send(s, { type: "select", index: 0 });
  s = send(s, shot("rampSensor"));
  expect(s.active).toBe(null);
});
test("Secret requires yellow, red, green and Maelstrom enforces eight stages", () => {
  let s = send(accept("secret"), shot("red"));
  expect(s.stage).toBe(0);
  for (const signal of ["yellow", "red", "green"] as const)
    s = send(s, shot(signal));
  expect(s.completed).toBe("secret");
  s = send(accept("maelstrom"), shot("hyper"));
  expect(s.stage).toBe(0);
  for (const [event, n] of [
    ["drop", 3],
    ["spot", 3],
    ["out", 5],
    ["fuelTop", 1],
    ["rampSensor", 1],
    ["spin", 1],
    ["red", 1],
    ["hyper", 1],
  ] as const)
    s = send(s, shot(event, n));
  expect([s.awards, s.rank, s.completed]).toEqual([5030000, 1, "maelstrom"]);
});
test("field multiplier applies to bumper and skill shot but never to mission awards", () => {
  const g = new Game();
  g.start();
  g.l.multiIndex = 4;
  g.handle({ type: "bumper", group: "attack", index: 1 });
  expect(g.p.score).toBe(5000);
  g.p.mission = { ...accept("practice"), remaining: 1 };
  g.handle({ type: "bumper", group: "satellite", index: 3 });
  expect(g.p.score).toBe(520000);
  expect(skillShot(3, false)).toBe(75000);
  expect(skillShot(6, true)).toBe(0);
});
test("third nudge tilts, kills flippers and forfeits replay and bonus", () => {
  const g = new Game();
  g.start();
  g.l.replay = true;
  g.flip(0, true);
  for (let i = 0; i < 3; i++) {
    g.nudge(1, true);
    g.nudge(1, false);
  }
  expect(g.tilted).toBe(true);
  expect(g.world.bats[0].down).toBe(false);
  expect(g.world.held).toBe(false);
  g.handle({ type: "drain" });
  expect([g.phase, g.bonus, g.l.replay]).toEqual(["ballEnd", 0, false]);
  g.finishBall();
  expect([g.p.ball, g.tilted]).toEqual([2, false]);
});
test("two players own their missions, progress, score and timers", () => {
  const g = new Game();
  g.start(2);
  g.p.mission = accept("practice");
  g.players[1].mission = accept("science");
  for (let i = 0; i < 8; i++)
    g.handle({ type: "bumper", group: "attack", index: 0 });
  g.handle({ type: "drain" });
  g.finishBall();
  expect([
    g.index,
    g.p.score,
    g.p.mission.active,
    g.p.mission.remaining,
  ]).toEqual([1, 0, "science", 9]);
  expect(g.players[0].mission.progress).toBe(6);
});
test("target practice, matching wormhole replay, deploy save and extra ball priority", () => {
  const g = new Game();
  g.start(2);
  g.handle({ type: "target", bank: "mission", index: 2 });
  g.handle({ type: "rampSensor" });
  for (let i = 0; i < R.goals.practice; i++)
    g.handle({ type: "bumper", group: "attack", index: 0 });
  expect(g.message).toContain("Target practice passed");
  expect(g.p.mission.progress).toBe(6);
  g.handle({ type: "target", bank: "warp", index: 0 });
  g.handle({ type: "hole", color: "yellow" });
  expect(g.l.replay).toBe(true);
  g.handle({ type: "deploy", crest: false, highest: 3 });
  g.p.extra = 1;
  g.drain();
  expect(g.l.replay).toBe(true);
  g.drain();
  expect(g.l.replay).toBe(false);
  expect(g.p.ball).toBe(1);
  g.drain();
  g.finishBall();
  expect([g.index, g.p.extra, g.p.ball]).toEqual([0, 0, 1]);
  g.drain();
  g.finishBall();
  expect([g.index, g.p.score, g.p.mission.rank]).toEqual([1, 0, 0]);
});
test("all 17 missions have a completable ordered route", () => {
  const routes: Record<string, Signal> = {
    target: "drop",
    attack: "satellite",
    lane: "return",
    hole: "green",
    warpExit: "rampSensor",
  };
  for (const id of Object.keys(missions) as MissionId[]) {
    let s = accept(id);
    for (const stage of missions[id].steps)
      s = send(
        s,
        shot(routes[stage.goal] ?? (stage.goal as Signal), stage.count),
      );
    expect(s.completed).toBe(id);
    expect(s.awards).toBe(missions[id].payout[0] + missions[id].payout[1]);
  }
});
