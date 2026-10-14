// Shared mutable game state.
import { ITEMS, TECH, RECIPE, TIERS, PLAYER, TILES, TILE, HOTBARS, HOTBAR_SIZE, DEPOSIT, DAY } from './data.js';

// Tiles per side of the world. Worlds made before chunks are 96; new ones are 500 to 65536 (see worldgen.js).
export let GRID = 96;
export function setWorldSize(n) { GRID = n; }
const K = 96 / 64;  // the old fixed layout was designed on a 64 grid
// The world is made of CHUNK×CHUNK chunks, generated the first time anything asks about them (worldgen.js).
export const CHUNK = 32;
export const chunkKey = (cx, cz) => cz * 4096 + cx;
// The landing site: fixed on old worlds, found by worldgen.js on new ones.
export const SPAWN = { x: 48.5, z: 52.5 };
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
  seed: 20261013,               // world seed for water; ores and trees use their own fixed layout
  bars: [], bar: 0,             // quickbars (see HOTBARS); S.hotbar is bars[0]
  hideUI: false,
  sandbox: false,               // sandbox worlds: everything researched, crafting free and instant, any item on request
  roadCfg: { w: 2, l: 2, m: 'dashed', sw: false, edges: true, cross: true },   // how the road in hand gets laid
};

// ---------------------------------------------------------------- players
// Every engineer has their own body, inventory and crafting queue. S.player is the one on this screen.
export function newPlayer(id, name = 'Engineer', color = 0xe07a2e, local = false) {
  return { id, name, color, local, x: SPAWN.x, z: SPAWN.z, vx: 0, vz: 0, face: 0, walk: 0, moving: false,
    mining: null, mineCell: null, pickup: false, inv: local ? null : new Inventory(PLAYER.inventory), craft: [],
    fac: 1, veh: null, drive: null, fed: 0,   // fac: the factory they build for; veh: the vehicle they drive; fed: well fed until
    hp: PLAYER.health, hurtT: -99, sta: PLAYER.stamina, staT: -99, tired: false };   // health, stamina, and when each was last used
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

// Buildings by tile. A building covering several tiles is stored under its anchor tile, with its other tiles in `occ`
// (see multi.js): get() finds it from any of them, and iterating sees each building once.
class EntMap extends Map {
  constructor() { super(); this.occ = new Map(); }
  get(k) { return super.get(k) ?? this.occ.get(k); }
  has(k) { return super.has(k) || this.occ.has(k); }
  clear() { super.clear(); this.occ.clear(); }
}
export const world = {
  ents: new EntMap(),   // key -> entity (see EntMap)
  frames: new Map(),  // key -> frame (hollow, can share a cell with an entity)
  ores: new Map(),    // key -> { type, base, layer, amount } (see newDeposit)
  feats: new Map(),   // key -> { type: 'tree' | 'rock' } (surface only)
  ground: [],         // items lying on the ground: { type, x, z }
  lines: [], beltDirty: true,   // belt lines, downstream first (see belts.js)
  // The surface lives in chunks: chunkKey -> { tiles, flow, biome, patch, ores, feats, oil } (see worldgen.js).
  // `gen` is a generated world's seed and options (null for a world from before chunks, whose tiles are in
  // `tiles` / `flow`), and `edits` is everything changed since generation: that is what saves keep.
  chunks: new Map(), gen: null, edits: { feats: new Set(), ores: new Map(), oil: new Map(), patches: new Set() },
  tiles: null, flow: null,
  links: [],          // cables strung by hand: { kind: item id, a: [x, y, z], b: [x, y, z] }
  marks: { markers: [], areas: [], next: 1 },   // map markers and labelled areas
  oil: new Map(),     // "x,z" -> { yield } crude oil wells on the surface (percent)
  roads: new Map(),   // "x,z" -> road tile (see transport.js)
  vehicles: [],       // cars, trucks, tanks, boats, locomotives and wagons
  units: [],          // what moves along a route: a truck, a boat, or a train of cars
  routes: [],         // schedules shared by units: { id, name, way, loop, stops }
  factories: [{ id: 1, name: 'Main factory', color: '#7ef6ff' }], facNext: 2,
  fish: [], fishBodies: [],   // fish swimming in each body of water, and how many each can hold
  nextId: 1,
};
// Factories are separate networks inside one world: everything built belongs to one (see sim.js sameFac).
// The tiles a building covers: its footprint for the ones that span several (see multi.js), else its own tile.
export const tilesOf = e => e.foot || [[e.x, e.z]];
export const factoryOf = id => world.factories.find(f => f.id === id) || null;
export const FAC_COLORS = ['#7ef6ff', '#ffd23f', '#9be37a', '#ff8a3d', '#ff5a7a', '#b07ad8', '#e8ecf2', '#4aa3ff'];
let genChunk = null, genUnder = null;
export const setChunkGen = (f, u) => { genChunk = f; genUnder = u; };
export const inWorld = (x, z) => x >= 0 && z >= 0 && x < GRID && z < GRID;
// The chunk holding tile (x, z), made now if it doesn't exist yet. Null outside the world.
export function chunkOf(x, z) {
  if (!(x >= 0 && z >= 0 && x < GRID && z < GRID)) return null;
  const cx = Math.floor(x / CHUNK), cz = Math.floor(z / CHUNK);
  return world.chunks.get(chunkKey(cx, cz)) || (genChunk ? genChunk(cx, cz) : null);
}
// The chunk at (x, z) with its underground layers made too: ask this before looking at deposits below the surface.
export function underOf(x, z) { const c = chunkOf(x, z); if (c && !c.under) genUnder?.(c); return c; }
const cellOf = (x, z) => (Math.floor(z) & (CHUNK - 1)) * CHUNK + (Math.floor(x) & (CHUNK - 1));
export const tileAt = (x, z) => { const c = chunkOf(x, z); return c ? c.tiles[cellOf(x, z)] : 0; };
export const isWater = (x, z) => !!TILES[tileAt(x, z)].liquid;
export const flowAt = (x, z) => { const c = chunkOf(x, z); return c ? c.flow[cellOf(x, z)] : -1; };
export const biomeIndexAt = (x, z) => { const c = chunkOf(x, z); return c ? c.biome[cellOf(x, z)] : 0; };
// Weedy patches: a variant of the ground that only the shovel cares about.
export const patchAt = (x, z) => { const c = chunkOf(x, z); return !!c && c.patch[cellOf(x, z)] === 1; };
export function clearPatch(x, z) { const c = chunkOf(x, z); if (c) c.patch[cellOf(x, z)] = 0; world.edits.patches.add(x + ',' + z); }
// Trees and rocks, once mined, stay gone even after their chunk is made again from the seed.
export function removeFeat(k) { world.feats.delete(k); world.edits.feats.add(k); }

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
// ---------------------------------------------------------------- day and night
// The world clock S.T sets the time of day, so saves and friends agree on it.
export const dayPhase = (T = S.T) => ((T / DAY.length + DAY.start) % 1 + 1) % 1;
const smooth = t => t * t * (3 - 2 * t);
export function daylight(T = S.T) {
  const p = dayPhase(T);
  if (p < DAY.dusk) return 1;
  if (p < DAY.night) return 1 - smooth((p - DAY.dusk) / (DAY.night - DAY.dusk));
  if (p < DAY.dawn) return 0;
  return smooth((p - DAY.dawn) / (1 - DAY.dawn));
}
// A sandbox world starts with every technology done and every layer open.
export function unlockAll() {
  for (const id of Object.keys(TECH)) S.research.done.add(id);
  S.research.current = null; S.maxTier = TIERS.length - 1;
}
// `extra`: recipes an old save keeps after research moved them (see save.js)
export const recipeUnlocked = r => isResearched(r.tech) || !!S.research.extra?.has(r.id);
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

// A deposit: `base` is the tile's generated richness, `layer` the deposit layer it is down to (see DEPOSIT) and
// `amount` what is left in that layer (an endless layer keeps its base, untouched). Deposits never vanish; they only get deeper.
export const endless = o => !DEPOSIT[o.layer]?.size;
export const layerSize = (o, layer) => DEPOSIT[layer]?.size ? Math.round(o.base * DEPOSIT[layer].size) : o.base;
export const newDeposit = (type, base, layer = 0) => { const o = { type, base, layer, amount: 0 }; o.amount = layerSize(o, layer); return o; };
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
      world.ores.set(key(x, y, z), newDeposit(type, Math.round((250 + R() * 500) * far * rich * (1 - d / rad * .5))));
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

// Crude oil: a few fields of wells away from the landing site, off ore and water. Yield is a percentage.
export function generateOil(seed = S.seed, avoid = () => false) {
  world.oil.clear();
  const R = rng(seed + 4111);
  const ok = (x, z) => x >= 1 && z >= 1 && x < GRID - 1 && z < GRID - 1 && !world.ores.has(key(x, 0, z)) && !isWater(x, z) && !avoid(x, z) && Math.hypot(x + .5 - SPAWN.x, z + .5 - SPAWN.z) > 16;
  for (let field = 0, tries = 0; field < 5 && tries < 200; tries++) {
    const cx = 6 + R() * (GRID - 12), cz = 6 + R() * (GRID - 12);
    if (!ok(Math.floor(cx), Math.floor(cz)) || [...world.oil.keys()].some(k => { const [x, z] = k.split(',').map(Number); return Math.hypot(x - cx, z - cz) < 14; })) continue;
    const wells = 3 + Math.floor(R() * 4), rich = .6 + R() * 1.2;
    for (let i = 0, t = 0; i < wells && t < 40; t++) {
      const x = Math.floor(cx + (R() - .5) * 7), z = Math.floor(cz + (R() - .5) * 7);
      if (!ok(x, z) || world.oil.has(x + ',' + z)) continue;
      world.oil.set(x + ',' + z, { yield: Math.round((50 + R() * 100) * rich) }); i++;
    }
    field++;
  }
}

// ---------------------------------------------------------------- water
export const WATER_GEN = 2;   // bump when generateWater changes: saves made by an older one get their water redone
function hashN(x, z, s) { let h = Math.imul(x | 0, 374761393) + Math.imul(z | 0, 668265263) + Math.imul(s | 0, 1442695041); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967295; }
function noise(x, z, s) {
  const xi = Math.floor(x), zi = Math.floor(z), xf = x - xi, zf = z - zi, u = xf * xf * (3 - 2 * xf), v = zf * zf * (3 - 2 * zf);
  const a = hashN(xi, zi, s), b = hashN(xi + 1, zi, s), c = hashN(xi, zi + 1, s), d = hashN(xi + 1, zi + 1, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
// Worlds from before chunks: oceans along the south and east edges, inland lakes, and sometimes a river that comes in from the north or
// west edge and drains into a lake. Water never covers ore or the landing site, and every surface ore stays
// reachable on foot (rivers end in inland lakes, so they never cut the map in two).
export function generateWater(seed = S.seed) {
  legacyArrays();
  const idx = (x, z) => z * GRID + x, inside = (x, z) => x >= 0 && z >= 0 && x < GRID && z < GRID;
  const blocked = new Uint8Array(GRID * GRID);
  for (const k of world.ores.keys()) {
    const [x, y, z] = k.split(',').map(Number); if (y !== 0) continue;
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) if (inside(x + dx, z + dz)) blocked[idx(x + dx, z + dz)] = 1;
  }
  for (let x = 0; x < GRID; x++) for (let z = 0; z < GRID; z++) if (Math.hypot(x + .5 - SPAWN.x, z + .5 - SPAWN.z) < 10) blocked[idx(x, z)] = 1;
  for (let attempt = 0; attempt < 8; attempt++) {
    const s = seed + attempt * 7919, R = rng(s);
    world.tiles.fill(TILE.ground); world.flow.fill(-1);
    const wet = (x, z, t = TILE.water) => { if (inside(x, z) && !blocked[idx(x, z)]) { world.tiles[idx(x, z)] = t; return true; } return false; };
    // ocean
    for (let x = 0; x < GRID; x++) for (let z = 0; z < GRID; z++) {
      const coast = 2.5 + noise(x * .13, z * .13, s) * 6;
      if (GRID - 1 - z < coast || (GRID - 1 - x < coast - 1 && z > GRID * .5)) wet(x, z);
    }
    // lakes, well inside the map so they never touch the ocean
    const lakes = [];
    for (let tries = 0; tries < 80 && lakes.length < 2 + (R() < .5 ? 1 : 0); tries++) {
      const rad = 3.5 + R() * 3, cx = 14 + R() * (GRID - 32), cz = 12 + R() * (GRID - 34);
      if (lakes.some(l => Math.hypot(l.x - cx, l.z - cz) < l.rad + rad + 8)) continue;
      if (Math.hypot(cx - SPAWN.x, cz - SPAWN.z) - rad < 24) continue;   // keep the landing area open
      let clear = true;
      for (let x = Math.floor(cx - rad - 2); x <= cx + rad + 2 && clear; x++) for (let z = Math.floor(cz - rad - 2); z <= cz + rad + 2; z++) if (!inside(x, z) || blocked[idx(x, z)]) { clear = false; break; }
      if (!clear) continue;
      const lake = { x: cx, z: cz, rad, cells: [] };
      for (let x = Math.floor(cx - rad - 1); x <= cx + rad + 1; x++) for (let z = Math.floor(cz - rad - 1); z <= cz + rad + 1; z++)
        if (Math.hypot(x + .5 - cx, z + .5 - cz) / rad + (noise(x * .35, z * .35, s + 1) - .5) * .6 < 1 && wet(x, z)) lake.cells.push(idx(x, z));
      if (lake.cells.length) lakes.push(lake);
    }
    // sometimes a short river out at the edge of the map; if several attempts fail the reachability check, try without one
    if (lakes.length && attempt < 5 && R() < .6) carveRiver(lakes, s, R, blocked);
    if (surfaceOreReachable()) return;
  }
  world.tiles.fill(TILE.ground); world.flow.fill(-1);   // give up on water rather than strand the player
}
// Rivers keep well clear of the landing site and ore, and take the shortest way in from the nearest north or
// west edge to a lake, so they sit at the side of the map instead of across the middle of it. The path is a
// cheapest wandering route (A* with noisy costs), one tile wide with stretches that widen to two.
function carveRiver(lakes, s, R, ore) {
  const idx = (x, z) => z * GRID + x;
  const blocked = new Uint8Array(ore);
  for (const k of world.ores.keys()) {
    const [x, y, z] = k.split(',').map(Number); if (y !== 0) continue;
    for (let dx = -3; dx <= 3; dx++) for (let dz = -3; dz <= 3; dz++) if (x + dx >= 0 && z + dz >= 0 && x + dx < GRID && z + dz < GRID) blocked[idx(x + dx, z + dz)] = 1;
  }
  for (let x = 0; x < GRID; x++) for (let z = 0; z < GRID; z++) if (Math.hypot(x + .5 - SPAWN.x, z + .5 - SPAWN.z) < 22) blocked[idx(x, z)] = 1;
  const options = [];
  for (const l of lakes) for (const [sx, sz] of [[l.x + (R() - .5) * 10, 0], [0, l.z + (R() - .5) * 10]]) {
    const x = Math.max(4, Math.min(GRID - 5, Math.round(sx))), z = Math.max(4, Math.min(GRID - 5, Math.round(sz)));
    const st = sz === 0 ? [x, 0] : [0, z];
    if (!blocked[idx(...st)] && world.tiles[idx(...st)] === TILE.ground) options.push({ lake: l, start: idx(...st), d: Math.hypot(st[0] - l.x, st[1] - l.z) - l.rad });
  }
  options.sort((a, b) => a.d - b.d);
  const pick = options[0];
  if (!pick || pick.d > 34) return;   // only short rivers
  const { lake, start } = pick, target = new Set(lake.cells);
  const cost = new Float32Array(GRID * GRID).fill(Infinity), prev = new Int32Array(GRID * GRID).fill(-1), heap = [];
  const push = (i, c) => { heap.push([c, i]); let j = heap.length - 1; while (j) { const p = (j - 1) >> 1; if (heap[p][0] <= heap[j][0]) break; [heap[p], heap[j]] = [heap[j], heap[p]]; j = p; } };
  const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let j = 0; for (;;) { const l = j * 2 + 1, r = l + 1; let m = j; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === j) break; [heap[m], heap[j]] = [heap[j], heap[m]]; j = m; } } return top; };
  cost[start] = 0; push(start, 0);
  let end = -1;
  const closed = new Uint8Array(GRID * GRID);
  while (heap.length) {
    const i = pop()[1], c = cost[i];
    if (closed[i]) continue;
    closed[i] = 1;
    if (target.has(i)) { end = i; break; }
    const x = i % GRID, z = (i / GRID) | 0;
    for (const [dx, dz] of DIRS) {
      const nx = x + dx, nz = z + dz; if (nx < 0 || nz < 0 || nx >= GRID || nz >= GRID) continue;
      const j = idx(nx, nz);
      if (blocked[j] || (world.tiles[j] !== TILE.ground && !target.has(j))) continue;
      const step = 1 + noise(nx * .14, nz * .14, s + 3) * 4, h = Math.hypot(nx - lake.x, nz - lake.z) * .9;
      if (c + step < cost[j]) { cost[j] = c + step; prev[j] = i; push(j, c + step + h); }
    }
  }
  if (end < 0) return;
  const path = []; for (let i = prev[end]; i >= 0; i = prev[i]) path.unshift(i);
  path.push(end);
  const order = new Float32Array(GRID * GRID).fill(-1), river = [];   // how far downstream each river tile is (+.5 on the main channel)
  for (let k = 0; k < path.length - 1; k++) {
    const i = path[k], j = path[k + 1], x = i % GRID, z = (i / GRID) | 0;
    const d = DIRS.findIndex(([dx, dz]) => idx(x + dx, z + dz) === j);
    const [rx, rz] = DIRS[(d + 1) % 4], wide = noise(x * .18, z * .18, s + 5) > .5;
    for (const [cx, cz] of wide ? [[x, z], [x + rx, z + rz]] : [[x, z]]) {
      if (cx < 0 || cz < 0 || cx >= GRID || cz >= GRID) continue;
      const c = idx(cx, cz);
      if (blocked[c] || world.tiles[c] === TILE.water) continue;
      world.tiles[c] = TILE.river; world.flow[c] = d; order[c] = Math.max(order[c], k + (c === i ? .5 : 0)); river.push(c);
    }
  }
  // The widened bank can point into dry land at bends: turn those tiles toward the neighbour furthest downstream.
  for (const c of river) {
    const x = c % GRID, z = (c / GRID) | 0, [fx, fz] = DIRS[world.flow[c]], nx = x + fx, nz = z + fz;
    if (nx >= 0 && nz >= 0 && nx < GRID && nz < GRID && world.tiles[idx(nx, nz)] !== TILE.ground) continue;
    let best = -1, bestOrder = order[c];
    DIRS.forEach(([dx, dz], d) => {
      const ax = x + dx, az = z + dz; if (ax < 0 || az < 0 || ax >= GRID || az >= GRID) return;
      const a = idx(ax, az), o = world.tiles[a] === TILE.water ? Infinity : world.tiles[a] === TILE.river ? order[a] : -2;
      if (o > bestOrder) { bestOrder = o; best = d; }
    });
    if (best >= 0) world.flow[c] = best;
  }
}
// Can you walk from the landing site to every ore tile on the surface?
function surfaceOreReachable() {
  const seen = new Uint8Array(GRID * GRID), q = [Math.floor(SPAWN.z) * GRID + Math.floor(SPAWN.x)];
  seen[q[0]] = 1;
  while (q.length) {
    const i = q.pop(), x = i % GRID, z = (i / GRID) | 0;
    for (const [dx, dz] of DIRS) {
      const nx = x + dx, nz = z + dz, j = nz * GRID + nx;
      if (nx < 0 || nz < 0 || nx >= GRID || nz >= GRID || seen[j] || TILES[world.tiles[j]].liquid) continue;
      seen[j] = 1; q.push(j);
    }
  }
  for (const k of world.ores.keys()) { const [x, y, z] = k.split(',').map(Number); if (y === 0 && !seen[z * GRID + x]) return false; }
  let land = 0, reached = 0;
  for (let i = 0; i < GRID * GRID; i++) if (!TILES[world.tiles[i]].liquid) { land++; reached += seen[i]; }
  return reached >= land * .97;
}
// Worlds from before chunks keep their surface in two flat arrays (worldgen.js copies them into chunks).
export function legacyArrays() { if (world.tiles?.length !== GRID * GRID) { world.tiles = new Uint8Array(GRID * GRID); world.flow = new Int8Array(GRID * GRID).fill(-1); } }
// Older saves had no water: dry out anything that was already built, mined or standing there.
export function dryAround(x, z, r = 0) {
  for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) {
    const tx = Math.floor(x) + dx, tz = Math.floor(z) + dz;
    if (tx < 0 || tz < 0 || tx >= GRID || tz >= GRID) continue;
    world.tiles[tz * GRID + tx] = TILE.ground; world.flow[tz * GRID + tx] = -1;
  }
}

// ---------------------------------------------------------------- quickbars
export function freshBars() {
  S.bars = HOTBARS.map(b => { const a = Array(HOTBAR_SIZE).fill(null); (b.items || []).forEach((it, i) => { a[i] = it; }); return a; });
  S.bar = 0; S.hotbar = S.bars[0]; S.hotbarSeen = new Set();
}
// Saves from before multiple bars carried one `hotbar`; it becomes the equipment bar.
export function loadBars(bars, hotbar, bar = 0) {
  freshBars();
  if (Array.isArray(bars)) bars.forEach((b, i) => { if (S.bars[i] && Array.isArray(b)) b.slice(0, HOTBAR_SIZE).forEach((it, j) => { S.bars[i][j] = ITEMS[it] ? it : null; }); });
  else if (Array.isArray(hotbar)) hotbar.slice(0, HOTBAR_SIZE).forEach((it, j) => { S.bars[0][j] = ITEMS[it] ? it : null; });
  S.bar = bar >= 0 && bar < S.bars.length ? bar : 0; S.hotbar = S.bars[0];
}

// The Factorio start: a handful of plates, one burner drill, one furnace. Everything else you make.
export function startingInventory() {
  inv.clear(); world.ground.length = 0;
  for (const [k, v] of Object.entries({ iron_plate: 8, burner_drill: 1, furnace: 1 })) inv.add(k, v);
}

export function recipeFor(item) { return RECIPE[item]; }
export function techUnlocks(t) { return TECH[t]?.unlocks ?? []; }
