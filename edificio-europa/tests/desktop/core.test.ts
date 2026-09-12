import { test, expect } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { loadDesktopConfig, parseConfig } from '../../../cross-talk/src/desktop/config';
import { encodeFrame, decodeFrame, parseAudioMessage } from '../../../cross-talk/src/desktop/protocol';
import { Resampler, pcmSample } from '../../../cross-talk/src/desktop/resampler';
import { LaunchAccess } from '../../desktop/security';
import { Lifecycle } from '../../desktop/lifecycle';
import { validatePng } from '../../desktop/operations';

test('dotenv grammar and expansion match the installed Bun parser, including forward references', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'europa-config-'));
  try {
    const cfg = `# dotenv\r\nexport EUROPA_TEST_A="a value"\nEUROPA_TEST_B='$EUROPA_TEST_A/one'\nEUROPA_TEST_C=\`\${EUROPA_TEST_LATER}/two\`\nEUROPA_TEST_LATER=later\nEUROPA_TEST_ESCAPE=\\$EUROPA_TEST_A\nEUROPA_TEST_MULTI="first\\nsecond"\nEUROPA_TEST_EMPTY=\nEUROPA_TEST_A="final" # duplicate\nEUROPA_TEST_SPACE= a value # comment\nEUROPA_TEST_OVERRIDE=$EUROPA_TEST_FROM_ENV\nEUROPA_TEST_DEFAULT=\${MISSING:-fallback}\nEUROPA_TEST_CYCLE1=$EUROPA_TEST_CYCLE2\nEUROPA_TEST_CYCLE2=$EUROPA_TEST_CYCLE1\n`;
    await Bun.write(join(dir, '.env'), cfg);
    await Bun.write(join(dir, 'oracle.ts'), `console.log(JSON.stringify(Object.fromEntries(Object.entries(process.env).filter(([k])=>k.startsWith('EUROPA_TEST_')))))`);
    const env = { PATH: process.env.PATH, EUROPA_TEST_FROM_ENV: 'inherited' };
    const child = Bun.spawn([process.execPath, join(dir, 'oracle.ts')], { cwd: dir, env, stdout: 'pipe', stderr: 'pipe' });
    const actual = JSON.parse(await new Response(child.stdout).text()); expect(await child.exited).toBe(0);
    expect({ ...parseConfig(cfg, env), EUROPA_TEST_FROM_ENV: 'inherited' }).toEqual(actual);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
test('shared config is atomic, bounded, allowlisted, preserves empty key and environment overrides', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'europa-config-')); const path = join(dir, 'crosstalk.cfg');
  try {
    await Bun.write(path, 'HELPER=quartz\nOPENAI_API_KEY=synthetic-key\nCROSSTALK_VOICE=$HELPER\nCROSSTALK_DEBUG=false\nCROSSTALK_UNKNOWN=value\nHOST=0.0.0.0\n');
    const c = await loadDesktopConfig({ OPENAI_API_KEY: '', CROSSTALK_VOICE: 'another' }, path);
    expect(c.voiceEnabled).toBe(false); expect(c.options.openAIKey).toBe(''); expect(c.options.voice).toBe('another');
    expect(JSON.stringify(c.provenance)).not.toContain('synthetic-key'); expect(c.diagnostics).toContain('Unknown configuration key: CROSSTALK_UNKNOWN');
    await Bun.write(path, 'OPENAI_API_KEY=synthetic-key\ninvalid assignment');
    const invalid = await loadDesktopConfig({}, path); expect(invalid.voiceEnabled).toBe(false); expect(invalid.options.openAIKey).toBe('');
    await Bun.write(path, 'x'.repeat(65537)); expect((await loadDesktopConfig({}, path)).voiceEnabled).toBe(false);
    expect((await loadDesktopConfig({}, join(dir, 'absent'))).diagnostics).toEqual([]);
    for (const text of ['CROSSTALK_REASONING_EFFORT=ultra', 'CROSSTALK_VOICE=', 'CROSSTALK_DEBUG=1']) { await Bun.write(path, text); expect((await loadDesktopConfig({ OPENAI_API_KEY: 'synthetic' }, path)).voiceEnabled).toBe(false); }
  } finally { await rm(dir, { recursive: true, force: true }); }
});
test('audio frame framing rejects malformed lengths, epochs, flags and counters', () => {
  const frame = encodeFrame({ kind: 1, generation: 7, epoch: 0, sequence: 3, pcm: new Uint8Array(960) });
  expect(decodeFrame(frame).sequence).toBe(3);
  for (const [index, value] of [[0,2],[1,3],[2,1],[8,1],[16,0]]) { const bad = frame.slice(); bad[index!] = value!; expect(() => decodeFrame(bad)).toThrow(); }
  expect(() => decodeFrame(frame.subarray(0, -1))).toThrow();
  expect(() => encodeFrame({ kind: 2, generation: -1, epoch: 0, sequence: 0, pcm: new Uint8Array(960) })).toThrow();
  expect(() => parseAudioMessage('{"type":"audio.start","extra":true}')).toThrow();
  expect(() => parseAudioMessage('{"type":"session.close"}')).toThrow();
});
test('resampler maintains duration across arbitrary chunks and rejects aliasing', () => {
  for (const rate of [44100,48000]) {
    for (const frequency of [1000,18000]) {
      const converter = new Resampler(rate,24000); let count=0, energy=0;
      for(let start=0;start<rate*3;start+=128){ const input=new Float32Array(Math.min(128,rate*3-start));for(let i=0;i<input.length;i++)input[i]=Math.sin(2*Math.PI*frequency*(start+i)/rate);const output=converter.push(input);count+=output.length;for(const sample of output)energy+=sample*sample; }
      expect(Math.abs(count-72000)).toBeLessThan(20);if(frequency===1000)expect(Math.sqrt(energy/count)).toBeCloseTo(.707,2);
      if(frequency===18000)expect(Math.sqrt(energy/count)).toBeLessThan(.02);
    }
  }
  expect(pcmSample(NaN)).toBe(0);expect(pcmSample(-2)).toBe(-32768);expect(pcmSample(2)).toBe(32767);
});
test('bootstrap is single-use and enforces host, cookie and origin independently', () => {
  const a = new LaunchAccess('http://127.0.0.1:12345');
  const request = new Request(`${a.origin}/bootstrap?cap=${a.bootstrap}`, { headers: { host: '127.0.0.1:12345' } });
  const response = a.exchange(request); expect(response.status).toBe(303); expect(a.exchange(request).status).toBe(403);
  const cookie = response.headers.get('set-cookie')!.split(';')[0]!;
  expect(a.authorize(new Request(a.origin, { headers: { host: '127.0.0.1:12345', cookie } }))).toBe(true);
  expect(a.authorize(new Request(a.origin, { headers: { host: 'localhost:12345', cookie } }))).toBe(false);
  expect(a.checkOrigin(new Request(a.origin, { headers: { origin: 'null' } }))).toBe(false);
  a.revoke(); expect(a.authorize(new Request(a.origin, { headers: { host: '127.0.0.1:12345', cookie } }))).toBe(false);
});
test('shutdown cancels all resources before waiting and uses one idempotent deadline', async () => {
  const calls: string[]=[]; const lifecycle=new Lifecycle();
  lifecycle.add(()=>{calls.push('stalled');return new Promise(()=>{});});lifecycle.add(()=>{calls.push('microphone');});lifecycle.add(()=>{calls.push('server');});
  const closing=lifecycle.close(25);expect(calls).toEqual(['stalled','microphone','server']);expect(lifecycle.close()).toBe(closing);expect(await closing).toBe(false);
});
test('PNG validation refuses arbitrary files and wrong output dimensions', () => {
  expect(()=>validatePng(new Uint8Array(40))).toThrow();const b=new Uint8Array(33),v=new DataView(b.buffer);b.set([137,80,78,71,13,10,26,10]);v.setUint32(8,13);b.set(new TextEncoder().encode('IHDR'),12);v.setUint32(16,3840);v.setUint32(20,2160);expect(()=>validatePng(b)).not.toThrow();v.setUint32(20,1);expect(()=>validatePng(b)).toThrow();
});
