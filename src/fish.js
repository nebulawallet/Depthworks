// Fish. Every chunk's water holds a population that grows back toward what that water can support: a fished-out lake
// trickles back slowly, a half-full one recovers fastest, a full one stops growing. Near an engineer the fish are real
// objects that swim about (right-click one to catch it; a boat with a net scoops up every fish it passes, past a
// normal stack, until the net tears at two stacks). Away from everyone a chunk keeps only its count, and catches up on
// the growth it missed when someone comes back, so a huge world costs nothing for its distant seas.
import { ITEMS, TILES } from './data.js';
import { S, world, isWater, bus, CHUNK, chunkKey, chunkOf } from './state.js';
import { vstats } from './transport.js';

const isClient = () => S.net.role === 'client';
export const FISH_PER_TILE = 1 / 9;
const GROWTH = .008, TRICKLE = .006;   // per second: logistic growth, plus a trickle so even empty water recovers
const LIVE_R = 2;                      // chunks around each engineer where fish swim as objects
world.fishPools = new Map();           // chunkKey -> { n, cap, acc, T, live }

export const bodyAt = (x, z) => x >= 0 && z >= 0 ? chunkKey(Math.floor(x / CHUNK), Math.floor(z / CHUNK)) : -1;
const swimmable = (x, z) => isWater(Math.floor(x), Math.floor(z));
function waterCells(c) {
  if (!c.waterCells) { c.waterCells = []; for (let i = 0; i < c.tiles.length; i++) if (TILES[c.tiles[i]].liquid) c.waterCells.push(i); }
  return c.waterCells;
}
function pool(k) {
  let p = world.fishPools.get(k);
  if (!p) {
    const c = chunkOf((k % 4096) * CHUNK, Math.floor(k / 4096) * CHUNK), cap = c ? Math.floor(waterCells(c).length * FISH_PER_TILE) : 0;
    p = { n: Math.round(cap * .66), cap, acc: 0, T: S.T, live: false };   // new water starts two-thirds full
    world.fishPools.set(k, p);
  }
  return p;
}
function spawn(k, x, z) {
  if (x === undefined) {
    const c = chunkOf((k % 4096) * CHUNK, Math.floor(k / 4096) * CHUNK), cells = c && waterCells(c); if (!cells?.length) return;
    const i = cells[Math.floor(Math.random() * cells.length)];
    x = c.x0 + i % CHUNK + .2 + Math.random() * .6; z = c.z0 + Math.floor(i / CHUNK) + .2 + Math.random() * .6;
  }
  world.fish.push({ id: world.nextId++, x, z, a: Math.random() * Math.PI * 2, sp: .3 + Math.random() * .5, b: k });
}
const grow = (p, dt) => { p.acc += (GROWTH * p.n * (1 - p.n / Math.max(1, p.cap)) + TRICKLE * Math.max(1, p.cap / 20)) * dt; while (p.acc >= 1 && p.n < p.cap) { p.acc--; p.n++; } if (p.n >= p.cap) p.acc = 0; };
// A new world: nothing to do until engineers walk near water. Kept for old call sites.
export function stockFish() { world.fish = []; world.fishPools.clear(); }
export function findBodies() { for (const f of world.fish) f.b = bodyAt(f.x, f.z); }
export function fishCounts() { const m = new Map(); for (const f of world.fish) m.set(f.b, (m.get(f.b) || 0) + 1); return m; }

// The fish nearest a hovered water tile (or the exact point under the cursor), within a tile.
export function fishTarget(c) {
  const px = c.px ?? c.x + .5, pz = c.pz ?? c.z + .5;
  let best = null, bd = 1.1;
  for (const f of world.fish) { const d = Math.hypot(f.x - px, f.z - pz); if (d < bd) { bd = d; best = f; } }
  return best;
}
export function catchFish(id) {
  const i = world.fish.findIndex(f => f.id === id);
  if (i < 0) return false;
  const [f] = world.fish.splice(i, 1), p = world.fishPools.get(f.b); if (p) p.n = Math.max(0, p.n - 1);
  return true;
}

// Which chunks have fish swimming as objects: those near an engineer. Others only keep their count.
function liveSet() {
  const set = new Set();
  for (const pl of S.players.values()) {
    const cx = Math.floor(pl.x / CHUNK), cz = Math.floor(pl.z / CHUNK);
    for (let dx = -LIVE_R; dx <= LIVE_R; dx++) for (let dz = -LIVE_R; dz <= LIVE_R; dz++) if (world.chunks.has(chunkKey(cx + dx, cz + dz))) set.add(chunkKey(cx + dx, cz + dz));
  }
  return set;
}
let swimT = 0, liveT = 0;
export function fishTick(dt) {
  if (!S.started) return;
  // swim: drift, turn now and then, never leave the water
  for (const f of world.fish) {
    if (Math.random() < dt * .6) f.a += (Math.random() - .5) * 2.4;
    const nx = f.x + Math.sin(f.a) * f.sp * dt, nz = f.z + Math.cos(f.a) * f.sp * dt;
    if (swimmable(nx, nz) && swimmable(nx + Math.sin(f.a) * .3, nz + Math.cos(f.a) * .3) && bodyAt(nx, nz) === f.b) { f.x = nx; f.z = nz; }
    else f.a += Math.PI * (.5 + Math.random());
  }
  if (isClient()) return;
  if ((liveT += dt) > 1) {
    liveT = 0;
    const live = liveSet(), counts = fishCounts();
    for (const [k, p] of world.fishPools) if (p.live && !live.has(k)) { p.n = counts.get(k) || 0; p.live = false; p.T = S.T; world.fish = world.fish.filter(f => f.b !== k); }
    for (const k of live) {
      const p = pool(k); if (p.live || !p.cap) continue;
      grow(p, S.T - p.T); p.live = true;   // what it grew while nobody was looking
      for (let i = (counts.get(k) || 0); i < p.n; i++) spawn(k);
    }
  }
  const counts = fishCounts();
  for (const [k, p] of world.fishPools) {
    if (!p.live) continue;
    p.n = counts.get(k) || 0;
    const before = p.n; grow(p, dt);
    for (let i = before; i < p.n; i++) spawn(k);
  }
  if ((swimT += dt) < .1) return;
  swimT = 0;
  for (const v of world.vehicles) if (v.net && Math.abs(v.v) > .3 && vstats(v.type).frame === 'boat') trawl(v);
}
// A boat with a net catches what it passes. One stack is a full net; past that it strains, and at two it tears:
// the net is gone and whatever was over one stack swims off.
function trawl(v) {
  const stack = ITEMS.raw_fish.stack;
  for (let i = world.fish.length - 1; i >= 0; i--) {
    const f = world.fish[i];
    if (Math.hypot(f.x - v.x, f.z - v.z) > 1.1) continue;
    world.fish.splice(i, 1); v.catch = (v.catch || 0) + 1;
    if (v.catch >= stack * 2) {
      const escaped = v.catch - stack, k = bodyAt(v.x, v.z);
      v.catch = stack; v.net = null;
      for (let q = 0; q < escaped; q++) { const x = v.x + (Math.random() - .5) * 2, z = v.z + (Math.random() - .5) * 2; if (swimmable(x, z)) spawn(bodyAt(x, z), x, z); }
      bus.emit('announce', `The net on a boat tore: ${escaped} fish got away. Unload sooner, or carry a spare net.`);
      bus.emit('netbroke', v);
      return;
    }
  }
}
export const fishToList = () => world.fish.map(f => [f.id, +f.x.toFixed(2), +f.z.toFixed(2), +f.a.toFixed(2)]);
export function fishFromList(list) {
  const old = new Map(world.fish.map(f => [f.id, f]));
  world.fish = (list || []).map(([id, x, z, a]) => { const f = old.get(id) || { id, sp: .5 }; return Object.assign(f, { x, z, a, b: bodyAt(x, z) }); });
}
export const poolsToList = () => [...world.fishPools].map(([k, p]) => [k, p.n, +p.acc.toFixed(2), p.live ? 1 : 0]);
// Saves keep each pool's count; fish that were swimming come back as they were and mark their chunks live.
export function poolsFromList(list, fish) {
  world.fishPools.clear();
  for (const [k, n, acc, live] of list || []) { const p = pool(k); p.n = n; p.acc = acc || 0; p.T = S.T; p.live = !!live; }
  for (const f of fish ? world.fish : []) { const p = pool(f.b); if (!p.live) { p.live = true; p.n = 0; } }
}
