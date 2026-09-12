import { test, expect } from 'bun:test';
test('worklet schedules bounded playback, flushes it, never monitors capture and detects stalled consumers', async () => {
  const globals = globalThis as any; const saved = { rate: globals.sampleRate, processor: globals.AudioWorkletProcessor, register: globals.registerProcessor };
  let Processor: any;
  class Port { onmessage?: (event: any) => void; messages: any[]=[]; postMessage(message: any){this.messages.push(message);} }
  globals.sampleRate=48000;globals.AudioWorkletProcessor=class {port=new Port();};globals.registerProcessor=(_name:string,ctor:any)=>Processor=ctor;
  try {
    await import('../../../cross-talk/src/desktop/worklet');
    const node=new Processor();const output=new Float32Array(128);const input=new Float32Array(128).fill(.25);
    const dispatch=(n:any,message:object)=>n.port.onmessage({data:message});
    dispatch(node,{type:'start'});
    for(let i=0;i<25;i++){node.process([[input]],[[output]]);expect(output.every(v=>v===0)).toBe(true);}
    const captures=node.port.messages.filter((m:any)=>m.type==='capture');expect(captures.length).toBeGreaterThan(1);expect(captures[0].pcm.byteLength).toBe(960);
    // At 50 packets/s, a blocked main thread exhausts the 250 ms capture credit window.
    for(let i=0;i<120;i++)node.process([[input]],[[output]]);
    expect(node.port.messages.filter((m:any)=>m.type==='error').length).toBe(1);
    const player=new Processor();const pcm=new ArrayBuffer(960);const view=new DataView(pcm);for(let i=0;i<480;i++)view.setInt16(i*2,8192,true);
    for(let i=0;i<3;i++)dispatch(player,{type:'play',pcm});
    player.process([[]],[[output]]);expect(Math.max(...output)).toBeGreaterThan(.2);
    dispatch(player,{type:'flush'});player.process([[]],[[output]]);expect(output.every(v=>v===0)).toBe(true);
    for(let i=0;i<30;i++)dispatch(player,{type:'play',pcm});expect(player.port.messages.some((m:any)=>m.type==='error')).toBe(true);
    player.process([[]],[[output]]);expect(output.every(v=>v===0)).toBe(true);
  } finally {globals.sampleRate=saved.rate;globals.AudioWorkletProcessor=saved.processor;globals.registerProcessor=saved.register;}
});
