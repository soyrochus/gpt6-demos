// SPDX-License-Identifier: GPL-2.0-or-later
import { launchChrome } from "./chromium.mjs";
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
const browser = await launchChrome({ headless: true });
try {
  const url = process.env.TEMBLOR_URL || "http://127.0.0.1:8080";
  const unsupported = await browser.newPage();
  await unsupported.addInitScript(() =>
    Object.defineProperty(navigator, "gpu", { value: undefined }),
  );
  await unsupported.goto(url);
  await unsupported.waitForFunction(() =>
    document.querySelector("#status").textContent.includes("WebGPU is unavailable"),
  );
  await unsupported.close();
  const noAdapter = await browser.newPage();
  await noAdapter.addInitScript(() => {
    GPU.prototype.requestAdapter = async () => null;
  });
  await noAdapter.goto(url);
  await noAdapter.locator("#play:enabled").waitFor();
  assert.match(await noAdapter.locator("#status").textContent(), /chrome:\/\/flags\/#enable-vulkan/);
  await noAdapter.close();
  const page = await browser.newPage({
      viewport: { width: 1280, height: 720 },
    }),
    cdp = await page.context().newCDPSession(page);
  await page.addInitScript(() => {
    const request = Element.prototype.requestPointerLock;
    let deny = true;
    Element.prototype.requestPointerLock = function (...args) {
      if (deny) {
        deny = false;
        return Promise.reject(
          new DOMException("Test denial", "NotAllowedError"),
        );
      }
      return request.apply(this, args);
    };
  });
  await page.goto(url);
  await page.click("#play");
  await page.waitForFunction(() =>
    document.querySelector("#status").textContent.includes("denial"),
  );
  await page.click("#play");
  await page.waitForFunction(() => temblorReport.active);
  let x = 640,
    y = 360;
  await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y });
  await page.waitForTimeout(90);
  const steps = [],
    targets = [
      [-352, 160],
      [-96, 160],
    ];
  await page.keyboard.down("KeyW");
  for (const target of targets) {
    for (let i = 0; i < 150; i++) {
      const s = await page.evaluate(() => temblorReport.state);
      steps.push({ ms: s.ms, pos: s.pos, yaw: s.yaw });
      if (Math.hypot(target[0] - s.pos[0], target[1] - s.pos[1]) < 25) break;
      const yaw = Math.atan2(target[1] - s.pos[1], target[0] - s.pos[0]);
      const delta = Math.atan2(Math.sin(yaw - s.yaw), Math.cos(yaw - s.yaw));
      x -= Math.round(delta / 0.0022);
      await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y });
      await page.waitForTimeout(32);
    }
  }
  await page.keyboard.up("KeyW");
  await page.waitForTimeout(800);
  const r = await page.evaluate(() => ({
    events: temblorReport.events,
    state: temblorReport.state,
  }));
  assert(
    r.events.some(
      (e) =>
        e.actor === 0 &&
        e.kind === "pickup" &&
        e.detail === "weapon_rocketlauncher",
    ),
  );
  assert(r.events.some((e) => e.actor === 0 && e.kind === "jump pad"));
  await page.keyboard.press("Tab");
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => !temblorReport.active);
  await writeFile(
    "evidence/browser-route.json",
    JSON.stringify({ steps, ...r }, null, 2) + "\n",
  );
  console.log(
    "PASS unsupported GPU, denied pointer lock and retry, rocket pickup and jump pad.",
  );
} finally {
  await browser.close();
}
