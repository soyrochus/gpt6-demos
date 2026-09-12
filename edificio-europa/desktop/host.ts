import { CrosstalkServer, type CrosstalkSocketData } from '../../cross-talk/src/server';
import { AudioServer, type AudioSocketData } from '../../cross-talk/src/desktop/AudioServer';
import { OpenAIPcmAdapter } from '../../cross-talk/src/desktop/OpenAIPcmAdapter';
import { loadDesktopConfig } from '../../cross-talk/src/desktop/config';
import { LaunchAccess, pageHeaders } from './security';
import { NativeOperations } from './operations';
import { Lifecycle } from './lifecycle';
import type { NativeBinding, NativeWindow } from './native';
export async function launchDesktop(config: Awaited<ReturnType<typeof loadDesktopConfig>>, assets: Record<string, { body: string; type: string }>, binding: () => NativeBinding, onExit: (code: number) => void = code => process.exit(code)) {
  const lifecycle = new Lifecycle();
  let closing = false; let native: NativeWindow | undefined;
  async function shutdown(code = 0) {
    if (closing) return; closing = true;
    const graceful = await lifecycle.close();
    if (!graceful) console.warn('Europa shutdown deadline reached.');
    onExit(code);
  }
  try {
    let access: LaunchAccess; let operations: NativeOperations;
    const startup = setTimeout(() => { console.error('Europa did not finish starting within 15 seconds.'); void shutdown(1); }, 15000);
    lifecycle.add(() => clearTimeout(startup));
    const core = new CrosstalkServer({ ...config.options, desktopAudio: true, authorize: req => access.authorize(req) });
    const audio = new AudioServer(core, new OpenAIPcmAdapter(config.options.openAIKey, config.options.liveModel, config.options.voice));
    type SocketData = CrosstalkSocketData | AudioSocketData;
    const isAudio = (data: SocketData): data is AudioSocketData => 'audio' in data;
    const server = Bun.serve<SocketData>({ hostname: '127.0.0.1', port: 0, development: false, maxRequestBodySize: 256 * 1024,
      websocket: { maxPayloadLength: 128 * 1024, idleTimeout: 60, sendPings: true, backpressureLimit: 26000, closeOnBackpressureLimit: true,
        open: ws => { if (isAudio(ws.data)) audio.websocket.open?.(ws as any); else core.websocket.open?.(ws as any); },
        message: (ws, raw) => { if (isAudio(ws.data)) audio.websocket.message(ws as any, raw); else { core.websocket.message(ws as any, raw); if (ws.data.app) clearTimeout(startup); } },
        close: (ws, code, reason) => { if (isAudio(ws.data)) audio.websocket.close?.(ws as any, code, reason); else { audio.invalidate(ws.data.sessionId); core.websocket.close?.(ws as any, code, reason); } },
      },
      async fetch(req, server) {
        if (closing) return new Response('Closing', { status: 503 });
        const path = new URL(req.url).pathname;
        if (path === '/bootstrap') return access.exchange(req);
        if (!access.authorize(req)) return new Response('Unauthorized', { status: 401 });
        if ((path.startsWith('/crosstalk/') || path.startsWith('/native/') || req.method !== 'GET') && !access.checkOrigin(req)) return new Response('Forbidden', { status: 403 });
        if (path === '/crosstalk/audio') return req.method === 'GET' && server.upgrade(req, { data: { audio: true } }) ? undefined : new Response('Upgrade required', { status: 400 });
        if (path.startsWith('/crosstalk/')) return core.handler(req, server as any);
        if (path.startsWith('/native/')) return operations.handler(req);
        const asset = assets[path];
        if (!asset || req.method !== 'GET') return new Response('Not found', { status: 404 });
        return new Response(asset.body, { headers: pageHeaders(asset.type, access.origin) });
      },
    });
    access = new LaunchAccess(`http://127.0.0.1:${server.port}`);
    lifecycle.add(() => access.revoke()); lifecycle.add(() => audio.dispose()); lifecycle.add(() => core.dispose()); lifecycle.add(() => server.stop(true));
    const addon = binding();
    native = new addon.NativeWindow({ title: 'Edificio Europa', width: 1360, height: 940, minWidth: 720, minHeight: 540, resizable: true, incognito: true, devtools: false, allowMicrophone: true, allowCamera: false, trustedOrigins: [access.origin], allowedHosts: ['127.0.0.1'] });
    operations = new NativeOperations(native); lifecycle.add(() => operations.dispose()); lifecycle.add(() => native?.close());
    native.onClose(() => void shutdown());
    native.loadUrl(`${access.origin}/bootstrap?cap=${access.bootstrap}`);
    return { native, core, server, shutdown };
  } catch { console.error('Could not start Europa. Check the documented GTK3/WebKitGTK 4.1 and Wayland runtime dependencies.'); await shutdown(1); }

}
