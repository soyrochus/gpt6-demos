import type { EuropaDisplay } from '../crosstalk/EuropaController';
import { CrosstalkError } from '../../cross-talk/src/protocol';
export const desktop = typeof __EUROPA_DESKTOP__ !== 'undefined' && __EUROPA_DESKTOP__;
declare const __EUROPA_DESKTOP__: boolean;
export interface ExportContext { id: string; signal?: AbortSignal }
export async function nativeRequest(operation: string, body: unknown = {}, signal?: AbortSignal) {
  const response = await fetch(`/native/${operation}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal });
  const result = await response.json();
  if (!response.ok) throw new CrosstalkError(result.code ?? 'NATIVE_OPERATION_FAILED', result.message ?? 'Native operation failed.', result.retryable !== false);
  return result;
}
export class NativeDisplay implements EuropaDisplay {
  private fullscreen = false;
  private listeners = new Set<() => void>();
  constructor() {
    const timer = setInterval(() => { void nativeRequest('display').then(result => this.update(result.fullscreen)).catch(() => {}); }, 250);
    window.addEventListener('pagehide', () => clearInterval(timer), { once: true });
    document.addEventListener('keydown', event => { if (event.key === 'Escape' && this.fullscreen) void this.setFullscreen(false).catch(() => {}); });
  }
  private update(value: boolean) { if (this.fullscreen !== value) { this.fullscreen = value; this.listeners.forEach(fn => fn()); } }
  isFullscreen() { return this.fullscreen; }
  onFullscreenChange(fn: () => void) { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; }
  async setFullscreen(enabled: boolean) { const result = await nativeRequest('fullscreen', { enabled }); this.update(result.fullscreen); }
}
export async function savePng(blob: Blob, name: string, context: ExportContext) {
  context.signal?.throwIfAborted();
  if (!desktop) {
    const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.download = name; link.href = url; link.click(); setTimeout(() => URL.revokeObjectURL(url), 60000);
    return { width: 3840, height: 2160, format: 'png', downloaded: true };
  }
  const cancel = () => { void nativeRequest('export/cancel', { id: context.id }).catch(() => {}); };
  context.signal?.addEventListener('abort', cancel, { once: true });
  try {
    if (blob.size > 32 * 1024 * 1024) throw new Error('PNG exceeds the 32 MiB export limit.');
    await nativeRequest('export/begin', { id: context.id, name, size: blob.size }, context.signal);
    for (let offset = 0; offset < blob.size; offset += 256 * 1024) {
      const response = await fetch(`/native/export/chunk?id=${encodeURIComponent(context.id)}&offset=${offset}`, { method: 'POST', body: blob.slice(offset, offset + 256 * 1024), signal: context.signal });
      if (!response.ok) throw new Error('Image transfer failed.');
    }
    return await nativeRequest('export/commit', { id: context.id }, context.signal);
  } catch (error) { cancel(); throw error; }
  finally { context.signal?.removeEventListener('abort', cancel); }
}
