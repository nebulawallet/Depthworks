// Save / load to localStorage. Saves are per-browser and can disappear, so every access is guarded.
import { S, world, inv, bus } from './state.js';
import { place } from './sim.js';

const SLOT = 'depthworks.save.v3';

export function hasSave() { try { return !!localStorage.getItem(SLOT); } catch { return false; } }
export function wipeSave() { try { localStorage.removeItem(SLOT); } catch { /* storage unavailable */ } }

export function serialize() {
  const ents = [];
  for (const e of world.ents.values()) {
    const o = { t: e.type, x: e.x, y: e.y, z: e.z, d: e.dir, dy: e.dy };
    for (const f of ['recipe', 'filter', 'inp', 'out', 'store', 'count', 'fuel', 'fuelType', 'burn', 'held', 'buffer', 'role', 'crafting', 'prog', 'charging', 'timer']) if (e[f] !== undefined && e[f] !== null) o[f] = e[f];
    if (e.items) o.items = e.items.map(i => [i.type, +i.p.toFixed(3)]);
    if (e.pair) o.pair = [e.pair.x, e.pair.z];
    ents.push(o);
  }
  return JSON.stringify({
    v: 3, T: S.T, player: { x: S.player.x, z: S.player.z, face: S.player.face }, maxTier: S.maxTier, hotbar: S.hotbar, hotbarSeen: [...S.hotbarSeen], cam: S.cam, pix: S.pix,
    research: { done: [...S.research.done], current: S.research.current, progress: S.research.progress },
    signal: { stage: S.signal.stage, pulses: S.signal.pulses, taught: [...S.signal.taught], seen: [...S.signal.seen], log: S.signal.log },
    stats: S.stats, craft: S.craft, goalsDone: [...(S.goalsDone || [])],
    inv: [...inv], ores: [...world.ores].map(([k, o]) => [k, o.type, o.amount]),
    frames: [...world.frames.values()].map(f => [f.x, f.y, f.z]), ents,
    feats: [...world.feats].map(([k, f]) => [k, f.type, +f.v.toFixed(3)]), ground: world.ground,
  });
}

export function save() {
  try { localStorage.setItem(SLOT, serialize()); bus.emit('saved'); return true; } catch { return false; }
}

export function load() {
  let d;
  try { d = JSON.parse(localStorage.getItem(SLOT)); } catch { return false; }
  if (!d || d.v !== 3) return false;
  S.T = d.T; Object.assign(S.player, d.player); S.maxTier = d.maxTier; S.hotbar = d.hotbar; S.hotbarSeen = new Set(d.hotbarSeen || []); Object.assign(S.cam, d.cam); S.pix = d.pix || 3;
  S.research.done = new Set(d.research.done); S.research.current = d.research.current; S.research.progress = d.research.progress;
  Object.assign(S.signal, { stage: d.signal.stage, pulses: d.signal.pulses, taught: new Set(d.signal.taught), seen: new Set(d.signal.seen), log: d.signal.log });
  S.stats = d.stats; S.craft = d.craft || []; S.goalsDone = new Set(d.goalsDone || []);
  inv.clear(); for (const [k, v] of d.inv) inv.set(k, v);
  world.ores.clear(); for (const [k, type, amount] of d.ores) world.ores.set(k, { type, amount });
  world.feats.clear(); for (const [k, type, v] of d.feats || []) world.feats.set(k, { type, v });
  world.ground.length = 0; world.ground.push(...(d.ground || []));
  for (const [x, y, z] of d.frames) place('frame', x, y, z, 0, 0, true);
  const byPos = new Map();
  for (const o of d.ents) {
    const e = place(o.t, o.x, o.y, o.z, o.d, o.dy, true);
    if (typeof e === 'string') continue;
    for (const f of ['recipe', 'filter', 'inp', 'out', 'store', 'count', 'fuel', 'fuelType', 'burn', 'held', 'buffer', 'role', 'crafting', 'prog', 'charging', 'timer']) if (o[f] !== undefined) e[f] = o[f];
    if (o.items) e.items = o.items.map(([type, p]) => ({ type, p }));
    e.dy = o.dy;
    byPos.set(o.x + ',' + o.y + ',' + o.z, [e, o]);
  }
  for (const [, [e]] of byPos) if (e.kind === 'underground') e.pair = null;
  for (const [, [e, o]] of byPos) {
    if (o.pair) { e.pair = byPos.get(o.pair[0] + ',' + o.y + ',' + o.pair[1])?.[0] ?? null; e.pair && (e.pair.pair = e); }
    bus.emit('remesh', e);
  }
  world.beltDirty = true; world.powerDirty = true;
  return true;
}
