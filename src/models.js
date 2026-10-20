// 3D models. Every machine is made of real parts. Static parts are merged per material and get a
// baked ambient-occlusion gradient; moving parts (arms, drill heads, spools, dishes) stay separate.
// Everything is toon-shaded so the pixel-outline post pass reads cleanly.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { ENTITIES, ITEMS, TIERS, FLUIDS, FRAMES, VEHICLES, ENGINES, RECIPE, CROPS, DITHER, ANIMALS, WEAPONS, recipeIcon } from './data.js';
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

// ---------------------------------------------------------------- stippled see-through (one path for everything)
// Anything see-through is drawn like stained glass in newer pixel games: each pixel is either drawn whole or skipped,
// by a 4×4 ordered (Bayer) pattern scaled to the opacity, never blended. Pixel art stays crisp, and overlapping
// see-through things need no sorting. The pattern is pinned to the world (it steps with the camera's whole pixels, see
// scene.js), so it doesn't crawl while you walk. `dither(m)` patches a material in place: at opacity 1 it draws solid,
// below that it stipples. `ditherClone(m, opacity)` is a stippled copy for ghosts, previews and blueprints.
export const DITHER_OFF = { value: new THREE.Vector2() };
const DITHER_GLSL = `uniform vec2 ditherOff;
float bayer4(vec2 p) {
  vec2 q = mod(floor(p), 4.0);
  int i = int(q.x) + int(q.y) * 4;
  float m = i == 0 ? 0. : i == 1 ? 8. : i == 2 ? 2. : i == 3 ? 10. : i == 4 ? 12. : i == 5 ? 4. : i == 6 ? 14. : i == 7 ? 6.
    : i == 8 ? 3. : i == 9 ? 11. : i == 10 ? 1. : i == 11 ? 9. : i == 12 ? 15. : i == 13 ? 7. : i == 14 ? 13. : 5.;
  return (m + .5) / 16.;
}`;
export function dither(m) {
  if (m.userData.dither) return m;
  m.userData.dither = true;
  const prev = m.onBeforeCompile;
  m.onBeforeCompile = (sh, r) => {
    prev?.call(m, sh, r);
    sh.uniforms.ditherOff = DITHER_OFF;
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\n' + DITHER_GLSL)
      .replace('#include <fog_fragment>', '#include <fog_fragment>\n  if (gl_FragColor.a < bayer4(gl_FragCoord.xy + ditherOff)) discard;\n  gl_FragColor.a = 1.0;');
  };
  m.customProgramCacheKey = () => 'dither' + (m.type || '');
  return m;
}
// A stippled copy: drawn after solid things (so it never hides what is behind it), and never writing depth (so the
// outline pass doesn't trace the gaps in its pattern).
export function ditherClone(m, opacity) {
  const c = m.clone(); c.transparent = true; c.opacity = opacity; c.depthWrite = false; delete c.userData.dither;   // a clone loses the patch: put it back
  return dither(c);
}
// A stippled material that isn't a copy of anything (glass, roofs): solid colour at `opacity`.
export const ditherMat = (opts, opacity) => { const m = new THREE.MeshToonMaterial({ gradientMap: toonRamp, ...opts, transparent: true, opacity, depthWrite: false }); return dither(m); };

const ghostCache = new WeakMap(), bpCache = new WeakMap();
function variant(cache, m, opacity) {
  if (!cache.has(m)) cache.set(m, ditherClone(m, opacity));
  return cache.get(m);
}
// Ghosts (above the working layer) move to render layer 1, which the outline pass ignores.
export function setGhost(root, ghost) {
  root.traverse(o => {
    if (!o.isMesh && !o.isSprite) return;
    if (!o.userData.base) o.userData.base = o.material;
    o.material = ghost ? variant(ghostCache, o.userData.base, DITHER.ghost) : o.userData.base;
    o.castShadow = !ghost && o.isMesh;
    o.layers.set(o.isSprite ? UI_LAYER : ghost || o.userData.overlay ? 1 : 0);   // glass and roofs never get outlines
  });
}
// The placement preview. Normally a plain ghost: the building drawn solid, tinted green where it can go and red where it
// can't. Planning a blueprint (Shift, or a blueprint in hand) it takes the blueprint's stippled look instead, through the
// same shared dither path. `look`: 'ok' | 'bad' | 'bp'.
const TINT = { ok: 0x3aff5a, bad: 0xff3a2a }, tintCache = { ok: new WeakMap(), bad: new WeakMap() };
function tinted(m, look) {
  const cache = tintCache[look];
  if (!cache.has(m)) {
    const c = m.clone();
    if (c.color) c.color = c.color.clone().lerp(new THREE.Color(TINT[look]), .45);   // the shading still shows through
    if (c.emissive) { c.emissive = new THREE.Color(TINT[look]); c.emissiveIntensity = .08; }
    if (m.userData.dither) { delete c.userData.dither; dither(c); }   // glass stays stippled, never blended
    cache.set(m, c);
  }
  return cache.get(m);
}
export function setPreview(root, look = 'ok') {
  if (root.userData.look === look) return;
  root.userData.look = look;
  root.traverse(o => {
    if (!o.isMesh && !o.isSprite) return;
    o.userData.pbase ||= o.material;
    o.material = look === 'bp' ? variant(bpCache, o.userData.pbase, DITHER.blueprint) : o.isSprite ? o.userData.pbase : tinted(o.userData.pbase, look);
    o.castShadow = false; o.receiveShadow = false; o.layers.set(UI_LAYER);
  });
}
// Blueprints: the building, stippled, in the world (layer 1: no outlines, not clickable through the raycast of layer 0).
export function setBlueprint(root) {
  root.traverse(o => { if (o.isMesh) { o.material = variant(bpCache, o.material, DITHER.blueprint); o.castShadow = false; o.receiveShadow = false; o.layers.set(1); } else if (o.isSprite) o.visible = false; });
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
    seed: () => facet(new THREE.DodecahedronGeometry(.07, 0).scale(1.3, .6, 1).translate(0, .04, 0)),
    crop: () => new THREE.CylinderGeometry(.07, .05, .26, 5).rotateZ(Math.PI / 2).translate(0, .07, 0),
    vial: () => new THREE.CylinderGeometry(.06, .07, .2, 6).translate(0, .1, 0),
    pellet: () => facet(new THREE.IcosahedronGeometry(.08, 0).translate(0, .08, 0)),
    cell: () => new THREE.BoxGeometry(.14, .24, .14).translate(0, .12, 0),
    meat: () => new THREE.SphereGeometry(.1, 7, 5).scale(1.3, .6, 1).translate(0, .06, 0),
    egg: () => new THREE.SphereGeometry(.06, 8, 6).scale(1, 1.3, 1).translate(0, .075, 0),
    wool: () => facet(new THREE.IcosahedronGeometry(.11, 0).scale(1.2, .8, 1).translate(0, .08, 0)),
    hide: () => new THREE.BoxGeometry(.28, .03, .22).translate(0, .015, 0),
    feather: () => new THREE.BoxGeometry(.06, .02, .26).rotateY(.5).translate(0, .01, 0),
    chitin: () => new THREE.SphereGeometry(.12, 6, 3, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, .5, 1.2),
    slime: () => new THREE.SphereGeometry(.1, 7, 4, 0, Math.PI * 2, 0, Math.PI / 2).scale(1.2, .45, 1),
    shell: () => facet(new THREE.ConeGeometry(.1, .16, 6).translate(0, .08, 0)),
    powder: () => new THREE.CylinderGeometry(.08, .1, .14, 7).translate(0, .07, 0),
    ammo: () => new THREE.BoxGeometry(.2, .08, .14).translate(0, .04, 0),
    shell_ammo: () => new THREE.BoxGeometry(.2, .09, .14).translate(0, .045, 0),
    gun: () => new THREE.BoxGeometry(.06, .06, .3).translate(0, .03, 0),
  };
  return (itemGeoCache[shape] = (G[shape] || G.ore)());
}
export function itemMat(type) {
  return itemMatCache[type] ||= new THREE.MeshToonMaterial({ color: ITEMS[type]?.color ?? 0x7d8796, emissive: ITEMS[type]?.emissive ?? 0, gradientMap: toonRamp });
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
  // a hidden alt-mode icon over the building; the scene picks what it shows
  const altSprite = y => { const sp = new THREE.Sprite(iconSpriteMat('chest')); sp.scale.set(.42, .42, 1); sp.position.set(0, y, 0); sp.visible = false; sp.renderOrder = 10; sp.layers.set(UI_LAYER); g.add(sp); return sp; };

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
  // Big fluid buildings: a stub with a coloured collar at every tile edge of their pipe sides (w × h tiles as built,
  // facing north). A connection fluid passes straight through gets a double collar.
  const portStubs = (w, h) => {
    for (const [f, sides] of Object.entries(def.pipeSides || {})) for (const l of sides) {
      const [dx, dz] = DIRS[l], along = dx ? h : w, collar = M(FLUIDS[f].color), thru = def.through?.includes(f);
      for (let i = 0; i < along; i++) {
        const o = i - (along - 1) / 2, px = dx ? dx * w / 2 : o, pz = dz ? dz * h / 2 : o;
        const pipe = dx ? cyl(.09, .09, .16, seg).rotateZ(Math.PI / 2) : cyl(.09, .09, .16, seg).rotateX(Math.PI / 2);
        st(pipe, M(C.steel), px - dx * .08, PIPE_Y, pz - dz * .08);
        for (let k = 0; k < (thru ? 2 : 1); k++) {
          const c = dx ? cyl(.12, .12, .035, seg).rotateZ(Math.PI / 2) : cyl(.12, .12, .035, seg).rotateX(Math.PI / 2);
          st(c, collar, px - dx * (.02 + k * .07), PIPE_Y, pz - dz * (.02 + k * .07));
        }
      }
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
      // steel pipe: heavy rings along each arm; irrigation pipe: a blue water band at the joint
      if (def.flow) for (const l of sides) { const [dx, dz] = DIRS[l], ring = dx ? cyl(.125, .125, .04, seg).rotateZ(Math.PI / 2) : cyl(.125, .125, .04, seg).rotateX(Math.PI / 2); st(ring, M(C.dark), dx * .24, PIPE_Y, dz * .24); }
      if (def.irrigation) st(cyl(.145, .145, .05, seg), M(0x3a8ad8), 0, PIPE_Y, 0);
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
    case 'centrifuge': {   // a pressure housing on a plinth with a drum spinning inside
      st(box(.96, .14, .96), dark, 0, .07, 0);
      st(cyl(.36, .4, .62, seg), col, 0, .45, 0);
      st(cyl(.38, .38, .06, seg), M(C.steel), 0, .78, 0);
      P.spin = grp(g, 0, .83, 0);
      dyn(P.spin, cyl(.22, .22, .1, seg), M(C.light)); dyn(P.spin, box(.5, .05, .06), M(C.yellow), 0, .06, 0);
      P.glow = glowMat(0x9be37a, .1); dyn(g, box(.18, .26, .02), P.glow, 0, .45, -.4);
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
      if (e.dy) {   // angled: one tile along, between this layer's floor and the next one up, on legs under its high end
        const dy = e.dy, ang = Math.atan2(dy, 1), len = Math.hypot(1, 1), h = .5, trim = M(0xffffff & (def.color + 0x202020));
        // every piece sits where it would on a flat belt, measured out from the slope's surface along its normal, so the
        // tread lies on top of the base instead of inside it
        const ny = Math.cos(ang), nz = Math.sin(ang), on = (geo, mat, x, off) => st(geo, mat, x, h + off * ny, off * nz, ang);
        const tg = new THREE.PlaneGeometry(.78, len), uv = tg.attributes.uv;
        for (let i = 0; i < uv.count; i++) uv.setY(i, uv.getY(i) * len);   // the chevrons keep their size over the longer run
        on(box(.9, .07, len), dark, 0, .06);
        on(tg.rotateX(-Math.PI / 2), tread, 0, .1);
        for (const x of [-.44, .44]) { on(box(.08, .14, len), col, x, .09); on(box(.1, .03, len), trim, x, .17); }
        const zl = -.3 * dy, top = h - zl * dy, foot = 0;
        for (const x of [-.4, .4]) { st(box(.06, top - foot, .06), steel, x, (top + foot) / 2, zl); st(box(.14, .03, .14), dark, x, foot + .015, zl); }
        st(box(.8, .04, .04), steel, 0, (top + foot) / 2, zl);
        break;
      }
      if (!e.curve) {
        st(box(.9, .07, 1), dark, 0, .06, 0);
        st(new THREE.PlaneGeometry(.78, 1).rotateX(-Math.PI / 2), tread, 0, .1, 0);
        for (const x of [-.44, .44]) {
          st(box(.08, .14, 1), col, x, .09, 0);
          st(box(.1, .03, 1), M(0xffffff & (def.color + 0x202020)), x, .17, 0);
        }
        for (const [x, z] of [[-.4, -.38], [.4, -.38], [-.4, .38], [.4, .38]]) st(box(.06, .04, .06), dark, x, .02, z);
      } else {
        const L = e.curve === 'L', cx = L ? -.5 : .5;
        st(new THREE.CylinderGeometry(.96, .96, .07, seg, 1, false, L ? 0 : Math.PI * 1.5, Math.PI / 2), dark, cx, .06, -.5);
        st(new THREE.RingGeometry(.1, .9, seg, 1, L ? -Math.PI / 2 : Math.PI, Math.PI / 2).rotateX(-Math.PI / 2), tread, cx, .1, -.5);
        st(new THREE.TorusGeometry(.94, .045, 4, seg, Math.PI / 2).rotateX(-Math.PI / 2).rotateY(L ? -Math.PI / 2 : Math.PI), col, cx, .13, -.5);
        st(cyl(.08, .08, .16, 6), col, cx + (L ? .06 : -.06), .08, -.44);
      }
      for (const [f, sx] of [[e.bout?.L, -1], [e.bout?.R, 1]]) {   // outputs: a chute on the side that lane goes out of
        if (!f) continue;
        st(box(.12, .05, .36), M(0xffa53d), sx * .5, .15, 0);
        st(new THREE.ConeGeometry(.07, .14, 4).rotateZ(-sx * Math.PI / 2), M(0xffa53d), sx * .58, .15, 0);
        if (f !== '*') { const sp = new THREE.Sprite(iconSpriteMat(f)); sp.scale.set(.3, .3, 1); sp.position.set(sx * .55, .5, 0); sp.renderOrder = 10; sp.layers.set(UI_LAYER); g.add(sp); }
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
      if (e.foot) {   // big mining drill, 2×2: a deck over all four tiles, a derrick, one wide cutting head, the chute front left
        st(box(1.92, .3, 1.92), col, 0, .15, 0);
        st(box(1.96, .06, 1.96), dark, 0, .33, 0);
        for (let i = -4; i <= 4; i++) st(box(.18, .08, .02), M(i % 2 ? C.yellow : C.hazard), i * .2, .24, -.965);
        st(box(.42, .22, .3), dark, -.5, .22, -.98); st(box(.34, .04, .22), M(C.steel), -.5, .34, -1.05);
        for (const [x, z] of [[-.78, -.78], [.78, -.78], [-.78, .78], [.78, .78]]) st(box(.09, 2, .09), steel, x, 1.33, z);
        for (const y of [1.05, 1.95]) { for (const z of [-.78, .78]) st(box(1.56, .07, .07), steel, 0, y, z); for (const x of [-.78, .78]) st(box(.07, .07, 1.56), steel, x, y, 0); }
        for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2; st(box(.04, 1.2, .04).rotateZ(i % 2 ? .62 : -.62).rotateY(a), steel, -.78 * Math.sin(a), 1.5, -.78 * Math.cos(a)); }
        st(box(.5, .26, .5), M(C.yellow), 0, 2.45, 0); st(cyl(.08, .08, .2, seg), black, 0, 2.66, 0);
        st(box(.62, .42, .5), M(C.mid), .5, .55, .6); st(box(.66, .05, .54), M(C.steel), .5, .78, .6);
        for (let i = 0; i < 3; i++) st(box(.5, .03, .03), dark, .5, .45 + i * .1, .34);
        P.glow = glowMat(0xffa53d, .05); dyn(g, box(.16, .08, .02), P.glow, -.5, .62, .34);   // a work light that pulses while it mines
        const head = grp(g, 0, .36, 0); P.head = head;
        dyn(head, cyl(.62, .66, .12, seg), M(C.light), 0, .06, 0);
        for (let i = 0; i < 6; i++) dyn(head, box(1.18, .06, .1), M(C.yellow), 0, .14, 0).rotation.y = i * Math.PI / 6;
        dyn(head, cyl(.07, .07, 1.7, seg), M(C.steel), 0, .95, 0);
        dyn(head, new THREE.ConeGeometry(.13, .5, Math.max(4, res >> 1)), M(C.yellow), 0, .42, 0);
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
      } else if (def.speed >= 3) {   // steel electric furnace: taller, steel clad, a row of five slits
        st(box(.94, .74, .94), M(C.steel), 0, .37, 0);
        st(box(.98, .08, .98), M(C.light), 0, .78, 0);
        st(box(.5, .14, .5), M(C.dark), 0, .88, 0);
        for (const [x, z] of [[-.44, -.44], [.44, -.44], [-.44, .44], [.44, .44]]) st(box(.12, .8, .12), M(C.mid), x, .4, z);
        st(box(.7, .04, .02), M(C.yellow), 0, .66, -.475);
        P.slits = glowMat(0xffa04a);
        for (const x of [-.28, -.14, 0, .14, .28]) dyn(g, box(.06, .34, .02), P.slits, x, .42, -.475);
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
      P.sprite = altSprite(def.speed >= 3 ? 1.25 : 1.1);   // alt mode: what it is smelting into (scene.js)
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
    case 'station': {   // a workbench with a turntable arm that reaches out to the chests around it
      st(box(.94, .1, .94), dark, 0, .05, 0);
      st(box(.84, .36, .74), col, 0, .28, .06);
      st(box(.9, .06, .8), M(C.wood), 0, .49, .06);
      for (const [x, z] of [[-.4, -.3], [.4, -.3], [-.4, .42], [.4, .42]]) st(box(.07, .46, .07), M(C.woodDark), x, .23, z);
      st(box(.3, .12, .2), M(C.steel), .22, .58, .2); st(cyl(.06, .06, .2, 6).rotateZ(Math.PI / 2), M(C.dark), -.2, .57, .25);
      // the arm: a turret at the bench's front corner, an upper arm and a forearm that stretch to the chest
      P.arm = grp(g, -.3, .54, -.3);
      dyn(P.arm, cyl(.1, .12, .1, seg), dark);
      P.arm1 = dyn(P.arm, box(.06, .06, 1), M(C.yellow)); P.arm2 = dyn(P.arm, box(.05, .05, 1), M(C.light));
      P.hand = grp(P.arm); dyn(P.hand, box(.12, .04, .1), dark);
      P.item = dyn(P.arm, itemGeo('iron_plate'), itemMat('iron_plate')); P.item.visible = false;
      P.sprite = new THREE.Sprite(iconSpriteMat(e.recipe || 'gear')); P.sprite.scale.set(.5, .5, 1); P.sprite.position.set(0, 1.1, 0);
      P.sprite.visible = !!e.recipe && S.altMode; P.sprite.renderOrder = 10; P.sprite.layers.set(UI_LAYER); g.add(P.sprite);
      P.glow = glowMat(0xffd88a, .1); dyn(g, box(.3, .08, .02), P.glow, 0, .3, -.32);
      break;
    }
    case 'lab': {
      st(box(.94, .26, .94), dark, 0, .13, 0);
      for (const [x, z] of [[-.4, -.4], [.4, -.4], [-.4, .4], [.4, .4]]) st(box(.14, .3, .14), col, x, .15, z);
      st(cyl(.42, .44, .08, seg), M(C.steel), 0, .3, 0);
      P.glow = glowMat(0x58c8d8, .2);
      dyn(g, new THREE.IcosahedronGeometry(.16, 0), P.glow, 0, .52, 0);
      dyn(g, new THREE.SphereGeometry(.36, seg, Math.max(3, seg >> 1), 0, Math.PI * 2, 0, Math.PI / 2), ditherMat({ color: C.glass }, DITHER.glass), 0, .33, 0).layers.set(1);
      const ring = grp(g, 0, .52, 0); P.ring = ring;
      dyn(ring, new THREE.TorusGeometry(.42, .03, 4, seg * 2).rotateX(Math.PI / 2), M(C.brass));
      break;
    }
    case 'chest': {
      // Chests have no front: they are drawn unturned. The lid swings open while a belt output feeds the chest, and the
      // goods inside show (an animated texture, drawn by the scene at P.inside).
      const wood = e.type === 'wooden_chest', lidM = M(wood ? C.woodDark : C.mid), h = wood ? .44 : .46, d = wood ? .62 : .66;
      if (wood) {
        st(box(.68, .4, .62), M(C.wood), 0, .2, 0);
        for (const y of [.12, .26]) st(box(.7, .025, .64), M(C.woodDark), 0, y, 0);
        for (const [x, z] of [[-.33, -.3], [.33, -.3], [-.33, .3], [.33, .3]]) st(box(.06, .44, .06), M(C.mid), x, .22, z);
        st(box(.1, .1, .04), M(C.light), 0, .32, -.33);
      } else {
        st(box(.74, .44, .66), M(C.steel), 0, .22, 0);
        for (const y of [.1, .34]) st(box(.78, .05, .7), M(C.mid), 0, y, 0);
        st(box(.12, .12, .04), M(C.yellow), 0, .32, -.36);
      }
      st(box(wood ? .62 : .68, .01, d - .06), M(0x1a1612), 0, h + .005, 0);   // the dark inside, seen with the lid open
      P.lid = grp(g, 0, h, -d / 2 - .02);   // hinged at the north edge, so it opens away from the usual view
      dyn(P.lid, box(wood ? .72 : .78, .07, d + .04), lidM, 0, .035, d / 2 + .02);
      P.inside = [0, h + .012, 0, wood ? .56 : .62, d - .1];   // x, y, z, width, depth of the contents' surface
      P.sprite = altSprite(.95);   // alt mode: its commonest item (scene.js)
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
    case 'pump': if (def.fullRate) {   // high pressure pump: a steel pump house on a heavy deck, two intakes, a pressure gauge, a steel outlet
        for (const [x, z] of [[-.38, -.38], [.38, -.38], [-.38, .38], [.38, .38]]) st(box(.1, .55, .1), M(C.dark), x, -.07, z);
        st(box(.94, .1, .94), M(C.dark), 0, .21, 0);
        for (const x of [-.2, .2]) st(cyl(.1, .1, .6, seg), M(0x5a6a7c), x, -.02, .22);
        st(box(.6, .42, .5), col, 0, .47, .08); st(box(.64, .05, .54), M(0x5a6a7c), 0, .7, .08);
        for (let i = -2; i <= 2; i++) st(box(.03, .3, .52), M(C.mid), i * .1, .47, .08);
        st(cyl(.13, .13, .5, seg).rotateX(Math.PI / 2), M(0x5a6a7c), 0, .36, -.28);
        st(cyl(.17, .17, .07, seg).rotateX(Math.PI / 2), M(C.dark), 0, .36, -.5);
        st(cyl(.08, .08, .03, seg).rotateX(Math.PI / 2), M(0xe8ecf2), .2, .56, -.18);   // gauge
        P.glow = glowMat(0x4aa3ff, .1); dyn(g, box(.3, .05, .02), P.glow, 0, .6, -.175);
        P.fly = grp(g, -.33, .5, .1); dyn(P.fly, cyl(.11, .11, .06, seg).rotateZ(Math.PI / 2), M(C.light)); dyn(P.fly, box(.07, .2, .04), dark);
        break;
      }
      {   // the water pump: a deck on stilts over the water, intake pipe down, outlet pipe toward the shore (north)
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
      if (e.foot) {   // two tiles wide: a long drum, a firebox under each half, water collars at the ends, steam at the back
        st(box(1.92, .34, .8), M(C.stone), 0, .17, 0);
        st(box(1.96, .05, .84), M(C.stoneDark), 0, .36, 0);
        st(cyl(.3, .3, 1.84, seg).rotateZ(Math.PI / 2), col, 0, .62, .02);
        for (const x of [-.8, -.4, 0, .4, .8]) st(cyl(.32, .32, .05, seg).rotateZ(Math.PI / 2), M(C.rust), x, .62, .02);
        st(cyl(.08, .1, .8, seg), M(C.stoneDark), .62, 1.1, .2);
        st(cyl(.11, .11, .05, seg), black, .62, 1.5, .2);
        for (const x of [-.5, .5]) st(box(.38, .22, .06), M(C.stoneDark), x, .17, -.42);
        P.glow = glowMat(0xff6a1a);
        for (const x of [-.5, .5]) dyn(g, box(.28, .12, .03), P.glow, x, .15, -.46);
        portStubs(2, 1);
        P.smoke = [.62, 1.55, .2];
        break;
      }
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
      if (e.foot) {   // 2×2: the cylinder runs front to back, steam collars at both ends, a big flywheel on the right
        st(box(1.94, .18, 1.94), dark, 0, .09, 0);
        st(cyl(.42, .42, 1.7, seg).rotateX(Math.PI / 2), col, -.3, .62, 0);
        for (const z of [-.8, -.4, 0, .4, .8]) st(cyl(.46, .46, .06, seg).rotateX(Math.PI / 2), M(C.steel), -.3, .62, z);
        for (const z of [-.45, .45]) st(cyl(.08, .08, .5, seg), M(C.steel), -.3, 1.12, z);
        st(box(.14, .5, 1.1), M(C.mid), .42, .42, 0);
        st(box(.5, .1, .1), M(C.steel), .2, .9, 0);
        const fly = grp(g, .66, .7, 0); P.fly = fly;
        dyn(fly, cyl(.6, .6, .1, seg).rotateZ(Math.PI / 2), M(C.light));
        dyn(fly, box(.12, 1.1, .12), dark); dyn(fly, box(.12, .12, 1.1), dark);
        P.glow = glowMat(0x7ef6ff); dyn(g, box(.04, .14, .3), P.glow, .5, .38, -.6);
        portStubs(2, 2);
        break;
      }
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
    case 'lamp': {
      if (def.burner) {   // a stone bowl on three legs with a fire in it
        for (let i = 0; i < 3; i++) { const a = i * Math.PI * 2 / 3; st(box(.05, .32, .05).rotateZ(Math.cos(a) * .25).rotateX(-Math.sin(a) * .25), M(C.dark), Math.cos(a) * .2, .16, Math.sin(a) * .2); }
        st(cyl(.24, .16, .14, seg), M(C.stone), 0, .38, 0);
        st(cyl(.25, .25, .03, seg), M(C.stoneDark), 0, .45, 0);
        P.glow = glowMat(0xff8a3a); dyn(g, new THREE.ConeGeometry(.13, .22, 5).translate(0, .11, 0), P.glow, 0, .44, 0);
        break;
      }
      st(box(.3, .06, .3), dark, 0, .03, 0);
      st(cyl(.035, .045, .9, 6), M(C.mid), 0, .48, 0);
      st(box(.2, .05, .2), M(C.dark), 0, .95, 0);
      P.glow = glowMat(def.light?.color ?? 0xfff0d0); dyn(g, box(.16, .1, .16), P.glow, 0, .88, 0);
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
    case 'greenhouse': {   // a room of glass: soil beds, walls with doors on the outside edges, a glass roof seen in depth mode
      const foot = e.foot || [[e.x, e.z]], crop = e.seed ? CROPS[e.seed] : null, has = (x, z) => foot.some(([a, b]) => a === x && b === z);
      const glass = ditherMat({ color: 0xc8f8e0 }, DITHER.glass * .75);
      const frameM = M(0xd8dde4), soil = M(0x4a3424), rim = M(0x7a6a52), sprouts = [];
      for (const [x, z] of foot) {
        const lx = x - e.x, lz = z - e.z;
        st(box(.98, .05, .98), rim, lx, .025, lz); st(box(.86, .07, .86), soil, lx, .06, lz);
        if (crop) for (const [ox, oz] of [[-.22, -.22], [.22, -.22], [-.22, .22], [.22, .22]]) sprouts.push(new THREE.ConeGeometry(.1, .4, 4).translate(lx + ox, .2, lz + oz));
        for (let d = 0; d < 4; d++) {
          const [dx, dz] = DIRS[d];
          if (has(x + dx, z + dz)) continue;
          const door = ((d % 2 === 0 ? x : z) % 5 + 5) % 5 === 2, ex = lx + dx * .48, ez = lz + dz * .48;
          for (const s2 of [-1, 1]) st(box(.05, .95, .05), frameM, ex + (dx ? 0 : s2 * .48), .475, ez + (dz ? 0 : s2 * .48));
          st(box(dx ? .05 : 1, .05, dz ? .05 : 1), frameM, ex, .93, ez);
          if (door) { st(box(dx ? .14 : .56, .025, dz ? .14 : .56), M(0x9a8a6a), ex, .07, ez); st(box(dx ? .06 : .58, .05, dz ? .06 : .58), frameM, ex, .8, ez); continue; }   // an open doorway: a threshold and a lintel
          const pane = dyn(g, box(dx ? .03 : .96, .86, dz ? .03 : .96), glass, ex, .47, ez); pane.userData.overlay = true;
        }
      }
      if (sprouts.length) { P.plants = grp(g); dyn(P.plants, mergeGeometries(sprouts.map(q => q.toNonIndexed())), M(crop.color, crop.glow ? { emissive: crop.glow, emissiveIntensity: .6 } : {})); }
      // the roof: one glass pyramid over a rectangular room, a small one over every tile of any other shape
      const xs = foot.map(f => f[0]), zs = foot.map(f => f[1]), x0 = Math.min(...xs), x1 = Math.max(...xs), z0 = Math.min(...zs), z1 = Math.max(...zs);
      const roofM = ditherMat({ color: 0x6ad88a, side: THREE.DoubleSide }, DITHER.roof);
      P.roof = grp(g); P.roof.visible = false;
      const pyr = (cx, cz, w, d, h) => { const m = dyn(P.roof, new THREE.ConeGeometry(Math.SQRT1_2, 1, 4).rotateY(Math.PI / 4).scale(w, h, d), roofM, cx, .95 + h / 2, cz); m.userData.overlay = true; };
      if (foot.length === (x1 - x0 + 1) * (z1 - z0 + 1)) pyr((x0 + x1) / 2 - e.x, (z0 + z1) / 2 - e.z, x1 - x0 + 1, z1 - z0 + 1, Math.min(1.6, .25 + Math.min(x1 - x0, z1 - z0) * .12));
      else for (const [x, z] of foot) pyr(x - e.x, z - e.z, 1, 1, .3);
      P.glow = glowMat(0x7aff8a, .2);
      for (const [x, z] of foot) if ((x + z) % 3 === 0) dyn(g, box(.5, .03, .06), P.glow, x - e.x, .9, z - e.z);
      break;
    }
    case 'dam': {   // concrete across the water: the deck is painted into the ground (so roads can go on it), the body drops into the water.
      // Every tile is drawn alone and only its outside edges get parapets and gates, so the pieces line up into one wall
      // whatever shape the dam has. Turbine houses stand along it, and the spill under each gate glows while it runs.
      const foot = e.foot || [[e.x, e.z]], has = (x, z) => foot.some(([a, b]) => a === x && b === z), con = M(0x8f8a80), band = M(0x77726a), dk = M(0x5a5650), gate = M(0x6a7a8a);
      P.glow = glowMat(0x7ef6ff, .1);
      for (const [x, z] of foot) {
        const lx = x - e.x, lz = z - e.z;
        st(box(1, .5, 1), con, lx, -.255, lz);
        st(box(1.002, .06, 1.002), band, lx, -.18, lz);   // a darker course of concrete along the waterline
        for (let d = 0; d < 4; d++) {
          const [dx, dz] = DIRS[d];
          if (has(x + dx, z + dz)) continue;
          st(box(dx ? .08 : .96, .12, dz ? .08 : .96), dk, lx + dx * .46, .06, lz + dz * .46);   // parapet
          if ((x * 7 + z * 3 + d) % 2 === 0) {   // a sluice gate in the face, its spill lit while running
            st(box(dx ? .2 : .34, .26, dz ? .2 : .34), gate, lx + dx * .58, -.02, lz + dz * .58);
            st(box(dx ? .06 : .38, .05, dz ? .06 : .38), dk, lx + dx * .58, .13, lz + dz * .58);
            dyn(g, box(dx ? .02 : .2, .12, dz ? .02 : .2), P.glow, lx + dx * .69, -.12, lz + dz * .69);
          }
        }
        if (((x * 13 + z * 7) % 5 + 5) % 5 === 0) {   // a turbine house on the deck
          st(box(.42, .3, .42), M(0xa8a298), lx, .15, lz); st(box(.48, .05, .48), dk, lx, .32, lz);
          st(cyl(.05, .05, .2, 6), M(C.steel), lx + .12, .42, lz + .12);
          dyn(g, box(.12, .06, .02), P.glow, lx, .2, lz - .215);
        }
      }
      break;
    }
    case 'medlab': {   // a clean white bench with a glass dome, a red cross, sample cabinets and a turning double helix inside
      st(box(.94, .3, .94), M(0xe8e4e8), 0, .15, 0);
      st(box(.96, .05, .96), M(C.steel), 0, .32, 0);
      for (const [w, d] of [[.36, .1], [.1, .36]]) st(box(w, .02, d), M(0xd83a3a), 0, .335, -.26);
      for (const x of [-.32, .32]) { st(box(.2, .26, .2), M(0xd8dde4), x, .48, .3); st(box(.16, .05, .02), M(0x9fe8f2, { emissive: 0x1d5a66, emissiveIntensity: .5 }), x, .5, .19); }
      for (let i = 0; i < 4; i++) st(box(.16, .02, .2), M(0xb8c0ca), 0, .08 + i * .06, -.475);   // drawers
      P.glow = glowMat(0x9fe8f2, .4);
      P.ring = grp(g, 0, .38, .08);
      for (let i = 0; i < 8; i++) { const a = i * .8; dyn(P.ring, new THREE.SphereGeometry(.045, 6, 4), P.glow, Math.cos(a) * .12, i * .055, Math.sin(a) * .12); dyn(P.ring, new THREE.SphereGeometry(.04, 6, 4), M(0xd84a8a), -Math.cos(a) * .12, i * .055, -Math.sin(a) * .12); }
      const dome = dyn(g, new THREE.SphereGeometry(.3, seg, Math.max(3, seg >> 1), 0, Math.PI * 2, 0, Math.PI / 2), ditherMat({ color: C.glass }, DITHER.glass), 0, .34, .08);
      dome.userData.overlay = true;
      break;
    }
    case 'reactor': {   // a squat containment drum, glowing core windows, heat pipes at the corners, a warning beacon on top
      const broken = !!e.broken, shell = broken ? M(0x3a3a32) : col;   // broken: a scorched shell, cracked windows
      st(box(.98, .14, .98), dark, 0, .07, 0);
      for (let i = -3; i <= 3; i++) st(box(.12, .04, .02), M(i % 2 ? C.yellow : C.hazard), i * .13, .12, -.495);
      st(cyl(.42, .46, .62, seg), shell, 0, .45, 0);
      for (const y of [.25, .62]) st(cyl(.465, .465, .04, seg), M(broken ? 0x2a2a26 : C.mid), 0, y, 0);
      st(new THREE.SphereGeometry(.42, seg, Math.max(3, seg >> 1), 0, Math.PI * 2, 0, Math.PI / 2).scale(1, .45, 1), M(broken ? 0x4a4a42 : C.light), 0, .76, 0);
      for (const [x, z] of [[-.4, -.4], [.4, -.4], [-.4, .4], [.4, .4]]) st(cyl(.06, .06, .8, seg), M(C.steel), x, .4, z);
      for (const d of [0, 2]) st(cyl(.09, .09, .1, seg).rotateX(Math.PI / 2), M(FLUIDS.steam.color), 0, .22, d ? .5 : -.5);   // steam collars front and back
      for (const d of [1, 3]) st(cyl(.09, .09, .1, seg).rotateZ(Math.PI / 2), M(FLUIDS.water.color), d === 1 ? .5 : -.5, .22, 0);   // water at the sides
      P.glow = glowMat(0x9be37a, .5);
      for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + Math.PI / 4; dyn(g, box(.16, .2, .02), broken ? M(0x16181d) : P.glow, Math.sin(a) * .44, .45, Math.cos(a) * .44).rotation.y = a; }
      P.heat = glowMat(0xff3a1a, 0); dyn(g, cyl(.2, .2, .04, seg), P.heat, 0, .96, 0);
      st(cyl(.04, .05, .14, 6), M(C.dark), 0, 1.03, 0);
      P.beacon = glowMat(0x9be37a, .2); dyn(g, new THREE.SphereGeometry(.06, 6, 4), P.beacon, 0, 1.12, 0);   // green working, amber hot, red flashing critical, dark broken
      P.smoke = [0, 1.05, 0];
      break;
    }
    case 'coolant': {   // a hyperboloid cooling tower that breathes steam while it works; a light shows how it is doing
      const broken = !!e.broken;
      const pts = []; for (let i = 0; i <= 8; i++) { const t = i / 8; pts.push(new THREE.Vector2(.44 - Math.sin(t * Math.PI) * .14 - t * .06, t * 1.4)); }
      st(new THREE.LatheGeometry(pts, seg), M(broken ? 0x6a6a64 : 0xc8ccd0, { side: THREE.DoubleSide }), 0, .02, 0);
      st(box(.98, .06, .98), dark, 0, .03, 0);
      for (const y of [.3, .9]) st(cyl(.36, .36, .03, seg), M(C.mid), 0, y, 0);
      if (broken) for (let i = 0; i < 3; i++) st(box(.03, .5, .03).rotateZ(.4 * (i - 1)), M(0x16181d), Math.sin(i * 2.1) * .37, .7, Math.cos(i * 2.1) * .37);   // cracks
      st(new THREE.TorusGeometry(.33, .025, 4, seg).rotateX(Math.PI / 2), M(C.dark), 0, 1.42, 0);
      P.water = glowMat(0x3a8ad8, .1); dyn(g, cyl(.3, .3, .02, seg), P.water, 0, 1.3, 0);   // the basin up top, bright while it cools
      P.glow = glowMat(0xff6a3a, 0); dyn(g, box(.2, .1, .02), P.glow, 0, .25, -.42);
      P.smoke = [0, 1.45, 0];
      break;
    }
    case 'radar': {   // a lattice mast on a plinth with a dish that turns while it scans, and a light that blinks
      st(box(.94, .14, .94), dark, 0, .07, 0);
      st(box(.5, .3, .5), col, 0, .29, 0); st(box(.54, .04, .54), M(C.steel), 0, .46, 0);
      for (const [x, z] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) st(box(.04, .6, .04).rotateX(z * .12).rotateZ(-x * .12), M(C.mid), x * .12, .76, z * .12);
      st(cyl(.08, .08, .08, seg), M(C.dark), 0, 1.07, 0);
      P.dish = grp(g, 0, 1.12, 0);
      const tilt = grp(P.dish); tilt.rotation.x = -.5;
      dyn(tilt, new THREE.SphereGeometry(.42, seg, Math.max(3, seg >> 1), 0, Math.PI * 2, 0, .75).rotateX(Math.PI / 2).scale(1, .62, 1), M(C.light, { side: THREE.DoubleSide }), 0, .06, -.12);
      dyn(tilt, cyl(.02, .02, .36, 6).rotateX(Math.PI / 2), M(C.dark), 0, .06, .06);
      P.glow = glowMat(0x7ef6ff, .1); dyn(tilt, new THREE.SphereGeometry(.05, 6, 4), P.glow, 0, .06, .24);
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
  if (def.big && e.foot) {   // built facing north around its middle
    const xs = e.foot.map(t => t[0]), zs = e.foot.map(t => t[1]);
    g.rotation.y = -e.dir * Math.PI / 2;
    g.position.set((Math.min(...xs) + Math.max(...xs) + 1) / 2, e.y, (Math.min(...zs) + Math.max(...zs) + 1) / 2);
  } else {
    g.rotation.y = e.foot || def.kind === 'chest' ? 0 : -e.dir * Math.PI / 2;
    g.position.set(e.x + .5, e.y, e.z + .5);
  }
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

// ---------------------------------------------------------------- animals
// Built facing +z like the engineer, from a few boxes per shape (ANIMALS[t].look in data.js): four-legged ('quad', with
// ears, horns, antlers, tails, wool, manes as the look asks), 'bird', 'frog', 'lizard', 'bug', 'moth', 'snail', 'crab'.
// Legs, heads, wings and tails hang on pivots so animateAnimal can walk, graze, lie down, gallop, hop and flap them.
const shade = (c, k) => ((Math.min(255, (c >> 16 & 255) * k) << 16) | (Math.min(255, (c >> 8 & 255) * k) << 8) | Math.min(255, (c & 255) * k)) >>> 0;
export function makeAnimal(type) {
  const A = ANIMALS[type], L = A.look, g = new THREE.Group(), P = { legs: [], wings: [], heads: [] }, root = new THREE.Group(); g.add(root); P.root = root;
  const col = M(L.col), head2 = M(L.head2 ?? L.col), leg2 = M(L.leg2 ?? shade(L.col, .8)), acc = M(L.accent ?? shade(L.col, 1.15)), dark = M(0x1a1614), eye = M(0x101014);
  const glow = L.glow ? new THREE.MeshToonMaterial({ color: L.glow, emissive: L.glow, emissiveIntensity: .9, gradientMap: toonRamp }) : null;
  const add = (parent, geo, mat, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); parent.add(m); return m; };
  const pivot = (parent, x, y, z) => { const p = new THREE.Group(); p.position.set(x, y, z); parent.add(p); return p; };
  const leg = (parent, x, y, z, len, w, mat, ph, foot) => { const p = pivot(parent, x, y, z); add(p, box(w, len, w).translate(0, -len / 2, 0), mat); if (foot) add(p, box(w * 1.05, w * .7, w * 1.15).translate(0, -len + w * .35, w * .05), foot); P.legs.push({ p, ph }); return p; };
  const [bw, bh, bl] = L.body;
  switch (L.shape) {
    case 'quad': {
      const lh = L.leg, lw = L.legW, by = lh + bh / 2;
      const body = pivot(root, 0, by, 0); P.body = body;
      add(body, box(bw, bh, bl), col);
      if (L.spots) for (const [sx, sy, sz, s] of [[1, .1, .15, .14], [-1, -.05, -.18, .12], [1, -.08, -.22, .09], [-1, .12, .2, .1]]) add(body, box(.02, s * .9, s * 1.3), M(L.spots), sx * (bw / 2 + .005), sy * bh, sz * bl);
      if (L.wool) { P.wool = add(body, facet(new THREE.IcosahedronGeometry(.5, 1)).scale(bw * 1.3, bh * 1.35, bl * 1.12), M(L.wool), 0, .02, 0); }
      if (L.shag) { add(body, box(bw * 1.1, bh * .55, bl * .92), M(L.shag), 0, -bh * .42, 0); add(body, box(bw * .7, .05, bl * .4), acc, 0, bh / 2 + .02, -bl * .05); }   // a long skirt of hair, a pale saddle
      if (L.mane) add(body, box(.05, .06, bl * .3), M(L.mane), 0, bh / 2 + .02, bl * .36);
      const legY = lh + .02, lx = bw / 2 - lw / 2 - .01, lz = bl / 2 - lw * .9;
      const foot = L.hoof ? M(L.hoof) : null, front = L.hop ? lh * .8 : lh;
      leg(root, -lx, legY, lz, front, lw, leg2, 0, foot); leg(root, lx, legY, lz, front, lw, leg2, Math.PI, foot);
      leg(root, -lx, legY, -lz, lh, lw * (L.hop ? 1.4 : 1), leg2, Math.PI, foot); leg(root, lx, legY, -lz, lh, lw * (L.hop ? 1.4 : 1), leg2, 0, foot);
      // the neck and head swing on a pivot at the front of the body: down to graze, up to look round
      const heads = L.twoHeads ? [-.1, .1] : [0];
      for (const hx of heads) {
        const hp = pivot(root, hx, by + bh * .3, bl / 2 - .02); P.heads.push(hp);
        if (hx) hp.rotation.y = Math.sign(hx) * .4;   // two heads splay apart
        const [hw, hhh, hl] = L.head, n = L.neck;
        if (n > .02) add(hp, box(hw * .6, n + hhh * .4, hw * .7).translate(0, n / 2, .03), L.mane ? col : head2).rotation.x = .45;
        const hd = pivot(hp, 0, n * .9, Math.max(n * .45, .04) + hl / 2 - .02);
        add(hd, box(hw, hhh, hl), head2);
        for (const s of [-1, 1]) add(hd, box(.022, .022, .022), eye, s * hw / 2, hhh * .18, hl * .18);
        if (L.snout) add(hd, box(hw * .55, hhh * .45, .05), M(L.snout), 0, -hhh * .12, hl / 2 + .02);
        if (L.tusks) for (const s of [-1, 1]) add(hd, new THREE.ConeGeometry(.015, .07, 4).rotateX(-1.1), M(L.tusks), s * hw * .3, -hhh * .2, hl / 2);
        if (L.beard) add(hd, box(.04, .08, .04), acc, 0, -hhh / 2 - .03, hl * .3);
        if (L.ears) for (const s of [-1, 1]) {
          const e = L.ears, ear = add(hd, box(L.wide ? e * .7 : e * .45, e, .025).translate(0, e / 2, 0), head2, s * hw * .32, hhh / 2, -hl * .2);
          ear.rotation.z = L.earUp ? -s * .18 : -s * 1.2;
        }
        if (L.horns === 'short') for (const s of [-1, 1]) add(hd, new THREE.ConeGeometry(.025, .09, 5).rotateZ(-s * .7), M(L.accent ?? 0xd8d0b8), s * hw * .45, hhh / 2 + .02, -hl * .2);
        if (L.horns === 'curl') for (const s of [-1, 1]) add(hd, new THREE.TorusGeometry(.05, .015, 4, 8, Math.PI * 1.3).rotateY(Math.PI / 2), acc, s * hw * .35, hhh / 2 + .02, -hl * .25);
        if (L.horns === 'ox') for (const s of [-1, 1]) add(hd, box(.16, .04, .05).translate(s * .08, 0, 0), acc, s * hw * .2, hhh / 2, -hl * .1).rotation.z = s * .5;
        if (L.antlers) for (const s of [-1, 1]) {
          const ant = pivot(hd, s * hw * .3, hhh / 2, -hl * .2), m = M(L.antlers);
          if (L.palm) { add(ant, box(.18, .03, .12).translate(s * .1, .06, 0), m).rotation.z = s * .4; }
          else { add(ant, box(.035, .2, .035).translate(0, .1, 0), m).rotation.z = -s * .45; add(ant, box(.03, .1, .03).translate(0, .05, 0), m, -s * .07, .12, .03).rotation.x = .7; add(ant, box(.03, .08, .03).translate(0, .04, 0), m, -s * .04, .06, -.02).rotation.x = -.5; }
        }
      }
      const tp = pivot(root, 0, by + bh * .3, -bl / 2); P.tail = tp;
      if (L.tail === 'thin') add(tp, box(.025, .28, .025).translate(0, -.14, 0), col).rotation.x = .15;
      if (L.tail === 'stub') add(tp, box(.05, .05, .06), L.wool ? M(L.wool) : col, 0, 0, -.02);
      if (L.tail === 'puff') add(tp, new THREE.SphereGeometry(.04, 6, 4), acc, 0, 0, -.02);
      if (L.tail === 'curl') add(tp, new THREE.TorusGeometry(.03, .01, 4, 8), col, 0, .02, -.02);
      if (L.tail === 'bushy') { const t = add(tp, box(.07, .07, bl * .7).translate(0, 0, -bl * .35), col); t.rotation.x = .5; add(tp, box(.072, .072, .08), acc, 0, -Math.sin(.5) * bl * .62, -Math.cos(.5) * bl * .62); }
      if (L.tail === 'long') add(tp, box(.06, .4, .05).translate(0, -.2, 0), M(L.mane ?? L.col), 0, 0, -.02).rotation.x = .25;
      P.lie = lh * .9;
      break;
    }
    case 'bird': {
      const lh = L.leg, by = lh + bh / 2, body = pivot(root, 0, by, 0); P.body = body;
      add(body, new THREE.SphereGeometry(.5, 8, 6).scale(bw, bh, bl), col);
      for (const s of [-1, 1]) { const w = pivot(body, s * bw / 2, bh * .15, .02); add(w, box(.02, bh * .7, bl * .7).translate(s * .01, -bh * .2, -bl * .1), M(shade(L.col, .85))); P.wings.push({ p: w, s }); }
      for (const s of [-1, 1]) leg(root, s * bw * .2, lh + .01, 0, lh, .02, leg2, s > 0 ? 0 : Math.PI);
      const hp = pivot(root, 0, by + bh * .2, bl * .35); P.heads.push(hp);
      const n = L.neck; if (n) add(hp, box(.05, n, .05).translate(0, n / 2, 0), L.long ? head2 : col).rotation.x = L.long ? .1 : .3;
      const [hw, hh, hl] = L.head, hd = pivot(hp, 0, n * .95 + hh / 2, n * .3);
      add(hd, box(hw, hh, hl), head2);
      for (const s of [-1, 1]) add(hd, box(.018, .018, .018), eye, s * hw / 2, hh * .15, hl * .15);
      add(hd, L.bill ? box(hw * .7, .025, .08).translate(0, 0, .04) : new THREE.ConeGeometry(.022, L.long ? .2 : .07, 4).rotateX(Math.PI / 2).translate(0, 0, L.long ? .1 : .035), M(L.beak), 0, -hh * .1, hl / 2);
      if (L.comb) add(hd, box(.02, .05, .06), M(L.comb), 0, hh / 2 + .02, 0);
      const tp = pivot(root, 0, by + bh * .1, -bl / 2); P.tail = tp;
      if (L.tail === 'fan') add(tp, box(.12, .14, .03).translate(0, .06, -.02), col).rotation.x = -.5;
      else add(tp, box(.06, .025, L.tail === 'long' ? .2 : .08).translate(0, 0, L.tail === 'long' ? -.1 : -.04), L.glow ? glow : col).rotation.x = -.3;
      P.lie = lh * .85;
      break;
    }
    case 'frog': {
      const body = pivot(root, 0, bh / 2 + .02, 0); P.body = body;
      add(body, new THREE.SphereGeometry(.5, 7, 5).scale(bw, bh * 1.6, bl), col);
      for (const s of [-1, 1]) { add(body, new THREE.SphereGeometry(.024, 6, 4), acc, s * bw * .28, bh * .7, bl * .25); add(body, box(.012, .012, .012), eye, s * bw * .28, bh * .9, bl * .3); }
      for (const s of [-1, 1]) { leg(root, s * bw * .45, .05, -bl * .25, .05, .05, M(shade(L.col, .85)), 0).rotation.z = s * .9; leg(root, s * bw * .35, .05, bl * .3, .05, .03, M(shade(L.col, .85)), 0).rotation.z = s * .5; }
      P.lie = 0; P.hop = true;
      break;
    }
    case 'lizard': {
      const body = pivot(root, 0, .06, 0); P.body = body;
      add(body, box(bw, bh, bl), col); add(body, box(bw * .5, bh * .3, bl * .9), acc, 0, bh / 2, 0);
      const hp = pivot(body, 0, 0, bl / 2); P.heads.push(hp); add(hp, box(bw * .8, bh * .9, .1).translate(0, 0, .05), col);
      for (const s of [-1, 1]) add(hp, box(.014, .014, .014), eye, s * bw * .4, .015, .06);
      const tp = pivot(body, 0, 0, -bl / 2); P.tail = tp; add(tp, new THREE.ConeGeometry(bw * .35, bl * 1.1, 4).rotateX(-Math.PI / 2).translate(0, 0, -bl * .55), col);
      for (const [s, z, ph] of [[-1, .1, 0], [1, .1, Math.PI], [-1, -.1, Math.PI], [1, -.1, 0]]) leg(root, s * bw / 2, .07, z, .07, .025, leg2, ph).rotation.z = s * .9;
      P.lie = 0;
      break;
    }
    case 'bug': {
      const body = pivot(root, 0, .1, 0); P.body = body;
      add(body, new THREE.SphereGeometry(.5, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2).scale(bw, bh * 1.6, bl), col, 0, -.01, 0);
      add(body, box(.012, bh * .8, bl * .9), glow, 0, bh * .35, 0);
      for (const [x, z] of [[-.05, .08], [.05, -.04], [-.04, -.1]]) add(body, box(.04, .01, .05), glow, x, bh * .55, z);
      const hp = pivot(body, 0, 0, bl / 2); P.heads.push(hp); add(hp, box(bw * .45, bh * .6, .07).translate(0, 0, .02), leg2);
      for (const s of [-1, 1]) add(hp, box(.01, .01, .1).translate(0, 0, .05), leg2, s * .03, .02, .04).rotation.y = s * .4;
      for (const z of [-.1, 0, .1]) for (const s of [-1, 1]) leg(root, s * bw * .45, .1, z, .1, .018, leg2, (z * 30 + (s > 0 ? Math.PI : 0))).rotation.z = s * .9;
      P.lie = 0;
      break;
    }
    case 'moth': {
      const body = pivot(root, 0, .45, 0); P.body = body; P.fly = true;
      add(body, box(bw, bh, bl), col); add(body, box(bw * .9, bh * .9, bl * .4), glow, 0, 0, -bl * .25);
      for (const s of [-1, 1]) { const w = pivot(body, s * bw / 2, bh / 2, 0); add(w, box(L.wing, .01, L.wing * .8).translate(s * L.wing / 2, 0, 0), M(shade(L.col, 1.2))); add(w, box(L.wing * .3, .012, L.wing * .3).translate(s * L.wing * .6, 0, 0), glow); P.wings.push({ p: w, s }); }
      for (const s of [-1, 1]) add(body, box(.006, .006, .08).translate(0, 0, .04), col, s * .02, .02, bl / 2).rotation.set(-.5, s * .4, 0);
      P.lie = .38;
      break;
    }
    case 'snail': {
      const body = pivot(root, 0, 0, 0); P.body = body;
      add(body, box(bw, bh, bl).translate(0, bh / 2, 0), col);
      const shell = add(body, new THREE.SphereGeometry(L.shell, 8, 6).scale(.8, 1, 1), M(shade(L.col, .7)), 0, bh + L.shell * .8, -bl * .12);
      add(shell, new THREE.TorusGeometry(L.shell * .55, L.shell * .14, 4, 10).rotateY(Math.PI / 2), glow, L.shell * .78, 0, 0);
      add(shell, new THREE.TorusGeometry(L.shell * .55, L.shell * .14, 4, 10).rotateY(Math.PI / 2), glow, -L.shell * .78, 0, 0);
      const hp = pivot(body, 0, bh, bl / 2 - .03); P.heads.push(hp);
      for (const s of [-1, 1]) { add(hp, box(.01, .08, .01).translate(0, .04, 0), col, s * .025, 0, 0).rotation.z = -s * .25; add(hp, new THREE.SphereGeometry(.013, 5, 3), glow, s * .045, .075, 0); }
      P.lie = 0;
      break;
    }
    case 'crab': {
      const body = pivot(root, 0, .1, 0); P.body = body;
      add(body, new THREE.SphereGeometry(.5, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2).scale(bw, bh * 2, bl), col);
      for (const [x, z, h] of [[0, 0, .12], [-.07, -.03, .08], [.07, .02, .09], [.02, -.06, .07]]) add(body, facet(new THREE.OctahedronGeometry(.03, 0).scale(.8, h / .03 * .5, .8)), glow, x, bh * .8 + h * .25, z);
      for (const s of [-1, 1]) { add(body, box(.012, .03, .012), eye, s * .04, bh * .6, bl * .45); const cl = pivot(body, s * bw * .45, 0, bl * .45); add(cl, box(.06, .05, .08).translate(s * .02, 0, .04), M(shade(L.col, 1.15))); P.wings.push({ p: cl, s, claw: true }); }
      for (const z of [-.06, 0, .06]) for (const s of [-1, 1]) leg(root, s * bw * .45, .1, z, .11, .016, M(shade(L.col, .8)), z * 40 + (s > 0 ? Math.PI : 0)).rotation.z = s * 1.1;
      P.lie = 0; P.sideways = true;
      break;
    }
  }
  root.scale.setScalar(1.2);   // a little bigger than life, so they read next to the engineer
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  g.userData.P = P; g.userData.type = type;
  return g;
}
// Moves an animal's model for its state: legs swing as it walks (a gallop when it flees), the head drops to graze, it
// lies down to rest and sleep, small ones hop, birds flap, moths flutter. `sp` is how fast it is going, tiles a second.
export function animateAnimal(g, an, T, dt, sp, shorn) {
  const P = g.userData.P, A = ANIMALS[an.t], L = A.look, st = an.st, moving = sp > .05, fast = st === 'flee';
  g.userData.ph = (g.userData.ph || an.id) + dt * (moving ? 4 + sp * (L.hop || P.hop ? 1.6 : 2.4) : 0);
  const ph = g.userData.ph, down = st === 'rest' || st === 'sleep';
  const k = 1 - Math.pow(.002, dt), ease = (o, prop, v) => { o[prop] += (v - o[prop]) * k; };
  for (const l of P.legs) {
    const swing = moving ? Math.sin(ph + (L.hop || P.hop ? 0 : l.ph)) * (fast ? .8 : .45) : 0;
    ease(l.p.rotation, 'x', down && P.lie ? (l.p.position.z > 0 ? -1.3 : 1.3) : swing);
    ease(l.p.scale, 'y', down && P.lie ? .4 : 1);   // folded under the body
  }
  // lying down sinks the whole animal; hopping lifts it
  const hopY = (L.hop || P.hop) && moving ? Math.abs(Math.sin(ph)) * (P.hop ? .1 : .12) : 0;
  const bob = moving && !L.hop && !P.hop ? Math.abs(Math.sin(ph)) * (fast ? .03 : .012) : 0;
  P.root.userData.y = (P.root.userData.y ?? 0) + ((down ? -(P.lie || 0) * .9 * P.root.scale.y : 0) - (P.root.userData.y ?? 0)) * k;
  P.root.position.y = P.root.userData.y + hopY + bob + (P.fly ? Math.sin(T * 3 + an.id) * .05 + (down ? 0 : .05) : 0);
  if (P.body) ease(P.body.rotation, 'x', fast && !P.fly ? Math.sin(ph * 2) * .06 : 0);
  for (const h of P.heads) ease(h.rotation, 'x', st === 'graze' ? .95 + Math.sin(T * 5 + an.id) * .08 : st === 'sleep' ? .5 : fast ? -.2 : moving ? .1 : Math.sin(T * .7 + an.id) * .15);
  if (P.tail) P.tail.rotation.y = Math.sin(T * (fast ? 9 : 2.5) + an.id) * (L.tail === 'bushy' || L.tail === 'long' ? .3 : .2);
  for (const w of P.wings) {
    if (w.claw) { w.p.rotation.y = Math.sin(T * 2 + an.id) * .25 * w.s; continue; }
    const flap = P.fly ? (down ? .1 : Math.sin(T * 22 + an.id) * .9) : fast ? Math.sin(T * 30) * .9 : 0;
    w.p.rotation.z = w.s * (P.fly ? flap : -Math.abs(flap));
  }
  if (P.wool) P.wool.visible = !shorn;
  // crabs walk sideways: the body turns across its heading
  g.rotation.y = an.ra + (P.sideways && moving ? Math.PI / 2 : 0);
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
  // the axe: a wedge blade on one side of the handle; the shovel: a flat blade at the end
  const axe = new THREE.Group(); axe.position.copy(pick.position); axe.rotation.x = .9; P.armR.add(axe); P.axe = axe;
  axe.add(new THREE.Mesh(box(.03, .03, .36).translate(0, 0, .18), M(C.wood)));
  axe.add(new THREE.Mesh(box(.02, .12, .1).translate(0, .06, .32), M(C.light)));
  axe.visible = false;
  const shovel = new THREE.Group(); shovel.position.copy(pick.position); shovel.rotation.x = .9; P.armR.add(shovel); P.shovel = shovel;
  shovel.add(new THREE.Mesh(box(.03, .03, .4).translate(0, 0, .2), M(C.wood)));
  shovel.add(new THREE.Mesh(box(.11, .015, .13).translate(0, 0, .44), M(C.steel)));
  shovel.visible = false;
  // a gun held out at arm's length: built pointing along +z, turned to point down the arm (forward, once it is raised)
  P.gun = new THREE.Group(); P.gun.position.set(0, -.3, .02); P.gun.rotation.x = Math.PI / 2; P.armR.add(P.gun);
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  g.userData.P = P; g.userData.color = color;
  return g;
}
// Guns as the engineer holds them, pointing along +z from the grip (WEAPONS in data.js).
function gunModel(id) {
  const g = new THREE.Group(), metal = M(0x34383f), hi = M(0x8a929c), wood = M(C.wood), olive = M(0x4a5040);
  const add = (w, h, d, mat, x, y, z) => { const m = new THREE.Mesh(box(w, h, d), mat); m.position.set(x, y, z); g.add(m); };
  switch (id) {
    case 'pistol': add(.035, .05, .17, metal, 0, .03, .06); add(.03, .08, .04, metal, 0, -.02, -.01); add(.036, .012, .17, hi, 0, .058, .06); break;
    case 'shotgun': add(.035, .035, .52, metal, 0, .03, .2); add(.045, .045, .12, wood, 0, -.005, .22); add(.045, .07, .2, wood, 0, -.01, -.1); break;
    case 'rifle': add(.028, .028, .5, metal, 0, .04, .24); add(.045, .06, .42, wood, 0, .005, 0); add(.03, .03, .14, metal, 0, .08, .06); add(.01, .03, .02, hi, .025, .04, .02); break;
    case 'smg': add(.04, .07, .26, metal, 0, .02, .07); add(.02, .02, .1, metal, 0, .04, .24); add(.026, .11, .045, metal, 0, -.07, .1); add(.03, .08, .04, metal, 0, -.03, -.02); break;
    default: add(.04, .07, .38, olive, 0, .02, .08); add(.022, .022, .16, metal, 0, .04, .33); add(.028, .12, .05, metal, 0, -.08, .12); add(.04, .06, .14, olive, 0, 0, -.16); add(.03, .03, .1, metal, 0, .075, .1);
  }
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  return g;
}
export function animatePlayer(g, p, T, dt = .016) {
  const P = g.userData.P, speed = Math.hypot(p.vx || 0, p.vz || 0), walkAmt = Math.min(1, speed / 4);
  const sw = Math.sin(p.walk) * .75 * walkAmt;
  P.legL.rotation.x = sw; P.legR.rotation.x = -sw;
  P.armL.rotation.x = -sw * .8;
  const mining = p.mining && !p.mining.blocked;
  const tool = mining ? p.mining.tool || 'pickaxe' : null;
  P.pick.visible = tool === 'pickaxe'; P.axe.visible = tool === 'axe'; P.shovel.visible = tool === 'shovel';
  // a gun in hand: held out to the front (both hands on a long gun), kicking back a little as it fires
  const gun = !mining && !p.veh && WEAPONS[p.sel] ? p.sel : null;
  if (P.gun.userData.type !== gun) { P.gun.clear(); if (gun) P.gun.add(gunModel(gun)); P.gun.userData.type = gun; }
  if (gun) {
    const kick = Math.max(0, .1 - (T - ((p.aimT ?? -9) - .6))) * 3, long = gun !== 'pistol';
    P.armR.rotation.x = -1.5 - kick; P.armR.rotation.z = 0;
    P.armL.rotation.x = long ? -1.3 - kick : -sw * .8; P.armL.rotation.z = long ? -.45 : 0;
  } else P.armL.rotation.z = 0;
  if (!gun) P.armR.rotation.x = mining ? -1.7 + Math.sin(T * 14) * .95 : sw * .8;
  P.body.rotation.x = mining ? .12 + Math.sin(T * 14) * .05 : walkAmt * .1;
  g.position.set(p.x, (p.h || 0) + Math.abs(Math.sin(p.walk)) * .035 * walkAmt, p.z);
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

// The crafting station's arm: it swings toward the chest it is fetching from and stretches out to it, then comes home
// with the item. Worked out in the bench's own frame (it is built facing north and turned with the building).
export function poseStation(e, ghost) {
  const P = e.parts, A = e.arm; if (!P?.arm) return;
  let lx = .3, lz = .3, k = 0;   // at rest it folds over the bench
  if (A?.at && (A.t > 0 || A.it)) {
    const wx = A.at[0] + .5 - (e.x + .5), wz = A.at[2] + .5 - (e.z + .5), th = e.dir * Math.PI / 2;
    lx = wx * Math.cos(th) + wz * Math.sin(th) + .3; lz = -wx * Math.sin(th) + wz * Math.cos(th) + .3;   // from the turret
    k = A.t < .5 ? A.t * 2 : 2 - A.t * 2;
  }
  const len = Math.max(.25, Math.hypot(lx, lz) * (k || .45));
  P.arm.rotation.y = Math.atan2(-lx, -lz);
  P.arm1.scale.z = len * .55; P.arm1.position.set(0, .12, -len * .275);
  P.arm2.scale.z = len * .5; P.arm2.position.set(0, .1, -len * .75);
  P.hand.position.set(0, .06, -len);
  P.item.visible = !!(A?.it && A.got && !ghost);
  if (P.item.visible) {
    P.item.position.set(0, -.02, -len);
    if (P.item.userData.type !== A.it) { P.item.geometry = itemGeo(A.it); P.item.material = P.item.userData.base = itemMat(A.it); P.item.userData.type = A.it; }
  }
}
