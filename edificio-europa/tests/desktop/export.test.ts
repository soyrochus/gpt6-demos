import { test, expect } from 'bun:test';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { NativeOperations } from '../../desktop/operations';
import type { NativeWindow } from '../../desktop/native';
test('export waits for the chooser/write, rejects duplicate begins, caches success and removes cancelled transfers',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'europa-export-'));let choose:((path:string)=>void)|undefined;let dialogs=0;
  const window={chooseSaveFile(_name:string,callback:(path:string)=>void){dialogs++;choose=callback;},cancelSaveFile(){choose?.('');}} as NativeWindow;
  const ops=new NativeOperations(window);
  const request=(route:string,body:object)=>ops.handler(new Request('http://localhost/native/'+route,{method:'POST',body:JSON.stringify(body)}));
  const begin=async(id:string)=>{
    const bytes=new Uint8Array(33),v=new DataView(bytes.buffer);bytes.set([137,80,78,71,13,10,26,10]);v.setUint32(8,13);bytes.set(new TextEncoder().encode('IHDR'),12);v.setUint32(16,3840);v.setUint32(20,2160);
    expect((await request('export/begin',{id,name:'edificio-europa-urban-4k.png',size:bytes.length})).status).toBe(200);
    expect((await ops.handler(new Request(`http://localhost/native/export/chunk?id=${id}&offset=0`,{method:'POST',body:bytes}))).status).toBe(200);
  };
  try{
    await begin('one');const first=request('export/commit',{id:'one'});await Bun.sleep(5);expect(dialogs).toBe(1);expect(await readdir(directory)).toEqual([]);
    const duplicate=request('export/commit',{id:'one'});await Bun.sleep(5);expect(dialogs).toBe(1);choose!(join(directory,'saved.png'));
    expect((await first).status).toBe(200);expect((await duplicate).status).toBe(200);expect((await request('export/commit',{id:'one'})).status).toBe(200);expect(dialogs).toBe(1);
    expect((await request('export/begin',{id:'one',name:'edificio-europa-urban-4k.png',size:33})).status).toBe(400);
    await begin('cancel');const cancelled=request('export/commit',{id:'cancel'});await Bun.sleep(5);await request('export/cancel',{id:'cancel'});expect((await cancelled).status).toBe(400);
    await begin('failure');const failed=request('export/commit',{id:'failure'});await Bun.sleep(5);choose!(join(directory,'missing-parent','fail.png'));expect((await failed).status).toBe(400);
    expect(await readdir(directory)).toEqual(['saved.png']);
  }finally{ops.dispose();await rm(directory,{recursive:true,force:true});}
});
