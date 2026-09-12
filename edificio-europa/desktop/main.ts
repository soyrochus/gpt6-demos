import { loadDesktopConfig } from '../../cross-talk/src/desktop/config';
import { launchDesktop } from './host';
import assets from 'europa:assets';
import binding from 'europa:native';
if (process.argv.includes('--licenses')) { console.info(assets['/licenses']!.body); process.exit(0); }
const config = await loadDesktopConfig();
if (process.argv.includes('--diagnostics')) {
  console.info(JSON.stringify({ platform: `${process.platform}-${process.arch}`, configPath: config.path, provenance: config.provenance, voiceEnabled: config.voiceEnabled, diagnostics: config.diagnostics, audioProtocol: 'desktop-audio/1' }, null, 2));
  process.exit(0);
}
if (process.platform !== 'linux' || process.arch !== 'x64' || !process.env.WAYLAND_DISPLAY || !process.env.XDG_RUNTIME_DIR) {
  console.error('Europa desktop requires Linux x64 with native Wayland, GTK3, WebKitGTK 4.1 and working audio devices.'); process.exit(1);
}
process.env.GDK_BACKEND = 'wayland';
for (const message of config.diagnostics) console.warn(message);
const host = await launchDesktop(config, assets, binding);
process.on('SIGINT', () => void host?.shutdown()); process.on('SIGTERM', () => void host?.shutdown());
process.on('uncaughtException', () => { console.error('Europa encountered a host error.'); void host?.shutdown(1); });
