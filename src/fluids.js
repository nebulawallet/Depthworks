// Fluids. Pipes, tanks and the fluid boxes of buildings join into networks. Each network holds one fluid in a
// shared pool whose volume is the sum of its members' capacity (`cap` in ENTITIES). Producers push into the pool,
// consumers draw from it, and how much a network can hand over per second falls as its pipes get longer.
// Pumps and valves sit between two networks and move fluid one way. The steam chain (water pump, boilers,
// engines) is just producers and consumers on this, so it follows demand the way Factorio's does: engines draw
// only what the network needs, boilers refill only what was drawn, pumps only what boilers took.
import { ENTITIES, FLUIDS, RECIPE } from './data.js';
import { perimeter } from './multi.js';
import { S, world, key, DIRS, bus } from './state.js';

export const fluidNets = [];
const ALL = [0, 1, 2, 3];
const PIPE_KINDS = new Set(['pipe', 'upipe', 'fpump', 'valve', 'tank']);
export const isPipeLike = e => !!e && PIPE_KINDS.has(e.kind);
export const sameFac = (a, b) => ENTITIES[a.type]?.shared || ENTITIES[b.type]?.shared || (a.fac ?? 1) === (b.fac ?? 1);
// More pipe, less flow: 6000/s with no pipes in the way, 3500/s at 20 pipes, 2000/s at 80, 1500/s at 180. A line is as
// quick as its slowest pipe: `flow` multiplies it (steel pipe 5).
export const throughputFor = (pipes, flow = 1) => Math.round((1000 + 100000 / (20 + pipes)) * flow);
const isSteel = e => (ENTITIES[e.type]?.flow || 1) > 1;

// The fluid boxes of an entity: what fluid each holds (null for pipes, which carry whatever their line carries),
// which absolute sides it connects on, and how much it holds.
export function boxesOf(e) {
  const def = ENTITIES[e.type]; if (!def) return [];
  // irrigation pipe only ever carries water, and joins only greenhouses, irrigation and plain pipes
  const irr = def.irrigation ? { fluid: 'water', irr: true } : {};
  switch (def.kind) {
    case 'pipe': case 'tank': return [{ i: 0, pipe: true, sides: ALL, cap: def.cap, ...irr }];
    case 'upipe': return [{ i: 0, pipe: true, sides: [e.role === 'out' ? e.dir : (e.dir + 2) % 4], cap: def.cap, ...irr }];
    case 'greenhouse': return e.foot ? [{ i: 0, fluid: 'water', io: 'in', room: true, sides: ALL, cap: e.foot.length * 20, touch: perimeter(e) }] : [];
    case 'fpump': case 'valve': return [{ i: 0, pipe: true, io: 'in', sides: [(e.dir + 2) % 4], cap: def.cap }, { i: 1, pipe: true, io: 'out', sides: [e.dir], cap: def.cap }];
    case 'depot': return e.fuelFluid ? [{ i: 0, fluid: e.fuelFluid, sides: ALL, cap: def.fluidCap }] : [];
  }
  if (def.cats?.includes('barrel') && !e.recipe) return e.mode === 'empty' ? [] : [{ i: 0, pipe: true, io: 'in', sides: [(def.ports[0].side + e.dir) % 4], cap: def.cap }];   // learns what fluid its pipe has
  if (def.ports) {
    const r = RECIPE[e.recipe], fins = Object.keys(r?.fin || {}), fouts = Object.keys(r?.fout || {}), list = [];
    let ni = 0, no = 0;
    def.ports.forEach((p, i) => {
      const fluid = p.fluid || (p.io === 'in' ? fins[ni++] : fouts[no++]);
      if (fluid) list.push({ i, fluid, io: p.io, sides: [(p.side + e.dir) % 4], cap: def.cap });
    });
    return list;
  }
  if (def.fluids) return Object.keys(def.fluids).map((f, i) => ({ i, fluid: f, io: def.fluids[f], sides: ALL, pipeSides: def.pipeSides?.[f]?.map(s => (s + e.dir) % 4), cap: def.cap }));
  return [];
}
// Can box A (on a) reach box B (on the neighbour b, which lies in direction d from a)?
function connects(a, A, d, b, B) {
  const sa = B.pipe && A.pipeSides ? A.pipeSides : A.sides, sb = A.pipe && B.pipeSides ? B.pipeSides : B.sides;
  if (!sa.includes(d) || !sb.includes((d + 2) % 4)) return false;
  if (A.fluid && B.fluid && A.fluid !== B.fluid) return false;
  // greenhouses take only irrigation; irrigation joins only greenhouses, irrigation and plain pipe-like things
  if ((A.room && !B.irr) || (B.room && !A.irr)) return false;
  if ((A.irr && !B.irr && !B.room && !B.pipe) || (B.irr && !A.irr && !A.room && !A.pipe)) return false;
  return sameFac(a, b);
}

// ---------------------------------------------------------------- building the networks
export function rebuildFluids() {
  fluidNets.length = 0;
  const boxes = [], parent = [];
  for (const e of world.ents.values()) {
    const bs = boxesOf(e);
    e.fb = []; e.fnet = {};
    if (!bs.length) { delete e.fb; delete e.fnet; continue; }
    e.fa ||= [];
    const conn = e.conn;
    e.conn = 0;
    e._conn0 = conn;
    for (const B of bs) { B.e = e; B.id = boxes.length; boxes.push(B); parent.push(B.id); }
    e._boxes = bs;
  }
  const find = i => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
  const join = (a, b) => { parent[find(a)] = find(b); };
  for (const A of boxes) {
    const a = A.e;
    // the tile edges this box can join at: every outside edge of a building over several tiles, else its own sides
    for (const [x, z, d] of A.touch || (A.pipeSides ? [...new Set([...A.sides, ...A.pipeSides])] : A.sides).map(d => [a.x, a.z, d])) {
      const [dx, dz] = DIRS[d], b = world.ents.get(key(x + dx, a.y, z + dz));
      if (!b?._boxes || b === a) continue;
      for (const B of b._boxes) if (connects(a, A, d, b, B)) { join(A.id, B.id); if (!A.touch) a.conn |= 1 << d; }
    }
    if (a.kind === 'upipe' && a.pair?._boxes && sameFac(a, a.pair)) join(A.id, a.pair._boxes[0].id);
  }
  const byRoot = new Map();
  for (const B of boxes) {
    const r = find(B.id);
    let n = byRoot.get(r);
    if (!n) { n = { id: fluidNets.length, fluid: null, mixed: false, boxes: [], members: [], cap: 0, amount: 0, pipes: 0, throughput: 0, flowLeft: 0, moved: 0 }; byRoot.set(r, n); fluidNets.push(n); }
    n.boxes.push(B); n.cap += B.cap;
    if (!n.members.includes(B.e)) { n.members.push(B.e); if (B.pipe && B.e.kind !== 'tank') n.pipes++; }
    B.e.fb[B.i] = n;
    if (B.fluid) B.e.fnet[B.fluid] = n;
  }
  // what each network carries: the fixed boxes in it decide, else the fluid already in its pipes
  for (const n of fluidNets) {
    const fixed = new Set(n.boxes.filter(B => B.fluid).map(B => B.fluid));
    if (fixed.size > 1) { n.mixed = true; n.fluid = [...fixed][0]; continue; }
    if (fixed.size === 1) { n.fluid = [...fixed][0]; continue; }
    const stored = new Set(n.boxes.filter(B => B.e.fluid && (B.e.fa[B.i] || 0) > .5).map(B => B.e.fluid));
    if (stored.size > 1) { n.mixed = true; n.fluid = [...stored][0]; } else n.fluid = [...stored][0] || null;
  }
  // pumps and valves pass their fluid on to an empty line on the other side
  world.fluidLinks = [];
  for (const e of world.ents.values()) if ((e.kind === 'fpump' || e.kind === 'valve') && e.fb?.[0] && e.fb[1]) world.fluidLinks.push({ e, from: e.fb[0], to: e.fb[1] });
  for (let pass = 0; pass < 6; pass++) for (const l of world.fluidLinks) {
    if (l.from.fluid && !l.to.fluid) l.to.fluid = l.from.fluid; else if (l.to.fluid && !l.from.fluid) l.from.fluid = l.to.fluid;
  }
  for (const n of fluidNets) {
    n.flowK = n.members.filter(isPipeLike).reduce((m, e) => Math.min(m, ENTITIES[e.type].flow || 1), n.pipes ? 99 : 1);
    n.steel = n.members.filter(m => isPipeLike(m) && m.kind !== 'tank' && m.kind !== 'fpump' && m.kind !== 'valve').every(isSteel);
    n.throughput = throughputFor(n.pipes, n.flowK);
    for (const B of n.boxes) {
      const has = B.e.fa[B.i] || 0, kind = B.fluid || B.e.fluid;
      if (has > 0 && (!kind || kind === n.fluid || n.mixed)) n.amount += has;
    }
    n.amount = Math.min(n.amount, n.cap);
  }
  for (const e of world.ents.values()) {
    if (!e._boxes) continue;
    if (isPipeLike(e)) { const f = e.fb[0]?.fluid ?? null; if (f !== (e.fluid ?? null)) { e.fluid = f; e._remesh = true; } }
    if (e.conn !== e._conn0 && isPipeLike(e)) e._remesh = true;
    delete e._conn0; delete e._boxes;
    if (e._remesh) { delete e._remesh; bus.emit('remesh', e); }
  }
  syncBack();
  world.fluidDirty = false;
  bus.emit('fluids');
}
// Write each pool back into its members' boxes (by capacity), so saves, splits and joins keep the fluid.
function syncBack() {
  for (const n of fluidNets) {
    const k = n.cap ? n.amount / n.cap : 0;
    for (const B of n.boxes) B.e.fa[B.i] = n.mixed ? (B.e.fa[B.i] || 0) : B.cap * k;
  }
}

// ---------------------------------------------------------------- moving fluid
export const avail = n => n && !n.mixed && n.fluid ? Math.min(n.amount, n.flowLeft) : 0;
export const room = n => n && !n.mixed ? Math.max(0, n.cap - n.amount) : 0;
export function draw(n, want) { const k = Math.max(0, Math.min(want, avail(n))); if (k) { n.amount -= k; n.flowLeft -= k; n.moved += k; } return k; }
export function push(n, amt, fluid) {
  if (!n || n.mixed || (fluid && n.fluid && n.fluid !== fluid)) return 0;
  const k = Math.max(0, Math.min(amt, room(n)));
  if (k && !n.fluid) n.fluid = fluid;
  n.amount += k; return k;
}
export function fluidPre(dt) { for (const n of fluidNets) { n.flow = (n.flow || 0) * .9 + (n.moved || 0) / dt * .1; n.flowLeft = n.throughput * dt; n.moved = 0; } }

// Engines run on steam, diesel generators on diesel: what each could give this tick, before power is shared out.
export const burnNet = e => e.kind === 'engine' ? e.fnet?.steam : e.kind === 'fgen' ? e.fnet?.diesel : null;
export const burnRate = e => { const def = ENTITIES[e.type]; return e.kind === 'engine' ? def.steam : def.out / 1000 / FLUIDS.diesel.fuel; };
export function producerCaps(dt) {
  const want = new Map(), list = [];
  for (const e of world.ents.values()) {
    if (e.kind !== 'engine' && e.kind !== 'fgen') continue;
    const n = burnNet(e);
    e.cap = 0;
    if (!e.net || !n) continue;
    list.push(e); want.set(n, (want.get(n) || 0) + burnRate(e) * dt);
  }
  for (const e of list) { const n = burnNet(e), w = want.get(n); e.cap = w ? ENTITIES[e.type].out * Math.min(1, avail(n) / w) : 0; }
}

// Boilers turn the water they can draw into the steam their network has room for; water pumps then top up.
export function fluidPost(dt, burner) {
  const steamNets = new Map();
  for (const e of world.ents.values()) if (e.kind === 'boiler') {
    const s = e.fnet?.steam; e.load = 0;
    if (!s) continue;
    if (!steamNets.has(s)) steamNets.set(s, []);
    steamNets.get(s).push(e);
  }
  for (const [s, boilers] of steamNets) {
    const live = boilers.filter(b => b.burn > 0 || b.fuel > 0);
    const max = live.reduce((t, b) => t + ENTITIES[b.type].steam * dt, 0), k = max ? Math.min(1, room(s) / max) : 0;
    for (const b of boilers) {
      const def = ENTITIES[b.type], fuelled = b.burn > 0 || b.fuel > 0, want = fuelled ? def.steam * dt * k : 0;
      const w = b.fnet.water, water = draw(w, want), steam = push(s, water, 'steam');
      b.load = steam / (def.steam * dt);
      b.water = want > 0 ? water / want : (w && w.amount > 0 ? 1 : 0);
      burner(b, steam > 0, def.heat * b.load, dt);
      if (!fuelled) b.status = 'out of fuel';
      else if (!w || !w.members.some(m => m.kind === 'pump' || isPipeLike(m))) b.status = 'no water: put a water pump next to it, or a pipe at a drum end';
      else if (want > 0 && water < want * .98) b.status = w.amount > 0 ? 'not enough water' : 'no water in the line';
      else if (steam > 0) { b.status = 'making steam'; b.lastActive = S.T; }
      else b.status = 'idle (no engine needs steam)';
    }
  }
  for (const e of world.ents.values()) if (e.kind === 'pump') {
    // a high pressure pump only works flat out when its line is steel all the way
    const def = ENTITIES[e.type], w = e.fnet?.water, capped = def.fullRate === 'steel' && w && !w.steel, rate = capped ? ENTITIES.water_pump.rate : def.rate;
    const got = push(w, rate * dt, 'water');
    e.load = got / (def.rate * dt);
    if (e.load > 0) { e.status = capped ? `pumping, held to ${rate}/s by iron pipe: use steel pipe` : 'pumping'; e.lastActive = S.T; }
    else e.status = w && w.members.some(m => m !== e) ? 'full (nothing drawing water)' : 'full: put a boiler or a pipe next to it';
  }
  syncBack();
}

// Inline pumps and valves: move fluid from the network behind them to the one in front.
export function passThrough(e, dt, power) {
  const def = ENTITIES[e.type], from = e.fb?.[0], to = e.fb?.[1];
  e.load = 0;
  if (!from || !to) { e.status = !from ? 'nothing behind it' : 'nothing in front of it'; return 0; }
  if (from.mixed || to.mixed) { e.status = 'two fluids meet in a line: flush it'; return 0; }
  if (from.fluid && to.fluid && from.fluid !== to.fluid) { e.status = `will not mix ${FLUIDS[from.fluid].name.toLowerCase()} into ${FLUIDS[to.fluid].name.toLowerCase()}`; return 0; }
  if (!from.fluid) { e.status = 'nothing to pass on'; return 0; }
  let want = (def.rate || 6000) * dt * power;
  if (e.kind === 'valve') {
    if (e.mode === 'overflow') want = Math.min(want, Math.max(0, from.amount - from.cap * .8));
    else if (e.mode === 'topup') want = Math.min(want, Math.max(0, to.cap * .5 - to.amount));
  }
  const k = Math.min(want, avail(from), room(to));
  if (k <= 0) { e.status = power <= 0 ? 'no power' : room(to) <= 0 ? 'output full' : e.kind === 'valve' && e.mode && want <= 0 ? (e.mode === 'overflow' ? 'waiting for overflow' : 'output topped up') : 'nothing to pass on'; return 0; }
  draw(from, k); push(to, k, from.fluid);
  e.load = k / ((def.rate || 6000) * dt);
  e.status = e.kind === 'valve' ? 'open' : 'pumping'; e.lastActive = S.T;
  return k;
}

// Would placing `type` here connect lines that hold different fluids? (Factorio refuses that too.)
export function fluidConflict(type, x, y, z, dir, fac, recipe) {
  const fake = { type, kind: ENTITIES[type].kind, x, y, z, dir, fac, recipe, role: 'in' };
  for (const A of boxesOf(fake)) {
    const seen = new Set(A.fluid ? [A.fluid] : []);
    for (const d of A.pipeSides ? [...new Set([...A.sides, ...A.pipeSides])] : A.sides) {
      const [dx, dz] = DIRS[d], b = world.ents.get(key(x + dx, y, z + dz));
      if (!b?.fb) continue;
      for (const B of boxesOf(b)) {
        if (!connects(fake, A, d, b, B)) continue;
        const n = b.fb[B.i];
        if (n?.fluid && !n.mixed) seen.add(n.fluid);
      }
    }
    if (seen.size > 1) { const [p, q] = [...seen]; return `that would mix ${FLUIDS[p].name.toLowerCase()} with ${FLUIDS[q].name.toLowerCase()}`; }
  }
  return null;
}
// Empty a whole line (Factorio's flush): what was in it is lost.
export function flush(e) {
  const nets = new Set((e.fb || []).filter(Boolean));
  for (const n of nets) { n.amount = 0; for (const B of n.boxes) { B.e.fa[B.i] = 0; if (isPipeLike(B.e)) B.e.fluid = null; } }
  world.fluidDirty = true;
}
export const fluidName = f => FLUIDS[f]?.name ?? 'nothing';
