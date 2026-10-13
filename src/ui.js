// HUD and panels. Panels re-render on a timer, so actions use pointerdown delegation via data-act.
import { ENTITIES, ITEMS, RECIPE, RECIPES, TECHS, TECH, TIERS, CONVERSATION, PLAYER, HOTBARS, VOLTAGES, TILES } from './data.js';
import { S, world, inv, invGet, bus, key, DIR_NAMES, itemName, recipeUnlocked, layerRange, tileAt, flowAt } from './state.js';
import { maxCraftable, techAvailable, isActive, powerSummary, entSlots, voltsOf } from './sim.js';
import { iconHTML, iconURL, fmtN } from './icons.js';
import { sentenceFor, drawStrip, maskText, clarity, currentAsk, HEAR_RADIUS } from './signal.js';
import { project } from './scene.js';
import { doAction, chat, netInfo } from './net.js';
import { ACTIONS, keyName, keyNames, rebind, resetKeys } from './input.js';
import { renderSide, openMapView } from './map.js';

const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const setHTML = (el, html) => { if (el._html !== html) { el.innerHTML = html; el._html = html; } };

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
function recipeTip(r) {
  const outs = Object.entries(r.out).map(([k, n]) => `${n}× ${itemName(k)}`).join(', ');
  const ins = Object.entries(r.in).map(([k, n]) => `<div>${iconHTML(k)} ${n} × ${itemName(k)} <span class="dim">(have ${fmtN(invGet(k))})</span></div>`).join('');
  const ent = ENTITIES[r.id];
  return `<b>${outs}</b><div class="dim">${r.time}s${r.cat === 'smelt' ? ' · furnace' : r.hand ? '' : ' · assembler only'}</div>${ins}${ent ? `<div class="dim" style="margin-top:4px">${ent.desc}</div>` : ''}`;
}

// ---------------------------------------------------------------- modals
const modals = ['inventory', 'research', 'help', 'title', 'map'];
export function openModal(id) {
  for (const m of modals) $(m).style.display = m === id ? '' : 'none';
  S.modal = id;
  if (id === 'map') openMapView();
  if (id === 'help') renderKeys();
  renderModal();
}
export function closeModals() { for (const m of modals) $(m).style.display = 'none'; S.modal = null; rebinding = null; if (cursor) { cursor = null; showGhost(); } }
export function toggleModal(id) { S.modal === id ? closeModals() : openModal(id); }
function renderModal() {
  if (S.modal === 'inventory') renderInventory();
  if (S.modal === 'research') renderResearch();
  if (S.modal === 'map') renderSide(true);
}
bus.on('openmap', () => openModal('map'));
bus.on('closemap', () => closeModals());

// ---------------------------------------------------------------- hide UI
// One switch for the whole interface: CSS hides every element on the page except the game view (so anything
// added later hides too), and the renderer skips the interface layer. Nothing is closed, so it all comes back as it was.
export function setHideUI(on) {
  S.hideUI = on;
  document.body.classList.toggle('hide-ui', on);
}

// ---------------------------------------------------------------- key bindings (in the help window)
let rebinding = null;
function renderKeys() {
  setHTML($('keys'), ACTIONS.map(([id, label]) => `<div class="krow"><span>${label}</span><button data-key="${id}" class="${rebinding === id ? 'on' : ''}">${rebinding === id ? 'press a key…' : keyNames(id).join(' / ') || '—'}</button></div>`).join('')
    + '<div class="btns"><button data-key="reset">Reset keys</button></div>');
}
$('keys').addEventListener('pointerdown', e => {
  const b = e.target.closest?.('[data-key]'); if (!b) return;
  e.preventDefault();
  if (b.dataset.key === 'reset') { resetKeys(); rebinding = null; } else rebinding = rebinding === b.dataset.key ? null : b.dataset.key;
  renderKeys(); renderHotbar();
});
// Capture the next key before the game sees it.
addEventListener('keydown', e => {
  if (!rebinding) return;
  e.preventDefault(); e.stopImmediatePropagation();
  if (e.code !== 'Escape' && !rebind(rebinding, e.code)) toast('number keys always pick quickbar slots');
  rebinding = null; renderKeys(); renderHotbar();
}, true);

// ---------------------------------------------------------------- hand / hotbar
export function selectItem(it) {
  S.sel = it || null; S.linkFrom = null; renderHotbar();
}
export function cycleBar() { S.bar = (S.bar + 1) % S.bars.length; renderHotbar(); }
// Factorio-style: the first time you hold a new kind of building it takes the first free quickbar slot.
function autoFillHotbar() {
  for (const [it, n] of inv.counts()) {
    if (n <= 0 || !(ENTITIES[it] || ITEMS[it]?.tool) || S.hotbarSeen.has(it)) continue;
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
  const barHTML = (b, active) => {
    const cells = S.bars[b].map((it, i) => {
      const n = it ? invGet(it) : 0;
      const cls = 'slot' + (it && it === S.sel ? ' sel' : '') + (it && !n ? ' empty' : '');
      const tipHtml = it ? `<b>${itemName(it)}</b><div class="dim">${ENTITIES[it]?.desc ?? ITEMS[it]?.desc ?? ''}</div><div class="dim">right-click with an empty hand clears this slot</div>` : 'empty: right-click while holding something to put it here';
      return `<div class="${cls}" data-act="hot:${b}.${i}"${tipAttr(tipHtml)}>${active ? `<span class="k">${(i + 1) % 10}</span>` : ''}${it ? iconHTML(it, n || '') : ''}</div>`;
    }).join('');
    const tip = active ? `${HOTBARS[b].name} bar · ${keyName('cycleBar')} switches bars` : `click, or press ${keyName('cycleBar')}, to use the ${HOTBARS[b].name.toLowerCase()} bar`;
    return `<div class="hbar${active ? ' on' : ''}"><div class="bname" data-act="bar:${b}"${tipAttr(tip)}>${b + 1}<small>${HOTBARS[b].name}</small></div>${cells}</div>`;
  };
  const n = S.bars.length, others = [];
  for (let k = n - 1; k >= 1; k--) others.push(barHTML((S.bar + k) % n, false));
  setHTML($('hotbar'), others.join('') + barHTML(S.bar, true));
  $('hand').style.bottom = $('hotbar').offsetHeight + 18 + 'px';
  const ent = S.sel && ENTITIES[S.sel], tool = ITEMS[S.sel]?.tool === 'link';
  const hand = S.sel ? `${iconHTML(S.sel, invGet(S.sel))} <b>${itemName(S.sel)}</b>` + (ent ? ` · facing ${DIR_NAMES[S.dir]}`
    : tool ? (S.linkFrom ? ' · now click the other pole · Esc cancels' : ' · click a pole, then another, to string a cable') : ' · Ctrl+click a machine to put it in · Z drops one')
    + (ent?.kind === 'lift' ? ` · ${S.dy === -1 ? 'down' : 'up'}` : '')
    + (ent?.kind === 'inserter' && S.mode === 'depth' ? ` · ${['level', 'lift ↑', 'drop ↓'][[0, 1, -1].indexOf(S.dy)]}` : '')
    : '';
  setHTML($('hand'), hand);
  $('hand').style.display = hand ? '' : 'none';
}

// ---------------------------------------------------------------- slots: drag and drop
// Slot refs in the DOM: "p:<i>" is your inventory slot i, "e:<id>" is a slot of the open machine.
// Nothing leaves a slot until you drop it somewhere: the drop is one move, run by the game rules
// (on the host in co-op), so stacks can't get lost in transit.
let cursor = null;   // { ref, it, n, mode: 'drag' | 'held', moved, x, y, button }
const ghost = document.createElement('div'); ghost.id = 'cursorStack'; document.body.append(ghost);
function readRef(ref) {
  if (ref.startsWith('p:')) { const sl = inv.slots[+ref.slice(2)]; return { it: sl?.it || null, n: sl?.n || 0 }; }
  const sl = panelEnt && entSlots(panelEnt).find(x => x.id === ref.slice(2));
  return { it: sl?.it || null, n: sl?.n || 0 };
}
function wire(ref) { return ref.startsWith('p:') ? { p: +ref.slice(2) } : { e: [panelEnt.x, panelEnt.y, panelEnt.z], s: ref.slice(2) }; }
function refreshSlots() { if (panelEnt) renderEntity(); if (S.modal === 'inventory') renderInventory(); renderHotbar(); }
function showGhost(x, y) {
  if (!cursor) { ghost.style.display = 'none'; return; }
  setHTML(ghost, iconHTML(cursor.it, cursor.n));
  ghost.style.display = 'block'; ghost.style.left = x + 'px'; ghost.style.top = y + 'px';
}
export function cancelCursor() { if (!cursor) return false; cursor = null; showGhost(); refreshSlots(); return true; }
function dropOn(ref, n) {
  if (!cursor || ref === cursor.ref) return;
  if (ref.startsWith('e:') && !panelEnt) return;
  doAction({ a: 'move', from: wire(cursor.ref), to: wire(ref), n });
  bus.emit('uiclick');
}
function slotHTML(ref, it, n, hint, extra = '') {
  const lifted = cursor && cursor.ref === ref ? cursor.n : 0, shown = n - lifted;
  const tip = it ? `<b>${itemName(it)}</b> <span class="dim">× ${n}</span>${extra ? `<div class="dim">${extra}</div>` : ''}<div class="dim">drag to move · right-drag: half · shift+click: send across</div>`
    : hint ? `<span class="dim">${extra || itemName(hint) + ' goes here'}</span>` : '';
  const inner = it && shown > 0 ? iconHTML(it, shown) : hint ? `<span class="ghosticon">${iconHTML(hint)}</span>` : '';
  return `<div class="cell slotc${!it || shown <= 0 ? ' emptyc' : ''}${it && ENTITIES[it] && it === S.sel ? ' on' : ''}" data-slot="${ref}"${tip ? tipAttr(tip) : ''}>${inner}</div>`;
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
  if (ev.shiftKey) { doAction({ a: 'shift', from: wire(ref), ent: panelEnt ? [panelEnt.x, panelEnt.y, panelEnt.z] : null }); bus.emit('uiclick'); refreshSlots(); return; }
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
  else if (cursor.ref.startsWith('p:') && ENTITIES[cursor.it] && !panelEnt && cursor.button === 0) {
    selectItem(cursor.it); closeModals(); cursor = null;              // clicking a building in your bag picks it up to build with
  } else cursor.mode = 'held';                                         // picked up: click another slot to put it down
  showGhost(ev.clientX, ev.clientY); refreshSlots();
});
// Your inventory as a grid of real slots.
function invGridHTML() {
  return `<div class="slots">${inv.slots.map((sl, i) => slotHTML('p:' + i, sl?.it, sl?.n || 0, null, sl && ENTITIES[sl.it] && !panelEnt ? 'click: hold it to build' : '')).join('')}</div>`;
}

// ---------------------------------------------------------------- inventory + crafting
const TABS = ['Logistics', 'Production', 'Intermediates', 'Science'];
S.craftTab = 'Logistics';
function recipeTab(r) {
  const ent = ENTITIES[r.id];
  return ITEMS[r.id]?.shape === 'pack' ? 'Science' : ITEMS[r.id]?.tool ? 'Logistics' : !ent ? 'Intermediates' : ['belt', 'underground', 'splitter', 'lift', 'inserter', 'chest', 'frame', 'pole'].includes(ent.kind) ? 'Logistics' : 'Production';
}
function renderInventory() {
  const rs = RECIPES.filter(r => r.cat === 'craft' && recipeUnlocked(r) && recipeTab(r) === S.craftTab);
  const tabs = TABS.map(t => `<div class="tab ${t === S.craftTab ? 'on' : ''}" data-act="tab:${t}">${t}</div>`).join('');
  const recHtml = rs.map(r => {
    const n = r.hand ? maxCraftable(r.id) : 0;
    return `<div class="cell ${n ? '' : 'no'}" data-act="craft:${r.id}"${tipAttr(recipeTip(r) + (r.hand ? '<div class="dim">left: craft 1 · right: 5 · shift: all</div>' : ''))}>${iconHTML(r.id, n || '')}</div>`;
  }).join('');
  setHTML($('invBody'), `
    <div class="cols2">
      <div><h3>Character <span class="dim">${inv.used()}/${PLAYER.inventory} slots</span></h3>${invGridHTML()}</div>
      <div><h3>Crafting</h3><div class="tabs">${tabs}</div><div class="grid">${recHtml}</div>
        <div class="dim" style="margin-top:8px">Missing parts are crafted for you if you have what they need. Numbers show how many you could make.</div></div>
    </div>`);
}
const ORDER = Object.keys(ITEMS);
const order = it => ORDER.indexOf(it);

// ---------------------------------------------------------------- research
function renderResearch() {
  const cur = TECH[S.research.current];
  const cards = TECHS.map(t => {
    const done = S.research.done.has(t.id), avail = techAvailable(t), active = S.research.current === t.id;
    const prog = (S.research.progress[t.id] || 0) / t.count;
    const cost = Object.keys(t.cost).map(p => iconHTML(p)).join('');
    const unl = t.unlocks.map(u => ITEMS[u] ? iconHTML(u) : `<span class="tag">${u}</span>`).join('');
    const needs = t.pre.filter(p => !S.research.done.has(p)).map(p => TECH[p].name);
    const lock = !done && !avail ? `<div class="warn">${needs.length ? 'needs ' + needs.join(', ') : ''}${(t.precision ?? 0) > S.maxTier ? `${needs.length ? ' · ' : 'needs '}precision ${t.precision}` : ''}</div>` : '';
    return `<div class="tech ${done ? 'done' : avail ? '' : 'locked'} ${active ? 'active' : ''}" data-act="tech:${t.id}">
      <div class="tn">${t.name}</div>
      <div class="tc">${cost} <span class="dim">× ${t.count} · ${t.time}s</span></div>
      <div class="tu">${unl}</div>${lock}
      <div class="bar"><i style="width:${(done ? 1 : prog) * 100}%"></i></div></div>`;
  }).join('');
  setHTML($('resBody'), `<div class="dim" style="margin-bottom:6px">${cur ? `Researching <b>${cur.name}</b>. Labs need: ${Object.keys(cur.cost).map(p => itemName(p)).join(', ')}.` : 'Pick a technology. Labs will pull the packs they need from what you feed them.'}</div><div class="techs">${cards}</div>`);
}

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

function statusLine(e) {
  const ok = isActive(e) && S.T - e.lastActive < 1;
  return `<div class="status ${ok ? 'ok' : 'idle'}">● ${e.status || (ok ? 'working' : 'idle')}</div>`;
}
// The machine's own slots, grouped like Factorio's panels (Fuel / Input / Result ...), with a progress bar between.
function machineSlotsHTML(e, progress) {
  const groups = [];
  for (const sl of entSlots(e)) {
    let g = groups.find(x => x.name === sl.group);
    if (!g) groups.push(g = { name: sl.group, cells: [] });
    const extra = sl.id === 'fuel' ? `${e.burn.toFixed(1)} MJ burning` : sl.id.startsWith('res') || sl.id === 'buf' ? 'take it out: drag or shift+click' : '';
    g.cells.push(slotHTML('e:' + sl.id, sl.it, sl.n, sl.hint, extra));
  }
  let html = '';
  for (const g of groups) {
    html += `<div class="sgroup"><h4>${g.name}</h4><div class="${g.name === 'Storage' ? 'slots chest' : 'grid'}">${g.cells.join('')}</div></div>`;
    if (progress !== undefined && (g.name === 'Input' || g.name === 'Ingredients')) html += `<div class="sgroup arrow">▶<div class="bar"><i style="width:${Math.min(1, progress) * 100}%"></i></div></div>`;
  }
  return html ? `<div class="mslots">${html}</div>` : '';
}
function renderEntity() {
  const e = panelEnt; if (!e) return;
  const def = ENTITIES[e.type]; let body = '';
  const pbar = p => `<div class="bar"><i style="width:${Math.min(1, p) * 100}%"></i></div>`;
  switch (e.kind) {
    case 'assembler': {
      const rs = RECIPES.filter(x => x.cat === 'craft' && recipeUnlocked(x));
      body += `<h4>Recipe</h4><div class="grid small">${rs.map(x => `<div class="cell ${x.id === e.recipe ? 'on' : ''}" data-act="recipe:${x.id}"${tipAttr(recipeTip(x))}>${iconHTML(x.id)}</div>`).join('')}</div>`;
      body += RECIPE[e.recipe] ? machineSlotsHTML(e, e.prog) : '<div class="dim" style="margin-top:6px">Pick a recipe to see its slots.</div>';
      break;
    }
    case 'furnace': body += machineSlotsHTML(e, e.prog); break;
    case 'drill': {
      const o = world.ores.get(key(e.x, e.y, e.z));
      body += `<h4>Deposit</h4>${o ? `${iconHTML(o.type)} ${itemName(o.type)} · ${fmtN(o.amount)} left` : '<span class="dim">exhausted</span>'}`;
      body += `<h4>Mining</h4>${pbar(e.timer)}` + machineSlotsHTML(e);
      body += `<div class="dim">${def.power ? def.power + ' kW' : 'burner'} · ${def.rate * 60}/min · pushes ore toward ${DIR_NAMES[e.dir]}</div>`;
      break;
    }
    case 'chest': body += `<div class="dim">${e.store.used()}/${def.cap} slots used</div>` + machineSlotsHTML(e); break;
    case 'lab': {
      const t = TECH[S.research.current];
      body += `<h4>Research</h4>${t ? `${t.name} · ${S.research.progress[t.id] || 0}/${t.count}${pbar(e.prog)}` : '<span class="dim">none: press T</span>'}`;
      body += machineSlotsHTML(e);
      break;
    }
    case 'generator':
      body += machineSlotsHTML(e);
      body += `<h4>Load</h4>${pbar(e.load || 0)}<div class="dim">${Math.round((e.load || 0) * def.out)} / ${def.out} kW</div>`;
      break;
    case 'solar': body += `<div>${def.out} kW, always on.</div>`; break;
    case 'pump': {
      const w = e.fnet?.water, boilers = w ? w.members.filter(m => m.kind === 'boiler').length : 0;
      body += `<h4>Pumping</h4>${pbar(e.load || 0)}<div class="dim">${Math.round((e.load || 0) * def.rate)} / ${def.rate} water/s · always full, delivers only what is drawn</div>`;
      body += `<div>${boilers} boiler${boilers === 1 ? '' : 's'} connected${boilers > 20 ? ' <span class="warn">(one pump keeps 20 busy)</span>' : ''}</div>`;
      break;
    }
    case 'boiler': {
      body += machineSlotsHTML(e);
      const engines = e.fnet?.steam ? e.fnet.steam.members.filter(m => m.kind === 'engine').length : 0;
      body += `<h4>Steam</h4>${pbar(e.load || 0)}<div class="dim">${Math.round((e.load || 0) * def.steam)} / ${def.steam} steam/s · ${def.heat} MW at full</div>`;
      const short = e.water > 0 && e.water < 1 ? ` <span class="warn">${Math.round(e.water * 100)}%: too many boilers on the pump</span>` : '';
      body += `<div>water: ${e.fnet?.water?.cap ? `<span class="okc">pump connected</span>${short}` : '<span class="warn">no pump touching it</span>'} · ${engines} engine${engines === 1 ? '' : 's'} on its steam</div>`;
      break;
    }
    case 'engine': {
      const s = e.fnet?.steam, n = e.net;
      body += `<h4>Output</h4>${pbar(e.load || 0)}<div class="dim">${Math.round((e.load || 0) * def.out)} / ${def.out} kW · ${Math.round((e.load || 0) * def.steam)} steam/s</div>`;
      const boilers = s ? s.members.some(m => m.kind === 'boiler') : false;
      body += `<div>steam: ${!boilers ? '<span class="warn">no boiler touching it</span>' : s.cap ? `<span class="okc">${Math.round((s.ratio || 0) * 100)}% available</span>` : '<span class="warn">boilers have no fuel or water</span>'} · ${n ? `network ${n.id + 1}` : '<span class="warn">not in a pole\'s area</span>'}</div>`;
      break;
    }
    case 'pole': {
      const n = e.net;
      if (n) {
        const volts = new Set(n.poles.flatMap(p => voltsOf(ENTITIES[p.type])));
        const short = n.demand > n.capacity && n.demand > 0;
        body += `<h4>Network ${n.id + 1} <span class="dim">${[...volts].map(v => VOLTAGES[v].name.toLowerCase()).join(' + ')}</span></h4>
          <div>${n.poles.length} poles · ${n.consumers} machines</div>
          <div class="dim">making: ${n.gens.length} generators · ${n.engines.length} steam engines · ${n.solar} solar</div>
          <h4>Usage</h4>${pbar(n.capacity ? n.produced / n.capacity : 0)}<div class="${short ? 'warn' : 'dim'}">${Math.round(n.produced)} / ${Math.round(n.capacity)} kW
          ${!n.capacity ? '· no power: add generators or steam engines' : short ? `· brownout: wants ${Math.round(n.demand)} kW, machines run at ${Math.round(n.sat * 100)}%` : ''}</div>`;
      }
      const cables = world.links.filter(l => [l.a, l.b].some(p => p[0] === e.x && p[1] === e.y && p[2] === e.z)).length;
      body += `<div class="dim">${VOLTAGES[voltsOf(def)[0]].name}${def.volts ? ` → ${def.volts.slice(1).map(v => VOLTAGES[v].name.toLowerCase()).join(', ')}` : ''} · supplies a ${def.supply * 2 + 1}×${def.supply * 2 + 1} area · wires reach ${def.wire} tiles${cables ? ` · ${cables} cable${cables > 1 ? 's' : ''}` : ''}</div>`;
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
    case 'belt': case 'splitter': case 'lift': case 'underground':
      body += `<div>${e.items.length} item(s) on it · ${e.speed} tiles/s</div>`;
      if (e.kind === 'underground') body += `<div class="dim">${e.role === 'in' ? (e.pair ? `entrance, linked ${e.len} tiles ahead` : 'entrance: place an exit up to 4 tiles ahead') : e.pair ? 'exit, linked' : 'exit with no entrance'}</div>`;
      if (e.kind === 'lift') body += `<div class="dim">carries items ${e.dy > 0 ? 'up' : 'down'} to layer ${e.y + e.dy}</div>`;
      body += `<div class="btns"><button data-act="rotate">rotate</button>${e.items.length ? '<button data-act="takebelt">pick up items</button>' : ''}</div>`;
      break;
    case 'transmitter': {
      const sent = sentenceFor(e), ask = currentAsk();
      body += `<h4>Charge</h4>${pbar(e.prog)}` + machineSlotsHTML(e);
      body += `<div class="dim">It hears every working machine within ${HEAR_RADIUS} tiles, nearest first. Change what is running around it to change what you say.</div>`;
      body += `<div class="dim">will send: ${sent.join(' · ')}</div>`;
      if (ask) body += `<div class="ask">they asked for: ${ask.ask.join(' · ')} ${ask.ask.every(g => sent.includes(g)) ? '<b class="okc">✓ this sentence answers it</b>' : ''}</div>`;
      break;
    }
  }
  setHTML($('epBody'), `<div class="eph"><img src="${iconURL(e.type)}"> <b>${def.name}</b> <span class="dim">L${e.y} · ${DIR_NAMES[e.dir]}</span><span class="x" data-act="close">✕</span></div>${statusLine(e)}${body}`);
  setHTML($('epInv'), `<h3>Character <span class="dim">${inv.used()}/${PLAYER.inventory}</span></h3>${invGridHTML()}<div class="dim tiny">drag stacks between your inventory and the machine · shift+click sends a stack across</div>`);
}

// ---------------------------------------------------------------- actions
function act(a, ev) {
  const [cmd, arg] = a.split(':'), e = panelEnt;
  switch (cmd) {
    case 'hot': {
      const [b, i] = arg.split('.').map(Number), bar = S.bars[b];
      if (!bar) return;
      if (ev.button === 2) { bar[i] = S.sel || null; renderHotbar(); return; }
      const it = bar[i]; selectItem(it && it === S.sel ? null : it); return;
    }
    case 'bar': S.bar = +arg; renderHotbar(); return;
    case 'tab': S.craftTab = arg; renderInventory(); return;
    case 'craft': {
      const r = RECIPE[arg];
      if (!r.hand) { toast('this one can only be made in an assembler'); return; }
      const n = ev.shiftKey ? maxCraftable(arg) : ev.button === 2 ? Math.min(5, maxCraftable(arg)) : 1;
      if (!n) { toast('missing ingredients for ' + itemName(arg)); return; }
      doAction({ a: 'craft', rid: arg, n }); renderInventory(); return;
    }
    case 'cancel': doAction({ a: 'cancel', i: +arg }); renderInventory(); return;
    case 'tech': {
      const t = TECH[arg];
      if (S.research.done.has(arg)) return;
      if (!techAvailable(t)) { toast('not available yet'); return; }
      doAction({ a: 'research', id: arg }); S.research.current = arg; renderResearch(); toast('researching ' + t.name); return;
    }
    case 'close': closeEntity(); return;
    case 'copycode': return;
  }
  if (!e) return;
  // machine panel commands run under the game rules (on the host when playing co-op)
  doAction({ a: 'cmd', x: e.x, y: e.y, z: e.z, cmd, arg });
  renderEntity(); renderHotbar();
}
document.addEventListener('pointerdown', ev => {
  const el = ev.target.closest?.('[data-act]'); if (!el) return;
  ev.preventDefault(); bus.emit('uiclick'); act(el.dataset.act, ev);
});
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
  ['power', 'Craft a steam generator, fuel it and put a small pole next to it', () => any(e => e.kind === 'generator' && e.net && (e.fuel > 0 || e.burn > 0))],
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
function renderStatus() {
  const tr = TIERS[S.maxTier], nx = TIERS[S.maxTier + 1], P = powerSummary(), [lo, hi] = layerRange();
  const cur = TECH[S.research.current];
  setHTML($('status'), `
    <div${tipAttr(`Buildable layers right now: ${lo} to ${hi}`)}><b class="logo">DEPTHWORKS</b><span class="badge ${S.mode === 'depth' ? 'depth' : ''}">${S.mode.toUpperCase()}</span><span class="badge">LAYER ${S.layer}</span></div>
    <div class="row"${tipAttr('Active engineering volume: machines that did work in the last 8 seconds. Frames with a working machine inside count double. More volume raises precision.')}>Precision ${S.maxTier} <b>${tr.name}</b> <span class="dim">${S.activeVol.toFixed(1)}${nx ? ' / ' + nx.need : ''}</span></div>
    <div class="bar"><i style="width:${nx ? Math.min(100, S.activeVol / nx.need * 100) : 100}%"></i></div>
    <div class="row"${tipAttr('Electric networks are joined by pole wires. Machines slow down when a network is overloaded. Click a pole to see its network.')}>Power${P.count > 1 ? ` <span class="dim">(${P.count} networks)</span>` : ''} <span class="${P.sat < 1 && P.demand > 0 ? 'warn' : 'dim'}">${Math.round(P.produced)} / ${Math.round(P.capacity)} kW${P.demand > P.capacity && P.demand > 0 ? ` · ${Math.round(P.sat * 100)}%` : ''}</span></div>
    <div class="bar pw"><i style="width:${P.capacity ? Math.min(100, P.produced / P.capacity * 100) : 0}%"></i></div>
    ${cur ? `<div class="row">Research <b>${cur.name}</b> <span class="dim">${S.research.progress[cur.id] || 0}/${cur.count}</span></div><div class="bar rs"><i style="width:${(S.research.progress[cur.id] || 0) / cur.count * 100}%"></i></div>` : `<div class="row dim">No research. Press T.</div>`}`);
}
export function describeCell(c) {
  if (!c) return '';
  const k = key(c.x, c.y, c.z), e = world.ents.get(k), f = world.frames.get(k), o = world.ores.get(k), out = [];
  if (e) out.push(`<b>${ENTITIES[e.type].name}</b> <span class="dim">${e.status || ''}</span>`);
  if (f) out.push('Hollow frame' + (e ? ' (machine inside)' : ''));
  const ft = c.y === 0 && world.feats.get(k);
  if (ft) out.push(`<b>${ft.type === 'tree' ? 'Tree' : 'Rock'}</b> <span class="dim">hold right-click to mine</span>`);
  if (o) out.push(`${iconHTML(o.type)} ${itemName(o.type)} · ${fmtN(o.amount)}`);
  const t = c.y === 0 && TILES[tileAt(c.x, c.z)];
  if (t?.liquid) out.push(`<b>${t.name}</b> <span class="dim">${flowAt(c.x, c.z) >= 0 ? `flows ${DIR_NAMES[flowAt(c.x, c.z)]} · ` : ''}no walking or building, except water pumps</span>`);
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

let slowT = 0;
export function updateUI(dt, hover) {
  setHTML($('info'), describeCell(hover));
  renderMineBar();
  if ((slowT += dt) < .2) return;
  slowT = 0;
  renderStatus(); renderGoals(); renderHotbar(); updateSignalText(); renderCoop();
  if (panelEnt && Math.hypot(panelEnt.x + .5 - S.player.x, panelEnt.z + .5 - S.player.z) > PLAYER.reach + 2) closeEntity();   // walked away
  if (panelEnt) renderEntity();
  if (S.modal === 'inventory') renderInventory();
  if (S.modal === 'research') renderResearch();
  if (S.modal === 'map') renderSide(false);
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
