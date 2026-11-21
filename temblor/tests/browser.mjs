// SPDX-License-Identifier: GPL-2.0-or-later
import { launchChrome } from "./chromium.mjs";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
const browser = await launchChrome({
  headless: process.env.HEADLESS === "1",
  args: [
    "--disable-background-timer-throttling",
    "--disable-renderer-backgrounding",
  ],
});
try {
  const page = await browser.newPage({
    viewport:
      process.env.HEADLESS === "1" ? { width: 1280, height: 720 } : null,
  });
  const errors = [];
  page.on("pageerror", (e) => {
    errors.push(String(e));
    console.error(e);
  });
  page.on("console", (m) => {
    if (m.type() === "error") {
      errors.push(m.text());
      console.error(m.text());
    }
  });
  const base = process.env.TEMBLOR_URL || "http://127.0.0.1:8080";
  await page.goto(base);
  await page.locator("#play:enabled").waitFor();
  await page.screenshot({ path: "evidence/lobby.png" });
  console.log("probe", await page.locator("#status").textContent());
  await page.click("#play");
  await page
    .waitForFunction(() => window.temblorReport?.active, {}, { timeout: 30000 })
    .catch(async (e) => {
      throw Error((await page.locator("#status").textContent()) + " / " + e);
    });
  await page.waitForTimeout(1000);
  const state = () => page.evaluate(() => window.temblorReport.state);
  const before = await state();
  console.log("spawn", before);
  await page.screenshot({ path: "evidence/arena.png" });
  await page.keyboard.down("KeyW");
  await page.mouse.down();
  await page.waitForTimeout(400);
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => !window.temblorReport.active);
  await page.keyboard.up("KeyW");
  await page.mouse.up();
  const paused = await state();
  const shots = () =>
    page.evaluate(
      () =>
        temblorReport.events.filter((e) => e.kind === "shot" && e.actor === 0)
          .length,
    );
  const fired = await shots();
  assert.notDeepEqual(before.pos, paused.pos);
  assert(paused.ammo < before.ammo);
  await page.waitForTimeout(400);
  assert.equal((await state()).ms, paused.ms);
  await page.click("#play");
  await page.waitForFunction(() => window.temblorReport.active);
  await page.waitForTimeout(300);
  assert.equal(await shots(), fired);
  assert(
    Math.hypot(...(await state()).pos.map((v, i) => v - paused.pos[i])) < 0.5,
    "walked after resume",
  );
  const notices = await page.request.get(new URL("notices.html", base).href);
  assert(notices.ok());
  const source = await page.locator("#menu a").filter({ hasText: "Source on GitHub" }).getAttribute("href");
  assert.equal(source, "https://github.com/soyrochus/gpt6-demos/tree/main/temblor");
  assert.ok((await notices.text()).includes('href="' + source + '"'));
  const manifest = await (
    await page.request.get(new URL("build.json", base).href)
  ).json();
  const gpu = await page.evaluate(async () => {
    const a = await navigator.gpu.requestAdapter();
    return {
      vendor: a.info.vendor,
      architecture: a.info.architecture,
      description: a.info.description,
      userAgent: navigator.userAgent,
      dpr: devicePixelRatio,
    };
  });
  const result = {
    browser: browser.version(),
    gpu,
    wasm: manifest.files["pkg/temblor_bg.wasm"].sha256,
    sourceUrl: source,
    sourceRevision: manifest.sourceRevision,
    display: await page.evaluate(() => ({
      ...temblorReport.display,
      surface: temblorReport.resolution,
    })),
    errors,
    spawn: before,
    pause: paused,
  };
  await fs.writeFile(
    "evidence/browser-smoke.json",
    JSON.stringify(result, null, 2) + "\n",
  );
  assert.deepEqual(errors, []);
  console.log("PASS browser input, pause, resume", gpu);
} finally {
  await browser.close();
}
