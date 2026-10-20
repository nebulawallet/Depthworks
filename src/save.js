// Save / load to localStorage, and the entity format shared with co-op sync.
// Saves are per-browser and can disappear, so every storage access is guarded.
import { S, world, inv, bus, key, GRID, generateWater, generateOil, generateOres, dryAround, loadBars, WATER_GEN, layerSize, spill, setWorldSize, legacyArrays, SPAWN, chunkOf, underOf } from './state.js';
import { place, placeMulti, placeCompact, nextResearch } from './sim.js';
import { bpsToJSON, bpsFromJSON } from './blueprint.js';
import { rekey, setFoot } from './multi.js';
import { ENTITIES, TILE, RETIRED, ITEMS, BARREL_SIZE, OLD_BARREL_SIZE, RECIPES, TECH } from './data.js';
import { segItems, setSegItems } from './belts.js';
import { loadTransport, vehToJSON, unitToJSON } from './transport.js';
import { stockFish, findBodies, fishToList, fishFromList, poolsToList, poolsFromList } from './fish.js';
import { loadWorldGen, resetWorldMaps, editsToJSON } from './worldgen.js';
import { medToJSON, medFromJSON } from './body.js';
import { exploredToJSON, exploredFromJSON, exploreOldSave } from './explore.js';

// Five save slots. Slot 1 keeps the key saves always used, so older saves show up there. A small index of names
// and dates sits beside them, so the title screen can list slots without reading whole worlds.
export const SLOTS = 5;
const slotKey = n => n === 1 ? 'depthworks.save.v3' : 'depthworks.save.v3.' + n;
const META = 'depthworks.saves';
S.slot = 1;
const readMeta = () => { try { return JSON.parse(localStorage.getItem(META)) || {}; } catch { return {}; } };
const writeMeta = m => { try { localStorage.setItem(META, JSON.stringify(m)); } catch { /* storage unavailable */ } };
const rawSlot = n => { try { return localStorage.getItem(slotKey(n)); } catch { return null; } };
const FIELDS = ['recipe', 'filter', 'inp', 'out', 'fuel', 'fuelType', 'burn', 'held', 'buffer', 'bufN', 'role', 'crafting', 'prog', 'charging', 'timer', 'load', 'unit',
  'fac', 'fa', 'fluid', 'mode', 'dname', 'prio', 'vlimit', 'rules', 'fuelFluid', 'sig', 'aug', 'pbar', 'sf', 'chL', 'chR', 'midOff',
  'seed', 'seeds', 'grow', 'water', 'running', 'output', 'heat', 'broken', 'sort', 'compact', 'arm', 'bout', 'scanR'];
// Belt settings that change how lines are put together: when a friend's copy changes, their lines get rebuilt.
const BELT_SHAPE = ['aug', 'sf', 'chL', 'chR', 'midOff', 'sort', 'bout'];
const ORE_V = 2;   // ores as [key, type, amount, layer, base] (see newDeposit); older saves had [key, type, amount]
// Objects and arrays in FIELDS are copied one level deep (rules are a list of small objects).
const copy = v => Array.isArray(v) ? v.map(x => x && typeof x === 'object' ? { ...x } : x) : v && typeof v === 'object' ? { ...v } : v;

// Every slot: whether it holds a world, and what the index knows about it (an old save may have no entry yet).
export function slotList() {
  const m = readMeta(), out = [];
  for (let n = 1; n <= SLOTS; n++) { const used = !!rawSlot(n); out.push({ n, used, ...(used ? m[n] || { name: 'Saved world' } : {}) }); }
  return out;
}
export const hasSave = () => slotList().some(s => s.used);
export const freeSlot = () => slotList().find(s => !s.used)?.n ?? null;
export const latestSlot = () => slotList().filter(s => s.used).sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0))[0]?.n ?? null;
export function wipeSave(n = S.slot) {
  try { localStorage.removeItem(slotKey(n)); } catch { /* storage unavailable */ }
  const m = readMeta(); delete m[n]; writeMeta(m);
}
const worldName = () => (S.sandbox ? 'Sandbox' : 'World') + (world.gen ? ` ${GRID}²` : '');

// ---------------------------------------------------------------- entities <-> plain data
// Saved halfway through an underground belt's tunnel: you come back out at its exit.
const tunnelExit = p => { const x = world.ents.get(p.tun.k)?.pair; return x ? { x: x.x + .5, z: x.z + .5, h: x.y } : { x: p.x, z: p.z, h: 0 }; };
export function entToJSON(e) {
  if (e.kind === 'frame') return { t: 'frame', x: e.x, y: e.y, z: e.z };
  const o = { t: e.type, x: e.x, y: e.y, z: e.z, d: e.dir, dy: e.dy };
  if (e.kind === 'belt' && e.dy < 0) o.low = 1;   // a slope down that stands on its lower layer (see below)
  for (const f of FIELDS) if (e[f] !== undefined) o[f] = e[f];
  if (e.fa) o.fa = Array.from(e.fa, v => Math.round(v || 0));
  if (e.belt) {   // items per tile as [type, p, lane]; line settings ride on the line's first tile
    o.items = segItems(e).map(([t, p, l]) => [t, +p.toFixed(3), l]);
    if (e.lcfg && (!e.line || e.line.segs[0] === e) && (e.lcfg.name || e.lcfg.filter.length)) o.lcfg = { name: e.lcfg.name, filter: [...e.lcfg.filter] };
  }
  if (e.store) o.store = e.store.toList();
  if (e.pair) o.pair = [e.pair.x, e.pair.z];
  if (e.foot) o.foot = e.foot.map(([x, z]) => [x, z]);   // buildings over several tiles: every tile (see multi.js)
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
  if (o.foot && JSON.stringify(o.foot) !== JSON.stringify(e.foot)) { rekey(e, () => { e.foot = o.foot.map(([x, z]) => [x, z]); setFoot(e); }); bus.emit('remesh', e); world.powerDirty = true; world.fluidDirty = true; }
  if (visual) {
    e.dir = o.d; e.dy = o.dy ?? 0;
    if (e.belt) world.beltDirty = true;
    bus.emit('remesh', e);
  }
}
export function entFromJSON(o) {
  if (o.t === 'frame') return place('frame', o.x, o.y, o.z, 0, 0, true);
  // Slopes (and the lifts they replaced) going down used to stand on their upper layer and dig into the one below. They stand on the lower one
  // now: moving an old one down a layer keeps exactly what feeds it and what it feeds.
  if (o.dy < 0 && !o.low && ENTITIES[o.t]?.kind === 'belt' && !world.ents.has(key(o.x, o.y - 1, o.z))) o = { ...o, y: o.y - 1, low: 1 };
  // boilers and steam engines saved before they were big (no footprint) stay one tile: nothing overlaps or moves
  const def = ENTITIES[o.t];
  const e = def?.big && !o.foot ? placeCompact(o.t, o.x, o.y, o.z, o.d, o.fac) : def?.multi && o.foot ? placeMulti(o.t, o.foot, o.y, o.d, true, o.fac) : place(o.t, o.x, o.y, o.z, o.d, o.dy, true);
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
  legacyArrays(); world.tiles.fill(0); world.flow.fill(-1);
  let i = 0;
  for (const part of s.split(',')) {
    const [c, r] = part.split('.').map(v => parseInt(v, 36));
    for (let k = 0; k < r && i < GRID * GRID; k++, i++) { world.tiles[i] = Math.floor(c / 5); world.flow[i] = c % 5 - 1; }
  }
}

// ---------------------------------------------------------------- whole world
// A generated world saves its seed and options (`gen`) and what changed since (`edits`): its chunks are made again
// from those. A world from before chunks keeps its full surface (tiles, ores, trees, oil) as it always did.
export function serialize() {
  const gen = !!world.gen;
  return JSON.stringify({
    v: 3, T: S.T, sandbox: S.sandbox, player: { ...(S.player.tun ? tunnelExit(S.player) : { x: S.player.x, z: S.player.z, h: S.player.h || 0 }), face: S.player.face, fac: S.player.fac, veh: S.player.veh, fed: S.player.fed, hp: Math.round(S.player.hp) }, roadCfg: S.roadCfg, maxTier: S.maxTier, hotbar: S.hotbar, bars: S.bars, bar: S.bar, hotbarSeen: [...S.hotbarSeen], cam: S.cam,
    seed: S.seed, med: medToJSON(), explored: exploredToJSON(), gen: world.gen, edits: gen ? editsToJSON() : undefined, barrel: BARREL_SIZE,
    tiles: gen ? undefined : packTiles(), waterGen: WATER_GEN, links: world.links, marks: world.marks,
    research: { done: [...S.research.done], current: S.research.current, queue: S.research.queue || [], progress: S.research.progress, extra: [...(S.research.extra || [])] }, bps: bpsToJSON(),
    signal: { stage: S.signal.stage, pulses: S.signal.pulses, taught: [...S.signal.taught], seen: [...S.signal.seen], log: S.signal.log },
    stats: S.stats, craft: S.player.craft, goalsDone: [...(S.goalsDone || [])], remoteInv: S.remoteInv || {},
    invSlots: inv.toList(), oreV: ORE_V, ores: gen ? [] : [...world.ores].map(([k, o]) => [k, o.type, Math.round(o.amount), o.layer, o.base]),
    frames: [...world.frames.values()].map(f => [f.x, f.y, f.z]), ents: [...world.ents.values()].map(entToJSON),
    feats: gen ? [] : [...world.feats].map(([k, f]) => [k, f.type, +f.v.toFixed(3)]), ground: world.ground,
    oil: gen ? [] : [...world.oil].map(([k, o]) => [k, +o.yield.toFixed(2)]), roads: [...world.roads], factories: world.factories, facNext: world.facNext,
    vehicles: world.vehicles.map(vehToJSON), units: world.units.map(u => unitToJSON(u)), routes: world.routes, nextId: world.nextId, fish: fishToList(), fishPools: poolsToList(),
  });
}

// Returns true when saved; 'full' when the browser has no room left (export the world, or delete a slot).
export function save() {
  if (S.net.role === 'client') return false;   // a friend's world belongs to the host
  bus.emit('beforesave');
  try { localStorage.setItem(slotKey(S.slot), serialize()); }
  catch (err) { return err?.name === 'QuotaExceededError' || /quota/i.test(err?.message || '') ? 'full' : false; }
  const m = readMeta(); m[S.slot] = { name: worldName(), savedAt: Date.now(), T: Math.round(S.T), sandbox: S.sandbox }; writeMeta(m);
  bus.emit('saved'); return true;
}
export function load(n = S.slot) {
  let d;
  try { d = JSON.parse(rawSlot(n)); } catch { return false; }
  S.slot = n;
  return loadData(d);
}
// ---------------------------------------------------------------- files
// A world as a file you keep: the same JSON as a slot, so it loads anywhere the game runs.
export function exportSave() {
  const d = new Date(), stamp = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}-${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}`;
  bus.emit('beforesave');
  const blob = new Blob([serialize()], { type: 'application/json' }), a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = `depthworks-${worldName().toLowerCase()}-${stamp}.json`;
  document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
export function exportSlot(n) {
  const text = rawSlot(n); if (!text) return;
  const blob = new Blob([text], { type: 'application/json' }), a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = `depthworks-slot${n}.json`;
  document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
// Put a world file into slot n. Returns an error message, or null.
export function importSave(text, n) {
  let d; try { d = JSON.parse(text); } catch { return 'that file is not a Depthworks save'; }
  if (!d || d.v !== 3 || !Array.isArray(d.ents) || !(d.gen || Array.isArray(d.ores))) return 'that file is not a Depthworks save';
  try { localStorage.setItem(slotKey(n), text); } catch { return 'the browser has no room left for it: delete a slot first'; }
  const m = readMeta(); m[n] = { name: (d.sandbox ? 'Sandbox' : 'World') + (d.gen ? ` ${d.gen.size}²` : ''), savedAt: Date.now(), T: Math.round(d.T || 0), sandbox: !!d.sandbox, imported: true }; writeMeta(m);
  return null;
}

// asGuest: joining a friend's world, so keep our own camera, hotbar and settings, and take no inventory from it.
export function loadData(d, asGuest = false) {
  if (!d || d.v !== 3) return false;
  const salvaged = asGuest ? null : retireItems(d);
  if (!asGuest && (d.barrel ?? OLD_BARREL_SIZE) !== BARREL_SIZE) rebarrel(d);
  S.T = d.T; S.maxTier = d.maxTier; S.sandbox = !!d.sandbox;
  if (!asGuest) {
    Object.assign(S.player, d.player); loadBars(d.bars, d.hotbar, d.bar); if (d.roadCfg) S.roadCfg = { ...S.roadCfg, ...d.roadCfg }; S.hotbarSeen = new Set(d.hotbarSeen || []); Object.assign(S.cam, d.cam);
    S.player.craft = d.craft || []; S.goalsDone = new Set(d.goalsDone || []); S.remoteInv = d.remoteInv || {};
    if (d.invSlots) inv.loadList(d.invSlots); else { inv.clear(); for (const [k, v] of d.inv || []) inv.add(k, v); }
  }
  S.research.done = new Set(d.research.done.filter(id => TECH[id]));   // retired technologies (Lifts) drop out S.research.current = d.research.current; S.research.progress = d.research.progress;
  // saves from before the queue had one current tech: it becomes the queue
  S.research.queue = Array.isArray(d.research.queue) ? d.research.queue : d.research.current ? [d.research.current] : [];
  nextResearch();
  // Storage tanks and barreling moved from Fluid handling to Advanced fluids: worlds that had them keep them.
  S.research.extra = new Set(d.research.extra || (S.research.done.has('fluid_handling') ? ['storage_tank', 'barrel', 'barreler', ...RECIPES.filter(r => r.cat === 'barrel').map(r => r.id)] : []));
  Object.assign(S.signal, { stage: d.signal.stage, pulses: d.signal.pulses, taught: new Set(d.signal.taught), seen: new Set(d.signal.seen), log: d.signal.log });
  S.stats = d.stats;
  medFromJSON(d.med);
  if (d.gen) loadWorldGen(d.gen, d.edits);
  else {   // a world from before chunks: 96 tiles a side, its whole surface in the save
    setWorldSize(96); world.gen = null; resetWorldMaps(); SPAWN.x = 48.5; SPAWN.z = 52.5; legacyArrays();
    loadOres(d);
    for (const [k, type, v] of d.feats || []) world.feats.set(k, { type, v });
  }
  world.ground.length = 0; world.ground.push(...(d.ground || []));
  S.seed = d.seed ?? 20261013;
  if (!d.gen) {
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
  }
  world.factories = Array.isArray(d.factories) && d.factories.length ? d.factories : [{ id: 1, name: 'Main factory', color: '#7ef6ff' }];
  world.facNext = d.facNext || Math.max(...world.factories.map(f => f.id)) + 1;
  if (!world.factories.some(f => f.id === S.player.fac)) S.player.fac = world.factories[0].id;
  loadTransport(d);
  if (d.gen) { /* wells come with their chunks */ }
  else if (d.oil) { world.oil.clear(); for (const [k, y] of d.oil) world.oil.set(k, { yield: y }); }
  else {   // saved before oil existed: put the wells where nothing stands
    const taken = new Set([...d.ents.map(o => o.x + ',' + o.z), ...(d.frames || []).map(([x, , z]) => x + ',' + z)]);
    generateOil(S.seed, (x, z) => taken.has(x + ',' + z));
  }
  world.chunks.clear();   // old worlds: chunks are copied from the finished surface, so start them afresh now
  // every chunk with something built in it exists before the game runs, so drills see their deposits
  for (const o of d.ents) (o.y < 0 ? underOf : chunkOf)(o.x, o.z);
  chunkOf(S.player.x, S.player.z);
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
  bpsFromJSON(d.bps);
  if (Array.isArray(d.explored)) exploredFromJSON(d.explored); else exploreOldSave();   // saves from before exploring: what was near counts as seen
  stockFish();
  if (d.fish) { fishFromList(d.fish); findBodies(); }
  poolsFromList(d.fishPools, true);
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
  // lifts standing in the world become the angled belts that replaced them, on the same tile, going the same way
  for (const o of d.ents || []) if (o.t === 'lift') { o.t = 'belt'; o.dy = o.dy < 0 ? -1 : 1; }
  // extra-low voltage is gone: its poles and stations stand on as small poles, its cables as power cables, so every
  // power plant keeps working with nothing rebuilt
  for (const o of d.ents || []) if (o.t === 'generator_pole' || o.t === 'step_up') o.t = 'small_pole';
  for (const l of d.links || []) if (l.kind === 'step_up_cable') l.kind = 'power_cable';
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

// Barrels used to hold 50; now they hold 10. Every filled barrel in an old save becomes five, so no fluid is lost
// (a barrel stack is five times bigger, so they fit the same slots). Filled barrels on belts stay one to a spot on the
// belt, and the other four drop on the ground beside it.
function rebarrel(d) {
  const k = Math.round(OLD_BARREL_SIZE / BARREL_SIZE), full = it => !!ITEMS[it]?.barrel;
  const slots = list => Array.isArray(list) ? list.map(s => Array.isArray(s) && full(s[0]) ? [s[0], s[1] * k] : s) : list;
  const counts = o => { for (const it of Object.keys(o || {})) if (full(it)) o[it] *= k; };
  d.invSlots = slots(d.invSlots);
  if (Array.isArray(d.inv)) d.inv = d.inv.map(([it, n]) => [it, full(it) ? n * k : n]);
  for (const p of Object.values(d.remoteInv || {})) p.inv = slots(p.inv);
  for (const v of d.vehicles || []) v.c = slots(v.c);
  d.ground = (d.ground || []).flatMap(g => full(g.type) ? Array.from({ length: k }, () => ({ ...g })) : [g]);
  for (const o of d.ents || []) {
    if (Array.isArray(o.store)) o.store = slots(o.store); else counts(o.store);
    counts(o.inp); counts(o.out);
    if (full(o.fuelType)) o.fuel *= k;
    for (const it of o.items || []) if (full(it[0])) for (let i = 1; i < k; i++) d.ground.push({ type: it[0], x: o.x + .2 + Math.random() * .6, z: o.z + .2 + Math.random() * .6 });
    if (o.buffer && full(o.buffer)) o.bufN = (o.bufN || 1) * k;
  }
}
