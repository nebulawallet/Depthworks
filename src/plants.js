// Power plants beyond the steam chain: dams and uranium reactors.
//
// A dam needs a little power to work its gates (it joins only high voltage poles: power lines and transformer
// stations) and, while it has it, gives a lot: so much a tile, more where a river's current runs through it. With
// nothing else on its network it can't start; once running it keeps itself going.
//
// A uranium reactor is a huge boiler: it burns fuel cells to turn water into steam for steam engines, only as fast as
// the engines draw it. It runs hot, and coolant towers touching it carry the heat away with water. Without enough
// cooling the heat climbs (warning, then critical) and at the top the reactor and its towers break. Broken is broken:
// repair it from its panel with parts, or mine it for scrap and build a new one.
import { ENTITIES, ITEMS, TILES } from './data.js';
import { S, world, key, DIRS, tileAt, invGet, invAdd, notify, bus } from './state.js';
import { draw, push, room, avail } from './fluids.js';

const isClient = () => S.net.role === 'client';
export const REACTOR = { meltdown: 70, warn: 60, critical: 85, cooldown: 6, idleHeat: 25 };

// ---------------------------------------------------------------- dams
// How much a dam gives running flat out: every tile, more on a river (by its current).
export function damRating(e) {
  if (e._ratedFoot !== e.foot) { e._ratedFoot = e.foot; e._factor = e.foot.reduce((t, [x, z]) => t + 1 + (TILES[tileAt(x, z)]?.current || 0) * ENTITIES[e.type].current, 0); }
  return ENTITIES[e.type].outTile * e._factor;
}
export function damTick(e, sat, demand) {
  const def = ENTITIES[e.type];
  if (!e.net) { e.running = false; e.output = 0; e.status = 'not connected: it needs a power line or a transformer station over it'; return; }
  demand(def.power);
  e.running = sat > .5;
  e.output = e.running ? damRating(e) : 0;
  if (e.running) { e.lastActive = S.T; e.status = `generating up to ${(e.output / 1000).toFixed(1)} MW`; }
  else e.status = `stopped: its gates need ${def.power} kW from other power first`;
}

// ---------------------------------------------------------------- reactors and coolant towers
const towersOf = r => DIRS.map(([dx, dz]) => world.ents.get(key(r.x + dx, r.y, r.z + dz))).filter(t => t?.kind === 'coolant' && !t.broken);
export function reactorTick(dt) {
  for (const e of world.ents.values()) if (e.kind === 'coolant') { e.load = 0; e.cooled = 0; }
  for (const e of world.ents.values()) {
    if (e.kind !== 'reactor') continue;
    const def = ENTITIES[e.type], w = e.fnet?.water, s = e.fnet?.steam;
    e.load = 0;
    if (e.broken) { e.status = 'BROKEN: repair it from its panel, or mine it for scrap and build another'; continue; }
    // steam: only as much as there is room for (engines draw first), only while there is fuel and water
    const fuelled = e.burn > 0 || e.fuel > 0;
    let steam = 0;
    if (fuelled && w && s) {
      const want = Math.min(def.steam * dt, room(s)), water = draw(w, want);
      steam = push(s, water, 'steam');
      e.load = steam / (def.steam * dt);
      if (e.burn <= 0 && e.load > 0 && e.fuel > 0) { e.burn += ITEMS[e.fuelType].nuclear; if (--e.fuel === 0) e.fuelType = null; S.stats.used ||= {}; S.stats.used.uranium_fuel_cell = (S.stats.used.uranium_fuel_cell || 0) + 1; }
      e.burn = Math.max(0, e.burn - def.heat * e.load * dt);
    }
    // cooling: each tower touching it carries away a reactor's worth of heat at full power, given its water
    let cooling = 0;
    for (const t of towersOf(e)) {
      const tw = ENTITIES[t.type], need = tw.cool * e.load * dt, got = need > 0 ? draw(t.fnet?.water, need) : 0;
      const c = need > 0 ? got / need : 1;
      cooling += c * (need > 0 ? 1 : 0); t.load += need > 0 ? got / (tw.cool * dt) : 0; t.cooled += c;
    }
    if (!isClient()) {
      const over = e.load - cooling;
      if (over > .01) e.heat = Math.min(100, (e.heat || 0) + over * 100 / REACTOR.meltdown * dt);
      else e.heat = Math.max(REACTOR.idleHeat * e.load, (e.heat || 0) - REACTOR.cooldown * dt);
      if (e.heat >= 100) breakReactor(e);
    }
    if (steam > 0) e.lastActive = S.T;
    e.status = e.broken ? 'BROKEN' : !fuelled ? 'out of fuel: put uranium fuel cells in' : !w ? 'no water: pipe water to it' : !s ? 'no steam line: pipe its steam to steam engines' : e.heat >= REACTOR.critical ? `CRITICAL: ${Math.round(e.heat)}% heat, it will break` : e.heat >= REACTOR.warn ? `overheating: ${Math.round(e.heat)}% heat, it needs more cooling` : e.load > 0 ? `making ${Math.round(e.load * def.steam)} steam/s · ${Math.round(e.heat)}% heat` : 'idle (no engine needs steam)';
  }
  for (const e of world.ents.values()) if (e.kind === 'coolant') {
    const r = DIRS.some(([dx, dz]) => world.ents.get(key(e.x + dx, e.y, e.z + dz))?.kind === 'reactor');
    e.status = e.broken ? 'BROKEN: repair it from its panel, or mine it for scrap' : !r ? 'idle: put it against a uranium reactor' : !e.fnet?.water ? 'no water: pipe water to it' : e.load > 0 ? (e.cooled < .98 ? `short of water: cooling ${Math.round(e.cooled * 100)}%` : `cooling: ${Math.round(e.load * ENTITIES[e.type].cool)} water/s`) : 'standing by';
    if (e.load > 0) e.lastActive = S.T;
  }
}
function breakReactor(e) {
  e.broken = true; e.load = 0; e.heat = 100;
  for (const t of DIRS.map(([dx, dz]) => world.ents.get(key(e.x + dx, e.y, e.z + dz)))) if (t?.kind === 'coolant') { t.broken = true; bus.emit('remesh', t); }
  bus.emit('remesh', e);
  bus.emit('announce', 'A uranium reactor overheated and broke, and its coolant towers with it.');
}
// Repair a broken reactor or tower with the parts in its data (`repair`), from the acting engineer's inventory.
export function repair(e) {
  const need = ENTITIES[e.type].repair;
  if (!e.broken || !need) return;
  const short = Object.entries(need).filter(([it, n]) => invGet(it) < n);
  if (short.length) { notify('toast', 'repairs need ' + short.map(([it, n]) => `${n} ${ITEMS[it].name.toLowerCase()}`).join(', ')); return; }
  for (const [it, n] of Object.entries(need)) invAdd(it, -n);
  e.broken = false; e.heat = 0;
  bus.emit('remesh', e); notify('toast', 'repaired');
}
export const reactorAccepts = (e, it, manual) => !!ITEMS[it]?.nuclear && !e.broken && (!e.fuel || e.fuelType === it) && e.fuel < (manual ? 50 : 5);
