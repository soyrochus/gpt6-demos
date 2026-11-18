import { Store, hash } from "../apps/server/src/storage/store";
import {
  docker,
  dockerAvailable,
  templateRoot,
  trustedTemplate,
} from "../apps/server/src/modules/execution";
import { join } from "node:path";
const s = new Store(process.env.TRACEWORK_DATA_DIR || ".tracework-data");
if (!(await dockerAvailable()))
  throw new Error(
    "Docker is unavailable. No generated commands will run on the host.",
  );
const pull = await docker([
  "pull",
  "--platform",
  "linux/amd64",
  "oven/bun:1.4.4",
]);
if (pull.code) throw new Error(pull.err);
const inspect = await docker([
  "image",
  "inspect",
  "oven/bun:1.4.4",
  "--format",
  "{{index .RepoDigests 0}}",
]);
const base = inspect.out.trim();
if (!/^oven\/bun@sha256:[a-f0-9]{64}$/.test(base))
  throw new Error("Could not pin the base image digest");
const build = await docker([
  "build",
  "--platform",
  "linux/amd64",
  "--build-arg",
  `BUN_BASE=${base}`,
  "--tag",
  "tracework-runner:1",
  templateRoot,
]);
if (build.code) throw new Error(build.err);
const image = await docker([
  "image",
  "inspect",
  "tracework-runner:1",
  "--format",
  "{{.Id}}",
]);
await Bun.write(
  join(s.root, "runner-profile.json"),
  JSON.stringify(
    {
      imageId: image.out.trim(),
      baseDigest: base,
      platform: "linux/amd64",
      bunVersion: "1.4.4",
      templateHash: hash(JSON.stringify(await trustedTemplate())),
      qualified: false,
    },
    null,
    2,
  ),
);
console.log(
  "Pinned runner prepared. Run bun run test:execution to qualify its fixed harness and isolation profile.",
);
s.close();
