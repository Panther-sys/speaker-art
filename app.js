import * as D from './divoom.js?v=9';
import { EFFECTS, renderFrames } from './effects.js?v=9';
import { GAMES, gameOverFrame } from './games.js?v=9';
import * as sfx from './sfx.js?v=9';
import { drawLibrary, drawPause } from './menu.js?v=9';

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

  // For live frames: send now if free, otherwise remember only the newest frame and
  // send it the moment the previous one is done. No backlog, no long pauses.
  sendLatest(rgb) {
    if (this.busy || this.inFlight) { this.latest = rgb.slice(); return; }
    this.inFlight = true;
    this.send(D.imageMessages(rgb)).finally(() => {
      this.inFlight = false;
      const next = this.latest; this.latest = null;
      if (next && this.writer) this.sendLatest(next);
    }).catch(() => {});
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
      if (tivoo.connected) tivoo.sendLatest(rgb);
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
  if (b.dataset.tab !== 'games' && liveSource === 'game') stopGame();
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
let picFrames = null, picSource = null, picName = 'picture', crop = null;
$('picFile').onchange = e => { const f = e.target.files[0]; if (f) loadPictureFile(f); };

async function loadPictureFile(file) {
  try {
    ui.status('Loading picture…');
    picSource = await decodeImage(file);
    picName = (file.name || 'picture').replace(/\.[^.]+$/, '');
    $('dropText').textContent = (file.name || 'Shared picture') + ' (tap to change)';
    $('picEdit').style.display = 'block';
    const { bmp } = picSource[0];
    const s = Math.min(bmp.width, bmp.height);
    crop = { x: (bmp.width - s) / 2, y: (bmp.height - s) / 2, size: s };
    $('cropZoom').value = 100;
    const pixel = looksLikePixelArt(bmp);
    $('picSmooth').checked = !pixel;
    $('picBoost').value = pixel ? 0 : 30;
    syncCropUi();
    await renderPic();
    if (pixel) ui.status('Looks like pixel art, so smooth scaling is off to keep it crisp.');
  } catch (err) { ui.error(err); }
}

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

// Small images, or big ones made of solid blocks (upscaled sprites), are pixel art.
function looksLikePixelArt(bmp) {
  if (bmp.width <= 64 && bmp.height <= 64) return true;
  const w = Math.min(bmp.width, 400), h = Math.round(bmp.height * w / bmp.width);
  const cx = new OffscreenCanvas(w, h).getContext('2d', { willReadFrequently: true });
  cx.imageSmoothingEnabled = false;
  cx.drawImage(bmp, 0, 0, w, h);
  const d = cx.getImageData(0, 0, w, h).data;
  let same = 0, total = 0;
  const colors = new Set();
  for (let y = 0; y < h; y += 2) for (let x = 0; x < w - 1; x++) {
    const i = (y * w + x) * 4;
    if (d[i] === d[i + 4] && d[i + 1] === d[i + 5] && d[i + 2] === d[i + 6]) same++;
    total++;
    if (colors.size < 300) colors.add((d[i] << 16) | (d[i + 1] << 8) | d[i + 2]);
  }
  return same / total > 0.75 && colors.size < 300;
}

// ----- crop box -----
const cropCv = $('cropCv');
function drawCrop() {
  if (!picSource) return;
  const { bmp } = picSource[0];
  const W = 600, H = Math.round(W * bmp.height / bmp.width);
  cropCv.width = W; cropCv.height = H;
  const c = cropCv.getContext('2d');
  c.imageSmoothingEnabled = $('picSmooth').checked;
  c.drawImage(bmp, 0, 0, W, H);
  if ($('picFit').value !== 'crop') return;
  const k = W / bmp.width, x = crop.x * k, y = crop.y * k, s = crop.size * k;
  c.fillStyle = '#000a';
  c.fillRect(0, 0, W, y); c.fillRect(0, y + s, W, H - y - s); c.fillRect(0, y, x, s); c.fillRect(x + s, y, W - x - s, s);
  c.strokeStyle = '#ff5c8a'; c.lineWidth = 4; c.strokeRect(x, y, s, s);
}
function clampCrop() {
  const { bmp } = picSource[0];
  crop.size = Math.max(4, Math.min(crop.size, bmp.width, bmp.height));
  crop.x = Math.max(0, Math.min(bmp.width - crop.size, crop.x));
  crop.y = Math.max(0, Math.min(bmp.height - crop.size, crop.y));
}
function syncCropUi() { const isCrop = $('picFit').value === 'crop'; $('cropZoomRow').style.display = isCrop ? '' : 'none'; drawCrop(); }
let rerenderTimer;
function rerenderSoon() { drawCrop(); clearTimeout(rerenderTimer); rerenderTimer = setTimeout(renderPic, 60); }
function setZoom(z, cx, cy) {
  const { bmp } = picSource[0], base = Math.min(bmp.width, bmp.height);
  z = Math.max(1, Math.min(8, z));
  const mx = cx ?? crop.x + crop.size / 2, my = cy ?? crop.y + crop.size / 2;
  crop.size = base / z; crop.x = mx - crop.size / 2; crop.y = my - crop.size / 2;
  clampCrop(); $('cropZoom').value = Math.round(z * 100); rerenderSoon();
}
$('cropZoom').oninput = e => setZoom(+e.target.value / 100);
const pointers = new Map();
let dragStart = null, pinchStart = null;
const toSrc = e => { const r = cropCv.getBoundingClientRect(), k = picSource[0].bmp.width / r.width; return [(e.clientX - r.left) * k, (e.clientY - r.top) * k]; };
cropCv.addEventListener('pointerdown', e => {
  if (!picSource || $('picFit').value !== 'crop') return;
  cropCv.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, toSrc(e));
  if (pointers.size === 1) {
    const [x, y] = toSrc(e);
    // tap outside the box centres it there; drag inside moves it
    if (x < crop.x || y < crop.y || x > crop.x + crop.size || y > crop.y + crop.size) { crop.x = x - crop.size / 2; crop.y = y - crop.size / 2; clampCrop(); rerenderSoon(); }
    dragStart = { x, y, cx: crop.x, cy: crop.y };
  } else if (pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    pinchStart = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), size: crop.size };
    dragStart = null;
  }
});
cropCv.addEventListener('pointermove', e => {
  if (!pointers.has(e.pointerId)) return;
  pointers.set(e.pointerId, toSrc(e));
  if (pinchStart && pointers.size === 2) {
    const [a, b] = [...pointers.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]);
    const base = Math.min(picSource[0].bmp.width, picSource[0].bmp.height);
    setZoom(base / (pinchStart.size * pinchStart.d / Math.max(d, 1)), crop.x + crop.size / 2, crop.y + crop.size / 2);
  } else if (dragStart) {
    const [x, y] = toSrc(e);
    crop.x = dragStart.cx + x - dragStart.x; crop.y = dragStart.cy + y - dragStart.y; clampCrop(); rerenderSoon();
  }
});
const endPointer = e => { pointers.delete(e.pointerId); if (pointers.size < 2) pinchStart = null; if (!pointers.size) dragStart = null; };
cropCv.addEventListener('pointerup', endPointer);
cropCv.addEventListener('pointercancel', endPointer);
cropCv.addEventListener('wheel', e => { if (!picSource || $('picFit').value !== 'crop') return; e.preventDefault(); setZoom(+$('cropZoom').value / 100 * (e.deltaY < 0 ? 1.15 : 1 / 1.15)); }, { passive: false });

$('picFit').addEventListener('input', () => { syncCropUi(); picSource && renderPic(); });
$('picSmooth').addEventListener('input', () => { drawCrop(); picSource && renderPic(); });
['picBoost', 'picSpeed'].forEach(id => $(id).addEventListener('input', () => picSource && renderPic()));

async function renderPic() {
  const fit = $('picFit').value, smooth = $('picSmooth').checked, boost = +$('picBoost').value / 100, speed = +$('picSpeed').value;
  const cv = new OffscreenCanvas(N, N), cx = cv.getContext('2d', { willReadFrequently: true });
  picFrames = picSource.map(({ bmp, time }) => {
    cx.fillStyle = '#000'; cx.fillRect(0, 0, N, N);
    cx.imageSmoothingEnabled = smooth; cx.imageSmoothingQuality = 'high';
    let w = bmp.width, h = bmp.height, dx = 0, dy = 0, dw = N, dh = N, sx = 0, sy = 0, sw = w, sh = h;
    if (fit === 'crop') { sx = crop.x; sy = crop.y; sw = sh = crop.size; }
    if (fit === 'contain') { const s = N / Math.max(w, h); dw = Math.max(1, Math.round(w * s)); dh = Math.max(1, Math.round(h * s)); dx = (N - dw) >> 1; dy = (N - dh) >> 1; }
    cx.drawImage(bmp, sx, sy, sw, sh, dx, dy, dw, dh);
    const d = cx.getImageData(0, 0, N, N).data, rgb = new Uint8Array(N * N * 3);
    for (let i = 0; i < N * N; i++) {
      let r = d[i * 4], g = d[i * 4 + 1], b = d[i * 4 + 2];
      const a = d[i * 4 + 3] / 255; r *= a; g *= a; b *= a;
      if (boost) { const l = (r + g + b) / 3, k = 1 + boost * 1.5; r = l + (r - l) * k; g = l + (g - l) * k; b = l + (b - l) * k; }
      rgb[i * 3] = clamp(r); rgb[i * 3 + 1] = clamp(g); rgb[i * 3 + 2] = clamp(b);
    }
    return { rgb, time: time ? Math.max(20, Math.round(time / speed)) : 0 };
  });
  player.loop(picFrames);
  $('picSend').disabled = $('picSave').disabled = false;
  $('picInfo').textContent = picFrames.length > 1
    ? `Animated: ${picFrames.length} frames${picFrames.length > D.MAX_FRAMES ? ` (the Tivoo holds ${D.MAX_FRAMES}, so it will skip some evenly)` : ''}.`
    : 'Still image.';
}
const clamp = v => Math.max(0, Math.min(255, Math.round(v)));
$('picSend').onclick = () => { liveSource = null; picFrames && (player.loop(picFrames), upload(picFrames, 'picture')); };

// ----- library (IndexedDB, this device only) -----
const lib = {
  db: null,
  async open() {
    if (this.db) return this.db;
    this.db = await new Promise((res, rej) => {
      const r = indexedDB.open('tivoo-studio', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('lib', { keyPath: 'id', autoIncrement: true });
      r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
    });
    return this.db;
  },
  async tx(mode, fn) {
    const db = await this.open();
    return new Promise((res, rej) => { const t = db.transaction('lib', mode); const r = fn(t.objectStore('lib')); t.oncomplete = () => res(r && r.result); t.onerror = () => rej(t.error); });
  },
  all() { return this.tx('readonly', s => s.getAll()); },
  add(item) { return this.tx('readwrite', s => s.add(item)); },
  del(id) { return this.tx('readwrite', s => s.delete(id)); },
};
async function renderLib() {
  let items = [];
  try { items = await lib.all(); } catch { $('libEmpty').textContent = 'The library is not available in this browser mode.'; return; }
  const box = $('lib'); box.innerHTML = '';
  $('libEmpty').style.display = items.length ? 'none' : '';
  for (const it of items.reverse()) {
    const d = document.createElement('div'); d.className = 'item'; d.title = it.name;
    const c = document.createElement('canvas'); c.width = c.height = N;
    const cx = c.getContext('2d'), img = cx.createImageData(N, N);
    const thumb = (rgb) => { for (let i = 0; i < N * N; i++) img.data.set([rgb[i * 3], rgb[i * 3 + 1], rgb[i * 3 + 2], 255], i * 4); cx.putImageData(img, 0, 0); };
    thumb(it.frames[0].rgb);
    if (it.frames.length > 1) { let k = 0; const step = () => { if (!c.isConnected) return; k = (k + 1) % it.frames.length; thumb(it.frames[k].rgb); setTimeout(step, it.frames[k].time || 100); }; setTimeout(step, 100); }
    const del = document.createElement('button'); del.className = 'del'; del.textContent = '✕'; del.title = 'Remove';
    del.onclick = async e => { e.stopPropagation(); await lib.del(it.id); renderLib(); ui.status(`Removed ${it.name}.`); };
    d.onclick = () => { liveSource = null; player.loop(it.frames); upload(it.frames, it.name); };
    d.append(c, del); box.appendChild(d);
  }
}
$('picSave').onclick = async () => {
  if (!picFrames) return;
  try {
    await lib.add({ name: picName, created: Date.now(), frames: D.thin(picFrames, D.MAX_FRAMES).map(f => ({ rgb: f.rgb, time: f.time })) });
    ui.status(`Saved ${picName} to your library.`); renderLib();
  } catch (e) { ui.error(e); }
};
renderLib();

// ----- files shared into the installed app (Web Share Target, handled by sw.js) -----
async function takeSharedFile() {
  if (!new URLSearchParams(location.search).has('shared')) return;
  history.replaceState(null, '', location.pathname);
  try {
    const cache = await caches.open('tivoo-shared');
    const res = await cache.match('shared-file');
    if (!res) return;
    await cache.delete('shared-file');
    const blob = await res.blob();
    const name = decodeURIComponent(res.headers.get('x-file-name') || 'shared');
    document.querySelector('[data-tab=pic]').click();
    await loadPictureFile(new File([blob], name, { type: blob.type }));
  } catch (e) { ui.error(e); }
}
takeSharedFile();

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

// ---------------- Games ----------------
// The arcade runs as one loop with four modes: 'library' (pick a game on the Tivoo),
// 'play', 'pause' (Resume / Restart / Library) and 'over' (A again, B library).
let selIdx = 0, game = null, gameT = 0, mode = null, pauseSel = 0, frozen = null;
const gameSel = () => GAMES[selIdx];
const input = { held: {}, pressed: new Set() };
const best = name => { try { return +localStorage.getItem('tivoo-best-' + name) || 0; } catch { return 0; } };
GAMES.forEach((gm, i) => {
  const b = document.createElement('button');
  b.className = 'fx gm' + (i === 0 ? ' sel' : '');
  b.innerHTML = `<b>${gm.emoji}</b>${gm.name}`;
  b.onclick = () => { selectGame(i); if (mode && mode !== 'library') beginGame(); };
  $('gameGrid').appendChild(b);
});
function selectGame(i) {
  selIdx = (i + GAMES.length) % GAMES.length;
  document.querySelectorAll('.gm').forEach((x, k) => x.classList.toggle('sel', k === selIdx));
  $('gameHelp').textContent = gameSel().help; $('gameBest').textContent = best(gameSel().name); $('gameScore').textContent = 0;
  $('bpGame').textContent = gameSel().name;
}
selectGame(0);

function setMode(m) {
  mode = m;
  const playing = m === 'play' || m === 'pause' || m === 'over';
  $('gameStart').textContent = m ? '■ Stop' : '▶ Play';
  $('bpPlay').textContent = m === 'play' ? '⏸' : '▶';
  const labels = { library: 'Library: ◀▶ choose, A play', play: gameSel().name, pause: 'Paused', over: 'Game over: A again, B library' };
  $('bpGame').textContent = m ? labels[m] : gameSel().name;
  $('badge').textContent = m ? (tivoo.connected ? '● arcade on Tivoo' : 'arcade preview') : 'preview';
  if (m) keepAwake(); else releaseWakeLock();
  return playing;
}
function beginGame() {
  game = gameSel().create(); gameT = 0;
  input.pressed.clear();
  sfx.play('start');
  setMode('play');
  ui.status(`Playing ${gameSel().name}. B or Start pauses.${tivoo.connected ? '' : ' Connect to play it on the Tivoo.'}`);
  ensureLoop();
}
function openLibrary() {
  game = null; setMode('library');
  ui.status('Game library: ◀ ▶ to browse, A to play.');
  ensureLoop();
}
function stopArcade() { game = null; setMode(null); if (liveSource === 'game') { player.stop(); liveSource = null; } ui.status('Games stopped.'); }
const stopGame = stopArcade;

const rgb = new Uint8Array(N * N * 3);
function ensureLoop() {
  if (liveSource === 'game' && player.timer) return;
  player.stop(); liveSource = 'game';
  $('badge').textContent = tivoo.connected ? '● arcade on Tivoo' : 'arcade preview';
  const tick = () => {
    player.timer = null;
    if (liveSource !== 'game' || !mode) return;
    const start = performance.now();
    const p = input.pressed;
    let delay = 120;
    if (mode === 'library') {
      if (p.has('left') || p.has('up')) { selectGame(selIdx - 1); sfx.play('bounce'); }
      if (p.has('right') || p.has('down')) { selectGame(selIdx + 1); sfx.play('bounce'); }
      if (p.has('a') || p.has('start')) { p.clear(); return beginGame(), undefined; }
      drawLibrary(rgb, GAMES, selIdx, gameT);
    } else if (mode === 'play') {
      if (p.has('b') || p.has('start')) { frozen = rgb.slice(); pauseSel = 0; setMode('pause'); sfx.play('click'); }
      else if (p.has('menu')) { sfx.play('click'); p.clear(); return openLibrary(); }
      else {
        game.tick(input, rgb);
        if (game.sfx?.length) { game.sfx.forEach(n => sfx.play(n)); game.sfx.length = 0; }
        $('gameScore').textContent = game.score; $('bpScore').textContent = game.score;
        if (game.over) {
          navigator.vibrate?.(200); sfx.play(game.won ? 'win' : 'die'); setMode('over');
          if (game.score > best(gameSel().name)) { try { localStorage.setItem('tivoo-best-' + gameSel().name, game.score); } catch {} $('gameBest').textContent = game.score; ui.status(`New best: ${game.score}! A to play again, B for the library.`); }
          else ui.status(`${game.won ? 'You win' : 'Game over'}: ${game.score}. A to play again, B for the library.`);
        }
        delay = game.tickMs;
      }
    } else if (mode === 'pause') {
      if (p.has('left') || p.has('up')) { pauseSel = (pauseSel + 2) % 3; sfx.play('bounce'); }
      if (p.has('right') || p.has('down')) { pauseSel = (pauseSel + 1) % 3; sfx.play('bounce'); }
      if (p.has('b') || p.has('start')) { setMode('play'); }
      else if (p.has('a')) {
        p.clear();
        if (pauseSel === 0) setMode('play');
        else if (pauseSel === 1) return beginGame();
        else return openLibrary();
      }
      if (mode === 'pause') drawPause(rgb, frozen, pauseSel, gameT);
    } else if (mode === 'over') {
      if (p.has('a') || p.has('start')) { p.clear(); return beginGame(); }
      if (p.has('b') || p.has('menu')) { p.clear(); return openLibrary(); }
      gameOverFrame(rgb, game, gameT);
      delay = 200;
    }
    p.clear();
    gameT++;
    drawLeds(rgb);
    if (!$('bigPad').hidden) $('bpScreen').getContext('2d').drawImage($('preview'), 0, 0, 160, 160);
    if (tivoo.connected) tivoo.sendLatest(rgb);
    player.timer = setTimeout(tick, Math.max(60, delay - (performance.now() - start)));
  };
  tick();
}
$('gameStart').onclick = () => (mode ? stopArcade() : beginGame());

function press(key) { input.pressed.add(key); input.held[key] = true; }
function release(key) { input.held[key] = false; }
document.querySelectorAll('.pad button, .bigpad [data-key]').forEach(b => {
  const k = b.dataset.key;
  b.addEventListener('pointerdown', e => {
    e.preventDefault(); try { b.setPointerCapture(e.pointerId); } catch {}
    b.classList.add('down');
    if (!mode) { if (k === 'a') beginGame(); return; }
    press(k);
  });
  const up = () => { b.classList.remove('down'); release(k); };
  b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up);
  b.addEventListener('contextmenu', e => e.preventDefault());
});
const KEYMAP = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down', ' ': 'a', Enter: 'a', Escape: 'b', Backspace: 'b', p: 'start', m: 'menu' };
document.addEventListener('keydown', e => { const k = KEYMAP[e.key]; if (!k || !mode || e.target.matches('input, select, textarea')) return; e.preventDefault(); if (!e.repeat) press(k); });
document.addEventListener('keyup', e => { const k = KEYMAP[e.key]; if (k) release(k); });
// swipe / tap on the preview screen
let swipe = null;
$('preview').addEventListener('pointerdown', e => { if (mode) swipe = { x: e.clientX, y: e.clientY, k: null }; });
$('preview').addEventListener('pointermove', e => {
  if (!swipe) return;
  const dx = e.clientX - swipe.x, dy = e.clientY - swipe.y;
  if (Math.hypot(dx, dy) < 24) return;
  const k = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
  if (swipe.k !== k) { if (swipe.k) release(swipe.k); press(k); swipe.k = k; }
  swipe.x = e.clientX; swipe.y = e.clientY;
});
const endSwipe = () => { if (!swipe) return; if (swipe.k) release(swipe.k); else press('a'), setTimeout(() => release('a'), 50); swipe = null; };
$('preview').addEventListener('pointerup', endSwipe);
$('preview').addEventListener('pointercancel', () => { if (swipe?.k) release(swipe.k); swipe = null; });
$('preview').style.touchAction = 'none';
$('libraryBtn').onclick = () => openLibrary();

// ----- sound -----
const soundBtn = $('soundBtn');
const showSound = () => { soundBtn.textContent = sfx.isOn() ? '🔊 Sound on' : '🔇 Sound off'; };
soundBtn.onclick = () => { sfx.setOn(!sfx.isOn()); showSound(); if (sfx.isOn()) sfx.play('coin'); };
showSound();
['pointerdown', 'keydown'].forEach(ev => document.addEventListener(ev, () => sfx.isOn() && sfx.unlock(), { capture: true, passive: true }));

// ----- big full-screen controller -----
$('bigPadBtn').onclick = async () => {
  $('bigPad').hidden = false;
  try { await document.documentElement.requestFullscreen({ navigationUI: 'hide' }); } catch {}
  try { await screen.orientation.lock('landscape'); } catch {}
  if (!mode) openLibrary();
};
$('bpClose').onclick = async () => {
  $('bigPad').hidden = true;
  try { screen.orientation.unlock(); } catch {}
  try { if (document.fullscreenElement) await document.exitFullscreen(); } catch {}
};
$('bpPlay').onclick = () => { if (!mode) openLibrary(); else press('start'); };
$('bpMenu').onclick = () => openLibrary();

// keep the phone screen on while the arcade runs
let wakeLock = null;
async function keepAwake() { try { wakeLock = wakeLock || await navigator.wakeLock?.request('screen'); } catch {} }
function releaseWakeLock() { try { wakeLock?.release(); } catch {} wakeLock = null; }

// ----- Bluetooth / USB game controllers (Gamepad API, standard mapping) -----
// A / X / RT = action, B = back or pause, Y = action, Start = pause, View (Back) = library, LB/RB = sidestep
const padPrev = {};
function pollGamepads() {
  const pads = navigator.getGamepads ? [...navigator.getGamepads()].filter(Boolean) : [];
  if (!pads.length) return;
  const now = { up: false, down: false, left: false, right: false, a: false, b: false, sl: false, sr: false, start: false, menu: false };
  for (const gp of pads) {
    const b = i => !!gp.buttons[i]?.pressed, ax = gp.axes[0] || 0, ay = gp.axes[1] || 0;
    now.up ||= b(12) || ay < -0.5; now.down ||= b(13) || ay > 0.5;
    now.left ||= b(14) || ax < -0.5; now.right ||= b(15) || ax > 0.5;
    now.a ||= b(0) || b(2) || b(3) || b(7); now.b ||= b(1);
    now.start ||= b(9); now.menu ||= b(8) || b(16);
    now.sl ||= b(4); now.sr ||= b(5);
  }
  for (const k of Object.keys(now)) {
    if (now[k] && !padPrev[k]) {
      if (!mode) { document.querySelector('[data-tab=games]').click(); openLibrary(); }
      else if (k === 'menu' && mode !== 'play') openLibrary();
      else press(k);
    }
    if (!now[k] && padPrev[k]) release(k);
    padPrev[k] = now[k];
  }
}
let padLoop = null;
window.addEventListener('gamepadconnected', e => {
  ui.status(`🎮 Controller connected: ${e.gamepad.id.split('(')[0].trim()}. Press any button for the game library.`);
  if (!padLoop) { const loop = () => { pollGamepads(); padLoop = requestAnimationFrame(loop); }; loop(); }
});
window.addEventListener('gamepaddisconnected', () => { if (!navigator.getGamepads().some(Boolean)) { cancelAnimationFrame(padLoop); padLoop = null; ui.status('Controller disconnected.'); } });

// the Tivoo's own built-in games
$('bgStart').onclick = () => { if (!tivoo.connected) return ui.status('Connect to the Tivoo first.'); stopGame(); tivoo.send(D.cmd.game(+$('bgNum').value)); ui.status('Started the Tivoo game. Use the buttons below.'); };
$('bgStop').onclick = () => tivoo.connected && tivoo.send(D.cmd.game(null));
document.querySelectorAll('[data-bg]').forEach(b => b.onclick = () => tivoo.connected && tivoo.send(D.cmd.gameKey(b.dataset.bg), { gap: 100 }));

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
if ('serviceWorker' in navigator && window.isSecureContext) navigator.serviceWorker.register('sw.js').catch(() => {});
