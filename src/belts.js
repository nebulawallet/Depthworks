// Belts. Conveyors carry items in lanes: two on ordinary belts, three on bus belts, all moving the same way.
//
// Belts are simulated as *lines*, not tiles. A run of tiles whose only job is to move items forward (straight belts,
// curves, underground pairs, lifts) is one line: its items live on the line, per lane, by their distance from the
// line's start, so a tick moves a lane in one pass and no tile is looked at. Anything that puts items on a line
// part-way along (a belt side-loading, an inserter, a drill) just inserts at its spot. A line ends where something
// has to decide what happens to the items: a splitter, a bus tile with output channels, a change of speed or lanes,
// a side-load into another line, another factory, or nothing at all. That end is the line's node (`out`).
//
// Lines are rebuilt from the tiles whenever belts are placed, removed, rotated or reconfigured (world.beltDirty):
// items go back onto their tiles, the tiles regroup into lines, and the items go onto the new lines. Saves and co-op
// keep items per tile, so they never see lines at all.
import { ENTITIES, ITEMS, AUGMENTS, AUG_RULES } from './data.js';
import { S, world, key, DIRS, bus, spill, invGive, invGet, invAdd, notify } from './state.js';
import { sameFac } from './fluids.js';
import { canAccept, insert } from './sim.js';

export const SPACING = .25;
const EPS = 1e-6;
let nextLineId = 1, ver = 0;   // ver changes whenever any item moves, so cached per-tile lists know when to refresh
export const isBeltLike = e => !!(e && e.belt);
export const lanesOf = e => ENTITIES[e.type]?.lanes ?? 2;
export const laneName = (n, i) => n === 3 ? ['left', 'middle', 'right'][i] : i ? 'right' : 'left';
// How far each lane sits sideways from the belt's centre line (negative: left of the way items move).
export const laneOffset = (n, i) => n === 3 ? (i - 1) * .27 : i ? .2 : -.2;
const isBusTile = b => b.kind === 'belt' && lanesOf(b) === 3;
export const isBusNode = b => isBusTile(b) && !!(b.chL || b.chR || b.midOff || b.sort);

// ---------------------------------------------------------------- tiles and how they connect
export function pickPoint(b) { return b.kind === 'underground' ? (b.role === 'in' ? .25 : b.len - .25) : b.len / 2; }
export function visibleOnBelt(b, p) { return b.kind !== 'underground' || (b.role === 'in' ? p < .5 : p > b.len - .5); }
export function primaryNext(b) {
  const [dx, dz] = DIRS[b.dir];
  if (b.kind === 'underground' && b.role === 'in') return b.pair;
  if (b.kind === 'lift') return world.ents.get(key(b.x + dx, b.y + b.dy, b.z + dz));
  return world.ents.get(key(b.x + dx, b.y, b.z + dz));
}
const neighbour = (b, d) => world.ents.get(key(b.x + DIRS[d][0], b.y, b.z + DIRS[d][1]));
export const splitOuts = b => [b.dir, (b.dir + 3) % 4, (b.dir + 1) % 4];   // front, left, right
// Where an item moving in `moveDir` lands on belt t: 0 from behind (or into a curve), a spot along it for a
// side-load, -1 refused. Bus belts only take items from behind.
export function entryFor(t, moveDir, from) {
  if (!isBeltLike(t) || (from && !sameFac(from, t))) return -1;
  if (t.kind === 'underground' && t.role === 'out') return from && from === t.pair ? 0 : -1;
  const rel = (moveDir - t.dir + 4) % 4;
  if (rel === 2) return -1;
  if (rel === 0) return 0;
  if (t.kind === 'lift' || t.kind === 'splitter') return -1;
  if (t.kind === 'belt' && ((rel === 1 && t.curve === 'L') || (rel === 3 && t.curve === 'R'))) return 0;
  if (lanesOf(t) === 3) return -1;
  return t.kind === 'underground' ? .25 : t.len / 2;
}
function outputsInto(n, b) {
  if (!isBeltLike(n) || !sameFac(n, b)) return false;
  if (n.kind === 'splitter') return splitOuts(n).some(d => neighbour(n, d) === b);
  if (isBusNode(n) && ((n.chL && neighbour(n, (n.dir + 3) % 4) === b) || (n.chR && neighbour(n, (n.dir + 1) % 4) === b))) return true;
  return primaryNext(n) === b;
}
function computeCurve(b) {
  const [dx, dz] = DIRS[b.dir];
  if (outputsInto(world.ents.get(key(b.x - dx, b.y, b.z - dz)), b)) return null;
  for (const ldy of [1, -1]) { const n = world.ents.get(key(b.x - dx, b.y - ldy, b.z - dz)); if (n && n.kind === 'lift' && n.dy === ldy && n.dir === b.dir && sameFac(n, b)) return null; }
  const side = d => outputsInto(neighbour(b, d), b);
  const L = side((b.dir + 3) % 4), R = side((b.dir + 1) % 4);
  return L && !R ? 'L' : R && !L ? 'R' : null;
}
// The tile b hands its items to when that tile is just more of the same line.
function continuation(b) {
  if (b.kind === 'splitter' || isBusNode(b)) return null;
  const t = primaryNext(b);
  if (!isBeltLike(t) || t.kind === 'splitter' || t.speed !== b.speed || lanesOf(t) !== lanesOf(b) || entryFor(t, b.dir, b) !== 0) return null;
  return t;
}
// Lanes keep their side between belts. A two-lane belt feeding a bus fills its outer lanes; a bus feeding a two-lane
// belt sends its outer lanes to the two lanes, and its middle lane (-1) only into a side its outer lane leaves empty.
const laneMap = (nIn, nOut) => nIn === nOut ? (nIn === 3 ? [0, 1, 2] : [0, 1]) : nIn === 2 ? [0, 2] : [0, -1, 1];
function target(from, moveDir, t) {
  if (!isBeltLike(t)) return null;
  const q = entryFor(t, moveDir, from); if (q < 0) return null;
  if (q === 0) return { line: t.line, at: t.off, map: laneMap(lanesOf(from), lanesOf(t)), seg: t };
  const rel = (moveDir - t.dir + 4) % 4;   // a side-load fills the lane on the side it comes in from
  return { line: t.line, at: t.off + q, side: rel === 1 ? 0 : lanesOf(t) - 1, seg: t };
}
// A bus channel feeds whatever its side faces: a belt (as a side-load or from behind) or a building that takes items.
function channelTarget(b, d) {
  const n = neighbour(b, d);
  if (!n || !sameFac(b, n)) return null;
  if (isBeltLike(n)) return target(b, d, n);
  return ['inserter', 'pole', 'frame', 'rail', 'pipe', 'upipe', 'fpump', 'valve', 'tank'].includes(n.kind) ? null : { ent: n };
}

// ---------------------------------------------------------------- building lines
const newCfg = () => ({ name: '', filter: [] });
export function rebuildBelts() {
  for (const ln of world.lines) unpackLine(ln);
  const belts = [];
  for (const e of world.ents.values()) if (isBeltLike(e)) { belts.push(e); e.buf ||= []; e.line = null; }
  for (const b of belts) if (b.kind === 'underground' && b.role === 'in') {
    b.len = b.pair ? Math.max(1, Math.abs(b.pair.x - b.x) + Math.abs(b.pair.z - b.z)) : 1;
    b.buf = b.buf.filter(it => { if (it[1] <= b.len + EPS) return true; spill(it[0], b.x + .5, b.z + .5); return false; });
  }
  for (const b of belts) if (b.kind === 'belt') { const c = computeCurve(b); if (c !== b.curve) { b.curve = c; bus.emit('remesh', b); } }
  const succ = new Map(), pred = new Map();
  for (const b of belts) { const t = continuation(b); if (t && !pred.has(t)) { succ.set(b, t); pred.set(t, b); } }
  const seen = new Set(), groups = [];
  const chain = head => { const segs = []; for (let b = head; b && !seen.has(b); b = succ.get(b)) { seen.add(b); segs.push(b); } return segs; };
  for (const b of belts) if (!pred.has(b)) groups.push(chain(b));
  // loops have no start: begin at the same tile on every machine, so friends agree on where the settings live
  for (const b of belts.filter(b => !seen.has(b)).sort((a, b) => a.y - b.y || a.z - b.z || a.x - b.x)) if (!seen.has(b)) groups.push(chain(b));
  const claimed = new Set(), lines = groups.map(segs => makeLine(segs, claimed));
  for (const ln of lines) ln.out = endNode(ln);
  // downstream first, so items hand on without a tick's delay
  const order = [], vis = new Set();
  const visit = ln => { if (vis.has(ln)) return; vis.add(ln); for (const t of outTargets(ln)) if (t.line) visit(t.line); order.push(ln); };
  lines.forEach(visit);
  world.lines = order; world.beltDirty = false; world.beltRepack = false;
  world.beltVersion = (world.beltVersion || 0) + 1;
  buildTaps(belts);
  bus.emit('belts');
}

// ---------------------------------------------------------------- outputs (taps)
// Any two-lane belt tile can push the lane nearest one of its sides out into whatever stands on that side: a chest, a
// machine, another belt (as a side-load). `bout` on the tile: { L, R }, each null (off), '*' (anything) or an item.
// A tap takes items off its lane where they pass the tile, as fast as the lane brings them, and never splits the line:
// it works like an inserter reaching into the belt, so the line stays one line. Chests fed this way show open.
export const tapsOf = b => b.bout && (b.bout.L || b.bout.R);
const OUT_SIDES = [['L', 0, 3], ['R', 1, 1]];   // [setting, lane, side relative to the belt's direction]
function buildTaps(belts) {
  for (const c of world.tapChests || []) c.tapFed = false;
  const taps = [], chests = [];
  for (const b of belts) {
    if (!tapsOf(b) || b.kind !== 'belt' || lanesOf(b) !== 2) continue;
    for (const [k, li, rel] of OUT_SIDES) {
      const f = b.bout[k]; if (!f) continue;
      const d = (b.dir + rel) % 4, n = neighbour(b, d);
      let t = null;
      if (n && sameFac(b, n)) t = isBeltLike(n) ? target(b, d, n) : TAP_NOT.has(n.kind) ? null : { ent: n };
      taps.push({ b, li, f, d, t, cd: 0, side: k });
      if (t?.ent?.kind === 'chest') { t.ent.tapFed = true; chests.push(t.ent); }
    }
  }
  world.taps = taps; world.tapChests = chests;
}
const TAP_NOT = new Set(['inserter', 'pole', 'frame', 'rail', 'pipe', 'upipe', 'fpump', 'valve', 'tank']);
// A building going up or coming down beside a tap changes where it pushes to.
const nearTap = e => (world.taps || []).some(T => { const [dx, dz] = DIRS[T.d]; return T.b.y === e.y && (e.foot || [[e.x, e.z]]).some(([x, z]) => x === T.b.x + dx && z === T.b.z + dz); });
for (const ev of ['placed', 'removed']) bus.on(ev, e => { if (e.kind !== 'frame' && nearTap(e)) world.beltDirty = true; });
function tapsTick(dt) {
  for (const T of world.taps || []) {
    if ((T.cd -= dt) > 0 || !T.t) continue;
    const b = T.b, ln = b.line; if (!ln?.packed) continue;
    const a = ln.L[T.li].items, hi = b.line.segs[b.line.segs.length - 1] === b ? Infinity : b.off + b.len;
    for (let i = firstBelow(a, hi); i < a.length && a[i].x >= b.off - EPS; i++) {
      const type = a[i].type;
      if (T.f !== '*' && T.f !== type) continue;
      if (T.t.ent ? !canAccept(T.t.ent, type) : !T.t.line?.packed || !lineAccepts(T.t.line, type)) break;
      if (T.t.ent) { removeIndex(ln, T.li, i); insert(T.t.ent, type); tint(T.t.ent, type); }
      else if (toTarget(T.t, ln, T.li, type, 0)) removeIndex(ln, T.li, i);
      else break;
      T.cd = SPACING / ln.speed;   // one lane's worth of throughput, no more
      break;
    }
  }
}
// The colour of what a tapped chest has been fed lately, for its open lid: blended toward each new item, so a chest fed
// one ore turns that colour and a mixed feed settles between them. Item colours are worked out once.
const ITEM_RGB = {};
for (const [id, it] of Object.entries(ITEMS)) ITEM_RGB[id] = [(it.color >> 16 & 255) / 255, (it.color >> 8 & 255) / 255, (it.color & 255) / 255];
function tint(e, type) {
  if (e.kind !== 'chest') return;
  const c = ITEM_RGB[type], t = e.tint ||= [c[0], c[1], c[2]];
  for (let i = 0; i < 3; i++) t[i] += (c[i] - t[i]) * .2;
  e.fedT = S.T;
}
function makeLine(segs, claimed) {
  const first = segs[0], n = lanesOf(first);
  const ln = { id: nextLineId++, segs, len: 0, base: first.speed, speed: first.speed, n, L: Array.from({ length: n }, () => ({ items: [], mi: 0 })),
    out: null, cfg: null, fac: first.fac, act: -99, warnT: -99, packed: false, alt: 0, moved: 0 };
  let off = 0;
  for (const s of segs) { s.line = ln; s.off = off; off += s.len; }
  ln.len = off;
  // settings live on the line: a merged line keeps the upstream one's, and each half of a split keeps a copy
  let cfg = segs.find(s => s.lcfg)?.lcfg || newCfg();
  if (claimed.has(cfg)) cfg = { ...cfg, filter: [...cfg.filter] };
  claimed.add(cfg); ln.cfg = cfg;
  for (const s of segs) s.lcfg = cfg;
  lineSpeed(ln);
  packLine(ln);
  return ln;
}
// Speed augments on a line add up, up to the line's slot count. They sit on whichever tiles hold them.
export function lineAugs(ln) { return ln.segs.flatMap(s => (s.aug || []).filter(Boolean)); }
function lineSpeed(ln) {
  const bonus = lineAugs(ln).slice(0, AUG_RULES.lineSlots).reduce((t, it) => t + (AUGMENTS[ITEMS[it].aug]?.tiers[ITEMS[it].tier - 1] || 0), 0);
  ln.speed = ln.base * (1 + bonus);
}
function endNode(ln) {
  const b = ln.segs[ln.segs.length - 1];
  if (b.kind === 'splitter') return { kind: 'split', b, outs: splitOuts(b).map(d => target(b, d, neighbour(b, d))), rr: [0, 0, 0, 0, 0, 0] };
  const fwd = target(b, b.dir, primaryNext(b));
  if (isBusNode(b)) return { kind: 'bus', b, fwd, ch: [b.chL ? { f: b.chL, t: channelTarget(b, (b.dir + 3) % 4) } : null, null, b.chR ? { f: b.chR, t: channelTarget(b, (b.dir + 1) % 4) } : null] };
  return fwd ? { kind: 'fwd', fwd } : null;
}
export const outTargets = ln => { const o = ln.out; return !o ? [] : (o.kind === 'split' ? o.outs : o.kind === 'bus' ? [o.fwd, o.ch[0]?.t, o.ch[2]?.t] : [o.fwd]).filter(Boolean); };

// Items between rebuilds: a tile's own list of [type, p, lane] (p along the tile).
function packLine(ln) {
  for (const s of ln.segs) {
    for (const [type, p, lane] of s.buf || []) {
      if (!ITEMS[type]) continue;
      ln.L[Math.max(0, Math.min(ln.n - 1, lane ?? 1))].items.push({ type, x: s.off + Math.max(0, Math.min(s.len, p)) });
    }
    s.buf = null;
  }
  for (const L of ln.L) { L.items.sort((a, b) => b.x - a.x); L.mi = 0; }
  ln.packed = true; ver++;
}
function unpackLine(ln) {
  if (!ln.packed) return;
  for (const s of ln.segs) s.buf ||= [];
  ln.L.forEach((L, li) => {
    let j = ln.segs.length - 1;
    for (const it of L.items) { while (j > 0 && it.x < ln.segs[j].off) j--; const s = ln.segs[j]; s.buf.push([it.type, it.x - s.off, li]); }
    L.items.length = 0;
  });
  ln.packed = false; ver++;
}
// A guest gets items per tile from the host: the tile's line comes apart until the next tick puts it back together.
export function setSegItems(b, list) {
  if (b.line?.packed) unpackLine(b.line);
  b.buf = (list || []).map(([type, p, lane]) => [type, p, lane ?? 1]);
  world.beltRepack = true;
}
function repackLines() { for (const ln of world.lines) if (!ln.packed) packLine(ln); world.beltRepack = false; }

// ---------------------------------------------------------------- items on a line
// Each lane keeps its items front first (largest x first).
const firstBelow = (a, x) => { let lo = 0, hi = a.length; while (lo < hi) { const m = (lo + hi) >> 1; if (a[m].x >= x) lo = m + 1; else hi = m; } return lo; };
const segEnd = b => b.line.segs[b.line.segs.length - 1] === b ? Infinity : b.off + b.len;
export const lineAccepts = (ln, type) => !ln.cfg.filter.length || ln.cfg.filter.includes(type);
// Put an item on a lane at x, if it keeps its distance from the items around it.
export function putAt(ln, lane, type, x) {
  const L = ln.L[lane], a = L.items;
  x = Math.max(0, Math.min(ln.len, x));
  const i = firstBelow(a, x + EPS);
  if (i > 0 && a[i - 1].x - x < SPACING - EPS) return false;
  if (i < a.length && x - a[i].x < SPACING - EPS) return false;
  a.splice(i, 0, { type, x });
  if (i < L.mi) L.mi = i;
  ln.act = S.T; ver++;
  return true;
}
function removeIndex(ln, li, i) {
  const L = ln.L[li], [it] = L.items.splice(i, 1);
  if (i < L.mi) L.mi = i;
  ln.act = S.T; ver++;
  return it;
}
// The items on one tile, as [type, p, lane]: for saves, co-op, panels and refunds.
export function segItems(b) {
  const ln = b.line;
  if (!ln || !ln.packed) return b.buf || [];
  if (ln.cv !== ver) {
    const m = new Map(ln.segs.map(s => [s, []]));
    ln.L.forEach((L, li) => { let j = ln.segs.length - 1; for (const it of L.items) { while (j > 0 && it.x < ln.segs[j].off) j--; m.get(ln.segs[j]).push([it.type, it.x - ln.segs[j].off, li]); } });
    ln.cache = m; ln.cv = ver;
  }
  return ln.cache.get(b) || [];
}
// Take everything off one tile (picking up its items, or removing it).
export function clearSeg(b) {
  const out = [];
  if (!b.line?.packed) { for (const it of b.buf || []) out.push(it[0]); b.buf = []; return out; }
  const ln = b.line, hi = segEnd(b);
  ln.L.forEach((L, li) => { for (let i = firstBelow(L.items, hi); i < L.items.length && L.items[i].x >= b.off - EPS;) out.push(removeIndex(ln, li, i).type); });
  return out;
}
// An inserter or the engineer takes the item nearest the middle of the tile (only near the ends of an underground).
export function takeFromBelt(b, ok) {
  const ln = b.line; if (!ln?.packed) return null;
  const mid = b.off + pickPoint(b), hi = segEnd(b);
  let bd = 9, bl = -1, bi = -1;
  for (let li = 0; li < ln.n; li++) {
    const a = ln.L[li].items;
    for (let i = firstBelow(a, hi); i < a.length && a[i].x >= b.off - EPS; i++) {
      const d = Math.abs(a[i].x - mid);
      if (d < bd && ok(a[i].type) && visibleOnBelt(b, a[i].x - b.off)) { bd = d; bl = li; bi = i; }
    }
  }
  return bl < 0 ? null : removeIndex(ln, bl, bi).type;
}
// Drop an item onto a tile. Inserters put it on the far lane, drills on the near lane (the side it comes in from),
// both on the right lane when they face along the belt. By hand (no direction) it goes wherever there is room.
// Bus belts only take items from the belt behind them.
export function dropOnBelt(b, type, moveDir = null, far = true) {
  if (lanesOf(b) === 3) return false;
  let lane = 1;
  if (moveDir !== null) { const rel = (moveDir - b.dir + 4) % 4; if (rel === 1) lane = far ? 1 : 0; else if (rel === 3) lane = far ? 0 : 1; }
  const ln = b.line, q = pickPoint(b);
  if (!ln?.packed) {   // placed this frame, before its line exists
    b.buf ||= [];
    if (b.buf.some(it => it[2] === lane && Math.abs(it[1] - q) < SPACING)) return false;
    b.buf.push([type, q, lane]); return true;
  }
  if (!lineAccepts(ln, type)) return false;
  return putAt(ln, lane, type, b.off + q) || (moveDir === null && putAt(ln, 1 - lane, type, b.off + q));
}
// Would this tile take the item at all (an inserter only picks up what its target wants)?
export const beltWants = (b, type) => lanesOf(b) !== 3 && (!b.line || lineAccepts(b.line, type));

// ---------------------------------------------------------------- moving
export function beltsTick(dt) {
  if (world.beltDirty) rebuildBelts(); else if (world.beltRepack) repackLines();
  ver++;
  for (const ln of world.lines) {
    if (!ln.packed) continue;
    const s = ln.speed * dt;
    let moved = false;
    for (let li = 0; li < ln.n; li++) if (laneTick(ln, li, s)) moved = true;
    if (moved) ln.act = S.T;
  }
  tapsTick(dt);
}
function laneTick(ln, li, s) {
  const L = ln.L[li], a = L.items;
  if (!a.length) return false;
  let moved = false;
  // the front item reaching the end goes on to whatever the line ends in, carrying the rest of its step with it
  while (a.length && a[0].x + s >= ln.len - EPS) {
    if (!handOn(ln, li, a[0].type, Math.max(0, a[0].x + s - ln.len))) break;
    a.shift(); L.mi = 0; moved = true; ln.moved++;
  }
  // everything else rolls on until it closes up behind the item ahead; items packed against a blocked end stay put
  for (let k = Math.min(L.mi, a.length); k < a.length; k++) {
    const it = a[k], max = k ? a[k - 1].x - SPACING : ln.len;
    if (it.x >= max - EPS) { if (k === L.mi) L.mi++; continue; }
    it.x = Math.min(max, it.x + s); moved = true;
  }
  return moved;
}
// The node at a line's end decides where its front item goes.
function handOn(ln, li, type, over) {
  const o = ln.out; if (!o) return false;
  if (o.kind === 'fwd') return toTarget(o.fwd, ln, li, type, over);
  if (o.kind === 'split') {   // filtered ways take only their item; everything else goes round the unfiltered ones
    const f = o.b.sf || [], match = [0, 1, 2].filter(k => f[k] === type), ways = match.length ? match : [0, 1, 2].filter(k => !f[k]);
    const r = li + (match.length ? 3 : 0);   // filtered and unfiltered items take turns separately, so neither skews the other
    for (let k = 0; k < 3; k++) {
      const d = (o.rr[r] + k) % 3;
      if (ways.includes(d) && o.outs[d] && toTarget(o.outs[d], ln, li, type, over)) { o.rr[r] = (d + 1) % 3; return true; }
    }
    return false;
  }
  // sorting: an item a channel filters for goes out that channel first, from whichever lane it came on (so a mixed
  // belt, crops and seeds say, comes apart into its two channels)
  if (o.b.sort) for (const s of [0, 2]) {
    const ch = o.ch[s];
    if (ch?.t && ch.f === type && toTarget(ch.t, ln, s, type, 0)) { ch.n = (ch.n || 0) + 1; ch.last = type; ch.T = S.T; return true; }
  }
  // a bus tile with channels: the bus ahead is served first; a channel only gets what the bus can't take
  if (li === 1 && o.b.midOff) return false;
  if (o.fwd && toTarget(o.fwd, ln, li, type, over)) return true;
  const ch = o.ch[li];
  if (!ch?.t || (ch.f !== '*' && ch.f !== type) || !toTarget(ch.t, ln, li, type, 0)) return false;
  ch.n = (ch.n || 0) + 1; ch.last = type; ch.T = S.T;
  return true;
}
function toTarget(t, src, li, type, over) {
  if (t.ent) { if (!canAccept(t.ent, type)) return false; insert(t.ent, type); return true; }
  const T = t.line; if (!T?.packed || !lineAccepts(T, type)) return false;
  let lane = t.side, x = t.at;
  if (lane === undefined) {
    lane = t.map[li]; x += over;
    if (lane < 0) {   // a bus's middle lane onto a two-lane belt: only into a side its outer lanes leave free
      const l = src.L[0].items.length, r = src.L[2].items.length;
      if (l && r) { src.warnT = S.T; return false; }
      lane = l ? 1 : r ? 0 : (src.alt ^= 1);
    }
  }
  return putAt(T, lane, type, Math.min(x, t.seg.off + t.seg.len));
}
// Three lanes onto two can't work when all three carry items: the middle lane waits, and the join says so.
export const lineWarn = ln => S.T - ln.warnT < .6 ? 'all three bus lanes are full: a two-lane belt can only take two. The middle lane waits' : '';

// Every quarter second: which tiles hold items and moved lately (precision, sound, the map), and how many.
export function touchBelts() {
  for (const ln of world.lines) {
    for (const s of ln.segs) s.nItems = 0;
    if (!ln.packed) continue;
    const live = S.T - ln.act < .3;
    for (const L of ln.L) { let j = ln.segs.length - 1; for (const it of L.items) { while (j > 0 && it.x < ln.segs[j].off) j--; const s = ln.segs[j]; s.nItems++; if (live) s.lastActive = ln.act; } }
  }
}

// ---------------------------------------------------------------- the network around a line
// Lines joined by their nodes, both ways, plus what puts items on them and takes them off.
export function feedsOf() {
  const into = new Map();
  for (const ln of world.lines) for (const t of outTargets(ln)) if (t.line) (into.get(t.line) || into.set(t.line, []).get(t.line)).push({ from: ln, side: t.side !== undefined });
  return into;
}
export function networkOf(ln) {
  const into = feedsOf(), seen = new Set([ln]), q = [ln];
  while (q.length) {
    const a = q.pop();
    for (const t of outTargets(a)) if (t.line && !seen.has(t.line)) { seen.add(t.line); q.push(t.line); }
    for (const f of into.get(a) || []) if (!seen.has(f.from)) { seen.add(f.from); q.push(f.from); }
  }
  return [...seen];
}
// Inserters and drills that put items on a line or take them off it.
export function lineTaps(ln) {
  const segs = new Set(ln.segs), ins = [], outs = [];
  for (const e of world.ents.values()) {
    if (e.kind === 'inserter') {
      const [dx, dz] = DIRS[e.dir], r = e.reach;
      if (segs.has(world.ents.get(key(e.x + dx * r, e.y + e.dy, e.z + dz * r)))) ins.push(e);
      if (segs.has(world.ents.get(key(e.x - dx * r, e.y, e.z - dz * r)))) outs.push(e);
    } else if (e.kind === 'drill') { const [dx, dz] = DIRS[e.dir]; if (segs.has(world.ents.get(key(e.x + dx, e.y, e.z + dz)))) ins.push(e); }
  }
  return { ins, outs };
}
export const lineName = ln => ln.cfg.name || (ln.segs.length === 1 && ln.segs[0].kind === 'splitter' ? 'Splitter' : `${lanesOf(ln.segs[0]) === 3 ? 'Bus' : 'Line'} ${ln.segs[0].x},${ln.segs[0].z}`);
export const lineItems = ln => ln.L.reduce((t, L) => t + L.items.length, 0);

// ---------------------------------------------------------------- commands (from a belt's panel or the logistics window)
const cleanName = s => String(s ?? '').replace(/[<>]/g, '').trim().slice(0, 32);
export function beltCommand(e, cmd, arg) {
  const ln = e.line;
  switch (cmd) {
    case 'lname': if (ln) { ln.cfg.name = cleanName(arg); syncLine(ln); } return true;
    case 'lfilter': if (ln && ITEMS[arg]) { const f = ln.cfg.filter, i = f.indexOf(arg); if (i >= 0) f.splice(i, 1); else f.push(arg); syncLine(ln); } return true;
    case 'lfilterclear': if (ln) { ln.cfg.filter.length = 0; syncLine(ln); } return true;
    case 'laugput': {   // from the engineer's inventory into the line's first free slot
      if (!ln || !AUGMENTS[ITEMS[arg]?.aug]?.belts || !invGet(arg)) { notify('toast', 'only speed augments go on belts'); return true; }
      if (lineAugs(ln).length >= AUG_RULES.lineSlots) { notify('toast', 'this line\'s augment slots are full'); return true; }
      const head = ln.segs[0]; head.aug ||= [];
      head.aug.push(arg); invAdd(arg, -1); lineSpeed(ln); syncLine(ln, head); return true;
    }
    case 'laugtake': {
      if (!ln) return true;
      for (const s of ln.segs) { const i = (s.aug || []).indexOf(arg); if (i >= 0) { s.aug.splice(i, 1); invGive(arg); lineSpeed(ln); syncLine(ln, s); break; } }
      return true;
    }
    case 'sfilter': {   // "way:item" on a splitter, way 0 front, 1 left, 2 right; no item clears it
      if (e.kind !== 'splitter') return true;
      const [w, it] = String(arg).split(':'); e.sf = [...(e.sf || [null, null, null])]; e.sf[+w] = ITEMS[it] ? it : null;
      bus.emit('remesh', e); return true;
    }
    case 'chan': {   // "L:item", "L:*" (anything) or "L:" (off), and the same for R
      if (!isBusTile(e)) return true;
      const [side, it] = String(arg).split(':'), v = it === '*' ? '*' : ITEMS[it] ? it : null;
      if (side === 'L') e.chL = v; else if (side === 'R') e.chR = v;
      world.beltDirty = true; bus.emit('remesh', e); return true;
    }
    case 'midoff': if (isBusTile(e)) { e.midOff = !e.midOff; world.beltDirty = true; bus.emit('remesh', e); } return true;
    case 'bout': {   // "L:item", "L:*" or "L:" (off), and the same for R: a lane pushed out to that side
      if (e.kind !== 'belt' || lanesOf(e) !== 2) return true;
      const [side, it] = String(arg).split(':'), v = it === '*' ? '*' : ITEMS[it] ? it : null;
      if (side !== 'L' && side !== 'R') return true;
      e.bout = { L: e.bout?.L ?? null, R: e.bout?.R ?? null, [side]: v };
      if (!e.bout.L && !e.bout.R) e.bout = null;
      world.beltDirty = true; bus.emit('remesh', e); return true;
    }
    case 'sort': if (isBusTile(e)) { e.sort = !e.sort; world.beltDirty = true; bus.emit('remesh', e); } return true;
  }
  return false;
}
// Line settings are saved on the line's first tile; touching it sends them to friends.
function syncLine(ln, also) { bus.emit('remesh', ln.segs[0]); if (also && also !== ln.segs[0]) bus.emit('remesh', also); bus.emit('belts'); }
