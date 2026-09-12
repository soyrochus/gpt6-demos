import { mkdir, rm, copyFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
export const root = resolve(import.meta.dir, '..');
const commit = 'acfbe3ce4be2b70dc664bdd6c5feb53c52f9ce3e';
const checksum = 'ddc10437e3cc7fcc2b18c0905f396e82d7a1cedccc88a05b3b86976cf4b77734';
export const nativeRoot = join(root, '.build/native');
export async function run(cmd: string[], cwd = root, env = process.env) {
  const child = Bun.spawn(cmd, { cwd, env, stdin: 'inherit', stdout: 'inherit', stderr: 'inherit' });
  if (await child.exited !== 0) throw new Error(`${cmd[0]} failed`);
}
const hash = (data: string | Uint8Array) => new Bun.CryptoHasher('sha256').update(data).digest('hex');
export async function buildNative() {
  if (process.platform !== 'linux' || process.arch !== 'x64') throw new Error('This release builds on Linux x64 with GTK3/WebKitGTK 4.1 and native Wayland. macOS is not yet validated.');
  await mkdir(nativeRoot, { recursive: true });
  const patch = join(root, 'native/europa-webview.patch');
  const rust = Bun.spawnSync(['rustc', '--version']).stdout.toString();
  const fingerprint = hash(checksum + await Bun.file(patch).text() + rust + process.platform + process.arch);
  const output = join(nativeRoot, 'native-window.node');
  if (await Bun.file(output).exists() && await Bun.file(join(nativeRoot, 'fingerprint')).text().catch(() => '') === fingerprint) return output;
  const archive = join(nativeRoot, 'upstream.tar.gz');
  if (!await Bun.file(archive).exists()) {
    const response = await fetch(`https://github.com/nativewindow/webview/archive/${commit}.tar.gz`);
    if (!response.ok) throw new Error(`Native source download failed: ${response.status}`);
    await Bun.write(archive, response);
  }
  if (hash(new Uint8Array(await Bun.file(archive).arrayBuffer())) !== checksum) throw new Error('Native source checksum mismatch; remove .build/native/upstream.tar.gz and retry.');
  const source = join(nativeRoot, `webview-${commit}`);
  await rm(source, { recursive: true, force: true });
  await run(['tar', '-xzf', archive, '-C', nativeRoot]);
  await run(['patch', '--fuzz=0', '-p1', '-i', patch], source);
  await run(['cargo', 'build', '--release', '--locked'], join(source, 'packages/webview'), { ...process.env, CARGO_TARGET_DIR: join(nativeRoot, 'target') });
  await copyFile(join(nativeRoot, 'target/release/libnative_window.so'), output);
  await Bun.write(join(nativeRoot, 'fingerprint'), fingerprint);
  return output;
}
if (import.meta.main) console.info(await buildNative());
