// SPDX-License-Identifier: GPL-2.0-or-later
// Test driver only. Aim and locomotion use CDP mouse and keyboard events.
import { launchChrome } from "./chromium.mjs";
import fs from "node:fs/promises";
import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { observeResources } from "./chrome-resources.mjs";
const retailIndex = process.argv.indexOf("--retail"),
  retail = retailIndex >= 0 ? process.argv[retailIndex + 1] : null;
if (retailIndex >= 0 && !retail)
  throw Error("Usage: node tests/match.mjs --retail PATH_TO_BASEQ3");
const evidence = retail
  ? await fs.mkdtemp(path.join(tmpdir(), "temblor-retail-"))
  : "evidence";
const record = (name) => path.join(evidence, name);
const browser = await launchChrome({
  headless: process.env.HEADLESS === "1",
  args: [
    "--disable-renderer-backgrounding",
    "--disable-background-timer-throttling",
  ],
});
const result = { browser: browser.version(), matches: [], errors: [] },
  base = process.env.TEMBLOR_URL || "http://127.0.0.1:8080";
try {
  const page = await browser.newPage({
      viewport: { width: 1280, height: 720 },
    }),
    cdp = await page.context().newCDPSession(page);
  page.on("pageerror", (e) => result.errors.push(String(e)));
  page.on("response", (r) => {
    if (r.status() >= 400) result.errors.push(r.status() + " " + r.url());
  });
  await page.addInitScript(observeResources);
  async function capture() {
    for (let attempt = 0; attempt < 3; attempt++) {
      await page.bringToFront();
      await page.click("#play");
      await page.waitForFunction(
        () => temblorReport.active || !document.querySelector("#play").disabled,
      );
      if (await page.evaluate(() => temblorReport.active)) return;
      console.log("Capture retry", await page.locator("#status").textContent());
      await page.waitForTimeout(1400);
    }
    throw Error(
      "Capture failed: " + (await page.locator("#status").textContent()),
    );
  }
  const navAt = performance.now();
  await page.goto(base);
  await page.locator("#play:enabled").waitFor();
  console.log(
    "Adapter probe:",
    (await page.locator("#status").textContent()) || "ready",
  );
  await page.bringToFront();
  const coldAt = performance.now();
  if (retail) {
    const files = (await fs.readdir(retail))
      .filter((f) => /^pak\d+\.pk3$/i.test(f))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
      .map((f) => path.join(retail, f));
    if (!files.length) throw Error("Missing licensed baseq3 PK3 archives");
    result.mapSha256 = execFileSync(
      "python3",
      [
        "-c",
        "import sys,zipfile,hashlib; data=next(z.read(n) for f in reversed(sys.argv[1:]) for z in [zipfile.ZipFile(f)] for n in z.namelist() if n.lower()=='maps/q3dm1.bsp');print(hashlib.sha256(data).hexdigest())",
        ...files,
      ],
      { encoding: "utf8" },
    ).trim();
    await page.click("#import");
    await page.locator("#archives").setInputFiles(files);
    await page.selectOption("#maps", "maps/q3dm1.bsp");
    await page.click("#enter");
  } else await capture();
  await page.waitForFunction(
    () =>
      window.temblorReport.active ||
      (document.querySelector("#play").disabled === false &&
        document.querySelector("#status").textContent.length > 0),
  );
  if (!(await page.evaluate(() => temblorReport.active)))
    throw Error("Launch: " + (await page.locator("#status").textContent()));
  result.coldToControlMs = performance.now() - navAt;
  result.transfers = await page.evaluate(() =>
    performance
      .getEntriesByType("resource")
      .map((r) => ({ path: new URL(r.name).pathname, bytes: r.transferSize })),
  );
  result.build = await (await page.request.get(base + "/build.json")).json();
  result.playToControlMs = performance.now() - coldAt;
  result.device = await page.evaluate(async () => {
    const a = await navigator.gpu.requestAdapter();
    return {
      gpu: a.info.vendor,
      architecture: a.info.architecture,
      resolution: [1280, 720],
      dpr: devicePixelRatio,
      userAgent: navigator.userAgent,
    };
  });
  const count = Number(process.env.MATCHES || 2),
    frac = (x) => Math.atan2(Math.sin(x), Math.cos(x)),
    keys = new Set();
  let mouse = false,
    x = 640,
    y = 360;
  async function key(k, down) {
    if (keys.has(k) === down) return;
    if (down) {
      await page.keyboard.down(k);
      keys.add(k);
    } else {
      await page.keyboard.up(k);
      keys.delete(k);
    }
  }
  async function fire(down) {
    if (mouse === down) return;
    mouse = down;
    await cdp.send("Input.dispatchMouseEvent", {
      type: down ? "mousePressed" : "mouseReleased",
      x,
      y,
      button: "left",
      buttons: down ? 1 : 0,
      clickCount: 1,
    });
  }
  for (let round = 0; round < count; round++) {
    if (round) {
      await capture();
      assert.deepEqual(
        await page.evaluate(() => temblorReport.state.scores),
        [0, 0],
      );
    }
    x = 640;
    y = 360;
    await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y });
    await page.waitForTimeout(100);
    if (round)
      assert.deepEqual(
        await page.evaluate(() => [
          document.querySelector("#feed").textContent,
          document.querySelector("#reticle").classList.contains("hit"),
        ]),
        ["", false],
      );
    const offense = round % 2 === 0;
    let path = [],
      goal = null,
      plan = 0,
      lastPrint = -1,
      wasAlive = true,
      captured = false,
      previous = null;
    const trace = [];
    const start = Date.now();
    while (Date.now() - start < 360000) {
      const { s, active } = await page.evaluate(() => ({
        s: temblorReport.state,
        active: temblorReport.active,
      }));
      if (s.winner != null) break;
      if (!active) {
        console.log(
          "Paused mid-match",
          await page.locator("#status").textContent(),
        );
        await capture();
        for (const k of [...keys]) await key(k, false);
        await fire(false);
      }
      if (Math.floor(s.ms / 10000) > lastPrint) {
        lastPrint = Math.floor(s.ms / 10000);
        console.log(
          round,
          s.ms,
          s.pos.map(Math.round),
          s.scores,
          s.gun,
          s.ammo,
          s.visible,
        );
      }
      if (offense && s.health > 0) {
        if (!wasAlive) {
          path = [];
          goal = null;
          plan = 0;
        }
        const acquire = !s.owned[5] && s.ms < 45000;
        const engage = s.visible && s.botHealth > 0 && !acquire;
        if (s.ms > plan || goal === null) {
          let target = s.bot;
          if (acquire) {
            const items = await page.evaluate(async () =>
              (await import("./host.js")).inspectItems(),
            );
            target =
              items
                .filter(
                  (i) => i.class === "weapon_rocketlauncher" && i.next <= s.ms,
                )
                .sort(
                  (a, b) => distance(a.pos, s.pos) - distance(b.pos, s.pos),
                )[0]?.pos ?? s.bot;
          }
          if (!goal || distance(target, goal) > 80 || !path.length) {
            goal = target;
            path = await page.evaluate(
              async (p) => (await import("./host.js")).inspectRoute(p),
              target,
            );
          }
          plan = s.ms + 500;
        }
        while (
          path.length &&
          Math.hypot(path[0][0] - s.pos[0], path[0][1] - s.pos[1]) < 24 &&
          Math.abs(path[0][2] - s.pos[2]) < 56
        )
          path.shift();
        const to = engage ? s.bot : (path[0] ?? goal);
        const d = to.map((v, i) => v - s.pos[i]);
        if (engage && previous && s.ms > previous.ms) {
          const lead =
            s.gun === 5 ? Math.min(0.6, distance(s.pos, s.bot) / 900) : 0.035;
          for (const i of [0, 1])
            d[i] +=
              lead *
              Math.max(
                -320,
                Math.min(
                  320,
                  ((s.bot[i] - previous.bot[i]) * 1000) / (s.ms - previous.ms),
                ),
              );
        }
        const yaw = Math.atan2(d[1], d[0]),
          pitch = engage
            ? Math.atan2(d[2] - (s.gun === 5 ? 30 : 10), Math.hypot(d[0], d[1]))
            : 0;
        const mx = Math.round(-frac(yaw - s.yaw) / 0.0022),
          my = Math.round(-(pitch - s.pitch) / 0.0022);
        if (mx || my) {
          x += mx;
          y += my;
          await cdp.send("Input.dispatchMouseEvent", {
            type: "mouseMoved",
            x,
            y,
            buttons: mouse ? 1 : 0,
          });
        }
        await key("KeyW", !engage);
        await key("KeyD", engage && Math.floor(s.ms / 650) % 2 === 0);
        await key("KeyA", engage && Math.floor(s.ms / 650) % 2 === 1);
        await key(
          "Space",
          !engage && d[2] > 17 && Math.floor(s.ms / 140) % 2 === 0,
        );
        const w = s.owned[5] && s.ammo === 0 ? 2 : s.gun;
        if (w !== s.gun) await page.keyboard.press("Digit" + w);
        await fire(engage);
        if (engage && !captured) {
          await page.screenshot({ path: record("release-fight.png") });
          captured = true;
        }
      } else {
        await key("KeyW", false);
        await key("KeyA", false);
        await key("KeyD", false);
        await key("Space", false);
        await fire(false);
      }
      if (!trace.length || s.ms - trace.at(-1).ms >= 1000)
        trace.push({
          ms: s.ms,
          pos: s.pos,
          yaw: s.yaw,
          health: s.health,
          ammo: s.ammo,
          scores: s.scores,
          held: [...keys],
          fire: mouse,
        });
      previous = s;
      wasAlive = s.health > 0;
      await page.waitForTimeout(offense ? 65 : 350);
    }
    await key("KeyW", false);
    await key("Space", false);
    await fire(false);
    await key("KeyA", false);
    await key("KeyD", false);
    await cdp.send("HeapProfiler.collectGarbage");
    const resources = await page.evaluate(() => window.observedResources());
    const r = await page.evaluate(() => temblorReport);
    const events = r.events.filter((e) =>
      [
        "shot",
        "impact",
        "pain",
        "jump pad",
        "pickup",
        "frag",
        "suicide",
        "death",
        "respawn",
        "intermission",
      ].includes(e.kind),
    );
    const match = {
      round,
      resources,
      offense,
      state: r.state,
      events,
      trace,
      frames: r.frames,
    };
    result.matches.push(match);
    await fs.writeFile(
      record("release-matches.json"),
      JSON.stringify(result) + "\n",
    );
    assert.notEqual(r.state.winner, null, "match did not finish");
    console.log("winner", r.state.winner, r.state.ms);
    await page.screenshot({ path: record("release-intermission.png") });
  }
  assert.ok(result.matches.some((m) => m.state.winner === 0));
  if (count > 1) assert.ok(result.matches.some((m) => m.state.winner === 1));
  assert.deepEqual(result.errors, []);
  for (const m of result.matches.slice(1))
    assert.deepEqual(m.resources, result.matches[0].resources);
  if (retail) console.log("Private retail observations:", evidence);
} finally {
  await browser.close();
}
function distance(a, b) {
  return Math.hypot(...a.map((v, i) => v - b[i]));
}
