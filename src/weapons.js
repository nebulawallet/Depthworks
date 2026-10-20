// Guns (WEAPONS in data.js). A gun is an ordinary item: held in the hand, left-click fires at the cursor. Each engineer
// keeps how many rounds are loaded in each kind of gun (`mags`); a gun that runs empty reloads by itself from the
// ammunition in the inventory, which takes the gun's reload time. The host decides every shot: it traces each bullet
// along the ground from the engineer toward the aim, stopped by buildings and trees, and hurts the first animal in its
// way. Bullets only ever hit animals. Every shot alerts the animals round it.
import { WEAPONS, ANIMALS, FEATURES, ITEMS, hitOf } from './data.js';
import { S, world, bus, actor, invGet, invAdd, notify } from './state.js';
import { hurtAnimal, alertAt } from './animals.js';

const isClient = () => S.net.role === 'client';
export const ammoName = id => ITEMS[WEAPONS[id].ammo].name.toLowerCase();

// The first thing along a shot from (x, z) at angle `ang`: a solid building or a tree trunk stops it (belts, rails and
// other things you walk over don't); an animal whose body the line passes through is hit. Shared with guests, who
// draw their own shots at once with it (the host still decides what is hit).
export function trace(x, z, ang, range) {
  const dx = Math.sin(ang), dz = Math.cos(ang);
  let stop = range;
  for (let s = .35; s < range; s += .2) {
    const px = x + dx * s, pz = z + dz * s, tx = Math.floor(px), tz = Math.floor(pz), k = tx + ',0,' + tz;
    const e = world.ents.get(k);
    if (e && hitOf(e.type) !== null) { stop = s; break; }
    const f = world.feats.get(k);
    if (f && Math.hypot(tx + .5 - px, tz + .5 - pz) < (FEATURES[f.type]?.tool === 'axe' ? .22 : .42)) { stop = s; break; }
  }
  let hit = null, d = stop;
  for (const an of world.animals) {
    if (an.dead) continue;
    const ax = an.x - x, az = an.z - z, t = ax * dx + az * dz;
    if (t < .2 || t > d) continue;
    if (Math.abs(ax * dz - az * dx) < ANIMALS[an.t].r) { hit = an; d = t; }
  }
  return { hit, d, ex: x + dx * d, ez: z + dz * d };
}

function startReload(p, gun) {
  const w = WEAPONS[gun];
  if ((p.mags?.[gun] || 0) >= w.mag || p.reload) return false;
  if (!p.inv.count(w.ammo)) { notify('dry', gun); return false; }
  p.reload = { gun, until: S.T + w.reload };
  notify('reload', gun);
  return true;
}
// A shot, as the acting engineer (`actor`): op = { gun, x, z } with the aim point on the ground.
export function shoot(op) {
  const p = actor, gun = op.gun, w = WEAPONS[gun];
  if (!w || !invGet(gun) || typeof op.x !== 'number' || typeof op.z !== 'number') return;
  if (p.veh) { notify('toast', 'you can\'t shoot from a vehicle'); return; }
  if (p.reload) return;
  if (S.T - (p.shotT ?? -99) < .8 / w.rate) return;   // a little slack: a guest's clicks arrive unevenly
  const mags = p.mags ||= {};
  if (!(mags[gun] > 0)) { startReload(p, gun); return; }
  mags[gun]--; p.shotT = S.T;
  const ang = Math.atan2(op.x - p.x, op.z - p.z), shots = [];
  p.aim = ang; p.aimT = S.T + .6;
  for (let i = 0; i < w.pellets; i++) {
    const r = trace(p.x, p.z, ang + (Math.random() - .5) * 2 * w.spread * Math.PI / 180, w.range);
    if (r.hit && !r.hit.dead) hurtAnimal(r.hit, w.dmg, p);
    shots.push([+r.ex.toFixed(2), +r.ez.toFixed(2), r.hit ? 1 : 0]);
  }
  alertAt(p.x, p.z);
  bus.emit('shot', { by: p.id, gun, x: +p.x.toFixed(2), z: +p.z.toFixed(2), h: +(p.h || 0).toFixed(2), shots });
  if (!mags[gun]) startReload(p, gun);
}
// R with a gun in hand: top the magazine up now, if it isn't full and there is ammunition.
export function reloadGun(gun) {
  const p = actor;
  if (!WEAPONS[gun] || !invGet(gun)) return;
  if (!startReload(p, gun) && (p.mags?.[gun] || 0) >= WEAPONS[gun].mag) notify('toast', 'the magazine is full');
}
// The host finishes reloads: the rounds leave the inventory and go into the gun.
export function gunTick(p) {
  if (!p.reload || S.T < p.reload.until || isClient()) return;
  const gun = p.reload.gun, w = WEAPONS[gun], mags = p.mags ||= {};
  p.reload = null;
  const n = Math.min(w.mag - (mags[gun] || 0), p.inv.count(w.ammo));
  if (n <= 0) return;
  invAdd(w.ammo, -n);   // the sim runs this with the engineer as the actor (setActor), so it comes out of their inventory
  mags[gun] = (mags[gun] || 0) + n;
  notify('reloaded', gun);
}
