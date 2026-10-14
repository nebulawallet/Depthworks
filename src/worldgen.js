// World generation. A world is its seed and its options: every 32×32 chunk is made from those the first time
// anything asks about it (the renderer, the map, a building, a path), so a world can be as big as 65536 tiles a side
// and only the parts someone has been near ever exist. Generation is a pure function of (seed, options, x, z): the
// host and every friend make the same chunk on their own, and saves keep only what changed (world.edits).
//
// Climate (temperature, moisture, weirdness) is smooth noise; each tile takes the biome closest to its climate, with
// the border jittered so biomes interlock instead of meeting in a line, and the renderer blends ground colours across
// it. Water comes from an elevation field (ocean, and an ocean rim at the world's edge), lake blobs and river
// channels that follow a noise isoline downhill. Ores, trees, rocks, oil and weedy patches come from per-biome tables.
// Worlds from before chunks (96 tiles a side) keep their stored tiles and objects; only weedy patches are added.
import { BIOMES, BIOME, FEATURES, STRAY_ORES, WORLD, TILE, TILES } from './data.js';
import { S, world, key, GRID, CHUNK, SPAWN, newDeposit, setChunkGen, chunkKey, setWorldSize } from './state.js';

// ---------------------------------------------------------------- noise
const hash = (x, z, s) => {
  let h = Math.imul(x | 0, 374761393) + Math.imul(z | 0, 668265263) + Math.imul(s | 0, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};
function vn(x, z, s) {
  const xi = Math.floor(x), zi = Math.floor(z), xf = x - xi, zf = z - zi, u = xf * xf * (3 - 2 * xf), v = zf * zf * (3 - 2 * zf);
  const a = hash(xi, zi, s), b = hash(xi + 1, zi, s), c = hash(xi, zi + 1, s), d = hash(xi + 1, zi + 1, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm(x, z, s, oct = 3) {
  let t = 0, amp = .5, f = 1, n = 0;
  for (let i = 0; i < oct; i++) { t += vn(x * f, z * f, s + i * 131) * amp; n += amp; amp *= .5; f *= 2.03; }
  return t / n;
}
// fbm bunches up around the middle: spread it back out over 0..1
const stretch = (v, k = 2.4) => Math.max(0, Math.min(1, (v - .5) * k + .5));
export { hash as hashTile, vn as valueNoise, fbm };
const typeSeed = t => { let h = 7; for (const c of t) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 8; };

// ---------------------------------------------------------------- climate and biomes
const G = () => world.gen;
// Weirdness is squared, so it runs high only in a few places: that is where the strange biomes are.
export function climate(x, z) {
  const g = G(), sc = g.biomeScale;
  return [stretch(fbm(x / sc, z / sc, g.seed + 11)), stretch(fbm(x / sc + 40, z / sc - 17, g.seed + 23)), stretch(fbm(x / (sc * 1.4), z / (sc * 1.4), g.seed + 37), 2) ** 2];
}
const WEIGHT = [1, .9, 2];   // weirdness counts double: the strange biomes only win where it runs high
// The biome nearest a climate, the next nearest, and how close the border is (0: on it, 1: well inside).
export function pickBiome(c) {
  let b1 = 0, d1 = 9, b2 = 0, d2 = 9;
  for (let i = 0; i < BIOMES.length; i++) {
    const p = BIOMES[i].clim, d = Math.hypot((c[0] - p[0]) * WEIGHT[0], (c[1] - p[1]) * WEIGHT[1], (c[2] - p[2]) * WEIGHT[2]);
    if (d < d1) { b2 = b1; d2 = d1; b1 = i; d1 = d; } else if (d < d2) { b2 = i; d2 = d; }
  }
  return { b: b1, b2, edge: Math.min(1, (d2 - d1) / .16) };   // a wide band, so ground colours fade over many tiles
}
// The biome a tile belongs to: climate sampled a little off the tile (a smooth warp, then a finer one), so borders
// wander in soft curves instead of running straight, without speckling.
export function biomeAtXZ(x, z) {
  const g = G();
  const wx = (fbm(x / 26, z / 26, g.seed + 3, 2) - .5) * 30 + (vn(x / 6, z / 6, g.seed + 7) - .5) * 4;
  const wz = (fbm(x / 26, z / 26, g.seed + 5, 2) - .5) * 30 + (vn(x / 6, z / 6, g.seed + 9) - .5) * 4;
  return pickBiome(climate(x + wx, z + wz));
}

// ---------------------------------------------------------------- water
const SAFE = 72;   // no water this close to the landing site
function elevation(x, z) {
  const g = G();
  let e = fbm(x / (g.biomeScale * 1.7), z / (g.biomeScale * 1.7), g.seed + 51, 4) * .8 + fbm(x / 40, z / 40, g.seed + 53, 2) * .2;
  const d = Math.min(x, z, GRID - 1 - x, GRID - 1 - z);   // an ocean rim around the world
  if (d < 56) e -= Math.pow(1 - d / 56, 2) * .6;
  return e;
}
const seaLevel = () => .5 - .135 * G().water;
const riverField = (x, z) => fbm(x / 300, z / 300, G().seed + 71, 3);
// rivers run only through some regions, so they stay landmarks instead of a maze
const riverRegion = (x, z) => fbm(x / 520, z / 520, G().seed + 75, 2) > .56;
// 0 land, 1 still water, 2 river; and for rivers the flow direction (index into DIRS)
function waterAt(x, z, b, near) {
  const g = G(), e = elevation(x, z), sea = seaLevel();
  if (near < SAFE) return [0, -1];
  if (e < sea) return [TILE.water, -1];
  const bi = BIOMES[b];
  const lk = fbm(x / 52, z / 52, g.seed + 61, 3), lthr = .755 - (g.water - 1) * .08 + (bi.dry || 0) * .06 - (bi.wet || 0) * .07;
  if (lk > lthr && e > sea + .02) return [TILE.water, -1];
  if (near < SAFE + 16 || bi.dry) return [0, -1];
  const rv = riverField(x, z), w = (.006 + vn(x / 70, z / 70, g.seed + 73) * .007) * g.water;
  if (Math.abs(rv - .5) < w && e > sea + .01 && riverRegion(x, z) && vn(x / 8, z / 8, g.seed + 81) < .84) {
    // along the channel (perpendicular to the field's slope), the way the land falls
    const gx = riverField(x + 1, z) - riverField(x - 1, z), gz = riverField(x, z + 1) - riverField(x, z - 1);
    let tx = -gz, tz = gx;
    const ex = elevation(x + 2, z) - elevation(x - 2, z), ez = elevation(x, z + 2) - elevation(x, z - 2);
    if (tx * -ex + tz * -ez < 0) { tx = -tx; tz = -tz; }
    return [TILE.river, Math.abs(tx) > Math.abs(tz) ? (tx > 0 ? 1 : 3) : (tz > 0 ? 2 : 0)];
  }
  return [0, -1];
}

// ---------------------------------------------------------------- ores
// Each ore's own noise field, shaped by its pattern. Returns how far past the threshold the tile is (≤ 0: none).
function oreMargin(t, spec, x, z, s, layer) {
  const w = spec.w ?? 1, size = spec.size ?? 1;
  switch (spec.pat || 'blob') {
    case 'vein': {
      const f = 1 - Math.abs(fbm(x / (110 * size), z / (110 * size), s, 3) - .5) * 2;
      return fbm(x / 34, z / 34, s + 9, 2) > .46 ? f - (.958 - (w - 1) * .012) : 0;
    }
    case 'scatter': {
      const C = 26, cx = Math.floor(x / C), cz = Math.floor(z / C);
      let best = 0;
      for (let ox = -1; ox <= 1; ox++) for (let oz = -1; oz <= 1; oz++) {
        const gx = cx + ox, gz = cz + oz;
        if (hash(gx, gz, s + 1) > .11 * w) continue;
        const px = (gx + .2 + hash(gx, gz, s + 2) * .6) * C, pz = (gz + .2 + hash(gx, gz, s + 3) * .6) * C, r = (3.5 + hash(gx, gz, s + 4) * 3.5) * size;
        best = Math.max(best, 1 - Math.hypot(x + .5 - px, z + .5 - pz) / r);
      }
      return best * .3;
    }
    // fewer octaves in newer worlds: rounder, more solid blobs, with the threshold raised to keep as much ore overall
    default: return fbm(x / (44 * size), z / (44 * size), s, fuller() ? 2 : 3) - (.77 + (fuller() ? BLOB_LIFT : 0) - (w - 1) * .03) - (layer ? .03 : 0);
  }
}
function pickOre(table, x, z, layer) {
  const g = G();
  let best = null, bm = 0;
  for (const [t, spec] of Object.entries(table)) {
    const far = spec.far ?? (t === 'uranium_ore' ? 170 : 0);   // uranium keeps away from the landing site, wherever it is
    if (far && Math.hypot(x - SPAWN.x, z - SPAWN.z) < Math.min(far, GRID * .3)) continue;
    const m = oreMargin(t, spec, x, z, g.seed + typeSeed(t) + layer * 7777, layer);
    if (m > bm) { bm = m; best = [t, spec, m]; }
  }
  return best;
}
// Starter deposits around the landing site, laid out like the original map, so every world starts the same way.
const STARTER = [['iron_ore', -11, -7.5, 5], ['copper_ore', 8.5, -12, 4.4], ['coal', -3.5, 6, 3.8], ['stone', 7, 3, 3.3],
  ['iron_ore', -32, -31, 6.2], ['copper_ore', 28, -34, 5.6], ['coal', 25, 21, 5.6], ['stone', -29, 22, 5], ['iron_ore', 32, -3, 5], ['copper_ore', -17, 30, 5], ['coal', -36, -4.5, 4.4]];
const STARTER_UNDER = [['crystal', 6, 5, 3.8, -1, 1.5], ['crystal', -20, -24, 3.8, -1, 1.5], ['iron_ore', -12, 12, 5, -1, 3], ['copper_ore', 18, -12, 4.4, -1, 3],
  ['abyssal_ore', 0, -15, 5, -2, 2], ['crystal', 20, -30, 3.8, -2, 3]];
const SPREAD = 1.5, GROW = 1.7;   // the old layout's spacing and patch size, made bigger
// Worlds made since version 2 have fuller ore patches: solid inside, holes only near the rim. Older worlds keep their
// layout (their chunks are made again from the seed, and buildings stand on that ore).
const fuller = () => (G()?.v || 1) >= 2;
const BLOB_LIFT = .045;   // measured: the same ore overall as before (within a few percent), with a third of the ragged edges
const starterHole = (h, d) => fuller() ? h < Math.max(0, d - .8) * 2.5 : h < d * .55;
function starterAt(x, z, layer) {
  for (const [t, dx0, dz0, r0, y = 0, rich = 1] of layer ? STARTER_UNDER : STARTER) {
    if (y !== layer) continue;
    const dx = dx0 * SPREAD, dz = dz0 * SPREAD, r = r0 * GROW;
    const d = Math.hypot(x + .5 - (SPAWN.x + dx), z + .5 - (SPAWN.z + dz));
    if (d < r && !starterHole(hash(x, z, G().seed + 201 + y), d / r)) return [t, rich, d / r];
  }
  return null;
}
const richBase = (x, z, rich, edge, h) => {
  const far = 1 + Math.min(5, Math.hypot(x - SPAWN.x, z - SPAWN.z) / 220);
  return Math.round((250 + h * 500) * far * rich * G().ores * (1 - edge * .5));
};

// ---------------------------------------------------------------- oil
// Fields of wells sit on a coarse grid of cells: each cell may hold one field near its middle.
const OIL_CELL = 96;
function oilWells(gx, gz) {
  const g = G(), s = g.seed + 4111;
  const cx = (gx + .3 + hash(gx, gz, s) * .4) * OIL_CELL, cz = (gz + .3 + hash(gx, gz, s + 1) * .4) * OIL_CELL;
  if (Math.hypot(cx - SPAWN.x, cz - SPAWN.z) < 60 || cx < 8 || cz < 8 || cx > GRID - 8 || cz > GRID - 8) return [];
  const bi = BIOMES[biomeAtXZ(cx, cz).b];
  if (hash(gx, gz, s + 2) > bi.oil * .7) return [];
  const n = 3 + Math.floor(hash(gx, gz, s + 3) * 4), rich = .6 + hash(gx, gz, s + 4) * 1.2, out = [];
  for (let i = 0; i < n; i++) out.push([Math.floor(cx + (hash(gx * 7 + i, gz, s + 5) - .5) * 9), Math.floor(cz + (hash(gx, gz * 7 + i, s + 6) - .5) * 9), Math.round((50 + hash(gx + i, gz - i, s + 7) * 100) * rich)]);
  return out;
}

// ---------------------------------------------------------------- one chunk
const N = CHUNK * CHUNK;
function emptyChunk(cx, cz) {
  return { cx, cz, x0: cx * CHUNK, z0: cz * CHUNK, tiles: new Uint8Array(N), flow: new Int8Array(N).fill(-1), biome: new Uint8Array(N), biome2: new Uint8Array(N),
    edge: new Uint8Array(N).fill(255), patch: new Uint8Array(N), ores: [], feats: [], oil: [] };
}
function genChunk(cx, cz) {
  const c = emptyChunk(cx, cz), k = chunkKey(cx, cz);
  world.chunks.set(k, c);   // first, so lookups from inside generation see it
  if (!G()) legacyChunk(c); else freshChunk(c);
  world.chunkVersion = (world.chunkVersion || 0) + 1;
  return c;
}
function freshChunk(c) {
  const g = G(), E = world.edits, s = g.seed;
  const w = Math.min(CHUNK, GRID - c.x0), h = Math.min(CHUNK, GRID - c.z0);
  for (let lz = 0; lz < h; lz++) for (let lx = 0; lx < w; lx++) {
    const x = c.x0 + lx, z = c.z0 + lz, i = lz * CHUNK + lx, near = Math.hypot(x + .5 - SPAWN.x, z + .5 - SPAWN.z);
    const bb = biomeAtXZ(x, z), b = bb.b, bi = BIOMES[b];
    c.biome[i] = b; c.biome2[i] = bb.b2; c.edge[i] = Math.round(bb.edge * 255);
    const [t, f] = waterAt(x, z, b, near);
    c.tiles[i] = t; c.flow[i] = f;
    if (t) continue;
    // surface ore: starter deposits near the landing site, the biome's own further out, stray uranium anywhere far off
    const k = key(x, 0, z);
    let ore = null;
    if (near < 80) { const st = starterAt(x, z, 0); if (st) ore = [st[0], 1, st[2]]; }
    else {
      const p = pickOre(bi.ores, x, z, 0) || pickOre(STRAY_ORES, x, z, 0);
      if (p && hash(x, z, s + 211) > Math.max(0, fuller() ? .12 - p[2] * 8 : .35 - p[2] * 6)) ore = [p[0], p[1].rich ?? 1, Math.max(0, 1 - p[2] * 12)];
    }
    if (ore) { addOre(c, k, ore[0], richBase(x, z, ore[1], ore[2], hash(x, z, s + 300)), E); continue; }
    if (near < 6) continue;
    // trees and rocks; a small wood and two rocks always stand a short walk from the landing site
    let ft = null;
    const grove = Math.hypot(x + .5 - (SPAWN.x + 9), z + .5 - (SPAWN.z - 7)) < 3.4;
    if (grove) { if (hash(x, z, s + 91) < .55) ft = Object.keys(bi.trees).find(t2 => FEATURES[t2].tool === 'axe') || 'tree'; }
    else if ([[-7, 3], [-6, 6]].some(([dx, dz]) => Math.floor(SPAWN.x + dx) === x && Math.floor(SPAWN.z + dz) === z)) ft = bi.rockKind || 'rock';
    else if (near > 12) {
      const forest = fbm(x / 34, z / 34, s + 93, 2), p = bi.treeDensity * Math.max(0, Math.min(1, (forest - .4) * 4)) * .55;
      if (hash(x, z, s + 95) < p) ft = weighted(bi.trees, hash(x, z, s + 97));
      else if (hash(x, z, s + 99) < bi.rocks) ft = bi.rockKind || 'rock';
    }
    if (ft) { if (!E.feats.has(k)) { world.feats.set(k, { type: ft, v: hash(x, z, s + 101) }); c.feats.push(k); } continue; }
    if (vn(x / 4.2, z / 4.2, s + 103) > .86 - bi.patches * 1.6 && hash(x, z, s + 105) > .2 && !E.patches.has(x + ',' + z)) c.patch[i] = 1;
  }
  // oil: the wells of every field whose cell reaches into this chunk
  const g0x = Math.floor((c.x0 - 12) / OIL_CELL), g1x = Math.floor((c.x0 + CHUNK + 12) / OIL_CELL), g0z = Math.floor((c.z0 - 12) / OIL_CELL), g1z = Math.floor((c.z0 + CHUNK + 12) / OIL_CELL);
  for (let gx = g0x; gx <= g1x; gx++) for (let gz = g0z; gz <= g1z; gz++) for (const [x, z, y] of oilWells(gx, gz)) {
    if (x < c.x0 || z < c.z0 || x >= c.x0 + w || z >= c.z0 + h) continue;
    const i = (z - c.z0) * CHUNK + (x - c.x0), ok = x + ',' + z;
    if (c.tiles[i] || world.ores.has(key(x, 0, z)) || world.oil.has(ok)) continue;
    const fk = key(x, 0, z); if (world.feats.has(fk)) { world.feats.delete(fk); c.feats.splice(c.feats.indexOf(fk), 1); }
    c.patch[i] = 0;
    world.oil.set(ok, { yield: E.oil.get(ok) ?? y }); c.oil.push(ok);
  }
}
// The two underground layers of a chunk are only made when something looks at them or builds there (see underOf in
// state.js): most of a big world is never dug into.
function genUnder(c) {
  if (c.under) return;
  c.under = true;
  if (!G()) return;   // old worlds keep their underground deposits in the save
  const E = world.edits, s = G().seed, w = Math.min(CHUNK, GRID - c.x0), h = Math.min(CHUNK, GRID - c.z0);
  for (let lz = 0; lz < h; lz++) for (let lx = 0; lx < w; lx++) {
    const x = c.x0 + lx, z = c.z0 + lz, bi = BIOMES[c.biome[lz * CHUNK + lx]], near = Math.hypot(x + .5 - SPAWN.x, z + .5 - SPAWN.z);
    for (const y of [-1, -2]) {
      const st = near < 80 ? starterAt(x, z, y) : null;
      let ore = null;
      if (st) ore = [st[0], st[1], st[2]];
      else if (near > 45) { const p = pickOre(y === -1 ? bi.under : bi.deep, x, z, y); if (p) ore = [p[0], p[1].rich ?? 1, Math.max(0, 1 - p[2] * 12)]; }
      if (ore) addOre(c, key(x, y, z), ore[0], richBase(x, z, ore[1], ore[2], hash(x, z, s + 300 + y)), E);
    }
  }
}
function addOre(c, k, type, base, E) {
  const o = newDeposit(type, Math.max(40, base)), ed = E.ores.get(k);
  if (ed) { o.layer = ed[0]; o.amount = ed[1]; }
  world.ores.set(k, o); c.ores.push(k);
}
function weighted(table, r) {
  const list = Object.entries(table), tot = list.reduce((t, [, w]) => t + w, 0);
  let acc = 0; for (const [id, w] of list) { acc += w / tot; if (r < acc) return id; }
  return list[list.length - 1][0];
}
// A world from before chunks: its tiles live in world.tiles / world.flow and its objects are already in the maps.
function legacyChunk(c) {
  const w = Math.min(CHUNK, GRID - c.x0), h = Math.min(CHUNK, GRID - c.z0);
  for (let lz = 0; lz < h; lz++) for (let lx = 0; lx < w; lx++) {
    const x = c.x0 + lx, z = c.z0 + lz, i = lz * CHUNK + lx, j = z * GRID + x;
    c.tiles[i] = world.tiles?.[j] ?? 0; c.flow[i] = world.flow?.[j] ?? -1;
    for (const y of [0, -1, -2]) if (world.ores.has(key(x, y, z))) c.ores.push(key(x, y, z));
    const k = key(x, 0, z);
    if (world.feats.has(k)) c.feats.push(k);
    if (world.oil.has(x + ',' + z)) c.oil.push(x + ',' + z);
    if (!c.tiles[i] && !world.ores.has(k) && !world.feats.has(k) && !world.oil.has(x + ',' + z) && Math.hypot(x + .5 - SPAWN.x, z + .5 - SPAWN.z) > 6
      && vn(x / 4.2, z / 4.2, S.seed + 103) > .7 && hash(x, z, S.seed + 105) > .2 && !world.edits.patches.has(x + ',' + z)) c.patch[i] = 1;
  }
}
setChunkGen(genChunk, genUnder);

// Generate every chunk within r tiles of (x, z): used around players (charting the map) and before loading buildings.
export function ensureChunks(x, z, r = 0) {
  const C = CHUNK;
  for (let cx = Math.floor((x - r) / C); cx <= Math.floor((x + r) / C); cx++) for (let cz = Math.floor((z - r) / C); cz <= Math.floor((z + r) / C); cz++) {
    if (cx < 0 || cz < 0 || cx * C >= GRID || cz * C >= GRID || world.chunks.has(chunkKey(cx, cz))) continue;
    genChunk(cx, cz);
  }
}

// ---------------------------------------------------------------- new worlds
// opts: { size, seed, biomes ('small' | 'normal' | 'large'), water ('low' | 'normal' | 'high'), ores ('poor' | ...) }
export function newWorld(opts = {}) {
  const size = Math.max(WORLD.min, Math.min(WORLD.max, Math.round(+opts.size || WORLD.size)));
  const seed = Number.isFinite(+opts.seed) && opts.seed !== '' ? Math.floor(+opts.seed) >>> 0 : seedFromText(opts.seed);
  setWorldSize(size);
  world.gen = { v: 2, size, seed, biomeScale: WORLD.biomeScale[opts.biomes] ?? WORLD.biomeScale.normal, water: WORLD.water[opts.water] ?? 1, ores: WORLD.ores[opts.ores] ?? 1,
    opts: { biomes: opts.biomes || 'normal', water: opts.water || 'normal', ores: opts.ores || 'normal' } };
  resetWorldMaps();
  S.seed = seed;
  const sp = findSpawn();
  SPAWN.x = sp[0] + .5; SPAWN.z = sp[1] + .5; world.gen.spawn = [SPAWN.x, SPAWN.z];
  ensureChunks(SPAWN.x, SPAWN.z, 48);
}
// Load a generated world's settings from a save (its chunks come back as they are asked for).
export function loadWorldGen(gen, edits) {
  setWorldSize(gen.size);
  world.gen = { ...gen };
  resetWorldMaps();
  S.seed = gen.seed;
  SPAWN.x = gen.spawn[0]; SPAWN.z = gen.spawn[1];
  const E = world.edits;
  for (const k of edits?.feats || []) E.feats.add(k);
  for (const [k, l, a] of edits?.ores || []) E.ores.set(k, [l, a]);
  for (const [k, y] of edits?.oil || []) E.oil.set(k, y);
  for (const k of edits?.patches || []) E.patches.add(k);
}
export function resetWorldMaps() {
  world.chunks.clear(); world.ores.clear(); world.feats.clear(); world.oil.clear();
  world.edits = { feats: new Set(), ores: new Map(), oil: new Map(), patches: new Set() };
  world.chunkVersion = (world.chunkVersion || 0) + 1;
}
export const editsToJSON = () => ({ feats: [...world.edits.feats], ores: [...world.edits.ores].map(([k, [l, a]]) => [k, l, Math.round(a)]),
  oil: [...world.edits.oil].map(([k, y]) => [k, +y.toFixed(2)]), patches: [...world.edits.patches] });
function seedFromText(t) {
  if (!t) return Math.floor(Math.random() * 1e9);
  let h = 2166136261; for (const ch of String(t)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return h >>> 0;
}
// The landing site: dry ground in a livable biome, as near the middle of the world as can be found.
function findSpawn() {
  const C = GRID / 2, sea = seaLevel();
  let best = null, bs = -1e9;
  const tryAt = (x, z, strict) => {
    if (x < 70 || z < 70 || x > GRID - 70 || z > GRID - 70) return;
    const b = BIOMES[biomeAtXZ(x, z).b];
    if (!b.spawn) return;
    if (strict) {   // livable all around too: nothing harsh within 60 tiles, and mostly livable out to 120
      let ok = 0;
      for (let a = 0; a < 12; a++) {
        if (!BIOMES[biomeAtXZ(x + Math.cos(a * .52) * 60, z + Math.sin(a * .52) * 60).b].spawn) return;
        if (BIOMES[biomeAtXZ(x + Math.cos(a * .52) * 120, z + Math.sin(a * .52) * 120).b].spawn) ok++;
      }
      if (ok < 9) return;
    }
    for (let a = 0; a < 8; a++) if (elevation(x + Math.cos(a * .785) * 46, z + Math.sin(a * .785) * 46) < sea + .015) return;
    const score = b.spawn * 2 - Math.hypot(x - C, z - C) / Math.max(200, GRID * .15);
    if (score > bs) { bs = score; best = [Math.floor(x), Math.floor(z)]; }
  };
  // strictly first; a small or harsh world falls back to any livable tile
  for (const strict of [true, false]) {
    for (let r = 0, n = 0; r < GRID / 2 && n < 1500; r += 24) {
      const steps = Math.max(1, Math.round(r * 2 * Math.PI / 24));
      for (let i = 0; i < steps; i++, n++) tryAt(C + Math.cos(i / steps * Math.PI * 2) * r, C + Math.sin(i / steps * Math.PI * 2) * r, strict);
      if (best && r > 200) break;
    }
    if (best) break;
  }
  return best || [Math.floor(C), Math.floor(C)];
}

// ---------------------------------------------------------------- ground colours
// Each tile's ground palette is the blend of the biomes actually around it (a blur over BLUR tiles each way), so
// a border fades evenly into whatever lies across it. Cached on the chunk: c.ground[(i * 4 + band) * 3 + rgb].
const BLUR = 4;
export function groundColors(c) {
  if (c.ground) return c.ground;
  const W = CHUNK + BLUR * 2, base = new Float32Array(W * W * 12), tmp = new Float32Array(W * W * 12);
  for (let z = 0; z < W; z++) for (let x = 0; x < W; x++) {
    const tx = Math.min(GRID - 1, Math.max(0, c.x0 + x - BLUR)), tz = Math.min(GRID - 1, Math.max(0, c.z0 + z - BLUR));
    const cc = world.chunks.get(chunkKey(Math.floor(tx / CHUNK), Math.floor(tz / CHUNK))) || genChunk(Math.floor(tx / CHUNK), Math.floor(tz / CHUNK));
    const pal = BIOMES[cc.biome[(tz - cc.z0) * CHUNK + (tx - cc.x0)]].ground.pal, o = (z * W + x) * 12;
    for (let b = 0; b < 4; b++) for (let q = 0; q < 3; q++) base[o + b * 3 + q] = pal[b][q];
  }
  const k = 1 / (BLUR * 2 + 1);   // a box blur along x, then along z
  for (let z = 0; z < W; z++) for (let x = BLUR; x < W - BLUR; x++) for (let j = 0; j < 12; j++) { let t = 0; for (let d = -BLUR; d <= BLUR; d++) t += base[(z * W + x + d) * 12 + j]; tmp[(z * W + x) * 12 + j] = t * k; }
  const out = new Float32Array(CHUNK * CHUNK * 12);
  for (let z = 0; z < CHUNK; z++) for (let x = 0; x < CHUNK; x++) for (let j = 0; j < 12; j++) { let t = 0; for (let d = -BLUR; d <= BLUR; d++) t += tmp[((z + BLUR + d) * W + x + BLUR) * 12 + j]; out[(z * CHUNK + x) * 12 + j] = t * k; }
  return (c.ground = out);
}

// ---------------------------------------------------------------- what a tile is like (for hover info and seeds)
export const biomeOf = (x, z) => BIOMES[world.chunks.get(chunkKey(Math.floor(x / CHUNK), Math.floor(z / CHUNK)))?.biome[(Math.floor(z) & 31) * CHUNK + (Math.floor(x) & 31)] ?? 0];
export const groundName = (x, z) => G() ? biomeOf(x, z).ground.name : TILES[0].name;
