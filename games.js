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
// mix colour c into a pixel with strength a (0..1)
function blend(rgb, x, y, c, a) {
  if (a <= 0 || x < 0 || y < 0 || x >= N || y >= N) return;
  a = Math.min(1, a);
  const i = (y * N + x) * 3;
  for (let k = 0; k < 3; k++) rgb[i + k] = Math.round(rgb[i + k] * (1 - a) + c[k] * a);
}

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
    name: 'Hop', emoji: '🐤', tickMs: 70,
    help: 'Tap A (or tap the screen) to flap. Fly through the gaps.',
    create() {
      const g = { score: 0, over: false, tickMs: 70 };
      const GAP = 5;
      let y = 7, v = 0, t = 0, walls = [{ x: 17, gap: 5 }];
      g.tick = (inp, rgb) => {
        t++;
        if (inp.pressed.has('a') || inp.pressed.has('up')) v = -0.8;
        v = Math.min(0.75, v + 0.12); y += v;
        const speed = 0.3 + Math.min(0.15, g.score * 0.01);
        walls.forEach(w => w.x -= speed);
        if (walls[walls.length - 1].x < 9) {
          const last = walls[walls.length - 1].gap;
          walls.push({ x: 17, gap: Math.max(1, Math.min(N - GAP - 1, last + rand(9) - 4)) });
        }
        if (walls[0].x < -2) walls.shift();
        if (y < -0.5 || y > 15.5) { g.over = true; return; }
        for (const w of walls) {
          if (!w.scored && w.x + 2 < 4) { w.scored = true; g.score++; }
          const overlaps = w.x < 5 && w.x + 2 > 4;
          if (overlaps && (y < w.gap - 0.3 || y + 1 > w.gap + GAP + 0.3)) { g.over = true; return; }
        }
        // sky
        for (let yy = 0; yy < N; yy++) for (let x = 0; x < N; x++) set(rgb, x, yy, [10 + yy * 2, 14 + yy * 3, 40 + yy * 6]);
        // walls with soft edges so they glide instead of jumping a pixel at a time
        for (const w of walls) {
          const x0 = Math.floor(w.x), f = w.x - x0;
          for (let yy = 0; yy < N; yy++) {
            if (yy >= w.gap && yy < w.gap + GAP) continue;
            blend(rgb, x0, yy, [40, 200, 80], 1 - f);
            blend(rgb, x0 + 1, yy, [30, 170, 65], 1);
            blend(rgb, x0 + 2, yy, [20, 140, 50], f);
          }
        }
        // bird, spread over two rows by its exact height
        const y0 = Math.floor(y), fy = y - y0;
        blend(rgb, 4, y0, [255, 220, 0], 1 - fy); blend(rgb, 4, y0 + 1, [255, 220, 0], fy);
        blend(rgb, 5, y0, [255, 120, 0], 1 - fy); blend(rgb, 5, y0 + 1, [255, 120, 0], fy);
      };
      return g;
    },
  },
  {
    name: 'Pixel Quest', emoji: '🏃', tickMs: 70,
    help: 'Hold ▶ to run and press A (or ▲) to jump. Hold A longer to jump higher. Grab coins, stomp the blobs, avoid spikes and pits. 3 lives.',
    create() {
      const g = { score: 0, over: false, tickMs: 70 };
      // world: column index -> array of 16 cells. '.' air, 'G' ground, 'B' brick, 'S' spike, 'C' coin
      const cols = [];
      const enemies = [];
      let genX = 0;
      const GROUND = 13;
      const column = (top = GROUND) => { const c = Array(N).fill('.'); for (let y = top; y < N; y++) c[y] = 'G'; return c; };
      const flat = (n, top = GROUND) => { for (let i = 0; i < n; i++) cols[genX++] = column(top); };
      function generate(to) {
        while (genX < to) {
          const d = Math.min(1, genX / 400); // difficulty grows with distance
          if (genX < 18) { flat(18 - genX); continue; }
          const r = Math.random();
          if (r < 0.18) { // pit
            const w = 2 + rand(d > 0.5 ? 3 : 2);
            for (let i = 0; i < w; i++) cols[genX++] = Array(N).fill('.');
            flat(3);
          } else if (r < 0.32) { // spikes
            flat(2); const c = column(); c[GROUND - 1] = 'S'; cols[genX++] = c;
            if (d > 0.4 && Math.random() < 0.5) { const c2 = column(); c2[GROUND - 1] = 'S'; cols[genX++] = c2; }
            flat(3);
          } else if (r < 0.48) { // enemy on a flat stretch
            const start = genX; flat(7);
            enemies.push({ x: start + 4, y: GROUND - 1, dir: -1, alive: true });
            if (d > 0.6) enemies.push({ x: start + 6, y: GROUND - 1, dir: 1, alive: true });
          } else if (r < 0.62) { // steps up and down
            flat(1, GROUND - 1); flat(2, GROUND - 2); flat(2, GROUND - 3); flat(1, GROUND - 1); flat(2);
          } else if (r < 0.80) { // floating bricks with coins, maybe over a pit
            const w = 3 + rand(3), pit = Math.random() < 0.3 + d * 0.4;
            flat(2);
            for (let i = 0; i < w; i++) {
              const c = pit && i > 0 && i < w - 1 ? Array(N).fill('.') : column();
              c[9] = 'B'; c[8] = 'C'; cols[genX++] = c;
            }
            flat(3);
          } else { // coin arc
            for (let i = 0; i < 5; i++) { const c = column(); c[[11, 10, 9, 10, 11][i]] = 'C'; cols[genX++] = c; }
          }
        }
      }
      generate(40);

      const cell = (x, y) => { if (y < 0) return '.'; if (y >= N) return '.'; const c = cols[Math.floor(x)]; return c ? c[Math.floor(y)] : '.'; };
      const solid = (x, y) => { const k = cell(x, y); return k === 'G' || k === 'B'; };

      let x = 3, y = GROUND - 2, vx = 0, vy = 0, onGround = false, cam = 0, lives = 3, hurt = 0, t = 0, maxX = 0, coins = 0, stomps = 0;
      const W = 0.8; // hero is 0.8 wide, 2 tall

      function loseLife() {
        lives--; navigator.vibrate?.(120);
        if (!lives) { g.over = true; return; }
        // respawn on the next safe ground in view
        let rx = Math.max(cam + 1, Math.floor(x) - 2);
        while (generate(rx + 20), !(solid(rx, GROUND) && solid(rx + 1, GROUND) && cell(rx, GROUND - 1) === '.' && cell(rx + 1, GROUND - 1) === '.')) rx++;
        x = rx; y = GROUND - 2; vx = vy = 0; hurt = 25;
        cam = Math.max(cam, Math.floor(x) - 5);
      }

      g.tick = (inp, rgb) => {
        t++;
        // --- input & physics ---
        if (inp.held.right) vx = Math.min(0.42, vx + 0.07);
        else if (inp.held.left) vx = Math.max(-0.32, vx - 0.07);
        else vx *= 0.7;
        const jump = inp.pressed.has('a') || inp.pressed.has('up');
        if (jump && onGround) vy = -0.98;
        if (!inp.held.a && !inp.held.up && vy < -0.35) vy = -0.35; // short hop when released early
        vy = Math.min(0.85, vy + 0.1);

        // horizontal move with collision
        let nx = x + vx;
        if (nx < cam) { nx = cam; vx = 0; }
        for (const yy of [y + 0.05, y + 1, y + 1.95]) {
          if (vx > 0 && solid(nx + W, yy)) { nx = Math.floor(nx + W) - W - 0.001; vx = 0; }
          if (vx < 0 && solid(nx, yy)) { nx = Math.floor(nx) + 1; vx = 0; }
        }
        x = nx;
        // vertical move with collision
        let ny = y + vy; onGround = false;
        if (vy > 0 && (solid(x + 0.05, ny + 2) || solid(x + W - 0.05, ny + 2))) { ny = Math.floor(ny + 2) - 2; vy = 0; onGround = true; }
        if (vy < 0 && (solid(x + 0.05, ny) || solid(x + W - 0.05, ny))) {
          // bump a brick from below: it pops its coin
          for (const bx of [x + 0.05, x + W - 0.05]) { const c = cols[Math.floor(bx)]; if (c && c[Math.floor(ny)] === 'B' && c[Math.floor(ny) - 1] === 'C') { c[Math.floor(ny) - 1] = '.'; coins++; } }
          ny = Math.floor(ny) + 1; vy = 0;
        }
        y = ny;

        if (y > N) { loseLife(); if (g.over) return; }
        // spikes and coins
        for (const [cx, cy] of [[x + 0.1, y + 0.2], [x + W - 0.1, y + 0.2], [x + 0.1, y + 1.8], [x + W - 0.1, y + 1.8]]) {
          const k = cell(cx, cy);
          if (k === 'C') { cols[Math.floor(cx)][Math.floor(cy)] = '.'; coins++; }
          if (k === 'S' && !hurt) { loseLife(); if (g.over) return; break; }
        }
        // enemies
        for (const e of enemies) {
          if (!e.alive || e.x < cam - 4 || e.x > cam + 20) continue;
          const ahead = e.x + (e.dir > 0 ? 1 : -0.05);
          if (solid(ahead, e.y) || !solid(ahead, e.y + 1)) e.dir = -e.dir;
          e.x += e.dir * 0.07;
          if (Math.abs(e.x - x) < 0.85 && y + 2 > e.y + 0.1 && y < e.y + 1) {
            if (vy > 0 && y + 2 < e.y + 0.7) { e.alive = false; vy = -0.6; stomps++; }
            else if (!hurt) { loseLife(); if (g.over) return; }
          }
        }
        if (hurt) hurt--;

        cam = Math.max(cam, Math.floor(x) - 5);
        maxX = Math.max(maxX, x);
        generate(cam + 40);
        g.score = Math.floor(maxX / 2) + coins * 5 + stomps * 10;

        // --- draw ---
        for (let sy = 0; sy < N; sy++) for (let sx = 0; sx < N; sx++) {
          const band = Math.min(3, sy >> 2);
          set(rgb, sx, sy, [[8, 10, 36], [14, 20, 60], [22, 34, 86], [34, 52, 110]][band]);
        }
        // far hills (move at half speed for depth)
        for (let sx = 0; sx < N; sx++) {
          const h = 10 + Math.round(Math.sin((sx + cam * 0.5) * 0.35) * 1.5);
          for (let sy = h; sy < N; sy++) set(rgb, sx, sy, [20, 60, 70]);
        }
        for (let sx = 0; sx < N; sx++) {
          const c = cols[cam + sx]; if (!c) continue;
          for (let sy = 0; sy < N; sy++) {
            const k = c[sy];
            if (k === 'G') set(rgb, sx, sy, sy === 0 || c[sy - 1] !== 'G' ? [60, 200, 70] : [110, 70, 35]);
            else if (k === 'B') set(rgb, sx, sy, [190, 100, 40]);
            else if (k === 'S') set(rgb, sx, sy, [230, 230, 240]);
            else if (k === 'C') set(rgb, sx, sy, t % 8 < 6 ? [255, 215, 0] : [255, 255, 180]);
          }
        }
        for (const e of enemies) if (e.alive) {
          const ex = e.x - cam, e0 = Math.floor(ex), f = ex - e0;
          blend(rgb, e0, e.y, [200, 60, 220], 1 - f); blend(rgb, e0 + 1, e.y, [200, 60, 220], f);
        }
        if (!hurt || t % 4 < 2) {
          const hx = Math.floor(x + W / 2 - cam), hy = Math.round(y);
          set(rgb, hx, hy, [255, 220, 150]);     // head
          set(rgb, hx, hy + 1, [40, 200, 255]);  // body
        }
        for (let i = 0; i < lives; i++) set(rgb, 15 - i, 0, [255, 60, 90]);
      };
      return g;
    },
  },
  {
    name: 'Star Blaster', emoji: '🚀', tickMs: 70,
    help: 'Hold ◀ ▶ to fly, hold A to fire. Shoot the invaders before they reach you. Green stars give double shots. 3 lives.',
    create() {
      const g = { score: 0, over: false, tickMs: 70 };
      let sx = 7, lives = 3, t = 0, cool = 0, hurt = 0, power = 0, wave = 0;
      let shots = [], bombs = [], foes = [], sparks = [], drops = [];
      const stars = Array.from({ length: 14 }, () => ({ x: rand(N), y: Math.random() * N, v: 0.1 + Math.random() * 0.3 }));
      const spawnWave = () => {
        wave++;
        const kind = wave % 3;
        const n = Math.min(10, 4 + wave);
        for (let i = 0; i < n; i++) foes.push({
          x: kind === 0 ? 2 + (i % 5) * 3 : rand(14) + 1,
          y: kind === 0 ? -1 - Math.floor(i / 5) * 3 : -1 - i * 2.5,
          kind, phase: Math.random() * 6, hp: wave > 4 && i % 4 === 0 ? 2 : 1,
        });
      };
      const boom = (x, y, c) => { for (let i = 0; i < 6; i++) sparks.push({ x, y, vx: (Math.random() - 0.5) * 0.8, vy: (Math.random() - 0.5) * 0.8, life: 6 + rand(4), c }); };
      g.tick = (inp, rgb) => {
        t++;
        if (inp.held.left) sx = Math.max(1, sx - 0.5);
        if (inp.held.right) sx = Math.min(N - 2, sx + 0.5);
        if (cool) cool--;
        if ((inp.held.a || inp.pressed.has('a') || inp.held.up) && !cool) {
          const x = Math.round(sx);
          if (power) { shots.push({ x: x - 1, y: 13 }, { x: x + 1, y: 13 }); power--; } else shots.push({ x, y: 13 });
          cool = 3;
        }
        if (!foes.length) spawnWave();
        const speed = 0.06 + Math.min(0.08, wave * 0.008);
        for (const f of foes) {
          f.y += speed;
          if (f.kind === 1) f.x += Math.sin(t / 6 + f.phase) * 0.25;
          if (f.kind === 2) f.x += Math.sign(sx - f.x) * 0.05;
          f.x = Math.max(0, Math.min(N - 1, f.x));
          if (f.y > 0 && Math.random() < 0.006 + wave * 0.002) bombs.push({ x: Math.round(f.x), y: f.y + 1 });
        }
        shots.forEach(s => s.y -= 0.9);
        bombs.forEach(b => b.y += 0.35);
        drops.forEach(d => d.y += 0.2);
        // hits
        for (const s of shots) for (const f of foes) {
          if (f.hp > 0 && Math.abs(Math.round(f.x) - s.x) <= 0.5 && s.y <= f.y + 1 && s.y >= f.y - 1) {
            s.y = -9; f.hp--;
            if (!f.hp) { boom(f.x, f.y, [255, 160, 40]); g.score += 10; if (Math.random() < 0.08) drops.push({ x: Math.round(f.x), y: f.y }); }
          }
        }
        const ship = Math.round(sx);
        const hitShip = (x, y) => Math.abs(x - ship) <= 1 && y >= 13.5 && y < 16;
        for (const d of drops) if (Math.abs(d.x - ship) <= 1 && d.y >= 13) { d.y = 99; power = 25; }
        if (!hurt) {
          for (const b of bombs) if (hitShip(b.x, b.y)) { b.y = 99; hurt = 20; }
          for (const f of foes) if (f.hp > 0 && (hitShip(Math.round(f.x), f.y) || f.y > 15.5)) { f.hp = 0; boom(f.x, f.y, [255, 80, 80]); hurt = 20; }
          if (hurt) { lives--; boom(sx, 14, [80, 200, 255]); navigator.vibrate?.(120); if (!lives) { g.over = true; return; } }
        }
        if (hurt) hurt--;
        foes = foes.filter(f => f.hp > 0 && f.y < 17);
        shots = shots.filter(s => s.y > -1);
        bombs = bombs.filter(b => b.y < 16);
        drops = drops.filter(d => d.y < 16);
        sparks.forEach(p => { p.x += p.vx; p.y += p.vy; p.life--; });
        sparks = sparks.filter(p => p.life > 0);
        stars.forEach(s => { s.y += s.v; if (s.y >= N) { s.y = 0; s.x = rand(N); } });

        // draw
        rgb.fill(0);
        for (const s of stars) set(rgb, s.x, s.y, s.v > 0.25 ? [70, 70, 110] : [35, 35, 60]);
        for (const d of drops) set(rgb, d.x, d.y, t % 4 < 2 ? [60, 255, 120] : [200, 255, 200]);
        for (const f of foes) {
          const c = f.hp > 1 ? [255, 255, 255] : [[255, 70, 140], [255, 200, 40], [170, 90, 255]][f.kind];
          blend(rgb, Math.round(f.x), Math.floor(f.y), c, 1 - (f.y % 1));
          blend(rgb, Math.round(f.x), Math.floor(f.y) + 1, c, f.y % 1);
          if (t % 6 < 3) { set(rgb, Math.round(f.x) - 1, Math.round(f.y), c.map(v => v * 0.5 | 0)); set(rgb, Math.round(f.x) + 1, Math.round(f.y), c.map(v => v * 0.5 | 0)); }
        }
        for (const s of shots) { set(rgb, s.x, s.y, [255, 255, 160]); set(rgb, s.x, s.y + 1, [140, 120, 40]); }
        for (const b of bombs) set(rgb, b.x, b.y, [255, 60, 60]);
        for (const p of sparks) blend(rgb, Math.round(p.x), Math.round(p.y), p.c, p.life / 8);
        if (!hurt || t % 4 < 2) {
          const c = power ? [60, 255, 120] : [80, 200, 255];
          set(rgb, ship, 14, [255, 255, 255]); set(rgb, ship - 1, 15, c); set(rgb, ship, 15, c); set(rgb, ship + 1, 15, c);
          if (t % 2) set(rgb, ship, 16, [255, 120, 0]);
        }
        for (let i = 0; i < lives; i++) set(rgb, 15 - i, 0, [255, 60, 90]);
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
