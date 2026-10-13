// Shared mutable game state.
import { ITEMS, TECH, RECIPE, TIERS, PLAYER } from './data.js';

export const GRID = 96;
const K = GRID / 64;  // world layout was designed on a 64 grid
export const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]];
export const DIR_NAMES = ['north', 'east', 'south', 'west'];
export const LAYER_MIN = -2, LAYER_MAX = 4;
export const key = (x, y, z) => x + ',' + y + ',' + z;

export const S = {
  T: 0,
  mode: 'flat', layer: 0,
  sel: null, dir: 0, dy: 0, handMine: null,
  maxTier: 0, activeVol: 0,
  hotbar: [], hotbarSeen: new Set(),
  research: { done: new Set(), current: null, progress: {} },
  power: { demand: 0, nextDemand: 0, capacity: 0, sat: 1, produced: 0 },
  stats: { made: {} },
  signal: { started: false, stage: -1, pulses: 0, taught: new Set(), seen: new Set(), log: [] },
  altMode: true,
  net: { role: 'solo' },        // 'solo' | 'host' | 'client'
};

// ---------------------------------------------------------------- players
// Every engineer has their own body, inventory and crafting queue. S.player is the one on this screen.
export function newPlayer(id, name = 'Engineer', color = 0xe07a2e, local = false) {
  return { id, name, color, local, x: 48.5, z: 52.5, vx: 0, vz: 0, face: 0, walk: 0, moving: false,
    mining: null, mineCell: null, pickup: false, inv: local ? null : new Inventory(PLAYER.inventory), craft: [] };
}

// ---------------------------------------------------------------- inventories
// Real slots, like Factorio: each slot holds one stack, and stacks stay where you put them.
// Used for the engineer and for chests; machines expose their own typed slots (see sim.js).
export class Inventory {
  constructor(size) { this.slots = new Array(size).fill(null); }
  count(it) { let n = 0; for (const s of this.slots) if (s && s.it === it) n += s.n; return n; }
  room(it) { const st = stackOf(it); let r = 0; for (const s of this.slots) r += !s ? st : s.it === it ? st - s.n : 0; return r; }
  // Fill partial stacks of the same item first, then empty slots in order. Returns what did not fit.
  add(it, n) {
    if (n <= 0) return 0;
    const st = stackOf(it);
    for (const s of this.slots) if (n > 0 && s && s.it === it && s.n < st) { const k = Math.min(n, st - s.n); s.n += k; n -= k; }
    for (let i = 0; i < this.slots.length && n > 0; i++) if (!this.slots[i]) { const k = Math.min(n, st); this.slots[i] = { it, n: k }; n -= k; }
    return n;
  }
  // Take from the last stacks first, so the front of the inventory stays put.
  remove(it, n) {
    let got = 0;
    for (let i = this.slots.length - 1; i >= 0 && got < n; i--) {
      const s = this.slots[i];
      if (s && s.it === it) { const k = Math.min(n - got, s.n); s.n -= k; got += k; if (!s.n) this.slots[i] = null; }
    }
    return got;
  }
  counts() { const m = new Map(); for (const s of this.slots) if (s) m.set(s.it, (m.get(s.it) || 0) + s.n); return m; }
  used() { let n = 0; for (const s of this.slots) if (s) n++; return n; }
  clear() { this.slots.fill(null); }
  isEmpty() { return this.slots.every(s => !s); }
  toList() { return this.slots.map(s => s ? [s.it, s.n] : 0); }
  loadList(list) { this.clear(); (list || []).forEach((s, i) => { if (s && i < this.slots.length) this.slots[i] = { it: s[0], n: s[1] }; }); }
  // A full slot list, or the old [item, count] totals from before inventories had slots.
  loadAny(list) {
    if (!Array.isArray(list)) return;
    if (list.length === this.slots.length) this.loadList(list);
    else { this.clear(); for (const s of list) if (s) this.add(s[0], s[1]); }
  }
  // single-slot operations for drag and drop
  slotAccept(i, it) { const s = this.slots[i]; return !s ? stackOf(it) : s.it === it ? stackOf(it) - s.n : 0; }
  slotPut(i, it, n) { const k = Math.min(n, this.slotAccept(i, it)); if (k <= 0) return 0; const s = this.slots[i]; if (s) s.n += k; else this.slots[i] = { it, n: k }; return k; }
  slotTake(i, n) { const s = this.slots[i]; if (!s) return 0; const k = Math.min(n, s.n); s.n -= k; if (!s.n) this.slots[i] = null; return k; }
}
export const inv = new Inventory(PLAYER.inventory);
S.player = newPlayer('local', 'Engineer', 0xe07a2e, true);
S.player.inv = inv;
S.players = new Map([[S.player.id, S.player]]);
// `actor` is whoever is acting right now. Game rules read inventories and positions through it,
// so the host can run a friend's action with exactly the same code as its own.
export let actor = S.player;
export function setActor(p) { actor = p || S.player; }
export function asActor(p, fn) { const prev = actor; actor = p; try { return fn(); } finally { actor = prev; } }
// Feedback (toasts, floating text, pickup sounds) goes to whoever caused it.
export function notify(ev, ...a) { if (actor.local) bus.emit(ev, ...a); else bus.emit('remote', actor, ev, a); }

export const world = {
  ents: new Map(),    // key -> entity (one per cell)
  frames: new Map(),  // key -> frame (hollow, can share a cell with an entity)
  ores: new Map(),    // key -> { type, amount }
  feats: new Map(),   // key -> { type: 'tree' | 'rock' } (surface only)
  ground: [],         // items lying on the ground: { type, x, z }
  beltOrder: [], beltDirty: true,
};

export const invGet = it => actor.inv.count(it);
export function invAdd(it, n = 1) {
  if (n > 0) { const left = actor.inv.add(it, n); for (let i = 0; i < left; i++) spill(it, actor.x, actor.z); }
  else if (n < 0) actor.inv.remove(it, -n);
  if (actor.local) bus.emit('inv');
}
export function invTake(it, n = 1) { if (invGet(it) < n) return false; invAdd(it, -n); return true; }

// Slot accounting, shared by the character and by chests.
export const stackOf = it => ITEMS[it]?.stack ?? 50;
export const invRoom = it => actor.inv.room(it);
// Give items to the player. Whatever does not fit spills onto the ground at their feet.
export function invGive(it, n = 1) {
  if (n <= 0) return 0;
  const fit = Math.min(n, invRoom(it));
  if (fit > 0) invAdd(it, fit);
  for (let i = fit; i < n; i++) spill(it, actor.x, actor.z);
  if (fit < n) notify('spill', n - fit);
  return fit;
}
export function spill(type, x, z) {
  const a = Math.random() * Math.PI * 2, r = .2 + Math.random() * .5;
  world.ground.push({ type, x: Math.min(GRID - .1, Math.max(.1, x + Math.cos(a) * r)), z: Math.min(GRID - .1, Math.max(.1, z + Math.sin(a) * r)) });
}

const listeners = {};
export const bus = {
  on(ev, fn) { (listeners[ev] ||= []).push(fn); },
  emit(ev, ...a) { (listeners[ev] || []).forEach(f => f(...a)); },
};

export function rng(seed) {
  return () => { seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
export function hash01(str) { let h = 2166136261; for (const c of String(str)) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return ((h >>> 0) % 100000) / 100000; }

export const isResearched = id => !id || S.research.done.has(id);
export const recipeUnlocked = r => isResearched(r.tech);
export const itemName = it => ITEMS[it]?.name ?? it;

// Which layers can be built on right now: research opens the ground, precision opens the sky.
export function layerRange() {
  const t = TIERS[S.maxTier];
  let lo = 0;
  if (isResearched('excavation') && S.maxTier >= 1) lo = -1;
  if (isResearched('deep_excavation') && S.maxTier >= 2) lo = -2;
  return [lo, t.up];
}
export function layerLockReason(y) {
  if (y > TIERS[S.maxTier].up) return `layer ${y} needs more precision`;
  if (y === -1) return 'layer -1 needs Excavation research and precision 1';
  if (y <= -2) return 'layer -2 needs Deep excavation research and precision 2';
  return 'locked';
}

export function generateOres(seed = 20261013) {
  world.ores.clear();
  const R = rng(seed), C = GRID / 2;
  const patch = (cx, cz, rad, y, type, rich = 1) => {
    cx *= K; cz *= K; rad *= 1.25;
    for (let x = Math.floor(cx - rad); x <= cx + rad; x++) for (let z = Math.floor(cz - rad); z <= cz + rad; z++) {
      if (x < 0 || z < 0 || x >= GRID || z >= GRID) continue;
      const d = Math.hypot(x - cx, z - cz);
      if (d > rad || R() < d / rad * .55) continue;
      const far = 1 + Math.hypot(x - C, z - C) / 20;
      world.ores.set(key(x, y, z), { type, amount: Math.round((250 + R() * 500) * far * rich * (1 - d / rad * .5)) });
    }
  };
  // surface, near spawn
  patch(25, 30, 4, 0, 'iron_ore'); patch(38, 27, 3.5, 0, 'copper_ore');
  patch(30, 39, 3, 0, 'coal'); patch(37, 37, 2.6, 0, 'stone');
  // surface, further out
  patch(11, 14, 5, 0, 'iron_ore'); patch(51, 12, 4.5, 0, 'copper_ore'); patch(49, 49, 4.5, 0, 'coal');
  patch(13, 50, 4, 0, 'stone'); patch(54, 33, 4, 0, 'iron_ore'); patch(21, 55, 4, 0, 'copper_ore'); patch(8, 32, 3.5, 0, 'coal');
  // layer -1
  patch(40, 41, 3, -1, 'crystal', 1.5); patch(22, 21, 3, -1, 'crystal', 1.5); patch(51, 22, 3.5, -1, 'crystal', 2);
  patch(30, 47, 4, -1, 'iron_ore', 3); patch(45, 33, 3.5, -1, 'copper_ore', 3);
  // layer -2
  patch(32, 32, 4, -2, 'abyssal_ore', 2); patch(12, 41, 3.5, -2, 'abyssal_ore', 3); patch(46, 14, 3, -2, 'crystal', 3);
}

// Trees in clumps and rocks scattered; nothing on ore or right next to spawn.
export function generateFeatures(seed = 77) {
  world.feats.clear();
  const R = rng(seed), sx = S.player.x, sz = S.player.z;
  const ok = (x, z) => x >= 0 && z >= 0 && x < GRID && z < GRID && !world.ores.has(key(x, 0, z)) && Math.hypot(x - sx, z - sz) > 6;
  for (let f = 0; f < 22; f++) {
    const cx = R() * GRID, cz = R() * GRID, rad = 3 + R() * 6;
    for (let i = 0; i < rad * rad * 1.4; i++) {
      const a = R() * Math.PI * 2, d = Math.sqrt(R()) * rad, x = Math.floor(cx + Math.cos(a) * d), z = Math.floor(cz + Math.sin(a) * d);
      if (ok(x, z)) world.feats.set(key(x, 0, z), { type: 'tree', v: R() });
    }
  }
  for (let i = 0; i < 70; i++) { const x = Math.floor(R() * GRID), z = Math.floor(R() * GRID); if (ok(x, z)) world.feats.set(key(x, 0, z), { type: 'rock', v: R() }); }
  // always a small wood and a couple of rocks within a short walk of the landing site
  for (let i = 0; i < 18; i++) { const x = Math.floor(sx + 9 + (R() - .5) * 6), z = Math.floor(sz - 7 + (R() - .5) * 6); if (ok(x, z)) world.feats.set(key(x, 0, z), { type: 'tree', v: R() }); }
  for (const [x, z] of [[sx - 7, sz + 3], [sx - 6, sz + 6]]) if (ok(Math.floor(x), Math.floor(z))) world.feats.set(key(Math.floor(x), 0, Math.floor(z)), { type: 'rock', v: R() });
}

// The Factorio start: a handful of plates, one burner drill, one furnace. Everything else you make.
export function startingInventory() {
  inv.clear(); world.ground.length = 0;
  for (const [k, v] of Object.entries({ iron_plate: 8, burner_drill: 1, furnace: 1 })) inv.add(k, v);
}

export function recipeFor(item) { return RECIPE[item]; }
export function techUnlocks(t) { return TECH[t]?.unlocks ?? []; }
