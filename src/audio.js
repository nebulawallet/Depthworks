// Sound. Everything is synthesised with Web Audio at runtime: no sample files.
// One-shots for actions, and ambient loops whose volume follows the working machines near the engineer.
import { S, world, bus } from './state.js';
import { ENTITIES, VEHICLES } from './data.js';

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
  // a gentle cut above 5 kHz on everything: synthesised tones get piercing up there
  const soft = ctx.createBiquadFilter(); soft.type = 'highshelf'; soft.frequency.value = 5000; soft.gain.value = -9;
  master.connect(soft); soft.connect(comp); comp.connect(ctx.destination);
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
let level = 1;   // how loud this one-shot plays: far-off gunfire is quieter (see sfx)
function envGain(t, peak, attack, dur, dest) {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(Math.max(.0002, peak * level), t + attack);
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

// A gunshot, in the layers a real one has: a sharp crack (the first few milliseconds, all treble), a boom of noise
// whose filter closes as it dies so it darkens from a snap to a thud, pushed through a soft clipper for punch, a low
// thump you feel more than hear, a rumble rolling away across the land, and a dull echo coming back a moment later.
// size: how big the gun is (1 a rifle); boom, tail: seconds; thump: the thump's starting pitch; bright: how much treble;
// echo: when the echo returns (0: none, for guns that fire too fast for one).
let clipCurve = null;
// A layer's own envelope: up in under a millisecond, then dying away with time constant `tau` (setTargetAtTime), so a
// layer's loudness is set by `peak` and its length by `tau` alone.
function shot(src, t, peak, tau, len, at = 0, rise = .0008) {
  const g = ctx.createGain(), t0 = t + at;
  g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(peak * level, t0 + rise); g.gain.setTargetAtTime(0, t0 + rise, tau);
  src.connect(g).connect(sfxBus); return [t0, t0 + len];
}
function noiseLayer(t, { type, f, f2, q = .7, peak, tau, len, at = 0, rise, sweep }) {
  const src = ctx.createBufferSource(), filt = ctx.createBiquadFilter();
  src.buffer = noiseBuf; filt.type = type; filt.Q.value = q; filt.frequency.setValueAtTime(f, t + at);
  if (f2) filt.frequency.exponentialRampToValueAtTime(f2, t + at + (sweep ?? len));
  src.connect(filt);
  const [a, b] = shot(filt, t, peak, tau, len, at, rise);
  src.start(a, Math.random()); src.stop(b);
  return filt;
}
const GUN_LEVEL = .62;   // guns are the loudest thing in the game, but not by so much that a shot drowns everything
function bang(o) {
  const keep = level;
  level *= GUN_LEVEL;
  try { bangLayers(ctx.currentTime, o); } finally { level = keep; }
}
function bangLayers(t, { size = 1, crack = 1, boom = .25, tail = .6, thump = 110, bright = 1, echo = .2 }) {
  if (!clipCurve) { clipCurve = new Float32Array(1024); for (let i = 0; i < 1024; i++) { const x = i / 511.5 - 1; clipCurve[i] = Math.tanh(x * 3); } }
  // the crack: a few milliseconds of nothing but treble
  noiseLayer(t, { type: 'highpass', f: 2500 * bright, peak: 1.1 * crack, tau: .004, len: .03, rise: .0003 });
  // the boom: broadband noise driven into a soft clipper, its filter closing as it dies
  { const src = ctx.createBufferSource(), lp = ctx.createBiquadFilter(), drive = ctx.createGain(), clip = ctx.createWaveShaper();
    src.buffer = noiseBuf; lp.type = 'lowpass'; lp.Q.value = .9;
    lp.frequency.setValueAtTime(7000 * bright, t); lp.frequency.exponentialRampToValueAtTime(160, t + boom);
    drive.gain.value = 3; clip.curve = clipCurve;
    src.connect(lp).connect(drive).connect(clip);
    const [a, b] = shot(clip, t, .7 * size, boom / 3, boom * 1.6); src.start(a, Math.random()); src.stop(b); }
  // the thump: a sine falling from `thump` to almost nothing
  { const o = ctx.createOscillator(); o.frequency.setValueAtTime(thump, t); o.frequency.exponentialRampToValueAtTime(30, t + .09 * size + .03);
    const [a, b] = shot(o, t, .9 * Math.min(1.3, size), .03 + .03 * size, .3); o.start(a); o.stop(b); }
  // the rumble rolling away over the land
  noiseLayer(t, { type: 'lowpass', f: 1400 * bright, f2: 70, q: .5, peak: .32 * size, tau: tail / 3.5, len: tail * 1.3, at: .004, rise: .015 });
  // and the echo coming back off whatever is out there, duller each time
  if (echo) {
    noiseLayer(t, { type: 'bandpass', f: 800, f2: 300, q: .8, peak: .16 * size, tau: .09 * size, len: .5, at: echo, rise: .006 });
    noiseLayer(t, { type: 'lowpass', f: 500, f2: 120, q: .5, peak: .09 * size, tau: .14 * size, len: .7, at: echo * 2.2, rise: .02 });
  }
}
// Metal on metal: the shotgun's pump and the rifle's bolt, after the shot.
const clack = (at, f, g = .12) => { noise(.03, { type: 'bandpass', f, q: 4, gain: g, attack: .001, at }); tone(f / 3, .03, { type: 'square', gain: g * .25, at }); };

// ---------------------------------------------------------------- one-shots
const last = {};
export function sfx(name, minGap = 0, loud = 1) {
  if (!ctx || ctx.state !== 'running' || loud < .02) return;
  const now = ctx.currentTime;
  if (minGap && now - (last[name] || 0) < minGap) return;
  last[name] = now;
  const p = rnd(.92, 1.08);
  level = loud;
  try { play(name, p); } finally { level = 1; }
}
function play(name, p) {
  switch (name) {
    case 'step': noise(.08, { type: 'lowpass', f: rnd(500, 800), gain: .12 }); tone(70 * p, .05, { gain: .05 }); break;
    case 'stepMetal': noise(.06, { type: 'bandpass', f: 2400, q: 3, gain: .08 }); tone(320 * p, .06, { type: 'triangle', gain: .03 }); break;
    case 'hit_ore': noise(.14, { type: 'bandpass', f: 1600 * p, q: 1.5, gain: .32 }); tone(190 * p, .07, { type: 'square', gain: .04, f2: 120 }); break;
    case 'hit_tree': tone(170 * p, .13, { type: 'triangle', gain: .28, f2: 110 }); noise(.09, { type: 'bandpass', f: 650, q: 2, gain: .18 }); break;
    case 'hit_rock': noise(.11, { type: 'bandpass', f: 1800, q: 1.2, gain: .2 }); tone(420 * p, .06, { type: 'square', gain: .05, f2: 210 }); break;
    case 'hit_ent': case 'hit_frame': tone(260 * p, .07, { type: 'square', gain: .06, f2: 140 }); noise(.05, { type: 'bandpass', f: 3200, gain: .14 }); break;
    case 'mined': tone(640 * p, .07, { gain: .1, f2: 960 }); break;
    case 'treeFall': noise(.5, { type: 'lowpass', f: 1400, f2: 200, gain: .3, attack: .02 }); tone(90, .4, { type: 'triangle', gain: .15, f2: 50 }); break;
    case 'rockBreak': noise(.35, { type: 'bandpass', f: 900, f2: 300, q: .8, gain: .4 }); tone(120, .25, { type: 'square', gain: .05, f2: 60 }); break;
    case 'place': tone(150 * p, .12, { type: 'square', gain: .09, f2: 70 }); noise(.1, { type: 'lowpass', f: 900, gain: .28 }); tone(1150 * p, .14, { type: 'triangle', gain: .035, at: .02 }); break;
    case 'remove': tone(85 * p, .1, { type: 'square', gain: .08, f2: 170 }); noise(.08, { type: 'lowpass', f: 1200, gain: .2 }); break;
    case 'pickup': tone(980 * p, .045, { gain: .06, f2: 1400 }); break;
    case 'click': tone(660, .03, { type: 'triangle', gain: .035 }); break;
    case 'open': noise(.16, { type: 'bandpass', f: 900, f2: 2600, q: 2, gain: .1 }); break;
    case 'close': noise(.14, { type: 'bandpass', f: 2600, f2: 900, q: 2, gain: .08 }); break;
    case 'error': tone(118, .16, { type: 'triangle', gain: .09 }); tone(111, .16, { type: 'triangle', gain: .09 }); break;
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
    case 'servo': tone(300 * p, .2, { type: 'triangle', gain: .02, f2: 520 }); break;
    case 'crackle': noise(.03, { type: 'highpass', f: 3000, gain: rnd(.03, .09) }); break;
    case 'spill': tone(300, .08, { type: 'square', gain: .04 }); tone(240, .1, { type: 'square', gain: .04, at: .07 }); break;
    // guns: a crack of filtered noise for the report, a falling square for the punch, a little tail for the big ones
    case 'gun_pistol': bang({ size: .8, crack: .9, boom: .14 * p, tail: .5, thump: 160 * p, bright: 1.1, echo: .17 }); break;
    case 'gun_shotgun': bang({ size: 1.3, crack: .8, boom: .3 * p, tail: 1, thump: 85 * p, bright: .75, echo: .22 }); clack(.45, 1300, .25); clack(.6, 900, .3); break;
    case 'gun_rifle': bang({ size: 1.2, crack: 1.3, boom: .22 * p, tail: 1.2, thump: 110 * p, bright: 1.35, echo: .28 }); clack(.62, 1800, .2); clack(.78, 1100, .22); break;
    case 'gun_smg': bang({ size: .55, crack: .7, boom: .07 * p, tail: .22, thump: 180 * p, bright: 1.2, echo: 0 }); break;
    case 'gun_assault_rifle': bang({ size: .75, crack: .9, boom: .1 * p, tail: .35, thump: 140 * p, bright: 1.2, echo: 0 }); break;
    case 'dry': tone(1900, .02, { type: 'triangle', gain: .05 }); noise(.025, { type: 'highpass', f: 4000, gain: .06 }); break;
    case 'reload': noise(.05, { type: 'bandpass', f: 1300, q: 2, gain: .12 }); tone(420, .04, { type: 'square', gain: .03, at: .02 }); noise(.05, { type: 'bandpass', f: 2200, q: 2, gain: .1, at: .28 }); break;
    case 'reloaded': noise(.04, { type: 'bandpass', f: 1800, q: 3, gain: .12 }); tone(620, .05, { type: 'square', gain: .035, at: .03 }); break;
    case 'snip': for (const at of [0, .16, .32]) noise(.04, { type: 'highpass', f: 3200, gain: .09, at }); break;
    case 'hit_animal': noise(.1, { type: 'lowpass', f: 700 * p, gain: .1 }); break;
    case 'animal_hit': noise(.07, { type: 'lowpass', f: 900, gain: .14 }); tone(220 * p, .05, { type: 'triangle', gain: .03, f2: 150 }); break;
    case 'chime': [1568, 2093, 2637, 3136].forEach((f, i) => tone(f * p, .5, { type: 'triangle', gain: .04, at: i * .05 + Math.random() * .03 })); break;
  }
}

// For tuning sounds without ears on: plays a one-shot into an offline context with the same bus, cut and compressor,
// and returns the rendered samples (console: (await import('/src/audio.js')).renderSfx('gun_rifle')).
export async function renderSfx(name, secs = 1.5) {
  const real = { ctx, sfxBus, noiseBuf }, off = new OfflineAudioContext(1, Math.ceil(48000 * secs), 48000);
  const comp = off.createDynamicsCompressor(); comp.threshold.value = -18; comp.ratio.value = 4;
  const soft = off.createBiquadFilter(); soft.type = 'highshelf'; soft.frequency.value = 5000; soft.gain.value = -9;
  const bus2 = off.createGain(); bus2.gain.value = .9; bus2.connect(soft); soft.connect(comp); comp.connect(off.destination);
  const nb = off.createBuffer(1, 48000 * 2, 48000), d = nb.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  ctx = off; sfxBus = bus2; noiseBuf = nb;
  try { play(name, 1); } finally { ({ ctx, sfxBus, noiseBuf } = real); }
  return (await off.startRendering()).getChannelData(0);
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
  // labs and transmitters: a soft low hum with a slow breath, not the high beating tones they used to make
  loop('shimmer', g => {
    const am = ctx.createGain(); am.gain.value = .6; lfoOn(am.gain, .35, .3);
    const f = filt('lowpass', 600); osc('triangle', 196).connect(f); osc('sine', 294).connect(f); f.connect(am).connect(g);
    noiseSrc().connect(filt('bandpass', 900, 3)).connect(am);
  });
}
const LOOP_LEVEL = { wind: .1, belt: .14, drill: .3, fire: .22, machine: .07, engine: .25, shimmer: .05 };

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
      sfx(under?.belt ? 'stepMetal' : 'step');
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
      case 'belt': case 'underground': case 'splitter': if (active && e.nItems) w.belt += near * .25; break;
      case 'drill': if (e.status === 'mining') w.drill += near * .6; break;
      case 'furnace': if (e.crafting && active) (ENTITIES[e.type].burner ? (w.fire += near * .6) : (w.machine += near * .5)); break;
      case 'assembler': if (e.crafting && active) w.machine += near * .6; break;
      case 'fgen': w.engine += near * (e.load || 0) * 1.4; break;
      case 'oilpump': if ((e.load || 0) > 0) w.drill += near * .35; break;
      case 'fpump': if ((e.load || 0) > 0) w.machine += near * .3; break;
      case 'lab': case 'transmitter': if (active) w.shimmer += near; break;
      case 'inserter': {
        const was = prevHeld.get(e);
        if (!was && e.held && d2 < 100 && servos < 3) { servos++; sfx('servo'); }
        prevHeld.set(e, e.held);
        break;
      }
    }
  }
  for (const v of world.vehicles) {   // engines idle when parked and roar with speed
    if (!VEHICLES[v.type]?.engine) continue;
    const dx = v.x - p.x, dz = v.z - p.z, d2 = dx * dx + dz * dz;
    if (d2 < 400) w.engine += 1 / (1 + d2 / 30) * (.15 + Math.min(1.2, Math.abs(v.v || 0) / 5)) * (p.veh === v.id ? 1.4 : 1);
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
// Gunfire is loud near you and fades with distance; your own shots always at full. Hits, chimes and dry clicks too.
const near = (x, z, r) => Math.max(0, 1 - Math.hypot(x - S.player.x, z - S.player.z) / r);
bus.on('shot', s => sfx('gun_' + s.gun, 0, s.by === S.player.id ? 1 : near(s.x, s.z, 70) ** 1.5 * .8));
bus.on('animalfx', f => { if (f.kind === 'chime') sfx('chime', .3, near(f.x, f.z, 30)); else if (f.kind === 'hit') sfx('animal_hit', .03, near(f.x, f.z, 40)); });
bus.on('dry', () => sfx('dry', .1));
bus.on('reload', () => sfx('reload'));
bus.on('reloaded', () => sfx('reloaded'));
bus.on('sheared', () => sfx('snip'));
