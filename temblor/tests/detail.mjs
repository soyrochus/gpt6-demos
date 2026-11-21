// SPDX-License-Identifier: GPL-2.0-or-later
// Pause between ordinary 8 ms input commands so a capture has an exact camera and pose.
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import { launchChrome } from "./chromium.mjs";
const browser = await launchChrome({ headless: true });
const folder = "evidence/detail";
await fs.mkdir(folder, { recursive: true });
const revised = process.env.TEMBLOR_URL || "http://127.0.0.1:8080";
const base = process.env.BASELINE_URL;
const report = {
  map: "maps/oa_rpg3dm2.bsp",
  seed: 1813,
  fovYDegrees: 76,
  captures: [],
  display: [],
};

async function fixture(url, old) {
  const page = await browser.newPage({
    viewport: { width: 1280, height: 720 },
  });
  await page.route("**/capture-fixture", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: '<style>*{margin:0}canvas{display:block;width:100vw;height:100vh}</style><canvas width="1280" height="720"></canvas>',
    }),
  );
  await page.goto(url + "/capture-fixture");
  const build = (await (await page.request.get(url + "/build.json")).json())
    .sourceRevision;
  await page.evaluate(async (old) => {
    const {
      default: init,
      Engine,
      Packages,
    } = await import("./pkg/temblor.js");
    await init();
    const pack = async (name) => {
      const p = new Packages();
      p.mount(name, new Uint8Array(await (await fetch(name)).arrayBuffer()));
      return p;
    };
    const canvas = document.querySelector("canvas"),
      engine = await Engine.create(canvas);
    const map = await pack("arena.pk3"),
      actor = old ? null : await pack("actors.pk3");
    const args = [map, ...(old ? [] : [actor]), "maps/oa_rpg3dm2.bsp", 1813];
    engine.load(...args);
    const state = () => JSON.parse(engine.snapshot());
    const tick = (
      forward = 0,
      yaw = state().yaw,
      pitch = 0,
      jump = false,
      weapon = 0,
      fire = false,
    ) => {
      const s = state();
      engine.tick(
        forward,
        0,
        yaw - s.yaw,
        pitch - s.pitch,
        (jump ? 1 : 0) | (fire ? 4 : 0),
        weapon,
      );
    };
    const settle = () => {
      engine.rematch();
      for (let i = 0; i < 40; i++) tick();
    };
    window.fixture = {
      engine,
      state,
      tick,
      settle,
      draw: () => engine.frame(1),
    };
    const walk = (target, arrived) => {
      let route = [];
      for (let t = 0; t < 4000 && !arrived(); t++) {
        const pos = state().pos;
        if (!route.length || t % 60 === 0)
          route = JSON.parse(engine.route(...target));
        while (
          route.length &&
          Math.hypot(pos[0] - route[0][0], pos[1] - route[0][1]) < 25 &&
          Math.abs(pos[2] - route[0][2]) < 55
        )
          route.shift();
        const goal = route[0] || target;
        tick(
          1,
          Math.atan2(goal[1] - pos[1], goal[0] - pos[0]),
          0,
          (goal[2] - pos[2] > 17 || t % 300 > 240) && t % 18 === 0,
        );
      }
    };
    window.grate = () => {
      engine.rematch();
      const target = [1280, 896, 328];
      const arrived = () =>
        Math.hypot(state().pos[0] - 1280, state().pos[1] - 896) < 86 &&
        state().health > 0;
      walk(target, arrived);
      if (!arrived()) throw Error("Could not reach east grate");
      const pos = state().pos,
        dx = 1280 - pos[0],
        dy = 896 - pos[1];
      tick(
        0,
        Math.atan2(dy, dx),
        Math.atan2(304 - pos[2] - 26, Math.hypot(dx, dy)),
      );
    };
    window.pickup = (gun) => {
      engine.rematch();
      const names = [
        "",
        "gauntlet",
        "machinegun",
        "shotgun",
        "grenadelauncher",
        "rocketlauncher",
        "lightning",
      ];
      const start = state().pos,
        dist = (a, b) => Math.hypot(...a.map((v, i) => v - b[i]));
      const target = JSON.parse(engine.items())
        .filter((i) => i.class === "weapon_" + names[gun])
        .sort((a, b) => dist(a.pos, start) - dist(b.pos, start))[0]?.pos;
      walk(target, () => state().owned[gun]);
      if (!state().owned[gun]) throw Error("Could not reach " + names[gun]);
      for (let i = 0; i < 48; i++) tick(0, state().yaw, 0, false, gun);
      if (gun === 4) tick(0, 1.1, -0.12);
      if (state().gun !== gun) throw Error("Weapon switch failed");
    };
    // Let Major approach, then aim and fire at close range. Keep recording through respawn.
    window.combat = () => {
      const s = state(),
        d = s.bot.map((n, i) => n - s.pos[i]);
      const range = Math.hypot(...d);
      const yaw = Math.atan2(d[1], d[0]),
        pitch = Math.atan2(d[2] - 10, Math.hypot(d[0], d[1]));
      tick(
        s.visible && s.botHealth > 0 && range > 135 ? 1 : 0,
        yaw,
        pitch,
        false,
        2,
        s.visible && s.botHealth > 0 && range < 380,
      );
      return { s: state(), range, events: JSON.parse(engine.events()) };
    };
  }, old);
  const capture = async (name) => {
    const s = await page.evaluate(() => {
      fixture.draw();
      return fixture.state();
    });
    const file = (old ? "before-" : "") + name + ".jpg";
    await page.screenshot({
      path: folder + "/" + file,
      type: "jpeg",
      quality: 90,
    });
    report.captures.push({
      file,
      build,
      eye: [s.pos[0], s.pos[1], s.pos[2] + 26],
      yaw: s.yaw,
      pitch: s.pitch,
      ms: s.ms,
      weapon: s.weapon,
      bot: s.bot,
      botHealth: s.botHealth,
      dimensions: [1280, 720],
    });
  };
  for (const [name, pitch] of [
    ["floor-head-on", -1.53],
    ["floor-grazing", -0.16],
    ["spawn", 0],
  ]) {
    await page.evaluate((p) => {
      fixture.settle();
      fixture.tick(0, fixture.state().yaw, p);
    }, pitch);
    await capture(name);
  }
  await page.evaluate(() => grate());
  await capture("east-grate");
  if (!old)
    for (let gun = 1; gun <= 6; gun++) {
      await page.evaluate((gun) => pickup(gun), gun);
      await capture("weapon-" + gun);
      if (gun === 5) {
        const result = await page.evaluate(() => {
          const before = fixture.state();
          fixture.tick(0, before.yaw, 0, false, 5, true);
          return {
            before: before.ammo,
            after: fixture.state().ammo,
            events: JSON.parse(fixture.engine.events()),
          };
        });
        assert.equal(result.after, result.before - 1);
        assert(
          result.events.some(
            (e) =>
              e.kind === "shot" &&
              e.actor === 0 &&
              e.detail === "Rocket launcher",
          ),
        );
        await capture("rocket-shot");
      }
    }
  await page.evaluate(() => fixture.settle());
  const combat = await page.evaluate(() => {
    let seen = false,
      closestDistance = Infinity,
      closeTick = null,
      dead = false,
      respawn = false;
    const moments = [];
    for (let i = 0; i < 20000; i++) {
      const { s, range, events } = window.combat();
      if (!seen && s.visible && range > 220 && s.health > 0) {
        seen = true;
        moments.push(["corridor", i]);
      }
      if (
        s.visible &&
        s.health > 0 &&
        s.botHealth > 0 &&
        range < Math.min(220, closestDistance) &&
        Math.abs(s.pos[2] - s.bot[2]) < 20
      ) {
        closestDistance = range;
        closeTick = i;
      }
      for (const e of events) {
        if (e.actor !== 1 || !s.visible || s.health <= 0) continue;
        if (
          (e.kind === "pain" || e.kind === "shot") &&
          !moments.some(([n]) => n === e.kind)
        )
          moments.push([e.kind, i]);
        if (e.kind === "death" && !dead) {
          dead = true;
          moments.push(["death", i + 65]);
        }
      }
      if (dead && events.some((e) => e.kind === "respawn" && e.actor === 1))
        respawn = true;
      if (respawn && s.visible && s.botHealth > 0) {
        moments.push(["respawned", i]);
        break;
      }
      if (s.winner !== null) break;
    }
    if (closeTick !== null) moments.push(["close", closeTick]);
    return moments.sort((a, b) => a[1] - b[1]);
  });
  await page.evaluate(() => fixture.settle());
  let last = -1;
  for (const [name, tick] of combat) {
    await page.evaluate((n) => {
      for (let i = 0; i < n; i++) window.combat();
    }, tick - last);
    await capture("combat-" + name);
    last = tick;
  }
  if (!old) {
    for (const name of [
      "corridor",
      "close",
      "shot",
      "pain",
      "death",
      "respawned",
    ])
      assert(
        combat.some(([n]) => n === name),
        "Missing combat observation " + name,
      );
    const temp = await fs.mkdtemp(path.join(tmpdir(), "temblor-frames-"));
    try {
      await page.evaluate(() => fixture.settle());
      const ticks = new Set();
      for (const [, tick] of combat) {
        const start = Math.max(0, Math.floor((tick - 64) / 8) * 8);
        for (let i = start; i <= tick + 96; i += 8) ticks.add(i);
      }
      last = -1;
      const cameras = [];
      for (const tick of [...ticks].sort((a, b) => a - b)) {
        const s = await page.evaluate((n) => {
          for (let i = 0; i < n; i++) window.combat();
          fixture.draw();
          return fixture.state();
        }, tick - last);
        await page.screenshot({
          path: path.join(
            temp,
            String(cameras.length).padStart(4, "0") + ".jpg",
          ),
          type: "jpeg",
          quality: 86,
        });
        cameras.push({
          ms: s.ms,
          eye: [...s.pos.slice(0, 2), s.pos[2] + 26],
          yaw: s.yaw,
          pitch: s.pitch,
        });
        last = tick;
      }
      execFileSync("ffmpeg", [
        "-loglevel",
        "error",
        "-y",
        "-framerate",
        "125/8",
        "-i",
        path.join(temp, "%04d.jpg"),
        "-c:v",
        "libx264",
        "-crf",
        "21",
        "-pix_fmt",
        "yuv420p",
        folder + "/combat.mp4",
      ]);
      report.video = {
        file: "combat.mp4",
        dimensions: [1280, 720],
        frames: cameras,
      };
    } finally {
      await fs.rm(temp, { recursive: true, force: true });
    }
  }
  console.log(old ? "baseline" : "revised", combat);
  await page.close();
}
async function display() {
  const page = await browser.newPage({
    viewport: { width: 960, height: 540 },
    deviceScaleFactor: 2,
  });
  await page.addInitScript(() => {
    const original = GPUCanvasContext.prototype.getCurrentTexture;
    GPUCanvasContext.prototype.getCurrentTexture = function () {
      const t = original.call(this);
      window.surfaceSize = [t.width, t.height];
      return t;
    };
    const create = GPUDevice.prototype.createTexture;
    GPUDevice.prototype.createTexture = function (d) {
      const t = create.call(this, d);
      if (d.format === "depth24plus") window.depthSize = [t.width, t.height];
      return t;
    };
    const write = GPUQueue.prototype.writeTexture;
    window.uploads = {};
    GPUQueue.prototype.writeTexture = function (dest, data, layout, size) {
      const t = dest.texture,
        k = t.width + "x" + t.height;
      const level = dest.mipLevel || 0;
      (window.uploads[k] ||= {})[level] = [
        size.width ?? size[0],
        size.height ?? size[1],
      ];
      return write.apply(this, arguments);
    };
  });
  await page.goto(revised);
  await page.click("#play");
  await page.waitForFunction(() => temblorReport.active);
  const build = (await (await page.request.get(revised + "/build.json")).json())
    .sourceRevision;
  report.revision = build;
  const adapter = await page.evaluate(async () => {
    const a = await navigator.gpu.requestAdapter();
    return {
      vendor: a.info.vendor,
      architecture: a.info.architecture,
      limit: a.limits.maxTextureDimension2D,
      userAgent: navigator.userAgent,
    };
  });
  assert(!/swiftshader/i.test(JSON.stringify(adapter)));
  report.adapter = adapter;
  const cdp = await page.context().newCDPSession(page);
  for (const [mode, width, height, dpr] of [
    ["native", 960, 540, 2],
    ["performance", 960, 540, 2],
    ["performance", 850, 400, 2],
    ["native", 850, 400, 2],
    ["native", 850, 400, 1],
    ["native", 18000, 320, 1],
    ["native", 200, 18000, 1],
  ]) {
    await cdp.send("Emulation.setDeviceMetricsOverride", {
      width,
      height,
      deviceScaleFactor: dpr,
      mobile: false,
    });
    await page.evaluate((mode) => {
      const select = document.getElementById("resolution");
      select.value = mode;
      select.dispatchEvent(new Event("change"));
    }, mode);
    const scale = Math.min(
      1,
      (mode === "performance" ? 1280 : adapter.limit) / (width * dpr),
      adapter.limit / (height * dpr),
    );
    const expected = [
      Math.round(width * dpr * scale),
      Math.round(height * dpr * scale),
    ];
    await page.waitForFunction(
      (s) => surfaceSize.join() === s.join(),
      expected,
    );
    const sample = await page.evaluate(() => {
      const r = document.querySelector("#reticle").getBoundingClientRect(),
        s = temblorReport.state;
      return {
        ...temblorReport.display,
        dpr: devicePixelRatio,
        canvas: temblorReport.resolution,
        surface: surfaceSize,
        depth: depthSize,
        center: [r.x + r.width / 2, r.y + r.height / 2],
        eye: [...s.pos.slice(0, 2), s.pos[2] + 26],
        yaw: s.yaw,
        pitch: s.pitch,
        hudFont: getComputedStyle(document.querySelector("#hp")).fontSize,
      };
    });
    assert.deepEqual(sample.depth, expected);
    assert.deepEqual(sample.canvas, expected);
    assert.deepEqual(sample.center, [width / 2, height / 2]);
    report.display.push(sample);
    if (width === 960) {
      // CDP screenshots in device pixels capture the CSS upscaling in Performance.
      await page.screenshot({
        path: folder + "/display-" + mode + ".jpg",
        type: "jpeg",
        quality: 90,
      });
    }
  }
  const fixtures = await page.evaluate(() =>
    Object.fromEntries(
      Object.entries(temblorReport.info.textureSizes)
        .filter(([name]) =>
          [
            "concrete_dark.jpg",
            "bluemetalsupport2e.jpg",
            "metfloor1.jpg",
          ].includes(name.split("/").pop()),
        )
        .map(([name, size]) => [
          name,
          { base: size, uploaded: window.uploads[size.join("x")] },
        ]),
    ),
  );
  assert.equal(Object.keys(fixtures).length, 3);
  for (const { base, uploaded } of Object.values(fixtures)) {
    assert.deepEqual(uploaded[0], base);
    let d = base;
    for (let level = 0; ; level++) {
      assert.deepEqual(uploaded[level], d);
      if (d[0] === 1 && d[1] === 1) break;
      d = d.map((v) => Math.max(1, Math.floor(v / 2)));
    }
  }
  // Check relative mouse input in CSS pixels against the same known delta.
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width: 960,
    height: 540,
    deviceScaleFactor: 2,
    mobile: false,
  });
  assert.equal(report.display[0].hudFont, report.display[1].hudFont);
  const changes = [];
  for (const mode of ["native", "performance"]) {
    const before = await page.evaluate((mode) => {
      const el = document.querySelector("#resolution");
      el.value = mode;
      el.dispatchEvent(new Event("change"));
      const before = temblorReport.state.yaw;
      document.dispatchEvent(new MouseEvent("mousemove", { movementX: 20 }));
      return before;
    }, mode);
    await page.waitForFunction(
      (y) => Math.abs(temblorReport.state.yaw - y) > 0.01,
      before,
    );
    changes.push(
      await page.evaluate((y) => temblorReport.state.yaw - y, before),
    );
  }
  assert(
    Math.abs(changes[0] - changes[1]) < 1e-5 &&
      Math.abs(changes[0] + 0.044) < 1e-5,
  );
  report.mouseYawDeltas = changes;
  await page.evaluate(() => document.documentElement.requestFullscreen());
  await page.waitForFunction(
    () =>
      document.fullscreenElement &&
      surfaceSize.join() === temblorReport.resolution.join(),
  );
  report.fullscreen = await page.evaluate(() => ({
    css: temblorReport.display.css,
    surface: surfaceSize,
    depth: depthSize,
  }));
  await page.evaluate(() => document.exitFullscreen());
  report.textures = fixtures;
  await page.close();
}
try {
  if (base) await fixture(base, true);
  await fixture(revised, false);
  if (base) {
    for (const before of report.captures.filter((c) =>
      c.file.startsWith("before-"),
    )) {
      const after = report.captures.find(
        (c) => c.file === before.file.substring(7),
      );
      for (const k of [
        "eye",
        "yaw",
        "pitch",
        "ms",
        "dimensions",
        "bot",
        "botHealth",
      ])
        assert.deepEqual(after[k], before[k]);
    }
  }
  await display();
} finally {
  await fs.writeFile(
    folder + "/observations.json",
    JSON.stringify(report, null, 2) + "\n",
  );
  await browser.close();
}
