// The map. The surface is drawn one pixel per tile into a cached canvas per world chunk, and only chunks that changed
// are redrawn, from a set of dirty chunks (never a sweep over the whole world), nearest the view first, within a time
// budget each frame. Detail follows the zoom (lodAt, shared with alt mode): zoomed far out it draws whole regions of
// 8×8 chunks at a quarter of the resolution, made from the chunk pictures; zoomed far in it shows a rendered close-up
// of the real scene (where the world is loaded). Buildings are indexed by chunk, so a chunk's picture only looks at
// its own buildings. The minimap shows the area around you (wheel zooms it); the big map (M, or click the minimap)
// zooms and pans over everything, holds markers and labelled areas, and switches views: terrain, resources,
// production, power and factories.
//
// Exploring (explore.js): a tile is drawn only once someone has seen it, and is redrawn only while it is live (near an
// engineer or a working radar); everywhere else the picture keeps what was last seen there, dimmed a little so live and
// stale read apart. Each chunk keeps its own pixels for that. Explored chunks that aren't in memory (after loading a
// save) are made again as the view needs them, a couple a frame.
import { ENTITIES, ITEMS, TILES, VOLTAGES, ROADS, VEHICLES, FRAMES, BIOMES } from './data.js';
import { S, world, bus, key, GRID, LAYER_MAX, factoryOf, CHUNK, chunkKey, tileAt, tilesOf, lodAt } from './state.js';
import { nets, voltsOf } from './sim.js';
import { powerProblem, renderGlimpse, glimpseReady } from './scene.js';
import { doAction } from './net.js';
import { iconHTML, fmtN } from './icons.js';
import { FEATURES } from './data.js';
import { groundColors } from './worldgen.js';
import { isLive, chunkLive, liveAreas } from './explore.js';
import { chunkOf } from './state.js';

const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const setHTML = (el, html) => { if (el._html !== html) { el.innerHTML = html; el._html = html; } };
const MODES = [['terrain', 'Terrain'], ['resources', 'Resources'], ['production', 'Production'], ['power', 'Power'], ['factories', 'Factories']];
const TOOLS = [['pan', 'Move'], ['marker', 'Marker'], ['area', 'Area'], ['assign', 'Assign']];
const ZOOM = [.25, .5, 1, 2, 3, 4, 6, 8, 12, 16, 24, 32];
const COLORS = ['#ffd23f', '#7ef6ff', '#9be37a', '#ff8a3d', '#ff5a7a', '#b07ad8', '#e8ecf2'];
const view = { cx: 48, cz: 48, ppt: 6 };
let mode = 'terrain', tool = 'pan', selected = null;

// ---------------------------------------------------------------- tile colours
const rgb = h => [h >> 16 & 255, h >> 8 & 255, h & 255];
const mix = (a, b, k) => a.map((v, i) => v + (b[i] - v) * k);
const shade = (c, k) => c.map(v => v * k);
const hashT = (x, z) => { let h = Math.imul(x, 374761393) + Math.imul(z, 668265263); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967295; };
const LEGACY_GROUND = rgb(TILES[0].map), TREE = rgb(0x2f5a2a), ROCK = rgb(0x7a7066), FRAME = rgb(0x8f9aa6);
const STATUS = { ok: rgb(0x6ac46a), idle: rgb(0xd8b84a), bad: rgb(0xe0503a), none: rgb(0x5c6470) };
const PROBLEM = /no power|out of fuel|not connected|no water|no steam|missing|exhausted|blocked|full|nothing/;
// The building drawn for a tile: the highest one standing there (above ground), from the chunk's own index.
function topThing(x, z, tops) { return tops?.get(x + ',' + z) || null; }
function entColor(e) {
  if (e.kind === 'frame') return FRAME;
  const c = rgb(ENTITIES[e.type].color);
  return e.belt ? shade(c, .75) : c;
}
const OIL = rgb(0x231c2a), RAIL = rgb(0x9a8a76);
const hexRgb = h => rgb(parseInt((h || '#888888').slice(1), 16));
function tileColor(x, z, ch, tops) {
  const i = (z - ch.z0) * CHUNK + (x - ch.x0), k = key(x, 0, z), t = TILES[ch.tiles[i]], v = .92 + hashT(x, z) * .14;
  const gc = world.gen && groundColors(ch), GROUND = gc ? [gc[i * 12 + 3], gc[i * 12 + 4], gc[i * 12 + 5]] : LEGACY_GROUND;   // blended like the ground
  const ore = world.ores.get(k), feat = world.feats.get(k), e = topThing(x, z, tops), road = world.roads.get(x + ',' + z), oil = world.oil.get(x + ',' + z);
  let c = t.liquid ? rgb(t.map) : shade(GROUND, v);
  if (road) c = shade(ROADS[road.s]?.paint ?? GROUND, ROADS[road.s]?.walk ? 1.05 : 1.15);
  if (mode === 'factories') {
    c = t.liquid ? shade(c, .55) : shade(mix(c, [60, 60, 60], .6), .55);
    if (road) c = shade(ROADS[road.s]?.paint ?? GROUND, .7);
    if (e && e.kind !== 'frame') c = e.kind === 'rail' ? RAIL : ENTITIES[e.type].shared ? shade(entColor(e), .6) : hexRgb(factoryOf(e.fac ?? 1)?.color);
    return c;
  }
  if (mode === 'terrain') {
    if (ore) c = mix(c, rgb(ITEMS[ore.type].color), .7);
    if (oil) c = OIL;
    if (feat) c = FEATURES[feat.type]?.tool === 'pickaxe' ? ROCK : shade(TREE, v);
    if (e) c = e.kind === 'rail' ? RAIL : entColor(e);
  } else if (mode === 'resources') {
    c = t.liquid ? shade(c, .7) : shade(mix(c, [70, 70, 70], .5), .6);
    if (ore) c = mix(rgb(ITEMS[ore.type].color), [255, 255, 255], Math.min(.35, ore.amount / 4000));
    else if (oil) c = mix([60, 30, 90], [200, 160, 255], Math.min(.6, oil.yield / 300));
    else if (e) c = mix(c, entColor(e), .3);
  } else {
    c = t.liquid ? shade(c, .55) : shade(mix(c, [60, 60, 60], .6), .5);
    if (ore && mode === 'production') c = mix(c, rgb(ITEMS[ore.type].color), .2);
    if (e && e.kind !== 'frame') c = mode === 'production' ? prodColor(e) : powerColor(e);
    else if (e) c = shade(FRAME, .5);
  }
  return c;
}
function prodColor(e) {
  if (e.belt) return S.T - e.lastActive < 1 && e.nItems ? STATUS.ok : STATUS.none;
  if (e.kind === 'pole' || e.kind === 'chest') return STATUS.none;
  if (PROBLEM.test(e.status || '')) return STATUS.bad;
  return S.T - e.lastActive < 1.5 ? STATUS.ok : STATUS.idle;
}
function powerColor(e) {
  const def = ENTITIES[e.type];
  if (e.kind === 'pole') return voltsOf(def).length > 1 ? rgb(0x9fd0ff) : rgb(VOLTAGES[voltsOf(def)[0]].wire);
  if (def.out || e.kind === 'solar') return e.net ? rgb(0xffd23f) : STATUS.bad;
  if (e.kind === 'boiler' || e.kind === 'pump') return rgb(0xd8883a);
  const p = def.power ? powerProblem(e) : 'n/a';
  return p === 'n/a' ? STATUS.none : p === 'none' ? STATUS.bad : p === 'low' ? STATUS.idle : STATUS.ok;
}

// ---------------------------------------------------------------- chunk cache
// One small canvas per world chunk, made only for chunks that exist (where someone has been: the charted area).
const CH = CHUNK, REG = 8, chunks = new Map(), dirty = new Set(), regions = new Map(), regDirty = new Set();
function mapChunk(k) {
  let c = chunks.get(k);
  if (!c) { const cv = document.createElement('canvas'); cv.width = cv.height = CH; c = { cv, ctx: cv.getContext('2d'), built: false }; chunks.set(k, c); }
  return c;
}
const markDirty = k => { if (world.chunks.has(k)) dirty.add(k); };
const dirtyAt = (x, z) => markDirty(chunkKey(Math.floor(x / CH), Math.floor(z / CH)));
// A new view mode redraws every explored tile once in it (`redo`), stale ones from what is known now.
const dirtyAll = () => { for (const k of world.chunks.keys()) { dirty.add(k); const c = chunks.get(k); if (c) c.redo = true; } };
// buildings by chunk: chunkKey -> Set of buildings (and frames) with a tile in it
const byChunk = new Map();
const chunksOf = e => new Set(tilesOf(e).map(([x, z]) => chunkKey(Math.floor(x / CH), Math.floor(z / CH))));
function indexEnt(e, on) {
  for (const k of chunksOf(e)) { let set = byChunk.get(k); if (on) { if (!set) byChunk.set(k, set = new Set()); set.add(e); } else set?.delete(e); markDirty(k); }
}
let indexed = false;
function reindex() { byChunk.clear(); for (const e of world.ents.values()) indexEnt(e, true); for (const f of world.frames.values()) indexEnt(f, true); indexed = true; }
// newly made world chunks get drawn too: they are found when the world's chunk count changes, not by sweeping it
let seenVersion = -1;
function noticeNewChunks() {
  if (seenVersion === world.chunkVersion) return;
  seenVersion = world.chunkVersion;
  for (const k of world.chunks.keys()) if (!chunks.get(k)?.built) dirty.add(k);
}
function buildChunk(k, c) {
  const wc = world.chunks.get(k); if (!wc) return;
  const ex = world.explored.get(k), live = chunkLive(wc.cx, wc.cz), redo = c.redo; c.redo = false;
  const tops = new Map();   // the highest building on each tile of this chunk
  for (const e of byChunk.get(k) || []) if (e.y >= 0) for (const [x, z] of tilesOf(e)) { const t = tops.get(x + ',' + z); if (!t || e.y > t.y || (e.y === t.y && t.kind === 'frame')) tops.set(x + ',' + z, e); }
  const img = c.img ||= c.ctx.createImageData(CH, CH), d = img.data, seen = c.seen ||= new Uint8Array(CH * CH);
  for (let dz = 0; dz < CH; dz++) for (let dx = 0; dx < CH; dx++) {
    const x = wc.x0 + dx, z = wc.z0 + dz, i = dz * CH + dx, j = i * 4; if (x >= GRID || z >= GRID) continue;
    if (!ex || !(ex.full || ex[i >> 3] & (1 << (i & 7)))) { d[j + 3] = 0; seen[i] = 0; continue; }   // never seen: blank
    if (seen[i] && !redo && !(live && isLive(x, z))) continue;   // seen before, not watched now: as it was
    const col = tileColor(x, z, wc, tops);
    d[j] = col[0]; d[j + 1] = col[1]; d[j + 2] = col[2]; d[j + 3] = 255; seen[i] = 1;
  }
  c.ctx.putImageData(img, 0, 0); c.built = true;
  regDirty.add(regionKey(k));
}
// Regions: 8×8 chunks drawn a pixel per 4×4 tiles, for zoomed-out views.
const regionKey = k => chunkKey(Math.floor((k % 4096) / REG), Math.floor(Math.floor(k / 4096) / REG));
function buildRegion(rk) {
  let r = regions.get(rk);
  if (!r) { const cv = document.createElement('canvas'); cv.width = cv.height = REG * CH / 4; r = { cv, ctx: cv.getContext('2d') }; r.ctx.imageSmoothingEnabled = true; regions.set(rk, r); }
  const rx = rk % 4096, rz = Math.floor(rk / 4096), s2 = CH / 4;
  r.ctx.clearRect(0, 0, r.cv.width, r.cv.height);
  for (let i = 0; i < REG; i++) for (let j = 0; j < REG; j++) { const c = chunks.get(chunkKey(rx * REG + i, rz * REG + j)); if (c?.built) r.ctx.drawImage(c.cv, i * s2, j * s2, s2, s2); }
  r.built = true;
}
// Redraw stale chunks (and then regions) for at most `ms` milliseconds, nearest the view first.
let wantView = null;
// Explored chunks in view that aren't in memory are made again from the seed, nearest first, a couple at a time.
let viewRect = null;
function loadExplored() {
  if (!viewRect) return;
  const [x0, z0, x1, z1] = viewRect, want = [];
  for (let cx = Math.max(0, Math.floor(x0 / CH)); cx <= Math.floor(x1 / CH); cx++) for (let cz = Math.max(0, Math.floor(z0 / CH)); cz <= Math.floor(z1 / CH); cz++) {
    const k = chunkKey(cx, cz); if (world.explored.has(k) && !world.chunks.has(k) && cx * CH < GRID && cz * CH < GRID) want.push([cx, cz]);
  }
  const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2;
  want.sort((a, b) => Math.hypot(a[0] * CH - mx, a[1] * CH - mz) - Math.hypot(b[0] * CH - mx, b[1] * CH - mz));
  for (const [cx, cz] of want.slice(0, 2)) chunkOf(cx * CH, cz * CH);
}
function refreshChunks(ms) {
  if (!indexed) reindex();
  loadExplored();
  noticeNewChunks();
  const t0 = performance.now(), v = wantView || { cx: S.player.x, cz: S.player.z };
  const dist = k => Math.hypot((k % 4096) * CH + 16 - v.cx, Math.floor(k / 4096) * CH + 16 - v.cz);
  while (dirty.size && performance.now() - t0 < ms) {
    let best = null, bd = Infinity, n = 0;   // the nearest few, without sorting the whole set
    for (const k of dirty) { const d = dist(k) - (chunks.get(k)?.built ? 0 : 1e6); if (d < bd) { bd = d; best = k; } if (++n > 400) break; }
    dirty.delete(best); buildChunk(best, mapChunk(best));
  }
  for (const rk of regDirty) { if (performance.now() - t0 > ms * 1.5) break; regDirty.delete(rk); buildRegion(rk); }
}
for (const ev of ['placed', 'removed']) bus.on(ev, e => { if (indexed) indexEnt(e, ev === 'placed'); });
bus.on('remesh', e => {
  if (indexed && e.foot) { const now = chunksOf(e); for (const [k, set] of byChunk) if (set.has(e) && !now.has(k)) { set.delete(e); markDirty(k); } indexEnt(e, true); }   // a footprint can move or shrink
  for (const [x, z] of tilesOf(e)) dirtyAt(x, z);
});
bus.on('ore', (x, y, z) => { if (y === 0) dirtyAt(x, z); });
bus.on('feat', (x, z) => dirtyAt(x, z));
bus.on('patch', (x, z) => dirtyAt(x, z));
bus.on('marks', () => { if (S.modal === 'map') renderSide(true); });
bus.on('roads', list => { for (const [x, z] of list || []) dirtyAt(x, z); });
bus.on('factories', () => { if (mode === 'factories') dirtyAll(); });
bus.on('explored', list => { for (const k of list) markDirty(k); });   // newly seen tiles get drawn
// Live chunks are redrawn now and then even with nothing announced, so what they show keeps up (ore dug, machines
// working); everything else waits until someone or a radar is near again.
function dirtyLive() { for (const k of chunks.keys()) if (chunkLive(k % 4096, Math.floor(k / 4096))) markDirty(k); }
export function resetMap() { viewRect = null; chunks.clear(); regions.clear(); dirty.clear(); regDirty.clear(); byChunk.clear(); indexed = false; seenVersion = -1; hist.length = 0; selected = null; }
// Production and power colours change as machines work: only chunks with buildings in them are redrawn for that (and
// only their live tiles change).
const dirtyBuilt = () => { for (const [k, set] of byChunk) if (set.size) markDirty(k); };

// ---------------------------------------------------------------- drawing
// Also used by the logistics window, which draws its routes on top through `overlay(sx, sz)`.
export function drawMapView(ctx, W, H, v, big, overlay) { wantView = v; refreshChunks(4); drawWorld(ctx, W, H, v, big, overlay); }
// The close-up: the rendered scene around the view's middle, two screen pixels to a rendered one (as the game draws).
const glimpse = { yaw: 0, pitch: .82, t: -1, cv: null, key: '' };
// On the minimap it fills the whole frame; on the big map it is a framed square in the middle. Returns whether it drew.
function drawGlimpse(ctx, W, H, v, big) {
  const size = big ? Math.min(W, H) * .72 : Math.min(W, H), x0 = (W - size) / 2, y0 = (H - size) / 2;
  if (!glimpseReady(v.cx, v.cz)) {
    if (big) { ctx.fillStyle = 'rgba(11,13,18,.75)'; ctx.fillRect(x0, y0 + size / 2 - 14, size, 28); ctx.fillStyle = '#7d8796'; ctx.font = '18px VT323, monospace'; ctx.textAlign = 'center'; ctx.fillText('too far away to see up close', W / 2, y0 + size / 2 - 9); ctx.textAlign = 'left'; }
    return false;
  }
  if (!big) {   // the minimap: the whole frame is the close-up
    const depth = S.mode === 'depth', yaw = depth ? S.cam.yaw : 0, pitch = depth ? S.cam.pitch : .82;
    const key3 = [v.cx.toFixed(2), v.cz.toFixed(2), v.ppt, W, H, yaw.toFixed(3), pitch.toFixed(3), S.layer].join();
    if (key3 !== glimpse.key || S.T - glimpse.t > .12) { glimpse.cv = renderGlimpse(v.cx, v.cz, W / 2, H / 2, v.ppt / 2, yaw, pitch); glimpse.t = S.T; glimpse.key = key3; }
    ctx.imageSmoothingEnabled = false; ctx.drawImage(glimpse.cv, 0, 0, W, H);
    return true;
  }
  const depth = S.mode === 'depth', yaw = depth ? glimpse.yaw : S.cam.yaw, pitch = depth ? glimpse.pitch : .82;
  const key2 = [v.cx.toFixed(2), v.cz.toFixed(2), v.ppt, size, yaw.toFixed(3), pitch.toFixed(3), S.layer].join();
  if (key2 !== glimpse.key || S.T - glimpse.t > .12) { glimpse.cv = renderGlimpse(v.cx, v.cz, size / 2, size / 2, v.ppt / 2, yaw, pitch); glimpse.t = S.T; glimpse.key = key2; }
  ctx.imageSmoothingEnabled = false; ctx.drawImage(glimpse.cv, x0, y0, size, size);
  ctx.strokeStyle = '#7ef6ff'; ctx.lineWidth = 2; ctx.strokeRect(x0 + 1, y0 + 1, size - 2, size - 2);
  return true;
}
// Stale parts of the map are dimmed a little; live circles (engineers, radars) stay clear, with a faint rim.
const dimCv = document.createElement('canvas'), dimCtx = dimCv.getContext('2d');
function drawLive(ctx, W, H, sx, sz, ppt) {
  if (dimCv.width !== W || dimCv.height !== H) { dimCv.width = W; dimCv.height = H; }
  dimCtx.globalCompositeOperation = 'source-over'; dimCtx.clearRect(0, 0, W, H);
  dimCtx.fillStyle = 'rgba(6,8,14,.34)'; dimCtx.fillRect(0, 0, W, H);
  dimCtx.globalCompositeOperation = 'destination-out'; dimCtx.fillStyle = '#000';
  const areas = liveAreas();
  for (const a of areas) { dimCtx.beginPath(); dimCtx.arc(sx(a.x), sz(a.z), a.r * ppt, 0, Math.PI * 2); dimCtx.fill(); }
  ctx.drawImage(dimCv, 0, 0);
  ctx.lineWidth = 1;
  for (const a of areas) { ctx.strokeStyle = a.radar ? 'rgba(126,246,255,.32)' : 'rgba(216,224,234,.18)'; ctx.setLineDash(a.radar ? [4, 4] : []); ctx.beginPath(); ctx.arc(sx(a.x), sz(a.z), a.r * ppt, 0, Math.PI * 2); ctx.stroke(); }
  ctx.setLineDash([]);
}
function drawWorld(ctx, W, H, v, big, overlay) {
  viewRect = [v.cx - W / 2 / v.ppt, v.cz - H / 2 / v.ppt, v.cx + W / 2 / v.ppt, v.cz + H / 2 / v.ppt];
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = '#0b0d12'; ctx.fillRect(0, 0, W, H);
  const sx = x => (x - v.cx) * v.ppt + W / 2, sz = z => (z - v.cz) * v.ppt + H / 2, lod = lodAt(v.ppt);
  ctx.fillStyle = '#12151c'; ctx.fillRect(Math.floor(sx(0)), Math.floor(sz(0)), GRID * v.ppt, GRID * v.ppt);   // the uncharted world
  if (lod === 'regions') {   // far out: whole regions, a quarter of the detail, far fewer pictures to draw
    const R = REG * CH, x0 = Math.max(0, Math.floor((v.cx - W / 2 / v.ppt) / R)), x1 = Math.floor((v.cx + W / 2 / v.ppt) / R), z0 = Math.max(0, Math.floor((v.cz - H / 2 / v.ppt) / R)), z1 = Math.floor((v.cz + H / 2 / v.ppt) / R);
    ctx.imageSmoothingEnabled = true;
    for (let rx = x0; rx <= x1; rx++) for (let rz = z0; rz <= z1; rz++) { const r = regions.get(chunkKey(rx, rz)); if (r?.built) ctx.drawImage(r.cv, Math.floor(sx(rx * R)), Math.floor(sz(rz * R)), Math.ceil(R * v.ppt), Math.ceil(R * v.ppt)); }
    ctx.imageSmoothingEnabled = false;
  } else {
    const x0 = Math.max(0, Math.floor((v.cx - W / 2 / v.ppt) / CH)), x1 = Math.floor((v.cx + W / 2 / v.ppt) / CH), z0 = Math.max(0, Math.floor((v.cz - H / 2 / v.ppt) / CH)), z1 = Math.floor((v.cz + H / 2 / v.ppt) / CH);
    for (let cx = x0; cx <= x1; cx++) for (let cz = z0; cz <= z1; cz++) {
      const c = chunks.get(chunkKey(cx, cz)); if (!c?.built) continue;
      const size = CH * v.ppt; ctx.drawImage(c.cv, Math.floor(sx(cx * CH)), Math.floor(sz(cz * CH)), Math.ceil(size), Math.ceil(size));
    }
    // zoomed right in: the close-up. On the minimap it is the whole picture, with nothing drawn over it
    if (lod === 'close' && mode === 'terrain' && !overlay && drawGlimpse(ctx, W, H, v, big) && !big) return;
  }
  if (world.gen || world.explored.size) drawLive(ctx, W, H, sx, sz, v.ppt);
  ctx.strokeStyle = '#2a3140'; ctx.lineWidth = 1; ctx.strokeRect(Math.floor(sx(0)) + .5, Math.floor(sz(0)) + .5, GRID * v.ppt, GRID * v.ppt);
  if (mode === 'power') for (const n of nets) {   // supply areas, one colour per network
    ctx.fillStyle = `hsla(${(n.id * 137) % 360}, 80%, 60%, .16)`;
    for (const p of n.poles) { if (p.y < 0) continue; const s = ENTITIES[p.type].supply; ctx.fillRect(sx(p.x - s), sz(p.z - s), (s * 2 + 1) * v.ppt, (s * 2 + 1) * v.ppt); }
  }
  ctx.font = `${big ? 18 : 14}px VT323, monospace`; ctx.textBaseline = 'top';
  for (const a of world.marks.areas) {
    const x = sx(a.x0), z = sz(a.z0), w = (a.x1 - a.x0 + 1) * v.ppt, h = (a.z1 - a.z0 + 1) * v.ppt;
    ctx.globalAlpha = .18; ctx.fillStyle = a.color; ctx.fillRect(x, z, w, h); ctx.globalAlpha = 1;
    ctx.strokeStyle = a.color; ctx.lineWidth = selected === a.id ? 3 : 1.5; ctx.strokeRect(x, z, w, h);
    if (big || w > 40) { ctx.fillStyle = a.color; ctx.fillText(a.name, x + 4, z + 3); }
  }
  for (const m of world.marks.markers) {
    const x = sx(m.x + .5), z = sz(m.z + .5);
    ctx.fillStyle = '#000'; ctx.beginPath(); ctx.arc(x, z - 7, 6, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = m.color; ctx.beginPath(); ctx.arc(x, z - 7, 4.5, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.moveTo(x - 3, z - 4); ctx.lineTo(x + 3, z - 4); ctx.lineTo(x, z + 1); ctx.fill();
    if (selected === m.id) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, z - 7, 9, 0, Math.PI * 2); ctx.stroke(); }
    if (big) { ctx.fillStyle = '#000'; ctx.fillText(m.name, x + 9, z - 15); ctx.fillStyle = m.color; ctx.fillText(m.name, x + 8, z - 16); }
  }
  // vehicles: a rotated block in their colour
  for (const vh of world.vehicles) {   // only where the map is live: elsewhere nobody knows where they are now
    const fr = FRAMES[VEHICLES[vh.type]?.frame]; if (!fr || !isLive(Math.floor(vh.rx ?? vh.x), Math.floor(vh.rz ?? vh.z))) continue;
    ctx.save(); ctx.translate(sx(vh.rx ?? vh.x), sz(vh.rz ?? vh.z)); ctx.rotate(-(vh.ra ?? vh.ang));
    const w = Math.max(3, v.ppt * .5), l = Math.max(4, v.ppt * fr.len);
    ctx.fillStyle = '#000'; ctx.fillRect(-w / 2 - 1, -l / 2 - 1, w + 2, l + 2);
    ctx.fillStyle = '#' + fr.color.toString(16).padStart(6, '0'); ctx.fillRect(-w / 2, -l / 2, w, l);
    ctx.fillStyle = '#fff'; ctx.fillRect(-w / 2, l / 2 - 2, w, 2);
    ctx.restore();
  }
  if (overlay) overlay(sx, sz);
  for (const p of S.players.values()) {
    const x = sx(p.local ? p.x : p.rx ?? p.x), z = sz(p.local ? p.z : p.rz ?? p.z), r = big ? 7 : 5, f = p.face || 0;
    ctx.fillStyle = p.local ? '#ffffff' : '#' + p.color.toString(16).padStart(6, '0'); ctx.strokeStyle = '#000'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x + Math.sin(f) * r, z + Math.cos(f) * r); ctx.lineTo(x + Math.sin(f + 2.5) * r * .8, z + Math.cos(f + 2.5) * r * .8); ctx.lineTo(x + Math.sin(f - 2.5) * r * .8, z + Math.cos(f - 2.5) * r * .8); ctx.closePath(); ctx.stroke(); ctx.fill();
    if (big && !p.local) { ctx.fillStyle = '#fff'; ctx.fillText(p.name, x + 9, z - 6); }
  }
}

// ---------------------------------------------------------------- minimap
// Wheel zooms it; zoomed all the way in it shows the rendered close-up around you. A click opens the big map.
const mini = $('minimap'), mctx = mini.getContext('2d'), MINI_ZOOM = [.5, 1, 2, 4, 8, 16, 24, 32];
let miniT = 0, liveT = 0, miniPpt = 4;
mini.addEventListener('pointerdown', e => { e.preventDefault(); bus.emit('openmap'); });
mini.addEventListener('wheel', e => { e.preventDefault(); const i = MINI_ZOOM.indexOf(miniPpt); miniPpt = MINI_ZOOM[Math.max(0, Math.min(MINI_ZOOM.length - 1, i + (e.deltaY < 0 ? 1 : -1)))]; miniT = 1; }, { passive: false });
export function updateMap(dt) {
  if (!S.started) return;
  if ((liveT += dt) > 1) { liveT = 0; if (mode === 'production' || mode === 'power') dirtyBuilt(); dirtyLive(); sampleStats(); }
  if (S.modal !== 'map') wantView = null;
  const open = S.modal === 'map';
  refreshChunks(open ? 6 : 2);
  if (open) { drawBig(); return; }
  if (S.hideUI || (miniT += dt) < (lodAt(miniPpt) === 'close' ? .1 : .2)) return;
  miniT = 0;
  drawWorld(mctx, mini.width, mini.height, { cx: S.player.x, cz: S.player.z, ppt: miniPpt }, false);
}

// ---------------------------------------------------------------- the big map
const cv = $('mapCanvas'), ctx = cv.getContext('2d');
function fitCanvas() {
  const r = cv.getBoundingClientRect(), w = Math.max(100, Math.floor(r.width)), h = Math.max(100, Math.floor(r.height));
  if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
}
function drawBig() {
  fitCanvas();
  drawWorld(ctx, cv.width, cv.height, view, true);
  if (drag?.area) {   // the area being drawn
    const [a, b] = [drag.area, drag.cur], W = cv.width, H = cv.height;
    const x = (Math.min(a.x, b.x) - view.cx) * view.ppt + W / 2, z = (Math.min(a.z, b.z) - view.cz) * view.ppt + H / 2;
    ctx.strokeStyle = '#fff'; ctx.setLineDash([4, 3]); ctx.lineWidth = 1.5;
    ctx.strokeRect(x, z, (Math.abs(a.x - b.x) + 1) * view.ppt, (Math.abs(a.z - b.z) + 1) * view.ppt); ctx.setLineDash([]);
  }
}
export function openMapView() {
  view.cx = S.player.x; view.cz = S.player.z;
  if (!ZOOM.includes(view.ppt)) view.ppt = 6;
  selected = null; renderSide(true);
}
const tileAtEvent = e => {
  const r = cv.getBoundingClientRect();
  return { x: Math.floor((e.clientX - r.left - cv.width / 2) / view.ppt + view.cx), z: Math.floor((e.clientY - r.top - cv.height / 2) / view.ppt + view.cz) };
};
const clampView = () => { view.cx = Math.max(0, Math.min(GRID, view.cx)); view.cz = Math.max(0, Math.min(GRID, view.cz)); };
function zoomAt(dir, e) {
  const i = ZOOM.indexOf(view.ppt), n = ZOOM[Math.max(0, Math.min(ZOOM.length - 1, i + dir))];
  if (n === view.ppt) return;
  if (e) {   // keep the tile under the cursor where it is
    const r = cv.getBoundingClientRect(), ox = e.clientX - r.left - cv.width / 2, oz = e.clientY - r.top - cv.height / 2;
    view.cx += ox / view.ppt - ox / n; view.cz += oz / view.ppt - oz / n;
  }
  view.ppt = n; clampView();
}
cv.addEventListener('wheel', e => { e.preventDefault(); zoomAt(e.deltaY < 0 ? 1 : -1, e); }, { passive: false });
cv.addEventListener('contextmenu', e => e.preventDefault());
let drag = null;
cv.addEventListener('pointerdown', e => {
  e.preventDefault(); cv.setPointerCapture(e.pointerId);
  const t = tileAtEvent(e);
  if (e.button === 0 && (tool === 'area' || tool === 'assign')) drag = { area: t, cur: t, assign: tool === 'assign' };
  else drag = { x: e.clientX, y: e.clientY, cx: view.cx, cz: view.cz, moved: false, button: e.button, yaw: glimpse.yaw, pitch: glimpse.pitch };
});
cv.addEventListener('pointermove', e => {
  if (!drag) return;
  if (drag.area) { drag.cur = tileAtEvent(e); return; }
  const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
  if (Math.hypot(dx, dy) > 4) drag.moved = true;
  if (!drag.moved) return;
  // in depth mode, dragging with the right button turns the close-up all the way round and tilts it
  if (drag.button === 2 && S.mode === 'depth' && lodAt(view.ppt) === 'close') { glimpse.yaw = drag.yaw - dx * .01; glimpse.pitch = Math.max(.3, Math.min(1.45, drag.pitch + dy * .006)); return; }
  view.cx = drag.cx - dx / view.ppt; view.cz = drag.cz - dy / view.ppt; clampView();
});
cv.addEventListener('pointerup', e => {
  const d = drag; drag = null; if (!d) return;
  const t = tileAtEvent(e);
  if (d.assign) { doAction({ a: 'setfac', fac: S.player.fac, area: [d.area.x, d.area.z, t.x, t.z] }); tool = 'pan'; renderSide(true); return; }
  if (d.area) {
    if (d.area.x === t.x && d.area.z === t.z) return;
    addMark({ kind: 'area', x0: d.area.x, z0: d.area.z, x1: t.x, z1: t.z, name: `Area ${world.marks.next}` });
    return;
  }
  if (d.moved || d.button !== 0) return;
  if (tool === 'marker') { addMark({ kind: 'marker', x: t.x, z: t.z, name: `Marker ${world.marks.next}` }); return; }
  selected = pickMark(e)?.id ?? null; renderSide(true);
});
// Markers win over areas; the smallest area under the cursor wins over bigger ones.
function pickMark(e) {
  const r = cv.getBoundingClientRect(), px = e.clientX - r.left, pz = e.clientY - r.top;
  const sx = x => (x - view.cx) * view.ppt + cv.width / 2, sz = z => (z - view.cz) * view.ppt + cv.height / 2;
  const m = world.marks.markers.find(m => Math.hypot(sx(m.x + .5) - px, sz(m.z + .5) - 7 - pz) < 10);
  if (m) return m;
  const t = tileAtEvent(e);
  return world.marks.areas.filter(a => t.x >= a.x0 && t.x <= a.x1 && t.z >= a.z0 && t.z <= a.z1)
    .sort((a, b) => (a.x1 - a.x0) * (a.z1 - a.z0) - (b.x1 - b.x0) * (b.z1 - b.z0))[0];
}
function addMark(o) {
  const color = COLORS[(world.marks.next - 1) % COLORS.length], next = world.marks.next;
  doAction({ a: 'mark', do: 'add', color, ...o });
  if (S.net.role !== 'client') selected = next;   // in co-op the host numbers it, so pick it once it arrives
  tool = 'pan'; renderSide(true);
}

// ---------------------------------------------------------------- side panel: views, tools, stats, editor
$('mapBar').addEventListener('pointerdown', e => {
  const b = e.target.closest?.('[data-map]'); if (!b) return;
  e.preventDefault();
  const [cmd, arg] = b.dataset.map.split(':');
  if (cmd === 'mode') { mode = arg; dirtyAll(); }
  if (cmd === 'tool') { tool = arg; if (arg === 'assign' && mode !== 'factories') { mode = 'factories'; dirtyAll(); } }
  if (cmd === 'zoom') zoomAt(+arg);
  if (cmd === 'home') { view.cx = S.player.x; view.cz = S.player.z; }
  if (cmd === 'close') { bus.emit('closemap'); return; }
  renderSide(true);
});
$('mapSide').addEventListener('pointerdown', e => {
  const b = e.target.closest?.('[data-map]'); if (!b) return;
  const [cmd, arg] = b.dataset.map.split(':');
  if (cmd === 'goto') { const m = findMark(+arg); if (m) { selected = m.id; view.cx = (m.x ?? (m.x0 + m.x1) / 2) + .5; view.cz = (m.z ?? (m.z0 + m.z1) / 2) + .5; } }
  else if (cmd === 'color') doAction({ a: 'mark', do: 'edit', id: selected, color: arg });
  else if (cmd === 'remove') { doAction({ a: 'mark', do: 'remove', id: selected }); selected = null; }
  else if (cmd === 'fac') { S.player.fac = +arg; doAction({ a: 'factory', do: 'select', id: +arg }); }
  else return;
  e.preventDefault(); renderSide(true);
});
$('mapSide').addEventListener('change', e => { if (e.target.id === 'markName') doAction({ a: 'mark', do: 'edit', id: selected, name: e.target.value }); });
$('mapSide').addEventListener('keydown', e => { if (e.target.id === 'markName' && e.key === 'Enter') e.target.blur(); });
const findMark = id => world.marks.markers.find(m => m.id === id) || world.marks.areas.find(a => a.id === id);

let sideT = 0;
export function renderSide(force) {
  if (S.modal !== 'map') return;
  if (!force && (sideT += .2) < .8) return;   // called from the UI timer: stats refresh about once a second
  sideT = 0;
  const btn = (cmd, label, on) => `<button data-map="${cmd}" class="${on ? 'on' : ''}">${label}</button>`;
  setHTML($('mapBar'), `<b class="logo">MAP</b>${MODES.map(([id, n]) => btn('mode:' + id, n, mode === id)).join('')}<span class="sep"></span>`
    + TOOLS.map(([id, n]) => btn('tool:' + id, n, tool === id)).join('') + `<span class="sep"></span>${btn('zoom:-1', '−')}${btn('zoom:1', '+')}${btn('home', 'Me')}<span class="grow"></span>${btn('close', '✕')}`);
  const sel = selected && findMark(selected);
  let html = '';
  if (sel) {
    if (document.activeElement?.id === 'markName') return;   // don't rebuild under someone typing
    html += `<h3>${sel.x0 !== undefined ? 'Area' : 'Marker'}</h3><input id="markName" maxlength="32" value="${esc(sel.name)}" autocomplete="off" spellcheck="false">
      <div class="swatches">${COLORS.map(c => `<i data-map="color:${c}" style="background:${c}" class="${sel.color === c ? 'on' : ''}"></i>`).join('')}</div>
      <div class="dim">${sel.x0 !== undefined ? `${sel.x1 - sel.x0 + 1}×${sel.z1 - sel.z0 + 1} tiles` : `at ${sel.x}, ${sel.z}`}</div>
      <div class="btns"><button data-map="remove">Remove</button></div><hr>`;
  }
  html += tool === 'marker' ? '<div class="hint">Click the map to drop a marker.</div>' : tool === 'area' ? '<div class="hint">Drag across the map to mark an area.</div>'
    : tool === 'assign' ? `<div class="hint">Drag across buildings to move them into ${esc(factoryOf(S.player.fac)?.name ?? '?')}.</div>`
    : `<div class="dim">Drag to move, wheel to zoom, click a marker or area to edit it.${lodAt(view.ppt) === 'close' ? ` Zoomed in this far, the middle shows the world as it looks${S.mode === 'depth' ? ': right-drag to turn and tilt it' : ''}.` : ' Zoom right in for a close-up.'}</div>`;
  html += modeHTML();
  const list = [...world.marks.markers, ...world.marks.areas];
  if (list.length) html += `<h4>Markers and areas</h4>` + list.map(m => `<div class="mrow${m.id === selected ? ' on' : ''}" data-map="goto:${m.id}"><i style="background:${m.color}"></i>${esc(m.name)}</div>`).join('');
  setHTML($('mapSide'), html);
}
function modeHTML() {
  if (mode === 'factories') {
    const counts = new Map(); for (const e of world.ents.values()) if (!ENTITIES[e.type].shared) counts.set(e.fac ?? 1, (counts.get(e.fac ?? 1) || 0) + 1);
    return `<h4>Factories</h4>${world.factories.map(f => `<div class="mrow${S.player.fac === f.id ? ' on' : ''}" data-map="fac:${f.id}"><i style="background:${f.color}"></i>${esc(f.name)} <span class="dim">${counts.get(f.id) || 0}</span></div>`).join('')}
      <div class="dim">Click one to build for it. The Assign tool drags buildings into the one you build for.</div>`;
  }
  if (mode === 'terrain') return `<h4>Legend</h4><div class="legend"><i style="background:#${TILES[1].map.toString(16)}"></i>water <i style="background:#${TILES[2].map.toString(16)}"></i>river <i style="background:#2f5a2a"></i>trees <i style="background:#231c2a"></i>oil <i style="background:#9a8a76"></i>rail</div><div class="dim">Only what has been seen is drawn. Inside the clear circles (round you and every working radar) the map is live; elsewhere it shows what was last seen there, a little dimmer.</div>`;
  if (mode === 'resources') {
    const by = {};
    for (const [k, o] of world.ores) { const y = +k.split(',')[1], r = by[o.type] ||= { 0: 0, '-1': 0, '-2': 0, tiles: 0 }; r[y] += o.amount; r.tiles++; }
    const rows = Object.entries(by).sort((a, b) => (b[1][0] + b[1][-1] + b[1][-2]) - (a[1][0] + a[1][-1] + a[1][-2]));
    return `<h4>Deposits left</h4><table class="mt"><tr class="dim"><td></td><td>surface</td><td>L-1</td><td>L-2</td></tr>${rows.map(([t, r]) => `<tr><td>${iconHTML(t)}</td><td>${r[0] ? fmtN(r[0]) : '·'}</td><td>${r[-1] ? fmtN(r[-1]) : '·'}</td><td>${r[-2] ? fmtN(r[-2]) : '·'}</td></tr>`).join('')}</table><div class="dim">The map shows the surface. Bright tiles are rich.</div>`;
  }
  if (mode === 'production') {
    const rate = rates(), items = Object.keys(ITEMS).filter(it => rate.made[it] || rate.used[it]).sort((a, b) => (rate.made[b] || 0) + (rate.used[b] || 0) - (rate.made[a] || 0) - (rate.used[a] || 0)).slice(0, 16);
    return `<div class="legend"><i style="background:#6ac46a"></i>working <i style="background:#d8b84a"></i>idle <i style="background:#e0503a"></i>stuck</div>
      <h4>Per minute ${rate.span < 55 ? `<span class="dim">(last ${Math.round(rate.span)} s)</span>` : ''}</h4>
      ${items.length ? `<table class="mt"><tr class="dim"><td></td><td>made</td><td>used</td></tr>${items.map(it => `<tr><td>${iconHTML(it)}</td><td class="okc">${rate.made[it] ? '+' + fmtN(rate.made[it]) : '·'}</td><td class="warn">${rate.used[it] ? '−' + fmtN(rate.used[it]) : '·'}</td></tr>`).join('')}</table>` : '<div class="dim">Nothing made in the last minute.</div>'}`;
  }
  const unpowered = [...world.ents.values()].filter(e => ENTITIES[e.type].power && powerProblem(e) === 'none').length;
  return `<div class="legend"><i style="background:#6ac46a"></i>powered <i style="background:#d8b84a"></i>short <i style="background:#e0503a"></i>no power</div>
    ${unpowered ? `<div class="warn">${unpowered} machine${unpowered > 1 ? 's' : ''} without power</div>` : ''}
    <h4>Networks</h4>${nets.length ? nets.map(n => {
      const short = n.demand > n.capacity, hue = (n.id * 137) % 360;
      return `<div class="net"><i style="background:hsl(${hue},80%,60%)"></i><b>Network ${n.id + 1}</b> <span class="dim">${n.poles.length} poles</span>
        <div class="bar pw"><i style="width:${n.capacity ? Math.min(100, n.produced / n.capacity * 100) : 0}%"></i></div>
        <div class="${short ? 'warn' : 'dim'}">${Math.round(n.produced)} / ${Math.round(n.capacity)} kW${short ? ` · brownout, machines at ${Math.round(n.sat * 100)}%` : n.capacity ? '' : ' · no power'}</div></div>`;
    }).join('') : '<div class="dim">No poles yet.</div>'}`;
}

// ---------------------------------------------------------------- production history (for per-minute rates)
const hist = [];
function sampleStats() {
  if (hist.length && S.T - hist[hist.length - 1].T < 5) return;
  hist.push({ T: S.T, made: { ...S.stats.made }, used: { ...S.stats.used } });
  while (hist.length > 2 && S.T - hist[1].T >= 60) hist.shift();
}
function rates() {
  const now = { made: S.stats.made || {}, used: S.stats.used || {} }, old = hist[0] || { T: S.T, made: {}, used: {} };
  const span = Math.max(1, S.T - old.T), out = { made: {}, used: {}, span };
  for (const s of ['made', 'used']) for (const [it, n] of Object.entries(now[s])) { const d = n - (old[s][it] || 0); if (d > 0) out[s][it] = d / span * 60; }
  return out;
}
