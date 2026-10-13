// Save / load to localStorage, and the entity format shared with co-op sync.
// Saves are per-browser and can disappear, so every storage access is guarded.
import { S, world, inv, bus, key, GRID, generateWater, generateOil, generateOres, dryAround, loadBars, WATER_GEN, layerSize, spill } from './state.js';
import { place } from './sim.js';
import { ENTITIES, TILE, RETIRED } from './data.js';
import { segItems, setSegItems } from './belts.js';
import { loadTransport, vehToJSON, unitToJSON } from './transport.js';
import { stockFish, findBodies, fishToList, fishFromList } from './fish.js';

const SLOT = 'depthworks.save.v3';
const FIELDS = ['recipe', 'filter', 'inp', 'out', 'fuel', 'fuelType', 'burn', 'held', 'buffer', 'bufN', 'role', 'crafting', 'prog', 'charging', 'timer', 'load', 'unit',
  'fac', 'fa', 'fluid', 'mode', 'dname', 'prio', 'vlimit', 'rules', 'fuelFluid', 'sig', 'aug', 'pbar', 'sf', 'chL', 'chR', 'midOff'];
// Belt settings that change how lines are put together: when a friend's copy changes, their lines get rebuilt.
const BELT_SHAPE = ['aug', 'sf', 'chL', 'chR', 'midOff'];
const ORE_V = 2;   // ores as [key, type, amount, layer, base] (see newDeposit); older saves had [key, type, amount]
// Objects and arrays in FIELDS are copied one level deep (rules are a list of small objects).
const copy = v => Array.isArray(v) ? v.map(x => x && typeof x === 'object' ? { ...x } : x) : v && typeof v === 'object' ? { ...v } : v;

export function hasSave() { try { return !!localStorage.getItem(SLOT); } catch { return false; } }
export function wipeSave() { try { localStorage.removeItem(SLOT); } catch { /* storage unavailable */ } }

// ---------------------------------------------------------------- entities <-> plain data
export function entToJSON(e) {
  if (e.kind === 'frame') return { t: 'frame', x: e.x, y: e.y, z: e.z };
  const o = { t: e.type, x: e.x, y: e.y, z: e.z, d: e.dir, dy: e.dy };
  for (const f of FIELDS) if (e[f] !== undefined) o[f] = e[f];
  if (e.fa) o.fa = Array.from(e.fa, v => Math.round(v || 0));
  if (e.belt) {   // items per tile as [type, p, lane]; line settings ride on the line's first tile
    o.items = segItems(e).map(([t, p, l]) => [t, +p.toFixed(3), l]);
    if (e.lcfg && (!e.line || e.line.segs[0] === e) && (e.lcfg.name || e.lcfg.filter.length)) o.lcfg = { name: e.lcfg.name, filter: [...e.lcfg.filter] };
  }
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
  const visual = forceRemesh || o.d !== e.dir || (o.dy ?? 0) !== (e.dy ?? 0) || (o.recipe ?? null) !== (e.recipe ?? null) || (o.role ?? null) !== (e.role ?? null)
    || (o.fac ?? 1) !== (e.fac ?? 1) || (o.fluid ?? null) !== (e.fluid ?? null) || (o.sig ?? null) !== (e.sig ?? null);
  if ((o.recipe ?? null) !== (e.recipe ?? null) || (o.fac ?? 1) !== (e.fac ?? 1) || (o.fuelFluid ?? null) !== (e.fuelFluid ?? null)) world.fluidDirty = true;
  if ((o.sig ?? null) !== (e.sig ?? null)) world.railDirty = true;
  if (e.belt) {
    if (BELT_SHAPE.some(f => JSON.stringify(o[f] ?? null) !== JSON.stringify(e[f] ?? null))) world.beltDirty = true;
    if (!e.line || e.line.segs[0] === e) {   // only a line's first tile carries its settings
      const cfg = { name: o.lcfg?.name || '', filter: [...(o.lcfg?.filter || [])] };
      if (JSON.stringify(cfg) !== JSON.stringify({ name: e.lcfg?.name || '', filter: e.lcfg?.filter || [] })) { e.lcfg = cfg; world.beltDirty = true; }
    }
  }
  for (const f of FIELDS) if (o[f] !== undefined) e[f] = copy(o[f]);
  if (o.items && e.belt) setSegItems(e, o.items);
  loadStore(e, o.store);
  if (o.st !== undefined) e.status = o.st;
  if (o.age !== undefined) e.lastActive = S.T - o.age;
  if (o.ph !== undefined) e.t = o.ph;   // inserter swing phase
  if (o.pair) { const p = world.ents.get(key(o.pair[0], e.y, o.pair[1])); if (p) { e.pair = p; p.pair = e; } }
  if (visual) {
    e.dir = o.d; e.dy = o.dy ?? 0;
    if (e.belt) world.beltDirty = true;
    bus.emit('remesh', e);
  }
}
export function entFromJSON(o) {
  if (o.t === 'frame') return place('frame', o.x, o.y, o.z, 0, 0, true);
  const e = place(o.t, o.x, o.y, o.z, o.d, o.dy, true);
  if (typeof e !== 'object' || !e) return e;
  for (const f of FIELDS) if (o[f] !== undefined) e[f] = copy(o[f]);
  if (o.items && e.belt) e.buf = o.items.map(([type, p, lane]) => [type, p, lane ?? 1]);   // older saves had one lane: those items go on the right
  if (o.lcfg && e.belt) e.lcfg = { name: o.lcfg.name || '', filter: [...(o.lcfg.filter || [])] };
  const slots = ENTITIES[e.type].augSlots;
  if (slots) e.aug = Array.from({ length: slots }, (_, i) => o.aug?.[i] || null);
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
    v: 3, T: S.T, sandbox: S.sandbox, player: { x: S.player.x, z: S.player.z, face: S.player.face, fac: S.player.fac, veh: S.player.veh, fed: S.player.fed }, roadCfg: S.roadCfg, maxTier: S.maxTier, hotbar: S.hotbar, bars: S.bars, bar: S.bar, hotbarSeen: [...S.hotbarSeen], cam: S.cam, pix: S.pix,
    seed: S.seed, tiles: packTiles(), waterGen: WATER_GEN, links: world.links, marks: world.marks,
    research: { done: [...S.research.done], current: S.research.current, progress: S.research.progress },
    signal: { stage: S.signal.stage, pulses: S.signal.pulses, taught: [...S.signal.taught], seen: [...S.signal.seen], log: S.signal.log },
    stats: S.stats, craft: S.player.craft, goalsDone: [...(S.goalsDone || [])], remoteInv: S.remoteInv || {},
    invSlots: inv.toList(), oreV: ORE_V, ores: [...world.ores].map(([k, o]) => [k, o.type, Math.round(o.amount), o.layer, o.base]),
    frames: [...world.frames.values()].map(f => [f.x, f.y, f.z]), ents: [...world.ents.values()].map(entToJSON),
    feats: [...world.feats].map(([k, f]) => [k, f.type, +f.v.toFixed(3)]), ground: world.ground,
    oil: [...world.oil].map(([k, o]) => [k, +o.yield.toFixed(2)]), roads: [...world.roads], factories: world.factories, facNext: world.facNext,
    vehicles: world.vehicles.map(vehToJSON), units: world.units.map(u => unitToJSON(u)), routes: world.routes, nextId: world.nextId, fish: fishToList(),
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
  const salvaged = asGuest ? null : retireItems(d);
  S.T = d.T; S.maxTier = d.maxTier; S.sandbox = !!d.sandbox;
  if (!asGuest) {
    Object.assign(S.player, d.player); loadBars(d.bars, d.hotbar, d.bar); if (d.roadCfg) S.roadCfg = { ...S.roadCfg, ...d.roadCfg }; S.hotbarSeen = new Set(d.hotbarSeen || []); Object.assign(S.cam, d.cam); S.pix = d.pix || 3;
    S.player.craft = d.craft || []; S.goalsDone = new Set(d.goalsDone || []); S.remoteInv = d.remoteInv || {};
    if (d.invSlots) inv.loadList(d.invSlots); else { inv.clear(); for (const [k, v] of d.inv || []) inv.add(k, v); }
  }
  S.research.done = new Set(d.research.done); S.research.current = d.research.current; S.research.progress = d.research.progress;
  Object.assign(S.signal, { stage: d.signal.stage, pulses: d.signal.pulses, taught: new Set(d.signal.taught), seen: new Set(d.signal.seen), log: d.signal.log });
  S.stats = d.stats;
  loadOres(d);
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
  world.factories = Array.isArray(d.factories) && d.factories.length ? d.factories : [{ id: 1, name: 'Main factory', color: '#7ef6ff' }];
  world.facNext = d.facNext || Math.max(...world.factories.map(f => f.id)) + 1;
  if (!world.factories.some(f => f.id === S.player.fac)) S.player.fac = world.factories[0].id;
  loadTransport(d);
  if (d.oil) { world.oil.clear(); for (const [k, y] of d.oil) world.oil.set(k, { yield: y }); }
  else {   // saved before oil existed: put the wells where nothing stands
    const taken = new Set([...d.ents.map(o => o.x + ',' + o.z), ...(d.frames || []).map(([x, , z]) => x + ',' + z)]);
    generateOil(S.seed, (x, z) => taken.has(x + ',' + z));
  }
  world.links = (d.links || []).filter(l => Array.isArray(l.a) && Array.isArray(l.b));
  world.marks = d.marks?.markers ? d.marks : { markers: [], areas: [], next: 1 };
  for (const [x, y, z] of d.frames) place('frame', x, y, z, 0, 0, true);
  const byPos = new Map();
  for (const o of d.ents) {
    const e = entFromJSON(o);
    if (typeof e === 'object' && e) byPos.set(o.x + ',' + o.y + ',' + o.z, [e, o]);
  }
  for (const [, [e]] of byPos) if (e.kind === 'underground' || e.kind === 'upipe') e.pair = null;
  for (const [, [e, o]] of byPos) {
    if (o.pair) { e.pair = byPos.get(o.pair[0] + ',' + o.y + ',' + o.pair[1])?.[0] ?? null; e.pair && (e.pair.pair = e); }
    bus.emit('remesh', e);
  }
  findBodies();
  if (d.fish) fishFromList(d.fish); else stockFish();
  if (S.player.veh && !world.vehicles.some(v => v.id === S.player.veh)) S.player.veh = null;
  world.beltDirty = true; world.powerDirty = true; world.fluidDirty = true; world.railDirty = true;
  if (salvaged?.n) {   // what retired things were made of goes back to the engineer
    for (const [it, n] of Object.entries(salvaged.parts)) { const left = inv.add(it, n); for (let i = 0; i < left; i++) spill(it, S.player.x, S.player.z); }
    setTimeout(() => bus.emit('toast', `Steam generators are gone: use boilers and steam engines. The ${salvaged.n} in this save came back as parts.`, 6000), 1500);
  }
  return true;
}

// ---------------------------------------------------------------- old saves
// Deposits never vanish any more. Older saves get layers and the longer surface layer (with the same share of it
// left), and every tile they mined out comes back one layer down. The ore layout is fixed, so each tile's original
// richness can be worked out again.
function loadOres(d) {
  world.ores.clear();
  if (d.oreV === ORE_V) { for (const [k, type, amount, layer, base] of d.ores) world.ores.set(k, { type, amount, layer, base }); return; }
  generateOres();
  const orig = new Map(world.ores), kept = new Map(d.ores.map(([k, type, amount]) => [k, { type, amount }]));
  world.ores.clear();
  for (const [k, o] of orig) {
    const now = kept.get(k);
    if (!now) { o.layer = 1; o.amount = layerSize(o, 1); }
    else o.amount = Math.max(1, Math.round(Math.min(1, now.amount / o.base) * layerSize(o, 0)));
    world.ores.set(k, o);
  }
  for (const [k, o] of kept) if (!world.ores.has(k)) world.ores.set(k, { type: o.type, base: o.amount, layer: 0, amount: o.amount * 4 });
}
// Retired items and buildings (see RETIRED) leave a save before anything is built from it, and each one counts toward
// the parts it gives back. Fuel in a retired building comes back too; machines set to make one lose that recipe.
function retireItems(d) {
  const out = { n: 0, parts: {} }, gone = it => !!RETIRED[it];
  const give = (it, n) => { if (n > 0) out.parts[it] = (out.parts[it] || 0) + n; };
  const back = (it, n = 1) => { out.n += n; for (const [p, k] of Object.entries(RETIRED[it])) give(p, k * n); };
  const slots = list => Array.isArray(list) ? list.map(s => { if (Array.isArray(s) && gone(s[0])) { back(s[0], s[1]); return 0; } return s; }) : list;
  const counts = o => { for (const it of Object.keys(o || {})) if (gone(it)) { back(it, o[it]); delete o[it]; } };
  d.ents = (d.ents || []).filter(o => {
    if (!gone(o.t)) return true;
    back(o.t); if (o.fuel && o.fuelType) give(o.fuelType, o.fuel);
    return false;
  });
  for (const o of d.ents) {
    if (Array.isArray(o.store)) o.store = slots(o.store);
    counts(o.inp); counts(o.out);
    if (gone(o.held)) { back(o.held); o.held = null; }
    if (o.items) o.items = o.items.filter(i => !gone(i[0]) || (back(i[0]), false));
    if (gone(o.recipe)) { for (const [it, n] of Object.entries(o.inp || {})) give(it, n); if (o.crafting) for (const [it, n] of Object.entries(RETIRED[o.recipe])) give(it, n); o.inp = {}; o.recipe = null; o.crafting = false; }
  }
  d.invSlots = slots(d.invSlots);
  if (Array.isArray(d.inv)) d.inv = d.inv.filter(([it, n]) => !gone(it) || (back(it, n), false));
  for (const p of Object.values(d.remoteInv || {})) p.inv = slots(p.inv);
  for (const v of d.vehicles || []) v.c = slots(v.c);
  d.ground = (d.ground || []).filter(g => !gone(g.type) || (back(g.type), false));
  // queued crafts: a retired thing being made gives back what it was made of
  d.craft = (d.craft || []).filter(c => { if (!gone(c.rid)) return true; for (const [it, n] of Object.entries(RETIRED[c.rid])) give(it, n * (c.times - (c.done || 0))); return false; });
  return out;
}
