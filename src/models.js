// 3D models. Every machine is made of real parts. Static parts are merged per material and get a
// baked ambient-occlusion gradient; moving parts (arms, drill heads, spools, dishes) stay separate.
// Everything is toon-shaded so the pixel-outline post pass reads cleanly.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { ENTITIES, ITEMS, TIERS, FLUIDS, FRAMES, VEHICLES, ENGINES, RECIPE, recipeIcon } from './data.js';
import { S, DIRS, factoryOf } from './state.js';
import { iconCanvas } from './icons.js';

// ---------------------------------------------------------------- materials
export const toonRamp = (() => {
  const t = new THREE.DataTexture(new Uint8Array([96, 150, 205, 255]), 4, 1, THREE.RedFormat);
  t.minFilter = t.magFilter = THREE.NearestFilter; t.needsUpdate = true; return t;
})();
const matCache = new Map();
export function M(color, opts = {}) {
  const k = color + JSON.stringify(opts);
  if (!matCache.has(k)) matCache.set(k, new THREE.MeshToonMaterial({ color, gradientMap: toonRamp, ...opts }));
  return matCache.get(k);
}
const aoCache = new WeakMap();
const withAO = m => { if (!aoCache.has(m)) { const c = m.clone(); c.vertexColors = true; aoCache.set(m, c); } return aoCache.get(m); };
// Darken toward the ground and on downward faces: cheap contact shading baked into vertex colours.
export function bakeAO(geo, floor = 0) {
  const p = geo.attributes.position, n = geo.attributes.normal, c = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const h = Math.min(1, Math.max(0, (p.getY(i) - floor) / .45));
    let k = .62 + .38 * h * h * (3 - 2 * h);
    if (n && n.getY(i) < -.5) k *= .7;
    c[i * 3] = c[i * 3 + 1] = c[i * 3 + 2] = k;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(c, 3));
  return geo;
}
// Faceted look for rocks, ore and crowns.
export const facet = geo => { const g = geo.index ? geo.toNonIndexed() : geo; g.computeVertexNormals(); return g; };

// Render layer for interface overlays drawn in the world (cursor, arrows, grids, supply areas, icons).
// Hide UI (H) simply stops rendering it, so anything put on it hides with the rest of the interface.
export const UI_LAYER = 2;

const ghostCache = new WeakMap(), previewCache = new WeakMap();
function variant(cache, m, opacity) {
  if (!cache.has(m)) { const c = m.clone(); c.transparent = true; c.opacity = opacity; c.depthWrite = false; cache.set(m, c); }
  return cache.get(m);
}
// Ghosts (above the working layer) move to render layer 1, which the outline pass ignores.
export function setGhost(root, ghost) {
  root.traverse(o => {
    if (!o.isMesh && !o.isSprite) return;
    if (!o.userData.base) o.userData.base = o.material;
    o.material = ghost ? variant(ghostCache, o.userData.base, .1) : o.userData.base;
    o.castShadow = !ghost && o.isMesh;
    o.layers.set(o.isSprite ? UI_LAYER : ghost ? 1 : 0);
  });
}
export function setPreview(root) {
  root.traverse(o => { if (o.isMesh || o.isSprite) { o.material = variant(previewCache, o.material, .5); o.castShadow = false; o.receiveShadow = false; o.layers.set(UI_LAYER); } });
}

// ---------------------------------------------------------------- belt tread textures
const treadTex = {};
export function treadMat(type) {
  if (treadTex[type]) return treadTex[type].mat;
  const c = document.createElement('canvas'); c.width = 16; c.height = 16;
  const g = c.getContext('2d'), h = ENTITIES[type]?.color ?? 0xc9a227;
  const r = h >> 16 & 255, gg = h >> 8 & 255, b = h & 255;
  g.fillStyle = '#23262d'; g.fillRect(0, 0, 16, 16);
  g.fillStyle = '#2d3139'; for (let y = 0; y < 16; y += 4) g.fillRect(0, y, 16, 2);
  g.fillStyle = `rgb(${r * .85 | 0},${gg * .85 | 0},${b * .85 | 0})`;
  for (const oy of [1, 9]) for (let i = 0; i < 4; i++) { g.fillRect(3 + i, oy + 4 - i, 2, 2); g.fillRect(11 - i, oy + 4 - i, 2, 2); }
  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = tex.minFilter = THREE.NearestFilter; tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.MeshToonMaterial({ map: tex, gradientMap: toonRamp });
  treadTex[type] = { tex, mat, speed: ENTITIES[type]?.speed ?? 1.5 };
  return mat;
}
export function animateTreads(dt) { for (const t of Object.values(treadTex)) t.tex.offset.y -= t.speed * dt; }

// ---------------------------------------------------------------- items (shared with instancing)
const itemGeoCache = {}, itemMatCache = {};
export function itemGeo(type) {
  const shape = ITEMS[type]?.shape ?? 'ore';
  if (itemGeoCache[shape]) return itemGeoCache[shape];
  const G = {
    ore: () => facet(new THREE.DodecahedronGeometry(.12, 0).scale(1, .8, 1).translate(0, .09, 0)),
    wood: () => new THREE.CylinderGeometry(.06, .06, .3, 6).rotateZ(Math.PI / 2).translate(0, .06, 0),
    crystal: () => facet(new THREE.OctahedronGeometry(.13, 0).scale(.8, 1.3, .8).translate(0, .16, 0)),
    plate: () => new THREE.BoxGeometry(.26, .06, .26).translate(0, .03, 0),
    brick: () => new THREE.BoxGeometry(.26, .1, .14).translate(0, .05, 0),
    lens: () => new THREE.CylinderGeometry(.12, .12, .05, 8).translate(0, .03, 0),
    gear: () => new THREE.CylinderGeometry(.13, .13, .06, 8).translate(0, .03, 0),
    cable: () => new THREE.TorusGeometry(.09, .035, 4, 8).rotateX(Math.PI / 2).translate(0, .04, 0),
    chip: () => new THREE.BoxGeometry(.22, .05, .22).translate(0, .03, 0),
    coil: () => new THREE.CylinderGeometry(.08, .08, .2, 8).rotateZ(Math.PI / 2).translate(0, .08, 0),
    pack: () => new THREE.CylinderGeometry(.06, .1, .2, 6).translate(0, .1, 0),
    machine: () => new THREE.BoxGeometry(.22, .22, .22).translate(0, .11, 0),
    barrel: () => new THREE.CylinderGeometry(.1, .1, .26, 8).translate(0, .13, 0),
    engine: () => new THREE.BoxGeometry(.24, .16, .2).translate(0, .08, 0),
    vehicle: () => new THREE.BoxGeometry(.26, .14, .3).translate(0, .07, 0),
    part: () => new THREE.BoxGeometry(.26, .08, .2).translate(0, .04, 0),
    wheel: () => new THREE.CylinderGeometry(.11, .11, .07, 8).rotateZ(Math.PI / 2).translate(0, .11, 0),
    hull: () => new THREE.BoxGeometry(.18, .1, .3).translate(0, .05, 0),
    signal: () => new THREE.CylinderGeometry(.03, .03, .26, 5).translate(0, .13, 0),
    net: () => new THREE.BoxGeometry(.24, .06, .24).translate(0, .03, 0),
    fish: () => new THREE.SphereGeometry(.1, 6, 4).scale(.6, .5, 1.4).translate(0, .05, 0),
    road: () => new THREE.BoxGeometry(.26, .04, .26).translate(0, .02, 0),
  };
  return (itemGeoCache[shape] = G[shape]());
}
export function itemMat(type) {
  return itemMatCache[type] ||= new THREE.MeshToonMaterial({ color: ITEMS[type]?.color ?? 0xff00ff, emissive: ITEMS[type]?.emissive ?? 0, gradientMap: toonRamp });
}
const spriteMatCache = {};
export function iconSpriteMat(id) {
  if (spriteMatCache[id]) return spriteMatCache[id];
  const tex = new THREE.CanvasTexture(iconCanvas(id)); tex.magFilter = tex.minFilter = THREE.NearestFilter; tex.colorSpace = THREE.SRGBColorSpace;
  return (spriteMatCache[id] = new THREE.SpriteMaterial({ map: tex, depthTest: false }));
}

// ---------------------------------------------------------------- palette
const C = {
  dark: 0x2c3038, mid: 0x5c6470, steel: 0x939ca8, light: 0xc3cad3, black: 0x16181d,
  yellow: 0xe5ad2e, hazard: 0x24262b, stone: 0x8f8373, stoneDark: 0x645a4d, rust: 0x9a5b34, brass: 0xc2934a,
  wood: 0x8a5a2c, woodDark: 0x5e3b1a, glass: 0x9fe8f2,
};

// ---------------------------------------------------------------- model building
const _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1), _m = new THREE.Matrix4();
const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const cyl = (rt, rb, h, seg) => new THREE.CylinderGeometry(rt, rb, h, seg);
const glowMat = (color, intensity = 0) => new THREE.MeshToonMaterial({ color: 0x1a0c06, emissive: color, emissiveIntensity: intensity, gradientMap: toonRamp });

// Local side (as built, facing north) of an absolute direction, for things shaped by their neighbours.
const localSide = (e, a) => (a - e.dir + 4) % 4;
export function makeMesh(e) {
  const res = TIERS[S.maxTier].res, def = ENTITIES[e.type], g = new THREE.Group(), P = {}, statics = [];
  const st = (geo, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) => {
    _m.compose(_v.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz)), _s); geo.applyMatrix4(_m); statics.push([geo, mat]);
  };
  const dyn = (parent, geo, mat, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); parent.add(m); return m; };
  const grp = (parent, x = 0, y = 0, z = 0) => { const n = new THREE.Group(); n.position.set(x, y, z); parent.add(n); return n; };
  const col = M(def.color), dark = M(C.dark), mid = M(C.mid), steel = M(C.steel), black = M(C.black);
  const seg = Math.max(6, res);

  // pipe stubs with a flange, from the middle of the tile out to side l (local), at pipe height
  const PIPE_Y = .22;
  const pipeArm = (l, mat, len = .5, r = .1) => {
    const [dx, dz] = DIRS[l], along = dx ? cyl(r, r, len, seg).rotateZ(Math.PI / 2) : cyl(r, r, len, seg).rotateX(Math.PI / 2);
    st(along, mat, dx * len / 2, PIPE_Y, dz * len / 2);
    const fl = dx ? cyl(r + .035, r + .035, .05, seg).rotateZ(Math.PI / 2) : cyl(r + .035, r + .035, .05, seg).rotateX(Math.PI / 2);
    st(fl, M(C.mid), dx * (len - .03), PIPE_Y, dz * (len - .03));
  };
  // fluid ports on machines: a short pipe stub with a coloured collar, so you can see where pipes go
  const ports = () => {
    for (const p of def.ports || []) {
      const [dx, dz] = DIRS[p.side], col2 = M(p.io === 'in' ? 0x4aa3ff : 0xffa53d);
      const along = dx ? cyl(.08, .08, .14, seg).rotateZ(Math.PI / 2) : cyl(.08, .08, .14, seg).rotateX(Math.PI / 2);
      st(along, M(C.steel), dx * .44, PIPE_Y, dz * .44);
      const fl = dx ? cyl(.11, .11, .04, seg).rotateZ(Math.PI / 2) : cyl(.11, .11, .04, seg).rotateX(Math.PI / 2);
      st(fl, col2, dx * .49, PIPE_Y, dz * .49);
    }
  };
  switch (def.model || def.kind) {
    case 'pipe': {
      const pm = M(def.color), band = M(e.fluid ? FLUIDS[e.fluid].color : 0x3a414c);
      const sides = [0, 1, 2, 3].filter(a => e.conn >> a & 1).map(a => localSide(e, a));
      if (!sides.length) sides.push(0, 2);
      if (sides.length === 1) sides.push((sides[0] + 2) % 4);
      for (const l of sides) pipeArm(l, pm);
      st(new THREE.SphereGeometry(.13, seg, Math.max(4, seg >> 1)), pm, 0, PIPE_Y, 0);
      st(box(.1, .05, .1), band, 0, PIPE_Y + .13, 0);   // a sight glass showing what flows inside
      st(box(.06, PIPE_Y - .08, .06), dark, 0, (PIPE_Y - .08) / 2, 0);
      break;
    }
    case 'upipe': {
      const pm = M(def.color), out = e.role === 'out';
      pipeArm(out ? 0 : 2, pm);
      st(box(.42, .18, .42), M(C.dark), 0, .09, 0);
      st(cyl(.13, .13, .1, seg), pm, 0, .2, 0);
      st(box(.36, .03, .36), M(C.mid), 0, .185, 0);
      st(box(.08, .03, .2), M(e.pair ? 0x9be37a : 0xffa53d), 0, .2, out ? .1 : -.1);
      break;
    }
    case 'fpump': {
      pipeArm(0, M(C.steel), .5, .09); pipeArm(2, M(C.steel), .5, .09);
      st(box(.44, .34, .44), col, 0, .2, 0);
      st(box(.48, .05, .48), M(C.dark), 0, .39, 0);
      st(cyl(.1, .1, .22, seg).rotateZ(Math.PI / 2), M(C.mid), .22, .26, .08);
      st(new THREE.ConeGeometry(.08, .16, 4).rotateX(-Math.PI / 2), M(0xf2f2f2), 0, .44, -.08);
      P.fly = grp(g, -.2, .26, .1); dyn(P.fly, cyl(.08, .08, .05, seg).rotateZ(Math.PI / 2), M(C.light));
      break;
    }
    case 'valve': {
      pipeArm(0, M(C.steel)); pipeArm(2, M(C.steel));
      st(box(.26, .26, .3), col, 0, PIPE_Y, 0);
      st(cyl(.03, .03, .2, 6), M(C.dark), 0, .42, 0);
      st(new THREE.TorusGeometry(.12, .025, 4, seg).rotateX(Math.PI / 2), M(0xd84a3a), 0, .52, 0);
      st(new THREE.ConeGeometry(.06, .12, 4).rotateX(-Math.PI / 2), M(0xf2f2f2), 0, .36, -.12);
      break;
    }
    case 'tank': {
      st(box(.94, .08, .94), dark, 0, .04, 0);
      st(cyl(.44, .44, .8, seg), col, 0, .48, 0);
      st(new THREE.SphereGeometry(.44, seg, Math.max(4, seg >> 1), 0, Math.PI * 2, 0, Math.PI / 2).scale(1, .35, 1), M(C.light), 0, .88, 0);
      for (const y of [.2, .5, .78]) st(cyl(.455, .455, .04, seg), M(C.mid), 0, y, 0);
      st(box(.05, .8, .05), M(C.dark), .3, .48, -.34); st(box(.05, .8, .05), M(C.dark), .38, .48, -.26);
      P.level = glowMat(e.fluid ? FLUIDS[e.fluid].color : 0x3a414c, .6);
      dyn(g, box(.08, .5, .02), P.level, -.2, .45, -.445);
      break;
    }
    case 'oilpump': {   // a pumpjack: walking beam nodding on an A-frame, horse head over the well
      st(box(.9, .1, .9), dark, 0, .05, 0);
      st(box(.5, .18, .5), col, .12, .19, .1);
      for (const x of [-.12, .12]) { st(box(.05, .62, .05).rotateZ(x > 0 ? -.18 : .18), M(C.steel), x * .7, .46, .1); }
      st(cyl(.06, .08, .25, seg), M(C.dark), 0, .12, -.3);
      pipeArm(0, M(C.steel), .5, .07);
      P.beam = grp(g, 0, .78, .1);
      dyn(P.beam, box(.08, .08, .9), col, 0, 0, -.1);
      dyn(P.beam, box(.12, .26, .1), M(C.mid), 0, -.08, -.56);
      dyn(P.beam, box(.16, .16, .14), M(C.dark), 0, -.05, .36);
      P.rod = dyn(g, box(.025, .45, .025), M(C.light), 0, .4, -.46);
      break;
    }
    case 'refinery': {   // two distillation columns, a fired heater and its stack
      st(box(.96, .1, .96), dark, 0, .05, 0);
      st(box(.4, .28, .5), M(C.stone), -.22, .24, .12);
      st(cyl(.06, .08, .7, seg), M(C.stoneDark), -.3, .7, .3);
      for (const [x, z, h] of [[.2, -.12, 1.15], [.22, .26, .85]]) {
        st(cyl(.14, .16, h, seg), M(C.light), x, .1 + h / 2, z);
        for (let y = .3; y < h; y += .22) st(cyl(.165, .165, .03, seg), col, x, .1 + y, z);
        st(new THREE.SphereGeometry(.14, seg, 4, 0, Math.PI * 2, 0, Math.PI / 2), M(C.light), x, .1 + h, z);
      }
      st(box(.06, .06, .5), M(C.steel), -.05, .5, -.1);
      P.glow = glowMat(0xff6a1a); dyn(g, box(.24, .1, .03), P.glow, -.22, .2, -.135);
      P.smoke = [-.3, 1.08, .3];
      ports();
      break;
    }
    case 'chem': {   // two domed reactors and a stirred mixing vessel
      st(box(.96, .1, .96), dark, 0, .05, 0);
      for (const [x, z] of [[-.22, .2], [.22, .2]]) {
        st(cyl(.17, .17, .42, seg), col, x, .31, z);
        st(new THREE.SphereGeometry(.17, seg, 4, 0, Math.PI * 2, 0, Math.PI / 2), M(C.glass, { emissive: 0x1d5a66, emissiveIntensity: .3 }), x, .52, z);
      }
      st(cyl(.2, .22, .32, seg), M(C.steel), 0, .26, -.18);
      st(box(.5, .04, .04), M(C.mid), 0, .55, .2);
      P.stir = grp(g, 0, .45, -.18);
      dyn(P.stir, cyl(.025, .025, .3, 6), M(C.dark), 0, .05, 0);
      dyn(P.stir, box(.3, .04, .05), M(C.yellow), 0, .2, 0);
      ports();
      break;
    }
    case 'barreler': {
      st(box(.96, .1, .96), dark, 0, .05, 0);
      st(box(.6, .5, .5), col, 0, .35, .12);
      st(box(.64, .05, .54), M(C.steel), 0, .62, .12);
      st(box(.3, .06, .4), M(C.dark), 0, .14, -.24);
      P.spin = grp(g, 0, .3, -.24);
      dyn(P.spin, cyl(.1, .1, .26, 8), M(0x8a96a6));
      dyn(P.spin, cyl(.105, .105, .03, 8), M(C.dark), 0, .06, 0);
      ports();
      break;
    }
    case 'vfactory': {   // a big assembly hall with an open door and a gantry crane inside
      st(box(.98, .08, .98), dark, 0, .04, 0);
      for (const x of [-.44, .44]) st(box(.1, .7, .96), col, x, .39, 0);
      st(box(.96, .7, .1), col, 0, .39, .43);
      st(box(1, .06, 1), M(C.steel), 0, .77, 0);
      for (let i = -2; i <= 2; i++) st(box(.14, .04, .02), M(i % 2 ? C.yellow : C.hazard), i * .16, .7, -.49);
      P.crane = grp(g, 0, .66, 0);
      dyn(P.crane, box(.8, .05, .06), M(C.yellow));
      dyn(P.crane, box(.1, .1, .1), M(C.dark), 0, -.06, 0);
      P.sprite = new THREE.Sprite(iconSpriteMat(e.recipe || 'car_petrol')); P.sprite.scale.set(.5, .5, 1); P.sprite.position.set(0, 1.15, 0);
      P.sprite.visible = !!e.recipe && S.altMode; P.sprite.renderOrder = 10; P.sprite.layers.set(UI_LAYER); g.add(P.sprite);
      break;
    }
    case 'fgen': {   // diesel generator: engine block, exhaust stack and a flywheel
      st(box(.94, .14, .94), dark, 0, .07, 0);
      st(box(.5, .36, .7), col, -.1, .32, 0);
      for (let i = -2; i <= 2; i++) st(box(.52, .03, .04), M(C.mid), -.1, .42, i * .12);
      st(cyl(.05, .06, .5, seg), M(C.stoneDark), -.25, .7, .25);
      st(cyl(.07, .07, .04, seg), black, -.25, .95, .25);
      P.fly = grp(g, .28, .34, 0); dyn(P.fly, cyl(.24, .24, .06, seg).rotateZ(Math.PI / 2), M(C.light)); dyn(P.fly, box(.07, .4, .07), dark);
      P.glow = glowMat(0xffaa3a); dyn(g, box(.04, .08, .2), P.glow, .16, .22, -.25);
      P.smoke = [-.25, 1, .25];
      break;
    }
    case 'depot': {
      const way = def.way, tint = M(factoryColorHex(e));
      if (way === 'rail') {   // platform, canopy on posts, a sign in the factory's colour
        st(box(.96, .16, .96), M(C.stone), 0, .08, 0);
        st(box(.96, .03, .1), M(C.yellow), 0, .175, -.43);
        for (const [x, z] of [[-.34, .28], [.34, .28], [-.34, -.2], [.34, -.2]]) st(box(.05, .6, .05), M(C.steel), x, .45, z);
        st(box(.9, .05, .66), col, 0, .78, .04);
        st(box(.5, .16, .03), tint, 0, .62, .3);
        st(box(.3, .2, .24), M(C.wood), -.2, .28, .2); st(box(.22, .18, .2), M(C.wood), .18, .27, .25);
      } else if (way === 'road') {   // a garage with a fuel pump out front
        st(box(.96, .06, .96), M(0x4a4c52), 0, .03, 0);
        st(box(.8, .5, .5), col, 0, .3, .2);
        st(box(.84, .05, .54), M(C.steel), 0, .57, .2);
        st(box(.5, .34, .02), M(C.dark), 0, .23, -.05);
        st(box(.84, .05, .3), tint, 0, .52, -.22);
        st(box(.14, .3, .12), M(0xd84a3a), .3, .2, -.3);
        st(box(.1, .06, .02), M(C.glass), .3, .3, -.37);
      } else {   // a wooden pier with bollards and a small crane
        st(box(.98, .1, .98), M(C.wood), 0, .1, 0);
        for (let i = -3; i <= 3; i++) st(box(.98, .02, .02), M(C.woodDark), 0, .155, i * .14);
        for (const [x, z] of [[-.4, -.4], [.4, -.4], [-.4, .4], [.4, .4]]) st(cyl(.05, .05, .5, 6), M(C.woodDark), x, -.1, z);
        for (const x of [-.32, .32]) st(cyl(.04, .05, .12, 6), M(C.dark), x, .22, -.4);
        st(box(.34, .3, .3), tint, -.2, .3, .25);
        P.crane = grp(g, .25, .16, .2);
        dyn(P.crane, cyl(.06, .08, .6, 6), M(C.yellow), 0, .3, 0);
        dyn(P.crane, box(.06, .06, .6), M(C.yellow), 0, .6, -.22);
        dyn(P.crane, box(.02, .25, .02), M(C.dark), 0, .48, -.5);
      }
      ports();
      break;
    }
    case 'rail': {
      // Rails join every rail next to them: straight, quarter curve around a tile corner, junction or crossing.
      const tie = M(C.woodDark), steelR = M(0xb8bec8), sides = [0, 1, 2, 3].filter(a => e.conn >> a & 1).map(a => localSide(e, a));
      const straight = (axis, half = 0) => {   // axis 0: north-south, 1: east-west; half: only toward one side
        const zs = half ? [half * .125, half * .375] : [-.375, -.125, .125, .375], len = half ? .5 : 1, off = half ? half * .25 : 0;
        for (const z of zs) st(axis ? box(.12, .04, .7) : box(.7, .04, .12), tie, axis ? z : 0, .02, axis ? 0 : z);
        for (const x of [-.2, .2]) st(axis ? box(len, .05, .045) : box(.045, .05, len), steelR, axis ? off : x, .065, axis ? x : off);
      };
      const curve = (a, b) => {
        const cx = (DIRS[a][0] + DIRS[b][0]) * .5, cz = (DIRS[a][1] + DIRS[b][1]) * .5, qx = -Math.sign(cx), qz = -Math.sign(cz);
        const th = { '1,-1': 0, '-1,-1': Math.PI / 2, '-1,1': Math.PI, '1,1': -Math.PI / 2 }[qx + ',' + qz];
        for (const r of [.3, .7]) st(new THREE.TorusGeometry(r, .024, 3, Math.max(6, seg), Math.PI / 2).rotateX(-Math.PI / 2).rotateY(th).translate(0, .065, 0), steelR, cx, 0, cz);
        const f0 = Math.atan2(qz, qx) - Math.PI / 4;
        for (let i = 0; i < 4; i++) { const f = f0 + (i + .5) * Math.PI / 8; st(box(.7, .04, .12).rotateY(-f), tie, cx + Math.cos(f) * .5, .02, cz + Math.sin(f) * .5); }
      };
      const has = l => sides.includes(l);
      if (sides.length === 2 && (sides[0] + sides[1]) % 2 === 1) curve(sides[0], sides[1]);
      else if (sides.length <= 2) {
        const axis = sides.length ? sides[0] % 2 : 0;
        if (sides.length === 1) { straight(axis, sides[0] === 0 || sides[0] === 3 ? -1 : 1); const [dx, dz] = DIRS[(sides[0] + 2) % 4]; st(box(axis ? .08 : .5, .16, axis ? .5 : .08), M(0xd84a3a), dx * .1, .08, dz * .1); }
        else straight(axis);
      } else {   // junctions: the through line plus the branches
        if (has(0) && has(2)) straight(0); if (has(1) && has(3)) straight(1);
        if (sides.length === 3) { const branch = [0, 1, 2, 3].find(l => has(l) && !has((l + 2) % 4)); curve(branch, (branch + 1) % 4); curve(branch, (branch + 3) % 4); }
      }
      if (e.sig !== null && e.sig !== undefined) {   // a signal post beside the track, facing along it
        const l = localSide(e, e.sig), [dx, dz] = DIRS[l], [rx, rz] = DIRS[(l + 1) % 4], px = dx * .38 + rx * .42, pz = dz * .38 + rz * .42;
        st(cyl(.025, .03, .62, 6), M(C.dark), px, .31, pz);
        st(box(.12, .2, .1), M(C.black), px, .66, pz);
        P.lamp = glowMat(0x3aff5a, 1.2); dyn(g, box(.07, .07, .03), P.lamp, px - dx * .06, .7, pz - dz * .06);
      }
      break;
    }
    case 'belt': {
      const tread = treadMat(e.type);
      if (def.lanes === 3) {   // bus belt: wider, with lane dividers, side channels and a stop on the middle lane
        const div = M(C.mid), out = M(0xffa53d);
        if (!e.curve) {
          st(box(.98, .07, 1), dark, 0, .06, 0);
          st(new THREE.PlaneGeometry(.86, 1).rotateX(-Math.PI / 2), tread, 0, .1, 0);
          for (const x of [-.145, .145]) st(box(.025, .02, 1), div, x, .108, 0);
          for (const x of [-.47, .47]) { st(box(.06, .15, 1), col, x, .09, 0); st(box(.07, .03, 1), M(0xffffff & (def.color + 0x202020)), x, .175, 0); }
        } else {
          const L = e.curve === 'L', cx = L ? -.5 : .5;
          st(new THREE.CylinderGeometry(.98, .98, .07, seg, 1, false, L ? 0 : Math.PI * 1.5, Math.PI / 2), dark, cx, .06, -.5);
          st(new THREE.RingGeometry(.06, .94, seg, 1, L ? -Math.PI / 2 : Math.PI, Math.PI / 2).rotateX(-Math.PI / 2), tread, cx, .1, -.5);
          for (const r of [.355, .645]) st(new THREE.TorusGeometry(r, .014, 3, seg, Math.PI / 2).rotateX(-Math.PI / 2).rotateY(L ? -Math.PI / 2 : Math.PI), div, cx, .108, -.5);
          st(new THREE.TorusGeometry(.95, .045, 4, seg, Math.PI / 2).rotateX(-Math.PI / 2).rotateY(L ? -Math.PI / 2 : Math.PI), col, cx, .13, -.5);
        }
        for (const [f, s] of [[e.chL, -1], [e.chR, 1]]) {
          if (!f) continue;
          st(box(.06, .1, .5), out, s * .5, .14, 0);
          st(new THREE.ConeGeometry(.09, .18, 4).rotateZ(-s * Math.PI / 2), out, s * .62, .14, 0);
          const sp = new THREE.Sprite(iconSpriteMat(f === '*' ? 'bus_belt' : f)); sp.scale.set(.36, .36, 1); sp.position.set(s * .62, .62, 0);
          sp.renderOrder = 10; sp.layers.set(UI_LAYER); g.add(sp);
        }
        if (e.midOff) st(box(.24, .1, .06), M(0xd84a3a), 0, .15, -.47);
        break;
      }
      if (!e.curve) {
        st(box(.9, .07, 1), dark, 0, .06, 0);
        st(new THREE.PlaneGeometry(.78, 1).rotateX(-Math.PI / 2), tread, 0, .1, 0);
        for (const x of [-.44, .44]) {
          st(box(.08, .14, 1), col, x, .09, 0);
          st(box(.1, .03, 1), M(0xffffff & (def.color + 0x202020)), x, .17, 0);
        }
        for (const z of [-.46, .46]) st(cyl(.05, .05, .8, seg).rotateZ(Math.PI / 2), steel, 0, .06, z);
        for (const [x, z] of [[-.4, -.38], [.4, -.38], [-.4, .38], [.4, .38]]) st(box(.06, .04, .06), dark, x, .02, z);
      } else {
        const L = e.curve === 'L', cx = L ? -.5 : .5;
        st(new THREE.CylinderGeometry(.96, .96, .07, seg, 1, false, L ? 0 : Math.PI * 1.5, Math.PI / 2), dark, cx, .06, -.5);
        st(new THREE.RingGeometry(.1, .9, seg, 1, L ? -Math.PI / 2 : Math.PI, Math.PI / 2).rotateX(-Math.PI / 2), tread, cx, .1, -.5);
        st(new THREE.TorusGeometry(.94, .045, 4, seg, Math.PI / 2).rotateX(-Math.PI / 2).rotateY(L ? -Math.PI / 2 : Math.PI), col, cx, .13, -.5);
        st(cyl(.08, .08, .16, 6), col, cx + (L ? .06 : -.06), .08, -.44);
      }
      break;
    }
    case 'underground': {
      const out = e.role === 'out', s = out ? -1 : 1;
      st(box(.9, .07, .5), dark, 0, .06, .25 * s);
      st(new THREE.PlaneGeometry(.78, .5).rotateX(-Math.PI / 2), treadMat({ underground: 'belt', fast_underground: 'fast_belt', bus_underground: 'bus_belt' }[e.type] ?? 'express_belt'), 0, .1, .25 * s);
      for (const x of [-.44, .44]) st(box(.08, .14, .5), col, x, .09, .25 * s);
      st(box(.94, .44, .52), col, 0, .22, -.25 * s);
      st(box(.98, .07, .56), M(0x7a6420), 0, .47, -.25 * s);
      st(box(.7, .3, .04), black, 0, .17, -.01 * s);
      for (const x of [-.25, 0, .25]) st(box(.12, .04, .5), M(C.hazard), x, .38, -.25 * s);
      break;
    }
    case 'splitter': {
      st(box(.9, .07, 1), dark, 0, .06, 0);
      st(new THREE.PlaneGeometry(.78, 1).rotateX(-Math.PI / 2), treadMat('belt'), 0, .1, 0);
      st(box(1, .32, .38), col, 0, .2, 0);
      st(box(.94, .06, .32), mid, 0, .39, 0);
      const arrow = M(0xf2f2f2);
      st(new THREE.ConeGeometry(.08, .16, 4).rotateX(-Math.PI / 2), arrow, 0, .46, -.06);
      st(new THREE.ConeGeometry(.08, .16, 4).rotateZ(Math.PI / 2), arrow, -.28, .46, 0);
      st(new THREE.ConeGeometry(.08, .16, 4).rotateZ(-Math.PI / 2), arrow, .28, .46, 0);
      (e.sf || []).forEach((f, k) => {   // a filtered way shows its item over its arrow
        if (!f) return;
        const sp = new THREE.Sprite(iconSpriteMat(f)); sp.scale.set(.3, .3, 1); sp.position.set([0, -.3, .3][k], .72, [-.3, 0, 0][k]);
        sp.renderOrder = 10; sp.layers.set(UI_LAYER); g.add(sp);
      });
      break;
    }
    case 'lift': {
      const dy = e.dy || 1, ang = Math.atan2(dy, 1), len = Math.hypot(1, 1);
      st(box(.84, .07, len), dark, 0, .5 * dy + .08, 0, ang);
      st(new THREE.PlaneGeometry(.74, len).rotateX(-Math.PI / 2), treadMat('lift'), 0, .5 * dy + .12, 0, ang);
      for (const x of [-.44, .44]) {
        st(box(.07, .12, len), col, x, .5 * dy + .15, 0, ang);
        st(box(.08, 1.1, .08), steel, x, dy > 0 ? .55 : -.45, dy > 0 ? -.44 : .44);
      }
      break;
    }
    case 'inserter': {
      // base plate with a coloured ring, turret, two-link arm, claw
      st(cyl(.32, .36, .08, seg), dark, 0, .04, 0);
      st(cyl(.27, .27, .05, seg), col, 0, .1, 0);
      if (e.dy) st(new THREE.ConeGeometry(.08, .16, 4).rotateX(e.dy < 0 ? Math.PI : 0), M(e.dy > 0 ? 0x9be37a : 0xff8a3d), 0, .22, -.28);
      else st(box(.12, .04, .1), M(0xf2f2f2), 0, .12, -.27);
      if (def.burner) st(cyl(.05, .06, .2, 6), M(C.stoneDark), .2, .2, .18);
      const turret = grp(g); P.turret = turret;
      dyn(turret, box(.26, .16, .26), col, 0, .2, 0);
      dyn(turret, box(.2, .04, .2), dark, 0, .3, 0);
      P.L = e.reach === 2 ? 1.25 : .8;
      P.seg1 = dyn(turret, box(.08, .08, P.L), col);
      P.seg2 = dyn(turret, box(.065, .065, P.L), M(C.light));
      P.elbow = dyn(turret, cyl(.06, .06, .13, seg).rotateZ(Math.PI / 2), dark);
      P.hand = grp(turret);
      dyn(P.hand, box(.16, .04, .1), dark);
      dyn(P.hand, box(.03, .1, .03), dark, -.06, -.06, 0); dyn(P.hand, box(.03, .1, .03), dark, .06, -.06, 0);
      P.item = dyn(turret, itemGeo('iron_plate'), itemMat('iron_plate')); P.item.visible = false;
      break;
    }
    case 'drill': {
      if (def.burner) {
        st(box(.86, .3, .86), M(C.stone), 0, .15, 0);
        st(box(.9, .06, .9), M(C.stoneDark), 0, .32, 0);
        st(box(.7, .2, .7), M(C.rust), 0, .44, 0);
        st(cyl(.08, .1, .55, seg), M(C.stoneDark), .27, .7, .27);
        st(cyl(.11, .11, .05, seg), black, .27, .98, .27);
        st(box(.28, .14, .26), dark, 0, .2, -.47);
        P.glow = glowMat(0xff6a1a); dyn(g, box(.22, .1, .04), P.glow, -.18, .16, .44);
        const head = grp(g, 0, .54, 0); P.head = head;
        dyn(head, cyl(.2, .22, .08, seg), M(C.steel));
        for (let i = 0; i < 3; i++) dyn(head, box(.36, .04, .06), M(C.brass), 0, .06, 0).rotation.y = i * Math.PI / 3;
        P.smoke = [.27, 1.02, .27];
        break;
      }
      st(box(.9, .34, .9), col, 0, .17, 0);
      for (let i = -2; i <= 2; i++) st(box(.12, .08, .02), M(i % 2 ? C.yellow : C.hazard), i * .17, .26, -.455);
      st(box(.28, .14, .26), dark, 0, .2, -.47);
      const tall = def.depth >= 2 ? 1.5 : .56;   // the big drill: a taller derrick over a longer bore
      for (const [x, z] of [[-.34, -.34], [.34, -.34], [-.34, .34], [.34, .34]]) st(box(.06, tall, .06), steel, x, .34 + tall / 2, z);
      for (const y of def.depth >= 2 ? [.9, 1.84] : [.9]) {
        st(box(.74, .06, .06), steel, 0, y, -.34); st(box(.74, .06, .06), steel, 0, y, .34);
        st(box(.06, .06, .74), steel, -.34, y, 0); st(box(.06, .06, .74), steel, .34, y, 0);
      }
      if (def.depth >= 2) { st(box(.3, .2, .3), M(C.yellow), 0, 1.97, 0); for (let i = 0; i < 4; i++) st(box(.03, .9, .03).rotateZ(i % 2 ? .6 : -.6).rotateY(i * Math.PI / 2), steel, -.34 * Math.sin(i * Math.PI / 2), 1.35, -.34 * Math.cos(i * Math.PI / 2)); }
      const head = grp(g, 0, .34, 0); P.head = head;
      dyn(head, cyl(.28, .3, .1, seg), M(C.light), 0, .05, 0);
      const n = res >= 12 ? 5 : 3;
      for (let i = 0; i < n; i++) dyn(head, box(.48, .05, .07), M(C.yellow), 0, .12, 0).rotation.y = i * Math.PI / n;
      dyn(head, new THREE.ConeGeometry(.07, .45, Math.max(4, res >> 1)), M(C.yellow), 0, .4, 0);
      break;
    }
    case 'furnace': {
      if (def.burner) {
        st(cyl(.44, .48, .3, 8), M(C.stone), 0, .15, 0);
        st(cyl(.46, .46, .05, 8), M(C.stoneDark), 0, .32, 0);
        st(cyl(.36, .43, .32, 8), M(C.stone), 0, .5, 0);
        st(cyl(.38, .38, .05, 8), M(C.stoneDark), 0, .68, 0);
        st(cyl(.3, .34, .1, 8), M(C.stoneDark), 0, .75, 0);
        st(cyl(.16, .16, .06, 8), black, 0, .8, 0);
        st(box(.34, .26, .1), M(C.stoneDark), 0, .2, -.42);
        P.smoke = [0, .86, 0];
      } else {
        st(box(.92, .62, .92), M(C.mid), 0, .31, 0);
        st(box(.96, .08, .96), M(C.steel), 0, .66, 0);
        st(box(.6, .1, .6), M(C.dark), 0, .74, 0);
        for (const [x, z] of [[-.44, -.44], [.44, -.44], [-.44, .44], [.44, .44]]) st(box(.1, .66, .1), M(C.dark), x, .33, z);
        P.slits = glowMat(0xff7a2a);
        for (const x of [-.2, 0, .2]) dyn(g, box(.08, .3, .02), P.slits, x, .38, -.465);
      }
      P.glow = glowMat(0xff6a1a);
      dyn(g, box(.24, .14, .06), P.glow, 0, .19, def.burner ? -.46 : -.47);
      break;
    }
    case 'assembler': {
      const big = e.type === 'assembler2';
      st(box(.96, .14, .96), dark, 0, .07, 0);
      st(box(.86, .5, .86), col, 0, .39, 0);
      for (const [x, z] of [[-.43, -.43], [.43, -.43], [-.43, .43], [.43, .43]]) st(box(.12, .66, .12), M(C.steel), x, .33, z);
      st(box(.96, .08, .96), M(C.steel), 0, .66, 0);
      st(box(.5, .26, .02), M(C.glass, { emissive: 0x1d5a66, emissiveIntensity: .4 }), 0, .4, -.44);
      if (big) st(box(.7, .05, .7), M(0x9ad8cf), 0, .72, 0);
      const spool = grp(g, 0, .42, .05); P.spool = spool;
      dyn(spool, cyl(.13, .13, .5, seg).rotateZ(Math.PI / 2), M(big ? 0x7ef6ff : C.yellow));
      const gear = grp(g, 0, .75, 0); P.gear = gear;
      dyn(gear, cyl(.22, .22, .06, seg), M(C.light));
      for (let i = 0; i < Math.min(res, 12); i++) { const a = i / Math.min(res, 12) * Math.PI * 2; dyn(gear, box(.07, .06, .07), M(C.light), Math.cos(a) * .25, 0, Math.sin(a) * .25); }
      dyn(gear, cyl(.06, .06, .1, 6), dark);
      P.sprite = new THREE.Sprite(iconSpriteMat(e.recipe || 'gear')); P.sprite.scale.set(.5, .5, 1); P.sprite.position.set(0, 1.15, 0);
      P.sprite.visible = !!e.recipe && S.altMode; P.sprite.renderOrder = 10; P.sprite.layers.set(UI_LAYER); g.add(P.sprite);
      break;
    }
    case 'lab': {
      st(box(.94, .26, .94), dark, 0, .13, 0);
      for (const [x, z] of [[-.4, -.4], [.4, -.4], [-.4, .4], [.4, .4]]) st(box(.14, .3, .14), col, x, .15, z);
      st(cyl(.42, .44, .08, seg), M(C.steel), 0, .3, 0);
      P.glow = glowMat(0x58c8d8, .2);
      dyn(g, new THREE.IcosahedronGeometry(.16, 0), P.glow, 0, .52, 0);
      dyn(g, new THREE.SphereGeometry(.36, seg, Math.max(3, seg >> 1), 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshToonMaterial({ color: C.glass, transparent: true, opacity: .35, gradientMap: toonRamp, depthWrite: false }), 0, .33, 0).layers.set(1);
      const ring = grp(g, 0, .52, 0); P.ring = ring;
      dyn(ring, new THREE.TorusGeometry(.42, .03, 4, seg * 2).rotateX(Math.PI / 2), M(C.brass));
      break;
    }
    case 'chest': {
      if (e.type === 'wooden_chest') {
        st(box(.68, .44, .62), M(C.wood), 0, .22, 0);
        for (const y of [.12, .26]) st(box(.7, .025, .64), M(C.woodDark), 0, y, 0);
        st(box(.72, .07, .66), M(C.woodDark), 0, .45, 0);
        for (const [x, z] of [[-.33, -.3], [.33, -.3], [-.33, .3], [.33, .3]]) st(box(.06, .48, .06), M(C.mid), x, .24, z);
        st(box(.1, .1, .04), M(C.light), 0, .36, -.33);
        break;
      }
      st(box(.74, .48, .66), M(C.steel), 0, .24, 0);
      st(box(.78, .08, .7), M(C.mid), 0, .48, 0);
      for (const y of [.1, .34]) st(box(.78, .05, .7), M(C.mid), 0, y, 0);
      st(box(.12, .12, .04), M(C.yellow), 0, .36, -.36);
      break;
    }
    case 'frame': {
      const fm = M(def.color), joint = M(C.mid);
      for (const [x, z] of [[-.45, -.45], [.45, -.45], [-.45, .45], [.45, .45]]) { st(box(.08, 1, .08), fm, x, .5, z); st(box(.12, .06, .12), joint, x, .03, z); }
      for (const z of [-.45, .45]) st(box(.98, .07, .07), fm, 0, .965, z);
      for (const x of [-.45, .45]) st(box(.07, .07, .98), fm, x, .965, 0);
      st(box(.05, .05, .9), joint, 0, .97, 0); st(box(.9, .05, .05), joint, 0, .97, 0);
      if (res >= 8) for (let i = 0; i < 4; i++) {
        const a = i * Math.PI / 2, s = Math.sin(a), c = Math.cos(a);
        st(box(.035, 1.2, .035).rotateZ(Math.PI / 4.4).rotateY(a), fm, -.45 * s, .5, -.45 * c);
      }
      break;
    }
    case 'pole': {
      if (e.type === 'power_line') {   // lattice pylon with two insulator arms
        const fm = M(def.color);
        for (const [x, z] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) st(box(.05, 2.7, .05).rotateX(z * .07).rotateZ(-x * .07), fm, x * .19, 1.35, z * .19);
        for (const y of [.5, 1.1, 1.7, 2.3]) st(box(.42 - y * .1, .04, .42 - y * .1), fm, 0, y, 0);
        for (let i = 0; i < 4; i++) st(box(.03, .7, .03).rotateZ(Math.PI / 4).rotateY(i * Math.PI / 2), fm, -.17 * Math.sin(i * Math.PI / 2), .8, -.17 * Math.cos(i * Math.PI / 2));
        st(box(1.1, .07, .08), M(C.dark), 0, 2.6, 0); st(box(.7, .06, .07), M(C.dark), 0, 2.2, 0);
        for (const x of [-.48, .48]) st(cyl(.045, .06, .3, 6), M(0x9fd0ff), x, 2.78, 0);
        st(box(.5, .02, .5), M(0xc8483a), 0, .05, 0);
        break;
      }
      if (e.type === 'transformer') {   // fat tank with cooling fins and three bushings
        st(box(.9, .12, .9), dark, 0, .06, 0);
        st(box(.62, .56, .62), col, 0, .4, 0);
        for (const s of [-1, 1]) for (let i = -2; i <= 2; i++) { st(box(.08, .44, .03), M(C.mid), i * .11, .4, s * .33); st(box(.03, .44, .08), M(C.mid), s * .33, .4, i * .11); }
        st(box(.66, .05, .66), M(C.steel), 0, .7, 0);
        for (const x of [-.2, 0, .2]) { st(cyl(.04, .06, .34, 6), M(0x9fd0ff), x, .9, -.1); st(cyl(.06, .06, .03, 6), M(0x9fd0ff), x, 1.02, -.1); }
        for (const x of [-.24, .24]) st(cyl(.035, .045, .2, 6), M(0xd8e0ea), x, 1.12, .18);
        st(box(.04, .3, .04), M(C.dark), 0, .95, .18); st(box(.56, .04, .05), M(C.dark), 0, 1.05, .18);
        for (let i = -1; i <= 1; i++) st(box(.1, .06, .02), M(i ? C.hazard : C.yellow), i * .12, .3, -.32);
        break;
      }
      if (e.type === 'small_pole') {
        st(cyl(.06, .08, 1.3, 6), M(C.wood), 0, .65, 0);
        st(box(.6, .07, .08), M(C.woodDark), 0, 1.18, 0);
        for (const x of [-.24, .24]) st(cyl(.04, .05, .1, 6), M(0xd8e0ea), x, 1.26, 0);
      } else {
        for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) st(box(.045, 1.62, .045).rotateX(z * .1).rotateZ(-x * .1), M(def.color), x * .14, .8, z * .14);
        for (const y of [.4, .8, 1.2]) st(box(.28 - y * .08, .03, .28 - y * .08), M(def.color), 0, y, 0);
        st(box(.64, .06, .06), M(C.dark), 0, 1.5, 0);
        for (const x of [-.27, .27]) st(cyl(.04, .05, .1, 6), M(0xd8e0ea), x, 1.58, 0);
      }
      break;
    }
    case 'pump': {   // a deck on stilts over the water, intake pipe down, outlet pipe toward the shore (north)
      for (const [x, z] of [[-.34, -.34], [.34, -.34], [-.34, .34], [.34, .34]]) st(box(.07, .5, .07), M(C.dark), x, -.05, z);
      st(box(.86, .08, .86), M(C.mid), 0, .2, 0);
      st(cyl(.11, .11, .55, seg), M(C.steel), .18, -.02, .18);
      st(box(.4, .3, .34), col, -.08, .39, .1);
      st(box(.44, .04, .38), M(C.steel), -.08, .56, .1);
      st(cyl(.11, .11, .5, seg).rotateX(Math.PI / 2), col, 0, .33, -.26);
      st(cyl(.14, .14, .06, seg).rotateX(Math.PI / 2), M(C.steel), 0, .33, -.5);
      P.fly = grp(g, .2, .42, .1);
      dyn(P.fly, cyl(.1, .1, .06, seg).rotateZ(Math.PI / 2), M(C.light));
      dyn(P.fly, box(.07, .18, .04), dark);
      break;
    }
    case 'boiler': {   // brick firebox with a glowing door, a steam drum across the top and a chimney
      st(box(.9, .34, .76), M(C.stone), 0, .17, 0);
      st(box(.94, .05, .8), M(C.stoneDark), 0, .36, 0);
      st(cyl(.3, .3, .9, seg).rotateZ(Math.PI / 2), col, 0, .62, .04);
      for (const x of [-.34, 0, .34]) st(cyl(.32, .32, .05, seg).rotateZ(Math.PI / 2), M(C.rust), x, .62, .04);
      for (const x of [-.47, .47]) st(cyl(.12, .12, .06, seg).rotateZ(Math.PI / 2), M(C.steel), x, .62, .04);
      st(cyl(.07, .09, .7, seg), M(C.stoneDark), .28, 1.05, .28);
      st(cyl(.1, .1, .05, seg), black, .28, 1.4, .28);
      st(box(.36, .22, .06), M(C.stoneDark), 0, .17, -.4);
      P.glow = glowMat(0xff6a1a); dyn(g, box(.26, .12, .03), P.glow, 0, .15, -.44);
      P.smoke = [.28, 1.45, .28];
      break;
    }
    case 'engine': {   // a long cylinder on a bed, piston rod and a big flywheel on the side
      st(box(.94, .16, .96), dark, 0, .08, 0);
      st(cyl(.26, .26, .86, seg).rotateX(Math.PI / 2), col, -.12, .44, 0);
      for (const z of [-.4, 0, .4]) st(cyl(.29, .29, .05, seg).rotateX(Math.PI / 2), M(C.steel), -.12, .44, z);
      st(cyl(.06, .06, .3, seg), M(C.steel), -.12, .78, -.2); st(cyl(.06, .06, .3, seg), M(C.steel), -.12, .78, .2);
      st(box(.08, .3, .5), M(C.mid), .26, .3, 0);
      const fly = grp(g, .36, .46, 0); P.fly = fly;
      dyn(fly, cyl(.34, .34, .07, seg).rotateZ(Math.PI / 2), M(C.light));
      dyn(fly, box(.08, .6, .08), dark); dyn(fly, box(.08, .08, .6), dark);
      P.glow = glowMat(0x7ef6ff); dyn(g, box(.04, .1, .16), P.glow, .31, .3, -.3);
      break;
    }
    case 'solar': {
      for (const [x, z] of [[-.3, 0], [.3, 0]]) st(box(.06, .3, .06), steel, x, .15, z);
      st(box(.96, .05, .96), M(0x1d2f5a), 0, .34, 0, -.25);
      for (let i = -1; i <= 1; i++) {
        st(box(.97, .055, .03).translate(0, 0, i * .3).rotateX(-.25), M(0x5a7ab8), 0, .34, 0);
        st(box(.03, .055, .97).translate(i * .3, 0, 0).rotateX(-.25), M(0x5a7ab8), 0, .34, 0);
      }
      break;
    }
    case 'transmitter': {
      st(box(.96, .16, .96), dark, 0, .08, 0);
      st(cyl(.42, .48, .22, seg), col, 0, .27, 0);
      st(cyl(.05, .07, .7, seg), steel, 0, .72, 0);
      const spin = grp(g, 0, 1.06, 0); P.spin = spin;
      const tilt = grp(spin); tilt.rotation.x = -.55;
      dyn(tilt, new THREE.SphereGeometry(.5, seg, Math.max(3, seg >> 1), 0, Math.PI * 2, 0, .9).rotateX(Math.PI), M(C.light, { side: THREE.DoubleSide }), 0, .45, 0);
      P.glow = glowMat(0x7ef6ff, .3);
      dyn(tilt, new THREE.IcosahedronGeometry(.07, 0), P.glow, 0, .32, 0);
      break;
    }
  }

  // fluid machines show their recipe in alt mode, like assemblers
  if (def.ports && def.kind === 'assembler') {
    P.sprite = new THREE.Sprite(iconSpriteMat(RECIPE[e.recipe] ? recipeIcon(RECIPE[e.recipe]) : 'pipe')); P.sprite.scale.set(.5, .5, 1); P.sprite.position.set(0, 1.25, 0);
    P.sprite.visible = !!e.recipe && S.altMode; P.sprite.renderOrder = 10; P.sprite.layers.set(UI_LAYER); g.add(P.sprite);
  }
  // merge static parts by material, with baked occlusion
  const byMat = new Map();
  for (const [geo, mat] of statics) { if (!byMat.has(mat)) byMat.set(mat, []); byMat.get(mat).push(geo); }
  for (const [mat, geos] of byMat) {
    // mergeGeometries needs all-indexed or all-non-indexed input
    const list = geos.every(x => x.index) ? geos : geos.map(x => x.index ? x.toNonIndexed() : x);
    const merged = bakeAO(list.length === 1 ? list[0] : mergeGeometries(list));
    g.add(new THREE.Mesh(merged, withAO(mat)));
    if (list.length > 1) list.forEach(x => x.dispose());
  }
  g.rotation.y = -e.dir * Math.PI / 2;
  g.position.set(e.x + .5, e.y, e.z + .5);
  g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  g.userData.ent = e;
  e.parts = P;
  return g;
}

// The factory colour as a number, for signs and tags.
export const factoryColorHex = e => parseInt((factoryOf(e.fac ?? 1)?.color || '#7ef6ff').slice(1), 16);

// ---------------------------------------------------------------- vehicles
// Built facing +z like the engineer; the scene turns them to their heading. Engine colour shows on a stripe.
export function makeVehicle(v) {
  const id = v.type, vt = VEHICLES[id], fr = FRAMES[vt.frame], g = new THREE.Group(), P = {}, body = M(fr.color), dark = M(C.dark), steel = M(C.steel);
  const stripe = M(vt.engine ? ENGINES[vt.engine].color : C.mid), glass = M(C.glass, { emissive: 0x1d5a66, emissiveIntensity: .25 }), tire = M(0x22252b);
  const add = (geo, mat, x = 0, y = 0, z = 0, parent = g) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); parent.add(m); return m; };
  const wheels = (xs, zs, r = .1, y = .1) => { for (const x of xs) for (const z of zs) add(cyl(r, r, .07, 8).rotateZ(Math.PI / 2), tire, x, y, z); };
  switch (vt.frame) {
    case 'car':
      add(box(.46, .16, .82), body, 0, .2, 0); add(box(.4, .15, .4), glass, 0, .35, -.06); add(box(.42, .03, .42), body, 0, .44, -.06);
      add(box(.48, .03, .84), stripe, 0, .2, 0); wheels([-.24, .24], [-.26, .27]);
      for (const x of [-.15, .15]) add(box(.08, .05, .02), M(0xfff2b0, { emissive: 0x806a30, emissiveIntensity: .6 }), x, .22, .41);
      break;
    case 'truck':
      add(box(.5, .3, .32), body, 0, .3, .42); add(box(.44, .12, .04), glass, 0, .38, .58);
      add(box(.54, .38, .8), M(C.light), 0, .36, -.18); add(box(.56, .04, .82), stripe, 0, .19, -.18);
      add(box(.5, .06, 1.24), dark, 0, .12, 0); wheels([-.26, .26], [.42, -.1, -.42], .11, .11);
      break;
    case 'tank':
      add(box(.62, .2, .96), body, 0, .2, 0); for (const x of [-.34, .34]) add(box(.14, .18, 1), M(0x2a2c30), x, .13, 0);
      add(box(.64, .03, .98), stripe, 0, .3, 0);
      P.turret = new THREE.Group(); P.turret.position.set(0, .32, -.04); g.add(P.turret);
      add(cyl(.2, .22, .14, 10), body, 0, .07, 0, P.turret); add(cyl(.035, .035, .6, 6).rotateX(Math.PI / 2), dark, 0, .09, .4, P.turret);
      break;
    case 'boat':
      add(box(.6, .22, 1.1), body, 0, .06, -.1); add(new THREE.ConeGeometry(.3, .5, 4).rotateX(Math.PI / 2).rotateZ(Math.PI / 4).scale(1, .6, 1), body, 0, .06, .7);
      add(box(.62, .04, 1.12), stripe, 0, .17, -.1);
      for (const [z, c] of [[.2, 0xd84a3a], [-.12, 0x3a7ad8], [-.42, 0xe0c03a]]) add(box(.44, .18, .26), M(c), 0, .28, z);
      add(box(.4, .28, .2), M(C.light), 0, .32, -.62); add(box(.3, .06, .02), glass, 0, .4, -.51);
      add(cyl(.03, .03, .3, 6), dark, .12, .55, -.66);
      P.net = add(box(.66, .06, .3), M(0xb8a878), 0, .1, -.76); P.net.visible = !!v.net;
      break;
    case 'locomotive':
      add(box(.6, .1, .96), dark, 0, .14, 0); add(box(.54, .38, .62), body, 0, .38, -.12);
      add(box(.54, .32, .3), body, 0, .35, .32); add(box(.5, .12, .02), glass, 0, .46, .47);
      add(box(.58, .05, .66), M(C.dark), 0, .6, -.12); add(box(.56, .04, .98), stripe, 0, .22, 0);
      add(cyl(.05, .06, .14, 6), M(C.black), 0, .62, .1); wheels([-.27, .27], [-.3, 0, .3], .08, .08);
      add(box(.1, .06, .02), M(0xfff2b0, { emissive: 0x806a30, emissiveIntensity: .7 }), 0, .32, .48);
      break;
    case 'cargo_wagon':
      add(box(.6, .08, .94), dark, 0, .14, 0); add(box(.56, .34, .86), body, 0, .37, 0);
      for (const z of [-.3, 0, .3]) add(box(.58, .3, .03), M(C.woodDark), 0, .37, z);
      wheels([-.27, .27], [-.3, .3], .08, .08);
      break;
  }
  g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  g.userData.veh = v.id; g.userData.P = P; g.userData.type = id;
  return g;
}
// A fish: a small body and tail, instanced by the scene.
export function fishGeo() {
  const body = new THREE.SphereGeometry(.09, 6, 4).scale(.55, .45, 1.3).toNonIndexed(), tail = new THREE.ConeGeometry(.06, .1, 3).rotateX(-Math.PI / 2).translate(0, 0, -.15).toNonIndexed();
  return mergeGeometries([body, tail]);
}

export function disposeMesh(root) {
  root.traverse(o => { if (o.isMesh && o.geometry && !Object.values(itemGeoCache).includes(o.geometry)) o.geometry.dispose(); });
}

// ---------------------------------------------------------------- the engineer
// Built facing +z; legs and arms pivot at hip and shoulder.
export function makePlayer(color = 0xe07a2e) {
  const g = new THREE.Group(), P = {};
  const darker = c => ((c >> 16 & 255) * .72 << 16) | ((c >> 8 & 255) * .72 << 8) | (c & 255) * .72;
  const suit = M(color), suitDark = M(darker(color)), dark = M(0x2b2f36), helm = M(0xd8dde4), visor = M(0x7ef6ff, { emissive: 0x2a8a99, emissiveIntensity: .8 });
  const limb = (parent, w, h, d, mat, x, y, z) => { const piv = new THREE.Group(); piv.position.set(x, y, z); parent.add(piv); piv.add(new THREE.Mesh(box(w, h, d).translate(0, -h / 2, 0), mat)); return piv; };
  const body = new THREE.Group(); g.add(body); P.body = body;
  P.legL = limb(g, .12, .34, .14, suitDark, -.085, .36, 0);
  P.legR = limb(g, .12, .34, .14, suitDark, .085, .36, 0);
  for (const leg of [P.legL, P.legR]) leg.add(new THREE.Mesh(box(.14, .08, .18).translate(0, -.32, .02), dark));
  const add = (geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); body.add(m); return m; };
  add(box(.32, .34, .22), suit, 0, .54, 0);
  add(box(.34, .06, .24), dark, 0, .39, 0);
  add(box(.28, .32, .14), M(0x5b5f68), 0, .58, -.17);
  add(box(.06, .06, .02), M(0x9be37a, { emissive: 0x3a8a2a, emissiveIntensity: 1 }), .08, .66, -.245);
  add(new THREE.IcosahedronGeometry(.16, 1).scale(1, .95, 1), helm, 0, .84, 0);
  add(box(.2, .09, .06), visor, 0, .85, .13);
  add(box(.02, .16, .02), dark, .09, 1.02, -.05);
  P.armL = limb(body, .09, .3, .1, suit, -.21, .68, 0);
  P.armR = limb(body, .09, .3, .1, suit, .21, .68, 0);
  for (const a of [P.armL, P.armR]) a.add(new THREE.Mesh(box(.1, .07, .11).translate(0, -.31, 0), dark));
  // tilted down in the fist, so the handle stands up behind the head when raised and reaches forward, point down, on the strike
  const pick = new THREE.Group(); pick.position.set(0, -.3, .02); pick.rotation.x = .9; P.armR.add(pick); P.pick = pick;
  pick.add(new THREE.Mesh(box(.03, .03, .36).translate(0, 0, .18), M(C.wood)));
  // the head crosses the handle in the plane of the swing (not sideways), tapering to a point at each end
  pick.add(new THREE.Mesh(box(.045, .16, .05).translate(0, 0, .34), M(C.light)));
  for (const s of [1, -1]) pick.add(new THREE.Mesh(new THREE.ConeGeometry(.026, .07, 4).rotateX(s > 0 ? 0 : Math.PI).translate(0, s * .115, .34), M(C.light)));
  pick.visible = false;
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  g.userData.P = P; g.userData.color = color;
  return g;
}
export function animatePlayer(g, p, T, dt = .016) {
  const P = g.userData.P, speed = Math.hypot(p.vx || 0, p.vz || 0), walkAmt = Math.min(1, speed / 4);
  const sw = Math.sin(p.walk) * .75 * walkAmt;
  P.legL.rotation.x = sw; P.legR.rotation.x = -sw;
  P.armL.rotation.x = -sw * .8;
  const mining = p.mining && !p.mining.blocked;
  P.pick.visible = !!mining;
  P.armR.rotation.x = mining ? -1.7 + Math.sin(T * 14) * .95 : sw * .8;
  P.body.rotation.x = mining ? .12 + Math.sin(T * 14) * .05 : walkAmt * .1;
  g.position.set(p.x, Math.abs(Math.sin(p.walk)) * .035 * walkAmt, p.z);
  let d = p.face - g.rotation.y; d = Math.atan2(Math.sin(d), Math.cos(d));
  g.rotation.y += d * Math.min(1, dt * 16);
}

// Two-link IK for inserter arms, in the turret's vertical plane (f = forward, u = up).
export function poseInserter(e, ghost) {
  const P = e.parts, r = e.reach, s = .3, L = P.L;
  const t = e.t, k = t * t * (3 - 2 * t);
  P.turret.rotation.y = (1 - k) * Math.PI;
  const hu = .3 + (e.dy || 0) * k + Math.sin(k * Math.PI) * .25;
  const du = hu - s, d = Math.min(Math.max(Math.hypot(r, du), .05), 2 * L - 1e-3);
  const sh = Math.atan2(du, r) + Math.acos(d / (2 * L));
  const ef = L * Math.cos(sh), eu = s + L * Math.sin(sh);
  const a2 = Math.atan2(hu - eu, r - ef), hf = ef + L * Math.cos(a2), hh = eu + L * Math.sin(a2);
  P.seg1.position.set(0, (s + eu) / 2, -ef / 2); P.seg1.rotation.x = sh;
  P.seg2.position.set(0, (eu + hh) / 2, -(ef + hf) / 2); P.seg2.rotation.x = a2;
  P.elbow.position.set(0, eu, -ef);
  P.hand.position.set(0, hh, -hf);
  P.item.visible = !!e.held && !ghost;
  if (e.held) {
    P.item.position.set(0, hh - .2, -hf);
    if (P.item.userData.type !== e.held) { P.item.geometry = itemGeo(e.held); P.item.material = P.item.userData.base = itemMat(e.held); P.item.userData.type = e.held; }
  }
}
