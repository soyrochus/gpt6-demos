const shapes: Record<string, string> = {
  audio: '<path d="M11 5 6 9H3v6h3l5 4zM15 8c3 2 3 6 0 8m3-11c5 4 5 10 0 14"/>',
  music:
    '<path d="M9 16V6l11-2v10M9 9l11-2"/><ellipse cx="6" cy="17" rx="3" ry="2.5"/><ellipse cx="17" cy="15" rx="3" ry="2.5"/>',
  keys: '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M5 9h1m3 0h1m3 0h1m3 0h1M5 12h1m3 0h1m3 0h1m3 0h1m-10 3h8"/>',
  pause: '<path d="M8 5v14m8-14v14" stroke-width="3"/>',
  play: '<path d="m7 4 12 8-12 8z"/>',
  reset: '<path d="M4 8a8 8 0 1 1-1 6m1-11v5h5"/>',
  users:
    '<circle cx="10" cy="8" r="3"/><path d="M3 20v-2a7 7 0 0 1 14 0v2m-1-15a3 3 0 0 1 0 6m3 3c2 1 3 3 3 6"/>',
  launch:
    '<path d="m9 13 8-8m-8 8-1-5 8-4 4 0v4l-4 8-5-1M7 15l-3 5 5-3"/><circle cx="16" cy="8" r="1"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  score:
    '<path d="M7 4h10v5c0 5-2 7-5 7s-5-2-5-7zM7 6H3v2c0 3 2 5 5 5m9-7h4v2c0 3-2 5-5 5m-4 3v4m-4 0h8"/>',
  rank: '<path d="m12 2 8 3v7c0 4-4 7-8 10-4-3-8-6-8-10V5z"/><path d="m7 13 5-5 5 5m-8 2 3-3 3 3"/>',
  arrow: '<path d="M4 12h16m-6-6 6 6-6 6"/>',
  left: '<path d="M19 12H5m6-6-6 6 6 6"/>',
  up: '<path d="M12 19V5m-6 6 6-6 6 6"/>',
  fuel: '<path d="M3 19 9 5h10l-6 14zM7 15h7"/>',
  flag: '<path d="M4 21V3m0 1h13l-3 4 3 4H4"/>',
};
export function icon(name: string) {
  return (
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    (shapes[name] ?? "") +
    "</svg>"
  );
}
