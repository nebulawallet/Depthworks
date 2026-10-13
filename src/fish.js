// Fish. Every body of water (each lake, the ocean, a river with the lake it feeds) holds a population that grows
// back toward what that water can support: a fished-out lake trickles back slowly, a half-full one recovers
// fastest, a full one stops growing. Fish are real objects that swim about. Right-click one to catch it; a boat
// with a net scoops up every fish it passes, past a normal stack, until the net tears at two stacks.
import { ITEMS } from './data.js';
import { S, world, GRID, isWater, bus } from './state.js';
import { vstats } from './transport.js';

const isClient = () => S.net.role === 'client';
export const FISH_PER_TILE = 1 / 9;
const GROWTH = .008, TRICKLE = .006;   // per second: logistic growth, plus a trickle so even empty water recovers
let bodyOf = null;

// Flood-fill the water into bodies. Rebuilt whenever the tiles change (new world or load).
export function findBodies() {
  bodyOf = new Int16Array(GRID * GRID).fill(-1);
  const bodies = [];
  for (let i = 0; i < GRID * GRID; i++) {
    if (bodyOf[i] >= 0 || !isWater(i % GRID, Math.floor(i / GRID))) continue;
    const b = { id: bodies.length, cells: [], acc: 0 }, q = [i];
    bodyOf[i] = b.id;
    while (q.length) {
      const c = q.pop(), x = c % GRID, z = Math.floor(c / GRID); b.cells.push(c);
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, nz = z + dz, j = nz * GRID + nx;
        if (nx >= 0 && nz >= 0 && nx < GRID && nz < GRID && bodyOf[j] < 0 && isWater(nx, nz)) { bodyOf[j] = b.id; q.push(j); }
      }
    }
    b.cap = Math.floor(b.cells.length * FISH_PER_TILE);
    bodies.push(b);
  }
  world.fishBodies = bodies;
  world.fish = world.fish.filter(f => bodyAt(f.x, f.z) >= 0);
  for (const f of world.fish) f.b = bodyAt(f.x, f.z);
}
export const bodyAt = (x, z) => { const tx = Math.floor(x), tz = Math.floor(z); return !bodyOf || tx < 0 || tz < 0 || tx >= GRID || tz >= GRID ? -1 : bodyOf[tz * GRID + tx]; };
const swimmable = (x, z) => isWater(Math.floor(x), Math.floor(z));
function spawn(b, x, z) {
  if (x === undefined) { const c = b.cells[Math.floor(Math.random() * b.cells.length)]; x = c % GRID + .2 + Math.random() * .6; z = Math.floor(c / GRID) + .2 + Math.random() * .6; }
  world.fish.push({ id: world.nextId++, x, z, a: Math.random() * Math.PI * 2, sp: .3 + Math.random() * .5, b: b.id });
}
// A new world starts with its water two-thirds full.
export function stockFish() {
  findBodies();
  world.fish = [];
  for (const b of world.fishBodies) for (let i = 0; i < Math.round(b.cap * .66); i++) spawn(b);
}
export function fishCounts() { const n = world.fishBodies.map(() => 0); for (const f of world.fish) if (n[f.b] !== undefined) n[f.b]++; return n; }

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
  world.fish.splice(i, 1); return true;
}

let swimT = 0;
export function fishTick(dt) {
  if (!S.started) return;
  if (!bodyOf) findBodies();
  // swim: drift, turn now and then, dart away from boats, never leave the water
  for (const f of world.fish) {
    if (Math.random() < dt * .6) f.a += (Math.random() - .5) * 2.4;
    const nx = f.x + Math.sin(f.a) * f.sp * dt, nz = f.z + Math.cos(f.a) * f.sp * dt;
    if (swimmable(nx, nz) && swimmable(nx + Math.sin(f.a) * .3, nz + Math.cos(f.a) * .3)) { f.x = nx; f.z = nz; }
    else f.a += Math.PI * (.5 + Math.random());
  }
  if (isClient()) return;
  const counts = fishCounts();
  for (const b of world.fishBodies) {
    const n = counts[b.id];
    if (n >= b.cap) { b.acc = 0; continue; }
    b.acc += (GROWTH * n * (1 - n / b.cap) + TRICKLE * Math.max(1, b.cap / 20)) * dt;
    while (b.acc >= 1) { b.acc--; spawn(b); }
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
      const escaped = v.catch - stack, b = world.fishBodies[bodyAt(v.x, v.z)];
      v.catch = stack; v.net = null;
      if (b) for (let k = 0; k < escaped; k++) spawn(b, v.x + (Math.random() - .5) * 2, v.z + (Math.random() - .5) * 2);
      world.fish = world.fish.filter(g => swimmable(g.x, g.z));
      const msg = `The net on a boat tore: ${escaped} fish got away. Unload sooner, or carry a spare net.`;
      bus.emit('announce', msg);
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
