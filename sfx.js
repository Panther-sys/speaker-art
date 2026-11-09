// Retro sound effects synthesised with Web Audio (no sound files).
// If the phone is also connected to the Tivoo as a Bluetooth speaker, they play from the Tivoo.
let ctx = null, master = null, noiseBuf = null;
let enabled = true;
try { enabled = localStorage.getItem('tivoo-sound') !== 'off'; } catch {}

export function unlock() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain(); master.gain.value = 0.35; master.connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  if (ctx.state === 'suspended') ctx.resume();
}
export const isOn = () => enabled;
export function setOn(v) { enabled = v; try { localStorage.setItem('tivoo-sound', v ? 'on' : 'off'); } catch {} if (v) unlock(); }

function tone(f0, f1, dur, type = 'square', vol = 0.5, delay = 0) {
  const t = ctx.currentTime + delay, o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g).connect(master); o.start(t); o.stop(t + dur + 0.02);
}
function noise(dur, vol = 0.5, freq = 1200, delay = 0) {
  const t = ctx.currentTime + delay, s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
  s.buffer = noiseBuf; f.type = 'lowpass'; f.frequency.setValueAtTime(freq, t); f.frequency.exponentialRampToValueAtTime(100, t + dur);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  s.connect(f).connect(g).connect(master); s.start(t); s.stop(t + dur + 0.02);
}
const notes = (list, type = 'square', vol = 0.35, step = 0.09) => list.forEach((f, i) => tone(f, f, step * 0.95, type, vol, i * step));

const SOUNDS = {
  eat: () => tone(600, 1200, 0.08),
  bounce: () => tone(440, 440, 0.05, 'square', 0.35),
  brick: () => tone(700 + Math.random() * 300, 500, 0.06, 'square', 0.35),
  score: () => notes([660, 990], 'square', 0.3, 0.07),
  flap: () => tone(300, 600, 0.07, 'triangle', 0.5),
  jump: () => tone(250, 750, 0.14, 'square', 0.3),
  coin: () => notes([988, 1319], 'square', 0.25, 0.06),
  stomp: () => { tone(400, 80, 0.12, 'square', 0.4); noise(0.08, 0.3, 800); },
  shoot: () => { tone(900, 150, 0.09, 'sawtooth', 0.22); noise(0.05, 0.15, 3000); },
  click: () => tone(120, 100, 0.04, 'square', 0.25),
  hit: () => tone(300, 200, 0.05, 'square', 0.3),
  boom: () => { noise(0.35, 0.6, 1500); tone(160, 40, 0.3, 'triangle', 0.5); },
  hurt: () => { tone(220, 60, 0.25, 'sawtooth', 0.35); noise(0.15, 0.25, 600); },
  power: () => notes([523, 659, 784, 1047], 'square', 0.25, 0.06),
  pickup: () => notes([784, 1175], 'triangle', 0.45, 0.07),
  level: () => notes([523, 659, 784, 1047, 784, 1047], 'square', 0.25, 0.08),
  start: () => notes([392, 523, 659], 'square', 0.25, 0.08),
  die: () => notes([392, 330, 262, 196], 'square', 0.3, 0.14),
  win: () => notes([523, 659, 784, 1047, 1319], 'square', 0.28, 0.1),
};

export function play(name) {
  if (!enabled || !SOUNDS[name]) return;
  unlock();
  if (!ctx || ctx.state !== 'running') return;
  try { SOUNDS[name](); } catch {}
}
