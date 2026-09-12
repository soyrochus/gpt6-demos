/** Explicit opt-in. One bounded, billable Live/Astra session using the checked-in synthetic speech fixture. */
if (process.env.CROSSTALK_DESKTOP_LIVE !== '1') {
  console.info('Opt in with CROSSTALK_DESKTOP_LIVE=1 bun run test:desktop:live. This sends the synthetic sunset speech fixture, not microphone audio, to the configured models.'); process.exit(0);
}
import { join } from 'node:path';
import { root, nativeRoot } from './build-native';
import { buildDesktop } from './build-desktop';
import { launchDesktop } from '../desktop/host';
import { loadDesktopConfig } from '../../cross-talk/src/desktop/config';
import type { RegisteredApplication } from '../../cross-talk/src/server/ApplicationRegistry';
let commentaryAccepted = false;
const config = await loadDesktopConfig();
Object.assign(config.options,{logger:(event:string)=>{if(event==='live.commentary.accepted')commentaryAccepted=true;console.info(event);}});
if (!config.voiceEnabled) throw new Error('Voice is not configured. Set OPENAI_API_KEY using the normal .env or shared configuration.');
await buildDesktop();
const assets = await Bun.file(join(root, '.build/desktop/assets.json')).json();
const host = await launchDesktop(config, assets, () => require(join(nativeRoot, 'native-window.node')));
if (!host) throw new Error('Native host failed');
let app: RegisteredApplication | undefined;
const register = host.core.registry.register.bind(host.core.registry); host.core.registry.register = (...args) => app = register(...args);
const replies = new Map<number, (m: any) => void>(); let id = 0;
host.native.onMessage(raw => { try { const m=JSON.parse(raw);replies.get(m.id)?.(m); } catch {} });
function evaluate(expression: string): Promise<any> {
  const key=++id;return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{replies.delete(key);reject(new Error('Native test evaluation timeout'));},10000);replies.set(key,m=>{clearTimeout(timer);replies.delete(key);if(m.error)reject(new Error(m.error));else resolve(m.value);});host!.native.evaluateJs(`(async()=>{try{const value=await(${expression});window.ipc.postMessage(JSON.stringify({id:${key},value}));}catch(e){window.ipc.postMessage(JSON.stringify({id:${key},error:e.message}));}})()`);});
}
const waitFor=async(fn:()=>Promise<boolean>,duration=15000)=>{const until=Date.now()+duration;while(!await fn()){if(Date.now()>until)throw new Error('Live acceptance timeout');await Bun.sleep(100);}};
const timer=setTimeout(()=>{console.error('Live acceptance deadline reached');void host.shutdown(1);},90000);
try {
  await waitFor(async()=>!!app);
  const wav=Buffer.from(await Bun.file(join(root,'../cross-talk/browser/fixtures/sunset.wav')).arrayBuffer()).toString('base64');
  await evaluate(`(async()=>{
    window.testAudio={samples:0,outputPeak:0,errors:0};
    const OriginalWorklet=window.AudioWorkletNode;
    window.AudioWorkletNode=class extends OriginalWorklet{constructor(...args){super(...args);this.port.addEventListener('message',({data})=>{if(data.type==='capture')window.testAudio.samples+=data.pcm.byteLength/2;if(data.type==='error')window.testAudio.errors++;});this.port.start();const analyser=args[0].createAnalyser();this.connect(analyser);const values=new Float32Array(analyser.fftSize);window.outputTimer=setInterval(()=>{analyser.getFloatTimeDomainData(values);for(const v of values)window.testAudio.outputPeak=Math.max(window.testAudio.outputPeak,Math.abs(v));},20);}};
    navigator.mediaDevices.getUserMedia=async()=>{const context=new AudioContext();window.inputContext=context;await context.resume();const destination=context.createMediaStreamDestination();const silent=context.createOscillator(),gain=context.createGain();gain.gain.value=0;silent.connect(gain).connect(destination);silent.start();window.sayFixture=async()=>{const bytes=Uint8Array.from(atob(${JSON.stringify(wav)}),c=>c.charCodeAt(0));const source=context.createBufferSource();source.buffer=await context.decodeAudioData(bytes.buffer);source.connect(destination);source.start();};return destination.stream;};
    document.querySelector('crosstalk-panel');
    const button=[...document.querySelectorAll('*')].flatMap(e=>e.shadowRoot?[...e.shadowRoot.querySelectorAll('button')]:[]).find(b=>b.getAttribute('aria-label')==='Start Crosstalk conversation');if(!button)throw new Error('Conversation control missing');button.click();return true;
  })()`);
  await waitFor(async()=>evaluate(`([...document.querySelectorAll('*')].some(e=>e.shadowRoot&&e.shadowRoot.textContent.includes('Listening')))`),25000);
  console.info('Live PCM session ready; sending the synthetic sunset request.');
  await evaluate('window.sayFixture()');
  await waitFor(async()=> (await app!.requestState() as any).lighting==='golden',45000);
  await waitFor(async()=>commentaryAccepted,25000);
  await waitFor(async()=>evaluate('window.testAudio.outputPeak>0.001'),15000);
  const result=await evaluate(`(async()=>{const button=[...document.querySelectorAll('*')].flatMap(e=>e.shadowRoot?[...e.shadowRoot.querySelectorAll('button')]:[]).find(b=>b.getAttribute('aria-label')==='End Crosstalk conversation');button?.click();await window.inputContext.close();clearInterval(window.outputTimer);return window.testAudio;})()`);
  if(result.errors || result.samples<24000)throw new Error('Live audio processing failed');
  console.info('Live acceptance passed: synthetic speech → PCM transport → Live delegation → Astra tool → golden-hour state → nonzero native playback.',result);
  console.info('Human listening and speaker echo quality still require manual acceptance.');
  clearTimeout(timer); await host.shutdown();
} catch { clearTimeout(timer);console.error('Live acceptance failed. Check model access, audio devices and the native window.');await host.shutdown(1); }
