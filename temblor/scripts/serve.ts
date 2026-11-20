// SPDX-License-Identifier: GPL-2.0-or-later
import { join } from "node:path";

const release = join(import.meta.dir, "../release");
const manifest = await Bun.file(join(release, "build.json")).json();
const files = new Map<string, string>();
for (const name of ["build.json", ...Object.keys(manifest.files)]) {
  files.set("/" + name, join(release, name));
}
files.set("/", files.get("/index.html")!);

const server = Bun.serve({
  hostname: "127.0.0.1",
  port: Number(process.env.PORT || 3015),
  fetch(request) {
    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response(null, { status: 405, headers: { Allow: "GET, HEAD" } });
    }
    const path = files.get(new URL(request.url).pathname);
    if (!path) return new Response("Not found", { status: 404 });
    // BunFile caches its size. Open the current build on each request.
    const file = Bun.file(path);
    return new Response(request.method === "HEAD" ? null : file, {
      headers: {
        "Content-Type": file.type,
        "Cache-Control": "no-cache",
        ...(request.method === "HEAD" ? { "Content-Length": String(file.size) } : {}),
      },
    });
  },
});
console.log(`Temblor is at ${server.url} — click Play.`);
