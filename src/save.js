// Save / load to localStorage, and the entity format shared with co-op sync.
// Saves are per-browser and can disappear, so every storage access is guarded.
import { S, world, inv, bus, key, GRID, generateWater, dryAround, loadBars, WATER_GEN } from './state.js';
import { place } from './sim.js';
import { ENTITIES, TILE } from './data.js';

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

// ---------------------------------------------------------------- surface tiles
// Run-length text: each run is "code.length" in base 36, where code = tile * 5 + flow direction + 1.
function packTiles() {
  const out = []; let prev = -1, run = 0;
  for (let i = 0; i < GRID * GRID; i++) {
    const c = world.tiles[i] * 5 + world.flow[i] + 1;
    if (c === prev) { run++; continue; }
    if (run) out.push(prev.toString(36) + '.' + run.toString(36));
    prev = c; run = 1;
  }
  out.push(prev.toString(36) + '.' + run.toString(36));
  return out.join(',');
}
function unpackTiles(s) {
  world.tiles.fill(0); world.flow.fill(-1);
  let i = 0;
  for (const part of s.split(',')) {
    const [c, r] = part.split('.').map(v => parseInt(v, 36));
    for (let k = 0; k < r && i < GRID * GRID; k++, i++) { world.tiles[i] = Math.floor(c / 5); world.flow[i] = c % 5 - 1; }
  }
}

// ---------------------------------------------------------------- whole world
export function serialize() {
  return JSON.stringify({
    v: 3, T: S.T, player: { x: S.player.x, z: S.player.z, face: S.player.face }, maxTier: S.maxTier, hotbar: S.hotbar, bars: S.bars, bar: S.bar, hotbarSeen: [...S.hotbarSeen], cam: S.cam, pix: S.pix,
    seed: S.seed, tiles: packTiles(), waterGen: WATER_GEN, links: world.links, marks: world.marks,
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
    Object.assign(S.player, d.player); loadBars(d.bars, d.hotbar, d.bar); S.hotbarSeen = new Set(d.hotbarSeen || []); Object.assign(S.cam, d.cam); S.pix = d.pix || 3;
    S.player.craft = d.craft || []; S.goalsDone = new Set(d.goalsDone || []); S.remoteInv = d.remoteInv || {};
    if (d.invSlots) inv.loadList(d.invSlots); else { inv.clear(); for (const [k, v] of d.inv || []) inv.add(k, v); }
  }
  S.research.done = new Set(d.research.done); S.research.current = d.research.current; S.research.progress = d.research.progress;
  Object.assign(S.signal, { stage: d.signal.stage, pulses: d.signal.pulses, taught: new Set(d.signal.taught), seen: new Set(d.signal.seen), log: d.signal.log });
  S.stats = d.stats;
  world.ores.clear(); for (const [k, type, amount] of d.ores) world.ores.set(k, { type, amount });
  world.feats.clear(); for (const [k, type, v] of d.feats || []) world.feats.set(k, { type, v });
  world.ground.length = 0; world.ground.push(...(d.ground || []));
  S.seed = d.seed ?? 20261013;
  if (d.tiles && d.waterGen === WATER_GEN) unpackTiles(d.tiles);
  else {   // saved before water existed, or by an older water generator: redo it, but never under anything already there
    generateWater(S.seed);
    for (const o of d.ents) if (o.y === 0 && !ENTITIES[o.t]?.onWater) dryAround(o.x, o.z, 1);
    for (const o of d.ents) if (o.y === 0 && ENTITIES[o.t]?.onWater) world.tiles[o.z * GRID + o.x] = TILE.water;   // pumps keep their water
    for (const [x, y, z] of d.frames) if (y === 0) dryAround(x, z, 1);
    for (const k of world.feats.keys()) { const [x, , z] = k.split(',').map(Number); dryAround(x, z); }
    for (const g of world.ground) dryAround(g.x, g.z);
    for (const p of [d.player, ...Object.values(d.remoteInv || {})]) if (p) dryAround(p.x, p.z, 2);
  }
  world.links = (d.links || []).filter(l => Array.isArray(l.a) && Array.isArray(l.b));
  world.marks = d.marks?.markers ? d.marks : { markers: [], areas: [], next: 1 };
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
