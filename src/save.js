// Save / load to localStorage, and the entity format shared with co-op sync.
// Saves are per-browser and can disappear, so every storage access is guarded.
import { S, world, inv, bus, key } from './state.js';
import { place } from './sim.js';

const SLOT = 'depthworks.save.v3';
const FIELDS = ['recipe', 'filter', 'inp', 'out', 'fuel', 'fuelType', 'burn', 'held', 'buffer', 'role', 'crafting', 'prog', 'charging', 'timer', 'load', 'unit'];

export function hasSave() { try { return !!localStorage.getItem(SLOT); } catch { return false; } }
export function wipeSave() { try { localStorage.removeItem(SLOT); } catch { /* storage unavailable */ } }

// ---------------------------------------------------------------- entities <-> plain data
export function entToJSON(e) {
  if (e.kind === 'frame') return { t: 'frame', x: e.x, y: e.y, z: e.z };
  const o = { t: e.type, x: e.x, y: e.y, z: e.z, d: e.dir, dy: e.dy };
  for (const f of FIELDS) if (e[f] !== undefined) o[f] = e[f];
  if (e.items) o.items = e.items.map(i => [i.type, +i.p.toFixed(3)]);
  if (e.store) o.store = e.store.toList();
  if (e.pair) o.pair = [e.pair.x, e.pair.z];
  return o;
}
// Chests hold slot lists; saves from before slots stored { item: count }.
function loadStore(e, s) {
  if (!e.store || !s) return;
  if (Array.isArray(s)) e.store.loadList(s); else { e.store.clear(); for (const [k, v] of Object.entries(s)) e.store.add(k, v); }
}
// Copy state onto an existing entity. Rebuilds its model if something visible changed.
export function applyEntJSON(e, o, forceRemesh = false) {
  const visual = forceRemesh || o.d !== e.dir || (o.dy ?? 0) !== (e.dy ?? 0) || (o.recipe ?? null) !== (e.recipe ?? null) || (o.role ?? null) !== (e.role ?? null);
  for (const f of FIELDS) if (o[f] !== undefined) e[f] = o[f] && typeof o[f] === 'object' ? { ...o[f] } : o[f];
  if (o.items && e.items) e.items = o.items.map(([type, p]) => ({ type, p }));
  loadStore(e, o.store);
  if (o.st !== undefined) e.status = o.st;
  if (o.age !== undefined) e.lastActive = S.T - o.age;
  if (o.ph !== undefined) e.t = o.ph;   // inserter swing phase
  if (o.pair) { const p = world.ents.get(key(o.pair[0], e.y, o.pair[1])); if (p) { e.pair = p; p.pair = e; } }
  if (visual) {
    e.dir = o.d; e.dy = o.dy ?? 0;
    if (e.items) world.beltDirty = true;
    bus.emit('remesh', e);
  }
}
export function entFromJSON(o) {
  if (o.t === 'frame') return place('frame', o.x, o.y, o.z, 0, 0, true);
  const e = place(o.t, o.x, o.y, o.z, o.d, o.dy, true);
  if (typeof e !== 'object' || !e) return e;
  for (const f of FIELDS) if (o[f] !== undefined) e[f] = o[f] && typeof o[f] === 'object' ? { ...o[f] } : o[f];
  if (o.items) e.items = o.items.map(([type, p]) => ({ type, p }));
  loadStore(e, o.store);
  e.dy = o.dy;
  return e;
}

// ---------------------------------------------------------------- whole world
export function serialize() {
  return JSON.stringify({
    v: 3, T: S.T, player: { x: S.player.x, z: S.player.z, face: S.player.face }, maxTier: S.maxTier, hotbar: S.hotbar, hotbarSeen: [...S.hotbarSeen], cam: S.cam, pix: S.pix,
    research: { done: [...S.research.done], current: S.research.current, progress: S.research.progress },
    signal: { stage: S.signal.stage, pulses: S.signal.pulses, taught: [...S.signal.taught], seen: [...S.signal.seen], log: S.signal.log },
    stats: S.stats, craft: S.player.craft, goalsDone: [...(S.goalsDone || [])], remoteInv: S.remoteInv || {},
    invSlots: inv.toList(), ores: [...world.ores].map(([k, o]) => [k, o.type, o.amount]),
    frames: [...world.frames.values()].map(f => [f.x, f.y, f.z]), ents: [...world.ents.values()].map(entToJSON),
    feats: [...world.feats].map(([k, f]) => [k, f.type, +f.v.toFixed(3)]), ground: world.ground,
  });
}

export function save() {
  if (S.net.role === 'client') return false;   // a friend's world belongs to the host
  bus.emit('beforesave');
  try { localStorage.setItem(SLOT, serialize()); bus.emit('saved'); return true; } catch { return false; }
}

export function load() {
  let d;
  try { d = JSON.parse(localStorage.getItem(SLOT)); } catch { return false; }
  return loadData(d);
}

// asGuest: joining a friend's world, so keep our own camera, hotbar and settings, and take no inventory from it.
export function loadData(d, asGuest = false) {
  if (!d || d.v !== 3) return false;
  S.T = d.T; S.maxTier = d.maxTier;
  if (!asGuest) {
    Object.assign(S.player, d.player); S.hotbar = d.hotbar; S.hotbarSeen = new Set(d.hotbarSeen || []); Object.assign(S.cam, d.cam); S.pix = d.pix || 3;
    S.player.craft = d.craft || []; S.goalsDone = new Set(d.goalsDone || []); S.remoteInv = d.remoteInv || {};
    if (d.invSlots) inv.loadList(d.invSlots); else { inv.clear(); for (const [k, v] of d.inv || []) inv.add(k, v); }
  }
  S.research.done = new Set(d.research.done); S.research.current = d.research.current; S.research.progress = d.research.progress;
  Object.assign(S.signal, { stage: d.signal.stage, pulses: d.signal.pulses, taught: new Set(d.signal.taught), seen: new Set(d.signal.seen), log: d.signal.log });
  S.stats = d.stats;
  world.ores.clear(); for (const [k, type, amount] of d.ores) world.ores.set(k, { type, amount });
  world.feats.clear(); for (const [k, type, v] of d.feats || []) world.feats.set(k, { type, v });
  world.ground.length = 0; world.ground.push(...(d.ground || []));
  for (const [x, y, z] of d.frames) place('frame', x, y, z, 0, 0, true);
  const byPos = new Map();
  for (const o of d.ents) {
    const e = entFromJSON(o);
    if (typeof e === 'object' && e) byPos.set(o.x + ',' + o.y + ',' + o.z, [e, o]);
  }
  for (const [, [e]] of byPos) if (e.kind === 'underground') e.pair = null;
  for (const [, [e, o]] of byPos) {
    if (o.pair) { e.pair = byPos.get(o.pair[0] + ',' + o.y + ',' + o.pair[1])?.[0] ?? null; e.pair && (e.pair.pair = e); }
    bus.emit('remesh', e);
  }
  world.beltDirty = true; world.powerDirty = true;
  return true;
}
