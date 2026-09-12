import { test, expect } from 'bun:test';
import { CrosstalkServer, type CrosstalkSocketData } from '../../../cross-talk/src/server';
import { AudioServer, type AudioSocketData } from '../../../cross-talk/src/desktop/AudioServer';
import { OpenAIPcmAdapter } from '../../../cross-talk/src/desktop/OpenAIPcmAdapter';
import { decodeFrame, encodeFrame } from '../../../cross-talk/src/desktop/protocol';
import { fixture } from '../../../cross-talk/tests/fixtures';
const Socket = WebSocket as unknown as { new(url: string, options?: Bun.WebSocketOptions): WebSocket };
function inbox(ws: WebSocket) {
  const queue: any[] = []; const waiting: { test: (m: any) => boolean; resolve: (m: any) => void }[] = [];
  ws.binaryType = 'arraybuffer';
  ws.addEventListener('message', ({ data }) => { const message = typeof data === 'string' ? JSON.parse(data) : decodeFrame(new Uint8Array(data)); const index = waiting.findIndex(w => w.test(message)); if (index < 0) queue.push(message); else waiting.splice(index,1)[0]!.resolve(message); });
  return (type: string | number) => new Promise<any>((resolve,reject) => {
    const test = (m: any) => m.type === type || m.kind === type; const index = queue.findIndex(test);
    if(index>=0){resolve(queue.splice(index,1)[0]);return;}
    const waiter = { test, resolve: (m: any) => { clearTimeout(timer); resolve(m); } };
    const timer=setTimeout(()=>{const i=waiting.indexOf(waiter);if(i>=0)waiting.splice(i,1);reject(new Error(`Timed out waiting for ${type}`));},2500);waiting.push(waiter);
  });
}
const opened = (ws: WebSocket) => new Promise<void>((resolve,reject)=>{ws.onopen=()=>resolve();ws.onerror=()=>reject(new Error('Socket failed'));});
const send=(ws:WebSocket,message:object)=>ws.send(JSON.stringify(message));

test('primary WebSocket shares audio and delegation, enforces ownership and clears stale generations', async () => {
  let upstreamStarts=0, upstreamClosed=0, received=0, commentary=0, replies=0;
  const upstream = Bun.serve({ hostname:'127.0.0.1',port:0,fetch(req,s){expect(req.headers.get('authorization')).toBe('Bearer synthetic');return s.upgrade(req)?undefined:new Response('',{status:400});}, websocket:{
    message(ws,raw){ const event=JSON.parse(String(raw));
      if(event.type==='session.start'){upstreamStarts++;expect(event.session.audio.format).toEqual({type:'audio/pcm',rate:24000});expect(event.session.delegation).toEqual({type:'client'});expect(event.session.store).toBe(false);expect(event.session.client).toBeUndefined();ws.send(JSON.stringify({type:'session.started',session:{...event.session,id:'fake-live'}}));}
      else if(event.type==='session.input_audio.append'){received++;expect(Buffer.from(event.audio,'base64').length).toBe(960);if(received===1){ws.send(JSON.stringify({type:'session.input_transcript.delta',delta:'Show sunset.',start_ms:0,end_ms:100}));ws.send(JSON.stringify({type:'session.delegation.created',delegation:{id:'delegation-1',target:'client'},offset_ms:100}));}}
      else if(event.type==='session.commentary.append'){commentary++;ws.send(JSON.stringify({type:'session.commentary.appended',client_event_id:event.event_id}));ws.send(JSON.stringify({type:'session.output_audio.delta',delta:Buffer.alloc(960).toString('base64')}));}
      else if(event.type==='session.close'){upstreamClosed++;ws.send(JSON.stringify({type:'session.closed'}));ws.close();}
    },
  }});
  const core=new CrosstalkServer({openAIKey:'synthetic',desktopAudio:true,logger:()=>{},astraAgent:{async respond(){return ++replies===1?{output:[],text:'',calls:[{id:'call',name:'set_lighting',arguments:{lighting:'golden'},explicitUserRequest:true}]}:{output:[],text:'Golden hour is visible.',calls:[]};}}});
  const audio=new AudioServer(core,new OpenAIPcmAdapter('synthetic','gpt-live-1','quartz',`ws://127.0.0.1:${upstream.port}`));
  const server=Bun.serve<CrosstalkSocketData|AudioSocketData>({hostname:'127.0.0.1',port:0,fetch(req,s){if(new URL(req.url).pathname==='/audio')return s.upgrade(req,{data:{audio:true}})?undefined:new Response('',{status:400});return core.handler(req,s as any);},websocket:{
    open(ws){if('audio' in ws.data)audio.websocket.open?.(ws as any);else core.websocket.open?.(ws as any);},
    message(ws,raw){if('audio' in ws.data)audio.websocket.message(ws as any,raw);else core.websocket.message(ws as any,raw);},
    close(ws,code,reason){if('audio' in ws.data)audio.websocket.close?.(ws as any,code,reason);else{audio.invalidate(ws.data.sessionId);core.websocket.close?.(ws as any,code,reason);}},
  }});
  const origin=`http://127.0.0.1:${server.port}`,url=origin.replace('http','ws');const control=new Socket(url+'/crosstalk/ws',{headers:{Origin:origin}});const controlInbox=inbox(control);const f=fixture();const instanceId=crypto.randomUUID();
  const clients:WebSocket[]=[control];
  try{
    await opened(control);send(control,{type:'client.hello',protocolVersion:'1.0',instanceId,application:{id:'test-app',version:'1'}});const hello=await controlInbox('server.hello');expect(hello.capabilities).toEqual(['desktop-audio/1']);send(control,{type:'application.register',...f.registration});await controlInbox('application.registered');
    control.addEventListener('message',({data})=>{const m=JSON.parse(data);if(m.type==='state.request')send(control,{type:'state.result',requestId:m.requestId,state:f.state});if(m.type==='tool.invoke'){f.state.lighting=m.arguments.lighting;send(control,{type:'tool.result',invocationId:m.invocationId,result:{ok:true,data:{lighting:f.state.lighting},stateChanged:true}});}});
    const connect=async(token=hello.token)=>{const ws=new Socket(url+'/audio');clients.push(ws);const read=inbox(ws);await opened(ws);send(ws,{type:'audio.hello',protocol:'desktop-audio/1',instanceId,sessionId:hello.sessionId,token});return{ws,read};};
    const invalid=await connect('wrong');expect((await invalid.read('audio.error')).code).toBe('AUDIO_PROTOCOL_ERROR');expect(upstreamStarts).toBe(0);
    const a=await connect();await a.read('audio.authenticated');expect(upstreamStarts).toBe(0);
    const duplicate=await connect();expect((await duplicate.read('audio.error')).code).toBe('AUDIO_PROTOCOL_ERROR');
    send(a.ws,{type:'audio.start'});const started=await a.read('audio.started');expect(started.format.sampleRate).toBe(24000);
    for(let sequence=0;sequence<50;sequence++){a.ws.send(encodeFrame({kind:1,generation:started.generation,epoch:0,sequence,pcm:new Uint8Array(960)}));await Bun.sleep(20);}
    const playback=await a.read(2);expect(playback.sequence).toBe(0);expect(playback.pcm.length).toBe(960);expect(f.state.lighting).toBe('golden');expect(commentary).toBe(1);expect(received).toBe(50);expect(upstreamStarts).toBe(1);
    send(a.ws,{type:'audio.stop'});await a.read('audio.stopped');await Bun.sleep(30);expect(upstreamClosed).toBe(1);
    send(a.ws,{type:'audio.start'});const second=await a.read('audio.started');expect(second.generation).toBeGreaterThan(started.generation);
    a.ws.send(encodeFrame({kind:1,generation:started.generation,epoch:0,sequence:50,pcm:new Uint8Array(960)}));expect((await a.read('audio.error')).code).toBe('AUDIO_PROTOCOL_ERROR');
    await Bun.sleep(30);expect(upstreamClosed).toBe(2);
    control.close();await Bun.sleep(20);const stale=await connect();expect((await stale.read('audio.error')).code).toBe('AUDIO_PROTOCOL_ERROR');
  }finally{clients.forEach(ws=>ws.close());audio.dispose();await core.dispose();server.stop(true);upstream.stop(true);}
},10000);

test('abort during upstream startup closes the socket and never becomes ready', async()=>{
  let closes=0;
  const upstream=Bun.serve({hostname:'127.0.0.1',port:0,fetch(req,s){return s.upgrade(req)?undefined:new Response('');},websocket:{message(){},close(){closes++;}}});
  try{const controller=new AbortController();const adapter=new OpenAIPcmAdapter('synthetic','gpt-live-1','quartz',`ws://127.0.0.1:${upstream.port}`);const pending=adapter.connectPcm(()=>{},()=>{},controller.signal);await Bun.sleep(20);controller.abort();await expect(pending).rejects.toThrow();await Bun.sleep(20);expect(closes).toBe(1);}finally{upstream.stop(true);}
});

test('host disposal waits for an upstream close already initiated by local Stop', async()=>{
  const { SessionManager }=await import('../../../cross-talk/src/server/SessionManager');
  const { ApplicationRegistry }=await import('../../../cross-talk/src/server/ApplicationRegistry');
  let release!:()=>void;const closed=new Promise<void>(resolve=>release=resolve);
  const manager=new SessionManager({async connect(){return{id:'live',sdp:'answer',commentary(){},close:()=>closed};}},{async respond(){return{output:[],text:'',calls:[]};}},()=>{});
  const f=fixture();const app=new ApplicationRegistry().register('instance','session',f.registration,()=>{});
  await manager.start(app,{kind:'webrtc',sdp:'offer'});const stopping=manager.end(app.sessionId);let disposed=false;
  const disposal=manager.dispose().then(()=>{disposed=true;});await Bun.sleep(10);expect(disposed).toBe(false);release();await stopping;await disposal;expect(disposed).toBe(true);
});
