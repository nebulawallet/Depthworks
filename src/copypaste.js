// Copy and paste settings, like Factorio's Shift + right-click / Shift + left-click (rebindable: copySettings and
// pasteSettings in input.js). One clipboard for everything: a building's settings, a belt line's, a route, a stop, a
// stop's leave conditions. Each kind of thing plugs in with a copy handler (read its settings into plain data) and an
// apply handler (take what it understands from any clipboard, ignore the rest), so pasting between different but
// compatible things applies what they share: an assembler's augments onto a furnace, a line's filter onto a filter
// inserter, one station's name and rules onto another, one stop's cargo and conditions onto a stop of another route.
//
// Buildings: copy reads the building here; paste goes through doAction (the host applies it, as the player who
// pasted). Panels (routes, stops, belt lines) mark their rows with data-clip="kind:ref" and register a handler.
import { ENTITIES, ITEMS, RECIPE, FUELS, AUGMENTS } from './data.js';
import { S, world, key, bus, notify, invGet, invAdd, invGive, isResearched } from './state.js';

// ---------------------------------------------------------------- the clipboard
// { from: what it came from (for the toast), kind: 'building' | 'line' | 'route' | 'stop', data }
S.clip = null;
export function setClip(clip) {
  S.clip = clip;
  bus.emit('toast', clip ? `Copied: ${clip.from}${clip.what?.length ? ` (${clip.what.join(', ')})` : ''}. Shift + left-click to paste.` : 'clipboard cleared');
  bus.emit('clip');
}

bus.on('clipset', setClip);

// ---------------------------------------------------------------- buildings
const isBus = e => e.kind === 'belt' && ENTITIES[e.type].lanes === 3;
// Read a building's settings (and its belt line's). `what` names them for feedback.
export function copyBuilding(e) {
  if (!e || e.kind === 'frame') return null;
  const def = ENTITIES[e.type], d = { type: e.type, kind: e.kind }, what = [];
  if (e.recipe && e.kind === 'assembler' && !RECIPE[e.recipe]?.auto) { d.recipe = e.recipe; what.push('recipe'); }
  if (e.mode) { d.mode = e.mode; what.push('mode'); }
  if (e.filter) { d.filter = e.filter; what.push('filter'); }
  if (e.kind === 'inserter') { d.dy = e.dy; d.dir = e.dir; }
  if (def.augSlots && e.aug?.some(Boolean)) { d.aug = [...e.aug]; what.push('augments'); }
  if (e.kind === 'splitter' && e.sf?.some(Boolean)) { d.sf = [...e.sf]; what.push('splitter filters'); }
  if (isBus(e)) { d.bus = { chL: e.chL ?? null, chR: e.chR ?? null, midOff: !!e.midOff, sort: !!e.sort }; what.push('bus channels'); }
  if (e.line) { d.line = copyLine(e.line); if (d.line.filter.length || d.line.augs.length) what.push('line filter and speed'); }
  if (e.kind === 'depot') { d.depot = { dname: e.dname, prio: e.prio, vlimit: e.vlimit, rules: e.rules.map(r => ({ ...r })), fuelFluid: e.fuelFluid }; what.push('name, priority, limit and rules'); }
  if (e.kind === 'greenhouse' && e.seed) { d.seed = e.seed; what.push('crop'); }
  if (e.kind === 'valve') what.push('mode');
  d.dir ??= e.dir;
  return { kind: 'building', from: def.name, what, data: d };
}
export const copyLine = ln => ({ filter: [...ln.cfg.filter], augs: ln.segs.flatMap(s => (s.aug || []).filter(Boolean)), name: ln.cfg.name || '' });

// Apply what fits. Runs on the host as the player pasting (augments come from their inventory). Returns what changed.
export function applyToBuilding(e, clip, cmd) {
  const d = clip?.data, def = ENTITIES[e.type], done = [];
  if (!d) return done;
  const filterFrom = d.filter || d.line?.filter?.[0] || d.items?.[0] || null;
  // recipe: anything that crafts that category
  if (d.recipe && e.kind === 'assembler' && (def.cats || ['craft']).includes(RECIPE[d.recipe]?.cat) && e.recipe !== d.recipe) { cmd(e, 'recipe', d.recipe); done.push('recipe'); }
  // filters: a filter inserter takes a filter from anything that has one
  if (def.filter && filterFrom && e.filter !== filterFrom) { e.filter = filterFrom; done.push('filter'); }
  if (e.kind === 'inserter' && d.kind === 'inserter' && d.dy !== undefined && e.dy !== d.dy) { e.dy = d.dy; bus.emit('remesh', e); done.push('pitch'); }
  if (e.type === d.type && d.dir !== undefined && e.dir !== d.dir && !e.foot && e.kind !== 'rail') { cmd(e, 'setdir', d.dir); done.push('direction'); }
  if (d.mode && ((e.kind === 'valve' && d.kind === 'valve') || (def.cats?.includes('barrel') && ENTITIES[d.type]?.cats?.includes('barrel')))) { cmd(e, e.kind === 'valve' ? 'valve' : 'barrelmode', d.mode); done.push('mode'); }
  if (d.aug && def.augSlots && pasteAugs(e, d.aug)) done.push('augments');
  if (d.sf && e.kind === 'splitter') { e.sf = [...d.sf]; bus.emit('remesh', e); world.beltDirty = true; done.push('splitter filters'); }
  if (d.bus && isBus(e)) { Object.assign(e, d.bus); world.beltDirty = true; bus.emit('remesh', e); done.push('bus channels'); }
  if (e.line && (d.line || d.items || d.filter)) { applyLine(e.line, d.line || { filter: d.items || [d.filter] }); done.push('line filter'); }
  if (d.depot && e.kind === 'depot') {
    Object.assign(e, { dname: d.depot.dname, prio: d.depot.prio, vlimit: d.depot.vlimit, rules: d.depot.rules.map(r => ({ ...r })) });
    if (FUELS.includes(d.depot.fuelFluid) && e.fuelFluid !== d.depot.fuelFluid) { e.fuelFluid = d.depot.fuelFluid; e.fa = []; world.fluidDirty = true; }
    for (const u of world.units) u.goal = null;
    bus.emit('routes'); bus.emit('remesh', e); done.push('station settings');
  } else if (e.kind === 'depot' && (d.items || d.line?.filter?.length)) {   // a filter becomes import rules
    for (const it of d.items || d.line.filter) if (!e.rules.some(r => r.it === it) && e.rules.length < 16) e.rules.push({ it, io: 'in', n: 0 });
    bus.emit('remesh', e); done.push('import rules');
  }
  if (e.kind === 'greenhouse' && d.seed && !e.seeds && e.seed !== d.seed) { e.seed = d.seed; e.grow = 0; bus.emit('remesh', e); done.push('crop'); }
  if (done.length) bus.emit('remesh', e);
  return done;
}
// Augments: like Factorio's module paste, the copied set goes in from the player's inventory, and what it replaces
// comes back to the inventory.
function pasteAugs(e, list) {
  let changed = false;
  for (let i = 0; i < e.aug.length; i++) {
    const want = list[i] || null;
    if (e.aug[i] === want || (want && !fits(e, want))) continue;
    if (want && !invGet(want)) continue;
    if (e.aug[i]) invGive(e.aug[i]);
    if (want) invAdd(want, -1);
    e.aug[i] = want; changed = true;
  }
  return changed;
}
const fits = (e, it) => { const a = AUGMENTS[ITEMS[it]?.aug]; return !!a && (!a.only || a.only.includes(e.kind)); };
// A belt line: its filter, and its speed augments from the player's inventory (up to the line's slots).
export function applyLine(ln, data) {
  ln.cfg.filter.length = 0; ln.cfg.filter.push(...(data.filter || []).filter(it => ITEMS[it]));
  const have = ln.segs.flatMap(s => (s.aug || []).filter(Boolean)), want = [...(data.augs || [])];
  for (const a of have) { const i = want.indexOf(a); if (i >= 0) want.splice(i, 1); }
  const head = ln.segs[0];
  for (const a of want) if (invGet(a) && AUGMENTS[ITEMS[a]?.aug]?.belts) { (head.aug ||= []).push(a); invAdd(a, -1); }
  world.beltDirty = true; bus.emit('remesh', head); bus.emit('belts');
}

// ---------------------------------------------------------------- panels
// Panels register how to copy from and paste onto their rows: CLIP_UI[kind] = { copy(ref) -> clip, paste(ref, clip) }.
export const CLIP_UI = {};
export function clipFromPanel(kind, ref) { const h = CLIP_UI[kind]; const c = h?.copy(ref); if (c) setClip(c); else bus.emit('toast', 'nothing to copy there'); }
export function pasteToPanel(kind, ref) {
  const h = CLIP_UI[kind];
  if (!S.clip) { bus.emit('toast', 'nothing copied: Shift + right-click something first'); return; }
  const what = h?.paste(ref, S.clip);
  bus.emit('toast', what?.length ? `Pasted ${what.join(', ')}` : `${S.clip.from} has nothing that fits there`);
}
