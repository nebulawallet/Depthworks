// Rendering. The world is drawn at low resolution with a camera snapped to the pixel grid (the leftover
// sub-pixel offset is applied by sliding the canvas, so motion stays smooth without shimmering), then a
// post pass draws pixel outlines from depth and normal edges and upscales with hard pixels.
import * as THREE from 'three';
import { ENTITIES, ITEMS } from './data.js';
import { S, world, bus, key, DIRS, GRID, rng } from './state.js';
import { makeMesh, disposeMesh, setGhost, setPreview, poseInserter, itemGeo, itemMat, animateTreads, makePlayer, animatePlayer, toonRamp, facet, M } from './models.js';
import { canPlace, visibleOnBelt, distTo, mineTargetAt } from './sim.js';

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
function paintTile(y, x, z) {
  const L = layers[y], g = L.ctx, pal = PALETTES[y], og = oreGrid(y);
  const at = (tx, tz) => tx < 0 || tz < 0 || tx >= GRID || tz >= GRID ? -1 : og[tz * GRID + tx];
  const img = L.img ||= g.createImageData(TP, TP), d = img.data;
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
    const k = key(x, 0, z); if (world.ores.has(k) || world.feats.has(k)) continue;
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
  for (const im of clutterMeshes) if (im.instanceColor) im.instanceColor.needsUpdate = true;
  // hide clutter under anything already built
  for (const e of world.ents.values()) showClutter(key(e.x, e.y, e.z), false);
}
let featMeshes = [];
const featIndex = new Map();

export function buildTerrain() {
  for (const o of [slab, ...Object.values(underPlanes)]) if (o) scene.remove(o);
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
layerGrid.position.set(GRID / 2, .01, GRID / 2); layerGrid.visible = false; layerGrid.layers.set(1); scene.add(layerGrid);

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
export function beltItemPos(b, p, out) {
  let lx = 0, lz = .5 - p, ly = 0;
  if (b.curve) {
    const th = Math.PI / 2 * (1 - Math.min(1, p));
    if (b.curve === 'L') { lx = -.5 + .5 * Math.cos(th); lz = -.5 + .5 * Math.sin(th); }
    else { lx = .5 - .5 * Math.cos(th); lz = -.5 + .5 * Math.sin(th); }
  } else if (b.kind === 'underground' && b.role === 'in') lz = .5 - Math.min(p, .5);
  else if (b.kind === 'underground') lz = .5 - (p - (b.len - 1));
  else if (b.kind === 'lift') ly = p * b.dy + .04;
  const [fx, fz] = DIRS[b.dir];
  out.set(b.x + .5 + lx * -fz - lz * fx, b.y + .11 + ly, b.z + .5 + lx * fx - lz * fz);
  return out;
}
const _p = new THREE.Vector3();
function updateItems() {
  for (const r of Object.values(instItems)) r.count = 0;
  for (const b of world.beltOrder) {
    if (isGhost(b) || !b.items.length) continue;
    for (const it of b.items) {
      if (!visibleOnBelt(b, it.p)) continue;
      const r = instFor(it.type);
      beltItemPos(b, it.p, _p);
      _m4.makeTranslation(_p.x, _p.y, _p.z);
      r.im.setMatrixAt(r.count++, _m4);
    }
  }
  if (!(S.mode === 'depth' && S.layer < 0)) for (const g of world.ground) {
    const r = instFor(g.type);
    _m4.makeTranslation(g.x, .01, g.z);
    r.im.setMatrixAt(r.count++, _m4);
  }
  for (const r of Object.values(instItems)) { r.im.count = r.count; r.im.instanceMatrix.needsUpdate = true; }
}

// ---------------------------------------------------------------- power wires + supply areas
const wireMat = new THREE.LineBasicMaterial({ color: 0xb8683a });
let wireLines = null, supplyMesh = null;
const poleTop = p => (p.type === 'small_pole' ? 1.26 : 1.58) + p.y;
bus.on('power', () => {
  if (wireLines) { scene.remove(wireLines); wireLines.geometry.dispose(); }
  const pts = [];
  for (const [a, b] of world.wires || []) {
    const ax = a.x + .5, az = a.z + .5, bx = b.x + .5, bz = b.z + .5, ay = poleTop(a), by = poleTop(b);
    const N = 8, sag = Math.hypot(ax - bx, az - bz) * .06;
    for (const off of [-.24, .24]) for (let i = 0; i < N; i++) for (const t of [i / N, (i + 1) / N])
      pts.push(ax + off + (bx - ax) * t, ay + (by - ay) * t - Math.sin(t * Math.PI) * sag, az + (bz - az) * t);
  }
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  wireLines = new THREE.LineSegments(geo, wireMat); wireLines.layers.set(1); scene.add(wireLines);
  if (supplyMesh) { scene.remove(supplyMesh); supplyMesh.dispose(); }
  const poles = [...world.ents.values()].filter(e => e.kind === 'pole');
  supplyMesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x4aa3ff, transparent: true, opacity: .13, depthWrite: false }), Math.max(1, poles.length));
  poles.forEach((p, i) => { const s = ENTITIES[p.type].supply * 2 + 1; supplyMesh.setMatrixAt(i, new THREE.Matrix4().compose(V(p.x + .5, p.y + .03, p.z + .5), new THREE.Quaternion(), V(s, 1, s))); });
  supplyMesh.count = poles.length; supplyMesh.visible = false; supplyMesh.layers.set(1); scene.add(supplyMesh);
});

// ---------------------------------------------------------------- the engineer
export const playerMesh = makePlayer();
scene.add(playerMesh);

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
  animateTreads(dt);
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
      case 'assembler': if (active && e.crafting) { P.spool.rotation.x += dt * 6; P.gear.rotation.y -= dt * 2.5; } if (P.sprite) P.sprite.visible = !!e.recipe && S.altMode && !e.ghost; break;
      case 'lab': if (active) P.ring.rotation.y += dt * 2; P.glow.emissiveIntensity = active ? 1 + .5 * Math.sin(S.T * 4) : .2; break;
      case 'generator': P.fly.rotation.x += dt * 10 * (e.load || 0); P.glow.emissiveIntensity = (e.load || 0) > 0 ? 1.3 : .05; smoking = (e.load || 0) > .05; dark = true; break;
      case 'transmitter': P.spin.rotation.y += dt * .5; P.glow.emissiveIntensity = .3 + e.prog * 3; break;
    }
    if (smoking && !e.ghost) {
      e.smokeT = (e.smokeT || 0) + dt;
      if (e.smokeT > (e.kind === 'generator' ? .5 / Math.max(.2, e.load) : .4)) {
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
  animatePlayer(playerMesh, S.player, S.T, dt);
  const pg = S.mode === 'depth' && S.layer < 0;
  if (playerMesh.userData.ghost !== pg) { playerMesh.userData.ghost = pg; setGhost(playerMesh, pg); }
  playerMesh.visible = !!S.started;
  for (let i = rings.length - 1; i >= 0; i--) {
    const r = rings[i]; r.age += dt;
    r.mesh.scale.setScalar(1 + r.age * 10); r.mesh.material.opacity = Math.max(0, .8 - r.age * .4);
    if (r.age > 2) { scene.remove(r.mesh); r.mesh.geometry.dispose(); rings.splice(i, 1); }
  }
  updateParticles(dt);
}

// ---------------------------------------------------------------- camera + movement input
export const keys = new Set();
export function moveInput() {
  let fx = 0, fz = 0;
  if (keys.has('KeyW') || keys.has('ArrowUp')) fz++;
  if (keys.has('KeyS') || keys.has('ArrowDown')) fz--;
  if (keys.has('KeyD') || keys.has('ArrowRight')) fx++;
  if (keys.has('KeyA') || keys.has('ArrowLeft')) fx--;
  if (!fx && !fz) return { mx: 0, mz: 0 };
  const sy = Math.sin(S.cam.yaw), cy = Math.cos(S.cam.yaw), mx = -sy * fz + cy * fx, mz = -cy * fz - sy * fx, l = Math.hypot(mx, mz);
  return { mx: mx / l, mz: mz / l };
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
  return { x, y, z };
}
// The thing you are actually pointing at: a machine's body or a tree, not the ground behind it.
export function pickTarget() {
  ray.setFromCamera(mouse, camera);
  const y = S.mode === 'depth' ? S.layer : 0, list = [];
  for (const e of world.ents.values()) if (e.mesh && e.y === y) list.push(e.mesh);
  if (y === 0) list.push(...featMeshes);
  const hits = ray.intersectObjects(list, true);
  for (const h of hits) {
    if (h.instanceId !== undefined) { const k = featIndex.get(h.object.uuid + h.instanceId); if (k && world.feats.has(k)) { const [x, , z] = k.split(',').map(Number); return { x, y: 0, z }; } continue; }
    let o = h.object; while (o && !o.userData.ent) o = o.parent;
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
marker.renderOrder = 20; marker.layers.set(1); scene.add(marker);
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
  im.layers.set(1); im.renderOrder = depthTest ? 5 : 25; im.frustumCulled = false; im.count = 0;
  im.setColorAt(0, new THREE.Color(1, 1, 1)); scene.add(im); return im;
}
const hintArrows = overlayInst(arrowGeo, 64, false, .9);     // what you are holding / hovering
const hintCross = overlayInst(crossGeo, 8, false, .95);
const altArrows = overlayInst(arrowGeo, 2048, true, .85);   // always-on markers on inserters and drills
const COL = { IN: 0x4aa3ff, OUT: 0xffa53d, OK: 0x7be37a, BAD: 0xff4a4a, CAN: 0x6cc4ff, FLOW: 0xf2e6b0 };
let nH = 0, nX = 0;
function arrow(tx, y, tz, d, color, s = 1) {
  if (nH >= 64) return;
  const pulse = 1 + Math.sin(S.T * 7) * .06;
  const on = world.ents.get(key(tx, y, tz)), lift = on && !on.items ? Math.min(.8, heightOf(on)) : 0;   // sit on top of a machine so it reads as "into this"
  _m.compose(V(tx + .5, y + .05 + lift, tz + .5), _q.setFromEuler(_e.set(0, -d * Math.PI / 2, 0)), V(s * pulse, 1, s * pulse));
  hintArrows.setMatrixAt(nH, _m); _c.setHex(color); hintArrows.setColorAt(nH++, _c);
}
function cross(tx, y, tz) {
  if (nX >= 8) return;
  _m.compose(V(tx + .5, y + .06, tz + .5), _q.identity(), V(1, 1, 1));
  hintCross.setMatrixAt(nX, _m); _c.setHex(COL.BAD); hintCross.setColorAt(nX++, _c);
}
const SINKS = new Set(['furnace', 'assembler', 'lab', 'chest', 'generator', 'transmitter']);
const beltish = e => !!(e && e.items);
// Draw the inputs and outputs of a machine of `type` at (x, y, z) facing `dir`. Returns a hint sentence.
function ioHints(type, x, y, z, dir, dy) {
  const def = ENTITIES[type], kind = def.kind, [dx, dz] = DIRS[dir], at = (tx, ty, tz) => world.ents.get(key(tx, ty, tz));
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
    const ny = kind === 'lift' ? y + dy : y, nx = x + dx, nz = z + dz, n = at(nx, ny, nz);
    if (kind === 'underground') return 'Underground belt: place the exit up to 4 tiles ahead, facing the same way';
    if (n && !beltish(n) && n.kind !== 'inserter') { cross(nx, ny, nz); return `Belts can't load a ${ENTITIES[n.type].name.toLowerCase()} directly: put an inserter between them`; }
    arrow(nx, ny, nz, dir, COL.FLOW, .75);
    if (kind === 'splitter') { arrow(x + DIRS[(dir + 3) % 4][0], y, z + DIRS[(dir + 3) % 4][1], (dir + 3) % 4, COL.FLOW, .75); arrow(x + DIRS[(dir + 1) % 4][0], y, z + DIRS[(dir + 1) % 4][1], (dir + 1) % 4, COL.FLOW, .75); }
    return '';
  }
  if (SINKS.has(kind)) {
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
    if (kind === 'generator') return feeding ? 'Generator is being fed' : 'Feed coal or wood with an inserter on a blue arrow, then put a pole next to it';
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
}

let preview = null, previewKey = '';
const electricKind = sel => !!sel && (ENTITIES[sel].kind === 'pole' || !!ENTITIES[sel].power || ['generator', 'solar'].includes(ENTITIES[sel].kind));
const heightOf = e => e ? (e.items ? .22 : e.kind === 'inserter' ? .45 : e.kind === 'pole' ? 1.35 : e.kind === 'frame' ? 1 : .75) : .04;
function updatePreview(hover) {
  nH = nX = 0; S.hint = '';
  updateHover(hover);
  hintArrows.count = nH; hintCross.count = nX;
  for (const im of [hintArrows, hintCross]) { im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true; }
  updateAltArrows();
}
function updateHover(hover) {
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
  if (supplyMesh) supplyMesh.visible = electricKind(sel) || (!!hover && world.ents.get(key(hover.x, hover.y, hover.z))?.kind === 'pole');
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

// ---------------------------------------------------------------- frame
export function render(dt, hover) {
  updateCamera(dt);
  updatePreview(hover);
  animate(dt);
  updateItems();
  // colour + depth
  camera.layers.set(0); camera.layers.enable(1);
  renderer.setRenderTarget(rtColor); renderer.render(scene, camera);
  // normals for crease highlights (world layer only, no shadows recomputed)
  const bg = scene.background; scene.background = null; scene.overrideMaterial = normalMat;
  camera.layers.set(0); renderer.shadowMap.autoUpdate = false;
  renderer.setRenderTarget(rtNormal); renderer.setClearColor(0x8080ff, 1); renderer.clear(); renderer.render(scene, camera);
  renderer.shadowMap.autoUpdate = true; scene.overrideMaterial = null; scene.background = bg; renderer.setClearColor(0x000000, 1);
  camera.layers.enable(1);
  // outline + upscale
  renderer.setRenderTarget(null); renderer.render(postScene, postCam);
}
