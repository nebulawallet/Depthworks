// Rendering. The world is drawn at low resolution with a camera snapped to the pixel grid (the leftover
// sub-pixel offset is applied by sliding the canvas, so motion stays smooth without shimmering), then a
// post pass draws pixel outlines from depth and normal edges and upscales with hard pixels.
import * as THREE from 'three';
import { ENTITIES, ITEMS, TILES, VOLTAGES, ROADS, VEHICLES, FRAMES, FLUIDS, RECIPE } from './data.js';
import { S, world, bus, key, DIRS, GRID, rng, tileAt, isWater, factoryOf } from './state.js';
import { makeMesh, disposeMesh, setGhost, setPreview, poseInserter, itemGeo, itemMat, animateTreads, makePlayer, animatePlayer, toonRamp, facet, M, UI_LAYER, makeVehicle, fishGeo } from './models.js';
import { canPlace, distTo, mineTargetAt, voltsOf } from './sim.js';
import { visibleOnBelt, laneOffset, lineWarn, lanesOf } from './belts.js';
import { roadAt, roadCells, signalRed, vehicleById, onWay, dockTiles, vstats } from './transport.js';
import { isDown } from './input.js';

export const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(1);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.BasicShadowMap;
const canvas = renderer.domElement;
canvas.id = 'view';
document.body.prepend(canvas);

export const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0b0d12);
export const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 300);
camera.layers.enable(1);

// ppu = low-res pixels per world unit. Zoom moves between whole-pixel steps so tiles stay crisp.
export const ZOOMS = [6, 8, 10, 12, 16, 20, 24, 32, 40];
S.cam = { yaw: 0, yawT: 0, pitch: .82, pitchT: .82, ppu: 20, ppuT: 20, x: 48, z: 52, y: 0 };
S.pix = 3;

// ---------------------------------------------------------------- render targets + outline pass
let lowW = 2, lowH = 2, rtColor, rtNormal;
const normalMat = new THREE.MeshNormalMaterial();
const post = new THREE.ShaderMaterial({
  uniforms: { tColor: { value: null }, tDepth: { value: null }, tNormal: { value: null }, res: { value: new THREE.Vector2() }, depthScale: { value: 299 }, depthEdge: { value: .1 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
  fragmentShader: `
    uniform sampler2D tColor, tDepth, tNormal; uniform vec2 res; uniform float depthScale, depthEdge;
    varying vec2 vUv;
    float D(vec2 uv) { return texture2D(tDepth, uv).r * depthScale; }
    vec3 N(vec2 uv) { return texture2D(tNormal, uv).rgb * 2.0 - 1.0; }
    vec3 toSRGB(vec3 c) { return mix(c * 12.92, 1.055 * pow(max(c, 0.0), vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
    void main() {
      vec2 px = 1.0 / res;
      float d = D(vUv); vec3 n = N(vUv);
      float dSum = 0.0, nSum = 0.0;
      vec2 off[4]; off[0] = vec2(px.x, 0.0); off[1] = vec2(-px.x, 0.0); off[2] = vec2(0.0, px.y); off[3] = vec2(0.0, -px.y);
      for (int i = 0; i < 4; i++) {
        float d2 = D(vUv + off[i]);
        dSum += clamp(d2 - d, 0.0, 2.0);                     // neighbour further away: we are a silhouette edge
        vec3 n2 = N(vUv + off[i]);
        float lead = smoothstep(-0.01, 0.01, dot(n - n2, vec3(-1.0, 1.0, 0.6)));   // only one side of a crease lights up
        float sameSurface = step(d - d2, depthEdge);
        nSum += distance(n, n2) * lead * sameSurface;
      }
      vec3 c = texture2D(tColor, vUv).rgb;
      if (dSum > depthEdge) c *= 0.32;
      else if (nSum > 0.35) c = c * 1.35 + 0.012;
      c = (c - 0.5 * c * c) * 1.12;                          // gentle filmic shoulder
      gl_FragColor = vec4(toSRGB(c), 1.0);
    }`,
  depthTest: false, depthWrite: false,
});
const postScene = new THREE.Scene(), postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
postScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), post));
function makeTargets() {
  rtColor?.dispose(); rtNormal?.dispose();
  const o = { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter };
  rtColor = new THREE.WebGLRenderTarget(lowW, lowH, { ...o, type: THREE.HalfFloatType });
  rtColor.depthTexture = new THREE.DepthTexture(lowW, lowH);
  rtNormal = new THREE.WebGLRenderTarget(lowW, lowH, o);
  post.uniforms.tColor.value = rtColor.texture; post.uniforms.tDepth.value = rtColor.depthTexture; post.uniforms.tNormal.value = rtNormal.texture;
  post.uniforms.res.value.set(lowW, lowH);
}
export function resize() {
  lowW = Math.ceil(innerWidth / S.pix) + 2; lowH = Math.ceil(innerHeight / S.pix) + 2;   // one spare pixel each side for sub-pixel sliding
  renderer.setSize(lowW, lowH, false);
  Object.assign(canvas.style, { width: lowW * S.pix + 'px', height: lowH * S.pix + 'px', left: -S.pix + 'px', top: -S.pix + 'px' });
  makeTargets();
}
addEventListener('resize', resize); resize();

scene.add(new THREE.HemisphereLight(0xc4d6ff, 0x5a4632, 1.25));
const sun = new THREE.DirectionalLight(0xfff0d0, 2.7);
sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -.002; sun.shadow.normalBias = .02;
Object.assign(sun.shadow.camera, { left: -36, right: 36, top: 36, bottom: -36, near: 1, far: 180 });
scene.add(sun, sun.target);

// ---------------------------------------------------------------- terrain
const TP = 16;   // texels per tile: at the default zoom one texel is one screen pixel
function hash2(x, y) { let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967295; }
function vnoise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi), b = hash2(xi + 1, yi), c = hash2(xi, yi + 1), d = hash2(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
const fbm = (x, y) => vnoise(x, y) * .5 + vnoise(x * 2.1, y * 2.1) * .3 + vnoise(x * 4.3, y * 4.3) * .2;
const PALETTES = {
  0: [[66, 56, 44], [96, 80, 58], [74, 80, 56], [112, 94, 66]],
  '-1': [[38, 36, 42], [52, 48, 54], [44, 42, 50], [60, 56, 62]],
  '-2': [[28, 22, 38], [40, 32, 52], [32, 28, 44], [48, 38, 62]],
};
const layers = {};
// Ore presence per layer as a flat grid, so painting can blend patch edges across tiles cheaply.
const ORE_IDS = Object.keys(ITEMS);
function oreGrid(y) {
  const L = layers[y];
  if (!L.ore) { L.ore = new Int16Array(GRID * GRID).fill(-1); for (const [k, o] of world.ores) { const [x, yy, z] = k.split(',').map(Number); if (yy === y) L.ore[z * GRID + x] = ORE_IDS.indexOf(o.type); } }
  return L.ore;
}
// How far each water tile is from land (0 on land), for darker deep water.
function depthGrid() {
  const L = layers[0];
  if (L.depth) return L.depth;
  const d = L.depth = new Float32Array(GRID * GRID), q = [];
  for (let i = 0; i < GRID * GRID; i++) { if (TILES[world.tiles[i]].liquid) d[i] = Infinity; else q.push(i); }
  for (let h = 0; h < q.length; h++) {
    const i = q[h], x = i % GRID, z = (i / GRID) | 0;
    for (const [dx, dz] of DIRS) { const nx = x + dx, nz = z + dz, j = nz * GRID + nx; if (nx >= 0 && nz >= 0 && nx < GRID && nz < GRID && d[j] > d[i] + 1) { d[j] = d[i] + 1; q.push(j); } }
  }
  return d;
}
const SAND = [126, 110, 78];
// Water and shore for one surface pixel, blended across tile centres like ore so coasts come out organic.
// Returns null for dry ground well away from water.
function waterPixel(wx, wz, c) {
  const fx = wx - .5, fz = wz - .5, x0 = Math.floor(fx), z0 = Math.floor(fz), tx = fx - x0, tz = fz - z0, dg = depthGrid();
  let field = 0, depth = 0, best = 0, bw = 0;
  for (const [cx, cz, w] of [[x0, z0, (1 - tx) * (1 - tz)], [x0 + 1, z0, tx * (1 - tz)], [x0, z0 + 1, (1 - tx) * tz], [x0 + 1, z0 + 1, tx * tz]]) {
    const t = tileAt(cx, cz);
    if (!TILES[t].liquid) continue;
    field += w; depth += w * Math.min(4, dg[cz * GRID + cx]);
    if (w > bw) { bw = w; best = t; }
  }
  if (!field) return null;
  field += (vnoise(wx * 3.7, wz * 3.7) - .5) * .3;
  if (field < .32) return null;
  if (field < .5) { const k = (field - .32) / .18; return c.map((v, i) => v * (1 - k) + SAND[i] * k); }   // wet sand
  const p = TILES[best].paint, dk = 1 - Math.min(3, depth / Math.max(.01, field)) * .1, ripple = (vnoise(wx * 2.3, wz * 5.1) - .5) * 14;
  const foam = field < .56 && !TILES[best].current ? 18 : 0;   // a light rim on still shores only
  return p.map(v => v * dk + ripple + foam);
}
// Crude oil: a dark glossy stain, bigger and blacker where the well is richer.
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
  let corner = null;   // exactly two neighbours of its own kind, at right angles: round off the outside corner
  const on = [0, 1, 2, 3].filter(d => same[d]);
  if (on.length === 2 && (on[0] + on[1]) % 2 === 1 && n.every((t, d) => on.includes(d) || !t)) corner = [.5 + (DIRS[on[0]][0] + DIRS[on[1]][0]) * .5, .5 + (DIRS[on[0]][1] + DIRS[on[1]][1]) * .5];
  const junction = !walk && n.some(t => car(t) && t.a !== r.a);
  // an approach: the next tile along the road is a junction tile
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
  if (I.corner && Math.hypot(fx - I.corner[0], fz - I.corner[1]) > 1) return null;   // rounded outside corner
  if (I.walk) {   // paving slabs with grout, and a pale kerb where it meets a road
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
  if (I.approach >= 0) {   // zebra crossing or a stop line on the edge that meets the junction
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
function paintTile(y, x, z) {
  const L = layers[y], g = L.ctx, pal = PALETTES[y], og = oreGrid(y);
  const at = (tx, tz) => tx < 0 || tz < 0 || tx >= GRID || tz >= GRID ? -1 : og[tz * GRID + tx];
  const img = L.img ||= g.createImageData(TP, TP), d = img.data;
  const road = y === 0 ? roadInfo(x, z) : null, oil = y === 0 ? world.oil.get(x + ',' + z) : null;
  for (let py = 0; py < TP; py++) for (let px = 0; px < TP; px++) {
    const wx = x + (px + .5) / TP, wz = z + (py + .5) / TP;
    const n = fbm(wx * .18 + y * 9, wz * .18), m = vnoise(wx * .9, wz * .9), grain = hash2(x * TP + px + y * 7777, z * TP + py);
    const i0 = Math.min(2, Math.floor(n * 3.2)), t = Math.min(1, Math.max(0, n * 3.2 - i0));
    let c = pal[t > .5 ? i0 + 1 : i0].slice();   // hard steps between soil bands
    const lift = (m - .5) * 10 + (grain - .5) * 8;
    c = c.map(v => v + lift);
    // ore ground: bilinear presence between tile centres, roughened with noise, so patches have organic edges
    const fx = wx - .5, fz = wz - .5, x0 = Math.floor(fx), z0 = Math.floor(fz), tx = fx - x0, tz = fz - z0;
    const corners = [[x0, z0, (1 - tx) * (1 - tz)], [x0 + 1, z0, tx * (1 - tz)], [x0, z0 + 1, (1 - tx) * tz], [x0 + 1, z0 + 1, tx * tz]];
    let field = 0, best = -1, bw = 0;
    for (const [cx, cz, w] of corners) { const id = at(cx, cz); if (id >= 0) { field += w; if (w > bw) { bw = w; best = id; } } }
    if (best >= 0 && field + (vnoise(wx * 3.1, wz * 3.1) - .5) * .7 > .45) {
      const h = ITEMS[ORE_IDS[best]].color, oc = [h >> 16 & 255, h >> 8 & 255, h & 255];
      c = c.map((v, k) => v * .82 + oc[k] * .05);
      if (grain < .16) c = oc.map(v => v * (.6 + grain * 2.4));
    }
    if (y === 0) { const w = waterPixel(wx, wz, c); if (w) c = w; }
    if (oil) c = oilPixel(oil, wx - x, wz - z, c, grain);
    if (road) { const r = roadPixel(road, wx - x, wz - z, c, x, z); if (r) c = r; }
    c = c.map(v => Math.round(v / 4) * 4);
    const i = (py * TP + px) * 4; d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = 255;
  }
  g.putImageData(img, x * TP, z * TP);
}
function makeLayer(y) {
  const c = document.createElement('canvas'); c.width = c.height = GRID * TP;
  const ctx = c.getContext('2d'); layers[y] = { ctx };
  for (let x = 0; x < GRID; x++) for (let z = 0; z < GRID; z++) paintTile(y, x, z);
  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = tex.minFilter = THREE.NearestFilter; tex.colorSpace = THREE.SRGBColorSpace;
  layers[y].tex = tex;
  return tex;
}
const sideMat = new THREE.MeshToonMaterial({ color: 0x3b2f24, gradientMap: toonRamp });
let slab, topMat, underPlanes = {};
const clutterMeshes = [];   // ore piles, ground cover, trees and rocks: everything instanced on tiles

// ---------------------------------------------------------------- tile clutter (instanced)
// clutter.get(tileKey) -> [[instancedMesh, index, matrix]] so a tile can be hidden when built on.
const clutter = new Map(), _hid = new THREE.Matrix4().makeScale(0, 0, 0);
function addClutter(k, im, i, m) { im.setMatrixAt(i, m); (clutter.get(k) || clutter.set(k, []).get(k)).push([im, i, m.clone()]); }
function showClutter(k, show) {
  for (const [im, i, m] of clutter.get(k) || []) { im.setMatrixAt(i, show ? m : _hid); im.instanceMatrix.needsUpdate = true; }
}
function inst(geo, mat, n, y = 0) {
  const im = new THREE.InstancedMesh(geo, mat, Math.max(1, n)); im.count = n; im.userData.y = y;
  im.castShadow = true; im.receiveShadow = true; scene.add(im); clutterMeshes.push(im); return im;
}
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _c = new THREE.Color();
const V = (x, y, z) => new THREE.Vector3(x, y, z);

const ORE_LOOK = {
  iron_ore: 0x8a96a8, copper_ore: 0xd07a42, coal: 0x2c2c32, stone: 0xb4a68c, crystal: 0x7ef6ff, abyssal_ore: 0x9a62e0,
};
function buildClutter() {
  clutterMeshes.forEach(m => { scene.remove(m); m.dispose(); }); clutterMeshes.length = 0; clutter.clear(); featIndex.clear();
  // ore piles: three chunks per tile, sized by how rich the tile is
  const byType = {};
  for (const [k, o] of world.ores) (byType[o.type + '|' + k.split(',')[1]] ||= []).push([k, o]);
  for (const [tk, list] of Object.entries(byType)) {
    const type = tk.split('|')[0], glow = type === 'crystal' || type === 'abyssal_ore';
    const geo = type === 'crystal' ? facet(new THREE.OctahedronGeometry(.12, 0).scale(.7, 1.8, .7).translate(0, .18, 0)) : facet(new THREE.DodecahedronGeometry(.13, 0).scale(1, .62, 1).translate(0, .06, 0));
    const im = inst(geo, M(0xffffff, glow ? { emissive: ITEMS[type].emissive, emissiveIntensity: .8 } : {}), list.length * 4, +tk.split('|')[1]);
    list.forEach(([k, o], i) => {
      const [x, y, z] = k.split(',').map(Number), r = rng(x * 131 + z * 71 + y * 17), rich = .55 + .45 * Math.min(1, o.amount / 900);
      for (let j = 0; j < 4; j++) {
        const s = rich * (.75 + r() * .75) * (j === 0 ? 1.35 : 1);
        _m.compose(V(x + .12 + r() * .76, y, z + .12 + r() * .76), _q.setFromEuler(_e.set((r() - .5) * .4, r() * 6, (r() - .5) * .4)), V(s, s * (.8 + r() * .5), s));
        addClutter(k, im, i * 4 + j, _m);
        _c.setHex(ORE_LOOK[type]).multiplyScalar(.8 + r() * .35); im.setColorAt(i * 4 + j, _c);
      }
    });
  }
  // ground cover: tufts and pebbles on empty surface tiles
  const tufts = [], pebbles = [];
  for (let x = 0; x < GRID; x++) for (let z = 0; z < GRID; z++) {
    const k = key(x, 0, z); if (world.ores.has(k) || world.feats.has(k) || isWater(x, z) || world.roads.has(x + ',' + z) || world.oil.has(x + ',' + z)) continue;
    const h = hash2(x * 3 + 1, z * 5 + 2);
    if (h < .2) tufts.push([k, x, z, h]); else if (h > .93) pebbles.push([k, x, z, h]);
  }
  const tuftIm = inst(new THREE.ConeGeometry(.05, .2, 3).translate(0, .1, 0), M(0xffffff), tufts.length * 3);
  tufts.forEach(([k, x, z, h], i) => {
    const r = rng(x * 977 + z), cx = x + .2 + r() * .6, cz = z + .2 + r() * .6;
    for (let j = 0; j < 3; j++) {
      _m.compose(V(cx + (r() - .5) * .14, 0, cz + (r() - .5) * .14), _q.setFromEuler(_e.set((r() - .5) * .6, 0, (r() - .5) * .6)), V(1, .6 + r() * .9, 1));
      addClutter(k, tuftIm, i * 3 + j, _m);
      _c.setHSL(.2 + h * .5, .35, .3 + r() * .12); tuftIm.setColorAt(i * 3 + j, _c);
    }
  });
  const pebIm = inst(facet(new THREE.DodecahedronGeometry(.07, 0).scale(1, .6, 1)), M(0xffffff), pebbles.length);
  pebbles.forEach(([k, x, z], i) => {
    const r = rng(x * 31 + z * 7), s = .7 + r() * .8;
    _m.compose(V(x + .2 + r() * .6, .02, z + .2 + r() * .6), _q.setFromEuler(_e.set(0, r() * 6, 0)), V(s, s, s));
    addClutter(k, pebIm, i, _m); _c.setHex(0x8a7f70).multiplyScalar(.8 + r() * .4); pebIm.setColorAt(i, _c);
  });
  // trees and rocks
  const trees = [], rocks = [];
  for (const [k, f] of world.feats) (f.type === 'tree' ? trees : rocks).push([k, f]);
  const trunk = inst(new THREE.CylinderGeometry(.06, .1, .55, 5).translate(0, .27, 0), M(0x5a3a22), trees.length);
  const crownA = inst(facet(new THREE.IcosahedronGeometry(.36, 0).scale(1, .8, 1).translate(0, .72, 0)), M(0xffffff), trees.length);
  const crownB = inst(facet(new THREE.IcosahedronGeometry(.26, 0).scale(1, .85, 1).translate(.08, 1.02, -.04)), M(0xffffff), trees.length);
  trees.forEach(([k, f], i) => {
    const [x, , z] = k.split(',').map(Number), s = .85 + f.v * .45;
    _m.compose(V(x + .5, 0, z + .5), _q.setFromEuler(_e.set(0, f.v * 6, 0)), V(s, s, s));
    addClutter(k, trunk, i, _m); addClutter(k, crownA, i, _m); addClutter(k, crownB, i, _m);
    _c.setHSL(.3 + f.v * .16, .38, .25 + f.v * .07); crownA.setColorAt(i, _c); _c.offsetHSL(.02, .02, .07); crownB.setColorAt(i, _c);
    featIndex.set(crownA.uuid + i, k); featIndex.set(crownB.uuid + i, k); featIndex.set(trunk.uuid + i, k);
  });
  const rock = inst(facet(new THREE.DodecahedronGeometry(.42, 0).scale(1, .6, 1).translate(0, .17, 0)), M(0xffffff), rocks.length);
  rocks.forEach(([k, f], i) => {
    const [x, , z] = k.split(',').map(Number), s = .75 + f.v * .45;
    _m.compose(V(x + .5, 0, z + .5), _q.setFromEuler(_e.set(0, f.v * 6, 0)), V(s, s, s));
    addClutter(k, rock, i, _m); _c.setHex(0x8f8576).multiplyScalar(.85 + f.v * .3); rock.setColorAt(i, _c);
    featIndex.set(rock.uuid + i, k);
  });
  featMeshes = [trunk, crownA, crownB, rock];
  // crude oil: a dark puddle with a sheen over each well
  const wells = [...world.oil.keys()];
  const oilIm = inst(new THREE.CylinderGeometry(.3, .34, .02, 10), M(0x1a161e, { emissive: 0x2a2440, emissiveIntensity: .35 }), wells.length);
  oilIm.castShadow = false;
  wells.forEach((k2, i) => { const [x, z] = k2.split(',').map(Number), r = rng(x * 31 + z * 17); _m.compose(V(x + .5, .012, z + .5), _q.setFromEuler(_e.set(0, r() * 6, 0)), V(1, 1, .8 + r() * .3)); addClutter(key(x, 0, z), oilIm, i, _m); });
  for (const im of clutterMeshes) if (im.instanceColor) im.instanceColor.needsUpdate = true;
  // hide clutter under anything already built
  for (const e of world.ents.values()) showClutter(key(e.x, e.y, e.z), false);
}
let featMeshes = [];
const featIndex = new Map();

// ---------------------------------------------------------------- water surface
// Painted water lives in the terrain texture; on top, a thin animated sheet: slow glints on still water and
// streaks that run along each river tile's flow direction (quads are built facing north and rotated, like models).
function streakTexture(still) {
  const c = document.createElement('canvas'); c.width = c.height = 16;
  const g = c.getContext('2d'), R = rng(still ? 5 : 9);
  if (still) for (let i = 0; i < 4; i++) { g.fillStyle = 'rgba(200,228,255,.45)'; g.fillRect(Math.floor(R() * 15), Math.floor(R() * 16), 2, 1); }
  else for (const [x, y, len] of [[5, 2, 4], [10, 9, 3]]) {   // two soft ripples, brighter at the head
    for (let k = 0; k < len; k++) { g.fillStyle = `rgba(190,224,255,${.18 + .3 * (1 - k / len)})`; g.fillRect(x, y + k, 1, 1); }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = tex.minFilter = THREE.NearestFilter; tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
const waterTex = { still: streakTexture(true), flow: streakTexture(false) };
const waterMeshes = [];
function buildWater() {
  waterMeshes.forEach(m => { scene.remove(m); m.dispose(); }); waterMeshes.length = 0;
  const still = [], flowing = [];
  for (let z = 0; z < GRID; z++) for (let x = 0; x < GRID; x++) {
    const t = TILES[world.tiles[z * GRID + x]];
    if (t.liquid) (world.flow[z * GRID + x] >= 0 ? flowing : still).push([x, z, world.flow[z * GRID + x]]);
  }
  const quad = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  // ripples only on some tiles, each a narrow strip nudged sideways and mirrored, so the current reads
  // without a pattern repeating tile after tile
  const sparse = flowing.filter(([x, z]) => hash2(x * 7 + 3, z * 5 + 1) < .5);
  for (const [list, tex, op, w] of [[still, waterTex.still, .3, 1], [sparse, waterTex.flow, .8, .55]]) {
    if (!list.length) continue;
    const im = new THREE.InstancedMesh(quad, new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: op, depthWrite: false, side: THREE.DoubleSide }), list.length);
    list.forEach(([x, z, d], i) => {
      const a = -Math.max(0, d) * Math.PI / 2, side = w < 1 ? (hash2(x, z * 3) - .5) * .4 : 0;
      im.setMatrixAt(i, _m.compose(V(x + .5 + Math.cos(a) * side, .012, z + .5 - Math.sin(a) * side), _q.setFromEuler(_e.set(0, a, 0)), V((hash2(x, z) < .5 ? -1 : 1) * w, 1, 1)));
    });
    im.layers.set(1); im.frustumCulled = false; scene.add(im); waterMeshes.push(im);
  }
}
const RIVER_SPEED = TILES.find(t => t.current)?.current ?? 1;
function animateWater(dt) {
  waterTex.flow.offset.y -= RIVER_SPEED * dt;   // texture v runs north on an unrotated quad
  waterTex.still.offset.x += .08 * dt; waterTex.still.offset.y = Math.sin(S.T * .4) * .15;
}

export function buildTerrain() {
  for (const o of [slab, ...Object.values(underPlanes)]) if (o) scene.remove(o);
  buildWater();
  topMat = new THREE.MeshToonMaterial({ map: makeLayer(0), gradientMap: toonRamp });
  slab = new THREE.Mesh(new THREE.BoxGeometry(GRID, 2, GRID), [sideMat, sideMat, topMat, sideMat, sideMat, sideMat]);
  slab.position.set(GRID / 2, -1, GRID / 2); slab.receiveShadow = true; scene.add(slab);
  // underground floors are painted the first time you look down there (saves most of the start-up time)
  for (const y of [-1, -2]) {
    delete layers[y];
    const p = new THREE.Mesh(new THREE.PlaneGeometry(GRID, GRID).rotateX(-Math.PI / 2), new THREE.MeshToonMaterial({ color: 0x2a2630, gradientMap: toonRamp }));
    p.position.set(GRID / 2, y + .002, GRID / 2); p.receiveShadow = true; scene.add(p); underPlanes[y] = p;
  }
  buildClutter();
}
// A road change repaints its tiles and their neighbours (corners, kerbs and junction markings depend on them).
bus.on('roads', list => {
  if (!layers[0]) return;
  const seen = new Set();
  for (const [x, z] of list || []) for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
    const tx = x + dx, tz = z + dz, k = tx + ',' + tz;
    if (tx < 0 || tz < 0 || tx >= GRID || tz >= GRID || seen.has(k)) continue;
    seen.add(k); paintTile(0, tx, tz);
  }
  for (const [x, z] of list || []) showClutter(key(x, 0, z), !roadAt(x, z) && !world.ents.has(key(x, 0, z)));
  layers[0].tex.needsUpdate = true;
});
bus.on('ore', (x, y, z) => {
  showClutter(key(x, y, z), false); clutter.delete(key(x, y, z));
  if (!layers[y]) return;
  oreGrid(y)[z * GRID + x] = -1;
  for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) if (x + dx >= 0 && z + dz >= 0 && x + dx < GRID && z + dz < GRID) paintTile(y, x + dx, z + dz);
  layers[y].tex.needsUpdate = true;
});
bus.on('feat', (x, z) => {
  const k = key(x, 0, z);
  burst(x + .5, .5, z + .5, 14, 0x6a8a4a, 2.2);
  showClutter(k, false); clutter.delete(k);
});

const layerGrid = new THREE.GridHelper(GRID, GRID, 0x7ef6ff, 0x7ef6ff);
layerGrid.material.transparent = true; layerGrid.material.opacity = .06; layerGrid.material.depthWrite = false;
layerGrid.position.set(GRID / 2, .01, GRID / 2); layerGrid.visible = false; layerGrid.layers.set(UI_LAYER); scene.add(layerGrid);

// ---------------------------------------------------------------- particles (smoke, dust, chips)
const PMAX = 900, parts = [];
const pMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshToonMaterial({ color: 0xffffff, gradientMap: toonRamp }), PMAX);
pMesh.count = 0; pMesh.frustumCulled = false; pMesh.castShadow = false; scene.add(pMesh);
pMesh.setColorAt(0, new THREE.Color(1, 1, 1));
export function emit(p) { if (parts.length < PMAX) parts.push({ life: 0, grav: 0, drag: 1, grow: 0, ...p }); }
export function burst(x, y, z, n, color, spread = 1.5, size = .07) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, s = spread * (.4 + Math.random() * .6);
    emit({ x, y, z, vx: Math.cos(a) * s, vy: 1 + Math.random() * 2, vz: Math.sin(a) * s, max: .45 + Math.random() * .3, size: size * (.7 + Math.random() * .6), color, grav: 9, drag: 2 });
  }
}
function smoke(x, y, z, dark = false) {
  emit({ x: x + (Math.random() - .5) * .08, y, z: z + (Math.random() - .5) * .08, vx: .15 + (Math.random() - .5) * .15, vy: .7 + Math.random() * .3, vz: (Math.random() - .5) * .15,
    max: 1.8 + Math.random(), size: .1, grow: .22, color: dark ? 0x45454c : 0x8c8c94, drag: .4 });
}
function updateParticles(dt) {
  let n = 0;
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i]; p.life += dt;
    if (p.life >= p.max) { parts.splice(i, 1); continue; }
    p.vy -= p.grav * dt; const k = Math.max(0, 1 - p.drag * dt); p.vx *= k; p.vy *= k; p.vz *= k;
    p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
    if (p.grav && p.y < .02) { p.y = .02; p.vy *= -.3; p.vx *= .6; p.vz *= .6; }
    const t = p.life / p.max, s = (p.size + p.grow * t) * (1 - t * t);
    _m.compose(V(p.x, p.y, p.z), _q.setFromEuler(_e.set(p.life * 2, p.life * 3, 0)), V(s, s, s));
    pMesh.setMatrixAt(n, _m); _c.setHex(p.color); pMesh.setColorAt(n, _c); n++;
  }
  pMesh.count = n; pMesh.instanceMatrix.needsUpdate = true; if (pMesh.instanceColor) pMesh.instanceColor.needsUpdate = true;
}

// ---------------------------------------------------------------- entity meshes
function attach(e) { e.mesh = makeMesh(e); scene.add(e.mesh); e.ghost = undefined; applyGhost(e); }
function detach(e) { if (e.mesh) { scene.remove(e.mesh); disposeMesh(e.mesh); e.mesh = null; } }
bus.on('placed', e => {
  attach(e);
  if (e.kind !== 'frame') showClutter(key(e.x, e.y, e.z), false);
  if (S.started) { e.pop = 0; burst(e.x + .5, e.y + .05, e.z + .5, 10, 0x8a7a62, 1.6, .06); }
});
bus.on('removed', e => {
  detach(e);
  if (!world.ents.has(key(e.x, e.y, e.z))) showClutter(key(e.x, e.y, e.z), true);
  if (S.started) burst(e.x + .5, e.y + .2, e.z + .5, 8, 0x9a9aa2, 1.4, .06);
});
bus.on('remesh', e => { if (e.mesh) { detach(e); attach(e); } });
export function remeshAll() {
  for (const e of [...world.ents.values(), ...world.frames.values()]) { detach(e); attach(e); }
  previewKey = '';
}
bus.on('tier', remeshAll);

const isGhost = e => S.mode === 'depth' && e.y > S.layer;
function applyGhost(e) { const g = isGhost(e); if (g !== e.ghost) { e.ghost = g; setGhost(e.mesh, g); } }
export function applyGhostAll() {
  for (const e of world.ents.values()) applyGhost(e);
  for (const e of world.frames.values()) applyGhost(e);
  const depth = S.mode === 'depth', see0 = depth && S.layer < 0;
  for (const y of [-1, -2]) if (depth && S.layer <= y + 1 && !layers[y]) { const m = underPlanes[y].material; m.map = makeLayer(y); m.color.set(0xffffff); m.needsUpdate = true; }
  const see = (mt, on, op) => { if (mt.transparent !== on) mt.needsUpdate = true; mt.transparent = on; mt.opacity = on ? op : 1; mt.depthWrite = !on; };
  for (const mt of [sideMat, topMat]) see(mt, see0, .12);
  slab.layers.set(see0 ? 1 : 0);
  const see1 = depth && S.layer < -1;
  see(underPlanes[-1].material, see1, .15); underPlanes[-1].layers.set(see1 ? 1 : 0);
  for (const im of clutterMeshes) im.visible = !depth || im.userData.y <= S.layer;
  for (const im of waterMeshes) im.visible = !see0;
  layerGrid.visible = depth; layerGrid.position.y = S.layer + .012;
}

// ---------------------------------------------------------------- items on belts and on the ground (instanced)
const instItems = {};
const _m4 = new THREE.Matrix4();
function instFor(type) {
  let r = instItems[type];
  if (!r || r.count >= r.cap) {
    const cap = r ? r.cap * 2 : 512;
    const im = new THREE.InstancedMesh(itemGeo(type), itemMat(type), cap);
    im.frustumCulled = false; im.castShadow = true;
    if (r) scene.remove(r.im);
    scene.add(im);
    r = instItems[type] = { im, cap, count: 0 };
  }
  return r;
}
// Where an item p along tile b sits, `o` to the side of the centre line (its lane: negative is left).
// On a curve the inner lane runs on a tighter arc.
export function beltItemPos(b, p, out, o = 0) {
  let lx = o, lz = .5 - p, ly = 0;
  if (b.curve) {
    const th = Math.PI / 2 * (1 - Math.min(1, p));
    if (b.curve === 'L') { const r = .5 + o; lx = -.5 + r * Math.cos(th); lz = -.5 + r * Math.sin(th); }
    else { const r = .5 - o; lx = .5 - r * Math.cos(th); lz = -.5 + r * Math.sin(th); }
  } else if (b.kind === 'underground' && b.role === 'in') lz = .5 - Math.min(p, .5);
  else if (b.kind === 'underground') lz = .5 - (p - (b.len - 1));
  else if (b.kind === 'lift') ly = p * b.dy + .04;
  const [fx, fz] = DIRS[b.dir];
  out.set(b.x + .5 + lx * -fz - lz * fx, b.y + .11 + ly, b.z + .5 + lx * fx - lz * fz);
  return out;
}
const _p = new THREE.Vector3(), _q0 = new THREE.Quaternion(), _sc = new THREE.Vector3();
// Items sit on lines (belts.js): walk each lane front to back, keeping track of which tile we are on.
function updateItems() {
  for (const r of Object.values(instItems)) r.count = 0;
  for (const ln of world.lines) {
    if (!ln.packed) continue;
    const segs = ln.segs, sc = ln.n === 3 ? .55 : .65;
    _sc.set(sc, sc, sc);
    ln.L.forEach((L, li) => {
      const o = laneOffset(ln.n, li);
      let j = segs.length - 1;
      for (const it of L.items) {
        while (j > 0 && it.x < segs[j].off) j--;
        const b = segs[j], p = it.x - b.off;
        if (isGhost(b) || !visibleOnBelt(b, p)) continue;
        const r = instFor(it.type);
        beltItemPos(b, p, _p, o);
        r.im.setMatrixAt(r.count++, _m4.compose(_p, _q0, _sc));
      }
    });
  }
  if (!(S.mode === 'depth' && S.layer < 0)) for (const g of world.ground) {
    const r = instFor(g.type);
    _m4.makeTranslation(g.x, .01, g.z);
    r.im.setMatrixAt(r.count++, _m4);
  }
  for (const r of Object.values(instItems)) { r.im.count = r.count; r.im.instanceMatrix.needsUpdate = true; }
}

// ---------------------------------------------------------------- power wires + supply areas
// Auto wires take their voltage's colour; cables strung by hand take the cable item's colour.
const wireMats = new Map(), wireMat = color => wireMats.get(color) || wireMats.set(color, new THREE.LineBasicMaterial({ color })).get(color);
const wireLines = [];
let supplyMesh = null;
const poleTop = p => (ENTITIES[p.type].top ?? 1.26) + p.y;
const SUPPLY_COLORS = [0x4aa3ff, 0xa8d8ff];
bus.on('power', () => {
  wireLines.forEach(l => { scene.remove(l); l.geometry.dispose(); }); wireLines.length = 0;
  const byColor = new Map();
  const span = (a, b, color, offs) => {
    const pts = byColor.get(color) || byColor.set(color, []).get(color);
    const ax = a.x + .5, az = a.z + .5, bx = b.x + .5, bz = b.z + .5, ay = poleTop(a), by = poleTop(b);
    const N = 8, sag = Math.hypot(ax - bx, az - bz) * .06;
    for (const off of offs) for (let i = 0; i < N; i++) for (const t of [i / N, (i + 1) / N])
      pts.push(ax + off + (bx - ax) * t, ay + (by - ay) * t - Math.sin(t * Math.PI) * sag, az + (bz - az) * t);
  };
  for (const [a, b, v] of world.wires || []) span(a, b, VOLTAGES[v]?.wire ?? 0xb8683a, v > 0 ? [-.46, 0, .46] : [-.24, .24]);
  for (const [a, b, kind] of world.cables || []) span(a, b, ITEMS[kind]?.color ?? 0xd88a4a, [0]);
  for (const [color, pts] of byColor) {
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    const l = new THREE.LineSegments(geo, wireMat(color)); l.layers.set(1); scene.add(l); wireLines.push(l);
  }
  if (supplyMesh) { scene.remove(supplyMesh); supplyMesh.dispose(); }
  const poles = [...world.ents.values()].filter(e => e.kind === 'pole');
  supplyMesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: .13, depthWrite: false }), Math.max(1, poles.length));
  poles.forEach((p, i) => {
    const s = ENTITIES[p.type].supply * 2 + 1;
    supplyMesh.setMatrixAt(i, new THREE.Matrix4().compose(V(p.x + .5, p.y + .03, p.z + .5), new THREE.Quaternion(), V(s, 1, s)));
    supplyMesh.setColorAt(i, _c.setHex(SUPPLY_COLORS[voltsOf(ENTITIES[p.type])[0]] ?? SUPPLY_COLORS[0]));
  });
  supplyMesh.count = poles.length; supplyMesh.visible = false; supplyMesh.layers.set(UI_LAYER); supplyMesh.frustumCulled = false; scene.add(supplyMesh);
});

// ---------------------------------------------------------------- unpowered machines
// Factorio's flashing plug: red when a machine has no power at all, yellow when its network is short.
const boltTex = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 16; const g = c.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(3, 1, 10, 14);
  g.fillStyle = '#fff';
  for (const [x, y, w] of [[8, 2, 3], [7, 3, 3], [6, 4, 3], [5, 5, 3], [4, 6, 6], [6, 7, 4], [7, 8, 3], [6, 9, 3], [6, 10, 2], [5, 11, 2], [5, 12, 1]]) g.fillRect(x, y, w, 1);
  const t = new THREE.CanvasTexture(c); t.magFilter = t.minFilter = THREE.NearestFilter; t.colorSpace = THREE.SRGBColorSpace; return t;
})();
const boltMesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(.62, .62), new THREE.MeshBasicMaterial({ map: boltTex, transparent: true, depthTest: false, depthWrite: false }), 512);
boltMesh.layers.set(UI_LAYER); boltMesh.renderOrder = 30; boltMesh.frustumCulled = false; boltMesh.count = 0; boltMesh.setColorAt(0, new THREE.Color(1, 1, 1)); scene.add(boltMesh);
export const powerProblem = e => {
  const def = ENTITIES[e.type];
  if (!def.power && e.kind !== 'engine' && e.kind !== 'solar' && e.kind !== 'fgen') return null;
  if (!e.net) return 'none';
  if (def.power && e.net.capacity <= 0) return 'none';
  if (def.power && e.net.demand > e.net.capacity) return 'low';
  return null;
};
function updateBolts() {
  let n = 0;
  if (S.started) {
    const cx = S.cam.x, cz = S.cam.z, R = Math.max(lowW, lowH) / S.cam.ppu * .75;
    for (const e of world.ents.values()) {
      if (n >= 512 || e.ghost || Math.abs(e.x - cx) > R || Math.abs(e.z - cz) > R) continue;
      const p = powerProblem(e); if (!p) continue;
      _m.compose(V(e.x + .5, e.y + heightOf(e) + .35, e.z + .5), camera.quaternion, V(1, 1, 1));
      boltMesh.setMatrixAt(n, _m); boltMesh.setColorAt(n++, _c.setHex(p === 'none' ? 0xff4a3a : 0xffc83a));
    }
  }
  boltMesh.count = n; boltMesh.material.opacity = .55 + .45 * Math.abs(Math.sin(S.T * 3));
  boltMesh.instanceMatrix.needsUpdate = true; if (boltMesh.instanceColor) boltMesh.instanceColor.needsUpdate = true;
}

// ---------------------------------------------------------------- cable being strung
const linkLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints([V(0, 0, 0), V(0, 0, 0)]), new THREE.LineBasicMaterial({ color: 0xffffff, depthTest: false, transparent: true }));
linkLine.layers.set(UI_LAYER); linkLine.renderOrder = 22; linkLine.frustumCulled = false; scene.add(linkLine);
function updateLinkLine(hover) {
  const from = S.linkFrom && world.ents.get(key(...S.linkFrom));
  linkLine.visible = !!(from && hover);
  if (!linkLine.visible) return;
  const p = linkLine.geometry.attributes.position, to = world.ents.get(key(hover.x, hover.y, hover.z));
  p.setXYZ(0, from.x + .5, poleTop(from), from.z + .5);
  p.setXYZ(1, hover.x + .5, to?.kind === 'pole' ? poleTop(to) : hover.y + .1, hover.z + .5); p.needsUpdate = true;
  linkLine.material.color.setHex(ITEMS[S.sel]?.color ?? 0xffffff);
}

// ---------------------------------------------------------------- the engineers
export let playerMesh = makePlayer(S.player.color);
scene.add(playerMesh);
const others = new Map();   // id -> mesh for every other engineer
function animateOthers(dt) {
  const k = 1 - Math.pow(.0001, dt);
  for (const p of S.players.values()) {
    if (p.local) continue;
    let m = others.get(p.id);
    if (!m || m.userData.color !== p.color) { if (m) scene.remove(m); m = makePlayer(p.color); scene.add(m); others.set(p.id, m); p.rx ??= p.x; p.rz ??= p.z; }
    // friends' positions arrive a few times a second: glide between them
    if (Math.hypot(p.x - p.rx, p.z - p.rz) > 4) { p.rx = p.x; p.rz = p.z; }
    p.rx += (p.x - p.rx) * k; p.rz += (p.z - p.rz) * k;
    animatePlayer(m, { ...p, x: p.rx, z: p.rz }, S.T, dt);
    const g = S.mode === 'depth' && S.layer < 0;
    if (m.userData.ghost !== g) { m.userData.ghost = g; setGhost(m, g); }
  }
  for (const [id, m] of others) if (!S.players.has(id)) { scene.remove(m); others.delete(id); }
}

// ---------------------------------------------------------------- vehicles
// The host moves vehicles; in a friend's browser they glide toward the positions in each snapshot.
const vehMeshes = new Map();
const lerpAng = (a, b, k) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * k;
function animateVehicles(dt) {
  const k = S.net.role === 'client' ? 1 - Math.pow(.0005, dt) : 1, under = S.mode === 'depth' && S.layer < 0;
  for (const v of world.vehicles) {
    let m = vehMeshes.get(v.id);
    if (!m || m.userData.type !== v.type) { if (m) scene.remove(m); m = makeVehicle(v); scene.add(m); vehMeshes.set(v.id, m); v.rx = v.x; v.rz = v.z; v.ra = v.ang; }
    if (v.rx === undefined || Math.hypot(v.x - v.rx, v.z - v.rz) > 4) { v.rx = v.x; v.rz = v.z; v.ra = v.ang; }
    v.rx += (v.x - v.rx) * k; v.rz += (v.z - v.rz) * k; v.ra = lerpAng(v.ra, v.ang, k);
    const P = m.userData.P, frame = VEHICLES[v.type].frame, sea = frame === 'boat';
    m.position.set(v.rx, sea ? -.05 + Math.sin(S.T * 1.7 + v.id) * .025 : 0, v.rz);
    m.rotation.set(sea ? Math.sin(S.T * 1.3 + v.id) * .03 : 0, v.ra, sea ? Math.sin(S.T * 1.1 + v.id * 2) * .04 : 0);
    if (P.net) P.net.visible = !!v.net;
    if (P.turret) P.turret.rotation.y = Math.sin(S.T * .3 + v.id) * .5;
    if (m.userData.ghost !== under) { m.userData.ghost = under; setGhost(m, under); }
    if (Math.abs(v.v) > .6 && VEHICLES[v.type].engine && !under && (v.smokeT = (v.smokeT || 0) + dt) > .35 / Math.min(2, Math.abs(v.v) / 3)) {
      v.smokeT = 0; const L = FRAMES[frame].len * .5;
      smoke(v.rx - Math.sin(v.ra) * L, sea ? .5 : .35, v.rz - Math.cos(v.ra) * L, frame !== 'car');
    }
  }
  for (const [id, m] of vehMeshes) if (!world.vehicles.some(v => v.id === id)) { scene.remove(m); disposeMesh(m); vehMeshes.delete(id); }
}
// ---------------------------------------------------------------- fish
const fishMesh = new THREE.InstancedMesh(fishGeo(), M(0xffffff), 600);
fishMesh.count = 0; fishMesh.frustumCulled = false; fishMesh.castShadow = false; fishMesh.setColorAt(0, new THREE.Color(1, 1, 1)); scene.add(fishMesh);
function animateFish() {
  let n = 0;
  if (S.started && !(S.mode === 'depth' && S.layer < 0)) for (const f of world.fish) {
    if (n >= 600) break;
    const jump = (f.id * 7919 + Math.floor(S.T / 9)) % 23 === 0 ? Math.max(0, Math.sin((S.T % 9) * 3)) * .25 : 0;
    _m.compose(V(f.x, -.02 + jump, f.z), _q.setFromEuler(_e.set(-jump * 2, f.a, 0)), V(1, 1, 1));
    fishMesh.setMatrixAt(n, _m); fishMesh.setColorAt(n++, _c.setHex(f.id % 3 ? 0x9ab8cc : 0xd88a4a));
  }
  fishMesh.count = n; fishMesh.instanceMatrix.needsUpdate = true; if (fishMesh.instanceColor) fishMesh.instanceColor.needsUpdate = true;
}
// ---------------------------------------------------------------- factory tags
// With more than one factory, alt mode marks every building with its factory's colour.
const tagTex = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 8; const g = c.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, 8, 8); g.fillStyle = '#fff'; g.fillRect(1, 1, 6, 6);
  const t = new THREE.CanvasTexture(c); t.magFilter = t.minFilter = THREE.NearestFilter; t.colorSpace = THREE.SRGBColorSpace; return t;
})();
const tagMesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(.2, .2), new THREE.MeshBasicMaterial({ map: tagTex, depthTest: false, depthWrite: false, transparent: true }), 4096);
tagMesh.layers.set(UI_LAYER); tagMesh.renderOrder = 28; tagMesh.frustumCulled = false; tagMesh.count = 0; tagMesh.setColorAt(0, new THREE.Color(1, 1, 1)); scene.add(tagMesh);
const facColors = new Map(), UNTAGGED = new Set(['pipe', 'upipe', 'inserter', 'pole']);   // small connectors: hover them to see their factory
function updateTags() {
  let n = 0;
  if (S.started && S.altMode && world.factories.length > 1) {
    facColors.clear(); for (const f of world.factories) facColors.set(f.id, new THREE.Color(f.color));
    const cx = S.cam.x, cz = S.cam.z, R = Math.max(lowW, lowH) / S.cam.ppu * .75;
    for (const e of world.ents.values()) {
      if (n >= 4096 || e.ghost || e.belt || ENTITIES[e.type].shared || UNTAGGED.has(e.kind) || Math.abs(e.x - cx) > R || Math.abs(e.z - cz) > R) continue;
      _m.compose(V(e.x + .2, e.y + Math.min(.9, heightOf(e)) + .12, e.z + .2), camera.quaternion, V(1, 1, 1));
      tagMesh.setMatrixAt(n, _m); tagMesh.setColorAt(n++, facColors.get(e.fac ?? 1) || _c.setHex(0xffffff));
    }
  }
  tagMesh.count = n; tagMesh.instanceMatrix.needsUpdate = true; if (tagMesh.instanceColor) tagMesh.instanceColor.needsUpdate = true;
}

// ---------------------------------------------------------------- animation
const rings = [];
bus.on('pulse', e => {
  const ring = new THREE.Mesh(new THREE.RingGeometry(.4, .5, 32).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0x7ef6ff, transparent: true, side: THREE.DoubleSide, depthWrite: false }));
  ring.position.set(e.x + .5, e.y + 1.4, e.z + .5); ring.layers.set(1); scene.add(ring); rings.push({ mesh: ring, age: 0 });
});
const _w = new THREE.Vector3();
const ORE_CHIP = { ore: null, tree: 0x6b4a2a, rock: 0x8f8576, ent: 0x9aa1ad, frame: 0x9aa1ad };
let chipT = 0;
function animate(dt) {
  animateTreads(dt); animateWater(dt);
  for (const e of world.ents.values()) {
    const P = e.parts; if (!P) continue;
    const active = S.T - e.lastActive < .4;
    if (e.pop !== undefined && e.pop < 1) {   // placement pop
      e.pop = Math.min(1, e.pop + dt / .22);
      const t = e.pop - 1;   // ease-out-back from 75% size
      e.mesh.scale.setScalar(.75 + .25 * (1 + 2.70158 * t * t * t + 1.70158 * t * t));
    }
    let smoking = false, dark = false;
    switch (e.kind) {
      case 'inserter': poseInserter(e, e.ghost); break;
      case 'drill':
        if (e.status === 'mining') { P.head.rotation.y += dt * 8; smoking = !!P.smoke; dark = true; }
        if (P.glow) P.glow.emissiveIntensity = e.status === 'mining' ? 1.3 + .4 * Math.sin(S.T * 19) : .05;
        break;
      case 'furnace': {
        const on = e.crafting && active;
        P.glow.emissiveIntensity = on ? 1.6 + .5 * Math.sin(S.T * 23 + e.x) : .05;
        if (P.slits) P.slits.emissiveIntensity = on ? 1.2 : .05;
        smoking = on && !!P.smoke;
        break;
      }
      case 'assembler': {
        const on = active && e.crafting;
        if (on && P.spool) P.spool.rotation.x += dt * 6;
        if (on && P.gear) P.gear.rotation.y -= dt * 2.5;
        if (on && P.stir) P.stir.rotation.y += dt * 5;
        if (on && P.spin) P.spin.rotation.y += dt * 4;
        if (P.crane) P.crane.position.z = on ? Math.sin(S.T * 1.2) * .3 : P.crane.position.z * .95;
        if (P.glow) { P.glow.emissiveIntensity = on ? 1.5 + .4 * Math.sin(S.T * 17 + e.x) : .08; smoking = on && !!P.smoke; dark = true; }
        if (P.sprite) P.sprite.visible = !!e.recipe && S.altMode && !e.ghost;
        break;
      }
      case 'oilpump': e.ph = (e.ph || 0) + dt * 2.2 * (e.load || 0); P.beam.rotation.x = Math.sin(e.ph) * .26; P.rod.position.y = .4 + Math.sin(e.ph) * .1; break;
      case 'fpump': P.fly.rotation.x += dt * 14 * (e.load || 0); break;
      case 'fgen': P.fly.rotation.x += dt * 14 * (e.load || 0); P.glow.emissiveIntensity = (e.load || 0) > 0 ? .5 + e.load : .05; smoking = (e.load || 0) > .05; dark = true; break;
      case 'depot': if (P.crane) P.crane.rotation.y = active ? Math.sin(S.T * .9) * .9 : P.crane.rotation.y * .97; break;
      case 'rail': if (P.lamp) P.lamp.emissive.setHex(signalRed(e) ? 0xff3a2a : 0x3aff5a); break;
      case 'tank': if (P.level) { const f = Math.min(1, (e.fa?.[0] || 0) / ENTITIES[e.type].cap); P.level.emissiveIntensity = .2 + f; } break;
      case 'lab': if (active) P.ring.rotation.y += dt * 2; P.glow.emissiveIntensity = active ? 1 + .5 * Math.sin(S.T * 4) : .2; break;
      case 'transmitter': P.spin.rotation.y += dt * .5; P.glow.emissiveIntensity = .3 + e.prog * 3; break;
      case 'boiler': P.glow.emissiveIntensity = (e.load || 0) > 0 ? 1.4 + .5 * Math.sin(S.T * 21 + e.x) : .05; smoking = (e.load || 0) > .05; dark = true; break;
      case 'engine': P.fly.rotation.x += dt * 12 * (e.load || 0); P.glow.emissiveIntensity = (e.load || 0) > 0 ? .4 + e.load : .05; break;
      case 'pump': P.fly.rotation.x += dt * 9 * (e.load || 0); break;
    }
    if (smoking && !e.ghost) {
      e.smokeT = (e.smokeT || 0) + dt;
      if (e.smokeT > (e.kind === 'boiler' || e.kind === 'fgen' ? .5 / Math.max(.2, e.load) : .4)) {
        e.smokeT = 0; _w.set(...P.smoke); e.mesh.localToWorld(_w); smoke(_w.x, _w.y, _w.z, dark);
      }
    }
  }
  // mining chips in time with the pickaxe
  const pm = S.player.mining;
  if (pm && !pm.blocked && S.player.mineCell) {
    if ((chipT += dt) > .45) {
      chipT = 0; const c = S.player.mineCell;
      const ore = world.ores.get(key(c.x, c.y, c.z));
      const color = pm.kind === 'ore' && ore ? ORE_LOOK[ore.type] : ORE_CHIP[pm.kind] ?? 0x9aa1ad;
      burst(c.x + .5, c.y + .25, c.z + .5, 6, color, 1.3, .055);
    }
  } else chipT = .3;
  if (playerMesh.userData.color !== S.player.color) { scene.remove(playerMesh); playerMesh = makePlayer(S.player.color); scene.add(playerMesh); playerMesh.userData.ghost = undefined; }
  animatePlayer(playerMesh, S.player, S.T, dt);
  animateOthers(dt);
  const pg = S.mode === 'depth' && S.layer < 0;
  if (playerMesh.userData.ghost !== pg) { playerMesh.userData.ghost = pg; setGhost(playerMesh, pg); }
  playerMesh.visible = !!S.started;
  for (let i = rings.length - 1; i >= 0; i--) {
    const r = rings[i]; r.age += dt;
    r.mesh.scale.setScalar(1 + r.age * 10); r.mesh.material.opacity = Math.max(0, .8 - r.age * .4);
    if (r.age > 2) { scene.remove(r.mesh); r.mesh.geometry.dispose(); rings.splice(i, 1); }
  }
  animateVehicles(dt);
  animateFish();
  updateParticles(dt);
}

// ---------------------------------------------------------------- camera + movement input
export const keys = new Set();
export function moveInput() {
  let fx = 0, fz = 0;
  if (isDown('up', keys)) fz++;
  if (isDown('down', keys)) fz--;
  if (isDown('right', keys)) fx++;
  if (isDown('left', keys)) fx--;
  if (!fx && !fz) return { mx: 0, mz: 0, fx, fz };
  const sy = Math.sin(S.cam.yaw), cy = Math.cos(S.cam.yaw), mx = -sy * fz + cy * fx, mz = -cy * fz - sy * fx, l = Math.hypot(mx, mz);
  return { mx: mx / l, mz: mz / l, fx, fz };   // fx / fz are the raw keys, for driving
}
export function zoomStep(dir) {
  const C = S.cam; let i = ZOOMS.indexOf(C.ppuT); if (i < 0) i = 4;
  C.ppuT = ZOOMS[Math.max(0, Math.min(ZOOMS.length - 1, i + dir))];
}
const _r = new THREE.Vector3(), _u = new THREE.Vector3(), _t = new THREE.Vector3();
let frac = [0, 0];
export function updateCamera(dt) {
  const C = S.cam, k = 1 - Math.pow(.0005, dt);
  C.yaw += (C.yawT - C.yaw) * k; C.pitch += (C.pitchT - C.pitch) * k;
  C.ppu += (C.ppuT - C.ppu) * (1 - Math.pow(.00001, dt)); if (Math.abs(C.ppu - C.ppuT) < .02) C.ppu = C.ppuT;
  if (S.started) { const f = 1 - Math.pow(.00002, dt); C.x += (S.player.x - C.x) * f; C.z += (S.player.z - C.z) * f; }
  C.y += ((S.mode === 'depth' ? S.layer : 0) - C.y) * k;
  const sy = Math.sin(C.yaw), cy = Math.cos(C.yaw), dist = 120, cp = Math.cos(C.pitch);
  _t.set(C.x, C.y, C.z);
  camera.position.set(C.x + sy * cp * dist, C.y + Math.sin(C.pitch) * dist, C.z + cy * cp * dist);
  camera.lookAt(_t); camera.updateMatrixWorld();
  // snap the camera to whole low-res pixels; the remainder slides the canvas
  _r.set(1, 0, 0).applyQuaternion(camera.quaternion); _u.set(0, 1, 0).applyQuaternion(camera.quaternion);
  const ppu = C.ppu, tr = _t.dot(_r), tu = _t.dot(_u);
  const sr = Math.round(tr * ppu) / ppu, su = Math.round(tu * ppu) / ppu;
  camera.position.addScaledVector(_r, sr - tr).addScaledVector(_u, su - tu);
  frac = [(tr - sr) * ppu, (tu - su) * ppu];
  canvas.style.transform = `translate(${-frac[0] * S.pix}px, ${frac[1] * S.pix}px)`;
  camera.left = -lowW / ppu / 2; camera.right = lowW / ppu / 2; camera.top = lowH / ppu / 2; camera.bottom = -lowH / ppu / 2;
  camera.updateProjectionMatrix();
  // outline threshold follows how much depth one pixel of ground spans at this zoom and tilt
  post.uniforms.depthEdge.value = (1 / ppu) / Math.tan(C.pitch) * 1.6 + .04;
  post.uniforms.depthScale.value = camera.far - camera.near;
  const tx = Math.round(C.x), tz = Math.round(C.z);
  sun.target.position.set(tx, 0, tz); sun.position.set(tx - 18, 50, tz + 22);
}

// ---------------------------------------------------------------- picking
const ray = new THREE.Raycaster();
export const mouse = new THREE.Vector2(9, 9);
export function setMouseFromEvent(e) {
  const r = canvas.getBoundingClientRect();
  mouse.x = (e.clientX - r.left) / r.width * 2 - 1; mouse.y = -(e.clientY - r.top) / r.height * 2 + 1;
}
// The tile under the cursor on the working layer's floor: used for placing.
export function pickCell() {
  ray.setFromCamera(mouse, camera);
  const y = S.mode === 'depth' ? S.layer : 0, p = new THREE.Vector3();
  if (!ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -y), p)) return null;
  const x = Math.floor(p.x), z = Math.floor(p.z);
  if (x < 0 || z < 0 || x >= GRID || z >= GRID) return null;
  return { x, y, z, px: p.x, pz: p.z };
}
// The thing you are actually pointing at: a machine's body or a tree, not the ground behind it.
export function pickTarget() {
  ray.setFromCamera(mouse, camera);
  const y = S.mode === 'depth' ? S.layer : 0, list = [];
  for (const e of world.ents.values()) if (e.mesh && e.y === y) list.push(e.mesh);
  if (y === 0) list.push(...featMeshes, ...vehMeshes.values());
  const hits = ray.intersectObjects(list, true);
  for (const h of hits) {
    if (h.instanceId !== undefined) { const k = featIndex.get(h.object.uuid + h.instanceId); if (k && world.feats.has(k)) { const [x, , z] = k.split(',').map(Number); return { x, y: 0, z }; } continue; }
    let o = h.object; while (o && !o.userData.ent && !o.userData.veh) o = o.parent;
    if (o?.userData.veh) { const v = vehicleById(o.userData.veh); if (v) return { x: Math.floor(v.x), y: 0, z: Math.floor(v.z), veh: v.id }; continue; }
    if (o) { const e = o.userData.ent; return { x: e.x, y: e.y, z: e.z }; }
  }
  return pickCell();
}
export function project(x, y, z) {
  const v = new THREE.Vector3(x, y, z).project(camera), r = canvas.getBoundingClientRect();
  return [r.left + (v.x + 1) / 2 * r.width, r.top + (1 - v.y) / 2 * r.height];
}

// ---------------------------------------------------------------- selection brackets + preview
function bracketGeo() {
  const pts = [], c = [[-1, -1], [1, -1], [1, 1], [-1, 1]], L = .3;
  for (const y of [0, 1]) for (const [sx, sz] of c) {
    pts.push(sx * .5, y, sz * .5, sx * .5 - sx * L, y, sz * .5);
    pts.push(sx * .5, y, sz * .5, sx * .5, y, sz * .5 - sz * L);
  }
  for (const [sx, sz] of c) pts.push(sx * .5, 0, sz * .5, sx * .5, .22, sz * .5, sx * .5, 1, sz * .5, sx * .5, .78, sz * .5);
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3)); return g;
}
const marker = new THREE.LineSegments(bracketGeo(), new THREE.LineBasicMaterial({ color: 0xffffff, depthTest: false, transparent: true }));
marker.renderOrder = 20; marker.layers.set(UI_LAYER); scene.add(marker);
// ---------------------------------------------------------------- input / output arrows
// Flat arrows on the ground, pointing north before rotation (same convention as machine models).
const arrowGeo = (() => {
  const sh = new THREE.Shape();
  sh.moveTo(-.11, -.3); sh.lineTo(.11, -.3); sh.lineTo(.11, .0); sh.lineTo(.27, .0); sh.lineTo(0, .3); sh.lineTo(-.27, .0); sh.lineTo(-.11, .0); sh.closePath();
  return new THREE.ShapeGeometry(sh).rotateX(-Math.PI / 2);
})();
const crossGeo = (() => {
  const a = new THREE.BoxGeometry(.62, .01, .13).rotateY(Math.PI / 4), b = new THREE.BoxGeometry(.62, .01, .13).rotateY(-Math.PI / 4);
  return mergeTwo(a, b);
})();
function mergeTwo(a, b) {
  const g = new THREE.BufferGeometry(), pa = a.toNonIndexed().attributes.position.array, pb = b.toNonIndexed().attributes.position.array;
  const arr = new Float32Array(pa.length + pb.length); arr.set(pa); arr.set(pb, pa.length);
  g.setAttribute('position', new THREE.BufferAttribute(arr, 3)); return g;
}
function overlayInst(geo, n, depthTest, opacity) {
  const im = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ transparent: true, opacity, depthTest, depthWrite: false }), n);
  im.layers.set(UI_LAYER); im.renderOrder = depthTest ? 5 : 25; im.frustumCulled = false; im.count = 0;
  im.setColorAt(0, new THREE.Color(1, 1, 1)); scene.add(im); return im;
}
const hintArrows = overlayInst(arrowGeo, 64, false, .9);     // what you are holding / hovering
const hintCross = overlayInst(crossGeo, 8, false, .95);
const altArrows = overlayInst(arrowGeo, 2048, true, .85);   // always-on markers on inserters and drills
const warnMarks = overlayInst(crossGeo, 64, false, .95);    // a bus whose three lanes can't fit onto the belt it feeds
const COL = { IN: 0x4aa3ff, OUT: 0xffa53d, OK: 0x7be37a, BAD: 0xff4a4a, CAN: 0x6cc4ff, FLOW: 0xf2e6b0 };
let nH = 0, nX = 0;
function arrow(tx, y, tz, d, color, s = 1) {
  if (nH >= 64) return;
  const pulse = 1 + Math.sin(S.T * 7) * .06;
  const on = world.ents.get(key(tx, y, tz)), lift = on && !on.belt ? Math.min(.8, heightOf(on)) : 0;   // sit on top of a machine so it reads as "into this"
  _m.compose(V(tx + .5, y + .05 + lift, tz + .5), _q.setFromEuler(_e.set(0, -d * Math.PI / 2, 0)), V(s * pulse, 1, s * pulse));
  hintArrows.setMatrixAt(nH, _m); _c.setHex(color); hintArrows.setColorAt(nH++, _c);
}
function cross(tx, y, tz) {
  if (nX >= 8) return;
  _m.compose(V(tx + .5, y + .06, tz + .5), _q.identity(), V(1, 1, 1));
  hintCross.setMatrixAt(nX, _m); _c.setHex(COL.BAD); hintCross.setColorAt(nX++, _c);
}
const SINKS = new Set(['furnace', 'assembler', 'lab', 'chest', 'transmitter', 'boiler']);
// Where a pipe-like thing would join: green arrows toward neighbours with a fluid connection on our side.
function fluidHint2At(x, y, z) {
  for (let d = 0; d < 4; d++) {
    const n = world.ents.get(key(x + DIRS[d][0], y, z + DIRS[d][1]));
    if (n && (n.fb || ENTITIES[n.type].fluids || ENTITIES[n.type].ports)) arrow(x + DIRS[d][0], y, z + DIRS[d][1], d, COL.OK, .7);
  }
}
const beltish = e => !!(e && e.belt);
// Draw the inputs and outputs of a machine of `type` at (x, y, z) facing `dir`. Returns a hint sentence.
function ioHints(type, x, y, z, dir, dy) {
  const def = ENTITIES[type], kind = def.kind, [dx, dz] = DIRS[dir], at = (tx, ty, tz) => world.ents.get(key(tx, ty, tz));
  const fluidHint2 = () => fluidHint2At(x, y, z);
  if (kind === 'inserter') {
    const r = def.reach, sx = x - dx * r, sz = z - dz * r, tx = x + dx * r, tz = z + dz * r;
    const src = at(sx, y, sz), tgt = at(tx, y + dy, tz);
    arrow(sx, y, sz, dir, COL.IN, src ? 1 : .8);
    arrow(tx, y + dy, tz, dir, COL.OUT, tgt ? 1 : .8);
    return `Inserter: takes from the blue arrow, puts into the orange one${def.burner ? ' (needs fuel)' : ''}`;
  }
  if (kind === 'drill') {
    const t = at(x + dx, y, z + dz);
    arrow(x + dx, y, z + dz, dir, COL.OUT);
    return t ? `Drill pushes ore into the ${ENTITIES[t.type].name.toLowerCase()} at the orange arrow` : 'Drill: ore comes out at the orange arrow. Put a belt, chest or furnace there (R rotates)';
  }
  if (kind === 'belt' || kind === 'underground' || kind === 'splitter' || kind === 'lift') {
    const ny = kind === 'lift' ? y + dy : y, nx = x + dx, nz = z + dz, n = at(nx, ny, nz), bus = (def.lanes ?? 2) === 3, real = at(x, y, z);
    if (kind === 'underground') return `${def.name}: place the exit up to ${def.range - 1} tiles ahead, facing the same way`;
    if (n && !beltish(n) && n.kind !== 'inserter') { cross(nx, ny, nz); return `Belts can't load a ${ENTITIES[n.type].name.toLowerCase()} directly: put an inserter between them`; }
    arrow(nx, ny, nz, dir, COL.FLOW, .75);
    if (kind === 'splitter') { arrow(x + DIRS[(dir + 3) % 4][0], y, z + DIRS[(dir + 3) % 4][1], (dir + 3) % 4, COL.FLOW, .75); arrow(x + DIRS[(dir + 1) % 4][0], y, z + DIRS[(dir + 1) % 4][1], (dir + 1) % 4, COL.FLOW, .75); }
    if (bus) {
      const b = real?.type === type ? real : null;
      for (const [on, d] of [[b?.chL, (dir + 3) % 4], [b?.chR, (dir + 1) % 4]]) if (on) arrow(x + DIRS[d][0], y, z + DIRS[d][1], d, COL.OUT, .75);
      if (n && beltish(n) && lanesOf(n) === 2 && n.dir === dir) return 'Bus belt into a two-lane belt: its outer lanes go onto its two lanes. If all three carry items, the middle one waits';
      return b ? 'Bus belt: click it to send its left or right lane off to the side (orange arrows), with a filter' : 'Bus belt: three lanes, fed only from the belt behind it. Click a placed tile to set up side channels';
    }
    return '';
  }
  if (kind === 'pipe' || kind === 'tank') { fluidHint2(); return kind === 'pipe' ? 'Pipe: joins every pipe and fluid port next to it. Arrows show what it would join' : 'Storage tank: joins pipes on every side'; }
  if (kind === 'upipe') { const back = (dir + 2) % 4; arrow(x + DIRS[back][0], y, z + DIRS[back][1], back, COL.OK, .8); return `Underground pipe: connects behind it; place the other end up to ${def.range - 1} tiles ahead, facing the same way`; }
  if (kind === 'fpump' || kind === 'valve') {
    const b = (dir + 2) % 4; arrow(x + DIRS[b][0], y, z + DIRS[b][1], dir, COL.IN, .8); arrow(x + dx, y, z + dz, dir, COL.OUT, .8);
    return kind === 'fpump' ? 'Pump: takes fluid from the blue arrow and pushes it out at the orange one. Needs power' : 'Valve: fluid passes from the blue arrow to the orange one, never back';
  }
  if (def.ports) {
    for (const p of def.ports) { const d = (p.side + dir) % 4; arrow(x + DIRS[d][0], y, z + DIRS[d][1], p.io === 'in' ? (d + 2) % 4 : d, p.io === 'in' ? COL.IN : COL.OUT, .8); }
    if (kind === 'oilpump') return y === 0 && !world.oil.has(x + ',' + z) ? 'Pumpjacks go on crude oil (dark patches on the ground)' : 'Pumpjack: crude oil comes out at the orange arrow: lead a pipe or a tank from there';
    return `${def.name}: fluids go in at the blue arrows and out at the orange ones. Items by inserter`;
  }
  if (kind === 'depot') {
    const e0 = { x, y, z, dir, type };
    for (const [tx, tz] of y === 0 ? dockTiles(e0) : []) arrow(tx, y, tz, dir, COL.OK, .9);
    const way = def.way, ok = y === 0 && DIRS.some(([ddx, ddz]) => onWay(way, x + ddx, z + ddz));
    return ok ? `${def.name}: vehicles stop at the green arrow. Inserters and pipes connect on any side` : way === 'sea' ? 'Ports go on the shore, next to water' : way === 'rail' ? 'Train stations go right beside a rail' : 'Truck depots go right beside a road';
  }
  if (kind === 'rail') return 'Rail: drag to lay track. Rails join every rail next to them; three or four make a junction. Use rail signals to let several trains share track';
  // fluids pass between side-by-side buildings: point at the neighbours that would join up
  const fluidHint = () => {
    for (let d = 0; d < 4; d++) {
      const [ox, oz] = DIRS[d], n = at(x + ox, y, z + oz), nf = n && ENTITIES[n.type].fluids;
      if (nf && Object.keys(def.fluids).some(f => nf[f])) arrow(x + ox, y, z + oz, d, COL.OK, .8);
    }
  };
  if (kind === 'pump') {
    fluidHint();
    return y === 0 && !isWater(x, z) ? 'Water pumps go on water, next to the shore' : 'Water pump: boilers touching it get water (one pump is enough for 20)';
  }
  if (kind === 'engine') { fluidHint(); return 'Steam engine: put it against a boiler or another engine (or pipe steam to it), inside a pole\'s supply area'; }
  if (kind === 'fgen') { fluidHint(); return 'Diesel generator: pipe diesel to any side, and put it in a pole\'s supply area'; }
  if (kind === 'pole' && def.volts) return 'Transformer: wires itself to low voltage poles. Hold a transformer cable and click it, then a power line';
  if (kind === 'pole' && voltsOf(def)[0] > 0) return 'Power line: high voltage, wires to other lines. Step it down with a transformer station';
  if (SINKS.has(kind)) {
    if (kind === 'boiler') fluidHint();
    let feeding = 0, free = 0, beltInto = false;
    for (let d = 0; d < 4; d++) {
      const [ox, oz] = DIRS[d], tx = x + ox, tz = z + oz, n = at(tx, y, tz), inward = (d + 2) % 4;
      if (n && n.kind === 'inserter') {
        const r = n.reach, [ndx, ndz] = DIRS[n.dir];
        if (n.x + ndx * r === x && n.z + ndz * r === z) { arrow(tx, y, tz, n.dir, COL.OK); feeding++; }
        else if (n.x - ndx * r === x && n.z - ndz * r === z) arrow(tx, y, tz, n.dir, COL.OUT);
      } else if (n && n.kind === 'drill' && n.dir === inward) { arrow(tx, y, tz, inward, COL.OK); feeding++; }   // drills push straight in
      else if (beltish(n) && n.dir === inward && n.kind !== 'underground') { cross(tx, y, tz); beltInto = true; }
      else if (!n && !(y === 0 && world.feats.has(key(tx, 0, tz)))) { arrow(tx, y, tz, inward, COL.CAN, .75); free++; }
    }
    if (beltInto) return `Belts can't load machines directly: put an inserter between the belt and the ${def.name.toLowerCase()}`;
    if (kind === 'boiler') return 'Boiler: fuel it (inserter or by hand), give it a water pump on one side and steam engines on another';
    if (kind === 'chest') return 'Chest: inserters can load or unload it from any side';
    return feeding ? `${feeding} input${feeding > 1 ? 's' : ''} feeding it (green). Inserters taking out show orange` : `Feed it with an inserter on one of the blue arrows, pointing in`;
  }
  return '';
}
// Factorio's alt-mode arrows: a small direction marker on every inserter and drill nearby.
function updateAltArrows() {
  let n = 0;
  if (S.altMode && S.started) {
    const cx = S.cam.x, cz = S.cam.z, R = Math.max(lowW, lowH) / S.cam.ppu * .75;
    for (const e of world.ents.values()) {
      if ((e.kind !== 'inserter' && e.kind !== 'drill') || e.ghost || Math.abs(e.x - cx) > R || Math.abs(e.z - cz) > R || n >= 2048) continue;
      const [dx, dz] = DIRS[e.dir], off = e.kind === 'drill' ? .62 : .36;
      _m.compose(V(e.x + .5 + dx * off, e.y + (e.kind === 'drill' ? .03 : .13), e.z + .5 + dz * off), _q.setFromEuler(_e.set(0, -e.dir * Math.PI / 2, 0)), V(.42, 1, .42));
      altArrows.setMatrixAt(n, _m); _c.setHex(e.kind === 'drill' ? COL.OUT : 0xffffff); altArrows.setColorAt(n++, _c);
    }
  }
  altArrows.count = n; altArrows.instanceMatrix.needsUpdate = true; if (altArrows.instanceColor) altArrows.instanceColor.needsUpdate = true;
  // a pulsing red cross on the join where a bus's middle lane is held back
  let w = 0;
  for (const ln of world.lines) {
    if (w >= 64 || ln.n !== 3 || !lineWarn(ln)) continue;
    const b = ln.segs[ln.segs.length - 1], [dx, dz] = DIRS[b.dir], s = .7 + Math.sin(S.T * 8) * .12;
    _m.compose(V(b.x + .5 + dx * .5, b.y + .3, b.z + .5 + dz * .5), _q.identity(), V(s, 1, s));
    warnMarks.setMatrixAt(w, _m); _c.setHex(COL.BAD); warnMarks.setColorAt(w++, _c);
  }
  warnMarks.count = w; warnMarks.instanceMatrix.needsUpdate = true; if (warnMarks.instanceColor) warnMarks.instanceColor.needsUpdate = true;
}

let preview = null, previewKey = '';
const electricKind = sel => !!sel && !!ENTITIES[sel] && (ENTITIES[sel].kind === 'pole' || !!ENTITIES[sel].power || ['solar', 'engine', 'fgen'].includes(ENTITIES[sel].kind));
const HEIGHTS = { inserter: .45, frame: 1, boiler: .95, pipe: .36, upipe: .25, valve: .55, fpump: .45, tank: 1.05, rail: .1, depot: .8, oilpump: .9 };
const heightOf = e => e ? (e.belt ? .22 : e.kind === 'pole' ? (ENTITIES[e.type]?.top ?? 1.26) + .09 : ENTITIES[e.type]?.model === 'refinery' ? 1.3 : HEIGHTS[e.kind] ?? .75) : .04;
function updatePreview(hover) {
  nH = nX = 0; S.hint = '';
  updateHover(hover);
  hintArrows.count = nH; hintCross.count = nX;
  for (const im of [hintArrows, hintCross]) { im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true; }
  updateAltArrows();
  updateBolts();
  updateTags();
}
// What you'd lay with a road in hand: one quad per tile of the strip, green where it fits, red where it doesn't.
const roadPrev = new THREE.InstancedMesh(new THREE.PlaneGeometry(.96, .96).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ transparent: true, opacity: .4, depthWrite: false }), 12);
roadPrev.layers.set(UI_LAYER); roadPrev.renderOrder = 6; roadPrev.frustumCulled = false; roadPrev.count = 0; roadPrev.setColorAt(0, new THREE.Color(1, 1, 1)); scene.add(roadPrev);
function updateRoadPreview(hover) {
  let n = 0;
  if (hover && ROADS[S.sel] && hover.y === 0) {
    for (const { c: [x, z], t, side } of roadCells(hover.x, hover.z, S.dir % 2, S.roadCfg, S.sel)) {
      if (n >= 12 || x < 0 || z < 0 || x >= GRID || z >= GRID) continue;
      const e = world.ents.get(key(x, 0, z)), bad = isWater(x, z) || world.feats.has(key(x, 0, z)) || (e && !ENTITIES[e.type].onRoad);
      _m.compose(V(x + .5, .03, z + .5), _q.identity(), V(1, 1, 1));
      roadPrev.setMatrixAt(n, _m); roadPrev.setColorAt(n++, _c.setHex(bad ? (side ? 0x7a6a50 : 0xff5a4a) : side ? 0xc8c0b0 : 0x9be37a));
    }
  }
  roadPrev.count = n; roadPrev.instanceMatrix.needsUpdate = true; if (roadPrev.instanceColor) roadPrev.instanceColor.needsUpdate = true;
}
function updateHover(hover) {
  updateRoadPreview(hover);
  if (VEHICLES[S.sel] || ROADS[S.sel] || ITEMS[S.sel]?.tool === 'signal') { updateToolHover(hover); return; }
  const sel = S.sel && ENTITIES[S.sel] ? S.sel : null;
  const kind = sel && ENTITIES[sel].kind;
  const dy = kind === 'lift' ? (S.dy === -1 ? -1 : 1) : kind === 'inserter' && S.mode === 'depth' ? S.dy : 0;
  const pk = [sel, S.dir, dy, S.maxTier].join();
  if (pk !== previewKey) {
    if (preview) { scene.remove(preview); preview = null; }
    if (sel) {
      const def = ENTITIES[sel];
      const fake = { type: sel, kind: def.kind, x: 0, y: 0, z: 0, dir: S.dir, dy, reach: def.reach, t: .5, held: null, curve: null, role: 'in' };
      preview = makeMesh(fake);
      if (def.kind === 'inserter') poseInserter(fake);
      setPreview(preview); scene.add(preview);
    }
    previewKey = pk;
  }
  marker.visible = !!hover;
  if (preview) preview.visible = !!hover;
  // powered areas show while placing anything electric, holding a cable, or pointing at / inspecting a pole
  if (supplyMesh) supplyMesh.visible = electricKind(sel) || ITEMS[S.sel]?.tool === 'link' || S.openEnt?.kind === 'pole'
    || (!!hover && world.ents.get(key(hover.x, hover.y, hover.z))?.kind === 'pole');
  updateLinkLine(hover);
  if (!hover) return;
  const { x, y, z } = hover, real = world.ents.get(key(x, y, z)), ent = real || (y === 0 && world.feats.get(key(x, 0, z)) ? { kind: 'feat' } : null);
  const pulse = 1 + Math.sin(S.T * 6) * .025;
  marker.position.set(x + .5, y, z + .5);
  marker.scale.set(1.08 * pulse, sel ? .5 : heightOf(ent?.kind === 'feat' ? { kind: 'pole' } : ent) * .95 + .05, 1.08 * pulse);
  if (!sel) {
    const t = mineTargetAt(hover);
    marker.material.color.setHex(t && distTo(x, z) > t.reach ? 0xff8a3d : ent ? 0xffe9a0 : 0xffffff);
    marker.material.opacity = ent || t ? 1 : .35;
    if (real) S.hint = ioHints(real.type, real.x, real.y, real.z, real.dir, real.dy || 0);
    return;
  }
  marker.material.opacity = 1;
  preview.position.set(x + .5, y, z + .5);
  const err = canPlace(sel, x, y, z, S.dir, dy, { reach: true });
  marker.material.color.setHex(err ? 0xff5a4a : 0x9be37a);
  S.hint = ioHints(sel, x, y, z, S.dir, dy);
}

// Vehicles, roads and signals in hand: a vehicle ghost or the road strip, and a coloured bracket.
function updateToolHover(hover) {
  const pk = [S.sel, S.dir, 'tool'].join();
  if (pk !== previewKey) {
    if (preview) { scene.remove(preview); preview = null; }
    if (VEHICLES[S.sel]) { preview = makeVehicle({ id: -1, type: S.sel, net: null }); setPreview(preview); scene.add(preview); }
    previewKey = pk;
  }
  if (supplyMesh) supplyMesh.visible = false;
  marker.visible = !!hover; if (preview) preview.visible = !!hover;
  updateLinkLine(null);
  if (!hover) return;
  const { x, y, z } = hover;
  marker.position.set(x + .5, y, z + .5); marker.scale.set(1.08, .4, 1.08); marker.material.opacity = 1;
  let ok = y === 0 && distTo(x, z) <= 10, hint = '';
  if (VEHICLES[S.sel]) {
    const st = vstats(S.sel), r = world.ents.get(key(x, 0, z));
    let a = Math.atan2(DIRS[S.dir][0], DIRS[S.dir][1]);
    if (st.way === 'rail' && r?.kind === 'rail' && !(r.conn >> S.dir & 1) && !(r.conn >> ((S.dir + 2) % 4) & 1)) { const d = [0, 1, 2, 3].find(d => r.conn >> d & 1); if (d !== undefined) a = Math.atan2(DIRS[d][0], DIRS[d][1]); }
    preview.position.set(x + .5, st.way === 'sea' ? -.05 : 0, z + .5); preview.rotation.y = a;
    ok = ok && (st.way === 'land' ? !isWater(x, z) : onWay(st.way, x, z));
    hint = st.way === 'rail' ? 'Locomotives and wagons go on rails. Put a wagon right behind a stopped train to couple it' : st.way === 'road' ? 'Trucks go on roads. Give them a route in the logistics window (L)' : st.way === 'sea' ? 'Boats go on water. Give them a route between ports (L)' : 'Click to put it down. Stand next to it and press B to drive';
  } else if (ROADS[S.sel]) hint = ROADS[S.sel].walk ? 'Path: drag to pave a walkway' : `Road: drag to lay it. ${S.roadCfg.w} wide, ${S.roadCfg.l} lane${S.roadCfg.l > 1 ? 's' : ''}${S.roadCfg.sw ? ', with sidewalks' : ''}. Change it in the road panel above your hand`;
  else { const r = world.ents.get(key(x, 0, z)); ok = ok && r?.kind === 'rail'; if (ok) arrow(x + DIRS[S.dir][0], 0, z + DIRS[S.dir][1], S.dir, COL.FLOW, .7); hint = 'Rail signal: click a rail. The track splits into blocks here; R turns it to face along the track'; }
  marker.material.color.setHex(ok ? 0x9be37a : 0xff5a4a);
  S.hint = hint;
}

// ---------------------------------------------------------------- frame
export function render(dt, hover) {
  updateCamera(dt);
  updatePreview(hover);
  animate(dt);
  updateItems();
  // colour + depth (the interface layer is left out while the UI is hidden)
  camera.layers.set(0); camera.layers.enable(1); if (!S.hideUI) camera.layers.enable(UI_LAYER);
  renderer.setRenderTarget(rtColor); renderer.render(scene, camera);
  // normals for crease highlights (world layer only, no shadows recomputed)
  const bg = scene.background; scene.background = null; scene.overrideMaterial = normalMat;
  camera.layers.set(0); renderer.shadowMap.autoUpdate = false;
  renderer.setRenderTarget(rtNormal); renderer.setClearColor(0x8080ff, 1); renderer.clear(); renderer.render(scene, camera);
  renderer.shadowMap.autoUpdate = true; scene.overrideMaterial = null; scene.background = bg; renderer.setClearColor(0x000000, 1);
  camera.layers.enable(1); camera.layers.enable(UI_LAYER);
  // outline + upscale
  renderer.setRenderTarget(null); renderer.render(postScene, postCam);
}
