// Transport: roads, rails, vehicles, depots and the routes that tie them together.
// Roads are a tile layer painted into the ground. Rails are entities that join every rail next to them, and rail
// signals split them into blocks. Vehicles are free objects: cars and tanks are driven by hand, while trucks, boats
// and trains are "units" that follow a path of tiles (road, water or rail) to the stops of a route. One path
// finder, one path follower and one scheduler serve all three ways, so trucks, ships and trains behave alike.
import { ENTITIES, ITEMS, ROADS, FRAMES, VEHICLES, vehicleStats, FLUIDS, FUELS, BARREL_SIZE, PLAYER } from './data.js';
import { S, world, key, DIRS, GRID, bus, Inventory, isWater, invGive, invAdd, invGet, actor, notify, stackOf } from './state.js';
import { draw, room } from './fluids.js';
import { distTo } from './sim.js';

const isClient = () => S.net.role === 'client';
export const tk = (x, z) => x + ',' + z;
const inside = (x, z) => x >= 0 && z >= 0 && x < GRID && z < GRID;
export const angOf = d => Math.atan2(DIRS[d][0], DIRS[d][1]);
export const dirOf = (a, b) => DIRS.findIndex(([dx, dz]) => b[0] - a[0] === dx && b[1] - a[1] === dz);
export const nearestDir = ang => { let best = 0, bd = 9; for (let d = 0; d < 4; d++) { const x = Math.abs(Math.atan2(Math.sin(ang - angOf(d)), Math.cos(ang - angOf(d)))); if (x < bd) { bd = x; best = d; } } return best; };
const int = (v, lo, hi, def) => { v = Math.round(+v); return Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : def; };

// ---------------------------------------------------------------- roads
// A road tile: { s: surface (item id), w: width of its road, i: which tile across it is, a: 0 runs north-south /
// 1 runs east-west, l: lanes, m: centre marking, e: edge lines, c: crossings at junctions }. Paths are just { s }.
export const roadAt = (x, z) => world.roads.get(tk(x, z)) || null;
export const isWalkway = (x, z) => !!ROADS[roadAt(x, z)?.s]?.walk;
export const roadBlocks = (x, z) => { const r = roadAt(x, z); return !!r && !ROADS[r.s]?.walk; };
export function cleanRoadCfg(c = {}) {
  return { w: int(c.w, 1, 4, 2), l: int(c.l, 1, 4, 2), m: ['none', 'dashed', 'solid', 'double'].includes(c.m) ? c.m : 'dashed', sw: !!c.sw, edges: c.edges !== false, cross: c.cross !== false };
}
// The tiles one step of road covers: the carriageway across its width, plus a sidewalk on each side if asked.
export function roadCells(x, z, a, cfg, surf) {
  cfg = cleanRoadCfg(cfg);
  const w = cfg.w, lo = -Math.floor((w - 1) / 2), at = o => a === 0 ? [x + o, z] : [x, z + o], walk = !!ROADS[surf]?.walk, cells = [];
  for (let o = lo; o < lo + w; o++) cells.push({ c: at(o), t: walk ? { s: surf } : { s: surf, w, i: o - lo, a, l: Math.min(cfg.l, w * 2), m: cfg.m, e: cfg.edges, c: cfg.cross } });
  if (cfg.sw && !walk) for (const o of [lo - 1, lo + w]) cells.push({ c: at(o), t: { s: 'path_tile' }, side: true });
  return cells;
}
function roadCellBlocked(x, z) {
  if (!inside(x, z)) return 'out of bounds';
  if (isWater(x, z)) return 'roads can\'t go on water';
  if (world.feats.has(key(x, 0, z))) return 'a tree or rock is in the way: mine it first';
  const e = world.ents.get(key(x, 0, z));
  if (e && !ENTITIES[e.type].onRoad) return `the ${ENTITIES[e.type].name.toLowerCase()} is in the way`;
  return null;
}
const sameTile = (a, b) => JSON.stringify(a) === JSON.stringify(b);
export function placeRoad(op) {
  const surf = ROADS[op.surf] ? op.surf : null;
  if (!surf) return 'that is not a road';
  if (distTo(op.x, op.z) > PLAYER.reach + 2) return 'out of reach';
  const changes = [], need = {};
  for (const { c: [x, z], t, side } of roadCells(op.x, op.z, op.ax ? 1 : 0, op.cfg, surf)) {
    const why = roadCellBlocked(x, z), old = roadAt(x, z);
    if (why) { if (side) continue; return why; }
    if (side && old) continue;   // sidewalks never pave over another road or path
    if (old && sameTile(old, t)) continue;
    need[t.s] = (need[t.s] || 0) + 1;
    changes.push([x, z, t, old]);
  }
  for (const [it, n] of Object.entries(need)) if (invGet(it) < n) return `that needs ${n} ${ITEMS[it].name.toLowerCase()}`;
  if (!changes.length) return null;
  for (const [x, z, t, old] of changes) { if (old) invGive(old.s); invAdd(t.s, -1); world.roads.set(tk(x, z), t); }
  roadsChanged(changes.map(([x, z, t]) => [x, z, t]));
  return null;
}
export function removeRoad(x, z) {
  const r = roadAt(x, z); if (!r) return;
  world.roads.delete(tk(x, z)); invGive(r.s);
  roadsChanged([[x, z, null]]);
}
// Co-op: road changes made on the host arrive as a list of [x, z, tile or null].
export function applyRoads(list) { for (const [x, z, t] of list || []) t ? world.roads.set(tk(x, z), t) : world.roads.delete(tk(x, z)); world.wayVersion = (world.wayVersion || 0) + 1; bus.emit('roads', list); }
function roadsChanged(list) { world.wayVersion = (world.wayVersion || 0) + 1; bus.emit('roads', list); }

// ---------------------------------------------------------------- rails
const railAt = (x, z) => { const e = world.ents.get(key(x, 0, z)); return e?.kind === 'rail' ? e : null; };
// Each rail joins every rail next to it. Signals cut the track between their tile and the one they face, and the
// pieces in between are blocks: a train only enters a block that no other train is in or has claimed.
export function rebuildRails() {
  const rails = [...world.ents.values()].filter(e => e.kind === 'rail');
  for (const e of rails) {
    let c = 0; DIRS.forEach(([dx, dz], d) => { if (railAt(e.x + dx, e.z + dz)) c |= 1 << d; });
    if (c !== e.conn) { e.conn = c; bus.emit('remesh', e); }
  }
  const parent = new Map(rails.map(e => [e, e]));
  const find = e => { while (parent.get(e) !== e) { parent.set(e, parent.get(parent.get(e))); e = parent.get(e); } return e; };
  for (const e of rails) for (let d = 0; d < 4; d++) {
    if (!(e.conn >> d & 1)) continue;
    const n = railAt(e.x + DIRS[d][0], e.z + DIRS[d][1]);
    if (n && !signalBetween(e, n, d)) parent.set(find(e), find(n));
  }
  const ids = new Map();
  for (const e of rails) { const r = find(e); if (!ids.has(r)) ids.set(r, ids.size); e.block = ids.get(r); }
  world.railDirty = false; world.wayVersion = (world.wayVersion || 0) + 1;
}
const signalBetween = (a, b, d) => a.sig === d || b.sig === (d + 2) % 4;
export function placeSignal(x, z, dir) {
  const e = railAt(x, z);
  if (!e) return 'signals go on rails';
  if (distTo(x, z) > PLAYER.reach) return 'out of reach';
  if (!invGet('rail_signal')) return 'no rail signal in inventory';
  if (!(e.conn >> dir & 1)) return 'turn it (R) to face along the track';
  if (e.sig === dir) return null;
  if (e.sig === null || e.sig === undefined) invAdd('rail_signal', -1);
  e.sig = dir; world.railDirty = true; bus.emit('remesh', e);
  return null;
}
// What colour a signal shows: red while the block it leads into holds or has claimed another train.
export const signalRed = e => { const n = railAt(e.x + DIRS[e.sig][0], e.z + DIRS[e.sig][1]); return !!n && !!blockHeld.get(n.block); };

// ---------------------------------------------------------------- the ways vehicles move on
const WAYS = {
  road: (x, z) => roadBlocks(x, z),
  sea: (x, z) => inside(x, z) && isWater(x, z) && !world.ents.get(key(x, 0, z)),
  rail: (x, z) => !!railAt(x, z),
};
export const onWay = (way, x, z) => !!WAYS[way]?.(x, z);
// The tiles next to a depot that vehicles stop on.
export function dockTiles(e) {
  const way = ENTITIES[e.type].way, out = [];
  for (const d of [e.dir, (e.dir + 1) % 4, (e.dir + 3) % 4, (e.dir + 2) % 4]) { const x = e.x + DIRS[d][0], z = e.z + DIRS[d][1]; if (e.y === 0 && onWay(way, x, z)) out.push([x, z]); }
  return out;
}
export const wayNear = (way, x, y, z) => y === 0 && DIRS.some(([dx, dz]) => onWay(way, x + dx, z + dz));
const nearLand = (x, z) => DIRS.some(([dx, dz]) => inside(x + dx, z + dz) && !isWater(x + dx, z + dz));
// Moves from a tile entered heading h: [direction, cost]. Trucks keep right and avoid turning around, trains
// never turn around mid-route, boats keep off the shore.
function steps(way, x, z, h) {
  const out = [];
  if (way === 'rail') {
    const e = railAt(x, z); if (!e) return out;
    for (let d = 0; d < 4; d++) if ((e.conn >> d & 1) && d !== (h + 2) % 4) out.push([d, d === h ? 1 : 1.3]);
    return out;
  }
  for (let d = 0; d < 4; d++) {
    const nx = x + DIRS[d][0], nz = z + DIRS[d][1];
    if (!WAYS[way](nx, nz)) continue;
    let c = 1;
    if (way === 'road') {
      c = 1 / (ROADS[roadAt(nx, nz).s]?.speed || 1);
      const [rx, rz] = DIRS[(d + 1) % 4];
      if (roadBlocks(nx + rx, nz + rz)) c += .6;   // a lane further right exists: keep right
      if (d === (h + 2) % 4) c += 6;
    } else { if (d === (h + 2) % 4) c += 1.5; if (nearLand(nx, nz)) c += .4; }
    out.push([d, c]);
  }
  return out;
}
// A* over (tile, heading). Returns { tiles, cost } from the start tile to the first goal tile reached, or null.
export function findPath(way, sx, sz, sh, goals) {
  if (!goals.size) return null;
  const gl = [...goals].map(k => k.split(',').map(Number));
  const hf = (x, z) => { let m = 1e9; for (const [gx, gz] of gl) m = Math.min(m, Math.abs(gx - x) + Math.abs(gz - z)); return m; };
  const N = GRID * GRID * 4, g = new Float32Array(N).fill(Infinity), prev = new Int32Array(N).fill(-1), heap = [];
  const push = (i, f) => { heap.push([f, i]); let j = heap.length - 1; while (j) { const p = (j - 1) >> 1; if (heap[p][0] <= heap[j][0]) break; [heap[p], heap[j]] = [heap[j], heap[p]]; j = p; } };
  const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let j = 0; for (;;) { const l = 2 * j + 1, r = l + 1; let m = j; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === j) break; [heap[m], heap[j]] = [heap[j], heap[m]]; j = m; } } return top; };
  const s0 = (sz * GRID + sx) * 4 + sh; g[s0] = 0; push(s0, hf(sx, sz));
  while (heap.length) {
    const [f, cur] = pop(), h = cur % 4, cell = (cur - h) / 4, x = cell % GRID, z = Math.floor(cell / GRID);
    if (f - hf(x, z) > g[cur] + 1e-6) continue;
    if (goals.has(tk(x, z))) {
      const tiles = []; for (let i = cur; i >= 0; i = prev[i]) { const c = (i - i % 4) / 4; tiles.unshift([c % GRID, Math.floor(c / GRID)]); }
      return { tiles, cost: g[cur] };
    }
    for (const [d, c] of steps(way, x, z, h)) {
      const nx = x + DIRS[d][0], nz = z + DIRS[d][1]; if (!inside(nx, nz)) continue;
      const ns = (nz * GRID + nx) * 4 + d, ng = g[cur] + c;
      if (ng < g[ns]) { g[ns] = ng; prev[ns] = cur; push(ns, ng + hf(nx, nz)); }
    }
  }
  return null;
}

// ---------------------------------------------------------------- vehicles and units
export const vehicleById = id => world.vehicles.find(v => v.id === id) || null;
export const unitById = id => world.units.find(u => u.id === id) || null;
export const unitOf = v => v?.unit ? unitById(v.unit) : null;
export const driverOf = v => { for (const p of S.players.values()) if (p.veh === v.id) return p; return null; };
const statsCache = {};
export const vstats = type => statsCache[type] ||= vehicleStats(type);
const TURN = { car: 1.9, tank: 1.2, truck: 1.3, boat: .8, locomotive: 0, cargo_wagon: 0 };   // radians a second at speed
const SPACING = 1;   // train cars sit one tile apart
const unitName = way => way === 'rail' ? 'Train' : way === 'road' ? 'Truck' : 'Boat';
function newVehicle(type, x, z, ang) {
  const st = vstats(type);
  const v = { id: world.nextId++, type, isVeh: true, x, z, ang, v: 0, fuel: 0, cargo: st.cargo ? new Inventory(st.cargo) : null, net: null, catch: 0, unit: null };
  world.vehicles.push(v);
  return v;
}
function newUnit(way, cars, path, s, dir0) {
  const n = world.units.filter(u => u.way === way).length + 1;
  const u = { id: world.nextId++, way, name: `${unitName(way)} ${n}`, cars: cars.map(c => c.id), path, s, dir0, v: 0, route: null, auto: false, stop: 0, state: 'idle', msg: 'no route', waitT: 0 };
  for (const c of cars) c.unit = u.id;
  world.units.push(u);
  return u;
}
const vehicleOnTile = (x, z) => world.vehicles.find(v => Math.floor(v.x) === x && Math.floor(v.z) === z);
const solidAt = (x, z) => { const e = world.ents.get(key(x, 0, z)); return !!e && !e.belt && e.kind !== 'rail'; };
export function placeVehicle(type, x, z, dir) {
  const st = vstats(type);
  if (!st) return 'that is not a vehicle';
  if (!inside(x, z)) return 'out of bounds';
  if (invGet(type) < 1) return `no ${ITEMS[type].name} in inventory`;
  if (distTo(x, z) > PLAYER.reach) return 'out of reach';
  if (vehicleOnTile(x, z)) return 'a vehicle is already there';
  if (st.way === 'rail') { const err = placeRailCar(type, x, z, dir); if (err) return err; }
  else if (st.way === 'land') {
    if (isWater(x, z) || solidAt(x, z) || world.feats.has(key(x, 0, z))) return 'there is no room for it here';
    newVehicle(type, x + .5, z + .5, angOf(dir));
  } else {
    if (!onWay(st.way, x, z)) return st.way === 'road' ? 'trucks only drive on roads: put it on one' : 'boats go on open water';
    newUnit(st.way, [newVehicle(type, x + .5, z + .5, angOf(dir))], [[x, z]], .5, dir);
  }
  invAdd(type, -1);
  bus.emit('vehicles');
  return null;
}
// Where each car of a unit stands, front first.
const carTiles = u => u.cars.map((id, j) => { const p = evalPath(u, u.s - j * SPACING); return [Math.floor(p.x), Math.floor(p.z)]; });
const sameT = (a, b) => a[0] === b[0] && a[1] === b[1];
const railLinked = (a, b) => { const d = dirOf(a, b), e = railAt(a[0], a[1]); return d >= 0 && !!e && (e.conn >> d & 1) === 1; };
// Rebuild a stopped unit's path from where its cars stand (front first), so new cars can join or old ones leave.
function settle(u, tiles) {
  const back = tiles.slice().reverse();
  u.path = back; u.s = back.length - .5; u.v = 0;
  if (back.length > 1) u.dir0 = dirOf(back[0], back[1]);
  u.goal = null;
}
function placeRailCar(type, x, z, dir) {
  const e = railAt(x, z);
  if (!e) return 'put it on a rail';
  const t = [x, z];
  for (const u of world.units) {
    if (u.way !== 'rail') continue;
    const tiles = carTiles(u), head = tiles[0], tail = tiles[tiles.length - 1];
    const atTail = railLinked(tail, t), atHead = !atTail && railLinked(head, t);
    if (!atTail && !atHead) continue;
    if (Math.abs(u.v) > .01) return 'stop the train first';
    const v = newVehicle(type, x + .5, z + .5, 0);
    v.unit = u.id;
    if (atTail) { u.cars.push(v.id); tiles.push(t); } else { u.cars.unshift(v.id); tiles.unshift(t); }
    settle(u, tiles); placeCars(u);
    return null;
  }
  const d0 = (e.conn >> dir & 1) ? dir : (e.conn >> ((dir + 2) % 4) & 1) ? (dir + 2) % 4 : [0, 1, 2, 3].find(d => e.conn >> d & 1) ?? dir;
  const v = newVehicle(type, x + .5, z + .5, angOf(d0));
  newUnit('rail', [v], [[x, z]], .5, d0);
  return null;
}
export function removeVehicle(id) {
  const v = vehicleById(id); if (!v) return null;
  if (driverOf(v)) return 'someone is driving it';
  const u = unitOf(v);
  if (u && Math.abs(u.v) > .05) return 'stop it first';
  const tiles = u ? carTiles(u) : null;
  invGive(v.type);
  if (v.cargo) for (const [it, n] of v.cargo.counts()) invGive(it, n);
  if (v.net) invGive('fishing_net');
  if (v.catch) invGive('raw_fish', v.catch);
  world.vehicles.splice(world.vehicles.indexOf(v), 1);
  if (u) {
    const i = u.cars.indexOf(v.id), before = u.cars.slice(0, i), after = u.cars.slice(i + 1);
    if (!before.length && !after.length) world.units.splice(world.units.indexOf(u), 1);
    else {
      if (before.length) { u.cars = before; settle(u, tiles.slice(0, i)); } else { u.cars = after; settle(u, tiles.slice(i + 1)); }
      if (before.length && after.length) {   // the train splits in two
        const cars = after.map(vehicleById), w = newUnit('rail', cars, [], 0, u.dir0);
        settle(w, tiles.slice(i + 1)); placeCars(w);
      }
      placeCars(u);
    }
  }
  bus.emit('vehicles');
  return null;
}
// What right-click mining does to a vehicle: pick it up.
export const vehicleTarget = (v, c) => ({ kind: 'veh', k: 'veh' + v.id, veh: v.id, c: { x: Math.floor(v.x), y: 0, z: Math.floor(v.z) }, time: .5, reach: PLAYER.reach + 1, name: ITEMS[v.type].name });

// Get in or out (B). Out puts you on the nearest dry, free tile.
export function board() {
  const p = actor;
  if (p.veh) {
    const v = vehicleById(p.veh);
    if (v) {
      let best = null, bd = 9;
      for (let dx = -3; dx <= 3; dx++) for (let dz = -3; dz <= 3; dz++) {
        const x = Math.floor(v.x) + dx, z = Math.floor(v.z) + dz, d = Math.hypot(x + .5 - v.x, z + .5 - v.z);
        if (inside(x, z) && !isWater(x, z) && !solidAt(x, z) && !world.feats.has(key(x, 0, z)) && d > .7 && d < bd) { bd = d; best = [x + .5, z + .5]; }
      }
      if (!best) { notify('toast', 'no dry land next to it: steer to the shore'); return; }
      p.x = best[0]; p.z = best[1];
      const u = unitOf(v); if (u) { u.path = null; u.manual = false; }
    }
    p.veh = null; p.drive = null; notify('toast', 'out of the vehicle');
    return;
  }
  let best = null, bd = 2.6;
  for (const v of world.vehicles) { const d = Math.hypot(v.x - p.x, v.z - p.z); if (d < bd && !driverOf(v) && FRAMES[vstats(v.type).frame].way !== undefined) { bd = d; best = v; } }
  if (!best) { notify('toast', 'no vehicle within reach: stand next to one'); return; }
  if (vstats(best.type).frame === 'cargo_wagon') { notify('toast', 'wagons have no seat: get in the locomotive'); return; }
  p.veh = best.id; notify('toast', `driving the ${ITEMS[best.type].name.toLowerCase()} · WASD drive · B gets out`);
}

// ---------------------------------------------------------------- following a path
// A unit's path is a list of tiles; its position s counts tiles from the path's first tile (s = k + .5 is the middle
// of tile k). In each tile a vehicle runs from the edge it came in by to the edge it leaves by: straight, a quarter
// curve, or a turn on the spot. Train cars sit SPACING behind each other on the same path.
export function evalPath(u, s) {
  const P = u.path, n = P?.length || 0;
  if (!n) { const v = vehicleById(u.cars[0]); return { x: v?.x ?? 0, z: v?.z ?? 0, ang: v?.ang ?? 0 }; }
  const din0 = u.dir0 ?? 0;
  if (s < 0) { const [x, z] = P[0], [dx, dz] = DIRS[din0]; return { x: x + .5 + dx * (s - .5), z: z + .5 + dz * (s - .5), ang: angOf(din0) }; }
  const k = Math.min(n - 1, Math.floor(s)), t = s - k, [x, z] = P[k];
  const din = k > 0 ? dirOf(P[k - 1], P[k]) : din0, dout = k < n - 1 ? dirOf(P[k], P[k + 1]) : din;
  if (din < 0 || dout < 0) return { x: x + .5, z: z + .5, ang: angOf(Math.max(0, din)) };
  const ax = x + .5 - DIRS[din][0] * .5, az = z + .5 - DIRS[din][1] * .5, cx = x + .5, cz = z + .5;
  if (k === n - 1 && t > .5) return { x: cx + DIRS[din][0] * (t - .5), z: cz + DIRS[din][1] * (t - .5), ang: angOf(din) };
  const bx = x + .5 + DIRS[dout][0] * .5, bz = z + .5 + DIRS[dout][1] * .5;
  if (din === dout) return { x: ax + (bx - ax) * t, z: az + (bz - az) * t, ang: angOf(din) };
  if (dout === (din + 2) % 4) {   // turning around on the spot
    const k2 = Math.min(1, Math.max(0, (t - .4) / .2)), a0 = angOf(din);
    return { x: t < .5 ? ax + (cx - ax) * t * 2 : cx + (bx - cx) * (t - .5) * 2, z: t < .5 ? az + (cz - az) * t * 2 : cz + (bz - cz) * (t - .5) * 2, ang: a0 + Math.PI * k2 };
  }
  const q = 1 - t, px = q * q * ax + 2 * q * t * cx + t * t * bx, pz = q * q * az + 2 * q * t * cz + t * t * bz;
  const tx = 2 * q * (cx - ax) + 2 * t * (bx - cx), tz = 2 * q * (cz - az) + 2 * t * (bz - cz);
  return { x: px, z: pz, ang: Math.atan2(tx, tz) };
}
export function placeCars(u) {
  u.cars.forEach((id, j) => {
    const v = vehicleById(id); if (!v) return;
    const p = evalPath(u, u.s - j * SPACING);
    let { x, z } = p;
    if (u.way === 'road' && roadAt(Math.floor(x), Math.floor(z))?.w === 1) { x += -Math.cos(p.ang) * .2; z += Math.sin(p.ang) * .2; }   // keep right on a one-tile road
    v.x = x; v.z = z; v.ang = p.ang; v.v = u.v; v.tile = tk(Math.floor(p.x), Math.floor(p.z));
  });
}
// Who stands where this tick (heading too), and which rail blocks are taken.
let occ = new Map();
const blockHeld = new Map();
function buildOccupancy() {
  occ = new Map(); blockHeld.clear();
  for (const u of world.units) u.cars.forEach((id, j) => {
    const v = vehicleById(id); if (!v) return;
    const x = Math.floor(v.x), z = Math.floor(v.z), k = tk(x, z);
    (occ.get(k) || occ.set(k, []).get(k)).push({ u, h: nearestDir(v.ang) });
    if (u.way === 'rail') { const r = railAt(x, z); if (r && !blockHeld.has(r.block)) blockHeld.set(r.block, u); }
  });
}
// How far along its path a unit may go before something stops it: another vehicle, or a rail block that is taken.
function clearUntil(u) {
  const P = u.path, k0 = Math.floor(u.s);
  u.blockedBy = null;
  for (let k = k0 + 1; k < Math.min(P.length, k0 + 8); k++) {
    const [x, z] = P[k], d = dirOf(P[k - 1], P[k]);
    for (const o of occ.get(tk(x, z)) || []) {
      if (o.u === u) continue;
      if (u.way !== 'rail' && (o.h === (d + 2) % 4 || u.stuckT > 8)) continue;   // oncoming traffic passes; gridlock gives way after a while
      u.blockedBy = 'vehicle'; return k - .02;
    }
    if (u.way === 'rail') {
      const a = railAt(...P[k - 1]), b = railAt(x, z);
      if (a && b && a.block !== b.block) {
        const held = blockHeld.get(b.block);
        if (held && held !== u) { u.blockedBy = 'signal'; return k - .02; }
        if (k - u.s < 4) blockHeld.set(b.block, u);   // claim the block ahead so nobody else enters it
        else break;
      }
    }
  }
  return Infinity;
}
function unitStats(u, cars) {
  if (cars.length === 1 && u.way !== 'rail') return vstats(cars[0].type);
  let power = 0, mass = 0, vmax = 99, burn = 0;
  for (const c of cars) { const st = vstats(c.type); mass += st.mass; vmax = Math.min(vmax, FRAMES[st.frame].vmax); if (st.power && c.fuel > 0) { power += st.power; burn += st.burn; } }
  return { top: power ? Math.min(vmax, 4 * 1.8 * Math.sqrt(power / (mass * 100))) : 0, accel: power / (mass * 70) * 1.8, power, mass, burn, way: 'rail' };
}
const hasFuel = cars => cars.some(c => vstats(c.type).power && c.fuel > 0);
function burnFuel(cars, frac, dt) { for (const c of cars) { const st = vstats(c.type); if (st.power && c.fuel > 0) c.fuel = Math.max(0, c.fuel - st.burn * frac * dt); } }
const surfaceSpeed = (u, cars) => { if (u.way !== 'road') return 1; const v = cars[0], r = roadAt(Math.floor(v.x), Math.floor(v.z)); return r ? ROADS[r.s]?.speed ?? 1 : .5; };
function follow(u, cars, st, dt, hold) {
  if (!u.path) { u.v = 0; return; }
  const brake = Math.max(2.5, st.accel * 2.5), end = hold ? u.s + u.v * u.v / (2 * brake) : u.path.length - .5;
  const limit = Math.min(end, clearUntil(u)), fuel = hasFuel(cars);
  const vmax = Math.min(st.top * surfaceSpeed(u, cars), Math.sqrt(2 * brake * Math.max(0, limit - u.s)));
  const before = u.v;
  if (u.v < vmax) u.v = fuel ? Math.min(vmax, u.v + st.accel * dt) : Math.max(0, u.v - .4 * dt);
  else u.v = Math.max(vmax, u.v - brake * dt);
  if (u.v > .02) burnFuel(cars, u.v > before + 1e-4 ? 1 : .3, dt);
  u.s = Math.max(u.s, Math.min(limit, u.s + u.v * dt));
  u.stuckT = u.v < .05 && limit < end - .1 ? (u.stuckT || 0) + dt : 0;
}

// ---------------------------------------------------------------- driving by hand
function canBeAt(way, x, z, st) {
  const tx = Math.floor(x), tz = Math.floor(z);
  if (!inside(tx, tz)) return false;
  if (way === 'road') return roadBlocks(tx, tz);
  if (way === 'sea') return WAYS.sea(tx, tz);
  if (isWater(tx, tz) || solidAt(tx, tz)) return false;
  const f = world.feats.get(key(tx, 0, tz));
  if (f && f.type === 'tree' && st.frame === 'tank' && !isClient()) { world.feats.delete(key(tx, 0, tz)); bus.emit('feat', tx, tz); return true; }   // tanks flatten trees
  return !f;
}
function freeDrive(v, st, drive, dt, way) {
  const t = drive?.t || 0, s = drive?.s || 0, fuel = v.fuel > 0;
  if (t > 0 && fuel) v.v = v.v < 0 ? Math.min(0, v.v + st.accel * 3 * dt) : Math.min(st.top, v.v + st.accel * dt);
  else if (t < 0) { if (v.v > .05) v.v = Math.max(0, v.v - st.accel * 3 * dt); else if (fuel) v.v = Math.max(-st.top * .35, v.v - st.accel * .7 * dt); }
  else { v.v *= Math.exp(-dt * (way === 'sea' ? .6 : 1.4)); if (Math.abs(v.v) < .03) v.v = 0; }
  if (t && fuel) v.fuel = Math.max(0, v.fuel - st.burn * Math.abs(t) * dt);
  v.ang -= s * TURN[st.frame] * dt * Math.max(-1, Math.min(1, v.v / 2.5));
  const fx = Math.sin(v.ang), fz = Math.cos(v.ang), nx = v.x + fx * v.v * dt, nz = v.z + fz * v.v * dt, L = FRAMES[st.frame].len / 2 * (v.v < 0 ? -1 : 1);
  if (canBeAt(way, nx + fx * L, nz + fz * L, st) && canBeAt(way, nx, nz, st)) { v.x = nx; v.z = nz; }
  else v.v *= -.2;
  v.tile = tk(Math.floor(v.x), Math.floor(v.z));
}
// Back onto the tile grid after being driven by hand.
function snapUnit(u, v) {
  const fx = Math.floor(v.x), fz = Math.floor(v.z);
  let tx = fx, tz = fz;
  if (!onWay(u.way, fx, fz)) {
    let bd = 9;
    for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) { const d = Math.hypot(dx, dz); if (d < bd && onWay(u.way, fx + dx, fz + dz)) { bd = d; tx = fx + dx; tz = fz + dz; } }
  }
  u.path = [[tx, tz]]; u.s = .5; u.v = 0; u.dir0 = nearestDir(v.ang); u.goal = null;
}
// Driving a locomotive: W goes, S brakes (and from a standstill reverses the train), A / D pick the branch at junctions.
function manualTrain(u, cars, st, drive, dt) {
  let t = drive?.t || 0;
  const s = drive?.s || 0;
  // from a standstill, S turns the train round and drives it the other way (the last car leads); W turns it back
  if (u.v <= .02 && t !== 0 && (t < 0) !== !!u.rev) { flipUnit(u); u.rev = t < 0; }
  if (u.rev) t = -t;
  while (u.path.length - u.s < 4) {
    const P = u.path, last = P[P.length - 1], h = P.length > 1 ? dirOf(P[P.length - 2], last) : u.dir0, e = railAt(...last);
    const order = s > 0 ? [(h + 1) % 4, h, (h + 3) % 4] : s < 0 ? [(h + 3) % 4, h, (h + 1) % 4] : [h, (h + 1) % 4, (h + 3) % 4];
    const d = e && order.find(d => e.conn >> d & 1);
    if (d === undefined || d === null || !e) break;
    P.push([last[0] + DIRS[d][0], last[1] + DIRS[d][1]]);
  }
  const brake = Math.max(2.5, st.accel * 2.5), limit = Math.min(u.path.length - .5, clearUntil(u)), fuel = hasFuel(cars);
  const cap = Math.sqrt(2 * brake * Math.max(0, limit - u.s));
  if (t > 0 && fuel) u.v = Math.min(st.top, cap, u.v + st.accel * dt);
  else if (t < 0) u.v = Math.max(0, u.v - brake * dt);
  else u.v = Math.max(0, Math.min(cap, u.v - .3 * dt));
  if (t > 0 && fuel) burnFuel(cars, 1, dt);
  u.s = Math.min(limit, u.s + u.v * dt);
  trimHistory(u);
}
// Turn a train around: the last car leads.
function flipUnit(u) {
  const L = u.path.length, n = u.cars.length, last = L > 1 ? dirOf(u.path[L - 2], u.path[L - 1]) : u.dir0;
  const tiles = carTiles(u);
  u.path = u.path.slice().reverse(); u.s = L - u.s + (n - 1) * SPACING; u.dir0 = (last + 2) % 4;
  u.cars.reverse();
  if (u.s - (n - 1) * SPACING < 0 || u.s > u.path.length) settle(u, tiles.reverse());
  u.goal = null;
}
// Drop path tiles well behind the last car, so paths don't grow forever.
function trimHistory(u) {
  const keep = Math.floor(u.s - (u.cars.length - 1) * SPACING) - 2;
  if (keep > 0) { u.dir0 = dirOf(u.path[keep - 1], u.path[keep]); u.path = u.path.slice(keep); u.s -= keep; }
}

// ---------------------------------------------------------------- routes and depots
// A route: { id, name, way, loop, stops: [{ depot: name or null, at: [x, z] or null, act, items, conds }] }.
// act is what happens there: 'load', 'unload', 'both' or 'none' (drive through). conds say when to leave:
// { t: 'full' | 'empty' | 'time' | 'idle' | 'cargo' | 'depot' | 'free', n, it, or }. Conditions joined by `or` start
// a new group; the unit leaves when every condition of any one group holds.
export const routeById = id => world.routes.find(r => r.id === id) || null;
export const depotsNamed = (name, way) => [...world.ents.values()].filter(e => e.kind === 'depot' && ENTITIES[e.type].way === way && e.dname === name);
const headingOf = u => { const P = u.path, k = Math.min(P.length - 1, Math.floor(u.s)); return k > 0 ? dirOf(P[k - 1], P[k]) : u.dir0; };
const headTile = u => u.path[Math.min(u.path.length - 1, Math.max(0, Math.floor(u.s)))];
const carsHeading = (u, depot) => world.units.filter(o => o !== u && o.target === depot).length;
// Plan the way to the current stop. Depots by name: highest priority first, then nearest, skipping full ones.
function plan(u, route) {
  const stop = route.stops[u.stop]; u.goal = null; u.target = null;
  if (!stop) return;
  const tryGoals = goals => {
    const h = headingOf(u), [hx, hz] = headTile(u);
    let r = findPath(u.way, hx, hz, h, goals), flip = false;
    if (!r && u.way === 'rail' && u.v < .05) {   // a train can set off the other way: its last car leads
      const tiles = carTiles(u), tail = tiles[tiles.length - 1], th = u.cars.length > 1 ? dirOf(tiles[tiles.length - 2], tail) : (h + 2) % 4;
      r = findPath('rail', tail[0], tail[1], th, goals); flip = !!r;
    }
    return r && { ...r, flip };
  };
  let best = null;
  if (stop.depot) {
    const all = depotsNamed(stop.depot, u.way);
    if (!all.length) { wait(u, `no ${u.way === 'rail' ? 'station' : u.way === 'road' ? 'depot' : 'port'} called "${stop.depot}"`); return; }
    const open = all.filter(d => !d.vlimit || carsHeading(u, key(d.x, d.y, d.z)) < d.vlimit);
    if (!open.length) { wait(u, `every "${stop.depot}" is full of vehicles`); return; }
    for (const d of open) {
      const r = tryGoals(new Set(dockTiles(d).map(t => tk(...t))));
      if (r && (!best || d.prio > best.d.prio || (d.prio === best.d.prio && r.cost < best.cost))) best = { ...r, d };
    }
  } else if (stop.at) best = tryGoals(new Set([tk(stop.at[0], stop.at[1])]));
  if (!best) { wait(u, `no way to ${stopName(stop)} from here`); return; }
  if (best.flip) flipUnit(u);
  const k = Math.min(u.path.length - 1, Math.floor(u.s)), t = u.s - k, back = Math.max(0, k - u.cars.length - 1);
  const keep = u.path.slice(back, k + 1), dir0 = back > 0 ? dirOf(u.path[back - 1], u.path[back]) : u.dir0;
  u.path = keep.concat(best.tiles.slice(1)); u.s = keep.length - 1 + t; u.dir0 = dir0;
  u.goal = u.stop; u.target = best.d ? key(best.d.x, best.d.y, best.d.z) : null; u.state = 'travel'; u.msg = `to ${stopName(stop)}`;
  u.wayV = world.wayVersion;
}
function wait(u, msg) { u.state = 'wait'; u.msg = msg; u.retry = S.T + 2; }
export const stopName = st => st.depot ? st.depot : st.at ? `waypoint ${st.at[0]}, ${st.at[1]}` : '?';
function nextStop(u, route) {
  u.stop++;
  if (u.stop >= route.stops.length) { if (route.loop) u.stop = 0; else { u.auto = false; u.stop = 0; u.state = 'idle'; u.msg = 'route finished'; return; } }
  u.goal = null; u.dock = null; u.state = 'travel';
}
// Is the path still drivable? (Someone may have mined a rail or road on it.)
function pathValid(u) {
  if (u.wayV === world.wayVersion) return true;
  u.wayV = world.wayVersion;
  const k = Math.floor(u.s);
  for (let i = Math.max(0, k); i < u.path.length; i++) if (!onWay(u.way, ...u.path[i])) return false;
  return true;
}
function schedule(u, cars, dt) {
  const route = routeById(u.route);
  if (!u.auto || !route || !route.stops.length) { if (u.state !== 'idle' || !u.msg) { u.state = 'idle'; u.msg = !route ? 'no route' : !route.stops.length ? 'route has no stops' : 'stopped'; } return true; }
  if (u.stop >= route.stops.length) u.stop = 0;
  const stop = route.stops[u.stop];
  if (u.state === 'wait' && S.T < (u.retry || 0)) return true;
  if (u.state === 'dock') { dockTick(u, cars, route, stop, dt); return true; }
  if (u.goal !== u.stop || !pathValid(u)) { plan(u, route); if (u.state === 'wait') return true; }
  if (u.s >= u.path.length - .5 - 1e-3 && u.v < .05) {   // arrived
    if (u.target && stop.act !== 'none') { u.state = 'dock'; u.dock = u.target; u.waitT = 0; u.lastXfer = S.T; u.budget = 0; u.msg = `at ${stopName(stop)}`; }
    else nextStop(u, route);
  }
  return false;
}
// Docked: refuel, move cargo, and leave when the stop's conditions hold.
function dockTick(u, cars, route, stop, dt) {
  const d = world.ents.get(u.dock);
  if (!d || d.kind !== 'depot') { nextStop(u, route); return; }
  u.waitT += dt;
  // refuel from the depot's tank
  const n = d.fb?.[0];
  for (const c of cars) { const st = vstats(c.type); if (st.fuel === d.fuelFluid && c.fuel < st.tank && n) c.fuel += draw(n, Math.min(st.tank - c.fuel, 400 * dt)); }
  // cargo, at 20 items a second per wagon
  u.budget = Math.min(20, (u.budget || 0) + 20 * dt * Math.max(1, cars.filter(c => c.cargo).length));
  const allow = it => !stop.items?.length || stop.items.includes(it);
  let moved = 0;
  if (stop.act === 'unload' || stop.act === 'both') for (const c of cars) {
    if (c.catch && allow('raw_fish') && depotTakes(d, 'raw_fish')) { const k = Math.min(c.catch, Math.floor(u.budget), d.store.room('raw_fish')); if (k > 0) { d.store.add('raw_fish', k); c.catch -= k; u.budget -= k; moved += k; } }
    if (!c.cargo) continue;
    for (const [it, have] of c.cargo.counts()) {
      if (u.budget < 1 || !allow(it) || !depotTakes(d, it)) continue;
      const lim = importLimit(d, it), k = Math.min(have, Math.floor(u.budget), d.store.room(it), lim);
      if (k > 0) { c.cargo.remove(it, k); d.store.add(it, k); u.budget -= k; moved += k; }
    }
  }
  if (stop.act === 'load' || stop.act === 'both') for (const c of cars) {
    if (!c.cargo) continue;
    for (const [it, have] of d.store.counts()) {
      if (u.budget < 1 || !allow(it)) continue;
      const k = Math.min(exportable(d, it, have), Math.floor(u.budget), c.cargo.room(it));
      if (k > 0) { d.store.remove(it, k); c.cargo.add(it, k); u.budget -= k; moved += k; }
    }
  }
  if (moved) { u.lastXfer = S.T; d.lastActive = S.T; }
  d.status = `serving ${u.name}`;
  if (condsMet(u, cars, d, stop)) { u.msg = ''; nextStop(u, route); }
  else u.msg = `at ${stopName(stop)}: ${condText(stop.conds)}`;
}
// Depot settings: rules { it, io: 'in' | 'out', n }. With no 'in' rules a depot takes anything vehicles unload;
// with some, only those items, up to n each. With no 'out' rules vehicles may load anything; with some, only
// those items, and the depot keeps at least n of each.
const depotTakes = (d, it) => { const ins = d.rules.filter(r => r.io === 'in'); return !ins.length || ins.some(r => r.it === it); };
const importLimit = (d, it) => { const r = d.rules.find(r => r.io === 'in' && r.it === it); return r?.n ? Math.max(0, r.n - d.store.count(it)) : Infinity; };
const exportable = (d, it, have) => { const outs = d.rules.filter(r => r.io === 'out'); if (!outs.length) return have; const r = outs.find(r => r.it === it); return r ? Math.max(0, have - (r.n || 0)) : 0; };
const cargoFull = cars => cars.filter(c => c.cargo).every(c => c.cargo.slots.every(s => s && s.n >= stackOf(s.it)));
const cargoEmpty = cars => cars.every(c => (!c.cargo || c.cargo.isEmpty()) && !c.catch);
const cargoCount = (cars, it) => cars.reduce((t, c) => t + (c.cargo ? c.cargo.count(it) : 0) + (it === 'raw_fish' ? c.catch || 0 : 0), 0);
function condOk(c, u, cars, d) {
  switch (c.t) {
    case 'full': return cargoFull(cars);
    case 'empty': return cargoEmpty(cars);
    case 'time': return u.waitT >= (c.n || 0);
    case 'idle': return S.T - (u.lastXfer || 0) >= (c.n || 0);
    case 'cargo': return cargoCount(cars, c.it) >= (c.n || 0);
    case 'depot': return !!d && d.store.count(c.it) >= (c.n || 0);
    case 'free': {   // the next stop has room for us (Factorio's train limits)
      const r = routeById(u.route), nx = r?.stops[(u.stop + 1) % r.stops.length];
      if (!nx?.depot) return true;
      return depotsNamed(nx.depot, u.way).some(e => !e.vlimit || carsHeading(u, key(e.x, e.y, e.z)) < e.vlimit);
    }
  }
  return true;
}
function condsMet(u, cars, d, stop) {
  const conds = stop.conds || [];
  if (!conds.length) return S.T - (u.lastXfer || 0) > 1;   // no conditions: leave once nothing moves
  let group = true;
  for (let i = 0; i < conds.length; i++) {
    if (i && conds[i].or) { if (group) return true; group = true; }
    group = group && condOk(conds[i], u, cars, d);
  }
  return group;
}
export const CONDS = { full: 'cargo full', empty: 'cargo empty', time: 'waited n s', idle: 'nothing moved for n s', cargo: 'cargo has n', depot: 'depot has n', free: 'next stop has room' };
export function condText(conds) {
  if (!conds?.length) return 'leaves when nothing more moves';
  return conds.map((c, i) => (i ? (c.or ? ' or ' : ' and ') : 'until ') + (
    c.t === 'time' ? `${c.n || 0} s passed` : c.t === 'idle' ? `idle ${c.n || 0} s` : c.t === 'cargo' ? `cargo has ${c.n || 0} ${ITEMS[c.it]?.name.toLowerCase() ?? '?'}` :
    c.t === 'depot' ? `depot has ${c.n || 0} ${ITEMS[c.it]?.name.toLowerCase() ?? '?'}` : CONDS[c.t] ?? c.t)).join('');
}
export function routeAction(op) {
  const r = routeById(op.id), clean = s => String(s ?? '').replace(/[<>]/g, '').trim().slice(0, 32);
  switch (op.do) {
    case 'add': {
      if (!['rail', 'road', 'sea'].includes(op.way)) return;
      const n = world.routes.filter(x => x.way === op.way).length + 1;
      world.routes.push({ id: world.nextId++, name: clean(op.name) || `${op.way === 'rail' ? 'Rail line' : op.way === 'road' ? 'Truck route' : 'Sea lane'} ${n}`, way: op.way, loop: true, stops: [] });
      break;
    }
    case 'edit': if (r) { if (op.name !== undefined) r.name = clean(op.name) || r.name; if (op.loop !== undefined) r.loop = !!op.loop; } break;
    case 'remove': if (r) { world.routes.splice(world.routes.indexOf(r), 1); for (const u of world.units) if (u.route === r.id) { u.route = null; u.auto = false; } } break;
    case 'stop': {
      if (!r) return;
      const st = cleanStop(op.stop, r.way); if (!st) return;
      const i = int(op.i, 0, r.stops.length, r.stops.length);
      if (i === r.stops.length) r.stops.push(st); else r.stops[i] = st;
      for (const u of world.units) if (u.route === r.id) u.goal = null;
      break;
    }
    case 'unstop': if (r) { r.stops.splice(int(op.i, 0, r.stops.length - 1, 0), 1); for (const u of world.units) if (u.route === r.id) { u.goal = null; if (u.stop >= r.stops.length) u.stop = 0; } } break;
    case 'move': if (r) { const i = int(op.i, 0, r.stops.length - 1, 0), j = i + (op.by > 0 ? 1 : -1); if (j >= 0 && j < r.stops.length) [r.stops[i], r.stops[j]] = [r.stops[j], r.stops[i]]; } break;
    case 'assign': {
      const u = unitById(op.unit); if (!u) return;
      if (op.route === null) { u.route = null; u.auto = false; }
      else { const rr = routeById(op.route); if (!rr || rr.way !== u.way) return; u.route = rr.id; u.auto = true; u.stop = 0; }
      u.goal = null; u.state = 'travel'; u.dock = null; u.msg = '';
      break;
    }
    case 'auto': { const u = unitById(op.unit); if (u) { u.auto = !!op.on && !!routeById(u.route); u.goal = null; u.dock = null; u.state = u.auto ? 'travel' : 'idle'; u.msg = u.auto ? '' : 'stopped'; } break; }
    case 'rename': { const u = unitById(op.unit); if (u) u.name = clean(op.name) || u.name; break; }
    default: return;
  }
  bus.emit('routes');
}
function cleanStop(s, way) {
  if (!s) return null;
  const at = Array.isArray(s.at) && s.at.length === 2 ? [int(s.at[0], 0, GRID - 1, 0), int(s.at[1], 0, GRID - 1, 0)] : null;
  const depot = typeof s.depot === 'string' && s.depot ? String(s.depot).slice(0, 32) : null;
  if (!depot && !at) return null;
  const act = ['load', 'unload', 'both', 'none'].includes(s.act) ? s.act : depot ? 'both' : 'none';
  const items = (Array.isArray(s.items) ? s.items : []).filter(it => ITEMS[it]).slice(0, 12);
  const conds = (Array.isArray(s.conds) ? s.conds : []).slice(0, 6).filter(c => CONDS[c?.t]).map(c => ({ t: c.t, n: int(c.n, 0, 100000, 0), it: ITEMS[c.it] ? c.it : null, or: !!c.or }));
  return { depot, at: depot ? null : at, act, items, conds };
}
export const defaultConds = act => act === 'load' ? [{ t: 'full', n: 0, it: null, or: false }] : act === 'unload' ? [{ t: 'empty', n: 0, it: null, or: false }] : act === 'both' ? [{ t: 'idle', n: 3, it: null, or: false }] : [];

export function depotCommand(e, cmd, arg) {
  switch (cmd) {
    case 'dname': e.dname = String(arg ?? '').replace(/[<>]/g, '').trim().slice(0, 32) || e.dname; for (const u of world.units) u.goal = null; bus.emit('routes'); break;
    case 'prio': e.prio = int(arg, 0, 10, 5); break;
    case 'vlimit': e.vlimit = int(arg, 0, 20, 0); break;
    case 'fuel': if (FUELS.includes(arg) && arg !== e.fuelFluid) { e.fuelFluid = arg; e.fa = []; world.fluidDirty = true; } break;
    case 'rule': {
      let r; try { r = typeof arg === 'string' ? JSON.parse(arg) : arg; } catch { return; }
      if (!ITEMS[r?.it]) return;
      const old = e.rules.find(x => x.it === r.it);
      if (r.del) { e.rules = e.rules.filter(x => x.it !== r.it); break; }
      const rule = { it: r.it, io: r.io === 'out' ? 'out' : 'in', n: int(r.n, 0, 100000, 0) };
      if (old) Object.assign(old, rule); else if (e.rules.length < 16) e.rules.push(rule);
      break;
    }
  }
}
bus.on('placed', e => {   // new depots get a name of their own
  if (e.kind !== 'depot' || e.dname) return;
  const def = ENTITIES[e.type], n = [...world.ents.values()].filter(o => o.type === e.type).length;
  e.dname = `${def.name} ${n}`;
});

// ---------------------------------------------------------------- vehicle slots (the vehicle window)
// fuel: drop barrels of what its engine burns (the empty barrels come back); net and catch on boats; cargo slots.
export function vehSlots(v) {
  const st = vstats(v.type), out = [];
  if (st.fuel) out.push({ id: 'fuel', group: 'Fuel', it: null, n: 0, hint: st.fuel + '_barrel' });
  if (FRAMES[st.frame].net) {
    out.push({ id: 'net', group: 'Fishing net', it: v.net ? 'fishing_net' : null, n: v.net ? 1 : 0, hint: 'fishing_net' });
    out.push({ id: 'catch', group: 'Catch', it: v.catch ? 'raw_fish' : null, n: v.catch || 0, hint: 'raw_fish' });
  }
  if (v.cargo) v.cargo.slots.forEach((s, i) => out.push({ id: 'c:' + i, group: 'Cargo', it: s?.it || null, n: s?.n || 0 }));
  return out;
}
export function vehSlotAccept(v, id, it) {
  const st = vstats(v.type);
  if (id === 'fuel') return it === st.fuel + '_barrel' ? Math.floor((st.tank - v.fuel) / BARREL_SIZE) : 0;
  if (id === 'net') return it === 'fishing_net' && !v.net ? 1 : 0;
  if (id.startsWith('c:') && v.cargo) return v.cargo.slotAccept(+id.slice(2), it);
  return 0;
}
export function vehSlotPut(v, id, it, n) {
  const k = Math.min(n, vehSlotAccept(v, id, it)); if (k <= 0) return 0;
  if (id === 'fuel') { v.fuel += k * BARREL_SIZE; invGive('barrel', k); }
  else if (id === 'net') v.net = 'fishing_net';
  else v.cargo.slotPut(+id.slice(2), it, k);
  return k;
}
export function vehSlotTake(v, id, n) {
  if (id === 'net') { if (!v.net) return [null, 0]; v.net = null; return ['fishing_net', 1]; }
  if (id === 'catch') { const k = Math.min(n, v.catch || 0, stackOf('raw_fish')); v.catch -= k; return ['raw_fish', k]; }
  if (id.startsWith('c:') && v.cargo) { const i = +id.slice(2), it = v.cargo.slots[i]?.it; return [it, v.cargo.slotTake(i, n)]; }
  return [null, 0];
}

// ---------------------------------------------------------------- per tick
export function transportTick(dt) {
  if (isClient()) return;   // the host moves vehicles; friends see them in its snapshots
  buildOccupancy();
  for (const v of world.vehicles) {
    if (v.unit) continue;
    const d = driverOf(v), st = vstats(v.type);
    freeDrive(v, st, d?.drive, dt, st.way);
  }
  for (const u of [...world.units]) {
    const cars = u.cars.map(vehicleById).filter(Boolean);
    if (!cars.length) { world.units.splice(world.units.indexOf(u), 1); continue; }
    const st = unitStats(u, cars), driver = cars.map(driverOf).find(Boolean);
    if (driver && u.way !== 'rail') { freeDrive(cars[0], st, driver.drive, dt, u.way); u.path = null; u.manual = true; u.state = 'manual'; u.msg = `driven by ${driver.name}`; continue; }
    if (!u.path || !u.path.length) snapUnit(u, cars[0]);
    if (driver) { u.manual = true; u.msg = `driven by ${driver.name}`; manualTrain(u, cars, st, driver.drive, dt); placeCars(u); continue; }
    if (u.manual) { u.manual = false; u.rev = false; u.goal = null; if (u.way === 'rail') settleTrain(u); }
    const hold = schedule(u, cars, dt);
    follow(u, cars, st, dt, hold);
    if (!hasFuel(cars) && u.v < .05 && u.state !== 'dock') u.msg = 'out of fuel';
    else if (u.state === 'travel' && u.v < .05 && u.blockedBy) u.msg = u.blockedBy === 'signal' ? 'waiting at a red signal' : 'waiting for the vehicle ahead';
    else if (u.state === 'travel' && /^(out of fuel|waiting)/.test(u.msg)) u.msg = `to ${stopName(routeById(u.route)?.stops[u.stop] || {})}`;
    if (u.way === 'rail') trimHistory(u);
    placeCars(u);
  }
}
// After driving a train by hand, cut its path back to where it stands.
function settleTrain(u) { const k = Math.min(u.path.length - 1, Math.floor(u.s)); u.path = u.path.slice(0, k + 1); }

// ---------------------------------------------------------------- saving and co-op
export const vehToJSON = v => ({ id: v.id, t: v.type, x: +v.x.toFixed(3), z: +v.z.toFixed(3), a: +v.ang.toFixed(3), v: +(v.v || 0).toFixed(2), f: +v.fuel.toFixed(1), c: v.cargo ? v.cargo.toList() : null, n: v.net, k: v.catch || 0, u: v.unit });
export function vehFromJSON(o) {
  const st = vstats(o.t); if (!st) return null;
  const v = { id: o.id, type: o.t, isVeh: true, x: o.x, z: o.z, ang: o.a, v: o.v || 0, fuel: o.f || 0, cargo: st.cargo ? new Inventory(st.cargo) : null, net: o.n || null, catch: o.k || 0, unit: o.u ?? null };
  if (v.cargo && o.c) v.cargo.loadList(o.c);
  return v;
}
export const unitToJSON = (u, full = true) => ({ id: u.id, way: u.way, name: u.name, cars: u.cars, route: u.route, auto: u.auto, stop: u.stop, state: u.state, msg: u.msg, v: +(u.v || 0).toFixed(2),
  ...(full ? { path: u.path, s: u.s, dir0: u.dir0, dock: u.dock, target: u.target, waitT: u.waitT } : {}) });
export function loadTransport(d) {
  world.vehicles = (d.vehicles || []).map(vehFromJSON).filter(Boolean);
  world.units = (d.units || []).map(u => ({ ...u, goal: null, msg: u.msg || '', state: u.state === 'dock' && u.dock ? 'dock' : u.auto ? 'travel' : 'idle' }));
  world.routes = d.routes || [];
  world.roads = new Map(d.roads || []);
  world.nextId = Math.max(d.nextId || 1, ...world.vehicles.map(v => v.id + 1), ...world.units.map(u => u.id + 1), ...world.routes.map(r => r.id + 1));
  world.railDirty = true; world.wayVersion = (world.wayVersion || 0) + 1;
}
// A friend's browser: vehicles arrive in snapshots and glide toward where the host has them.
export function applyVehicles(list, units) {
  const seen = new Set();
  for (const o of list) {
    seen.add(o.id);
    let v = vehicleById(o.id);
    if (!v) { v = vehFromJSON(o); if (!v) continue; world.vehicles.push(v); bus.emit('vehicles'); continue; }
    Object.assign(v, { x: o.x, z: o.z, ang: o.a, v: o.v, fuel: o.f, net: o.n, catch: o.k, unit: o.u });
    if (v.cargo && o.c) v.cargo.loadList(o.c);
  }
  const before = world.vehicles.length;
  world.vehicles = world.vehicles.filter(v => seen.has(v.id));
  if (world.vehicles.length !== before) bus.emit('vehicles');
  if (units) world.units = units;
}
export const isVehicleItem = it => !!VEHICLES[it];
export { FUELS, FLUIDS };
