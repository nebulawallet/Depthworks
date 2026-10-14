// The engineer's body: biome hazards, and the upgrades researched in medical labs.
//
// Standing in a biome with a hazard builds up exposure over EXPOSURE_TIME seconds and leaving lets it fade. A hazard's
// effects (data.js HAZARDS) apply in full at full exposure, less what the matching adaptation takes off. Medical
// upgrades are global: every engineer in the world gets them. playerMods(p) adds everything up; game rules read
// speed, mining, crafting, reach, stamina and health through it.
import { HAZARDS, MEDICAL, MED, MED_RULES, BIOMES, EXPOSURE_TIME, ITEMS, PLAYER } from './data.js';
import { S, world, biomeIndexAt, daylight, bus } from './state.js';

S.med = { levels: {}, current: null, progress: {}, mutations: false };
export const medLevel = id => S.med.levels[id] || 0;

// ---------------------------------------------------------------- hazards
export function hazardAt(x, z) { return world.gen ? BIOMES[biomeIndexAt(x, z)]?.hazard ?? null : null; }
// How much an adaptation (and Lead lungs) cuts a hazard: 0 none, 1 all of it.
export function resistance(h) {
  const a = HAZARDS[h]?.adapt, lvl = a ? medLevel(a) : 0;
  return Math.min(1, lvl / (MED[a]?.levels || 2) + medLevel('lead_lungs') * (MED.lead_lungs.fx.hazards));
}
export function exposureTick(p, dt) {
  const here = hazardAt(p.x, p.z), ex = p.expo ||= {};
  for (const h of Object.keys(HAZARDS)) {
    const v = ex[h] || 0, t = h === here ? 1 : 0;
    ex[h] = t ? Math.min(1, v + dt / EXPOSURE_TIME) : Math.max(0, v - dt / EXPOSURE_TIME);
    if (!ex[h]) delete ex[h];
  }
  if (p.rad) { ex.radiation = Math.min(1, (ex.radiation || 0) + p.rad); p.rad = 0; }   // radiation picked up by hand (uranium ore)
}
// Everything that changes the engineer's numbers, added up.
export function playerMods(p) {
  const m = { walk: 0, mine: 0, craft: 0, staminaRegen: 0, sprintCost: 0, reach: 0, regen: 0, drain: 0, health: 0, stamina: 0, sunHeal: 0, light: 0, sprint: 0 };
  for (const u of MEDICAL) { const l = medLevel(u.id); if (l && u.fx) for (const [k, v] of Object.entries(u.fx)) if (k in m) m[k] += v * l; }
  for (const [h, v] of Object.entries(p.expo || {})) {
    const k = v * (1 - resistance(h));
    for (const [f, x] of Object.entries(HAZARDS[h].fx)) m[f] += x * k;
  }
  return m;
}
export const maxHealth = p => PLAYER.health + playerMods(p).health;
export const maxStamina = p => PLAYER.stamina + playerMods(p).stamina;
export const reachOf = p => Math.max(3, PLAYER.reach + playerMods(p).reach);
// Health for the host: radiation drains down to half, photosynthetic skin heals in daylight.
export function bodyTick(p, dt) {
  exposureTick(p, dt);
  const m = playerMods(p), max = maxHealth(p);
  if (m.drain > 0 && p.hp > max / 2) p.hp = Math.max(max / 2, p.hp - m.drain * dt);
  if (m.sunHeal > 0 && daylight() > .3 && p.hp < max) p.hp = Math.min(max, p.hp + m.sunHeal * dt);
  if (p.hp > max) p.hp = max;
}

// ---------------------------------------------------------------- medical research
// The units the next level of an upgrade takes.
export const unitsFor = u => Math.round(u.units * Math.pow(MED_RULES.growth, medLevel(u.id)));
export const unitCost = u => ({ ...MED_RULES.cost, ...(u.crop ? { [u.crop]: 1 } : {}) });
export function medAvailable(u) {
  if (medLevel(u.id) >= u.levels) return false;
  return !u.mutation || S.med.mutations;
}
// A medical lab: takes one unit's items, works on it, and when a level's units are done the upgrade goes up.
export function medTick(e, dt, def, st, sat, demand) {
  const u = MED[S.med.current];
  if (!u || !medAvailable(u)) { e.status = 'no medical research chosen: press T, Medical'; e.unit = null; return; }
  if (e.unit !== u.id) {
    e.unit = null; e.prog = 0;
    const cost = unitCost(u);
    if (!Object.entries(cost).every(([it, n]) => (e.inp[it] || 0) >= n)) { e.status = `needs ${Object.entries(cost).map(([it, n]) => `${n} ${ITEMS[it].name.toLowerCase()}`).join(', ')} a unit`; return; }
    for (const [it, n] of Object.entries(cost)) { e.inp[it] -= n; if (!e.inp[it]) delete e.inp[it]; }
    e.unit = u.id;
  }
  demand(def.power * st.power);
  if (sat <= 0) { e.status = e.net ? 'no power' : 'not connected to power'; return; }
  e.prog += dt * def.speed * st.speed * sat / MED_RULES.time; e.lastActive = S.T; e.status = `researching ${u.name}`;
  if (e.prog < 1) return;
  e.prog = 0; e.unit = null;
  if (S.net.role === 'client') return;
  S.med.progress[u.id] = (S.med.progress[u.id] || 0) + 1;
  if (S.med.progress[u.id] >= unitsFor(u)) {
    S.med.progress[u.id] = 0; S.med.levels[u.id] = medLevel(u.id) + 1;
    if (!medAvailable(u)) S.med.current = null;
    bus.emit('medical', u.id);
  }
}
// What a medical lab takes: packs, chlorophyll, and the crop of the upgrade being researched.
export function medAccepts(e, it, manual) {
  const u = MED[S.med.current], want = { ...MED_RULES.cost, ...(u?.crop ? { [u.crop]: 1 } : {}) };
  return !!want[it] && (e.inp[it] || 0) < (manual ? 200 : want[it] * 4);
}
// The items a medical lab's slots hold: the unit cost, and the current upgrade's crop.
export const medSlotItems = () => { const u = MED[S.med.current]; return Object.keys({ ...MED_RULES.cost, ...(u?.crop ? { [u.crop]: 1 } : {}) }); };
export const medToJSON = () => ({ levels: S.med.levels, current: S.med.current, progress: S.med.progress, mutations: S.med.mutations });
export function medFromJSON(d) { S.med = { levels: { ...(d?.levels || {}) }, current: d?.current ?? null, progress: { ...(d?.progress || {}) }, mutations: !!d?.mutations }; }
