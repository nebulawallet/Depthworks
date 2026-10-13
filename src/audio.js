// Sound. Everything is synthesised with Web Audio at runtime: no sample files.
// One-shots for actions, and ambient loops whose volume follows the working machines near the engineer.
import { S, world, bus } from './state.js';
import { ENTITIES } from './data.js';

let ctx = null, master, sfxBus, ambBus, noiseBuf;
const loops = {};
let volume = (() => { try { const v = parseFloat(localStorage.getItem('depthworks.volume')); return isNaN(v) ? .7 : v; } catch { return .7; } })();

export const getVolume = () => volume;
export const audioState = () => ctx ? ctx.state : 'not started';
export function setVolume(v) {
  volume = Math.max(0, Math.min(1, v));
  try { localStorage.setItem('depthworks.volume', String(volume)); } catch { /* storage unavailable */ }
  if (master) master.gain.setTargetAtTime(volume * volume, ctx.currentTime, .05);
}

// Browsers only allow audio after a user gesture, so the context starts on the first click or key.
export function initAudio() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
  ctx = new AC();
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -18; comp.ratio.value = 4;
  master = ctx.createGain(); master.gain.value = volume * volume;
  master.connect(comp); comp.connect(ctx.destination);
  sfxBus = ctx.createGain(); sfxBus.gain.value = .9; sfxBus.connect(master);
  ambBus = ctx.createGain(); ambBus.gain.value = .55; ambBus.connect(master);
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  buildLoops();
}
addEventListener('pointerdown', initAudio, true);
addEventListener('keydown', initAudio, true);

// ---------------------------------------------------------------- building blocks
const rnd = (a, b) => a + Math.random() * (b - a);
function envGain(t, peak, attack, dur, dest) {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(peak, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  g.connect(dest);
  return g;
}
function noise(dur, { type = 'bandpass', f = 1000, f2, q = 1, gain = .3, attack = .002, at = 0, dest = sfxBus } = {}) {
  const t = ctx.currentTime + at, src = ctx.createBufferSource(), filt = ctx.createBiquadFilter();
  src.buffer = noiseBuf; src.playbackRate.value = rnd(.85, 1.15);
  filt.type = type; filt.Q.value = q; filt.frequency.setValueAtTime(f, t);
  if (f2) filt.frequency.exponentialRampToValueAtTime(f2, t + dur);
  src.connect(filt).connect(envGain(t, gain, attack, dur, dest));
  src.start(t, Math.random()); src.stop(t + dur + .05);
}
function tone(freq, dur, { type = 'sine', gain = .2, attack = .004, at = 0, f2, dest = sfxBus } = {}) {
  const t = ctx.currentTime + at, o = ctx.createOscillator();
  o.type = type; o.frequency.setValueAtTime(freq, t);
  if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
  o.connect(envGain(t, gain, attack, dur, dest));
  o.start(t); o.stop(t + dur + .05);
}

// ---------------------------------------------------------------- one-shots
const last = {};
export function sfx(name, minGap = 0) {
  if (!ctx || ctx.state !== 'running') return;
  const now = ctx.currentTime;
  if (minGap && now - (last[name] || 0) < minGap) return;
  last[name] = now;
  const p = rnd(.92, 1.08);
  switch (name) {
    case 'step': noise(.08, { type: 'lowpass', f: rnd(500, 800), gain: .12 }); tone(70 * p, .05, { gain: .05 }); break;
    case 'stepMetal': noise(.06, { type: 'bandpass', f: 2400, q: 3, gain: .08 }); tone(320 * p, .06, { type: 'triangle', gain: .03 }); break;
    case 'hit_ore': noise(.14, { type: 'bandpass', f: 1600 * p, q: 1.5, gain: .32 }); tone(190 * p, .07, { type: 'square', gain: .04, f2: 120 }); break;
    case 'hit_tree': tone(170 * p, .13, { type: 'triangle', gain: .28, f2: 110 }); noise(.09, { type: 'bandpass', f: 650, q: 2, gain: .18 }); break;
    case 'hit_rock': noise(.11, { type: 'highpass', f: 2200, gain: .26 }); tone(420 * p, .06, { type: 'square', gain: .05, f2: 210 }); break;
    case 'hit_ent': case 'hit_frame': tone(260 * p, .07, { type: 'square', gain: .06, f2: 140 }); noise(.05, { type: 'bandpass', f: 3200, gain: .14 }); break;
    case 'mined': tone(640 * p, .07, { gain: .1, f2: 960 }); break;
    case 'treeFall': noise(.5, { type: 'lowpass', f: 1400, f2: 200, gain: .3, attack: .02 }); tone(90, .4, { type: 'triangle', gain: .15, f2: 50 }); break;
    case 'rockBreak': noise(.35, { type: 'bandpass', f: 900, f2: 300, q: .8, gain: .4 }); tone(120, .25, { type: 'square', gain: .05, f2: 60 }); break;
    case 'place': tone(150 * p, .12, { type: 'square', gain: .09, f2: 70 }); noise(.1, { type: 'lowpass', f: 900, gain: .28 }); tone(1150 * p, .14, { type: 'triangle', gain: .035, at: .02 }); break;
    case 'remove': tone(85 * p, .1, { type: 'square', gain: .08, f2: 170 }); noise(.08, { type: 'lowpass', f: 1200, gain: .2 }); break;
    case 'pickup': tone(980 * p, .045, { gain: .06, f2: 1400 }); break;
    case 'click': tone(880, .025, { type: 'square', gain: .03 }); break;
    case 'open': noise(.16, { type: 'bandpass', f: 900, f2: 2600, q: 2, gain: .1 }); break;
    case 'close': noise(.14, { type: 'bandpass', f: 2600, f2: 900, q: 2, gain: .08 }); break;
    case 'error': tone(118, .16, { type: 'sawtooth', gain: .06 }); tone(111, .16, { type: 'sawtooth', gain: .06 }); break;
    case 'craft': tone(880, .07, { type: 'triangle', gain: .08 }); tone(1320, .1, { type: 'triangle', gain: .07, at: .06 }); break;
    case 'research': [523, 659, 784, 1047].forEach((f, i) => tone(f, .35, { type: 'triangle', gain: .1, at: i * .09 })); break;
    case 'goal': [784, 1047].forEach((f, i) => tone(f, .25, { type: 'triangle', gain: .08, at: i * .08 })); break;
    case 'tier':
      [262, 330, 392, 523].forEach(f => tone(f, 1.6, { type: 'triangle', gain: .06, attack: .05 }));
      noise(1.2, { type: 'bandpass', f: 300, f2: 4000, q: 4, gain: .06, attack: .3 }); break;
    case 'alien':
      tone(220, 1.8, { gain: .08, attack: .3, f2: 330 }); tone(331, 2, { gain: .06, attack: .4, f2: 247 });
      tone(110, 2.2, { type: 'triangle', gain: .06, attack: .5, f2: 98 });
      noise(1.6, { type: 'bandpass', f: 400, f2: 3200, q: 9, gain: .05, attack: .4 }); break;
    case 'pulse': tone(55, 1.3, { gain: .35, f2: 38 }); tone(110, .9, { gain: .12, f2: 70 }); noise(.6, { type: 'lowpass', f: 300, gain: .15 }); break;
    case 'servo': tone(420 * p, .2, { type: 'sawtooth', gain: .012, f2: 760 }); break;
    case 'crackle': noise(.03, { type: 'highpass', f: 3000, gain: rnd(.03, .09) }); break;
    case 'spill': tone(300, .08, { type: 'square', gain: .04 }); tone(240, .1, { type: 'square', gain: .04, at: .07 }); break;
  }
}

// ---------------------------------------------------------------- ambient loops
function osc(type, f) { const o = ctx.createOscillator(); o.type = type; o.frequency.value = f; o.start(); return o; }
function noiseSrc() { const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true; s.start(0, Math.random()); return s; }
function filt(type, f, q = 1) { const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; return b; }
function lfoOn(param, rate, depth) { const l = osc('sine', rate), g = ctx.createGain(); g.gain.value = depth; l.connect(g).connect(param); }
function loop(name, build) { const g = ctx.createGain(); g.gain.value = 0; build(g); g.connect(ambBus); loops[name] = g; }
function buildLoops() {
  loop('wind', g => { const f = filt('lowpass', 380); lfoOn(f.frequency, .07, 220); noiseSrc().connect(f).connect(g); });
  loop('belt', g => {   // rattling rollers
    const f = filt('bandpass', 280, 1.4); const am = ctx.createGain(); am.gain.value = .7; lfoOn(am.gain, 13, .3);
    noiseSrc().connect(f).connect(am).connect(g);
  });
  loop('drill', g => {
    noiseSrc().connect(filt('lowpass', 150)).connect(g);
    const am = ctx.createGain(); am.gain.value = .35; lfoOn(am.gain, 7, .25);
    osc('sawtooth', 46).connect(filt('lowpass', 220)).connect(am).connect(g);
  });
  loop('fire', g => { noiseSrc().connect(filt('lowpass', 520)).connect(g); });
  loop('machine', g => {
    const am = ctx.createGain(); am.gain.value = .5; lfoOn(am.gain, 3.2, .4);
    osc('triangle', 98).connect(filt('lowpass', 420)).connect(am).connect(g);
    osc('square', 196).connect(filt('lowpass', 300)).connect(am);
  });
  loop('engine', g => { const f = filt('lowpass', 190); osc('sawtooth', 38).connect(f); osc('sawtooth', 38.7).connect(f); f.connect(g); });
  loop('shimmer', g => { osc('sine', 880).connect(g); osc('sine', 883.5).connect(g); osc('sine', 1320).connect(g); });
}
const LOOP_LEVEL = { wind: .1, belt: .14, drill: .3, fire: .22, machine: .07, engine: .25, shimmer: .015 };

// ---------------------------------------------------------------- per-frame update
let scanT = 0, stepPhase = 0, hitT = 0, crackT = 0, fire = 0;
const prevHeld = new WeakMap();
export function updateAudio(dt) {
  if (!ctx || ctx.state !== 'running' || !S.started) return;
  const p = S.player, t = ctx.currentTime;

  // footsteps follow the walk cycle
  if (p.moving) {
    const before = Math.floor(stepPhase); stepPhase += dt * 10 / Math.PI;
    if (Math.floor(stepPhase) !== before) {
      const under = world.ents.get(Math.floor(p.x) + ',0,' + Math.floor(p.z));
      sfx(under && under.items ? 'stepMetal' : 'step');
    }
  } else stepPhase = .5;

  // pickaxe hits in time with the swing animation
  if (p.mining && !p.mining.blocked) { hitT += dt; if (hitT > .45) { hitT = 0; sfx('hit_' + p.mining.kind); } }
  else hitT = .4;

  if ((scanT += dt) < .1) {
    if (fire > .05 && (crackT += dt) > .05 / fire) { crackT = 0; if (Math.random() < .5) sfx('crackle'); }
    return;
  }
  scanT = 0;
  const w = { belt: 0, drill: 0, fire: 0, machine: 0, engine: 0, shimmer: 0 };
  let servos = 0;
  for (const e of world.ents.values()) {
    const dx = e.x + .5 - p.x, dz = e.z + .5 - p.z, d2 = dx * dx + dz * dz;
    if (d2 > 260) continue;
    const near = 1 / (1 + d2 / 30), active = S.T - e.lastActive < .6;
    switch (e.kind) {
      case 'belt': case 'underground': case 'splitter': case 'lift': if (active && e.items.length) w.belt += near * .25; break;
      case 'drill': if (e.status === 'mining') w.drill += near * .6; break;
      case 'furnace': if (e.crafting && active) (ENTITIES[e.type].burner ? (w.fire += near * .6) : (w.machine += near * .5)); break;
      case 'assembler': if (e.crafting && active) w.machine += near * .6; break;
      case 'generator': w.engine += near * (e.load || 0) * 1.4; break;
      case 'lab': case 'transmitter': if (active) w.shimmer += near; break;
      case 'inserter': {
        const was = prevHeld.get(e);
        if (!was && e.held && d2 < 100 && servos < 3) { servos++; sfx('servo'); }
        prevHeld.set(e, e.held);
        break;
      }
    }
  }
  fire = Math.min(1, w.fire);
  const under = S.mode === 'depth' && S.layer < 0;
  for (const [name, g] of Object.entries(loops)) {
    const target = name === 'wind' ? (under ? .3 : 1) * LOOP_LEVEL.wind : (1 - Math.exp(-(w[name] || 0))) * LOOP_LEVEL[name];
    g.gain.setTargetAtTime(target, t, .25);
  }
}

// ---------------------------------------------------------------- game events
bus.on('placed', e => { if (S.started) sfx('place', .04); });
bus.on('removed', () => { if (S.started) sfx('remove', .04); });
bus.on('mined', kind => sfx(kind === 'tree' ? 'treeFall' : kind === 'rock' ? 'rockBreak' : 'mined'));
bus.on('pickup', () => sfx('pickup', .03));
bus.on('crafted', () => sfx('craft', .05));
bus.on('research', () => sfx('research'));
bus.on('tier', () => sfx('tier'));
bus.on('pulse', () => sfx('pulse'));
bus.on('signal', kind => { if (kind !== 'out') sfx('alien'); });
bus.on('spill', () => sfx('spill', 1));
bus.on('goal', () => sfx('goal'));
bus.on('uiclick', () => sfx('click', .03));
