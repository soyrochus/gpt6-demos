// SPDX-License-Identifier: GPL-2.0-or-later
import { expect, test } from "bun:test";
import { copyFile, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("the running portal service serves complete files after a rebuild", async () => {
  const root = await mkdtemp(join(tmpdir(), "temblor-serve-"));
  let server;
  try {
    const release = join(root, "release");
    await mkdir(release);
    await mkdir(join(root, "scripts"));
    await copyFile(new URL("../scripts/serve.ts", import.meta.url), join(root, "scripts/serve.ts"));
    await writeFile(join(release, "build.json"), JSON.stringify({ files: { "index.html": {} } }));
    await writeFile(join(release, "index.html"), "first build");
    server = Bun.spawn([process.execPath, "scripts/serve.ts"], {
      cwd: root, env: { ...process.env, PORT: "0" }, stdout: "pipe", stderr: "inherit",
    });
    const reader = server.stdout.getReader();
    const { value } = await reader.read();
    const url = new TextDecoder().decode(value).match(/http:\/\/127\.0\.0\.1:\d+\//)?.[0];
    expect(url).toBeDefined();
    expect(await (await fetch(url)).text()).toBe("first build");

    for (const html of ['Rebuilt page <script type="module" src="host.js"></script>', 'Shorter page']) {
      await writeFile(join(release, "index.html"), html);
      for (const path of ["", "index.html"]) {
        const head = await fetch(url + path, { method: "HEAD" });
        expect(head.headers.get("Content-Length")).toBe(String(Buffer.byteLength(html)));
        expect(await (await fetch(url + path)).text()).toBe(html);
      }
    }
  } finally {
    if (server) {
      server.kill();
      await server.exited;
    }
    await rm(root, { recursive: true, force: true });
  }
});
