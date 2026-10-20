// Simulation: the engineer, logistics, machines, power networks, research, precision, crafting, building.
import { ENTITIES, ITEMS, RECIPE, RECIPES, TECH, TIERS, FEATURES, FEATURE_HIT, PLAYER, FLUIDS, BARREL_SIZE, SIDEWALK_SPEED, AUGMENTS, AUG_RULES, DEPOSIT, FRAMES, ROADS, TILES, TOOLS, VOLTAGES, ELV, ROAD_POWER, PIPE_HIT, WIRE_TECH, hitOf, oreStage, groupOf, ingredientMatches, wiresBuildings } from './data.js';
import { S, world, invAdd, invGet, invGive, invRoom, Inventory, stackOf, spill, bus, key, tilesOf, DIRS, GRID, LAYER_MAX, layerRange, layerLockReason, recipeUnlocked, actor, setActor, notify, isWater, factoryOf, endless, layerSize, oreWear, SPAWN, daylight, removeFeat, underOf, patchAt, isResearched } from './state.js';
import { isBeltLike, dropOnBelt, takeFromBelt, beltWants, beltsTick, touchBelts, clearSeg, segItems, beltCommand, lanesOf, outRise } from './belts.js';
import { rebuildFluids, fluidPre, fluidPost, producerCaps, burnNet, burnRate, draw, push, avail, room, passThrough, fluidConflict, flush, sameFac, isPipeLike } from './fluids.js';
import { roadAt, removeRoad, roadTiles, isWalkway, roadBlocks, transportTick, rebuildRails, wayNear, vehSlots, vehSlotAccept, vehSlotPut, vehSlotTake, vehicleById, vehicleTarget, removeVehicle, depotCommand, vstats } from './transport.js';
import { bpAt, removeBlueprintsUnder, removeBlueprint } from './blueprint.js';
import { fishTarget, catchFish, fishTick } from './fish.js';
import { radarSweep, exploreTick } from './explore.js';
import { tradeTick } from './trade.js';
import { greenhouseAccepts, greenhouseInsert, farmTick, digPatch, patchName } from './farm.js';
import { damTick, reactorTick, reactorAccepts, repair } from './plants.js';
import { playerMods, maxHealth, maxStamina, reachOf, bodyTick, medTick, medAccepts, medSlotItems } from './body.js';
import { isMulti, isBig, footprint, setFoot, clearFoot, groups, wallsAt, neighboursToMerge, joinAll, rekey, KINDS, covers } from './multi.js';
export { sameFac };
const isClient = () => S.net.role === 'client';

export { isBeltLike };
const ACTIVE_WINDOW = 8;
let nextId = 1;
export const isActive = e => e && S.T - e.lastActive < ACTIVE_WINDOW;
const bump = (stat, it, n = 1) => { S.stats[stat] ||= {}; S.stats[stat][it] = (S.stats[stat][it] || 0) + n; };

// ---------------------------------------------------------------- augments
// Everything augments do to a machine is worked out here, and machines read their numbers from this only.
export const augSlots = e => ENTITIES[e.type]?.augSlots || 0;
export function augFits(e, it) {
  const a = AUGMENTS[ITEMS[it]?.aug];
  return !!a && augSlots(e) > 0 && (!a.only || a.only.includes(e.kind));
}
export function augBonus(list) {
  const b = { speed: 0, efficiency: 0, productivity: 0, depth: 0 };
  for (const it of list || []) {
    const d = ITEMS[it], a = d && AUGMENTS[d.aug]; if (!a) continue;
    const v = a.tiers[d.tier - 1] || 0;
    if (d.aug === 'depth') b.depth = Math.max(b.depth, v); else b[d.aug] += v;
  }
  return b;
}
// speed: work rate multiplier. power: multiplier on power drawn and fuel burned. prod: extra output per output.
// depth: the deepest deposit layer a drill reaches.
export function machineStats(e) {
  const def = ENTITIES[e.type], b = augBonus(e.aug);
  return { speed: 1 + b.speed, power: Math.max(AUG_RULES.minPower, 1 - b.efficiency), prod: b.productivity,
    depth: Math.min(DEPOSIT.length - 1, (def.depth ?? 0) + b.depth), bonus: b };
}
// Productivity fills a bar; every time it passes 1, one more of the output comes out.
function prodExtra(e, prod) { if (prod <= 0) return 0; e.pbar = (e.pbar || 0) + prod; const n = Math.floor(e.pbar); e.pbar -= n; return n; }

// ---------------------------------------------------------------- entities
// Ordinary two-lane belts can be angled (dy): one tile along, one layer up or down. Bus belts can't.
export const canSlope = type => ENTITIES[type]?.kind === 'belt' && !ENTITIES[type].lanes;
// Where a slope going down is built when you point at cell (x, y, z). It stands on the lower layer, so normally
// right there, bringing a belt down from the layer above. But pointing just past the end of a run on this layer (or the top
// of a slope up) means "take this run down": then it goes one layer lower.
export function slopeLayer(type, x, y, z, dir, dy) {
  if (!(dy < 0) || !canSlope(type)) return y;
  const [dx, dz] = DIRS[dir], [lo] = layerRange();
  const feeds = [y, y - 1].some(ly => { const n = world.ents.get(key(x - dx, ly, z - dz)); return n?.belt && n.dir === dir && n.y + outRise(n) === y; });
  return feeds && y - 1 >= lo ? y - 1 : y;
}
export function createEntity(type, x, y, z, dir = 0, dy = 0) {
  const def = ENTITIES[type];
  const e = { id: nextId++, type, kind: def.kind, x, y, z, dir, dy: 0, lastActive: -99, prog: 0, status: '', net: null };
  if (def.burner) { e.fuel = 0; e.fuelType = null; e.burn = 0; }
  if (def.augSlots) e.aug = new Array(def.augSlots).fill(null);
  switch (def.kind) {
    // belts keep their items on their line (belts.js); `buf` holds a tile's items while it has none
    case 'belt': case 'splitter': e.belt = true; e.buf = []; e.len = 1; e.speed = def.speed; e.curve = null; if (canSlope(type)) e.dy = dy || 0; break;
    case 'underground': e.belt = true; e.buf = []; e.len = 1; e.speed = def.speed; e.role = 'in'; e.pair = null; break;
    case 'inserter': e.t = 0; e.held = null; e.reach = def.reach; e.swing = def.swing; e.dy = dy || 0; e.filter = null; break;
    case 'drill': e.timer = 0; e.buffer = null; e.bufN = 0; break;
    case 'furnace': e.recipe = null; e.inp = {}; e.out = {}; e.crafting = false; break;
    case 'assembler': e.recipe = null; e.inp = {}; e.out = {}; e.crafting = false; if (def.pull) e.arm = { t: 0, it: null, at: null }; break;
    case 'lab': e.inp = {}; e.unit = null; break;
    case 'chest': e.store = new Inventory(def.cap); break;
    case 'transmitter': e.inp = {}; e.charging = false; break;
    case 'pipe': case 'tank': e.fluid = null; e.fa = []; e.conn = 0; break;
    case 'upipe': e.fluid = null; e.fa = []; e.role = 'in'; e.pair = null; break;
    case 'fpump': e.fluid = null; e.fa = []; break;
    case 'valve': e.fluid = null; e.fa = []; e.mode = 'check'; break;
    case 'oilpump': case 'fgen': e.fa = []; break;
    case 'depot': e.store = new Inventory(def.cap); e.fa = []; e.dname = ''; e.prio = 5; e.vlimit = 0; e.rules = []; e.fuelFluid = def.way === 'sea' ? 'heavy_oil' : 'diesel'; break;
    case 'rail': e.sig = null; e.conn = 0; break;
    case 'greenhouse': e.seed = null; e.seeds = 0; e.grow = 0; e.out = {}; e.fa = []; e.water = 0; break;
    case 'dam': e.running = false; e.output = 0; break;
    case 'medlab': e.inp = {}; e.unit = null; break;
    case 'reactor': e.fuel = 0; e.fuelType = null; e.burn = 0; e.heat = 0; e.load = 0; e.broken = false; break;
    case 'coolant': e.load = 0; e.broken = false; break;
  }
  if (def.ports) e.fa = [];
  return e;
}
const usesFuel = e => e && e.fuel !== undefined;
const isElectric = e => !!ENTITIES[e.type].power;

export function smeltRecipe(it) {
  return RECIPES.find(r => r.cat === 'smelt' && r.in[it] && recipeUnlocked(r)) || null;
}

// `manual` = the player is putting it in by hand, which may fill fuel slots further than inserters do.
export function canAccept(e, it, manual = false) {
  if (!e || !it) return false;
  const def = ENTITIES[e.type];
  if (e.kind === 'reactor') return reactorAccepts(e, it, manual);
  if (e.kind === 'greenhouse') return greenhouseAccepts(e, it, manual);
  if (e.kind === 'medlab') return medAccepts(e, it, manual);
  if (usesFuel(e) && ITEMS[it]?.fuel && e.kind !== 'chest') {
    // fuelStacks: the fuel slot holds whole stacks of whatever fuel is in it, from inserters too
    const cap = def.fuelStacks ? stackOf(it) * def.fuelStacks : manual ? stackOf(it) : 5;
    return (e.fuel === 0 || e.fuelType === it) && e.fuel < cap;
  }
  switch (e.kind) {
    case 'chest': case 'depot': return e.store.room(it) > 0;
    case 'furnace': {
      const r = smeltRecipe(it); if (!r) return false;
      if (e.recipe && e.recipe !== r.id && (e.crafting || Object.values(e.inp).some(v => v > 0))) return false;
      return (e.inp[it] || 0) < r.in[it] * (manual ? 50 : 4);
    }
    case 'assembler': {
      if (ENTITIES[e.type].cats?.includes('barrel')) return barrelAccepts(e, it);
      const r = RECIPE[e.recipe], k = r && ingKey(r, it); if (!k) return false;
      return groupHave(e, k) < (manual ? ITEMS[it].stack : Math.max(r.in[k] * 2, r.in[k] + 1));
    }
    case 'lab': return PACKS.includes(it) && (e.inp[it] || 0) < (manual ? 200 : 10);
    case 'transmitter': return it === 'resonance_pack' && (e.inp[it] || 0) < (manual ? 50 : 10);
  }
  return false;
}
export function insert(e, it) {
  if (e.kind === 'greenhouse') { greenhouseInsert(e, it); e.lastActive = S.T; return; }
  if (e.kind === 'reactor' || (usesFuel(e) && ITEMS[it]?.fuel && e.kind !== 'chest')) { e.fuelType = it; e.fuel++; return; }
  if (e.kind === 'assembler' && ENTITIES[e.type].cats?.includes('barrel')) barrelPick(e, it);
  switch (e.kind) {
    case 'chest': case 'depot': e.store.add(it, 1); break;
    case 'furnace': e.recipe = smeltRecipe(it).id; e.inp[it] = (e.inp[it] || 0) + 1; break;
    default: e.inp[it] = (e.inp[it] || 0) + 1;
  }
  e.lastActive = S.T;
}
export function take(e, ok) {
  if (!e) return null;
  if (isBeltLike(e)) return takeFromBelt(e, ok);
  switch (e.kind) {
    case 'chest': case 'depot': for (const it of e.store.counts().keys()) if (ok(it)) { e.store.remove(it, 1); e.lastActive = S.T; return it; } break;
    case 'furnace': case 'assembler': case 'greenhouse': for (const it in e.out) if (e.out[it] > 0 && ok(it)) { if (--e.out[it] === 0) delete e.out[it]; e.lastActive = S.T; return it; } break;
    case 'drill': if (e.buffer && ok(e.buffer)) { const it = e.buffer; takeBuf(e, 1); return it; } break;
  }
  return null;
}
// Ingredient groups: a recipe ingredient '#seed' is any seed. ingKey: which of r's ingredients an item counts for.
const ingKey = (r, it) => r.in[it] ? it : Object.keys(r.in).find(k => ingredientMatches(k, it)) || null;
const groupHave = (e, k) => groupOf(k) ? Object.entries(e.inp).reduce((t, [it, n]) => t + (ingredientMatches(k, it) ? n : 0), 0) : e.inp[k] || 0;
function takeIngredient(e, k, n) {
  if (!groupOf(k)) { e.inp[k] -= n; if (!e.inp[k]) delete e.inp[k]; bump('used', k, n); return; }
  for (const it of Object.keys(e.inp)) { if (n <= 0) break; if (!ingredientMatches(k, it)) continue; const t = Math.min(n, e.inp[it]); e.inp[it] -= t; n -= t; bump('used', it, t); if (!e.inp[it]) delete e.inp[it]; }
}
// Barreling stations pick their own recipe: fill mode fills empty barrels with whatever fluid is in the pipe at its back,
// empty mode takes filled barrels of any fluid and drains them into that pipe (empty barrels come out to take away).
export const barrelMode = e => e.mode === 'empty' || (!e.mode && e.recipe?.startsWith('empty_')) ? 'empty' : 'fill';
function barrelAccepts(e, it) {
  if (barrelMode(e) === 'fill') return it === 'barrel' && (e.inp.barrel || 0) < 10;
  const f = ITEMS[it]?.barrel; if (!f) return false;
  const busy = e.crafting || Object.keys(e.inp).some(k => k !== it && e.inp[k] > 0);
  return (e.recipe === 'empty_' + f || !busy) && (e.inp[it] || 0) < 10;
}
function barrelPick(e, it) {
  const f = ITEMS[it]?.barrel;
  if (barrelMode(e) === 'empty' && f && e.recipe !== 'empty_' + f) setRecipe(e, 'empty_' + f, true);
}
function barrelTick(e) {   // fill mode follows the fluid in its pipe
  if (barrelMode(e) !== 'fill' || e.crafting) return;
  const f = e.fb?.[0]?.fluid || e.backFluid;
  if (f && FLUIDS[f]?.barrel && e.recipe !== 'fill_' + f) setRecipe(e, 'fill_' + f, true);
}
// A drill's output holds what one cycle dug up: one item, or more from deep deposits and productivity.
const bufCount = e => e.buffer ? Math.max(1, e.bufN || 0) : 0;
function takeBuf(e, n) { const k = Math.min(n, bufCount(e)); e.bufN = bufCount(e) - k; if (!e.bufN) e.buffer = null; return k; }
const wants = (t, it) => isBeltLike(t) ? beltWants(t, it) : canAccept(t, it);
function give(t, it, dir) {
  if (isBeltLike(t)) return dropOnBelt(t, it, dir, true);
  if (canAccept(t, it)) { insert(t, it); return true; }
  return false;
}
// Burner energy: pull fuel when needed, return 1 while burning, 0 when out.
function burner(e, want, mw, dt) {
  if (!want) return 0;
  if (e.burn <= 0 && e.fuel > 0) { e.burn += ITEMS[e.fuelType].fuel; bump('used', e.fuelType); if (--e.fuel === 0) e.fuelType = null; }
  if (e.burn <= 0) return 0;
  e.burn -= mw * dt; return 1;
}

// ---------------------------------------------------------------- power networks
// Poles join into networks by wire reach, by overlapping supply areas, and by cables strung by hand, but only
// within one voltage (VOLTAGES). Machines inside a pole's supply area join that network, but only poles of a voltage
// machines may draw from: generators feed extra-low voltage only (one-tile engines from old saves, `compact`, still
// feed any pole, as they always did), and dams high voltage only. Road conduits join poles near them into grids that
// power machines beside the road (ROAD_POWER).
export const nets = [];
export const voltsOf = def => def.volts || [def.volt ?? 0];
export const autoVolt = def => voltsOf(def)[0];   // the voltage a pole wires itself up on
const producerKind = e => e.kind === 'solar' || e.kind === 'engine' || e.kind === 'fgen';
// Can pole p feed entity e (or take its power)?
export function poleServes(e, p) {
  const def = ENTITIES[e.type], pv = voltsOf(ENTITIES[p.type]);
  if (def.hv) return pv.includes(1);
  if (def.gen) return e.compact ? true : pv.includes(ELV);
  return pv.some(v => VOLTAGES[v]?.consumers);
}
const conduitAt = (x, z) => !!world.roads.get(x + ',' + z)?.p;
export function rebuildPower() {
  const poles = [...world.ents.values()].filter(e => e.kind === 'pole');
  const parent = new Map(poles.map(p => [p, p]));
  const find = p => { while (parent.get(p) !== p) { parent.set(p, parent.get(parent.get(p))); p = parent.get(p); } return p; };
  const join = (a, b) => parent.set(find(a), find(b));
  const wires = [], seen = new Set();
  for (const a of poles) {
    const da = ENTITIES[a.type], va = autoVolt(da);
    const same = poles.filter(b => b !== a && autoVolt(ENTITIES[b.type]) === va && sameFac(a, b));
    const near = same.map(b => [b, Math.hypot(a.x - b.x, a.z - b.z, a.y - b.y)])
      .filter(([b, d]) => d <= Math.min(da.wire, ENTITIES[b.type].wire)).sort((p, q) => p[1] - q[1]).slice(0, 5);
    for (const [b] of near) {
      const id = a.id < b.id ? a.id + '-' + b.id : b.id + '-' + a.id;
      join(a, b);
      if (!seen.has(id)) { seen.add(id); wires.push([a, b, va]); }
    }
    for (const b of same) {   // overlapping coverage is one network even without a wire
      const s = da.supply + ENTITIES[b.type].supply;
      if (Math.abs(a.x - b.x) <= s && Math.abs(a.z - b.z) <= s && Math.abs(a.y - b.y) <= 1) join(a, b);
    }
  }
  const cables = [], wired = new Map();   // wired: a machine on a cable straight from a pole (Direct wiring) -> that pole
  for (const l of world.links) {
    const a = world.ents.get(key(...l.a)), b = world.ents.get(key(...l.b));
    if (!a || !b || !sameFac(a, b)) continue;
    if (a.kind === 'pole' && b.kind === 'pole') { join(a, b); cables.push([a, b, l.kind]); continue; }
    const [p, m] = a.kind === 'pole' ? [a, b] : [b, a];
    if (p.kind !== 'pole' || m.kind === 'pole' || !wiresBuildings(ENTITIES[p.type]) || !poleServes(m, p) || !isResearched(WIRE_TECH)) continue;
    if (!wired.has(m)) wired.set(m, p);
    cables.push([p, m, l.kind]);
  }
  // road conduits: each touching group is a grid; it joins every low voltage pole of one factory near it
  const grids = [], gridAt = new Map();
  for (const [k, t] of world.roads) {
    if (!t.p || gridAt.has(k)) continue;
    const g = { id: grids.length, tiles: [], poles: [], net: null, fac: null, demand: 0, nextDemand: 0, sat: 1 }, q = [k];
    gridAt.set(k, g);
    while (q.length) {
      const c = q.pop(), [x, z] = c.split(',').map(Number); g.tiles.push([x, z]);
      for (const [dx, dz] of DIRS) { const n = (x + dx) + ',' + (z + dz); if (!gridAt.has(n) && conduitAt(x + dx, z + dz)) { gridAt.set(n, g); q.push(n); } }
    }
    grids.push(g);
  }
  if (grids.length) for (const p of poles) {
    const def = ENTITIES[p.type]; if (p.y !== 0 || !voltsOf(def).includes(ROAD_POWER.volt)) continue;
    const r = Math.max(def.supply, ROAD_POWER.poleReach);
    for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) {
      const g = gridAt.get((p.x + dx) + ',' + (p.z + dz)); if (!g) continue;
      if (g.fac === null) g.fac = p.fac ?? 1;
      if ((p.fac ?? 1) !== g.fac || g.poles.includes(p)) continue;
      if (g.poles.length) join(g.poles[0], p);
      g.poles.push(p);
    }
  }
  const byRoot = new Map();
  nets.length = 0;
  for (const p of poles) {
    const r = find(p);
    if (!byRoot.has(r)) { const n = { id: nets.length, poles: [], demand: 0, nextDemand: 0, capacity: 0, sat: 0, produced: 0, engines: [], solar: 0, consumers: 0 }; byRoot.set(r, n); nets.push(n); }
    p.net = byRoot.get(r); p.net.poles.push(p);
  }
  for (const g of grids) g.net = g.poles[0]?.net ?? null;
  for (const e of world.ents.values()) {
    if (e.kind === 'pole') continue;
    e.net = null; e.viaRoad = null;
    if (!(isElectric(e) || producerKind(e))) continue;
    if (wired.has(e)) { e.net = wired.get(e).net; e.wired = true; }
    else e.wired = false;
    if (!e.net) for (const p of poles) {
      const s = ENTITIES[p.type].supply;
      if (!poleServes(e, p)) continue;
      if (Math.abs(e.y - p.y) <= 1 && sameFac(e, p) && (e.foot || [[e.x, e.z]]).some(([x, z]) => Math.abs(x - p.x) <= s && Math.abs(z - p.z) <= s)) { e.net = p.net; break; }
    }
    // beside a powered road: machines only (generators and dams need their own poles)
    if (!e.net && grids.length && e.y === 0 && isElectric(e) && !ENTITIES[e.type].hv && !ENTITIES[e.type].gen) {
      const R = ROAD_POWER.reach;
      search: for (const [x, z] of e.foot || [[e.x, e.z]]) for (let dx = -R; dx <= R; dx++) for (let dz = -R; dz <= R; dz++) {
        const g = gridAt.get((x + dx) + ',' + (z + dz));
        if (g?.net && (e.fac ?? 1) === g.fac) { e.net = g.net; e.viaRoad = g; break search; }
      }
    }
    if (e.net && isElectric(e)) e.net.consumers++;
  }
  world.fluidDirty = true;
  world.wires = wires; world.cables = cables; world.roadGrids = grids; world.powerDirty = false;
  bus.emit('power');
}

// ---------------------------------------------------------------- fluids (see fluids.js)
function powerTick(dt) {
  for (const n of nets) {
    const used = Math.min(n.nextDemand, n.capacity);
    const fromGen = Math.max(0, used - n.solar * ENTITIES.solar.out * daylight() - n.hydro);
    // every producer runs at the same fraction of what it could give
    const could = n.engines.reduce((s, e) => s + e.cap, 0), k = could ? Math.min(1, fromGen / could) : 0;
    for (const e of n.engines) {
      const def = ENTITIES[e.type], share = e.cap * k;
      e.load = share / def.out;
      draw(burnNet(e), e.load * burnRate(e) * dt);
      if (share > 0) { e.lastActive = S.T; e.status = 'generating'; } else e.status = e.cap ? 'idle (no demand)' : e.kind === 'fgen' ? 'no diesel' : 'no steam';
    }
    n.demand = n.nextDemand; n.produced = used; n.nextDemand = 0;
  }
  for (const e of world.ents.values()) if ((e.kind === 'engine' || e.kind === 'fgen') && !e.net) { e.load = 0; e.status = e.compact ? 'not connected: put it in a pole\'s area' : 'not connected: put it in a generator pole\'s area'; }
  fluidPost(dt, burner);
  reactorTick(dt);
}

// ---------------------------------------------------------------- machines
function craftTick(e, dt, speed, energy, prod = 0) {
  const r = RECIPE[e.recipe];
  if (!r) { e.status = 'no recipe'; return false; }
  if (!e.crafting) {
    for (const [k, n] of Object.entries(r.out)) if ((e.out[k] || 0) + n > Math.max(20, n * 4)) { e.status = 'output full'; return false; }
    for (const [k, n] of Object.entries(r.in)) if (groupHave(e, k) < n) { e.status = 'waiting for ingredients'; return false; }
    for (const [k, n] of Object.entries(r.in)) takeIngredient(e, k, n);
    e.crafting = true; e.prog = 0;
  }
  if (energy <= 0) { e.status = 'no power'; return true; }
  let dp = dt * speed * energy / r.time;
  if (r.fin || r.fout) {   // fluids flow in and out bit by bit, so a slow line slows the machine instead of starving it
    for (const [f, n] of Object.entries(r.fin || {})) {
      const net = e.fnet?.[f]; dp = Math.min(dp, avail(net) / n);
      if (dp <= 1e-9) { e.status = net ? `waiting for ${FLUIDS[f].name.toLowerCase()}` : `no ${FLUIDS[f].name.toLowerCase()}: connect a pipe to its input`; return true; }
    }
    for (const [f, n] of Object.entries(r.fout || {})) {
      const net = e.fnet?.[f]; dp = Math.min(dp, room(net) / n);
      if (dp <= 1e-9) { e.status = net?.members.length > 1 ? `${FLUIDS[f].name.toLowerCase()} output full` : `${FLUIDS[f].name.toLowerCase()} has nowhere to go: connect a pipe or tank`; return true; }
    }
    dp = Math.min(dp, 1 - e.prog);
    for (const [f, n] of Object.entries(r.fin || {})) draw(e.fnet[f], n * dp);
    for (const [f, n] of Object.entries(r.fout || {})) push(e.fnet[f], n * dp, f);
  }
  e.prog += dp; e.lastActive = S.T; e.status = 'working';
  if (e.prog >= 1 - 1e-9) {
    const extra = prodExtra(e, prod);
    for (const [k, n] of Object.entries(r.out)) { e.out[k] = (e.out[k] || 0) + n * (1 + extra); bump('made', k, n * (1 + extra)); }
    e.crafting = false; e.prog = 0;
  }
  return true;
}
// The tile a drill pushes ore into: in front of it, and for a big drill the front tile on its left (as it faces).
export function drillFront(e) {
  const [dx, dz] = DIRS[e.dir];
  if (!e.foot) return [e.x + dx, e.z + dz];
  const [rx, rz] = DIRS[(e.dir + 1) % 4];
  let best = null;
  for (const [x, z] of e.foot) if (!covers(e, x + dx, z + dz) && (!best || x * rx + z * rz < best[2])) best = [x + dx, z + dz, x * rx + z * rz];
  return [best[0], best[1]];
}
// The deposits a drill can work now: one under every tile it stands on that its depth reaches (and, for ore that needs
// acid, only if it can pipe acid in). `deep` / `acid`: why the others can't be worked, for its status.
export function drillDeposits(e, st = machineStats(e)) {
  const def = ENTITIES[e.type], list = []; let deep = null, acid = null;
  for (const [x, z] of e.foot || [[e.x, e.z]]) {
    const o = world.ores.get(key(x, e.y, z)); if (!o) continue;
    if (o.layer > st.depth) { deep ||= o; continue; }
    const f = ITEMS[o.type].mineFluid;
    if (f && !def.ports?.some(p => p.fluid === f)) { acid ||= o.type; continue; }
    list.push([x, z, o]);
  }
  return { list, deep, acid, cover: list.length / (def.size ? def.size[0] * def.size[1] : 1) };
}
function drillOutput(e) {
  const [fx, fz] = drillFront(e), t = world.ents.get(key(fx, e.y, fz));
  if (t && !sameFac(e, t)) return;
  if (!t) { if (e.y === 0) { for (let i = bufCount(e); i > 0; i--) spill(e.buffer, fx + .5, fz + .5); takeBuf(e, bufCount(e)); } return; }   // Factorio drills drop ore on the ground
  if (t.kind === 'inserter') return;
  while (e.buffer && (isBeltLike(t) ? dropOnBelt(t, e.buffer, e.dir, false) : canAccept(t, e.buffer) && (insert(t, e.buffer), true))) takeBuf(e, 1);
}
// ---------------------------------------------------------------- crafting stations
// The arm of a crafting station fetches what its recipe is short of (enough for two crafts) from chests of its factory
// within reach, one item a trip: out to the chest (it takes the item there), back, and in. e.arm: { t: 0..1 through the
// trip, it: what it is fetching, at: [x, y, z] of the chest }. Guests only draw it (the host decides what it takes).
export const stationChests = e => {
  const R = ENTITIES[e.type].pull?.radius ?? 0, out = [];
  for (let dx = -R; dx <= R; dx++) for (let dz = -R; dz <= R; dz++) {
    const c = world.ents.get(key(e.x + dx, e.y, e.z + dz));
    if (c?.kind === 'chest' && sameFac(c, e) && !out.includes(c)) out.push(c);
  }
  return out;
};
function stationArm(e, def, dt, sat, demand) {
  const A = e.arm ||= { t: 0, it: null, at: null }, r = RECIPE[e.recipe];
  if (!A.it && A.t <= 0) {   // idle: look for something it is short of
    if (!r || isClient()) return;
    for (const [k, n] of Object.entries(r.in)) {
      if (groupHave(e, k) >= n * 2) continue;
      for (const c of stationChests(e)) {
        const it = [...c.store.counts().keys()].find(i => ingredientMatches(k, i));
        if (it) { A.it = it; A.at = [c.x, c.y, c.z]; A.t = 0; A.got = false; break; }
      }
      if (A.it) break;
    }
    if (!A.it) return;
  }
  demand(def.power * .3);
  A.t += dt / def.pull.trip * sat;
  if (A.it && !A.got && A.t >= .5 && !isClient()) {   // at the chest: take it, or come back empty
    const c = world.ents.get(key(...A.at));
    if (c?.store?.count(A.it) && sameFac(c, e)) { c.store.remove(A.it, 1); A.got = true; c.lastActive = S.T; } else A.it = null;
  }
  if (A.t >= 1) {
    if (A.it && A.got && !isClient()) { e.inp[A.it] = (e.inp[A.it] || 0) + 1; e.lastActive = S.T; }
    A.t = 0; A.it = null; A.got = false;
  }
}

// Mining never empties a deposit: when its layer runs out, it drops to the next one down (only the host decides).
export function depleteOre(x, y, z, n = 1) {
  const o = world.ores.get(key(x, y, z)); if (!o) return null;
  if (!endless(o)) {
    const before = oreStage(oreWear(o));
    o.amount -= n;
    if (oreStage(oreWear(o)) !== before) bus.emit('orestage', x, y, z, o);   // its look changes (terrain.js)
    if (o.amount <= 0 && !isClient()) { o.layer++; o.amount = layerSize(o, o.layer); bus.emit('orelayer', x, y, z, o); }
    world.edits.ores.set(key(x, y, z), [o.layer, o.amount]);   // chunks are made again from the seed: keep what was dug
  }
  return o.type;
}
export const depositLayer = o => DEPOSIT[Math.min(DEPOSIT.length - 1, o?.layer || 0)];
const noPower = e => !e.net ? 'not connected to power' : 'no power';

function tickEntity(e, dt) {
  const def = ENTITIES[e.type], net = e.net, g = e.viaRoad, sat = net ? Math.min(net.sat, g ? g.sat : 1) : 0;
  const demand = kw => { if (net) net.nextDemand += kw; if (g) g.nextDemand += kw; };
  const st = def.augSlots ? machineStats(e) : null;
  switch (e.kind) {
    case 'drill': {
      if (e.buffer) { drillOutput(e); if (e.buffer) { const [fx, fz] = drillFront(e), t = world.ents.get(key(fx, e.y, fz)); e.status = t && !sameFac(e, t) ? 'output blocked: that belongs to another factory' : 'output blocked'; break; } }
      // the deposits under it, worked in turn; its rate is for all its tiles covered, less over fewer
      const { list, deep, acid, cover } = drillDeposits(e, st);
      if (!list.length) { e.status = deep ? `needs a depth upgrade: the deposit is down at ${depositLayer(deep).name.toLowerCase()}` : acid ? `${ITEMS[acid].name.toLowerCase()} needs ${FLUIDS[ITEMS[acid].mineFluid].name.toLowerCase()}: use a leaching drill` : 'no deposit under it'; break; }
      const [ox, oz, ore] = list[(e.dc || 0) % list.length], layer = depositLayer(ore), acidF = ITEMS[ore.type].mineFluid, rate = def.rate * cover * st.speed * layer.speed;
      if (acidF && avail(e.fnet?.[acidF]) < def.acid * dt * rate) { e.status = e.fnet?.[acidF] ? `waiting for ${FLUIDS[acidF].name.toLowerCase()}` : `pipe ${FLUIDS[acidF].name.toLowerCase()} to its back`; break; }
      if (acidF) draw(e.fnet[acidF], def.acid * dt * rate);
      let energy;
      if (def.burner) { energy = burner(e, true, .15 * st.power, dt); if (!energy) { e.status = 'out of fuel'; break; } }
      else { demand(def.power * st.power * cover); energy = sat; if (sat <= 0) { e.status = noPower(e); break; } }
      e.timer += dt * rate * energy; e.lastActive = S.T; e.status = 'mining';
      if (e.timer >= 1) {
        e.timer = 0; e.dc = ((e.dc || 0) + 1) % list.length;
        const it = depleteOre(ox, e.y, oz), n = 1 + (Math.random() < layer.double ? 1 : 0) + prodExtra(e, st.prod);
        e.buffer = it; e.bufN = n; bump('made', it, n); drillOutput(e);
      }
      break;
    }
    case 'furnace': {
      if (def.burner) {
        const want = e.crafting || Object.keys(e.inp).length > 0;
        const energy = want ? (e.burn > 0 || e.fuel > 0 ? 1 : 0) : 0;
        const working = craftTick(e, dt, def.speed * st.speed, energy, st.prod);
        if (working) burner(e, true, .09 * st.power, dt);
        if (working && e.burn <= 0 && !e.fuel) e.status = 'out of fuel';
      } else {
        if (e.crafting) demand(def.power * st.power);
        craftTick(e, dt, def.speed * st.speed, sat, st.prod);
        if (e.status === 'no power') e.status = noPower(e);
      }
      if (!e.recipe) e.status = 'waiting for ore';
      break;
    }
    case 'assembler':
      if (def.cats?.includes('barrel')) barrelTick(e);
      if (def.pull) stationArm(e, def, dt, sat, demand);
      if (e.crafting) demand(def.power * st.power);
      if (def.pull && !e.crafting && RECIPE[e.recipe]) { craftTick(e, dt, def.speed * st.speed, sat, st.prod); if (e.arm?.it) e.status = `fetching ${ITEMS[e.arm.it].name.toLowerCase()}`; else if (e.status === 'waiting for ingredients') e.status = `waiting: no chest within ${def.pull.radius} tiles has what it needs`; break; }
      craftTick(e, dt, def.speed * st.speed, sat, st.prod);
      if (e.status === 'no power') e.status = noPower(e);
      break;
    case 'lab': {
      const tech = TECH[S.research.current];
      if (!tech || S.research.done.has(tech.id)) { e.status = S.research.queue?.length ? 'queued research is waiting for precision' : 'no research selected'; e.unit = null; break; }
      if (e.unit !== tech.id) {
        e.unit = null; e.prog = 0;
        if ((S.research.progress[tech.id] || 0) >= tech.count) break;
        if (!Object.keys(tech.cost).every(p => (e.inp[p] || 0) >= 1)) { e.status = 'missing science packs'; break; }
        for (const p in tech.cost) { if (--e.inp[p] === 0) delete e.inp[p]; bump('used', p); }
        e.unit = tech.id;
      }
      demand(def.power * st.power);
      if (sat <= 0) { e.status = noPower(e); break; }
      e.prog += dt * def.speed * st.speed * sat / tech.time; e.lastActive = S.T; e.status = 'researching';
      if (e.prog >= 1) {
        e.unit = null; e.prog = 0;
        S.research.progress[tech.id] = Math.min(tech.count, (S.research.progress[tech.id] || 0) + 1 + prodExtra(e, st.prod));
        if (S.research.progress[tech.id] >= tech.count && !isClient()) completeResearch(tech.id);
      }
      break;
    }
    case 'inserter': {
      const [dx, dz] = DIRS[e.dir], r = e.reach;
      const src0 = world.ents.get(key(e.x - dx * r, e.y, e.z - dz * r)), tgt0 = world.ents.get(key(e.x + dx * r, e.y + e.dy, e.z + dz * r));
      const src = src0 && sameFac(e, src0) ? src0 : null, tgt = tgt0 && sameFac(e, tgt0) ? tgt0 : null;
      const moving = !!e.held || e.t > 0;
      let energy;
      if (def.burner) {
        // burner inserters fuel themselves: fuel in the hand goes into their own empty fuel slot, and a dry
        // one reaches for fuel behind it before anything else
        if (e.held && ITEMS[e.held]?.fuel && !e.fuel) { e.fuel = 1; e.fuelType = e.held; e.held = null; e.lastActive = S.T; }
        else if (!e.held && e.burn <= 0 && !e.fuel && src && src.kind !== 'inserter') {
          const it = take(src, f => !!ITEMS[f]?.fuel);
          if (it) { e.fuel = 1; e.fuelType = it; e.lastActive = S.T; }
        }
        energy = burner(e, moving, .1, dt) || (!moving && (e.burn > 0 || e.fuel > 0) ? 1 : 0);
      } else { if (moving) demand(def.power); energy = sat; }
      const spd = dt / e.swing * energy;
      if (!e.held) {
        if (e.t > 0) { e.t = Math.max(0, e.t - spd); e.lastActive = S.T; e.status = 'returning'; }
        else if (!src || !tgt) e.status = (src0 && !src) || (tgt0 && !tgt) ? 'that belongs to another factory' : !src ? 'nothing behind it' : 'nothing in front of it';
        else if (energy <= 0) e.status = def.burner ? 'out of fuel' : noPower(e);
        else if (src.kind !== 'inserter') {
          const it = take(src, it => (!e.filter || it === e.filter) && wants(tgt, it));
          if (it) { e.held = it; e.lastActive = S.T; e.status = 'moving'; } else e.status = 'waiting';
        }
      } else {
        e.lastActive = S.T;
        if (e.t < 1) { e.t = Math.min(1, e.t + spd); e.status = 'moving'; }
        else if (tgt && give(tgt, e.held, e.dir)) e.held = null;
        else e.status = 'target full';
      }
      if (energy <= 0 && moving) e.status = def.burner ? 'out of fuel' : noPower(e);
      break;
    }
    case 'transmitter': {
      if (!e.charging) {
        if ((e.inp.resonance_pack || 0) < 1) { e.status = 'needs resonance packs'; break; }
        if (--e.inp.resonance_pack === 0) delete e.inp.resonance_pack;
        bump('used', 'resonance_pack');
        e.charging = true; e.prog = 0;
      }
      demand(def.power);
      if (sat <= 0) { e.status = noPower(e); break; }
      e.prog += dt * sat / 4; e.lastActive = S.T; e.status = 'charging pulse';
      if (e.prog >= 1) { e.charging = false; e.prog = 0; if (!isClient()) bus.emit('pulse', e); }
      break;
    }
    case 'oilpump': {
      const o = world.oil.get(e.x + ',' + e.z), out = e.fb?.[0];
      e.load = 0;
      if (!o || e.y !== 0) { e.status = 'no crude oil under it'; break; }
      if (!out) { e.status = 'connect a pipe or tank to its front'; break; }
      if (room(out) <= 0) { e.status = 'output full'; break; }
      demand(def.power * st.power); if (sat <= 0) { e.status = noPower(e); break; }
      const rate = def.rate * o.yield / 100 * st.speed, got = push(out, rate * sat * dt, 'crude_oil');
      if (st.prod > 0) push(out, got * st.prod, 'crude_oil');   // productivity: more crude for the same draw on the well
      if (!isClient()) { o.yield = Math.max(20, o.yield - got / 2000); world.edits.oil.set(e.x + ',' + e.z, o.yield); }   // deposits slow down as you pump them, never below 20%
      e.load = sat; e.lastActive = S.T; e.status = `pumping ${(rate * (1 + st.prod)).toFixed(1)}/s`;
      break;
    }
    case 'fpump':
      if (e.fb?.[0]?.fluid && room(e.fb?.[1]) > 0) demand(def.power);
      passThrough(e, dt, sat);
      if (!e.net && e.status === 'no power') e.status = 'not connected to power';
      break;
    case 'valve': passThrough(e, dt, 1); break;
    case 'depot': {
      // fuel barrels in its storage go into its tank, and the empty barrels stay behind for the trip back
      const n = e.fb?.[0], bar = e.fuelFluid + '_barrel';
      if (n && e.store.count(bar) && room(n) >= BARREL_SIZE && (e.store.count('barrel') || e.store.room('barrel'))) { e.store.remove(bar, 1); e.store.add('barrel', 1); push(n, BARREL_SIZE, e.fuelFluid); }
      break;
    }
    case 'solar': {
      const sun = daylight();
      e.status = !e.net ? 'not connected: put a pole next to it' : sun <= 0 ? 'night: no sunlight' : `generating ${Math.round(def.out * sun)} kW`;
      if (e.net && sun > 0) e.lastActive = S.T;
      break;
    }
    case 'lamp': {   // on by itself once it gets properly dark
      e.lit = false;
      if (daylight() > .2) { e.status = 'off: it is light out'; break; }
      if (def.burner) { if (burner(e, true, def.burn, dt)) e.lit = true; else { e.status = 'out of fuel'; break; } }
      else { demand(def.power); if (sat > 0) e.lit = true; else { e.status = noPower(e); break; } }
      e.status = 'lit'; e.lastActive = S.T;
      break;
    }
    case 'dam': damTick(e, sat, demand); break;
    case 'medlab': medTick(e, dt, def, st, sat, demand); break;
    case 'radar': {   // keeps its area live on the map, and explores outward while it has power (explore.js)
      demand(def.power);
      if (sat <= 0) { e.status = noPower(e); break; }
      radarSweep(e, def, dt, sat);
      e.lastActive = S.T; e.spin = ((e.spin || 0) + dt * 1.2 * sat) % (Math.PI * 2);
      e.status = (e.scanR ?? def.scan) < def.reveal ? `scanning · explored out to ${Math.floor(e.scanR ?? def.scan)} of ${def.reveal} tiles` : `scanning · keeps ${def.scan} tiles around it live`;
      break;
    }
    case 'pole': e.status = `network ${e.net ? e.net.id + 1 : '?'} · ${e.net ? Math.round(e.net.produced) : 0} kW used`; break;
  }
}

// ---------------------------------------------------------------- research
// The research queue: S.research.queue lists techs in the order they will be researched. Labs work on `current`, the
// first queued tech whose prerequisites are done; one waiting on a prerequisite further up the queue simply waits its
// turn. Queuing a tech queues whatever it needs that isn't done or queued yet, just before it.
export function completeResearch(id) {
  S.research.done.add(id);
  nextResearch();
  bus.emit('research', id);
}
export function techAvailable(t) {
  return t.pre.every(p => S.research.done.has(p)) && (t.precision ?? 0) <= S.maxTier;
}
export function nextResearch() {
  const R = S.research;
  R.queue = (R.queue || []).filter(id => TECH[id] && !R.done.has(id));
  R.current = R.queue.find(id => techAvailable(TECH[id])) || null;
}
// A tech and everything it still needs, prerequisites first.
export function techPath(id) {
  const out = [], seen = new Set();
  const visit = t => { if (seen.has(t) || S.research.done.has(t) || !TECH[t]) return; seen.add(t); for (const p of TECH[t].pre) visit(p); out.push(t); };
  visit(id); return out;
}
// Does tech t need `id`, directly or through other techs?
const dependsOn = (t, id) => TECH[t].pre.some(p => p === id || dependsOn(p, id));
// op.do: 'now' puts it (and what it needs) first, 'queue' adds it at the end, 'remove' takes it out (with whatever
// queued needs it), 'move' shifts it by op.by places as far as its prerequisites and dependents allow.
export function researchAction(op) {
  const R = S.research, t = TECH[op.id];
  R.queue ||= [];
  if (!t || R.done.has(op.id)) return;
  if (op.do === 'remove') {
    if (!R.queue.includes(op.id)) return;
    R.queue = R.queue.filter(q => q !== op.id && !dependsOn(q, op.id));
  } else if (op.do === 'move') {
    const q = R.queue, i = q.indexOf(op.id); if (i < 0) return;
    let j = i;
    for (let k = 0; k < Math.abs(op.by | 0); k++) {
      const n = j + Math.sign(op.by); if (n < 0 || n >= q.length) break;
      if (op.by < 0 ? dependsOn(op.id, q[n]) : dependsOn(q[n], op.id)) break;   // never ahead of what it needs, never behind what needs it
      [q[j], q[n]] = [q[n], q[j]]; j = n;
    }
  } else {
    const path = techPath(op.id).filter(id => op.do === 'now' || !R.queue.includes(id));
    R.queue = op.do === 'now' ? [...path, ...R.queue.filter(q => !path.includes(q))] : [...R.queue, ...path];
  }
  nextResearch();
  bus.emit('queue');
}

// ---------------------------------------------------------------- precision
export function computeVolume() {
  let v = 0;
  for (const e of world.ents.values()) if (isActive(e)) v += ENTITIES[e.type].vol;
  for (const f of world.frames.values()) {
    const inside = world.ents.get(key(f.x, f.y, f.z)), above = world.ents.get(key(f.x, f.y + 1, f.z));
    if (isActive(inside)) v += ENTITIES.frame.vol * 2;           // using the hollow counts double
    else if (isActive(above) || world.frames.has(key(f.x, f.y + 1, f.z))) v += ENTITIES.frame.vol;
  }
  S.activeVol = v;
  let t = 0; TIERS.forEach((tr, i) => { if (v >= tr.need) t = i; });
  if (t > S.maxTier) { S.maxTier = t; bus.emit('tier', t); }
}

// ---------------------------------------------------------------- hand crafting
export function planCraft(rid, times) {
  const sim = actor.inv.counts(), queue = [];
  const craftInto = (r, t, internal) => {
    const took = {};   // what a group ingredient ('#seed') actually used, so a cancel gives back the same items
    for (const [k, n] of Object.entries(r.in)) if (!need(k, n * t, took)) return false;
    const giveOut = {};
    for (const [k, n] of Object.entries(r.out)) { const g = n * t - (internal[k] || 0); if (g > 0) giveOut[k] = g; }
    queue.push({ rid: r.id, times: t, done: 0, prog: 0, give: giveOut, top: !Object.keys(internal).length, ...(Object.keys(took).length ? { took } : {}) });
    return true;
  };
  const need = (item, n, took) => {
    const g = groupOf(item);
    if (g) {   // any item of the group, from what is carried (groups are never crafted)
      for (const [it, have] of sim) {
        if (n <= 0) break;
        if (have <= 0 || !g.match(it)) continue;
        const use = Math.min(have, n); sim.set(it, have - use); n -= use; took[it] = (took[it] || 0) + use;
      }
      return n <= 0;
    }
    const have = sim.get(item) || 0, use = Math.min(have, n);
    sim.set(item, have - use);
    const rem = n - use; if (rem <= 0) return true;
    const r = RECIPE[item];
    if (!r || r.cat !== 'craft' || !r.hand || !recipeUnlocked(r)) return false;
    return craftInto(r, Math.ceil(rem / r.out[item]), { [item]: rem });
  };
  const r = RECIPE[rid];
  if (!r || !r.hand || !recipeUnlocked(r) || !craftInto(r, times, {})) return null;
  return { sim, queue };
}
export function maxCraftable(rid) {
  if (S.sandbox) return RECIPE[rid] ? stackOf(rid) : 0;   // anything, as much as you like
  let lo = 0, hi = 1;
  while (hi <= 512 && planCraft(rid, hi)) { lo = hi; hi *= 2; }
  hi = Math.min(hi, 513);
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (planCraft(rid, m)) lo = m; else hi = m; }
  return lo;
}
export function queueCraft(rid, times = 1) {
  if (S.sandbox) {   // free and instant: whatever the recipe makes, straight into the inventory
    const r = RECIPE[rid]; if (!r) return false;
    for (const [k, n] of Object.entries(r.out)) { invGive(k, n * times); bump('made', k, n * times); }
    notify('crafted', rid); return true;
  }
  const plan = planCraft(rid, times);
  if (!plan) return false;
  const inv = actor.inv, before = inv.counts();
  for (const k of new Set([...before.keys(), ...plan.sim.keys()])) { const d = (plan.sim.get(k) || 0) - (before.get(k) || 0); if (d < 0) { inv.remove(k, -d); bump('used', k, -d); } else if (d > 0) inv.add(k, d); }
  actor.craft.push(...plan.queue); if (actor.local) bus.emit('inv'); return true;
}
export function cancelCraft(i) {
  const c = actor.craft[i]; if (!c || !c.top) return;
  const r = RECIPE[c.rid], left = c.times - c.done;
  for (const [k, n] of Object.entries(r.in)) {
    if (!groupOf(k)) { invGive(k, n * left); continue; }
    let back = n * left;   // a group ingredient: the items it really took, up to what the crafts left need
    for (const [it, got] of Object.entries(c.took || {})) { const g = Math.min(got, back); if (g > 0) { invGive(it, g); back -= g; } }
  }
  actor.craft.splice(i, 1);
}
function craftQueueTick(dt) {
  const c = actor.craft[0]; if (!c) return;
  const r = RECIPE[c.rid];
  c.prog += dt / Math.max(.25, r.time) * Math.max(.2, 1 + playerMods(actor).craft);
  if (c.prog >= 1) {
    c.prog = 0; c.done++;
    if (c.done >= c.times) {
      actor.craft.shift();
      for (const [k, n] of Object.entries(c.give)) { invGive(k, n); bump('made', k, n); }
      if (c.top) { notify('crafted', c.rid); notify('float', `+${c.give[c.rid] || 1} ${ITEMS[c.rid].name}`, actor.x, 1.2, actor.z); }
      placePending();
    }
  }
}

// ---------------------------------------------------------------- building with what you don't have yet
// Placing something you've run out of crafts it (and the parts it needs, as hand crafting always does) when you
// have the materials. The spot waits in `actor.pending` and gets built as soon as the craft lands, so dragging a
// belt line past the end of your stack keeps going, one tile per finished belt.
const samePlace = (a, b) => a.x === b.x && a.y === b.y && a.z === b.z;
const coming = it => actor.craft.reduce((t, c) => t + (c.give[it] || 0), 0);
export function placeOrCraft(op, fac) {
  const err = canPlace(op.type, op.x, op.y, op.z, op.dir, op.dy, { reach: true, fac, noInv: true });
  if (err) { notify('toast', err); return null; }
  if (invGet(op.type) >= 1) return place(op.type, op.x, op.y, op.z, op.dir, op.dy, false, fac);
  const pend = actor.pending ||= [];
  if (pend.some(p => samePlace(p, op))) return null;
  const waiting = pend.filter(p => p.type === op.type).length;
  if (coming(op.type) <= waiting && !queueCraft(op.type, 1)) {
    notify('toast', `out of ${ENTITIES[op.type].name.toLowerCase()}, and nothing to craft one from`); return null;
  }
  pend.push({ type: op.type, x: op.x, y: op.y, z: op.z, dir: op.dir, dy: op.dy, fac });
  notify('pending');
  placePending();
  return null;
}
// Build every waiting spot whose item is in hand now. Spots that went bad (taken, out of reach) or whose craft was
// cancelled are dropped.
export function placePending() {
  const pend = actor.pending; if (!pend?.length) return;
  for (let i = 0; i < pend.length; i++) {
    const p = pend[i];
    if (invGet(p.type) < 1) { if (coming(p.type) <= pend.slice(0, i).filter(q => q.type === p.type && invGet(q.type) < 1).length) { pend.splice(i--, 1); } continue; }
    pend.splice(i--, 1);
    if (!canPlace(p.type, p.x, p.y, p.z, p.dir, p.dy, { reach: true, fac: p.fac })) place(p.type, p.x, p.y, p.z, p.dir, p.dy, false, p.fac);
  }
  notify('pending');
}
// A belt dragged round a corner turns the tile before it, which may still be waiting for its craft.
export function turnPending(x, y, z, dir) { const p = actor.pending?.find(q => samePlace(q, { x, y, z })); if (p) { p.dir = dir; notify('pending'); } return !!p; }

// ---------------------------------------------------------------- the engineer
export const playerCell = () => ({ x: Math.floor(actor.x), z: Math.floor(actor.z) });
export const distTo = (x, z) => Math.hypot(x + .5 - actor.x, z + .5 - actor.z);
// What the engineer bumps into on the surface, as rectangles [x0, z0, x1, z1] and circles [x, z, r]. Machines are
// squares, trees and rocks circles, small things smaller shapes from data (hitOf): pipes their middle and the straight
// runs of their line. Buildings over several tiles are solid right across their inside. Belts and hollow frames are walkable.
function solidShapes(cx, cz, out) {
  if (cx < 0 || cz < 0 || cx >= GRID || cz >= GRID) { out.push([cx, cz, cx + 1, cz + 1]); return; }
  const e = world.ents.get(key(cx, 0, cz));
  if (e?.kind === 'dam') return;   // dams are ground to walk on
  if (isWater(cx, cz)) { out.push([cx, cz, cx + 1, cz + 1]); return; }   // no swimming
  const f = world.feats.get(key(cx, 0, cz));
  if (f) { out.push([cx + .5, cz + .5, FEATURE_HIT[FEATURES[f.type]?.look.shape === 'rock' ? 'rock' : 'tree']]); return; }
  if (!e || e.belt) return;
  if (e.kind === 'greenhouse') {   // thin walls along a room's walled edges: walk in through the doors
    const m = wallsAt(e, cx, cz), t = .06;
    for (let d = 0; d < 4; d++) if (m >> d & 1) out.push([d === 1 ? cx + 1 - t : cx, d === 2 ? cz + 1 - t : cz, d === 3 ? cx + t : cx + 1, d === 0 ? cz + t : cz + 1]);
    return;
  }
  const h = hitOf(e.type);
  if (!h) return;
  const mx = cx + .5, mz = cz + .5;
  if (e.foot && e.foot.length > 1) {   // solid across its own tiles, the usual margin at its outside edges
    const sq = h.sq ?? .46, m = .5 - sq, inn = (dx, dz) => covers(e, cx + dx, cz + dz);
    out.push([cx + (inn(-1, 0) ? 0 : m), cz + (inn(0, -1) ? 0 : m), cx + 1 - (inn(1, 0) ? 0 : m), cz + 1 - (inn(0, 1) ? 0 : m)]);
    return;
  }
  if (h === 'pipe') {
    // Touching parallel lines join each other at every tile. A link blocks only where it is part of a plain straight run
    // (one of its two pipes joins exactly the two opposite ways), so a line can't be walked through, while lines that
    // touch (every pipe also joined sideways) never wall off the gaps between them: those are only their middles.
    const w = PIPE_HIT, c = e.conn || 0;
    const straight = (q, ns) => q === (ns ? 5 : 10);
    let conn = 0;
    for (let d = 0; d < 4; d++) if (c >> d & 1) { const n = world.ents.get(key(cx + DIRS[d][0], 0, cz + DIRS[d][1])), ns = d % 2 === 0; if (straight(c, ns) || straight(n?.conn || 0, ns)) conn |= 1 << d; }
    out.push([mx - w, mz - w, mx + w, mz + w]);
    for (let d = 0; d < 4; d++) if (conn >> d & 1) {
      const [dx, dz] = DIRS[d];
      out.push([dx < 0 ? cx : dx > 0 ? mx : mx - w, dz < 0 ? cz : dz > 0 ? mz : mz - w, dx > 0 ? cx + 1 : dx < 0 ? mx : mx + w, dz > 0 ? cz + 1 : dz < 0 ? mz : mz + w]);
    }
    return;
  }
  if (h.r) out.push([mx, mz, h.r]);
  else out.push([mx - h.sq, mz - h.sq, mx + h.sq, mz + h.sq]);
}
const _shapes = [];
function collides(px, pz) {
  const r = PLAYER.radius;
  for (let cx = Math.floor(px - r - .5); cx <= Math.floor(px + r + .5); cx++) for (let cz = Math.floor(pz - r - .5); cz <= Math.floor(pz + r + .5); cz++) {
    _shapes.length = 0; solidShapes(cx, cz, _shapes);
    for (const s of _shapes) {
      if (s.length === 3) { if (Math.hypot(px - s[0], pz - s[1]) < r + s[2]) return true; continue; }
      if (Math.hypot(px - Math.max(s[0], Math.min(px, s[2])), pz - Math.max(s[1], Math.min(pz, s[3]))) < r) return true;
    }
  }
  return false;
}
export const playerCollides = collides;
// Moving straight into something you only brush (a corner, a pole, the end of a pipe), step sideways round it: the
// nearest offset up to PLAYER.slide where the way ahead is clear, at walking pace, so you slide past instead of sticking.
function slideAround(p, mx, mz) {
  const step = Math.hypot(mx, mz), ax = mx ? 0 : 1, az = mx ? 1 : 0;   // sideways axis
  const pref = (((ax ? p.x : p.z) % 1) + 1) % 1 >= .5 ? 1 : -1;   // the side of its tile you are already on, when both would do
  for (let o = .04; o <= PLAYER.slide + 1e-6; o += .04) {
    for (const s of [pref, -pref]) {
      const ox = ax * o * s, oz = az * o * s;
      if (collides(p.x + ox + mx, p.z + oz + mz) || collides(p.x + ox, p.z + oz)) continue;
      const k = Math.min(o, step) / o;   // no faster than walking
      p.x += ox * k; p.z += oz * k;
      return;
    }
  }
}
export const playerBlocks = (x, z) => { const r = PLAYER.radius; for (const p of S.players.values()) if (p.x + r > x + .04 && p.x - r < x + .96 && p.z + r > z + .04 && p.z - r < z + .96) return true; return false; };

// input: { mx, mz } desired direction in world space (unit or zero)
export function playerTick(dt, input) {
  const p = actor;
  if (p.veh) {   // driving: the vehicle carries you, and your keys drive it
    const v = vehicleById(p.veh);
    if (!v) p.veh = null;
    else { staminaTick(p, dt, false); p.drive = { t: input.fz || 0, s: input.fx || 0 }; p.x = v.x; p.z = v.z; p.vx = p.vz = 0; p.moving = false; p.face = v.ang; if (!isClient()) { mineTick(dt); pickupTick(dt); } return; }
  }
  // quick acceleration and braking: responsive, but not a teleporting box
  const a = 1 - Math.exp(-dt * (input.mx || input.mz ? 22 : 30));
  const sprint = staminaTick(p, dt, !!input.sprint && !!(input.mx || input.mz));
  const mods = playerMods(p), spd = PLAYER.speed * (isWalkway(Math.floor(p.x), Math.floor(p.z)) ? SIDEWALK_SPEED : 1) * (p.fed > S.T ? 1.25 : 1) * (sprint ? PLAYER.sprint + mods.sprint : 1) * Math.max(.3, 1 + mods.walk);
  p.vx = (p.vx || 0) + (input.mx * spd - (p.vx || 0)) * a;
  p.vz = (p.vz || 0) + (input.mz * spd - (p.vz || 0)) * a;
  let vx = p.vx, vz = p.vz;
  const under = world.ents.get(key(Math.floor(p.x), 0, Math.floor(p.z)));
  if (under?.belt && !under.dy) { const [dx, dz] = DIRS[under.dir], sp = under.line?.speed ?? under.speed; vx += dx * sp; vz += dz * sp; }
  const stuck = collides(p.x, p.z);
  const nx = p.x + vx * dt; if (stuck || !collides(nx, p.z)) p.x = nx; else if (Math.abs(vx) > Math.abs(vz) * 2) slideAround(p, vx * dt, 0);
  const nz = p.z + vz * dt; if (stuck || !collides(p.x, nz)) p.z = nz; else if (Math.abs(vz) > Math.abs(vx) * 2) slideAround(p, 0, vz * dt);
  p.x = Math.min(GRID - .3, Math.max(.3, p.x)); p.z = Math.min(GRID - .3, Math.max(.3, p.z));
  const sp = Math.hypot(p.vx, p.vz);
  if (input.mx || input.mz) p.face = Math.atan2(input.mx, input.mz);
  else if (p.mining && p.mineCell) p.face = Math.atan2(p.mineCell.x + .5 - p.x, p.mineCell.z + .5 - p.z);
  p.walk += dt * 10 * Math.min(1, sp / PLAYER.speed);
  if (p.veh) return;
  p.moving = sp > .4;
  if (!isClient()) { mineTick(dt); pickupTick(dt); }
}

// ---------------------------------------------------------------- health and stamina
// Sprinting burns stamina; it comes back after a short rest. Run it dry and you can't sprint until it refills a bit.
// Whoever moves the engineer runs this: each player for themselves, so a guest's sprint feels instant.
function staminaTick(p, dt, want) {
  if (p.tired && p.sta >= PLAYER.rested) p.tired = false;
  const go = want && !p.tired && p.sta > 0;
  const m = playerMods(p);
  if (go) { p.sta = Math.max(0, p.sta - PLAYER.sprintCost * (1 + m.sprintCost) * dt); p.staT = S.T; if (!p.sta) p.tired = true; }
  else if (S.T - p.staT > PLAYER.staminaDelay) p.sta = Math.min(maxStamina(p), p.sta + PLAYER.staminaRegen * Math.max(.1, 1 + m.staminaRegen) * dt);
  p.sprinting = go;
  return go;
}
// Health is the host's to decide. Moving vehicles hurt anyone they run into (not their own crew); health comes back
// slowly after a while, faster while well fed. At zero you wake up at the landing site, with everything you carried.
function healthTick(dt) {
  const p = actor;
  if (!p.veh) for (const v of world.vehicles) {
    const sp = Math.abs(v.v || 0);
    if (sp < PLAYER.hitSpeed || S.T - (p.hitT ?? -99) < 1) continue;
    const st = vstats(v.type), u = v.unit && world.units.find(q => q.id === v.unit);
    if (!st || st.way === 'sea' || p.veh === v.id || u?.cars.includes(p.veh)) continue;
    if (Math.hypot(v.x - p.x, v.z - p.z) > FRAMES[st.frame].len / 2 + PLAYER.radius + .1) continue;
    p.hitT = S.T;
    hurt(p, Math.round(sp * PLAYER.hitDamage), ITEMS[v.type]?.name.toLowerCase() || 'vehicle');
    if (p.hp <= 0) return;
  }
  const max = maxHealth(p), k = Math.max(0, 1 + playerMods(p).regen);   // radiation stops it
  if (S.T - p.hurtT > PLAYER.regenDelay && p.hp < max && k > 0) p.hp = Math.min(max, p.hp + (p.fed > S.T ? PLAYER.fedRegen : PLAYER.regen) * k * dt);
}
export function hurt(p, n, by) {
  p.hp -= n; p.hurtT = S.T;
  notify('hurt', n);
  if (p.hp > 0) return;
  p.hp = maxHealth(p); p.veh = null; p.vx = p.vz = 0; p.mining = null;
  p.x = SPAWN.x; p.z = SPAWN.z;
  notify('respawn', p.x, p.z);
  notify('toast', `You were run over by a ${by}. You woke up at the landing site.`);
}
export function heal(p, n) { p.hp = Math.min(maxHealth(p), p.hp + n); }

// What right-click would mine at a cell, in Factorio's priority: buildings, then trees/rocks, then ore.
export function mineTargetAt(c) {
  if (!c) return null;
  if (c.veh) { const v = vehicleById(c.veh); return v ? vehicleTarget(v, c) : null; }
  if (c.y < 0) underOf(c.x, c.z);
  const k = key(c.x, c.y, c.z), e = world.ents.get(k);
  if (e?.kind === 'rail' && e.sig !== null && e.sig !== undefined) return { kind: 'sig', k, c, time: .2, reach: reachOf(actor), name: 'Rail signal' };
  if (e && isMulti(e) && c.ctrl && ENTITIES[e.type].tileMine) return { kind: 'tile', k: 'tile' + k, c, time: .3, reach: reachOf(actor), name: ENTITIES[e.type].name + ' tile' };
  if (e) return { kind: 'ent', k, c, time: e.belt ? .15 : e.kind === 'inserter' || e.kind === 'pole' ? .2 : isMulti(e) ? Math.min(2, .4 + e.foot.length * .015) : .4, reach: reachOf(actor), name: ENTITIES[e.type].name };
  const bp = bpAt(c.x, c.y, c.z);
  if (bp) return { kind: 'bp', k: 'bp' + bp.id, c, time: .1, reach: reachOf(actor) + 30, name: ENTITIES[bp.type].name + ' blueprint' };
  if (world.frames.has(k)) return { kind: 'frame', k, c, time: .3, reach: reachOf(actor), name: 'Hollow frame' };
  if (c.y === 0) { const f = world.feats.get(k); if (f) return { kind: 'feat', k, c, time: FEATURES[f.type].time, reach: reachOf(actor), name: FEATURES[f.type].name, tool: FEATURES[f.type].tool }; }
  if (c.y === 0 && isWater(c.x, c.z)) { const f = fishTarget(c); return f ? { kind: 'fish', k: 'fish' + f.id, c, fish: f.id, time: .35, reach: reachOf(actor), name: 'Fish' } : null; }
  if (c.y === 0) {
    const r = roadAt(c.x, c.z);
    if (r) { const one = !!c.ctrl && !!ROADS[r.s]?.tileMine, n = one || !r.o ? 1 : roadTiles(r.o).length; return { kind: 'road', k: 'road' + k + (one ? 'one' : ''), one, c, time: Math.min(2, .25 + n * .02), reach: reachOf(actor), name: (ITEMS[r.s]?.name ?? 'Road') + (one ? ' tile' : n > 1 ? ` (${n} tiles)` : '') }; }
  }
  const o = world.ores.get(k);
  if (o) return { kind: 'ore', k, c, time: (c.y < 0 ? 1.4 : 1) / depositLayer(o).speed * (ITEMS[o.type].handSlow || 1), reach: PLAYER.mineReach + (c.y < 0 ? 1 : 0), name: ITEMS[o.type].name, ore: o.type, tool: 'pickaxe' };
  if (c.y === 0 && patchAt(c.x, c.z) && hasTool('shovel')) return { kind: 'patch', k: 'patch' + k, c, time: .8, reach: PLAYER.mineReach + 1, name: patchName(c.x, c.z), tool: 'shovel' };
  return null;
}
function mineTick(dt) {
  const p = actor, t = mineTargetAt(p.mineCell);
  if (!t) { p.mining = null; return; }
  // the sound and the swing: chopping trees, breaking ore and rock, digging, or taking buildings down
  if (!p.mining || p.mining.k !== t.k) p.mining = { k: t.k, prog: 0, name: t.name, tool: t.tool || null,
    kind: t.kind === 'feat' ? (t.tool === 'axe' ? 'tree' : 'rock') : t.kind === 'ore' || t.kind === 'fish' || t.kind === 'patch' ? 'ore' : 'ent' };
  const m = p.mining;
  if (distTo(t.c.x, t.c.z) > t.reach) { m.blocked = 'out of reach'; return; }
  if (t.kind === 'ore' && invRoom(t.ore) < 1) { m.blocked = 'inventory full'; return; }
  m.blocked = null;
  m.prog += dt / t.time * (p.fed > S.T ? 1.5 : 1) * toolStat(t.tool, 'speed') * Math.max(.2, 1 + playerMods(p).mine);
  if (m.prog < 1) return;
  m.prog = 0;
  const { x, y, z } = t.c;
  // a popup per thing you dig, which counts up while you keep at it and shows how many you now have
  const gain = (list, fy) => notify('gain', list.map(([it, n]) => [it, n, invGet(it)]), x + .5, fy, z + .5);
  if (t.kind === 'fish') { if (catchFish(t.fish)) { invGive('raw_fish'); bump('mined', 'raw_fish'); notify('mined', 'ore'); gain([['raw_fish', 1]], .4); } }
  else if (t.kind === 'road') removeRoad(x, z, t.one);
  else if (t.kind === 'sig') { const e = world.ents.get(t.k); if (e) { e.sig = null; invGive('rail_signal'); world.railDirty = true; bus.emit('remesh', e); } }
  else if (t.kind === 'veh') { const r = removeVehicle(t.veh); if (r) notify('toast', r); }
  else if (t.kind === 'bp') removeBlueprint(x, y, z);
  else if (t.kind === 'tile') { const e = world.ents.get(key(x, y, z)); if (e) { const r = removeTile(e, x, z); if (r && r !== 'removed') notify('toast', r); } }
  else if (t.kind === 'ore' || t.kind === 'feat' || t.kind === 'patch') {
    // the tool's sweep: everything of the same sort this close to the target goes too
    const got = {}, add = (it, n) => { got[it] = (got[it] || 0) + n; };
    for (const c of sweep(t)) {
      if (t.kind === 'ore') { const it = depleteOre(c.x, y, c.z); if (!it || invRoom(it) < 1) continue; invGive(it); bump('mined', it); add(it, 1); if (ITEMS[it].mineFluid) p.rad = (p.rad || 0) + .04; }
      else if (t.kind === 'feat') {
        const k2 = key(c.x, 0, c.z), f = world.feats.get(k2); if (!f) continue;
        removeFeat(k2);
        for (const [it, n] of Object.entries(FEATURES[f.type].gives)) { invGive(it, n); bump('mined', it, n); add(it, n); }
        bus.emit('feat', c.x, c.z);
      } else for (const [it, n] of digPatch(c.x, c.z)) add(it, n);
    }
    notify('mined', t.kind === 'feat' ? (t.tool === 'axe' ? 'tree' : 'rock') : 'ore');
    if (Object.keys(got).length) gain(Object.entries(got), t.kind === 'feat' ? .9 : y + .6);
  } else {
    const r = removeAt(x, y, z);
    if (r && r !== 'removed') notify('toast', r);
  }
}
// ---------------------------------------------------------------- tools
// The engineer's axe, pickaxe and shovel: speed and sweep go up with research (TOOLS in data.js).
export const hasTool = tool => !TOOLS[tool]?.tech || isResearched(TOOLS[tool].tech) || S.sandbox;
export function toolLevel(tool, kind) { let n = 0; while (n < TOOLS[tool][kind].length && isResearched(`${tool}_${kind}_${n + 1}`)) n++; return n; }
export function toolStat(tool, kind) {
  if (!TOOLS[tool]) return kind === 'speed' ? 1 : 0;
  const n = toolLevel(tool, kind);
  return n ? TOOLS[tool][kind][n - 1] : kind === 'speed' ? 1 : 0;
}
export const sweepTiles = t => sweep(t);
// The tiles a mining stroke hits: the target, and with a sweep, every tile of the same sort within its radius.
function sweep(t) {
  const r = toolStat(t.tool, 'radius'), { x, y, z } = t.c, out = [{ x, z }];
  if (r < 1) return out;
  const same = (tx, tz) => {
    if (t.kind === 'ore') return !!world.ores.get(key(tx, y, tz));
    if (t.kind === 'feat') { const f = world.feats.get(key(tx, 0, tz)); return !!f && FEATURES[f.type].tool === t.tool; }
    return patchAt(tx, tz);
  };
  for (let dx = -Math.floor(r); dx <= r; dx++) for (let dz = -Math.floor(r); dz <= r; dz++) if ((dx || dz) && Math.hypot(dx, dz) <= r && same(x + dx, z + dz)) out.push({ x: x + dx, z: z + dz });
  return out;
}
function pickupTick(dt) {
  const p = actor;
  if (!p.pickup || (p.pickT = (p.pickT || 0) + dt) < .06) return;
  p.pickT = 0;
  let best = -1, bd = 1.6;
  world.ground.forEach((g, i) => { const d = Math.hypot(g.x - p.x, g.z - p.z); if (d < bd && invRoom(g.type) > 0) { bd = d; best = i; } });
  if (best >= 0) { const g = world.ground.splice(best, 1)[0]; invAdd(g.type); notify('pickup'); return; }
  const pc = playerCell();
  for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
    const b = world.ents.get(key(pc.x + dx, 0, pc.z + dz));
    if (!isBeltLike(b) || distTo(b.x, b.z) > 1.6) continue;
    const it = take(b, t => invRoom(t) > 0);
    if (it) { invAdd(it); notify('pickup'); return; }
  }
}
export { segItems };
// Z: drop one of the held item at the cursor, onto a belt if there is one.
export function dropAt(c, it) {
  if (!it || !invGet(it) || !c) return false;
  if (distTo(c.x, c.z) > reachOf(actor)) { notify('toast', 'out of reach'); return false; }
  const b = world.ents.get(key(c.x, c.y, c.z));
  if (isBeltLike(b)) { if (!dropOnBelt(b, it)) { if (lanesOf(b) === 3) notify('toast', 'bus belts only take items from the belt behind them'); return false; } }
  else if (c.y === 0 && isWater(c.x, c.z)) { notify('toast', 'it would sink'); return false; }
  else if (c.y === 0) world.ground.push({ type: it, x: c.x + .3 + Math.random() * .4, z: c.z + .3 + Math.random() * .4 });
  else return false;
  invAdd(it, -1); return true;
}
// Ctrl+click: put the held stack into a machine, or empty its outputs into the inventory. Where a held item goes is
// decided the same way for every building, from its slots (entSlots): an ingredient goes only into an input slot that
// takes it, fuel only into a fuel slot (and only if it is fuel), augments into augment slots, anything else into
// storage. `mode` (Shift-click selection, see TRANSFER_MODES) narrows it to one kind of slot; 'store' spreads the
// stack evenly over every storage slot that takes it.
export const TRANSFER_MODES = {
  fuel: { name: 'Fuel', desc: 'Ctrl + click with fuel in hand: fill only its fuel slot.' },
  input: { name: 'Input', desc: 'Ctrl + click with an ingredient in hand: fill only its input slots.' },
  store: { name: 'Store', desc: 'Ctrl + click with anything in hand: spread the stack evenly over its storage slots.' },
  aug: { name: 'Augment', desc: 'Ctrl + click with an augment in hand: put it in a free augment slot.' },
};
const slotKind = id => id === 'fuel' ? 'fuel' : id === 'src' || id === 'seeds' || id.startsWith('in:') ? 'input' : id.startsWith('aug:') ? 'aug' : id.startsWith('c:') ? 'store' : 'out';   // c: chests, depots and vehicle cargo
// Which transfer modes make sense for a target: the kinds of slot it has that items can go into.
export function modesFor(t) {
  const kinds = new Set(slotsOf(t).map(sl => slotKind(sl.id)));
  return Object.keys(TRANSFER_MODES).filter(m => kinds.has(m));
}
function transferInto(t, it, mode, limit = Infinity) {
  const list = slotsOf(t).filter(sl => slotKind(sl.id) !== 'out');
  const accept = sl => slotAccept(t, sl.id, it);
  let want = list;
  if (mode) want = list.filter(sl => slotKind(sl.id) === mode);
  else {   // an ingredient first (if something here takes it as one), then fuel, augments, storage
    const pick = k => list.filter(sl => slotKind(sl.id) === k && accept(sl) > 0);
    want = pick('input');
    if (!want.length) want = pick('fuel');   // fuel slots only ever take what that building burns
    if (!want.length && ITEMS[it]?.aug) want = pick('aug');
    if (!want.length) want = pick('store');
  }
  if (mode === 'fuel' && !want.some(sl => accept(sl) > 0)) { if (limit === Infinity) notify('toast', `it doesn't burn ${ITEMS[it].name.toLowerCase()}`); return 0; }
  let n = 0, have = Math.min(invGet(it), limit);
  if (mode === 'store' && want.length > 1) {   // evenly: as many slots as will take it share the stack
    const open = want.filter(sl => accept(sl) > 0);
    for (let i = 0; i < open.length && have > 0; i++) {
      const share = Math.ceil(have / (open.length - i)), k = Math.min(share, accept(open[i]));
      if (k > 0) { slotPut(t, open[i].id, it, k); invAdd(it, -k); have -= k; n += k; }
    }
    return n;
  }
  if (t.store && !mode && want.length && want.every(sl => slotKind(sl.id) === 'store')) { const left = t.store.add(it, have); invAdd(it, -(have - left)); return have - left; }
  for (const sl of want) {
    if (have <= 0) break;
    const k = Math.min(have, accept(sl));
    if (k > 0) { slotPut(t, sl.id, it, k); invAdd(it, -k); have -= k; n += k; }
  }
  return n;
}
// Ctrl+click on a selection of many: the held stack is shared out, each target that takes it (in that mode) getting an
// even share of what is left, as much as it takes; with an empty hand, every one of them is emptied. Out of reach ones
// are left alone.
export function fastTransferMany(list, sel, mode = null) {
  list = list.filter(t => t && t.kind !== 'frame' && distTo(Math.floor(t.x), Math.floor(t.z)) <= reachOf(actor) + 2);
  if (!sel || !invGet(sel)) return list.reduce((n, t) => n + fastTransfer(t, null), 0);
  const m = TRANSFER_MODES[mode] ? mode : null;
  const takes = t => slotsOf(t).some(sl => slotKind(sl.id) !== 'out' && (!m || slotKind(sl.id) === m) && slotAccept(t, sl.id, sel) > 0);
  const open = list.filter(takes);
  let n = 0;
  for (let i = 0; i < open.length; i++) {
    const have = invGet(sel); if (have <= 0) break;
    n += transferInto(open[i], sel, m, Math.ceil(have / (open.length - i)));
  }
  return n;
}
export function fastTransfer(e, sel, mode = null) {
  if (!e || e.kind === 'frame') return 0;
  if (sel && invGet(sel)) return transferInto(e, sel, TRANSFER_MODES[mode] ? mode : null);
  let n = 0;
  const grab = (obj, it) => { const k = Math.min(obj[it], invRoom(it)); if (k > 0) { invAdd(it, k); obj[it] -= k; n += k; if (!obj[it]) delete obj[it]; } };
  if (e.store) for (const [it, have] of e.store.counts()) { const k = Math.min(have, invRoom(it)); if (k > 0) { e.store.remove(it, k); invAdd(it, k); n += k; } }
  if (e.out) for (const it of Object.keys(e.out)) grab(e.out, it);
  if (e.buffer) { const it = e.buffer, k = takeBuf(e, invRoom(it)); if (k) { invAdd(it, k); n += k; } }
  return n;
}

// ---------------------------------------------------------------- main tick
let volTimer = 0, touchTimer = 0;
export function simulate(dt, input = { mx: 0, mz: 0 }) {
  S.T += dt;
  if (world.powerDirty !== false) rebuildPower();
  if (world.fluidDirty !== false) rebuildFluids();
  for (const n of nets) { n.engines = []; n.solar = 0; n.hydro = 0; }
  fluidPre(dt);
  producerCaps(dt);
  for (const e of world.ents.values()) {
    if (!e.net) continue;
    if (e.kind === 'solar') e.net.solar++;
    else if (e.kind === 'engine' || e.kind === 'fgen') e.net.engines.push(e);
    else if (e.kind === 'dam') e.net.hydro += e.output || 0;
  }
  for (const n of nets) {
    n.capacity = n.solar * ENTITIES.solar.out * daylight() + n.hydro + n.engines.reduce((s, e) => s + e.cap, 0);   // solar follows the sun
    n.sat = n.demand > 0 ? Math.min(1, n.capacity / n.demand) : (n.capacity > 0 ? 1 : 0);
  }
  // a road grid carries only so much: what its own machines want past that slows them down
  for (const g of world.roadGrids) { g.demand = g.nextDemand; g.nextDemand = 0; g.sat = g.demand > ROAD_POWER.capacity ? ROAD_POWER.capacity / g.demand : 1; }
  if (world.railDirty !== false) rebuildRails();
  beltsTick(dt);
  if ((touchTimer += dt) > .25) { touchTimer = 0; touchBelts(); }
  for (const e of world.ents.values()) if (!e.belt) tickEntity(e, dt);
  farmTick(dt);
  powerTick(dt);
  transportTick(dt);
  fishTick(dt);
  // If this throws, the actor must not stay a friend, or the host's own clicks would use their inventory.
  try {
    for (const p of S.players.values()) {
      setActor(p);
      if (p.local) playerTick(dt, input);
      else if (!isClient()) { mineTick(dt); pickupTick(dt); }
      if (!isClient()) { craftQueueTick(dt); healthTick(dt); bodyTick(p, dt); }
    }
  } finally { setActor(S.player); }
  if ((volTimer += dt) > .5) { volTimer = 0; computeVolume(); }
  exploreTick(dt);
  tradeTick();
}
export function powerSummary() {
  let produced = 0, capacity = 0, demand = 0;
  for (const n of nets) { produced += n.produced; capacity += n.capacity; demand += n.demand; }
  return { produced, capacity, demand, sat: demand > 0 ? Math.min(1, capacity / demand) : 1, count: nets.length };
}

// ---------------------------------------------------------------- building
const FAST_REPLACE = new Set(['belt', 'inserter']);   // belts only for belts with the same number of lanes
export function canPlace(type, x, y, z, dir = S.dir, dy = S.dy, opts = {}) {
  if (ENTITIES[type]?.multi) return canPlaceMulti(type, opts.tiles || footprint(type, x, z, dir), y, { ...opts, dir });
  if (x < 0 || z < 0 || x >= GRID || z >= GRID) return 'out of bounds';
  if (y < 0) underOf(x, z);
  if (!opts.noInv && invGet(type) < 1) return `no ${ENTITIES[type].name} in inventory`;
  if (opts.reach && distTo(x, z) > reachOf(actor)) return 'out of reach';
  const [lo, hi] = layerRange();
  if (y < lo || y > hi) return layerLockReason(y);
  if (y > 0 && !world.frames.has(key(x, y - 1, z))) return 'nothing to stand on: put a hollow frame below';
  const k = key(x, y, z), def = ENTITIES[type];
  if (y === 0 && world.feats.has(k)) return `a ${FEATURES[world.feats.get(k).type].name.toLowerCase()} is in the way: hold right-click to mine it`;
  const wet = y === 0 && isWater(x, z);
  if (def.onWater ? !wet : wet) return def.onWater ? `the ${def.name.toLowerCase()} goes on water` : 'you can\'t build on water';
  if (type === 'frame') return world.frames.has(k) ? 'occupied' : y >= LAYER_MAX ? 'too high' : null;
  const ex = world.ents.get(k);
  if (ex) {
    if (FAST_REPLACE.has(def.kind) && ex.kind === def.kind && (def.kind !== 'belt' || lanesOf(ex) === (def.lanes ?? 2))
      && (ex.type !== type || ex.dir !== dir || ((def.kind === 'inserter' || canSlope(type)) && (ex.dy || 0) !== (dy || 0)))) return null;
    return 'occupied';
  }
  if (def.kind === 'drill' && !world.ores.has(k)) return world.oil.has(x + ',' + z) && y === 0 ? 'that is crude oil: it needs a pumpjack' : 'drills need a deposit underneath';
  if (def.kind === 'oilpump' && (y !== 0 || !world.oil.has(x + ',' + z))) return 'pumpjacks go on crude oil (dark patches)';
  if (def.kind === 'rail' && y !== 0) return 'rails only go on the ground';
  if (y === 0 && roadBlocks(x, z) && !def.onRoad) return 'keep roads clear: build beside them, or pass under with an underground belt or pipe';
  if (def.kind === 'depot' && !wayNear(def.way, x, y, z)) return def.way === 'sea' ? 'ports go on the shore, next to water' : def.way === 'rail' ? 'train stations go right beside a rail' : 'truck depots go right beside a road';
  if (def.cap || def.fluids || def.ports) { const f = fluidConflict(type, x, y, z, dir, opts.fac ?? actorFac(), ex?.recipe); if (f) return f; }
  // slopes stand on the lower of the two layers they join (belts.js): the one above must be open too
  if (canSlope(type) && dy && y + 1 > hi) return 'the slope would lead to a locked layer';
  if (y === 0 && opts.reach && !BELTISH.has(def.kind) && def.kind !== 'pole' && playerBlocks(x, z)) return 'you are standing there';
  return null;
}
const BELTISH = new Set(['belt', 'underground', 'splitter']);
// Buildings that cover several tiles: every tile must be free. Per-tile ones (dams, greenhouses) take an item for every
// `perItem` tiles; the rest are one object built from one item.
const itemsFor = (type, tiles) => { const d = ENTITIES[type]; return d.perTile ? Math.max(1, Math.ceil(tiles.length / (d.perItem || 1))) : 1; };
function canPlaceMulti(type, tiles, y, opts) {
  const def = ENTITIES[type];
  if (!tiles.length) return 'nothing to build on';
  if (!opts.noInv && invGet(type) < itemsFor(type, tiles)) return `that needs ${itemsFor(type, tiles)} ${def.name.toLowerCase()}`;
  if (def.big) {   // boilers and steam engines: any open layer, standing on frames above the ground
    const [lo, hi] = layerRange();
    if (y < lo || y > hi) return layerLockReason(y);
    for (const [x, z] of tiles) { if (y < 0) underOf(x, z); if (y > 0 && !world.frames.has(key(x, y - 1, z))) return 'nothing to stand on: put hollow frames under every tile'; }
  } else if (y !== 0) return `the ${def.name.toLowerCase()} goes on the ground layer`;
  if (def.drag && tiles.length < 2 * (def.width || 1)) return 'drag it across at least two tiles of water';
  if (opts.reach && !tiles.some(([x, z]) => distTo(x, z) <= reachOf(actor) + 1)) return 'out of reach';
  for (const [x, z] of tiles) {
    if (x < 0 || z < 0 || x >= GRID || z >= GRID) return 'out of bounds';
    const k = key(x, y, z);
    if (y === 0 && world.feats.has(k)) return `a ${FEATURES[world.feats.get(k).type].name.toLowerCase()} is in the way: hold right-click to mine it`;
    const wet = y === 0 && isWater(x, z);
    if (def.onWater ? !wet : wet) return def.onWater ? `a ${def.name.toLowerCase()} goes across water` : 'you can\'t build on water';
    if (world.ents.get(k)) return 'occupied';
    if (y === 0 && roadAt(x, z)) return 'keep roads clear';
    if (y === 0 && world.oil.has(x + ',' + z)) return 'there is crude oil under it';
    if (def.big && y === 0 && opts.reach && playerBlocks(x, z)) return 'you are standing there';
  }
  if (def.kind === 'drill' && !tiles.some(([x, z]) => world.ores.has(key(x, y, z)))) return 'drills need a deposit underneath';
  if (groups(tiles).length > 1) return `a ${def.name.toLowerCase()} has to be one piece`;
  if (def.big && (def.fluids || def.ports)) { const f = fluidConflict(type, tiles[0][0], y, tiles[0][1], opts.dir ?? 0, opts.fac ?? actorFac(), null, tiles); if (f) return f; }
  return null;
}
// Place a building that covers several tiles. Touching ones of its kind join it into one (see multi.js).
export function placeMulti(type, tiles, y, dir = 0, free = false, fac = null) {
  const def = ENTITIES[type];
  if (!free) { const err = canPlaceMulti(type, tiles, y, { fac }); if (err) return err; invAdd(type, -itemsFor(type, tiles)); }
  const as = def.as || type, e = createEntity(as, tiles[0][0], y, tiles[0][1], dir);
  if (!ENTITIES[as].shared) e.fac = factoryOf(fac ?? actorFac())?.id ?? 1;
  e.foot = tiles.map(([x, z]) => [x, z]);
  const near = neighboursToMerge(as, y, e.foot, e.fac).sort((a, b) => b.foot.length - a.foot.length);
  world.powerDirty = true; world.fluidDirty = true;
  if (near.length) {   // grow the biggest touching one, and fold the rest into it
    const base = near[0];
    removeBlueprintsUnder(e.foot, y);
    base.foot.push(...e.foot);
    joinAll(base, near.slice(1));
    bus.emit('remesh', base);
    return base;
  }
  setFoot(e);
  world.ents.set(key(e.x, e.y, e.z), e);
  removeBlueprintsUnder(e.foot, y);
  bus.emit('placed', e);
  return e;
}
// A dam (or anything else laid by dragging) from the tiles of one drag.
export function placeDrag(op, fac) {
  if (!ENTITIES[op.type]?.drag || !Array.isArray(op.tiles) || op.tiles.length > 65 * (ENTITIES[op.type].width || 1)) return 'that is not laid by dragging';
  const tiles = op.tiles.map(t => [Math.floor(+t[0]), Math.floor(+t[1])]);
  const err = canPlace(op.type, 0, 0, 0, 0, 0, { tiles, reach: true, fac });
  if (err) return err;
  const r = placeMulti(op.type, tiles, 0, 0, false, fac);
  return typeof r === 'string' ? r : null;
}
// Ctrl + mine: one tile off a building that allows it. What is left regroups: a room cut in two becomes two rooms,
// each with its share of what the room held.
export function removeTile(e, x, z) {
  const def = ENTITIES[e.type];
  if (!def.tileMine) return `a ${def.name.toLowerCase()} comes down in one piece`;
  if (e.foot.length === 1) return removeAt(x, e.y, z);
  if (!covers(e, x, z)) return null;
  invGive(def.tileItem || e.type);
  const parts = groups(e.foot.filter(([a, b]) => a !== x || b !== z)).sort((a, b) => b.length - a.length);
  let left = parts.reduce((t, p) => t + p.length, 0);
  for (const p of parts.slice(1)) {
    const n = createEntity(e.type, p[0][0], e.y, p[0][1], e.dir);
    n.fac = e.fac; n.foot = p;
    KINDS[e.kind]?.split(e, n, p.length / left); left -= p.length;
    setFoot(n); world.ents.set(key(n.x, n.y, n.z), n); bus.emit('placed', n);
  }
  rekey(e, () => { e.foot = parts[0]; setFoot(e); });
  world.powerDirty = true; world.fluidDirty = true;
  bus.emit('remesh', e);
  return 'removed';
}
// What a building covering several tiles gives back. One object gives back the one item it was built from. A per-tile
// one (perTile in data) gives back by the tile, as Ctrl + mining a single tile does: big items for whole sets of tiles,
// single tiles for the rest.
function refundMulti(e) {
  const def = ENTITIES[e.type], per = def.perItem || 1, n = e.foot.length;
  if (!def.perTile) { invGive(e.type); return; }
  if (per > 1) { invGive(e.type, Math.floor(n / per)); invGive(def.tileItem, n % per); }
  else invGive(def.tileItem || e.type, n);
}
// Which factory the acting engineer is building for (see Factories in state.js).
export const actorFac = () => factoryOf(actor.fac)?.id ?? 1;
export function place(type, x, y, z, dir = S.dir, dy = S.dy, free = false, fac = null) {
  if (ENTITIES[type]?.multi) return placeMulti(type, footprint(type, x, z, dir), y, dir, free, fac);
  return placeOne(type, x, y, z, dir, dy, free, fac);
}
// A big building from an old save that is still one tile: it stays one tile, with its old connections (see sizeOf).
export function placeCompact(type, x, y, z, dir, fac) {
  const e = placeOne(type, x, y, z, dir, 0, true, fac);
  if (typeof e === 'object' && e) e.compact = true;
  return e;
}
function placeOne(type, x, y, z, dir, dy, free, fac) {
  if (!free) { const err = canPlace(type, x, y, z, dir, dy, { fac }); if (err) return err; invAdd(type, -1); }
  const k = key(x, y, z);
  if (type === 'frame') {
    const f = { id: nextId++, type: 'frame', kind: 'frame', x, y, z, dir: 0 };
    world.frames.set(k, f); bus.emit('placed', f); return f;
  }
  const ent = ENTITIES[type];
  const old = world.ents.get(k);
  const e = createEntity(type, x, y, z, dir, ent.kind === 'inserter' || canSlope(type) ? dy : 0);
  if (!ent.shared) e.fac = factoryOf(fac ?? actorFac())?.id ?? 1;
  if (old) {   // fast replace keeps what was on it
    if (old.belt && e.belt) { e.buf = segItems(old).map(it => [...it]); e.lcfg = old.lcfg; e.aug = old.aug; }
    else if (old.aug && e.aug) e.aug = [...old.aug, ...e.aug].slice(0, e.aug.length);   // same kind, so the same slot count
    else for (const a of old.aug || []) if (a) invGive(a);
    if (old.held) e.held = old.held;
    if (old.type !== type) invGive(old.type);
    if (old.fuel && e.fuel !== undefined) { e.fuel = old.fuel; e.fuelType = old.fuelType; e.burn = old.burn; }
    else if (old.fuel) invGive(old.fuelType, old.fuel);
    world.ents.delete(k); bus.emit('removed', old);
  }
  if (e.kind === 'underground' || e.kind === 'upipe') {   // pair with the nearest open entrance of the same type behind it
    const [dx, dz] = DIRS[dir];
    for (let i = 1; i < ent.range; i++) {
      const u = world.ents.get(key(x - dx * i, y, z - dz * i));
      if (u && u.type === type && u.dir === dir && sameFac(u, e)) { if (u.role === 'in' && !u.pair) { e.role = 'out'; e.pair = u; u.pair = e; bus.emit('remesh', u); } break; }
    }
  }
  world.ents.set(k, e);
  removeBlueprintsUnder([[x, z]], y);
  if (e.belt) world.beltDirty = true;
  if (e.kind === 'rail') world.railDirty = true;
  world.powerDirty = true; world.fluidDirty = true;
  bus.emit('placed', e);
  return e;
}
export function refundContents(e) {
  const add = o => { for (const [k, v] of Object.entries(o || {})) if (v > 0) invGive(k, v); };
  if (e.belt) for (const it of clearSeg(e)) invGive(it);
  for (const a of e.aug || []) if (a) invGive(a);
  if (e.store) for (const [k, v] of e.store.counts()) invGive(k, v);
  add(e.inp); add(e.out);
  if (e.sig !== null && e.sig !== undefined) invGive('rail_signal');
  if (e.fuel) invGive(e.fuelType, e.fuel);
  if (e.held) invGive(e.held);
  if (e.buffer) invGive(e.buffer, bufCount(e));
  if (e.crafting && RECIPE[e.recipe]) add(RECIPE[e.recipe].in);
  if (e.charging) invGive('resonance_pack');
  if (e.seed && e.seeds) invGive(e.seed + '_seeds', e.seeds);
}
export function removeAt(x, y, z) {
  const k = key(x, y, z), e = world.ents.get(k);
  if (e?.kind === 'rail' && world.vehicles.some(v => v.tile === x + ',' + z)) return 'a train stands on it';
  if (e) {
    if (isMulti(e)) { clearFoot(e); world.ents.delete(key(e.x, e.y, e.z)); refundContents(e); refundMulti(e); }
    else { world.ents.delete(k); refundContents(e); if (e.broken && ENTITIES[e.type].scrap) for (const [it, n] of Object.entries(ENTITIES[e.type].scrap)) invGive(it, n); else invGive(e.type); }
    for (const [tx, tz] of tilesOf(e)) dropLinksAt(tx, e.y, tz, true);   // poles, and machines on a cable
    if (e.pair) { e.pair.pair = null; bus.emit('remesh', e.pair); }
    if (e.belt) world.beltDirty = true;
    if (e.kind === 'rail') world.railDirty = true;
    world.powerDirty = true; world.fluidDirty = true;
    bus.emit('removed', e); return 'removed';
  }
  const f = world.frames.get(k);
  if (f) {
    if (world.ents.has(key(x, y + 1, z)) || world.frames.has(key(x, y + 1, z))) return 'something rests on this frame';
    world.frames.delete(k); invGive('frame'); bus.emit('removed', f); return 'removed';
  }
  return null;
}
// ---------------------------------------------------------------- cables between poles
const samePos = (p, x, y, z) => p[0] === x && p[1] === y && p[2] === z;
export function dropLinksAt(x, y, z, refund) {
  const keep = world.links.filter(l => !samePos(l.a, x, y, z) && !samePos(l.b, x, y, z));
  if (keep.length === world.links.length) return;
  if (refund) for (const l of world.links) if (!keep.includes(l)) invGive(l.kind);
  world.links = keep; world.powerDirty = true; bus.emit('links');
}
// String a cable (an item with tool: 'link') from pole a to pole b, or take down the one already there.
// Power cables join poles of one voltage; transformer cables join a transformer station to its other voltage.
export function linkPoles(kind, a, b) {
  const tool = ITEMS[kind];
  if (tool?.tool !== 'link') return 'that is not a cable';
  const A = world.ents.get(key(...a)), B = world.ents.get(key(...b));
  if (!A || !B || A === B || (A.kind !== 'pole' && B.kind !== 'pole')) return 'cables go between two poles, or from a pole to a machine';
  if (A.kind !== 'pole' || B.kind !== 'pole') return linkBuilding(kind, A.kind === 'pole' ? A : B, A.kind === 'pole' ? B : A);
  const i = world.links.findIndex(l => (samePos(l.a, ...a) && samePos(l.b, ...b)) || (samePos(l.a, ...b) && samePos(l.b, ...a)));
  if (i >= 0) { const [l] = world.links.splice(i, 1); invGive(l.kind); world.powerDirty = true; bus.emit('links'); return 'cable taken down'; }
  if (distTo(B.x, B.z) > reachOf(actor) + 1) return 'out of reach';
  if (Math.hypot(A.x - B.x, A.z - B.z, A.y - B.y) > tool.reach) return `too far: a ${tool.name.toLowerCase()} reaches ${tool.reach} tiles`;
  const da = ENTITIES[A.type], db = ENTITIES[B.type];
  if (tool.transformer) {
    const st = tool.steps, isSt = d => d.volts?.length > 1 && d.volts[0] === st[0] && d.volts.includes(st[1]);
    const [t, o] = isSt(da) ? [da, db] : isSt(db) ? [db, da] : [];
    if (!t || !voltsOf(o).includes(st[1])) return st[0] === 2 ? 'step-up cables go from a step-up station to a low voltage pole' : 'transformer cables go from a transformer station to a high voltage line';
  } else if (autoVolt(da) !== autoVolt(db)) return 'different voltages: link them through a transformer station';
  if (!invGet(kind)) return `no ${tool.name.toLowerCase()} in inventory`;
  invAdd(kind, -1);
  world.links.push({ kind, a: [A.x, A.y, A.z], b: [B.x, B.y, B.z] });
  world.powerDirty = true; bus.emit('links');
  return null;
}
// Direct wiring: a power cable from an electric pole straight to a machine, which then draws from that pole wherever it
// stands. The cable is stored like any other (`world.links`), from the pole to the machine's anchor tile.
export const canWireBuilding = (p, m) => !!p && !!m && p.kind === 'pole' && m.kind !== 'pole' && m.kind !== 'frame' && wiresBuildings(ENTITIES[p.type]) && !!ENTITIES[m.type]?.power && poleServes(m, p);
function linkBuilding(kind, P, M) {
  const tool = ITEMS[kind], at = l => (samePos(l.a, P.x, P.y, P.z) && covers(M, l.b[0], l.b[2]) && l.b[1] === M.y) || (samePos(l.b, P.x, P.y, P.z) && covers(M, l.a[0], l.a[2]) && l.a[1] === M.y);
  const i = world.links.findIndex(at);
  if (i >= 0) { const [l] = world.links.splice(i, 1); invGive(l.kind); world.powerDirty = true; bus.emit('links'); return 'cable taken down'; }
  if (!tool.toBuilding) return 'that cable only goes between poles';
  if (!isResearched(WIRE_TECH)) return `research ${TECH[WIRE_TECH].name} to run cables from poles to machines`;
  if (!wiresBuildings(ENTITIES[P.type])) return 'only electric poles wire to machines: not generator poles or stations';
  if (!ENTITIES[M.type].power) return `the ${ENTITIES[M.type].name.toLowerCase()} doesn't use power`;
  if (!poleServes(M, P)) return `the ${ENTITIES[M.type].name.toLowerCase()} can't draw from that voltage`;
  if (!sameFac(P, M)) return 'that belongs to another factory';
  if (distTo(P.x, P.z) > reachOf(actor) + 1 && distTo(M.x, M.z) > reachOf(actor) + 1) return 'out of reach';
  const d = Math.min(...tilesOf(M).map(([x, z]) => Math.hypot(x - P.x, z - P.z, M.y - P.y)));
  if (d > tool.toBuilding) return `too far: a cable reaches ${tool.toBuilding} tiles from a pole to a machine`;
  if (world.links.some(l => [l.a, l.b].some(q => q[1] === M.y && covers(M, q[0], q[2])))) return 'that machine already has a cable: click it and its pole again to take it down';
  if (!invGet(kind)) return `no ${tool.name.toLowerCase()} in inventory`;
  invAdd(kind, -1);
  world.links.push({ kind, a: [P.x, P.y, P.z], b: [M.x, M.y, M.z] });
  world.powerDirty = true; bus.emit('links');
  return null;
}

// ---------------------------------------------------------------- map markers and areas (shared by everyone)
const markName = s => String(s ?? '').replace(/[<>]/g, '').trim().slice(0, 32);
const markColor = c => /^#[0-9a-f]{6}$/i.test(c || '') ? c : '#ffd23f';
const cell = v => Math.max(0, Math.min(GRID - 1, Math.floor(+v || 0)));
export function editMarks(op) {
  const M = world.marks, find = id => M.markers.find(m => m.id === id) || M.areas.find(a => a.id === id);
  if (op.do === 'add' && op.kind === 'marker') M.markers.push({ id: M.next++, x: cell(op.x), z: cell(op.z), name: markName(op.name) || 'Marker', color: markColor(op.color) });
  else if (op.do === 'add' && op.kind === 'area') {
    const [x0, x1] = [cell(op.x0), cell(op.x1)].sort((a, b) => a - b), [z0, z1] = [cell(op.z0), cell(op.z1)].sort((a, b) => a - b);
    M.areas.push({ id: M.next++, x0, z0, x1, z1, name: markName(op.name) || 'Area', color: markColor(op.color) });
  } else if (op.do === 'edit') { const m = find(op.id); if (m) { if (op.name !== undefined) m.name = markName(op.name) || m.name; if (op.color) m.color = markColor(op.color); } }
  else if (op.do === 'remove') { M.markers = M.markers.filter(m => m.id !== op.id); M.areas = M.areas.filter(a => a.id !== op.id); }
  else return;
  bus.emit('marks');
}

export function rotateEntity(e, by = 1) {
  if (!e || e.kind === 'frame' || e.kind === 'rail') return;
  if (isMulti(e)) {   // big buildings turn on their north-west tile when there is room; rooms and dams never turn
    if (!isBig(e)) return;
    const dir = (e.dir + by + 4) % 4, foot = footprint(e.type, e.x, e.z, dir);
    if (foot.some(([x, z]) => { const o = world.ents.get(key(x, e.y, z)); return (o && o !== e) || (e.y === 0 && (isWater(x, z) || world.feats.has(key(x, 0, z)) || roadAt(x, z))); })) { notify('toast', 'no room to turn it there'); return; }
    rekey(e, () => { e.foot = foot; setFoot(e); });
    e.dir = dir; world.fluidDirty = true; world.powerDirty = true;
    bus.emit('remesh', e);
    return;
  }
  e.dir = (e.dir + by + 4) % 4;
  if ((e.kind === 'underground' || e.kind === 'upipe') && e.pair) { e.pair.pair = null; bus.emit('remesh', e.pair); e.pair = null; }
  if (e.belt) world.beltDirty = true;
  if (e.fb || e.fa) world.fluidDirty = true;
  bus.emit('remesh', e);
}
// `auto`: the machine picks it itself (barreling stations), so research doesn't matter.
export function setRecipe(e, rid, auto = false) {
  if (e.kind !== 'assembler' || e.recipe === rid) return;
  const r = RECIPE[rid];
  if (rid && (!r || !(ENTITIES[e.type].cats || ['craft']).includes(r.cat) || (!auto && !recipeUnlocked(r)))) return;
  if (r && (r.fin || r.fout)) { const f = fluidConflict(e.type, e.x, e.y, e.z, e.dir, e.fac, rid); if (f) { notify('toast', f); return; } }
  if (auto) { e.recipe = rid; e.fa = []; world.fluidDirty = true; bus.emit('remesh', e); return; }   // keeps what it holds: the barrels just change use
  refundContents({ inp: e.inp, out: e.out, crafting: e.crafting, recipe: e.recipe });
  e.inp = {}; e.out = {}; e.crafting = false; e.prog = 0; e.recipe = rid; e.fa = [];
  world.fluidDirty = true;
  bus.emit('remesh', e);
}

// Commands from a machine's panel, run on behalf of `actor` (the local player or a friend).
export function entityCommand(e, cmd, arg) {
  if (!e) return;
  const takeFrom = (obj, k) => { const n = obj?.[k] || 0; if (n) { invGive(k, n); delete obj[k]; } return n; };
  switch (cmd) {
    case 'takeinp': takeFrom(e.inp, arg); break;
    case 'takeout': takeFrom(e.out, arg); break;
    case 'takeall': if (e.store) for (const [k, v] of e.store.counts()) { const got = Math.min(v, invRoom(k)); e.store.remove(k, got); invAdd(k, got); } break;
    case 'takebuf': if (e.buffer) { const it = e.buffer; invGive(it, takeBuf(e, bufCount(e))); } break;
    case 'takefuel': if (e.fuel) { invGive(e.fuelType, e.fuel); e.fuel = 0; e.fuelType = null; } break;
    case 'takebelt': if (e.belt) for (const it of clearSeg(e)) invGive(it); break;
    case 'put': { let n = 0; while (invGet(arg) > 0 && canAccept(e, arg, true) && n < 500) { insert(e, arg); invAdd(arg, -1); n++; } if (!n) notify('toast', 'it will not take that'); break; }
    case 'recipe': setRecipe(e, arg); break;
    case 'filter': e.filter = e.filter === arg ? null : arg; break;
    case 'pitch': e.dy = e.dy === 0 ? 1 : e.dy === 1 ? -1 : 0; bus.emit('remesh', e); break;
    case 'rotate': rotateEntity(e); break;
    case 'flush': flush(e); notify('toast', 'line flushed'); break;
    case 'valve': if (e.kind === 'valve' && ['check', 'overflow', 'topup'].includes(arg)) e.mode = arg; break;
    case 'barrelmode': if (ENTITIES[e.type].cats?.includes('barrel') && ['fill', 'empty'].includes(arg) && arg !== barrelMode(e)) { setRecipe(e, null, true); e.mode = arg; world.fluidDirty = true; bus.emit('remesh', e); } break;
    case 'repair': repair(e); break;
    case 'takeseeds': if (e.kind === 'greenhouse' && e.seeds) { invGive(e.seed + '_seeds', e.seeds); e.seeds = 0; } break;
    case 'fac': setFactory([e], +arg); break;
    default: if (e.kind === 'depot') depotCommand(e, cmd, arg); else if (e.belt) beltCommand(e, cmd, arg);
  }
}
// Move buildings to another factory. Their links to the old one (belts, power, pipes) fall apart.
export function setFactory(list, fac) {
  if (!factoryOf(fac)) return;
  for (const e of list) {
    if (!e || ENTITIES[e.type]?.shared || e.fac === fac || e.kind === 'frame') continue;
    e.fac = fac;
    if ((e.kind === 'underground' || e.kind === 'upipe') && e.pair) { e.pair.pair = null; bus.emit('remesh', e.pair); e.pair = null; }
    bus.emit('remesh', e);
  }
  world.beltDirty = true; world.powerDirty = true; world.fluidDirty = true;
}

// ---------------------------------------------------------------- slots: drag and drop between inventories
// Machines expose typed slots like Factorio's: fuel, input, result, one per ingredient or science pack.
// A slot reference is { p: index } for the acting engineer's inventory, or { e: [x, y, z], s: slotId } for a machine.
const firstKey = o => Object.keys(o || {}).find(k => o[k] > 0) || null;
const PACKS = ['red_pack', 'green_pack', 'blue_pack', 'terrestrial_pack', 'resonance_pack'];
export function entSlots(e) {
  const out = [];
  if (!e) return out;
  if (e.fuel !== undefined) out.push({ id: 'fuel', group: 'Fuel', it: e.fuel ? e.fuelType : null, n: e.fuel, hint: 'coal' });
  switch (e.kind) {
    case 'furnace': {
      const it = firstKey(e.inp);
      out.push({ id: 'src', group: 'Input', it, n: it ? e.inp[it] : 0, hint: 'iron_ore' });
      const outs = Object.keys(e.out).filter(k => e.out[k] > 0);
      if (!outs.length) out.push({ id: 'res:', group: 'Result', it: null, n: 0, hint: RECIPE[e.recipe] ? Object.keys(RECIPE[e.recipe].out)[0] : 'iron_plate' });
      for (const k of outs) out.push({ id: 'res:' + k, group: 'Result', it: k, n: e.out[k] });
      break;
    }
    case 'assembler': {
      const r = RECIPE[e.recipe]; if (!r) break;
      for (const k of Object.keys(r.in)) { const g = groupOf(k), have = g ? Object.keys(e.inp).find(it => ingredientMatches(k, it) && e.inp[it] > 0) : e.inp[k] ? k : null; out.push({ id: 'in:' + k, group: 'Ingredients', it: have || null, n: groupHave(e, k), hint: g ? g.icon : k }); }
      for (const k of Object.keys(r.out)) out.push({ id: 'res:' + k, group: 'Result', it: e.out[k] ? k : null, n: e.out[k] || 0, hint: k });
      break;
    }
    case 'lab': for (const k of PACKS) out.push({ id: 'in:' + k, group: 'Science packs', it: e.inp[k] ? k : null, n: e.inp[k] || 0, hint: k }); break;
    case 'transmitter': out.push({ id: 'in:resonance_pack', group: 'Resonance packs', it: e.inp.resonance_pack ? 'resonance_pack' : null, n: e.inp.resonance_pack || 0, hint: 'resonance_pack' }); break;
    case 'drill': out.push({ id: 'buf', group: 'Output', it: e.buffer, n: bufCount(e) }); break;
    case 'greenhouse': {
      out.push({ id: 'seeds', group: 'Seeds', it: e.seeds ? e.seed + '_seeds' : null, n: e.seeds || 0, hint: 'wheat_seeds' });
      const outs = Object.keys(e.out || {}).filter(k => e.out[k] > 0);
      if (!outs.length) out.push({ id: 'res:', group: 'Harvest', it: null, n: 0, hint: e.seed || 'wheat' });
      for (const k of outs) out.push({ id: 'res:' + k, group: 'Harvest', it: k, n: e.out[k] });
      break;
    }
    case 'medlab': for (const k of medSlotItems()) out.push({ id: 'in:' + k, group: 'Research items', it: e.inp[k] ? k : null, n: e.inp[k] || 0, hint: k }); break;
    case 'chest': case 'depot': e.store.slots.forEach((s, i) => out.push({ id: 'c:' + i, group: 'Storage', it: s?.it || null, n: s?.n || 0 })); break;
  }
  if (!e.belt) (e.aug || []).forEach((it, i) => out.push({ id: 'aug:' + i, group: 'Augments', it, n: it ? 1 : 0, hint: e.kind === 'drill' && i === e.aug.length - 1 ? 'depth_aug_1' : 'speed_aug_1' }));
  return out;
}
// The slots of whatever a panel shows: a machine or a vehicle.
export const slotsOf = t => !t ? [] : t.isVeh ? vehSlots(t) : entSlots(t);
function entSlotAccept(e, id, it) {
  if (!it) return 0;
  const st = stackOf(it);
  if (id === 'fuel' && e.kind === 'reactor') return reactorAccepts(e, it, true) ? Math.max(0, 50 - e.fuel) : 0;
  if (id === 'fuel') return ITEMS[it]?.fuel && (!e.fuel || e.fuelType === it) ? Math.max(0, st * (ENTITIES[e.type].fuelStacks || 1) - e.fuel) : 0;
  if (id === 'seeds') return greenhouseAccepts(e, it, true) ? Math.max(0, 200 - e.seeds) : 0;
  if (id === 'src') {
    const r = smeltRecipe(it), cur = firstKey(e.inp);
    if (!r || (cur && cur !== it) || (e.crafting && e.recipe !== r.id)) return 0;
    return st - (e.inp[it] || 0);
  }
  if (id.startsWith('in:')) {
    const k = id.slice(3);
    if (!ingredientMatches(k, it) || (e.kind === 'assembler' && !RECIPE[e.recipe]?.in[k]) || (e.kind === 'medlab' && !medAccepts(e, it, true))) return 0;
    return st - groupHave(e, k);
  }
  if (id.startsWith('c:')) return e.store.slotAccept(+id.slice(2), it);
  if (id.startsWith('aug:')) return !e.aug?.[+id.slice(4)] && augFits(e, it) ? 1 : 0;
  return 0;   // results and drill output only come out
}
function entSlotPut(e, id, it, n) {
  const k = Math.min(n, entSlotAccept(e, id, it));
  if (k <= 0) return 0;
  if (id === 'fuel') { e.fuelType = it; e.fuel += k; }
  else if (id === 'src') { e.recipe = smeltRecipe(it).id; e.inp[it] = (e.inp[it] || 0) + k; }
  else if (id.startsWith('in:')) e.inp[it] = (e.inp[it] || 0) + k;
  else if (id === 'seeds') { for (let i = 0; i < k; i++) greenhouseInsert(e, it); }
  else if (id.startsWith('c:')) e.store.slotPut(+id.slice(2), it, k);
  else if (id.startsWith('aug:')) e.aug[+id.slice(4)] = it;
  return k;
}
function entSlotTake(e, id, n) {
  if (id === 'fuel') { const it = e.fuelType, k = Math.min(n, e.fuel); e.fuel -= k; if (!e.fuel) e.fuelType = null; return [it, k]; }
  if (id === 'buf') { const it = e.buffer; return it ? [it, takeBuf(e, n)] : [null, 0]; }
  if (id === 'seeds') { const k = Math.min(n, e.seeds || 0); e.seeds -= k; return [e.seed + '_seeds', k]; }
  if (id.startsWith('aug:')) { const i = +id.slice(4), it = e.aug?.[i]; if (!it) return [null, 0]; e.aug[i] = null; return [it, 1]; }
  if (id.startsWith('c:')) { const i = +id.slice(2), it = e.store.slots[i]?.it; return [it, e.store.slotTake(i, n)]; }
  let obj = id.startsWith('res:') ? e.out : e.inp, k2 = id === 'src' ? firstKey(e.inp) : id.slice(id.indexOf(':') + 1);
  if (groupOf(k2)) k2 = Object.keys(e.inp).find(it => ingredientMatches(k2, it) && e.inp[it] > 0) || null;   // any seed: the first there is
  if (!k2 || !obj[k2]) return [null, 0];
  const k = Math.min(n, obj[k2]); obj[k2] -= k; if (!obj[k2]) delete obj[k2];
  return [k2, k];
}
const refEnt = r => r.e ? world.ents.get(key(r.e[0], r.e[1], r.e[2])) : r.v ? vehicleById(r.v) : null;
function refGet(r) {
  if (r.p !== undefined) { const s = actor.inv.slots[r.p]; return { it: s?.it || null, n: s?.n || 0 }; }
  const e = refEnt(r), s = e && slotsOf(e).find(x => x.id === r.s);
  return s ? { it: s.it, n: s.n } : { it: null, n: 0 };
}
const slotAccept = (e, id, it) => e.isVeh ? vehSlotAccept(e, id, it) : entSlotAccept(e, id, it);
const slotPut = (e, id, it, n) => e.isVeh ? vehSlotPut(e, id, it, n) : entSlotPut(e, id, it, n);
const refAccept = (r, it) => r.p !== undefined ? actor.inv.slotAccept(r.p, it) : refEnt(r) ? slotAccept(refEnt(r), r.s, it) : 0;
const refPut = (r, it, n) => r.p !== undefined ? actor.inv.slotPut(r.p, it, n) : refEnt(r) ? slotPut(refEnt(r), r.s, it, n) : 0;
function refTake(r, n) {
  if (r.p !== undefined) { const it = actor.inv.slots[r.p]?.it; return [it, actor.inv.slotTake(r.p, n)]; }
  const e = refEnt(r); return !e ? [null, 0] : e.isVeh ? vehSlotTake(e, r.s, n) : entSlotTake(e, r.s, n);
}
const isStorage = r => r.p !== undefined || (r.s && r.s.startsWith('c:'));
const nearEnough = r => { const e = r.e || r.v ? refEnt(r) : null; return !e || distTo(Math.floor(e.x), Math.floor(e.z)) <= reachOf(actor) + 1 + (e.isVeh ? 1 : 0); };
// Move up to n items from one slot to another. Storage slots swap if they hold different things.
export function moveItems(from, to, n) {
  if (!nearEnough(from) || !nearEnough(to)) { notify('toast', 'out of reach'); return 0; }
  const a = refGet(from); if (!a.it) return 0;
  n = Math.min(n || a.n, a.n);
  const b = refGet(to);
  if (b.it && b.it !== a.it) {
    if (isStorage(from) && isStorage(to) && n === a.n) {
      const [ia, na] = refTake(from, a.n), [ib, nb] = refTake(to, b.n);
      refPut(to, ia, na); refPut(from, ib, nb);
      if (actor.local) bus.emit('inv');
      return na;
    }
    notify('toast', 'that slot already holds something else'); return 0;
  }
  const k = Math.min(n, refAccept(to, a.it));
  if (k <= 0) { notify('toast', to.p !== undefined ? 'that slot is full' : `that slot won't take ${ITEMS[a.it].name.toLowerCase()}`); return 0; }
  const [it, got] = refTake(from, k);
  refPut(to, it, got);
  if (actor.local) bus.emit('inv');
  return got;
}
// Shift+click: send a whole stack to the other side (inventory <-> the open machine).
export function shiftMove(from, entPos) {
  if (!nearEnough(from)) { notify('toast', 'out of reach'); return 0; }
  const a = refGet(from); if (!a.it) return 0;
  let moved = 0;
  if (from.p !== undefined) {
    const e = entPos?.v ? vehicleById(entPos.v) : entPos ? world.ents.get(key(entPos[0], entPos[1], entPos[2])) : null;
    if (!e) return 0;
    if (e.store) { const left = e.store.add(a.it, a.n); moved = a.n - left; actor.inv.slotTake(from.p, moved); }
    else for (const s of slotsOf(e)) {
      const k = Math.min(a.n - moved, slotAccept(e, s.id, a.it));
      if (k > 0) { actor.inv.slotTake(from.p, k); slotPut(e, s.id, a.it, k); moved += k; }
      if (moved >= a.n) break;
    }
    if (!moved) notify('toast', `it won't take ${ITEMS[a.it].name.toLowerCase()}`);
  } else {
    const k = Math.min(a.n, invRoom(a.it));
    if (k > 0) { const [it, got] = refTake(from, k); actor.inv.add(it, got); moved = got; } else notify('toast', 'inventory full');
  }
  if (actor.local) bus.emit('inv');
  return moved;
}
