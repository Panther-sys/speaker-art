// Generated 16x16 animations. Each effect: { name, emoji, frameMs, loopFrames, make() -> (t, rgb) }.
// t is the frame number; rgb is a Uint8Array(16*16*3) to fill.
const N = 16;

function hsv(h, s, v) {
  h = ((h % 1) + 1) % 1;
  const i = Math.floor(h * 6), f = h * 6 - i;
  const p = v * (1 - s), q = v * (1 - f * s), t = v * (1 - (1 - f) * s);
  const [r, g, b] = [[v, t, p], [q, v, p], [p, v, t], [p, q, v], [t, p, v], [v, p, q]][i % 6];
  return [r * 255 | 0, g * 255 | 0, b * 255 | 0];
}
function set(rgb, x, y, c) {
  if (x < 0 || y < 0 || x >= N || y >= N) return;
  const i = (y * N + x) * 3;
  rgb[i] = c[0]; rgb[i + 1] = c[1]; rgb[i + 2] = c[2];
}
function rng(seed) {
  return () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
}

export const EFFECTS = [
  {
    name: 'Fire', emoji: '🔥', frameMs: 70, loopFrames: 60,
    make() {
      const heat = new Float32Array(N * (N + 2));
      const rand = rng(7);
      const pal = v => {
        v = Math.max(0, Math.min(1, v));
        return [Math.min(255, v * 3 * 255) | 0, Math.max(0, Math.min(255, (v * 3 - 1) * 255)) | 0, Math.max(0, Math.min(255, (v * 3 - 2) * 255)) | 0];
      };
      return (t, rgb) => {
        for (let x = 0; x < N; x++) heat[(N + 1) * N + x] = heat[N * N + x] = 0.6 + rand() * 0.5;
        for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
          const below = heat[(y + 1) * N + x], b2 = heat[(y + 2) * N + x];
          const l = heat[(y + 1) * N + Math.max(0, x - 1)], r = heat[(y + 1) * N + Math.min(N - 1, x + 1)];
          heat[y * N + x] = Math.max(0, (below + b2 + l + r) / 4.15 - rand() * 0.04);
        }
        for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) set(rgb, x, y, pal(heat[y * N + x]));
      };
    },
  },
  {
    name: 'Plasma', emoji: '🌈', frameMs: 60, loopFrames: 60,
    make() {
      return (t, rgb) => {
        const a = t / 60 * Math.PI * 2;
        for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
          const v = Math.sin(x / 2.5 + a) + Math.sin((y + x) / 4 + a) + Math.sin(Math.hypot(x - 8, y - 8) / 2 - a);
          set(rgb, x, y, hsv(v / 6 + t / 60, 1, 1));
        }
      };
    },
  },
  {
    name: 'Matrix', emoji: '💚', frameMs: 80, loopFrames: 60,
    make() {
      const rand = rng(3);
      const drops = Array.from({ length: N }, () => ({ y: rand() * N * 2 - N, v: 0.3 + rand() * 0.5, len: 4 + rand() * 6 | 0 }));
      return (t, rgb) => {
        rgb.fill(0);
        drops.forEach((d, x) => {
          d.y += d.v;
          if (d.y - d.len > N) { d.y = -rand() * 8; d.v = 0.3 + rand() * 0.5; }
          for (let k = 0; k < d.len; k++) {
            const y = Math.floor(d.y) - k;
            const f = 1 - k / d.len;
            set(rgb, x, y, k === 0 ? [180, 255, 180] : [0, 255 * f * f | 0, 40 * f | 0]);
          }
        });
      };
    },
  },
  {
    name: 'Starfield', emoji: '✨', frameMs: 50, loopFrames: 60,
    make() {
      const rand = rng(11);
      const stars = Array.from({ length: 40 }, () => ({ x: rand() * 2 - 1, y: rand() * 2 - 1, z: rand() }));
      return (t, rgb) => {
        rgb.fill(0);
        for (const s of stars) {
          s.z -= 0.02;
          if (s.z <= 0.02) { s.x = rand() * 2 - 1; s.y = rand() * 2 - 1; s.z = 1; }
          const px = Math.round(7.5 + s.x / s.z * 4), py = Math.round(7.5 + s.y / s.z * 4);
          const v = Math.min(255, (1 - s.z) * 320) | 0;
          set(rgb, px, py, [v, v, Math.min(255, v + 40)]);
        }
      };
    },
  },
  {
    name: 'Rainbow swirl', emoji: '🌀', frameMs: 50, loopFrames: 60,
    make() {
      return (t, rgb) => {
        for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
          const ang = Math.atan2(y - 7.5, x - 7.5) / (Math.PI * 2);
          const d = Math.hypot(x - 7.5, y - 7.5) / 12;
          set(rgb, x, y, hsv(ang + d - t / 60, 1, 1));
        }
      };
    },
  },
  {
    name: 'Game of Life', emoji: '🧬', frameMs: 150, loopFrames: 60,
    make() {
      const rand = rng(Date.now() & 0xffff);
      let g = new Uint8Array(N * N).map(() => rand() < 0.35 ? 1 : 0);
      let age = new Uint16Array(N * N);
      let stale = 0;
      return (t, rgb) => {
        const n = new Uint8Array(N * N);
        let changed = 0;
        for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
          let c = 0;
          for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++)
            if (dx || dy) c += g[((y + dy + N) % N) * N + (x + dx + N) % N];
          const i = y * N + x;
          n[i] = c === 3 || (c === 2 && g[i]) ? 1 : 0;
          if (n[i] !== g[i]) changed++;
          age[i] = n[i] ? age[i] + 1 : 0;
        }
        stale = changed < 3 ? stale + 1 : 0;
        g = n;
        if (stale > 8) { g = g.map(() => rand() < 0.35 ? 1 : 0); stale = 0; }
        for (let i = 0; i < N * N; i++) set(rgb, i % N, i / N | 0, g[i] ? hsv(0.33 - Math.min(age[i], 20) / 60, 1, 1) : [0, 0, 0]);
      };
    },
  },
  {
    name: 'Bouncing balls', emoji: '🏀', frameMs: 50, loopFrames: 60,
    make() {
      const rand = rng(5);
      const balls = Array.from({ length: 4 }, (_, i) => ({ x: rand() * 14, y: rand() * 8, vx: (rand() - .5) * .8, vy: 0, c: hsv(i / 4, 1, 1) }));
      const trail = new Float32Array(N * N * 3);
      return (t, rgb) => {
        for (let i = 0; i < trail.length; i++) trail[i] *= 0.6;
        for (const b of balls) {
          b.vy += 0.08; b.x += b.vx; b.y += b.vy;
          if (b.y > 15) { b.y = 15; b.vy = -Math.abs(b.vy) * 0.98; if (Math.abs(b.vy) < 0.5) b.vy = -1.6; }
          if (b.x < 0 || b.x > 15) { b.vx = -b.vx; b.x = Math.max(0, Math.min(15, b.x)); }
          const i = (Math.round(b.y) * N + Math.round(b.x)) * 3;
          trail[i] = b.c[0]; trail[i + 1] = b.c[1]; trail[i + 2] = b.c[2];
        }
        for (let i = 0; i < rgb.length; i++) rgb[i] = trail[i] | 0;
      };
    },
  },
  {
    name: 'Heartbeat', emoji: '❤️', frameMs: 60, loopFrames: 30,
    make() {
      const heart = [
        '..XXX...XXX.....', '.XXXXX.XXXXX....', 'XXXXXXXXXXXXX...', 'XXXXXXXXXXXXX...',
        'XXXXXXXXXXXXX...', '.XXXXXXXXXXX....', '..XXXXXXXXX.....', '...XXXXXXX......',
        '....XXXXX.......', '.....XXX........', '......X.........',
      ];
      return (t, rgb) => {
        const beat = t % 30;
        const s = 1 + 0.18 * Math.max(Math.exp(-((beat - 3) ** 2) / 4), 0.6 * Math.exp(-((beat - 9) ** 2) / 4));
        rgb.fill(0);
        for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
          const hx = Math.round((x - 7.5) / s + 6), hy = Math.round((y - 8) / s + 5);
          if (heart[hy] && heart[hy][hx] === 'X') set(rgb, x, y, [255, 30 + (hy * 6), 60]);
        }
      };
    },
  },
  {
    name: 'Sparkles', emoji: '🎆', frameMs: 60, loopFrames: 60,
    make() {
      const rand = rng(9);
      const buf = new Float32Array(N * N * 3);
      return (t, rgb) => {
        for (let i = 0; i < buf.length; i++) buf[i] *= 0.82;
        for (let k = 0; k < 4; k++) {
          const i = (rand() * N * N | 0) * 3, c = hsv(rand(), 0.6, 1);
          buf[i] = c[0]; buf[i + 1] = c[1]; buf[i + 2] = c[2];
        }
        for (let i = 0; i < rgb.length; i++) rgb[i] = buf[i] | 0;
      };
    },
  },
  {
    name: 'Pixel clock', emoji: '🕒', frameMs: 1000, loopFrames: 0, liveOnly: true,
    make() {
      const D = { 0: '111101101101111', 1: '010110010010111', 2: '111001111100111', 3: '111001111001111', 4: '101101111001001', 5: '111100111001111', 6: '111100111101111', 7: '111001010010010', 8: '111101111101111', 9: '111101111001111' };
      const digit = (rgb, d, ox, oy, c) => { const p = D[d]; for (let i = 0; i < 15; i++) if (p[i] === '1') set(rgb, ox + i % 3, oy + (i / 3 | 0), c); };
      return (t, rgb) => {
        const now = new Date(), h = now.getHours(), m = now.getMinutes(), s = now.getSeconds();
        rgb.fill(0);
        const hue = (h * 60 + m) / 1440;
        digit(rgb, h / 10 | 0, 0, 2, hsv(hue, .8, 1)); digit(rgb, h % 10, 4, 2, hsv(hue, .8, 1));
        digit(rgb, m / 10 | 0, 9, 2, hsv(hue + .5, .8, 1)); digit(rgb, m % 10, 13, 2, hsv(hue + .5, .8, 1));
        if (s % 2) { set(rgb, 7, 3, [255, 255, 255]); set(rgb, 7, 5, [255, 255, 255]); }
        for (let i = 0; i < 16; i++) set(rgb, i, 12, i < (s / 60 * 16) ? hsv(i / 16, 1, .9) : [20, 20, 20]);
        for (let i = 0; i < 16; i++) set(rgb, i, 14, [40, 40, 60]);
        set(rgb, now.getDay() * 2 + 1, 14, [255, 200, 0]);
      };
    },
  },
];

// Render `count` frames of an effect into [{rgb, time}].
export function renderFrames(effect, count = effect.loopFrames || 60) {
  const draw = effect.make();
  const frames = [];
  for (let t = 0; t < count; t++) {
    const rgb = new Uint8Array(N * N * 3);
    draw(t, rgb);
    frames.push({ rgb, time: effect.frameMs });
  }
  return frames;
}
