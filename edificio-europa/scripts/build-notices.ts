import { dirname, join, resolve } from 'node:path';
import { readdir, realpath, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { root, nativeRoot } from './build-native';
export async function buildNotices() {
  const blocks: string[] = [await Bun.file(join(root,'native/THIRD-PARTY-NOTICES.md')).text(), await Bun.file(join(root,'native/LICENSE')).text()];
  const visited = new Set<string>();
  async function packageLicense(path: string) {
    path = await realpath(path); if(visited.has(path))return;visited.add(path);
    const manifest=await Bun.file(join(path,'package.json')).json();
    blocks.push(`\n## ${manifest.name} ${manifest.version}\n`);
    const files=(await readdir(path)).filter(name=>/^(licen[sc]e|copying|notice)([.-]|$)/i.test(name));
    for(const file of files) { const f=Bun.file(join(path,file)); if((await stat(join(path,file))).isFile() && f.size<300000)blocks.push(await f.text().catch(()=>'')); }
    for(const dependency of Object.keys(manifest.dependencies??{})) {
      let dependencyPath: string;
      try { dependencyPath=dirname(Bun.resolveSync(`${dependency}/package.json`,path)); }
      catch { continue; }
      await packageLicense(dependencyPath);
    }
  }
  for(const path of [join(root,'node_modules/three'),join(root,'../cross-talk/node_modules/openai'),join(root,'../cross-talk/node_modules/ajv')])await packageLicense(path);
  const cargoRoot=join(nativeRoot,'webview-acfbe3ce4be2b70dc664bdd6c5feb53c52f9ce3e/packages/webview');
  const tree=Bun.spawnSync(['cargo','tree','--locked','--offline','--target','x86_64-unknown-linux-gnu','--edges','normal,build','--prefix','none','--format','{p}'],{cwd:cargoRoot,stderr:'pipe'});
  if(tree.exitCode!==0)throw new Error('Could not enumerate native dependency licenses');
  const packages=[...new Set(tree.stdout.toString().split('\n').map(line=>/^([\w-]+) v([^ ]+)/.exec(line)).filter(Boolean).map(m=>`${m![1]}@${m![2]}`))].sort();
  const registryRoot=join(process.env.CARGO_HOME??join(homedir(),'.cargo'),'registry/src');
  const registries=await readdir(registryRoot);
  for(const pkg of packages) {
    const [name,version]=pkg.split('@');
    for(const registry of registries) {
      const path=join(registryRoot,registry,`${name}-${version}`);
      const files=await readdir(path).catch(()=>[]);const licenses=files.filter(name=>/^(licen[sc]e|copying|notice)([.-]|$)/i.test(name));
      if(!licenses.length)continue;
      blocks.push(`\n## Rust build/runtime component ${name} ${version}\n`);
      for(const file of licenses)if((await stat(join(path,file))).isFile())blocks.push(await Bun.file(join(path,file)).text());break;
    }
  }
  const bunNotice=join(root,'native/BUN-NOTICES.md');if(await Bun.file(bunNotice).exists())blocks.push(await Bun.file(bunNotice).text());
  return blocks.join('\n');
}
