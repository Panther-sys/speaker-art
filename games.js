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
// queue a sound effect for the app to play after this tick
const fx = (g, name) => (g.sfx ||= []).push(name);
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
    help: 'Swipe or use the arrows to steer. Eat the red dots and don\'t bite your tail. The edges wrap around, so you can go through the walls.',
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
        // the edges wrap around: leave on one side, come back on the other
        const h = [(body[0][0] + dir[0] + N) % N, (body[0][1] + dir[1] + N) % N];
        if (body.slice(0, -1).some(([x, y]) => x === h[0] && y === h[1])) { g.over = true; return; }
        body.unshift(h);
        if (h[0] === food[0] && h[1] === food[1]) { g.score++; fx(g, 'eat'); grow += 1; place(); g.tickMs = Math.max(80, 170 - g.score * 4); }
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
          if (bx >= me - 0.5 && bx <= me + 4.5) { fx(g, 'bounce'); vy = -Math.abs(vy) * 1.04; vx += (bx - (me + 2)) * 0.12; by = 14; }
          else if (by > 15.5) { fx(g, 'hurt'); g.lost = (g.lost || 0) + 1; if (g.lost >= 5) { g.over = true; return; } serve(-1); }
        }
        if (by <= 1 && vy < 0) {
          if (bx >= cpu - 0.5 && bx <= cpu + 4.5) { fx(g, 'bounce'); vy = Math.abs(vy); vx += (bx - (cpu + 2)) * 0.1; by = 1; }
          else if (by < -0.5) { fx(g, 'score'); g.score++; if (g.score >= 5) { g.won = true; g.over = true; return; } serve(1); }
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
        if (inp.pressed.has('a') || inp.pressed.has('up')) { v = -0.8; fx(g, 'flap'); }
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
          if (!w.scored && w.x + 2 < 4) { w.scored = true; g.score++; fx(g, 'score'); }
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
        lives--; navigator.vibrate?.(120); fx(g, 'hurt');
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
        if (jump && onGround) { vy = -0.98; fx(g, 'jump'); }
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
          for (const bx of [x + 0.05, x + W - 0.05]) { const c = cols[Math.floor(bx)]; if (c && c[Math.floor(ny)] === 'B' && c[Math.floor(ny) - 1] === 'C') { c[Math.floor(ny) - 1] = '.'; coins++; fx(g, 'coin'); } }
          ny = Math.floor(ny) + 1; vy = 0;
        }
        y = ny;

        if (y > N) { loseLife(); if (g.over) return; }
        // spikes and coins
        for (const [cx, cy] of [[x + 0.1, y + 0.2], [x + W - 0.1, y + 0.2], [x + 0.1, y + 1.8], [x + W - 0.1, y + 1.8]]) {
          const k = cell(cx, cy);
          if (k === 'C') { cols[Math.floor(cx)][Math.floor(cy)] = '.'; coins++; fx(g, 'coin'); }
          if (k === 'S' && !hurt) { loseLife(); if (g.over) return; break; }
        }
        // enemies
        for (const e of enemies) {
          if (!e.alive || e.x < cam - 4 || e.x > cam + 20) continue;
          const ahead = e.x + (e.dir > 0 ? 1 : -0.05);
          if (solid(ahead, e.y) || !solid(ahead, e.y + 1)) e.dir = -e.dir;
          e.x += e.dir * 0.07;
          if (Math.abs(e.x - x) < 0.85 && y + 2 > e.y + 0.1 && y < e.y + 1) {
            if (vy > 0 && y + 2 < e.y + 0.7) { e.alive = false; vy = -0.6; stomps++; fx(g, 'stomp'); }
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
          cool = 3; fx(g, 'shoot');
        }
        if (!foes.length) { spawnWave(); if (wave > 1) fx(g, 'level'); }
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
            if (!f.hp) { boom(f.x, f.y, [255, 160, 40]); g.score += 10; fx(g, 'boom'); if (Math.random() < 0.08) drops.push({ x: Math.round(f.x), y: f.y }); }
          }
        }
        const ship = Math.round(sx);
        const hitShip = (x, y) => Math.abs(x - ship) <= 1 && y >= 13.5 && y < 16;
        for (const d of drops) if (Math.abs(d.x - ship) <= 1 && d.y >= 13) { d.y = 99; power = 25; fx(g, 'power'); }
        if (!hurt) {
          for (const b of bombs) if (hitShip(b.x, b.y)) { b.y = 99; hurt = 20; }
          for (const f of foes) if (f.hp > 0 && (hitShip(Math.round(f.x), f.y) || f.y > 15.5)) { f.hp = 0; boom(f.x, f.y, [255, 80, 80]); hurt = 20; }
          if (hurt) { lives--; fx(g, 'hurt'); boom(sx, 14, [80, 200, 255]); navigator.vibrate?.(120); if (!lives) { g.over = true; return; } }
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
    name: 'Maze Raider', emoji: '👾', tickMs: 70,
    help: '3D first person. ▲▼ walk, ◀▶ turn, A fires (Xbox: left stick, A or RT to fire, LB/RB to sidestep). Find the glowing green exit. Pink = health, yellow = ammo.',
    create() {
      const g = { score: 0, over: false, tickMs: 70 };
      const VIEW = 15; // rows 0..14 are the 3D view, row 15 is the status bar
      let map, size, px, py, ang, hp = 100, ammo = 20, level = 0, kills = 0, t = 0, flash = 0, hurtFlash = 0, cool = 0, banner = 0;
      let things = []; // monsters and pickups

      function buildLevel() {
        level++; banner = 25;
        size = Math.min(21, 9 + level * 2) | 1; // odd size for the maze carver
        map = Array.from({ length: size }, () => Array(size).fill(1));
        // carve a maze from (1,1)
        const stack = [[1, 1]]; map[1][1] = 0;
        while (stack.length) {
          const [cx, cy] = stack[stack.length - 1];
          const dirs = [[2, 0], [-2, 0], [0, 2], [0, -2]].filter(([dx, dy]) => { const nx = cx + dx, ny = cy + dy; return nx > 0 && ny > 0 && nx < size - 1 && ny < size - 1 && map[ny][nx] === 1; });
          if (!dirs.length) { stack.pop(); continue; }
          const [dx, dy] = dirs[rand(dirs.length)];
          map[cy + dy / 2][cx + dx / 2] = 0; map[cy + dy][cx + dx] = 0; stack.push([cx + dx, cy + dy]);
        }
        // open some extra holes and a few rooms so it isn't only corridors
        for (let i = 0; i < size * 2; i++) { const x = 1 + rand(size - 2), y = 1 + rand(size - 2); if ((x + y) % 2) map[y][x] = 0; }
        for (let r = 0; r < 1 + level / 2; r++) { const x = 1 + rand(size - 5), y = 1 + rand(size - 5); for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) map[y + a][x + b] = 0; }
        // wall colours: a few materials
        for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (map[y][x]) map[y][x] = 1 + ((x * 7 + y * 13 + level) % 3);
        // exit = the floor cell farthest from the start (BFS)
        const dist = Array.from({ length: size }, () => Array(size).fill(-1)); dist[1][1] = 0;
        const q = [[1, 1]]; let far = [1, 1]; const floor = [];
        while (q.length) {
          const [x, y] = q.shift(); floor.push([x, y]);
          if (dist[y][x] > dist[far[1]][far[0]]) far = [x, y];
          for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy; if (!map[ny][nx] && dist[ny][nx] < 0) { dist[ny][nx] = dist[y][x] + 1; q.push([nx, ny]); } }
        }
        // the exit is a wall block next to the farthest cell
        const [ex, ey] = far;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (map[ey + dy][ex + dx]) { map[ey + dy][ex + dx] = 9; break; }
        px = 1.5; py = 1.5; ang = map[1][2] ? Math.PI / 2 : 0;
        things = [];
        const spots = floor.filter(([x, y]) => dist[y][x] > 4).sort(() => Math.random() - 0.5);
        const monsters = 3 + level * 2;
        spots.slice(0, monsters).forEach(([x, y], i) => things.push({ kind: 'm', x: x + 0.5, y: y + 0.5, hp: level > 2 && i % 3 === 0 ? 3 : 2, cool: 0, hit: 0, tough: level > 2 && i % 3 === 0 }));
        spots.slice(monsters, monsters + 2).forEach(([x, y]) => things.push({ kind: 'h', x: x + 0.5, y: y + 0.5 }));
        spots.slice(monsters + 2, monsters + 4).forEach(([x, y]) => things.push({ kind: 'a', x: x + 0.5, y: y + 0.5 }));
      }
      buildLevel();

      const wall = (x, y) => (x < 0 || y < 0 || x >= size || y >= size) ? 1 : map[Math.floor(y)][Math.floor(x)];
      const free = (x, y) => !wall(x - 0.2, y - 0.2) && !wall(x + 0.2, y - 0.2) && !wall(x - 0.2, y + 0.2) && !wall(x + 0.2, y + 0.2);
      function move(dx, dy, who) {
        if (free(who.x + dx, who.y)) who.x += dx;
        if (free(who.x, who.y + dy)) who.y += dy;
      }
      function sight(ax, ay, bx, by) { // true when nothing blocks the line
        const d = Math.hypot(bx - ax, by - ay), n = Math.ceil(d * 4);
        for (let i = 1; i < n; i++) if (wall(ax + (bx - ax) * i / n, ay + (by - ay) * i / n)) return false;
        return true;
      }
      // quantised shading keeps the colour count (and the Bluetooth message) small
      const shade = (c, k) => { k = Math.round(Math.max(0.12, Math.min(1, k)) * 8) / 8; return [c[0] * k | 0, c[1] * k | 0, c[2] * k | 0]; };
      const WALLS = { 1: [170, 90, 60], 2: [90, 110, 170], 3: [130, 130, 130], 9: [40, 255, 90] };

      g.tick = (inp, rgb) => {
        t++;
        const h = inp.held, me = { x: px, y: py };
        if (h.left) ang -= 0.13;
        if (h.right) ang += 0.13;
        const dx = Math.cos(ang), dy = Math.sin(ang);
        const sp = 0.12;
        if (h.up) move(dx * sp, dy * sp, me);
        if (h.down) move(-dx * sp * 0.7, -dy * sp * 0.7, me);
        if (h.sl) move(dy * sp * 0.8, -dx * sp * 0.8, me);
        if (h.sr) move(-dy * sp * 0.8, dx * sp * 0.8, me);
        px = me.x; py = me.y;

        // reached the exit?
        if (wall(px + dx * 0.45, py + dy * 0.45) === 9 || [[0.4, 0], [-0.4, 0], [0, 0.4], [0, -0.4]].some(([ox, oy]) => wall(px + ox, py + oy) === 9)) {
          g.score += 50 + Math.floor(hp / 2); fx(g, 'level'); buildLevel(); return g.tick({ held: {}, pressed: new Set() }, rgb);
        }

        // --- raycast walls, one ray per screen column ---
        const plane = 0.66, zbuf = new Array(N);
        rgb.fill(0);
        for (let y = 0; y < VIEW; y++) {
          const k = Math.abs(y - (VIEW - 1) / 2) / (VIEW / 2);
          const c = y < VIEW / 2 ? shade([60, 50, 90], 0.25 + k * 0.5) : shade([80, 70, 55], 0.25 + k * 0.7);
          for (let x = 0; x < N; x++) set(rgb, x, y, c);
        }
        for (let col = 0; col < N; col++) {
          const cam = 2 * (col + 0.5) / N - 1;
          const rx = dx - dy * plane * cam, ry = dy + dx * plane * cam;
          let mx = Math.floor(px), my = Math.floor(py);
          const ddx = Math.abs(1 / rx), ddy = Math.abs(1 / ry);
          const stx = rx < 0 ? -1 : 1, sty = ry < 0 ? -1 : 1;
          let sdx = (rx < 0 ? px - mx : mx + 1 - px) * ddx, sdy = (ry < 0 ? py - my : my + 1 - py) * ddy, side = 0, hit = 0;
          for (let i = 0; i < 64 && !hit; i++) {
            if (sdx < sdy) { sdx += ddx; mx += stx; side = 0; } else { sdy += ddy; my += sty; side = 1; }
            hit = wall(mx, my);
          }
          const dist = Math.max(0.05, side ? sdy - ddy : sdx - ddx);
          zbuf[col] = dist;
          const hgt = VIEW / dist, top = (VIEW - hgt) / 2, bot = top + hgt;
          let base = WALLS[hit] || WALLS[1];
          if (hit === 9) base = t % 10 < 5 ? [40, 255, 90] : [20, 180, 60];
          const c = shade(base, (side ? 0.75 : 1) * (1.1 - dist / 9));
          for (let y = Math.max(0, Math.floor(top)); y < Math.min(VIEW, Math.ceil(bot)); y++) {
            const cover = Math.min(y + 1, bot) - Math.max(y, top); // soft top/bottom edge
            blend(rgb, col, y, c, cover);
          }
        }

        // --- monsters ---
        for (const m of things) {
          if (m.kind !== 'm' || m.hp <= 0) continue;
          if (m.hit) m.hit--;
          const d = Math.hypot(px - m.x, py - m.y);
          if (d < 7 && sight(m.x, m.y, px, py)) {
            if (d > 0.7) move((px - m.x) / d * 0.045, (py - m.y) / d * 0.045, m);
            else if (!m.cool) { hp -= m.tough ? 12 : 8; m.cool = 12; hurtFlash = 4; navigator.vibrate?.(60); fx(g, 'hurt'); }
          }
          if (m.cool) m.cool--;
        }
        if (hp <= 0) { g.over = true; return; }

        // --- pickups ---
        for (const it of things) {
          if (it.kind === 'm' || it.taken) continue;
          if (Math.hypot(px - it.x, py - it.y) < 0.5) { it.taken = true; if (it.kind === 'h') hp = Math.min(100, hp + 30); else ammo += 12; fx(g, 'pickup'); }
        }

        // --- shooting ---
        if (cool) cool--;
        if ((inp.pressed.has('a') || h.a) && !cool) {
          cool = 4;
          if (ammo > 0) {
            ammo--; flash = 2; fx(g, 'shoot');
            let best = null, bestD = Math.max(zbuf[7], zbuf[8]);
            for (const m of things) {
              if (m.kind !== 'm' || m.hp <= 0) continue;
              const rx = m.x - px, ry = m.y - py;
              const depth = rx * dx + ry * dy, lateral = -rx * dy + ry * dx;
              if (depth > 0.2 && Math.abs(lateral) < 0.35 && depth < bestD + 0.3 && sight(px, py, m.x, m.y)) { best = m; bestD = depth; }
            }
            if (best) { best.hp--; best.hit = 3; fx(g, 'hit'); if (best.hp <= 0) { kills++; g.score += best.tough ? 20 : 10; fx(g, 'boom'); } }
          } else fx(g, 'click');
        }

        // --- draw sprites (far to near) ---
        const visible = things.filter(o => (o.kind === 'm' ? o.hp > 0 : !o.taken)).map(o => {
          const rx = o.x - px, ry = o.y - py;
          return { o, tx: (-dy * rx + dx * ry), ty: dx * rx + dy * ry };
        }).filter(s => s.ty > 0.15).sort((a, b) => b.ty - a.ty);
        for (const s of visible) {
          const sxc = (N / 2) * (1 + s.tx / (s.ty * plane));
          const big = s.o.kind === 'm' ? 0.8 : 0.35;
          const hS = VIEW / s.ty * big, wS = hS * (s.o.kind === 'm' ? 0.7 : 1);
          const floorY = (VIEW + VIEW / s.ty) / 2;
          const top = floorY - hS, left = sxc - wS / 2;
          const light = Math.max(0.25, 1.1 - s.ty / 8);
          for (let x = Math.floor(left); x < Math.ceil(left + wS); x++) {
            if (x < 0 || x >= N || zbuf[x] < s.ty) continue;
            for (let y = Math.floor(top); y < Math.ceil(floorY); y++) {
              if (y < 0 || y >= VIEW) continue;
              const u = (x + 0.5 - left) / wS, v = (y + 0.5 - top) / hS;
              let c = null;
              if (s.o.kind === 'm') {
                if (u < 0.12 || u > 0.88 || (v > 0.85 && u > 0.35 && u < 0.65)) continue; // rounded body with two legs
                c = s.o.hit ? [255, 255, 255] : s.o.tough ? [150, 60, 220] : [220, 40, 50];
                if (v > 0.2 && v < 0.38 && (Math.abs(u - 0.32) < 0.12 || Math.abs(u - 0.68) < 0.12)) c = [255, 230, 60]; // eyes
              } else {
                c = s.o.kind === 'h' ? [255, 90, 160] : [255, 210, 40];
              }
              const cover = Math.min(1, Math.min(x + 1, left + wS) - Math.max(x, left)) * Math.min(1, Math.min(y + 1, floorY) - Math.max(y, top));
              blend(rgb, x, y, shade(c, light), Math.max(0.35, cover));
            }
          }
        }

        // --- gun, flashes, HUD ---
        const bob = (h.up || h.down) && t % 6 < 3 ? 1 : 0;
        set(rgb, 7, 13 + bob, [150, 150, 160]); set(rgb, 8, 13 + bob, [110, 110, 120]);
        set(rgb, 7, 14, [90, 90, 100]); set(rgb, 8, 14, [70, 70, 80]);
        if (flash) { flash--; set(rgb, 7, 12, [255, 240, 120]); set(rgb, 8, 12, [255, 200, 60]); set(rgb, 7, 11, [255, 255, 200]); }
        if (hurtFlash) { hurtFlash--; for (let i = 0; i < N * VIEW; i++) rgb[i * 3] = Math.min(255, rgb[i * 3] + 110); }
        for (let x = 0; x < N; x++) set(rgb, x, 15, [12, 12, 16]);
        const hpBar = Math.ceil(hp / 100 * 8);
        for (let x = 0; x < hpBar; x++) set(rgb, x, 15, hp > 35 ? [60, 220, 90] : [255, 60, 60]);
        const ammoBar = Math.min(7, Math.ceil(ammo / 4));
        for (let x = 0; x < ammoBar; x++) set(rgb, 15 - x, 15, ammo ? [255, 210, 40] : [80, 60, 20]);
        if (banner > 0) { banner--; if (banner > 10) { for (let x = 0; x < N; x++) for (let y = 4; y < 11; y++) blend(rgb, x, y, [0, 0, 0], 0.7); drawNumber(rgb, level, 5, [40, 255, 90]); } }
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
        if (hit) { hit.alive = false; vy = -vy; g.score++; fx(g, 'brick'); }
        if (bricks.every(b => !b.alive)) { level++; fx(g, 'level'); build(); bx = 7.5; by = 12; vy = -0.45 - level * 0.05; }
        if (by >= 14 && vy > 0) {
          if (bx >= px - 0.5 && bx <= px + 4.5) { vy = -Math.abs(vy); vx = (bx - (px + 2)) * 0.2 || 0.15; by = 14; fx(g, 'bounce'); }
          else if (by > 15.5) { lives--; fx(g, 'hurt'); if (!lives) { g.over = true; return; } bx = px + 2; by = 13; vy = -0.45; }
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
