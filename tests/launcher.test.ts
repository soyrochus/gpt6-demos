import { expect, test } from "bun:test";
import { chmodSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { servePortal, validateBasePort } from "../portal-server";

const root = resolve(import.meta.dir, "..");
const demos = ["edificio-europa", "infinicave", "tonada", "tarot-spead", "orbital-mechanics-laboratory", "digital-logic-laboratory", "flip-slop", "codexcanvas", "assemblavatar", "one-more-match", "tracework", "dmt-experience"];

for (const base of [3000, 30000, 65523]) {
  test(`both portals link all demos at base ${base}`, async () => {
    const expected = demos.map((_, i) => `http://localhost:${base + i + 1}/`);
    const plain = await (await servePortal(new Request("http://localhost/"), base)).text();
    const links = [...plain.matchAll(/<a class="demo" href="([^"]+)" data-port-offset="[0-9]+"/g)].map(match => match[1]);
    expect(links).toEqual(expected);
    const preview = await (await servePortal(new Request("http://localhost/portal/"), base)).text();
    const data = JSON.parse(preview.match(/<script id="demo-data" type="application\/json">([\s\S]*?)<\/script>/)![1]);
    expect(data.filter((demo: { portOffset?: number }) => demo.portOffset !== undefined).map((demo: { url: string }) => demo.url)).toEqual(expected);
    expect(data.find((demo: { name: string }) => demo.name === "Tracework").video).toBe("BVBlbm_zQL0");
    const native = data.find((demo: { name: string }) => demo.name === "NotAVirus");
    expect(native.url).toBe("https://github.com/soyrochus/gpt6-demos/blob/main/not-a-virus/README.md");
    expect(native.launchLabel).toBe("Source and setup");
    expect(plain).toContain(native.url);
    const indices = [...preview.matchAll(/data-demo="(\d+)"/g)].map(match => Number(match[1]));
    expect(indices).toEqual(data.map((_: unknown, index: number) => index));
    expect(preview).toContain('id="demo-link-label"');
  });
}

test("portal routing retains redirect, HEAD, and source-file protection", async () => {
  const get = (path: string, method = "GET") => servePortal(new Request(`http://localhost${path}`, { method }), 30000);
  const redirect = await get("/portal");
  expect(redirect.status).toBe(308);
  expect(redirect.headers.get("Location")).toBe("/portal/");
  expect(await (await get("/portal/", "HEAD")).text()).toBe("");
  expect((await get("/run-all.sh")).status).toBe(404);
  for (const name of ["not-a-virus", "tracework", "dmt-experience"]) expect((await get(`/images/${name}.png`)).status).toBe(200);
  expect((await get("/%zz")).status).toBe(400);
  expect((await get("/", "POST")).status).toBe(405);
  for (const value of [0, -1, 65524, 3000.5, NaN]) expect(() => validateBasePort(value)).toThrow();
});

// Fake Bun commands exercise the actual launcher and its process groups without
// installing dependencies, binding demo ports, or disturbing running apps.
async function fixture(extraEnv: Record<string, string> = {}) {
  const dir = mkdtempSync(join(tmpdir(), "demo-launcher-test-"));
  await Bun.write(join(dir, "run-all.sh"), Bun.file(join(root, "run-all.sh")));
  for (const project of ["cross-talk", ...demos]) await Bun.write(join(dir, project, "package.json"), "{}");
  for (const asset of ["index.html", "portal-server.ts", "portal/index.html", "portal/portal.css", "portal/portal.js"]) await Bun.write(join(dir, asset), "fixture");
  const stub = join(dir, "bin", "bun");
  await Bun.write(stub, `#!/usr/bin/env bash
project="\${PWD##*/}"
printf '%s|%s|%s|%s|%s\\n' "$project" "\${PORT:-}" "\${ASSEMBLAVATAR_PORT:-}" "$*" "$$" >> "$CALL_LOG"
if [[ "$1" == install ]]; then
  [[ "$project" != "\${FAIL_INSTALL:-}" ]]
  exit $?
fi
if [[ "$*" == 'run build' ]]; then
  [[ -z "\${FAIL_BUILD:-}" ]]
  exit $?
fi
if [[ "$project" == "\${EXIT_PROJECT:-}" ]]; then
  sleep 0.3
  exit 7
fi
exec sleep 60
`);
  chmodSync(stub, 0o755);
  const calls = async () => (await Bun.file(join(dir, "calls")).text().catch(() => "")).trim().split("\n").filter(Boolean).map(line => line.split("|"));
  const start = (args: string[]) => Bun.spawn(["bash", join(dir, "run-all.sh"), ...args], {
    env: { ...process.env, PATH: `${join(dir, "bin")}:${process.env.PATH}`, CALL_LOG: join(dir, "calls"), ...extraEnv },
    stdout: "ignore", stderr: "ignore",
  });
  return { dir, calls, start, remove: () => rmSync(dir, { recursive: true, force: true }) };
}

for (const args of [[], ["30000"], ["65523"], ["03000"]]) {
  test(`launcher ports and cleanup: ${args[0] ?? "default"}`, async () => {
    const f = await fixture();
    const proc = f.start(args);
    let starts: string[][] = [];
    try {
      const deadline = Date.now() + 5000;
      while (Date.now() < deadline) {
        starts = (await f.calls()).filter(row => row[3].startsWith("run ") && row[3] !== "run build");
        if (starts.length === demos.length + 1) break;
        await Bun.sleep(20);
      }
      expect(starts.length).toBe(demos.length + 1);
      const base = Number(args[0] ?? 3000);
      for (const [i, name] of demos.entries()) {
        const row = starts.find(row => row[0] === name)!;
        expect(Number(row[1])).toBe(base + i + 1);
        expect(row[3]).toBe(name === "assemblavatar" || name === "tracework" ? "run start" : name === "one-more-match" ? "run dev:web" : "run dev");
        if (name === "assemblavatar") expect(Number(row[2])).toBe(base + 9);
      }
      expect(starts.filter(row => row[3] === "run portal-server.ts").map(row => Number(row[1]))).toEqual([base]);
      const calls = await f.calls();
      expect(calls.slice(0, demos.length + 1).every(row => row[3].startsWith("install --frozen-lockfile"))).toBe(true);
      expect([calls[demos.length + 1][0], calls[demos.length + 1][3]]).toEqual(["tracework", "run build"]);
      proc.kill("SIGTERM");
      expect(await proc.exited).toBe(143);
      for (const row of starts) expect(() => process.kill(Number(row[4]), 0)).toThrow();
    } finally {
      if (proc.exitCode === null) { proc.kill("SIGTERM"); await proc.exited; }
      f.remove();
    }
  }, 10000);
}

test("invalid arguments fail before installs; help succeeds", async () => {
  const f = await fixture();
  try {
    for (const args of [["0"], ["65524"], ["-1"], ["abc"], ["3000.5"], [""], ["3000", "3001"]]) expect(await f.start(args).exited).toBe(1);
    expect(await f.start(["--help"]).exited).toBe(0);
    expect(await f.calls()).toEqual([]);
  } finally { f.remove(); }
});

for (const env of [{ FAIL_INSTALL: "tonada" }, { FAIL_BUILD: "1" }]) {
  test(`setup failure starts no servers: ${Object.keys(env)[0]}`, async () => {
    const f = await fixture(env);
    try {
      expect(await f.start([]).exited).toBe(1);
      expect((await f.calls()).some(row => row[3].startsWith("run ") && row[3] !== "run build")).toBe(false);
    } finally { f.remove(); }
  });
}

test("a failed demo stops the other services", async () => {
  const f = await fixture({ EXIT_PROJECT: "tonada" });
  const proc = f.start(["30000"]);
  try {
    expect(await proc.exited).toBe(7);
    for (const row of (await f.calls()).filter(row => row[3].startsWith("run ") && row[3] !== "run build")) expect(() => process.kill(Number(row[4]), 0)).toThrow();
  } finally {
    if (proc.exitCode === null) { proc.kill("SIGTERM"); await proc.exited; }
    f.remove();
  }
}, 10000);
