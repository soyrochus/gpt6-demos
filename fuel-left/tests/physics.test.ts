import { expect, test } from "bun:test";
import { World } from "../src/sim/world";
import { RULES as R } from "../src/rules/constants";
import { pos, type Event } from "../src/table/layout";

function launch(hold: number) {
  const events: Event[] = [];
  const w = new World((e) => events.push(e));
  w.charging = true;
  for (let i = 0; i < Math.round(hold / R.dt); i++) w.step();
  expect(w.held).toBe(true);
  w.plunge();
  while (w.layer === "plunger" && w.clock < 8) w.step();
  return { w, events };
}
test("full plunge clears the attack bumpers and tap takes the side gate", () => {
  const full = launch(1);
  expect(full.w.y).toBeGreaterThan(pos(0, 0.78).y);
  expect(full.events[0]).toMatchObject({ type: "deploy", crest: true });
  expect(launch(0).events[0]).toEqual({
    type: "deploy",
    highest: 1,
    crest: false,
  });
});
test("held flippers cradle a ball dropped from 15 cm for two seconds", () => {
  for (const [i, side] of [-1, 1].entries()) {
    const w = new World(() => {});
    w.bats[i].down = true;
    for (let t = 0; t < Math.ceil(R.rise / R.dt); t++) w.step();
    w.held = false;
    w.layer = "main";
    w.x = side * (R.pivot - 0.032);
    w.y = 0.15;
    for (let t = 0; t < 2 / R.dt; t++) w.step();
    expect(Math.abs(w.x - w.bats[i].x)).toBeLessThan(0.045);
    expect(w.y).toBeGreaterThan(0);
    expect(w.y).toBeLessThan(0.06);
    expect(Math.hypot(w.vx, w.vy)).toBeLessThan(0.03);
  }
});
test("a drained ball can be served again", () => {
  const events: Event[] = [];
  const w = new World((e) => events.push(e));
  w.held = false;
  w.layer = "main";
  w.y = -0.085;
  w.vy = -1;
  for (let i = 0; i < 10; i++) w.step();
  expect(events).toContainEqual({ type: "drain" });
  w.serve();
  expect(w.held).toBe(true);
  expect(w.layer).toBe("plunger");
});
test("partial plunges reach lamps one, three and six without cresting", () => {
  for (const [seconds, highest] of [
    [0, 1],
    [0.23, 3],
    [0.39, 6],
  ]) {
    expect(launch(seconds).events[0]).toEqual({
      type: "deploy",
      highest,
      crest: false,
    });
  }
});
test("ramp rollbacks miss the red sensor and a made shot crosses it once", () => {
  for (const [speed, success] of [
    [1.5, false],
    [2.5, true],
  ] as const) {
    const events: Event[] = [],
      w = new World((e) => events.push(e));
    const mouth = pos(-0.13, 0.355);
    w.x = mouth.x;
    w.y = mouth.y - 0.003;
    w.vy = speed;
    w.held = false;
    w.layer = "main";
    for (let t = 0; t < 1.8 / R.dt; t++) w.step();
    expect(events.filter((e) => e.type === "rampSensor")).toHaveLength(
      success ? 1 : 0,
    );
    expect(events.some((e) => e.type === "lane" && e.lane === "bonus")).toBe(
      success,
    );
  }
});
test("a skirt strike kicks along the normal at the specified group speed", () => {
  const center = pos(-0.18, 0.78);
  const w = new World(() => {});
  w.held = false;
  w.layer = "main";
  w.x = center.x;
  w.y = center.y - R.attackRadius - R.radius - 0.001;
  w.vy = 0.6;
  w.step();
  expect(w.vy).toBeCloseTo(-R.attackKick, 3);
  expect(w.vx).toBeCloseTo(0, 3);
});
test("centrally falling ball drains with post down and rebounds with post up", () => {
  for (const raised of [true, false]) {
    const w = new World(() => {});
    w.held = false;
    w.layer = "main";
    w.debugPost = raised;
    w.x = 0;
    w.y = 0.09;
    w.vy = -0.65;
    let bounced = false;
    for (let i = 0; i < 240; i++) {
      w.step();
      if (w.vy > 0) bounced = true;
    }
    expect(bounced).toBe(raised);
    expect(w.held).toBe(!raised);
  }
});
test("fixed keyboard script gives identical ball and flippers at 30 and 120 render frames per second", () => {
  const run = (fps: number) => {
    const w = new World(() => {});
    let tick = 0,
      acc = 0;
    for (let frame = 0; frame < fps * 4; frame++) {
      acc += 1 / fps;
      while (acc + 1e-10 >= R.dt) {
        if (tick === 0) w.charging = true;
        if (tick === 130) w.plunge();
        w.bats[0].down = tick > 270 && tick < 325;
        w.bats[1].down = tick > 310 && tick < 350;
        w.step();
        tick++;
        acc -= R.dt;
      }
    }
    return [w.x, w.y, w.vx, w.vy, w.bats[0].angle, tick];
  };
  expect(run(30)).toEqual(run(120));
});
