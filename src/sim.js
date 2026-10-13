// Simulation: the engineer, logistics, machines, power networks, research, precision, crafting, building.
import { ENTITIES, ITEMS, RECIPE, RECIPES, TECH, TIERS, FEATURES, PLAYER } from './data.js';
import { S, world, invAdd, invGet, invGive, invRoom, Inventory, stackOf, spill, bus, key, DIRS, GRID, LAYER_MAX, layerRange, layerLockReason, recipeUnlocked, actor, setActor, notify } from './state.js';
const isClient = () => S.net.role === 'client';

export const SPACING = .25;
const ACTIVE_WINDOW = 8;
let nextId = 1;
export const isActive = e => e && S.T - e.lastActive < ACTIVE_WINDOW;
export const isBeltLike = e => !!(e && e.items);
const bump = (stat, it, n = 1) => { S.stats[stat] ||= {}; S.stats[stat][it] = (S.stats[stat][it] || 0) + n; };

// ---------------------------------------------------------------- entities
export function createEntity(type, x, y, z, dir = 0, dy = 0) {
  const def = ENTITIES[type];
  const e = { id: nextId++, type, kind: def.kind, x, y, z, dir, dy: 0, lastActive: -99, prog: 0, status: '', net: null };
  if (def.burner || def.kind === 'generator') { e.fuel = 0; e.fuelType = null; e.burn = 0; }
  switch (def.kind) {
    case 'belt': case 'splitter': e.items = []; e.len = 1; e.speed = def.speed; e.curve = null; e.rr = 0; break;
    case 'underground': e.items = []; e.len = 1; e.speed = def.speed; e.role = 'in'; e.pair = null; break;
    case 'lift': e.items = []; e.len = 1; e.speed = def.speed; e.dy = dy || 1; break;
    case 'inserter': e.t = 0; e.held = null; e.reach = def.reach; e.swing = def.swing; e.dy = dy || 0; e.filter = null; break;
    case 'drill': e.timer = 0; e.buffer = null; break;
    case 'furnace': e.recipe = null; e.inp = {}; e.out = {}; e.crafting = false; break;
    case 'assembler': e.recipe = null; e.inp = {}; e.out = {}; e.crafting = false; break;
    case 'lab': e.inp = {}; e.unit = null; break;
    case 'chest': e.items = null; e.store = new Inventory(def.cap); break;
    case 'transmitter': e.inp = {}; e.charging = false; break;
  }
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
  if (usesFuel(e) && ITEMS[it]?.fuel && e.kind !== 'chest')
    return (e.fuel === 0 || e.fuelType === it) && e.fuel < (manual ? ITEMS[it].stack : 5);
  switch (e.kind) {
    case 'chest': return e.store.room(it) > 0;
    case 'furnace': {
      const r = smeltRecipe(it); if (!r) return false;
      if (e.recipe && e.recipe !== r.id && (e.crafting || Object.values(e.inp).some(v => v > 0))) return false;
      return (e.inp[it] || 0) < r.in[it] * (manual ? 50 : 4);
    }
    case 'assembler': {
      const r = RECIPE[e.recipe]; if (!r || !r.in[it]) return false;
      return (e.inp[it] || 0) < (manual ? ITEMS[it].stack : Math.max(r.in[it] * 2, r.in[it] + 1));
    }
    case 'lab': return ITEMS[it]?.shape === 'pack' && (e.inp[it] || 0) < (manual ? 200 : 10);
    case 'transmitter': return it === 'resonance_pack' && (e.inp[it] || 0) < (manual ? 50 : 10);
  }
  return false;
}
export function insert(e, it) {
  if (usesFuel(e) && ITEMS[it]?.fuel && e.kind !== 'chest') { e.fuelType = it; e.fuel++; return; }
  switch (e.kind) {
    case 'chest': e.store.add(it, 1); break;
    case 'furnace': e.recipe = smeltRecipe(it).id; e.inp[it] = (e.inp[it] || 0) + 1; break;
    default: e.inp[it] = (e.inp[it] || 0) + 1;
  }
  e.lastActive = S.T;
}
export function take(e, ok) {
  if (!e) return null;
  if (isBeltLike(e)) {
    let best = -1, bd = 9; const mid = pickPoint(e);
    e.items.forEach((it, i) => { const d = Math.abs(it.p - mid); if (ok(it.type) && d < bd && visibleOnBelt(e, it.p)) { bd = d; best = i; } });
    if (best < 0) return null;
    return e.items.splice(best, 1)[0].type;
  }
  switch (e.kind) {
    case 'chest': for (const it of e.store.counts().keys()) if (ok(it)) { e.store.remove(it, 1); e.lastActive = S.T; return it; } break;
    case 'furnace': case 'assembler': for (const it in e.out) if (e.out[it] > 0 && ok(it)) { if (--e.out[it] === 0) delete e.out[it]; return it; } break;
    case 'drill': if (e.buffer && ok(e.buffer)) { const it = e.buffer; e.buffer = null; return it; } break;
  }
  return null;
}
const wants = (t, it) => isBeltLike(t) ? true : canAccept(t, it);
function give(t, it) {
  if (isBeltLike(t)) return dropOnBelt(t, it);
  if (canAccept(t, it)) { insert(t, it); return true; }
  return false;
}
// Burner energy: pull fuel when needed, return 1 while burning, 0 when out.
function burner(e, want, mw, dt) {
  if (!want) return 0;
  if (e.burn <= 0 && e.fuel > 0) { e.burn += ITEMS[e.fuelType].fuel; if (--e.fuel === 0) e.fuelType = null; }
  if (e.burn <= 0) return 0;
  e.burn -= mw * dt; return 1;
}

// ---------------------------------------------------------------- belts
function pickPoint(b) { return b.kind === 'underground' ? (b.role === 'in' ? .25 : b.len - .25) : b.len / 2; }
export function visibleOnBelt(b, p) { return b.kind !== 'underground' || (b.role === 'in' ? p < .5 : p > b.len - .5); }
function roomAt(b, q) { for (const it of b.items) if (Math.abs(it.p - q) < SPACING - 1e-6) return false; return true; }
function insertSorted(b, item) { let i = 0; while (i < b.items.length && b.items[i].p < item.p) i++; b.items.splice(i, 0, item); }
export function dropOnBelt(b, type) {
  const q = pickPoint(b);
  if (!roomAt(b, q)) return false;
  insertSorted(b, { type, p: q }); b.lastActive = S.T; return true;
}
export function primaryNext(b) {
  const [dx, dz] = DIRS[b.dir];
  if (b.kind === 'underground' && b.role === 'in') return b.pair;
  if (b.kind === 'lift') return world.ents.get(key(b.x + dx, b.y + b.dy, b.z + dz));
  return world.ents.get(key(b.x + dx, b.y, b.z + dz));
}
const splitOuts = b => [b.dir, (b.dir + 3) % 4, (b.dir + 1) % 4];
// Where an item moving in `moveDir` lands on belt t (-1 = refused).
function entryFor(t, moveDir, from) {
  if (!isBeltLike(t)) return -1;
  if (t.kind === 'underground' && t.role === 'out') return from && from === t.pair ? 0 : -1;
  const rel = (moveDir - t.dir + 4) % 4;
  if (rel === 2) return -1;
  if (rel === 0) return 0;
  if (t.kind === 'lift' || t.kind === 'splitter') return -1;
  if (t.kind === 'belt' && ((rel === 1 && t.curve === 'L') || (rel === 3 && t.curve === 'R'))) return 0;
  return t.kind === 'underground' ? .25 : t.len / 2;
}
function outputsInto(n, b) {
  if (!isBeltLike(n)) return false;
  if (n.kind === 'splitter') return splitOuts(n).some(d => { const [dx, dz] = DIRS[d]; return world.ents.get(key(n.x + dx, n.y, n.z + dz)) === b; });
  return primaryNext(n) === b;
}
function computeCurve(b) {
  const [dx, dz] = DIRS[b.dir];
  if (outputsInto(world.ents.get(key(b.x - dx, b.y, b.z - dz)), b)) return null;
  for (const ldy of [1, -1]) { const n = world.ents.get(key(b.x - dx, b.y - ldy, b.z - dz)); if (n && n.kind === 'lift' && n.dy === ldy && n.dir === b.dir) return null; }
  const side = d => { const [sx, sz] = DIRS[d]; return outputsInto(world.ents.get(key(b.x + sx, b.y, b.z + sz)), b); };
  const L = side((b.dir + 3) % 4), R = side((b.dir + 1) % 4);
  return L && !R ? 'L' : R && !L ? 'R' : null;
}
export function rebuildBelts() {
  const belts = [...world.ents.values()].filter(isBeltLike);
  for (const b of belts) if (b.kind === 'underground' && b.role === 'in') {
    b.len = b.pair ? Math.max(1, Math.abs(b.pair.x - b.x) + Math.abs(b.pair.z - b.z)) : 1;
    for (let i = b.items.length - 1; i >= 0; i--) if (b.items[i].p > b.len) { spill(b.items[i].type, b.x + .5, b.z + .5); b.items.splice(i, 1); }
  }
  for (const b of belts) if (b.kind === 'belt') { const c = computeCurve(b); if (c !== b.curve) { b.curve = c; bus.emit('remesh', b); } }
  const seen = new Set(), order = [];
  const visit = b => {
    if (seen.has(b)) return; seen.add(b);
    if (b.kind === 'splitter') for (const d of splitOuts(b)) { const [dx, dz] = DIRS[d]; const n = world.ents.get(key(b.x + dx, b.y, b.z + dz)); if (isBeltLike(n)) visit(n); }
    else { const n = primaryNext(b); if (isBeltLike(n)) visit(n); }
    order.push(b);
  };
  belts.forEach(visit);
  world.beltOrder = order; world.beltDirty = false;
}
function beltTick(b, dt) {
  const items = b.items, n = items.length;
  if (!n) return;
  let tgt = null, q = -1;
  if (b.kind !== 'splitter') { tgt = primaryNext(b); q = entryFor(tgt, b.dir, b); }
  const limit = q === 0 ? b.len + (tgt.items.length ? tgt.items[0].p - SPACING : 1) : b.len;
  let moved = false;
  for (let i = n - 1; i >= 0; i--) {
    const it = items[i], max = i === n - 1 ? limit : items[i + 1].p - SPACING;
    if (it.p < max) { const np = Math.min(max, it.p + b.speed * dt); if (np > it.p) { it.p = np; moved = true; } }
  }
  const f = items[n - 1];
  if (f.p >= b.len) {
    let gone = false;
    if (b.kind === 'splitter') {
      for (let k = 0; k < 3 && !gone; k++) {
        const o = (b.rr + k) % 3, od = splitOuts(b)[o], [dx, dz] = DIRS[od];
        const t = world.ents.get(key(b.x + dx, b.y, b.z + dz)), qq = entryFor(t, od, b);
        if (qq >= 0 && roomAt(t, qq)) { items.pop(); f.p = qq; insertSorted(t, f); t.lastActive = S.T; b.rr = (o + 1) % 3; gone = true; }
      }
    } else if (q >= 0) {
      const nq = q === 0 ? f.p - b.len : q;
      if (roomAt(tgt, nq)) { items.pop(); f.p = nq; insertSorted(tgt, f); tgt.lastActive = S.T; gone = true; }
    }
    if (!gone) f.p = b.len;
  }
  if (moved) b.lastActive = S.T;
}

// ---------------------------------------------------------------- power networks
// Poles join into networks by wire reach; machines inside a pole's supply area join that network.
export const nets = [];
export function rebuildPower() {
  const poles = [...world.ents.values()].filter(e => e.kind === 'pole');
  const parent = new Map(poles.map(p => [p, p]));
  const find = p => { while (parent.get(p) !== p) { parent.set(p, parent.get(parent.get(p))); p = parent.get(p); } return p; };
  const wires = [], seen = new Set();
  for (const a of poles) {
    const near = poles.filter(b => b !== a).map(b => [b, Math.hypot(a.x - b.x, a.z - b.z, a.y - b.y)])
      .filter(([b, d]) => d <= Math.min(ENTITIES[a.type].wire, ENTITIES[b.type].wire)).sort((p, q) => p[1] - q[1]).slice(0, 5);
    for (const [b] of near) {
      const id = a.id < b.id ? a.id + '-' + b.id : b.id + '-' + a.id;
      parent.set(find(a), find(b));
      if (!seen.has(id)) { seen.add(id); wires.push([a, b]); }
    }
  }
  const byRoot = new Map();
  nets.length = 0;
  for (const p of poles) {
    const r = find(p);
    if (!byRoot.has(r)) { const n = { id: nets.length, poles: [], demand: 0, nextDemand: 0, capacity: 0, sat: 0, produced: 0 }; byRoot.set(r, n); nets.push(n); }
    p.net = byRoot.get(r); p.net.poles.push(p);
  }
  for (const e of world.ents.values()) {
    if (e.kind === 'pole') continue;
    e.net = null;
    if (!(isElectric(e) || e.kind === 'generator' || e.kind === 'solar')) continue;
    for (const p of poles) {
      const s = ENTITIES[p.type].supply;
      if (Math.abs(e.x - p.x) <= s && Math.abs(e.z - p.z) <= s && Math.abs(e.y - p.y) <= 1) { e.net = p.net; break; }
    }
  }
  world.wires = wires; world.powerDirty = false;
  bus.emit('power');
}
function powerTick(dt) {
  for (const n of nets) {
    const used = Math.min(n.nextDemand, n.capacity);
    let fromGen = Math.max(0, used - n.solar * ENTITIES.solar.out);
    const live = n.gens.filter(g => g.burn > 0 || g.fuel > 0);
    for (const g of live) {
      const share = fromGen / live.length;
      burner(g, share > 0, share / 1000, dt);
      g.load = share / ENTITIES.generator.out;
      if (share > 0) { g.lastActive = S.T; g.status = 'generating'; } else g.status = 'idle (no demand)';
    }
    for (const g of n.gens) if (!live.includes(g)) { g.load = 0; g.status = 'out of fuel'; }
    n.demand = n.nextDemand; n.produced = used; n.nextDemand = 0;
  }
}

// ---------------------------------------------------------------- machines
function craftTick(e, dt, speed, energy) {
  const r = RECIPE[e.recipe];
  if (!r) { e.status = 'no recipe'; return false; }
  if (!e.crafting) {
    for (const [k, n] of Object.entries(r.out)) if ((e.out[k] || 0) + n > Math.max(20, n * 4)) { e.status = 'output full'; return false; }
    for (const [k, n] of Object.entries(r.in)) if ((e.inp[k] || 0) < n) { e.status = 'waiting for ingredients'; return false; }
    for (const [k, n] of Object.entries(r.in)) { e.inp[k] -= n; if (!e.inp[k]) delete e.inp[k]; }
    e.crafting = true; e.prog = 0;
  }
  if (energy <= 0) { e.status = 'no power'; return true; }
  e.prog += dt * speed * energy / r.time; e.lastActive = S.T; e.status = 'working';
  if (e.prog >= 1) {
    for (const [k, n] of Object.entries(r.out)) { e.out[k] = (e.out[k] || 0) + n; bump('made', k, n); }
    e.crafting = false; e.prog = 0;
  }
  return true;
}
function drillOutput(e) {
  const [dx, dz] = DIRS[e.dir], t = world.ents.get(key(e.x + dx, e.y, e.z + dz));
  if (!t) { if (e.y === 0) { spill(e.buffer, e.x + dx + .5, e.z + dz + .5); e.buffer = null; } return; }   // Factorio drills drop ore on the ground
  if (t.kind === 'inserter') return;
  if (isBeltLike(t) ? dropOnBelt(t, e.buffer) : canAccept(t, e.buffer) && (insert(t, e.buffer), true)) e.buffer = null;
}
export function depleteOre(x, y, z, n = 1) {
  const k = key(x, y, z), o = world.ores.get(k); if (!o) return null;
  o.amount -= n;
  if (o.amount <= 0 && !isClient()) { world.ores.delete(k); bus.emit('ore', x, y, z); }
  return o.type;
}
const noPower = e => !e.net ? 'not connected to power' : 'no power';

function tickEntity(e, dt) {
  const def = ENTITIES[e.type], net = e.net, sat = net ? net.sat : 0;
  const demand = kw => { if (net) net.nextDemand += kw; };
  switch (e.kind) {
    case 'drill': {
      if (e.buffer) { drillOutput(e); if (e.buffer) { e.status = 'output blocked'; break; } }
      const ore = world.ores.get(key(e.x, e.y, e.z));
      if (!ore) { e.status = 'deposit exhausted'; break; }
      let energy;
      if (def.burner) { energy = burner(e, true, .15, dt); if (!energy) { e.status = 'out of fuel'; break; } }
      else { demand(def.power); energy = sat; if (sat <= 0) { e.status = noPower(e); break; } }
      e.timer += dt * def.rate * energy; e.lastActive = S.T; e.status = 'mining';
      if (e.timer >= 1) { e.timer = 0; e.buffer = depleteOre(e.x, e.y, e.z); bump('made', e.buffer); drillOutput(e); }
      break;
    }
    case 'furnace': {
      if (def.burner) {
        const want = e.crafting || Object.keys(e.inp).length > 0;
        const energy = want ? (e.burn > 0 || e.fuel > 0 ? 1 : 0) : 0;
        const working = craftTick(e, dt, def.speed, energy);
        if (working) burner(e, true, .09, dt);
        if (working && e.burn <= 0 && !e.fuel) e.status = 'out of fuel';
      } else {
        if (e.crafting) demand(def.power);
        craftTick(e, dt, def.speed, sat);
        if (e.status === 'no power') e.status = noPower(e);
      }
      if (!e.recipe) e.status = 'waiting for ore';
      break;
    }
    case 'assembler':
      if (e.crafting) demand(def.power);
      craftTick(e, dt, def.speed, sat);
      if (e.status === 'no power') e.status = noPower(e);
      break;
    case 'lab': {
      const tech = TECH[S.research.current];
      if (!tech || S.research.done.has(tech.id)) { e.status = 'no research selected'; e.unit = null; break; }
      if (e.unit !== tech.id) {
        e.unit = null; e.prog = 0;
        if ((S.research.progress[tech.id] || 0) >= tech.count) break;
        if (!Object.keys(tech.cost).every(p => (e.inp[p] || 0) >= 1)) { e.status = 'missing science packs'; break; }
        for (const p in tech.cost) { if (--e.inp[p] === 0) delete e.inp[p]; }
        e.unit = tech.id;
      }
      demand(def.power);
      if (sat <= 0) { e.status = noPower(e); break; }
      e.prog += dt * def.speed * sat / tech.time; e.lastActive = S.T; e.status = 'researching';
      if (e.prog >= 1) {
        e.unit = null; e.prog = 0;
        S.research.progress[tech.id] = (S.research.progress[tech.id] || 0) + 1;
        if (S.research.progress[tech.id] >= tech.count && !isClient()) completeResearch(tech.id);
      }
      break;
    }
    case 'inserter': {
      const [dx, dz] = DIRS[e.dir], r = e.reach;
      const src = world.ents.get(key(e.x - dx * r, e.y, e.z - dz * r));
      const tgt = world.ents.get(key(e.x + dx * r, e.y + e.dy, e.z + dz * r));
      const moving = !!e.held || e.t > 0;
      let energy;
      if (def.burner) {
        // leech: a burner inserter that runs dry keeps the fuel it is carrying
        if (e.burn <= 0 && !e.fuel && e.held && ITEMS[e.held]?.fuel) { e.burn += ITEMS[e.held].fuel; e.held = null; }
        energy = burner(e, moving, .1, dt) || (!moving && (e.burn > 0 || e.fuel > 0) ? 1 : 0);
      } else { if (moving) demand(def.power); energy = sat; }
      const spd = dt / e.swing * energy;
      if (!e.held) {
        if (e.t > 0) { e.t = Math.max(0, e.t - spd); e.lastActive = S.T; e.status = 'returning'; }
        else if (!src || !tgt) e.status = !src ? 'nothing behind it' : 'nothing in front of it';
        else if (energy <= 0) e.status = def.burner ? 'out of fuel' : noPower(e);
        else if (src.kind !== 'inserter') {
          const it = take(src, it => (!e.filter || it === e.filter) && wants(tgt, it));
          if (it) { e.held = it; e.lastActive = S.T; e.status = 'moving'; } else e.status = 'waiting';
        }
      } else {
        e.lastActive = S.T;
        if (e.t < 1) { e.t = Math.min(1, e.t + spd); e.status = 'moving'; }
        else if (tgt && give(tgt, e.held)) e.held = null;
        else e.status = 'target full';
      }
      if (energy <= 0 && moving) e.status = def.burner ? 'out of fuel' : noPower(e);
      break;
    }
    case 'transmitter': {
      if (!e.charging) {
        if ((e.inp.resonance_pack || 0) < 1) { e.status = 'needs resonance packs'; break; }
        if (--e.inp.resonance_pack === 0) delete e.inp.resonance_pack;
        e.charging = true; e.prog = 0;
      }
      demand(def.power);
      if (sat <= 0) { e.status = noPower(e); break; }
      e.prog += dt * sat / 4; e.lastActive = S.T; e.status = 'charging pulse';
      if (e.prog >= 1) { e.charging = false; e.prog = 0; if (!isClient()) bus.emit('pulse', e); }
      break;
    }
    case 'generator': if (!e.net) e.status = 'not connected: put a pole next to it'; break;
    case 'solar': e.status = e.net ? 'generating' : 'not connected: put a pole next to it'; if (e.net) e.lastActive = S.T; break;
    case 'pole': e.status = `network ${e.net ? e.net.id + 1 : '?'} · ${e.net ? Math.round(e.net.produced) : 0} kW used`; break;
  }
}

// ---------------------------------------------------------------- research
export function completeResearch(id) {
  S.research.done.add(id);
  if (S.research.current === id) S.research.current = null;
  bus.emit('research', id);
}
export function techAvailable(t) {
  return t.pre.every(p => S.research.done.has(p)) && (t.precision ?? 0) <= S.maxTier;
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
    for (const [k, n] of Object.entries(r.in)) if (!need(k, n * t)) return false;
    const giveOut = {};
    for (const [k, n] of Object.entries(r.out)) { const g = n * t - (internal[k] || 0); if (g > 0) giveOut[k] = g; }
    queue.push({ rid: r.id, times: t, done: 0, prog: 0, give: giveOut, top: !Object.keys(internal).length });
    return true;
  };
  const need = (item, n) => {
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
  let lo = 0, hi = 1;
  while (hi <= 512 && planCraft(rid, hi)) { lo = hi; hi *= 2; }
  hi = Math.min(hi, 513);
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (planCraft(rid, m)) lo = m; else hi = m; }
  return lo;
}
export function queueCraft(rid, times = 1) {
  const plan = planCraft(rid, times);
  if (!plan) return false;
  const inv = actor.inv, before = inv.counts();
  for (const k of new Set([...before.keys(), ...plan.sim.keys()])) { const d = (plan.sim.get(k) || 0) - (before.get(k) || 0); if (d < 0) inv.remove(k, -d); else if (d > 0) inv.add(k, d); }
  actor.craft.push(...plan.queue); if (actor.local) bus.emit('inv'); return true;
}
export function cancelCraft(i) {
  const c = actor.craft[i]; if (!c || !c.top) return;
  const r = RECIPE[c.rid];
  for (const [k, n] of Object.entries(r.in)) invGive(k, n * (c.times - c.done));
  actor.craft.splice(i, 1);
}
function craftQueueTick(dt) {
  const c = actor.craft[0]; if (!c) return;
  const r = RECIPE[c.rid];
  c.prog += dt / Math.max(.25, r.time);
  if (c.prog >= 1) {
    c.prog = 0; c.done++;
    if (c.done >= c.times) {
      actor.craft.shift();
      for (const [k, n] of Object.entries(c.give)) { invGive(k, n); bump('made', k, n); }
      if (c.top) { notify('crafted', c.rid); notify('float', `+${c.give[c.rid] || 1} ${ITEMS[c.rid].name}`, actor.x, 1.2, actor.z); }
    }
  }
}

// ---------------------------------------------------------------- the engineer
export const playerCell = () => ({ x: Math.floor(actor.x), z: Math.floor(actor.z) });
export const distTo = (x, z) => Math.hypot(x + .5 - actor.x, z + .5 - actor.z);
// Solid shapes on the surface: machines are squares, trees and rocks are circles. Belts and hollow frames are walkable.
function solidShape(cx, cz) {
  if (cx < 0 || cz < 0 || cx >= GRID || cz >= GRID) return { sq: .5 };
  const f = world.feats.get(key(cx, 0, cz));
  if (f) return { r: f.type === 'tree' ? .22 : .42 };
  const e = world.ents.get(key(cx, 0, cz));
  if (!e || e.items) return null;
  if (e.kind === 'pole') return { r: .15 };
  return { sq: .46 };
}
function collides(px, pz) {
  const r = PLAYER.radius;
  for (let cx = Math.floor(px - r - .5); cx <= Math.floor(px + r + .5); cx++) for (let cz = Math.floor(pz - r - .5); cz <= Math.floor(pz + r + .5); cz++) {
    const s = solidShape(cx, cz); if (!s) continue;
    const mx = cx + .5, mz = cz + .5;
    if (s.r) { if (Math.hypot(px - mx, pz - mz) < r + s.r) return true; }
    else {
      const nx = Math.max(mx - s.sq, Math.min(px, mx + s.sq)), nz = Math.max(mz - s.sq, Math.min(pz, mz + s.sq));
      if (Math.hypot(px - nx, pz - nz) < r) return true;
    }
  }
  return false;
}
export const playerBlocks = (x, z) => { const r = PLAYER.radius; for (const p of S.players.values()) if (p.x + r > x + .04 && p.x - r < x + .96 && p.z + r > z + .04 && p.z - r < z + .96) return true; return false; };

// input: { mx, mz } desired direction in world space (unit or zero)
export function playerTick(dt, input) {
  const p = actor;
  // quick acceleration and braking: responsive, but not a teleporting box
  const a = 1 - Math.exp(-dt * (input.mx || input.mz ? 22 : 30));
  p.vx = (p.vx || 0) + (input.mx * PLAYER.speed - (p.vx || 0)) * a;
  p.vz = (p.vz || 0) + (input.mz * PLAYER.speed - (p.vz || 0)) * a;
  let vx = p.vx, vz = p.vz;
  const under = world.ents.get(key(Math.floor(p.x), 0, Math.floor(p.z)));
  if (under && under.items && under.kind !== 'lift') { const [dx, dz] = DIRS[under.dir]; vx += dx * under.speed; vz += dz * under.speed; }
  const stuck = collides(p.x, p.z);
  const nx = p.x + vx * dt; if (stuck || !collides(nx, p.z)) p.x = nx;
  const nz = p.z + vz * dt; if (stuck || !collides(p.x, nz)) p.z = nz;
  p.x = Math.min(GRID - .3, Math.max(.3, p.x)); p.z = Math.min(GRID - .3, Math.max(.3, p.z));
  const sp = Math.hypot(p.vx, p.vz);
  if (input.mx || input.mz) p.face = Math.atan2(input.mx, input.mz);
  else if (p.mining && p.mineCell) p.face = Math.atan2(p.mineCell.x + .5 - p.x, p.mineCell.z + .5 - p.z);
  p.walk += dt * 10 * Math.min(1, sp / PLAYER.speed);
  p.moving = sp > .4;
  if (!isClient()) { mineTick(dt); pickupTick(dt); }
}

// What right-click would mine at a cell, in Factorio's priority: buildings, then trees/rocks, then ore.
export function mineTargetAt(c) {
  if (!c) return null;
  const k = key(c.x, c.y, c.z), e = world.ents.get(k);
  if (e) return { kind: 'ent', k, c, time: e.items ? .15 : e.kind === 'inserter' || e.kind === 'pole' ? .2 : .4, reach: PLAYER.reach, name: ENTITIES[e.type].name };
  if (world.frames.has(k)) return { kind: 'frame', k, c, time: .3, reach: PLAYER.reach, name: 'Hollow frame' };
  if (c.y === 0) { const f = world.feats.get(k); if (f) return { kind: 'feat', k, c, time: FEATURES[f.type].time, reach: PLAYER.reach, name: FEATURES[f.type].name }; }
  const o = world.ores.get(k);
  if (o) return { kind: 'ore', k, c, time: c.y < 0 ? 1.4 : 1, reach: PLAYER.mineReach + (c.y < 0 ? 1 : 0), name: ITEMS[o.type].name, ore: o.type };
  return null;
}
function mineTick(dt) {
  const p = actor, t = mineTargetAt(p.mineCell);
  if (!t) { p.mining = null; return; }
  if (!p.mining || p.mining.k !== t.k) p.mining = { k: t.k, prog: 0, name: t.name, kind: t.kind === 'feat' ? world.feats.get(t.k).type : t.kind };
  const m = p.mining;
  if (distTo(t.c.x, t.c.z) > t.reach) { m.blocked = 'out of reach'; return; }
  if (t.kind === 'ore' && invRoom(t.ore) < 1) { m.blocked = 'inventory full'; return; }
  m.blocked = null;
  m.prog += dt / t.time;
  if (m.prog < 1) return;
  m.prog = 0;
  const { x, y, z } = t.c;
  if (t.kind === 'ore') { const it = depleteOre(x, y, z); invGive(it); bump('mined', it); notify('mined', 'ore'); notify('float', `+1 ${ITEMS[it].name}`, x + .5, y + .6, z + .5); }
  else if (t.kind === 'feat') {
    const f = world.feats.get(t.k); world.feats.delete(t.k);
    for (const [it, n] of Object.entries(FEATURES[f.type].gives)) { invGive(it, n); bump('mined', it, n); }
    notify('float', Object.entries(FEATURES[f.type].gives).map(([it, n]) => `+${n} ${ITEMS[it].name}`).join('  '), x + .5, .9, z + .5);
    bus.emit('feat', x, z); notify('mined', f.type);
  } else {
    const r = removeAt(x, y, z);
    if (r && r !== 'removed') notify('toast', r);
  }
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
// Z: drop one of the held item at the cursor, onto a belt if there is one.
export function dropAt(c, it) {
  if (!it || !invGet(it) || !c) return false;
  if (distTo(c.x, c.z) > PLAYER.reach) { notify('toast', 'out of reach'); return false; }
  const b = world.ents.get(key(c.x, c.y, c.z));
  if (isBeltLike(b)) { if (!dropOnBelt(b, it)) return false; }
  else if (c.y === 0) world.ground.push({ type: it, x: c.x + .3 + Math.random() * .4, z: c.z + .3 + Math.random() * .4 });
  else return false;
  invAdd(it, -1); return true;
}
// Ctrl+click: put the held stack into a machine, or empty its outputs into the inventory.
export function fastTransfer(e, sel) {
  if (!e || e.kind === 'frame') return 0;
  let n = 0;
  if (sel && invGet(sel)) {
    while (invGet(sel) > 0 && canAccept(e, sel, true) && n < 500) { insert(e, sel); invAdd(sel, -1); n++; }
    return n;
  }
  const grab = (obj, it) => { const k = Math.min(obj[it], invRoom(it)); if (k > 0) { invAdd(it, k); obj[it] -= k; n += k; if (!obj[it]) delete obj[it]; } };
  if (e.store) for (const [it, have] of e.store.counts()) { const k = Math.min(have, invRoom(it)); if (k > 0) { e.store.remove(it, k); invAdd(it, k); n += k; } }
  if (e.out) for (const it of Object.keys(e.out)) grab(e.out, it);
  if (e.buffer && invRoom(e.buffer) > 0) { invAdd(e.buffer); e.buffer = null; n++; }
  return n;
}

// ---------------------------------------------------------------- main tick
let volTimer = 0;
export function simulate(dt, input = { mx: 0, mz: 0 }) {
  S.T += dt;
  if (world.beltDirty) rebuildBelts();
  if (world.powerDirty !== false) rebuildPower();
  for (const n of nets) { n.gens = []; n.solar = 0; }
  for (const e of world.ents.values()) {
    if (!e.net) continue;
    if (e.kind === 'generator') e.net.gens.push(e); else if (e.kind === 'solar') e.net.solar++;
  }
  for (const n of nets) {
    n.capacity = n.solar * ENTITIES.solar.out + n.gens.filter(g => g.burn > 0 || g.fuel > 0).length * ENTITIES.generator.out;
    n.sat = n.demand > 0 ? Math.min(1, n.capacity / n.demand) : (n.capacity > 0 ? 1 : 0);
  }
  for (const b of world.beltOrder) beltTick(b, dt);
  for (const e of world.ents.values()) if (!e.items) tickEntity(e, dt);
  powerTick(dt);
  for (const p of S.players.values()) {
    setActor(p);
    if (p.local) playerTick(dt, input);
    else if (!isClient()) { mineTick(dt); pickupTick(dt); }
    if (!isClient()) craftQueueTick(dt);
  }
  setActor(S.player);
  if ((volTimer += dt) > .5) { volTimer = 0; computeVolume(); }
}
export function powerSummary() {
  let produced = 0, capacity = 0, demand = 0;
  for (const n of nets) { produced += n.produced; capacity += n.capacity; demand += n.demand; }
  return { produced, capacity, demand, sat: demand > 0 ? Math.min(1, capacity / demand) : 1, count: nets.length };
}

// ---------------------------------------------------------------- building
const FAST_REPLACE = new Set(['belt', 'inserter']);
export function canPlace(type, x, y, z, dir = S.dir, dy = S.dy, opts = {}) {
  if (x < 0 || z < 0 || x >= GRID || z >= GRID) return 'out of bounds';
  if (invGet(type) < 1) return `no ${ENTITIES[type].name} in inventory`;
  if (opts.reach && distTo(x, z) > PLAYER.reach) return 'out of reach';
  const [lo, hi] = layerRange();
  if (y < lo || y > hi) return layerLockReason(y);
  if (y > 0 && !world.frames.has(key(x, y - 1, z))) return 'nothing to stand on: put a hollow frame below';
  const k = key(x, y, z), def = ENTITIES[type];
  if (y === 0 && world.feats.has(k)) return `a ${FEATURES[world.feats.get(k).type].name.toLowerCase()} is in the way: hold right-click to mine it`;
  if (type === 'frame') return world.frames.has(k) ? 'occupied' : y >= LAYER_MAX ? 'too high' : null;
  const ex = world.ents.get(k);
  if (ex) {
    if (FAST_REPLACE.has(def.kind) && ex.kind === def.kind && (ex.type !== type || ex.dir !== dir || (def.kind === 'inserter' && ex.dy !== dy))) return null;
    return 'occupied';
  }
  if (def.kind === 'drill' && !world.ores.has(k)) return 'drills need a deposit underneath';
  if (def.kind === 'lift') { const ty = y + (dy || 1); if (ty < lo || ty > hi) return 'the lift would lead to a locked layer'; }
  if (y === 0 && opts.reach && !BELTISH.has(def.kind) && def.kind !== 'pole' && playerBlocks(x, z)) return 'you are standing there';
  return null;
}
const BELTISH = new Set(['belt', 'underground', 'splitter', 'lift']);
export function place(type, x, y, z, dir = S.dir, dy = S.dy, free = false) {
  if (!free) { const err = canPlace(type, x, y, z, dir, dy); if (err) return err; invAdd(type, -1); }
  const k = key(x, y, z);
  if (type === 'frame') {
    const f = { id: nextId++, type: 'frame', kind: 'frame', x, y, z, dir: 0 };
    world.frames.set(k, f); bus.emit('placed', f); return f;
  }
  const ent = ENTITIES[type];
  const old = world.ents.get(k);
  const e = createEntity(type, x, y, z, dir, ent.kind === 'lift' ? (dy || 1) : ent.kind === 'inserter' ? dy : 0);
  if (old) {   // fast replace keeps what was on it
    if (old.items && e.items) e.items = old.items;
    if (old.held) e.held = old.held;
    if (old.type !== type) invGive(old.type);
    if (old.fuel && e.fuel !== undefined) { e.fuel = old.fuel; e.fuelType = old.fuelType; e.burn = old.burn; }
    else if (old.fuel) invGive(old.fuelType, old.fuel);
    world.ents.delete(k); bus.emit('removed', old);
  }
  if (e.kind === 'underground') {
    const [dx, dz] = DIRS[dir];
    for (let i = 1; i < ENTITIES.underground.range; i++) {
      const u = world.ents.get(key(x - dx * i, y, z - dz * i));
      if (u && u.kind === 'underground' && u.dir === dir) { if (u.role === 'in' && !u.pair) { e.role = 'out'; e.pair = u; u.pair = e; } break; }
    }
  }
  world.ents.set(k, e);
  if (e.items) world.beltDirty = true;
  world.powerDirty = true;
  bus.emit('placed', e);
  return e;
}
export function refundContents(e) {
  const add = o => { for (const [k, v] of Object.entries(o || {})) if (v > 0) invGive(k, v); };
  if (e.items) e.items.forEach(it => invGive(it.type));
  if (e.store) for (const [k, v] of e.store.counts()) invGive(k, v);
  add(e.inp); add(e.out);
  if (e.fuel) invGive(e.fuelType, e.fuel);
  if (e.held) invGive(e.held);
  if (e.buffer) invGive(e.buffer);
  if (e.crafting && RECIPE[e.recipe]) add(RECIPE[e.recipe].in);
  if (e.charging) invGive('resonance_pack');
}
export function removeAt(x, y, z) {
  const k = key(x, y, z), e = world.ents.get(k);
  if (e) {
    world.ents.delete(k);
    refundContents(e); invGive(e.type);
    if (e.pair) { e.pair.pair = null; }
    if (e.items) world.beltDirty = true;
    world.powerDirty = true;
    bus.emit('removed', e); return 'removed';
  }
  const f = world.frames.get(k);
  if (f) {
    if (world.ents.has(key(x, y + 1, z)) || world.frames.has(key(x, y + 1, z))) return 'something rests on this frame';
    world.frames.delete(k); invGive('frame'); bus.emit('removed', f); return 'removed';
  }
  return null;
}
export function rotateEntity(e, by = 1) {
  if (!e || e.kind === 'frame') return;
  e.dir = (e.dir + by + 4) % 4;
  if (e.kind === 'underground' && e.pair) { e.pair.pair = null; e.pair = null; }
  if (e.items) world.beltDirty = true;
  bus.emit('remesh', e);
}
export function setRecipe(e, rid) {
  if (e.kind !== 'assembler' || e.recipe === rid) return;
  refundContents({ inp: e.inp, out: e.out, crafting: e.crafting, recipe: e.recipe });
  e.inp = {}; e.out = {}; e.crafting = false; e.prog = 0; e.recipe = rid;
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
    case 'takebuf': if (e.buffer) { invGive(e.buffer); e.buffer = null; } break;
    case 'takefuel': if (e.fuel) { invGive(e.fuelType, e.fuel); e.fuel = 0; e.fuelType = null; } break;
    case 'takebelt': if (e.items) { e.items.forEach(i => invGive(i.type)); e.items.length = 0; } break;
    case 'put': { let n = 0; while (invGet(arg) > 0 && canAccept(e, arg, true) && n < 500) { insert(e, arg); invAdd(arg, -1); n++; } if (!n) notify('toast', 'it will not take that'); break; }
    case 'recipe': setRecipe(e, arg); break;
    case 'filter': e.filter = e.filter === arg ? null : arg; break;
    case 'pitch': e.dy = e.dy === 0 ? 1 : e.dy === 1 ? -1 : 0; bus.emit('remesh', e); break;
    case 'rotate': rotateEntity(e); break;
  }
}

// ---------------------------------------------------------------- slots: drag and drop between inventories
// Machines expose typed slots like Factorio's: fuel, input, result, one per ingredient or science pack.
// A slot reference is { p: index } for the acting engineer's inventory, or { e: [x, y, z], s: slotId } for a machine.
const firstKey = o => Object.keys(o || {}).find(k => o[k] > 0) || null;
const PACKS = ['red_pack', 'green_pack', 'blue_pack', 'resonance_pack'];
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
      for (const k of Object.keys(r.in)) out.push({ id: 'in:' + k, group: 'Ingredients', it: e.inp[k] ? k : null, n: e.inp[k] || 0, hint: k });
      for (const k of Object.keys(r.out)) out.push({ id: 'res:' + k, group: 'Result', it: e.out[k] ? k : null, n: e.out[k] || 0, hint: k });
      break;
    }
    case 'lab': for (const k of PACKS) out.push({ id: 'in:' + k, group: 'Science packs', it: e.inp[k] ? k : null, n: e.inp[k] || 0, hint: k }); break;
    case 'transmitter': out.push({ id: 'in:resonance_pack', group: 'Resonance packs', it: e.inp.resonance_pack ? 'resonance_pack' : null, n: e.inp.resonance_pack || 0, hint: 'resonance_pack' }); break;
    case 'drill': out.push({ id: 'buf', group: 'Output', it: e.buffer, n: e.buffer ? 1 : 0 }); break;
    case 'chest': e.store.slots.forEach((s, i) => out.push({ id: 'c:' + i, group: 'Storage', it: s?.it || null, n: s?.n || 0 })); break;
  }
  return out;
}
function entSlotAccept(e, id, it) {
  if (!it) return 0;
  const st = stackOf(it);
  if (id === 'fuel') return ITEMS[it]?.fuel && (!e.fuel || e.fuelType === it) ? st - e.fuel : 0;
  if (id === 'src') {
    const r = smeltRecipe(it), cur = firstKey(e.inp);
    if (!r || (cur && cur !== it) || (e.crafting && e.recipe !== r.id)) return 0;
    return st - (e.inp[it] || 0);
  }
  if (id.startsWith('in:')) {
    const k = id.slice(3);
    if (k !== it || (e.kind === 'assembler' && !RECIPE[e.recipe]?.in[k])) return 0;
    return st - (e.inp[k] || 0);
  }
  if (id.startsWith('c:')) return e.store.slotAccept(+id.slice(2), it);
  return 0;   // results and drill output only come out
}
function entSlotPut(e, id, it, n) {
  const k = Math.min(n, entSlotAccept(e, id, it));
  if (k <= 0) return 0;
  if (id === 'fuel') { e.fuelType = it; e.fuel += k; }
  else if (id === 'src') { e.recipe = smeltRecipe(it).id; e.inp[it] = (e.inp[it] || 0) + k; }
  else if (id.startsWith('in:')) e.inp[it] = (e.inp[it] || 0) + k;
  else if (id.startsWith('c:')) e.store.slotPut(+id.slice(2), it, k);
  return k;
}
function entSlotTake(e, id, n) {
  if (id === 'fuel') { const it = e.fuelType, k = Math.min(n, e.fuel); e.fuel -= k; if (!e.fuel) e.fuelType = null; return [it, k]; }
  if (id === 'buf') { const it = e.buffer; if (!it) return [null, 0]; e.buffer = null; return [it, 1]; }
  if (id.startsWith('c:')) { const i = +id.slice(2), it = e.store.slots[i]?.it; return [it, e.store.slotTake(i, n)]; }
  const obj = id.startsWith('res:') ? e.out : e.inp, k2 = id === 'src' ? firstKey(e.inp) : id.slice(id.indexOf(':') + 1);
  if (!k2 || !obj[k2]) return [null, 0];
  const k = Math.min(n, obj[k2]); obj[k2] -= k; if (!obj[k2]) delete obj[k2];
  return [k2, k];
}
const refEnt = r => r.e ? world.ents.get(key(r.e[0], r.e[1], r.e[2])) : null;
function refGet(r) {
  if (r.p !== undefined) { const s = actor.inv.slots[r.p]; return { it: s?.it || null, n: s?.n || 0 }; }
  const e = refEnt(r), s = e && entSlots(e).find(x => x.id === r.s);
  return s ? { it: s.it, n: s.n } : { it: null, n: 0 };
}
const refAccept = (r, it) => r.p !== undefined ? actor.inv.slotAccept(r.p, it) : refEnt(r) ? entSlotAccept(refEnt(r), r.s, it) : 0;
const refPut = (r, it, n) => r.p !== undefined ? actor.inv.slotPut(r.p, it, n) : refEnt(r) ? entSlotPut(refEnt(r), r.s, it, n) : 0;
function refTake(r, n) {
  if (r.p !== undefined) { const it = actor.inv.slots[r.p]?.it; return [it, actor.inv.slotTake(r.p, n)]; }
  const e = refEnt(r); return e ? entSlotTake(e, r.s, n) : [null, 0];
}
const isStorage = r => r.p !== undefined || (r.s && r.s.startsWith('c:'));
const nearEnough = r => !r.e || distTo(r.e[0], r.e[2]) <= PLAYER.reach + 1;
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
    const e = entPos ? world.ents.get(key(entPos[0], entPos[1], entPos[2])) : null;
    if (!e) return 0;
    if (e.store) { const left = e.store.add(a.it, a.n); moved = a.n - left; actor.inv.slotTake(from.p, moved); }
    else for (const s of entSlots(e)) {
      const k = Math.min(a.n - moved, entSlotAccept(e, s.id, a.it));
      if (k > 0) { actor.inv.slotTake(from.p, k); entSlotPut(e, s.id, a.it, k); moved += k; }
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
