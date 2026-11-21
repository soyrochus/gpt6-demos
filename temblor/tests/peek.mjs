// SPDX-License-Identifier: GPL-2.0-or-later
import assert from "node:assert/strict";
import { launchChrome } from "./chromium.mjs";
import { fileURLToPath } from "node:url";

const browser = await launchChrome({ headless: true });
try {
  const page = await browser.newPage({
    viewport: { width: 1280, height: 800 },
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(process.env.TEMBLOR_URL || "http://127.0.0.1:8080");
  const controls = page.locator("#controlsLevel"),
    lobby = page.locator("#lobbyLevel");
  assert.equal(await lobby.inputValue(), "3");
  await page.click("#help");
  assert.equal(await page.locator("#peekButton").isDisabled(), true);
  await controls.focus();
  await page.keyboard.press("Home");
  assert.equal(await controls.inputValue(), "0");
  await page.keyboard.press("Escape");
  assert.equal(await lobby.inputValue(), "0");

  // Advance scored-match scenarios using the shipping simulation.
  await page.evaluate(async () => {
    const { Engine } = await import("./pkg/temblor.js");
    const load = Engine.prototype.load;
    const geometry = Engine.prototype.peek_geometry;
    window.geometryReads = [];
    Engine.prototype.peek_geometry = function () {
      const mesh = geometry.call(this);
      geometryReads.push({
        archive: temblorReport.info.archive,
        triangles: mesh.length / 14,
      });
      return mesh;
    };
    Engine.prototype.load = function (...args) {
      const report = load.apply(this, args);
      window.matchEngine = this;
      return report;
    };
  });
  const active = () => page.waitForFunction(() => temblorReport.active);
  const state = () => page.evaluate(() => temblorReport.state);
  const paused = () => page.waitForFunction(() => !temblorReport.active);
  const pose = (s) => [s.pos, s.yaw, s.pitch];
  const marker = () =>
    page
      .locator("#peekYou")
      .evaluate((el) => [
        el.style.transform,
        el.firstElementChild.style.transform,
      ]);
  await page.click("#play");
  await active();
  assert.equal((await state()).botLevel, 0);
  await page.waitForFunction(() => temblorReport.state.ms > 400);
  await page.keyboard.down("p");
  await page.waitForSelector("#peek[open]");
  await page.keyboard.down("p");
  await page.keyboard.up("p");
  assert(await page.locator("#peek").isVisible());
  const frozen = await state(),
    before = await marker();
  await page.locator("#peek").screenshot({ path: "evidence/peek.png" });
  const view = await page.locator("#peekCanvas").boundingBox();
  const x = view.x + view.width / 2,
    y = view.y + view.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 85, y + 35, { steps: 6 });
  await page.mouse.up();
  assert.notDeepEqual(await marker(), before);
  const orbited = await marker();
  await page.mouse.wheel(0, -180);
  await page.waitForFunction(
    (s) => document.querySelector("#peekYou").style.transform !== s,
    orbited[0],
  );
  assert.deepEqual(await state(), frozen);
  await page.keyboard.press("p");
  await active();
  assert.deepEqual(pose(await state()), pose(frozen));
  await page.mouse.move(x + 180, y + 60);
  await page.keyboard.down("w");
  await page.waitForFunction(
    (p) => Math.hypot(...temblorReport.state.pos.map((v, i) => v - p[i])) > 25,
    frozen.pos,
  );
  await page.keyboard.up("w");
  await page.keyboard.press("p");
  await page.waitForSelector("#peek[open]");
  const moved = await marker();
  assert.notDeepEqual(moved, before);
  assert.notEqual((await state()).yaw, frozen.yaw);
  await page.click("#closePeek");
  await active();

  await page.keyboard.press("Escape");
  await paused();
  await page.click("#help");
  await controls.selectOption("4");
  const scores = (await state()).scores;
  await page.locator("#controls .close").click();
  assert.equal(await lobby.inputValue(), "4");
  await page.click("#play");
  await active();
  assert.equal((await state()).botLevel, 4);
  assert.deepEqual((await state()).scores, scores);
  // Exercise a pause-level change with an actual frag already on the board.
  const advanceToScore = (score) =>
    page.evaluate((goal) => {
      for (let i = 0; i < 75000; i++) {
        matchEngine.tick(0, 0, 0, 0, 0, 0);
        if (
          i % 32 === 0 &&
          JSON.parse(matchEngine.snapshot()).scores[1] >= goal
        )
          return;
      }
      throw Error("Veteran did not reach score " + goal);
    }, score);
  await advanceToScore(1);
  await page.waitForFunction(() => temblorReport.state.scores[1] >= 1);
  await page.keyboard.press("Escape");
  await paused();
  const earned = (await state()).scores;
  await lobby.selectOption("0");
  await page.click("#play");
  await active();
  assert.equal((await state()).botLevel, 0);
  assert.deepEqual((await state()).scores, earned);
  await page.keyboard.press("Escape");
  await paused();
  await lobby.selectOption("4");
  await page.click("#play");
  await active();
  assert.deepEqual((await state()).scores, earned);
  await advanceToScore(5);
  await page.getByRole("button", { name: "Rematch" }).waitFor();
  assert.equal(await lobby.inputValue(), "4");
  await page.click("#play");
  await active();
  assert.deepEqual((await state()).scores, [0, 0]);
  assert.equal((await state()).botLevel, 4);
  await page.keyboard.press("Escape");
  await paused();
  await page.click("#import");
  await page
    .locator("#archives")
    .setInputFiles(
      fileURLToPath(new URL("../release/arena.pk3", import.meta.url)),
    );
  await page.selectOption("#maps", "maps/oa_rpg3dm2.bsp");
  await page.click("#enter");
  await active();
  assert.equal((await state()).botLevel, 4);
  assert.equal(
    await page.evaluate(() => temblorReport.info.archive),
    "arena.pk3",
  );
  await page.keyboard.press("p");
  await page.waitForSelector("#peek[open]");
  await page.keyboard.press("p");
  await active();
  await page.keyboard.press("Escape");
  await paused();
  await page.click("#help");
  await page.click("#peekButton");
  await page.waitForSelector("#peek[open]");
  assert.equal(
    await page.locator("#peekMapName").textContent(),
    "Trial by Error",
  );
  const reads = await page.evaluate(() => geometryReads);
  assert.deepEqual(
    reads.map((r) => r.archive),
    ["temblor-arena.pk3", "arena.pk3"],
  );
  assert(reads.every((r) => r.triangles > 0));
  assert.equal(reads[0].triangles, reads[1].triangles);
  await page.keyboard.press("p");
  assert(await page.locator("#controls").isVisible());
  assert.equal(
    await page.evaluate(() => document.activeElement.id),
    "peekButton",
  );
  assert.equal(await page.evaluate(() => temblorReport.active), false);
  assert.deepEqual(errors, []);
  console.log(
    "PASS keyboard level selection, play and Controls Peek, orbit, zoom, freeze, pose, level change, rematch, local import",
  );
} finally {
  await browser.close();
}
