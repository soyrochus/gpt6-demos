import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './browser', testMatch: '**/*.pw.ts', fullyParallel: false, workers: 1, timeout: 60_000,
  use: { baseURL: 'http://127.0.0.1:3019', viewport: { width: 1440, height: 1100 }, screenshot: 'only-on-failure',
    // Full Chromium uses the Mac's GPU for the 3D navigation checks.
    channel: process.platform === 'darwin' ? 'chromium' : undefined,
    launchOptions: { executablePath: process.env.CHROMIUM_PATH, args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--enable-unsafe-swiftshader'] } },
  webServer: { command: 'bun browser/server.ts', url: 'http://127.0.0.1:3019', reuseExistingServer: false },
});
