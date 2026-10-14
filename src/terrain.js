// Terrain rendering. The ground is drawn chunk by chunk around the camera, never the whole world: a chunk appears with
// a one-texel-per-tile picture at once, and is then painted in full detail a few tiles a frame within a time budget,
// nearest first. Detail follows the zoom (LOD): 16 texels a tile up close, 8 or 4 further out, so zooming out never
// paints more pixels than the screen shows. Ground cover hides when zoomed out, and chunks the camera has left are
// dropped (their buildings' models with them, see scene.js). Each chunk has its own ore piles, trees, rocks, flora,
// weeds and water surface as instanced meshes.
import * as THREE from 'three';
import { ITEMS, TILES, BIOMES, FEATURES, ROADS } from './data.js';
import { S, world, key, GRID, CHUNK, chunkKey, chunkOf, underOf, DIRS, rng, tileAt } from './state.js';
import { M, facet, toonRamp } from './models.js';
import { groundColors } from './worldgen.js';
import { roadAt } from './transport.js';

let scene = null, hooks = {};
export function initTerrain(sc, h) { scene = sc; hooks = h; }
const shown = new Map();   // chunkKey -> render chunk
export const chunkShown = (x, z) => shown.has(chunkKey(Math.floor(x / CHUNK), Math.floor(z / CHUNK)));
export const shownChunks = () => shown.values();
export const shownAt = (x, z) => shown.get(chunkKey(Math.floor(x / CHUNK), Math.floor(z / CHUNK))) || null;

// ---------------------------------------------------------------- noise for paint
function hash2(x, y) { let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967295; }
function vnoise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi), b = hash2(xi + 1, yi), c = hash2(xi, yi + 1), d = hash2(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
const fbm = (x, y) => vnoise(x, y) * .5 + vnoise(x * 2.1, y * 2.1) * .3 + vnoise(x * 4.3, y * 4.3) * .2;
const UNDER = { '-1': [[38, 36, 42], [52, 48, 54], [44, 42, 50], [60, 56, 62]], '-2': [[28, 22, 38], [40, 32, 52], [32, 28, 44], [48, 38, 62]] };
const ORE_IDS = Object.keys(ITEMS);
const weedColor = b => b.weed ?? b.flora[0]?.[1] ?? 0x5a8a3a;
const rgbOf = h => [h >> 16 & 255, h >> 8 & 255, h & 255];

// ---------------------------------------------------------------- per-pixel looks (water, oil, roads)
const SAND = [126, 110, 78];
// Distance from land (0 on land, up to 4) for darker deep water, cached per chunk.
function depthOf(R, x, z) {
  const i = (z - R.z0 + 4) * (CHUNK + 8) + (x - R.x0 + 4);
  if (!R.depth) R.depth = new Int8Array((CHUNK + 8) * (CHUNK + 8)).fill(-1);
  if (i >= 0 && i < R.depth.length && x - R.x0 >= -4 && x - R.x0 < CHUNK + 4 && R.depth[i] >= 0) return R.depth[i];
  let d = 0;
  if (TILES[tileAt(x, z)].liquid) { d = 4; for (let r = 1; r <= 4 && d === 4; r++) for (let a = -r; a <= r && d === 4; a++) for (const [dx, dz] of [[a, -r], [a, r], [-r, a], [r, a]]) if (!TILES[tileAt(x + dx, z + dz)].liquid) { d = r; break; } }
  if (i >= 0 && i < R.depth.length && x - R.x0 >= -4 && x - R.x0 < CHUNK + 4) R.depth[i] = d;
  return d;
}
function waterPixel(N, wx, wz, c) {
  const fx = wx - .5, fz = wz - .5, x0 = Math.floor(fx), z0 = Math.floor(fz), tx = fx - x0, tz = fz - z0;
  let field = 0, depth = 0, best = 0, bw = 0;
  for (const [cx, cz, w] of [[x0, z0, (1 - tx) * (1 - tz)], [x0 + 1, z0, tx * (1 - tz)], [x0, z0 + 1, (1 - tx) * tz], [x0 + 1, z0 + 1, tx * tz]]) {
    const j = (cz - N.z + 1) * 3 + (cx - N.x + 1), t = N.tile[j];
    if (!TILES[t].liquid) continue;
    field += w; depth += w * N.depth[j];
    if (w > bw) { bw = w; best = t; }
  }
  if (!field) return null;
  field += (vnoise(wx * 3.7, wz * 3.7) - .5) * .3;
  if (field < .32) return null;
  if (field < .5) { const k = (field - .32) / .18; return c.map((v, i) => v * (1 - k) + SAND[i] * k); }   // wet sand
  const p = TILES[best].paint, dk = 1 - Math.min(3, depth / Math.max(.01, field)) * .1, ripple = (vnoise(wx * 2.3, wz * 5.1) - .5) * 14;
  const foam = field < .56 && !TILES[best].current ? 18 : 0;
  return p.map(v => v * dk + ripple + foam);
}
function oilPixel(o, fx, fz, c, grain) {
  const d = Math.hypot(fx - .5, fz - .5), r = .26 + Math.min(.2, o.yield / 900) + (vnoise((fx + 3) * 4.1, fz * 4.1) - .5) * .18;
  if (d > r + .1) return c;
  if (d > r) return c.map(v => v * .8);
  return grain > .9 ? [96, 90, 110] : [24 + grain * 10, 20 + grain * 8, 28 + grain * 12];
}
// What a road tile needs to know about its neighbours to paint itself: corners, junctions, kerbs.
function roadInfo(x, z) {
  const r = roadAt(x, z); if (!r) return null;
  const n = DIRS.map(([dx, dz]) => roadAt(x + dx, z + dz)), car = t => !!t && !ROADS[t.s]?.walk, walk = !!ROADS[r.s]?.walk;
  const same = n.map(t => walk ? !!t && !!ROADS[t.s]?.walk : car(t));
  let corner = null;
  const on = [0, 1, 2, 3].filter(d => same[d]);
  if (on.length === 2 && (on[0] + on[1]) % 2 === 1 && n.every((t, d) => on.includes(d) || !t)) corner = [.5 + (DIRS[on[0]][0] + DIRS[on[1]][0]) * .5, .5 + (DIRS[on[0]][1] + DIRS[on[1]][1]) * .5];
  const junction = !walk && n.some(t => car(t) && t.a !== r.a);
  let approach = -1;
  if (!walk && !junction) for (const d of r.a === 0 ? [0, 2] : [1, 3]) {
    const t = n[d]; if (!car(t)) continue;
    const tx = x + DIRS[d][0], tz = z + DIRS[d][1];
    if (DIRS.some(([dx, dz]) => { const q = roadAt(tx + dx, tz + dz); return car(q) && q.a !== t.a; }) || t.a !== r.a) approach = d;
  }
  return { r, walk, n, car: n.map(car), corner, junction, approach, def: ROADS[r.s] };
}
const YELLOW = [214, 176, 52], WHITE = [222, 222, 214];
function roadPixel(I, fx, fz, c, x, z) {
  const { r, def } = I;
  if (I.corner && Math.hypot(fx - I.corner[0], fz - I.corner[1]) > 1) return null;
  if (I.walk) {
    const sx = Math.floor(fx * 2), sz = Math.floor(fz * 2), grout = (fx * 2) % 1 < .08 || (fz * 2) % 1 < .08;
    let col = def.paint.map(v => v + (hash2(x * 2 + sx, z * 2 + sz) - .5) * 12);
    if (grout) col = col.map(v => v * .78);
    for (let d = 0; d < 4; d++) if (I.car[d]) { const e = d === 0 ? fz : d === 1 ? 1 - fx : d === 2 ? 1 - fz : fx; if (e < .1) col = e < .04 ? [120, 116, 108] : [196, 192, 184]; }
    return col;
  }
  const g = hash2(Math.floor(x * 16 + fx * 16), Math.floor(z * 16 + fz * 16));
  let col = def.paint.slice();
  if (r.s === 'gravel_road') col = col.map(v => v + (g - .5) * 34 + (g > .93 ? 26 : 0));
  else if (r.s === 'cobble_road') {
    const row = Math.floor(fz * 4), u = fx * 4 + (row % 2) * .5, mort = (u % 1) < .12 || (fz * 4) % 1 < .12;
    col = mort ? col.map(v => v * .62) : col.map(v => v + (hash2(Math.floor(x * 4 + u), z * 4 + row) - .5) * 26);
  } else if (r.s === 'concrete_road') { col = col.map(v => v + (g - .5) * 8); if (fx < .03 || fz < .03) col = col.map(v => v * .8); }
  else col = col.map(v => v + (g - .5) * 10);
  if (I.junction) return col;
  const w = r.w || 1, u = (r.i || 0) + (r.a === 0 ? fx : fz), v = r.a === 0 ? z + fz : x + fx, lw = .05;
  if (I.approach >= 0) {
    const d = I.approach, edge = d === 0 ? fz : d === 1 ? 1 - fx : d === 2 ? 1 - fz : fx;
    if (r.c && edge < .38 && edge > .06 && (u * 5) % 1 < .5) return WHITE;
    if (!r.c && edge < .09) return WHITE;
  }
  if (r.e && (u < .06 + lw && u > .06 || u > w - .06 - lw && u < w - .06)) return WHITE;
  const L = r.l || 1;
  for (let k = 1; k < L; k++) {
    const b = w * k / L, centre = L % 2 === 0 && k === L / 2;
    if (!centre) { if (Math.abs(u - b) < lw / 2 + .01 && (v % 1) < .5) return WHITE; continue; }
    if (r.m === 'double') { if (Math.abs(Math.abs(u - b) - .05) < .025) return YELLOW; }
    else if (r.m === 'solid') { if (Math.abs(u - b) < lw / 2 + .01) return YELLOW; }
    else if (r.m === 'dashed') { if (Math.abs(u - b) < lw / 2 + .01 && (v % 1) < .5) return WHITE; }
  }
  return col;
}

// ---------------------------------------------------------------- painting a tile
// Everything a tile's pixels need from its neighbours, looked up once per tile instead of once per pixel.
function neighbourhood(R, y, x, z) {
  const N = { x, z, ore: new Int16Array(9), tile: new Uint8Array(9), depth: new Uint8Array(9), pal: [] };
  for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
    const j = (dz + 1) * 3 + dx + 1, tx = x + dx, tz = z + dz, inside = tx >= 0 && tz >= 0 && tx < GRID && tz < GRID;
    if (y < 0 && inside) underOf(tx, tz);
    const o = inside ? world.ores.get(key(tx, y, tz)) : null;
    N.ore[j] = o ? ORE_IDS.indexOf(o.type) : -1;
    if (y === 0) { N.tile[j] = inside ? tileAt(tx, tz) : 0; N.depth[j] = N.tile[j] && inside ? depthOf(R, tx, tz) : 0; }
    // ground colours of the neighbours, so a biome border fades across pixels rather than stepping at tile edges
    if (y === 0 && world.gen) { const cc = inside ? chunkOf(tx, tz) : null; N.pal[j] = cc ? palette(cc, (tz - cc.z0) * CHUNK + (tx - cc.x0)) : null; }
  }
  return N;
}
// A tile's ground palette: its blend of the biomes around it (see groundColors in worldgen.js).
function palette(c, i) {
  if (!world.gen) return legacyPal;
  const g = groundColors(c), o = i * 12;
  return [0, 1, 2, 3].map(b => [g[o + b * 3], g[o + b * 3 + 1], g[o + b * 3 + 2]]);
}
const legacyPal = [[66, 56, 44], [96, 80, 58], [74, 80, 56], [112, 94, 66]];
// Paint tile (x, z) of layer y into an RGBA buffer d (row length `stride` pixels) at pixel (ox, oz), tp texels a side.
function paintTile(R, y, x, z, tp, d, stride, ox, oz) {
  const c = R.c, i = (z - R.z0) * CHUNK + (x - R.x0);
  const pal = y === 0 ? (world.gen ? palette(c, i) : legacyPal) : UNDER[y], N = neighbourhood(R, y, x, z);
  const road = y === 0 ? roadInfo(x, z) : null, oil = y === 0 ? world.oil.get(x + ',' + z) : null, patch = y === 0 && c.patch[i] === 1;
  const weed = patch ? weedColor(BIOMES[c.biome[i]]) : 0, wc = rgbOf(weed);
  const dam = y === 0 && world.ents.get(key(x, 0, z))?.kind === 'dam';   // a dam's top is ground: concrete, roads on it
  for (let py = 0; py < tp; py++) for (let px = 0; px < tp; px++) {
    const wx = x + (px + .5) / tp, wz = z + (py + .5) / tp;
    const n = fbm(wx * .18 + y * 9, wz * .18), m = vnoise(wx * .9, wz * .9), grain = hash2(Math.floor(wx * 16) + y * 7777, Math.floor(wz * 16));
    const i0 = Math.min(2, Math.floor(n * 3.2)), t = Math.min(1, Math.max(0, n * 3.2 - i0));
    const band = t > .5 ? i0 + 1 : i0, lift = (m - .5) * 10 + (grain - .5) * 8;
    const fx = wx - .5, fz = wz - .5, x0 = Math.floor(fx), z0 = Math.floor(fz), tx = fx - x0, tz = fz - z0;
    let col = pal[band];
    if (N.pal.length) {   // blend the ground between the four nearest tile centres
      let cr = 0, cg = 0, cb = 0;
      for (const [cx, cz, w] of [[x0, z0, (1 - tx) * (1 - tz)], [x0 + 1, z0, tx * (1 - tz)], [x0, z0 + 1, (1 - tx) * tz], [x0 + 1, z0 + 1, tx * tz]]) {
        const q = (N.pal[(cz - z + 1) * 3 + (cx - x + 1)] || pal)[band]; cr += q[0] * w; cg += q[1] * w; cb += q[2] * w;
      }
      col = [cr, cg, cb];
    }
    let r = col[0] + lift, g = col[1] + lift, b = col[2] + lift;
    // ore ground: presence blended between tile centres and roughened, so patches have organic edges
    let field = 0, best = -1, bw = 0;
    for (const [cx, cz, w] of [[x0, z0, (1 - tx) * (1 - tz)], [x0 + 1, z0, tx * (1 - tz)], [x0, z0 + 1, (1 - tx) * tz], [x0 + 1, z0 + 1, tx * tz]]) {
      const id = N.ore[(cz - z + 1) * 3 + (cx - x + 1)]; if (id >= 0) { field += w; if (w > bw) { bw = w; best = id; } }
    }
    if (best >= 0 && field + (vnoise(wx * 3.1, wz * 3.1) - .5) * .7 > .45) {
      const oc = rgbOf(ITEMS[ORE_IDS[best]].color);
      r = r * .82 + oc[0] * .05; g = g * .82 + oc[1] * .05; b = b * .82 + oc[2] * .05;
      if (grain < .16) { const k = .6 + grain * 2.4; r = oc[0] * k; g = oc[1] * k; b = oc[2] * k; }
    }
    // weedy patch: tangled darker ground with the biome's green (or whatever grows there) in it
    if (patch) {
      const lfx = wx - x, lfz = wz - z, inner = Math.min(lfx, lfz, 1 - lfx, 1 - lfz), k = vnoise(wx * 6, wz * 6);
      if (inner + (k - .5) * .25 > .08) { r *= .82; g *= .86; b *= .8; if (grain > .62) { const q = .55 + k * .5; r = wc[0] * q; g = wc[1] * q; b = wc[2] * q; } else if (grain < .05) { r = 168; g = 150; b = 96; } }
    }
    let out = [r, g, b];
    if (dam) { const lfx = wx - x, lfz = wz - z, joint = lfx < .04 || lfz < .04; out = [138 + (grain - .5) * 12, 132 + (grain - .5) * 12, 122 + (grain - .5) * 12].map(v => joint ? v * .82 : v); }
    else if (y === 0) { const w = waterPixel(N, wx, wz, out); if (w) out = w; }
    if (oil) out = oilPixel(oil, wx - x, wz - z, out, grain);
    if (road) { const rp = roadPixel(road, wx - x, wz - z, out, x, z); if (rp) out = rp; }
    const k = ((oz + py) * stride + ox + px) * 4;
    d[k] = Math.round(out[0] / 4) * 4; d[k + 1] = Math.round(out[1] / 4) * 4; d[k + 2] = Math.round(out[2] / 4) * 4; d[k + 3] = 255;
  }
}
// One texel a tile, for a chunk that has only just appeared.
function coarseColor(R, y, x, z) {
  const c = R.c, i = (z - R.z0) * CHUNK + (x - R.x0);
  if (y === 0 && TILES[c.tiles[i]].liquid) return TILES[c.tiles[i]].paint;
  const o = world.ores.get(key(x, y, z));
  if (o) return rgbOf(ITEMS[o.type].color).map(v => v * .7);
  if (y === 0 && roadAt(x, z)) return ROADS[roadAt(x, z).s].paint;
  const p = y === 0 ? (world.gen ? palette(c, i) : legacyPal) : UNDER[y];
  return p[1];
}

// ---------------------------------------------------------------- layers of one chunk (ground and two underground floors)
const sideMat = new THREE.MeshToonMaterial({ color: 0x3b2f24, gradientMap: toonRamp });
function makeSurface(R, y) {
  if (y < 0 && !R.underClutter) { underOf(R.x0, R.z0); refreshClutter(R); R.underClutter = true; }   // the first look below: make its deposits
  const w = R.w, h = R.h, L = { y, tp: 0, canvas: null, tex: null };
  const mat = new THREE.MeshToonMaterial({ gradientMap: toonRamp });
  if (y === 0) {
    L.mesh = new THREE.Mesh(new THREE.BoxGeometry(w, 2, h), [sideMat, sideMat, mat, sideMat, sideMat, sideMat]);
    L.mesh.position.set(R.x0 + w / 2, -1, R.z0 + h / 2);
  } else {
    L.mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h).rotateX(-Math.PI / 2), mat);
    L.mesh.position.set(R.x0 + w / 2, y + .002, R.z0 + h / 2);
  }
  L.mat = mat; L.mesh.receiveShadow = true; scene.add(L.mesh);
  setTexture(R, L, 1, coarseCanvas(R, y));
  R.layers[y] = L;
  queue(R, y);
  applyDepthView(R);
  return L;
}
function coarseCanvas(R, y) {
  const cv = document.createElement('canvas'); cv.width = R.w; cv.height = R.h;
  const g = cv.getContext('2d'), img = g.createImageData(R.w, R.h);
  for (let z = 0; z < R.h; z++) for (let x = 0; x < R.w; x++) { const col = coarseColor(R, y, R.x0 + x, R.z0 + z), k = (z * R.w + x) * 4; img.data[k] = col[0]; img.data[k + 1] = col[1]; img.data[k + 2] = col[2]; img.data[k + 3] = 255; }
  g.putImageData(img, 0, 0); return cv;
}
function setTexture(R, L, tp, canvas) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = tex.minFilter = tp > 1 ? THREE.NearestFilter : THREE.LinearFilter;   // the first quick picture is soft, not blocky tex.colorSpace = THREE.SRGBColorSpace; tex.generateMipmaps = false;
  L.tex?.dispose(); L.tex = tex; L.canvas = canvas; L.tp = tp; L.mat.map = tex; L.mat.needsUpdate = true;
}

// ---------------------------------------------------------------- painting jobs
// A job paints one layer of one chunk at one level of detail into a buffer, tile by tile, and swaps it in when done.
const jobs = [];
let wantTp = 16, depthView = { depth: false, layer: 0 };
function queue(R, y) {
  const L = R.layers[y];
  if (!L || L.tp === wantTp) return;
  const old = jobs.find(j => j.R === R && j.y === y);
  if (old) { if (old.tp === wantTp) return; jobs.splice(jobs.indexOf(old), 1); }
  jobs.push({ R, y, tp: wantTp, img: new ImageData(R.w * wantTp, R.h * wantTp), next: 0 });
}
function runJobs(budgetMs, cx, cz) {
  if (!jobs.length) return;
  const t0 = performance.now();
  jobs.sort((a, b) => dist(a.R, cx, cz) - dist(b.R, cx, cz) || a.y - b.y);
  while (jobs.length && performance.now() - t0 < budgetMs) {
    const j = jobs[0], R = j.R, n = R.w * R.h;
    for (let k = 0; k < 8 && j.next < n; k++, j.next++) {
      const lx = j.next % R.w, lz = Math.floor(j.next / R.w);
      paintTile(R, j.y, R.x0 + lx, R.z0 + lz, j.tp, j.img.data, R.w * j.tp, lx * j.tp, lz * j.tp);
    }
    if (j.next >= n) {
      jobs.shift();
      if (!shown.has(R.k) || !R.layers[j.y]) continue;
      const cv = document.createElement('canvas'); cv.width = j.img.width; cv.height = j.img.height;
      cv.getContext('2d').putImageData(j.img, 0, 0);
      setTexture(R, R.layers[j.y], j.tp, cv);
      break;   // one upload a frame
    }
  }
}
const dist = (R, x, z) => Math.hypot(R.x0 + R.w / 2 - x, R.z0 + R.h / 2 - z);
// Repaint single tiles now (a road laid, a deposit gone, a patch dug), in the shown texture and any job underway.
export function repaintTiles(list, y = 0) {
  const touched = new Set();
  for (const [x, z] of list) {
    const R = shown.get(chunkKey(Math.floor(x / CHUNK), Math.floor(z / CHUNK))), L = R?.layers[y];
    if (!L) continue;
    if (L.tp > 1) {
      const img = new ImageData(L.tp, L.tp);
      paintTile(R, y, x, z, L.tp, img.data, L.tp, 0, 0);
      L.canvas.getContext('2d').putImageData(img, (x - R.x0) * L.tp, (z - R.z0) * L.tp);
    } else { const col = coarseColor(R, y, x, z), g = L.canvas.getContext('2d'); g.fillStyle = `rgb(${col[0] | 0},${col[1] | 0},${col[2] | 0})`; g.fillRect(x - R.x0, z - R.z0, 1, 1); }
    const j = jobs.find(q => q.R === R && q.y === y), idx = (z - R.z0) * R.w + (x - R.x0);
    if (j && j.next > idx) paintTile(R, y, x, z, j.tp, j.img.data, R.w * j.tp, (x - R.x0) * j.tp, (z - R.z0) * j.tp);
    touched.add(L);
  }
  for (const L of touched) L.tex.needsUpdate = true;
}

// ---------------------------------------------------------------- clutter (instanced, per chunk)
// clutter.get(tileKey) -> [[instancedMesh, index, matrix]] so a tile's clutter can be hidden when built on.
const clutter = new Map(), _hid = new THREE.Matrix4().makeScale(0, 0, 0);
function addClutter(R, k, im, i, m) { im.setMatrixAt(i, m); let l = clutter.get(k); if (!l) { l = []; clutter.set(k, l); R.keys.push(k); } l.push([im, i, m.clone()]); }
export function showClutter(k, show) {
  for (const [im, i, m] of clutter.get(k) || []) { im.setMatrixAt(i, show ? m : _hid); im.instanceMatrix.needsUpdate = true; }
}
export const dropClutter = k => { showClutter(k, false); clutter.delete(k); };
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _c = new THREE.Color();
const V = (x, y, z) => new THREE.Vector3(x, y, z);
function inst(R, geo, mat, n, y = 0, kind = 'clutter') {
  const im = new THREE.InstancedMesh(geo, mat, Math.max(1, n)); im.count = n; im.userData.y = y; im.userData.kind = kind;
  im.castShadow = kind !== 'flora'; im.receiveShadow = true; scene.add(im); R.meshes.push(im); return im;
}
const featIndex = new Map();   // instancedMesh uuid + index -> feature key, for picking trees and rocks
export const featKeyAt = (uuid, i) => featIndex.get(uuid + i);
export function featPickList() { const out = []; for (const R of shown.values()) out.push(...R.featMeshes); return out; }
const ORE_LOOK = { iron_ore: 0x8a96a8, copper_ore: 0xd07a42, coal: 0x2c2c32, stone: 0xb4a68c, crystal: 0x7ef6ff, abyssal_ore: 0x9a62e0, uranium_ore: 0x6ad84a };
export const oreLook = t => ORE_LOOK[t] ?? ITEMS[t]?.color ?? 0x9aa1ad;
const GLOWY = new Set(['crystal', 'abyssal_ore', 'uranium_ore']);
// Shared geometry for each kind of feature: a list of parts, each instanced in its own colour.
const geoCache = new Map();
function featParts(type) {
  if (geoCache.has(type)) return geoCache.get(type);
  const L = FEATURES[type]?.look || FEATURES.tree.look, parts = [], glow = L.glow ? { emissive: L.glow, emissiveIntensity: .9 } : {};
  const crown = (f, add = 0) => { _c.setHSL((L.hue ?? .3) + f.v * (L.hueV ?? .1) + add * .02, L.sat ?? .38, (L.lit ?? .25) + f.v * .07 + add * .07); };
  const trunk = () => _c.setHex(L.trunk);
  switch (L.shape) {
    case 'cone':
      parts.push({ geo: new THREE.CylinderGeometry(.06, .09, .4, 5).translate(0, .2, 0), mat: M(0xffffff), col: trunk });
      parts.push({ geo: facet(new THREE.ConeGeometry(.42, .62, 6).translate(0, .62, 0)), mat: M(0xffffff, glow), col: f => crown(f) });
      parts.push({ geo: facet(new THREE.ConeGeometry(.3, .5, 6).translate(0, .98, 0)), mat: M(0xffffff, glow), col: f => crown(f, 1) });
      break;
    case 'flat':
      parts.push({ geo: new THREE.CylinderGeometry(.05, .08, .7, 5).translate(0, .35, 0), mat: M(0xffffff), col: trunk });
      parts.push({ geo: facet(new THREE.IcosahedronGeometry(.48, 0).scale(1, .32, 1).translate(0, .82, 0)), mat: M(0xffffff), col: f => crown(f) });
      break;
    case 'droop':
      parts.push({ geo: new THREE.CylinderGeometry(.07, .11, .5, 5).translate(0, .25, 0), mat: M(0xffffff), col: trunk });
      parts.push({ geo: facet(new THREE.IcosahedronGeometry(.46, 0).scale(1, 1.1, 1).translate(0, .66, 0)), mat: M(0xffffff), col: f => crown(f) });
      break;
    case 'cactus': {
      const g = [new THREE.CylinderGeometry(.11, .12, .8, 6).translate(0, .4, 0), new THREE.CylinderGeometry(.07, .07, .3, 5).translate(.18, .5, 0), new THREE.CylinderGeometry(.07, .07, .26, 5).translate(-.17, .42, 0)];
      parts.push({ geo: facet(merge(g)), mat: M(0xffffff), col: f => crown(f) });
      break;
    }
    case 'dead':
      parts.push({ geo: facet(merge([new THREE.CylinderGeometry(.05, .09, .8, 5).translate(0, .4, 0), new THREE.BoxGeometry(.04, .32, .04).rotateZ(.7).translate(.12, .62, 0), new THREE.BoxGeometry(.04, .26, .04).rotateZ(-.8).translate(-.1, .5, .04)])),
        mat: M(0xffffff, L.ember ? { emissive: L.ember, emissiveIntensity: .25 } : {}), col: f => _c.setHex(L.trunk).multiplyScalar(.85 + f.v * .3) });
      break;
    case 'cap':
      parts.push({ geo: new THREE.CylinderGeometry(.07, .1, .55, 6).translate(0, .27, 0), mat: M(0xffffff), col: trunk });
      parts.push({ geo: facet(new THREE.SphereGeometry(.38, 7, 3, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, .6, 1).translate(0, .52, 0)), mat: M(0xffffff, glow), col: f => crown(f) });
      break;
    case 'spire':
      parts.push({ geo: facet(merge([new THREE.OctahedronGeometry(.16, 0).scale(.8, 3.2, .8).translate(0, .5, 0), new THREE.OctahedronGeometry(.1, 0).scale(.8, 2.4, .8).translate(.16, .3, .06), new THREE.OctahedronGeometry(.09, 0).scale(.8, 2, .8).translate(-.12, .24, -.08)])),
        mat: M(0xffffff, glow), col: f => _c.setHex(L.trunk).multiplyScalar(.85 + f.v * .3) });
      break;
    case 'rock':
      parts.push({ geo: facet(new THREE.DodecahedronGeometry(.42, 0).scale(1, .6, 1).translate(0, .17, 0)), mat: M(0xffffff), col: f => _c.setHex(L.trunk).multiplyScalar(.85 + f.v * .3) });
      break;
    default:   // round crowns: oak, birch, mutant trees
      parts.push({ geo: new THREE.CylinderGeometry(L.slim ? .045 : .06, L.slim ? .07 : .1, .55, 5).translate(0, .27, 0), mat: M(0xffffff), col: trunk });
      parts.push({ geo: facet(new THREE.IcosahedronGeometry(L.slim ? .3 : .36, 0).scale(1, L.slim ? 1.1 : .8, 1).translate(0, .72, 0)), mat: M(0xffffff, glow), col: f => crown(f) });
      parts.push({ geo: facet(new THREE.IcosahedronGeometry(.26, 0).scale(1, .85, 1).translate(.08, L.slim ? 1.04 : 1.02, -.04)), mat: M(0xffffff, glow), col: f => crown(f, 1) });
  }
  geoCache.set(type, parts);
  return parts;
}
function merge(list) {
  const arrs = list.map(g => g.toNonIndexed().attributes.position.array), n = arrs.reduce((t, a) => t + a.length, 0), out = new Float32Array(n);
  let o = 0; for (const a of arrs) { out.set(a, o); o += a.length; }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(out, 3)); g.computeVertexNormals(); return g;
}
// Ground cover kinds: a geometry each, drawn a few to a tile.
const FLORA_GEO = {
  tuft: () => new THREE.ConeGeometry(.05, .2, 3).translate(0, .1, 0),
  glowtuft: () => new THREE.ConeGeometry(.05, .24, 3).translate(0, .12, 0),
  reed: () => new THREE.CylinderGeometry(.015, .02, .42, 3).translate(0, .21, 0),
  fern: () => facet(new THREE.ConeGeometry(.12, .14, 5).translate(0, .07, 0)),
  flower: () => merge([new THREE.CylinderGeometry(.01, .01, .14, 3).translate(0, .07, 0), new THREE.OctahedronGeometry(.04, 0).translate(0, .15, 0)]),
  berry: () => facet(new THREE.IcosahedronGeometry(.07, 0).translate(0, .06, 0)),
  shroom: () => merge([new THREE.CylinderGeometry(.015, .02, .08, 4).translate(0, .04, 0), new THREE.SphereGeometry(.05, 5, 2, 0, Math.PI * 2, 0, Math.PI / 2).translate(0, .08, 0)]),
  shard: () => facet(new THREE.OctahedronGeometry(.05, 0).scale(.7, 2, .7).translate(0, .08, 0)),
  ember: () => facet(new THREE.DodecahedronGeometry(.05, 0).translate(0, .03, 0)),
  weed: () => new THREE.ConeGeometry(.045, .17, 3).translate(0, .085, 0),
};
const floraGeo = new Map(), getFlora = k => floraGeo.get(k) || floraGeo.set(k, FLORA_GEO[k]()).get(k);

function buildClutter(R) {
  const c = R.c;
  // ore piles: three to four chunks per tile, sized by how rich the tile is
  const byType = {};
  for (const k of c.ores) { const o = world.ores.get(k); if (o) (byType[o.type + '|' + k.split(',')[1]] ||= []).push([k, o]); }
  for (const [tk, list] of Object.entries(byType)) {
    const [type, ys] = tk.split('|'), glow = GLOWY.has(type);
    const geo = type === 'crystal' ? facet(new THREE.OctahedronGeometry(.12, 0).scale(.7, 1.8, .7).translate(0, .18, 0)) : facet(new THREE.DodecahedronGeometry(.13, 0).scale(1, .62, 1).translate(0, .06, 0));
    const im = inst(R, geo, M(0xffffff, glow ? { emissive: ITEMS[type].emissive, emissiveIntensity: .8 } : {}), list.length * 4, +ys);
    list.forEach(([k, o], i) => {
      const [x, y, z] = k.split(',').map(Number), r = rng(x * 131 + z * 71 + y * 17), rich = .55 + .45 * Math.min(1, o.amount / 900);
      for (let j = 0; j < 4; j++) {
        const s = rich * (.75 + r() * .75) * (j === 0 ? 1.35 : 1);
        _m.compose(V(x + .12 + r() * .76, y, z + .12 + r() * .76), _q.setFromEuler(_e.set((r() - .5) * .4, r() * 6, (r() - .5) * .4)), V(s, s * (.8 + r() * .5), s));
        addClutter(R, k, im, i * 4 + j, _m);
        _c.setHex(oreLook(type)).multiplyScalar(.8 + r() * .35); im.setColorAt(i * 4 + j, _c);
      }
    });
  }
  // trees, rocks and the like, a set of instanced parts per kind
  const byFeat = {};
  for (const k of c.feats) { const f = world.feats.get(k); if (f) (byFeat[f.type] ||= []).push([k, f]); }
  for (const [type, list] of Object.entries(byFeat)) {
    for (const part of featParts(type)) {
      const im = inst(R, part.geo, part.mat, list.length, 0, 'feat');
      list.forEach(([k, f], i) => {
        const [x, , z] = k.split(',').map(Number), s = (FEATURES[type]?.look.shape === 'rock' ? .75 : .85) + f.v * .45, lumpy = FEATURES[type]?.look.lumpy;
        _m.compose(V(x + .5, 0, z + .5), _q.setFromEuler(_e.set(lumpy ? (f.v - .5) * .4 : 0, f.v * 6, 0)), V(s * (lumpy ? 1.2 : 1), s * (lumpy ? .8 + f.v * .5 : 1), s));
        addClutter(R, k, im, i, _m);
        part.col(f); im.setColorAt(i, _c);
        featIndex.set(im.uuid + i, k);
      });
      R.featMeshes.push(im);
    }
  }
  // ground cover on bare ground, and weeds on weedy patches
  const flora = new Map(), add = (kind, color, glow, x, z, k, n) => { const id = kind + '|' + color + '|' + (glow ? 1 : 0); (flora.get(id) || flora.set(id, []).get(id)).push([x, z, k, n]); };
  for (let lz = 0; lz < R.h; lz++) for (let lx = 0; lx < R.w; lx++) {
    const x = R.x0 + lx, z = R.z0 + lz, i = lz * CHUNK + lx, k = key(x, 0, z);
    if (c.tiles[i] || world.ores.has(k) || world.feats.has(k) || world.roads.has(x + ',' + z) || world.oil.has(x + ',' + z)) continue;
    const bi = world.gen ? BIOMES[c.biome[i]] : BIOMES[0], h = hash2(x * 3 + 1, z * 5 + 2);
    if (c.patch[i]) { add('weed', weedColor(bi), false, x, z, k, 5); continue; }
    let acc = 0;
    for (const [kind, color, share, glow] of bi.flora) { acc += share; if (h < acc) { add(kind, color, glow, x, z, k, kind === 'tuft' || kind === 'reed' ? 3 : 1); break; } }
    if (h > .95) add('pebble', 0x8a7f70, false, x, z, k, 1);
  }
  for (const [id, list] of flora) {
    const [kind, color, glow] = id.split('|'), col = +color, n = list.reduce((t, l) => t + l[3], 0);
    const geo = kind === 'pebble' ? (floraGeo.get('pebble') || floraGeo.set('pebble', facet(new THREE.DodecahedronGeometry(.07, 0).scale(1, .6, 1))).get('pebble')) : getFlora(kind);
    const im = inst(R, geo, M(0xffffff, glow === '1' ? { emissive: col, emissiveIntensity: .7 } : {}), n, 0, kind === 'weed' ? 'weed' : 'flora');
    let j = 0;
    for (const [x, z, k, cnt] of list) {
      const r = rng(x * 977 + z * 13), cx = x + .2 + r() * .6, cz = z + .2 + r() * .6;
      for (let q = 0; q < cnt; q++) {
        const spread = kind === 'weed' ? .7 : .14;
        _m.compose(V(cx + (r() - .5) * spread, 0, cz + (r() - .5) * spread), _q.setFromEuler(_e.set((r() - .5) * .6, r() * 6, (r() - .5) * .6)), V(1, .6 + r() * .9, 1));
        addClutter(R, k, im, j, _m);
        _c.setHex(col).offsetHSL((r() - .5) * .04, 0, (r() - .5) * .1); im.setColorAt(j++, _c);
      }
    }
  }
  // crude oil: a dark puddle with a sheen over each well
  if (c.oil.length) {
    const im = inst(R, new THREE.CylinderGeometry(.3, .34, .02, 10), M(0x1a161e, { emissive: 0x2a2440, emissiveIntensity: .35 }), c.oil.length);
    im.castShadow = false;
    c.oil.forEach((k2, i) => { const [x, z] = k2.split(',').map(Number), r = rng(x * 31 + z * 17); _m.compose(V(x + .5, .012, z + .5), _q.setFromEuler(_e.set(0, r() * 6, 0)), V(1, 1, .8 + r() * .3)); addClutter(R, key(x, 0, z), im, i, _m); });
  }
  for (const im of R.meshes) if (im.instanceColor) im.instanceColor.needsUpdate = true;
}

// ---------------------------------------------------------------- water surface
function streakTexture(still) {
  const cv = document.createElement('canvas'); cv.width = cv.height = 16;
  const g = cv.getContext('2d'), Rn = rng(still ? 5 : 9);
  if (still) for (let i = 0; i < 4; i++) { g.fillStyle = 'rgba(200,228,255,.45)'; g.fillRect(Math.floor(Rn() * 15), Math.floor(Rn() * 16), 2, 1); }
  else for (const [x, y, len] of [[5, 2, 4], [10, 9, 3]]) for (let k = 0; k < len; k++) { g.fillStyle = `rgba(190,224,255,${.18 + .3 * (1 - k / len)})`; g.fillRect(x, y + k, 1, 1); }
  const tex = new THREE.CanvasTexture(cv);
  tex.magFilter = tex.minFilter = THREE.NearestFilter; tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
const waterTex = { still: streakTexture(true), flow: streakTexture(false) };
const waterMats = [new THREE.MeshBasicMaterial({ map: waterTex.still, transparent: true, opacity: .3, depthWrite: false, side: THREE.DoubleSide }),
  new THREE.MeshBasicMaterial({ map: waterTex.flow, transparent: true, opacity: .8, depthWrite: false, side: THREE.DoubleSide })];
const quad = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
function buildWater(R) {
  const still = [], flowing = [], c = R.c;
  for (let lz = 0; lz < R.h; lz++) for (let lx = 0; lx < R.w; lx++) {
    const i = lz * CHUNK + lx; if (!TILES[c.tiles[i]].liquid) continue;
    const x = R.x0 + lx, z = R.z0 + lz;
    if (world.ents.get(key(x, 0, z))?.kind === 'dam') continue;
    if (c.flow[i] >= 0) { if (hash2(x * 7 + 3, z * 5 + 1) < .5) flowing.push([x, z, c.flow[i]]); } else still.push([x, z, -1]);
  }
  for (const [list, mat, w] of [[still, waterMats[0], 1], [flowing, waterMats[1], .55]]) {
    if (!list.length) continue;
    const im = new THREE.InstancedMesh(quad, mat, list.length);
    list.forEach(([x, z, d], i) => {
      const a = -Math.max(0, d) * Math.PI / 2, side = w < 1 ? (hash2(x, z * 3) - .5) * .4 : 0;
      im.setMatrixAt(i, _m.compose(V(x + .5 + Math.cos(a) * side, .012, z + .5 - Math.sin(a) * side), _q.setFromEuler(_e.set(0, a, 0)), V((hash2(x, z) < .5 ? -1 : 1) * w, 1, 1)));
    });
    im.layers.set(1); im.userData.kind = 'water'; scene.add(im); R.meshes.push(im);
  }
}
const RIVER_SPEED = TILES.find(t => t.current)?.current ?? 1;
export function animateWater(dt) {
  waterTex.flow.offset.y -= RIVER_SPEED * dt;
  waterTex.still.offset.x += .08 * dt; waterTex.still.offset.y = Math.sin(S.T * .4) * .15;
}

// ---------------------------------------------------------------- loading and dropping chunks
function load(cx, cz) {
  const c = chunkOf(cx * CHUNK, cz * CHUNK); if (!c) return null;
  const R = { k: chunkKey(cx, cz), cx, cz, c, x0: cx * CHUNK, z0: cz * CHUNK, w: Math.min(CHUNK, GRID - cx * CHUNK), h: Math.min(CHUNK, GRID - cz * CHUNK),
    layers: {}, meshes: [], featMeshes: [], keys: [] };
  shown.set(R.k, R);
  makeSurface(R, 0);
  buildClutter(R); buildWater(R); R.underClutter = !!c.under;
  hooks.onLoad?.(R);
  applyDepthView(R);
  return R;
}
function unload(R) {
  hooks.onUnload?.(R);
  for (const L of Object.values(R.layers)) { scene.remove(L.mesh); L.mesh.geometry.dispose(); L.mat.dispose(); L.tex?.dispose(); }
  for (const im of R.meshes) { scene.remove(im); im.dispose(); if (im.userData.kind === 'feat') for (let i = 0; i < im.count; i++) featIndex.delete(im.uuid + i); }
  for (const k of R.keys) clutter.delete(k);
  for (let i = jobs.length - 1; i >= 0; i--) if (jobs[i].R === R) jobs.splice(i, 1);
  shown.delete(R.k);
}
// Rebuild a chunk's clutter (after its objects changed a lot, say a whole road went).
export function rebuildChunkClutter(R) { refreshClutter(R); applyDepthView(R); }
function refreshClutter(R) {
  for (const im of R.meshes) { scene.remove(im); im.dispose(); }
  for (const k of R.keys) clutter.delete(k);
  R.meshes = []; R.featMeshes = []; R.keys = [];
  buildClutter(R); buildWater(R);
  hooks.onClutter?.(R);
}
export function dropAllChunks() { for (const R of [...shown.values()]) unload(R); jobs.length = 0; }

// The camera looks at (x, z) and sees about `r` tiles around it at `ppu` pixels a tile. `first`: load everything now.
let floraOn = true;
export function updateTerrain(x, z, r, ppu, first = false) {
  wantTp = ppu >= 16 ? 16 : ppu >= 10 ? 8 : 4;
  const C = CHUNK, keep = new Set(), near = [];
  for (let cx = Math.floor((x - r) / C); cx <= Math.floor((x + r) / C); cx++) for (let cz = Math.floor((z - r) / C); cz <= Math.floor((z + r) / C); cz++) {
    if (cx < 0 || cz < 0 || cx * C >= GRID || cz * C >= GRID) continue;
    keep.add(chunkKey(cx, cz)); near.push([cx, cz]);
  }
  // nearest first, and only a couple of new chunks a frame so walking never hitches (all of them on the first frame)
  near.sort((a, b) => Math.hypot(a[0] * C + 16 - x, a[1] * C + 16 - z) - Math.hypot(b[0] * C + 16 - x, b[1] * C + 16 - z));
  let made = 0;
  for (const [cx, cz] of near) if (!shown.has(chunkKey(cx, cz)) && (first || made++ < 2)) load(cx, cz);
  // drop chunks well out of view (with some slack, so turning back doesn't reload them)
  for (const R of [...shown.values()]) if (!keep.has(R.k) && dist(R, x, z) > r + C * 1.6) unload(R);
  for (const R of shown.values()) for (const y of Object.keys(R.layers)) queue(R, +y);
  const fl = ppu >= 10;
  if (fl !== floraOn) { floraOn = fl; for (const R of shown.values()) for (const im of R.meshes) if (im.userData.kind === 'flora') im.visible = fl && visibleFor(im); }
  runJobs(first ? 400 : 5, x, z);
}
// Depth mode: the ground goes see-through when looking below it, and underground floors get painted when first seen.
function visibleFor(im) {
  const { depth, layer } = depthView, y = im.userData.y;
  if (im.userData.kind === 'water') return !(depth && layer < 0);
  return y < 0 ? depth && y === layer : !depth || y <= layer;   // underground clutter only on the floor being looked at
}
const see = (mt, on, op) => { if (mt.transparent !== on) mt.needsUpdate = true; mt.transparent = on; mt.opacity = on ? op : 1; mt.depthWrite = !on; };
function applyDepthView(R) {
  const { depth, layer } = depthView;
  for (const y of [-1, -2]) if (depth && layer <= y + 1 && !R.layers[y]) makeSurface(R, y);
  const L0 = R.layers[0], L1 = R.layers[-1], see0 = depth && layer < 0, see1 = depth && layer < -1;
  if (L0) { see(L0.mat, see0, .12); L0.mesh.layers.set(see0 ? 1 : 0); }
  if (L1) { see(L1.mat, see1, .15); L1.mesh.layers.set(see1 ? 1 : 0); }
  for (const im of R.meshes) im.visible = visibleFor(im) && (im.userData.kind !== 'flora' || floraOn);
}
export function setDepthView(depth, layer) {
  depthView = { depth, layer };
  see(sideMat, depth && layer < 0, .12);
  for (const R of shown.values()) applyDepthView(R);
}
