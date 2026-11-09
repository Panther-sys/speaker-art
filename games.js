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

// ---------- the clean palette: the same colour means the same thing in every game ----------
const YOU = [60, 200, 255], P2 = [255, 92, 200], RED = [255, 64, 64], GOLD = [255, 210, 60], GREEN = [60, 220, 90], WHITE = [255, 255, 255], GREY = [110, 115, 128], DARK = [42, 46, 58], NAVY = [16, 32, 60], BLACK = [0, 0, 0];
const fill = (rgb, c) => { for (let i = 0; i < 768; i += 3) { rgb[i] = c[0]; rgb[i + 1] = c[1]; rgb[i + 2] = c[2]; } };

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
  const sp = o.speed ?? 0.6, life = Math.min(6, o.life ?? 5);
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, v = sp * (0.3 + Math.random() * 0.7);
    (g.parts ||= []).push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - (o.up ?? 0), grav: o.grav ?? 0, life: Math.max(1, life * (0.6 + Math.random() * 0.6) | 0), max: life, c: Array.isArray(c[0]) ? c[0] : c });
  }
}
const shake = (g, n) => { g.shakeT = Math.max(g.shakeT || 0, n); };
const flash = (g, c, n = 3) => { g.flashC = c; g.flashT = g.flashMax = Math.min(n, 3); };
// a banner across the screen, e.g. card(g, ['LV', '2'], colour). hold freezes the game while it shows.
function card(g, lines, c, ms = 1300, hold = true) {
  g.cardLines = Array.isArray(lines) ? lines : [lines]; g.cardC = c;
  g.cardT = g.cardMax = Math.max(4, Math.round(ms / (g.tickMs || 80)));
  g.cardHold = hold; g.cardNew = true; g.cardBg = null;
}
function drawCard(rgb, g) {
  const lines = g.cardLines, c = g.cardC, age = g.cardMax - g.cardT, two = lines.length > 1;
  const y0 = two ? 1 : 3, y1 = two ? 14 : 11, half = Math.min(8, (age + 1) * 3);
  for (let y = y0; y <= y1; y++) for (let x = 0; x < N; x++) if (Math.abs(x - 7.5) < half) set(rgb, x, y, BLACK);
  for (let x = 0; x < N; x++) if (Math.abs(x - 7.5) < half) { set(rgb, x, y0, c); set(rgb, x, y1, c); }
  if (age >= 2 && (g.cardT > 3 || g.cardT % 2)) lines.forEach((s, i) => drawText(rgb, s, two ? 3 + i * 6 : 5, c));
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
    for (let k = 0; k < 6; k++) set(rgb, rand(N), rand(N), GOLD);
    for (let x = 0; x < N; x++) { set(rgb, x, 0, (x + t) % 4 < 2 ? GREEN : BLACK); set(rgb, x, 15, (x - t + 64) % 4 < 2 ? GREEN : BLACK); }
    return;
  }
  // the screen crumbles: each column drops away at its own speed, colours stay flat
  rgb.fill(0);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const i = (y * N + x) * 3, drop = Math.floor(p * p * (3 + hash(x, 7) * 14));
    if (y + drop < N) set(rgb, x, y + drop, p < 0.2 && (snap[i] | snap[i + 1] | snap[i + 2]) ? RED : [snap[i], snap[i + 1], snap[i + 2]]);
  }
}
function post(g, rgb) {
  const P = g.parts || [];
  for (const p of P) { p.x += p.vx; p.y += p.vy; p.vy += p.grav; p.vx *= 0.94; p.life--; if (p.life > 0) set(rgb, p.x, p.y, p.c); }
  g.parts = P.filter(p => p.life > 0);
  // a flash is a solid frame round the edge, not a tint over the picture
  if (g.flashT > 0) { for (let k = 0; k < N; k++) { set(rgb, k, 0, g.flashC); set(rgb, k, 15, g.flashC); set(rgb, 0, k, g.flashC); set(rgb, 15, k, g.flashC); } g.flashT--; }
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
      card(g, ['LV', '1'], GREEN, 1000);
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
          burst(g, h[0], h[1], RED, 5, { speed: 0.5, life: 4 });
          food = free();
          if (!gold && Math.random() < 0.25) { const p = free(); gold = { x: p[0], y: p[1], life: Math.round(8000 / g.tickMs) }; }
          if (eaten >= 8) { level++; eaten = 0; addRocks(); if (level > 3) addRocks(); fx(g, 'level'); flash(g, GREEN); card(g, ['LV', String(level)], GREEN, 1000); }
          g.tickMs = Math.max(70, 170 - (level - 1) * 14 - eaten * 3);
        }
        if (gold && h[0] === gold.x && h[1] === gold.y) { g.score += 5 * level; grow += 2; fx(g, 'coin'); burst(g, gold.x, gold.y, [[255, 220, 60], [255, 255, 200]], 10, { speed: 0.7 }); gold = null; }
        if (gold && --gold.life <= 0) gold = null;
        if (grow > 0) grow--; else body.pop();
        // draw: black ground, grey rocks, red apple, gold apple, a green snake with a white head
        rgb.fill(0);
        for (const k of rocks) set(rgb, k % N, k / N | 0, GREY);
        set(rgb, food[0], food[1], RED);
        if (gold && (gold.life > 12 || t % 2)) set(rgb, gold.x, gold.y, GOLD);
        body.forEach(([x, y], i) => set(rgb, x, y, i ? GREEN : WHITE));
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
      card(g, ['GO!'], WHITE, 800);
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
            burst(g, bx, 14, YOU, 3, { speed: 0.4, life: 3 });
          } else if (by > 15.5) {
            fx(g, 'hurt'); lost++; g.lost = lost; shake(g, 4); flash(g, RED);
            burst(g, bx, 15, RED, 6, { speed: 0.8 });
            if (lost >= 5) { g.over = true; return; }
            serve(-1);
          }
        }
        if (by <= 1 && vy < 0) {
          if (bx >= cpu - 0.6 && bx <= cpu + cpuW - 0.4) {
            fx(g, 'bounce'); vy = Math.min(0.9, Math.abs(vy) * 1.03); vx += (bx - (cpu + cpuW / 2 - 0.5)) * 0.1; by = 1; last = 'cpu';
            burst(g, bx, 1, RED, 3, { speed: 0.4, life: 3 });
          } else if (by < -0.5) {
            fx(g, 'score'); g.score++; shake(g, 3); flash(g, YOU);
            burst(g, bx, 0, YOU, 6, { speed: 0.8 });
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
            fx(g, 'power'); burst(g, gem.x, gem.y, GOLD, 6);
            if (last === 'me') { meW = 6; big = 200; me = Math.min(me, N - meW); } else { cpuW = 6; cpuBig = 200; cpu = Math.min(cpu, N - cpuW); }
            gem = null;
          } else if (gem.life <= 0) gem = null;
        }
        if (big && !--big) meW = 4;
        if (cpuBig && !--cpuBig) cpuW = 4;
        // draw
        rgb.fill(0);
        for (let x = 0; x < N; x += 2) set(rgb, x, 8, DARK);
        if (gem && (gem.life > 30 || t % 2)) set(rgb, gem.x, gem.y, GOLD);
        const pad = (x0, w, y, c, on) => { if (on) for (let i = 0; i < w; i++) set(rgb, Math.round(x0) + i, y, c); };
        pad(me, meW, 15, YOU, !big || big > 30 || t % 4 < 2);
        pad(cpu, cpuW, 0, RED, !cpuBig || cpuBig > 30 || t % 4 < 2);
        if (!wait || t % 2) set(rgb, bx, by, WHITE);
        for (let i = 0; i < g.score; i++) set(rgb, 15, 13 - i * 2, YOU);
        for (let i = 0; i < lost; i++) set(rgb, 15, 2 + i * 2, RED);
      };
      return g;
    },
  },
  {
    name: 'Meteor dodge', emoji: '☄️', tickMs: 80,
    help: 'Hold left or right to dodge the falling rocks. Grab gold stars for points and the white orb for a shield. It gets faster every level.',
    create() {
      const g = { score: 0, over: false, tickMs: 80 };
      let x = 7.5, t = 0, rocks = [], items = [], shield = 0, stars = 0, stage = 1, safe = 0;
      const far = Array.from({ length: 10 }, () => ({ x: rand(N), y: Math.random() * N }));
      const near = Array.from({ length: 5 }, () => ({ x: rand(N), y: Math.random() * N }));
      card(g, ['LV', '1'], WHITE, 1000);
      g.tick = (inp, rgb) => {
        t++;
        if (inp.held.left) x = Math.max(1, x - 0.7);
        if (inp.held.right) x = Math.min(N - 2, x + 0.7);
        const s = Math.round(x), cells = [[s, 13], [s - 1, 14], [s, 14], [s + 1, 14]];
        const ns = 1 + Math.floor(t / 300);
        if (ns > stage) { stage = ns; fx(g, 'level'); card(g, ['LV', String(stage)], WHITE, 900, false); }
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
          r.gone = true; burst(g, r.x, r.y, RED, r.big ? 8 : 5, { speed: 0.7 });
          if (safe) continue;
          if (shield) { shield = 0; safe = 12; fx(g, 'boom'); shake(g, 3); flash(g, YOU); }
          else { fx(g, 'boom'); burst(g, x, 14, YOU, 8); g.over = true; return; }
        }
        for (const it of items) if (!it.gone && cells.some(([cx, cy]) => cx === Math.round(it.x) && Math.abs(cy - it.y) < 1)) {
          it.gone = true;
          if (it.kind === 'star') { stars++; fx(g, 'coin'); burst(g, it.x, it.y, GOLD, 4, { speed: 0.4, life: 4 }); }
          else { shield = 1; fx(g, 'power'); burst(g, it.x, it.y, WHITE, 5); }
        }
        if (safe) safe--;
        rocks = rocks.filter(r => !r.gone && r.y < N + 1);
        items = items.filter(i => !i.gone && i.y < N + 1);
        g.score = Math.floor(t / 12) + stars * 5;
        // draw: deep space with two layers of stars sliding past
        rgb.fill(0);
        for (const st of far) { st.y = (st.y + 0.06) % N; set(rgb, st.x, st.y, DARK); }
        for (const st of near) { st.y += 0.2; if (st.y >= N) { st.y = 0; st.x = rand(N); } set(rgb, st.x, st.y, DARK); }
        for (const r of rocks) {
          const rx = Math.round(r.x), ry = Math.round(r.y);
          set(rgb, rx, ry, RED);
          if (r.big) { set(rgb, rx + 1, ry, RED); set(rgb, rx, ry + 1, RED); set(rgb, rx + 1, ry + 1, RED); }
        }
        for (const it of items) set(rgb, it.x, it.y, it.kind === 'star' ? GOLD : WHITE);
        if (!safe || t % 2) {
          set(rgb, s, 13, WHITE); set(rgb, s - 1, 14, YOU); set(rgb, s, 14, YOU); set(rgb, s + 1, 14, YOU);
          if (shield) { set(rgb, s - 1, 13, YOU); set(rgb, s + 1, 13, YOU); set(rgb, s, 12, YOU); set(rgb, s - 2, 14, YOU); set(rgb, s + 2, 14, YOU); }
        }
      };
      return g;
    },
  },
  {
    name: 'Hop', emoji: '🐤', tickMs: 70,
    help: 'Tap A (or tap the screen) to flap. Fly through the gaps and grab the gold coins.',
    create() {
      const g = { score: 0, over: false, tickMs: 70 };
      const GAP = 5, FLOOR = 15;
      let y = 7, v = 0, t = 0, walls = [{ x: 17, gap: 5, coin: false }], flapT = 0, dist = 0;
            card(g, ['GO!'], WHITE, 700);
      const die = () => { shake(g, 4); fx(g, 'hurt'); burst(g, 4.5, y, YOU, 8, { speed: 0.7, grav: 0.05 }); g.over = true; };
      g.tick = (inp, rgb) => {
        t++;
        if (inp.pressed.has('a') || inp.pressed.has('up')) { v = -0.8; flapT = 4; fx(g, 'flap');  }
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
            w.got = true; g.score += 3; fx(g, 'coin'); burst(g, 5, w.gap + 2, GOLD, 4, { speed: 0.5, life: 4 });
          }
          if (w.x < 5 && w.x + 2 > 4 && (y < w.gap - 0.3 || y + 1 > w.gap + GAP + 0.3)) return die();
        }
        // flat navy sky, green pipes, brown ground, gold coins, and you in cyan
        fill(rgb, NAVY);
        for (const w of walls) {
          const x0 = Math.round(w.x);
          for (let yy = 0; yy < FLOOR; yy++) if (yy < w.gap || yy >= w.gap + GAP) { set(rgb, x0, yy, GREEN); set(rgb, x0 + 1, yy, GREEN); }
          if (w.coin && !w.got) set(rgb, Math.round(w.x + 1), w.gap + 2, GOLD);
        }
        for (let sx = 0; sx < N; sx++) set(rgb, sx, FLOOR, [138, 106, 58]);
        const by = Math.round(y);
        set(rgb, 4, by, YOU); set(rgb, 5, by, WHITE);
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
      card(g, ['LV', '1'], WHITE, 1000);

      function loseLife() {
        lives--; navigator.vibrate?.(120); fx(g, 'hurt'); shake(g, 4);
        burst(g, x - cam, y + 1, YOU, 8, { speed: 0.6, grav: 0.04 });
        if (!lives) { g.over = true; return; }
        // respawn on the next safe ground in view
        let rx = Math.max(cam + 1, Math.floor(x) - 2);
        while (generate(rx + 20), !(solid(rx, GROUND) && solid(rx + 1, GROUND) && cell(rx, GROUND - 1) === '.' && cell(rx + 1, GROUND - 1) === '.')) rx++;
        x = rx; y = GROUND - 2; vx = vy = 0; hurt = 25;
        cam = Math.max(cam, Math.floor(x) - 5);
      }
      function kill(e) { e.alive = false; stomps++; fx(g, 'stomp'); burst(g, e.x - cam, e.y, RED, 5, { speed: 0.5 }); }

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
        
        let ny = y + vy; onGround = false;
        if (vy > 0 && (solid(x + 0.05, ny + 2) || solid(x + W - 0.05, ny + 2))) { ny = Math.floor(ny + 2) - 2; vy = 0; onGround = true; }
        if (vy < 0 && (solid(x + 0.05, ny) || solid(x + W - 0.05, ny))) {
          // bump blocks from below
          const by = Math.floor(ny);
          for (const bx of new Set([Math.floor(x + 0.05), Math.floor(x + W - 0.05)])) {
            const c = cols[bx]; if (!c) continue;
            if (c[by] === 'B' && c[by - 1] === 'C') { c[by - 1] = '.'; coins++; fx(g, 'coin'); burst(g, bx - cam, by - 1, GOLD, 4, { speed: 0.4, up: 0.3 }); }
            else if (c[by] === 'Q') {
              c[by] = 'U';
              if (Math.random() < 0.3) { star = 150; fx(g, 'power'); burst(g, bx - cam, by - 1, GOLD, 8, { speed: 0.7 }); }
              else { coins += 3; fx(g, 'coin'); burst(g, bx - cam, by - 1, GOLD, 6, { speed: 0.5, up: 0.4, grav: 0.05 }); }
            } else if (c[by] === 'B') { c[by] = '.'; bricks++; fx(g, 'brick'); burst(g, bx - cam, by, [210, 120, 45], 5, { speed: 0.5, grav: 0.08, up: 0.3 }); }
          }
          ny = Math.floor(ny) + 1; vy = 0;
        }
        y = ny;
        
        if (y > N) { loseLife(); if (g.over) return; }
        for (const [cx, cy] of [[x + 0.1, y + 0.2], [x + W - 0.1, y + 0.2], [x + 0.1, y + 1.8], [x + W - 0.1, y + 1.8]]) {
          const k = cell(cx, cy);
          if (k === 'C') { cols[Math.floor(cx)][Math.floor(cy)] = '.'; coins++; fx(g, 'coin'); burst(g, Math.floor(cx) - cam, Math.floor(cy), GOLD, 3, { speed: 0.35, life: 3 }); }
          if (k === 'S' && !hurt && !star) { loseLife(); if (g.over) return; break; }
        }
        // flags: a new level
        if (flags.length && x > flags[0]) {
          flags.shift(); level++; fx(g, 'level'); flash(g, GREEN);
                    card(g, ['LV', String(level)], WHITE, 900);
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

        // --- draw: flat sky, green grass, brown dirt, orange blocks, gold coins, red danger ---
        fill(rgb, NAVY);
        for (let sx = 0; sx < N; sx++) {
          const wx = cam + sx, c = cols[wx]; if (!c) continue;
          for (let sy = 0; sy < N; sy++) {
            const k = c[sy];
            if (k === 'G') set(rgb, sx, sy, sy === 0 || c[sy - 1] !== 'G' ? GREEN : [122, 78, 38]);
            else if (k === 'B') set(rgb, sx, sy, [210, 120, 45]);
            else if (k === 'Q') set(rgb, sx, sy, GOLD);
            else if (k === 'U') set(rgb, sx, sy, GREY);
            else if (k === 'S') set(rgb, sx, sy, RED);
            else if (k === 'C') set(rgb, sx, sy, GOLD);
            else if (k === 'F') set(rgb, sx, sy, WHITE);
          }
          if (c[3] === 'F' && flags.includes(wx)) { set(rgb, sx + 1, 3, GREEN); set(rgb, sx + 1, 4, GREEN); set(rgb, sx + 2, 3, GREEN); }
        }
        for (const e of enemies) if (e.alive) {
          const ex = Math.round(e.x - cam), ey = Math.round(e.y);
          set(rgb, ex, ey, RED);
          if (e.fly && (t >> 2) % 2) { set(rgb, ex - 1, ey - 1, RED); set(rgb, ex + 1, ey - 1, RED); }
          else if (e.fly) { set(rgb, ex - 1, ey, RED); set(rgb, ex + 1, ey, RED); }
        }
        if (!hurt || t % 4 < 2) {
          const hx = Math.floor(x + W / 2 - cam), hy = Math.round(y), sc = star && t % 4 < 2 ? GOLD : null;
          set(rgb, hx, hy, sc || WHITE);
          set(rgb, hx, hy + 1, sc || YOU);
        }
        for (let i = 0; i < lives; i++) set(rgb, 15 - i, 0, WHITE);
      };
      return g;
    },
  },
  {
    name: 'Star Blaster', emoji: '🚀', tickMs: 70,
    help: 'Hold ◀ ▶ to fly, hold A to fire. Clear each wave of invaders. Every 5th wave is a boss. Gold stars give double shots, white orbs a shield. 3 lives.',
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
          return card(g, ['BOSS'], RED, 1200);
        }
        card(g, ['WAVE', String(wave)], WHITE, 1000);
        const kind = wave % 3, n = Math.min(10, 4 + wave);
        for (let i = 0; i < n; i++) foes.push({
          x: kind === 0 ? 2 + (i % 5) * 3 : rand(14) + 1,
          y: kind === 0 ? -1 - Math.floor(i / 5) * 3 : -1 - i * 2.5,
          kind, phase: Math.random() * 6, hp: wave > 4 && i % 4 === 0 ? 2 : 1,
        });
      }
      const ship = () => Math.round(sx);
      function hitMe() {
        if (shield) { shield = 0; hurt = 12; fx(g, 'hit'); burst(g, sx, 14, YOU, 6); return; }
        hurt = 20; lives--; fx(g, 'hurt'); shake(g, 4); flash(g, RED);
        burst(g, sx, 14, YOU, 8); navigator.vibrate?.(120);
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
                burst(g, f.x, f.y, RED, 5); g.score += 10; fx(g, 'boom');
                if (Math.random() < 0.1) drops.push({ x: Math.round(f.x), y: f.y, kind: Math.random() < 0.6 ? 'P' : 'S' });
              }
            }
          }
          if (boss && s.y > -5 && Math.abs(s.x - Math.round(boss.x)) <= 2 && s.y >= boss.y - 0.5 && s.y <= boss.y + 2.5) {
            s.y = -9; boss.hp--; boss.hit = 2; fx(g, 'hit'); burst(g, s.x, boss.y + 2, GOLD, 2, { speed: 0.4, life: 3 });
            if (boss.hp <= 0) {
              for (let k = 0; k < 3; k++) burst(g, boss.x - 2 + k * 2, boss.y + 1, RED, 6, { speed: 0.9 });
              shake(g, 6); flash(g, WHITE); fx(g, 'boom'); g.score += 100 + wave * 10;
              drops.push({ x: Math.round(boss.x), y: boss.y + 1, kind: 'P' }); boss = null;
            }
          }
        }
        const sh = ship();
        const hitShip = (x, y) => Math.abs(x - sh) <= 1 && y >= 13.5 && y < 16;
        for (const d of drops) if (Math.abs(d.x - sh) <= 1 && d.y >= 13) {
          d.y = 99; fx(g, 'power'); burst(g, d.x, 14, d.kind === 'P' ? GOLD : WHITE, 5);
          if (d.kind === 'P') power = 25; else shield = 1;
        }
        if (!hurt) {
          let hit = false;
          for (const b of bombs) if (hitShip(Math.round(b.x), b.y)) { b.y = 99; hit = true; }
          for (const f of foes) if (f.hp > 0 && (hitShip(Math.round(f.x), f.y) || f.y > 15.5)) { f.hp = 0; burst(g, f.x, f.y, RED, 4); hit = true; }
          if (hit) { hitMe(); if (g.over) return; }
        }
        if (hurt) hurt--;
        foes = foes.filter(f => f.hp > 0 && f.y < 17);
        shots = shots.filter(s => s.y > -1);
        bombs = bombs.filter(b => b.y < 16 && b.x > -1 && b.x < N);
        drops = drops.filter(d => d.y < 16);
        stars.forEach(s => { s.y += s.v; if (s.y >= N) { s.y = 0; s.x = rand(N); } });

        // draw: red invaders and bombs, gold shots and power-ups, you in cyan
        rgb.fill(0);
        for (const s of stars) set(rgb, s.x, s.y, DARK);
        for (const d of drops) set(rgb, d.x, d.y, d.kind === 'P' ? GOLD : WHITE);
        for (const f of foes) {
          const fx0 = Math.round(f.x), fy = Math.round(f.y);
          set(rgb, fx0, fy, RED);
          if (t % 6 < 3) { set(rgb, fx0 - 1, fy, RED); set(rgb, fx0 + 1, fy, RED); } else { set(rgb, fx0 - 1, fy - 1, RED); set(rgb, fx0 + 1, fy - 1, RED); }
          if (f.hp > 1) set(rgb, fx0, fy - 1, WHITE);
        }
        if (boss) {
          const bx = Math.round(boss.x), by = Math.round(boss.y), c = boss.hit ? WHITE : RED;
          for (let d = -1; d <= 1; d++) set(rgb, bx + d, by, c);
          for (let d = -2; d <= 2; d++) set(rgb, bx + d, by + 1, c);
          set(rgb, bx - 2, by + 2, c); set(rgb, bx + 2, by + 2, c);
          set(rgb, bx - 1, by + 1, WHITE); set(rgb, bx + 1, by + 1, WHITE);
          const bar = Math.ceil(boss.hp / boss.max * 12);
          for (let x = 0; x < bar; x++) set(rgb, x, 0, WHITE);
        }
        for (const s of shots) set(rgb, s.x, s.y, GOLD);
        for (const b of bombs) set(rgb, b.x, b.y, RED);
        if (!hurt || t % 4 < 2) {
          set(rgb, sh, 14, WHITE); set(rgb, sh - 1, 15, YOU); set(rgb, sh, 15, YOU); set(rgb, sh + 1, 15, YOU);
          if (shield) { set(rgb, sh - 1, 14, YOU); set(rgb, sh + 1, 14, YOU); set(rgb, sh, 13, YOU); }
        }
        for (let i = 0; i < lives; i++) set(rgb, 15 - i, 0, WHITE);
      };
      return g;
    },
  },
  {
    name: 'Maze Raider', emoji: '👾', tickMs: 70,
    usesX: true,
    help: '3D first person. First pick EASY, NORM or HARD with ◀▶ and press A. ▲▼ walk, ◀▶ turn, A attacks, X switches weapon, Y shows the map. Xbox: right stick looks around, left stick walks and sidesteps, A or RT attacks, RB / LB next / previous weapon, X quick axe swing, Y for the map. Weapons: the axe (close up, no ammo), the blaster, the shotgun (wide spread, from level 2) and the ray gun (shoots through every creature in a line, from level 3). From level 2 a red door blocks the way: find the key, then reach the green exit. The dot on the top row points to the key (gold) or the exit (green). Green orbs = health, gold orbs = ammo. Watch for bats, spitters, brutes, bombers that explode, ghosts that float through walls, and a boss every 4th level.',
    create() {
      const g = { score: 0, over: false, tickMs: 70 };
      const VIEW = 15, MID = VIEW / 2; // rows 0..14 are the 3D view, row 15 is the status bar
      // difficulty: picked on a start screen with ◀▶ and A, remembered for next time
      const MODES = [
        { name: 'EASY', c: GREEN, dmg: 0.6, spd: 0.85, mon: lv => 2 + lv * 1.5, orbs: 3, ammo: 30, bossEvery: 4, bonus: 0.5, early: false },
        { name: 'NORM', c: GOLD, dmg: 1.4, spd: 1.1, mon: lv => 4 + lv * 2, orbs: 2, ammo: 24, bossEvery: 4, bonus: 1, early: false },
        { name: 'HARD', c: RED, dmg: 1.7, spd: 1.3, mon: lv => 5 + lv * 3, orbs: 1, ammo: 16, bossEvery: 3, bonus: 2, early: true },
      ];
      let modeIdx = 1; try { modeIdx = clamp(+(localStorage.getItem('mazeMode') ?? 1) | 0, 0, 2); } catch {}
      let D = MODES[modeIdx], picking = 0;
      let map, size, px, py, ang, hp = 100, ammo = 24, level = 0, t = 0, muzzle = 0, cool = 0, recoil = 0;
      let hasKey = false, doorLevel = false, swing = 0, safe = 0, tracers = [], showMap = false, keyHint = 0, rightStick = false, exitAt = [1, 1];
      // weapons in switch order; you start with the axe and the blaster
      const WEP = ['axe', 'blaster', 'shotgun', 'ray'], owned = new Set(['axe', 'blaster']);
      const WNAME = { axe: 'AXE', blaster: 'PEW', shotgun: 'GUN', ray: 'RAY' };
      let wep = 'blaster';
      const HP = { grunt: 2, spitter: 2, brute: 5, bat: 1, bomber: 2, ghost: 3, boss: 24 };
      let things = [], shots = [], seen = new Set();
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
        px = 1.5; py = 1.5; ang = map[1][2] ? Math.PI / 2 : 0;
        things = []; shots = []; tracers = []; seen = new Set();
        const spots = cells.filter(([x, y]) => dist[y][x] > 4 && !(keyAt && x === keyAt[0] && y === keyAt[1])).sort(() => Math.random() - 0.5);
        const monsters = Math.round(D.mon(level));
        // more kinds of creature join as you go deeper
        const pool = ['grunt', 'grunt', 'bat'];
        if (D.early) pool.push('spitter'); // hard: creatures turn up a level sooner
        if (level >= (D.early ? 2 : 3) && level < 3) pool.push('brute');
        if (level >= 2) pool.push('spitter', 'bat');
        if (level >= 3) pool.push('brute', 'bomber');
        if (level >= 4) pool.push('ghost', 'bomber');
        const addM = (type, x, y) => things.push({ kind: 'm', type, x: x + 0.5, y: y + 0.5, hp: HP[type], cool: 0, hit: 0, step: 0, side: Math.random() < 0.5 ? 1 : -1, ph: Math.random() * 6 });
        spots.slice(0, monsters).forEach(([x, y], i) => addM(i < 2 ? 'grunt' : pool[rand(pool.length)], x, y));
        // every 4th level a boss guards the exit
        if (level % D.bossEvery === 0) addM('boss', far[0], far[1]);
        { const e = N4.find(([dx, dy]) => map[ey + dy][ex + dx] === 9) || [0, 0]; exitAt = [ex + e[0] + 0.5, ey + e[1] + 0.5]; }
        let s = monsters;
        const put = kind => { const p = spots[s++]; if (p) things.push({ kind, x: p[0] + 0.5, y: p[1] + 0.5 }); };
        for (let i = 0; i < D.orbs; i++) put('h'); put('a'); put('a');
        if (!owned.has('shotgun') && level >= 2) put('w');
        if (!owned.has('ray') && level >= 3) put('r');
        if (keyAt) things.push({ kind: 'k', x: keyAt[0] + 0.5, y: keyAt[1] + 0.5 });
        if (picking < 0) card(g, ['LV', String(level)], WHITE, 1100);
      }
      buildLevel();
      g.pick = i => { modeIdx = i; picking = -1; }; // for tests: skip the start screen
      g.peek = () => ({ map, size, px, py, ang, things, hasKey, doorLevel, level, hp, wep, owned, ammo }); // for tests

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
      // clean look: two wall tones (facing / side), flat floor and ceiling, three distance steps, flat sprites
      const FACE = [124, 132, 148], SIDE = [84, 90, 104], FLOOR_C = [74, 63, 51], CEIL = [42, 44, 54];
      const step = (c, d) => dim(c, d < 2.5 ? 1 : d < 5 ? 0.7 : 0.45);
      function wallColor(type, u, v, side) {
        if (type === 9) return GREEN;
        if (type === 5) return Math.abs(u - 0.5) < 0.12 && Math.abs(v - 0.5) < 0.12 ? GOLD : RED;
        return side ? SIDE : FACE;
      }
      const SPR = {
        grunt: { size: 0.8, w: 0.7, lift: 0 }, brute: { size: 0.95, w: 0.85, lift: 0 }, spitter: { size: 0.75, w: 0.75, lift: 0 },
        bat: { size: 0.3, w: 1.6, lift: 0.45 }, bomber: { size: 0.55, w: 0.85, lift: 0 }, ghost: { size: 0.8, w: 0.7, lift: 0.12 }, boss: { size: 1.15, w: 1, lift: 0 },
        h: { size: 0.18, w: 1, lift: 0.04 }, a: { size: 0.15, w: 1, lift: 0.04 }, k: { size: 0.28, w: 1.2, lift: 0.25 }, w: { size: 0.22, w: 2.2, lift: 0.25 }, r: { size: 0.22, w: 2.2, lift: 0.25 },
        p: { size: 0.18, w: 1, lift: 0.4 },
      };
      const MCOL = { grunt: RED, brute: [150, 70, 220], spitter: GREEN, bat: [255, 140, 50], bomber: P2, ghost: [170, 185, 255], boss: RED };
      function paint(o, u, v) {
        switch (o.kind) {
          case 'm': {
            const base = MCOL[o.type];
            if (o.dying) return u < 0.1 || u > 0.9 ? null : RED;
            if (o.type === 'bat') { // a body with flapping wings
              const body = Math.abs(u - 0.5) < 0.14, up = (t + (o.ph * 3 | 0)) % 6 < 3;
              if (!body && (up ? v > 0.55 : v < 0.45)) return null;
              if (o.hit) return WHITE;
              return body && v > 0.3 && v < 0.55 && Math.abs(u - 0.5) > 0.04 ? GOLD : base;
            }
            if (o.type === 'ghost') { // a sheet with a wavy hem and dark eyes
              if (u < 0.1 || u > 0.9 || (v < 0.15 && (u < 0.25 || u > 0.75))) return null;
              if (v > 0.85 && ((u * 6 | 0) + (t >> 2)) % 2) return null;
              if (o.hit) return WHITE;
              return v > 0.25 && v < 0.42 && (Math.abs(u - 0.33) < 0.1 || Math.abs(u - 0.67) < 0.1) ? DARK : base;
            }
            if (o.type === 'bomber') { // a round bomb on legs with a fuse that sparks
              if (v < 0.18) return Math.abs(u - 0.5) < 0.1 ? (o.fuse && t % 2 ? WHITE : GOLD) : null;
              if ((u - 0.5) ** 2 + (v - 0.55) ** 2 > 0.2) return null;
              return o.hit || (o.fuse && t % 4 < 2) ? WHITE : base;
            }
            if (v > 0.82) { // two legs that take turns
              const L = u > 0.18 && u < 0.4, Rt = u > 0.6 && u < 0.82;
              if (!L && !Rt) return null;
              if ((o.step | 0) % 2 ? L && v > 0.92 : Rt && v > 0.92) return null;
              return o.hit ? WHITE : base;
            }
            if (u < 0.1 || u > 0.9) return null;
            if (v < 0.14 && (u < 0.26 || u > 0.74)) return (o.type === 'brute' || o.type === 'boss') && (u < 0.2 || u > 0.8) ? WHITE : null;
            if (o.hit) return WHITE;
            if (v > 0.22 && v < 0.38 && (Math.abs(u - 0.32) < 0.1 || Math.abs(u - 0.68) < 0.1)) return o.charge ? WHITE : GOLD;
            return base;
          }
          case 'h': return (u - 0.5) ** 2 + (v - 0.5) ** 2 > 0.25 ? null : GREEN;  // small round orbs
          case 'a': return (u - 0.5) ** 2 + (v - 0.5) ** 2 > 0.25 ? null : GOLD;
          case 'k': {
            if (u < 0.38) return u > 0.12 && u < 0.26 && v > 0.3 && v < 0.7 ? null : GOLD;
            if (v > 0.38 && v < 0.62) return GOLD;
            return v >= 0.62 && u > 0.6 && (u * 10 | 0) % 2 ? GOLD : null;
          }
          case 'w': if (v > 0.3 && v < 0.6) return u < 0.35 ? GREY : WHITE; return v >= 0.6 && u > 0.2 && u < 0.38 ? GREY : null;
          case 'r': if (v > 0.3 && v < 0.6) return u < 0.35 ? GREY : YOU; return v >= 0.6 && u > 0.2 && u < 0.38 ? GREY : null;
          case 'p': return (u - 0.5) ** 2 + (v - 0.5) ** 2 > 0.25 ? null : RED;
        }
        return null;
      }
      // push a creature straight away from you (it still can't go through walls)
      function shove(m, dist) {
        const d = Math.hypot(m.x - px, m.y - py) || 1, ux = (m.x - px) / d, uy = (m.y - py) / d;
        for (let i = 0; i < 4; i++) move(ux * dist / 4, uy * dist / 4, m);
      }
      // after a hit you get a short moment where nothing can hurt you, and the creature that hit you bounces back,
      // so you have a chance to swing back or get away instead of being chewed up while it sits on top of you
      function hurt(dmg, from) {
        if (safe) return;
        safe = 6;
        if (from) shove(from, from.type === 'brute' || from.type === 'boss' ? 0.3 : 0.5);
        hp -= Math.round(dmg * D.dmg); flash(g, RED, 2); shake(g, 2); navigator.vibrate?.(60); fx(g, 'hurt'); }
      function damage(m, n) {
        m.hp -= n; m.hit = 1; m.alert = true; fx(g, 'hit');
        if (m.hp <= 0) {
          m.dying = 8; m.burst = true; fx(g, 'boom'); g.score += { grunt: 10, spitter: 15, brute: 25, bat: 5, bomber: 15, ghost: 20, boss: 150 }[m.type];
          if (m.type === 'boss') { shake(g, 5); flash(g, WHITE); things.push({ kind: 'h', x: m.x, y: m.y }); }
          if (Math.random() < 0.25) things.push({ kind: 'a', x: m.x, y: m.y });
        }
      }

      g.tick = (inp, rgb) => {
        t++;
        if (picking >= 0 || picking === -1 && !D.started) {
          // start screen: choose how hard it is
          if (picking >= 0) {
            picking++;
            if (inp.pressed.has('left') || inp.pressed.has('up')) { modeIdx = (modeIdx + 2) % 3; fx(g, 'click'); }
            if (inp.pressed.has('right') || inp.pressed.has('down')) { modeIdx = (modeIdx + 1) % 3; fx(g, 'click'); }
            if (picking > 4 && inp.pressed.has('a')) picking = -1;
          }
          if (picking === -1) {
            D = { ...MODES[modeIdx], started: true }; ammo = D.ammo; level = 0; fx(g, 'power');
            try { localStorage.setItem('mazeMode', modeIdx); } catch {}
            buildLevel(); return g.tick({ held: {}, pressed: new Set() }, rgb);
          }
          fill(rgb, BLACK);
          const m = MODES[modeIdx];
          drawText(rgb, m.name, 5, m.c);
          if (t % 10 < 6) for (const [x, y] of [[2, 12], [3, 11], [3, 13], [12, 12], [11, 11], [11, 13]]) set(rgb, x, y, WHITE); // ◀ ▶
          MODES.forEach((o, i) => { const x = 5 + i * 2; set(rgb, x, 12, i === modeIdx ? o.c : DARK); });
          for (let i = 0; i <= modeIdx; i++) { set(rgb, 6 + i * 2 - 1, 1, MODES[modeIdx].c); } // skulls of danger: 1 to 3 dots
          return;
        }
        const h = inp.held, me = { x: px, y: py };
        if (safe) safe--;
        if (inp.pressed.has('y')) { showMap = !showMap; fx(g, 'click'); }
        // right stick looks around (further = faster). Once it's in use, the left stick sidesteps instead of turning.
        const ax = inp.axes || {};
        if (ax.rx) { ang += ax.rx * 0.16; rightStick = true; }
        const stickSide = rightStick && Math.abs(ax.lx || 0) > 0.3;
        if (!stickSide) { if (h.left) ang -= 0.12; if (h.right) ang += 0.12; }
        let dx = Math.cos(ang), dy = Math.sin(ang);
        const sp = 0.12;
        if (stickSide) move(-dy * sp * 0.8 * ax.lx, dx * sp * 0.8 * ax.lx, me);
        if (h.up) move(dx * sp, dy * sp, me);
        if (h.down) move(-dx * sp * 0.9, -dy * sp * 0.9, me); // backing off is nearly as fast as walking
        px = me.x; py = me.y;
        const touching = v => [[dx * 0.45, dy * 0.45], [0.4, 0], [-0.4, 0], [0, 0.4], [0, -0.4]].map(([ox, oy]) => [px + ox, py + oy]).find(([x, y]) => wall(x, y) === v);

        // the locked door
        if (keyHint) keyHint--;
        const door = touching(5);
        if (door) {
          if (hasKey) { map[Math.floor(door[1])][Math.floor(door[0])] = 0; hasKey = false; fx(g, 'power'); flash(g, GOLD); g.score += 10; }
          else if (!keyHint) { keyHint = 40; fx(g, 'click'); card(g, ['KEY'], GOLD, 900, false); }
        }
        // reached the exit: bonus, then the next level
        if (touching(9)) {
          g.score += Math.round((50 + level * 10 + Math.floor(hp / 2)) * D.bonus); fx(g, 'level'); flash(g, GREEN);
          buildLevel(); dx = Math.cos(ang); dy = Math.sin(ang);
        }

        // --- floor and ceiling, cast per pixel so the tiles and torchlight sit on the ground ---
        const plane = 0.66, zbuf = new Array(N), faces = new Array(N), rays = [];
        for (let col = 0; col < N; col++) { const cam = 2 * (col + 0.5) / N - 1; rays.push([dx - dy * plane * cam, dy + dx * plane * cam]); }
        for (let y = 0; y < VIEW; y++) {
          const off = y + 0.5 - MID;
          if (Math.abs(off) < 0.6) { for (let x = 0; x < N; x++) set(rgb, x, y, BLACK); continue; }
          const rd = MID / Math.abs(off), floor = off > 0;
          for (let col = 0; col < N; col++) {
            const wx = px + rd * rays[col][0], wy = py + rd * rays[col][1];
            set(rgb, col, y, floor ? step(FLOOR_C, rd) : CEIL);
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
          // which flat wall face this ray hit: neighbouring columns on the same face share it
          faces[col] = side ? 'y' + (my + (sty < 0 ? 1 : 0)) : 'x' + (mx + (stx < 0 ? 1 : 0));
          const hx = px + rx * dist, hy = py + ry * dist;
          const u = (side ? hx : hy) % 1;
          const hgt = VIEW / dist, top = (VIEW - hgt) / 2, bot = top + hgt;
          for (let y = Math.max(0, Math.floor(top)); y < Math.min(VIEW, Math.ceil(bot)); y++) {
            const v = (y + 0.5 - top) / hgt, base = wallColor(hit, u, v, side);
            if (Math.min(y + 1, bot) - Math.max(y, top) >= 0.5) set(rgb, col, y, hit === 9 || hit === 5 ? base : step(base, dist));
          }
        }

        // --- dark edges where one wall face ends and another begins, so corners and gaps stand out ---
        for (let col = 0; col < N; col++) {
          const edge = [col - 1, col + 1].some(n => n >= 0 && n < N && faces[n] !== faces[col] && zbuf[col] >= zbuf[n] - 0.05);
          if (!edge) continue;
          const hgt = VIEW / zbuf[col], top = (VIEW - hgt) / 2;
          for (let y = Math.max(0, Math.round(top)); y < Math.min(VIEW, Math.round(top + hgt)); y++) set(rgb, col, y, BLACK);
        }

        // --- monsters ---
        for (const m of things) {
          if (m.kind !== 'm' || m.dead) continue;
          if (m.dying) { if (!--m.dying) m.dead = true; continue; }
          if (m.hit) m.hit--;
          if (m.cool) m.cool--;
          const d = Math.hypot(px - m.x, py - m.y), ghost = m.type === 'ghost';
          const see = ghost ? d < 8 : d < 9 && sight(m.x, m.y, px, py);
          if (see && d < 7) m.alert = true;
          const spd = { grunt: 0.05, brute: 0.035, spitter: 0.04, bat: 0.08, bomber: 0.06, ghost: 0.03, boss: 0.03 }[m.type] * D.spd;
          if (see && m.alert) {
            const ux = (px - m.x) / d, uy = (py - m.y) / d;
            if (ghost) { // drifts straight through walls
              if (d > 0.6) { m.x = clamp(m.x + ux * spd, 1, size - 1); m.y = clamp(m.y + uy * spd, 1, size - 1); }
              else if (!m.cool) { hurt(10, m); m.cool = 16; }
              continue;
            }
            if (m.type === 'bomber') { // runs at you, lights its fuse and blows up
              if (m.fuse) { if (!--m.fuse) { m.hp = 0; m.dying = 8; m.burst = true; fx(g, 'boom'); shake(g, 4); if (d < 1.8) hurt(20); } continue; }
              if (d < 1.2) { m.fuse = 12; fx(g, 'click'); continue; }
            }
            if (m.type === 'boss' && !m.cool && d > 1.5) {
              m.cool = 45;
              for (const a of [-0.25, 0, 0.25]) { const c = Math.cos(a), s2 = Math.sin(a); shots.push({ kind: 'p', x: m.x, y: m.y, vx: (ux * c - uy * s2) * 0.15 * D.spd, vy: (ux * s2 + uy * c) * 0.15 * D.spd, life: 120 }); }
              fx(g, 'shoot');
            }
            if (m.type === 'bat') { const w = Math.sin(t / 4 + m.ph) * 0.6; move((ux - uy * w) * spd, (uy + ux * w) * spd, m); m.step += 0.2; if (d < 0.6 && !m.cool) { hurt(5, m); m.cool = 10; } continue; }
            if (m.type === 'spitter') {
              if (d < 3) move(-ux * spd, -uy * spd, m);
              else if (d > 5.5) move(ux * spd, uy * spd, m);
              else { if (Math.random() < 0.01) m.side = -m.side; move(-uy * spd * m.side, ux * spd * m.side, m); }
              m.step += 0.12;
              if (!m.cool) {
                m.charge = (m.charge || 0) + 1;
                if (m.charge >= 10) { m.charge = 0; m.cool = 50 + rand(30); shots.push({ kind: 'p', x: m.x, y: m.y, vx: ux * 0.14 * D.spd, vy: uy * 0.14 * D.spd, life: 120 }); fx(g, 'shoot'); }
              }
            } else if (d > (m.type === 'boss' ? 1 : 0.7)) { move(ux * spd, uy * spd, m); m.step += 0.15; }
            else if (!m.cool) { hurt({ brute: 15, boss: 20 }[m.type] || 8, m); m.cool = m.type === 'grunt' ? 12 : 18; }
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
          else if (it.kind === 'k') { hasKey = true; fx(g, 'power'); g.score += 10; card(g, ['KEY'], GOLD, 700, false); }
          else if (it.kind === 'w' || it.kind === 'r') { wep = it.kind === 'w' ? 'shotgun' : 'ray'; owned.add(wep); ammo += 8; fx(g, 'power'); card(g, [WNAME[wep]], GOLD, 800, false); }
        }

        // --- weapons ---
        if (cool) cool--;
        if (recoil) recoil--;
        if (swing) swing--;
        // X or RB: next weapon you own, LB: previous one
        const dir = inp.pressed.has('sl') ? -1 : (inp.pressed.has('x') || inp.pressed.has('sr')) ? 1 : 0;
        if (dir) {
          let i = WEP.indexOf(wep);
          do i = (i + dir + WEP.length) % WEP.length; while (!owned.has(WEP[i]));
          wep = WEP[i]; cool = Math.max(cool, 3); fx(g, 'click');
        }
        // Xbox X: a quick axe swing whatever you're holding, then straight back to your gun
        const quick = inp.pressed.has('melee');
        if ((quick || ((inp.pressed.has('a') || h.a) && !h.melee)) && !cool) {
          const w = quick ? 'axe' : wep;
          const live = things.filter(m => m.kind === 'm' && m.hp > 0).map(m => {
            const rx = m.x - px, ry = m.y - py;
            return { m, depth: rx * dx + ry * dy, lateral: -rx * dy + ry * dx };
          }).filter(s => s.depth > (w === 'axe' ? -0.3 : -0.2) && sight(px, py, s.m.x, s.m.y));
          // anything right on top of you gets hit by every weapon, even if it's a little to the side
          const close = s => Math.hypot(s.depth, s.lateral) < 0.8;
          // the firing look everyone liked on the shotgun: a fan of three trails, a white muzzle flash and a small kick
          const fan = (spread, c, far) => { for (const o of [-spread, 0, spread]) { const d0 = Math.min(ahead, far), c2 = Math.cos(ang + o), s2 = Math.sin(ang + o); tracers.push({ x: px + c2 * d0, y: py + s2 * d0, c, life: 2 }); } };
          const ahead = Math.max(zbuf[7], zbuf[8]);
          if (w === 'axe') { // a wide swing that hits everything right in front of you
            cool = 6; swing = 4; fx(g, 'jump');
            let hit = false;
            // hits anything in a wide arc in front of you, and anything that's right on top of you
            for (const s of live) {
              const d = Math.hypot(s.depth, s.lateral), a = Math.abs(Math.atan2(s.lateral, s.depth));
              if (d < 0.8 || (d < 1.8 && a < 1)) {
                damage(s.m, 3); hit = true;
                if (s.m.hp > 0) { shove(s.m, s.m.type === 'brute' || s.m.type === 'boss' ? 0.3 : 0.6); s.m.cool = Math.max(s.m.cool, 8); }
              }
            }
            if (hit) shake(g, 1);
          } else if (ammo <= 0) { // out of ammo: back to the axe
            wep = 'axe'; fx(g, 'click'); cool = 4;
          } else if (w === 'shotgun') { // a wide spread that can hit several monsters
            ammo--; muzzle = 2; recoil = 2; cool = 9; shake(g, 1); fx(g, 'shoot');
            const hits = live.filter(s => close(s) || (s.depth > 0 && s.depth < 7 && Math.abs(s.lateral) < 0.3 + s.depth * 0.2));
            for (const s of hits) damage(s.m, s.depth < 3 ? 3 : 2);
            fan(0.25, GOLD, 4);
          } else if (w === 'ray') { // a beam that goes through every monster in a line
            ammo = Math.max(0, ammo - 2); muzzle = 3; recoil = 2; cool = 11; shake(g, 1); fx(g, 'power');
            for (const s of live) if (close(s) || (Math.abs(s.lateral) < 0.35 && s.depth < ahead + 0.3)) damage(s.m, 3);
            tracers.push({ x: px + dx * ahead, y: py + dy * ahead, c: YOU, life: 3, beam: true });
            fan(0.18, YOU, 3);
          } else {
            ammo--; muzzle = 2; recoil = 2; cool = 4; shake(g, 1); fx(g, 'shoot');
            const best = live.filter(s => close(s) || (s.depth > 0 && Math.abs(s.lateral) < 0.35 && s.depth < ahead + 0.3)).sort((a, b) => Math.hypot(a.depth, a.lateral) - Math.hypot(b.depth, b.lateral))[0];
            if (best) damage(best.m, 1);
            fan(0.12, GOLD, best ? Math.max(0.5, best.depth) : 3);
          }
        }

        // --- sprites, far to near ---
        const list = [...things.filter(o => (o.kind === 'm' ? !o.dead : !o.taken)), ...shots].map(o => {
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
          if (o.burst) { o.burst = false; if (sxc > -2 && sxc < N + 2) burst(g, sxc, floorY - hS / 2, MCOL[o.type], 8, { speed: 0.7, grav: 0.06 }); }
          for (let x = Math.floor(left); x < Math.ceil(left + wS); x++) {
            if (x < 0 || x >= N || zbuf[x] < s.ty) continue;
            for (let y = Math.floor(top); y < Math.ceil(floorY); y++) {
              if (y < 0 || y >= VIEW) continue;
              const c = paint(o, (x + 0.5 - left) / wS, (y + 0.5 - top) / hS);
              if (!c) continue;
              const cover = Math.min(1, Math.min(x + 1, left + wS) - Math.max(x, left)) * Math.min(1, Math.min(y + 1, floorY) - Math.max(y, top));
              if (cover >= 0.35) set(rgb, x, y, c);
            }
          }
        }

        // --- gun, map, HUD ---
        // shot trails: one thin line from the gun to where the shot lands, gone after a moment
        for (const tr of tracers) {
          const rx = tr.x - px, ry = tr.y - py, ty = Math.max(0.3, dx * rx + dy * ry);
          const ex = (N / 2) * (1 + (-dy * rx + dx * ry) / (ty * plane)) - 0.5, ey = MID + Math.min(2, 1.5 / ty) - 0.5;
          const sx0 = 7.5, sy0 = 11.5, n = Math.ceil(Math.max(Math.abs(ex - sx0), Math.abs(ey - sy0)));
          // a bolt flies out: the near half on the first frame, the far half on the next. The ray beam stays whole.
          const first = tr.life >= (tr.beam ? 3 : 2), from = tr.beam || first ? 0 : Math.floor(n / 2), to = tr.beam || !first ? n : Math.floor(n / 2);
          for (let i = from; i <= to; i++) { const k = n ? i / n : 0; set(rgb, Math.round(sx0 + (ex - sx0) * k), Math.round(sy0 + (ey - sy0) * k), tr.c); }
          if (tr.beam) for (let i = from; i <= to; i++) { const k = n ? i / n : 0; set(rgb, Math.round(sx0 + 1 + (ex - sx0 - 1) * k), Math.round(sy0 + (ey - sy0) * k), tr.c); }
          if (tr.spark && !first) set(rgb, Math.round(ex), Math.round(ey), WHITE);
          tr.life--;
        }
        tracers = tracers.filter(tr => tr.life > 0);
        const bob = (h.up || h.down) && t % 6 < 3 ? 1 : 0, kick = recoil ? 1 : 0;
        if (wep === 'axe' || swing) { // the axe rests at the right and sweeps across when you swing
          const [ax0, ay0] = [[11, 9], [4, 10], [7, 8], [9, 6], [11, 6]][swing], y0 = ay0 + (swing ? 0 : bob);
          for (const [ox, oy] of [[0, -1], [0, 0], [1, 1], [1, 2], [2, 3], [2, 4]]) set(rgb, ax0 + ox, y0 + oy, DARK);   // handle
          for (const [ox, oy] of [[-1, -1], [-2, -1], [-1, 0], [-2, 0], [-3, 0], [-1, 1], [-2, 1]]) set(rgb, ax0 + ox, y0 + oy, WHITE); // blade
          if (swing === 2) for (let x = 3; x <= 12; x++) set(rgb, x, x < 6 || x > 9 ? 8 : 7, WHITE);   // the sweep
        } else if (wep === 'shotgun') {
          set(rgb, 7, 12 + bob + kick, WHITE); set(rgb, 8, 12 + bob + kick, WHITE);
          for (let x = 6; x <= 9; x++) { set(rgb, x, 13 + kick, GREY); set(rgb, x, 14, GREY); }
          if (muzzle) { muzzle--; set(rgb, 7, 11, WHITE); set(rgb, 8, 11, WHITE); }
        } else if (wep === 'ray') {
          set(rgb, 7, 12 + bob + kick, YOU); set(rgb, 8, 12 + bob + kick, YOU);
          set(rgb, 7, 13 + bob, WHITE); set(rgb, 8, 13 + bob, WHITE);
          for (let x = 6; x <= 9; x++) set(rgb, x, 14, GREY);
          if (muzzle) { muzzle--; set(rgb, 7, 11, WHITE); set(rgb, 8, 11, WHITE); }
        } else {
          set(rgb, 7, 13 + bob + kick, WHITE); set(rgb, 8, 13 + bob + kick, WHITE);
          set(rgb, 7, 14, GREY); set(rgb, 8, 14, GREY);
          if (muzzle) { muzzle--; set(rgb, 7, 12, WHITE); set(rgb, 8, 12, WHITE); }
        }
        if (showMap) {
          // the map shows only places you have seen
          const cx0 = Math.floor(px) - 7, cy0 = Math.floor(py) - 7;
          for (let y = 0; y < VIEW; y++) for (let x = 0; x < N; x++) {
            const wx = cx0 + x, wy = cy0 + y;
            let c = BLACK;
            if (wx >= 0 && wy >= 0 && wx < size && wy < size && seen.has(wy * size + wx)) { const v = map[wy][wx]; c = !v ? DARK : v === 9 ? GREEN : v === 5 ? RED : GREY; }
            set(rgb, x, y, c);
          }
          for (const o of things) {
            if (o.taken || o.dead || !seen.has(Math.floor(o.y) * size + Math.floor(o.x))) continue;
            const c = o.kind === 'm' ? (o.hp > 0 ? RED : null) : o.kind === 'h' ? GREEN : GOLD;
            if (c) set(rgb, Math.floor(o.x) - cx0, Math.floor(o.y) - cy0, c);
          }
          set(rgb, 7, 7, YOU); set(rgb, 7 + Math.round(dx), 7 + Math.round(dy), WHITE);
        }
        for (let x = 0; x < N; x++) set(rgb, x, 15, BLACK);
        const hpBar = Math.ceil(hp / 100 * 6);
        if (hp > 35 || t % 6 < 3) for (let x = 0; x < hpBar; x++) set(rgb, x, 15, hp > 35 ? GREEN : RED);
        if (doorLevel) { const kc = hasKey ? GOLD : DARK; set(rgb, 7, 15, kc); set(rgb, 8, 15, kc); }
        // compass: a dot on the top row points the way to the key (gold) or the exit (green); at the edge it means turn that way
        if (!showMap) {
          const key = doorLevel && !hasKey && things.find(o => o.kind === 'k' && !o.taken);
          const [tx, ty] = key ? [key.x, key.y] : exitAt;
          let da = Math.atan2(ty - py, tx - px) - ang; da = Math.atan2(Math.sin(da), Math.cos(da));
          const cx = Math.round(clamp(7.5 + da / 0.58 * 8, 0, 15)), edge = Math.abs(da) > 0.58;
          if (!edge || t % 6 < 4) set(rgb, cx, 0, key ? GOLD : GREEN);
        }
        const ammoBar = Math.min(6, Math.ceil(ammo / 4));
        for (let x = 0; x < ammoBar; x++) set(rgb, 15 - x, 15, GOLD);
        if (!ammo && t % 6 < 3) set(rgb, 15, 15, RED);
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
      card(g, ['LV', '1'], WHITE, 1000);
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
        if (kind === 'water') burst(g, x, y, WHITE, 6, { speed: 0.5, up: 0.3, grav: 0.05 });
        else burst(g, x, y, YOU, 6, { speed: 0.7 });
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
              burst(g, HOMES[slot] + 0.5, 1, YOU, 4, { speed: 0.5 });
              if (fly && fly.slot === slot) { g.score += 100; fx(g, 'power'); burst(g, HOMES[slot] + 0.5, 1, GOLD, 6); fly = null; }
              if (homes.every(Boolean)) { level++; g.score += 100; homes = [false, false, false, false]; buildLanes(); fx(g, 'level'); flash(g, GREEN); card(g, ['LV', String(level)], WHITE, 1000); }
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

        // ---- draw: blue water, brown logs, green turtles, red cars, you in cyan ----
        const WATER = [30, 76, 154], LOG = [138, 90, 42];
        for (let row = 0; row < N; row++) for (let col = 0; col < N; col++) {
          let c = BLACK;
          if (row === 0) c = HOMES.some(h => col === h || col === h + 1) ? BLACK : GREEN;
          else if (row <= 6) c = WATER;
          else if (row === 7 || row === 14) c = DARK;
          set(rgb, col, row, c);
        }
        homes.forEach((f, i) => { if (f) { set(rgb, HOMES[i], 0, YOU); set(rgb, HOMES[i] + 1, 0, YOU); } });
        if (fly && (fly.life > 30 || t % 4 < 2)) set(rgb, HOMES[fly.slot] + (t % 8 < 4 ? 0 : 1), 0, GOLD);
        for (const l of lanes) for (const o of l.objs) for (let col = 0; col < N; col++) {
          if (!covers(o, col)) continue;
          if (l.kind === 'log') set(rgb, col, l.y, LOG);
          else if (l.kind === 'turtle') { const ph = turtlePhase(o); if (!diving(o) && !(ph >= 62 && ph < 74 && t % 4 < 2)) set(rgb, col, l.y, GREEN); }
          else set(rgb, col, l.y, RED);
        }
        if (dead) { if (t % 4 < 2) set(rgb, Math.round(x), y, RED); }
        else set(rgb, Math.round(x), y, YOU);
        const bar = Math.ceil(Math.max(0, timer) / TIME * 12);
        for (let col = 0; col < 12; col++) set(rgb, col, 15, col < bar ? (bar > 3 ? GREEN : RED) : BLACK);
        for (let i = 0; i < lives; i++) set(rgb, 15 - i, 15, WHITE);
      };
      return g;
    },
  },
  {
    name: 'Brick breaker', emoji: '🧱', tickMs: 70,
    help: 'Hold left or right to move the paddle, A launches the ball. Silver bricks take two hits. Catch the gold capsules for a wide paddle, extra balls or a slower ball. Every level has a new layout.',
    create() {
      const g = { score: 0, over: false, tickMs: 70 };
      let px = 6, pw = 4, wide = 0, slow = 0, lives = 3, level = 1, balls = [], bricks = [], caps = [], serveT = 0, t = 0;
      const COLORS = [RED, [255, 140, 50], GOLD, GREEN, [60, 140, 255]];
      const LAYOUTS = [
        () => true,
        (c, r) => Math.abs(c - 3.5) <= r + 0.5,
        (c, r) => (c + r) % 2 === 0,
        (c, r) => Math.abs(c - 3.5) + Math.abs(r - 2) <= 3.5,
        (c, r) => r !== 2 && c !== 3 && c !== 4,
      ];
      function build() {
        bricks = [];
        const lay = LAYOUTS[(level - 1) % LAYOUTS.length];
        for (let r = 0; r < 5; r++) for (let c = 0; c < 8; c++) if (lay(c, r)) bricks.push({ x: c * 2, y: 1 + r, hp: level >= 2 && (r === 0 || (level >= 4 && r === 2)) ? 2 : 1, c: COLORS[(r + level - 1) % 5] });
      }
      const serve = () => { balls = [{ x: px + pw / 2 - 0.5, y: 14, vx: 0, vy: 0, stuck: true, trail: [] }]; serveT = 30; };
      build(); serve();
      card(g, ['LV', '1'], WHITE, 1000);
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
              burst(g, hit.x + 0.5, hit.y, hit.c, 4, { speed: 0.5, grav: 0.05 });
              if (Math.random() < 0.14) { const k = 'WMS'[rand(3)]; caps.push({ x: hit.x + rand(2), y: hit.y, kind: k }); }
            } else fx(g, 'hit');
          }
          if (ny >= 14 && b.vy > 0 && nx >= px - 0.6 && nx <= px + pw - 0.4) {
            b.vy = -Math.abs(b.vy); b.vx = clamp((nx - (px + pw / 2 - 0.5)) * 0.2 || 0.12, -0.7, 0.7); ny = 14; fx(g, 'bounce');
                      }
          b.x = nx; b.y = ny;
          if (ny > 15.5) b.dead = true;
        }
        balls = balls.filter(b => !b.dead);
        if (!balls.length) {
          lives--; fx(g, 'hurt'); shake(g, 4); flash(g, RED);
          if (!lives) { g.over = true; return; }
          wide = 0; pw = 4; slow = 0; px = Math.min(px, N - pw); caps = []; serve();
        }
        for (const c of caps) {
          c.y += 0.2;
          if (Math.round(c.y) >= 15 && c.x >= px && c.x < px + pw) {
            c.y = 99; fx(g, 'power'); burst(g, c.x, 15, GOLD, 5, { speed: 0.5 });
            if (c.kind === 'W') { pw = 6; wide = 300; px = Math.min(px, N - pw); }
            else if (c.kind === 'S') slow = 250;
            else { const src = balls.find(b => !b.stuck) || balls[0]; for (const s of [-1, 1]) balls.push({ x: src.x, y: src.y, vx: clamp(src.vx + s * 0.25, -0.7, 0.7) || s * 0.2, vy: -Math.abs(src.vy || 0.45), stuck: false, trail: [] }); }
          }
        }
        caps = caps.filter(c => c.y < 16);
        if (wide && !--wide) { pw = 4; px = Math.min(px, N - pw); }
        if (slow) slow--;
        if (bricks.every(b => b.hp <= 0)) {
          level++; g.score += 20; fx(g, 'level'); flash(g, GREEN);
          build(); caps = []; serve(); card(g, ['LV', String(level)], WHITE, 1000);
        }
        // draw: flat bricks (silver = tough), gold capsules, white ball, cyan paddle
        rgb.fill(0);
        for (const b of bricks) if (b.hp > 0) { const c = b.hp > 1 ? GREY : b.c; set(rgb, b.x, b.y, c); set(rgb, b.x + 1, b.y, c); }
        for (const c of caps) if (t % 4 < 3) set(rgb, c.x, c.y, GOLD);
        for (let i = 0; i < pw; i++) set(rgb, px + i, 15, YOU);
        for (const b of balls) set(rgb, b.x, b.y, WHITE);
        for (let i = 0; i < lives; i++) set(rgb, 15 - i, 0, WHITE);
      };
      return g;
    },
  },
  {
    name: 'Ninja Dash', emoji: '🥷', tickMs: 60, players: 2,
    help: '2 players. Face off on a rooftop: A dashes with your sword, B (or ▲) jumps over an incoming dash, ◀ ▶ step. Dash too early and you can be countered. Your sword shows when the dash is ready. First to 5 wins. Player 1 is cyan, player 2 is pink.',
    create() {
      const g = { score: 0, over: false, tickMs: 60 };
      const GROUND = 12, WIN = 5;
      let round = 0, pause = 0, t = 0, winner = -1, bg = NAVY;
      const P = [{ c: YOU, pts: 0 }, { c: P2, pts: 0 }];
      function reset() {
        round++; pause = 0; winner = -1; bg = round % 2 ? NAVY : BLACK;
        Object.assign(P[0], { x: 2, y: 0, vy: 0, dash: 0, cool: 10, from: null });
        Object.assign(P[1], { x: 13, y: 0, vy: 0, dash: 0, cool: 10, from: null });
        card(g, ['GO!'], WHITE, 700);
      }
      reset();
      const dashSpeed = () => 1.1 + Math.min(0.5, round * 0.05);
      g.tick = (inp, rgb) => {
        t++;
        const ins = [inp, inp.p2 || { held: {}, pressed: new Set() }];
        if (pause > 0) {
          if (--pause === 0) {
            if (P[winner].pts >= WIN) { g.won = true; g.endText = [winner ? 'P2' : 'P1', 'WINS']; g.endColor = P[winner].c; g.noScore = true; g.score = P[winner].pts; g.over = true; return; }
            reset();
          }
        } else {
          const sideBefore = Math.sign(P[1].x - P[0].x);
          for (let i = 0; i < 2; i++) {
            const me = P[i], o = P[1 - i], h = ins[i].held, pr = ins[i].pressed;
            me.face = o.x > me.x ? 1 : -1;
            if (me.cool) me.cool--;
            const ground = me.y === 0;
            if (me.dash > 0) {
              me.x = clamp(me.x + me.face * dashSpeed(), 0, N - 1); me.dash--;
            } else {
              if (h.left) me.x = clamp(me.x - 0.25, 0, N - 1);
              if (h.right) me.x = clamp(me.x + 0.25, 0, N - 1);
              if (pr.has('a') && !me.cool && ground) { me.dash = 5; me.cool = 18; me.from = me.x; fx(g, 'shoot'); }
              else if ((pr.has('b') || pr.has('up')) && ground) { me.vy = -0.9; fx(g, 'jump'); }
            }
            if (!ground || me.vy) { me.vy += 0.15; me.y = Math.min(0, me.y + me.vy); if (me.y === 0) me.vy = 0; }
          }
          // clash: both dashing into each other bounces them apart
          if (P[0].dash && P[1].dash && (Math.abs(P[0].x - P[1].x) < 1.5 || Math.sign(P[1].x - P[0].x) !== sideBefore)) {
            P[0].dash = P[1].dash = 0; P[0].from = P[1].from = null; P[0].x = clamp(P[0].x - P[0].face * 3, 0, N - 1); P[1].x = clamp(P[1].x - P[1].face * 3, 0, N - 1);
            fx(g, 'hit'); shake(g, 2); burst(g, (P[0].x + P[1].x) / 2, GROUND - 2, WHITE, 6);
          }
          // a dash hits if it reaches or passes the other ninja while they are low enough
          const hits = P.map((me, i) => {
            const o = P[1 - i];
            if (me.from === null) return false;
            const lo = Math.min(me.from, me.x) - 0.5, hi = Math.max(me.from, me.x) + 0.5;
            return o.x >= lo && o.x <= hi && o.y > -1.4 && !o.dash;
          });
          P.forEach(me => { if (!me.dash) me.from = null; });
          if (hits[0] && hits[1]) { fx(g, 'hit'); shake(g, 2); burst(g, (P[0].x + P[1].x) / 2, GROUND - 2, WHITE, 6); P.forEach(me => { me.dash = 0; me.from = null; }); }
          else if (hits[0] || hits[1]) {
            const i = hits[0] ? 0 : 1, me = P[i], o = P[1 - i];
            winner = i; me.pts++; pause = 22; me.dash = 0; me.from = null; fx(g, 'boom'); shake(g, 3); flash(g, me.c);
            burst(g, o.x, GROUND - 2, RED, 8, { speed: 0.7, grav: 0.05 });
            card(g, [i ? 'P2' : 'P1'], me.c, 1100, false);
          }
        }
        // draw
        fill(rgb, bg);
        for (let y = GROUND; y < N; y++) for (let x = 0; x < N; x++) set(rgb, x, y, GREY);
        for (let k = 0; k < P[0].pts; k++) set(rgb, k * 2, 0, YOU);
        for (let k = 0; k < P[1].pts; k++) set(rgb, 15 - k * 2, 0, P2);
        P.forEach((me, i) => {
          const x = Math.round(me.x), y = GROUND - 2 + Math.round(me.y), hitMe = winner >= 0 && winner !== i;
          const c = hitMe && t % 4 < 2 ? RED : me.c;
          if (me.dash) for (let sx = Math.round(Math.min(me.from ?? me.x, me.x)); sx <= Math.round(Math.max(me.from ?? me.x, me.x)); sx++) if (sx !== x) set(rgb, sx, y, WHITE);
          set(rgb, x, y, c); set(rgb, x, y + 1, c);
          if (!me.cool || me.dash) set(rgb, x + (me.face || 1), y + 1, WHITE);
        });
      };
      return g;
    },
  },
  {
    name: 'Co-op Horde', emoji: '🧟', tickMs: 70, players: 2,
    help: '2 players, same team. Monsters pour in through the four gates. Move with the stick or arrows, hold A to fire the way you last moved. Green hearts heal. If your partner falls, stand next to them for 2 seconds to revive them. A boss comes every 5 waves.',
    create() {
      const g = { score: 0, over: false, tickMs: 70 };
      const GATES = [[7.5, 0.5], [7.5, 13.5], [0.5, 7], [14.5, 7]];
      let wave = 0, toSpawn = 0, spawnT = 0, t = 0, kills = 0, boss = null;
      let foes = [], shots = [], bombs = [], hearts = [];
      const P = [
        { c: YOU, x: 6.5, y: 8, ax: -1, ay: 0, hp: 100, cool: 0, down: false, rev: 0 },
        { c: P2, x: 8.5, y: 8, ax: 1, ay: 0, hp: 100, cool: 0, down: false, rev: 0 },
      ];
      const wall = (x, y) => {
        const cx = Math.round(x), cy = Math.round(y);
        return cy <= 0 || cy >= 14 || cx <= 0 || cx >= 15;
      };
      function nextWave() {
        wave++; fx(g, wave > 1 ? 'level' : 'start');
        if (wave % 5 === 0) { const hp = 20 + wave * 3; boss = { x: 7.5, y: 2, hp, max: hp, cool: 40, hit: 0 }; toSpawn = 2; card(g, ['BOSS'], RED, 1200); }
        else { toSpawn = 4 + wave * 2; card(g, ['WAVE', String(wave)], WHITE, 1000); }
        g.score += wave > 1 ? 50 : 0;
      }
      nextWave();
      const alive = () => P.filter(p => !p.down);
      const nearest = (x, y) => alive().sort((a, b) => Math.hypot(a.x - x, a.y - y) - Math.hypot(b.x - x, b.y - y))[0];
      g.tick = (inp, rgb) => {
        t++;
        const ins = [inp, inp.p2 || { held: {}, pressed: new Set() }];
        // players
        P.forEach((p, i) => {
          if (p.down) return;
          const h = ins[i].held;
          let mx = (h.right ? 1 : 0) - (h.left ? 1 : 0), my = (h.down ? 1 : 0) - (h.up ? 1 : 0);
          if (mx || my) { p.ax = mx; p.ay = my; const k = mx && my ? 0.7 : 1; p.x = clamp(p.x + mx * 0.25 * k, 1, 14); p.y = clamp(p.y + my * 0.25 * k, 1, 13); }
          if (p.cool) p.cool--;
          if ((h.a || ins[i].pressed.has('a')) && !p.cool) { p.cool = 4; const k = p.ax && p.ay ? 0.7 : 1; shots.push({ x: p.x, y: p.y, vx: p.ax * 0.6 * k, vy: p.ay * 0.6 * k }); fx(g, 'shoot'); }
        });
        // reviving: stand next to a fallen partner
        P.forEach((p, i) => {
          if (!p.down) return;
          const o = P[1 - i];
          if (!o.down && Math.hypot(o.x - p.x, o.y - p.y) < 1.6) { if (++p.rev >= 30) { p.down = false; p.hp = 40; p.rev = 0; fx(g, 'power'); burst(g, p.x, p.y, GREEN, 6); } }
          else p.rev = 0;
        });
        // spawning
        if (toSpawn > 0 && --spawnT <= 0) {
          spawnT = Math.max(8, 22 - wave);
          const [gx, gy] = GATES[rand(4)];
          foes.push({ x: gx, y: gy, hp: wave >= 3 && Math.random() < 0.3 ? 2 : 1, cool: 0, hit: 0 });
          toSpawn--;
        }
        if (!toSpawn && !foes.length && !boss) nextWave();
        if (t % 260 === 0 && hearts.length < 2) hearts.push({ x: 2 + rand(12), y: 2 + rand(11) });
        // monsters walk toward the nearest player
        const sp = 0.06 + Math.min(0.06, wave * 0.005);
        for (const f of foes) {
          const p = nearest(f.x, f.y); if (!p) break;
          const d = Math.hypot(p.x - f.x, p.y - f.y) || 1;
          if (d > 0.8) { f.x = clamp(f.x + (p.x - f.x) / d * sp, 0.5, 14.5); f.y = clamp(f.y + (p.y - f.y) / d * sp, 0.5, 13.5); }
          if (f.cool) f.cool--; if (f.hit) f.hit--;
          if (d < 0.9 && !f.cool) { f.cool = 15; p.hp -= 10; fx(g, 'hurt'); shake(g, 1); navigator.vibrate?.(40); }
        }
        if (boss) {
          const p = nearest(boss.x, boss.y);
          if (p) {
            const d = Math.hypot(p.x - boss.x, p.y - boss.y) || 1;
            if (d > 2) { boss.x = clamp(boss.x + (p.x - boss.x) / d * 0.04, 2, 13); boss.y = clamp(boss.y + (p.y - boss.y) / d * 0.04, 2, 12); }
            if (--boss.cool <= 0) { boss.cool = Math.max(18, 40 - wave); bombs.push({ x: boss.x, y: boss.y, vx: (p.x - boss.x) / d * 0.3, vy: (p.y - boss.y) / d * 0.3 }); fx(g, 'shoot'); }
            if (d < 2 && t % 15 === 0) { p.hp -= 15; fx(g, 'hurt'); shake(g, 2); }
          }
          if (boss.hit) boss.hit--;
        }
        // shots
        for (const s of shots) {
          s.x += s.vx; s.y += s.vy;
          if (wall(s.x, s.y)) { s.dead = true; continue; }
          for (const f of foes) if (!s.dead && f.hp > 0 && Math.abs(f.x - s.x) < 0.7 && Math.abs(f.y - s.y) < 0.7) {
            s.dead = true; f.hp--; f.hit = 2; fx(g, 'hit');
            if (f.hp <= 0) { kills++; g.score += 10; fx(g, 'boom'); burst(g, f.x, f.y, RED, 5); }
          }
          if (!s.dead && boss && Math.abs(boss.x - s.x) < 1.6 && Math.abs(boss.y - s.y) < 1.6) {
            s.dead = true; boss.hp--; boss.hit = 2; fx(g, 'hit');
            if (boss.hp <= 0) { g.score += 200; fx(g, 'boom'); shake(g, 5); flash(g, WHITE); burst(g, boss.x, boss.y, RED, 12, { speed: 0.9 }); boss = null; }
          }
        }
        for (const b of bombs) {
          b.x += b.vx; b.y += b.vy;
          if (wall(b.x, b.y)) b.dead = true;
          for (const p of alive()) if (!b.dead && Math.hypot(p.x - b.x, p.y - b.y) < 0.7) { b.dead = true; p.hp -= 12; fx(g, 'hurt'); shake(g, 2); }
        }
        for (const hrt of hearts) for (const p of alive()) if (!hrt.got && Math.hypot(p.x - hrt.x, p.y - hrt.y) < 0.8) { hrt.got = true; p.hp = Math.min(100, p.hp + 30); fx(g, 'pickup'); burst(g, hrt.x, hrt.y, GREEN, 5); }
        P.forEach(p => { if (!p.down && p.hp <= 0) { p.down = true; p.hp = 0; fx(g, 'die'); flash(g, RED); } });
        foes = foes.filter(f => f.hp > 0); shots = shots.filter(s => !s.dead); bombs = bombs.filter(b => !b.dead); hearts = hearts.filter(h => !h.got);
        if (P.every(p => p.down)) { g.endText = ['WAVE', String(wave)]; g.endColor = WHITE; g.over = true; return; }

        // draw: grey walls with four gates, red monsters, gold shots, green hearts
        rgb.fill(0);
        for (let x = 0; x < N; x++) if (x !== 7 && x !== 8) { set(rgb, x, 0, GREY); set(rgb, x, 14, GREY); }
        for (let y = 0; y < 15; y++) if (y !== 7) { set(rgb, 0, y, GREY); set(rgb, 15, y, GREY); }
        for (const h of hearts) set(rgb, h.x, h.y, GREEN);
        for (const f of foes) set(rgb, f.x, f.y, f.hit ? WHITE : RED);
        if (boss) {
          const bx = Math.round(boss.x), by = Math.round(boss.y), c = boss.hit ? WHITE : RED;
          for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) set(rgb, bx + a, by + b, c);
          set(rgb, bx - 1, by - 1, WHITE); set(rgb, bx + 1, by - 1, WHITE);
          const bar = Math.ceil(boss.hp / boss.max * 16);
          for (let x = 0; x < bar; x++) set(rgb, x, 0, WHITE);
        }
        for (const s of shots) set(rgb, s.x, s.y, GOLD);
        for (const b of bombs) set(rgb, b.x, b.y, RED);
        P.forEach(p => { if (!p.down || t % 6 < 3) set(rgb, p.x, p.y, p.down ? DARK : p.c); });
        const bar = (p, x0, dir) => { const n = Math.ceil(p.hp / 100 * 6); for (let k = 0; k < 6; k++) set(rgb, x0 + k * dir, 15, k < n ? p.c : BLACK); };
        bar(P[0], 0, 1); bar(P[1], 15, -1);
      };
      return g;
    },
  },
];

export const GAMES = GAME_LIST.map(polish);

// Score screen shown after a game ends: GAME OVER (or YOU WIN!) then the score.
export function gameOverFrame(rgb, game, t) {
  rgb.fill(0);
  const c = game.endColor || (game.won ? GREEN : RED);
  for (let x = 0; x < N; x++) { set(rgb, x, 0, (x + t) % 4 < 2 ? c : BLACK); set(rgb, x, 15, (x - t + 64) % 4 < 2 ? c : BLACK); }
  const words = game.endText || (game.won ? ['YOU', 'WIN!'] : ['GAME', 'OVER']);
  if (t % 24 < 10 || game.noScore) { drawText(rgb, words[0], 3, c); drawText(rgb, words[1], 9, c); }
  else drawNumber(rgb, game.score, 5, t % 6 < 4 ? WHITE : GREY);
}
