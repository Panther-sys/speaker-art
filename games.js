// Small original games for a 16x16 screen. The phone is the controller.
// Each game: { name, emoji, help, tickMs, create() -> { tick(input, rgb), score, over } }
// input = { held: {left,right,up,down,a}, pressed: Set of actions since last tick }
const N = 16;

function set(rgb, x, y, c) {
  x = Math.round(x); y = Math.round(y);
  if (x < 0 || y < 0 || x >= N || y >= N) return;
  const i = (y * N + x) * 3; rgb[i] = c[0]; rgb[i + 1] = c[1]; rgb[i + 2] = c[2];
}
const rand = n => Math.floor(Math.random() * n);

const DIGITS = { 0: '111101101101111', 1: '010110010010111', 2: '111001111100111', 3: '111001111001111', 4: '101101111001001', 5: '111100111001111', 6: '111100111101111', 7: '111001010010010', 8: '111101111101111', 9: '111101111001111' };
export function drawNumber(rgb, n, y, c) {
  const s = String(n), w = s.length * 4 - 1, ox = Math.floor((N - w) / 2);
  [...s].forEach((d, k) => { const p = DIGITS[d]; for (let i = 0; i < 15; i++) if (p[i] === '1') set(rgb, ox + k * 4 + i % 3, y + (i / 3 | 0), c); });
}

export const GAMES = [
  {
    name: 'Snake', emoji: '🐍', tickMs: 170,
    help: 'Swipe or use the arrows to steer. Eat the red dots, avoid walls and your tail.',
    create() {
      let body = [[7, 8], [6, 8], [5, 8]], dir = [1, 0], next = [1, 0], food = null, grow = 0;
      const g = { score: 0, over: false, tickMs: 170 };
      const place = () => { do { food = [rand(N), rand(N)]; } while (body.some(([x, y]) => x === food[0] && y === food[1])); };
      place();
      g.tick = (inp, rgb) => {
        for (const a of inp.pressed) {
          const d = { left: [-1, 0], right: [1, 0], up: [0, -1], down: [0, 1] }[a];
          if (d && (d[0] !== -dir[0] || d[1] !== -dir[1])) next = d;
        }
        dir = next;
        const h = [body[0][0] + dir[0], body[0][1] + dir[1]];
        if (h[0] < 0 || h[1] < 0 || h[0] >= N || h[1] >= N || body.some(([x, y]) => x === h[0] && y === h[1])) { g.over = true; return; }
        body.unshift(h);
        if (h[0] === food[0] && h[1] === food[1]) { g.score++; grow += 1; place(); g.tickMs = Math.max(80, 170 - g.score * 4); }
        if (grow > 0) grow--; else body.pop();
        rgb.fill(0);
        set(rgb, food[0], food[1], [255, 40, 40]);
        body.forEach(([x, y], i) => set(rgb, x, y, i === 0 ? [180, 255, 120] : [0, 200 - Math.min(120, i * 4), 60]));
      };
      return g;
    },
  },
  {
    name: 'Rally', emoji: '🏓', tickMs: 90,
    help: 'Hold left or right to move your paddle (bottom). First to 5 wins.',
    create() {
      const g = { score: 0, over: false, tickMs: 90 };
      let me = 6, cpu = 6, ai = 0, bx, by, vx, vy;
      const serve = d => { bx = 7.5; by = 7.5; vx = (Math.random() < .5 ? -1 : 1) * 0.35; vy = 0.45 * d; };
      serve(1);
      g.tick = (inp, rgb) => {
        if (inp.held.left) me = Math.max(0, me - 1);
        if (inp.held.right) me = Math.min(N - 4, me + 1);
        // the computer follows the ball a little lazily
        if (++ai % 2 === 0) { const t = bx - 2; cpu += Math.sign(t - cpu) * (Math.abs(t - cpu) > 0.5 ? 1 : 0); cpu = Math.max(0, Math.min(N - 4, cpu)); }
        bx += vx; by += vy;
        if (bx < 0 || bx > N - 1) { vx = -vx; bx = Math.max(0, Math.min(N - 1, bx)); }
        if (by >= 14 && vy > 0) {
          if (bx >= me - 0.5 && bx <= me + 4.5) { vy = -Math.abs(vy) * 1.04; vx += (bx - (me + 2)) * 0.12; by = 14; }
          else if (by > 15.5) { g.lost = (g.lost || 0) + 1; if (g.lost >= 5) { g.over = true; return; } serve(-1); }
        }
        if (by <= 1 && vy < 0) {
          if (bx >= cpu - 0.5 && bx <= cpu + 4.5) { vy = Math.abs(vy); vx += (bx - (cpu + 2)) * 0.1; by = 1; }
          else if (by < -0.5) { g.score++; if (g.score >= 5) { g.won = true; g.over = true; return; } serve(1); }
        }
        vx = Math.max(-0.8, Math.min(0.8, vx));
        rgb.fill(0);
        for (let x = 0; x < N; x++) if (x % 2 === 0) set(rgb, x, 7.5, [25, 25, 45]);
        for (let i = 0; i < 4; i++) { set(rgb, me + i, 15, [80, 200, 255]); set(rgb, cpu + i, 0, [255, 90, 120]); }
        set(rgb, bx, by, [255, 255, 255]);
        for (let i = 0; i < g.score; i++) set(rgb, 15, 14 - i * 2, [80, 200, 255]);
        for (let i = 0; i < (g.lost || 0); i++) set(rgb, 15, 1 + i * 2, [255, 90, 120]);
      };
      return g;
    },
  },
  {
    name: 'Meteor dodge', emoji: '☄️', tickMs: 110,
    help: 'Hold left or right to dodge the falling rocks. It gets faster the longer you last.',
    create() {
      const g = { score: 0, over: false, tickMs: 110 };
      let x = 7, rocks = [], t = 0;
      g.tick = (inp, rgb) => {
        t++;
        if (inp.held.left) x = Math.max(0, x - 1);
        if (inp.held.right) x = Math.min(N - 1, x + 1);
        const speed = 0.35 + Math.min(0.9, t / 400);
        if (Math.random() < 0.25 + Math.min(0.35, t / 600)) rocks.push({ x: rand(N), y: -1, v: speed * (0.8 + Math.random() * 0.5) });
        rocks.forEach(r => r.y += r.v);
        rocks = rocks.filter(r => r.y < N + 1);
        if (rocks.some(r => Math.round(r.x) === x && Math.round(r.y) >= 14 && Math.round(r.y) <= 15)) { g.over = true; return; }
        g.score = Math.floor(t / 10);
        rgb.fill(0);
        for (let i = 0; i < 6; i++) set(rgb, (i * 7 + t / 8) % N, (i * 5) % 13, [20, 20, 40]);
        rocks.forEach(r => { set(rgb, r.x, r.y, [255, 140, 40]); set(rgb, r.x, r.y - 1, [120, 40, 10]); });
        set(rgb, x, 15, [120, 220, 255]); set(rgb, x, 14, [255, 255, 255]);
      };
      return g;
    },
  },
  {
    name: 'Hop', emoji: '🐤', tickMs: 90,
    help: 'Tap A (or tap the screen) to flap. Fly through the gaps.',
    create() {
      const g = { score: 0, over: false, tickMs: 90 };
      let y = 7, v = 0, walls = [{ x: 16, gap: 6 }], t = 0;
      g.tick = (inp, rgb) => {
        t++;
        if (inp.pressed.has('a') || inp.pressed.has('up')) v = -1.05;
        v = Math.min(1, v + 0.22); y += v;
        if (t % 2 === 0) walls.forEach(w => w.x--);
        if (walls[walls.length - 1].x < 8) walls.push({ x: 16, gap: 2 + rand(8) });
        if (walls[0].x < -1) walls.shift();
        if (y < 0 || y > 15) { g.over = true; return; }
        for (const w of walls) {
          if (w.x === 4 && !w.scored) { w.scored = true; g.score++; }
          if ((w.x === 4 || w.x + 1 === 4) && (Math.round(y) < w.gap || Math.round(y) > w.gap + 4)) { g.over = true; return; }
        }
        rgb.fill(0);
        for (let i = 0; i < N * N; i++) { const yy = i / N | 0; rgb[i * 3 + 2] = 30 + yy * 3; rgb[i * 3 + 1] = 10 + yy; }
        for (const w of walls) for (let yy = 0; yy < N; yy++) if (yy < w.gap || yy > w.gap + 4) { set(rgb, w.x, yy, [40, 200, 80]); set(rgb, w.x + 1, yy, [20, 140, 50]); }
        set(rgb, 4, y, [255, 220, 0]); set(rgb, 5, y, [255, 120, 0]);
      };
      return g;
    },
  },
  {
    name: 'Brick breaker', emoji: '🧱', tickMs: 80,
    help: 'Hold left or right to move the paddle. Clear all the bricks.',
    create() {
      const g = { score: 0, over: false, tickMs: 80 };
      let px = 6, bx = 7.5, by = 12, vx = 0.3, vy = -0.45, lives = 3, level = 1;
      const COLORS = [[255, 60, 60], [255, 150, 40], [255, 230, 40], [60, 220, 90], [60, 160, 255]];
      let bricks;
      const build = () => { bricks = []; for (let r = 0; r < 5; r++) for (let c = 0; c < 8; c++) bricks.push({ x: c * 2, y: 1 + r, alive: true, c: COLORS[r] }); };
      build();
      g.tick = (inp, rgb) => {
        if (inp.held.left) px = Math.max(0, px - 1);
        if (inp.held.right) px = Math.min(N - 4, px + 1);
        bx += vx; by += vy;
        if (bx < 0 || bx > N - 1) { vx = -vx; bx = Math.max(0, Math.min(N - 1, bx)); }
        if (by < 0) { vy = Math.abs(vy); by = 0; }
        const hit = bricks.find(b => b.alive && Math.round(by) === b.y && (Math.floor(bx) === b.x || Math.floor(bx) === b.x + 1));
        if (hit) { hit.alive = false; vy = -vy; g.score++; }
        if (bricks.every(b => !b.alive)) { level++; build(); bx = 7.5; by = 12; vy = -0.45 - level * 0.05; }
        if (by >= 14 && vy > 0) {
          if (bx >= px - 0.5 && bx <= px + 4.5) { vy = -Math.abs(vy); vx = (bx - (px + 2)) * 0.2 || 0.15; by = 14; }
          else if (by > 15.5) { lives--; if (!lives) { g.over = true; return; } bx = px + 2; by = 13; vy = -0.45; }
        }
        rgb.fill(0);
        bricks.forEach(b => { if (b.alive) { set(rgb, b.x, b.y, b.c); set(rgb, b.x + 1, b.y, b.c.map(v => v * 0.6 | 0)); } });
        for (let i = 0; i < 4; i++) set(rgb, px + i, 15, [200, 200, 255]);
        set(rgb, bx, by, [255, 255, 255]);
        for (let i = 0; i < lives; i++) set(rgb, 15 - i, 0, [255, 60, 120]);
      };
      return g;
    },
  },
];

// Score screen shown after a game ends.
export function gameOverFrame(rgb, game, t) {
  rgb.fill(0);
  const c = game.won ? [80, 255, 120] : [255, 70, 90];
  for (let x = 0; x < N; x++) { set(rgb, x, 0, c); set(rgb, x, 15, c); }
  drawNumber(rgb, game.score, 5, t % 6 < 4 ? [255, 255, 255] : [120, 120, 120]);
}
