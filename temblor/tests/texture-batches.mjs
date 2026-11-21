// SPDX-License-Identifier: GPL-2.0-or-later
// The same solid colors must produce the same pixels at any source dimensions.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { launchChrome } from "./chromium.mjs";

function fixture(mode) {
  return execFileSync(
    "python3",
    [
      "-c",
      `
import io, pathlib, struct, sys, zipfile
out = io.BytesIO()
frames = []
with zipfile.ZipFile("assets/arena.pk3") as source, zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as target:
    for i, name in enumerate(source.namelist()):
        if name.startswith("textures/"):
            width = 16 if sys.argv[1] == "one" else 16 + i
            color = bytes((i * 41 % 256, i * 73 % 256, i * 113 % 256))
            header = struct.pack("<BBBHHBHHHHBB", 0, 0, 2, 0, 0, 0, 0, 0, width, 16, 24, 32)
            frame = str(pathlib.PurePosixPath(name).with_suffix(".tga"))
            target.writestr(frame, header + color * (width * 16))
            frames.append(frame)
        else:
            target.writestr(name, source.read(name))
    count = 16 if sys.argv[1] == "overflow" else 3
    shader = "textures/base_floor/clang_floor { { animMap 6 " + " ".join(frames[:count]) + " } }"
    target.writestr("scripts/zz_texture_batches.shader", shader)
sys.stdout.buffer.write(out.getvalue())
`,
      mode,
    ],
    { maxBuffer: 8 << 20 },
  );
}

const browser = await launchChrome({ headless: true });
try {
  const origin = process.env.TEMBLOR_URL || "http://127.0.0.1:8080";
  const hashes = [];
  for (const many of [false, true]) {
    const page = await browser.newPage({
      viewport: { width: 480, height: 270 },
    });
    await page.route("**/batch-fixture", (route) =>
      route.fulfill({
        contentType: "text/html",
        body: '<style>*{margin:0}canvas{display:block}</style><canvas width="480" height="270"></canvas>',
      }),
    );
    const bytes = fixture(many ? "many" : "one");
    await page.route("**/colors.pk3", (route) =>
      route.fulfill({ body: bytes }),
    );
    await page.goto(origin + "/batch-fixture");
    const sizeCount = await page.evaluate(async () => {
      const {
        default: init,
        Engine,
        Packages,
      } = await import("./pkg/temblor.js");
      await init();
      const pack = async (name) => {
        const result = new Packages();
        result.mount(
          name,
          new Uint8Array(await (await fetch(name)).arrayBuffer()),
        );
        return result;
      };
      const engine = await Engine.create(document.querySelector("canvas"));
      engine.resize(480, 270);
      const actors = await pack("actors.pk3");
      window.loadColors = async (name) =>
        JSON.parse(
          engine.load(await pack(name), actors, "maps/oa_rpg3dm2.bsp", 1813),
        );
      const info = await loadColors("colors.pk3");
      window.redraw = () => engine.frame(1);
      window.drawAngle = (angle) => {
        const state = JSON.parse(engine.snapshot());
        engine.tick(0, 0, angle - state.yaw, 0, 0, 0);
        for (let i = 0; i < 24; i++) engine.tick(0, 0, 0, 0, 0, 0);
        redraw();
      };
      return new Set(
        Object.values(info.textureSizes).map((size) => size.join("x")),
      ).size;
    });
    assert.ok(many ? sizeCount > 15 : sizeCount <= 15);
    const hashView = async () =>
      createHash("sha256")
        .update(await page.screenshot())
        .digest("hex");
    const views = [];
    for (const angle of [0, 1.6, 3.2, 4.8]) {
      await page.evaluate((angle) => drawAngle(angle), angle);
      views.push(await hashView());
    }
    assert.equal(
      new Set(views).size,
      4,
      "rotating the camera must produce four distinct images",
    );
    hashes.push(views);
    if (many) {
      const bad = fixture("overflow");
      await page.route("**/overflow.pk3", (route) =>
        route.fulfill({ body: bad }),
      );
      await assert.rejects(
        page.evaluate(() => loadColors("overflow.pk3")),
        /textures\/base_floor\/clang_floor: one material exceeds 15 distinct texture sizes/,
      );
      await page.evaluate(() => redraw());
      assert.equal(
        await hashView(),
        views.at(-1),
        "failed import must preserve the previous scene",
      );
    }
    console.log(sizeCount, "texture dimensions across four views");
    await page.close();
  }
  assert.deepEqual(
    hashes[0],
    hashes[1],
    "changing only solid texture dimensions changed the rendered pixels",
  );
} finally {
  await browser.close();
}
