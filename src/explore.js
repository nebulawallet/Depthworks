// What the map knows. The map only ever shows tiles someone has seen (explored), and only keeps tiles up to date while
// something is watching them (live): an engineer's view (EXPLORE.view tiles round them) or a working radar's scan
// (its `scan` radius). Everything else explored shows the last state the map saw there. Radars also explore outward,
// further and further while they run, up to their `reveal` radius.
//
// Explored tiles are kept per world chunk (CHUNK × CHUNK bits, 128 bytes a chunk), so a huge world costs only what has
// been seen; a chunk seen all over is saved as just its key. The minimap and the big map share this state.
import { EXPLORE, ENTITIES } from './data.js';
import { S, world, bus, CHUNK, chunkKey, GRID } from './state.js';

const BYTES = CHUNK * CHUNK / 8, FULL = 255;
world.explored = new Map();   // chunkKey -> Uint8Array of BYTES (one bit a tile)
const bitOf = (x, z) => (z & (CHUNK - 1)) * CHUNK + (x & (CHUNK - 1));
export function isExplored(x, z) {
  const b = world.explored.get(chunkKey(Math.floor(x / CHUNK), Math.floor(z / CHUNK))); if (!b) return false;
  const i = bitOf(Math.floor(x), Math.floor(z)); return !!(b[i >> 3] & (1 << (i & 7)));
}
export const chunkExplored = k => world.explored.has(k);
// Mark every tile within r of (x, z) seen. Tells the map which chunks gained tiles ('explored').
export function reveal(x, z, r) {
  const changed = [];
  const c0x = Math.max(0, Math.floor((x - r) / CHUNK)), c1x = Math.min(Math.floor((GRID - 1) / CHUNK), Math.floor((x + r) / CHUNK));
  const c0z = Math.max(0, Math.floor((z - r) / CHUNK)), c1z = Math.min(Math.floor((GRID - 1) / CHUNK), Math.floor((z + r) / CHUNK));
  for (let cx = c0x; cx <= c1x; cx++) for (let cz = c0z; cz <= c1z; cz++) {
    const k = chunkKey(cx, cz), x0 = cx * CHUNK, z0 = cz * CHUNK;
    // nearest and furthest point of the chunk: skip chunks outside the circle, fill whole ones inside it at once
    const nx = Math.max(x0, Math.min(x, x0 + CHUNK)) - x, nz = Math.max(z0, Math.min(z, z0 + CHUNK)) - z;
    if (nx * nx + nz * nz > r * r) continue;
    let b = world.explored.get(k);
    if (b && b.full) continue;
    const fx = Math.max(Math.abs(x0 - x), Math.abs(x0 + CHUNK - x)), fz = Math.max(Math.abs(z0 - z), Math.abs(z0 + CHUNK - z));
    if (!b) { b = new Uint8Array(BYTES); world.explored.set(k, b); }
    let any = false;
    if (fx * fx + fz * fz <= r * r) { b.fill(FULL); any = true; }
    else for (let lz = 0; lz < CHUNK; lz++) for (let lx = 0; lx < CHUNK; lx++) {
      const dx = x0 + lx + .5 - x, dz = z0 + lz + .5 - z, i = lz * CHUNK + lx;
      if (dx * dx + dz * dz > r * r || b[i >> 3] & (1 << (i & 7))) continue;
      b[i >> 3] |= 1 << (i & 7); any = true;
    }
    if (any) { b.full = b.every(v => v === FULL); changed.push(k); }
  }
  if (changed.length) bus.emit('explored', changed);
}

// ---------------------------------------------------------------- live areas
// Circles { x, z, r } the map keeps up to date this moment. Worked out a few times a second.
let live = [];
export const liveAreas = () => live;
export function isLive(x, z) { for (const a of live) { const dx = x + .5 - a.x, dz = z + .5 - a.z; if (dx * dx + dz * dz <= a.r * a.r) return true; } return false; }
export function chunkLive(cx, cz) {
  for (const a of live) {
    const nx = Math.max(cx * CHUNK, Math.min(a.x, cx * CHUNK + CHUNK)) - a.x, nz = Math.max(cz * CHUNK, Math.min(a.z, cz * CHUNK + CHUNK)) - a.z;
    if (nx * nx + nz * nz <= a.r * a.r) return true;
  }
  return false;
}
const radarOn = e => S.T - e.lastActive < 1.5;
let tickT = 0;
// Every engineer explores and watches what is around them; working radars watch their scan area.
export function exploreTick(dt) {
  if ((tickT += dt) < .25) return;
  tickT = 0;
  const next = [];
  for (const p of S.players.values()) { const x = p.local ? p.x : p.rx ?? p.x, z = p.local ? p.z : p.rz ?? p.z; next.push({ x, z, r: EXPLORE.view }); reveal(x, z, EXPLORE.view); }
  for (const e of world.ents.values()) if (e.kind === 'radar' && radarOn(e)) next.push({ x: e.x + .5, z: e.z + .5, r: ENTITIES[e.type].scan, radar: true });
  live = next;
}
// A radar's sweep: while it works, how far it has explored grows from its scan radius out to its reveal radius, and it
// explores a ring at a time (called from the radar's tick in sim.js).
export function radarSweep(e, def, dt, sat) {
  const before = e.scanR ?? def.scan;
  e.scanR = Math.min(def.reveal, before + def.sweep * dt * sat);
  if (before === def.scan && !e.scanned) { e.scanned = true; reveal(e.x + .5, e.z + .5, def.scan); }
  if (Math.floor(e.scanR / 4) !== Math.floor(before / 4) || e.scanR === def.reveal && before !== def.reveal) reveal(e.x + .5, e.z + .5, e.scanR);
}

// ---------------------------------------------------------------- saves
const b64 = a => btoa(String.fromCharCode(...a)), unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
// [key] for a chunk seen all over, [key, base64 bits] for one seen in part.
export const exploredToJSON = () => [...world.explored].map(([k, b]) => b.full ? [k] : [k, b64(b)]);
export function exploredFromJSON(list) {
  world.explored.clear();
  for (const [k, s] of Array.isArray(list) ? list : []) {
    const b = s ? unb64(s) : new Uint8Array(BYTES).fill(FULL);
    if (b.length !== BYTES) continue;
    b.full = b.every(v => v === FULL); world.explored.set(k, b);
  }
  live = [];
  bus.emit('explored', [...world.explored.keys()]);
}
// Saves from before exploring: what was around the engineer and around everything built counts as seen.
export function exploreOldSave() {
  world.explored.clear();
  reveal(S.player.x, S.player.z, EXPLORE.view);
  const seen = new Set();
  for (const e of world.ents.values()) { const k = chunkKey(Math.floor(e.x / CHUNK), Math.floor(e.z / CHUNK)); if (seen.has(k)) continue; seen.add(k); reveal(e.x, e.z, EXPLORE.view / 2); }
}
