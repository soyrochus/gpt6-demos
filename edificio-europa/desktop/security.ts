import { randomBytes, timingSafeEqual } from 'node:crypto';
const random = () => randomBytes(32).toString('hex');
export class LaunchAccess {
  readonly bootstrap = random();
  private cookie = random();
  private used = false;
  private expires = Date.now() + 30000;
  constructor(readonly origin: string) {}
  authorize(req: Request) {
    if (req.headers.get('host') !== new URL(this.origin).host) return false;
    const cookie = req.headers.get('cookie')?.split(';').map(x => x.trim()).find(x => x.startsWith('europa='))?.slice(7) ?? '';
    return cookie.length === this.cookie.length && timingSafeEqual(Buffer.from(cookie), Buffer.from(this.cookie));
  }
  checkOrigin(req: Request) { return req.headers.get('origin') === this.origin; }
  exchange(req: Request) {
    if (req.method !== 'GET' || req.headers.get('host') !== new URL(this.origin).host || this.used || Date.now() > this.expires || new URL(req.url).searchParams.get('cap') !== this.bootstrap) return new Response('Forbidden', { status: 403 });
    this.used = true;
    return new Response(null, { status: 303, headers: { Location: '/', 'Set-Cookie': `europa=${this.cookie}; HttpOnly; SameSite=Strict; Path=/`, 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } });
  }
  revoke() { this.used = true; this.cookie = random(); }
}
export function pageHeaders(contentType: string, origin: string) {
  return {
    'Content-Type': contentType, 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': `default-src 'none'; script-src 'self'; worker-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data: blob:; connect-src 'self' ${origin.replace('http:', 'ws:')}; media-src 'self' blob:; frame-src 'none'; frame-ancestors 'none'; object-src 'none'; base-uri 'none'; form-action 'none'`,
    'Permissions-Policy': 'camera=(), microphone=(self), geolocation=()',
  };
}
