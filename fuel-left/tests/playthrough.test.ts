import { expect, test } from "bun:test";
import { Game } from "../src/rules/game";
import { RULES as R } from "../src/rules/constants";
import { World } from "../src/sim/world";
import {
  holes,
  ramp,
  solids,
  type Point,
  type Event,
} from "../src/table/layout";

function feed(g: Game, p: Point, vx: number, vy: number) {
  Object.assign(g.world, {
    layer: "main",
    held: false,
    x: p.x,
    y: p.y,
    prevX: p.x,
    prevY: p.y,
    vx,
    vy,
  });
}
function until(g: Game, condition: () => boolean, seconds = 2) {
  for (let i = 0; i < Math.ceil(seconds / R.dt) && !condition(); i++) g.tick();
  expect(condition()).toBe(true);
}

test("physical shots drive the five acceptance-script outcomes", () => {
  const g = new Game();
  g.start(2);
  g.pressPlunger();
  for (let i = 0; i < Math.round(0.23 / R.dt); i++) g.tick();
  g.releasePlunger();
  until(g, () => g.world.layer === "main");
  expect(g.p.score).toBe(75000);
  const bottom = solids.find(
    (s) =>
      s.event?.type === "target" &&
      s.event.bank === "mission" &&
      s.event.index === 2,
  )!;
  feed(
    g,
    { x: bottom.a.x, y: bottom.a.y - bottom.radius - R.radius - 0.001 },
    0,
    0.6,
  );
  until(g, () => g.p.mission.armed === "practice");
  feed(g, { x: ramp[0].x, y: ramp[0].y - 0.003 }, 0, 2.5);
  until(g, () => g.p.mission.active === "practice");
  until(g, () => g.world.layer === "main");
  const pops = solids.filter(
    (s) => s.event?.type === "bumper" && s.event.group === "attack",
  );
  for (let i = 0; i < R.goals.practice; i++) {
    const s = pops[i % pops.length],
      before = g.p.score;
    feed(g, { x: s.a.x, y: s.a.y - R.radius - s.radius - 0.002 }, 0, 0.5);
    until(g, () => g.p.score > before);
    // Give the mechanical skirt time to reset before the next fixture shot.
    feed(g, { x: 0, y: 0.23 }, 0, 0);
    for (let t = 0; t < Math.ceil(R.kickLock / R.dt); t++) g.tick();
  }
  expect(g.p.mission.completed).toBe("practice");
  expect(g.p.mission.progress).toBe(6);
  expect(g.p.score).toBeGreaterThanOrEqual(75000 + R.missionPay.training[1]);
  const warp = solids.find(
    (s) => s.event?.type === "target" && s.event.bank === "warp",
  )!;
  feed(
    g,
    { x: warp.a.x, y: warp.a.y - R.radius - warp.radius - 0.002 },
    0,
    0.6,
  );
  until(g, () => g.open);
  feed(g, holes.yellow, 0, -0.2);
  until(g, () => g.world.layer === "captured");
  until(g, () => g.world.layer === "main");
  expect(g.l.replay).toBe(true);
  // Let the deployment window expire while the left bat holds the ball.
  const cradle = g.world.bats[0];
  g.flip(0, true);
  feed(g, { x: cradle.x + 0.032, y: 0.14 }, 0, 0);
  const expiry = g.saveUntil;
  until(g, () => g.p.time > expiry + 0.01, R.saveTime + 1);
  g.flip(0, false);
  feed(g, { x: 0, y: -0.085 }, 0, -0.8);
  until(g, () => g.phase === "ballHeld");
  expect(g.l.replay).toBe(false);
  expect(g.p.ball).toBe(1);
  for (const i of [0, 1, 2]) {
    g.nudge(i, true);
    g.nudge(i, false);
  }
  expect(g.tilted).toBe(true);
  expect(g.world.bats.every((b) => !b.down)).toBe(true);
  feed(g, { x: 0, y: -0.085 }, 0, -0.8);
  until(g, () => g.phase === "ballEnd");
  g.finishBall();
  expect([g.index, g.p.score, g.p.mission.rank]).toEqual([1, 0, 0]);
  expect(g.players[0].mission.progress).toBe(6);
});
test("both flippers can make the launch ramp and left flipper can shoot hyperspace", () => {
  const shots = [
    { side: -1, offset: 15, height: 13, event: "rampSensor" },
    { side: 1, offset: 7, height: 0, event: "rampSensor" },
    { side: -1, offset: 36, height: 3, event: "hyper" },
    { side: 1, offset: 12, height: 0, event: "engine" },
  ];
  for (const shot of shots) {
    const events: Event[] = [],
      w = new World((e) => events.push(e)),
      bat = w.bats[shot.side < 0 ? 0 : 1];
    bat.down = true;
    w.layer = "main";
    w.held = false;
    const across = 0.019 + shot.offset * 0.0016;
    w.x = bat.x - shot.side * across;
    w.y = Math.tan(R.rest) * across + 0.02 + shot.height * 0.002;
    w.vy = -0.31;
    for (let i = 0; i < 550 && !w.held; i++) {
      if (i === 62) bat.down = false;
      w.step();
    }
    expect(
      events.some(
        (e) =>
          e.type === shot.event ||
          (e.type === "bumper" && e.group === shot.event),
      ),
    ).toBe(true);
  }
});
