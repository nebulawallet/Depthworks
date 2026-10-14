// Farming: weedy patches dug up for seeds, and greenhouses that grow crops from them.
//
// A greenhouse room grows one crop. It needs a stock of that crop's seeds to plant (one for every five tiles; they are
// replanted after every harvest, so they are never used up) and water from irrigation pipe. All the greenhouses on
// one water network share it by need: when there isn't enough to go round, every one gets the same share and grows
// that much slower, so big networks need no setting up. Each harvest puts the crop and some spare seeds in the room's
// output, where inserters (filtered or not) take them out. Lit green lamps beside a room speed it up.
import { ENTITIES, ITEMS, BIOMES, CROPS, seedId } from './data.js';
import { S, world, key, DIRS, bus, notify, biomeIndexAt, clearPatch, invGive } from './state.js';
import { avail, draw } from './fluids.js';
import { perimeter } from './multi.js';
import { groundName } from './worldgen.js';

const isClient = () => S.net.role === 'client';
export const FARM = { cycle: 60, cropPerTile: .5, seedPerTile: .15, tilesPerSeed: 5, storePerTile: 20, lampBoost: .2, maxLamps: 2 };
export const seedsNeeded = e => Math.ceil(e.foot.length / FARM.tilesPerSeed);
const stored = e => Object.values(e.out || {}).reduce((t, n) => t + n, 0);

// ---------------------------------------------------------------- seeds into a room
export function greenhouseAccepts(e, it, manual) {
  const crop = ITEMS[it]?.seed; if (!crop) return false;
  if (e.seed && e.seed !== crop && e.seeds > 0) return false;   // one crop to a room: empty it to switch
  return e.seeds < (manual ? 200 : seedsNeeded(e) * 3);
}
export function greenhouseInsert(e, it) {
  const crop = ITEMS[it].seed;
  if (e.seed !== crop) { e.seed = crop; e.grow = 0; bus.emit('remesh', e); }
  e.seeds++;
}

// ---------------------------------------------------------------- growing
function lampsBeside(e) {
  if (e.lampT !== undefined && S.T - e.lampT < 2) return e.lamps;
  const seen = new Set();
  for (const [x, z, d] of perimeter(e)) {
    const l = world.ents.get(key(x + DIRS[d][0], e.y, z + DIRS[d][1]));
    if (l?.type === 'green_lamp' && l.lit) seen.add(l);
  }
  e.lampT = S.T; e.lamps = Math.min(FARM.maxLamps, seen.size);
  return e.lamps;
}
export function farmTick(dt) {
  // water first: every network shares what it can give out by what each room needs
  const byNet = new Map();
  for (const e of world.ents.values()) {
    if (e.kind !== 'greenhouse') continue;
    e.need = e.seed && e.seeds >= seedsNeeded(e) && stored(e) < e.foot.length * FARM.storePerTile ? ENTITIES[e.type].water * e.foot.length : 0;
    const n = e.fnet?.water;
    if (!n) { e.water = 0; continue; }
    (byNet.get(n) || byNet.set(n, []).get(n)).push(e);
  }
  for (const [n, list] of byNet) {
    const need = list.reduce((t, e) => t + e.need * dt, 0), k = need > 0 ? Math.min(1, avail(n) / need) : 0;
    if (need > 0) draw(n, need * k);
    for (const e of list) e.water = e.need ? k : (n.amount > 0 ? 1 : 0);
  }
  for (const e of world.ents.values()) if (e.kind === 'greenhouse') grow(e, dt);
}
function grow(e, dt) {
  const tiles = e.foot.length, need = seedsNeeded(e);
  if (!e.seed || e.seeds <= 0) { e.status = 'put seeds in (by hand or with an inserter)'; return; }
  if (e.seeds < need) { e.status = `needs ${need} ${CROPS[e.seed].name.toLowerCase()} seeds to plant its ${tiles} tiles (has ${e.seeds})`; return; }
  if (stored(e) >= tiles * FARM.storePerTile) { e.status = 'harvest full: take it out'; return; }
  if (!e.fnet?.water) { e.status = 'no water: lead irrigation pipe to any side'; return; }
  if (e.water < .02) { e.status = 'waiting for water'; return; }
  const boost = 1 + lampsBeside(e) * FARM.lampBoost;
  e.grow = (e.grow || 0) + dt / FARM.cycle * e.water * boost;
  e.lastActive = S.T;
  e.status = `growing ${CROPS[e.seed].name.toLowerCase()} · ${Math.round(e.grow * 100)}%${e.water < .99 ? ` · ${Math.round(e.water * 100)}% water` : ''}${boost > 1 ? ` · lamps +${Math.round((boost - 1) * 100)}%` : ''}`;
  if (e.grow < 1 || isClient()) return;
  e.grow = 0;
  const crops = Math.max(1, Math.round(tiles * FARM.cropPerTile)), spare = Math.max(1, Math.round(tiles * FARM.seedPerTile));
  e.out[e.seed] = (e.out[e.seed] || 0) + crops;
  e.out[seedId(e.seed)] = (e.out[seedId(e.seed)] || 0) + spare;
  S.stats.made[e.seed] = (S.stats.made[e.seed] || 0) + crops;
}

// ---------------------------------------------------------------- the shovel
// Digging a weedy patch turns it into plain ground and may turn up seeds: mostly the crops of the biome it's in.
export function digPatch(x, z) {
  clearPatch(x, z);
  bus.emit('patch', x, z);
  if (isClient()) return [];
  const b = BIOMES[biomeIndexAt(x, z)], got = [];
  if (Math.random() < .65) {
    const crop = b.seeds[Math.floor(Math.random() * b.seeds.length)], n = Math.random() < .3 ? 2 : 1;
    invGive(seedId(crop), n); got.push([seedId(crop), n]);
    if (CROPS[crop].irr && !S.med.mutations) { S.med.mutations = true; bus.emit('announce', 'Irradiated seeds: their mutations open new upgrades in the medical lab.'); }
  }
  return got;
}
export const patchName = (x, z) => `Weedy ${groundName(x, z).toLowerCase()}`;
