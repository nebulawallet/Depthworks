// Animals. Like fish: every chunk keeps a population of each animal that lives in its biomes, growing back toward what
// its land can support (fewer where a busy factory stands: working buildings drive wildlife out). Near an engineer the
// animals are real: they graze, walk, rest and keep together in small groups, sleep in their off hours, step round water,
// buildings, frames and roads, and run from engineers (farm animals only from someone sprinting), from vehicles and from
// gunfire. Away from everyone a chunk keeps only its counts and catches up on the growth it missed when someone comes
// back, so a huge world costs nothing for its far side. The host decides everything; guests see snapshots.
import { ANIMALS, ANIMAL_RULES as AR, BIOMES, FRAMES, PLAYER, TILES, ITEMS } from './data.js';
import { S, world, isWater, bus, CHUNK, chunkKey, biomeIndexAt, daylight, GRID, asActor, invGive, notify, spill } from './state.js';
import { roadAt, vstats } from './transport.js';

const isClient = () => S.net.role === 'client';
export const ANIMAL_TYPES = Object.keys(ANIMALS);
const TYPE_INDEX = Object.fromEntries(ANIMAL_TYPES.map((t, i) => [t, i]));
export const STATES = ['graze', 'walk', 'rest', 'flee', 'sleep', 'held'];
const LIVE_R = 2;                 // chunks round each engineer where animals are real
const AWAY = 14;                  // new animals never appear closer than this to an engineer (no popping up in view)
world.animals = [];               // the live ones: { id, t, x, z, a, st, T, hp, g, k, wool, eggT, fleeT }
world.animalPools = new Map();    // chunkKey -> { n: { type: count }, acc: { type: growth so far }, T, live, busy }
let nextGroup = 1;

const keyAt = (x, z) => chunkKey(Math.floor(x / CHUNK), Math.floor(z / CHUNK));
const cxOf = k => k % 4096, czOf = k => Math.floor(k / 4096);
const weightAt = (t, x, z) => ANIMALS[t].biomes[BIOMES[biomeIndexAt(x, z)]?.id] || 0;
export const woolly = an => !!ANIMALS[an.t].shear && (!an.wool || S.T - an.wool > AR.regrow);
// Shorn and growing its wool back: the host knows when; guests are told.
export const isShorn = an => isClient() ? !!an.shorn : !!ANIMALS[an.t].shear && !woolly(an);
export const animalById = id => world.animals.find(a => a.id === id) || null;

// How many of each animal a chunk's land supports: its biomes' weights, tile by tile. Worked out once per chunk.
function capsOf(k) {
  const c = world.chunks.get(k); if (!c) return null;
  if (!c.animalCaps) {
    const caps = {};
    for (let i = 0; i < c.tiles.length; i++) {
      if (TILES[c.tiles[i]].liquid) continue;
      const b = BIOMES[c.biome[i]]?.id;
      for (const t of ANIMAL_TYPES) { const w = ANIMALS[t].biomes[b]; if (w) caps[t] = (caps[t] || 0) + w * AR.density; }
    }
    c.animalCaps = caps;
  }
  return c.animalCaps;
}
function pool(k) {
  let p = world.animalPools.get(k);
  if (!p) {
    const caps = capsOf(k) || {}, n = {};
    for (const [t, cap] of Object.entries(caps)) n[t] = Math.round(cap * .8);   // new land starts nearly full
    p = { n, acc: {}, T: S.T, live: false, busy: 0 };
    world.animalPools.set(k, p);
  }
  return p;
}
// Logistic growth toward the chunk's capacity (cut by a busy factory), plus a trickle so even emptied land fills again.
// Over capacity (a factory went up) the count falls back instead.
function grow(p, k, dt) {
  const caps = capsOf(k); if (!caps) return;
  for (const t of new Set([...Object.keys(caps), ...Object.keys(p.n)])) {
    const cap = (caps[t] || 0) * (1 - p.busy);
    let n = p.n[t] || 0, a = p.acc[t] || 0;
    if (n < cap) { a += (AR.growth * n * (1 - n / Math.max(1, cap)) + AR.trickle * Math.max(.5, cap)) * dt; while (a >= 1 && n + 1 <= cap + .5) { a--; n++; } if (n + 1 > cap + .5) a = Math.min(a, .99); }
    else if (n > Math.round(cap)) { a -= (AR.growth * 2 * (n - cap) + AR.leave) * dt; while (a <= -1 && n > 0) { a++; n--; } }   // an animal leaves every 20 s or so
    else a = 0;
    p.n[t] = n; p.acc[t] = a;
  }
}
export function stockAnimals() { world.animals = []; world.animalPools.clear(); }

// ---------------------------------------------------------------- where an animal may go
// Never onto water, buildings, frames or roads, off the world or into land that isn't made yet; and never out of the
// biomes it lives in, unless it already stands outside them (then any step will do, so it can find its way back).
function free(t, x, z, from) {
  const tx = Math.floor(x), tz = Math.floor(z);
  if (tx < 0 || tz < 0 || tx >= GRID || tz >= GRID || !world.chunks.has(keyAt(tx, tz))) return false;
  if (isWater(tx, tz) || world.ents.get(tx + ',0,' + tz) || world.frames.has(tx + ',0,' + tz) || roadAt(tx, tz)) return false;
  return weightAt(t, tx, tz) > 0 || !(from && weightAt(t, from.x, from.z) > 0);
}
// Steer, don't path-find: the heading if it is clear a little ahead, else the nearest clear turn either way.
const TURNS = [0, .5, -.5, 1.1, -1.1, 1.7, -1.7, 2.4, -2.4, Math.PI];
function steer(an, dist) {
  const look = ANIMALS[an.t].r + .25;
  for (const d of TURNS) {
    const a = an.a + d * (an.side || 1), sx = Math.sin(a), sz = Math.cos(a);
    if (free(an.t, an.x + sx * (dist + look), an.z + sz * (dist + look), an) && free(an.t, an.x + sx * dist, an.z + sz * dist, an)) { if (d) an.side = d > 0 ? 1 : -1; return a; }
  }
  return null;
}

// ---------------------------------------------------------------- spawning
function spawnGroup(k, t, want) {
  const def = ANIMALS[t], x0 = cxOf(k) * CHUNK, z0 = czOf(k) * CHUNK;
  for (let tries = 0; tries < 14; tries++) {
    const x = x0 + Math.random() * CHUNK, z = z0 + Math.random() * CHUNK;
    if (weightAt(t, x, z) <= 0 || !free(t, x, z) || nearEngineer(x, z, AWAY)) continue;
    const g = nextGroup++, n = Math.min(want, def.group[0] + Math.floor(Math.random() * (def.group[1] - def.group[0] + 1)));
    let made = 0;
    for (let i = 0; i < n * 3 && made < n; i++) {
      const ax = i ? x + (Math.random() - .5) * 3 : x, az = i ? z + (Math.random() - .5) * 3 : z;
      if (!free(t, ax, az) || keyAt(ax, az) !== k) continue;
      world.animals.push({ id: world.nextId++, t, x: ax, z: az, a: Math.random() * Math.PI * 2, st: 'graze', T: S.T + Math.random() * 6, hp: def.hp, g, k, eggT: S.T + Math.random() * AR.eggs });
      made++;
    }
    return made;
  }
  return 0;
}
const nearEngineer = (x, z, r) => { for (const p of S.players.values()) if (Math.hypot(p.x - x, p.z - z) < r) return true; return false; };
function liveCounts() {
  const m = new Map();
  for (const an of world.animals) { let c = m.get(an.k); if (!c) m.set(an.k, c = {}); c[an.t] = (c[an.t] || 0) + 1; }
  return m;
}
// Chunks near an engineer, nearest first: those get their animals first when there are more than ANIMAL_RULES.live.
function liveList() {
  const best = new Map();
  for (const pl of S.players.values()) {
    const cx = Math.floor(pl.x / CHUNK), cz = Math.floor(pl.z / CHUNK);
    for (let dx = -LIVE_R; dx <= LIVE_R; dx++) for (let dz = -LIVE_R; dz <= LIVE_R; dz++) {
      const k = chunkKey(cx + dx, cz + dz), d = Math.hypot(dx, dz);
      if (world.chunks.has(k) && !(best.get(k) <= d)) best.set(k, d);
    }
  }
  return [...best].sort((a, b) => a[1] - b[1]).map(([k]) => k);
}
// Working buildings per chunk: a busy factory pushes the wildlife out of its land.
function busyCount() {
  const m = new Map();
  for (const e of world.ents.values()) if (S.T - (e.lastActive ?? -99) < 2) { const k = keyAt(e.x, e.z); m.set(k, (m.get(k) || 0) + 1); }
  return m;
}

// ---------------------------------------------------------------- the tick
const shots = [];   // recent gunshots: every animal within ANIMAL_RULES.alert tiles runs
export function alertAt(x, z) { shots.push({ x, z, T: S.T }); }
let liveT = 0, busyT = 0, groupT = 0;
const groups = new Map();
export function animalsTick(dt) {
  if (!S.started || isClient()) return;
  while (shots.length && S.T - shots[0].T > .5) shots.shift();
  if ((busyT += dt) > 5) { busyT = 0; const b = busyCount(); for (const [k, p] of world.animalPools) if (p.live) p.busy = Math.min(1, (b.get(k) || 0) / AR.busy); }
  if ((liveT += dt) > 1) { liveT = 0; populate(); }
  if ((groupT += dt) > 1) {   // where each group is, so stragglers drift back to it
    groupT = 0; groups.clear();
    for (const an of world.animals) { const g = groups.get(an.g) || groups.set(an.g, { x: 0, z: 0, n: 0 }).get(an.g); g.x += an.x; g.z += an.z; g.n++; }
  }
  const awakeDay = daylight() > .25;
  // backwards, so an animal that dies or wanders off (and leaves the list) never makes one get skipped
  for (let i = world.animals.length - 1; i >= 0; i--) { const an = world.animals[i]; if (step(an, dt, awakeDay) === 'gone') world.animals.splice(i, 1); }
}
// Once a second: chunks that came near someone wake up (with the growth they missed), chunks nobody is near any more
// keep only their counts, and live chunks grow and fill their counts with real animals while there is room.
function populate() {
  const order = liveList(), live = new Set(order);
  for (const [k, p] of world.animalPools) if (p.live && !live.has(k)) { p.live = false; p.T = S.T; for (const an of world.animals) if (an.k === k) an.dead = true; }
  world.animals = world.animals.filter(an => !an.dead);
  const counts = liveCounts();
  let room = AR.live - world.animals.length;
  for (const k of order) {
    const p = pool(k);
    if (!p.live) { grow(p, k, S.T - p.T); p.live = true; } else grow(p, k, 1);
    const c = counts.get(k) || {};
    for (const [t, n] of Object.entries(p.n)) {
      // more alive here than the land holds now (a factory went up): the furthest from everyone wanders off for good
      if ((c[t] || 0) > n) { const far = world.animals.filter(a => a.k === k && a.t === t).sort((a, b) => distAll(b) - distAll(a))[0]; if (far) { far.dead = true; c[t]--; room++; } }
      while ((c[t] || 0) < n && room > 0) { const made = spawnGroup(k, t, Math.min(n - (c[t] || 0), room)); if (!made) break; c[t] = (c[t] || 0) + made; room -= made; }
    }
  }
  world.animals = world.animals.filter(an => !an.dead);
}
const distAll = an => { let d = 1e9; for (const p of S.players.values()) d = Math.min(d, Math.hypot(p.x - an.x, p.z - an.z)); return d; };

function step(an, dt, awakeDay) {
  const def = ANIMALS[an.t];
  // what scares it: engineers (farm animals only mind sprinters), moving vehicles, gunshots
  let from = null, scare = 1e9;
  const threat = (x, z, d) => { if (d < scare) { scare = d; from = { x, z }; } };
  let held = false;
  for (const p of S.players.values()) {
    if (p.veh || Math.abs(p.h || 0) > .5) continue;
    const d = Math.hypot(p.x - an.x, p.z - an.z), fast = Math.hypot(p.vx || 0, p.vz || 0) > PLAYER.speed * 1.15;
    if (p.mining?.k === 'animal' + an.id && !p.mining.blocked && (def.tame || !def.flee)) { held = true; continue; }   // being sheared, or picked up
    if (def.tame ? (fast && d < def.flee * 2) : d < def.flee) threat(p.x, p.z, d);
    else if (def.tame && d < .9) threat(p.x, p.z, d + 50);   // too close: step aside, unhurried
  }
  for (const v of world.vehicles) {
    const sp = Math.abs(v.v || 0); if (sp < .8) continue;
    const st = vstats(v.type); if (!st || st.way === 'sea') continue;
    const d = Math.hypot(v.x - an.x, v.z - an.z);
    if (sp > PLAYER.hitSpeed && d < FRAMES[st.frame].len / 2 + def.r) { killAnimal(an, driverOf(v), 'vehicle'); return; }
    if (d < 7) threat(v.x, v.z, d);
  }
  for (const s of shots) { const d = Math.hypot(s.x - an.x, s.z - an.z); if (d < AR.alert) threat(s.x, s.z, d); }
  if (held) { an.st = 'held'; an.T = S.T + 1; return; }
  if (from && def.flee) {
    const away = Math.atan2(an.x - from.x, an.z - from.z);
    if (scare >= 50) { if (an.st !== 'flee' && an.st !== 'walk') { an.st = 'walk'; an.a = away; an.T = S.T + .8; } }
    else {
      if (an.st !== 'flee' && def.chime) bus.emit('animalfx', { kind: 'chime', x: an.x, z: an.z });
      if (an.st !== 'flee' || Math.random() < dt * 2) an.a = away + (Math.random() - .5) * .8;
      an.st = 'flee'; an.fleeT = S.T + AR.calm;
    }
  }
  const awake = def.active === 'both' || (def.active === 'day') === awakeDay;
  if (an.st === 'flee' && S.T > an.fleeT) { an.st = 'walk'; an.T = S.T + 1 + Math.random() * 2; }
  if (an.st !== 'flee') {
    if (!awake) { an.st = 'sleep'; return; }
    if (an.st === 'sleep' || an.st === 'held' || S.T > an.T) next(an);
  }
  const sp = an.st === 'flee' ? def.run : an.st === 'walk' ? def.walk : 0;
  if (sp) {
    const a = steer(an, sp * dt);
    if (a === null) { if (an.st === 'walk') { an.st = 'graze'; an.T = S.T + 2; } }
    else { an.a = a; an.x += Math.sin(a) * sp * dt; an.z += Math.cos(a) * sp * dt; }
  }
  if (def.eggs && awake && S.T > an.eggT) {   // a hen lays now and then, unless enough eggs already lie round her
    an.eggT = S.T + AR.eggs * (.6 + Math.random() * .8);
    if (world.ground.filter(g => g.type === def.eggs && Math.hypot(g.x - an.x, g.z - an.z) < 5).length < AR.eggsNear) world.ground.push({ type: def.eggs, x: an.x, z: an.z });
  }
  // into another chunk: its count goes along; into one nobody is near, it stays there as a number
  const k = keyAt(an.x, an.z);
  if (k !== an.k) {
    const from0 = world.animalPools.get(an.k); if (from0) from0.n[an.t] = Math.max(0, (from0.n[an.t] || 0) - 1);
    const to = pool(k); to.n[an.t] = (to.n[an.t] || 0) + 1; an.k = k;
    if (!to.live) return 'gone';
  }
}
// What it does next when its current spell runs out: graze, wander (back toward its group if it strayed), or lie down.
function next(an) {
  const r = Math.random(), g = groups.get(an.g);
  if (g && g.n > 1 && Math.hypot(g.x / g.n - an.x, g.z / g.n - an.z) > 3.5) { an.st = 'walk'; an.a = Math.atan2(g.x / g.n - an.x, g.z / g.n - an.z) + (Math.random() - .5) * .6; an.T = S.T + 1.5 + Math.random() * 2; }
  else if (r < .45) { an.st = 'graze'; an.T = S.T + 3 + Math.random() * 6; }
  else if (r < .85) { an.st = 'walk'; an.a += (Math.random() - .5) * 2.2; an.T = S.T + 1.5 + Math.random() * 3.5; }
  else { an.st = 'rest'; an.T = S.T + 6 + Math.random() * 10; }
}
const driverOf = v => { for (const p of S.players.values()) if (p.veh === v.id) return p; return null; };

// ---------------------------------------------------------------- hunting, catching, shearing (host only)
// Takes damage from a bullet; dies at zero health. Returns true if that killed it.
export function hurtAnimal(an, dmg, by) {
  an.hp -= dmg;
  bus.emit('animalfx', { kind: 'hit', id: an.id, x: +an.x.toFixed(2), z: +an.z.toFixed(2), t: an.t, fx: by ? +by.x.toFixed(2) : an.x, fz: by ? +by.z.toFixed(2) : an.z });
  if (an.hp > 0) { if (ANIMALS[an.t].flee) { an.st = 'flee'; an.fleeT = S.T + AR.calm; } return false; }
  killAnimal(an, by, 'shot');
  return true;
}
// Dead or caught: gone from the world and from its chunk's count, and what it gives goes to whoever did it (on the
// ground where it fell, if nobody did: a truck on its own route, say).
export function killAnimal(an, by, how) {
  const i = world.animals.indexOf(an); if (i >= 0) world.animals.splice(i, 1);
  an.dead = true;
  const p = world.animalPools.get(an.k); if (p) p.n[an.t] = Math.max(0, (p.n[an.t] || 0) - 1);
  const drops = Object.entries(ANIMALS[an.t].drops);
  if (by) asActor(by, () => { for (const [it, n] of drops) invGive(it, n); notify('gain', drops.map(([it, n]) => [it, n, by.inv.count(it)]), an.x, .6, an.z); });
  else for (const [it, n] of drops) for (let q = 0; q < n; q++) spill(it, an.x, an.z);
  if (how !== 'caught') bus.emit('animalfx', { kind: 'die', id: an.id, x: +an.x.toFixed(2), z: +an.z.toFixed(2), t: an.t });
}
export function shearAnimal(an, by) {
  if (!woolly(an)) return false;
  an.wool = S.T;
  const got = Object.entries(ANIMALS[an.t].shear);
  asActor(by, () => { for (const [it, n] of got) invGive(it, n); notify('gain', got.map(([it, n]) => [it, n, by.inv.count(it)]), an.x, .6, an.z); });
  return true;
}
// The animal under the cursor: the one the pick hit, else the nearest to the point within its own size.
export function animalTarget(c) {
  if (!c) return null;
  if (c.animal) return animalById(c.animal);
  const px = c.px ?? c.x + .5, pz = c.pz ?? c.z + .5;
  let best = null, bd = 1e9;
  for (const an of world.animals) { const d = Math.hypot(an.x - px, an.z - pz); if (d < ANIMALS[an.t].r + .35 && d < bd) { bd = d; best = an; } }
  return best;
}

// ---------------------------------------------------------------- saves and co-op
// Saves keep each chunk's counts (live ones included); the animals themselves come back near engineers on load.
export const animalPoolsToList = () => [...world.animalPools].map(([k, p]) => [k, Object.entries(p.n).filter(([, n]) => n > 0).map(([t, n]) => [t, n, +(p.acc[t] || 0).toFixed(2)]), +p.busy.toFixed(2)]);
export function animalPoolsFromList(list) {
  stockAnimals();
  for (const [k, types, busy] of Array.isArray(list) ? list : []) {
    const p = { n: {}, acc: {}, T: S.T, live: false, busy: busy || 0 };
    for (const [t, n, acc] of types || []) if (ANIMALS[t]) { p.n[t] = n; p.acc[t] = acc || 0; }
    world.animalPools.set(k, p);
  }
}
// Snapshots for guests: position, heading, what it is doing, and whether its wool is off.
export const animalsToList = () => world.animals.map(an => [an.id, TYPE_INDEX[an.t], +an.x.toFixed(2), +an.z.toFixed(2), +an.a.toFixed(2), STATES.indexOf(an.st), woolly(an) || !ANIMALS[an.t].shear ? 0 : 1]);
export function animalsFromList(list) {
  const old = new Map(world.animals.map(an => [an.id, an]));
  world.animals = (list || []).map(([id, ti, x, z, a, st, shorn]) => {
    const t = ANIMAL_TYPES[ti], an = old.get(id) || { id, t, hp: ANIMALS[t]?.hp ?? 1 };
    return Object.assign(an, { t, x, z, a, st: STATES[st] || 'graze', shorn: !!shorn });
  }).filter(an => ANIMALS[an.t]);
}
export const itemsOf = t => Object.keys(ANIMALS[t].drops).map(it => ITEMS[it].name.toLowerCase());
