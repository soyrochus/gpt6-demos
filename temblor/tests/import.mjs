// SPDX-License-Identifier: GPL-2.0-or-later
import { launchChrome } from "./chromium.mjs";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
const dir = await mkdtemp(path.join(tmpdir(), "temblor-test-"));
const browser = await launchChrome({ headless: true });
try {
  execFileSync("python3", [
    "-c",
    `
import sys,zipfile,pathlib
d=pathlib.Path(sys.argv[1]);z=zipfile.ZipFile('assets/arena.pk3');bsp='maps/oa_rpg3dm2.bsp'
with zipfile.ZipFile(d/'pak0.pk3','w') as a,zipfile.ZipFile(d/'pak2.pk3','w') as b:
 for n in z.namelist():
  f=z.read(n);a.writestr(n,f)
  if n==bsp or n.startswith('textures/base_light/'):b.writestr(n,f)
for name,data in [('bad-bsp',b'invalid'),('wrong-version',b'IBSP'+(47).to_bytes(4,'little')+bytes(150)),('missing',z.read(bsp))]:
 with zipfile.ZipFile(d/(name+'.pk3'),'w') as a:a.writestr(bsp,data)
with zipfile.ZipFile(d/'community.pk3','w') as a:
 for name in z.namelist():
  if name != 'textures/base_floor/metalbridge04d.jpg':
   a.writestr(name.replace('maps/oa_rpg3dm2.', 'Maps/Community-Duel.'),z.read(name))
 a.writestr('scripts/test_fog.shader','textures/base_floor/metalbridge04d { fogparms ( 1 1 1 ) 800 }')
 a.writestr('maps/incompatible.bsp',b'IBSP'+(47).to_bytes(4,'little')+bytes(150))
with zipfile.ZipFile(d/'assets-only.pk3','w') as a:a.writestr('notes/example.bsp',b'')
(d/'corrupt.pk3').write_bytes(b'bad archive')`,
    dir,
  ]);
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  const requests = [];
  page.on("request", (r) =>
    requests.push({ method: r.method(), url: r.url() }),
  );
  await page.goto(process.env.TEMBLOR_URL || "http://127.0.0.1:8080");
  await page.locator("#play:enabled").waitFor();
  await page.click("#play");
  await page.waitForFunction(() => temblorReport.active);
  const pause = async () => {
    await page.keyboard.press("Escape");
    await page.waitForFunction(() => !temblorReport.active);
  };
  await pause();
  await page.click("#import");
  await page.locator("#files .close").click();
  await page.click("#play");
  await page.waitForFunction(() => temblorReport.active);
  await pause();
  const checks = [];
  const choose = async (names) => {
    if (!(await page.locator("#files").isVisible()))
      await page.click("#import");
    await page
      .locator("#archives")
      .setInputFiles(names.map((n) => path.join(dir, n + ".pk3")));
  };
  await choose(["corrupt"]);
  await page.waitForFunction(() =>
    document.querySelector("#importStatus").textContent.includes("Invalid PK3"),
  );
  checks.push("corrupt PK3");
  await choose(["assets-only"]);
  await page.waitForFunction(() =>
    document
      .querySelector("#importStatus")
      .textContent.includes("No maps found"),
  );
  assert.equal(await page.locator("#enter").isDisabled(), true);
  checks.push("archive without maps");
  for (const [file, expected] of [
    ["bad-bsp", "IBSP"],
    ["wrong-version", "version"],
    ["missing", "Missing"],
  ]) {
    await choose([file]);
    await page.click("#enter");
    await page.waitForFunction(
      (s) => document.querySelector("#importStatus").textContent.includes(s),
      expected,
    );
    checks.push(file);
  }
  await page.locator("#files .close").click();
  await page.click("#play");
  await page.waitForFunction(() => temblorReport.active);
  assert.equal(
    await page.evaluate(() => temblorReport.info.archive),
    "temblor-arena.pk3",
  );
  await pause();
  for (const order of [
    ["pak2", "pak0"],
    ["pak0", "pak2"],
  ]) {
    await choose(order);
    await page.selectOption("#maps", "maps/oa_rpg3dm2.bsp");
    await page.click("#enter");
    await page.waitForFunction(() => temblorReport.active);
    const info = await page.evaluate(() => temblorReport.info);
    assert.equal(info.archive, "pak2.pk3");
    assert(Object.values(info.resources).includes("pak0.pk3"));
    assert(Object.values(info.resources).includes("pak2.pk3"));
    await pause();
    checks.push(order.join(" then "));
  }
  await choose(["community"]);
  await page.locator("#maprow").waitFor();
  assert.deepEqual(
    await page
      .locator("#maps option")
      .evaluateAll((options) => options.map((o) => o.value)),
    ["maps/community-duel.bsp", "maps/incompatible.bsp"],
  );
  await page.selectOption("#maps", "maps/incompatible.bsp");
  await page.click("#enter");
  await page.waitForFunction(() =>
    document
      .querySelector("#importStatus")
      .textContent.includes("Unsupported BSP version 47"),
  );
  await page.selectOption("#maps", "maps/community-duel.bsp");
  await page.click("#enter");
  await page.waitForFunction(
    () => temblorReport.active && temblorReport.state.ms > 0,
  );
  const custom = await page.evaluate(() => temblorReport.info);
  assert.equal(custom.map, "maps/community-duel.bsp");
  const stages = (name) => custom.materials.find((m) => m.name === name).stages;
  assert.equal(stages("textures/base_floor/metalbridge04d"), 0);
  assert.ok(stages("textures/liquids/vorwater") > 0);
  assert.ok(custom.warnings.some((w) => w.includes("fog volume shading")));
  checks.push("load a custom map by name after a sibling fails");
  assert(
    requests.every(
      (r) =>
        r.method === "GET" &&
        !r.url.includes("pak0.pk3") &&
        !r.url.includes("pak2.pk3"),
    ),
  );
  assert.deepEqual(errors, []);
  await writeFile(
    "evidence/import.json",
    JSON.stringify({ checks, errors, requests }, null, 2) + "\n",
  );
  console.log("PASS", checks);
} finally {
  await browser.close();
  await rm(dir, { recursive: true, force: true });
}
