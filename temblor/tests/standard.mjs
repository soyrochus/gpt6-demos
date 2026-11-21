// SPDX-License-Identifier: GPL-2.0-or-later
// Compare complete seeded matches with the Wasm release recorded before bot tuning.
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { launchChrome } from "./chromium.mjs";

const record = process.argv.includes("--record");
const baseline = new URL("../evidence/standard-replays.json", import.meta.url);
const browser = await launchChrome({ headless: true });
try {
  const page = await browser.newPage();
  const origin = process.env.TEMBLOR_URL || "http://127.0.0.1:8080";
  await page.route("**/replay-fixture", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<canvas></canvas>",
    }),
  );
  await page.goto(origin + "/replay-fixture");
  const matches = await page.evaluate(async (record) => {
    const {
      default: init,
      Engine,
      Packages,
    } = await import("./pkg/temblor.js");
    await init();
    async function pack(name) {
      const p = new Packages();
      p.mount(name, new Uint8Array(await (await fetch(name)).arrayBuffer()));
      return p;
    }
    const engine = await Engine.create(document.querySelector("canvas"));
    const map = await pack("arena.pk3"),
      actors = await pack("actors.pk3");
    const results = [];
    for (const [seed, attack] of [
      [1813, false],
      [1848, true],
    ]) {
      engine.load(map, actors, "maps/oa_rpg3dm2.bsp", seed);
      if (!record) engine.set_bot_level(3);
      const trace = [],
        counts = {};
      let s = JSON.parse(engine.snapshot());
      while (s.winner === null && s.ms < 600000) {
        const d = s.bot.map((v, i) => v - s.pos[i]);
        const yaw = attack ? Math.atan2(d[1], d[0]) : s.yaw;
        const pitch = attack ? Math.atan2(d[2], Math.hypot(d[0], d[1])) : 0;
        const fire = attack && s.visible && s.botHealth > 0;
        engine.tick(0, 0, yaw - s.yaw, pitch - s.pitch, fire ? 4 : 0, 0);
        s = JSON.parse(engine.snapshot());
        const events = JSON.parse(engine.events());
        for (const e of events) counts[e.kind] = (counts[e.kind] || 0) + 1;
        trace.push(
          JSON.stringify([
            s.ms,
            s.pos,
            s.yaw,
            s.pitch,
            s.bot,
            s.health,
            s.armor,
            s.botHealth,
            s.gun,
            s.ammo,
            s.owned,
            s.scores,
            s.winner,
            events,
          ]),
        );
      }
      const bytes = new TextEncoder().encode(trace.join("\n"));
      const hash = await crypto.subtle.digest("SHA-256", bytes);
      results.push({
        seed,
        attack,
        ms: s.ms,
        scores: s.scores,
        counts,
        sha256: [...new Uint8Array(hash)]
          .map((b) => b.toString(16).padStart(2, "0"))
          .join(""),
      });
    }
    return results;
  }, record);
  assert(matches.every((m) => m.scores.includes(5)));
  if (record) {
    const { sourceRevision } = await (
      await page.request.get(origin + "/build.json")
    ).json();
    await writeFile(
      baseline,
      JSON.stringify({ sourceRevision, matches }, null, 2) + "\n",
    );
  } else {
    assert.deepEqual(matches, JSON.parse(await readFile(baseline)).matches);
  }
  console.log(matches);
} finally {
  await browser.close();
}
