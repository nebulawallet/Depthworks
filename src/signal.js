// The signal. A transmitter "hears" the working mechanisms around it and sends them as a sentence.
// The aliens answer using only glyphs you have taught them, and make requests you answer by building.
import { ENTITIES, CONVERSATION, AMBIENT } from './data.js';
import { S, world, bus, key, hash01 } from './state.js';
import { isActive } from './sim.js';

export const HEAR_RADIUS = 5;

export function sentenceFor(tx) {
  const found = [];
  const add = (g, d) => { const f = found.find(x => x.g === g); if (!f) found.push({ g, d }); else f.d = Math.min(f.d, d); };
  for (const e of world.ents.values()) {
    if (e === tx || !isActive(e)) continue;
    const d = Math.max(Math.abs(e.x - tx.x), Math.abs(e.z - tx.z));
    if (d > HEAR_RADIUS) continue;
    add(ENTITIES[e.type].glyph, d);
    if (e.y > 0) add('above', d);
    if (e.y < 0) add('below', d);
    if (e.y <= -2) add('abyss', d);
  }
  for (const f of world.frames.values()) {
    const d = Math.max(Math.abs(f.x - tx.x), Math.abs(f.z - tx.z));
    if (d <= HEAR_RADIUS && isActive(world.ents.get(key(f.x, f.y, f.z)))) add('hollow', d);
  }
  return ['pulse', ...found.sort((a, b) => a.d - b.d).map(f => f.g)];
}

export function clarity() {
  const sig = S.signal;
  return Math.min(1, .12 + S.maxTier * .1 + sig.taught.size * .025 + Math.max(0, sig.stage) * .045 + (S.research.done.has('resonance') ? .25 : 0));
}
export function maskText(text, seed) {
  const c = clarity();
  return text.split(' ').map((w, i) => hash01(w + seed + i) < c ? w : '▒'.repeat(w.length)).join(' ');
}

function receive(msg, kind) {
  S.signal.log.unshift({ kind: 'in', seq: msg.seq, text: msg.text, seed: S.signal.pulses, ask: msg.ask, hint: msg.hint, t: S.T });
  if (S.signal.log.length > 40) S.signal.log.pop();
  bus.emit('signal', kind);
}

bus.on('pulse', tx => {
  if (S.net.role === 'client') return;   // the host decides what the aliens hear and say
  const sig = S.signal;
  sig.pulses++;
  const words = sentenceFor(tx);
  const fresh = words.filter(w => !sig.taught.has(w));
  words.forEach(w => sig.taught.add(w));
  sig.log.unshift({ kind: 'out', seq: words, fresh, t: S.T });
  bus.emit('signal', 'out');

  if (sig.stage < 0) { sig.stage = 0; setTimeout(() => receive(CONVERSATION[0], 'contact'), 2500); return; }
  const cur = CONVERSATION[sig.stage];
  if (cur?.ask && cur.ask.every(g => words.includes(g))) {
    sig.stage++;
    setTimeout(() => receive(CONVERSATION[sig.stage], sig.stage === CONVERSATION.length - 1 ? 'ending' : 'answer'), 3000);
    return;
  }
  if (sig.pulses % 4 === 0) {
    const ok = AMBIENT.filter(m => m.seq.every(g => sig.taught.has(g)));
    let pool = ok.filter(m => !sig.seen.has(m.text)); if (!pool.length) pool = ok;
    if (pool.length) { const m = pool[Math.floor(Math.random() * pool.length)]; sig.seen.add(m.text); setTimeout(() => receive(m, 'ambient'), 3000); }
  }
});

export function currentAsk() {
  const c = CONVERSATION[S.signal.stage];
  return c && c.ask ? c : null;
}

// ---------------------------------------------------------------- glyphs (12x12 pixel animations)
const C = '#7ef6ff', D = '#1e5a63', Y = '#ffd23f';
export function drawGlyph(ctx, g, ox, oy, t, seed, s = 4) {
  const px = (x, y, c = C) => { x = Math.round(x); y = Math.round(y); if (x < 0 || y < 0 || x > 11 || y > 11) return; ctx.fillStyle = c; ctx.fillRect(ox + x * s, oy + y * s, s, s); };
  switch (g) {
    case 'flow': for (let i = 0; i < 3; i++) { const b = (i * 4 + Math.floor(t * 6)) % 12; [[0, 3], [1, 4], [2, 5], [1, 6], [0, 7]].forEach(([a, y]) => px((b + a) % 12, y + 1)); } break;
    case 'tunnel': { for (let x = 0; x < 12; x++) px(x, 5, D); const b = Math.floor(t * 6) % 16; if (b < 4 || b > 9) px(b % 12, 4); for (let y = 2; y < 9; y++) { px(4, y); px(8, y); } px(5, 2); px(6, 2); px(7, 2); break; }
    case 'split': { const k = Math.floor(t * 5) % 6; for (let x = 0; x < 5; x++) px(x, 6); px(5, 6); for (let i = 1; i < 6; i++) { px(5 + i, 6 - i, k === 0 ? C : D); px(5 + i, 6, k === 1 ? C : D); px(5 + i, 6 + i > 11 ? 11 : 6 + i, k === 2 ? C : D); } break; }
    case 'rise': { for (let i = 0; i < 10; i++) px(1 + i, 10 - i, D); const p = (t * 4) % 10; px(1 + p, 10 - p); px(2 + p, 10 - p); break; }
    case 'swing': { const a = Math.PI * (.5 + .5 * Math.sin(t * 2 + seed)); for (let x = 2; x < 10; x++) px(x, 11, D); for (let k = 0; k < 7; k++) px(6 + Math.cos(a) * k, 10 - Math.sin(a) * k); break; }
    case 'bore': { const a = t * 3 + seed; for (let k = -4; k <= 4; k++) { px(5.5 + Math.cos(a) * k, 5.5 + Math.sin(a) * k); px(5.5 - Math.sin(a) * k * .5, 5.5 + Math.cos(a) * k * .5, D); } break; }
    case 'heat': for (let x = 3; x < 9; x++) { const h = 3 + Math.floor(4 * Math.abs(Math.sin(t * 5 + x * 1.7 + seed))); for (let j = 0; j < h; j++) px(x, 10 - j, j > h - 2 ? Y : C); } break;
    case 'make': { const a = t * 2; for (let i = 0; i < 8; i++) { const an = a + i * Math.PI / 4; px(3.5 + Math.cos(an) * 2.5, 5.5 + Math.sin(an) * 2.5); px(8 + Math.cos(-an) * 2.5, 5.5 + Math.sin(-an) * 2.5, D); } break; }
    case 'think': { for (let y = 2; y < 10; y++) for (let x = 2; x < 10; x++) if (Math.abs(Math.hypot(x - 5.5, y - 5.5) - 3.5) < .6) px(x, y, D); const a = t * 3; px(5.5 + Math.cos(a) * 3.5, 5.5 + Math.sin(a) * 3.5); px(5.5 + Math.cos(a * -1.7) * 1.5, 5.5 + Math.sin(a * -1.7) * 1.5); break; }
    case 'keep': { const lift = Math.sin(t * 1.5 + seed) > .7 ? 1 : 0; for (let i = 2; i < 10; i++) { px(i, 3 - lift); px(i, 10); } for (let j = 4; j < 10; j++) { px(2, j); px(9, j); } break; }
    case 'hollow': for (let i = 2; i < 10; i++) { px(i, 2); px(2, i); px(9, i); } if (Math.sin(t * 3 + seed) > 0) px(5, 8); px(6, 8, D); break;
    case 'spark': { const on = Math.sin(t * 9 + seed) > 0; [[6, 1], [5, 2], [4, 3], [5, 4], [6, 4], [7, 5], [6, 6], [5, 7], [4, 8], [5, 9], [4, 10]].forEach(([x, y]) => px(x, y, on ? Y : D)); break; }
    case 'shine': { const r = 1 + (t * 2) % 4; px(5, 5, Y); px(6, 5, Y); px(5, 6, Y); px(6, 6, Y); for (let a = 0; a < 8; a++) px(5.5 + Math.cos(a * Math.PI / 4) * r, 5.5 + Math.sin(a * Math.PI / 4) * r); break; }
    case 'pulse': for (let k = 0; k < 2; k++) { const r = (t * 3 + k * 2.5) % 5.5; for (let a = 0; a < 16; a++) px(5.5 + Math.cos(a / 16 * Math.PI * 2) * r, 5.5 + Math.sin(a / 16 * Math.PI * 2) * r, r > 4 ? D : C); } break;
    case 'above': case 'below': case 'abyss': {
      const hot = Math.floor(t * 2) % 3, rows = g === 'above' ? [2, 5, 8] : [8, 5, 2];
      rows.forEach((r, i) => { for (let x = 2; x < 10; x++) px(x, r, i === hot ? (g === 'abyss' ? '#b07bff' : C) : D); });
      if (g === 'abyss') for (let x = 4; x < 8; x++) px(x, 11, '#b07bff'); else { const ay = g === 'above' ? 0 : 11; px(5, ay); px(6, ay); }
      break;
    }
  }
}
export function drawStrip(canvas, seq, seed, t, s = 4) {
  const w = seq.length * 14 * s;
  if (canvas.width !== w) { canvas.width = w; canvas.height = 12 * s; }
  const ctx = canvas.getContext('2d'); ctx.clearRect(0, 0, canvas.width, canvas.height);
  seq.forEach((g, i) => {
    const glitch = hash01(g + Math.floor(t * 4) + i + seed) > .965 ? s : 0;   // the signal is never quite clean
    drawGlyph(ctx, g, i * 14 * s + glitch, 0, t + i * .7, seed + i, s);
  });
}
