// Console-style menus drawn on the Tivoo itself: an animated game library and a pause menu.
const N = 16;
function set(rgb, x, y, c) {
  x = Math.round(x); y = Math.round(y);
  if (x < 0 || y < 0 || x >= N || y >= N) return;
  const i = (y * N + x) * 3; rgb[i] = c[0]; rgb[i + 1] = c[1]; rgb[i + 2] = c[2];
}
function rect(rgb, x0, y0, w, h, c) { for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) set(rgb, x, y, c); }
const dim = (c, k) => c.map(v => v * k | 0);

// Little animated icons, drawn in the box x 2..13, y 1..12. t counts frames.
const ICONS = {
  'Snake'(rgb, t) {
    const path = [[3, 10], [4, 10], [5, 10], [6, 10], [6, 9], [6, 8], [6, 7], [7, 7], [8, 7], [9, 7], [9, 6], [9, 5], [9, 4], [10, 4], [11, 4], [12, 4], [12, 5], [12, 6]];
    const head = t % path.length;
    for (let k = 0; k < 7; k++) { const p = path[(head - k + path.length) % path.length]; set(rgb, p[0], p[1], k ? [0, 200 - k * 18, 60] : [180, 255, 120]); }
    set(rgb, 4, 4, [255, 40, 40]); set(rgb, 4, 3, [60, 160, 40]);
  },
  'Rally'(rgb, t) {
    rect(rgb, 4, 2, 4, 1, [255, 90, 120]); rect(rgb, 7, 12, 4, 1, [80, 200, 255]);
    const k = t % 20, bx = 4 + Math.abs(10 - k) * 0.6, by = 3 + Math.abs(10 - (t % 20)) * 0.85;
    set(rgb, bx + 1, by, [255, 255, 255]);
  },
  'Meteor dodge'(rgb, t) {
    for (let i = 0; i < 4; i++) { const x = 3 + ((i * 5 + 2) % 10), y = 1 + ((t + i * 4) % 11); set(rgb, x, y, [255, 140, 40]); set(rgb, x, y - 1, [120, 40, 10]); }
    const px = 7 + Math.round(Math.sin(t / 5) * 3);
    set(rgb, px, 12, [120, 220, 255]); set(rgb, px, 11, [255, 255, 255]);
  },
  'Hop'(rgb, t) {
    const off = t % 12;
    for (const wx of [12 - off, 18 - off]) for (let y = 1; y <= 12; y++) if (y < 4 || y > 8) { set(rgb, wx, y, [40, 200, 80]); set(rgb, wx + 1, y, [20, 140, 50]); }
    const by = 6 + Math.round(Math.sin(t / 3) * 1.5);
    set(rgb, 5, by, [255, 220, 0]); set(rgb, 6, by, [255, 120, 0]);
  },
  'Pixel Quest'(rgb, t) {
    for (let x = 2; x <= 13; x++) { set(rgb, x, 11, [60, 200, 70]); set(rgb, x, 12, [110, 70, 35]); }
    rect(rgb, 7, 6, 3, 1, [190, 100, 40]);
    if (t % 8 < 6) set(rgb, 8, 5, [255, 215, 0]);
    const jump = Math.max(0, Math.sin((t % 16) / 16 * Math.PI) * 4);
    set(rgb, 4, 9 - jump, [255, 220, 150]); set(rgb, 4, 10 - jump, [40, 200, 255]);
    set(rgb, 11 - (t / 4 | 0) % 2, 10, [200, 60, 220]);
  },
  'Star Blaster'(rgb, t) {
    for (let i = 0; i < 3; i++) { const x = 4 + i * 3 + Math.round(Math.sin(t / 4 + i)); set(rgb, x, 3, [255, 70, 140]); if (t % 6 < 3) { set(rgb, x - 1, 3, [130, 35, 70]); set(rgb, x + 1, 3, [130, 35, 70]); } }
    const sx = 8 + Math.round(Math.sin(t / 6) * 3);
    set(rgb, sx, 11, [255, 255, 255]); set(rgb, sx - 1, 12, [80, 200, 255]); set(rgb, sx, 12, [80, 200, 255]); set(rgb, sx + 1, 12, [80, 200, 255]);
    const ly = 10 - (t % 7); if (ly > 3) set(rgb, sx, ly, [255, 255, 160]);
  },
  'Maze Raider'(rgb, t) {
    for (let y = 1; y <= 12; y++) for (let x = 2; x <= 13; x++) {
      const d = Math.min(x - 2, 13 - x, y - 1, 12 - y);
      if (d < 3) set(rgb, x, y, dim(y < 7 && d === Math.min(x - 2, 13 - x) ? [170, 90, 60] : [90, 80, 70], 0.45 + d * 0.15));
    }
    const m = t % 30 < 25;
    rect(rgb, 6, 5, 4, 5, m ? [220, 40, 50] : [255, 255, 255]);
    set(rgb, 6, 6, [255, 230, 60]); set(rgb, 9, 6, [255, 230, 60]);
    set(rgb, 7, 12, [150, 150, 160]); set(rgb, 8, 12, [110, 110, 120]);
    if (t % 10 < 2) set(rgb, 7, 11, [255, 240, 120]);
  },
  'Road Hopper'(rgb, t) {
    for (let x = 2; x <= 13; x++) { set(rgb, x, 2, [20, 60, 160]); set(rgb, x, 3, [20, 60, 160]); set(rgb, x, 4, [20, 60, 160]); set(rgb, x, 6, [70, 40, 110]); for (let y = 7; y <= 10; y++) set(rgb, x, y, [25, 25, 30]); set(rgb, x, 11, [70, 40, 110]); }
    const lx = 2 + (t / 3 | 0) % 12; for (let k = 0; k < 4; k++) set(rgb, 2 + (lx - 2 + k) % 12, 3, [140, 90, 40]);
    const c1 = 13 - (t / 2 | 0) % 12; set(rgb, c1, 8, [255, 70, 70]); set(rgb, c1 - 1 < 2 ? 13 : c1 - 1, 8, [255, 70, 70]);
    const c2 = 2 + (t / 3 | 0) % 12; set(rgb, c2, 9, [255, 210, 40]);
    const hopY = [11, 10, 9, 8, 7, 6, 5][(t / 6 | 0) % 7]; set(rgb, 7, hopY, [140, 255, 90]);
  },
  'Brick breaker'(rgb, t) {
    const C = [[255, 60, 60], [255, 150, 40], [255, 230, 40], [60, 220, 90]];
    for (let r = 0; r < 4; r++) for (let x = 2; x <= 13; x++) if ((x + r + (t / 10 | 0)) % 7) set(rgb, x, 2 + r, x % 2 ? dim(C[r], 0.6) : C[r]);
    const k = t % 24, bx = 3 + Math.abs(12 - k) * 0.8, by = 7 + Math.abs(6 - (t % 12)) * 0.7;
    set(rgb, bx, by, [255, 255, 255]);
    rect(rgb, Math.round(bx) - 1, 12, 4, 1, [200, 200, 255]);
  },
};

export function drawLibrary(rgb, games, sel, t, bests = {}) {
  rgb.fill(0);
  const g = games[sel];
  // frame around the icon
  for (let x = 1; x <= 14; x++) { set(rgb, x, 0, [30, 30, 50]); set(rgb, x, 13, [30, 30, 50]); }
  for (let y = 0; y <= 13; y++) { set(rgb, 1, y, [30, 30, 50]); set(rgb, 14, y, [30, 30, 50]); }
  (ICONS[g.name] || (() => {}))(rgb, t);
  // blinking arrows on the sides
  const a = t % 10 < 6 ? [255, 92, 138] : [120, 40, 70];
  set(rgb, 0, 6, a); set(rgb, 0, 7, a); set(rgb, 15, 6, a); set(rgb, 15, 7, a);
  // page dots
  const w = games.length * 2 - 1, ox = Math.floor((N - w) / 2);
  games.forEach((_, i) => set(rgb, ox + i * 2, 15, i === sel ? [255, 255, 255] : [60, 60, 80]));
}

// Pause menu over a dimmed copy of the game frame. Items: resume, restart, exit.
export const PAUSE_ITEMS = ['Resume', 'Restart', 'Library'];
export function drawPause(rgb, frozen, sel, t) {
  for (let i = 0; i < rgb.length; i++) rgb[i] = frozen[i] * 0.25 | 0;
  const icons = [
    (x, c) => { for (let k = 0; k < 3; k++) for (let y = -k; y <= k; y++) set(rgb, x + 2 - k, 7 + y, c); },  // ▶
    (x, c) => { [[1, 5], [2, 5], [3, 5], [0, 6], [4, 6], [0, 7], [0, 8], [4, 8], [1, 9], [2, 9], [3, 9], [4, 5], [4, 4], [3, 4]].forEach(([dx, y]) => set(rgb, x + dx - 1, y, c)); }, // ↻
    (x, c) => { for (let k = -2; k <= 2; k++) { set(rgb, x + k, 7 + k, c); set(rgb, x + k, 7 - k, c); } }, // ✕
  ];
  const colors = [[60, 230, 100], [255, 200, 40], [255, 70, 90]];
  [3, 8, 13].forEach((x, i) => {
    const on = i === sel;
    if (on) for (let yy = 3; yy <= 11; yy++) for (let xx = x - 3; xx <= x + 2; xx++) if (yy === 3 || yy === 11 || xx === x - 3 || xx === x + 2) set(rgb, xx, yy, t % 8 < 5 ? [255, 255, 255] : [140, 140, 140]);
    icons[i](x, on ? colors[i] : dim(colors[i], 0.4));
  });
}
