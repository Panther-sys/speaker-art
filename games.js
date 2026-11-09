// Small original games for a 16x16 screen. The phone (or a controller) is the gamepad.
// Each game: { name, emoji, help, tickMs, create() -> { tick(input, rgb), score, over, won } }
// input = { held: {left,right,up,down,a,b,y,sl,sr}, pressed: Set of actions since last tick }
// Every game is wrapped by polish(), which adds particles, screen shake, flashes,
// level cards, a death animation and keeps the colour count low for Bluetooth.
const N = 16;

function set(rgb, x, y, c) {
  x = Math.round(x); y = Math.round(y);
  if (x < 0 || y < 0 || x >= N || y >= N) return;
  const i = (y * N + x) * 3; rgb[i] = Math.min(255, c[0]); rgb[i + 1] = Math.min(255, c[1]); rgb[i + 2] = Math.min(255, c[2]);
}
const rand = n => Math.floor(Math.random() * n);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const dim = (c, k) => [Math.min(255, c[0] * k | 0), Math.min(255, c[1] * k | 0), Math.min(255, c[2] * k | 0)];
const mix = (a, b, k) => [a[0] + (b[0] - a[0]) * k | 0, a[1] + (b[1] - a[1]) * k | 0, a[2] + (b[2] - a[2]) * k | 0];
const hash = (x, y) => { let h = (x * 374761393 + y * 668265263) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
// queue a sound effect for the app to play after this tick
const fx = (g, name) => (g.sfx ||= []).push(name);
// mix colour c into a pixel with strength a (0..1)
function blend(rgb, x, y, c, a) {
  x = Math.round(x); y = Math.round(y);
  if (a <= 0 || x < 0 || y < 0 || x >= N || y >= N) return;
  a = Math.min(1, a);
  const i = (y * N + x) * 3;
  for (let k = 0; k < 3; k++) rgb[i + k] = Math.round(rgb[i + k] * (1 - a) + Math.min(255, c[k]) * a);
}

// ---------- tiny 3x5 font ----------
const DIGITS = { 0: '111101101101111', 1: '010110010010111', 2: '111001111100111', 3: '111001111001111', 4: '101101111001001', 5: '111100111001111', 6: '111100111101111', 7: '111001010010010', 8: '111101111101111', 9: '111101111001111' };
const LETTERS = {
  A: '010101111101101', B: '110101110101110', C: '011100100100011', D: '110101101101110', E: '111100110100111', F: '111100110100100',
  G: '011100101101011', H: '101101111101101', I: '111010010010111', K: '101101110101101', L: '100100100100111', M: '101111111101101',
  N: '110101101101101', O: '010101101101010', P: '110101110100100', R: '110101110101101', S: '011100010001110', T: '111010010010010',
  U: '101101101101111', V: '101101101101010', W: '101101111111101', X: '101101010101101', Y: '101101010010010', '!': '010010010000010',
};
export function drawText(rgb, s, y, c, x0) {
  s = String(s).toUpperCase();
  const w = s.length * 4 - 1, ox = x0 ?? Math.floor((N - w) / 2);
  [...s].forEach((ch, k) => { const p = DIGITS[ch] || LETTERS[ch]; if (p) for (let i = 0; i < 15; i++) if (p[i] === '1') set(rgb, ox + k * 4 + i % 3, y + (i / 3 | 0), c); });
}
export function drawNumber(rgb, n, y, c) { drawText(rgb, String(n), y, c); }

// ---------- polish kit ----------
// particles: burst(g, x, y, colour or [colours], count, {speed, life, grav, up})
function burst(g, x, y, c, n = 8, o = {}) {
  const sp = o.speed ?? 0.6, life = o.life ?? 8;
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, v = sp * (0.3 + Math.random() * 0.7);
    (g.parts ||= []).push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - (o.up ?? 0), grav: o.grav ?? 0, life: Math.max(1, life * (0.6 + Math.random() * 0.6) | 0), max: life, c: Array.isArray(c[0]) ? c[rand(c.length)] : c });
  }
}
const shake = (g, n) => { g.shakeT = Math.max(g.shakeT || 0, n); };
const flash = (g, c, n = 4) => { g.flashC = c; g.flashT = g.flashMax = n; };
// a banner across the screen, e.g. card(g, ['LV', '2'], colour). hold freezes the game while it shows.
function card(g, lines, c, ms = 1300, hold = true) {
  g.cardLines = Array.isArray(lines) ? lines : [lines]; g.cardC = c;
  g.cardT = g.cardMax = Math.max(4, Math.round(ms / (g.tickMs || 80)));
  g.cardHold = hold; g.cardNew = true; g.cardBg = null;
}
function drawCard(rgb, g) {
  const lines = g.cardLines, c = g.cardC, age = g.cardMax - g.cardT, two = lines.length > 1;
  const y0 = two ? 1 : 3, y1 = two ? 14 : 11, half = Math.min(8, (age + 1) * 3);
  for (let y = y0; y <= y1; y++) for (let x = 0; x < N; x++) if (Math.abs(x - 7.5) < half) blend(rgb, x, y, [0, 0, 0], 0.8);
  for (let x = 0; x < N; x++) if (Math.abs(x - 7.5) < half) { set(rgb, x, y0, dim(c, 0.5)); set(rgb, x, y1, dim(c, 0.5)); }
  if (age >= 2) lines.forEach((s, i) => drawText(rgb, s, two ? 3 + i * 6 : 5, g.cardT > 3 || g.cardT % 2 ? c : dim(c, 0.5)));
}
function shift(rgb, dx, dy) {
  const src = rgb.slice(); rgb.fill(0);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { const i = (y * N + x) * 3; set(rgb, x + dx, y + dy, [src[i], src[i + 1], src[i + 2]]); }
}
// Fewer colours = smaller Bluetooth messages = a smoother frame rate on the Tivoo.
function capColors(rgb, max = 64) {
  const count = a => { const s = new Set(); for (let i = 0; i < a.length; i += 3) s.add(a[i] << 16 | a[i + 1] << 8 | a[i + 2]); return s.size; };
  if (count(rgb) <= max) return;
  const src = rgb.slice();
  for (const step of [10, 16, 24, 34, 48]) {
    for (let i = 0; i < src.length; i++) rgb[i] = Math.min(255, Math.round(src[i] / step) * step);
    if (count(rgb) <= max) return;
  }
}
function drawEnding(rgb, snap, g, p, t) {
  if (g.won) {
    rgb.set(snap);
    for (let i = 0; i < 256; i++) blend(rgb, i % N, i / N | 0, [0, 0, 0], p * 0.5);
    const C = [[255, 255, 255], [255, 230, 80], [120, 255, 140], [80, 200, 255]];
    for (let k = 0; k < 8; k++) set(rgb, rand(N), rand(N), C[rand(4)]);
    for (let x = 0; x < N; x++) { set(rgb, x, 0, C[(x + t) % 4]); set(rgb, x, 15, C[(x + t + 2) % 4]); }
    return;
  }
  rgb.fill(0);
  const fade = 1 - p * 0.9, red = p < 0.2 ? 110 : 0;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const i = (y * N + x) * 3, drop = Math.floor(p * p * (3 + hash(x, 7) * 14));
    if (y + drop < N) set(rgb, x, y + drop, [snap[i] * fade + red, snap[i + 1] * fade * (1 - p * 0.5), snap[i + 2] * fade * (1 - p * 0.5)]);
  }
}
function post(g, rgb) {
  const P = g.parts || [];
  for (const p of P) { p.x += p.vx; p.y += p.vy; p.vy += p.grav; p.vx *= 0.94; p.life--; blend(rgb, p.x, p.y, p.c, Math.min(1, p.life / p.max * 1.6)); }
  g.parts = P.filter(p => p.life > 0);
  if (g.flashT > 0) { const k = g.flashT / g.flashMax * 0.55; for (let i = 0; i < 256; i++) blend(rgb, i % N, i / N | 0, g.flashC, k); g.flashT--; }
  if (g.cardT > 0) { drawCard(rgb, g); if (!--g.cardT) g.cardBg = null; }
  if (g.shakeT > 0) { g.shakeT--; const dx = rand(3) - 1, dy = rand(3) - 1; if (dx || dy) shift(rgb, dx, dy); }
  capColors(rgb);
}
function polish(def) {
  return {
    ...def,
    create() {
      const g = def.create(), inner = g.tick;
      let ending = 0, endMax = 0, snap = null, t = 0;
      g.tick = (inp, rgb) => {
        t++;
        if (ending > 0) { drawEnding(rgb, snap, g, 1 - ending / endMax, t); post(g, rgb); if (--ending === 0) g.over = true; return; }
        if (g.cardHold && g.cardT > 0 && g.cardBg) rgb.set(g.cardBg);
        else { inner(inp, rgb); if (g.cardNew) { g.cardNew = false; g.cardBg = rgb.slice(); } }
        if (g.over) {
          g.over = false; snap = rgb.slice(); g.cardT = 0;
          endMax = ending = clamp(Math.round(1100 / g.tickMs), 7, 16);
          if (!g.won) { shake(g, 4); burst(g, 7.5, 7.5, [[255, 80, 60], [255, 200, 60], [255, 255, 255]], 14, { speed: 0.9, life: 10 }); }
          return post(g, rgb);
        }
        post(g, rgb);
      };
      return g;
    },
  };
}

const GAME_LIST = [
  {
    name: 'Snake', emoji: '🐍', tickMs: 170,
    help: 'Swipe or use the arrows to steer. Eat red apples to grow and grab the gold ones before they vanish. Every 8 apples is a new level with rocks to avoid. The edges wrap around.',
    create() {
      const g = { score: 0, over: false, tickMs: 170 };
      let body = [[7, 8], [6, 8], [5, 8]], dir = [1, 0], turns = [], food = null, gold = null, grow = 0, level = 1, eaten = 0, t = 0;
      const rocks = new Set(), K = (x, y) => y * N + x;
      const busy = (x, y) => rocks.has(K(x, y)) || body.some(([a, b]) => a === x && b === y);
      const free = () => { let p; do p = [rand(N), rand(N)]; while (busy(...p) || (food && p[0] === food[0] && p[1] === food[1]) || (gold && p[0] === gold.x && p[1] === gold.y)); return p; };
      food = free();
      function addRocks() {
        for (let tries = 0; tries < 60; tries++) {
          const x = rand(N), y = rand(N), horiz = Math.random() < 0.5, cells = [0, 1, 2].map(i => horiz ? [(x + i) % N, y] : [x, (y + i) % N]);
          const [hx, hy] = body[0];
          if (cells.some(([a, b]) => busy(a, b) || Math.abs(a - hx) + Math.abs(b - hy) < 5 || (a === food[0] && b === food[1]))) continue;
          cells.forEach(([a, b]) => rocks.add(K(a, b))); return;
        }
      }
      card(g, ['LV', '1'], [120, 255, 120], 1000);
      g.tick = (inp, rgb) => {
        t++;
        // remember up to two quick turns so fast swipes aren't lost
        for (const a of inp.pressed) {
          const d = { left: [-1, 0], right: [1, 0], up: [0, -1], down: [0, 1] }[a]; if (!d) continue;
          const last = turns.length ? turns[turns.length - 1] : dir;
          if (turns.length < 2 && (d[0] !== -last[0] || d[1] !== -last[1]) && (d[0] !== last[0] || d[1] !== last[1])) turns.push(d);
        }
        if (turns.length) dir = turns.shift();
        const h = [(body[0][0] + dir[0] + N) % N, (body[0][1] + dir[1] + N) % N];
        if (rocks.has(K(...h)) || body.slice(0, -1).some(([x, y]) => x === h[0] && y === h[1])) { g.over = true; return; }
        body.unshift(h);
        if (h[0] === food[0] && h[1] === food[1]) {
          g.score += level; eaten++; grow++; fx(g, 'eat');
          burst(g, h[0], h[1], [[255, 60, 60], [255, 170, 130]], 6, { speed: 0.5, life: 6 });
          food = free();
          if (!gold && Math.random() < 0.25) { const p = free(); gold = { x: p[0], y: p[1], life: Math.round(8000 / g.tickMs) }; }
          if (eaten >= 8) { level++; eaten = 0; addRocks(); if (level > 3) addRocks(); fx(g, 'level'); flash(g, [120, 255, 120], 4); card(g, ['LV', String(level)], [120, 255, 120], 1000); }
          g.tickMs = Math.max(70, 170 - (level - 1) * 14 - eaten * 3);
        }
        if (gold && h[0] === gold.x && h[1] === gold.y) { g.score += 5 * level; grow += 2; fx(g, 'coin'); burst(g, gold.x, gold.y, [[255, 220, 60], [255, 255, 200]], 10, { speed: 0.7 }); gold = null; }
        if (gold && --gold.life <= 0) gold = null;
        if (grow > 0) grow--; else body.pop();
        // draw: chequered grass, rocks, food, a striped snake with a flicking tongue
        for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) set(rgb, x, y, (x + y) & 1 ? [5, 14, 9] : [8, 20, 12]);
        for (const k of rocks) { const x = k % N, y = k / N | 0; set(rgb, x, y, hash(x, y) < 0.5 ? [125, 110, 95] : [95, 85, 75]); }
        set(rgb, food[0], food[1], t % 6 < 3 ? [255, 40, 40] : [255, 100, 80]);
        if (gold && (gold.life > 12 || t % 2)) set(rgb, gold.x, gold.y, t % 4 < 2 ? [255, 215, 0] : [255, 255, 170]);
        const L = body.length;
        body.forEach(([x, y], i) => { if (i) { const c = mix([40, 230, 90], [10, 90, 60], i / L); set(rgb, x, y, i % 3 === 0 ? dim(c, 1.3) : c); } });
        set(rgb, body[0][0], body[0][1], [200, 255, 140]);
        if (t % 8 < 2) { const tx = (h[0] + dir[0] + N) % N, ty = (h[1] + dir[1] + N) % N; if (!busy(tx, ty)) blend(rgb, tx, ty, [255, 60, 120], 0.7); }
      };
      return g;
    },
  },
  {
    name: 'Rally', emoji: '🏓', tickMs: 80,
    help: 'Hold left or right to move your paddle (bottom). Hit the spinning gem with the ball for a bigger paddle. First to 5 wins.',
    create() {
      const g = { score: 0, over: false, tickMs: 80 };
      let me = 6, cpu = 6, meW = 4, cpuW = 4, big = 0, cpuBig = 0, bx, by, vx, vy, trail = [], lost = 0, gem = null, last = null, t = 0, wait = 0;
      const serve = d => { bx = 7.5; by = 7.5; vx = (Math.random() < 0.5 ? -1 : 1) * 0.3; vy = 0.4 * d; trail = []; wait = 8; };
      serve(1);
      card(g, ['GO!'], [80, 200, 255], 800);
      g.tick = (inp, rgb) => {
        t++;
        if (inp.held.left) me = Math.max(0, me - 0.9);
        if (inp.held.right) me = Math.min(N - meW, me + 0.9);
        // the computer gets a little sharper each time you score
        const cs = 0.42 + g.score * 0.07, target = bx - cpuW / 2 + 0.5;
        if (vy < 0 || Math.random() < 0.35) cpu = clamp(cpu + clamp(target - cpu, -cs, cs), 0, N - cpuW);
        if (wait > 0) wait--;
        else { trail.unshift([bx, by]); trail.length = Math.min(trail.length, 4); bx += vx; by += vy; }
        if (bx < 0 || bx > N - 1) { vx = -vx; bx = clamp(bx, 0, N - 1); fx(g, 'click'); }
        if (by >= 14 && vy > 0) {
          if (bx >= me - 0.6 && bx <= me + meW - 0.4) {
            fx(g, 'bounce'); vy = -Math.min(0.9, Math.abs(vy) * 1.05); vx += (bx - (me + meW / 2 - 0.5)) * 0.12; by = 14; last = 'me';
            burst(g, bx, 14, [80, 200, 255], 5, { speed: 0.4, life: 5 });
          } else if (by > 15.5) {
            fx(g, 'hurt'); lost++; g.lost = lost; shake(g, 4); flash(g, [255, 90, 120], 4);
            burst(g, bx, 15, [[255, 90, 120], [255, 255, 255]], 10, { speed: 0.8 });
            if (lost >= 5) { g.over = true; return; }
            serve(-1);
          }
        }
        if (by <= 1 && vy < 0) {
          if (bx >= cpu - 0.6 && bx <= cpu + cpuW - 0.4) {
            fx(g, 'bounce'); vy = Math.min(0.9, Math.abs(vy) * 1.03); vx += (bx - (cpu + cpuW / 2 - 0.5)) * 0.1; by = 1; last = 'cpu';
            burst(g, bx, 1, [255, 90, 120], 5, { speed: 0.4, life: 5 });
          } else if (by < -0.5) {
            fx(g, 'score'); g.score++; shake(g, 3); flash(g, [80, 200, 255], 4);
            burst(g, bx, 0, [[80, 200, 255], [255, 255, 255]], 10, { speed: 0.8 });
            if (g.score >= 5) { g.won = true; g.over = true; return; }
            serve(1);
          }
        }
        vx = clamp(vx, -0.8, 0.8);
        // the power gem: whoever hit the ball last gets a wide paddle
        if (!gem && t % 140 === 0) gem = { x: 3 + rand(10), y: 5 + rand(6), life: 220 };
        if (gem) {
          gem.life--;
          if (last && Math.abs(bx - gem.x) < 1 && Math.abs(by - gem.y) < 1) {
            fx(g, 'power'); burst(g, gem.x, gem.y, [[255, 230, 80], [255, 255, 255]], 10);
            if (last === 'me') { meW = 6; big = 200; me = Math.min(me, N - meW); } else { cpuW = 6; cpuBig = 200; cpu = Math.min(cpu, N - cpuW); }
            gem = null;
          } else if (gem.life <= 0) gem = null;
        }
        if (big && !--big) meW = 4;
        if (cpuBig && !--cpuBig) cpuW = 4;
        // draw
        for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) set(rgb, x, y, y === 8 && x % 2 === 0 ? [25, 25, 55] : [3, 4, 12]);
        if (gem) { const c = [[255, 230, 80], [255, 140, 40], [255, 255, 200], [255, 140, 40]][(t >> 1) % 4]; set(rgb, gem.x, gem.y, c); if (t % 4 < 2) { blend(rgb, gem.x - 1, gem.y, c, 0.35); blend(rgb, gem.x + 1, gem.y, c, 0.35); } }
        const pad = (x0, w, y, c) => { for (let i = 0; i < w; i++) set(rgb, Math.round(x0) + i, y, i === 0 || i === w - 1 ? dim(c, 0.7) : c); };
        pad(me, meW, 15, big && (big > 30 || t % 4 < 2) ? [150, 255, 255] : [80, 200, 255]);
        pad(cpu, cpuW, 0, cpuBig && (cpuBig > 30 || t % 4 < 2) ? [255, 170, 200] : [255, 90, 120]);
        trail.forEach(([x, y], i) => blend(rgb, x, y, [255, 255, 255], 0.45 - i * 0.1));
        if (!wait || t % 2) set(rgb, bx, by, [255, 255, 255]);
        for (let i = 0; i < g.score; i++) set(rgb, 15, 13 - i * 2, [80, 200, 255]);
        for (let i = 0; i < lost; i++) set(rgb, 15, 2 + i * 2, [255, 90, 120]);
      };
      return g;
    },
  },
  {
    name: 'Meteor dodge', emoji: '☄️', tickMs: 80,
    help: 'Hold left or right to dodge the falling rocks. Grab gold stars for points and the blue orb for a shield. It gets faster every level.',
    create() {
      const g = { score: 0, over: false, tickMs: 80 };
      let x = 7.5, t = 0, rocks = [], items = [], shield = 0, stars = 0, stage = 1, safe = 0;
      const far = Array.from({ length: 10 }, () => ({ x: rand(N), y: Math.random() * N }));
      const near = Array.from({ length: 5 }, () => ({ x: rand(N), y: Math.random() * N }));
      card(g, ['LV', '1'], [255, 160, 60], 1000);
      g.tick = (inp, rgb) => {
        t++;
        if (inp.held.left) x = Math.max(1, x - 0.7);
        if (inp.held.right) x = Math.min(N - 2, x + 0.7);
        const s = Math.round(x), cells = [[s, 13], [s - 1, 14], [s, 14], [s + 1, 14]];
        const ns = 1 + Math.floor(t / 300);
        if (ns > stage) { stage = ns; fx(g, 'level'); card(g, ['LV', String(stage)], [255, 160, 60], 900, false); }
        const d = Math.min(1, t / 1500), speed = 0.25 + d * 0.6;
        if (Math.random() < 0.2 + d * 0.3) {
          const big = stage >= 2 && Math.random() < 0.12 + stage * 0.03;
          rocks.push({ x: rand(big ? N - 1 : N), y: -2, v: speed * (0.8 + Math.random() * 0.5) * (big ? 0.75 : 1), vx: stage >= 3 ? (Math.random() - 0.5) * 0.12 : 0, big });
        }
        if (t % 90 === 0) items.push({ x: 1 + rand(N - 2), y: -1, kind: Math.random() < 0.25 ? 'shield' : 'star' });
        rocks.forEach(r => { r.y += r.v; r.x = clamp(r.x + r.vx, 0, N - (r.big ? 2 : 1)); });
        items.forEach(i => i.y += 0.25);
        const hits = (cx, cy, r) => { const rx = Math.round(r.x), ry = Math.round(r.y), w = r.big ? 2 : 1; return cx >= rx && cx < rx + w && cy >= ry && cy < ry + w; };
        for (const r of rocks) if (!r.gone && cells.some(([cx, cy]) => hits(cx, cy, r))) {
          r.gone = true; burst(g, r.x, r.y, [[255, 140, 40], [255, 220, 120], [120, 60, 30]], r.big ? 14 : 8, { speed: 0.7 });
          if (safe) continue;
          if (shield) { shield = 0; safe = 12; fx(g, 'boom'); shake(g, 3); flash(g, [80, 220, 255], 3); }
          else { fx(g, 'boom'); burst(g, x, 14, [[120, 220, 255], [255, 255, 255]], 12); g.over = true; return; }
        }
        for (const it of items) if (!it.gone && cells.some(([cx, cy]) => cx === Math.round(it.x) && Math.abs(cy - it.y) < 1)) {
          it.gone = true;
          if (it.kind === 'star') { stars++; fx(g, 'coin'); burst(g, it.x, it.y, [255, 230, 80], 6, { speed: 0.4, life: 6 }); }
          else { shield = 1; fx(g, 'power'); burst(g, it.x, it.y, [80, 220, 255], 8); }
        }
        if (safe) safe--;
        rocks = rocks.filter(r => !r.gone && r.y < N + 1);
        items = items.filter(i => !i.gone && i.y < N + 1);
        g.score = Math.floor(t / 12) + stars * 5;
        // draw: deep space with two layers of stars sliding past
        for (let y = 0; y < N; y++) for (let xx = 0; xx < N; xx++) set(rgb, xx, y, [2, 2, 8 + (y >> 2) * 3]);
        for (const st of far) { st.y = (st.y + 0.06) % N; set(rgb, st.x, st.y, [30, 30, 60]); }
        for (const st of near) { st.y += 0.2; if (st.y >= N) { st.y = 0; st.x = rand(N); } set(rgb, st.x, st.y, [80, 80, 120]); }
        for (const r of rocks) {
          const rx = Math.round(r.x), y0 = Math.floor(r.y), f = r.y - y0;
          if (r.big) {
            for (let k = 1; k <= 2; k++) { blend(rgb, rx, y0 - k, [255, 100, 30], 0.5 / k); blend(rgb, rx + 1, y0 - k, [255, 100, 30], 0.5 / k); }
            set(rgb, rx, y0, [255, 170, 80]); set(rgb, rx + 1, y0, [190, 95, 45]); set(rgb, rx, y0 + 1, [190, 95, 45]); set(rgb, rx + 1, y0 + 1, [130, 60, 30]);
          } else {
            blend(rgb, rx, y0 - 1, [255, 90, 20], 0.45); blend(rgb, rx, y0 - 2, [255, 90, 20], 0.2);
            blend(rgb, rx, y0, [255, 150, 50], 1 - f); blend(rgb, rx, y0 + 1, [255, 150, 50], f);
          }
        }
        for (const it of items) set(rgb, it.x, it.y, it.kind === 'star' ? (t % 4 < 2 ? [255, 230, 80] : [255, 255, 200]) : (t % 4 < 2 ? [80, 220, 255] : [200, 250, 255]));
        if (!safe || t % 2) {
          const wing = shield ? [80, 255, 255] : [120, 220, 255];
          set(rgb, s, 13, [255, 255, 255]); set(rgb, s - 1, 14, wing); set(rgb, s, 14, dim(wing, 0.8)); set(rgb, s + 1, 14, wing);
          set(rgb, s, 15, t % 2 ? [255, 160, 0] : [255, 80, 0]);
          if (shield && t % 4 < 2) { blend(rgb, s - 1, 13, [80, 220, 255], 0.5); blend(rgb, s + 1, 13, [80, 220, 255], 0.5); blend(rgb, s, 12, [80, 220, 255], 0.5); }
        }
      };
      return g;
    },
  },
  {
    name: 'Hop', emoji: '🐤', tickMs: 70,
    help: 'Tap A (or tap the screen) to flap. Fly through the gaps and grab the coins. The sky turns to sunset and night as you go.',
    create() {
      const g = { score: 0, over: false, tickMs: 70 };
      const GAP = 5, FLOOR = 15;
      let y = 7, v = 0, t = 0, walls = [{ x: 17, gap: 5, coin: false }], flapT = 0, dist = 0;
      const city = Array.from({ length: 32 }, (_, i) => 2 + ((i * 7) % 5) + (i % 3));
      const SKIES = [[[40, 90, 170], [130, 190, 240]], [[90, 40, 100], [255, 150, 80]], [[4, 6, 26], [26, 34, 80]]];
      card(g, ['GO!'], [255, 220, 0], 700);
      const die = () => { shake(g, 4); fx(g, 'hurt'); burst(g, 4.5, y, [[255, 220, 0], [255, 255, 255], [255, 120, 0]], 12, { speed: 0.7, life: 9, grav: 0.05 }); g.over = true; };
      g.tick = (inp, rgb) => {
        t++;
        if (inp.pressed.has('a') || inp.pressed.has('up')) { v = -0.8; flapT = 4; fx(g, 'flap'); burst(g, 3, y + 1, [220, 220, 220], 2, { speed: 0.25, life: 4 }); }
        v = Math.min(0.75, v + 0.12); y += v; if (flapT) flapT--;
        const speed = 0.3 + Math.min(0.15, g.score * 0.01); dist += speed;
        walls.forEach(w => w.x -= speed);
        if (walls[walls.length - 1].x < 9) {
          const last = walls[walls.length - 1].gap;
          walls.push({ x: 17, gap: clamp(last + rand(9) - 4, 1, FLOOR - GAP - 1), coin: Math.random() < 0.45 });
        }
        if (walls[0].x < -3) walls.shift();
        if (y < -0.5 || y + 1 > FLOOR + 0.3) return die();
        for (const w of walls) {
          if (!w.scored && w.x + 2 < 4) { w.scored = true; g.score++; fx(g, 'score'); }
          if (w.coin && !w.got && Math.abs(w.x + 1 - 4.5) < 1.2 && Math.abs(y + 0.5 - (w.gap + 2.5)) < 1.5) {
            w.got = true; g.score += 3; fx(g, 'coin'); burst(g, 5, w.gap + 2, [[255, 220, 60], [255, 255, 200]], 7, { speed: 0.5, life: 6 });
          }
          if (w.x < 5 && w.x + 2 > 4 && (y < w.gap - 0.3 || y + 1 > w.gap + GAP + 0.3)) return die();
        }
        // sky colour drifts from day to sunset to night every 10 points
        const ph = Math.floor(g.score / 10) % 3, k = Math.max(0, ((g.score % 10) - 7) / 3);
        const top = mix(SKIES[ph][0], SKIES[(ph + 1) % 3][0], k), bot = mix(SKIES[ph][1], SKIES[(ph + 1) % 3][1], k);
        const night = ph === 2 ? 1 - k : ph === 1 ? k : 0;
        for (let yy = 0; yy < FLOOR; yy++) { const c = mix(top, bot, yy / FLOOR); for (let x = 0; x < N; x++) set(rgb, x, yy, c); }
        if (night > 0.3) for (let i = 0; i < 7; i++) set(rgb, (i * 5 + 3) % N, (i * 3) % 7, [200, 200, 230]);
        set(rgb, 12, 2, night > 0.5 ? [230, 230, 255] : ph === 1 ? [255, 180, 90] : [255, 240, 150]); set(rgb, 13, 2, night > 0.5 ? [180, 180, 210] : [255, 220, 120]);
        // drifting clouds and a city skyline behind the pipes
        for (let i = 0; i < 3; i++) { const cx = ((i * 9 - dist * 0.15) % 27 + 27) % 27 - 5, cy = 1 + i * 2; for (let d = 0; d < 3; d++) blend(rgb, cx + d, cy, [235, 240, 250], 0.7 - night * 0.5); blend(rgb, cx + 1, cy - 1, [235, 240, 250], 0.6 - night * 0.45); }
        const bldg = mix(bot, [10, 10, 25], 0.6);
        for (let sx = 0; sx < N; sx++) {
          const wx = Math.floor(sx + dist * 0.35), hgt = city[wx % 32];
          for (let yy = FLOOR - hgt; yy < FLOOR; yy++) set(rgb, sx, yy, night > 0.5 && hash(wx, yy) < 0.18 ? [255, 220, 120] : bldg);
        }
        // pipes with soft edges and bright caps
        for (const w of walls) {
          const x0 = Math.floor(w.x), f = w.x - x0;
          for (let yy = 0; yy < FLOOR; yy++) {
            if (yy >= w.gap && yy < w.gap + GAP) continue;
            const cap = yy === w.gap - 1 || yy === w.gap + GAP;
            blend(rgb, x0, yy, cap ? [150, 255, 140] : [70, 220, 100], 1 - f);
            blend(rgb, x0 + 1, yy, cap ? [110, 240, 110] : [35, 170, 65], 1);
            blend(rgb, x0 + 2, yy, cap ? [60, 190, 70] : [20, 120, 45], f);
          }
          if (w.coin && !w.got) set(rgb, Math.round(w.x + 1), w.gap + 2, t % 6 < 4 ? [255, 215, 0] : [255, 255, 180]);
        }
        for (let sx = 0; sx < N; sx++) set(rgb, sx, FLOOR, (sx + Math.floor(dist)) % 4 < 2 ? [210, 170, 90] : [170, 130, 60]);
        // the bird, spread over two rows by its exact height, with a flapping wing
        const y0 = Math.floor(y), fy = y - y0;
        blend(rgb, 4, y0, [255, 220, 0], 1 - fy); blend(rgb, 4, y0 + 1, [255, 220, 0], fy);
        blend(rgb, 5, y0, [255, 120, 0], 1 - fy); blend(rgb, 5, y0 + 1, [255, 120, 0], fy);
        set(rgb, 3, Math.round(y) + (flapT > 1 ? -1 : 0), [255, 245, 190]);
      };
      return g;
    },
  },
  {
    name: 'Pixel Quest', emoji: '🏃', tickMs: 70,
    help: 'Hold ▶ to run and press A (or ▲) to jump. Hold A longer to jump higher. Grab coins, bump ? blocks (some hold a star that makes you unstoppable), stomp blobs and bats, avoid spikes and pits. Each flag is a new level. 3 lives.',
    create() {
      const g = { score: 0, over: false, tickMs: 70 };
      // world: column index -> array of 16 cells. '.' air, 'G' ground, 'B' brick, 'Q' ? block, 'U' used block, 'S' spike, 'C' coin, 'F' flag pole
      const cols = [], enemies = [], flags = [];
      let genX = 0, nextFlag = 150;
      const GROUND = 13;
      const column = (top = GROUND) => { const c = Array(N).fill('.'); for (let y = top; y < N; y++) c[y] = 'G'; return c; };
      const flat = (n, top = GROUND) => { for (let i = 0; i < n; i++) cols[genX++] = column(top); };
      function generate(to) {
        while (genX < to) {
          const d = Math.min(1, genX / 400); // difficulty grows with distance
          if (genX < 18) { flat(18 - genX); continue; }
          if (genX >= nextFlag) { flat(2); const c = column(); for (let y = 3; y < GROUND; y++) c[y] = 'F'; flags.push(genX); cols[genX++] = c; flat(4); nextFlag += 150; continue; }
          const r = Math.random();
          if (r < 0.18) { // pit
            const w = 2 + rand(d > 0.5 ? 3 : 2);
            for (let i = 0; i < w; i++) cols[genX++] = Array(N).fill('.');
            flat(3);
          } else if (r < 0.32) { // spikes
            flat(2); const c = column(); c[GROUND - 1] = 'S'; cols[genX++] = c;
            if (d > 0.4 && Math.random() < 0.5) { const c2 = column(); c2[GROUND - 1] = 'S'; cols[genX++] = c2; }
            flat(3);
          } else if (r < 0.48) { // enemies on a flat stretch, bats later on
            const start = genX; flat(7);
            enemies.push({ x: start + 4, y: GROUND - 1, dir: -1, alive: true });
            if (d > 0.6) enemies.push({ x: start + 6, y: GROUND - 1, dir: 1, alive: true });
            if (d > 0.25 && Math.random() < 0.5) enemies.push({ x: start + 5, y: 8, base: 8, fly: true, dir: -1, alive: true, ph: Math.random() * 6 });
          } else if (r < 0.62) { // steps up and down
            flat(1, GROUND - 1); flat(2, GROUND - 2); flat(2, GROUND - 3); flat(1, GROUND - 1); flat(2);
          } else if (r < 0.80) { // floating bricks with coins and maybe a ? block, maybe over a pit
            const w = 3 + rand(3), pit = Math.random() < 0.3 + d * 0.4, q = Math.random() < 0.6 ? rand(w) : -1;
            flat(2);
            for (let i = 0; i < w; i++) {
              const c = pit && i > 0 && i < w - 1 ? Array(N).fill('.') : column();
              if (i === q) c[9] = 'Q'; else { c[9] = 'B'; c[8] = 'C'; }
              cols[genX++] = c;
            }
            flat(3);
          } else { // coin arc
            for (let i = 0; i < 5; i++) { const c = column(); c[[11, 10, 9, 10, 11][i]] = 'C'; cols[genX++] = c; }
          }
        }
      }
      generate(40);

      const cell = (x, y) => { if (y < 0 || y >= N) return '.'; const c = cols[Math.floor(x)]; return c ? c[Math.floor(y)] : '.'; };
      const solid = (x, y) => { const k = cell(x, y); return k === 'G' || k === 'B' || k === 'Q' || k === 'U'; };

      let x = 3, y = GROUND - 2, vx = 0, vy = 0, onGround = false, cam = 0, lives = 3, hurt = 0, t = 0, maxX = 0, coins = 0, stomps = 0, bricks = 0, level = 1, star = 0;
      const W = 0.8; // hero is 0.8 wide, 2 tall
      const RAINBOW = [[255, 80, 80], [255, 200, 40], [80, 255, 120], [80, 200, 255], [220, 100, 255]];
      card(g, ['LV', '1'], [255, 215, 0], 1000);

      function loseLife() {
        lives--; navigator.vibrate?.(120); fx(g, 'hurt'); shake(g, 4);
        burst(g, x - cam, y + 1, [[255, 220, 150], [40, 200, 255], [255, 255, 255]], 10, { speed: 0.6, grav: 0.04 });
        if (!lives) { g.over = true; return; }
        // respawn on the next safe ground in view
        let rx = Math.max(cam + 1, Math.floor(x) - 2);
        while (generate(rx + 20), !(solid(rx, GROUND) && solid(rx + 1, GROUND) && cell(rx, GROUND - 1) === '.' && cell(rx + 1, GROUND - 1) === '.')) rx++;
        x = rx; y = GROUND - 2; vx = vy = 0; hurt = 25;
        cam = Math.max(cam, Math.floor(x) - 5);
      }
      function kill(e) { e.alive = false; stomps++; fx(g, 'stomp'); burst(g, e.x - cam, e.y, [[200, 60, 220], [255, 255, 255]], 8, { speed: 0.5 }); }

      g.tick = (inp, rgb) => {
        t++;
        // --- input & physics ---
        if (inp.held.right) vx = Math.min(0.42, vx + 0.07);
        else if (inp.held.left) vx = Math.max(-0.32, vx - 0.07);
        else vx *= 0.7;
        const jump = inp.pressed.has('a') || inp.pressed.has('up');
        if (jump && onGround) { vy = -0.98; fx(g, 'jump'); }
        if (!inp.held.a && !inp.held.up && vy < -0.35) vy = -0.35; // short hop when released early
        vy = Math.min(0.85, vy + 0.1);

        let nx = x + vx;
        if (nx < cam) { nx = cam; vx = 0; }
        for (const yy of [y + 0.05, y + 1, y + 1.95]) {
          if (vx > 0 && solid(nx + W, yy)) { nx = Math.floor(nx + W) - W - 0.001; vx = 0; }
          if (vx < 0 && solid(nx, yy)) { nx = Math.floor(nx) + 1; vx = 0; }
        }
        x = nx;
        const wasGround = onGround, fall = vy;
        let ny = y + vy; onGround = false;
        if (vy > 0 && (solid(x + 0.05, ny + 2) || solid(x + W - 0.05, ny + 2))) { ny = Math.floor(ny + 2) - 2; vy = 0; onGround = true; }
        if (vy < 0 && (solid(x + 0.05, ny) || solid(x + W - 0.05, ny))) {
          // bump blocks from below
          const by = Math.floor(ny);
          for (const bx of new Set([Math.floor(x + 0.05), Math.floor(x + W - 0.05)])) {
            const c = cols[bx]; if (!c) continue;
            if (c[by] === 'B' && c[by - 1] === 'C') { c[by - 1] = '.'; coins++; fx(g, 'coin'); burst(g, bx - cam, by - 1, [255, 215, 0], 5, { speed: 0.4, up: 0.3 }); }
            else if (c[by] === 'Q') {
              c[by] = 'U';
              if (Math.random() < 0.3) { star = 150; fx(g, 'power'); burst(g, bx - cam, by - 1, RAINBOW, 12, { speed: 0.7 }); }
              else { coins += 3; fx(g, 'coin'); burst(g, bx - cam, by - 1, [[255, 215, 0], [255, 255, 180]], 9, { speed: 0.5, up: 0.4, grav: 0.05 }); }
            } else if (c[by] === 'B') { c[by] = '.'; bricks++; fx(g, 'brick'); burst(g, bx - cam, by, [[190, 100, 40], [120, 60, 25]], 8, { speed: 0.5, grav: 0.08, up: 0.3 }); }
          }
          ny = Math.floor(ny) + 1; vy = 0;
        }
        y = ny;
        if (onGround && !wasGround && fall > 0.5) burst(g, x + W / 2 - cam, y + 2, [150, 120, 90], 3, { speed: 0.3, life: 4 });

        if (y > N) { loseLife(); if (g.over) return; }
        for (const [cx, cy] of [[x + 0.1, y + 0.2], [x + W - 0.1, y + 0.2], [x + 0.1, y + 1.8], [x + W - 0.1, y + 1.8]]) {
          const k = cell(cx, cy);
          if (k === 'C') { cols[Math.floor(cx)][Math.floor(cy)] = '.'; coins++; fx(g, 'coin'); burst(g, Math.floor(cx) - cam, Math.floor(cy), [255, 215, 0], 4, { speed: 0.35, life: 5 }); }
          if (k === 'S' && !hurt && !star) { loseLife(); if (g.over) return; break; }
        }
        // flags: a new level
        if (flags.length && x > flags[0]) {
          flags.shift(); level++; fx(g, 'level'); flash(g, [255, 215, 0], 4);
          burst(g, x - cam, 4, RAINBOW, 14, { speed: 0.8 });
          card(g, ['LV', String(level)], [255, 215, 0], 900);
        }
        // enemies
        for (const e of enemies) {
          if (!e.alive || e.x < cam - 4 || e.x > cam + 20) continue;
          if (e.fly) { e.x += e.dir * 0.06; e.y = e.base + Math.sin(t / 8 + e.ph) * 2; if (solid(e.x + (e.dir > 0 ? 1 : 0), e.y)) e.dir = -e.dir; }
          else {
            const ahead = e.x + (e.dir > 0 ? 1 : -0.05);
            if (solid(ahead, e.y) || !solid(ahead, e.y + 1)) e.dir = -e.dir;
            e.x += e.dir * 0.07;
          }
          if (Math.abs(e.x - x) < 0.85 && y + 2 > e.y + 0.1 && y < e.y + 1) {
            if (star) kill(e);
            else if (vy > 0 && y + 2 < e.y + 0.7) { kill(e); vy = -0.6; }
            else if (!hurt) { loseLife(); if (g.over) return; }
          }
        }
        if (hurt) hurt--;
        if (star) star--;

        cam = Math.max(cam, Math.floor(x) - 5);
        maxX = Math.max(maxX, x);
        generate(cam + 40);
        g.score = Math.floor(maxX / 2) + coins * 5 + stomps * 10 + bricks + (level - 1) * 50;

        // --- draw ---
        for (let sy = 0; sy < N; sy++) { const c = [[8, 10, 36], [14, 20, 60], [22, 34, 86], [34, 52, 110]][Math.min(3, sy >> 2)]; for (let sx = 0; sx < N; sx++) set(rgb, sx, sy, c); }
        set(rgb, 12, 2, [230, 230, 200]); set(rgb, 13, 2, [200, 200, 170]); set(rgb, 12, 3, [200, 200, 170]);
        for (let i = 0; i < 3; i++) { const cx = ((i * 11 - cam * 0.3) % 33 + 33) % 33 - 5, cy = 3 + (i % 2) * 2; for (let d = 0; d < 3; d++) blend(rgb, cx + d, cy, [120, 130, 180], 0.6); blend(rgb, cx + 1, cy - 1, [120, 130, 180], 0.5); }
        for (let sx = 0; sx < N; sx++) {
          const h = 10 + Math.round(Math.sin((sx + cam * 0.5) * 0.35) * 1.5);
          for (let sy = h; sy < N; sy++) set(rgb, sx, sy, [20, 60, 70]);
        }
        for (let sx = 0; sx < N; sx++) {
          const wx = cam + sx, c = cols[wx]; if (!c) continue;
          for (let sy = 0; sy < N; sy++) {
            const k = c[sy];
            if (k === 'G') {
              if (sy === 0 || c[sy - 1] !== 'G') set(rgb, sx, sy, [60, 200, 70]);
              else set(rgb, sx, sy, hash(wx, sy) < 0.2 ? [90, 55, 28] : [110, 70, 35]);
              if (sy > 0 && c[sy - 1] === '.' && hash(wx, 99) < 0.12) set(rgb, sx, sy - 1, [255, 220, 80]);
            }
            else if (k === 'B') set(rgb, sx, sy, (wx + sy) % 2 ? [190, 100, 40] : [160, 80, 30]);
            else if (k === 'Q') set(rgb, sx, sy, t % 10 < 7 ? [255, 200, 40] : [200, 140, 20]);
            else if (k === 'U') set(rgb, sx, sy, [120, 90, 60]);
            else if (k === 'S') set(rgb, sx, sy, [230, 230, 240]);
            else if (k === 'C') set(rgb, sx, sy, t % 8 < 6 ? [255, 215, 0] : [255, 255, 180]);
            else if (k === 'F') set(rgb, sx, sy, [220, 220, 220]);
          }
          if (c[3] === 'F' && flags.includes(wx)) { const wave = t % 8 < 4; set(rgb, sx + 1, 3, [60, 220, 90]); set(rgb, sx + 1, 4, [60, 220, 90]); set(rgb, sx + 2, wave ? 3 : 4, [40, 170, 70]); }
        }
        for (const e of enemies) if (e.alive) {
          const ex = e.x - cam, e0 = Math.floor(ex), f = ex - e0;
          if (e.fly) {
            const ey = Math.round(e.y), up = (t >> 2) % 2;
            set(rgb, ex, ey, [150, 110, 230]); blend(rgb, ex - 1, ey - up, [110, 80, 190], 0.9); blend(rgb, ex + 1, ey - up, [110, 80, 190], 0.9);
          } else {
            const c = (t >> 2) % 2 ? [200, 60, 220] : [170, 45, 190];
            blend(rgb, e0, e.y, c, 1 - f); blend(rgb, e0 + 1, e.y, c, f);
          }
        }
        if (!hurt || t % 4 < 2) {
          const hx = Math.floor(x + W / 2 - cam), hy = Math.round(y);
          set(rgb, hx, hy, star ? RAINBOW[t % 5] : [255, 220, 150]);
          set(rgb, hx, hy + 1, star ? RAINBOW[(t + 2) % 5] : [40, 200, 255]);
        }
        for (let i = 0; i < lives; i++) set(rgb, 15 - i, 0, [255, 60, 90]);
      };
      return g;
    },
  },
  {
    name: 'Star Blaster', emoji: '🚀', tickMs: 70,
    help: 'Hold ◀ ▶ to fly, hold A to fire. Clear each wave of invaders. Every 5th wave is a boss. Green stars give double shots, blue orbs a shield. 3 lives.',
    create() {
      const g = { score: 0, over: false, tickMs: 70 };
      let sx = 7, lives = 3, t = 0, cool = 0, hurt = 0, power = 0, shield = 0, wave = 0, boss = null;
      let shots = [], bombs = [], foes = [], drops = [];
      const stars = Array.from({ length: 14 }, () => ({ x: rand(N), y: Math.random() * N, v: 0.1 + Math.random() * 0.3 }));
      function nextWave() {
        wave++;
        if (wave > 1) fx(g, 'level');
        if (wave % 5 === 0) {
          const hp = 24 + wave * 4;
          boss = { x: 7.5, y: -3, hp, max: hp, dir: 1, cool: 30, hit: 0 };
          return card(g, ['BOSS'], [255, 70, 90], 1200);
        }
        card(g, ['WAVE', String(wave)], [80, 200, 255], 1000);
        const kind = wave % 3, n = Math.min(10, 4 + wave);
        for (let i = 0; i < n; i++) foes.push({
          x: kind === 0 ? 2 + (i % 5) * 3 : rand(14) + 1,
          y: kind === 0 ? -1 - Math.floor(i / 5) * 3 : -1 - i * 2.5,
          kind, phase: Math.random() * 6, hp: wave > 4 && i % 4 === 0 ? 2 : 1,
        });
      }
      const ship = () => Math.round(sx);
      function hitMe() {
        if (shield) { shield = 0; hurt = 12; fx(g, 'hit'); burst(g, sx, 14, [80, 220, 255], 10); return; }
        hurt = 20; lives--; fx(g, 'hurt'); shake(g, 4); flash(g, [255, 60, 60], 3);
        burst(g, sx, 14, [[80, 200, 255], [255, 255, 255]], 10); navigator.vibrate?.(120);
        if (!lives) g.over = true;
      }
      g.tick = (inp, rgb) => {
        t++;
        if (inp.held.left) sx = Math.max(1, sx - 0.5);
        if (inp.held.right) sx = Math.min(N - 2, sx + 0.5);
        if (cool) cool--;
        if ((inp.held.a || inp.pressed.has('a') || inp.held.up) && !cool) {
          const x = ship();
          if (power) { shots.push({ x: x - 1, y: 13 }, { x: x + 1, y: 13 }); power--; } else shots.push({ x, y: 13 });
          cool = 3; fx(g, 'shoot');
        }
        if (!foes.length && !boss) nextWave();
        const speed = 0.06 + Math.min(0.08, wave * 0.008);
        for (const f of foes) {
          f.y += speed;
          if (f.kind === 1) f.x += Math.sin(t / 6 + f.phase) * 0.25;
          if (f.kind === 2) f.x += Math.sign(sx - f.x) * 0.05;
          f.x = clamp(f.x, 0, N - 1);
          if (f.y > 0 && Math.random() < 0.006 + wave * 0.002) bombs.push({ x: Math.round(f.x), y: f.y + 1, vx: 0 });
        }
        if (boss) {
          if (boss.y < 1) boss.y += 0.08;
          else { boss.x += boss.dir * (0.12 + wave * 0.005); if (boss.x < 2.5 || boss.x > 13.5) boss.dir *= -1; }
          if (--boss.cool <= 0 && boss.y >= 1) {
            boss.cool = Math.max(14, 34 - wave); const bx = Math.round(boss.x);
            bombs.push({ x: bx, y: boss.y + 2, vx: 0 }, { x: bx - 2, y: boss.y + 2, vx: -0.1 }, { x: bx + 2, y: boss.y + 2, vx: 0.1 });
            fx(g, 'shoot');
          }
          if (boss.hit) boss.hit--;
        }
        shots.forEach(s => s.y -= 0.9);
        bombs.forEach(b => { b.y += 0.35; b.x += b.vx; });
        drops.forEach(d => d.y += 0.2);
        for (const s of shots) {
          for (const f of foes) {
            if (f.hp > 0 && Math.abs(Math.round(f.x) - s.x) <= 0.5 && s.y <= f.y + 1 && s.y >= f.y - 1) {
              s.y = -9; f.hp--;
              if (!f.hp) {
                burst(g, f.x, f.y, [[255, 160, 40], [255, 255, 160]], 7); g.score += 10; fx(g, 'boom');
                if (Math.random() < 0.1) drops.push({ x: Math.round(f.x), y: f.y, kind: Math.random() < 0.6 ? 'P' : 'S' });
              }
            }
          }
          if (boss && s.y > -5 && Math.abs(s.x - Math.round(boss.x)) <= 2 && s.y >= boss.y - 0.5 && s.y <= boss.y + 2.5) {
            s.y = -9; boss.hp--; boss.hit = 2; fx(g, 'hit'); burst(g, s.x, boss.y + 2, [255, 200, 120], 3, { speed: 0.4, life: 4 });
            if (boss.hp <= 0) {
              for (let k = 0; k < 3; k++) burst(g, boss.x - 2 + k * 2, boss.y + 1, [[255, 70, 90], [255, 220, 120], [255, 255, 255]], 10, { speed: 0.9, life: 12 });
              shake(g, 6); flash(g, [255, 255, 255], 4); fx(g, 'boom'); g.score += 100 + wave * 10;
              drops.push({ x: Math.round(boss.x), y: boss.y + 1, kind: 'P' }); boss = null;
            }
          }
        }
        const sh = ship();
        const hitShip = (x, y) => Math.abs(x - sh) <= 1 && y >= 13.5 && y < 16;
        for (const d of drops) if (Math.abs(d.x - sh) <= 1 && d.y >= 13) {
          d.y = 99; fx(g, 'power'); burst(g, d.x, 14, d.kind === 'P' ? [60, 255, 120] : [80, 220, 255], 8);
          if (d.kind === 'P') power = 25; else shield = 1;
        }
        if (!hurt) {
          let hit = false;
          for (const b of bombs) if (hitShip(Math.round(b.x), b.y)) { b.y = 99; hit = true; }
          for (const f of foes) if (f.hp > 0 && (hitShip(Math.round(f.x), f.y) || f.y > 15.5)) { f.hp = 0; burst(g, f.x, f.y, [255, 80, 80], 6); hit = true; }
          if (hit) { hitMe(); if (g.over) return; }
        }
        if (hurt) hurt--;
        foes = foes.filter(f => f.hp > 0 && f.y < 17);
        shots = shots.filter(s => s.y > -1);
        bombs = bombs.filter(b => b.y < 16 && b.x > -1 && b.x < N);
        drops = drops.filter(d => d.y < 16);
        stars.forEach(s => { s.y += s.v; if (s.y >= N) { s.y = 0; s.x = rand(N); } });

        // draw
        rgb.fill(0);
        for (const s of stars) set(rgb, s.x, s.y, s.v > 0.25 ? [70, 70, 110] : [35, 35, 60]);
        for (const d of drops) set(rgb, d.x, d.y, t % 4 < 2 ? (d.kind === 'P' ? [60, 255, 120] : [80, 220, 255]) : [220, 255, 230]);
        for (const f of foes) {
          const c = f.hp > 1 ? [255, 255, 255] : [[255, 70, 140], [255, 200, 40], [170, 90, 255]][f.kind];
          blend(rgb, Math.round(f.x), Math.floor(f.y), c, 1 - (f.y % 1));
          blend(rgb, Math.round(f.x), Math.floor(f.y) + 1, c, f.y % 1);
          if (t % 6 < 3) { set(rgb, Math.round(f.x) - 1, Math.round(f.y), dim(c, 0.5)); set(rgb, Math.round(f.x) + 1, Math.round(f.y), dim(c, 0.5)); }
        }
        if (boss) {
          const bx = Math.round(boss.x), by = Math.round(boss.y), body = boss.hit ? [255, 255, 255] : [200, 50, 90], wing = boss.hit ? [255, 255, 255] : [130, 30, 70];
          for (let d = -1; d <= 1; d++) set(rgb, bx + d, by, body);
          for (let d = -2; d <= 2; d++) set(rgb, bx + d, by + 1, Math.abs(d) === 2 ? wing : body);
          set(rgb, bx - 2, by + 2, wing); set(rgb, bx, by + 2, [255, 220, 80]); set(rgb, bx + 2, by + 2, wing);
          set(rgb, bx, by, t % 6 < 3 ? [255, 230, 80] : [255, 140, 40]);
          const bar = Math.ceil(boss.hp / boss.max * 12);
          for (let x = 0; x < 12; x++) set(rgb, x, 0, x < bar ? [255, 70, 90] : [40, 10, 20]);
        }
        for (const s of shots) { set(rgb, s.x, s.y, [255, 255, 160]); set(rgb, s.x, s.y + 1, [140, 120, 40]); }
        for (const b of bombs) set(rgb, b.x, b.y, t % 4 < 2 ? [255, 60, 60] : [255, 140, 120]);
        if (!hurt || t % 4 < 2) {
          const c = power ? [60, 255, 120] : [80, 200, 255];
          set(rgb, sh, 14, [255, 255, 255]); set(rgb, sh - 1, 15, c); set(rgb, sh, 15, c); set(rgb, sh + 1, 15, c);
          if (shield && t % 4 < 2) { blend(rgb, sh - 1, 14, [80, 220, 255], 0.6); blend(rgb, sh + 1, 14, [80, 220, 255], 0.6); blend(rgb, sh, 13, [80, 220, 255], 0.6); }
        }
        for (let i = 0; i < lives; i++) set(rgb, 15 - i, 0, [255, 60, 90]);
      };
      return g;
    },
  },
  {
    name: 'Maze Raider', emoji: '👾', tickMs: 70,
    help: '3D first person. ▲▼ walk, ◀▶ turn, A fires, Y shows the map (Xbox: left stick, A or RT to fire, LB/RB to sidestep, Y for the map). From level 2 a red door blocks the way: find the key. Grab the shotgun, watch out for green spitters, and reach the glowing green exit. Pink = health, yellow = ammo.',
    create() {
      const g = { score: 0, over: false, tickMs: 70 };
      const VIEW = 15, MID = VIEW / 2; // rows 0..14 are the 3D view, row 15 is the status bar
      let map, size, px, py, ang, hp = 100, ammo = 24, level = 0, t = 0, muzzle = 0, hurtFlash = 0, cool = 0, recoil = 0;
      let hasKey = false, doorLevel = false, shotgun = false, showMap = false, keyHint = 0;
      let things = [], shots = [], torches = [], seen = new Set();
      const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];

      function bfs(blockDoor) {
        const dist = Array.from({ length: size }, () => Array(size).fill(-1)); dist[1][1] = 0;
        const q = [[1, 1]], cells = [];
        while (q.length) {
          const [x, y] = q.shift(); cells.push([x, y]);
          for (const [dx, dy] of N4) { const nx = x + dx, ny = y + dy, v = map[ny][nx]; if ((!v || (!blockDoor && v === 5)) && dist[ny][nx] < 0) { dist[ny][nx] = dist[y][x] + 1; q.push([nx, ny]); } }
        }
        return { dist, cells };
      }
      function buildLevel() {
        level++;
        size = Math.min(21, 9 + level * 2) | 1; // odd size for the maze carver
        map = Array.from({ length: size }, () => Array(size).fill(1));
        const stack = [[1, 1]]; map[1][1] = 0;
        while (stack.length) {
          const [cx, cy] = stack[stack.length - 1];
          const dirs = [[2, 0], [-2, 0], [0, 2], [0, -2]].filter(([dx, dy]) => { const nx = cx + dx, ny = cy + dy; return nx > 0 && ny > 0 && nx < size - 1 && ny < size - 1 && map[ny][nx] === 1; });
          if (!dirs.length) { stack.pop(); continue; }
          const [dx, dy] = dirs[rand(dirs.length)];
          map[cy + dy / 2][cx + dx / 2] = 0; map[cy + dy][cx + dx] = 0; stack.push([cx + dx, cy + dy]);
        }
        for (let i = 0; i < size * 2; i++) { const x = 1 + rand(size - 2), y = 1 + rand(size - 2); if ((x + y) % 2) map[y][x] = 0; }
        for (let r = 0; r < 1 + level / 2; r++) { const x = 1 + rand(size - 5), y = 1 + rand(size - 5); for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) map[y + a][x + b] = 0; }
        // wall materials come in zones: brick, tech panels, stone, mossy stone
        for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (map[y][x]) map[y][x] = 1 + (((x >> 2) * 3 + (y >> 2) * 5 + level) % 4);
        const { dist, cells } = bfs(false);
        let far = [1, 1]; for (const [x, y] of cells) if (dist[y][x] > dist[far[1]][far[0]]) far = [x, y];
        const [ex, ey] = far;
        for (const [dx, dy] of N4) if (map[ey + dy][ex + dx]) { map[ey + dy][ex + dx] = 9; break; }
        // from level 2 a locked door sits in a corridor on the way to the exit
        hasKey = false; doorLevel = false; let keyAt = null;
        if (level >= 2) {
          const path = []; let c = far;
          while (dist[c[1]][c[0]] > 0) { path.push(c); const [x, y] = c; c = N4.map(([dx, dy]) => [x + dx, y + dy]).find(([nx, ny]) => !map[ny][nx] && dist[ny][nx] === dist[y][x] - 1); }
          const corridor = ([x, y]) => (!map[y][x - 1] && !map[y][x + 1] && map[y - 1][x] && map[y + 1][x]) || (!map[y - 1][x] && !map[y + 1][x] && map[y][x - 1] && map[y][x + 1]);
          for (let i = Math.floor(path.length * 0.15); i < path.length * 0.6 && !doorLevel; i++) {
            const [x, y] = path[i]; if (!corridor(path[i])) continue;
            map[y][x] = 5;
            const r = bfs(true);
            if (r.dist[ey][ex] < 0 && r.cells.length > 8) {
              doorLevel = true;
              const reach = r.cells.filter(([a, b]) => r.dist[b][a] > 3).sort((p, q) => r.dist[q[1]][q[0]] - r.dist[p[1]][p[0]]);
              keyAt = reach[rand(Math.max(1, Math.floor(reach.length / 3)))] || r.cells[r.cells.length - 1];
            } else map[y][x] = 0;
          }
        }
        // torches on the walls light up the gloom
        torches = [];
        for (const [x, y] of [...cells].sort(() => Math.random() - 0.5)) {
          if (torches.length >= size * 0.8) break;
          const w = N4.find(([dx, dy]) => map[y + dy][x + dx] && map[y + dy][x + dx] < 5);
          if (!w || torches.some(tc => Math.hypot(tc.x - x - 0.5, tc.y - y - 0.5) < 3.2)) continue;
          torches.push({ kind: 't', x: x + 0.5 + w[0] * 0.4, y: y + 0.5 + w[1] * 0.4, ph: Math.random() * 6 });
        }
        px = 1.5; py = 1.5; ang = map[1][2] ? Math.PI / 2 : 0;
        things = []; shots = []; seen = new Set();
        const spots = cells.filter(([x, y]) => dist[y][x] > 4 && !(keyAt && x === keyAt[0] && y === keyAt[1])).sort(() => Math.random() - 0.5);
        const monsters = 3 + level * 2;
        spots.slice(0, monsters).forEach(([x, y], i) => {
          const type = level >= 3 && i % 4 === 3 ? 'brute' : level >= 2 && i % 3 === 1 ? 'spitter' : 'grunt';
          things.push({ kind: 'm', type, x: x + 0.5, y: y + 0.5, hp: { grunt: 2, spitter: 2, brute: 5 }[type], cool: 0, hit: 0, step: 0, side: Math.random() < 0.5 ? 1 : -1 });
        });
        let s = monsters;
        const put = kind => { const p = spots[s++]; if (p) things.push({ kind, x: p[0] + 0.5, y: p[1] + 0.5 }); };
        put('h'); put('h'); put('a'); put('a');
        if (!shotgun && level >= 2) put('w');
        if (keyAt) things.push({ kind: 'k', x: keyAt[0] + 0.5, y: keyAt[1] + 0.5 });
        card(g, ['LV', String(level)], [255, 120, 60], 1100);
      }
      buildLevel();
      g.peek = () => ({ map, size, px, py, ang, things, hasKey, doorLevel, level, hp, shotgun }); // for tests

      const wall = (x, y) => (x < 0 || y < 0 || x >= size || y >= size) ? 1 : map[Math.floor(y)][Math.floor(x)];
      const free = (x, y) => !wall(x - 0.2, y - 0.2) && !wall(x + 0.2, y - 0.2) && !wall(x - 0.2, y + 0.2) && !wall(x + 0.2, y + 0.2);
      function move(dx, dy, who) {
        if (free(who.x + dx, who.y)) who.x += dx;
        if (free(who.x, who.y + dy)) who.y += dy;
      }
      function sight(ax, ay, bx, by) {
        const d = Math.hypot(bx - ax, by - ay), n = Math.ceil(d * 4);
        for (let i = 1; i < n; i++) if (wall(ax + (bx - ax) * i / n, ay + (by - ay) * i / n)) return false;
        return true;
      }
      // light = the player's own lamp (fades with distance) + nearby torches, in a few steps to keep colours low
      const FOG = [10, 6, 16];
      function torchLight(wx, wy) {
        let L = 0;
        for (const tc of torches) { const d2 = (tc.x - wx) ** 2 + (tc.y - wy) ** 2; if (d2 < 7) L += (1 - d2 / 7) * (0.85 + 0.15 * Math.sin(t * 0.6 + tc.ph)); }
        return Math.min(1, L);
      }
      function lit(c, d, wx, wy, side = 1) {
        const tl = torchLight(wx, wy), warm = Math.round(tl * 2) / 2;
        let k = Math.min(1.2, clamp(1.15 - d / 6, 0.1, 1) * 0.75 + tl * 0.7) * side;
        k = Math.round(k * 6) / 6;
        const f = Math.max(0, 1 - k);
        return [c[0] * k + FOG[0] * f + warm * 40, c[1] * k + FOG[1] * f + warm * 14, c[2] * k + FOG[2] * f];
      }
      const WALLC = { 1: [160, 78, 50], 2: [70, 95, 160], 3: [120, 120, 125], 4: [90, 120, 80], 5: [170, 40, 40], 9: [40, 255, 90] };
      function tex(type, u, v) {
        switch (type) {
          case 1: { const row = Math.floor(v * 4), off = (row & 1) * 0.5; return (v * 4) % 1 < 0.2 || ((u + off) * 2) % 1 < 0.12 ? [75, 50, 45] : [160, 78, 50]; }
          case 2: if (u < 0.1 || u > 0.9 || v < 0.08) return [40, 55, 100]; return v > 0.42 && v < 0.56 ? [110, 190, 240] : [70, 95, 160];
          case 3: { const row = Math.floor(v * 3); return (v * 3) % 1 < 0.14 || ((u * 2 + row * 0.37) % 1) < 0.1 ? [70, 70, 78] : [125, 125, 130]; }
          case 4: { const row = Math.floor(v * 3); if ((v * 3) % 1 < 0.14 || ((u * 2 + row * 0.37) % 1) < 0.1) return [45, 70, 45]; return hash(u * 8 | 0, v * 8 | 0) < 0.3 ? [70, 150, 60] : [100, 115, 95]; }
          case 5: if (Math.abs(u - 0.5) < 0.1 && Math.abs(v - 0.5) < 0.12) return [255, 220, 60]; return (u * 4) % 1 < 0.2 ? [100, 25, 25] : [175, 45, 40];
          case 9: return ((v * 3 + t * 0.12) % 1) < 0.45 ? [80, 255, 130] : [20, 150, 60];
        }
        return [160, 78, 50];
      }
      const SPR = {
        grunt: { size: 0.8, w: 0.7, lift: 0 }, brute: { size: 0.95, w: 0.85, lift: 0 }, spitter: { size: 0.75, w: 0.75, lift: 0 },
        h: { size: 0.32, w: 1, lift: 0 }, a: { size: 0.28, w: 1.2, lift: 0 }, k: { size: 0.28, w: 1.2, lift: 0.25 }, w: { size: 0.22, w: 2.2, lift: 0.25 },
        t: { size: 0.5, w: 0.4, lift: 0.3 }, p: { size: 0.24, w: 1, lift: 0.4 },
      };
      const MCOL = { grunt: [210, 40, 50], brute: [140, 60, 210], spitter: [70, 190, 80] };
      function paint(o, u, v) {
        switch (o.kind) {
          case 'm': {
            const base = MCOL[o.type];
            if (o.dying) return u < 0.1 || u > 0.9 ? null : mix(base, [150, 0, 0], 0.6);
            if (v > 0.82) { // two legs that take turns
              const L = u > 0.18 && u < 0.4, R = u > 0.6 && u < 0.82;
              if (!L && !R) return null;
              if ((o.step | 0) % 2 ? L && v > 0.92 : R && v > 0.92) return null;
              return dim(base, 0.6);
            }
            if (u < 0.1 || u > 0.9) return null;
            if (v < 0.14 && (u < 0.26 || u > 0.74)) return o.type === 'brute' && (u < 0.2 || u > 0.8) ? [230, 220, 200] : null;
            if (o.hit) return [255, 255, 255];
            if (v > 0.22 && v < 0.38 && (Math.abs(u - 0.32) < 0.1 || Math.abs(u - 0.68) < 0.1)) return o.type === 'spitter' ? [255, 90, 40] : [255, 230, 60];
            if (v > 0.5 && v < 0.64 && u > 0.3 && u < 0.7) return o.type === 'spitter' ? (o.charge ? [190, 255, 140] : [30, 70, 25]) : v < 0.55 && (u * 10 | 0) % 2 ? [240, 240, 240] : [70, 10, 15];
            return base;
          }
          case 'h': if (v < 0.15) return [200, 200, 210]; return (Math.abs(u - 0.5) < 0.14 && v > 0.25 && v < 0.88) || (Math.abs(v - 0.56) < 0.14 && u > 0.2 && u < 0.8) ? [230, 30, 40] : [235, 235, 240];
          case 'a': return v < 0.2 ? [120, 90, 20] : (u * 4 | 0) % 2 ? [255, 210, 40] : [180, 140, 20];
          case 'k': {
            const gold = t % 8 < 5 ? [255, 220, 60] : [255, 255, 170];
            if (u < 0.38) return u > 0.12 && u < 0.26 && v > 0.3 && v < 0.7 ? null : gold;
            if (v > 0.38 && v < 0.62) return gold;
            return v >= 0.62 && u > 0.6 && (u * 10 | 0) % 2 ? gold : null;
          }
          case 'w': if (v > 0.3 && v < 0.6) return u < 0.35 ? [130, 75, 40] : [150, 150, 165]; return v >= 0.6 && u > 0.2 && u < 0.38 ? [100, 55, 30] : null;
          case 't': {
            if (v > 0.5) return Math.abs(u - 0.5) < 0.22 ? [110, 70, 35] : null;
            if (Math.abs(u - 0.5) > 0.12 + 0.4 * v) return null;
            if (v > 0.25 && Math.abs(u - 0.5) < 0.12) return [255, 250, 200];
            return (t + (o.ph * 3 | 0)) % 4 < 2 ? [255, 210, 80] : [255, 130, 30];
          }
          case 'p': { const r = (u - 0.5) ** 2 + (v - 0.5) ** 2; return r > 0.25 ? null : r < 0.06 ? [230, 255, 200] : [120, 255, 90]; }
        }
        return null;
      }
      function hurt(dmg) { hp -= dmg; hurtFlash = 4; shake(g, 2); navigator.vibrate?.(60); fx(g, 'hurt'); }
      function damage(m, n) {
        m.hp -= n; m.hit = 3; m.alert = true; fx(g, 'hit');
        if (m.hp <= 0) {
          m.dying = 8; m.burst = true; fx(g, 'boom'); g.score += { grunt: 10, spitter: 15, brute: 25 }[m.type];
          if (Math.random() < 0.25) things.push({ kind: 'a', x: m.x, y: m.y });
        }
      }

      g.tick = (inp, rgb) => {
        t++;
        const h = inp.held, me = { x: px, y: py };
        if (inp.pressed.has('y')) { showMap = !showMap; fx(g, 'click'); }
        if (h.left) ang -= 0.12;
        if (h.right) ang += 0.12;
        let dx = Math.cos(ang), dy = Math.sin(ang);
        const sp = 0.12;
        if (h.up) move(dx * sp, dy * sp, me);
        if (h.down) move(-dx * sp * 0.7, -dy * sp * 0.7, me);
        if (h.sl) move(dy * sp * 0.8, -dx * sp * 0.8, me);
        if (h.sr) move(-dy * sp * 0.8, dx * sp * 0.8, me);
        px = me.x; py = me.y;
        const touching = v => [[dx * 0.45, dy * 0.45], [0.4, 0], [-0.4, 0], [0, 0.4], [0, -0.4]].map(([ox, oy]) => [px + ox, py + oy]).find(([x, y]) => wall(x, y) === v);

        // the locked door
        if (keyHint) keyHint--;
        const door = touching(5);
        if (door) {
          if (hasKey) { map[Math.floor(door[1])][Math.floor(door[0])] = 0; hasKey = false; fx(g, 'power'); flash(g, [255, 220, 60], 3); g.score += 10; }
          else if (!keyHint) { keyHint = 40; fx(g, 'click'); card(g, ['KEY'], [255, 220, 60], 900, false); }
        }
        // reached the exit: bonus, then the next level
        if (touching(9)) {
          g.score += 50 + level * 10 + Math.floor(hp / 2); fx(g, 'level'); flash(g, [40, 255, 90], 4);
          buildLevel(); dx = Math.cos(ang); dy = Math.sin(ang);
        }

        // --- floor and ceiling, cast per pixel so the tiles and torchlight sit on the ground ---
        const plane = 0.66, zbuf = new Array(N), rays = [];
        for (let col = 0; col < N; col++) { const cam = 2 * (col + 0.5) / N - 1; rays.push([dx - dy * plane * cam, dy + dx * plane * cam]); }
        for (let y = 0; y < VIEW; y++) {
          const off = y + 0.5 - MID;
          if (Math.abs(off) < 0.6) { for (let x = 0; x < N; x++) set(rgb, x, y, FOG); continue; }
          const rd = MID / Math.abs(off), floor = off > 0;
          for (let col = 0; col < N; col++) {
            const wx = px + rd * rays[col][0], wy = py + rd * rays[col][1];
            const tile = (Math.floor(wx * 2) + Math.floor(wy * 2)) & 1;
            const base = floor ? (tile ? [80, 70, 58] : [62, 54, 45]) : (tile ? [46, 42, 64] : [36, 33, 52]);
            set(rgb, col, y, lit(base, rd, wx, wy, floor ? 1 : 0.8));
          }
        }
        // --- walls: one ray per column, textured ---
        for (let col = 0; col < N; col++) {
          const [rx, ry] = rays[col];
          let mx = Math.floor(px), my = Math.floor(py);
          const ddx = Math.abs(1 / rx), ddy = Math.abs(1 / ry);
          const stx = rx < 0 ? -1 : 1, sty = ry < 0 ? -1 : 1;
          let sdx = (rx < 0 ? px - mx : mx + 1 - px) * ddx, sdy = (ry < 0 ? py - my : my + 1 - py) * ddy, side = 0, hit = 0;
          seen.add(my * size + mx);
          for (let i = 0; i < 64 && !hit; i++) {
            if (sdx < sdy) { sdx += ddx; mx += stx; side = 0; } else { sdy += ddy; my += sty; side = 1; }
            hit = wall(mx, my); seen.add(my * size + mx);
          }
          const dist = Math.max(0.05, side ? sdy - ddy : sdx - ddx);
          zbuf[col] = dist;
          const hx = px + rx * dist, hy = py + ry * dist;
          const u = (side ? hx : hy) % 1;
          const hgt = VIEW / dist, top = (VIEW - hgt) / 2, bot = top + hgt;
          for (let y = Math.max(0, Math.floor(top)); y < Math.min(VIEW, Math.ceil(bot)); y++) {
            const v = (y + 0.5 - top) / hgt, base = tex(hit, u, v);
            const c = hit === 9 ? dim(base, clamp(1.2 - dist / 12, 0.5, 1)) : lit(base, dist, hx - rx * 0.05, hy - ry * 0.05, side ? 0.8 : 1);
            blend(rgb, col, y, c, Math.min(y + 1, bot) - Math.max(y, top));
          }
        }

        // --- monsters ---
        for (const m of things) {
          if (m.kind !== 'm' || m.dead) continue;
          if (m.dying) { if (!--m.dying) m.dead = true; continue; }
          if (m.hit) m.hit--;
          if (m.cool) m.cool--;
          const d = Math.hypot(px - m.x, py - m.y), see = d < 9 && sight(m.x, m.y, px, py);
          if (see && d < 7) m.alert = true;
          const spd = { grunt: 0.05, brute: 0.035, spitter: 0.04 }[m.type];
          if (see && m.alert) {
            const ux = (px - m.x) / d, uy = (py - m.y) / d;
            if (m.type === 'spitter') {
              if (d < 3) move(-ux * spd, -uy * spd, m);
              else if (d > 5.5) move(ux * spd, uy * spd, m);
              else { if (Math.random() < 0.01) m.side = -m.side; move(-uy * spd * m.side, ux * spd * m.side, m); }
              m.step += 0.12;
              if (!m.cool) {
                m.charge = (m.charge || 0) + 1;
                if (m.charge >= 10) { m.charge = 0; m.cool = 50 + rand(30); shots.push({ kind: 'p', x: m.x, y: m.y, vx: ux * 0.14, vy: uy * 0.14, life: 120 }); fx(g, 'shoot'); }
              }
            } else if (d > 0.7) { move(ux * spd, uy * spd, m); m.step += 0.15; }
            else if (!m.cool) { hurt(m.type === 'brute' ? 15 : 8); m.cool = m.type === 'brute' ? 18 : 12; }
          } else { // wander about
            if (m.wd == null || Math.random() < 0.02) m.wd = Math.random() * Math.PI * 2;
            const ox = m.x, oy = m.y; move(Math.cos(m.wd) * 0.015, Math.sin(m.wd) * 0.015, m);
            if (m.x === ox && m.y === oy) m.wd = null; else m.step += 0.06;
          }
        }
        for (const s of shots) {
          s.x += s.vx; s.y += s.vy; s.life--;
          if (wall(s.x, s.y)) s.life = 0;
          else if (Math.hypot(px - s.x, py - s.y) < 0.4) { hurt(10); s.life = 0; }
        }
        shots = shots.filter(s => s.life > 0);
        if (hp <= 0) { g.over = true; return; }

        // --- pickups ---
        for (const it of things) {
          if (it.kind === 'm' || it.taken || Math.hypot(px - it.x, py - it.y) > 0.5) continue;
          it.taken = true; fx(g, 'pickup');
          if (it.kind === 'h') hp = Math.min(100, hp + 30);
          else if (it.kind === 'a') ammo += 12;
          else if (it.kind === 'k') { hasKey = true; fx(g, 'power'); g.score += 10; card(g, ['KEY'], [255, 220, 60], 700, false); }
          else if (it.kind === 'w') { shotgun = true; ammo += 8; fx(g, 'power'); card(g, ['GUN'], [255, 150, 40], 800, false); }
        }

        // --- shooting ---
        if (cool) cool--;
        if (recoil) recoil--;
        if ((inp.pressed.has('a') || h.a) && !cool) {
          if (ammo > 0) {
            ammo--; muzzle = 2; recoil = 2; fx(g, 'shoot');
            const live = things.filter(m => m.kind === 'm' && m.hp > 0).map(m => {
              const rx = m.x - px, ry = m.y - py;
              return { m, depth: rx * dx + ry * dy, lateral: -rx * dy + ry * dx };
            }).filter(s => s.depth > 0.2 && sight(px, py, s.m.x, s.m.y));
            if (shotgun) { // a wide spread that can hit several monsters
              cool = 9; shake(g, 1);
              for (const s of live) if (s.depth < 7 && Math.abs(s.lateral) < 0.3 + s.depth * 0.2) damage(s.m, s.depth < 3 ? 3 : 2);
            } else {
              cool = 4;
              const best = live.filter(s => Math.abs(s.lateral) < 0.35 && s.depth < Math.max(zbuf[7], zbuf[8]) + 0.3).sort((a, b) => a.depth - b.depth)[0];
              if (best) damage(best.m, 1);
            }
          } else { fx(g, 'click'); cool = 6; }
        }

        // --- sprites, far to near ---
        const list = [...things.filter(o => (o.kind === 'm' ? !o.dead : !o.taken)), ...shots, ...torches].map(o => {
          const rx = o.x - px, ry = o.y - py;
          return { o, tx: -dy * rx + dx * ry, ty: dx * rx + dy * ry };
        }).filter(s => s.ty > 0.15).sort((a, b) => b.ty - a.ty);
        for (const s of list) {
          const o = s.o, spec = SPR[o.kind === 'm' ? o.type : o.kind], scale = VIEW / s.ty;
          const sxc = (N / 2) * (1 + s.tx / (s.ty * plane));
          const lift = spec.lift + (o.kind === 'k' || o.kind === 'w' ? Math.sin(t / 5) * 0.05 : 0);
          const floorY = MID + scale / 2 - scale * lift;
          const hS = scale * spec.size * (o.dying ? o.dying / 8 : 1), wS = scale * spec.size * spec.w;
          const top = floorY - hS, left = sxc - wS / 2;
          if (o.burst) { o.burst = false; if (sxc > -2 && sxc < N + 2) burst(g, sxc, floorY - hS / 2, [MCOL[o.type], [255, 40, 40], [120, 0, 0]], 14, { speed: 0.7, life: 9, grav: 0.06 }); }
          const glow = o.kind === 't' || o.kind === 'p';
          for (let x = Math.floor(left); x < Math.ceil(left + wS); x++) {
            if (x < 0 || x >= N || zbuf[x] < s.ty) continue;
            for (let y = Math.floor(top); y < Math.ceil(floorY); y++) {
              if (y < 0 || y >= VIEW) continue;
              const c = paint(o, (x + 0.5 - left) / wS, (y + 0.5 - top) / hS);
              if (!c) continue;
              const cover = Math.min(1, Math.min(x + 1, left + wS) - Math.max(x, left)) * Math.min(1, Math.min(y + 1, floorY) - Math.max(y, top));
              blend(rgb, x, y, glow ? dim(c, clamp(1.3 - s.ty / 10, 0.5, 1)) : lit(c, s.ty, o.x, o.y), Math.max(0.35, cover));
            }
          }
        }

        // --- gun, flashes, HUD ---
        const bob = (h.up || h.down) && t % 6 < 3 ? 1 : 0, kick = recoil ? 1 : 0;
        if (shotgun) {
          set(rgb, 7, 12 + bob + kick, [150, 150, 165]); set(rgb, 8, 12 + bob + kick, [115, 115, 130]);
          for (let x = 6; x <= 9; x++) { set(rgb, x, 13 + kick, x < 8 ? [130, 75, 40] : [100, 55, 30]); set(rgb, x, 14, x < 8 ? [100, 55, 30] : [80, 45, 25]); }
          if (muzzle) { muzzle--; for (let x = 6; x <= 9; x++) set(rgb, x, 11, [255, 220, 100]); set(rgb, 7, 10, [255, 255, 200]); set(rgb, 8, 10, [255, 255, 200]); }
        } else {
          set(rgb, 7, 13 + bob + kick, [150, 150, 160]); set(rgb, 8, 13 + bob + kick, [110, 110, 120]);
          set(rgb, 7, 14, [90, 90, 100]); set(rgb, 8, 14, [70, 70, 80]);
          if (muzzle) { muzzle--; set(rgb, 7, 12, [255, 240, 120]); set(rgb, 8, 12, [255, 200, 60]); set(rgb, 7, 11, [255, 255, 200]); }
        }
        if (hurtFlash) { hurtFlash--; for (let i = 0; i < N * VIEW; i++) rgb[i * 3] = Math.min(255, rgb[i * 3] + 110); }
        if (showMap) {
          // the map shows only places you have seen
          const cx0 = Math.floor(px) - 7, cy0 = Math.floor(py) - 7;
          for (let y = 0; y < VIEW; y++) for (let x = 0; x < N; x++) {
            const wx = cx0 + x, wy = cy0 + y;
            let c = [0, 0, 0];
            if (wx >= 0 && wy >= 0 && wx < size && wy < size && seen.has(wy * size + wx)) { const v = map[wy][wx]; c = !v ? [22, 22, 32] : v === 9 ? (t % 6 < 3 ? [40, 255, 90] : [20, 140, 50]) : dim(WALLC[v], 0.65); }
            set(rgb, x, y, c);
          }
          for (const o of things) {
            if (o.taken || o.dead || !seen.has(Math.floor(o.y) * size + Math.floor(o.x))) continue;
            const c = o.kind === 'm' ? (o.hp > 0 ? [255, 60, 60] : null) : o.kind === 'k' ? [255, 220, 60] : o.kind === 'h' ? [255, 90, 160] : o.kind === 'w' ? [255, 150, 40] : [200, 170, 40];
            if (c) set(rgb, Math.floor(o.x) - cx0, Math.floor(o.y) - cy0, c);
          }
          set(rgb, 7, 7, [255, 255, 255]); set(rgb, 7 + Math.round(dx), 7 + Math.round(dy), [255, 140, 140]);
        }
        for (let x = 0; x < N; x++) set(rgb, x, 15, [12, 12, 16]);
        const hpBar = Math.ceil(hp / 100 * 6);
        for (let x = 0; x < hpBar; x++) set(rgb, x, 15, hp > 35 ? [60, 220, 90] : t % 6 < 3 ? [255, 60, 60] : [150, 30, 30]);
        if (doorLevel) { const kc = hasKey ? (t % 8 < 5 ? [255, 220, 60] : [255, 255, 170]) : [60, 50, 20]; set(rgb, 7, 15, kc); set(rgb, 8, 15, kc); }
        const ammoBar = Math.min(6, Math.ceil(ammo / 4));
        for (let x = 0; x < ammoBar; x++) set(rgb, 15 - x, 15, shotgun ? [255, 150, 40] : [255, 210, 40]);
        if (!ammo) set(rgb, 15, 15, t % 6 < 3 ? [255, 60, 60] : [60, 20, 20]);
      };
      return g;
    },
  },
  {
    name: 'Road Hopper', emoji: '🐸', tickMs: 70,
    help: 'Hop with the arrows. Dodge the traffic, ride logs and turtles across the river (turtles dive!), and land in all 4 homes at the top before the timer runs out. Catch a fly in a home for a bonus. 3 lives.',
    create() {
      const g = { score: 0, over: false, tickMs: 70 };
      const WRAP = 22;                 // lanes repeat every 22 cells so objects drift in from off-screen
      const HOMES = [1, 5, 9, 13];     // left x of each 2-wide home slot on row 0
      const CAR_COLORS = [[255, 70, 70], [255, 210, 40], [80, 170, 255], [255, 140, 220], [255, 140, 40], [230, 230, 230]];
      let level = 1, lives = 3, homes = [false, false, false, false], lanes = [];
      let x = 7, y = 14, best = 14, timer = 0, dead = 0, t = 0, fly = null;
      const TIME = 430; // about 30 s per attempt

      function buildLanes() {
        const sp = 1 + (level - 1) * 0.18;
        const L = (y, kind, dir, speed, objs) => ({ y, kind, dir, speed: speed * sp, objs: objs.map(([x, len]) => ({ x, len })) });
        lanes = [
          L(1, 'log', 1, 0.09, [[0, 4], [9, 3], [16, 4]]),
          L(2, 'turtle', -1, 0.11, [[2, 2], [8, 3], [15, 2]]),
          L(3, 'log', 1, 0.14, [[1, 3], [11, 5]]),
          L(4, 'turtle', -1, 0.08, [[0, 3], [7, 3], [14, 3]]),
          L(5, 'log', 1, 0.12, [[3, 5], [13, 3]]),
          L(6, 'turtle', -1, 0.13, [[1, 2], [6, 2], [12, 2], [18, 2]]),
          L(8, 'car', -1, 0.16, [[2, 3], [12, 3]]),
          L(9, 'car', 1, 0.12, [[0, 1], [6, 1], [12, 1], [17, 1]]),
          L(10, 'car', -1, 0.2, [[4, 2], [15, 2]]),
          L(11, 'car', 1, 0.09, [[1, 1], [8, 2], [15, 1]]),
          L(12, 'car', -1, 0.14, [[3, 1], [10, 1], [17, 1]]),
          L(13, 'car', 1, 0.1, [[0, 2], [9, 2], [16, 1]]),
        ];
        lanes.forEach((l, i) => l.objs.forEach((o, k) => { o.c = CAR_COLORS[(i + k) % CAR_COLORS.length]; o.phase = k * 37 + i * 11; }));
      }
      buildLanes();
      card(g, ['LV', '1'], [140, 255, 90], 1000);
      const respawn = () => { x = 7; y = 14; best = 14; timer = TIME; };
      respawn();

      const offset = (o, cx) => ((cx - o.x) % WRAP + WRAP) % WRAP;
      const covers = (o, cx) => offset(o, cx) < o.len;
      // riding is forgiving by a third of a cell, so a log you can see under you always holds you
      const under = (o, px) => { const d = offset(o, px); return d < o.len - 0.5 + 0.85 || d > WRAP - 0.85; };
      const turtlePhase = o => (t + o.phase) % 90;
      const diving = o => turtlePhase(o) >= 74 && turtlePhase(o) < 88;
      const laneAt = row => lanes.find(l => l.y === row);

      function die(kind) {
        lives--; dead = 14; fx(g, kind === 'water' ? 'boom' : 'hurt'); navigator.vibrate?.(120); shake(g, 3);
        if (kind === 'water') burst(g, x, y, [[90, 150, 255], [255, 255, 255]], 12, { speed: 0.5, up: 0.3, grav: 0.05 });
        else burst(g, x, y, [[255, 60, 60], [140, 255, 90], [255, 255, 255]], 10, { speed: 0.7 });
        if (!lives) g.over = true;
      }

      g.tick = (inp, rgb) => {
        t++;
        for (const l of lanes) for (const o of l.objs) o.x = ((o.x + l.dir * l.speed) % WRAP + WRAP) % WRAP;
        // a fly visits an empty home now and then
        if (fly && --fly.life <= 0) fly = null;
        if (!fly && t % 300 === 150) { const empty = homes.map((f, i) => f ? -1 : i).filter(i => i >= 0); if (empty.length) fly = { slot: empty[rand(empty.length)], life: 120 }; }
        if (dead) { dead--; if (!dead && !g.over) respawn(); }
        else {
          let moved = false;
          if (inp.pressed.has('up')) { y--; moved = true; }
          else if (inp.pressed.has('down') && y < 14) { y++; moved = true; }
          else if (inp.pressed.has('left') && x > 0.5) { x = Math.round(x) - 1; moved = true; }
          else if (inp.pressed.has('right') && x < 14.5) { x = Math.round(x) + 1; moved = true; }
          if (moved) { fx(g, 'bounce'); if (y < best) { best = y; g.score += 10; } }
          if (y >= 1 && y <= 6 && moved) x = Math.round(x);
          timer--;
          const cx = Math.round(x), lane = laneAt(y);
          if (y === 0) {
            const slot = HOMES.findIndex(h => cx === h || cx === h + 1);
            if (slot < 0 || homes[slot]) die('hedge');
            else {
              homes[slot] = true; g.score += 50 + Math.floor(timer / 10); fx(g, 'coin');
              burst(g, HOMES[slot] + 0.5, 0, [[140, 255, 90], [255, 255, 255]], 8, { speed: 0.5 });
              if (fly && fly.slot === slot) { g.score += 100; fx(g, 'power'); burst(g, HOMES[slot] + 0.5, 1, [[255, 230, 80], [255, 255, 255]], 10); fly = null; }
              if (homes.every(Boolean)) { level++; g.score += 100; homes = [false, false, false, false]; buildLanes(); fx(g, 'level'); flash(g, [140, 255, 90], 4); card(g, ['LV', String(level)], [140, 255, 90], 1000); }
              respawn();
            }
          } else if (lane && lane.kind === 'car') {
            if (lane.objs.some(o => covers(o, cx))) die('car');
          } else if (lane) {
            const ride = lane.objs.find(o => under(o, x) && !(lane.kind === 'turtle' && diving(o)));
            if (!ride) die('water');
            else { x += lane.dir * lane.speed; if (x < -0.4 || x > 15.4) die('water'); }
          }
          if (!dead && timer <= 0) die('time');
        }

        // ---- draw ----
        for (let row = 0; row < N; row++) for (let col = 0; col < N; col++) {
          let c;
          if (row === 0) c = HOMES.some(h => col === h || col === h + 1) ? [10, 30, 60] : hash(col, 0) < 0.4 ? [15, 85, 30] : [20, 110, 40];
          else if (row <= 6) c = (col * 3 + row * 5 + (t >> 2)) % 23 === 0 ? [90, 150, 255] : (col * 7 + row * 3 + (t >> 3)) % 31 === 0 ? [50, 100, 210] : [20, 60, 160];
          else if (row === 7 || row === 14) c = hash(col, row) < 0.15 ? [255, 200, 80] : [70, 40, 110];
          else if (row <= 13) c = (row === 10 || row === 12) && col % 4 < 2 ? [55, 55, 55] : [25, 25, 30];
          else c = [0, 0, 0];
          set(rgb, col, row, c);
        }
        homes.forEach((f, i) => { if (f) { set(rgb, HOMES[i], 0, [120, 255, 80]); set(rgb, HOMES[i] + 1, 0, [120, 255, 80]); } });
        if (fly && (fly.life > 30 || t % 4 < 2)) set(rgb, HOMES[fly.slot] + (t % 8 < 4 ? 0 : 1), 0, [255, 230, 80]);
        for (const l of lanes) for (const o of l.objs) for (let col = 0; col < N; col++) {
          if (!covers(o, col)) continue;
          const d = Math.floor(offset(o, col)), front = l.dir > 0 ? d === o.len - 1 : d === 0;
          if (l.kind === 'log') set(rgb, col, l.y, d === 0 || d === o.len - 1 ? [105, 65, 30] : hash(col + (o.x | 0), l.y) < 0.3 ? [120, 78, 36] : [150, 98, 46]);
          else if (l.kind === 'turtle') { const ph = turtlePhase(o); if (!diving(o)) set(rgb, col, l.y, ph >= 62 && ph < 74 && t % 4 < 2 ? [30, 100, 70] : d % 2 ? [30, 140, 75] : [45, 180, 95]); }
          else set(rgb, col, l.y, o.len === 1 ? o.c : front ? mix(o.c, [255, 255, 220], 0.45) : o.len === 3 ? dim(o.c, 0.75) : o.c);
        }
        if (dead) { if (t % 4 < 2) set(rgb, Math.round(x), y, [255, 40, 40]); }
        else set(rgb, Math.round(x), y, t % 10 < 8 ? [140, 255, 90] : [220, 255, 200]);
        const bar = Math.ceil(Math.max(0, timer) / TIME * 12);
        for (let col = 0; col < 12; col++) set(rgb, col, 15, col < bar ? (bar > 3 ? [60, 200, 90] : [255, 80, 60]) : [15, 15, 20]);
        for (let i = 0; i < lives; i++) set(rgb, 15 - i, 15, [255, 60, 90]);
      };
      return g;
    },
  },
  {
    name: 'Brick breaker', emoji: '🧱', tickMs: 70,
    help: 'Hold left or right to move the paddle, A launches the ball. Silver bricks take two hits. Catch the falling capsules: blue = wide paddle, pink = extra balls, green = slow ball. Every level has a new layout.',
    create() {
      const g = { score: 0, over: false, tickMs: 70 };
      let px = 6, pw = 4, wide = 0, slow = 0, lives = 3, level = 1, balls = [], bricks = [], caps = [], serveT = 0, t = 0;
      const COLORS = [[255, 60, 60], [255, 150, 40], [255, 230, 40], [60, 220, 90], [60, 160, 255]];
      const LAYOUTS = [
        () => true,
        (c, r) => Math.abs(c - 3.5) <= r + 0.5,
        (c, r) => (c + r) % 2 === 0,
        (c, r) => Math.abs(c - 3.5) + Math.abs(r - 2) <= 3.5,
        (c, r) => r !== 2 && c !== 3 && c !== 4,
      ];
      const CAPS = { W: [80, 160, 255], M: [255, 120, 220], S: [80, 255, 120] };
      function build() {
        bricks = [];
        const lay = LAYOUTS[(level - 1) % LAYOUTS.length];
        for (let r = 0; r < 5; r++) for (let c = 0; c < 8; c++) if (lay(c, r)) bricks.push({ x: c * 2, y: 1 + r, hp: level >= 2 && (r === 0 || (level >= 4 && r === 2)) ? 2 : 1, c: COLORS[(r + level - 1) % 5] });
      }
      const serve = () => { balls = [{ x: px + pw / 2 - 0.5, y: 14, vx: 0, vy: 0, stuck: true, trail: [] }]; serveT = 30; };
      build(); serve();
      card(g, ['LV', '1'], [255, 200, 60], 1000);
      const brickAt = (cx, cy) => bricks.find(b => b.hp > 0 && cy === b.y && (cx === b.x || cx === b.x + 1));
      g.tick = (inp, rgb) => {
        t++;
        if (inp.held.left) px = Math.max(0, px - 1);
        if (inp.held.right) px = Math.min(N - pw, px + 1);
        const launch = inp.pressed.has('a') || inp.pressed.has('up') || --serveT <= 0;
        const m = slow ? 0.65 : 1;
        for (const b of balls) {
          if (b.stuck) {
            b.x = px + pw / 2 - 0.5; b.y = 14;
            if (launch) { b.stuck = false; b.vx = (Math.random() < 0.5 ? -1 : 1) * 0.25; b.vy = -(0.45 + Math.min(0.25, level * 0.04)); fx(g, 'bounce'); }
            continue;
          }
          b.trail.unshift([b.x, b.y]); b.trail.length = Math.min(b.trail.length, 3);
          let nx = b.x + b.vx * m, ny = b.y + b.vy * m;
          if (nx < 0) { nx = 0; b.vx = Math.abs(b.vx); }
          if (nx > N - 1) { nx = N - 1; b.vx = -Math.abs(b.vx); }
          if (ny < 0) { ny = 0; b.vy = Math.abs(b.vy); }
          const hit = brickAt(Math.round(nx), Math.round(ny));
          if (hit) {
            if (brickAt(Math.round(b.x), Math.round(ny)) === hit) b.vy = -b.vy; else b.vx = -b.vx;
            nx = b.x; ny = b.y;
            hit.hp--;
            if (!hit.hp) {
              g.score += 1 + Math.floor(level / 2); fx(g, 'brick');
              burst(g, hit.x + 0.5, hit.y, [hit.c, dim(hit.c, 0.6), [255, 255, 255]], 7, { speed: 0.5, grav: 0.05 });
              if (Math.random() < 0.14) { const k = 'WMS'[rand(3)]; caps.push({ x: hit.x + rand(2), y: hit.y, kind: k }); }
            } else { fx(g, 'hit'); burst(g, hit.x + 0.5, hit.y, [220, 220, 235], 3, { speed: 0.3, life: 4 }); }
          }
          if (ny >= 14 && b.vy > 0 && nx >= px - 0.6 && nx <= px + pw - 0.4) {
            b.vy = -Math.abs(b.vy); b.vx = clamp((nx - (px + pw / 2 - 0.5)) * 0.2 || 0.12, -0.7, 0.7); ny = 14; fx(g, 'bounce');
            burst(g, nx, 15, [200, 200, 255], 3, { speed: 0.3, life: 4 });
          }
          b.x = nx; b.y = ny;
          if (ny > 15.5) b.dead = true;
        }
        balls = balls.filter(b => !b.dead);
        if (!balls.length) {
          lives--; fx(g, 'hurt'); shake(g, 4); flash(g, [255, 60, 60], 3);
          if (!lives) { g.over = true; return; }
          wide = 0; pw = 4; slow = 0; px = Math.min(px, N - pw); caps = []; serve();
        }
        for (const c of caps) {
          c.y += 0.2;
          if (Math.round(c.y) >= 15 && c.x >= px && c.x < px + pw) {
            c.y = 99; fx(g, 'power'); burst(g, c.x, 15, CAPS[c.kind], 8, { speed: 0.5 });
            if (c.kind === 'W') { pw = 6; wide = 300; px = Math.min(px, N - pw); }
            else if (c.kind === 'S') slow = 250;
            else { const src = balls.find(b => !b.stuck) || balls[0]; for (const s of [-1, 1]) balls.push({ x: src.x, y: src.y, vx: clamp(src.vx + s * 0.25, -0.7, 0.7) || s * 0.2, vy: -Math.abs(src.vy || 0.45), stuck: false, trail: [] }); }
          }
        }
        caps = caps.filter(c => c.y < 16);
        if (wide && !--wide) { pw = 4; px = Math.min(px, N - pw); }
        if (slow) slow--;
        if (bricks.every(b => b.hp <= 0)) {
          level++; g.score += 20; fx(g, 'level'); flash(g, [255, 255, 255], 4);
          build(); caps = []; serve(); card(g, ['LV', String(level)], [255, 200, 60], 1000);
        }
        // draw
        for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) set(rgb, x, y, [3, 3, 8 + (y >> 2) * 2]);
        for (const b of bricks) if (b.hp > 0) {
          const c = b.hp > 1 ? [205, 205, 220] : b.c;
          set(rgb, b.x, b.y, c); set(rgb, b.x + 1, b.y, dim(c, 0.6));
        }
        for (const c of caps) set(rgb, c.x, c.y, t % 4 < 2 ? CAPS[c.kind] : [255, 255, 255]);
        const pc = wide ? [120, 230, 255] : [200, 200, 255];
        for (let i = 0; i < pw; i++) set(rgb, px + i, 15, i === 0 || i === pw - 1 ? dim(pc, 0.65) : pc);
        for (const b of balls) {
          b.trail.forEach(([x, y], i) => blend(rgb, x, y, slow ? [80, 255, 120] : [255, 255, 255], 0.35 - i * 0.1));
          set(rgb, b.x, b.y, slow ? [180, 255, 200] : [255, 255, 255]);
        }
        for (let i = 0; i < lives; i++) set(rgb, 15 - i, 0, [255, 60, 120]);
      };
      return g;
    },
  },
];

export const GAMES = GAME_LIST.map(polish);

// Score screen shown after a game ends: GAME OVER (or YOU WIN!) then the score.
export function gameOverFrame(rgb, game, t) {
  rgb.fill(0);
  const c = game.won ? [80, 255, 120] : [255, 70, 90];
  for (let x = 0; x < N; x++) { set(rgb, x, 0, (x + t) % 4 < 2 ? c : dim(c, 0.3)); set(rgb, x, 15, (x - t + 64) % 4 < 2 ? c : dim(c, 0.3)); }
  if (t % 24 < 10) { drawText(rgb, game.won ? 'YOU' : 'GAME', 3, c); drawText(rgb, game.won ? 'WIN!' : 'OVER', 9, c); }
  else drawNumber(rgb, game.score, 5, t % 6 < 4 ? [255, 255, 255] : [150, 150, 150]);
}
