// HUD and panels. Panels re-render on a timer, so actions use pointerdown delegation via data-act.
import { ENTITIES, ITEMS, RECIPE, RECIPES, TECHS, TECH, TIERS, CONVERSATION, PLAYER, HOTBARS, VOLTAGES, TILES, FLUIDS, ROADS, FUELS, FRAMES, ENGINES, VEHICLES, DEPOSIT, AUGMENTS, DAY, FEATURES, BIOMES, HAZARDS, MEDICAL, MED, CROPS, TOOLS, recipeIcon, recipeName, groupOf } from './data.js';
import { S, world, inv, invGet, bus, key, DIRS, DIR_NAMES, itemName, recipeUnlocked, layerRange, tileAt, flowAt, factoryOf, FAC_COLORS, isResearched, endless, hourOf, daylight, patchAt, biomeIndexAt } from './state.js';
import { playerMods, maxHealth, maxStamina, reachOf, hazardAt, resistance, medLevel, unitsFor, unitCost, medAvailable } from './body.js';
import { seedsNeeded, FARM, patchName } from './farm.js';
import { damRating, REACTOR } from './plants.js';
import { maxCraftable, techAvailable, isActive, powerSummary, entSlots, slotsOf, voltsOf, nets, machineStats, depositLayer, hasTool, toolStat, toolLevel, barrelMode, TRANSFER_MODES, modesFor, stationChests, drillDeposits } from './sim.js';
import { renderTree, setTreeToast } from './research.js';
import { bpAt } from './blueprint.js';
import { segItems, lanesOf, laneName, lineName, lineItems, lineWarn, lineAugs } from './belts.js';
import { vstats, unitOf, routeById, driverOf, roadAt, dockTiles, vehicleById } from './transport.js';
import { fishTarget } from './fish.js';
import { openLogistics, renderLogistics, drawLogistics, showBeltLine, lineEndHTML } from './logistics.js';
import { iconHTML, iconURL, fmtN, toolCursor } from './icons.js';
import { sentenceFor, drawStrip, maskText, clarity, currentAsk, HEAR_RADIUS } from './signal.js';
import { ROAD_POWER, ELV, WIRE_TECH } from './data.js';
import { project } from './scene.js';
import { doAction, chat, netInfo } from './net.js';
import { ACTIONS, keyName, keyNames, rebind, resetKeys, MOUSE_ACTIONS, combo, is } from './input.js';
import { CLIP_UI, clipFromPanel, pasteToPanel, copyBuilding, setClip } from './copypaste.js';
import { renderSide, openMapView } from './map.js';
import { myTrade, offerList } from './trade.js';
import { TRADE } from './data.js';

const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const setHTML = (el, html) => { if (el._html !== html) { el.innerHTML = html; el._html = html; } };
const hexCss = c => '#' + (c ?? 0x7d8796).toString(16).padStart(6, '0');
const typing = el => el && el.contains(document.activeElement) && /INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName);
// A small chip with the factory's colour and name.
export const facChip = (id, act = '') => { const f = factoryOf(id ?? 1); return `<span class="facchip"${act ? ` data-act="${act}"` : ''}><i style="background:${f?.color ?? '#888'}"></i>${esc(f?.name ?? '?')}</span>`; };

// ---------------------------------------------------------------- toasts + tooltip
let toastTimer;
export function toast(text, ms = 2400, cls = '') {
  const t = $('toast'); t.textContent = text; t.className = 'panel ' + cls; t.style.display = 'block';
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.style.display = 'none', ms);
}
const tip = $('tip');
addEventListener('pointermove', e => {
  const el = e.target.closest?.('[data-tip]');
  if (!el) { tip.style.display = 'none'; return; }
  setHTML(tip, el.dataset.tip); tip.style.display = 'block';
  const w = tip.offsetWidth, h = tip.offsetHeight;
  tip.style.left = Math.min(innerWidth - w - 8, e.clientX + 14) + 'px';
  tip.style.top = Math.min(innerHeight - h - 8, e.clientY + 14) + 'px';
});
const tipAttr = html => ` data-tip="${esc(html)}"`;
const MACHINE_FOR = { smelt: 'furnace', craft: 'assembler', refine: 'oil refinery', chem: 'chemical plant', barrel: 'barreling station', vehicle: 'vehicle factory', centrifuge: 'centrifuge' };
function recipeTip(r) {
  const outs = [...Object.entries(r.out).map(([k, n]) => `${n}× ${itemName(k)}`), ...Object.entries(r.fout || {}).map(([k, n]) => `${n} ${FLUIDS[k].name.toLowerCase()}`)].join(', ');
  const ins = Object.entries(r.in).map(([k, n]) => { const g = groupOf(k); return `<div>${iconHTML(g ? g.icon : k)} ${n} × ${g ? g.name.toLowerCase() : itemName(k)} <span class="dim">(have ${fmtN(g ? Object.keys(ITEMS).filter(g.match).reduce((t, it) => t + invGet(it), 0) : invGet(k))})</span></div>`; }).join('')
    + Object.entries(r.fin || {}).map(([k, n]) => `<div>${iconHTML(k)} ${n} ${FLUIDS[k].name.toLowerCase()} <span class="dim">(by pipe)</span></div>`).join('');
  const ent = ENTITIES[r.id], veh = VEHICLES[r.id] && vstats(r.id);
  return `<b>${r.name ? r.name + ': ' : ''}${outs}</b><div class="dim">${r.time}s${r.hand ? '' : ' · ' + (MACHINE_FOR[r.cat] ?? 'assembler') + ' only'}</div>${ins}${ent ? `<div class="dim" style="margin-top:4px">${ent.desc}</div>` : ITEMS[r.id]?.desc ? `<div class="dim" style="margin-top:4px">${ITEMS[r.id].desc}</div>` : ''}`
    + (veh ? `<div class="dim">${veh.power ? `top speed ${veh.top.toFixed(1)} tiles/s · ${veh.power} kW · burns ${FLUIDS[veh.fuel].name.toLowerCase()}` : 'no engine'}${veh.cargo ? ` · ${veh.cargo} cargo slots` : ''}</div>` : '');
}

// ---------------------------------------------------------------- modals
const modals = ['inventory', 'research', 'help', 'title', 'map', 'logistics', 'factories'];
export function openModal(id) {
  for (const m of modals) $(m).style.display = m === id ? '' : 'none';
  S.modal = id;
  if (id === 'map') openMapView();
  if (id === 'help') renderMenu();
  if (id === 'logistics') openLogistics();
  renderModal();
}
export function closeModals() { for (const m of modals) $(m).style.display = 'none'; S.modal = null; rebinding = null; if (cursor) { cursor = null; showGhost(); } }
export function toggleModal(id) { S.modal === id ? closeModals() : openModal(id); }
function renderModal() {
  if (S.modal === 'inventory') renderInventory();
  if (S.modal === 'research') renderResearch();
  if (S.modal === 'map') renderSide(true);
  if (S.modal === 'logistics') renderLogistics(true);
  if (S.modal === 'factories') renderFactories();
}
bus.on('openmap', () => openModal('map'));
bus.on('openlogistics', () => openModal('logistics'));
bus.on('closemap', () => closeModals());

// ---------------------------------------------------------------- hide UI
// One switch for the whole interface: CSS hides every element on the page except the game view (so anything
// added later hides too), and the renderer skips the interface layer. Nothing is closed, so it all comes back as it was.
export function setHideUI(on) {
  S.hideUI = on;
  document.body.classList.toggle('hide-ui', on);
}

// ---------------------------------------------------------------- the pause menu (F1 / Esc)
// Solo games stop while it is open (main.js); in co-op the world keeps running for everyone else.
let menuTab = 'guide';
export function openMenu(tab) { menuTab = tab; openModal('help'); }
export function setMenuTab(tab) { menuTab = tab; renderMenu(); }
function renderMenu() {
  const m = $('help'), inGame = !!S.started;
  if (!inGame && menuTab === 'settings') menuTab = 'guide';
  m.classList.toggle('ingame', inGame);
  $('pmTitle').textContent = !inGame ? 'HOW TO PLAY' : S.net.role === 'solo' ? 'PAUSED' : 'MENU';
  $('pmNote').textContent = inGame && S.net.role !== 'solo' ? 'co-op: the world keeps running while this is open' : '';
  for (const b of m.querySelectorAll('[data-pm^="tab:"]')) b.classList.toggle('on', b.dataset.pm === 'tab:' + menuTab);
  for (const p of m.querySelectorAll('[data-tab]')) p.classList.toggle('on', p.dataset.tab === menuTab);
  if (menuTab === 'controls') renderKeys();
  if (menuTab === 'settings') {
    for (const c of m.querySelectorAll('[data-set]')) c.checked = c.dataset.set === 'altMode' ? S.altMode : !!S.settings[c.dataset.set];
    $('pmGame').innerHTML = `${S.sandbox ? 'Sandbox world. ' : ''}${S.net.role === 'client' ? 'You are a guest: the host saves this world.' : `Saving to slot ${S.slot}, every 30 seconds and when you quit. Export to file keeps a copy outside the browser.`}${S.net.role === 'host' ? ` Invite code: <b>${esc(S.net.code || '…')}</b>` : ''}`;
  }
}
// Interface settings, kept in this browser.
const SETTINGS_KEY = 'depthworks.settings';
S.settings = { goals: true, minimap: true, altInserters: true, depthGrid: true };
try { Object.assign(S.settings, JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {}); } catch { /* storage unavailable */ }
export function applySettings() { $('goals').classList.toggle('off', !S.settings.goals); $('minimap').classList.toggle('off', !S.settings.minimap); }
export function setSetting(k, v) {
  if (k === 'altMode') S.altMode = v; else S.settings[k] = v;
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(S.settings)); } catch { /* storage unavailable */ }
  applySettings();
  bus.emit('settings');
}
applySettings();

// ---------------------------------------------------------------- key bindings (in the menu)
let rebinding = null;
function renderKeys() {
  setHTML($('keys'), ACTIONS.map(([id, label]) => `<div class="krow"><span>${label}</span><button data-key="${id}" class="${rebinding === id ? 'on' : ''}">${rebinding === id ? (MOUSE_ACTIONS.has(id) ? 'click or key…' : 'press a key…') : keyNames(id).join(' / ') || '—'}</button></div>`).join('')
    + '<div class="btns"><button data-key="reset">Reset keys</button></div>');
}
$('keys').addEventListener('pointerdown', e => {
  const b = e.target.closest?.('[data-key]'); if (!b) return;
  e.preventDefault();
  if (b.dataset.key === 'reset') { resetKeys(); rebinding = null; } else rebinding = rebinding === b.dataset.key ? null : b.dataset.key;
  renderKeys(); renderHotbar();
});
// Mouse actions (copy and paste) bind to a click with whatever modifiers are held.
addEventListener('pointerdown', e => {
  if (!rebinding || !MOUSE_ACTIONS.has(rebinding) || e.target.closest?.('[data-key]')) return;
  e.preventDefault(); e.stopImmediatePropagation();
  rebind(rebinding, combo(e)); rebinding = null; renderKeys();
}, true);
// Capture the next key before the game sees it.
addEventListener('keydown', e => {
  if (!rebinding) return;
  e.preventDefault(); e.stopImmediatePropagation();
  if (e.code !== 'Escape' && !rebind(rebinding, e.code)) toast('number keys always pick quickbar slots');
  rebinding = null; renderKeys(); renderHotbar();
}, true);

// ---------------------------------------------------------------- hand / hotbar
// Things you use from your hand: buildings, roads, vehicles, cables and signals, food. Clicking one in the inventory
// holds it, just like picking it from the quickbar.
const holdable = it => !!(ENTITIES[it] || ITEMS[it]?.road || ITEMS[it]?.vehicle || ITEMS[it]?.tool || ITEMS[it]?.food);
export function selectItem(it) {
  S.sel = it || null; S.linkFrom = null; S.bpHand = false; renderHotbar();
}
export function cycleBar() { S.bar = (S.bar + 1) % S.bars.length; renderHotbar(); }
// Factorio-style: the first time you hold a new kind of building it takes the first free quickbar slot.
function autoFillHotbar() {
  for (const [it, n] of inv.counts()) {
    if (n <= 0 || !holdable(it) || ITEMS[it]?.food || S.hotbarSeen.has(it)) continue;
    S.hotbarSeen.add(it);
    if (S.hotbar.includes(it)) continue;
    const free = S.hotbar.indexOf(null);
    if (free >= 0) S.hotbar[free] = it;
  }
}
// The active bar sits at the bottom at full size; the others stack above it, smaller and dimmer, next one closest.
export function renderHotbar() {
  if (!S.bars.length) return;
  autoFillHotbar();
  // One row: the bar in use, with a small switch for the others at its left (their names show on hover).
  const b = S.bar, cells = S.bars[b].map((it, i) => {
    const n = it ? invGet(it) : 0;
    const cls = 'slot' + (it && it === S.sel ? ' sel' : '') + (it && !n ? ' empty' : '');
    const tipHtml = it ? `<b>${itemName(it)}</b><div class="dim">${ENTITIES[it]?.desc ?? ITEMS[it]?.desc ?? ''}</div><div class="dim">right-click with an empty hand clears this slot</div>` : 'empty: right-click while holding something to put it here';
    return `<div class="${cls}" data-act="hot:${b}.${i}"${tipAttr(tipHtml)}><span class="k">${(i + 1) % 10}</span>${it ? iconHTML(it, n || '') : ''}</div>`;
  }).join('');
  const pick = S.bars.map((_, k) => `<div class="bpick${k === b ? ' on' : ''}" data-act="bar:${k}"${tipAttr(`${HOTBARS[k].name} bar${k === b ? '' : ': click to use it'} · ${keyName('cycleBar')} switches bars`)}>${k + 1}</div>`).join('');
  // health and stamina sit at the bar's left; their widths follow every frame in updateVitals
  const vit = `<div class="vitals"><div class="vbar hp"${tipAttr('Health. Vehicles hurt; it comes back on its own after a while, faster when well fed. Food heals.')}><i id="vHp"></i></div>`
    + `<div class="vbar st"${tipAttr(`Stamina. Hold ${keyName('sprint')} to sprint; it refills when you stop.`)}><i id="vSt"></i></div></div>`;
  setHTML($('hotbar'), `${vit}<div class="bpicks">${pick}</div><div class="hbar">${cells}</div>`);
  $('hand').style.bottom = $('hotbar').offsetHeight + 18 + 'px';
  const ent = S.sel && ENTITIES[S.sel], tool = ITEMS[S.sel]?.tool === 'link', it = ITEMS[S.sel];
  const forFac = ent && !ent.shared && (world.factories.length > 1 || isResearched('factory_planning')) ? ` · for ${facChip(S.player.fac, 'factories')}` : '';
  const hand = S.sel ? `${iconHTML(S.sel, invGet(S.sel))} <b>${itemName(S.sel)}</b>` + (S.bpHand ? ' <span class="tag">blueprint</span>' : '') + (ent ? ` · facing ${DIR_NAMES[S.dir]}${forFac}${S.bpHand ? ' · click to plan it' : ' · Shift: plan a blueprint'}`
    : it?.tool === 'conduit' ? ' · drag over road tiles to lay power in them'
    : tool ? (S.linkFrom ? ` · now click the other pole${it.toBuilding && isResearched(WIRE_TECH) ? ' or a machine' : ''} · Esc cancels` : ` · click a pole, then another${it.toBuilding && isResearched(WIRE_TECH) ? ' (or a machine)' : ''}, to string a cable`)
    : it?.road ? ` · drag to lay · R turns it (${S.dir % 2 ? 'east-west' : 'north-south'})` : it?.vehicle ? ` · click to put it down · R turns it · facing ${DIR_NAMES[S.dir]}`
    : it?.tool === 'signal' ? ` · click a rail · faces ${DIR_NAMES[S.dir]}` : it?.food ? ' · click to eat' : ` · Ctrl+click a machine to put it in${S.picks.length && S.pickMode ? ` (${TRANSFER_MODES[S.pickMode].name.toLowerCase()} mode on the selection)` : ''}${S.picks.length > 1 ? ` · Ctrl+click a selected one: shared over all ${S.picks.length}` : ''} · Z drops one`)
    + (ent?.kind === 'lift' ? ` · ${S.dy === -1 ? 'down' : 'up'}` : '')
    + (ent?.kind === 'inserter' && S.mode === 'depth' ? ` · ${['level', 'lift ↑', 'drop ↓'][[0, 1, -1].indexOf(S.dy)]}` : '')
    : '';
  setHTML($('hand'), hand);
  $('hand').style.display = hand ? '' : 'none';
  renderRoadCfg();
}
// The road panel above your hand: how the road you hold gets laid.
function renderRoadCfg() {
  const el = $('roadcfg'), r = ROADS[S.sel];
  if (!r || r.walk) { el.style.display = 'none'; return; }
  const c = S.roadCfg, b = (k, v, label, tip) => `<button class="${c[k] === v ? 'on' : ''}" data-act="rcfg:${k}=${v}"${tip ? tipAttr(tip) : ''}>${label}</button>`;
  const t = (k, label, tip) => `<button class="${c[k] ? 'on' : ''}" data-act="rcfg:${k}=${c[k] ? 0 : 1}"${tipAttr(tip)}>${label}</button>`;
  setHTML(el, `<span class="dim">width</span>${[1, 2, 3, 4].map(w => b('w', w, w)).join('')}<span class="dim">lanes</span>${[1, 2, 3, 4].map(l => b('l', l, l)).join('')}
    <span class="dim">centre</span>${b('m', 'none', '—', 'no centre line')}${b('m', 'dashed', '- -', 'dashed white')}${b('m', 'solid', '│', 'solid yellow')}${b('m', 'double', '║', 'double yellow')}
    ${t('edges', 'edges', 'white lines along both edges')}${t('sw', 'sidewalks', 'a path on each side (uses Path tiles). Walking on paths is faster')}${t('cross', 'crossings', 'zebra crossings where roads meet (off: stop lines)')}`);
  el.style.display = '';
  el.style.bottom = $('hotbar').offsetHeight + 52 + 'px';
}

// ---------------------------------------------------------------- slots: drag and drop
// Slot refs in the DOM: "p:<i>" is your inventory slot i, "e:<id>" is a slot of the open machine.
// Nothing leaves a slot until you drop it somewhere: the drop is one move, run by the game rules
// (on the host in co-op), so stacks can't get lost in transit.
let cursor = null;   // { ref, it, n, mode: 'drag' | 'held', moved, x, y, button }
const ghost = document.createElement('div'); ghost.id = 'cursorStack'; document.body.append(ghost);
function readRef(ref) {
  if (ref.startsWith('p:')) { const sl = inv.slots[+ref.slice(2)]; return { it: sl?.it || null, n: sl?.n || 0 }; }
  if (ref.startsWith('t:')) return { it: null, n: 0 };   // trade offers are dropped onto, never picked up
  const sl = panelEnt && slotsOf(panelEnt).find(x => x.id === ref.slice(2));
  return { it: sl?.it || null, n: sl?.n || 0 };
}
function wire(ref) { return ref.startsWith('p:') ? { p: +ref.slice(2) } : panelEnt.isVeh ? { v: panelEnt.id, s: ref.slice(2) } : { e: [panelEnt.x, panelEnt.y, panelEnt.z], s: ref.slice(2) }; }
function refreshSlots() { if (panelEnt) renderEntity(); if (S.modal === 'inventory') renderInventory(); renderHotbar(); }
function showGhost(x, y) {
  if (!cursor) { ghost.style.display = 'none'; return; }
  setHTML(ghost, iconHTML(cursor.it, cursor.n));
  ghost.style.display = 'block'; ghost.style.left = x + 'px'; ghost.style.top = y + 'px';
}
export function cancelCursor() { if (!cursor) return false; cursor = null; showGhost(); refreshSlots(); return true; }
function dropOn(ref, n) {
  if (!cursor || ref === cursor.ref) return;
  if (ref.startsWith('t:')) { if (cursor.ref.startsWith('p:')) doAction({ a: 'trade', do: 'add', it: cursor.it, n }); return; }   // into your trade offer
  if (ref.startsWith('e:') && !panelEnt) return;
  doAction({ a: 'move', from: wire(cursor.ref), to: wire(ref), n });
  bus.emit('uiclick');
}
function slotHTML(ref, it, n, hint, extra = '') {
  const lifted = cursor && cursor.ref === ref ? cursor.n : 0, shown = n - lifted;
  const tip = it ? `<b>${itemName(it)}</b> <span class="dim">× ${n}</span>${extra ? `<div class="dim">${extra}</div>` : ''}<div class="dim">drag to move · right-drag: half · shift+click: send across</div>`
    : hint ? `<span class="dim">${extra || itemName(hint) + ' goes here'}</span>` : '';
  const inner = it && shown > 0 ? iconHTML(it, shown) : hint ? `<span class="ghosticon">${iconHTML(hint)}</span>` : '';
  return `<div class="cell slotc${!it || shown <= 0 ? ' emptyc' : ''}${it && holdable(it) && it === S.sel ? ' on' : ''}" data-slot="${ref}"${tip ? tipAttr(tip) : ''}>${inner}</div>`;
}
document.addEventListener('pointerdown', ev => {
  const el = ev.target.closest?.('[data-slot]');
  if (!el) { if (cursor?.mode === 'held' && !ev.target.closest?.('.panel')) cancelCursor(); return; }
  ev.preventDefault();
  const ref = el.dataset.slot;
  if (cursor?.mode === 'held') {                                     // put the picked-up stack down
    if (ref === cursor.ref) { cancelCursor(); return; }
    const one = ev.button === 2;
    dropOn(ref, one ? 1 : cursor.n);
    if (one && cursor.n > 1) { cursor.n--; showGhost(ev.clientX, ev.clientY); } else cursor = null;
    showGhost(ev.clientX, ev.clientY); refreshSlots(); return;
  }
  const sl = readRef(ref); if (!sl.it) return;
  if (ev.shiftKey && myTrade() && ref.startsWith('p:')) { doAction({ a: 'trade', do: 'add', it: sl.it, n: sl.n }); bus.emit('uiclick'); return; }
  if (ev.shiftKey) { doAction({ a: 'shift', from: wire(ref), ent: panelEnt ? (panelEnt.isVeh ? { v: panelEnt.id } : [panelEnt.x, panelEnt.y, panelEnt.z]) : null }); bus.emit('uiclick'); refreshSlots(); return; }
  cursor = { ref, it: sl.it, n: ev.button === 2 ? Math.ceil(sl.n / 2) : sl.n, mode: 'drag', moved: false, x: ev.clientX, y: ev.clientY, button: ev.button };
  showGhost(ev.clientX, ev.clientY); refreshSlots();
});
addEventListener('pointermove', ev => {
  if (!cursor) return;
  if (Math.hypot(ev.clientX - cursor.x, ev.clientY - cursor.y) > 6) cursor.moved = true;
  ghost.style.left = ev.clientX + 'px'; ghost.style.top = ev.clientY + 'px';
});
addEventListener('pointerup', ev => {
  if (!cursor || cursor.mode !== 'drag') return;
  const target = document.elementFromPoint(ev.clientX, ev.clientY)?.closest?.('[data-slot]');
  if (cursor.moved) { if (target) dropOn(target.dataset.slot, cursor.n); cursor = null; }
  else if (cursor.ref.startsWith('p:') && holdable(cursor.it) && !panelEnt && !myTrade() && cursor.button === 0) {
    selectItem(cursor.it); closeModals(); cursor = null;              // clicking a building in your bag picks it up to build with
  } else cursor.mode = 'held';                                         // picked up: click another slot to put it down
  showGhost(ev.clientX, ev.clientY); refreshSlots();
});
// Your inventory as a grid of real slots.
function invGridHTML() {
  return `<div class="slots">${inv.slots.map((sl, i) => slotHTML('p:' + i, sl?.it, sl?.n || 0, null, sl && holdable(sl.it) && !panelEnt ? (ITEMS[sl.it].food ? 'click: hold it to eat' : 'click: hold it to build') : '')).join('')}</div>`;
}

// ---------------------------------------------------------------- inventory + crafting
const TABS = ['Logistics', 'Production', 'Fluids', 'Transport', 'Agriculture', 'Intermediates', 'Science'];
const SANDBOX_TAB = 'Everything';   // sandbox only: every item in the game, a stack a click
S.craftTab = 'Logistics';
function recipeTab(r) {
  const ent = ENTITIES[recipeIcon(r)], it = ITEMS[recipeIcon(r)];
  if (['greenhouse', 'medlab'].includes(ent?.kind) || ent?.irrigation || ['chlorophyll', 'green_lamp'].includes(r.id) || it?.seed || it?.crop) return 'Agriculture';
  if (it?.road || it?.tool === 'signal' || it?.shape === 'engine' || ['chassis', 'wheel', 'hull', 'armor_plate', 'turret', 'fishing_net'].includes(r.id) || ['depot', 'rail'].includes(ent?.kind) || ent?.cats?.includes('vehicle')) return 'Transport';
  if (['pipe', 'upipe', 'fpump', 'valve', 'tank', 'oilpump', 'fgen'].includes(ent?.kind) || ent?.ports || it?.shape === 'barrel') return 'Fluids';
  return it?.shape === 'pack' ? 'Science' : it?.shape === 'aug' ? 'Production' : it?.tool ? 'Logistics' : !ent ? 'Intermediates' : ['belt', 'underground', 'splitter', 'lift', 'inserter', 'chest', 'frame', 'pole'].includes(ent.kind) ? 'Logistics' : 'Production';
}
function renderInventory() {
  if (S.craftTab === SANDBOX_TAB && !S.sandbox) S.craftTab = TABS[0];
  const rs = RECIPES.filter(r => r.cat === 'craft' && recipeUnlocked(r) && recipeTab(r) === S.craftTab);
  const tabs = [...TABS, ...(S.sandbox ? [SANDBOX_TAB] : [])].map(t => `<div class="tab ${t === S.craftTab ? 'on' : ''}" data-act="tab:${t}">${t}</div>`).join('');
  const recHtml = S.craftTab === SANDBOX_TAB
    ? Object.keys(ITEMS).map(it => `<div class="cell" data-act="give:${it}"${tipAttr(`<b>${itemName(it)}</b><div class="dim">left: a stack (${ITEMS[it].stack}) · right: one</div>`)}>${iconHTML(it)}</div>`).join('')
    : rs.map(r => {
      const hand = r.hand || S.sandbox, n = hand ? maxCraftable(r.id) : 0;
      return `<div class="cell ${n ? '' : 'no'}" data-act="craft:${r.id}"${tipAttr(recipeTip(r) + (hand ? `<div class="dim">${S.sandbox ? 'sandbox: free and instant · ' : ''}left: craft 1 · right: 5 · shift: a stack</div>` : ''))}>${iconHTML(recipeIcon(r), S.sandbox ? '' : n || '')}</div>`;
    }).join('');
  setHTML($('invBody'), `
    <div class="cols2">
      <div><h3>Character <span class="dim">${inv.used()}/${PLAYER.inventory} slots</span></h3>${invGridHTML()}${toolsHTML()}</div>
      <div><h3>Crafting</h3><div class="tabs">${tabs}</div><div class="grid">${recHtml}</div>
        <div class="dim" style="margin-top:8px">${S.sandbox ? 'Sandbox: crafting costs nothing and takes no time, and every recipe is unlocked. The Everything tab hands out any item.' : 'Missing parts are crafted for you if you have what they need. Numbers show how many you could make.'}</div></div>
    </div>`);
}
const ORDER = Object.keys(ITEMS);
const order = it => ORDER.indexOf(it);

// The engineer's tools, always carried: what each works on, how fast, how wide.
function toolsHTML() {
  return `<h4>Tools</h4><div class="tools">${Object.entries(TOOLS).map(([id, t]) => {
    const has = hasTool(id), sp = toolStat(id, 'speed'), r = toolStat(id, 'radius');
    const tip = `<b>${t.name}</b><div class="dim">${t.desc}</div>${has ? `<div>speed ×${sp} (level ${toolLevel(id, 'speed')}/${t.speed.length}) · ${r ? `hits everything within ${r} tiles` : 'one at a time'} (sweep ${toolLevel(id, 'radius')}/${t.radius.length})</div><div class="dim">research ${t.name} speed and sweep to upgrade it</div>` : `<div class="warn">research ${TECH[t.tech].name} to get it</div>`}`;
    return `<div class="tool${has ? '' : ' no'}"${tipAttr(tip)}><img src="${toolIconURL(id)}"> ${t.name} <span class="dim">${has ? `×${sp}${r ? ` · ${r}` : ''}` : 'locked'}</span></div>`;
  }).join('')}</div>`;
}
const toolIconURL = id => toolCursor(id).slice(4, toolCursor(id).indexOf(')'));

// ---------------------------------------------------------------- research
let resTab = 'tech';
function renderResearch() {
  if (resTab === 'med') { renderMedical(); return; }
  const cur = TECH[S.research.current], q = S.research.queue || [];
  const head = resTabsHTML() + `<div class="dim rhead">${cur ? `Researching <b>${cur.name}</b>${q.length > 1 ? `, then ${q.length - 1} more queued` : ''}. Labs need: ${Object.keys(cur.cost).map(p => itemName(p)).join(', ')}.` : q.length ? 'The queue is waiting: what is next needs more precision.' : 'Pick technologies to queue. Labs pull the packs they need from what you feed them.'}</div>`;
  renderTree($('resBody'), head, 'tech'); $('resBody')._html = null;
}
setTreeToast(m => toast(m, 2200));
const resTabsHTML = () => `<div class="tabs"><div class="tab ${resTab === 'tech' ? 'on' : ''}" data-act="restab:tech">Technology</div><div class="tab ${resTab === 'med' ? 'on' : ''}" data-act="restab:med"${tipAttr('Upgrades for every engineer, researched in medical labs')}>Medical</div></div>`;
// Medical research: the same tree, queue and controls as technologies (research.js), with upgrades for every engineer
// bought level by level with terrestrial packs, chlorophyll and crops.
function renderMedical() {
  const cur = MED[S.med.current], q = S.med.queue || [], p = S.player, here = hazardAt(p.x, p.z);
  const head = resTabsHTML() + `<div class="dim rhead">${cur ? `Medical labs are researching <b>${cur.name} ${medLevel(cur.id) + 1}</b>${q.length > 1 ? `, then ${q.length - 1} more queued` : ''}.` : q.length ? 'The queue is waiting: what is next needs something first.' : 'Queue upgrades. Medical labs take terrestrial packs, chlorophyll and, for adaptations and mutations, a crop. Every engineer in the world gets them.'}${here ? ` You stand in <b style="color:${HAZARDS[here].color}">${HAZARDS[here].name.toLowerCase()}</b>: resistance ${Math.round(resistance(here) * 100)}%.` : ''}</div>`;
  renderTree($('resBody'), head, 'med'); $('resBody')._html = null;
}
bus.on('medical', id => { if (id) toast(`Medical upgrade: ${MED[id].name} level ${medLevel(id)}`, 3500, 'good'); if (S.modal === 'research') renderResearch(); });
bus.on('medqueue', () => { if (S.modal === 'research') renderResearch(); });

// ---------------------------------------------------------------- machine window (machine slots + your inventory)
let panelEnt = null;
export function openEntity(e) {
  panelEnt = S.openEnt = e; cursor = null; showGhost();
  $('entity').style.display = ''; $('epCanvasWrap').style.display = e.kind === 'transmitter' ? '' : 'none';
  renderEntity();
}
export function closeEntity() { panelEnt = S.openEnt = null; cursor = null; showGhost(); $('entity').style.display = 'none'; }
export const entityOpen = () => panelEnt;
bus.on('removed', e => { if (e === panelEnt) closeEntity(); });

const fmtX = v => (+v.toFixed(2)).toString();
const pct = v => Math.round(v * 100) + '%';
// What a machine's augments add up to, next to its own numbers.
function augHTML(e, base) {
  if (!e.aug) return '';
  const st = machineStats(e), b = st.bonus, parts = [];
  if (b.speed) parts.push(`<span class="okc">speed +${pct(b.speed)}</span>`);
  if (b.efficiency) parts.push(`<span class="okc">power and fuel −${pct(1 - st.power)}</span>`);
  if (b.productivity) parts.push(`<span class="okc">output +${pct(b.productivity)}</span>${e.pbar ? ` <span class="dim">(next bonus ${pct(e.pbar)})</span>` : ''}`);
  if (b.depth) parts.push(`<span class="okc">reaches ${DEPOSIT[st.depth].name.toLowerCase()}</span>`);
  const def = ENTITIES[e.type], kw = def.power ? ` · ${Math.round(def.power * st.power)} kW` : '';
  return `<div class="dim">${base}${st.speed !== 1 ? ` → ${e.kind === 'drill' || e.kind === 'oilpump' ? 'x' + fmtX(st.speed) : fmtX((def.speed ?? 1) * st.speed)}` : ''}${kw}${def.burner && st.power < 1 ? ` · burns ${pct(st.power)} of the fuel` : ''}</div>`
    + `<div class="augsum">${parts.length ? parts.join(' · ') : `<span class="dim">${e.aug.length} augment slots: drag augments in (speed, efficiency, productivity${e.kind === 'drill' ? ', depth' : ''})</span>`}</div>`;
}
// A deposit: what it is, which layer it is down to, and how much is left there.
function depositHTML(o) {
  const L = depositLayer(o), next = DEPOSIT[o.layer + 1];
  return `${iconHTML(o.type)} ${itemName(o.type)} · <b>${L.name}</b> <span class="dim">${endless(o) ? 'endless' : `${fmtN(Math.max(0, o.amount))} left${next ? `, then ${next.name.toLowerCase()}` : ''}`}</span>`;
}
// One line about a belt tile for hover info: its line and what it carries.
function beltLine(e) {
  const n = segItems(e).length, ln = e.line;
  return `${ln ? esc(lineName(ln)) + ' · ' : ''}${n} item${n === 1 ? '' : 's'} here`;
}
let beltPick = null;   // which filter the item grid in a belt panel is choosing for
function beltHTML(e) {
  const ln = e.line, n = lanesOf(e), items = segItems(e), def = ENTITIES[e.type];
  let h = `<div>${n === 3 ? 'Three' : 'Two'} lanes · ${fmtX(ln?.speed ?? e.speed)} tiles/s${ln && ln.speed > ln.base ? ` <span class="okc">(augmented from ${fmtX(ln.base)})</span>` : ''}</div>`;
  h += `<div class="lanes">${Array.from({ length: n }, (_, i) => {
    const on = items.filter(it => it[2] === i), kinds = [...new Set(on.map(it => it[0]))];
    return `<div><span class="dim">${laneName(n, i)}</span> ${kinds.map(k => iconHTML(k, on.filter(it => it[0] === k).length)).join('') || '<span class="dim">empty</span>'}</div>`;
  }).join('')}</div>`;
  if (e.kind === 'underground') h += `<div class="dim">${e.role === 'in' ? (e.pair ? `entrance, linked ${e.len} tiles ahead` : `entrance: place an exit up to ${def.range - 1} tiles ahead`) : e.pair ? 'exit, linked' : 'exit with no entrance'}</div>`;
  if (e.kind === 'lift') h += `<div class="dim">carries items ${e.dy > 0 ? 'up' : 'down'} to layer ${e.y + e.dy}</div>`;
  const pickGrid = what => beltPick === what ? `<div class="grid small">${knownItems().map(it => `<div class="cell" data-act="bpickset:${it}"${tipAttr(itemName(it))}>${iconHTML(it)}</div>`).join('')}</div>` : '';
  if (e.kind === 'splitter') {   // a filter per way: matching items go only that way, the rest round the unfiltered ways
    h += `<h4>Filters</h4>` + ['front', 'left', 'right'].map((w, k) => { const f = e.sf?.[k]; return `<div class="row">${w}: ${f ? `${iconHTML(f)} ${itemName(f)} only <span class="x" data-act="sfilter:${k}:"${tipAttr('clear')}>✕</span>` : '<span class="dim">anything else</span>'} <button data-act="bpick:sf${k}">${beltPick === 'sf' + k ? 'cancel' : 'set'}</button></div>` + pickGrid('sf' + k); }).join('');
  }
  if (n === 3 && e.kind === 'belt') {   // bus channels: a side lane sent off to the side, after the bus ahead is served
    const node = ln && ln.segs[ln.segs.length - 1] === e && ln.out?.kind === 'bus' ? ln.out : null;
    h += `<h4>Channels</h4><div class="dim">A channel sends its side lane out to whatever this tile faces on that side: a belt, a machine, a depot. The bus ahead gets served first; only what it can't take goes out.</div>`;
    for (const [side, key2, li] of [['left', 'chL', 0], ['right', 'chR', 2]]) {
      const f = e[key2], ch = node?.ch[li], S2 = key2 === 'chL' ? 'L' : 'R';
      h += `<div class="row chan"><b>${side}</b> ${!f ? '<span class="dim">off</span>' : f === '*' ? 'anything' : `${iconHTML(f)} ${itemName(f)}`}
        <button data-act="chan:${S2}:" class="${!f ? 'on' : ''}">off</button><button data-act="chan:${S2}:*" class="${f === '*' ? 'on' : ''}">any</button><button data-act="bpick:${key2}" class="${f && f !== '*' ? 'on' : ''}">${beltPick === key2 ? 'cancel' : 'filter…'}</button>
        ${f ? (ch?.t ? (S.T - (ch.T ?? -99) < 3 ? `<span class="okc">pulling ${iconHTML(ch.last)} · ${ch.n} so far</span>` : `<span class="dim">waiting${ch.n ? ` · ${ch.n} so far` : ''}</span>`) : '<span class="warn">nothing on that side takes items</span>') : ''}</div>` + pickGrid(key2);
    }
    h += `<div class="row"><b>middle</b> ${e.midOff ? '<span class="warn">stopped here</span>' : 'goes straight on'} <button data-act="midoff">${e.midOff ? 'let it through' : 'stop it here'}</button></div>`;
    h += `<div class="row"><b>sort</b> <button data-act="sort" class="${e.sort ? 'on' : ''}"${tipAttr('Filtered channels take their item from any lane, before the bus ahead: a mixed belt (crops and seeds from a greenhouse, say) comes apart into the two channels')}>${e.sort ? 'sorting: channels take their item from any lane' : 'sort by channel filters'}</button></div>`;
  }
  if (n === 2 && e.kind === 'belt') {   // outputs: a lane pushed out to the side, into whatever stands there
    h += `<h4>Outputs</h4><div class="dim">Push the lane on one side out into what stands on that side: a chest, a machine, another belt. It takes items as they pass this tile, and the line runs on as one line.</div>`;
    for (const [side, k, d] of [['left', 'L', (e.dir + 3) % 4], ['right', 'R', (e.dir + 1) % 4]]) {
      const f = e.bout?.[k], nb = world.ents.get(key(e.x + DIRS[d][0], e.y, e.z + DIRS[d][1])), pk = 'bo' + k;
      h += `<div class="row chan"><b>${side}</b> ${!f ? '<span class="dim">off</span>' : f === '*' ? 'anything' : `${iconHTML(f)} ${itemName(f)}`}
        <button data-act="bout:${k}:" class="${!f ? 'on' : ''}">off</button><button data-act="bout:${k}:*" class="${f === '*' ? 'on' : ''}"${tipAttr('push every item on that lane out')}>any</button><button data-act="bpick:${pk}" class="${f && f !== '*' ? 'on' : ''}"${tipAttr('push only one kind of item out')}>${beltPick === pk ? 'cancel' : 'filter…'}</button>
        ${f ? (nb ? `<span class="dim">into the ${ENTITIES[nb.type].name.toLowerCase()}</span>` : '<span class="warn">nothing on that side</span>') : ''}</div>` + pickGrid(pk);
    }
  }
  if (ln) {
    h += `<h4>Line</h4><div>${esc(lineName(ln))} <span class="dim">${ln.segs.length} tile${ln.segs.length > 1 ? 's' : ''} · ${lineItems(ln)} items${lineAugs(ln).length ? ` · ${lineAugs(ln).map(a => iconHTML(a)).join('')}` : ''}${ln.cfg.filter.length ? ` · only ${ln.cfg.filter.map(f => iconHTML(f)).join('')}` : ''}</span></div>`;
    h += `<div class="dim">${lineEndHTML(ln)}</div>`;
    if (lineWarn(ln)) h += `<div class="warn">${lineWarn(ln)}</div>`;
  }
  h += `<div class="btns"><button data-act="rotate">rotate</button>${items.length ? '<button data-act="takebelt">pick up items</button>' : ''}${ln ? '<button data-act="beltnet">Network</button><button data-act="beltline">Line settings</button>' : ''}</div>`;
  return h;
}
const repairHTML = def => `<h4>Repair</h4><div class="warn">Broken. Repairs need ${Object.entries(def.repair).map(([it, n]) => `${iconHTML(it, n)}`).join(' ')}; mined, it gives only scrap.</div><div class="btns"><button data-act="repair">repair</button></div>`;
function statusLine(e) {
  const ok = isActive(e) && S.T - e.lastActive < 1;
  return `<div class="status ${ok ? 'ok' : 'idle'}">● ${e.status || (ok ? 'working' : 'idle')}${e.wired ? ' <span class="dim">· powered by a cable from a pole</span>' : ''}</div>`;
}
// The machine's own slots, grouped like Factorio's panels (Fuel / Input / Result ...), with a progress bar between.
function machineSlotsHTML(e, progress) {
  const groups = [];
  for (const sl of slotsOf(e)) {
    let g = groups.find(x => x.name === sl.group);
    if (!g) groups.push(g = { name: sl.group, cells: [] });
    const extra = sl.id === 'fuel' ? (e.isVeh ? `drop ${itemName(sl.hint).toLowerCase()}s here: the empty barrels come back` : `${e.burn.toFixed(1)} MJ burning`)
      : sl.id === 'catch' ? 'fish caught by the net: take them out, or unload at a port' : sl.id === 'net' ? 'a fishing net' : sl.id.startsWith('res') || sl.id === 'buf' ? 'take it out: drag or shift+click' : '';
    g.cells.push(slotHTML('e:' + sl.id, sl.it, sl.n, sl.hint, extra));
  }
  let html = '';
  for (const g of groups) {
    html += `<div class="sgroup"><h4>${g.name}</h4><div class="${g.name === 'Storage' || g.name === 'Cargo' ? 'slots chest' : 'grid'}">${g.cells.join('')}</div></div>`;
    if (progress !== undefined && (g.name === 'Input' || g.name === 'Ingredients')) html += `<div class="sgroup arrow">▶<div class="bar"><i style="width:${Math.min(1, progress) * 100}%"></i></div></div>`;
  }
  return html ? `<div class="mslots">${html}</div>` : '';
}
// One line per fluid network an entity touches: what it holds, how full, how fast it can flow.
function fluidHTML(e, only) {
  const seen = new Set(), rows = [];
  (e.fb || []).forEach((n, i) => {
    if (!n || seen.has(n) || (only && !only(i))) return; seen.add(n);
    const f = FLUIDS[n.fluid], col = hexCss(f?.color);
    rows.push(`<div class="flrow"><i style="background:${col}"></i><b>${f?.name ?? 'empty'}</b>${n.mixed ? ' <span class="warn">two fluids meet: flush the line</span>' : ''}
      <div class="bar"><i style="width:${n.cap ? Math.min(100, n.amount / n.cap * 100) : 0}%;background:${col}"></i></div>
      <span class="dim">${fmtN(n.amount)} / ${fmtN(n.cap)} · ${n.members.length} in the line${n.pipes ? ` · ${n.pipes} pipes, up to ${fmtN(n.throughput)}/s` : ''} · flowing ${fmtN(n.flow || 0)}/s</span></div>`);
  });
  return rows.join('') || '<div class="dim">not connected to anything</div>';
}
const SIDE_NAMES = ['front', 'right', 'back', 'left'];
function portsHTML(e) {
  const def = ENTITIES[e.type], r = RECIPE[e.recipe], fins = Object.keys(r?.fin || {}), fouts = Object.keys(r?.fout || {});
  let ni = 0, no = 0;
  return `<div class="dim">${def.ports.map(p => { const f = p.fluid || (p.io === 'in' ? fins[ni++] : fouts[no++]); return f ? `${SIDE_NAMES[p.side]}: ${FLUIDS[f].name.toLowerCase()} ${p.io}` : null; }).filter(Boolean).join(' · ') || 'pick a recipe to see its ports'}</div>`;
}
function renderEntity() {
  const e = panelEnt; if (!e) return;
  if (e.isVeh) { renderVehicle(e); return; }
  const def = ENTITIES[e.type]; let body = '';
  const pbar = p => `<div class="bar"><i style="width:${Math.min(1, p) * 100}%"></i></div>`;
  switch (e.kind) {
    case 'assembler': {
      const cats = def.cats || ['craft'], rs = RECIPES.filter(x => cats.includes(x.cat) && recipeUnlocked(x) && !x.auto);
      if (cats.includes('barrel')) {   // no recipe to choose: fill or empty, any fluid
        const m = barrelMode(e), f = e.recipe ? RECIPE[e.recipe] : null;
        body += `<h4>Mode</h4><div class="btns"><button data-act="barrelmode:fill" class="${m === 'fill' ? 'on' : ''}"${tipAttr('Takes empty barrels and fills them from the pipe at its back, with whatever fluid that is')}>fill barrels</button><button data-act="barrelmode:empty" class="${m === 'empty' ? 'on' : ''}"${tipAttr('Takes filled barrels and drains them into the pipe at its back; the empty barrels come out to take away')}>empty barrels</button></div>`;
        body += `<div class="dim">${m === 'fill' ? `fills empty barrels with ${f ? FLUIDS[f.id.slice(5)].name.toLowerCase() : 'whatever its pipe carries'}, 10 to a barrel` : `drains ${f ? FLUIDS[f.id.slice(6)].name.toLowerCase() + ' ' : ''}barrels into its pipe; the empties come out`}. Inserters feed it and take from it.</div>`;
        body += RECIPE[e.recipe] ? machineSlotsHTML(e, e.prog) + `<h4>Fluid</h4>${fluidHTML(e)}` : `<div class="dim">${m === 'fill' ? 'connect a pipe with fluid to its back' : 'put filled barrels in'}</div>`;
        break;
      }
      body += `<h4>Recipe</h4><div class="grid small">${rs.map(x => `<div class="cell ${x.id === e.recipe ? 'on' : ''}" data-act="recipe:${x.id}"${tipAttr(recipeTip(x))}>${iconHTML(recipeIcon(x))}</div>`).join('') || '<span class="dim">nothing researched for it yet</span>'}</div>`;
      if (cats.includes('vehicle') && RECIPE[e.recipe]) { const st = vstats(e.recipe); body += `<div class="dim">${itemName(e.recipe)}: ${st.power ? `${st.top.toFixed(1)} tiles/s, ${st.power} kW, burns ${FLUIDS[st.fuel].name.toLowerCase()}` : 'no engine'}${st.cargo ? `, ${st.cargo} cargo slots` : ''}. The engine is the frame's power: a stronger one goes faster and drinks more.</div>`; }
      if (def.ports) body += portsHTML(e);
      body += RECIPE[e.recipe] ? machineSlotsHTML(e, e.prog) : '<div class="dim" style="margin-top:6px">Pick a recipe to see its slots.</div>';
      if (def.ports && RECIPE[e.recipe]) body += `<h4>Fluids</h4>${fluidHTML(e)}`;
      if (def.pull) {
        const chests = stationChests(e), A = e.arm;
        body += `<h4>Reach</h4><div class="dim">Its arm takes ingredients from ${chests.length ? `the ${chests.length} chest${chests.length > 1 ? 's' : ''}` : 'any chest'} within ${def.pull.radius} tiles (lit up while this is open), one at a time, enough for two crafts. Inserters take out what it makes.</div>`
          + `<div>${A?.it ? `fetching ${iconHTML(A.it)} ${itemName(A.it)}` : chests.length ? '<span class="dim">arm resting</span>' : '<span class="warn">no chests in reach</span>'}</div>`;
      }
      body += augHTML(e, `crafting speed ${fmtX(def.speed)}`);
      break;
    }
    case 'pipe': case 'tank': case 'upipe':
      body += `<h4>Contents</h4>${fluidHTML(e)}`;
      if (e.kind === 'upipe') body += `<div class="dim">${e.pair ? `linked to the other end, ${Math.abs(e.pair.x - e.x) + Math.abs(e.pair.z - e.z)} tiles away` : 'no other end yet: place one up to ' + (def.range - 1) + ' tiles ahead, facing the same way'}</div>`;
      body += `<div class="btns"><button data-act="flush"${tipAttr('Empty this whole line. What is in it is lost.')}>flush line</button></div>`;
      break;
    case 'fpump': case 'valve':
      body += `<h4>Behind (in)</h4>${fluidHTML(e, i => i === 0)}<h4>In front (out)</h4>${fluidHTML(e, i => i === 1)}`;
      if (e.kind === 'fpump') body += `<div class="dim">${def.rate}/s at most · ${def.power} kW · ${Math.round((e.load || 0) * 100)}% busy</div>`;
      else body += `<h4>Mode</h4><div class="btns">${[['check', 'one way'], ['overflow', 'overflow only'], ['topup', 'top up only']].map(([m, l]) => `<button class="${e.mode === m ? 'on' : ''}" data-act="valve:${m}">${l}</button>`).join('')}</div>
        <div class="dim">${e.mode === 'overflow' ? 'passes only what is over 80% on the input side' : e.mode === 'topup' ? 'passes only while the output side is under half full' : 'passes everything forward, nothing back'}</div>`;
      body += `<div class="btns"><button data-act="rotate">rotate</button><button data-act="flush">flush</button></div>`;
      break;
    case 'oilpump': {
      const o = world.oil.get(e.x + ',' + e.z);
      body += `<h4>Well</h4>${o ? `${iconHTML('crude_oil')} yield ${o.yield.toFixed(1)}% · ${(def.rate * o.yield / 100).toFixed(1)} crude/s` : '<span class="warn">no oil here</span>'}`;
      body += `<h4>Output (front)</h4>${fluidHTML(e)}<div class="dim">yield falls slowly as you pump, never under 20%</div><div class="btns"><button data-act="rotate">rotate</button></div>`;
      body += machineSlotsHTML(e) + augHTML(e, `${def.rate} crude/s at full yield`);
      break;
    }
    case 'fgen':
      body += `<h4>Output</h4>${pbar(e.load || 0)}<div class="dim">${Math.round((e.load || 0) * def.out)} / ${def.out} kW · burns ${((e.load || 0) * def.out / 1000 / FLUIDS.diesel.fuel).toFixed(2)} diesel/s</div><h4>Diesel</h4>${fluidHTML(e)}`;
      break;
    case 'depot': body += depotHTML(e); break;
    case 'rail':
      body += `<div class="dim">Track block ${e.block !== undefined ? e.block + 1 : '?'}. ${e.sig !== null && e.sig !== undefined ? `A signal here splits the track toward the ${DIR_NAMES[e.sig]}: one train at a time on each side.` : 'Rail signals split track into blocks so several trains can share it.'}</div>`;
      break;
    case 'furnace': body += machineSlotsHTML(e, e.prog) + augHTML(e, `smelting speed ${fmtX(def.speed)}`); break;
    case 'drill': {
      const st = machineStats(e), dd = drillDeposits(e, st), ores = (e.foot || [[e.x, e.z]]).map(([x, z]) => world.ores.get(key(x, e.y, z))).filter(Boolean);
      const o = dd.list[0]?.[2] || ores[0], L = o && depositLayer(o), deep = dd.deep, tiles = def.size ? def.size[0] * def.size[1] : 1;
      body += `<h4>Deposit${ores.length > 1 ? 's' : ''}</h4>${ores.length ? [...new Map(ores.map(q => [q.type + q.layer, q])).values()].map(depositHTML).join('<br>') : '<span class="warn">nothing to mine here</span>'}`;
      if (tiles > 1) body += `<div class="dim">${dd.list.length} of its ${e.foot ? tiles : 1} tile${e.foot ? 's' : ''} ${dd.list.length === 1 ? 'has' : 'have'} ore it can mine: ${pct(dd.cover)} of its full rate${e.foot ? '' : ' (a one-tile big drill from an older save)'}</div>`;
      body += `<div class="${deep ? 'warn' : 'dim'}">reaches down to ${DEPOSIT[st.depth].name.toLowerCase()}${deep ? `: too shallow for ${dd.list.length ? 'some of these deposits' : 'this deposit'}. A depth augment ${deep.layer - st.depth > 1 ? '2' : '1'} or a bigger drill reaches it` : ''}</div>`;
      body += `<h4>Mining</h4>${pbar(e.timer)}` + machineSlotsHTML(e);
      const rate = def.rate * dd.cover * st.speed * (L?.speed ?? 1) * 60 * (1 + (L?.double ?? 0) + st.prod);
      body += `<div class="dim">${rate.toFixed(1)}/min${L && L.speed < 1 ? ` (the ${L.name.toLowerCase()} layer is slower to dig${L.double ? `, but 1 in ${Math.round(1 / L.double)} cycles gives two` : ''})` : ''} · pushes ore toward ${DIR_NAMES[e.dir]}</div>`;
      body += augHTML(e, `${(def.rate * 60).toFixed(0)}/min on the surface${tiles > 1 ? ' with ore under every tile' : ''}`);
      break;
    }
    case 'chest': body += `<div class="dim">${e.store.used()}/${def.cap} slots used</div>` + machineSlotsHTML(e); break;
    case 'lab': {
      const t = TECH[S.research.current];
      body += `<h4>Research</h4>${t ? `${t.name} · ${S.research.progress[t.id] || 0}/${t.count}${pbar(e.prog)}` : '<span class="dim">none: press T</span>'}`;
      body += machineSlotsHTML(e) + augHTML(e, `research speed ${fmtX(def.speed)}`);
      break;
    }
    case 'solar': body += `<div>Up to ${def.out} kW in daylight.</div>`; break;
    case 'radar': body += `<div class="dim">${def.power} kW · keeps the map live for ${def.scan} tiles around it · has explored out to ${Math.floor(e.scanR ?? def.scan)} of ${def.reveal} tiles${(e.scanR ?? def.scan) < def.reveal ? `, ${def.sweep} more a second while it runs` : ''}</div><div class="dim">Elsewhere the map shows only what was last seen there.</div>`; break;
    case 'lamp':
      if (def.burner) body += `<div class="dim">${e.lit ? 'lit' : daylight() > .2 ? 'it lights itself when it gets dark' : 'out of fuel'} · a piece of coal lasts about a night</div>` + machineSlotsHTML(e)
        + `<div class="btns"><button data-act="putfuel"${tipAttr('Put the coal (or wood) you carry into it')}>add fuel from inventory</button></div>`;
      else body += `<div class="dim">${def.power} kW · lights itself when it gets dark</div>`;
      break;
    case 'greenhouse': {
      const n = e.foot.length, crop = e.seed && CROPS[e.seed], need = seedsNeeded(e), lamps = e.lamps || 0;
      body += `<div>${n} tiles${crop ? ` of ${crop.name.toLowerCase()}` : ''} · ${need} seed${need > 1 ? 's' : ''} to plant · harvest every ${FARM.cycle} s at full water: ${Math.max(1, Math.round(n * FARM.cropPerTile))} ${crop ? crop.name.toLowerCase() : 'crop'} and ${Math.max(1, Math.round(n * FARM.seedPerTile))} spare seeds</div>`;
      body += `<h4>Growing</h4>${pbar(e.grow || 0)}<div class="dim">water ${Math.round((e.water || 0) * 100)}% of ${Math.round(def.water * n)}/s${lamps ? ` · ${lamps} green lamp${lamps > 1 ? 's' : ''}: +${lamps * FARM.lampBoost * 100}%` : ' · lit green lamps beside it make it grow faster'}</div>`;
      body += machineSlotsHTML(e) + `<h4>Water</h4>${fluidHTML(e)}`;
      body += `<div class="dim">Seeds go in by hand or by inserter; inserters take the harvest and spare seeds out (filter inserters pick one). It keeps its planting seeds. Ctrl + mine takes one tile off the room.</div>`;
      if (e.seeds) body += `<div class="btns"><button data-act="takeseeds">take the seeds out</button></div>`;
      break;
    }
    case 'dam': {
      const n = e.foot.length, r = damRating(e);
      body += `<h4>Power</h4>${pbar(e.running && e.net?.capacity ? e.output / r : 0)}<div>${e.running ? `<span class="okc">running</span>` : '<span class="warn">stopped</span>'} · out <b>${(e.output / 1000).toFixed(2)} MW</b> of ${(r / 1000).toFixed(2)} MW · in ${def.power} kW for its gates</div>`;
      body += `<div class="dim">${n} tiles · ${def.outTile} kW a tile on still water, more on a river's current · ${e.net ? `network ${e.net.id + 1}: ${Math.round(e.net.produced)} / ${Math.round(e.net.capacity)} kW used` : 'not connected: it joins only high voltage (a power line or transformer station over it)'}</div>`;
      body += `<div class="dim">It needs some other power to open its gates; once running it keeps itself going. Roads can be laid across it.</div>`;
      break;
    }
    case 'reactor': {
      const h = e.heat || 0;
      body += machineSlotsHTML(e);
      body += `<h4>Steam</h4>${pbar(e.load || 0)}<div class="dim">${Math.round((e.load || 0) * def.steam)} / ${def.steam} steam/s · ${Math.round((e.load || 0) * def.heat)} of ${def.heat} MW · fuel cell burning: ${Math.round(e.burn || 0)} MJ left</div>`;
      body += `<h4>Heat</h4><div class="bar heat"><i style="width:${h}%;background:${h >= REACTOR.critical ? '#ff4a3a' : h >= REACTOR.warn ? '#ffa53d' : '#9be37a'}"></i></div>`;
      body += `<div class="${h >= REACTOR.warn ? 'warn' : 'dim'}">${Math.round(h)}% · ${h >= REACTOR.critical ? 'CRITICAL: it breaks at 100%' : h >= REACTOR.warn ? 'overheating: give it more coolant towers or water' : 'cool'} · coolant towers touching it: ${DIR_NAMES.filter((_, d) => world.ents.get(key(e.x + [0, 1, 0, -1][d], e.y, e.z + [-1, 0, 1, 0][d]))?.kind === 'coolant').length}</div>`;
      body += `<h4>Water and steam</h4>${fluidHTML(e)}`;
      if (e.broken) body += repairHTML(def);
      break;
    }
    case 'coolant': body += `<h4>Cooling</h4>${pbar(e.load || 0)}<div class="dim">${Math.round((e.load || 0) * def.cool)} / ${def.cool} water/s</div><h4>Water</h4>${fluidHTML(e)}` + (e.broken ? repairHTML(def) : ''); break;
    case 'medlab': {
      const u = MED[S.med.current];
      body += `<h4>Medical research</h4>${u ? `${u.name} · level ${medLevel(u.id) + 1} · ${S.med.progress[u.id] || 0}/${unitsFor(u)} units${pbar(e.prog || 0)}` : `<span class="dim">${S.med.queue?.length ? 'the queue waits for something first' : 'nothing queued'}: press T, Medical tab</span>`}`;
      body += machineSlotsHTML(e) + augHTML(e, `research speed ${fmtX(def.speed)}`);
      break;
    }
    case 'pump': {
      const w = e.fnet?.water, boilers = w ? w.members.filter(m => m.kind === 'boiler').length : 0;
      body += `<h4>Pumping</h4>${pbar(e.load || 0)}<div class="dim">${Math.round((e.load || 0) * def.rate)} / ${def.rate} water/s · delivers only what is drawn</div>`;
      body += `<div>${boilers} boiler${boilers === 1 ? '' : 's'} on its water${boilers > 20 ? ' <span class="warn">(one pump keeps 20 busy)</span>' : ''}</div><h4>Water line</h4>${fluidHTML(e)}`;
      break;
    }
    case 'boiler': {
      body += machineSlotsHTML(e);
      const engines = e.fnet?.steam ? e.fnet.steam.members.filter(m => m.kind === 'engine').length : 0;
      body += `<h4>Steam</h4>${pbar(e.load || 0)}<div class="dim">${Math.round((e.load || 0) * def.steam)} / ${def.steam} steam/s · ${def.heat} MW at full</div>`;
      const short = e.water > 0 && e.water < .98 ? ` <span class="warn">${Math.round(e.water * 100)}%: not enough water for every boiler</span>` : '';
      const pumped = e.fnet?.water?.members.some(m => m.kind === 'pump' || m.kind === 'pipe' || m.kind === 'tank');
      body += `<div>water: ${pumped ? `<span class="okc">connected</span>${short}` : '<span class="warn">no pump or pipe touching it</span>'} · ${engines} engine${engines === 1 ? '' : 's'} on its steam</div>`;
      body += `<div class="dim">${e.foot ? 'water goes in and through at either end (blue and orange arrows); steam comes out of the back' : 'pipes join water at the drum ends (left and right) and steam at the back'}</div>`;
      break;
    }
    case 'engine': {
      const st = e.fnet?.steam, n = e.net;
      body += `<h4>Output</h4>${pbar(e.load || 0)}<div class="dim">${Math.round((e.load || 0) * def.out)} / ${def.out} kW · ${Math.round((e.load || 0) * def.steam)} steam/s</div>`;
      const boilers = st ? st.members.some(m => m.kind === 'boiler') : false;
      body += `<div>steam: ${!boilers ? '<span class="warn">no boiler on its steam</span>' : st.amount > 0 ? `<span class="okc">${fmtN(st.amount)} in the line</span>` : '<span class="warn">boilers have no fuel or water</span>'} · ${n ? `network ${n.id + 1}` : `<span class="warn">not in a ${e.compact ? 'pole' : 'generator pole'}\'s area</span>`}</div>`;
      body += `<div class="dim">${e.compact ? 'An engine from before engines were big: it feeds any pole, as it always did. A new one feeds generator poles only.' : 'Feeds a generator pole (extra-low voltage). A step-up station and a step-up cable take that power to your machines.'}</div>`;
      break;
    }
    case 'pole': {
      const n = e.net;
      if (n) {
        const volts = new Set(n.poles.flatMap(p => voltsOf(ENTITIES[p.type])));
        const short = n.demand > n.capacity && n.demand > 0;
        body += `<h4>Network ${n.id + 1} <span class="dim">${[...volts].map(v => VOLTAGES[v].name.toLowerCase()).join(' + ')}</span></h4>
          <div>${n.poles.length} poles · ${n.consumers} machines</div>
          <div class="dim">making: ${n.engines.length} steam engines and generators · ${n.solar} solar</div>
          <h4>Usage</h4>${pbar(n.capacity ? n.produced / n.capacity : 0)}<div class="${short ? 'warn' : 'dim'}">${Math.round(n.produced)} / ${Math.round(n.capacity)} kW
          ${!n.capacity ? '· no power: add steam engines, generators or solar' : short ? `· brownout: wants ${Math.round(n.demand)} kW, machines run at ${Math.round(n.sat * 100)}%` : ''}</div>`;
      }
      const cables = world.links.filter(l => [l.a, l.b].some(p => p[0] === e.x && p[1] === e.y && p[2] === e.z)).length;
      body += `<div class="dim">${VOLTAGES[voltsOf(def)[0]].name}${def.volts ? ` → ${def.volts.slice(1).map(v => VOLTAGES[v].name.toLowerCase()).join(', ')}` : ''} · supplies a ${def.supply * 2 + 1}×${def.supply * 2 + 1} area · wires reach ${def.wire} tiles${cables ? ` · ${cables} cable${cables > 1 ? 's' : ''}` : ''}</div>`;
      if (voltsOf(def).includes(ELV) && !def.volts) body += `<div class="dim">Generators in its area feed it; machines can't draw from it. Wire it to a step-up station and link that to a low voltage pole with a step-up cable.</div>`;
      const grids = (world.roadGrids || []).filter(g => g.poles.includes(e));
      if (grids.length) body += `<div class="dim">feeds ${grids.length} powered road${grids.length > 1 ? 's' : ''}: ${grids.map(g => `${g.tiles.length} tiles, ${Math.round(g.demand)} / ${ROAD_POWER.capacity} kW`).join(' · ')}</div>`;
      break;
    }
    case 'inserter': {
      body += `<div class="dim">${def.reach} tile reach · ${(1 / (def.swing * 2)).toFixed(2)} swings/s · ${def.power ? def.power + ' kW' : 'burner'}</div>`;
      body += machineSlotsHTML(e);
      body += `<div>pitch: <b>${e.dy === 0 ? 'level' : e.dy > 0 ? 'lifts up a layer' : 'drops down a layer'}</b></div>`;
      body += `<div class="btns"><button data-act="pitch">change pitch</button><button data-act="rotate">rotate</button></div>`;
      if (def.filter) {
        const known = Object.keys(ITEMS).filter(it => invGet(it) > 0 || S.stats.made?.[it]);
        body += `<h4>Filter</h4><div class="grid small">${known.map(it => `<div class="cell ${e.filter === it ? 'on' : ''}" data-act="filter:${it}"${tipAttr(itemName(it))}>${iconHTML(it)}</div>`).join('')}</div>`;
      }
      if (e.held) body += `<h4>Holding</h4>${iconHTML(e.held)} ${itemName(e.held)}`;
      break;
    }
    case 'belt': case 'splitter': case 'lift': case 'underground': body += beltHTML(e); break;
    case 'transmitter': {
      const sent = sentenceFor(e), ask = currentAsk();
      body += `<h4>Charge</h4>${pbar(e.prog)}` + machineSlotsHTML(e);
      body += `<div class="dim">It hears every working machine within ${HEAR_RADIUS} tiles, nearest first. Change what is running around it to change what you say.</div>`;
      body += `<div class="dim">will send: ${sent.join(' · ')}</div>`;
      if (ask) body += `<div class="ask">they asked for: ${ask.ask.join(' · ')} ${ask.ask.every(g => sent.includes(g)) ? '<b class="okc">✓ this sentence answers it</b>' : ''}</div>`;
      break;
    }
  }
  if (typing($('epBody'))) return;   // don't rebuild under someone typing a name
  const chip = def.shared || e.kind === 'frame' ? '' : ' ' + facChip(e.fac, 'fac');
  setHTML($('epBody'), `<div class="eph" data-clip="ent:"${tipAttr(`${keyName('copySettings')} copies its settings · ${keyName('pasteSettings')} pastes`)}><img src="${iconURL(e.type)}"> <b>${def.name}</b> <span class="dim">L${e.y} · ${DIR_NAMES[e.dir]}</span>${chip}<span class="x" data-act="close">✕</span></div>${statusLine(e)}${body}`);
  setHTML($('epInv'), `<h3>Character <span class="dim">${inv.used()}/${PLAYER.inventory}</span></h3>${invGridHTML()}<div class="dim tiny">drag stacks between your inventory and the machine · shift+click sends a stack across</div>`);
}

// ---------------------------------------------------------------- depots
const knownItems = extra => Object.keys(ITEMS).filter(it => !FLUIDS[it] && (invGet(it) > 0 || S.stats.made?.[it] || extra?.has(it)));
let rulePick = false;
function depotHTML(e) {
  const def = ENTITIES[e.type], n = e.fb?.[0], f = FLUIDS[e.fuelFluid], docks = dockTiles(e);
  const here = world.units.filter(u => u.dock === key(e.x, e.y, e.z) && u.state === 'dock');
  let h = `<h4>Name</h4><input class="txt" data-chg="dname" maxlength="32" value="${esc(e.dname)}"><div class="dim">Routes stop at depots by name. Depots that share a name share the work.</div>`;
  h += `<div class="row">priority <button data-act="prio:-1">−</button> <b>${e.prio}</b> <button data-act="prio:1">+</button> &nbsp; vehicle limit <button data-act="vlimit:-1">−</button> <b>${e.vlimit || '∞'}</b> <button data-act="vlimit:1">+</button></div>`;
  h += `<div class="dim">Vehicles pick the highest-priority depot with this name that has room under its limit.</div>`;
  h += `<h4>Fuel tank</h4><div class="btns">${FUELS.map(fl => `<button class="${fl === e.fuelFluid ? 'on' : ''}" data-act="dfuel:${fl}"${tipAttr(FLUIDS[fl].name)}>${iconHTML(fl)}</button>`).join('')}</div>`;
  h += `<div class="bar"><i style="width:${n ? Math.min(100, n.amount / n.cap * 100) : 0}%;background:${hexCss(f?.color)}"></i></div><div class="dim">${n ? `${fmtN(n.amount)} / ${fmtN(n.cap)} ${f.name.toLowerCase()}` : 'empty'} · pipe it in on any side, or drop ${f.name.toLowerCase()} barrels in storage. Docked vehicles that burn it refuel here.</div>`;
  h += `<h4>Import and export</h4>`;
  h += e.rules.length ? e.rules.map(r => `<div class="rule">${iconHTML(r.it)} <button data-act="ruleio:${r.it}" class="${r.io === 'in' ? 'in' : 'out'}">${r.io === 'in' ? 'import' : 'export'}</button>
    <span class="dim">${r.io === 'in' ? 'up to' : 'keep'}</span> <input class="num" data-chg="rulen:${r.it}" value="${r.n || ''}" placeholder="${r.io === 'in' ? 'any' : '0'}"> <span class="x" data-act="rulerm:${r.it}">✕</span></div>`).join('')
    : '<div class="dim">No rules: vehicles may unload anything here and load anything from it.</div>';
  h += `<div class="btns"><button data-act="rulepick">${rulePick ? 'cancel' : '+ rule'}</button></div>`;
  if (rulePick) h += `<div class="grid small">${knownItems(new Set(e.store.counts().keys())).map(it => `<div class="cell" data-act="ruleadd:${it}"${tipAttr(itemName(it))}>${iconHTML(it)}</div>`).join('')}</div>`;
  h += `<div class="dim">${docks.length ? `${docks.length} docking tile${docks.length > 1 ? 's' : ''}` : '<span class="warn">no ' + (def.way === 'sea' ? 'water' : def.way) + ' next to it</span>'}${here.length ? ' · serving ' + here.map(u => esc(u.name)).join(', ') : ''}</div>`;
  return h + machineSlotsHTML(e);
}

// ---------------------------------------------------------------- vehicles
function renderVehicle(v) {
  const st = vstats(v.type), u = unitOf(v), fr = FRAMES[st.frame], d = driverOf(v), fl = FLUIDS[st.fuel];
  let body = `<div class="dim">${st.power ? `${ENGINES[st.engine].name} · ${st.power} kW · top speed ${st.top.toFixed(1)} tiles/s${u?.way === 'rail' ? ' alone, less with wagons' : ''}` : 'no engine: couple it behind a locomotive'}${st.cargo ? ` · ${st.cargo} cargo slots` : ''}</div>`;
  if (st.tank) body += `<h4>Fuel</h4><div class="bar"><i style="width:${Math.min(100, v.fuel / st.tank * 100)}%;background:${hexCss(fl.color)}"></i></div><div class="dim">${Math.round(v.fuel)} / ${st.tank} ${fl.name.toLowerCase()} · ${st.burn.toFixed(2)}/s flat out · refuels at depots that stock it</div>`;
  if (u) {
    const routes = world.routes.filter(r => r.way === u.way), r = routeById(u.route);
    const cars = u.cars.map(vehicleById).filter(Boolean);
    body += `<h4>${esc(u.name)} <span class="dim">${u.way === 'rail' ? cars.length + ' car' + (cars.length > 1 ? 's' : '') : ''}</span></h4>`;
    if (u.way === 'rail' && cars.length > 1) body += `<div>${cars.map(c => iconHTML(c.type)).join('')}</div>`;
    body += `<div class="${u.auto ? 'okc' : 'dim'}">${esc(u.msg || u.state)}</div>`;
    body += `<div class="row">route <select data-chg="vroute"><option value="">none</option>${routes.map(x => `<option value="${x.id}"${x.id === u.route ? ' selected' : ''}>${esc(x.name)}</option>`).join('')}</select>
      ${r ? `<button data-act="vauto"${tipAttr('start or stop following the route')}>${u.auto ? 'stop' : 'go'}</button>` : ''} <button data-act="openlog">routes (L)</button></div>`;
  } else body += `<div class="dim">${fr.desc}</div>`;
  body += `<div class="dim">${d ? `${esc(d.name)} is driving` : 'B gets in when you stand next to it'} · hold right-click to pick it up</div>`;
  body += machineSlotsHTML(v);
  if (typing($('epBody'))) return;
  setHTML($('epBody'), `<div class="eph"><img src="${iconURL(v.type)}"> <b>${itemName(v.type)}</b><span class="x" data-act="close">✕</span></div>${body}`);
  setHTML($('epInv'), `<h3>Character <span class="dim">${inv.used()}/${PLAYER.inventory}</span></h3>${invGridHTML()}<div class="dim tiny">drag stacks between your inventory and the vehicle · shift+click sends a stack across</div>`);
}
bus.on('vehicles', () => { if (panelEnt?.isVeh && !world.vehicles.includes(panelEnt)) { const v = vehicleById(panelEnt.id); if (v) panelEnt = S.openEnt = v; else closeEntity(); } });

// ---------------------------------------------------------------- factories window
let facDelArm = null;
function renderFactories() {
  if (typing($('facBody'))) return;
  const F = world.factories, counts = new Map(), kw = new Map();
  for (const e of world.ents.values()) if (!ENTITIES[e.type].shared) counts.set(e.fac ?? 1, (counts.get(e.fac ?? 1) || 0) + 1);
  for (const n of nets) { const f = n.poles[0]?.fac ?? 1; kw.set(f, (kw.get(f) || 0) + n.produced); }
  const rows = F.map(f => `<div class="facrow${S.player.fac === f.id ? ' on' : ''}"><i class="sw" data-act="faccol:${f.id}" style="background:${f.color}"${tipAttr('click for the next colour')}></i>
    <input class="txt" data-chg="facname:${f.id}" maxlength="24" value="${esc(f.name)}"><span class="dim">${counts.get(f.id) || 0} buildings · ${Math.round(kw.get(f.id) || 0)} kW</span>
    <button data-act="facsel:${f.id}" class="${S.player.fac === f.id ? 'on' : ''}">${S.player.fac === f.id ? 'building here' : 'build here'}</button>
    ${F.length > 1 ? `<button data-act="facdel:${f.id}">${facDelArm === f.id ? 'sure? click again' : 'remove'}</button>` : ''}</div>`).join('');
  const can = isResResearched();
  setHTML($('facBody'), `<div class="dim">A factory is its own network inside this world. Belts, inserters, pipes and power never cross from one factory to another:
    goods move between factories only by truck, train or ship, through depots. Everything you build belongs to the factory you build for
    (${keyName('nextFactory')} switches it). Rails, roads and vehicles belong to nobody.</div>${rows}
    <div class="btns"><button data-act="facadd"${can ? '' : ' disabled'}>found a new factory</button>${can ? '' : ' <span class="warn">research Factory planning first</span>'}</div>
    <div class="dim">To move buildings to another factory: open one and click its factory name, or on the map (M) pick the Factories view and drag the Assign tool over an area.</div>`);
}
const isResResearched = () => isResearched('factory_planning');
bus.on('factories', () => { if (S.modal === 'factories') renderFactories(); renderHotbar(); });

// ---------------------------------------------------------------- actions
function act(a, ev) {
  const i = a.indexOf(':'), cmd = i < 0 ? a : a.slice(0, i), arg = i < 0 ? undefined : a.slice(i + 1), e = panelEnt;
  switch (cmd) {
    case 'rcfg': { const [k, v] = arg.split('='); S.roadCfg[k] = ['m'].includes(k) ? v : k === 'w' || k === 'l' ? +v : v === '1'; renderHotbar(); return; }
    case 'factories': toggleModal('factories'); return;
    case 'facsel': S.player.fac = +arg; doAction({ a: 'factory', do: 'select', id: +arg }); renderFactories(); renderHotbar(); return;
    case 'facadd': doAction({ a: 'factory', do: 'add' }); return;
    case 'faccol': { const f = factoryOf(+arg); if (f) doAction({ a: 'factory', do: 'color', id: f.id, color: FAC_COLORS[(FAC_COLORS.indexOf(f.color) + 1) % FAC_COLORS.length] }); return; }
    case 'facdel': if (facDelArm !== +arg) { facDelArm = +arg; renderFactories(); setTimeout(() => { facDelArm = null; }, 3000); return; } facDelArm = null; doAction({ a: 'factory', do: 'remove', id: +arg }); return;
    case 'openlog': closeEntity(); openModal('logistics'); return;
    case 'bpick': beltPick = beltPick === arg ? null : arg; renderEntity(); return;
    case 'bpickset': if (e && beltPick) { const p = beltPick; beltPick = null; doAction({ a: 'cmd', x: e.x, y: e.y, z: e.z, cmd: p.startsWith('sf') ? 'sfilter' : p.startsWith('bo') ? 'bout' : 'chan', arg: p.startsWith('sf') ? p.slice(2) + ':' + arg : p.startsWith('bo') ? p.slice(2) + ':' + arg : (p === 'chL' ? 'L:' : 'R:') + arg }); renderEntity(); } return;
    case 'beltnet': case 'beltline': if (e?.line) { const at = [e.x, e.y, e.z]; closeEntity(); openModal('logistics'); showBeltLine(at, cmd === 'beltnet' ? 'net' : 'map'); } return;
    case 'rulepick': rulePick = !rulePick; renderEntity(); return;
    case 'hot': {
      const [b, i] = arg.split('.').map(Number), bar = S.bars[b];
      if (!bar) return;
      if (ev.button === 2) { bar[i] = S.sel || null; renderHotbar(); return; }
      const it = bar[i]; selectItem(it && it === S.sel ? null : it); return;
    }
    case 'bar': S.bar = +arg; renderHotbar(); return;
    case 'tab': S.craftTab = arg; renderInventory(); return;
    case 'give': doAction({ a: 'give', it: arg, n: ev.button === 2 ? 1 : ITEMS[arg].stack }); renderInventory(); return;
    case 'craft': {
      const r = RECIPE[arg];
      if (!r.hand && !S.sandbox) { toast('this one can only be made in an assembler'); return; }
      const n = ev.shiftKey ? maxCraftable(arg) : ev.button === 2 ? Math.min(5, maxCraftable(arg)) : 1;
      if (!n) { toast('missing ingredients for ' + itemName(arg)); return; }
      doAction({ a: 'craft', rid: arg, n }); renderInventory(); return;
    }
    case 'cancel': doAction({ a: 'cancel', i: +arg }); renderInventory(); return;
    case 'restab': resTab = arg; renderResearch(); return;
    case 'tech': doAction({ a: 'research', id: arg, do: 'queue' }); renderResearch(); return;
    case 'close': closeEntity(); return;
    case 'putfuel': if (e) { const f = ['coal', 'wood', 'solid_fuel'].find(it => invGet(it) > 0); if (f) doAction({ a: 'fast', x: e.x, y: e.y, z: e.z, sel: f, mode: 'fuel' }); else toast('no coal or wood in inventory'); renderEntity(); } return;
    case 'pickmode': S.pickMode = S.pickMode === arg ? null : arg; renderPick(); renderHotbar(); return;
    case 'pickclear': clearPick(); return;
    case 'pickpaste': if (S.clip) { const list = pickTargets().filter(t => !t.isVeh); if (list.length) doAction({ a: 'pastemany', list: list.map(t => [t.x, t.y, t.z]), clip: S.clip }); else toast('nothing selected takes settings'); } return;
    case 'closeplayer': S.viewPlayer = null; renderPlayer(); return;
    case 'tradecancel': doAction({ a: 'trade', do: 'cancel' }); return;
    case 'tradeaccept': { const t = myTrade(); if (t) doAction({ a: 'trade', do: 'accept', on: !t.okMe }); return; }
    case 'tradeoff': doAction({ a: 'trade', do: 'set', it: arg, n: 0 }); return;
    case 'copycode': return;
  }
  if (!e) return;
  if (e.isVeh) {
    const u = unitOf(e);
    if (cmd === 'vauto' && u) doAction({ a: 'route', do: 'auto', unit: u.id, on: !u.auto });
    renderEntity(); return;
  }
  if (cmd === 'fac') {   // move it to the next factory
    const F = world.factories, j = F.findIndex(f => f.id === (e.fac ?? 1));
    doAction({ a: 'cmd', x: e.x, y: e.y, z: e.z, cmd: 'fac', arg: F[(j + 1) % F.length].id }); renderEntity(); return;
  }
  if (e.kind === 'depot') {
    const send = (c, v) => { doAction({ a: 'cmd', x: e.x, y: e.y, z: e.z, cmd: c, arg: v }); renderEntity(); };
    const rule = it => e.rules.find(r => r.it === it);
    if (cmd === 'prio' || cmd === 'vlimit') return send(cmd, (e[cmd] || 0) + +arg);
    if (cmd === 'dfuel') return send('fuel', arg);
    if (cmd === 'ruleio') { const r = rule(arg); return send('rule', JSON.stringify({ ...r, io: r.io === 'in' ? 'out' : 'in' })); }
    if (cmd === 'rulerm') return send('rule', JSON.stringify({ it: arg, del: true }));
    if (cmd === 'ruleadd') { rulePick = false; return send('rule', JSON.stringify({ it: arg, io: 'in', n: 0 })); }
  }
  // machine panel commands run under the game rules (on the host when playing co-op)
  doAction({ a: 'cmd', x: e.x, y: e.y, z: e.z, cmd, arg });
  renderEntity(); renderHotbar();
}
// Copy and paste in panels: rows marked data-clip="kind:ref" (routes, stops, belt lines, the open building).
document.addEventListener('pointerdown', ev => {
  const el = ev.target.closest?.('[data-clip]'); if (!el) return;
  const c = combo(ev), copy = is('copySettings', c), paste = is('pasteSettings', c);
  if (!copy && !paste) return;
  ev.preventDefault(); ev.stopImmediatePropagation(); bus.emit('uiclick');
  const i = el.dataset.clip.indexOf(':'), kind = el.dataset.clip.slice(0, i), ref = el.dataset.clip.slice(i + 1);
  if (copy) clipFromPanel(kind, ref); else pasteToPanel(kind, ref);
  setTimeout(() => { renderEntity(); bus.emit('cliprender'); }, 0);
}, true);
// the open building's window: its header copies and pastes like the building itself
CLIP_UI.ent = {
  copy: () => panelEnt && !panelEnt.isVeh ? copyBuilding(panelEnt) : null,
  paste: (ref, clip) => { if (!panelEnt || panelEnt.isVeh) return []; doAction({ a: 'paste', x: panelEnt.x, y: panelEnt.y, z: panelEnt.z, clip }); return ['settings']; },
};
document.addEventListener('pointerdown', ev => {
  const el = ev.target.closest?.('[data-act]'); if (!el) return;
  ev.preventDefault(); bus.emit('uiclick'); act(el.dataset.act, ev);
});
// Text boxes and dropdowns in panels: names, numbers, route choice.
document.addEventListener('change', ev => {
  const el = ev.target.closest?.('[data-chg]'); if (!el) return;
  const [cmd, arg] = el.dataset.chg.split(':'), e = panelEnt, v = el.value;
  if (cmd === 'facname') { doAction({ a: 'factory', do: 'rename', id: +arg, name: v }); return; }
  if (!e) return;
  if (cmd === 'vroute') { const u = unitOf(e); if (u) doAction({ a: 'route', do: 'assign', unit: u.id, route: v ? +v : null }); renderEntity(); return; }
  if (cmd === 'dname') doAction({ a: 'cmd', x: e.x, y: e.y, z: e.z, cmd: 'dname', arg: v });
  if (cmd === 'rulen') { const r = e.rules.find(x => x.it === arg); if (r) doAction({ a: 'cmd', x: e.x, y: e.y, z: e.z, cmd: 'rule', arg: JSON.stringify({ ...r, n: Math.max(0, Math.floor(+v || 0)) }) }); }
});
document.addEventListener('keydown', ev => { if (ev.key === 'Enter' && ev.target.closest?.('[data-chg]')) ev.target.blur(); });
document.addEventListener('contextmenu', ev => { if (ev.target.closest?.('.panel')) ev.preventDefault(); });

// ---------------------------------------------------------------- signal log
const sigCanvases = [];
function renderSignal() {
  const sig = S.signal, log = $('sigLog');
  sigCanvases.length = 0; log.innerHTML = '';
  for (const m of sig.log.slice(0, 14)) {
    const d = document.createElement('div'); d.className = 'msg ' + m.kind;
    const cv = document.createElement('canvas');
    if (m.kind === 'out') {
      d.innerHTML = `<div class="dim">→ you sent${m.fresh?.length ? ` <span class="okc">(new: ${m.fresh.join(', ')})</span>` : ''}</div>`;
      d.append(cv); sigCanvases.push({ cv, seq: m.seq, seed: 1, s: 2 });
    } else {
      d.append(cv); sigCanvases.push({ cv, seq: m.seq, seed: m.seed, s: 3 });
      const tr = document.createElement('div'); tr.className = 'tr'; tr.dataset.text = m.text; tr.dataset.seed = m.seed; d.append(tr);
      if (m.ask) { const a = document.createElement('div'); a.className = 'ask'; a.dataset.text = m.hint; a.dataset.seed = m.seed + 1; a.dataset.ask = m.ask.join(' · '); d.append(a); }
    }
    log.append(d);
  }
  updateSignalText();
}
function updateSignalText() {
  for (const el of $('sigLog').querySelectorAll('.tr')) el.textContent = '“' + maskText(el.dataset.text, el.dataset.seed) + '”';
  for (const el of $('sigLog').querySelectorAll('.ask')) el.textContent = `they ask: ${el.dataset.ask} (“${maskText(el.dataset.text, el.dataset.seed)}”)`;
  const sig = S.signal;
  setHTML($('sigHead'), !S.research.done.has('signal_theory') && sig.stage < 0
    ? '<span class="dim">Silence. Research Signal Theory to build a transmitter.</span>'
    : `<span class="dim">they have heard: ${[...sig.taught].join(' · ') || 'nothing yet'}</span><br><span class="dim">clarity ${Math.round(clarity() * 100)}% · exchange ${Math.max(0, sig.stage)}/${CONVERSATION.length - 1}</span>`);
}
bus.on('signal', kind => {
  renderSignal();
  if (kind !== 'out') { $('signal').classList.remove('collapsed'); toast(kind === 'ending' ? 'They have finished speaking. They are still listening.' : 'incoming signal', 3000, 'sig'); }
});
export function drawSignalCanvases() {
  if ($('signal').classList.contains('collapsed')) return;
  for (const c of sigCanvases) drawStrip(c.cv, c.seq, c.seed, S.T, c.s);
  if (panelEnt?.kind === 'transmitter') drawStrip($('epCanvas'), sentenceFor(panelEnt), 3, S.T, 3);
}

// ---------------------------------------------------------------- goals
const any = f => { for (const e of world.ents.values()) if (f(e)) return true; return false; };
const made = it => S.stats.made[it] || 0;
const GOALS = [
  ['mine', 'Hold right-click on coal and stone to mine 10 of each', () => (S.stats.mined?.coal || 0) >= 10 && (S.stats.mined?.stone || 0) >= 10],
  ['burner', 'Put the burner drill on iron ore facing the furnace, and fuel both', () => made('iron_plate') >= 10],
  ['wood', 'Chop a few trees for wood', () => (S.stats.mined?.wood || 0) >= 8],
  ['expand', 'Craft more burner drills and furnaces (E) and run 4 drills', () => count(e => e.kind === 'drill' && isActive(e)) >= 4],
  ['copper', 'Smelt 20 copper plates', () => made('copper_plate') >= 20],
  ['power', 'Make power: a water pump on water, a fuelled boiler and a steam engine beside it, a generator pole by the engine', () => any(e => e.kind === 'engine' && e.net && e.cap > 0)],
  ['stepup', 'Link a step-up station to a small pole with a step-up cable, so the power reaches your machines', () => any(e => e.kind !== 'pole' && e.net && ENTITIES[e.type].power && e.net.engines.length)],
  ['electric', 'Run an electric drill on the network', () => any(e => e.type === 'drill' && e.status === 'mining')],
  ['lab', 'Craft automation packs, place a lab and choose research (T)', () => Object.keys(S.research.progress).length > 0],
  ['automation', 'Finish researching Automation', () => S.research.done.has('automation')],
  ['assemble', 'Make 20 automation packs in assemblers', () => made('red_pack') >= 20],
  ['p1', 'Reach precision 1: keep 15 volume of machines busy', () => S.maxTier >= 1],
  ['green', 'Research Logistic science', () => S.research.done.has('logistic_science')],
  ['up', 'Research Lifts and run machinery on top of hollow frames', () => any(e => e.y > 0 && isActive(e))],
  ['dig', 'Research Excavation and build on layer -1 (Tab, then PgDn)', () => any(e => e.y < 0)],
  ['lens', 'Smelt resonant crystal into 5 lenses', () => made('lens') >= 5],
  ['p2', 'Reach precision 2', () => S.maxTier >= 2],
  ['deep', 'Research Deep excavation and mine abyssal ore on layer -2', () => made('abyssal_ore') >= 10],
  ['signal', 'Research Signal theory', () => S.research.done.has('signal_theory')],
  ['tx', 'Build a transmitter and feed it resonance packs', () => S.signal.pulses > 0],
  ['answer', 'Answer their first request', () => S.signal.stage >= 1],
  ['end', 'Hear everything they have to say', () => S.signal.stage >= CONVERSATION.length - 1],
];
const count = f => { let n = 0; for (const e of world.ents.values()) if (f(e)) n++; return n; };
S.goalsDone = new Set();
function renderGoals() {
  for (const [id, , f] of GOALS) if (!S.goalsDone.has(id) && f()) { S.goalsDone.add(id); toast('✓ ' + GOALS.find(g => g[0] === id)[1], 3000, 'good'); bus.emit('goal'); }
  const open = GOALS.filter(g => !S.goalsDone.has(g[0])).slice(0, 3);
  setHTML($('goals'), `<div class="gh">GOALS <span class="dim">${S.goalsDone.size}/${GOALS.length}</span></div>` + (open.map(g => `<div>□ ${g[1]}</div>`).join('') || '<div>All done. Keep listening.</div>'));
}

// ---------------------------------------------------------------- status + hover info
// The clock, and what part of the day it is.
function timeOfDay() {
  const h = hourOf(), hh = Math.floor(h), mm = Math.floor((h - hh) * 60), dl = daylight(), noon = (DAY.sunrise + DAY.sunset) / 2;
  const part = dl < .05 ? 'Night' : dl > .6 ? 'Day' : h < noon ? 'Morning' : 'Evening', clock = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
  const next = h >= DAY.sunrise && h < DAY.sunset ? `sunset ${fmtHour(DAY.sunset)}` : `sunrise ${fmtHour(DAY.sunrise)}`;
  return `${part === 'Night' ? '☾' : '☀'} <b>${clock}</b> ${part} <span class="dim">${next}</span>`;
}
const fmtHour = h => `${String(Math.floor(h)).padStart(2, '0')}:${String(Math.round((h % 1) * 60)).padStart(2, '0')}`;
function renderStatus() {
  const tr = TIERS[S.maxTier], nx = TIERS[S.maxTier + 1], P = powerSummary(), [lo, hi] = layerRange();
  const cur = TECH[S.research.current];
  setHTML($('status'), `
    <div${tipAttr(`Buildable layers right now: ${lo} to ${hi}`)}><b class="logo">DEPTHWORKS</b><span class="badge ${S.mode === 'depth' ? 'depth' : ''}">${S.mode.toUpperCase()}</span><span class="badge">LAYER ${S.layer}</span>${S.sandbox ? '<span class="badge depth">SANDBOX</span>' : ''}</div>
    <div class="row"${tipAttr('Active engineering volume: machines that did work in the last 8 seconds. Frames with a working machine inside count double. More volume raises precision.')}>Precision ${S.maxTier} <b>${tr.name}</b> <span class="dim">${S.activeVol.toFixed(1)}${nx ? ' / ' + nx.need : ''}</span></div>
    <div class="bar"><i style="width:${nx ? Math.min(100, S.activeVol / nx.need * 100) : 100}%"></i></div>
    <div class="row"${tipAttr('Solar panels only work in daylight. Lamps and braziers light the night.')}>${timeOfDay()}</div>
    ${biomeLine()}
    <div class="row"${tipAttr('Electric networks are joined by pole wires. Machines slow down when a network is overloaded. Click a pole to see its network.')}>Power${P.count > 1 ? ` <span class="dim">(${P.count} networks)</span>` : ''} <span class="${P.sat < 1 && P.demand > 0 ? 'warn' : 'dim'}">${Math.round(P.produced)} / ${Math.round(P.capacity)} kW${P.demand > P.capacity && P.demand > 0 ? ` · ${Math.round(P.sat * 100)}%` : ''}</span></div>
    <div class="bar pw"><i style="width:${P.capacity ? Math.min(100, P.produced / P.capacity * 100) : 0}%"></i></div>
    ${S.player.veh ? (v => v ? `<div class="row">Driving <b>${itemName(v.type)}</b> <span class="dim">${Math.abs(v.v).toFixed(1)} tiles/s${vstats(v.type).tank ? ` · fuel ${Math.round(v.fuel / vstats(v.type).tank * 100)}%` : ''} · ${keyName('board')} gets out</span></div>` : '')(vehicleById(S.player.veh)) : ''}
    ${S.player.fed > S.T ? `<div class="row okc">Well fed <span class="dim">${Math.ceil(S.player.fed - S.T)} s: faster walking and mining</span></div>` : ''}
    ${world.factories.length > 1 ? `<div class="row" data-act="factories"${tipAttr(`The factory you build for. ${keyName('nextFactory')} switches, ${keyName('factories')} manages`)}>Building for ${facChip(S.player.fac)}</div>` : ''}
    ${cur ? `<div class="row">Research <b>${cur.name}</b> <span class="dim">${S.research.progress[cur.id] || 0}/${cur.count}</span></div><div class="bar rs"><i style="width:${(S.research.progress[cur.id] || 0) / cur.count * 100}%"></i></div>` : `<div class="row dim">No research. Press T.</div>`}`);
}
// Where you stand: the biome, and its hazard with how much of it is getting through.
function biomeLine() {
  if (!world.gen) return '';
  const p = S.player, b = BIOMES[biomeIndexAt(p.x, p.z)], h = b.hazard && HAZARDS[b.hazard], ex = (p.expo || {})[b.hazard] || 0, res = b.hazard ? resistance(b.hazard) : 0;
  const tip = `<b>${b.name}</b>${h ? `<div style="color:${h.color}">${h.name}: ${h.desc}</div><div class="dim">exposure ${Math.round(ex * 100)}% · resistance ${Math.round(res * 100)}% (medical lab: ${MED[h.adapt]?.name})</div><div class="dim">It never kills: leave and it fades.</div>` : '<div class="dim">No hazards here.</div>'}<div class="dim">crops: ${b.seeds.map(c => CROPS[c].name.toLowerCase()).join(', ')}</div>`;
  return `<div class="row"${tipAttr(tip)}>${b.name}${h ? ` <span class="hz" style="color:${h.color};border-color:${h.color}">${h.name} ${Math.round(ex * (1 - res) * 100)}%</span>` : ''}</div>`;
}
export function describeCell(c) {
  if (!c) return '';
  const k = key(c.x, c.y, c.z), e = world.ents.get(k), f = world.frames.get(k), o = world.ores.get(k), out = [];
  const vh = c.veh && vehicleById(c.veh);
  if (vh) { const u = unitOf(vh); out.push(`<b>${itemName(vh.type)}</b> <span class="dim">${u ? esc(u.name) + ' · ' + esc(u.msg || u.state) : 'click to open · B to drive'}</span>`); }
  if (e) out.push(`<b>${ENTITIES[e.type].name}</b> <span class="dim">${e.belt ? beltLine(e) : e.status || ''}</span>${world.factories.length > 1 && !ENTITIES[e.type].shared ? ' ' + facChip(e.fac) : ''}`);
  if (e?.line && lineWarn(e.line) && e.line.segs[e.line.segs.length - 1] === e) out.push(`<span class="warn">${lineWarn(e.line)}</span>`);
  if (f) out.push('Hollow frame' + (e ? ' (machine inside)' : ''));
  const bp = !e && bpAt(c.x, c.y, c.z);
  if (bp) out.push(`<b>${ENTITIES[bp.type].name}</b> <span class="tag">blueprint</span> <span class="dim">click with an empty hand to build it · hold right-click to clear it</span>`);
  if (c.player) { const p = S.players.get(c.player); if (p) out.push(`<b>${esc(p.name)}</b> <span class="dim">${p.local ? 'you' : 'engineer'} · click for more</span>`); }
  const ft = c.y === 0 && world.feats.get(k);
  if (ft) out.push(`<b>${FEATURES[ft.type]?.name ?? 'Tree'}</b> <span class="dim">hold right-click to ${FEATURES[ft.type]?.tool === 'axe' ? 'chop it down' : 'break it'}</span>`);
  if (o) out.push(depositHTML(o));
  const oil = c.y === 0 && world.oil.get(c.x + ',' + c.z);
  if (oil) out.push(`${iconHTML('crude_oil')} Crude oil · yield ${Math.round(oil.yield)}% <span class="dim">a pumpjack draws it</span>`);
  const rd = c.y === 0 && roadAt(c.x, c.z);
  if (rd) out.push(`<b>${ROADS[rd.s].name}</b> <span class="dim">${rd.w ? `${rd.w} wide, ${rd.l} lane${rd.l > 1 ? 's' : ''}` : 'faster walking'}</span>${rd.p ? ` · <span style="color:#ffc83a">power conduit</span>${(g => g ? ` <span class="dim">${g.net ? `network ${g.net.id + 1}, ${Math.round(g.demand)} / ${ROAD_POWER.capacity} kW` : 'no pole feeds it'}</span>` : '')(world.roadGrids?.find(g => g.tiles.some(([x, z]) => x === c.x && z === c.z)))}` : ''}`);
  if (c.y === 0 && TILES[tileAt(c.x, c.z)]?.liquid && fishTarget(c)) out.push('<b>Fish</b> <span class="dim">hold right-click to catch it</span>');
  const t = c.y === 0 && TILES[tileAt(c.x, c.z)];
  if (t?.liquid) out.push(`<b>${t.name}</b> <span class="dim">${flowAt(c.x, c.z) >= 0 ? `flows ${DIR_NAMES[flowAt(c.x, c.z)]} · ` : ''}no walking or building, except water pumps</span>`);
  if (c.y === 0 && patchAt(c.x, c.z)) out.push(`<b>${patchName(c.x, c.z)}</b> <span class="dim">${hasTool('shovel') ? 'hold right-click to dig it up for seeds' : 'research Soil science for a shovel to dig it up for seeds'}</span>`);
  if (c.y === 0 && world.gen) { const b = BIOMES[biomeIndexAt(c.x, c.z)]; out.push(`<span class="dim">${b.name}${b.hazard ? ` · ${HAZARDS[b.hazard].name.toLowerCase()}` : ''}</span>`); }
  out.push(`<span class="dim">${c.x},${c.z} · layer ${c.y}</span>`);
  return out.join('<br>');
}
// Mining progress follows the cursor, like Factorio's.
function renderMineBar() {
  const m = S.player.mining, el = $('minebar');
  // mining progress wins; otherwise the input/output hint for whatever is under the cursor
  if ((!m && !S.hint) || !S.mouseClient || S.modal) { el.style.display = 'none'; return; }
  el.style.display = 'block';
  el.style.left = Math.min(innerWidth - el.offsetWidth - 8, S.mouseClient.x + 18) + 'px'; el.style.top = S.mouseClient.y + 20 + 'px';
  setHTML(el, m ? (m.blocked ? `<span class="warn">${m.name}: ${m.blocked}</span>` : `${m.name}<div class="bar"><i style="width:${Math.min(1, m.prog) * 100}%"></i></div>`)
    : `<span class="hintline">${S.hint.replace('blue arrow', '<b style="color:#4aa3ff">blue</b> arrow').replace('orange one', '<b style="color:#ffa53d">orange</b> one').replace('orange arrow', '<b style="color:#ffa53d">orange</b> arrow').replace('(green)', '(<b style="color:#7be37a">green</b>)')}</span>`);
}

// What the clipboard holds, beside the cursor while Shift is down (so you know what a paste will put there).
addEventListener('pointermove', e => {
  const t = $('clipTag');
  if (!S.clip || !e.shiftKey || S.hideUI) { t.style.display = 'none'; return; }
  t.style.display = 'block'; t.style.left = e.clientX + 16 + 'px'; t.style.top = e.clientY - 26 + 'px';
  setHTML(t, `📋 ${esc(S.clip.from)}${S.clip.what?.length ? ` <span class="dim">${esc(S.clip.what.join(', '))}</span>` : ''}`);
});
addEventListener('keyup', e => { if (e.key === 'Shift') $('clipTag').style.display = 'none'; });
let slowT = 0;
function updateVitals() {
  const p = S.player, hp = $('vHp'), st = $('vSt'); if (!hp) return;
  hp.style.width = Math.max(0, p.hp / maxHealth(p) * 100) + '%';
  st.style.width = Math.max(0, p.sta / maxStamina(p) * 100) + '%';
  hp.parentElement.classList.toggle('low', p.hp < maxHealth(p) * .3);
  // hazards: a tint at the screen's edges, as strong as the exposure the adaptations don't stop
  let worst = null, k = 0;
  for (const [h, v] of Object.entries(p.expo || {})) { const e = v * (1 - resistance(h)); if (e > k) { k = e; worst = h; } }
  const hz = $('hazard'); hz.style.opacity = (k * .55).toFixed(2); if (worst) hz.style.boxShadow = `inset 0 0 160px 40px ${HAZARDS[worst].color}`;
  st.parentElement.classList.toggle('tired', !!p.tired);
}
// a hit: a red flash at the screen's edges and the damage over the engineer
bus.on('hurt', n => {
  const f = $('hurt'); f.classList.remove('on'); void f.offsetWidth; f.classList.add('on');
  bus.emit('float', '-' + Math.round(n), S.player.x, 1.3, S.player.z);
});
bus.on('respawn', (x, z) => { S.player.x = x; S.player.z = z; S.player.vx = S.player.vz = 0; });
// ---------------------------------------------------------------- Shift + click selection: many buildings at once
// Shift + click buildings or vehicles with an empty hand to put them in the selection, or take them out again: it can
// hold many, and a building over several tiles is one. The bar over it counts them and offers a button per kind of slot
// they have (fuel, input, store, augments); pick one, and Ctrl + click any of them with something in hand shares the
// stack out over the whole selection in that mode (an even share each, as much as each takes). With settings copied,
// "paste to all" applies them to every selected building they fit. Esc, the ✕, or a click on empty ground clears it.
S.picks = [];
const refOf = e => e.isVeh ? { veh: e.id } : { x: e.x, y: e.y, z: e.z };
const sameRef = (a, b) => a.veh ? a.veh === b.veh : !b.veh && a.x === b.x && a.y === b.y && a.z === b.z;
export const pickEnt = r => r.veh ? vehicleById(r.veh) : world.ents.get(key(r.x, r.y, r.z)) || null;
// The selection as it stands: things that are gone (mined, driven off) drop out by themselves.
export function pickTargets() { S.picks = S.picks.filter(r => { const e = pickEnt(r); return !!e && (r.veh || (e.x === r.x && e.z === r.z)); }); return S.picks.map(pickEnt); }
export const isPicked = e => !!e && S.picks.some(r => sameRef(r, refOf(e)));
export function pickTargetFor(h) {
  const e = h?.veh ? vehicleById(h.veh) : h && world.ents.get(key(h.x, h.y, h.z));
  if (!e || e.kind === 'frame') { if (S.picks.length) clearPick(); return; }
  const r = refOf(e), i = S.picks.findIndex(q => sameRef(q, r));
  if (i >= 0) S.picks.splice(i, 1); else { S.picks.push(r); S.pickLast = r; }
  if (!S.picks.length) S.pickMode = null;
  renderPick(); renderHotbar(); bus.emit('uiclick');
}
export function clearPick() { S.picks = []; S.pickMode = null; S.pickLast = null; renderPick(); renderHotbar(); }
const pickModes = list => Object.keys(TRANSFER_MODES).filter(m => list.some(t => modesFor(t).includes(m)));
export function renderPick() {
  const el = $('pickbar'), list = pickTargets();
  if (!list.length) { el.style.display = 'none'; return; }
  if (S.pickMode && !pickModes(list).includes(S.pickMode)) S.pickMode = null;
  const names = [...new Set(list.map(t => t.isVeh ? itemName(t.type) : ENTITIES[t.type].name))];
  const name = list.length === 1 ? names[0] : `${list.length} selected <span class="dim">${esc(names.slice(0, 3).join(', '))}${names.length > 3 ? '…' : ''}</span>`;
  const modes = pickModes(list).map(m => `<button data-act="pickmode:${m}" class="${S.pickMode === m ? 'on' : ''}"${tipAttr(`<b>${TRANSFER_MODES[m].name} mode</b><div class="dim">${TRANSFER_MODES[m].desc}${list.length > 1 ? ' The stack is shared out evenly over the selection.' : ''}</div>`)}>${TRANSFER_MODES[m].name}</button>`).join('');
  const paste = S.clip ? `<button data-act="pickpaste"${tipAttr(`Paste ${esc(S.clip.from)}'s settings onto every selected building they fit`)}>paste to ${list.length > 1 ? 'all' : 'it'}</button>` : '';
  setHTML(el, `<b>${list.length === 1 ? esc(name) : name}</b> ${modes ? `<span class="dim">Ctrl + click ${list.length > 1 ? 'one' : 'it'} with an item:</span> ${modes}` : ''}${paste}<span class="x" data-act="pickclear"${tipAttr('clear the selection (Esc, or click empty ground)')}>✕</span>`);
  el.style.display = '';
}
// The bar sits over the building picked last (or the first still selected).
function placePick() {
  const el = $('pickbar'); if (el.style.display === 'none') return;
  const t = (S.pickLast && pickEnt(S.pickLast)) || pickTargets()[0]; if (!t) return;
  const [x, y] = project(t.isVeh ? t.rx ?? t.x : t.x + .5, (t.y || 0) + 1.4, t.isVeh ? t.rz ?? t.z : t.z + .5);
  el.style.left = Math.max(8, Math.min(innerWidth - el.offsetWidth - 8, x - el.offsetWidth / 2)) + 'px'; el.style.top = Math.max(8, y - el.offsetHeight - 6) + 'px';
}

// ---------------------------------------------------------------- an engineer: trading, or your own details
// Clicking another engineer opens a trade with them (trade.js), with a small header about them; clicking yourself shows
// your details.
export function openPlayer(id) {
  S.viewPlayer = id;
  if (id !== S.player.id && !myTrade()) doAction({ a: 'trade', do: 'open', with: id });
  renderPlayer();
}
let hadTrade = false;
function renderPlayer() {
  const el = $('playerInfo'), t = myTrade();
  if (t) { hadTrade = true; renderTrade(el, t); return; }
  if (hadTrade) { hadTrade = false; S.viewPlayer = null; }   // the trade ended (done, cancelled, too far): the window goes
  el.classList.remove('trading');
  const p = S.viewPlayer && S.players.get(S.viewPlayer);
  if (!p) { S.viewPlayer = null; el.style.display = 'none'; return; }
  const hp = p.hp ?? maxHealth(p), mh = maxHealth(p), st = p.sta ?? maxStamina(p), ms = maxStamina(p), held = p.local ? S.sel : p.sel, v = p.veh && vehicleById(p.veh);
  const doing = v ? `driving a ${itemName(v.type).toLowerCase()}` : p.mining ? (p.mining.blocked ? `trying to mine ${p.mining.name.toLowerCase()} (${p.mining.blocked})` : `mining ${p.mining.name.toLowerCase()}`) : p.sprinting ? 'sprinting' : p.moving ? 'walking' : 'standing';
  const expo = Object.entries(p.expo || {}).filter(([, x]) => x > .05).map(([h, x]) => `<span style="color:${HAZARDS[h].color}">${HAZARDS[h].name.toLowerCase()} ${Math.round(x * 100)}%</span>`).join(' · ');
  const dist = Math.hypot((p.rx ?? p.x) - S.player.x, (p.rz ?? p.z) - S.player.z);
  setHTML(el, `<div class="eph"><i class="dot" style="background:${hexCol(p.color)}"></i> <b>${esc(p.name)}</b> <span class="dim">${p.local ? 'you' : Math.round(dist) + ' tiles away'}</span><span class="x" data-act="closeplayer">✕</span></div>
    <div class="row">Health <span class="dim">${Math.round(hp)} / ${mh}</span></div><div class="bar"><i style="width:${hp / mh * 100}%;background:#d84a4a"></i></div>
    <div class="row">Stamina <span class="dim">${Math.round(st)} / ${ms}</span></div><div class="bar"><i style="width:${st / ms * 100}%;background:#e5c03a"></i></div>
    <div class="row">Holding ${held ? `${iconHTML(held)} ${itemName(held)}` : '<span class="dim">nothing</span>'}</div>
    <div class="row">${doing[0].toUpperCase() + doing.slice(1)} · building for ${facChip(p.fac ?? 1)}</div>
    ${p.fed > S.T ? `<div class="row okc">Well fed <span class="dim">${Math.ceil(p.fed - S.T)} s</span></div>` : ''}
    ${expo ? `<div class="row">Exposure: ${expo}</div>` : ''}
    <div class="row dim">Tools: ${Object.entries(TOOLS).filter(([id]) => hasTool(id)).map(([id, t]) => `${t.name.toLowerCase()} ×${toolStat(id, 'speed')}`).join(' · ')} <span class="tiny">(shared by everyone)</span></div>`);
  el.style.display = '';
}

// The trade window: who with, both offers side by side (yours takes drops from your inventory below), the wait after
// any change, and both accepts.
function renderTrade(el, t) {
  const p = S.players.get(t.with), mh = p ? maxHealth(p) : 1, dist = p ? Math.round(Math.hypot((p.rx ?? p.x) - S.player.x, (p.rz ?? p.z) - S.player.z)) : 0;
  const cells = (list, mine) => list.map(([it, n], i) => mine
    ? `<div class="cell" data-slot="t:${i}" data-act="tradeoff:${it}"${tipAttr(`<b>${itemName(it)}</b> × ${n}<div class="dim">click: take it back out of your offer</div>`)}>${iconHTML(it, n)}</div>`
    : `<div class="cell"${tipAttr(`<b>${itemName(it)}</b> × ${n}`)}>${iconHTML(it, n)}</div>`).join('');
  const mine = offerList(t.mine), theirs = offerList(t.theirs), wait = t.wait > 0;
  const status = wait ? `<span class="warn">offers changed: accept in ${Math.ceil(t.wait)} s</span>` : t.okMe && t.okThem ? '<span class="okc">both accepted: trading…</span>' : t.okMe ? `<span class="dim">you accepted · waiting for ${esc(t.name)}</span>` : t.okThem ? `<span class="okc">${esc(t.name)} accepted</span>` : '<span class="dim">check both offers, then accept</span>';
  setHTML(el, `<div class="eph"><i class="dot" style="background:${hexCol(p?.color)}"></i> <b>Trade with ${esc(t.name)}</b> <span class="dim">${dist} tiles away${p ? ` · health ${Math.round(p.hp ?? mh)}/${mh}` : ''}</span><span class="x" data-act="tradecancel"${tipAttr('cancel the trade: nothing changes hands')}>✕</span></div>
    <div class="tradecols"><div><h4>Your offer ${t.okMe ? '<span class="okc">✓</span>' : ''}</h4><div class="grid tradeoffer">${cells(mine, true)}<div class="cell emptyc" data-slot="t:new"${tipAttr('drag a stack from your inventory here')}><span class="dim">+</span></div></div></div>
      <div><h4>${esc(t.name)}'s offer ${t.okThem ? '<span class="okc">✓</span>' : ''}</h4><div class="grid">${cells(theirs, false) || '<span class="dim">nothing yet</span>'}</div></div></div>
    <div class="row">${status}</div>
    <div class="btns"><button data-act="tradeaccept" class="${t.okMe ? 'on' : ''}"${wait ? ' disabled' : ''}${tipAttr('Both must accept, after the wait. Any change to an offer clears both accepts.')}>${t.okMe ? 'accepted (click to take it back)' : 'accept'}</button><button data-act="tradecancel">cancel</button></div>
    <h4>Your inventory</h4>${invGridHTML()}<div class="dim tiny">drag stacks into your offer (shift+click adds a whole stack) · items only change hands when both accept · walking ${TRADE.reach}+ tiles apart calls it off</div>`);
  el.classList.add('trading'); el.style.display = '';
}
bus.on('trade', () => { if (S.viewPlayer || myTrade()) renderPlayer(); });
export function updateUI(dt, hover) {
  updateVitals();
  placePick();
  setHTML($('info'), describeCell(hover));
  renderMineBar();
  if (S.modal === 'logistics') drawLogistics();
  if ((slowT += dt) < .2) return;
  slowT = 0;
  renderStatus(); renderGoals(); renderHotbar(); updateSignalText(); renderCoop(); renderPlayer(); if (S.picks.length) renderPick();
  if (panelEnt && Math.hypot(panelEnt.x + .5 - S.player.x, panelEnt.z + .5 - S.player.z) > PLAYER.reach + 2) closeEntity();   // walked away
  if (panelEnt) renderEntity();
  if (S.modal === 'inventory') renderInventory();
  if (S.modal === 'research') renderResearch();
  if (S.modal === 'map') renderSide(false);
  if (S.modal === 'logistics') renderLogistics(false);
  if (S.modal === 'factories') renderFactories();
  setHTML($('craftq'), S.player.craft.slice(0, 10).map((c, i) => `<div class="cell${c.top ? '' : ' sub'}" data-act="cancel:${i}"${tipAttr(c.top ? `<b>${itemName(c.rid)}</b><div class="dim">click to cancel</div>` : `<b>${itemName(c.rid)}</b><div class="dim">part for the next item</div>`)}>${iconHTML(c.rid, (c.times - c.done) * RECIPE[c.rid].out[c.rid])}<i class="pbar" style="width:${(i === 0 ? c.prog : 0) * 100}%"></i></div>`).join(''));
}
bus.on('research', id => { toast(`Research complete: ${TECH[id].name}`, 3500, 'good'); renderModal(); });
bus.on('tier', t => toast(`PRECISION ${t}: ${TIERS[t].name.toUpperCase()}. Finer models, higher layers.`, 4500, 'good'));
bus.on('toast', t => toast(t));
// Factorio-style flying text for things you gain
let floats = 0;
bus.on('float', (text, x, y, z) => {
  if (floats > 6) return;
  const [sx, sy] = project(x, y, z), d = document.createElement('div');
  d.className = 'float'; d.textContent = text; d.style.left = sx + 'px'; d.style.top = sy + 'px';
  document.body.append(d); floats++;
  setTimeout(() => { d.remove(); floats--; }, 1000);
});
// What you dig gets one popup per kind of haul, which counts up while you keep digging: "+3 Iron ore (47)", the
// number in brackets being how many you now have. It restarts on each dig instead of piling up new ones.
const gains = new Map();
bus.on('gain', (list, x, y, z) => {
  const k = list.map(g => g[0]).join();
  let g = gains.get(k);
  if (!g) { g = { el: document.createElement('div'), got: {} }; g.el.className = 'float gain'; document.body.append(g.el); gains.set(k, g); }
  for (const [it, n] of list) g.got[it] = (g.got[it] || 0) + n;
  g.el.textContent = list.map(([it, , total]) => `+${g.got[it]} ${itemName(it)} (${fmtN(total)})`).join('   ');
  const [sx, sy] = project(x, y, z);
  g.el.style.left = sx + 'px'; g.el.style.top = sy + 'px';
  g.el.style.animation = 'none'; void g.el.offsetWidth; g.el.style.animation = '';
  clearTimeout(g.t); g.t = setTimeout(() => { g.el.remove(); gains.delete(k); }, 1500);
});
let spillT = 0;
bus.on('spill', () => { if (S.T - spillT > 3) { spillT = S.T; toast('inventory full: items dropped at your feet (F picks them up)'); } });

export function initUI() { renderHotbar(); renderSignal(); renderStatus(); renderGoals(); }
$('sigToggle').addEventListener('pointerdown', () => $('signal').classList.toggle('collapsed'));

// ---------------------------------------------------------------- co-op: name tags, chat, players panel
const tagEls = new Map();
export function renderNametags() {
  const live = new Set();
  for (const p of S.players.values()) {
    if (p.local || p.rx === undefined) continue;
    live.add(p.id);
    let el = tagEls.get(p.id);
    if (!el) { el = document.createElement('div'); el.className = 'nametag'; document.body.append(el); tagEls.set(p.id, el); }
    const [x, y] = project(p.rx, 1.32, p.rz);
    el.textContent = p.name; el.style.left = x + 'px'; el.style.top = y + 'px';
    el.style.borderColor = '#' + p.color.toString(16).padStart(6, '0');
  }
  for (const [id, el] of tagEls) if (!live.has(id)) { el.remove(); tagEls.delete(id); }
}
const hexCol = c => '#' + (c ?? 0x7d8796).toString(16).padStart(6, '0');
bus.on('chat', m => {
  const log = $('chatlog'), d = document.createElement('div');
  d.className = 'chatline';
  if (m.name) { const n = document.createElement('b'); n.textContent = m.name + ': '; n.style.color = hexCol(m.color); d.append(n); }
  else d.classList.add('sys');
  d.append(document.createTextNode(m.text));
  log.append(d);
  while (log.children.length > 8) log.firstChild.remove();
  setTimeout(() => d.classList.add('old'), 9000);
});
export function openChat() {
  const box = $('chatin');
  if (S.net.role === 'solo') { toast('chat works in co-op: host or join a game from the title screen'); return; }
  box.style.display = 'block'; box.value = ''; box.focus(); $('chatlog').classList.add('open');
}
$('chatin').addEventListener('keydown', e => {
  e.stopPropagation();
  if (e.key === 'Enter') { chat(e.target.value); e.target.blur(); }
  if (e.key === 'Escape') e.target.blur();
});
$('chatin').addEventListener('blur', e => { e.target.style.display = 'none'; $('chatlog').classList.remove('open'); });
function renderCoop() {
  const info = netInfo(), el = $('coop');
  if (info.role === 'solo') { el.style.display = 'none'; return; }
  el.style.display = '';
  const g = $('goals').getBoundingClientRect();   // sit just under the goals list, whatever its height
  el.style.top = (g.height ? g.bottom + 8 : 214) + 'px';
  const players = info.players.map(p => `<div><i class="dot" style="background:${hexCol(p.color)}"></i>${esc(p.name)}${p.local ? ' <span class="dim">(you)</span>' : ''}</div>`).join('');
  setHTML(el, info.role === 'host'
    ? `<div class="gh">CO-OP · HOSTING</div><div class="code" data-act="copycode"${tipAttr('click to copy')}>${info.code || '…'}</div><div class="dim">friends: Join co-op, then this code</div>${players}`
    : `<div class="gh">CO-OP · CONNECTED</div>${players}<div class="dim">Enter to chat</div>`);
}
bus.on('players', renderCoop);
document.addEventListener('pointerdown', ev => {
  if (!ev.target.closest?.('[data-act="copycode"]')) return;
  const code = S.net.code;
  (navigator.clipboard?.writeText(code) ?? Promise.reject()).then(() => toast('invite code copied', 1500, 'good'), () => toast('invite code: ' + code, 4000));
});
