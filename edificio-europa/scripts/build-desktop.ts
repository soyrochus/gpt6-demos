import { buildNotices } from './build-notices';
import { buildValidators } from './build-validators';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { root, nativeRoot, buildNative, run } from './build-native';
export async function buildDesktop(compile = true) {
  const addon = await buildNative();
  const output = join(root, '.build/desktop'); await mkdir(output, { recursive: true });
  const validators = await buildValidators(output);
  const frontend = await Bun.build({ plugins:[{name:'desktop-static-validation',setup(build){
    build.onResolve({filter:/^\.\/reference-media$/},()=>({path:join(root,'desktop/reference-media.ts')}));
    build.onLoad({filter:/cross-talk\/src\/protocol\/validation\.ts$/},async({path})=>({loader:'ts',contents:(await Bun.file(path).text()).replace("import Ajv from 'ajv';",`import ajv from ${JSON.stringify(validators)};`).replace(/const ajv = new Ajv\([^;]+;/,'')}));
    build.onResolve({filter:/^ajv\//},({path})=>({path:Bun.resolveSync(path,join(root,'../cross-talk'))}));
  }}], entrypoints: [join(root, 'frontend.ts')], target: 'browser', minify: true, define: { __EUROPA_DESKTOP__: 'true' } });
  const worklet = await Bun.build({ entrypoints: [join(root, '../cross-talk/src/desktop/worklet.ts')], target: 'browser', minify: true });
  for (const result of [frontend, worklet]) if (!result.success) throw new AggregateError(result.logs, 'Desktop browser asset build failed');
  const css = (await Bun.file(join(root, 'style.css')).text()).replace(/@import\s+url\([^)]*\)\s*;/g, '');
  const html = (await Bun.file(join(root, 'index.html')).text()).replace('./style.css', '/app.css').replace('./frontend.ts', '/app.js');
  const licenses = await buildNotices();
  const assets = { '/': { body: html, type: 'text/html; charset=utf-8' }, '/app.js': { body: await frontend.outputs[0]!.text(), type: 'text/javascript' }, '/app.css': { body: css, type: 'text/css' }, '/audio-worklet.js': { body: await worklet.outputs[0]!.text(), type: 'text/javascript' }, '/licenses': { body: licenses, type: 'text/plain; charset=utf-8' } };
  await Bun.write(join(output, 'assets.json'), JSON.stringify(assets));
  await Bun.write(join(output,'manifest.json'),JSON.stringify({bun:Bun.version,platform:process.platform,arch:process.arch,assets:Object.entries(assets).map(([path,asset])=>({path,bytes:Buffer.byteLength(asset.body),sha256:new Bun.CryptoHasher('sha256').update(asset.body).digest('hex')}))},null,2));
  const destination = compile ? join(root, 'dist/edificio-europa-linux-x64') : join(output, 'host.js');
  await mkdir(join(root, 'dist'), { recursive: true });
  const result = await Bun.build({ entrypoints: [join(root, 'desktop/main.ts')], target: 'bun', minify: compile, sourcemap: 'none',
    ...(compile ? { compile: { target: 'bun-linux-x64', outfile: destination, autoloadDotenv: true, autoloadBunfig: false } } as const : { outdir: output, naming: 'host.js' }),
    plugins: [{ name: 'europa-embedded-desktop', setup(build) {
      build.onResolve({ filter: /^europa:/ }, ({ path }) => ({ path, namespace: 'europa' }));
      build.onLoad({ filter: /.*/, namespace: 'europa' }, ({ path }) => ({ loader: 'js', contents: path === 'europa:assets' ? `export default ${JSON.stringify(assets)};` : `export default () => require(${JSON.stringify(addon)});` }));
    } }],
  });
  if (!result.success) throw new AggregateError(result.logs, 'Desktop host build failed');
  console.info(`${compile ? 'Executable' : 'Development host'}: ${destination}`);
  return destination;
}
if (import.meta.main) {
  const dev = process.argv.includes('--dev'); const path = await buildDesktop(!dev);
  if (dev) await run([process.execPath, path], root);
}
