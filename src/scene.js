// Rendering. The world is drawn at low resolution with a camera snapped to the pixel grid (the leftover
// sub-pixel offset is applied by sliding the canvas, so motion stays smooth without shimmering), then a
// post pass draws pixel outlines from depth and normal edges and upscales with hard pixels.
import * as THREE from 'three';
import { ENTITIES, ITEMS, TILES, VOLTAGES, ROADS, VEHICLES, FRAMES, FLUIDS, RECIPE, DAY, DITHER, ROAD_POWER, recipeIcon } from './data.js';
import { S, world, bus, key, DIRS, GRID, rng, tileAt, isWater, factoryOf, invGet, daylight, nightDepth, lodAt, tilesOf } from './state.js';
import { initTerrain, updateTerrain, dropAllChunks, repaintTiles, rebuildChunkClutter, shownAt, showClutter, dropClutter, featPickList, featKeyAt, oreLook, animateWater, setDepthView, chunkShown, oreChanged } from './terrain.js';
import { makeMesh, disposeMesh, setGhost, setPreview, setBlueprint, poseInserter, poseStation, itemGeo, itemMat, iconSpriteMat, animateTreads, treadMat, makePlayer, animatePlayer, toonRamp, facet, M, UI_LAYER, makeVehicle, fishGeo, DITHER_OFF, ditherMat } from './models.js';
import { canPlace, canSlope, slopeLayer, distTo, mineTargetAt, voltsOf, planCraft, sweepTiles, stationChests, machineStats, drillFront } from './sim.js';
import { portEdges } from './fluids.js';
import { bpAt } from './blueprint.js';
import { REACTOR } from './plants.js';
import { footprint, sizeOf } from './multi.js';
import { playerMods } from './body.js';
import { visibleOnBelt, laneOffset, lineWarn, lanesOf } from './belts.js';
import { roadAt, roadCells, roadTiles, signalRed, vehicleById, onWay, dockTiles, vstats } from './transport.js';
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
let lowW = 2, lowH = 2, rtColor, rtNormal, rtLight;
const normalMat = new THREE.MeshNormalMaterial();
const post = new THREE.ShaderMaterial({
  uniforms: { tColor: { value: null }, tDepth: { value: null }, tNormal: { value: null }, res: { value: new THREE.Vector2() }, depthScale: { value: 299 }, depthEdge: { value: .1 },
    tLight: { value: null }, amb: { value: new THREE.Vector3(1, 1, 1) }, nightK: { value: 0 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
  fragmentShader: `
    uniform sampler2D tColor, tDepth, tNormal, tLight; uniform vec2 res; uniform float depthScale, depthEdge, nightK; uniform vec3 amb;
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
      c *= amb + texture2D(tLight, vUv).rgb * nightK;       // night: the scene dims to moonlight, lit only where light falls
      if (dSum > depthEdge) c *= 0.32;
      else if (nSum > 0.35) c = c * 1.35 + 0.012;
      c = (c - 0.5 * c * c) * 1.12;                          // gentle filmic shoulder
      gl_FragColor = vec4(toSRGB(c), 1.0);
      gl_FragDepthEXT = texture2D(tDepth, vUv).r;             // the world's depth, for the interface drawn after this
    }`,
  depthTest: true, depthWrite: true, depthFunc: THREE.AlwaysDepth,
});
const postScene = new THREE.Scene(), postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
postScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), post));
function makeTargets() {
  rtColor?.dispose(); rtNormal?.dispose();
  const o = { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter };
  rtColor = new THREE.WebGLRenderTarget(lowW, lowH, { ...o, type: THREE.HalfFloatType });
  rtColor.depthTexture = new THREE.DepthTexture(lowW, lowH);
  rtNormal = new THREE.WebGLRenderTarget(lowW, lowH, o);
  rtLight?.dispose(); rtLight = new THREE.WebGLRenderTarget(lowW, lowH, { ...o, type: THREE.HalfFloatType });
  post.uniforms.tLight.value = rtLight.texture;
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

const hemi = new THREE.HemisphereLight(0xc4d6ff, 0x5a4632, 1.25); scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff0d0, 2.7);
sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -.002; sun.shadow.normalBias = .02;
Object.assign(sun.shadow.camera, { left: -36, right: 36, top: 36, bottom: -36, near: 1, far: 180 });
scene.add(sun, sun.target);
// The lights also reach the interface layer, so the placement preview is shaded like the world (everything else there is unlit).
hemi.layers.enable(UI_LAYER); sun.layers.enable(UI_LAYER);

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _c = new THREE.Color();
const V = (x, y, z) => new THREE.Vector3(x, y, z);

// ---------------------------------------------------------------- terrain (terrain.js draws it chunk by chunk)
// Buildings get their models only while their chunk is shown, so far-away factories cost nothing to draw.
const entsInChunk = (R, fn) => { for (const e of world.ents.values()) if (e.x >= R.x0 && e.x < R.x0 + R.w && e.z >= R.z0 && e.z < R.z0 + R.h) fn(e); for (const f of world.frames.values()) if (f.x >= R.x0 && f.x < R.x0 + R.w && f.z >= R.z0 && f.z < R.z0 + R.h) fn(f); };
initTerrain(scene, {
  onLoad: R => entsInChunk(R, e => { if (!e.mesh) attach(e); hideUnder(e); }),
  onUnload: R => entsInChunk(R, e => detach(e)),
  onClutter: R => entsInChunk(R, hideUnder),
});
// clutter under anything built is hidden (every tile of a building that covers several)
const hideUnder = e => { if (e.kind !== 'frame') for (const [x, z] of tilesOf(e)) showClutter(key(x, e.y, z), false); };
export function buildTerrain() { dropAllChunks(); updateCamera(0); terrainView(true); }
function terrainView(first = false) {
  const C = S.cam, r = Math.max(lowW, lowH) / C.ppu * .62 / Math.max(.45, Math.sin(C.pitch)) + 6;
  updateTerrain(C.x, C.z, r, C.ppu, first);
}
// A road change repaints its tiles and their neighbours (corners, kerbs and junction markings depend on them).
bus.on('roads', list => {
  const seen = new Set(), tiles = [];
  for (const [x, z] of list || []) for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
    const tx = x + dx, tz = z + dz, k = tx + ',' + tz;
    if (tx < 0 || tz < 0 || tx >= GRID || tz >= GRID || seen.has(k)) continue;
    seen.add(k); tiles.push([tx, tz]);
  }
  repaintTiles(tiles);
  for (const [x, z] of list || []) showClutter(key(x, 0, z), !roadAt(x, z) && !world.ents.has(key(x, 0, z)));
});
bus.on('ore', (x, y, z) => {
  dropClutter(key(x, y, z));
  const tiles = []; for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) tiles.push([x + dx, z + dz]);
  repaintTiles(tiles, y);
});
bus.on('orestage', (x, y, z) => oreChanged(x, y, z));   // a worked tile changes its look (ORE_STAGES)
bus.on('feat', (x, z) => {
  burst(x + .5, .5, z + .5, 14, 0x6a8a4a, 2.2);
  dropClutter(key(x, 0, z));
});
// Dams change the ground under them: repaint their tiles (and where they used to be) and redo the water surface.
function damChanged(e) {
  if (e.kind !== 'dam') return;
  const tiles = [...(e.foot || []), ...(e._painted || [])];
  e._painted = e.foot?.map(t => [...t]);
  repaintTiles(tiles);
  const seen = new Set();
  for (const [x, z] of tiles) { const R = shownAt(x, z); if (R && !seen.has(R)) { seen.add(R); rebuildChunkClutter(R); } }
}
for (const ev of ['placed', 'removed', 'remesh']) bus.on(ev, damChanged);
bus.on('patch', (x, z) => { dropClutter(key(x, 0, z)); repaintTiles([[x, z]]); burst(x + .5, .1, z + .5, 10, 0x7a6a3a, 1.4, .05); });

// the working layer's grid in depth mode: a patch around the camera, moved in whole tiles
const layerGrid = new THREE.GridHelper(96, 96, 0x7ef6ff, 0x7ef6ff);
layerGrid.material.transparent = true; layerGrid.material.opacity = .06; layerGrid.material.depthWrite = false;
layerGrid.visible = false; layerGrid.layers.set(UI_LAYER); scene.add(layerGrid);

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
function detach(e) { if (e.mesh) { scene.remove(e.mesh); disposeMesh(e.mesh); e.mesh = null; e.parts = null; } }
bus.on('placed', e => {
  if (!chunkShown(e.x, e.z)) return;   // its model gets made when its chunk is shown
  attach(e);
  hideUnder(e);
  if (S.started) { e.pop = 0; burst(e.x + .5, e.y + .05, e.z + .5, 10, 0x8a7a62, 1.6, .06); }
});
bus.on('removed', e => {
  detach(e);
  if (e.kind !== 'frame') for (const [x, z] of tilesOf(e)) if (!world.ents.has(key(x, e.y, z)) && !(e.y === 0 && roadAt(x, z))) showClutter(key(x, e.y, z), true);
  if (S.started) burst(e.x + .5, e.y + .2, e.z + .5, 8, 0x9a9aa2, 1.4, .06);
});
bus.on('remesh', e => { if (e.mesh) { detach(e); attach(e); } });
export function remeshAll() {
  for (const e of [...world.ents.values(), ...world.frames.values()]) { detach(e); if (chunkShown(e.x, e.z)) attach(e); }
  previewKey = '';
}
bus.on('tier', remeshAll);

// ---------------------------------------------------------------- blueprints
// A planned building is drawn as the real model, stippled (setBlueprint), from a stand-in entity that never runs.
const bpMeshes = new Map();
export function bpStandIn(b) {
  const def = ENTITIES[b.type];
  return { type: def.as || b.type, kind: ENTITIES[def.as || b.type].kind, x: b.x, y: b.y, z: b.z, dir: b.dir, dy: b.dy || 0, foot: b.foot, footSet: b.foot && new Set(b.foot.map(t => t[0] + ',' + t[1])),
    reach: def.reach, t: .5, held: null, curve: null, role: 'in', conn: 0, fac: b.fac, recipe: null, lastActive: -99, bp: true };
}
bus.on('bp', (b, on) => {
  const m = bpMeshes.get(b);
  if (m) { scene.remove(m); disposeMesh(m); bpMeshes.delete(b); }
  if (!on) return;
  const f = bpStandIn(b), mesh = makeMesh(f);
  if (f.kind === 'inserter') poseInserter(f, true);
  if (f.kind === 'assembler' && f.parts?.arm) poseStation(f, true);
  setBlueprint(mesh); mesh.userData.bp = b; scene.add(mesh); bpMeshes.set(b, mesh);
});
export function clearBlueprintMeshes() { for (const m of bpMeshes.values()) { scene.remove(m); disposeMesh(m); } bpMeshes.clear(); }

const isGhost = e => S.mode === 'depth' && e.y > S.layer;
function applyGhost(e) { if (!e.mesh) return; const g = isGhost(e); if (g !== e.ghost) { e.ghost = g; setGhost(e.mesh, g); } }
export function applyGhostAll() {
  for (const e of world.ents.values()) applyGhost(e);
  for (const e of world.frames.values()) applyGhost(e);
  setDepthView(S.mode === 'depth', S.layer);
  layerGrid.visible = S.mode === 'depth' && S.settings?.depthGrid !== false; layerGrid.position.y = S.layer + .012;   // on the interface layer: Hide UI hides it too
}
bus.on('settings', () => { layerGrid.visible = S.mode === 'depth' && S.settings?.depthGrid !== false; });

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
  else if (b.dy && b.kind === 'belt') ly = (b.dy > 0 ? p : 1 - p) + .04;   // slopes run from their own floor to the next one up (their tread sits a little higher)
  const [fx, fz] = DIRS[b.dir];
  out.set(b.x + .5 + lx * -fz - lz * fx, b.y + .11 + ly, b.z + .5 + lx * fx - lz * fz);
  return out;
}
const _p = new THREE.Vector3(), _q0 = new THREE.Quaternion(), _sc = new THREE.Vector3();
// Depth mode, looking below an underground belt's layer: its tunnel shows as a real belt in a channel dug through the
// earth, diving from the entrance and climbing to the exit, and what travels through it rides along.
const TUNNEL_D = .55;   // how far under its layer's floor the tunnel's belt runs
const tunnelShown = b => b.kind === 'underground' && S.mode === 'depth' && S.layer < b.y;
// How deep an item is: it dives over the entrance's front half and climbs over the exit's back half.
function tunnelPos(b, p, out, o) {
  const [fx, fz] = DIRS[b.dir], inn = b.role === 'in', along = inn ? p - .5 : p - (b.len - .5);
  const k = inn ? Math.min(1, (p - .5) / .5) : Math.min(1, Math.max(0, (b.len - .5 - p) / .5));
  out.set(b.x + .5 + o * -fz + fx * along, b.y + .11 - k * TUNNEL_D, b.z + .5 + o * fx + fz * along);
  return out;
}
const TUN_MAX = 768, TUN_TREAD = { underground: 'belt', fast_underground: 'fast_belt', express_underground: 'express_belt', bus_underground: 'bus_belt' };
const tunIM = (geo, mat) => { const m = new THREE.InstancedMesh(geo, mat, TUN_MAX); m.layers.set(1); m.frustumCulled = false; m.count = 0; scene.add(m); return m; };
const tun = {
  base: tunIM(new THREE.BoxGeometry(.9, .07, 1), new THREE.MeshToonMaterial({ color: 0x30343c, gradientMap: toonRamp })),
  rail: tunIM(new THREE.BoxGeometry(.08, .14, 1), new THREE.MeshToonMaterial({ color: 0xffffff, gradientMap: toonRamp })),   // tinted per belt tier
  floor: tunIM(new THREE.BoxGeometry(1.04, .08, 1), new THREE.MeshToonMaterial({ color: 0x4a3a2a, gradientMap: toonRamp })),
  wall: tunIM(new THREE.BoxGeometry(.08, .46, 1), new THREE.MeshToonMaterial({ color: 0x5e4a34, gradientMap: toonRamp })),
  tread: {},
};
const treadIM = t => tun.tread[t] ||= tunIM(new THREE.PlaneGeometry(.78, 1).rotateX(-Math.PI / 2), treadMat(t));
const _tm = new THREE.Matrix4(), _po = new THREE.Matrix4(), _tc = new THREE.Color(), _te = new THREE.Euler(0, 0, 0, 'YXZ');   // its own Euler: tilt first, then turn
function tunPart(im, ox, oy) { if (im.count >= TUN_MAX) return; _po.makeTranslation(ox, oy, 0); im.setMatrixAt(im.count++, _po.premultiply(_tm)); }
// One stretch of tunnel: its middle, how it tilts (positive climbs forward) and how long it is.
function tunSeg(e, x, y, z, pitch, len) {
  _tm.compose(V(x, y, z), _q.setFromEuler(_te.set(pitch, -e.dir * Math.PI / 2, 0)), V(1, 1, len));
  tunPart(tun.floor, 0, -.04); tunPart(tun.wall, -.52, .2); tunPart(tun.wall, .52, .2);
  tunPart(tun.base, 0, .06); tunPart(treadIM(TUN_TREAD[e.type] ?? 'belt'), 0, .1);
  for (const sx of [-.44, .44]) { const n = tun.rail.count; tunPart(tun.rail, sx, .09); if (tun.rail.count > n) tun.rail.setColorAt(n, _tc.setHex(ENTITIES[e.type].color)); }
}
function updateTunnels() {
  for (const im of [tun.base, tun.rail, tun.floor, tun.wall, ...Object.values(tun.tread)]) im.count = 0;
  if (S.started && S.mode === 'depth') {
    const cx = S.cam.x, cz = S.cam.z, R = Math.max(lowW, lowH) / S.cam.ppu * .75, dive = Math.atan2(TUNNEL_D, .5), slope = Math.hypot(.5, TUNNEL_D);
    for (const e of world.ents.values()) {
      if (e.kind !== 'underground' || e.role !== 'in' || !e.pair || !tunnelShown(e) || Math.abs(e.x - cx) > R || Math.abs(e.z - cz) > R) continue;
      const [fx, fz] = DIRS[e.dir], x = e.x + .5, z = e.z + .5, deep = e.y - TUNNEL_D;
      tunSeg(e, x + fx * .25, e.y - TUNNEL_D / 2, z + fz * .25, -dive, slope);   // down from the entrance
      for (let i = 1; i < e.len; i++) tunSeg(e, x + fx * i, deep, z + fz * i, 0, 1);
      tunSeg(e, x + fx * (e.len - .25), e.y - TUNNEL_D / 2, z + fz * (e.len - .25), dive, slope);   // up into the exit
    }
  }
  for (const im of [tun.base, tun.rail, tun.floor, tun.wall, ...Object.values(tun.tread)]) { im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true; }
}
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
        const hidden = !visibleOnBelt(b, p);
        if (hidden ? !tunnelShown(b) : isGhost(b)) continue;   // in a tunnel seen from below: shown even though the belt is a ghost
        const r = instFor(it.type);
        if (hidden) tunnelPos(b, p, _p, o); else beltItemPos(b, p, _p, o);
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
const poleTop = p => p.kind === 'pole' ? (ENTITIES[p.type].top ?? 1.26) + p.y : p.y + Math.min(.9, heightOf(p));   // a machine on a cable: its roof
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
  for (const [a, b, kind] of world.cables || []) span(a, b.foot ? { ...b, x: b.foot[0][0], z: b.foot[0][1] } : b, ITEMS[kind]?.color ?? 0xd88a4a, [0]);
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
    if (!m || m.userData.color !== p.color) { if (m) scene.remove(m); m = makePlayer(p.color); scene.add(m); others.set(p.id, m); p.rx ??= p.x; p.rz ??= p.z; p.rh ??= p.h || 0; }
    m.userData.player = p.id;
    // friends' positions arrive a few times a second: glide between them
    if (Math.hypot(p.x - p.rx, p.z - p.rz) > 4) { p.rx = p.x; p.rz = p.z; p.rh = p.h || 0; }
    p.rx += (p.x - p.rx) * k; p.rz += (p.z - p.rz) * k; p.rh = (p.rh ?? 0) + ((p.h || 0) - (p.rh ?? 0)) * k;
    animatePlayer(m, { ...p, x: p.rx, z: p.rz, h: p.rh }, S.T, dt);
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
      case 'chest': if (P.lid) { const want = e.tapFed ? -1.95 : 0; P.lid.rotation.x += (want - P.lid.rotation.x) * Math.min(1, dt * 5); } break;
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
        if (on && P.spin && ENTITIES[e.type].model === 'centrifuge') P.spin.rotation.y += dt * 20;
        if (on && P.spool) P.spool.rotation.x += dt * 6;
        if (on && P.gear) P.gear.rotation.y -= dt * 2.5;
        if (on && P.stir) P.stir.rotation.y += dt * 5;
        if (on && P.spin) P.spin.rotation.y += dt * 4;
        if (P.crane) P.crane.position.z = on ? Math.sin(S.T * 1.2) * .3 : P.crane.position.z * .95;
        if (P.glow) { P.glow.emissiveIntensity = on ? 1.5 + .4 * Math.sin(S.T * 17 + e.x) : .08; smoking = on && !!P.smoke; dark = true; }
        if (P.sprite) P.sprite.visible = !!e.recipe && S.altMode && !e.ghost;
        if (P.arm) poseStation(e, e.ghost);
        break;
      }
      case 'oilpump': e.ph = (e.ph || 0) + dt * 2.2 * (e.load || 0); P.beam.rotation.x = Math.sin(e.ph) * .26; P.rod.position.y = .4 + Math.sin(e.ph) * .1; break;
      case 'fpump': P.fly.rotation.x += dt * 14 * (e.load || 0); break;
      case 'fgen': P.fly.rotation.x += dt * 14 * (e.load || 0); P.glow.emissiveIntensity = (e.load || 0) > 0 ? .5 + e.load : .05; smoking = (e.load || 0) > .05; dark = true; break;
      case 'depot': if (P.crane) P.crane.rotation.y = active ? Math.sin(S.T * .9) * .9 : P.crane.rotation.y * .97; break;
      case 'rail': if (P.lamp) P.lamp.emissive.setHex(signalRed(e) ? 0xff3a2a : 0x3aff5a); break;
      case 'tank': if (P.level) { const f = Math.min(1, (e.fa?.[0] || 0) / ENTITIES[e.type].cap); P.level.emissiveIntensity = .2 + f; } break;
      case 'lab': if (active) P.ring.rotation.y += dt * 2; P.glow.emissiveIntensity = active ? 1 + .5 * Math.sin(S.T * 4) : .2; break;
      case 'lamp': if (P.glow) P.glow.emissiveIntensity = e.lit ? (ENTITIES[e.type].burner ? 1.6 + .4 * Math.sin(S.T * 17 + e.x) : 2.2) : .05; break;
      case 'radar': if (P.dish) P.dish.rotation.y = e.spin || 0; if (P.glow) P.glow.emissiveIntensity = active ? (Math.sin(S.T * 6) > .6 ? 2 : .4) : .05; break;
      case 'transmitter': P.spin.rotation.y += dt * .5; P.glow.emissiveIntensity = .3 + e.prog * 3; break;
      case 'boiler': P.glow.emissiveIntensity = (e.load || 0) > 0 ? 1.4 + .5 * Math.sin(S.T * 21 + e.x) : .05; smoking = (e.load || 0) > .05; dark = true; break;
      case 'engine': P.fly.rotation.x += dt * 12 * (e.load || 0); P.glow.emissiveIntensity = (e.load || 0) > 0 ? .4 + e.load : .05; break;
      case 'pump': P.fly.rotation.x += dt * 9 * (e.load || 0); if (P.glow) P.glow.emissiveIntensity = (e.load || 0) > 0 ? .6 + e.load : .1; break;
      case 'greenhouse':
        if (P.plants) P.plants.scale.y = e.seeds ? .15 + .85 * (e.grow || 0) : .05;
        P.roof.visible = S.mode === 'depth';   // the roof shows only in depth mode, so the room reads from above
        P.glow.emissiveIntensity = active ? .8 + .3 * Math.sin(S.T * 2) : .1;
        break;
      case 'dam': P.glow.emissiveIntensity = e.running ? 1 + .4 * Math.sin(S.T * 3) : .05; break;
      case 'medlab': if (active) P.ring.rotation.y += dt * 1.5; P.glow.emissiveIntensity = active ? 1 + .4 * Math.sin(S.T * 4) : .2; break;
      case 'reactor': {
        const h = (e.heat || 0) / 100, crit = h > .85 && !e.broken;
        P.glow.emissiveIntensity = e.broken ? 0 : (e.load || 0) > 0 ? 1 + e.load : .2;
        P.heat.emissiveIntensity = e.broken ? .3 : crit ? (Math.sin(S.T * 12) > 0 ? 2.5 : .2) : h * 1.6;   // flashes red when critical
        if (P.beacon) {   // the beacon: dark broken, red flashing critical, amber hot, green working, dim idle
          const warn = h * 100 >= REACTOR.warn, col = e.broken ? 0x16181d : crit ? 0xff2a1a : warn ? 0xffa53d : 0x9be37a;
          P.beacon.emissive.setHex(col);
          P.beacon.emissiveIntensity = e.broken ? 0 : crit ? (Math.sin(S.T * 12) > 0 ? 3 : .1) : warn ? 1.4 + .6 * Math.sin(S.T * 5) : (e.load || 0) > 0 ? 1.2 : .25;
        }
        smoking = (e.load || 0) > .05 || e.broken; dark = !!e.broken;
        if (crit && Math.random() < dt * 4) burst(e.x + .5, 1, e.z + .5, 3, 0xff6a3a, .8, .05);
        break;
      }
      case 'coolant': smoking = (e.load || 0) > .02; P.glow.emissiveIntensity = e.broken ? 1.5 : (e.cooled ?? 1) < .98 && (e.load || 0) > 0 ? (Math.sin(S.T * 8) > 0 ? 1.5 : .1) : 0; dark = !!e.broken;
        if (P.water) P.water.emissiveIntensity = e.broken ? 0 : .15 + Math.min(1, (e.load || 0)) * 1.2; break;   // short of water: the light blinks
    }
    if (smoking && !e.ghost) {
      e.smokeT = (e.smokeT || 0) + dt;
      if (e.smokeT > (e.kind === 'boiler' || e.kind === 'fgen' || e.kind === 'reactor' || e.kind === 'coolant' ? .5 / Math.max(.2, e.load || .2) : .4)) {
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
      const color = pm.kind === 'ore' && ore ? oreLook(ore.type) : ORE_CHIP[pm.kind] ?? 0x9aa1ad;
      burst(c.x + .5, c.y + .25, c.z + .5, 6, color, 1.3, .055);
    }
  } else chipT = .3;
  if (playerMesh.userData.color !== S.player.color) { scene.remove(playerMesh); playerMesh = makePlayer(S.player.color); scene.add(playerMesh); playerMesh.userData.ghost = undefined; }
  playerMesh.userData.player = S.player.id;
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
  updateGoods(dt);
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
  const sprint = isDown('sprint', keys);
  const sy = Math.sin(S.cam.yaw), cy = Math.cos(S.cam.yaw), mx = -sy * fz + cy * fx, mz = -cy * fz - sy * fx, l = Math.hypot(mx, mz);
  return { mx: mx / l, mz: mz / l, fx, fz, sprint };   // fx / fz are the raw keys, for driving
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
  C.panX = (C.panX || 0) + ((C.panXT || 0) - (C.panX || 0)) * k; C.panZ = (C.panZ || 0) + ((C.panZT || 0) - (C.panZ || 0)) * k;   // depth mode's pan, tweened home when it ends
  if (S.started) { const f = 1 - Math.pow(.00002, dt); C.x += (S.player.x + C.panX - C.x) * f; C.z += (S.player.z + C.panZ - C.z) * f; }
  C.y += ((S.mode === 'depth' ? S.layer : S.player.h || 0) - C.y) * k;   // flat mode follows the engineer up onto frames
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
  DITHER_OFF.value.set(((Math.round(sr * ppu) % 4) + 4) % 4, ((Math.round(su * ppu) % 4) + 4) % 4);
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
  if (y === 0) list.push(...featPickList(), ...vehMeshes.values());
  if (S.mode !== 'depth' || S.layer === 0) { list.push(playerMesh); for (const m of others.values()) list.push(m); }
  const hits = ray.intersectObjects(list, true);
  for (const h of hits) {
    if (h.instanceId !== undefined) { const k = featKeyAt(h.object.uuid, h.instanceId); if (k && world.feats.has(k)) { const [x, , z] = k.split(',').map(Number); return { x, y: 0, z }; } continue; }
    let o = h.object; while (o && !o.userData.ent && !o.userData.veh && !o.userData.player) o = o.parent;
    if (o?.userData.player) { const p = S.players.get(o.userData.player); if (p) return { x: Math.floor(p.local ? p.x : p.rx ?? p.x), y: 0, z: Math.floor(p.local ? p.z : p.rz ?? p.z), player: p.id }; continue; }
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
// An arrow at any point (px, pz world), pointing d.
function arrowAt(px, py, pz, d, color, s = 1) {
  if (nH >= 64) return;
  const pulse = 1 + Math.sin(S.T * 7) * .06;
  _m.compose(V(px, py, pz), _q.setFromEuler(_e.set(0, -d * Math.PI / 2, 0)), V(s * pulse, 1, s * pulse));
  hintArrows.setMatrixAt(nH, _m); _c.setHex(color); hintArrows.setColorAt(nH++, _c);
}
// Where a fluid building connects: just outside each port edge, a pair of arrows (one in, one out) where the fluid
// passes straight through, and one arrow where it only goes one way. Shared by hover hints and alt mode.
function portArrows(e, put) {
  for (const [x, z, d, f, thru] of portEdges(e)) {
    const [dx, dz] = DIRS[d], [rx, rz] = DIRS[(d + 1) % 4], cx = x + .5 + dx * .78, cz = z + .5 + dz * .78, io = ENTITIES[e.type].fluids[f];
    if (thru) { put(cx + rx * .17, cz + rz * .17, (d + 2) % 4, COL.IN); put(cx - rx * .17, cz - rz * .17, d, COL.OUT); }
    else put(cx, cz, io === 'in' ? (d + 2) % 4 : d, io === 'in' ? COL.IN : COL.OUT);
  }
}
const fakeAt = (type, x, y, z, dir) => { const foot = ENTITIES[type].multi ? footprint(type, x, z, dir) : null; return { type, kind: ENTITIES[type].kind, x: foot ? foot[0][0] : x, y, z: foot ? foot[0][1] : z, dir, foot, footSet: foot && new Set(foot.map(t => t[0] + ',' + t[1])) }; };
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
    const [fx, fz] = drillFront(def.big ? fakeAt(type, x, y, z, dir) : { x, z, dir }), t = at(fx, y, fz);
    arrow(fx, y, fz, dir, COL.OUT);
    if (def.big) markTiles(fakeAt(type, x, y, z, dir).foot.filter(([tx, tz]) => world.ores.has(key(tx, y, tz))), 0xffd23f, y);   // the ore it would cover
    return t ? `Drill pushes ore into the ${ENTITIES[t.type].name.toLowerCase()} at the orange arrow` : 'Drill: ore comes out at the orange arrow. Put a belt, chest or furnace there (R rotates)';
  }
  if (kind === 'belt' || kind === 'underground' || kind === 'splitter') {
    const ny = canSlope(type) && dy > 0 ? y + 1 : y, nx = x + dx, nz = z + dz, n = at(nx, ny, nz), bus = (def.lanes ?? 2) === 3, real = at(x, y, z);
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
  if (def.big && (kind === 'boiler' || kind === 'engine')) {
    portArrows(fakeAt(type, x, y, z, dir), (px, pz, d, c) => arrowAt(px, y + .06, pz, d, c, .55));
    return kind === 'boiler' ? `Boiler: water goes in and on through either end (blue in, orange out), steam comes out of the back. Fuel it by hand or inserter`
      : 'Steam engine: steam goes in and on through the front and back, so engines chain end to end. Put a generator pole beside it, and a step-up station to reach your machines';
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
  if (kind === 'greenhouse') return 'Greenhouse: touching greenhouses join into one room. Lead irrigation pipe to any side, put seeds in, take the harvest out with inserters. Walk in through the gaps in the walls';
  if (kind === 'reactor') { fluidHint2At(x, y, z); return 'Uranium reactor: water pipes join at its left and right, steam at front and back. Put coolant towers against it, and keep them watered'; }
  if (kind === 'coolant') return 'Coolant tower: put it against a uranium reactor and pipe water to it';
  if (kind === 'radar') return `Radar: with power it keeps the map live for ${def.scan} tiles around it, and explores out to ${def.reveal}. Put it in a pole's area`;
  if (kind === 'medlab') return 'Medical lab: feed it terrestrial packs, chlorophyll and the crop the upgrade needs. Choose upgrades in research (T), Medical';
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
  if (kind === 'engine') { fluidHint(); return 'Steam engine (old, one tile): put it against a boiler or another engine (or pipe steam to it), inside a pole\'s supply area'; }
  if (kind === 'fgen') { fluidHint(); return 'Diesel generator: pipe diesel to any side, and put it in a pole\'s supply area'; }
  if (kind === 'pole' && def.volts?.[0] === 2) return 'Step-up station: wires itself to generator poles. Hold a step-up cable and click it, then a low voltage pole: that is how generator power reaches machines';
  if (kind === 'pole' && voltsOf(def)[0] === 2) return 'Generator pole: steam engines and diesel generators in its area feed it. Machines can\'t draw from it: wire it to a step-up station';
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
    if (kind === 'boiler') return 'Boiler (old, one tile): fuel it (inserter or by hand), give it a water pump on one side and steam engines on another';
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
    const ins = S.settings?.altInserters !== false, put = y => (px, pz, d, c) => { if (n >= 2048) return; altArrows.setMatrixAt(n, _m.compose(V(px, y + .05, pz), _q.setFromEuler(_e.set(0, -d * Math.PI / 2, 0)), V(.38, 1, .38))); _c.setHex(c); altArrows.setColorAt(n++, _c); };
    for (const e of world.ents.values()) {
      if (e.foot && ENTITIES[e.type].big && e.kind !== 'drill' && !e.ghost && Math.abs(e.x - cx) <= R && Math.abs(e.z - cz) <= R) { portArrows(e, put(e.y)); continue; }
      if ((e.kind !== 'inserter' && e.kind !== 'drill') || (e.kind === 'inserter' && !ins) || e.ghost || Math.abs(e.x - cx) > R || Math.abs(e.z - cz) > R || n >= 2048) continue;
      const [dx, dz] = DIRS[e.dir], off = e.kind === 'drill' ? .62 : .36, [ax, az] = e.kind === 'drill' && e.foot ? drillFront(e).map((v, i) => v - DIRS[e.dir][i]) : [e.x, e.z];
      _m.compose(V(ax + .5 + dx * off, e.y + (e.kind === 'drill' ? .03 : .13), az + .5 + dz * off), _q.setFromEuler(_e.set(0, -e.dir * Math.PI / 2, 0)), V(.42, 1, .42));
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
  tileMarks.count = nMarks; tileMarks.instanceMatrix.needsUpdate = true; if (tileMarks.instanceColor) tileMarks.instanceColor.needsUpdate = true;   // after hints, which may add their own
  hintArrows.count = nH; hintCross.count = nX;
  for (const im of [hintArrows, hintCross]) { im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true; }
  updateAltArrows();
  updateBolts();
  updateTags();
  updateAltInfo();
  updateConduits(hover);
  updateTunnels();
}

// ---------------------------------------------------------------- alt mode: what is inside, and how far along
// Small bars over buildings: how full a chest is, how far a machine is through its craft, how much fuel a burner has.
// Icons ride on the models (sprites): a furnace's product, a chest's commonest item. Detail follows the zoom (lodAt,
// shared with the map): bars only from 'near' in, icons until 'regions'. Only what is on screen is looked at.
const barBg = overlayInst(new THREE.PlaneGeometry(1, 1), 1536, false, .82), barFg = overlayInst(new THREE.PlaneGeometry(1, 1), 1536, false, 1);
const _right = new THREE.Vector3(), _bp = new THREE.Vector3(), _bs = new THREE.Vector3();   // reused every frame: nothing allocated per building
const FILL = [0x7be37a, 0xffd23f, 0xff8a3d];
function altBars(e) {
  const out = [];
  if (e.store && e.kind !== 'depot') { const f = e.store.used() / e.store.slots.length; out.push([f, FILL[f > .9 ? 2 : f > .6 ? 1 : 0]]); }
  else if (e.kind === 'furnace' || e.kind === 'assembler' || e.kind === 'lab' || e.kind === 'medlab') { if (e.crafting || e.prog > 0 || e.unit) out.push([Math.min(1, e.prog || 0), 0x4aa3ff]); }
  else if (e.kind === 'drill' && e.status === 'mining') out.push([Math.min(1, e.timer || 0), 0x4aa3ff]);
  else if (e.kind === 'greenhouse' && e.seeds) out.push([e.grow || 0, 0x7be37a]);
  if (e.fuel !== undefined && e.kind !== 'inserter' && e.kind !== 'reactor') out.push([Math.min(1, (e.fuel + (e.burn > 0 ? .5 : 0)) / Math.max(1, (ITEMS[e.fuelType || 'coal']?.stack ?? 50) * .5)), e.fuel || e.burn > 0 ? 0xff9a3a : 0xff4a3a]);
  return out;
}
function updateAltInfo() {
  let n = 0;
  const lod = lodAt(S.cam.ppu), show = S.altMode && S.started && lod !== 'regions', bars = show && (lod === 'close' || lod === 'near');
  if (show) {
    const cx = S.cam.x, cz = S.cam.z, R = Math.max(lowW, lowH) / S.cam.ppu * .7;
    _right.set(1, 0, 0).applyQuaternion(camera.quaternion);
    for (const e of world.ents.values()) {
      if (e.ghost || !e.parts || Math.abs(e.x - cx) > R || Math.abs(e.z - cz) > R) continue;
      altIcon(e);
      if (!bars) continue;
      const list = altBars(e); if (!list.length) continue;
      const big = e.foot && ENTITIES[e.type].big, h = Math.min(1.1, heightOf(e)) + (e.parts.sprite?.visible ? .82 : .2);
      list.forEach(([f, col], i) => {
        if (n >= 1536) return;
        const w = big ? .9 : .62, y = e.y + h - i * .1, at = e.mesh.position;
        _bp.set(big ? at.x : e.x + .5, y, big ? at.z : e.z + .5);
        barBg.setMatrixAt(n, _m.compose(_bp, camera.quaternion, _bs.set(w + .06, .1, 1))); barBg.setColorAt(n, _c.setHex(0x101318));
        _bp.addScaledVector(_right, -w / 2 + w * f / 2);
        barFg.setMatrixAt(n, _m.compose(_bp, camera.quaternion, _bs.set(Math.max(.001, w * f), .06, 1))); barFg.setColorAt(n, _c.setHex(col));
        n++;
      });
    }
  }
  for (const im of [barBg, barFg]) { im.count = n; im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true; }
}
// The icon a building shows in alt mode, updated only when what it shows changes.
function altIcon(e) {
  const P = e.parts, sp = P.sprite; if (!sp) return;
  let id = null;
  if (e.kind === 'furnace') id = RECIPE[e.recipe] ? Object.keys(RECIPE[e.recipe].out)[0] : null;
  else if (e.kind === 'chest') { if ((P.iconT = (P.iconT || 0) + 1) % 20 === 1) { let best = 0; for (const [it, c] of e.store.counts()) if (c > best) { best = c; id = it; } P.iconId = id; } else id = P.iconId; }
  else return;
  if (id !== P.shown) { P.shown = id; if (id) sp.material = iconSpriteMat(id); }
  sp.visible = !!id && S.altMode;
}

// ---------------------------------------------------------------- chests fed by belt outputs
// Their lids stand open and the goods inside churn: one shared texture, scrolled, tinted per chest by what came in
// (e.tint, blended as items arrive, see belts.js). Only chests on screen are drawn, with no allocation per frame.
const goodsTex = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 16; const g = c.getContext('2d'), R = rng(77);
  g.fillStyle = '#6a6a6a'; g.fillRect(0, 0, 16, 16);
  for (let i = 0; i < 26; i++) { const v = 120 + Math.floor(R() * 135); g.fillStyle = `rgb(${v},${v},${v})`; g.fillRect(Math.floor(R() * 16), Math.floor(R() * 16), 2 + Math.floor(R() * 2), 2); }
  for (let i = 0; i < 10; i++) { g.fillStyle = '#2a2a2a'; g.fillRect(Math.floor(R() * 16), Math.floor(R() * 16), 1, 1); }
  const t = new THREE.CanvasTexture(c); t.magFilter = t.minFilter = THREE.NearestFilter; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; return t;
})();
const goodsMesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshToonMaterial({ map: goodsTex, gradientMap: toonRamp }), 256);
goodsMesh.layers.set(1); goodsMesh.frustumCulled = false; goodsMesh.count = 0; goodsMesh.setColorAt(0, new THREE.Color(1, 1, 1)); scene.add(goodsMesh);
function updateGoods(dt) {
  goodsTex.offset.y -= dt * .9; goodsTex.offset.x = Math.sin(S.T * 1.3) * .08;
  let n = 0;
  const cx = S.cam.x, cz = S.cam.z, R = Math.max(lowW, lowH) / S.cam.ppu * .75;
  for (const e of world.tapChests || []) {
    const P = e.parts;
    if (n >= 256 || !P?.inside || e.ghost || !e.mesh || Math.abs(e.x - cx) > R || Math.abs(e.z - cz) > R || e.store.isEmpty() || P.lid.rotation.x > -1) continue;
    const [lx, ly, lz, w, d] = P.inside, fill = e.store.used() / e.store.slots.length;
    _bp.set(lx, ly, lz).applyMatrix4(e.mesh.matrixWorld);
    const k = .55 + .45 * Math.min(1, fill * 3);   // a little heap that spreads as it fills
    goodsMesh.setMatrixAt(n, _m.compose(_bp, e.mesh.quaternion, _bs.set(w * k, 1, d * k)));
    const t = e.tint || [.6, .6, .6]; goodsMesh.setColorAt(n++, _c.setRGB(t[0], t[1], t[2], THREE.SRGBColorSpace));
  }
  goodsMesh.count = n; goodsMesh.instanceMatrix.needsUpdate = true; if (goodsMesh.instanceColor) goodsMesh.instanceColor.needsUpdate = true;
}

// ---------------------------------------------------------------- power in roads
// Conduit tiles show in alt mode (and while holding a conduit or a road): a dot a tile and a bar to each conduit
// beside it, yellow where the grid has a pole to feed it, grey where it has none.
const condMesh = overlayInst(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), 4096, true, .9);
function updateConduits() {
  let n = 0;
  const hold = ITEMS[S.sel]?.tool === 'conduit' || ROADS[S.sel];
  if (S.started && (S.altMode || hold) && world.roadGrids?.length && !(S.mode === 'depth' && S.layer < 0)) {
    const cx = S.cam.x, cz = S.cam.z, R = Math.max(lowW, lowH) / S.cam.ppu * .75;
    for (const g of world.roadGrids) {
      const col = g.net ? ROAD_POWER.color : 0x8a8a8a;
      for (const [x, z] of g.tiles) {
        if (n >= 4090 || Math.abs(x - cx) > R || Math.abs(z - cz) > R) continue;
        condMesh.setMatrixAt(n, _m.compose(V(x + .5, .035, z + .5), _q.identity(), V(.22, 1, .22))); condMesh.setColorAt(n++, _c.setHex(col));
        for (const [dx, dz] of [[1, 0], [0, 1]]) if (world.roads.get((x + dx) + ',' + (z + dz))?.p) {
          condMesh.setMatrixAt(n, _m.compose(V(x + .5 + dx * .5, .035, z + .5 + dz * .5), _q.identity(), V(dx ? 1 : .08, 1, dz ? 1 : .08))); condMesh.setColorAt(n++, _c.setHex(col));
        }
      }
    }
  }
  condMesh.count = n; condMesh.instanceMatrix.needsUpdate = true; if (condMesh.instanceColor) condMesh.instanceColor.needsUpdate = true;
}
// What you'd lay with a road in hand: one quad per tile of the strip, green where it fits, red where it doesn't.
const roadPrev = new THREE.InstancedMesh(new THREE.PlaneGeometry(.96, .96).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ transparent: true, opacity: .4, depthWrite: false }), 12);
roadPrev.layers.set(UI_LAYER); roadPrev.renderOrder = 6; roadPrev.frustumCulled = false; roadPrev.count = 0; roadPrev.setColorAt(0, new THREE.Color(1, 1, 1)); scene.add(roadPrev);
// Spots waiting for their item to be crafted (see placeOrCraft in sim.js): a pale square that breathes.
const pendMarks = new THREE.InstancedMesh(new THREE.PlaneGeometry(.86, .86).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x7ef6ff, transparent: true, opacity: .3, depthWrite: false }), 128);
pendMarks.layers.set(UI_LAYER); pendMarks.renderOrder = 6; pendMarks.frustumCulled = false; pendMarks.count = 0; scene.add(pendMarks);
function updatePending() {
  let n = 0;
  const s = .92 + Math.sin(S.T * 5) * .08;
  for (const p of S.player.pending || []) {
    if (n >= 128) break;
    pendMarks.setMatrixAt(n++, _m.compose(V(p.x + .5, p.y + .04, p.z + .5), _q.identity(), V(s, 1, s)));
  }
  pendMarks.count = n; pendMarks.instanceMatrix.needsUpdate = true;
}
// Tiles lit up under the cursor: the whole of a building or road that covers several tiles, the tiles a dam drag will
// cover, the weedy patches a shovel stroke reaches. Filled in by updateHover, drawn once a frame.
const tileMarks = new THREE.InstancedMesh(new THREE.PlaneGeometry(.94, .94).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ transparent: true, opacity: .24, depthWrite: false, depthTest: false }), 4096);
tileMarks.layers.set(UI_LAYER); tileMarks.renderOrder = 7; tileMarks.frustumCulled = false; tileMarks.count = 0; tileMarks.setColorAt(0, new THREE.Color(1, 1, 1)); scene.add(tileMarks);
let nMarks = 0;
export function markTiles(list, color, y = 0) {
  for (const [x, z] of list) {
    if (nMarks >= 4096) return;
    tileMarks.setMatrixAt(nMarks, _m.compose(V(x + .5, y + .05, z + .5), _q.identity(), V(1, 1, 1)));
    tileMarks.setColorAt(nMarks++, _c.setHex(color));
  }
}
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
  nMarks = 0;
  updateRoadPreview(hover);
  updatePending();
  hoverMarks(hover);
  for (const r of S.picks || []) {   // the Shift + click selection: every tile of every building in it, and its vehicles
    if (r.veh) { const v = vehicleById(r.veh); if (v) markTiles([[Math.floor(v.rx ?? v.x), Math.floor(v.rz ?? v.z)]], 0x7ef6ff, 0); continue; }
    const e = world.ents.get(key(r.x, r.y, r.z)); if (e) markTiles(tilesOf(e), 0x7ef6ff, e.y);
  }
  if (VEHICLES[S.sel] || ROADS[S.sel] || ITEMS[S.sel]?.tool === 'signal' || ENTITIES[S.sel]?.drag) { updateToolHover(hover); return; }
  const sel = S.sel && ENTITIES[S.sel] ? S.sel : null;
  const kind = sel && ENTITIES[sel].kind;
  const dy = (kind === 'inserter' && S.mode === 'depth') || canSlope(sel) ? S.dy : 0;
  const pk = [sel, S.dir, dy, S.maxTier].join();
  if (pk !== previewKey) {
    if (preview) { scene.remove(preview); preview = null; }
    if (sel) {
      const def = ENTITIES[sel];
      const fake = { type: sel, kind: def.kind, x: 0, y: 0, z: 0, dir: S.dir, dy, reach: def.reach, t: .5, held: null, curve: null, role: 'in' };
      if (def.multi) { fake.type = def.as || sel; fake.foot = footprint(sel, 0, 0, S.dir); fake.x = fake.foot[0][0]; fake.z = fake.foot[0][1]; }
      preview = makeMesh(fake);
      // the preview is moved by its anchor tile; a big building's model sits at the middle of its footprint
      preview.userData.off = def.big ? [preview.position.x - .5, preview.position.z - .5] : [fake.x, fake.z];
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
  const { x, z } = hover, y = sel ? slopeLayer(sel, x, hover.y, z, S.dir, dy) : hover.y, real = world.ents.get(key(x, y, z)), ent = real || (y === 0 && world.feats.get(key(x, 0, z)) ? { kind: 'feat' } : null);
  const pulse = 1 + Math.sin(S.T * 6) * .025;
  marker.position.set(x + .5, y, z + .5);
  marker.scale.set(1.08 * pulse, sel ? .5 : heightOf(ent?.kind === 'feat' ? { kind: 'pole' } : ent) * .95 + .05, 1.08 * pulse);
  // a building over several tiles: the brackets go round all of it
  const size = sel ? ENTITIES[sel].multi && ENTITIES[sel].size : null, box = size ? footprint(sel, x, z, S.dir) : real?.foot && !(hover.ctrl && ENTITIES[real.type].tileMine) ? real.foot : null;
  if (box) {
    const xs = box.map(t => t[0]), zs = box.map(t => t[1]), x0 = Math.min(...xs), x1 = Math.max(...xs), z0 = Math.min(...zs), z1 = Math.max(...zs);
    marker.position.set((x0 + x1 + 1) / 2, y, (z0 + z1 + 1) / 2); marker.scale.x = (x1 - x0 + 1.08) * pulse; marker.scale.z = (z1 - z0 + 1.08) * pulse;
  }
  if (!sel) {
    const t = mineTargetAt(hover);
    marker.material.color.setHex(t && distTo(x, z) > t.reach ? 0xff8a3d : ent ? 0xffe9a0 : 0xffffff);
    marker.material.opacity = ent || t ? 1 : .35;
    if (real) S.hint = ioHints(real.type, real.x, real.y, real.z, real.dir, real.dy || 0);
    return;
  }
  marker.material.opacity = 1;
  const off = ENTITIES[sel].multi ? preview.userData.off : [0, 0];
  preview.position.set(x + off[0] + .5, y, z + off[1] + .5);
  // out of it is only a problem when there is nothing to craft one from
  const plan = S.bpHand || keys.has('ShiftLeft') || keys.has('ShiftRight');
  const err = plan ? canPlace(sel, x, y, z, S.dir, dy, { noInv: true, bp: true }) : canPlace(sel, x, y, z, S.dir, dy, { reach: true, noInv: true }) || (!invGet(sel) && !planCraft(sel, 1) && !S.player.pending?.length ? 'none' : null);
  marker.material.color.setHex(err ? 0xff5a4a : plan ? 0x7ef6ff : 0x9be37a);
  setPreview(preview, plan ? 'bp' : err ? 'bad' : 'ok');   // stippled only while planning a blueprint; the bracket takes the same colour
  S.hint = ioHints(sel, x, y, z, S.dir, dy);
}

// Light up what the cursor would act on: a building or road as one object (one tile with Ctrl where that is allowed),
// and with an empty hand over weedy ground, the patches a shovel stroke reaches.
function hoverMarks(h) {
  if (S.dragTiles?.length) { markTiles(S.dragTiles, S.dragOk ? 0x9be37a : 0xff5a4a); return; }
  if (S.poleDrag?.list.length) {   // power poles being dragged: where each goes, and what it would cover
    const def = ENTITIES[S.poleDrag.type];
    for (const p of S.poleDrag.list) {
      const r = def.supply, area = [];
      for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) if (dx || dz) area.push([p.x + dx, p.z + dz]);
      markTiles(area, 0x4aa3ff, S.poleDrag.y);
    }
    markTiles(S.poleDrag.list.map(p => [p.x, p.z]), 0x9be37a, S.poleDrag.y);
    markTiles(S.poleDrag.list.filter(p => p.bad).map(p => [p.x, p.z]), 0xff5a4a, S.poleDrag.y);
    return;
  }
  const station = S.sel === 'crafting_station' && h ? { x: h.x, y: h.y, z: h.z, type: 'crafting_station', fac: S.player.fac }
    : S.openEnt?.type === 'crafting_station' ? S.openEnt : h && world.ents.get(key(h.x, h.y, h.z))?.type === 'crafting_station' ? world.ents.get(key(h.x, h.y, h.z)) : null;
  if (station) {   // its reach, and the chests in it
    const R = ENTITIES.crafting_station.pull.radius, area = [];
    for (let dx = -R; dx <= R; dx++) for (let dz = -R; dz <= R; dz++) if (dx || dz) area.push([station.x + dx, station.z + dz]);
    markTiles(area, 0x7ef6ff, station.y);
    markTiles(stationChests(station).map(c => [c.x, c.z]), 0xffd23f, station.y);
  }
  if (!h || S.sel) return;
  const e = world.ents.get(key(h.x, h.y, h.z));
  if (e?.foot) { if (h.ctrl && ENTITIES[e.type].tileMine) markTiles([[h.x, h.z]], 0xffa53d, h.y); else markTiles(e.foot, 0xffe9a0, h.y); return; }
  if (h.y !== 0) return;
  const r = roadAt(h.x, h.z);
  if (r) { markTiles(h.ctrl && ROADS[r.s]?.tileMine ? [[h.x, h.z]] : r.o ? roadTiles(r.o) : [[h.x, h.z]], h.ctrl && ROADS[r.s]?.tileMine ? 0xffa53d : 0xffe9a0); return; }
  const t = mineTargetAt(h);
  if (t?.kind === 'patch' || t?.kind === 'ore' || t?.kind === 'feat') { const tiles = sweepTiles(t); if (t.kind === 'patch' || tiles.length > 1) markTiles(tiles.map(c => [c.x, c.z]), t.kind === 'patch' ? 0x9be37a : 0xffe9a0, h.y); }
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
  if (ENTITIES[S.sel]?.drag) {
    const def = ENTITIES[S.sel];
    ok = !S.dragTiles && y === 0 && isWater(x, z) && !world.ents.get(key(x, 0, z));
    hint = S.dragTiles ? `${def.name}: ${S.dragTiles.length} tile${S.dragTiles.length > 1 ? 's' : ''}${S.dragOk ? '' : ` · ${S.dragErr}`}` : `${def.name}: drag across water. It goes down ${def.width || 1} tiles wide, one ${def.name.toLowerCase()} a tile. Running, it gives ${def.outTile} kW a tile, more on a river`;
  } else if (VEHICLES[S.sel]) {
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
// ---------------------------------------------------------------- night and light
// Lights are soft pools drawn flat on the ground into their own low-res buffer, added up, and multiplied into the
// picture in the post pass. That is cheap for hundreds of lights, unlike real scene lights.
const lightTex = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'), im = g.createImageData(64, 64);
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
    const d = Math.min(1, Math.hypot(x - 31.5, y - 31.5) / 32), a = Math.pow(1 - d, 1.8), i = (y * 64 + x) * 4;
    im.data[i] = im.data[i + 1] = im.data[i + 2] = 255; im.data[i + 3] = Math.round(a * 255);
  }
  g.putImageData(im, 0, 0); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.NoColorSpace; return t;
})();
const lightScene = new THREE.Scene();
const lightMesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2),
  new THREE.MeshBasicMaterial({ map: lightTex, transparent: true, blending: THREE.AdditiveBlending, depthTest: false, depthWrite: false }), 2048);
lightMesh.frustumCulled = false; lightMesh.count = 0; lightMesh.setColorAt(0, new THREE.Color(1, 1, 1)); lightScene.add(lightMesh);
const _amb = new THREE.Vector3(), lerp3 = (a, b, k) => _amb.set(a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k);
// A machine's glow shows while it works; lamps while lit; depots all night.
const glowing = e => e.kind === 'lamp' ? e.lit : e.kind === 'depot' ? true : S.T - e.lastActive < 1.5 || (e.load || 0) > .02;
function updateLights() {
  const dl = daylight(), night = Math.max(0, 1 - dl * 2.5);   // pools of light show from late evening, not in the afternoon
  const deep = Math.pow(nightDepth(), DAY.nightCurve), nl = lerp3(DAY.nightLight, DAY.midnightLight, deep).toArray();
  post.uniforms.amb.value.copy(dl > .5 ? lerp3(DAY.duskLight, [1, 1, 1], (dl - .5) * 2) : lerp3(nl, DAY.duskLight, dl * 2));
  post.uniforms.nightK.value = night;
  if (night < .01) return false;
  let n = 0;
  const add = (x, y, z, r, color, k) => {
    if (n >= 2048) return;
    lightMesh.setMatrixAt(n, _m.compose(V(x, y + .02, z), _q.identity(), V(r, 1, r)));
    lightMesh.setColorAt(n++, _c.setHex(color).multiplyScalar(k));
  };
  const cx = S.cam.x, cz = S.cam.z, R = Math.max(lowW, lowH) / S.cam.ppu * .8 + 8;
  for (const e of world.ents.values()) {
    const L = ENTITIES[e.type].light;
    if (!L || Math.abs(e.x - cx) > R || Math.abs(e.z - cz) > R || !glowing(e)) continue;
    const fl = L.flicker ? .85 + .15 * Math.sin(S.T * 13 + e.x * 7) * Math.sin(S.T * 7.3 + e.z * 3) : 1;
    add(e.x + .5, e.y, e.z + .5, L.r * fl, L.color, (L.machine ? .8 : 1.15) * fl);
  }
  // engineers carry a small light of their own, so you can always see what you are doing
  for (const p of S.players.values()) add(p.local ? p.x : p.rx ?? p.x, 0, p.local ? p.z : p.rz ?? p.z, 4.5 * (1 + playerMods(p).light), 0xcfe0ff, .5);   // night eyes reach further
  for (const v of world.vehicles) if (Math.abs(v.v || 0) > .1 || S.player.veh === v.id) add(v.rx ?? v.x, 0, v.rz ?? v.z, 3.5, 0xfff0c0, .6);   // headlights
  lightMesh.count = n; lightMesh.instanceMatrix.needsUpdate = true; if (lightMesh.instanceColor) lightMesh.instanceColor.needsUpdate = true;
  return true;
}
// ---------------------------------------------------------------- the map's close-up
// Zoomed far into the map, it shows the real scene: rendered from above (or at any angle the map turns it to, in depth
// mode) into a small target, read back, and handed to the map as a canvas. Only where the world is loaded around you.
const glimpseCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 300);
let glimpseRT = null, glimpseBuf = null, glimpseImg = null;
const glimpseCanvas = document.createElement('canvas'), glimpseCtx = glimpseCanvas.getContext('2d');
export const glimpseReady = (x, z) => chunkShown(x, z);
export function renderGlimpse(cx, cz, w, h, ppt, yaw, pitch) {
  w = Math.max(16, Math.min(512, Math.round(w))); h = Math.max(16, Math.min(512, Math.round(h)));
  if (!glimpseRT || glimpseRT.width !== w || glimpseRT.height !== h) {
    glimpseRT?.dispose(); glimpseRT = new THREE.WebGLRenderTarget(w, h, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
    glimpseRT.texture.colorSpace = THREE.SRGBColorSpace; glimpseBuf = new Uint8Array(w * h * 4);
    glimpseCanvas.width = w; glimpseCanvas.height = h; glimpseImg = glimpseCtx.createImageData(w, h);
  }
  const y = S.mode === 'depth' ? S.layer : 0, cp = Math.cos(pitch), d = 120;
  glimpseCam.position.set(cx + Math.sin(yaw) * cp * d, y + Math.sin(pitch) * d, cz + Math.cos(yaw) * cp * d); glimpseCam.lookAt(cx, y, cz);
  glimpseCam.left = -w / ppt / 2; glimpseCam.right = w / ppt / 2; glimpseCam.top = h / ppt / 2; glimpseCam.bottom = -h / ppt / 2; glimpseCam.updateProjectionMatrix();
  glimpseCam.layers.set(0); glimpseCam.layers.enable(1);
  renderer.shadowMap.autoUpdate = false;
  renderer.setRenderTarget(glimpseRT); renderer.setClearColor(0x0b0d12, 1); renderer.clear(); renderer.render(scene, glimpseCam);
  renderer.setRenderTarget(null); renderer.setClearColor(0x000000, 1); renderer.shadowMap.autoUpdate = true;
  renderer.readRenderTargetPixels(glimpseRT, 0, 0, w, h, glimpseBuf);
  const row = w * 4, out = glimpseImg.data;
  for (let r = 0; r < h; r++) out.set(glimpseBuf.subarray((h - 1 - r) * row, (h - r) * row), r * row);   // GL rows run bottom up
  glimpseCtx.putImageData(glimpseImg, 0, 0);
  return glimpseCanvas;
}
export function render(dt, hover) {
  updateCamera(dt);
  if (S.started) terrainView();
  layerGrid.position.x = Math.round(S.cam.x); layerGrid.position.z = Math.round(S.cam.z);
  updatePreview(hover);
  animate(dt);
  updateItems();
  // the light buffer, only after dusk
  if (updateLights()) { renderer.setRenderTarget(rtLight); renderer.setClearColor(0x000000, 1); renderer.clear(); camera.layers.set(0); renderer.render(lightScene, camera); }
  // colour + depth of the world: the interface is drawn after the lighting (below), so night never hides it
  camera.layers.set(0); camera.layers.enable(1);
  renderer.setRenderTarget(rtColor); renderer.render(scene, camera);
  // normals for crease highlights (world layer only, no shadows recomputed)
  const bg = scene.background; scene.background = null; scene.overrideMaterial = normalMat;
  camera.layers.set(0); renderer.shadowMap.autoUpdate = false;
  renderer.setRenderTarget(rtNormal); renderer.setClearColor(0x8080ff, 1); renderer.clear(); renderer.render(scene, camera);
  renderer.shadowMap.autoUpdate = true; scene.overrideMaterial = null; scene.background = bg; renderer.setClearColor(0x000000, 1);
  camera.layers.enable(1); camera.layers.enable(UI_LAYER);
  // outline + upscale
  renderer.setRenderTarget(null); renderer.render(postScene, postCam);
  // the interface layer, over the finished picture, tested against the world's depth (left out while the UI is hidden)
  if (!S.hideUI) {
    camera.layers.set(UI_LAYER); renderer.autoClear = false; renderer.shadowMap.autoUpdate = false;
    const bg2 = scene.background; scene.background = null;
    renderer.render(scene, camera);
    scene.background = bg2; renderer.autoClear = true; renderer.shadowMap.autoUpdate = true;
    camera.layers.enable(0); camera.layers.enable(1);
  }
}
