import { join } from "node:path";
import { mkdir, chmod, symlink } from "node:fs/promises";
import { ensure } from "../../../../packages/contracts";
import type { Artifact, Run, Check } from "../../../../packages/contracts";
import { Store, now, hash } from "../storage/store";
import { validateGeneratedFiles } from "./artifacts";
export const templateRoot = join(
  import.meta.dir,
  "../../../../templates/bun-service",
);
const trustedPaths = [
  "package.json",
  "bun.lock",
  "tsconfig.json",
  ".bun-version",
  "src/index.ts",
  "harness/check.ts",
  "harness/acceptance.ts",
  "README.md",
];
export async function trustedTemplate(): Promise<Record<string, string>> {
  return Object.fromEntries(
    await Promise.all(
      trustedPaths.map(
        async (path) =>
          [path, await Bun.file(join(templateRoot, path)).text()] as const,
      ),
    ),
  );
}
export async function dockerAvailable() {
  try {
    const p = Bun.spawn(["docker", "info", "--format", "{{.ServerVersion}}"], {
      stdout: "pipe",
      stderr: "pipe",
      timeout: 3000,
    });
    await new Response(p.stderr).text();
    return (await p.exited) === 0;
  } catch {
    return false;
  }
}
export type RunnerProfile = {
  imageId: string;
  baseDigest: string;
  platform: "linux/amd64";
  bunVersion: string;
  templateHash: string;
  qualified: boolean;
};
export async function executionCapability(s: Store) {
  const file = Bun.file(join(s.root, "runner-profile.json"));
  if (!(await file.exists()))
    return {
      available: false,
      reason:
        "Prepare the pinned Docker runner with bun run execution:prepare. Execution checks: Not run.",
    };
  const profile = (await file.json()) as RunnerProfile;
  if (!profile.qualified)
    return {
      available: false,
      reason:
        "The prepared runner has not passed its isolation qualification. Execution checks: Not run.",
      profile,
    };
  return {
    available: await dockerAvailable(),
    reason:
      "Docker must be available with the qualified immutable runner image.",
    profile,
  };
}
async function docker(args: string[], signal?: AbortSignal) {
  const p = Bun.spawn(["docker", ...args], {
    stdout: "pipe",
    stderr: "pipe",
    env: { PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? "" },
  });
  const kill = () => p.kill();
  signal?.addEventListener("abort", kill, { once: true });
  async function tail(stream: ReadableStream<Uint8Array>, limit: number) {
    let result = "";
    const decoder = new TextDecoder();
    for await (const chunk of stream)
      result = (result + decoder.decode(chunk, { stream: true })).slice(-limit);
    return result;
  }
  const [out, err, code] = await Promise.all([
    tail(p.stdout, 60000),
    tail(p.stderr, 20000),
    p.exited,
  ]);
  signal?.removeEventListener("abort", kill);
  return { out: out.slice(-60000), err: err.slice(-20000), code };
}
export async function executeArtifact(
  s: Store,
  run: Run,
  signal: AbortSignal,
  fence: () => void,
  qualification = false,
) {
  const w = run.workspaceId,
    a = s.get<Artifact>("artifact", w, String(run.payload.artifactId));
  ensure(
    a.kind === "service-module",
    "INVALID_TARGET",
    "Only bounded Bun service modules can execute",
  );
  const capability = await executionCapability(s);
  ensure(
    capability.profile &&
      (capability.available || (qualification && (await dockerAvailable()))),
    "EXECUTION_UNAVAILABLE",
    capability.reason,
    412,
  );
  const profile = capability.profile;
  ensure(
    /^sha256:[a-f0-9]{64}$/.test(profile.imageId) &&
      profile.bunVersion === "1.4.4",
    "INVALID_RUNNER",
    "Runner must be a pinned Bun 1.4.4 image",
  );
  ensure(
    profile.templateHash === hash(JSON.stringify(await trustedTemplate())),
    "RUNNER_STALE",
    "Trusted template changed. Prepare and qualify a new runner image.",
  );
  const payload = JSON.parse(await s.blobFile(a.hash).text());
  const files = validateGeneratedFiles(payload.generated);
  const dir = join(s.root, "execution", run.id),
    input = join(dir, "input");
  await mkdir(input, { recursive: true });
  await chmod(input, 0o755);
  for (const f of files) {
    const p = join(input, f.path);
    await mkdir(join(p, ".."), { recursive: true });
    await Bun.write(p, f.content);
    await chmod(p, 0o444);
  }
  const contracts = Object.keys(a.manifest.inputArtifacts)
    .map((aid) => s.get<Artifact>("artifact", w, aid))
    .filter((a) => a.kind === "openapi");
  ensure(
    contracts.length === 1,
    "CONTRACT_REQUIRED",
    "Exactly one accepted API contract is required",
  );
  await Bun.write(
    join(input, "contract.json"),
    await s.blobFile(contracts[0]!.hash).text(),
  );
  await chmod(join(input, "contract.json"), 0o444);
  const packageDir = join(dir, "package");
  await mkdir(packageDir, { recursive: true });
  for (const [path, content] of Object.entries(await trustedTemplate())) {
    const target = join(packageDir, path);
    await mkdir(join(target, ".."), { recursive: true });
    await Bun.write(target, content);
    await chmod(target, 0o444);
  }
  for (const f of files) {
    const target = join(packageDir, f.path);
    await mkdir(join(target, ".."), { recursive: true });
    await Bun.write(target, f.content);
    await chmod(target, 0o444);
  }
  await symlink("/trusted/node_modules", join(packageDir, "node_modules"));
  const name = `tracework-${run.id}`;
  const command = [
    "run",
    "--name",
    name,
    "--label",
    `tracework.run=${run.id}`,
    "--platform",
    "linux/amd64",
    "--network",
    "none",
    "--read-only",
    "--cap-drop",
    "ALL",
    "--security-opt",
    "no-new-privileges",
    "--user",
    "65532:65532",
    "--cpus",
    "1",
    "--memory",
    "512m",
    "--pids-limit",
    "64",
    "--ulimit",
    "nofile=256:256",
    "--tmpfs",
    "/tmp:rw,noexec,nosuid,size=64m",
    "--mount",
    `type=bind,src=${packageDir},dst=/work,readonly`,
    "--mount",
    `type=bind,src=${input},dst=/input,readonly`,
    profile.imageId,
    "bun",
    "/trusted/harness/check.ts",
  ];
  const controller = new AbortController();
  const cancel = () => {
    controller.abort();
    void docker(["kill", name]);
  };
  signal.addEventListener("abort", cancel, { once: true });
  const timeout = setTimeout(cancel, 120000);
  const start = Date.now();
  let result;
  try {
    result = await docker(command, controller.signal);
  } finally {
    clearTimeout(timeout);
    signal.removeEventListener("abort", cancel);
    await docker(["rm", "-f", name]);
  }
  const checks: Check[] = [];
  try {
    const report = JSON.parse(result.out.trim().split("\n").at(-1)!);
    ensure(
      report.inputHash === a.hash ||
        report.contractHash ===
          hash(await Bun.file(join(input, "contract.json")).text()),
      "EXECUTION_HASH",
      "Runner contract hash mismatch",
    );
    for (const c of report.checks ?? []) checks.push(c);
  } catch {
    checks.push({
      id: "runner",
      origin: "deterministic",
      result: "block",
      message: "Runner did not produce a valid report",
      objectIds: [a.id],
    });
  }
  const passed =
    result.code === 0 &&
    !signal.aborted &&
    checks.length >= 5 &&
    checks.every((c) => c.result === "pass");
  const report = {
    id: run.id,
    workspaceId: w,
    artifactId: a.id,
    hash: a.hash,
    profile,
    command,
    exitCode: result.code,
    durationMs: Date.now() - start,
    stdout: result.out,
    stderr: result.err,
    checks,
    passed,
    createdAt: now(),
  };
  await Bun.write(join(dir, "report.json"), JSON.stringify(report, null, 2));
  fence();
  s.tx(() => {
    fence();
    s.insert("execution-report", w, report);
    s.update("artifact", w, {
      ...a,
      execution: { hash: a.hash, passed, runId: run.id, checks },
    });
  });
  return report;
}
export { docker };
