/** Native integration harness, never imported into the release executable. No upstream AI calls. */
import { join } from 'node:path';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { buildDesktop } from './build-desktop';
import { root, nativeRoot } from './build-native';
import { launchDesktop } from '../desktop/host';
import { loadDesktopConfig } from '../../cross-talk/src/desktop/config';
import { ToolRouter } from '../../cross-talk/src/server/ToolRouter';
import type { RegisteredApplication } from '../../cross-talk/src/server/ApplicationRegistry';
import { validatePng } from '../desktop/operations';
await buildDesktop();
const assets = await Bun.file(join(root, '.build/desktop/assets.json')).json();
const Native = require(join(nativeRoot, 'native-window.node'));
const directory = await mkdtemp(join(tmpdir(), 'europa-native-test-'));
let original: any; let app: RegisteredApplication | undefined; let exitCode = 0;
const host = await launchDesktop(await loadDesktopConfig({ OPENAI_API_KEY: '' }, join(directory, 'absent.cfg')), assets, () => ({ NativeWindow: class {
  constructor(options: object) {
    original = new Native.NativeWindow(options);
    return new Proxy(original, { get(target, key) {
      // The file destination chooser is a controlled test boundary. Actual GTK cancellation is exercised separately below.
      if (key === 'chooseSaveFile') return (name: string, callback: (path: string) => void) => callback(join(directory, name));
      const value = target[key]; return typeof value === 'function' ? value.bind(target) : value;
    } });
  }
} as any }), code => { exitCode = code; });
if (!host) throw new Error('Native host failed');
const register = host.core.registry.register.bind(host.core.registry);
host.core.registry.register = (...args) => app = register(...args);
let sequence = 0; const replies = new Map<number, (value: any) => void>();
host.native.onMessage(raw => { try { const message = JSON.parse(raw); if (message.id) replies.get(message.id)?.(message); } catch {} });
function evaluate(expression: string): Promise<any> {
  const id = ++sequence;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { replies.delete(id); reject(new Error('Native evaluation timeout')); }, 10000);
    replies.set(id, message => { clearTimeout(timer); replies.delete(id); if (message.error) reject(new Error(message.error)); else resolve(message.value); });
    host!.native.evaluateJs(`(async()=>{try{const value=await (${expression});window.ipc.postMessage(JSON.stringify({id:${id},value}));}catch(e){window.ipc.postMessage(JSON.stringify({id:${id},error:e.message}));}})()`);
  });
}
const until = async (fn: () => boolean, duration = 15000) => { const deadline = Date.now() + duration; while (!fn()) { if (Date.now() > deadline) throw new Error('Native readiness timeout'); await Bun.sleep(50); } };
const assert = (ok: unknown, message: string) => { if (!ok) throw new Error(message); };
const deadline = setTimeout(() => { console.error('Native integration deadline reached'); process.exit(1); }, 60000);
try {
  await until(() => !!app);
  const view = await evaluate(`({ready:!!document.querySelector('#loading.loaded'),photos:document.images.length,rtc:typeof RTCPeerConnection,width:document.querySelector('canvas').width})`);
  assert(view.ready && view.photos === 0 && view.width > 100, 'Native scene did not render without photographs'); console.info('Native scene:', view);
  const router = new ToolRouter(undefined, () => {});
  const tool = async (name: string, args: object) => { const result = await router.invoke(app!, crypto.randomUUID(), name, args, true, new AbortController().signal); assert(result.ok, `${name} failed: ${JSON.stringify(result)}`); console.info(`Verified ${name}`); return result; };
  await tool('show_side', { side: 'back' });
  assert(Math.abs((await app!.requestState() as any).spatial.cameraBearingDegrees - 190) < 1, 'Building bearing changed');
  await tool('orbit_view', { direction: 'left', degrees: 30 });
  await tool('set_fullscreen', { enabled: true }); assert(original.isFullscreen(), 'Fullscreen was not observed');
  await tool('set_fullscreen', { enabled: false });
  await tool('show_perspective', { perspective: 'street' });
  await tool('set_lighting', { lighting: 'golden' });
  await tool('set_auto_rotation', { enabled: true });
  await tool('set_auto_rotation', { enabled: false });
  await tool('adjust_zoom', { direction: 'closer', amount: 'small' });
  await tool('reset_view', {});
  await tool('capture_view', {});
  const png = new Uint8Array(await Bun.file(join(directory, 'edificio-europa-street-4k.png')).arrayBuffer()); validatePng(png); console.info(`Validated 4K PNG (${png.length} bytes)`);
  const cancelled = new Promise<string>(resolve => original.chooseSaveFile('edificio-europa-test-4k.png', resolve));
  await Bun.sleep(300); original.cancelSaveFile(); assert(await cancelled === '', 'Native save cancellation failed');
  console.info('Native GTK save dialog opened and cancelled');
  const media = await evaluate(`(async()=>{
    const stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true},video:false});
    const context=new AudioContext();await context.resume();await context.audioWorklet.addModule('/audio-worklet.js');
    const node=new AudioWorkletNode(context,'europa-audio',{numberOfInputs:1,numberOfOutputs:1,outputChannelCount:[1]});context.createMediaStreamSource(stream).connect(node);node.connect(context.destination);
    let samples=0,error=false;node.port.onmessage=({data})=>{if(data.type==='capture'){samples+=data.pcm.byteLength/2;node.port.postMessage({type:'ack'});}if(data.type==='error')error=true;};node.port.postMessage({type:'start'});
    await new Promise(r=>setTimeout(r,600));node.port.postMessage({type:'stop'});stream.getTracks().forEach(t=>t.stop());node.disconnect();await context.close();
    let cameraDenied=false;try{const camera=await navigator.mediaDevices.getUserMedia({video:true});camera.getTracks().forEach(t=>t.stop());}catch{cameraDenied=true;}
    return {samples,rate:context.sampleRate,error,cameraDenied};
  })()`);
  assert(media.samples > 5000 && !media.error && media.cameraDenied, 'Native microphone/worklet policy failed'); console.info('Native media:', media);
  const auth = await fetch(`http://127.0.0.1:${host.server.port}/`); assert(auth.status === 401, 'Unauthenticated listener exposed');
  console.info('Native integration passed; no upstream AI session was created.');
} catch (error) { exitCode = 1; console.error(error); }
finally { clearTimeout(deadline); await host.shutdown(exitCode); await rm(directory, { recursive: true, force: true }); process.exit(exitCode); }
