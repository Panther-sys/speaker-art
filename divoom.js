// Divoom Tivoo protocol (Bluetooth Classic SPP / RFCOMM).
// Based on the community reverse-engineered protocol used by
// github.com/d03n3rfr1tz3/hass-divoom and RomRider/node-divoom-timebox-evo.
//
// Message:  0x01 | lenLo lenHi | cmd | args... | sumLo sumHi | 0x02
//   len = args.length + 3, sum = sum of (len bytes + cmd + args)
// The Tivoo does not need the old 0x01/0x02/0x03 escaping.

export const SIZE = 16;
export const CHUNK = 200;
export const MAX_FRAMES = 60;
export const SPP_UUID = '00001101-0000-1000-8000-00805f9b34fb';

export const CMD = {
  volume: 0x08,
  playstate: 0x0a,
  datetime: 0x18,
  timeType: 0x2d,
  image: 0x44,
  view: 0x45,
  getView: 0x46,
  animFrame: 0x49,
  tool: 0x72,
  brightness: 0x74,
  game: 0xa0,
};

export function message(cmd, args = [], escape = false) {
  const len = args.length + 3;
  const payload = [len & 0xff, (len >> 8) & 0xff, cmd, ...args];
  let sum = 0;
  for (const b of payload) sum += b;
  const body = [...payload, sum & 0xff, (sum >> 8) & 0xff];
  if (sum >= 0xffff) body.push((sum >> 16) & 0xff, (sum >> 24) & 0xff);
  const out = escape ? escapeBytes(body) : body;
  return Uint8Array.from([0x01, ...out, 0x02]);
}

function escapeBytes(bytes) {
  const out = [];
  for (const b of bytes) {
    if (b >= 0x01 && b <= 0x03) out.push(0x03, b + 0x03);
    else out.push(b);
  }
  return out;
}

// ---------- colour quantisation ----------
// rgb: Uint8Array/Array of SIZE*SIZE*3. Returns {palette:[[r,g,b]...], index:Uint8Array}
export function quantize(rgb, maxColors = 256) {
  const n = rgb.length / 3;
  const map = new Map();
  const index = new Uint8Array(n);
  const palette = [];
  let exact = true;
  for (let i = 0; i < n; i++) {
    const key = (rgb[i * 3] << 16) | (rgb[i * 3 + 1] << 8) | rgb[i * 3 + 2];
    let idx = map.get(key);
    if (idx === undefined) {
      if (palette.length >= maxColors) { exact = false; break; }
      idx = palette.length;
      map.set(key, idx);
      palette.push([rgb[i * 3], rgb[i * 3 + 1], rgb[i * 3 + 2]]);
    }
    index[i] = idx;
  }
  if (exact) return { palette, index };
  return medianCut(rgb, maxColors);
}

function medianCut(rgb, maxColors) {
  const n = rgb.length / 3;
  let boxes = [Array.from({ length: n }, (_, i) => i)];
  const range = (box, c) => {
    let lo = 255, hi = 0;
    for (const i of box) { const v = rgb[i * 3 + c]; if (v < lo) lo = v; if (v > hi) hi = v; }
    return hi - lo;
  };
  while (boxes.length < maxColors) {
    let best = -1, bestRange = 0, bestC = 0;
    boxes.forEach((box, bi) => {
      if (box.length < 2) return;
      for (let c = 0; c < 3; c++) {
        const r = range(box, c);
        if (r > bestRange) { bestRange = r; best = bi; bestC = c; }
      }
    });
    if (best < 0) break;
    const box = boxes[best].sort((a, b) => rgb[a * 3 + bestC] - rgb[b * 3 + bestC]);
    const mid = box.length >> 1;
    boxes.splice(best, 1, box.slice(0, mid), box.slice(mid));
  }
  const palette = [];
  const index = new Uint8Array(n);
  boxes.forEach((box, bi) => {
    let r = 0, g = 0, b = 0;
    for (const i of box) { r += rgb[i * 3]; g += rgb[i * 3 + 1]; b += rgb[i * 3 + 2]; index[i] = bi; }
    const k = box.length || 1;
    palette.push([Math.round(r / k), Math.round(g / k), Math.round(b / k)]);
  });
  return { palette, index };
}

// ---------- frame encoding ----------
// Returns the frame bytes: 0xAA lenLo lenHi timeLo timeHi 0x00 colorCount palette... pixels...
export function encodeFrame(rgb, timeMs = 0, maxColors = 256) {
  const { palette, index } = quantize(rgb, maxColors);
  const count = palette.length;
  let bits = Math.ceil(Math.log2(count));
  if (!bits) bits = 1;
  const data = [timeMs & 0xff, (timeMs >> 8) & 0xff, 0x00, count >= 256 ? 0 : count];
  for (const c of palette) data.push(c[0], c[1], c[2]);
  let acc = 0, nbits = 0;
  const mask = (1 << bits) - 1;
  for (let i = 0; i < index.length; i++) {
    acc |= (index[i] & mask) << nbits;
    nbits += bits;
    while (nbits >= 8) { data.push(acc & 0xff); acc >>>= 8; nbits -= 8; }
  }
  if (nbits > 0) data.push(acc & 0xff);
  const len = data.length + 3;
  return [0xaa, len & 0xff, (len >> 8) & 0xff, ...data];
}

// A still image: one 0x44 message.
// Very colourful images can push the checksum past 16 bits, which 16x16 devices
// don't expect, so those are re-encoded with fewer colours until it fits.
export function imageMessages(rgb) {
  for (let colors = 256; ; colors >>= 1) {
    const args = [0x00, 0x0a, 0x0a, 0x04, ...encodeFrame(rgb, 0, colors)];
    const sum = args.reduce((a, v) => a + v, CMD.image + args.length + 3);
    if (sum < 0xffff || colors <= 16) return [message(CMD.image, args)];
  }
}

// An animation the Tivoo loops by itself: frames = [{rgb, time}], sent as 0x49 chunks.
export function animationMessages(frames, { maxColors = 256 } = {}) {
  if (frames.length === 1) return imageMessages(frames[0].rgb);
  frames = thin(frames, MAX_FRAMES);
  let encoded;
  // keep reducing colours / frames until it fits the 8-bit chunk index and 16-bit size
  for (let colors = maxColors; ; ) {
    encoded = frames.map(f => encodeFrame(f.rgb, Math.min(0xffff, Math.max(1, f.time | 0)), colors));
    const total = encoded.reduce((s, f) => s + f.length, 0);
    if (total < 0xffff && Math.ceil(total / CHUNK) <= 256) break;
    if (colors > 16) colors = Math.max(16, colors >> 1);
    else if (frames.length > 2) frames = thin(frames, frames.length - 4);
    else break;
  }
  const all = encoded.flat();
  const total = all.length;
  const out = [];
  for (let i = 0, idx = 0; i < total; i += CHUNK, idx++) {
    out.push(message(CMD.animFrame, [total & 0xff, (total >> 8) & 0xff, idx, ...all.slice(i, i + CHUNK)]));
  }
  return out;
}

// Keep `keep` frames spread evenly; each kept frame lasts as long as those it replaces.
export function thin(frames, keep) {
  if (frames.length <= keep) return frames;
  const picks = Array.from({ length: keep }, (_, i) => Math.floor(i * frames.length / keep));
  picks.push(frames.length);
  const out = [];
  for (let i = 0; i < keep; i++) {
    let t = 0;
    for (let j = picks[i]; j < picks[i + 1]; j++) t += frames[j].time;
    out.push({ rgb: frames[picks[i]].rgb, time: Math.min(0xffff, t) });
  }
  return out;
}

// ---------- simple commands ----------
const b = v => (v ? 1 : 0);
export const cmd = {
  brightness: v => message(CMD.brightness, [clamp(v, 0, 100)]),
  volume: pct => message(CMD.volume, [Math.round(clamp(pct, 0, 100) * 15 / 100)]),
  play: on => message(CMD.playstate, [b(on)]),
  datetime: (d = new Date()) => message(CMD.datetime, [
    d.getFullYear() % 100, Math.floor(d.getFullYear() / 100), d.getMonth() + 1, d.getDate(),
    d.getHours(), d.getMinutes(), d.getSeconds(), d.getDay(),
  ]),
  timeType: h24 => message(CMD.timeType, [b(h24)]),
  clock: ({ style = 0, h24 = true, weather = false, temp = false, calendar = false, color = null }) =>
    message(CMD.view, [0x00, b(h24), style, 0x01, b(weather), b(temp), b(calendar), ...(color ? color : [])]),
  light: ({ color = [255, 255, 255], brightness = 100, effect = 0, power = true }) =>
    message(CMD.view, [0x01, ...color, clamp(brightness, 0, 100), effect, b(power), 0, 0, 0]),
  effects: n => message(CMD.view, [0x03, n & 0xff]),
  visualization: n => message(CMD.view, [0x04, n & 0xff]),
  design: () => message(CMD.view, [0x05]),
  lyrics: () => message(CMD.view, [0x06, 0, 0, 0]),
  scoreboard: (red, blue) => message(CMD.tool, [0x01, 0x01, red & 0xff, (red >> 8) & 0xff, blue & 0xff, (blue >> 8) & 0xff]),
  stopwatch: on => message(CMD.tool, [0x00, on ? 1 : 0]),
  noise: on => message(CMD.tool, [0x02, on ? 1 : 2]),
  countdown: (on, mm = 0, ss = 0) => message(CMD.tool, [0x03, b(on), mm, ss]),
  off: () => message(CMD.view, [0x01, 1, 1, 1, 0, 0, 0, 0, 0, 0]),
  on: () => message(CMD.view, [0x01, 1, 1, 1, 100, 0, 1, 0, 0, 0]),
  getView: () => message(CMD.getView, []),
  game: n => message(CMD.game, n == null ? [0, 0] : [1, n & 0xff]),
  gameKey: key => {
    const k = { go: 0, left: 1, right: 2, up: 3, down: 4, ok: 5 }[key];
    if (!k) return [message(0x88, [])];
    return [message(0x17, [k]), message(0x21, [k])];
  },
};

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, Math.round(v))); }
