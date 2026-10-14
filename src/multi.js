// Objects that cover several tiles: greenhouse rooms, dams, and (in transport.js) roads. Each is one object with one
// identity, one state and one footprint: `foot`, a list of absolute [x, z] tiles, with its x, z the anchor (the first
// tile, north-west most). world.ents keeps the object under its anchor key and every other tile in world.ents.occ, so a
// lookup at any of its tiles finds the object while iterating world.ents sees it once.
//
// Objects of a kind marked `merge` join with touching ones of their kind (one room of greenhouses, one dam across a
// river). Ctrl + mining takes a single tile off an object whose kind allows it (`tileMine` in data), and what is left
// regroups: a room cut in two becomes two rooms, each with its share of the water, seeds and harvest.
import { ENTITIES } from './data.js';
import { world, key, DIRS, bus } from './state.js';

// ---------------------------------------------------------------- footprints
// Big buildings (boilers, steam engines) are fixed-size multi-tile objects with a direction: they never join others.
// A big building from an old save that is still one tile (`compact`) has no footprint and is just a tile.
export const isMulti = e => !!e && !!ENTITIES[e.type]?.multi && (!ENTITIES[e.type].big || !!e.foot);
export const isBig = e => !!e && !!ENTITIES[e.type]?.big && !!e.foot;
// The size of a building facing `dir`: [width along x, depth along z] (turned a quarter, they swap).
export const sizeOf = (type, dir = 0) => { const [w, h] = ENTITIES[type]?.size || [1, 1]; return dir % 2 ? [h, w] : [w, h]; };
// The tiles a building of `type` placed at (x, z) covers: its size, centred on the cursor tile (the cursor tile is the
// north-west of the middle two on an even side).
export function footprint(type, x, z, dir = 0) {
  const [w, h] = sizeOf(type, ENTITIES[type]?.big ? dir : 0), x0 = x - Math.floor((w - 1) / 2), z0 = z - Math.floor((h - 1) / 2), out = [];
  for (let dz = 0; dz < h; dz++) for (let dx = 0; dx < w; dx++) out.push([x0 + dx, z0 + dz]);
  return out;
}
const sortFoot = foot => foot.sort((a, b) => a[1] - b[1] || a[0] - b[0]);
// Register or unregister an object's tiles in the world (its anchor is world.ents' own entry).
export function setFoot(e) {
  sortFoot(e.foot); e.x = e.foot[0][0]; e.z = e.foot[0][1];
  for (const [x, z] of e.foot) { const k = key(x, e.y, z); if (x !== e.x || z !== e.z) world.ents.occ.set(k, e); else world.ents.occ.delete(k); }
  e.footSet = new Set(e.foot.map(([x, z]) => x + ',' + z));
}
export function clearFoot(e) { for (const [x, z] of e.foot || []) { const k = key(x, e.y, z); if (world.ents.occ.get(k) === e) world.ents.occ.delete(k); } }
export const covers = (e, x, z) => e.footSet ? e.footSet.has(x + ',' + z) : e.x === x && e.z === z;
// Connected groups of tiles (four-way).
export function groups(tiles) {
  const left = new Set(tiles.map(([x, z]) => x + ',' + z)), out = [];
  for (const [x, z] of tiles) {
    if (!left.has(x + ',' + z)) continue;
    const g = [], q = [[x, z]]; left.delete(x + ',' + z);
    while (q.length) {
      const [a, b] = q.pop(); g.push([a, b]);
      for (const [dx, dz] of DIRS) { const k = (a + dx) + ',' + (b + dz); if (left.has(k)) { left.delete(k); q.push([a + dx, b + dz]); } }
    }
    out.push(g);
  }
  return out;
}
// Where an object meets the outside: [x, z, d] for every tile edge whose neighbour in direction d isn't part of it.
export function perimeter(e) {
  const out = [];
  for (const [x, z] of e.foot) for (let d = 0; d < 4; d++) if (!covers(e, x + DIRS[d][0], z + DIRS[d][1])) out.push([x, z, d]);
  return out;
}
// Greenhouse doors: a gap in the wall every five tiles along any outside edge, so a room can be entered from every side.
export const isDoor = (x, z, d) => ((d % 2 === 0 ? x : z) % 5 + 5) % 5 === 2;
export function wallsAt(e, x, z) {
  let m = 0;
  for (let d = 0; d < 4; d++) if (!covers(e, x + DIRS[d][0], z + DIRS[d][1]) && !isDoor(x, z, d)) m |= 1 << d;
  return m;
}
// Touching objects of the same kind (and factory) that a footprint would join.
export function neighboursToMerge(type, y, foot, fac) {
  const def = ENTITIES[type]; if (!def?.merge) return [];
  const set = new Set(foot.map(([x, z]) => x + ',' + z)), out = new Set();
  for (const [x, z] of foot) for (const [dx, dz] of DIRS) {
    if (set.has((x + dx) + ',' + (z + dz))) continue;
    const n = world.ents.get(key(x + dx, y, z + dz));
    if (n && n.kind === def.kind && (n.fac ?? 1) === (fac ?? 1)) out.add(n);
  }
  return [...out];
}

// ---------------------------------------------------------------- kinds: how state joins and splits
// join(into, from): fold from's state into into's. split(from, part, share): fill part (a fresh copy) with share of
// from's state. Both run before footprints are updated.
const sumObj = (a, b, k = 1) => { for (const [it, n] of Object.entries(b || {})) a[it] = (a[it] || 0) + n * k; return a; };
export const KINDS = {
  greenhouse: {
    join(into, from) {
      if (from.seed && into.seed && from.seed !== into.seed) sumObj(into.out ||= {}, { [from.seed + '_seeds']: from.seeds || 0 });   // other seeds wait in the harvest
      else { into.seed ||= from.seed; into.seeds = (into.seeds || 0) + (from.seeds || 0); }
      sumObj(into.out ||= {}, from.out);
      into.fa = [(into.fa?.[0] || 0) + (from.fa?.[0] || 0)];
      into.grow = Math.max(into.grow || 0, from.grow || 0);
    },
    split(from, part, share) {
      part.seed = from.seed; part.seeds = Math.floor((from.seeds || 0) * share); part.grow = from.grow || 0;
      part.out = {}; for (const [it, n] of Object.entries(from.out || {})) { const k = Math.floor(n * share); if (k) { part.out[it] = k; from.out[it] -= k; } }
      part.fa = [(from.fa?.[0] || 0) * share];
      from.seeds = (from.seeds || 0) - part.seeds; if (from.fa) from.fa[0] *= 1 - share;
    },
  },
  dam: {
    join() {},
    split() {},
  },
};
// Fold `others` into e: one object, all their tiles. They leave the world without refunds.
export function joinAll(e, others) {
  const K = KINDS[e.kind];
  for (const o of others) {
    if (o === e) continue;
    K?.join(e, o);
    clearFoot(o); world.ents.delete(key(o.x, o.y, o.z)); bus.emit('removed', o);
    e.foot.push(...o.foot);
  }
  rekey(e, () => setFoot(e));
}
// Move an object to a new anchor key after its footprint changed.
export function rekey(e, change) {
  const before = key(e.x, e.y, e.z);
  clearFoot(e); change();
  if (world.ents.get(before) === e) world.ents.delete(before);
  world.ents.set(key(e.x, e.y, e.z), e);
  setFoot(e);
}
