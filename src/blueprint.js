// Blueprints: buildings planned but not built. They live in their own map (world.bps), never in world.ents, so no
// game rule ever sees them: they don't run, use power, carry fluid, connect belts or block inserters. They are drawn
// stippled (see dither in models.js). Building the real thing on a blueprint's tiles takes the blueprint's place, and
// clicking a blueprint with an empty hand builds it from your inventory (crafting it if need be).
//
// world.bps: tile key -> blueprint { id, type, x, y, z, dir, dy, fac, foot? }. A blueprint over several tiles is
// stored under each of its tiles; `foot` lists them.
import { ENTITIES } from './data.js';
import { S, world, key, bus, factoryOf } from './state.js';
import { canPlace, placeOrCraft, actorFac } from './sim.js';
import { footprint } from './multi.js';

let nextBp = 1;
export const bpAt = (x, y, z) => world.bps.get(key(x, y, z)) || null;
export const bpList = () => new Set(world.bps.values());
const tilesOfBp = b => b.foot || [[b.x, b.z]];

function addBp(b) {
  b.id ||= nextBp++;
  for (const [x, z] of tilesOfBp(b)) { const old = world.bps.get(key(x, b.y, z)); if (old && old !== b) dropBp(old); world.bps.set(key(x, b.y, z), b); }
  bus.emit('bp', b, true);
}
function dropBp(b) {
  for (const [x, z] of tilesOfBp(b)) if (world.bps.get(key(x, b.y, z)) === b) world.bps.delete(key(x, b.y, z));
  bus.emit('bp', b, false);
}

// Plan a building. Anything that could be built there can be planned there, whether or not you have one; no reach.
// A blueprint over another blueprint replaces it.
export function placeBlueprint(op) {
  const def = ENTITIES[op.type];
  if (!def || def.drag || op.type === 'frame') return 'that can\'t be planned as a blueprint';
  const fac = factoryOf(op.fac)?.id ?? actorFac(), dir = (op.dir | 0) & 3;
  const err = canPlace(op.type, op.x, op.y, op.z, dir, op.dy || 0, { noInv: true, fac, bp: true });
  if (err) return err;
  const b = { type: op.type, x: op.x, y: op.y, z: op.z, dir, dy: op.dy || 0, fac };
  if (def.multi) { b.foot = footprint(op.type, op.x, op.z, dir); [b.x, b.z] = b.foot[0]; }
  addBp(b);
  return null;
}
// The real thing went up: the blueprints under it are done.
export function removeBlueprintsUnder(tiles, y) {
  for (const [x, z] of tiles) { const b = bpAt(x, y, z); if (b) dropBp(b); }
}
export function removeBlueprint(x, y, z) { const b = bpAt(x, y, z); if (b) { dropBp(b); return true; } return false; }
// Build what a blueprint plans, as the acting engineer, from their inventory (placeOrCraft crafts it if they can).
export function buildBlueprint(x, y, z) {
  const b = bpAt(x, y, z); if (!b) return;
  const at = b.foot ? anchorFor(b) : [b.x, b.z];
  placeOrCraft({ type: b.type, x: at[0], y: b.y, z: at[1], dir: b.dir, dy: b.dy }, b.fac);
}
// The cursor tile that gives a big building its footprint back (see footprint in multi.js).
function anchorFor(b) {
  for (const [x, z] of b.foot) { const f = footprint(b.type, x, z, b.dir); if (f[0][0] === b.foot[0][0] && f[0][1] === b.foot[0][1]) return [x, z]; }
  return b.foot[0];
}

// ---------------------------------------------------------------- saves and co-op
export const bpsToJSON = () => [...bpList()].map(b => ({ t: b.type, x: b.x, y: b.y, z: b.z, d: b.dir, dy: b.dy || 0, fac: b.fac, foot: b.foot }));
export function bpsFromJSON(list) {
  for (const b of bpList()) dropBp(b);
  world.bps.clear();
  for (const o of list || []) if (ENTITIES[o.t]) addBp({ type: o.t, x: o.x, y: o.y, z: o.z, dir: o.d || 0, dy: o.dy || 0, fac: o.fac ?? 1, foot: o.foot?.map(t => [t[0], t[1]]) });
}
// Co-op: the host sends each blueprint as it comes and goes.
export const bpOp = b => ({ t: b.type, x: b.x, y: b.y, z: b.z, d: b.dir, dy: b.dy || 0, fac: b.fac, foot: b.foot });
export function applyBpOp(o, on) {
  const old = bpAt(o.x, o.y, o.z);
  if (old) dropBp(old);
  if (on && ENTITIES[o.t]) addBp({ type: o.t, x: o.x, y: o.y, z: o.z, dir: o.d || 0, dy: o.dy || 0, fac: o.fac ?? 1, foot: o.foot?.map(t => [t[0], t[1]]) });
}
// Who may act on blueprints: anyone. Hover info names what a blueprint plans.
export const bpName = b => `${ENTITIES[b.type].name} (blueprint)`;
S.bpHand = false;   // the hand places blueprints instead of buildings (Q on something you have none of)
