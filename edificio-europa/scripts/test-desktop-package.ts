/** Relocation/config checks run against the actual shipped executable with a synthetic home and no Bun on PATH. */
import { mkdtemp, mkdir, copyFile, chmod, rm, readdir, readlink } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { root } from './build-native';
const directory = await mkdtemp(join(tmpdir(), 'europa-package-'));
const assert = (ok: unknown, message: string) => { if (!ok) throw new Error(message); };
try {
  const binary = join(directory, 'europa'); await copyFile(join(root, 'dist/edificio-europa-linux-x64'), binary); await chmod(binary, 0o755);
  const home = join(directory, 'home'); await mkdir(join(home, '.conf/crosstalk'), { recursive: true });
  const env = { PATH: '/usr/bin:/bin', HOME: home, WAYLAND_DISPLAY: process.env.WAYLAND_DISPLAY, XDG_RUNTIME_DIR: process.env.XDG_RUNTIME_DIR, DBUS_SESSION_BUS_ADDRESS: process.env.DBUS_SESSION_BUS_ADDRESS };
  const diagnose = async (extra: Record<string,string> = {}) => {
    const p = Bun.spawn([binary,'--diagnostics'],{cwd:directory,env:{...env,...extra},stdout:'pipe',stderr:'pipe'});
    const text=await new Response(p.stdout).text();assert(await p.exited===0,'Compiled diagnostics failed');return JSON.parse(text);
  };
  const shared=join(home,'.conf/crosstalk/crosstalk.cfg');
  await Bun.write(shared,'OPENAI_API_KEY=synthetic-shared-sentinel\nCROSSTALK_VOICE=quartz\n');
  let diagnostics=await diagnose();assert(diagnostics.voiceEnabled && diagnostics.provenance.OPENAI_API_KEY==='shared','Shared configuration not loaded in relocated executable');
  await Bun.write(join(directory,'.env'),'OPENAI_API_KEY=\nCROSSTALK_VOICE=quartz\n');
  diagnostics=await diagnose();assert(!diagnostics.voiceEnabled && diagnostics.provenance.OPENAI_API_KEY==='environment/.env','Compiled dotenv precedence failed');
  diagnostics=await diagnose({OPENAI_API_KEY:'synthetic-shell-sentinel'});assert(diagnostics.voiceEnabled,'Shell environment should override local empty key');
  assert(!JSON.stringify(diagnostics).includes('sentinel'),'Diagnostics leaked configuration values');
  const bytes=Buffer.from(await Bun.file(binary).arrayBuffer());assert(!bytes.includes(Buffer.from('synthetic-shared-sentinel'))&&!bytes.includes(Buffer.from('synthetic-shell-sentinel')),'Runtime configuration was embedded');
  const started=performance.now();const child=Bun.spawn([binary],{cwd:directory,env,stdout:'pipe',stderr:'pipe'});
  try {
    let port=0;
    while(!port && performance.now()-started<10000) {
      if(child.exitCode!==null)throw new Error('Relocated native app exited during startup');
      const descriptors=await readdir(`/proc/${child.pid}/fd`);
      const links=await Promise.all(descriptors.map(fd=>readlink(`/proc/${child.pid}/fd/${fd}`).catch(()=>'')));
      const inodes=new Set(links.map(link=>/^socket:\[(\d+)\]$/.exec(link)?.[1]).filter(Boolean));
      const lines=(await Bun.file(`/proc/${child.pid}/net/tcp`).text()).trim().split('\n').slice(1);
      for(const line of lines){const fields=line.trim().split(/\s+/);if(fields[3]==='0A' && inodes.has(fields[9])){const [host,p]=fields[1]!.split(':');assert(host==='0100007F','Desktop listener escaped IPv4 loopback');port=parseInt(p!,16);}}
      if(!port)await Bun.sleep(50);
    }
    assert(port,'No loopback listener after relocation');assert((await fetch(`http://127.0.0.1:${port}/`)).status===401,'Relocated UI lacked launch authentication');
    await Bun.sleep(1500);assert(child.exitCode===null,'Native process failed after launch');
    const stop=performance.now();child.kill('SIGTERM');const exit=await Promise.race([child.exited,Bun.sleep(3200).then(()=>-999)]);assert(exit===0,'Relocated native shutdown failed');
    console.info(`Relocated executable launched with an authenticated loopback listener; shutdown ${Math.round(performance.now()-stop)} ms.`);
    const errors=await new Response(child.stderr).text();assert(!/Could not start|host error/.test(errors),'Relocated native host reported a failure');
  }finally{if(child.exitCode===null)child.kill('SIGKILL');}
  console.info('Compiled .env/shared/shell precedence and value-free diagnostics passed; runtime directory contained only the executable and synthetic configuration.');
}finally{await rm(directory,{recursive:true,force:true});}
