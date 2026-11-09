import * as D from './divoom.js';
import { EFFECTS, renderFrames } from './effects.js';

const $ = id => document.getElementById(id);
const N = 16;
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ---------------- connection ----------------
class Tivoo {
  constructor() { this.port = null; this.writer = null; this.busy = false; this.escape = false; this.queue = Promise.resolve(); }
  get connected() { return !!this.writer; }

  async connect(showAll = false) {
    if (!('serial' in navigator)) throw new Error('Web Serial is not available in this browser.');
    const opts = { allowedBluetoothServiceClassIds: [D.SPP_UUID] };
    if (!showAll) opts.filters = [{ bluetoothServiceClassId: D.SPP_UUID }];
    this.port = await navigator.serial.requestPort(opts);
    await this.port.open({ baudRate: 115200 });
    this.writer = this.port.writable.getWriter();
    this.readLoop();
  }

  async readLoop() {
    // Drain whatever the Tivoo answers so its buffer never fills up.
    try {
      while (this.port && this.port.readable) {
        const reader = this.port.readable.getReader();
        this.reader = reader;
        try { while (true) { const { done } = await reader.read(); if (done) break; } }
        finally { reader.releaseLock(); }
      }
    } catch (e) { /* port closed */ }
  }

  async disconnect() {
    try { await this.reader?.cancel(); } catch {}
    try { this.writer?.releaseLock(); } catch {}
    try { await this.port?.close(); } catch {}
    this.port = this.writer = this.reader = null;
  }

  // Queue messages so they are written one after another.
  send(msgs, { gap = 0, onProgress } = {}) {
    if (!Array.isArray(msgs)) msgs = [msgs];
    const job = this.queue.then(async () => {
      if (!this.writer) return;
      this.busy = true; ui.dot();
      try {
        for (let i = 0; i < msgs.length; i++) {
          let m = msgs[i];
          if (this.escape) m = reescape(m);
          await this.writer.write(m);
          onProgress?.((i + 1) / msgs.length);
          if (gap) await sleep(gap);
        }
      } finally { this.busy = false; ui.dot(); }
    });
    this.queue = job.catch(e => ui.error(e));
    return job;
  }
}

// Turn an unescaped message into the old escaped form (for very old firmware).
function reescape(m) {
  const out = [0x01];
  for (let i = 1; i < m.length - 1; i++) { const b = m[i]; if (b >= 1 && b <= 3) out.push(3, b + 3); else out.push(b); }
  out.push(0x02);
  return Uint8Array.from(out);
}

const tivoo = new Tivoo();

// ---------------- UI helpers ----------------
const ui = {
  status(msg) { const s = $('status'); s.textContent = msg; s.classList.remove('err'); },
  error(e) { console.error(e); const s = $('status'); s.textContent = (e && e.message) || String(e); s.classList.add('err'); },
  dot() { const d = $('dot'); d.className = 'dot' + (tivoo.connected ? (tivoo.busy ? ' busy' : ' on') : ''); },
  progress(f) { $('prog').style.width = (f * 100).toFixed(0) + '%'; if (f >= 1) setTimeout(() => $('prog').style.width = '0', 600); },
};

// ---------------- LED preview + player ----------------
const pv = $('preview').getContext('2d');
function drawLeds(rgb) {
  const W = $('preview').width, c = W / N;
  pv.fillStyle = '#050608'; pv.fillRect(0, 0, W, W);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const i = (y * N + x) * 3, r = rgb[i], g = rgb[i + 1], b = rgb[i + 2];
    pv.fillStyle = (r | g | b) ? `rgb(${r},${g},${b})` : '#121418';
    pv.beginPath(); pv.roundRect(x * c + 1.5, y * c + 1.5, c - 3, c - 3, 3); pv.fill();
  }
}

const player = {
  timer: null, live: false,
  stop() { clearTimeout(this.timer); this.timer = null; this.live = false; $('badge').textContent = 'preview'; liveButtons(); },
  // Loop a list of frames in the preview.
  loop(frames) {
    this.stop();
    let i = 0;
    const tick = () => { drawLeds(frames[i].rgb); const t = frames[i].time || 100; i = (i + 1) % frames.length; if (frames.length > 1) this.timer = setTimeout(tick, t); };
    tick();
  },
  // Generate frames forever; each frame is also pushed to the Tivoo when connected.
  stream(draw, frameMs, label) {
    this.stop();
    this.live = true;
    $('badge').textContent = tivoo.connected ? '● live on Tivoo' : 'live preview';
    liveButtons();
    let t = 0;
    const rgb = new Uint8Array(N * N * 3);
    const tick = async () => {
      if (!this.live) return;
      const start = performance.now();
      draw(t++, rgb);
      drawLeds(rgb);
      if (tivoo.connected && !tivoo.busy) tivoo.send(D.imageMessages(rgb));
      this.timer = setTimeout(tick, Math.max(frameMs, 90) - (performance.now() - start));
    };
    tick();
    ui.status(`Streaming ${label}. Tap Stop to end.`);
  },
};

function liveButtons() {
  $('fxLive').textContent = player.live && liveSource === 'fx' ? 'Stop' : 'Stream live';
  $('txtLive').textContent = player.live && liveSource === 'txt' ? 'Stop' : 'Stream live';
}
let liveSource = null;

async function upload(frames, what) {
  if (!tivoo.connected) { ui.status('Previewing only. Connect to send it to the Tivoo.'); return; }
  player.live = false;
  const msgs = D.animationMessages(frames);
  ui.status(`Sending ${what}…`);
  await tivoo.send(msgs, { gap: msgs.length > 1 ? 15 : 0, onProgress: ui.progress });
  ui.status(`${what[0].toUpperCase() + what.slice(1)} is on the Tivoo.`);
}

// ---------------- tabs ----------------
$('tabs').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  document.querySelectorAll('.tabs button').forEach(x => x.classList.toggle('active', x === b));
  document.querySelectorAll('section').forEach(s => s.classList.toggle('active', s.id === b.dataset.tab));
  if (b.dataset.tab === 'draw') { player.stop(); drawLeds(editor.px); }
});

// ---------------- connect ----------------
if (!('serial' in navigator)) $('noSerial').style.display = 'block';
async function doConnect(all) {
  if (tivoo.connected) { player.stop(); await tivoo.disconnect(); $('connectBtn').textContent = 'Connect'; ui.dot(); ui.status('Disconnected.'); return; }
  try {
    tivoo.escape = $('escapeOpt').checked;
    await tivoo.connect(all);
    $('connectBtn').textContent = 'Disconnect';
    ui.dot();
    ui.status('Connected to the Tivoo.');
    tivoo.send([D.cmd.datetime(), D.cmd.brightness(+$('bright').value)]);
  } catch (e) {
    if (e.name === 'NotFoundError') ui.status('No device picked. Is the Tivoo paired in Bluetooth settings? Try "Show all devices" under Controls → Connection help.');
    else ui.error(e);
    await tivoo.disconnect(); ui.dot();
  }
}
$('connectBtn').onclick = () => doConnect(false);
$('connectAll').onclick = () => doConnect(true);
navigator.serial?.addEventListener('disconnect', () => { tivoo.disconnect(); $('connectBtn').textContent = 'Connect'; ui.dot(); ui.status('The Tivoo disconnected.'); });

// ---------------- Fun ----------------
let fxSel = EFFECTS[0];
EFFECTS.forEach((fx, i) => {
  const b = document.createElement('button');
  b.className = 'fx' + (i === 0 ? ' sel' : '');
  b.innerHTML = `<b>${fx.emoji}</b>${fx.name}`;
  b.onclick = () => {
    fxSel = fx;
    document.querySelectorAll('.fx').forEach(x => x.classList.toggle('sel', x === b));
    if (player.live && liveSource === 'fx') { player.stream(fx.make(), fx.frameMs, fx.name); return; }
    previewFx();
  };
  $('fxGrid').appendChild(b);
});
function previewFx() {
  if (fxSel.liveOnly) return previewLiveOnly();
  player.loop(renderFrames(fxSel));
  $('fxSend').disabled = false;
}
function previewLiveOnly() {
  // live-only effects (the clock) preview with a 1s timer and can only be streamed
  const draw = fxSel.make(), rgb = new Uint8Array(N * N * 3);
  player.stop();
  const tick = () => { draw(0, rgb); drawLeds(rgb); player.timer = setTimeout(tick, 1000); };
  tick();
  $('fxSend').disabled = true;
  ui.status(`${fxSel.name} needs the app open, so use Stream live.`);
}
$('fxSend').onclick = () => { liveSource = null; const f = renderFrames(fxSel); player.loop(f); upload(f, fxSel.name.toLowerCase()); };
$('fxLive').onclick = () => {
  if (player.live && liveSource === 'fx') { player.stop(); previewFx(); ui.status('Stopped streaming.'); return; }
  liveSource = 'fx'; player.stream(fxSel.make(), fxSel.frameMs, fxSel.name);
};

// ---------------- Picture ----------------
let picFrames = null, picSource = null;
$('picFile').onchange = async e => {
  const file = e.target.files[0]; if (!file) return;
  try {
    ui.status('Loading picture…');
    picSource = await decodeImage(file);
    $('dropZone').firstChild.textContent = file.name + ' ';
    await renderPic();
  } catch (err) { ui.error(err); }
};
['picFit', 'picSmooth', 'picBoost'].forEach(id => $(id).addEventListener('input', () => picSource && renderPic()));

async function decodeImage(file) {
  const frames = [];
  if ('ImageDecoder' in window && /gif|webp|png|apng/.test(file.type)) {
    const dec = new ImageDecoder({ data: await file.arrayBuffer(), type: file.type });
    await dec.tracks.ready;
    const count = Math.min(dec.tracks.selectedTrack.frameCount, 300);
    for (let i = 0; i < count; i++) {
      const { image } = await dec.decode({ frameIndex: i });
      const bmp = await createImageBitmap(image);
      frames.push({ bmp, time: Math.round((image.duration || 100000) / 1000) || 100 });
      image.close();
    }
    dec.close();
  } else {
    frames.push({ bmp: await createImageBitmap(file), time: 0 });
  }
  return frames;
}

async function renderPic() {
  const fit = $('picFit').value, smooth = $('picSmooth').checked, boost = +$('picBoost').value / 100;
  const cv = new OffscreenCanvas(N, N), cx = cv.getContext('2d', { willReadFrequently: true });
  picFrames = picSource.map(({ bmp, time }) => {
    cx.fillStyle = '#000'; cx.fillRect(0, 0, N, N);
    cx.imageSmoothingEnabled = smooth; cx.imageSmoothingQuality = 'high';
    let w = bmp.width, h = bmp.height, dx = 0, dy = 0, dw = N, dh = N, sx = 0, sy = 0, sw = w, sh = h;
    if (fit === 'cover') { const s = Math.min(w, h); sx = (w - s) / 2; sy = (h - s) / 2; sw = sh = s; }
    if (fit === 'contain') { const s = N / Math.max(w, h); dw = Math.round(w * s); dh = Math.round(h * s); dx = (N - dw) >> 1; dy = (N - dh) >> 1; }
    cx.drawImage(bmp, sx, sy, sw, sh, dx, dy, dw, dh);
    const d = cx.getImageData(0, 0, N, N).data, rgb = new Uint8Array(N * N * 3);
    for (let i = 0; i < N * N; i++) {
      let r = d[i * 4], g = d[i * 4 + 1], b = d[i * 4 + 2];
      const a = d[i * 4 + 3] / 255; r *= a; g *= a; b *= a;
      if (boost) { const l = (r + g + b) / 3; r = l + (r - l) * (1 + boost * 1.5); g = l + (g - l) * (1 + boost * 1.5); b = l + (b - l) * (1 + boost * 1.5); }
      rgb[i * 3] = clamp(r); rgb[i * 3 + 1] = clamp(g); rgb[i * 3 + 2] = clamp(b);
    }
    return { rgb, time };
  });
  player.loop(picFrames);
  $('picSend').disabled = false;
  $('picInfo').textContent = picFrames.length > 1
    ? `Animated: ${picFrames.length} frames${picFrames.length > D.MAX_FRAMES ? ` (will be thinned to ${D.MAX_FRAMES} for the Tivoo)` : ''}.`
    : 'Still image.';
  ui.status('Preview ready.');
}
const clamp = v => Math.max(0, Math.min(255, Math.round(v)));
$('picSend').onclick = () => { liveSource = null; picFrames && (player.loop(picFrames), upload(picFrames, 'picture')); };

// ---------------- Text ----------------
// Classic 5x7 font, one byte per column, bit 0 = top row.
const FONT = {
  ' ': [0, 0, 0], '!': [0x5f], '"': [7, 0, 7], '#': [0x14, 0x7f, 0x14, 0x7f, 0x14], '$': [0x24, 0x2a, 0x7f, 0x2a, 0x12],
  '%': [0x23, 0x13, 8, 0x64, 0x62], "'": [5, 3], '(': [0x1c, 0x22, 0x41], ')': [0x41, 0x22, 0x1c], '*': [0x14, 8, 0x3e, 8, 0x14],
  '+': [8, 8, 0x3e, 8, 8], ',': [0x50, 0x30], '-': [8, 8, 8, 8], '.': [0x60, 0x60], '/': [0x20, 0x10, 8, 4, 2],
  '0': [0x3e, 0x51, 0x49, 0x45, 0x3e], '1': [0x42, 0x7f, 0x40], '2': [0x42, 0x61, 0x51, 0x49, 0x46], '3': [0x21, 0x41, 0x45, 0x4b, 0x31],
  '4': [0x18, 0x14, 0x12, 0x7f, 0x10], '5': [0x27, 0x45, 0x45, 0x45, 0x39], '6': [0x3c, 0x4a, 0x49, 0x49, 0x30], '7': [1, 0x71, 9, 5, 3],
  '8': [0x36, 0x49, 0x49, 0x49, 0x36], '9': [6, 0x49, 0x49, 0x29, 0x1e], ':': [0x36, 0x36], ';': [0x56, 0x36], '=': [0x14, 0x14, 0x14, 0x14],
  '?': [2, 1, 0x51, 9, 6], '@': [0x32, 0x49, 0x79, 0x41, 0x3e], '_': [0x40, 0x40, 0x40, 0x40], '<': [8, 0x14, 0x22, 0x41], '>': [0x41, 0x22, 0x14, 8],
  'A': [0x7c, 0x12, 0x11, 0x12, 0x7c], 'B': [0x7f, 0x49, 0x49, 0x49, 0x36], 'C': [0x3e, 0x41, 0x41, 0x41, 0x22], 'D': [0x7f, 0x41, 0x41, 0x22, 0x1c],
  'E': [0x7f, 0x49, 0x49, 0x49, 0x41], 'F': [0x7f, 9, 9, 9, 1], 'G': [0x3e, 0x41, 0x49, 0x49, 0x7a], 'H': [0x7f, 8, 8, 8, 0x7f],
  'I': [0x41, 0x7f, 0x41], 'J': [0x20, 0x40, 0x41, 0x3f, 1], 'K': [0x7f, 8, 0x14, 0x22, 0x41], 'L': [0x7f, 0x40, 0x40, 0x40, 0x40],
  'M': [0x7f, 2, 0xc, 2, 0x7f], 'N': [0x7f, 4, 8, 0x10, 0x7f], 'O': [0x3e, 0x41, 0x41, 0x41, 0x3e], 'P': [0x7f, 9, 9, 9, 6],
  'Q': [0x3e, 0x41, 0x51, 0x21, 0x5e], 'R': [0x7f, 9, 0x19, 0x29, 0x46], 'S': [0x46, 0x49, 0x49, 0x49, 0x31], 'T': [1, 1, 0x7f, 1, 1],
  'U': [0x3f, 0x40, 0x40, 0x40, 0x3f], 'V': [0x1f, 0x20, 0x40, 0x20, 0x1f], 'W': [0x3f, 0x40, 0x38, 0x40, 0x3f], 'X': [0x63, 0x14, 8, 0x14, 0x63],
  'Y': [7, 8, 0x70, 8, 7], 'Z': [0x61, 0x51, 0x49, 0x45, 0x43], '♥': [0xc, 0x1e, 0x3c, 0x1e, 0xc],
};

// Render text into a wide strip: returns {w, px(x,y)->[r,g,b]|null}
function textStrip(text) {
  const font = $('txtFont').value, fg = hex($('txtFg').value), rainbow = $('txtRainbow').checked;
  const cols = []; // each column: array of 16 colours or null
  const colorFor = i => rainbow ? hsv(i / Math.max(6, text.length)) : fg;
  if (font.startsWith('pixel')) {
    const s = font === 'pixel2' ? 2 : 1, top = s === 2 ? 1 : 4;
    [...text.replace(/<3/g, '♥')].forEach((ch, ci) => {
      const g = FONT[ch] || FONT[ch.toUpperCase()] || FONT['?'];
      const c = colorFor(ci);
      for (const col of [...g, 0]) for (let k = 0; k < s; k++) {
        const out = new Array(N).fill(null);
        for (let r = 0; r < 7; r++) if (col & (1 << r)) for (let q = 0; q < s; q++) out[top + r * s + q] = c;
        cols.push(out);
      }
    });
  } else {
    const cv = new OffscreenCanvas(text.length * 16 + 16, N), cx = cv.getContext('2d', { willReadFrequently: true });
    cx.font = font; cx.textBaseline = 'middle'; cx.fillStyle = '#fff';
    const w = Math.ceil(cx.measureText(text).width) + 2;
    let x = 0;
    [...text].forEach(ch => { cx.fillText(ch, x, 8.5); x += cx.measureText(ch).width; });
    const d = cx.getImageData(0, 0, w, N).data;
    let charIdx = 0, acc = 0, edges = [...text].map(ch => (acc += cx.measureText(ch).width));
    for (let xx = 0; xx < w; xx++) {
      while (charIdx < edges.length - 1 && xx >= edges[charIdx]) charIdx++;
      const out = new Array(N).fill(null);
      for (let y = 0; y < N; y++) if (d[(y * w + xx) * 4 + 3] > 110) out[y] = colorFor(charIdx);
      cols.push(out);
    }
  }
  return cols;
}

function textFramer() {
  const cols = textStrip($('txt').value || ' '), bg = hex($('txtBg').value);
  const total = cols.length + N; // scroll from off-right to off-left
  const frameAt = (off, rgb) => {
    for (let x = 0; x < N; x++) {
      const col = cols[off + x - N];
      for (let y = 0; y < N; y++) {
        const c = (col && col[y]) || bg, i = (y * N + x) * 3;
        rgb[i] = c[0]; rgb[i + 1] = c[1]; rgb[i + 2] = c[2];
      }
    }
  };
  return { total, frameAt };
}

function textFrames() {
  const { total, frameAt } = textFramer(), speed = 220 - +$('txtSpeed').value;
  const step = Math.max(1, Math.ceil(total / D.MAX_FRAMES));
  const frames = [];
  for (let off = 0; off < total; off += step) { const rgb = new Uint8Array(N * N * 3); frameAt(off, rgb); frames.push({ rgb, time: speed * step }); }
  return frames;
}
['txt', 'txtFg', 'txtBg', 'txtFont', 'txtRainbow', 'txtSpeed'].forEach(id => $(id).addEventListener('input', () => {
  if (player.live && liveSource === 'txt') startTextLive(); else player.loop(textFrames());
}));
$('txtSend').onclick = () => { liveSource = null; const f = textFrames(); player.loop(f); upload(f, 'text'); };
function startTextLive() {
  const { total, frameAt } = textFramer();
  liveSource = 'txt';
  player.stream((t, rgb) => frameAt(t % total, rgb), 220 - +$('txtSpeed').value, 'text');
}
$('txtLive').onclick = () => {
  if (player.live && liveSource === 'txt') { player.stop(); player.loop(textFrames()); ui.status('Stopped streaming.'); return; }
  startTextLive();
};

// ---------------- Draw ----------------
const PALETTE = ['#000000', '#ffffff', '#ff004d', '#ff7a00', '#ffec27', '#00e436', '#29adff', '#83769c',
  '#ff77a8', '#ffccaa', '#ab5236', '#008751', '#1d2b53', '#7e2553', '#5f574f', '#c2c3c7'];
const editor = {
  px: new Uint8Array(N * N * 3), undo: [], tool: 'pen', color: hex('#ff5c8a'),
  cv: $('editor'),
  draw() {
    const c = this.cv.getContext('2d'), s = this.cv.width / N;
    for (let i = 0; i < N * N; i++) {
      const x = i % N, y = i / N | 0;
      c.fillStyle = `rgb(${this.px[i * 3]},${this.px[i * 3 + 1]},${this.px[i * 3 + 2]})`;
      c.fillRect(x * s, y * s, s, s);
    }
    c.strokeStyle = '#ffffff18'; c.lineWidth = 1;
    for (let k = 1; k < N; k++) { c.beginPath(); c.moveTo(k * s + .5, 0); c.lineTo(k * s + .5, this.cv.width); c.moveTo(0, k * s + .5); c.lineTo(this.cv.width, k * s + .5); c.stroke(); }
    drawLeds(this.px);
  },
  set(x, y, c) { const i = (y * N + x) * 3; this.px[i] = c[0]; this.px[i + 1] = c[1]; this.px[i + 2] = c[2]; },
  get(x, y) { const i = (y * N + x) * 3; return [this.px[i], this.px[i + 1], this.px[i + 2]]; },
  fill(x, y, c) {
    const t = this.get(x, y).join(); if (t === c.join()) return;
    const st = [[x, y]];
    while (st.length) { const [a, b] = st.pop(); if (a < 0 || b < 0 || a >= N || b >= N || this.get(a, b).join() !== t) continue; this.set(a, b, c); st.push([a + 1, b], [a - 1, b], [a, b + 1], [a, b - 1]); }
  },
  save() { try { localStorage.setItem('tivoo-drawing', JSON.stringify([...this.px])); } catch {} },
};
try { const s = JSON.parse(localStorage.getItem('tivoo-drawing')); if (s?.length === N * N * 3) editor.px.set(s); } catch {}
PALETTE.forEach(col => {
  const b = document.createElement('button'); b.style.background = col;
  b.onclick = () => { editor.color = hex(col); $('drawColor').value = col; document.querySelectorAll('.swatches button').forEach(x => x.classList.toggle('sel', x === b)); if (editor.tool === 'erase' || editor.tool === 'pick') selectTool('pen'); };
  $('swatches').appendChild(b);
});
$('drawColor').oninput = e => { editor.color = hex(e.target.value); };
function selectTool(t) { editor.tool = t; ['Pen', 'Fill', 'Erase', 'Pick'].forEach(n => $('tool' + n).classList.toggle('sel', n.toLowerCase() === t)); }
['Pen', 'Fill', 'Erase', 'Pick'].forEach(n => $('tool' + n).onclick = () => selectTool(n.toLowerCase()));

let drawing = false, lastLiveSend = 0;
function cell(e) { const r = editor.cv.getBoundingClientRect(); return [Math.floor((e.clientX - r.left) / r.width * N), Math.floor((e.clientY - r.top) / r.height * N)]; }
function applyTool(e) {
  const [x, y] = cell(e); if (x < 0 || y < 0 || x >= N || y >= N) return;
  if (editor.tool === 'pick') { editor.color = editor.get(x, y); $('drawColor').value = rgbHex(editor.color); selectTool('pen'); return; }
  if (editor.tool === 'fill') editor.fill(x, y, editor.color);
  else editor.set(x, y, editor.tool === 'erase' ? [0, 0, 0] : editor.color);
  editor.draw();
  if ($('drawLive').checked && tivoo.connected && !tivoo.busy && performance.now() - lastLiveSend > 120) { lastLiveSend = performance.now(); tivoo.send(D.imageMessages(editor.px)); }
}
editor.cv.addEventListener('pointerdown', e => { editor.undo.push(editor.px.slice()); if (editor.undo.length > 50) editor.undo.shift(); drawing = true; editor.cv.setPointerCapture(e.pointerId); applyTool(e); });
editor.cv.addEventListener('pointermove', e => { if (drawing && (editor.tool === 'pen' || editor.tool === 'erase')) applyTool(e); });
editor.cv.addEventListener('pointerup', () => { drawing = false; editor.save(); if ($('drawLive').checked && tivoo.connected) tivoo.send(D.imageMessages(editor.px)); });
$('drawSend').onclick = () => { player.stop(); drawLeds(editor.px); upload([{ rgb: editor.px.slice(), time: 0 }], 'drawing'); };
$('drawUndo').onclick = () => { const u = editor.undo.pop(); if (u) { editor.px.set(u); editor.draw(); editor.save(); } };
$('drawClear').onclick = () => { editor.undo.push(editor.px.slice()); editor.px.fill(0); editor.draw(); editor.save(); };
$('drawSave').onclick = async () => {
  const cv = new OffscreenCanvas(N, N), cx = cv.getContext('2d'), img = cx.createImageData(N, N);
  for (let i = 0; i < N * N; i++) { img.data.set([editor.px[i * 3], editor.px[i * 3 + 1], editor.px[i * 3 + 2], 255], i * 4); }
  cx.putImageData(img, 0, 0);
  const a = document.createElement('a'); a.href = URL.createObjectURL(await cv.convertToBlob()); a.download = 'tivoo-drawing.png'; a.click();
};
editor.draw();

// ---------------- Controls ----------------
const need = fn => () => { if (!tivoo.connected) { ui.status('Connect to the Tivoo first.'); return; } player.stop(); fn(); };
for (let i = 0; i < 16; i++) $('clkStyle').add(new Option(['Classic', 'Rainbow', 'Boxed', 'Analog square', 'Fullscreen negative', 'Analog round'][i] || `Style ${i}`, i));
let brTimer;
$('bright').oninput = e => { $('brVal').textContent = e.target.value; clearTimeout(brTimer); brTimer = setTimeout(() => tivoo.connected && tivoo.send(D.cmd.brightness(+e.target.value)), 120); };
let volTimer;
$('vol').oninput = e => { clearTimeout(volTimer); volTimer = setTimeout(() => tivoo.connected && tivoo.send(D.cmd.volume(+e.target.value)), 150); };
$('onBtn').onclick = need(() => tivoo.send([D.cmd.on(), D.cmd.brightness(+$('bright').value)]));
$('offBtn').onclick = need(() => tivoo.send(D.cmd.off()));
$('clkSend').onclick = need(() => tivoo.send([D.cmd.datetime(), D.cmd.timeType($('clk24').checked), D.cmd.clock({
  style: +$('clkStyle').value, h24: $('clk24').checked, weather: $('clkWeather').checked, temp: $('clkTemp').checked,
  calendar: $('clkCal').checked, color: hex($('clkColor').value),
})]).then(() => ui.status('Clock is showing.')));
$('syncTime').onclick = need(() => tivoo.send(D.cmd.datetime()).then(() => ui.status('Time synced from your phone.')));
$('lightSend').onclick = need(() => tivoo.send(D.cmd.light({ color: hex($('lightColor').value), brightness: +$('bright').value })));
$('lightFade').onclick = need(() => tivoo.send(D.cmd.light({ color: [255, 255, 255], brightness: +$('bright').value, effect: 1 })));
$('fxBuiltin').onclick = need(() => tivoo.send(D.cmd.effects(+$('fxNum').value)));
$('visBuiltin').onclick = need(() => tivoo.send(D.cmd.visualization(+$('visNum').value)));
$('scSend').onclick = need(() => tivoo.send(D.cmd.scoreboard(+$('scRed').value, +$('scBlue').value)));
$('noiseBtn').onclick = need(() => tivoo.send(D.cmd.noise(true)));
$('swBtn').onclick = need(() => tivoo.send(D.cmd.stopwatch(true)));

// ---------------- utils ----------------
function hex(h) { const v = parseInt(h.slice(1), 16); return [v >> 16, (v >> 8) & 255, v & 255]; }
function rgbHex(c) { return '#' + c.map(v => v.toString(16).padStart(2, '0')).join(''); }
function hsv(h) { const f = n => { const k = (n + h * 6) % 6; return Math.round(255 * (1 - Math.max(0, Math.min(k, 4 - k, 1)))); }; return [f(5), f(3), f(1)]; }

// start with an animation in the preview
previewFx();
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
