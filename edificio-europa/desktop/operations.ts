import { open, rename, rm } from 'node:fs/promises';
import { dirname, basename, join } from 'node:path';
import type { NativeWindow } from './native';
const MAX_PNG = 32 * 1024 * 1024;
export function validatePng(bytes: Uint8Array) {
  const signature = [137,80,78,71,13,10,26,10];
  if (bytes.length < 33 || bytes.length > MAX_PNG || signature.some((v,i) => bytes[i] !== v)) throw new Error('Invalid PNG');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(8) !== 13 || String.fromCharCode(...bytes.subarray(12,16)) !== 'IHDR' || view.getUint32(16) !== 3840 || view.getUint32(20) !== 2160) throw new Error('Expected a 3840 × 2160 PNG');
}
interface Transfer { id: string; name: string; bytes: Uint8Array; offset: number; cancelled: boolean; timer: ReturnType<typeof setTimeout>; result?: Promise<object> }
export class NativeOperations {
  private transfer?: Transfer;
  private completed = new Map<string, object>();
  private closing = false;
  constructor(private window: NativeWindow) {}
  private cancel(id?: string) {
    const transfer = this.transfer;
    if (!transfer || (id && transfer.id !== id)) return;
    transfer.cancelled = true; clearTimeout(transfer.timer); this.transfer = undefined;
    try { this.window.cancelSaveFile(); } catch {}
  }
  dispose() { const pending = this.transfer?.result; this.closing = true; this.cancel(); return pending?.then(() => {}, () => {}); }
  async handler(req: Request) {
    try {
      if (this.closing || req.method !== 'POST') return new Response('Unavailable', { status: 503 });
      const url = new URL(req.url), route = url.pathname.slice('/native/'.length);
      if (route === 'export/chunk') {
        const t = this.transfer, offset = Number(url.searchParams.get('offset'));
        if (!t || t.result || t.id !== url.searchParams.get('id') || offset !== t.offset) throw new Error('Invalid export transaction');
        const bytes = new Uint8Array(await req.arrayBuffer());
        if (this.transfer !== t || t.cancelled || bytes.length === 0 || bytes.length > 256 * 1024 || bytes.length + t.offset > t.bytes.length) throw new Error('Invalid export chunk');
        t.bytes.set(bytes, t.offset); t.offset += bytes.length; return Response.json({ received: t.offset });
      }
      const raw = await req.text(); if (raw.length > 4096) throw new Error('Native request too large');
      const body = JSON.parse(raw); if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('Invalid native request');
      const shape = (keys: string[]) => { if (Object.keys(body).length !== keys.length || keys.some(k => !(k in body))) throw new Error('Unexpected native fields'); };
      if (route === 'display') { shape([]); return Response.json({ fullscreen: this.window.isFullscreen() }); }
      if (route === 'fullscreen') {
        shape(['enabled']); if (typeof body.enabled !== 'boolean') throw new Error('Expected fullscreen boolean');
        this.window.setFullscreen(body.enabled);
        const deadline = Date.now() + 2000;
        while (this.window.isFullscreen() !== body.enabled && Date.now() < deadline && !this.closing) await new Promise(resolve => setTimeout(resolve, 25));
        if (this.window.isFullscreen() !== body.enabled) throw new Error('Native fullscreen did not settle');
        return Response.json({ fullscreen: body.enabled });
      }
      if (route === 'location') {
        shape(['id']); if (body.id !== 'building-location') throw new Error('Unknown location');
        const child = Bun.spawn(['xdg-open', 'https://maps.app.goo.gl/gQwHSTFF8XgvJrEu8'], { stdout: 'ignore', stderr: 'ignore', env: { ...process.env, LD_PRELOAD: undefined } });
        const timer = setTimeout(() => child.kill(), 5000);
        try { if (await child.exited !== 0) throw new Error('Could not open the system browser'); } finally { clearTimeout(timer); }
        return Response.json({ opened: true });
      }
      if (typeof body.id !== 'string' || !/^[\w-]{1,128}$/.test(body.id)) throw new Error('Invalid export ID');
      if (route === 'export/begin') {
        shape(['id','name','size']);
        if (this.completed.has(body.id) || this.transfer || typeof body.name !== 'string' || !/^edificio-europa-[a-z]+-4k\.png$/.test(body.name) || !Number.isInteger(body.size) || body.size < 33 || body.size > MAX_PNG) throw new Error('Invalid or duplicate export');
        this.transfer = { id: body.id, name: body.name, bytes: new Uint8Array(body.size), offset: 0, cancelled: false, timer: setTimeout(() => this.cancel(body.id), 120000) };
        return Response.json({ accepted: true });
      }
      shape(['id']);
      if (route === 'export/cancel') { this.cancel(body.id); return Response.json({ cancelled: true }); }
      if (route === 'export/commit') {
        if (this.completed.has(body.id)) return Response.json(this.completed.get(body.id));
        const t = this.transfer; if (!t || t.id !== body.id) throw new Error('Unknown export');
        if (!t.result) t.result = this.save(t);
        const abort = () => this.cancel(t.id); req.signal.addEventListener('abort', abort, { once: true });
        try { return Response.json(await t.result); } finally { req.signal.removeEventListener('abort', abort); }
      }
      throw new Error('Unknown native operation');
    } catch (error) {
      const cancelled = error instanceof Error && error.message === 'Save cancelled.';
      return Response.json({ code: cancelled ? 'SAVE_CANCELLED' : 'NATIVE_OPERATION_FAILED', retryable: !cancelled, message: cancelled ? 'Save cancelled.' : 'Native operation failed. Please try again.' }, { status: 400 });
    }
  }
  private async save(t: Transfer) {
    let temporary: string | undefined;
    try {
      if (t.offset !== t.bytes.length) throw new Error('Incomplete PNG'); validatePng(t.bytes);
      const path = await new Promise<string>(resolve => this.window.chooseSaveFile(t.name, resolve));
      if (!path || t.cancelled || this.closing) throw new Error('Save cancelled.');
      temporary = join(dirname(path), `.${basename(path)}.${crypto.randomUUID()}.tmp`);
      const file = await open(temporary, 'wx', 0o600);
      try { await file.writeFile(t.bytes); await file.sync(); } finally { await file.close(); }
      if (t.cancelled || this.closing) throw new Error('Save cancelled.');
      await rename(temporary, path); temporary = undefined;
      const result = { width: 3840, height: 2160, format: 'png', saved: true, filename: basename(path) };
      this.completed.set(t.id, result); if (this.completed.size > 128) this.completed.delete(this.completed.keys().next().value!);
      return result;
    } finally { clearTimeout(t.timer); if (this.transfer === t) this.transfer = undefined; if (temporary) await rm(temporary, { force: true }); }
  }
}
