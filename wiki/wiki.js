// Depthworks Wiki. Hand-written articles (articles/*.js) plus a page for every item, fluid and technology, generated
// from the game's own data (src/data.js), so the numbers here always match the game they ship with.
//
// Articles are written in a small wikitext: == headings ==, '''bold''', ''italic'', [[Page|label]] links, * and #
// lists, ; term / : definition, tables of "! a !! b" and "| a || b" rows, and {{templates}} (see TEMPLATES).
import * as D from '../src/data.js';
import { iconURL } from '../src/icons.js';
import { ACTIONS, codeName } from '../src/input.js';
import { ARTICLES, ALIASES, NOTES, BIOME_TEXT } from './articles/index.js';

const { ITEMS, ENTITIES, RECIPES, RECIPE, TECHS, TECH, FLUIDS, BIOMES, FEATURES, HAZARDS, MEDICAL, MED, MED_RULES, TOOLS, AUGMENTS, AUG_RULES,
  DEPOSIT, TIERS, VOLTAGES, ROADS, FRAMES, ENGINES, VEHICLES, CROPS, TECH_CATS, CONVERSATION, AMBIENT, PLAYER, DAY, BARREL_SIZE, STRAY_ORES } = D;

// ---------------------------------------------------------------- small helpers
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const norm = t => String(t).replace(/_/g, ' ').trim().toLowerCase();
const slug = s => String(s).trim().replace(/\s+/g, '_').replace(/[^\w\-'.]/g, '');
const pathOf = title => encodeURIComponent(String(title).replace(/ /g, '_')).replace(/%3A/g, ':').replace(/%27/g, "'").replace(/%2C/g, ',');
export const href = (title, sec) => '#/' + pathOf(title) + (sec ? '/' + slug(sec) : '');
const fmt = (n, d = 1) => { if (n == null || !isFinite(n)) return '—'; const r = Math.round(n * 10 ** d) / 10 ** d; return r.toLocaleString('en-US', { maximumFractionDigits: d }); };
const kw = n => n >= 1000 ? `${fmt(n / 1000, 2)} MW` : `${fmt(n, 1)} kW`;
const plural = (n, w) => `${fmt(n, 2)} ${w}${n === 1 ? '' : 's'}`;
const aOrAn = w => /^[aeiou]/i.test(w) ? 'an' : 'a';
const lcFirst = s => s.charAt(0).toLowerCase() + s.slice(1);
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
const listing = arr => arr.length < 2 ? arr.join('') : arr.slice(0, -1).join(', ') + ' and ' + arr[arr.length - 1];
function iconSrc(id) { try { return iconURL(id); } catch { return ''; } }
const img = (id, cls = 'px') => `<img class="${cls}" src="${iconSrc(id)}" alt="" loading="lazy">`;

// ---------------------------------------------------------------- titles of generated pages
export const itemTitle = id => ITEMS[id]?.name ?? FLUIDS[id]?.name ?? id;
export const techTitle = id => `${TECH[id].name} (research)`;
const FLUID_IDS = Object.keys(FLUIDS);
const PLURAL = new Set(['Dates', 'Hops', 'Ashlands', 'Glowcap hollows', 'Pripyatic wastes']);   // names that take "are"
const isFluid = id => !!FLUIDS[id] && !ITEMS[id];

// ---------------------------------------------------------------- the page registry
const PAGES = new Map();   // normalized title -> page
const addPage = p => { const k = norm(p.title); if (PAGES.has(k)) console.warn('wiki: two pages called', p.title); PAGES.set(k, p); return p; };
const ALIAS = new Map(Object.entries(ALIASES).map(([a, t]) => [norm(a), t]));
function resolve(title) {
  const k = norm(title);
  if (PAGES.has(k)) return { page: PAGES.get(k) };
  const a = ALIAS.get(k);
  if (a) { const [t, sec] = a.split('#'); const p = PAGES.get(norm(t)); if (p) return { page: p, from: title, sec }; }
  return null;
}
const exists = title => !!resolve(title.split('#')[0]);

// ---------------------------------------------------------------- links
export function link(target, label) {
  const [t, sec] = String(target).split('#');
  const r = t ? resolve(t) : null, title = r?.page.title ?? t;
  const lab = label ?? (sec && !t ? sec : t);
  if (t && !r && !/^(special|category):/i.test(t)) return `<a class="new" href="${href(t)}" title="${esc(t)} (page does not exist)">${lab}</a>`;
  return `<a href="${href(title, sec || r?.sec)}" title="${esc(title)}">${lab}</a>`;
}
export function itemLink(id, label) {
  if (id === '#seed') return `<a class="il" href="${href('Agriculture', 'Seeds')}">${img('wheat_seeds')}${label ?? 'Any seeds'}</a>`;
  if (!ITEMS[id] && !FLUIDS[id]) return esc(label ?? id);
  return `<a class="il" href="${href(itemTitle(id))}" title="${esc(itemTitle(id))}">${img(id)}${label ?? esc(itemTitle(id))}</a>`;
}
const iconLink = id => `<a href="${href(itemTitle(id))}" title="${esc(itemTitle(id))}">${img(id, 'px ic')}</a>`;
export const techLink = (id, label) => TECH[id] ? `<a href="${href(techTitle(id))}" title="${esc(techTitle(id))}">${label ?? esc(TECH[id].name)}</a>` : esc(id);
function amounts(obj, fl) {
  const parts = [];
  for (const [k, n] of Object.entries(obj || {})) parts.push(`<span class="amt">${k === '#seed' ? iconSeed() : iconLink(k)}<b>×${fmt(n, 2)}</b></span>`);
  for (const [k, n] of Object.entries(fl || {})) parts.push(`<span class="amt">${iconLink(k)}<b>×${fmt(n, 2)}</b></span>`);
  return parts.join('') || '<span class="dim">—</span>';
}
const iconSeed = () => `<a href="${href('Agriculture', 'Seeds')}" title="Any seeds">${img('wheat_seeds', 'px ic')}</a>`;
const amountsText = (obj, fl) => [...Object.entries(obj || {}), ...Object.entries(fl || {})].map(([k, n]) => `${fmt(n, 2)} × ${k === '#seed' ? itemLink('#seed') : itemLink(k)}`).join(', ');

// ---------------------------------------------------------------- recipes
const CAT_MACHINES = { smelt: ['furnace', 'electric_furnace', 'steel_furnace'], craft: ['assembler', 'assembler2', 'crafting_station'], refine: ['refinery'],
  chem: ['chem_plant'], barrel: ['barreler'], vehicle: ['vehicle_factory'], centrifuge: ['centrifuge'] };
const recipeName = r => r.name || ITEMS[r.id]?.name || r.id;
const recipeIcon = r => r.icon || r.id;
const recipeTech = r => r.tech ? techLink(r.tech) : '<span class="dim">from the start</span>';
function madeIn(r, short) {
  const list = (CAT_MACHINES[r.cat] || []).map(m => short ? iconLink(m) : itemLink(m));
  if (r.cat === 'craft' && r.hand) list.unshift(short ? `<a class="hand" href="${href('Crafting', 'Hand crafting')}" title="By hand">✋</a>` : link('Crafting#Hand crafting', 'by hand'));
  return list.join(short ? ' ' : ', ');
}
const producers = id => RECIPES.filter(r => (r.out && r.out[id]) || (r.fout && r.fout[id]));
const consumers = id => RECIPES.filter(r => (r.in && (r.in[id] || (r.in['#seed'] && ITEMS[id]?.seed))) || (r.fin && r.fin[id]));
function recipeTable(list, opts = {}) {
  if (!list.length) return '';
  const rows = list.map(r => `<tr><td>${img(recipeIcon(r), 'px ic')} ${ITEMS[r.id] && !r.name ? link(itemTitle(r.id)) : esc(recipeName(r))}</td>
    <td>${amounts(r.in, r.fin)}</td><td class="num" data-sort="${r.time}">${fmt(r.time, 2)} s</td><td>${amounts(r.out, r.fout)}</td>
    <td>${madeIn(r, true)}</td>${opts.noTech ? '' : `<td>${recipeTech(r)}</td>`}</tr>`).join('');
  return `<div class="tablewrap"><table class="wikitable sortable"><thead><tr><th>Recipe</th><th>Ingredients</th><th>Time</th><th>Results</th><th>Made in</th>${opts.noTech ? '' : '<th>Research</th>'}</tr></thead><tbody>${rows}</tbody></table></div>`;
}
// the technology that makes an item (or recipe) available
const unlockTech = id => RECIPE[id]?.tech ?? TECHS.find(t => t.unlocks.includes(id))?.id ?? null;

// ---------------------------------------------------------------- what kind of thing an item is
const B = (group, topic) => ({ label: 'building', group, topic, cat: 'Buildings' });
const KIND_GROUP = {
  belt: ['Belts', 'Belt logistics'], underground: ['Belts', 'Belt logistics'], splitter: ['Belts', 'Belt logistics'], lift: ['Belts', 'Depth'],
  inserter: ['Inserters', 'Inserters'], chest: ['Storage', 'Storage'], frame: ['Depth', 'Depth'], drill: ['Mining', 'Mining'],
  furnace: ['Smelting', 'Smelting'], assembler: ['Crafting machines', 'Crafting'], lab: ['Research', 'Research'], pole: ['Electric network', 'Electricity'],
  pump: ['Power generation', 'Steam power'], boiler: ['Power generation', 'Steam power'], engine: ['Power generation', 'Steam power'],
  solar: ['Power generation', 'Solar power'], fgen: ['Power generation', 'Oil processing'], dam: ['Power generation', 'Hydroelectric power'],
  reactor: ['Power generation', 'Nuclear power'], coolant: ['Power generation', 'Nuclear power'], pipe: ['Fluid handling', 'Fluids'], upipe: ['Fluid handling', 'Fluids'],
  fpump: ['Fluid handling', 'Fluids'], valve: ['Fluid handling', 'Fluids'], tank: ['Fluid handling', 'Fluids'], oilpump: ['Oil and chemistry', 'Oil processing'],
  depot: ['Transport', 'Routes and depots'], rail: ['Transport', 'Railways'], greenhouse: ['Agriculture', 'Agriculture'], medlab: ['Agriculture', 'Medical research'],
  lamp: ['Lighting', 'Day and night'], radar: ['Map', 'Map'], transmitter: ['The Signal', 'The Signal'],
};
const ID_GROUP = { refinery: ['Oil and chemistry', 'Oil processing'], chem_plant: ['Oil and chemistry', 'Oil processing'], barreler: ['Fluid handling', 'Fluids'],
  centrifuge: ['Oil and chemistry', 'Nuclear power'], vehicle_factory: ['Transport', 'Vehicles'], green_lamp: ['Agriculture', 'Agriculture'], leach_drill: ['Mining', 'Nuclear power'],
  irrigation_pipe: ['Agriculture', 'Agriculture'], underground_irrigation: ['Agriculture', 'Agriculture'], steel_irrigation_pipe: ['Agriculture', 'Agriculture'],
  underground_steel_irrigation: ['Agriculture', 'Agriculture'], hp_pump: ['Power generation', 'Steam power'], water_pump: ['Power generation', 'Steam power'],
  bus_belt: ['Belts', 'Belt logistics'], bus_underground: ['Belts', 'Belt logistics'], big_drill: ['Mining', 'Mining'] };
const RAW = new Set(['iron_ore', 'copper_ore', 'coal', 'stone', 'wood', 'crystal', 'abyssal_ore', 'uranium_ore']);
const PARTS = new Set(['chassis', 'wheel', 'hull', 'armor_plate', 'turret', 'fishing_net']);
export function classOf(id) {
  if (isFluid(id)) return { label: 'fluid', group: 'Fluids', topic: 'Fluids', cat: 'Fluids' };
  const it = ITEMS[id], e = ENTITIES[id];
  if (e) { const [g, t] = ID_GROUP[id] || KIND_GROUP[e.kind] || ['Other buildings', 'Building']; return B(g, t); }
  if (RAW.has(id)) return { label: 'raw resource', group: 'Raw resources', topic: 'Resources', cat: 'Raw resources' };
  if (it.shape === 'pack') return { label: 'science pack', group: 'Science packs', topic: 'Science packs', cat: 'Science packs' };
  if (it.tool) return { label: 'tool item', group: 'Tools and cables', topic: { link: 'Electricity', conduit: 'Roads', signal: 'Railways' }[it.tool] ?? 'Electricity', cat: 'Tool items' };
  if (it.barrel || id === 'barrel') return { label: id === 'barrel' ? 'fluid container' : 'filled barrel', group: 'Barrels', topic: 'Fluids', cat: 'Barrels' };
  if (it.engine) return { label: 'vehicle part', group: 'Vehicle parts', topic: 'Vehicles', cat: 'Vehicle parts' };
  if (PARTS.has(id)) return { label: 'vehicle part', group: 'Vehicle parts', topic: id === 'fishing_net' ? 'Fishing' : 'Vehicles', cat: 'Vehicle parts' };
  if (it.vehicle) return { label: 'vehicle', group: 'Vehicles', topic: 'Vehicles', cat: 'Vehicles' };
  if (it.aug) return { label: 'augment', group: 'Augments', topic: 'Augments', cat: 'Augments' };
  if (it.road) return { label: 'road surface', group: 'Road surfaces', topic: 'Roads', cat: 'Road surfaces' };
  if (it.seed) return { label: 'seed', group: 'Seeds', topic: 'Agriculture', cat: 'Seeds' };
  if (it.crop) return { label: 'crop', group: 'Crops', topic: 'Agriculture', cat: 'Crops' };
  if (it.shape === 'fish') return { label: 'food', group: 'Food', topic: 'Fishing', cat: 'Food' };
  if (it.fuel || it.nuclear) return { label: 'fuel', group: 'Intermediate products', topic: 'Fuel', cat: 'Intermediate products' };
  return { label: 'intermediate product', group: 'Intermediate products', topic: 'Crafting', cat: 'Intermediate products' };
}

// ---------------------------------------------------------------- building numbers
const BURN_KW = { burner_drill: 150, furnace: 90, burner_inserter: 100, brazier: 20, boiler: 1800 };   // from the burner() calls in sim.js
const throughput = d => (d.lanes ?? 2) * 4 * d.speed;
function entityRows(id) {
  const d = ENTITIES[id], rows = [];
  const r = (k, v) => v != null && v !== '' && rows.push([k, v]);
  if (d.size) r('Size', `${d.size[0]}×${d.size[1]} tiles`);
  else if (d.drag) r('Size', `${d.width} tiles wide, dragged across water`);
  else r('Size', '1×1 tile');
  if (d.power) r('Power use', kw(d.power) + (d.kind === 'drill' && d.size ? ' at full cover' : ''));
  if (d.burner) r('Energy', `burns fuel${BURN_KW[id] ? ` (${kw(BURN_KW[id])})` : ''}`);
  switch (d.kind) {
    case 'belt': r('Speed', `${d.speed} tiles/s`); r('Lanes', d.lanes ?? 2); r('Throughput', `${fmt(throughput(d))} items/s`); break;
    case 'underground': r('Exit', `up to ${d.range - 1} tiles ahead`); r('Throughput', `${fmt(throughput(d))} items/s`); break;
    case 'splitter': r('Speed', `${d.speed} tiles/s`); break;
    case 'lift': r('Speed', `${d.speed} tiles/s`); r('Moves', 'one layer up or down'); break;
    case 'inserter': r('Swing', `${d.swing} s each way`); r('Rate', `${fmt(1 / (2 * d.swing), 2)} items/s`); r('Reach', plural(d.reach, 'tile')); if (d.filter) r('Filter', 'yes'); break;
    case 'drill': r('Mining rate', `${fmt(d.rate, 2)} ore/s (${fmt(d.rate * 60)}/min)`); r('Reaches', DEPOSIT[d.depth].name.toLowerCase() + ' layer'); if (d.acid) r('Acid', `${d.acid} sulfuric acid per ore`); break;
    case 'furnace': case 'assembler': case 'lab': case 'medlab': r('Crafting speed', `×${d.speed}`); break;
    case 'chest': r('Storage', `${d.cap} slots`); break;
    case 'pole': r('Voltage', VOLTAGES[(d.volts || [d.volt])[0]].name + (d.volts ? ` → ${VOLTAGES[d.volts[1]].name}` : ''));
      r('Supply area', `${d.supply * 2 + 1}×${d.supply * 2 + 1}`); r('Wire reach', plural(d.wire, 'tile')); break;
    case 'pump': r('Pumping', `${fmt(d.rate)} water/s`); r('Placed on', 'water'); break;
    case 'boiler': r('Heat', kw(d.heat * 1000)); r('Steam', `${d.steam}/s`); break;
    case 'engine': r('Output', `up to ${kw(d.out)}`); r('Steam use', `${d.steam}/s`); break;
    case 'solar': r('Output', `up to ${kw(d.out)} in daylight`); break;
    case 'fgen': r('Output', `up to ${kw(d.out)}`); r('Fuel', itemLink('diesel')); break;
    case 'dam': r('Output', `${kw(d.outTile)} a tile, more on rivers`); r('Start-up power', kw(d.power)); r('Voltage', 'High voltage'); break;
    case 'reactor': r('Steam', `${fmt(d.steam)}/s`); r('Output', kw(d.heat * 1000)); r('Fuel', itemLink('uranium_fuel_cell')); break;
    case 'coolant': r('Cooling', `up to ${fmt(d.cool)} water/s`); break;
    case 'fpump': r('Pumping', `${fmt(d.rate)}/s`); break;
    case 'tank': r('Capacity', `${fmt(d.cap)} units`); break;
    case 'pipe': case 'upipe': if (d.range) r('Far end', `up to ${d.range - 1} tiles ahead`); r('Flow', d.flow ? `×${d.flow}` : '×1'); if (d.irrigation) r('Carries', 'water only'); break;
    case 'oilpump': r('Pumping', `${d.rate} crude oil/s at 100% yield`); break;
    case 'depot': r('Storage', `${d.cap} slots`); r('Fuel tank', fmt(d.fluidCap)); r('Serves', { rail: 'trains', road: 'trucks', sea: 'boats' }[d.way]); break;
    case 'greenhouse': r('Water', `${d.water}/s a tile while growing`); break;
    case 'radar': r('Live area', `${d.scan} tiles round`); r('Explores', `out to ${d.reveal} tiles`); break;
    case 'lamp': r('Light', `${d.light.r} tiles`); break;
  }
  if (d.augSlots) r('Augment slots', d.augSlots);
  if (d.onWater && d.kind !== 'pump') r('Placed on', 'water');
  r('Precision volume', fmt(d.vol, 2));
  if (d.glyph) r('Signal glyph', `<code>${d.glyph}</code>`);
  return rows;
}

// ---------------------------------------------------------------- where things come from
function sources(id) {
  const out = [];
  const where = (layer, label) => { const b = BIOMES.filter(x => x[layer]?.[id]).map(x => link(x.name)); if (b.length) out.push(`${label}: ${listing(b)}.`); };
  if (D.ITEMS[id]?.shape === 'ore' || id === 'crystal') {
    where('ores', 'Surface deposits in'); where('under', 'Layer −1 deposits in'); where('deep', 'Layer −2 deposits in');
    if (['iron_ore', 'copper_ore', 'coal', 'stone'].includes(id)) out.push('Starter deposits sit close to the [[World generation#The landing site|landing site]] in every world.');
    if (['crystal', 'abyssal_ore'].includes(id)) out.push('Starter deposits lie under the [[World generation#The landing site|landing site]] in every world.');
    if (STRAY_ORES[id]) out.push(`Rare stray deposits anywhere at least ${STRAY_ORES[id].far} tiles from the landing site.`);
  }
  const feats = Object.values(FEATURES).filter(f => f.gives[id]);
  if (feats.length) out.push(`${feats.some(f => f.tool === 'axe') ? 'Chopping' : 'Breaking'} ${listing(feats.map(f => `${f.name.toLowerCase()}s (${f.gives[id]})`))} with the ${listing([...new Set(feats.map(f => f.tool))].map(t => link('Tools#' + TOOLS[t].name, t)))}.`);
  if (ITEMS[id]?.seed) {
    const b = BIOMES.filter(x => x.seeds.includes(ITEMS[id].seed));
    out.push(`Digging weedy patches in ${listing(b.map(x => link(x.name)))} with the [[Tools#Shovel|shovel]].`, 'Spare seeds from a [[Agriculture#Greenhouses|greenhouse]] growing this crop.');
  }
  if (ITEMS[id]?.crop) out.push(`Grown in a [[Agriculture#Greenhouses|greenhouse]] from ${itemLink(D.seedId(id))}.`);
  if (id === 'raw_fish') out.push('Caught by hand (hold right-click on a fish) or with a [[Fishing net]] on a cargo boat. See [[Fishing]].');
  if (id === 'water') out.push(`Pumped by a ${itemLink('water_pump')} (${ENTITIES.water_pump.rate}/s) or a ${itemLink('hp_pump')} (${ENTITIES.hp_pump.rate}/s) placed on water.`);
  if (id === 'steam') out.push(`Boiled from water by a ${itemLink('boiler')} (${ENTITIES.boiler.steam}/s) or a ${itemLink('reactor')} (${ENTITIES.reactor.steam}/s).`);
  if (id === 'crude_oil') out.push(`Pumped from crude oil wells by a ${itemLink('oil_pump')}. Wells never run dry but slow down to 20% yield.`);
  return out;
}

// ---------------------------------------------------------------- generated item pages
function itemInfobox(id) {
  const it = ITEMS[id], fl = FLUIDS[id], c = classOf(id), rows = [];
  const r = (k, v) => v != null && v !== '' && rows.push([k, v]);
  r('Type', link(c.topic, cap(c.label)));
  if (it) r('Stack size', it.stack);
  if (it?.fuel) r('Fuel value', `${it.fuel} MJ`);
  if (it?.nuclear) r('Fuel value', `${it.nuclear} MJ (reactors only)`);
  if (fl?.fuel) r('Fuel value', `${fl.fuel} MJ a unit`);
  if (it?.food) { r('Well fed', `${it.food} s`); r('Heals', `${it.heal} health`); }
  if (it?.barrel) r('Holds', `${BARREL_SIZE} ${itemLink(it.barrel)}`);
  if (it?.aug) { const a = AUGMENTS[it.aug]; r('Effect', it.desc.split('.')[0]); r('Tier', `${it.tier} of ${a.tiers.length}`); }
  if (it?.engine) { const en = ENGINES[id]; r('Power', kw(en.power)); r('Burns', itemLink(en.fuel)); }
  if (it?.vehicle) { const s = D.vehicleStats(id); r('Moves on', { land: 'land', road: 'roads', rail: 'rails', sea: 'water' }[s.way]); if (s.power) { r('Top speed', `${fmt(s.top, 2)} tiles/s`); r('Engine', `${kw(s.power)}, burns ${itemLink(s.fuel)}`); } if (s.cargo) r('Cargo', `${s.cargo} slots`); if (s.tank) r('Fuel tank', fmt(s.tank)); }
  if (it?.road) { const rd = ROADS[it.road]; r('Truck speed', rd.speed ? `${Math.round(rd.speed * 100)}%` : 'not for trucks'); if (rd.walk) r('Walking', `×${D.SIDEWALK_SPEED}`); }
  if (ENTITIES[id]) for (const row of entityRows(id)) rows.push(row);
  const rec = RECIPE[id];
  if (rec) { r('Recipe', amounts(rec.in, rec.fin)); r('Craft time', `${fmt(rec.time, 2)} s` + (Object.values(rec.out)[0] > 1 ? ` (makes ${Object.values(rec.out)[0]})` : '')); r('Made in', madeIn(rec)); }
  const t = unlockTech(id);
  if (rec || t) r('Research', t ? techLink(t) : 'none (from the start)');
  return { title: itemTitle(id), img: id, caption: it?.desc ? '' : '', rows };
}
function itemLead(id) {
  const it = ITEMS[id], fl = FLUIDS[id], c = classOf(id), name = itemTitle(id);
  let s = it?.seed ? `'''${esc(name)}''' are the seeds of ${itemLink(it.seed, esc(lcFirst(itemTitle(it.seed))))}, a [[Agriculture|crop]] in [[Depthworks]].`
    : `'''${esc(name)}''' ${PLURAL.has(name) ? 'are' : 'is'} ${aOrAn(c.label)} ${link(c.topic, c.label)} in [[Depthworks]].`;
  if (it?.desc) s += ' ' + esc(it.desc);
  else if (ENTITIES[id]?.desc) s += ' ' + esc(ENTITIES[id].desc);
  else if (fl) s += fl.fuel ? ` Engines burn it for ${fl.fuel} MJ a unit.` : '';
  const rec = RECIPE[id];
  if (rec && !it?.desc && !ENTITIES[id]?.desc) s += ` It is made from ${amountsText(rec.in, rec.fin)} in ${fmt(rec.time, 2)} seconds.`;
  if (rec && (it?.desc || ENTITIES[id]?.desc)) s += ` It is made from ${amountsText(rec.in, rec.fin)}.`;
  return s;
}
function itemBody(id) {
  const it = ITEMS[id], parts = [itemLead(id)];
  const prod = producers(id), src = sources(id);
  if (prod.length || src.length) {
    parts.push('== Obtaining ==');
    if (src.length) parts.push(src.map(s => '* ' + s).join('\n'));
    if (prod.length) parts.push(recipeTable(prod));
  }
  const use = consumers(id), packTechs = it?.shape === 'pack' ? TECHS.filter(t => t.cost[id]) : [], meds = MEDICAL.filter(m => m.crop === id);
  const isFuel = it?.fuel || FLUIDS[id]?.fuel;
  if (use.length || packTechs.length || meds.length || isFuel || it?.food) {
    parts.push('== Usage ==');
    const notes = [];
    if (it?.fuel) notes.push(`* Fuel: ${it.fuel} MJ a piece in burner buildings (${listing(['stone furnaces', 'burner drills', 'burner inserters', 'boilers', 'braziers'])}). See [[Fuel]].`);
    if (FLUIDS[id]?.fuel) notes.push(`* Engine fuel: ${FLUIDS[id].fuel} MJ a unit for ${listing(Object.values(ENGINES).filter(e => e.fuel === id).map(e => itemLink(Object.keys(ENGINES).find(k => ENGINES[k] === e))))}${id === 'diesel' ? ' and the ' + itemLink('fuel_generator') : ''}.`);
    if (it?.food) notes.push(`* Food: hold it and click to eat. Heals ${it.heal} and makes you [[Food|well fed]] for ${it.food} s.`);
    if (packTechs.length) notes.push(`* Research: ${packTechs.length} technologies use it, ${fmt(packTechs.reduce((t, x) => t + x.count, 0), 0)} packs in all. See [[List of technologies]].`);
    if (meds.length) notes.push(`* [[Medical research]]: every unit of ${listing(meds.map(m => `'''${m.name}'''`))} takes one.`);
    if (it?.seed) notes.push('* Pressed into [[Chlorophyll]] (any seeds) and planted in greenhouses: a room keeps one seed for every five tiles.');
    if (notes.length) parts.push(notes.join('\n'));
    if (use.length) parts.push(recipeTable(use));
  }
  if (NOTES[id]) parts.push('== Notes ==', NOTES[id]);
  parts.push('== See also ==', `* [[${classOf(id).topic}]]\n* [[List of ${ENTITIES[id] ? 'buildings' : 'items'}]]`);
  return parts.join('\n\n');
}
for (const id of Object.keys(ITEMS)) {
  const c = classOf(id);
  addPage({ title: itemTitle(id), kind: 'item', id, icon: id, desc: cap(c.label) + (c.group && c.label === 'building' ? ` · ${c.group}` : ''),
    cats: [c.cat, ...(c.label === 'building' ? [c.group] : [])], box: () => itemInfobox(id), src: () => itemBody(id) });
}
for (const id of FLUID_IDS) addPage({ title: FLUIDS[id].name, kind: 'item', id, icon: id, desc: 'Fluid', cats: ['Fluids'], box: () => itemInfobox(id), src: () => itemBody(id) });

// ---------------------------------------------------------------- generated biome pages
const CLIMATE = (v, words) => words[Math.min(words.length - 1, Math.floor(v * words.length))];
function biomeSwatch(b) {   // a 16×16 patch of the biome's ground, with a little of its ground cover
  const c = document.createElement('canvas'); c.width = c.height = 16;
  const g = c.getContext('2d'), pal = b.ground.pal;
  let s = b.id.length * 977 + b.id.charCodeAt(0);
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const p = pal[Math.floor(rnd() * pal.length)]; g.fillStyle = `rgb(${p[0]},${p[1]},${p[2]})`; g.fillRect(x, y, 1, 1); }
  for (const [, col, share] of b.flora) for (let i = 0; i < Math.max(2, share * 60); i++) { g.fillStyle = '#' + col.toString(16).padStart(6, '0'); g.fillRect(Math.floor(rnd() * 15), Math.floor(rnd() * 15), 1, 2); }
  return c.toDataURL();
}
const swatches = {};
const swatch = b => swatches[b.id] ||= biomeSwatch(b);
const ORE_PAT = { vein: 'in veins', scatter: 'as scattered nuggets' };
function oreRows(b, layer) {
  return Object.entries(b[layer] || {}).map(([o, d]) => `* ${itemLink(o)}: ${d.w >= 1.4 ? 'very common' : d.w >= 1 ? 'common' : d.w >= .7 ? 'fairly common' : 'uncommon'}${d.size >= 1.3 ? ', in big patches' : ''}${ORE_PAT[d.pat] ? ', ' + ORE_PAT[d.pat] : ''}${d.rich > 1 ? `, rich (×${d.rich})` : ''}`).join('\n');
}
function biomeBox(b) {
  const h = b.hazard && HAZARDS[b.hazard];
  return { title: b.name, swatch: swatch(b), caption: esc(b.ground.name), rows: [
    ['Hazard', h ? link('Hazards#' + h.name, h.name) : 'none'],
    ['Climate', `${CLIMATE(b.clim[0], ['freezing', 'cold', 'mild', 'warm', 'hot'])}, ${CLIMATE(b.clim[1], ['arid', 'dry', 'moderate', 'damp', 'wet'])}${b.clim[2] > .6 ? ', strange' : ''}`],
    ['Landing site', b.spawn ? 'possible' : 'never'],
    ['Surface ores', Object.keys(b.ores).map(o => iconLink(o)).join(' ')],
    ['Underground', [...new Set([...Object.keys(b.under || {}), ...Object.keys(b.deep || {})])].map(o => iconLink(o)).join(' ')],
    ['Trees', Object.keys(b.trees).map(t => FEATURES[t].name).join(', ')],
    ['Crops', b.seeds.map(s => iconLink(s)).join(' ')],
    ['Crude oil', b.oil >= .6 ? 'common' : b.oil >= .35 ? 'some' : 'rare']] };
}
function biomeBody(b) {
  const h = b.hazard && HAZARDS[b.hazard], adapt = h && MED[h.adapt];
  const parts = [(PLURAL.has(b.name) ? `The '''${esc(b.name)}''' are` : `'''${esc(b.name)}''' is`) + ` a [[Biomes|biome]] in [[Depthworks]]. ${BIOME_TEXT[b.id] ?? ''}` + (h ? ` Its hazard is '''${esc(h.name.toLowerCase())}''': ${esc(lcFirst(h.desc))}` : ' It has no hazard.')];
  parts.push('== Resources ==', '=== On the surface ===', oreRows(b, 'ores'));
  if (b.under) parts.push('=== Layer −1 ===', oreRows(b, 'under'));
  if (b.deep) parts.push('=== Layer −2 ===', oreRows(b, 'deep'));
  parts.push(`Crude oil wells are ${b.oil >= .6 ? 'common here' : b.oil >= .35 ? 'found here and there' : 'rare here'}.` + (b.id === 'pripyat' ? ' Uranium ore is far more common here than anywhere else.' : ''));
  const trees = Object.keys(b.trees), rock = FEATURES[b.rockKind || 'rock'];
  parts.push('== Trees and rocks ==', trees.map(t => `* '''${FEATURES[t].name}''': ${amountsText(FEATURES[t].gives)}`).join('\n') + `\n* '''${rock.name}''': ${amountsText(rock.gives)}`);
  parts.push('== Crops ==', `Weedy patches here give seeds of ${listing(b.seeds.map(s => itemLink(D.seedId(s))))}.` + (b.seeds.some(s => CROPS[s].irr) ? ' These seeds are irradiated: finding one opens the mutations in the [[Medical research|medical lab]].' : ''));
  if (h) parts.push('== Hazard ==', `Staying here builds up ${esc(h.name.toLowerCase())} exposure over 12 seconds; leaving lets it fade. At full exposure: ${esc(lcFirst(h.desc))} It never kills. The '''${esc(adapt.name)}''' upgrade in the [[Medical research|medical lab]] halves it a level, and needs ${itemLink(adapt.crop)}.`);
  parts.push('== See also ==', '* [[Biomes]]\n* [[World generation]]' + (h ? '\n* [[Hazards]]' : ''));
  return parts.join('\n\n');
}
for (const b of BIOMES) addPage({ title: b.name, kind: 'biome', id: b.id, icon: Object.keys(b.ores)[0], desc: 'Biome' + (b.hazard ? ` · ${HAZARDS[b.hazard].name}` : ''), cats: ['Biomes'], box: () => biomeBox(b), src: () => biomeBody(b) });

// ---------------------------------------------------------------- generated technology pages
const catName = c => TECH_CATS.find(x => x.id === c)?.name ?? c;
function unlockText(u) {
  if (ITEMS[u]) return itemLink(u);
  if (RECIPE[u]) return `${img(recipeIcon(RECIPE[u]), 'px ic')} ${esc(recipeName(RECIPE[u]))} (recipe)`;
  const special = { 'layer -1': '[[Depth|Layer −1]]', 'layer -2': '[[Depth|Layer −2]]', clarity: '[[The Signal#Clarity|Clearer translation]] of the Signal', factories: '[[Factories|Founding new factories]]',
    'cables from poles to machines': '[[Electricity#Direct wiring|Power cables from poles straight to machines]]', shovel: '[[Tools#Shovel|The shovel]]' };
  return special[u] ?? esc(cap(u));
}
function techCostAll(id) {   // every pack needed, from nothing, prerequisites included
  const seen = new Set(), tot = {};
  const visit = t => { if (seen.has(t)) return; seen.add(t); for (const p of TECH[t].pre) visit(p); for (const p of Object.keys(TECH[t].cost)) tot[p] = (tot[p] || 0) + TECH[t].count; };
  visit(id); return { tot, n: seen.size };
}
function techInfobox(id) {
  const t = TECH[id], rows = [];
  const first = t.unlocks.find(u => ITEMS[u]) || (t.tool ? null : null);
  rows.push(['Section', link('Research#' + catName(t.cat), catName(t.cat))]);
  rows.push(['Cost per unit', amounts(t.cost)]);
  rows.push(['Units', t.count]);
  rows.push(['Time per unit', `${t.time} s`]);
  rows.push(['Total', amounts(Object.fromEntries(Object.keys(t.cost).map(p => [p, t.count])))]);
  if (t.precision) rows.push(['Precision', link('Precision', `tier ${t.precision} (${TIERS[t.precision].name})`)]);
  rows.push(['Requires', t.pre.length ? t.pre.map(p => techLink(p)).join('<br>') : '<span class="dim">nothing</span>']);
  const next = TECHS.filter(x => x.pre.includes(id));
  if (next.length) rows.push(['Leads to', next.map(x => techLink(x.id)).join('<br>')]);
  return { title: t.name, img: first || (t.tool ? { shovel: 'wheat_seeds', axe: 'wood', pickaxe: 'iron_ore' }[t.tool] : 'lab'), rows };
}
function techBody(id) {
  const t = TECH[id], packs = Object.keys(t.cost).map(p => itemLink(p, esc(lcFirst(itemTitle(p)))));
  let lead = `'''${esc(t.name)}''' is a [[Research|technology]] in the ${link('Research#' + catName(t.cat), catName(t.cat))} section of the research tree. It takes ${t.count} units of research; each unit uses ${listing(packs.map(p => 'one ' + p))} and ${t.time} seconds of lab time, so ${fmt(t.count * t.time / 60)} lab-minutes in all.`;
  if (t.precision) lead += ` Labs only start on it once your factory has reached [[Precision|precision tier]] ${t.precision}.`;
  if (t.tool) lead += ` It is one of the [[Tools#Upgrades|tool upgrades]].`;
  const parts = [lead, '== Unlocks ==', t.unlocks.map(u => '* ' + unlockText(u)).join('\n')];
  const recs = t.unlocks.flatMap(u => RECIPES.filter(r => r.id === u && r.tech === id)).concat(RECIPES.filter(r => r.tech === id && !t.unlocks.includes(r.id)));
  const uniq = [...new Map(recs.map(r => [r.id, r])).values()];
  if (uniq.length) parts.push('=== Recipes ===', recipeTable(uniq, { noTech: true }));
  const { tot, n } = techCostAll(id);
  parts.push('== Cost from scratch ==', `Researching '''${esc(t.name)}''' from a new world means ${n === 1 ? 'only this technology' : `${n} technologies, this one and everything it needs`}: ${amountsText(tot)}.`);
  const next = TECHS.filter(x => x.pre.includes(id));
  if (t.pre.length || next.length) {
    parts.push('== Place in the tree ==');
    if (t.pre.length) parts.push(`'''Requires:''' ${listing(t.pre.map(p => techLink(p)))}.`);
    if (next.length) parts.push(`'''Leads to:''' ${listing(next.map(x => techLink(x.id)))}.`);
  }
  parts.push('== See also ==', '* [[Research]]\n* [[List of technologies]]' + (t.tool ? '\n* [[Tools]]' : ''));
  return parts.join('\n\n');
}
for (const t of TECHS) addPage({ title: techTitle(t.id), kind: 'tech', id: t.id, icon: techInfobox(t.id).img, desc: `Technology · ${catName(t.cat)}`, cats: ['Technologies'], box: () => techInfobox(t.id), src: () => techBody(t.id) });

// ---------------------------------------------------------------- generated tables, for {{gen|...}} in articles
const th = (...cols) => `<thead><tr>${cols.map(c => `<th>${c}</th>`).join('')}</tr></thead>`;
const table = (head, rows, cls = 'wikitable sortable') => `<div class="tablewrap"><table class="${cls}">${head}<tbody>${rows.join('')}</tbody></table></div>`;
const num = (v, text) => `<td class="num" data-sort="${v}">${text ?? fmt(v, 2)}</td>`;
const entsOfKind = (...kinds) => Object.keys(ENTITIES).filter(id => kinds.includes(ENTITIES[id].kind));
const techOf = id => { const t = unlockTech(id); return t ? techLink(t) : '<span class="dim">start</span>'; };
const biomeOres = (b, layer) => Object.keys(b[layer] || {}).map(o => iconLink(o)).join(' ');
const GEN = {
  belts: () => table(th('Belt', 'Speed', 'Lanes', 'Throughput', 'Underground reach', 'Research'), Object.keys(ENTITIES).filter(id => ENTITIES[id].kind === 'belt').map(id => {
    const d = ENTITIES[id], u = Object.keys(ENTITIES).find(k => ENTITIES[k].kind === 'underground' && ENTITIES[k].speed === d.speed && (ENTITIES[k].lanes ?? 2) === (d.lanes ?? 2));
    return `<tr><td>${itemLink(id)}</td>${num(d.speed, d.speed + ' tiles/s')}${num(d.lanes ?? 2)}${num(throughput(d), fmt(throughput(d)) + '/s')}<td>${u ? `${itemLink(u)}: ${ENTITIES[u].range - 1} tiles` : '—'}</td><td>${techOf(id)}</td></tr>`; })),
  inserters: () => table(th('Inserter', 'Swing (each way)', 'Items/s', 'Reach', 'Energy', 'Research'), entsOfKind('inserter').map(id => { const d = ENTITIES[id];
    return `<tr><td>${itemLink(id)}</td>${num(d.swing, d.swing + ' s')}${num(1 / (2 * d.swing))}${num(d.reach)}<td>${d.burner ? 'fuel' : kw(d.power)}</td><td>${techOf(id)}</td></tr>`; })),
  drills: () => table(th('Drill', 'Size', 'Rate (full cover)', 'Deepest layer', 'Energy', 'Augment slots', 'Research'), entsOfKind('drill').map(id => { const d = ENTITIES[id];
    return `<tr><td>${itemLink(id)}</td><td>${d.size ? d.size.join('×') : '1×1'}</td>${num(d.rate, `${fmt(d.rate, 2)}/s (${fmt(d.rate * 60)}/min)`)}<td>${DEPOSIT[d.depth].name}</td><td>${d.burner ? 'fuel (150 kW)' : kw(d.power)}${d.acid ? ' + acid' : ''}</td>${num(d.augSlots)}<td>${techOf(id)}</td></tr>`; })),
  furnaces: () => table(th('Furnace', 'Speed', 'Energy', 'Augment slots', 'Research'), entsOfKind('furnace').map(id => { const d = ENTITIES[id];
    return `<tr><td>${itemLink(id)}</td>${num(d.speed, '×' + d.speed)}<td>${d.burner ? 'fuel (90 kW)' : kw(d.power)}</td>${num(d.augSlots)}<td>${techOf(id)}</td></tr>`; })),
  assemblers: () => table(th('Machine', 'Speed', 'Power', 'Augment slots', 'Makes', 'Research'), entsOfKind('assembler').map(id => { const d = ENTITIES[id];
    return `<tr><td>${itemLink(id)}</td>${num(d.speed, '×' + d.speed)}<td>${kw(d.power)}</td>${num(d.augSlots)}<td>${(d.cats || ['craft']).map(c => ({ craft: 'crafting recipes', refine: 'refining', chem: 'chemistry', barrel: 'barrels', vehicle: 'vehicles', centrifuge: 'enrichment' })[c]).join(', ')}</td><td>${techOf(id)}</td></tr>`; })),
  smelting: () => recipeTable(RECIPES.filter(r => r.cat === 'smelt')),
  recipes: cat => recipeTable(RECIPES.filter(r => r.cat === cat)),
  'recipes-tech': tech => recipeTable(RECIPES.filter(r => r.tech === tech), { noTech: true }),
  'recipes-of': ids => recipeTable(ids.split(',').map(s => RECIPE[s.trim()]).filter(Boolean)),
  fuels: () => table(th('Fuel', 'Energy', 'Lasts in a stone furnace', 'Burned by'), [
    ...Object.keys(ITEMS).filter(id => ITEMS[id].fuel).map(id => `<tr><td>${itemLink(id)}</td>${num(ITEMS[id].fuel, ITEMS[id].fuel + ' MJ')}${num(ITEMS[id].fuel / .09, fmt(ITEMS[id].fuel / .09, 0) + ' s')}<td>burner buildings</td></tr>`),
    `<tr><td>${itemLink('uranium_fuel_cell')}</td>${num(4000, '4000 MJ')}<td class="c">—</td><td>uranium reactors only</td></tr>`,
    ...D.FUELS.map(f => `<tr><td>${itemLink(f)}</td>${num(FLUIDS[f].fuel, FLUIDS[f].fuel + ' MJ a unit')}<td class="c">—</td><td>${listing(Object.keys(ENGINES).filter(e => ENGINES[e].fuel === f).map(e => itemLink(e)).concat(f === 'diesel' ? [itemLink('fuel_generator')] : []))}</td></tr>`)]),
  poles: () => table(th('Pole', 'Voltage', 'Supply area', 'Wire reach', 'Wires to machines', 'Research'), entsOfKind('pole').map(id => { const d = ENTITIES[id], v = d.volts || [d.volt];
    return `<tr><td>${itemLink(id)}</td><td>${v.map(x => VOLTAGES[x].short).join(' → ')}</td>${num(d.supply, `${d.supply * 2 + 1}×${d.supply * 2 + 1}`)}${num(d.wire, d.wire + ' tiles')}<td class="c">${D.wiresBuildings(d) ? '<span class="yes">yes</span>' : '<span class="no">no</span>'}</td><td>${techOf(id)}</td></tr>`; })),
  generators: () => table(th('Building', 'Output', 'Needs', 'Feeds', 'Research'), [
    ['steam_engine', `up to ${kw(900)}`, `${ENTITIES.steam_engine.steam} steam/s`, 'extra-low voltage'],
    ['fuel_generator', `up to ${kw(1500)}`, 'diesel (1 MJ a unit)', 'extra-low voltage'],
    ['solar', `up to ${kw(60)}`, 'daylight', 'low voltage'],
    ['dam', `${kw(180)} a tile (more on rivers)`, `${kw(300)} to start`, 'high voltage'],
    ['boiler', `${kw(1800)} of steam`, `fuel and ${ENTITIES.boiler.steam} water/s`, 'steam engines'],
    ['reactor', `${kw(60000)} of steam`, 'uranium fuel cells, water, cooling', 'steam engines']].map(([id, o, n, f]) => `<tr><td>${itemLink(id)}</td><td>${o}</td><td>${n}</td><td>${f}</td><td>${techOf(id)}</td></tr>`)),
  voltages: () => table(th('Voltage', 'Short', 'Wire colour', 'Machines draw from it', 'Poles'), [2, 0, 1].map(i => { const v = VOLTAGES[i];
    return `<tr><td>${v.name}</td><td class="c">${v.short}</td><td><span style="display:inline-block;width:32px;height:6px;background:#${v.wire.toString(16).padStart(6, '0')};vertical-align:middle"></span></td><td class="c">${v.consumers ? '<span class="yes">yes</span>' : '<span class="no">no</span>'}</td><td>${entsOfKind('pole').filter(id => (ENTITIES[id].volts || [ENTITIES[id].volt]).includes(i)).map(id => itemLink(id)).join(', ')}</td></tr>`; }), 'wikitable'),
  fluidbuildings: () => table(th('Building', 'What it does', 'Numbers', 'Research'), ['pipe', 'underground_pipe', 'steel_pipe', 'underground_steel_pipe', 'pump', 'valve', 'storage_tank', 'barreler', 'water_pump', 'hp_pump'].map(id => { const d = ENTITIES[id];
    const n = d.kind === 'pipe' ? `${d.cap} a tile, flow ×${d.flow || 1}` : d.kind === 'upipe' ? `${d.range - 1} tiles, flow ×${d.flow || 1}` : d.kind === 'fpump' ? `${d.rate}/s, ${kw(d.power)}` : d.kind === 'tank' ? `${fmt(d.cap)} units` : d.kind === 'pump' ? `${d.rate} water/s` : d.power ? kw(d.power) : '';
    return `<tr><td>${itemLink(id)}</td><td>${esc(d.desc.split('. ')[0])}.</td><td>${n}</td><td>${techOf(id)}</td></tr>`; })),
  fluids: () => table(th('Fluid', 'Engine fuel', 'Barrels', 'Comes from'), FLUID_IDS.map(f => `<tr><td>${itemLink(f)}</td><td>${FLUIDS[f].fuel ? FLUIDS[f].fuel + ' MJ' : '—'}</td><td class="c">${FLUIDS[f].barrel ? '<span class="yes">yes</span>' : '<span class="no">no</span>'}</td><td>${f === 'water' ? 'water pumps' : f === 'steam' ? 'boilers, reactors' : f === 'crude_oil' ? 'pumpjacks' : producers(f).map(r => esc(recipeName(r))).join(', ')}</td></tr>`)),
  deposits: () => table(th('Layer', 'Size (× the tile\'s richness)', 'Mining speed', 'Double yield', 'Drills that reach it'), DEPOSIT.map((L, i) => `<tr><td><b>${L.name}</b></td><td class="c">${L.size ? '×' + L.size : 'endless'}</td>${num(L.speed, Math.round(L.speed * 100) + '%')}<td class="c">${L.double ? `1 cycle in ${Math.round(1 / L.double)}` : '—'}</td><td>${entsOfKind('drill').filter(id => ENTITIES[id].depth >= i).map(id => itemLink(id)).join(', ')}${i ? `, or any drill with a ${itemLink(D.augId('depth', i), 'depth augment')}` : ''}</td></tr>`), 'wikitable'),
  orestages: () => table(th('Stage', 'Wear reached', 'What you see'), D.ORE_STAGES.map((s, i) => `<tr>${num(i, i + 1)}<td class="c">${s.at}</td><td>${['Barely any ore: a few stones in the soil', 'First piles of ore turned up', 'More piles, the ground starts to take the ore\'s colour', 'Four piles, a shallow pit', 'Surface worked out: larger piles, darker pit', 'Down at bedrock: a deep, dark pit with grey spoil'][i]}</td></tr>`), 'wikitable'),
  biomes: () => table(th('Biome', 'Hazard', 'Surface ores', 'Layer −1', 'Layer −2', 'Trees', 'Crops', 'Oil'), BIOMES.map(b => `<tr><td>${link(b.name)}</td><td>${b.hazard ? link('Hazards#' + HAZARDS[b.hazard].name, HAZARDS[b.hazard].name) : '<span class="dim">none</span>'}</td><td>${biomeOres(b, 'ores')}</td><td>${biomeOres(b, 'under')}</td><td>${biomeOres(b, 'deep')}</td><td>${Object.keys(b.trees).map(t => FEATURES[t].name).join(', ')}</td><td>${b.seeds.map(s => iconLink(s)).join(' ')}</td>${num(b.oil, b.oil >= .6 ? 'common' : b.oil >= .35 ? 'some' : 'rare')}</tr>`)),
  hazards: () => table(th('Hazard', 'Found in', 'Effect at full exposure', 'Adaptation (medical)', 'Its crop'), Object.entries(HAZARDS).map(([h, z]) => { const m = MED[z.adapt];
    return `<tr><td><b style="color:${z.color}">■</b> ${z.name}</td><td>${BIOMES.filter(b => b.hazard === h).map(b => link(b.name)).join(', ')}</td><td>${esc(z.desc)}</td><td>${m ? esc(m.name) : '—'}</td><td>${m?.crop ? itemLink(m.crop) : '—'}</td></tr>`; }), 'wikitable'),
  trees: () => table(th('Feature', 'Tool', 'Time', 'Gives', 'Grows in'), Object.entries(FEATURES).map(([id, f]) => `<tr><td>${f.name}</td><td>${link('Tools#' + TOOLS[f.tool].name, TOOLS[f.tool].name)}</td>${num(f.time, f.time + ' s')}<td>${amounts(f.gives)}</td><td>${BIOMES.filter(b => b.trees[id] || b.rockKind === id || (id === 'rock' && !b.rockKind)).map(b => link(b.name)).join(', ')}</td></tr>`)),
  tools: () => table(th('Tool', 'Mines', 'Speed by level', 'Sweep radius by level', 'Available'), Object.entries(TOOLS).map(([id, t]) => `<tr><td><b>${t.name}</b></td><td>${esc(t.desc.split('.')[0])}</td><td>×1 → ${t.speed.map(v => '×' + v).join(' → ')}</td><td>1 tile → ${t.radius.map(v => v + ' tiles').join(' → ')}</td><td>${t.tech ? techLink(t.tech) : 'from the start'}</td></tr>`), 'wikitable'),
  tooltechs: () => table(th('Upgrade', 'Packs', 'Units', 'Gives'), TECHS.filter(t => t.tool).map(t => `<tr><td>${techLink(t.id)}</td><td>${amounts(t.cost)}</td>${num(t.count)}<td>${esc(t.unlocks[0])}</td></tr>`)),
  packs: () => table(th('Pack', 'Recipe', 'Time', 'Made by', 'Unlocked by', 'Used by'), ['red_pack', 'green_pack', 'blue_pack', 'terrestrial_pack', 'resonance_pack'].map(id => { const r = RECIPE[id];
    return `<tr><td>${itemLink(id)}</td><td>${amounts(r.in)}</td>${num(r.time, r.time + ' s')}<td>${madeIn(r, true)}</td><td>${recipeTech(r)}</td>${num(TECHS.filter(t => t.cost[id]).length, TECHS.filter(t => t.cost[id]).length + ' techs')}</tr>`; })),
  techs: cat => table(th('Technology', 'Packs', 'Units', 'Time/unit', 'Requires', 'Unlocks'), TECHS.filter(t => !cat || t.cat === cat).filter(t => cat === 'tools' || !t.tool).map(t => `<tr><td>${techLink(t.id)}${t.precision ? ` <span class="dim">(precision ${t.precision})</span>` : ''}</td><td>${amounts(t.cost)}</td>${num(t.count)}${num(t.time, t.time + ' s')}<td>${t.pre.map(p => techLink(p)).join(', ') || '<span class="dim">—</span>'}</td><td>${t.unlocks.map(u => ITEMS[u] ? iconLink(u) : unlockText(u)).join(' ')}</td></tr>`)),
  tiers: () => table(th('Tier', 'Name', 'Active volume needed', 'Highest layer', 'Opens'), TIERS.map((t, i) => `<tr>${num(i)}<td><b>${t.name}</b></td>${num(t.need)}${num(t.up)}<td>${['layers 0 and 1, coarse models', 'layer 2, and layer −1 with ' + techLink('excavation'), 'layer 3, and layer −2 with ' + techLink('deep_excavation'), 'layer 4, the finest models, and the ' + techLink('resonance') + ' technology'][i]}</td></tr>`), 'wikitable'),
  volumes: () => table(th('Building', 'Volume'), Object.keys(ENTITIES).filter(id => ENTITIES[id].vol > 0).sort((a, b) => ENTITIES[b].vol - ENTITIES[a].vol).map(id => `<tr><td>${itemLink(id)}</td>${num(ENTITIES[id].vol)}</tr>`)),
  augments: () => table(th('Augment', 'Tier 1', 'Tier 2', 'Tier 3', 'Tier 4', 'Tier 5', 'Fits'), Object.entries(AUGMENTS).map(([type, a]) => `<tr><td>${itemLink(D.augId(type, 1), a.name)}</td>${[0, 1, 2, 3, 4].map(i => a.tiers[i] == null ? '<td class="c">—</td>' : `<td class="c">${iconLink(D.augId(type, i + 1))} ${type === 'depth' ? '+' + a.tiers[i] + ' layer' + (a.tiers[i] > 1 ? 's' : '') : (type === 'efficiency' ? '−' : '+') + Math.round(a.tiers[i] * 100) + '%'}</td>`).join('')}<td>${a.only ? 'drills' : 'drills, furnaces, assemblers, labs, pumpjacks' + (a.belts ? ', belt lines' : '')}</td></tr>`), 'wikitable'),
  augrecipes: () => recipeTable(RECIPES.filter(r => ITEMS[r.id]?.aug)),
  augslots: () => table(th('Building', 'Augment slots'), Object.keys(ENTITIES).filter(id => ENTITIES[id].augSlots).map(id => `<tr><td>${itemLink(id)}</td>${num(ENTITIES[id].augSlots)}</tr>`)),
  medical: cat => table(th('Upgrade', 'Levels', 'Per level', 'Units for level 1', 'Needs first', 'Crop'), MEDICAL.filter(m => !cat || (cat === 'mutation' ? m.mutation : cat === 'adapt' ? m.hazard : !m.mutation && !m.hazard)).map(m => `<tr><td><b>${esc(m.name)}</b></td>${num(m.levels)}<td>${esc(m.desc.replace(/^Mutation: /, ''))}</td>${num(m.units)}<td>${(m.pre || []).map(([p, l]) => `${esc(MED[p].name)} ${l}`).join(', ') || '<span class="dim">—</span>'}</td><td>${m.crop ? itemLink(m.crop) : '—'}</td></tr>`)),
  medcosts: () => { const lv = [1, 2, 3, 4, 5]; return table(th('Upgrades', ...lv.map(l => 'Level ' + l)), [...new Set(MEDICAL.map(m => m.units))].sort((a, b) => a - b).map(u => {
    const ups = MEDICAL.filter(m => m.units === u), max = Math.max(...ups.map(m => m.levels));
    return `<tr><td>${ups.map(m => esc(m.name)).join(', ')}</td>${lv.map(l => l <= max ? num(Math.round(u * MED_RULES.growth ** (l - 1))) : '<td class="c dim">—</td>').join('')}</tr>`; }), 'wikitable'); },
  crops: () => table(th('Biome', 'Crops (seeds from its weedy patches)'), BIOMES.map(b => `<tr><td>${link(b.name)}</td><td>${b.seeds.map(s => itemLink(s) + (CROPS[s].irr ? ' <span class="dim">(irradiated)</span>' : '')).join(', ')}</td></tr>`), 'wikitable'),
  vehicles: () => table(th('Vehicle', 'Moves on', 'Top speed', 'Engine', 'Fuel', 'Burn at full', 'Cargo', 'Tank', 'Research'), Object.keys(VEHICLES).map(id => { const s = D.vehicleStats(id);
    return `<tr><td>${itemLink(id)}</td><td>${{ land: 'land', road: 'roads', rail: 'rails', sea: 'water' }[s.way]}</td>${num(s.top, s.power ? fmt(s.top, 2) + ' tiles/s' : 'pulled')}${num(s.power, s.power ? kw(s.power) : '—')}<td>${s.fuel ? itemLink(s.fuel) : '—'}</td>${num(s.burn, s.burn ? fmt(s.burn, 2) + '/s' : '—')}${num(s.cargo, s.cargo ? s.cargo + ' slots' : '—')}${num(s.tank, s.tank || '—')}<td>${techOf(id)}</td></tr>`; })),
  frames: () => table(th('Frame', 'Moves on', 'Mass', 'Max speed', 'Cargo', 'Parts (plus an engine)', 'Engines it takes'), Object.entries(FRAMES).map(([f, d]) => `<tr><td><b>${d.name}</b></td><td>${{ land: 'land', road: 'roads', rail: 'rails', sea: 'water' }[d.way]}</td>${num(d.mass)}${num(d.vmax, d.vmax + ' tiles/s')}${num(d.cargo, d.cargo ? d.cargo + ' slots' : '—')}<td>${amounts(d.parts)}</td><td>${d.engines.map(e => e ? iconLink(e) : 'none').join(' ')}</td></tr>`)),
  engines: () => table(th('Engine', 'Power', 'Burns', 'Recipe', 'Research'), Object.entries(ENGINES).map(([id, e]) => `<tr><td>${itemLink(id)}</td>${num(e.power, kw(e.power))}<td>${itemLink(e.fuel)}</td><td>${amounts(RECIPE[id].in)}</td><td>${techOf(id)}</td></tr>`)),
  roads: () => table(th('Surface', 'Truck speed', 'Recipe', 'Made in', 'Research'), Object.entries(ROADS).map(([id, r]) => `<tr><td>${itemLink(id)}</td>${num(r.speed || 0, r.speed ? Math.round(r.speed * 100) + '%' : 'walkers only (×' + D.SIDEWALK_SPEED + ' walking)')}<td>${amounts(RECIPE[id].in, RECIPE[id].fin)} → ${Object.values(RECIPE[id].out)[0]}</td><td>${madeIn(RECIPE[id], true)}</td><td>${techOf(id)}</td></tr>`)),
  depots: () => table(th('Depot', 'Serves', 'Placed', 'Storage', 'Fuel tank', 'Research'), entsOfKind('depot').map(id => { const d = ENTITIES[id];
    return `<tr><td>${itemLink(id)}</td><td>${{ rail: 'trains', road: 'trucks', sea: 'boats' }[d.way]}</td><td>${{ rail: 'right beside a rail', road: 'right beside a road', sea: 'on the shore' }[d.way]}</td>${num(d.cap, d.cap + ' slots')}${num(d.fluidCap)}<td>${techOf(id)}</td></tr>`; })),
  conds: () => table(th('Leave when…', 'Meaning'), [['cargo full', 'every cargo slot holds a full stack'], ['cargo empty', 'nothing left aboard (fish in a net count)'], ['waited n s', 'n seconds have passed at the stop'],
    ['nothing moved for n s', 'no item went on or off for n seconds'], ['cargo has n', 'the cargo holds at least n of an item'], ['depot has n', 'the depot holds at least n of an item'], ['next stop has room', 'the next stop is not full']].map(([a, b]) => `<tr><td><b>${a}</b></td><td>${b}</td></tr>`), 'wikitable'),
  glyphs: () => {
    const by = {}; for (const [id, d] of Object.entries(ENTITIES)) if (d.glyph) (by[d.glyph] ||= []).push(id);
    const special = { pulse: 'the transmitter itself: every sentence starts with it', hollow: 'a hollow frame with a working machine inside', above: 'a working machine above the ground (layer 1 and up)', below: 'a working machine below the ground', abyss: 'a working machine on layer −2' };
    const names = [...new Set([...Object.keys(by), 'hollow', 'above', 'below', 'abyss'])];
    return `<div class="glyphs">${names.map(g => `<div class="glyph"><canvas width="48" height="48" data-g="${g}"></canvas><b>${g}</b><span>${special[g] ?? by[g].slice(0, 4).map(id => esc(ENTITIES[id].name.toLowerCase())).join(', ') + (by[g].length > 4 ? '…' : '')}</span></div>`).join('')}</div>`;
  },
  glyphtable: () => { const by = {}; for (const [id, d] of Object.entries(ENTITIES)) if (d.glyph && d.glyph !== 'pulse') (by[d.glyph] ||= []).push(id);
    return table(th('Glyph', 'Heard from'), Object.entries(by).map(([g, ids]) => `<tr><td><code>${g}</code></td><td>${ids.map(id => iconLink(id)).join(' ')}</td></tr>`), 'wikitable'); },
  conversation: () => table(th('#', 'They send', 'Translated', 'They ask for', 'Hint'), CONVERSATION.map((c, i) => `<tr>${num(i + 1)}<td class="seq">${c.seq.join(' · ')}</td><td class="alien">${esc(c.text)}</td><td class="seq">${c.ask ? c.ask.join(' + ') : '<i>(the end)</i>'}</td><td>${c.hint ? esc(c.hint) : '—'}</td></tr>`), 'wikitable'),
  ambient: () => table(th('Glyphs they need to know', 'Message'), AMBIENT.map(a => `<tr><td class="seq">${a.seq.join(' · ')}</td><td class="alien">${esc(a.text)}</td></tr>`), 'wikitable'),
  controls: () => {
    const pretty = ks => ks.map(k => `<kbd>${esc(codeName(k).replace(/^Shift\+/, 'Shift + ').replace(/^Ctrl\+/, 'Ctrl + '))}</kbd>`).join(' or ');
    return table(th('Action', 'Default key'), ACTIONS.map(([id, name, keys]) => `<tr><td>${esc(name)}</td><td>${pretty(keys)}</td></tr>`), 'wikitable');
  },
  stats: () => table(th('', 'Base value'), [['Walking speed', `${PLAYER.speed} tiles/s`], ['Sprint', `×${PLAYER.sprint}, ${PLAYER.sprintCost} stamina/s`], ['Reach (building)', `${PLAYER.reach} tiles`], ['Reach (hand mining ore)', `${PLAYER.mineReach} tiles`],
    ['Inventory', `${PLAYER.inventory} slots`], ['Health', PLAYER.health], ['Health regeneration', `${PLAYER.regen}/s after ${PLAYER.regenDelay} s unhurt (${PLAYER.fedRegen}/s well fed)`], ['Stamina', `${PLAYER.stamina}, refills ${PLAYER.staminaRegen}/s`],
    ['Exhausted', `sprinting stops until stamina is back to ${PLAYER.rested}`], ['Vehicle hits', `${PLAYER.hitDamage} damage per tile/s of the vehicle's speed`]].map(([a, b]) => `<tr><th style="text-align:left">${a}</th><td>${b}</td></tr>`), 'wikitable'),
  daytable: () => table(th('Time', 'What happens'), [['05:30', 'Sunrise: solar panels start to give power, lamps go out'], ['08:00', 'A new world starts here'], ['13:00', 'Midday: brightest, white light, solar at its peak'], ['20:00', 'Sunset: solar stops, lamps and braziers light up'], ['00:45', 'The middle of the night: darkest']].map(([a, b]) => `<tr><td class="c"><b>${a}</b></td><td>${b}</td></tr>`), 'wikitable'),
  items: group => { const ids = Object.keys(ITEMS).filter(id => classOf(id).group === group);
    return table(th('Item', 'Stack', 'Description'), ids.map(id => `<tr><td>${itemLink(id)}</td>${num(ITEMS[id].stack)}<td>${esc(ITEMS[id].desc || ENTITIES[id]?.desc || '')}</td></tr>`)); },
  buildings: group => { const ids = Object.keys(ENTITIES).filter(id => classOf(id).group === group);
    return table(th('Building', 'Size', 'Power', 'What it does', 'Research'), ids.map(id => { const d = ENTITIES[id];
      return `<tr><td>${itemLink(id)}</td><td class="c">${d.size ? d.size.join('×') : d.drag ? 'dragged' : '1×1'}</td>${num(d.power || 0, d.power ? kw(d.power) : d.burner ? 'fuel' : '—')}<td>${esc((d.desc || '').split('. ')[0].replace(/\.$/, ''))}.</td><td>${techOf(id)}</td></tr>`; })); },
};
const ITEM_GROUPS = ['Raw resources', 'Intermediate products', 'Science packs', 'Tools and cables', 'Barrels', 'Vehicle parts', 'Vehicles', 'Augments', 'Road surfaces', 'Food', 'Seeds', 'Crops'];
const BUILD_GROUPS = ['Belts', 'Inserters', 'Storage', 'Mining', 'Smelting', 'Crafting machines', 'Research', 'Electric network', 'Power generation', 'Fluid handling', 'Oil and chemistry', 'Transport', 'Agriculture', 'Lighting', 'Map', 'Depth', 'The Signal'];

// ---------------------------------------------------------------- list pages
addPage({ title: 'List of items', kind: 'list', desc: 'Every item in the game', cats: ['Lists'], icon: 'chest',
  src: () => `This is a list of every item in [[Depthworks]] other than buildings, grouped by kind. For buildings see [[List of buildings]]; for how to make each, [[List of recipes]]. Stack sizes decide how many fit in one inventory slot.\n\n` + ITEM_GROUPS.map(g => `== ${g} ==\n\n{{gen|items|${g}}}`).join('\n\n') });
addPage({ title: 'List of buildings', kind: 'list', desc: 'Every building in the game', cats: ['Lists'], icon: 'assembler',
  src: () => `This is a list of every building in [[Depthworks]], grouped by what it is for. Click any name for its full page with recipes and numbers.\n\n` + BUILD_GROUPS.map(g => `== ${g} ==\n\n{{gen|buildings|${g}}}`).join('\n\n') });
addPage({ title: 'List of recipes', kind: 'list', desc: 'Every recipe, by machine', cats: ['Lists'], icon: 'gear',
  src: () => `Every recipe in [[Depthworks]], grouped by where it is made. ''Hand'' recipes can also be made in your inventory (see [[Crafting]]); assemblers make every crafting recipe, including the few that can't be made by hand. Click a column heading to sort.\n\n` +
    [['Crafting', 'craft'], ['Smelting', 'smelt'], ['Oil refining', 'refine'], ['Chemistry', 'chem'], ['Enrichment', 'centrifuge'], ['Barreling', 'barrel'], ['Vehicles', 'vehicle']].map(([n, c]) => `== ${n} ==\n\n{{gen|recipes|${c}}}`).join('\n\n') });
addPage({ title: 'List of technologies', kind: 'list', desc: 'Every technology, by section', cats: ['Lists'], icon: 'lab',
  src: () => `Every technology in [[Depthworks]], by its section of the research tree. See [[Research]] for how research works and [[Science packs]] for the packs.\n\n` + TECH_CATS.map(c => `== ${c.name} ==\n\n{{gen|techs|${c.id}}}`).join('\n\n') });

// ---------------------------------------------------------------- the hand-written articles
for (const a of ARTICLES) addPage({ ...a, kind: a.kind || 'article', src: () => a.body, box: a.box ? () => a.box : null });

// ---------------------------------------------------------------- templates
const BLOCK_TEMPLATES = new Set(['main', 'see', 'gen', 'note', 'tip', 'spoiler', 'further', 'thumb']);
const TEMPLATES = {
  i: (id, label) => itemLink(id.trim(), label),
  ic: id => iconLink(id.trim()),
  icon: id => img(id.trim(), 'px ic'),
  t: (id, label) => techLink(id.trim(), label),
  k: (action, all) => { const a = ACTIONS.find(x => x[0] === action.trim()); return a ? (all ? a[2] : [a[2][0]]).map(k => `<kbd>${esc(codeName(k))}</kbd>`).join(' or ') : `<kbd>${esc(action)}</kbd>`; },
  kbd: (...keys) => keys.map(k => `<kbd>${esc(k)}</kbd>`).join('+'),
  main: (...t) => `<div class="hatnote">Main article${t.length > 1 ? 's' : ''}: ${t.map(x => link(x)).join(', ')}</div>`,
  further: (...t) => `<div class="hatnote">Further information: ${t.map(x => link(x)).join(', ')}</div>`,
  see: (...t) => `<div class="hatnote">See also: ${t.map(x => link(x)).join(', ')}</div>`,
  note: text => `<div class="notice">${text}</div>`,
  tip: text => `<div class="notice tip"><b>Tip:</b> ${text}</div>`,
  spoiler: text => `<div class="notice spoiler"><b>Spoiler warning:</b> ${text}</div>`,
  gen: (name, arg) => GEN[name.trim()] ? GEN[name.trim()](arg?.trim()) : `<span class="new">[missing table ${esc(name)}]</span>`,
  d: path => { let v = D; for (const p of path.trim().split('.')) v = v?.[p]; return v == null ? '?' : esc(typeof v === 'number' ? fmt(v, 3) : v); },
  thumb: (id, caption) => `<div class="thumb">${img(id.trim(), 'px')}<div class="cap">${caption}</div></div>`.replace('class="px"', 'class="px" width="128" height="128"'),
};

// ---------------------------------------------------------------- wikitext
function splitArgs(s) {   // split on | that are not inside [[...]] or {{...}}
  const out = []; let depth = 0, cur = '';
  for (let i = 0; i < s.length; i++) {
    const two = s.slice(i, i + 2);
    if (two === '[[' || two === '{{') { depth++; cur += two; i++; continue; }
    if (two === ']]' || two === '}}') { depth--; cur += two; i++; continue; }
    if (s[i] === '|' && depth === 0) { out.push(cur); cur = ''; continue; }
    cur += s[i];
  }
  out.push(cur); return out;
}
function templates(s) {
  // innermost first, so a template may take another as an argument
  let guard = 0;
  while (s.includes('{{') && guard++ < 50) {
    const next = s.replace(/\{\{([^{}]*)\}\}/g, (m, inner, at, str) => {
      const [name, ...args] = splitArgs(inner); const f = TEMPLATES[name.trim()];
      if (!f) return `<span class="new">{{${esc(inner)}}}</span>`;
      // an item named mid-sentence reads "a transmitter", not "a Transmitter"; at the start of a sentence, list item or cell it keeps its capital
      if (name.trim() === 'i' && args.length === 1 && (ITEMS[args[0].trim()] || FLUIDS[args[0].trim()])) {
        const before = str.slice(0, at).replace(/<[^>]*>/g, '').replace(/['\s]+$/, '');
        if (before && !/[|>*#:;.!?]$/.test(before)) return itemLink(args[0].trim(), esc(lcFirst(itemTitle(args[0].trim()))));
      }
      return f(...args.map(a => a.trim()));
    });
    if (next === s) break; s = next;
  }
  return s;
}
function inline(s) {
  s = templates(s);
  s = s.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (m, t, l) => link(t.trim(), l));
  s = s.replace(/'''(.+?)'''/g, '<b>$1</b>').replace(/''(.+?)''/g, '<i>$1</i>');
  return s;
}
function listHTML(lines) {
  let html = '', stack = [];
  for (const line of lines) {
    const m = line.match(/^([*#]+)\s*(.*)$/), marks = m[1], text = m[2];
    while (stack.length > marks.length) html += `</li></${stack.pop()}>`;
    if (stack.length === marks.length && stack.length) html += '</li>';
    while (stack.length < marks.length) { const t = marks[stack.length] === '#' ? 'ol' : 'ul'; html += `<${t}>`; stack.push(t); }
    html += `<li>${inline(text)}`;
  }
  while (stack.length) html += `</li></${stack.pop()}>`;
  return html;
}
function tableHTML(lines) {
  let caption = '', cls = 'wikitable';
  const rows = [];
  for (const line of lines) {
    if (line.startsWith('{|')) { cls += line.includes('sortable') ? ' sortable' : ''; continue; }
    if (line.startsWith('|+')) { caption = inline(line.slice(2).trim()); continue; }
    const head = line.startsWith('!'), cells = line.slice(1).split(head ? '!!' : '||').map(c => c.trim());
    rows.push(`<tr>${cells.map(c => head ? `<th>${inline(c)}</th>` : `<td>${inline(c)}</td>`).join('')}</tr>`);
  }
  return `<div class="tablewrap"><table class="${cls}">${caption ? `<caption>${caption}</caption>` : ''}<tbody>${rows.join('')}</tbody></table></div>`;
}
const RAW_BLOCK = /^<(div|table|details|ul|ol|dl|p|h\d|blockquote|section|figure|canvas|aside)\b/i;
export function wikify(src) {
  const out = [], heads = [];
  const blocks = String(src).replace(/\r/g, '').split(/\n\s*\n/);
  for (let b of blocks) {
    b = b.trim(); if (!b) continue;
    const hm = b.match(/^(={2,4})\s*(.+?)\s*\1$/);
    if (hm) { const lvl = hm[1].length, id = slug(hm[2].replace(/<[^>]+>|\[\[|\]\]|'''|''/g, '')); heads.push({ lvl, id, text: hm[2] }); out.push(`<h${lvl} id="${esc(id)}">${inline(hm[2])}</h${lvl}>`); continue; }
    const lines = b.split('\n');
    if (lines.every(l => /^[*#]/.test(l))) { out.push(listHTML(lines)); continue; }
    if (lines.every(l => /^[!|]|^\{\|/.test(l))) { out.push(tableHTML(lines)); continue; }
    if (lines.every(l => /^[;:]/.test(l))) { out.push('<dl>' + lines.map(l => l[0] === ';' ? `<dt>${inline(l.slice(1).trim())}</dt>` : `<dd>${inline(l.slice(1).trim())}</dd>`).join('') + '</dl>'); continue; }
    if (b.startsWith('>')) { out.push(`<blockquote>${inline(lines.map(l => l.replace(/^>\s?/, '')).join(' '))}</blockquote>`); continue; }
    const tm = b.match(/^\{\{\s*([\w-]+)/);
    if (RAW_BLOCK.test(b) || (tm && BLOCK_TEMPLATES.has(tm[1]) && b.endsWith('}}'))) { out.push(inline(b)); continue; }
    out.push(`<p>${inline(lines.join(' '))}</p>`);
  }
  return { html: out.join('\n'), heads };
}
function tocHTML(heads) {
  if (heads.filter(h => h.lvl === 2).length < 3) return '';
  let html = '<div class="toc" role="navigation" aria-labelledby="toc-h"><div class="toc-h" id="toc-h">Contents <button type="button" data-toc>[hide]</button></div><ol>', lvl = 2;
  heads.forEach((h, i) => {
    if (h.lvl > 3) return;
    if (i) { if (h.lvl > lvl) html += '<ol>'; else { html += '</li>'; if (h.lvl < lvl) html += '</ol></li>'; } }
    lvl = h.lvl;
    html += `<li><a href="${href(current.title, h.id)}">${inline(h.text).replace(/<a [^>]*>|<\/a>/g, '')}</a>`;
  });
  html += '</li>' + (lvl === 3 ? '</ol></li>' : '') + '</ol></div>';
  return html;
}
function infoboxHTML(box) {
  if (!box) return '';
  const rows = box.rows.map(([k, v]) => k.startsWith('#') ? `<tr><th colspan="2">${inline(k.slice(1))}</th></tr>` : `<tr><th scope="row">${inline(k)}</th><td>${inline(String(v))}</td></tr>`).join('');
  const picture = box.swatch ? `<tr><td colspan="2" class="ib-img"><img class="px" src="${box.swatch}" alt=""></td></tr>${box.caption ? `<tr><td colspan="2" class="ib-cap">${inline(box.caption)}</td></tr>` : ''}` : box.img ? `<tr><td colspan="2" class="ib-img">${box.glyph ? `<canvas class="px" width="48" height="48" data-g="${box.glyph}"></canvas>` : `<img class="px" src="${iconSrc(box.img)}" alt="${esc(itemTitle(box.img))}">`}</td></tr>${box.caption ? `<tr><td colspan="2" class="ib-cap">${inline(box.caption)}</td></tr>` : ''}` : '';
  return `<table class="infobox"><caption>${esc(box.title)}</caption>${picture}${rows}</table>`;
}

// ---------------------------------------------------------------- special pages
const allPages = () => [...PAGES.values()];
const CATEGORY_DESC = { Buildings: 'Everything you can place in the world.', Lists: 'Tables of everything of one kind.', Technologies: 'Every technology in the research tree.', Guides: 'Walkthroughs and how-tos.' };
function categoryPage(name) {
  const members = allPages().filter(p => (p.cats || []).includes(name)).sort((a, b) => a.title.localeCompare(b.title));
  if (!members.length) return null;
  return { title: 'Category:' + name, kind: 'category', desc: 'Category', src: () => `${CATEGORY_DESC[name] ?? ''} This category holds ${members.length} page${members.length === 1 ? '' : 's'}.\n\n` + alphaColumns(members) };
}
function alphaColumns(pages) {
  const by = {}; for (const p of pages) { const l = p.title[0].toUpperCase(); (by[l] ||= []).push(p); }
  return `<div class="columns">${Object.keys(by).sort().map(l => `<div class="letter">${esc(l)}</div><ul>${by[l].map(p => `<li>${link(p.title)}</li>`).join('')}</ul>`).join('')}</div>`;
}
const SPECIAL = {
  allpages: () => ({ title: 'Special:AllPages', kind: 'special', desc: 'Every page', src: () => `All ${PAGES.size} pages of the wiki. Articles first, then the generated pages for every item, building and technology.\n\n== Articles ==\n\n` +
    alphaColumns(allPages().filter(p => p.kind === 'article')) + '\n\n== Lists ==\n\n' + alphaColumns(allPages().filter(p => p.kind === 'list')) +
    '\n\n== Items, buildings and fluids ==\n\n' + alphaColumns(allPages().filter(p => p.kind === 'item')) + '\n\n== Technologies ==\n\n' + alphaColumns(allPages().filter(p => p.kind === 'tech')) }),
  search: q => ({ title: 'Search results', kind: 'special', desc: '', src: () => searchResults(q) }),
};

// ---------------------------------------------------------------- search
let textIndex = null;
function plain(html) { const d = document.createElement('div'); d.innerHTML = html.replace(/<\/(li|p|h\d|td|th|dt|dd|div|tr)>/g, ' $&'); d.querySelectorAll('table.infobox, .toc').forEach(n => n.remove()); return d.textContent.replace(/\s+/g, ' ').trim(); }
function buildIndex() {
  if (textIndex) return textIndex;
  textIndex = allPages().map(p => { let t = ''; try { t = plain(wikify(p.src()).html); } catch (e) { console.warn('wiki: page failed', p.title, e); } return { p, t, lt: t.toLowerCase() }; });
  return textIndex;
}
function scoreTitle(p, q) {
  const t = norm(p.title); if (t === q) return 100;
  if (t.startsWith(q)) return 80 - t.length / 100;
  if (t.split(/[\s(,]+/).some(w => w.startsWith(q))) return 60 - t.length / 100;
  if (t.includes(q)) return 40 - t.length / 100;
  return 0;
}
function suggestions(q) {
  q = norm(q); if (!q) return [];
  const hits = allPages().map(p => [p, scoreTitle(p, q) + (p.kind === 'article' ? 5 : 0)]).filter(x => x[1] > 5);
  for (const [a, t] of ALIAS) if (a.startsWith(q) || a.includes(q)) { const r = resolve(t.split('#')[0]); if (r) hits.push([r.page, (a.startsWith(q) ? 70 : 35) + 4, a]); }
  const best = new Map(); for (const [p, s] of hits) if (!best.has(p) || best.get(p) < s) best.set(p, s);
  return [...best].sort((a, b) => b[1] - a[1]).slice(0, 8).map(x => x[0]);
}
function searchResults(q) {
  const qq = norm(q || '');
  if (!qq) return 'Type something into the search box above.';
  const words = qq.split(/\s+/).filter(Boolean);
  const res = buildIndex().map(x => {
    let s = scoreTitle(x.p, qq) * 3;
    for (const w of words) { let i = -1, n = 0; while ((i = x.lt.indexOf(w, i + 1)) >= 0 && n < 50) n++; s += n ? 4 + Math.log2(1 + n) * 3 : -30; }
    return [x, s];
  }).filter(r => r[1] > 0).sort((a, b) => b[1] - a[1]).slice(0, 40);
  if (!res.length) return `There were no results matching '''${esc(q)}'''. Try fewer or simpler words, or browse [[Special:AllPages|all pages]].`;
  const snip = x => { const i = x.lt.indexOf(words[0]); const a = Math.max(0, i - 80), s = (a ? '…' : '') + x.t.slice(a, a + 220) + '…';
    return esc(s).replace(new RegExp('(' + words.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')', 'gi'), '<mark>$1</mark>'); };
  return `<p>${res.length} result${res.length > 1 ? 's' : ''} for <b>${esc(q)}</b>.</p>` + res.map(([x]) => `<div class="result"><div class="rt">${link(x.p.title)}</div><div class="rx">${snip(x)}</div><div class="rs">${esc(x.p.desc || '')}</div></div>`).join('');
}

// ---------------------------------------------------------------- rendering a page
let current = null, glyphAnim = 0;
const $ = id => document.getElementById(id);
function parseHash() {
  const h = decodeURIComponent(location.hash.replace(/^#\/?/, ''));
  const qi = h.indexOf('?'), q = qi >= 0 ? new URLSearchParams(h.slice(qi + 1)) : null, path = qi >= 0 ? h.slice(0, qi) : h;
  const [title, ...sec] = path.split('/');
  return { title: (title || 'Main_Page').replace(/_/g, ' '), sec: sec.join('/'), q };
}
function show() {
  const { title, sec, q } = parseHash();
  let r = null, page = null;
  if (/^special:random$/i.test(title)) { const pool = allPages().filter(p => p.kind === 'article' || p.kind === 'item'); location.replace(href(pool[Math.floor(Math.random() * pool.length)].title)); return; }
  if (/^special:allpages$/i.test(title)) page = SPECIAL.allpages();
  else if (/^special:search$/i.test(title)) page = SPECIAL.search(q?.get('q') || '');
  else if (/^category:/i.test(title)) page = categoryPage(title.replace(/^category:/i, '').trim());
  else { r = resolve(title); page = r?.page; }
  if (!page) {
    const near = suggestions(title);
    page = { title, kind: 'missing', src: () => `Depthworks Wiki does not have a page called '''${esc(title)}'''.` + (near.length ? `\n\nDid you mean:\n\n${near.map(p => '* ' + link(p.title)).join('\n')}` : '')
      + `\n\nYou can <a href="#/Special:Search?q=${encodeURIComponent(title)}">search for it</a>, or browse [[Special:AllPages|all pages]].` };
  }
  current = page;
  const isMain = page.title === 'Main Page';
  document.title = isMain ? 'Depthworks Wiki' : `${page.title} - Depthworks Wiki`;
  $('title').textContent = page.title;
  $('title').hidden = isMain;
  $('tagline').hidden = isMain || page.kind === 'special';
  $('tabKind').textContent = { category: 'Category', special: 'Special page', list: 'List', tech: 'Technology' }[page.kind] ?? 'Article';
  $('redirect').hidden = !r?.from || norm(r.from) === norm(page.title);
  if (r?.from) $('redirect').innerHTML = `(Redirected from ${esc(r.from)})`;
  let html = '';
  try {
    const { html: body, heads } = wikify(page.src());
    const box = page.box?.();
    const firstH = body.search(/<h2[\s>]/);
    const toc = tocHTML(heads);
    html = infoboxHTML(box) + (firstH >= 0 ? body.slice(0, firstH) + toc + body.slice(firstH) : body + toc);
  } catch (e) { console.error(e); html = `<div class="notice">This page could not be drawn: ${esc(e.message)}</div>`; }
  $('body').innerHTML = html;
  const cats = page.cats?.length ? page.cats : null;
  $('cats').hidden = !cats;
  if (cats) $('cats').innerHTML = `<a href="#/Special:AllPages">Categories</a>: ` + cats.map(c => `<a href="${href('Category:' + c)}">${esc(c)}</a>`).join('');
  $('side').classList.remove('open'); $('menuBtn').setAttribute('aria-expanded', 'false');
  wireUp();
  const target = sec || r?.sec;
  if (target) { const el = document.getElementById(slug(target)); if (el) { el.scrollIntoView(); return; } }
  window.scrollTo(0, 0);
}
function wireUp() {
  const body = $('body');
  body.querySelectorAll('[data-toc]').forEach(b => b.addEventListener('click', () => { const t = b.closest('.toc'); t.classList.toggle('closed'); b.textContent = t.classList.contains('closed') ? '[show]' : '[hide]'; }));
  body.querySelectorAll('table.sortable').forEach(sortable);
  // in-page section links: scroll without leaving the page
  body.querySelectorAll('a[href^="#/"]').forEach(a => a.addEventListener('click', e => {
    const want = decodeURIComponent(a.getAttribute('href').slice(2)), [t, s] = want.split('/');
    if (s && norm(t) === norm(current.title)) { e.preventDefault(); history.pushState(null, '', a.getAttribute('href')); document.getElementById(s)?.scrollIntoView({ behavior: 'smooth' }); }
  }));
  const cvs = [...document.querySelectorAll('#body canvas[data-g]')];
  cancelAnimationFrame(glyphAnim);
  if (cvs.length) import('../src/signal.js').then(({ drawGlyph }) => {
    const t0 = performance.now();
    const frame = now => {
      const t = (now - t0) / 1000;
      for (const c of cvs) { const g = c.getContext('2d'); g.fillStyle = '#0b1418'; g.fillRect(0, 0, c.width, c.height); drawGlyph(g, c.dataset.g, 0, 0, t, 1, 4); }
      glyphAnim = requestAnimationFrame(frame);
    };
    glyphAnim = requestAnimationFrame(frame);
  }).catch(e => console.warn('wiki: glyphs need the game modules', e));
}
function sortable(tbl) {
  const ths = [...tbl.querySelectorAll('thead th')];
  ths.forEach((thEl, col) => {
    thEl.tabIndex = 0;
    const go = () => {
      const dir = thEl.getAttribute('aria-sort') === 'ascending' ? -1 : 1;
      ths.forEach(t => t.removeAttribute('aria-sort')); thEl.setAttribute('aria-sort', dir > 0 ? 'ascending' : 'descending');
      const body = tbl.tBodies[0], rows = [...body.rows];
      const val = r => { const c = r.cells[col]; if (!c) return ''; const v = c.dataset.sort ?? c.textContent.trim(); const n = parseFloat(v.replace(/[, ]/g, '')); return isNaN(n) || !/^[\d.,\s−-]/.test(v) ? v.toLowerCase() : n; };
      rows.sort((a, b) => { const x = val(a), y = val(b); return (typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y))) * dir; });
      rows.forEach(r => body.appendChild(r));
    };
    thEl.addEventListener('click', go); thEl.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
  });
}

// ---------------------------------------------------------------- header: search box, menu, theme, logo
function initSearch() {
  const q = $('q'), list = $('suggest'), form = $('searchForm');
  let items = [], sel = -1;
  const close = () => { list.hidden = true; sel = -1; };
  const draw = () => {
    items = suggestions(q.value);
    if (!items.length) { close(); return; }
    list.innerHTML = items.map((p, i) => `<li role="option" id="sg${i}" aria-selected="${i === sel}" data-i="${i}">${p.icon ? `<img class="px" src="${iconSrc(p.icon)}" alt="">` : '<img alt="" style="visibility:hidden">'}<span><span class="st">${esc(p.title)}</span><span class="sd">${esc(p.desc || '')}</span></span></li>`).join('')
      + `<li data-i="search"><span class="st">Search for pages containing <b>${esc(q.value)}</b></span></li>`;
    list.hidden = false;
  };
  const go = p => { close(); q.value = ''; q.blur(); location.hash = href(p.title); };
  const fullSearch = () => { const v = q.value.trim(); close(); q.blur(); location.hash = '#/Special:Search?q=' + encodeURIComponent(v); };
  q.addEventListener('input', () => { sel = -1; draw(); });
  q.addEventListener('keydown', e => {
    if (list.hidden) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); sel = Math.max(-1, Math.min(items.length - 1, sel + (e.key === 'ArrowDown' ? 1 : -1))); draw(); }
    else if (e.key === 'Escape') close();
  });
  list.addEventListener('mousedown', e => { const li = e.target.closest('li'); if (!li) return; e.preventDefault(); li.dataset.i === 'search' ? fullSearch() : go(items[+li.dataset.i]); });
  q.addEventListener('blur', () => setTimeout(close, 120));
  form.addEventListener('submit', e => {
    e.preventDefault();
    if (sel >= 0 && items[sel]) return go(items[sel]);
    const r = resolve(q.value);
    if (r) return go(r.page);
    if (q.value.trim()) fullSearch();
  });
  document.addEventListener('keydown', e => { if (e.key === '/' && document.activeElement !== q && !/input|textarea/i.test(document.activeElement.tagName)) { e.preventDefault(); q.focus(); } });
}
function initChrome() {
  // inside the game, Esc and F2 close the wiki (the game can't hear keys pressed in here)
  if (window.parent !== window) addEventListener('keydown', e => {
    if (e.key === 'F2' || (e.key === 'Escape' && $('suggest').hidden)) { e.preventDefault(); window.parent.postMessage('depthworks:closewiki', '*'); }
  });
  $('menuBtn').addEventListener('click', () => { const open = $('side').classList.toggle('open'); $('menuBtn').setAttribute('aria-expanded', String(open)); });
  $('themeBtn').addEventListener('click', () => {
    const root = document.documentElement, dark = root.dataset.theme ? root.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
    root.dataset.theme = dark ? 'light' : 'dark';
    try { localStorage.setItem('depthworks.wiki.theme', root.dataset.theme); } catch { /* storage unavailable */ }
  });
  $('randomLink').addEventListener('click', e => { e.preventDefault(); location.hash = '#/Special:Random'; });
  // the logo: a pixel globe with a signal in it
  const g = $('logo').getContext('2d');
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const d = Math.hypot(x - 7.5, y - 7.5);
    if (d > 7.6) continue;
    const grid = x % 4 === 1 || y % 4 === 1, edge = d > 6.6, shade = (x + y) / 30;
    g.fillStyle = edge ? '#1e5a63' : grid ? '#7ef6ff' : `rgb(${20 + shade * 30 | 0},${60 + shade * 50 | 0},${80 + shade * 50 | 0})`;
    g.fillRect(x, y, 1, 1);
  }
  g.fillStyle = '#ffd23f'; g.fillRect(7, 7, 2, 2); g.fillStyle = '#ffffff'; g.fillRect(4, 3, 2, 1);
}

initChrome();
initSearch();
addEventListener('hashchange', show);
show();
// for checking pages from the console
window.wiki = { PAGES, resolve, wikify, buildIndex, GEN };
