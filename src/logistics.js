// The logistics window (L): routes for trains, trucks and boats in one place. Rail lines, truck routes and sea lanes
// are the same thing underneath (stops, what to do at each, when to leave, whether to loop), so one editor and one
// map serve all three; only the words, the depots and the tiles that count as "the way" change.
// The factory's own logistics share the window: the belt lines tab lists every belt line (see belts.js) with the same
// map, list rows and item pickers, and can draw a line's whole network as boxes and arrows instead of the map.
import { ITEMS, ENTITIES, AUGMENTS, AUG_RULES } from './data.js';
import { S, world, bus, key, GRID, invGet, itemName } from './state.js';
import { networkOf, outTargets, feedsOf, lineName, lineItems, lineAugs, lineWarn, lanesOf, laneName, isBeltLike, SPACING } from './belts.js';
import { doAction } from './net.js';
import { drawMapView } from './map.js';
import { routeById, depotsNamed, dockTiles, findPath, onWay, condText, CONDS, defaultConds, stopName, vehicleById, tk, roadAt } from './transport.js';
import { iconHTML } from './icons.js';

const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const setHTML = (el, html) => { if (el._html !== html) { el.innerHTML = html; el._html = html; } };
const WAYS = {
  rail: { tab: 'Rail lines', depot: 'train station', unit: 'train', route: 'line', color: '#e0a02a', how: 'Trains run between train stations along connected rails. Signals split the track so several trains can share it.' },
  road: { tab: 'Truck routes', depot: 'truck depot', unit: 'truck', route: 'route', color: '#4aa3ff', how: 'Trucks drive between truck depots, only on connected roads, keeping right. Click road tiles to make them pass a certain way.' },
  sea: { tab: 'Sea lanes', depot: 'port', unit: 'boat', route: 'lane', color: '#7ef6ff', how: 'Boats sail between ports over connected water. Click water tiles to steer a lane around something.' },
  belt: { tab: 'Belt lines', route: 'line', color: '#ffd23f', how: 'Every belt in the factory is part of a line: a run that only carries items forward. A line ends where something decides where its items go: a splitter, a bus channel, another belt. Name lines, give them speed augments and filters, or see how they join up.' },
};
const ZOOM = [3, 4, 6, 8, 12, 16];
const L = { way: 'road', route: null, pick: false, itemPick: null, view: { cx: GRID / 2, cz: GRID / 2, ppt: 6 }, drag: null, delArm: false, unit: null,
  line: null, bview: 'map', bpick: null, gv: null, rate: new Map() };   // belt lines: the picked line (a tile's key), map or network, what the item grid picks
const CARGO_ITEMS = () => Object.keys(ITEMS).filter(it => !ITEMS[it].vehicle && (!ITEMS[it].entity || ENTITIES[it]?.kind === 'belt'));

export function openLogistics() {
  L.pick = false; L.itemPick = null;
  requestAnimationFrame(() => {   // the whole world in view, as big as fits
    const r = cv().getBoundingClientRect();
    if (L.way === 'belt' && curLine()) { L.view.ppt = 12; return; }   // opened on a belt line: stay on it, close up
    L.view.cx = L.view.cz = GRID / 2; L.view.ppt = [...ZOOM].reverse().find(p => p * GRID <= Math.min(r.width, r.height)) ?? ZOOM[0];
  });
  const rs = routesOf(L.way);
  if (!routeById(L.route) || routeById(L.route).way !== L.way) L.route = rs[0]?.id ?? null;
  renderLogistics(true);
}
const routesOf = way => world.routes.filter(r => r.way === way);
const unitsOf = way => world.units.filter(u => u.way === way);
const depotNames = way => [...new Set([...world.ents.values()].filter(e => e.kind === 'depot' && ENTITIES[e.type].way === way).map(e => e.dname))].sort();
const facOf = name => { const d = depotsNamed(name, L.way)[0]; return d ? world.factories.find(f => f.id === (d.fac ?? 1)) : null; };

// ---------------------------------------------------------------- path preview (cached per route and network)
let legCache = { key: '', legs: [] };
function stopTiles(st, way) {
  if (st.at) return [st.at];
  return depotsNamed(st.depot, way).flatMap(d => dockTiles(d));
}
function legs(r) {
  const k = JSON.stringify(r.stops) + r.loop + '|' + (world.wayVersion || 0) + '|' + depotNames(r.way).join();
  if (legCache.key === k) return legCache.legs;
  const out = [], n = r.stops.length;
  for (let i = 0; i < (r.loop ? n : n - 1) && n > 1; i++) {
    const a = r.stops[i], b = r.stops[(i + 1) % n], from = stopTiles(a, r.way), goals = new Set(stopTiles(b, r.way).map(t => tk(...t)));
    let best = null;
    for (const [x, z] of from.slice(0, 3)) for (let h = 0; h < 4; h++) { const p = findPath(r.way, x, z, h, goals); if (p && (!best || p.cost < best.cost)) best = p; }
    out.push({ i, ok: !!best, tiles: best?.tiles || [from[0], [...goals][0]?.split(',').map(Number)].filter(Boolean) });
  }
  legCache = { key: k, legs: out };
  return out;
}

// ---------------------------------------------------------------- the map
const cv = () => $('logCanvas');
function fit() { const c = cv(), r = c.getBoundingClientRect(), w = Math.max(100, Math.floor(r.width)), h = Math.max(100, Math.floor(r.height)); if (c.width !== w || c.height !== h) { c.width = w; c.height = h; } }
export function drawLogistics() {
  if (S.modal !== 'logistics') return;
  fit();
  if (L.way === 'belt') { drawBelts(); return; }
  const c = cv(), ctx = c.getContext('2d'), way = WAYS[L.way], r = routeById(L.route);
  drawMapView(ctx, c.width, c.height, L.view, true, (sx, sz) => {
    const p = L.view.ppt;
    // the network this kind of vehicle can use
    ctx.fillStyle = way.color; ctx.globalAlpha = .28;
    if (L.way === 'rail') for (const e of world.ents.values()) { if (e.kind === 'rail') ctx.fillRect(sx(e.x), sz(e.z), p, p); }
    else if (L.way === 'road') for (const k of world.roads.keys()) { const [x, z] = k.split(',').map(Number); if (onWay('road', x, z)) ctx.fillRect(sx(x), sz(z), p, p); }
    ctx.globalAlpha = 1;
    // depots of this kind, with their names
    ctx.font = '16px VT323, monospace'; ctx.textBaseline = 'middle';
    for (const e of world.ents.values()) {
      if (e.kind !== 'depot' || ENTITIES[e.type].way !== L.way) continue;
      const f = world.factories.find(q => q.id === (e.fac ?? 1));
      ctx.fillStyle = '#000'; ctx.fillRect(sx(e.x) - 2, sz(e.z) - 2, p + 4, p + 4);
      ctx.fillStyle = f?.color || '#fff'; ctx.fillRect(sx(e.x), sz(e.z), p, p);
      ctx.fillStyle = '#000'; ctx.fillText(e.dname, sx(e.x) + p + 5, sz(e.z) + p / 2 + 1); ctx.fillStyle = '#fff'; ctx.fillText(e.dname, sx(e.x) + p + 4, sz(e.z) + p / 2);
    }
    if (!r) return;
    // the route: solid where a path exists, dashed red where it doesn't
    for (const leg of legs(r)) {
      ctx.strokeStyle = leg.ok ? way.color : '#ff4a4a'; ctx.lineWidth = Math.max(2, p / 3); ctx.setLineDash(leg.ok ? [] : [6, 5]);
      ctx.beginPath(); leg.tiles.forEach(([x, z], j) => j ? ctx.lineTo(sx(x + .5), sz(z + .5)) : ctx.moveTo(sx(x + .5), sz(z + .5))); ctx.stroke();
    }
    ctx.setLineDash([]);
    r.stops.forEach((st, i) => {
      const t = stopTiles(st, r.way)[0]; if (!t) return;
      const x = sx(t[0] + .5), z = sz(t[1] + .5);
      ctx.fillStyle = '#000'; ctx.beginPath(); ctx.arc(x, z, 9, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = st.depot ? way.color : '#c8c0b0'; ctx.beginPath(); ctx.arc(x, z, 7, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#000'; ctx.textAlign = 'center'; ctx.fillText(i + 1, x, z + 1); ctx.textAlign = 'left';
    });
    for (const u of unitsOf(L.way)) if (u.route === r.id) {   // ring the vehicles running this route
      const v = vehicleById(u.cars[0]); if (!v) continue;
      ctx.strokeStyle = u.id === L.unit ? '#fff' : way.color; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(sx(v.rx ?? v.x), sz(v.rz ?? v.z), Math.max(8, p), 0, Math.PI * 2); ctx.stroke();
    }
  });
  if (L.pick) { ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillRect(0, 0, c.width, 24); ctx.fillStyle = '#ffd23f'; ctx.font = '18px VT323, monospace'; ctx.fillText(`Click a ${way.depot} to stop there, or a ${L.way === 'rail' ? 'rail' : L.way === 'road' ? 'road' : 'water'} tile to pass through it. Right-click to finish.`, 8, 16); }
}
const tileAtEvent = e => { const c = cv(), r = c.getBoundingClientRect(); return { x: Math.floor((e.clientX - r.left - c.width / 2) / L.view.ppt + L.view.cx), z: Math.floor((e.clientY - r.top - c.height / 2) / L.view.ppt + L.view.cz) }; };
function mapClick(e) {
  if (L.way === 'belt') { beltClick(e); return; }
  const t = tileAtEvent(e), r = routeById(L.route);
  if (!L.pick || !r) {   // pick a vehicle to see where it is going
    const v = world.vehicles.find(v => Math.hypot(v.x - t.x - .5, v.z - t.z - .5) < 1.2 && world.units.find(u => u.id === v.unit)?.way === L.way);
    L.unit = v?.unit ?? null; renderLogistics(true); return;
  }
  const depot = [...world.ents.values()].find(d => d.kind === 'depot' && ENTITIES[d.type].way === L.way && ((d.x === t.x && d.z === t.z) || dockTiles(d).some(([x, z]) => x === t.x && z === t.z)));
  if (depot) addStop(r, { depot: depot.dname, act: 'both', conds: defaultConds('both') });
  else if (onWay(L.way, t.x, t.z)) addStop(r, { at: [t.x, t.z], act: 'none', conds: [] });
  else bus.emit('toast', `that is not a ${WAYS[L.way].depot}, nor ${L.way === 'rail' ? 'a rail' : L.way === 'road' ? 'a road' : 'water'}`);
}
function addStop(r, st) { doAction({ a: 'route', do: 'stop', id: r.id, i: r.stops.length, stop: { items: [], ...st } }); setTimeout(() => renderLogistics(true), 0); }
function wireMap() {
  const c = cv();
  c.addEventListener('wheel', e => {
    e.preventDefault();
    if (L.way === 'belt' && L.bview === 'net' && L.gv) { const k = e.deltaY < 0 ? 1.15 : 1 / 1.15, r = c.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top; L.gv.ox = mx - (mx - L.gv.ox) * k; L.gv.oy = my - (my - L.gv.oy) * k; L.gv.s *= k; return; }
    const i = ZOOM.indexOf(L.view.ppt), n = ZOOM[Math.max(0, Math.min(ZOOM.length - 1, i + (e.deltaY < 0 ? 1 : -1)))], r = c.getBoundingClientRect();
    const ox = e.clientX - r.left - c.width / 2, oz = e.clientY - r.top - c.height / 2;
    L.view.cx += ox / L.view.ppt - ox / n; L.view.cz += oz / L.view.ppt - oz / n; L.view.ppt = n;
  }, { passive: false });
  c.addEventListener('contextmenu', e => e.preventDefault());
  c.addEventListener('pointerdown', e => { e.preventDefault(); c.setPointerCapture(e.pointerId); L.drag = { x: e.clientX, y: e.clientY, cx: L.view.cx, cz: L.view.cz, gx: L.gv?.ox, gy: L.gv?.oy, moved: false, button: e.button }; });
  c.addEventListener('pointermove', e => {
    const d = L.drag; if (!d) return;
    const dx = e.clientX - d.x, dy = e.clientY - d.y; if (Math.hypot(dx, dy) > 4) d.moved = true;
    if (!d.moved) return;
    if (L.way === 'belt' && L.bview === 'net' && L.gv) { L.gv.ox = d.gx + dx; L.gv.oy = d.gy + dy; return; }
    L.view.cx = Math.max(0, Math.min(GRID, d.cx - dx / L.view.ppt)); L.view.cz = Math.max(0, Math.min(GRID, d.cz - dy / L.view.ppt));
  });
  c.addEventListener('pointerup', e => {
    const d = L.drag; L.drag = null; if (!d || d.moved) return;
    if (d.button === 2) { L.pick = false; renderLogistics(true); return; }
    if (d.button === 0) mapClick(e);
  });
}

// ---------------------------------------------------------------- the panel
const sel = (chg, opts, cur) => `<select data-lchg="${chg}">${opts.map(([v, l]) => `<option value="${esc(v)}"${String(v) === String(cur) ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
let sideT = 0;
export function renderLogistics(force) {
  if (S.modal !== 'logistics') return;
  if (!force && (sideT += .2) < .6) return;
  sideT = 0;
  const side = $('logSide');
  if (side.contains(document.activeElement) && /INPUT|SELECT/.test(document.activeElement.tagName)) return;   // not under someone typing
  const way = WAYS[L.way], r = routeById(L.route);
  setHTML($('logBar'), `<b class="logo">LOGISTICS</b>${Object.entries(WAYS).map(([k, w]) => `<button data-lact="way:${k}" class="${L.way === k ? 'on' : ''}">${w.tab}</button>`).join('')}<span class="grow"></span><button data-lact="close">✕</button>`);
  if (L.way === 'belt') { setHTML(side, beltSide()); return; }
  let h = `<div class="dim">${way.how}</div><h4>${way.tab}</h4>`;
  h += routesOf(L.way).map(x => `<div class="mrow${x.id === L.route ? ' on' : ''}" data-lact="rsel:${x.id}"><i style="background:${way.color}"></i>${esc(x.name)} <span class="dim">${x.stops.length} stops · ${unitsOf(L.way).filter(u => u.route === x.id).length} ${way.unit}s${x.loop ? ' · loops' : ''}</span></div>`).join('') || `<div class="dim">No ${way.route}s yet.</div>`;
  h += `<div class="btns"><button data-lact="radd">+ new ${way.route}</button></div>`;
  if (r) {
    h += `<hr><input class="txt" data-lchg="rname" maxlength="32" value="${esc(r.name)}">
      <div class="btns"><button data-lact="rloop" class="${r.loop ? 'on' : ''}">${r.loop ? 'loops back to the first stop' : 'runs once, then stops'}</button><button data-lact="rdel">${L.delArm ? 'sure? click again' : 'delete'}</button></div><h4>Stops</h4>`;
    const names = depotNames(L.way), lg = legs(r);
    r.stops.forEach((st, i) => {
      const f = st.depot ? facOf(st.depot) : null, bad = lg.find(l => l.i === i && !l.ok);
      h += `<div class="stop"><div class="stoph"><b>${i + 1}</b> ${sel('starget:' + i, [...names.map(n => ['d:' + n, n]), ...(st.depot && !names.includes(st.depot) ? [['d:' + st.depot, st.depot + ' (missing)']] : []), ...(st.at ? [['w', `waypoint ${st.at[0]}, ${st.at[1]}`]] : [])], st.depot ? 'd:' + st.depot : 'w')}
        ${f ? `<i class="dot" style="background:${f.color}"></i>` : ''}${sel('sact:' + i, st.depot ? [['both', 'load + unload'], ['load', 'load'], ['unload', 'unload'], ['none', 'pass through']] : [['none', 'pass through']], st.act)}
        <span class="x" data-lact="sup:${i}">↑</span><span class="x" data-lact="sdown:${i}">↓</span><span class="x" data-lact="srm:${i}">✕</span></div>`;
      if (st.depot && st.act !== 'none') {
        h += `<div class="stopi"><span class="dim">cargo</span> ${st.items.length ? st.items.map(it => `<span data-lact="sitemrm:${i}:${it}">${iconHTML(it)}</span>`).join('') : '<span class="dim">anything</span>'} <button data-lact="sitem:${i}">${L.itemPick === i ? 'done' : '+'}</button></div>`;
        if (L.itemPick === i) h += `<div class="grid small">${CARGO_ITEMS().filter(it => !st.items.includes(it)).map(it => `<div class="cell" data-lact="sitemadd:${i}:${it}">${iconHTML(it)}</div>`).join('')}</div>`;
        st.conds.forEach((c, j) => {
          h += `<div class="cond">${j ? `<button data-lact="cor:${i}:${j}">${c.or ? 'or' : 'and'}</button>` : '<span class="dim">leave when</span>'} ${sel(`ctype:${i}:${j}`, Object.entries(CONDS), c.t)}`
            + (['time', 'idle', 'cargo', 'depot'].includes(c.t) ? ` <input class="num" data-lchg="cn:${i}:${j}" value="${c.n || 0}">` : '')
            + (['cargo', 'depot'].includes(c.t) ? ' ' + sel(`cit:${i}:${j}`, [['', 'item…'], ...CARGO_ITEMS().map(it => [it, ITEMS[it].name])], c.it || '') : '')
            + ` <span class="x" data-lact="crm:${i}:${j}">✕</span></div>`;
        });
        h += `<div class="stopi"><button data-lact="cadd:${i}">+ condition</button> <span class="dim">${esc(condText(st.conds))}</span></div>`;
      }
      if (bad) h += `<div class="warn">no ${L.way === 'rail' ? 'track' : L.way === 'road' ? 'road' : 'water'} connects this stop to the next</div>`;
      h += '</div>';
    });
    h += `<div class="btns">${names.length ? sel('snew', [['', `+ stop at a ${way.depot}…`], ...names.map(n => [n, n])], '') : `<span class="dim">no ${way.depot}s built yet</span>`}<button data-lact="spick" class="${L.pick ? 'on' : ''}">${L.pick ? 'picking on the map…' : 'pick on the map'}</button></div>`;
  }
  // every vehicle of this kind, to assign to the selected route
  const us = unitsOf(L.way);
  h += `<hr><h4>${way.unit[0].toUpperCase() + way.unit.slice(1)}s</h4>` + (us.length ? us.map(u => {
    const ur = routeById(u.route), v = vehicleById(u.cars[0]);
    return `<div class="mrow${u.id === L.unit ? ' on' : ''}"><span data-lact="uloc:${u.id}">${v ? iconHTML(v.type) : ''} ${esc(u.name)}</span> <span class="dim">${ur ? esc(ur.name) : 'no ' + way.route}${u.msg ? ' · ' + esc(u.msg) : ''}</span>
      ${r ? `<button data-lact="uass:${u.id}">${u.route === r.id ? 'unassign' : 'assign'}</button>` : ''}${ur ? `<button data-lact="ugo:${u.id}">${u.auto ? 'stop' : 'go'}</button>` : ''}</div>`;
  }).join('') : `<div class="dim">No ${way.unit}s yet. Build one in a vehicle factory and put it on the ${L.way === 'rail' ? 'rails' : L.way === 'road' ? 'road' : 'water'}.</div>`);
  setHTML(side, h);
}
function editStop(r, i, f) { const st = JSON.parse(JSON.stringify(r.stops[i])); f(st); doAction({ a: 'route', do: 'stop', id: r.id, i, stop: st }); }
function lact(a, ev) {
  const [cmd, x, y] = a.split(':'), r = routeById(L.route), i = +x, j = +y;
  if (beltAct(cmd, x, y)) { setTimeout(() => renderLogistics(true), 0); return; }
  switch (cmd) {
    case 'close': bus.emit('closemap'); return;
    case 'way': L.way = x; L.route = routesOf(x)[0]?.id ?? null; L.pick = false; L.itemPick = null; L.unit = null; break;
    case 'rsel': L.route = +x; L.pick = false; L.itemPick = null; break;
    case 'radd': { doAction({ a: 'route', do: 'add', way: L.way }); const rs = routesOf(L.way); if (S.net.role !== 'client') L.route = rs[rs.length - 1]?.id ?? null; break; }
    case 'rdel': if (!r) return; if (!L.delArm) { L.delArm = true; setTimeout(() => { L.delArm = false; }, 3000); break; } L.delArm = false; doAction({ a: 'route', do: 'remove', id: r.id }); L.route = null; break;
    case 'rloop': if (r) doAction({ a: 'route', do: 'edit', id: r.id, loop: !r.loop }); break;
    case 'sup': case 'sdown': if (r) doAction({ a: 'route', do: 'move', id: r.id, i, by: cmd === 'sup' ? -1 : 1 }); break;
    case 'srm': if (r) doAction({ a: 'route', do: 'unstop', id: r.id, i }); break;
    case 'spick': L.pick = !L.pick; break;
    case 'sitem': L.itemPick = L.itemPick === i ? null : i; break;
    case 'sitemadd': if (r) editStop(r, i, st => { st.items = [...st.items, y]; }); break;
    case 'sitemrm': if (r) editStop(r, i, st => { st.items = st.items.filter(it => it !== y); }); break;
    case 'cadd': if (r) editStop(r, i, st => { st.conds.push({ t: 'time', n: 10, it: null, or: false }); }); break;
    case 'crm': if (r) editStop(r, i, st => { st.conds.splice(j, 1); }); break;
    case 'cor': if (r) editStop(r, i, st => { st.conds[j].or = !st.conds[j].or; }); break;
    case 'uass': { const u = world.units.find(q => q.id === i); if (u && r) doAction({ a: 'route', do: 'assign', unit: u.id, route: u.route === r.id ? null : r.id }); break; }
    case 'ugo': { const u = world.units.find(q => q.id === i); if (u) doAction({ a: 'route', do: 'auto', unit: u.id, on: !u.auto }); break; }
    case 'uloc': { const u = world.units.find(q => q.id === i), v = u && vehicleById(u.cars[0]); if (v) { L.view.cx = v.x; L.view.cz = v.z; L.unit = u.id; if (u.route) L.route = u.route; } break; }
    default: return;
  }
  setTimeout(() => renderLogistics(true), 0);
}
function lchg(el) {
  const [cmd, x, y] = el.dataset.lchg.split(':'), r = routeById(L.route), i = +x, j = +y, v = el.value;
  if (cmd === 'bname') { const ln = curLine(); if (ln) lineCmd(ln, 'lname', v); el.blur(); setTimeout(() => renderLogistics(true), 0); return; }
  if (cmd === 'rname' && r) doAction({ a: 'route', do: 'edit', id: r.id, name: v });
  if (!r) return;
  if (cmd === 'snew' && v) addStop(r, { depot: v, act: 'both', conds: defaultConds('both') });
  if (cmd === 'starget') editStop(r, i, st => { if (v.startsWith('d:')) { st.depot = v.slice(2); st.at = null; if (st.act === 'none') { st.act = 'both'; st.conds = defaultConds('both'); } } });
  if (cmd === 'sact') editStop(r, i, st => { if (st.act !== v) { st.act = v; st.conds = defaultConds(v); } });
  if (cmd === 'ctype') editStop(r, i, st => { st.conds[j].t = v; });
  if (cmd === 'cn') editStop(r, i, st => { st.conds[j].n = Math.max(0, Math.floor(+v || 0)); });
  if (cmd === 'cit') editStop(r, i, st => { st.conds[j].it = v || null; });
  el.blur(); setTimeout(() => renderLogistics(true), 0);
}
document.addEventListener('pointerdown', ev => {
  const el = ev.target.closest?.('[data-lact]'); if (!el) return;
  ev.preventDefault(); bus.emit('uiclick'); lact(el.dataset.lact, ev);
});
document.addEventListener('change', ev => { const el = ev.target.closest?.('[data-lchg]'); if (el) lchg(el); });
document.addEventListener('keydown', ev => { if (ev.key === 'Enter' && ev.target.closest?.('[data-lchg]')) ev.target.blur(); });
bus.on('routes', () => { legCache.key = ''; if (S.modal === 'logistics') renderLogistics(true); });
bus.on('belts', () => { if (S.modal === 'logistics' && L.way === 'belt') renderLogistics(false); });
wireMap();
export const logisticsState = L;

// ---------------------------------------------------------------- belt lines
// A line is picked by one of its tiles, so the pick survives lines being rebuilt around it.
const curLine = () => { const e = L.line && world.ents.get(L.line); return isBeltLike(e) ? e.line : null; };
const pickLine = ln => { L.line = ln ? key(ln.segs[0].x, ln.segs[0].y, ln.segs[0].z) : null; L.bpick = null; };
const lineCmd = (ln, cmd, arg) => { const h = ln.segs[0]; doAction({ a: 'cmd', x: h.x, y: h.y, z: h.z, cmd, arg }); };
const hue = ln => { const h = ln.segs[0]; return (h.x * 47 + h.z * 89 + h.y * 31) % 360; };
const lineColor = (ln, l = 50) => `hsl(${hue(ln)},70%,${l}%)`;
const known = () => Object.keys(ITEMS).filter(it => !ITEMS[it].vehicle && (invGet(it) > 0 || S.stats.made?.[it] || S.stats.mined?.[it]));
const isSplitter = ln => ln.segs.length === 1 && ln.segs[0].kind === 'splitter';
const WAY_NAMES = ['front', 'left', 'right'];
// Open the window on a line, as a map or as its network (from a belt's panel).
export function showBeltLine(at, view = 'map') {
  L.way = 'belt'; L.line = key(...at); L.bview = view; L.bpick = null; L.gv = null;
  const e = world.ents.get(L.line); if (e) { L.view.cx = e.x + .5; L.view.cz = e.z + .5; }
  renderLogistics(true);
}
// Where a line's items go, in words, with the lines it names clickable.
const lineLink = ln => `<span class="lk" data-lact="bsel:${ln.segs[0].x},${ln.segs[0].y},${ln.segs[0].z}">${esc(lineName(ln))}</span>`;
export function lineEndHTML(ln) {
  const o = ln.out, tgt = t => !t ? '<span class="warn">nothing takes items there</span>' : t.ent ? `the ${ENTITIES[t.ent.type].name.toLowerCase()}` : t.side !== undefined ? `the ${laneName(t.line.n, t.side)} lane of ${lineLink(t.line)} (side-load)` : lineLink(t.line);
  if (!o) return 'Ends here: items wait at the end.';
  if (o.kind === 'fwd') return `Runs into ${tgt(o.fwd)}.${ln.n === 3 && o.fwd.line?.n === 2 ? ' Its outer lanes go onto the two lanes; the middle lane only fits while one side is empty.' : ''}`;
  if (o.kind === 'split') return 'Splits: ' + o.outs.map((t, k) => `${WAY_NAMES[k]}${o.b.sf?.[k] ? ` (${itemName(o.b.sf[k])} only)` : ''} → ${t ? tgt(t) : '<span class="dim">nothing</span>'}`).join(', ') + '.';
  const ch = (c, side) => c ? `${side} channel (${c.f === '*' ? 'anything' : itemName(c.f)}) → ${tgt(c.t)}` : null;
  return `Bus tile: ${o.fwd ? `the bus runs on into ${tgt(o.fwd)}` : 'the bus ends here'}${o.b.midOff ? ', the middle lane stops here' : ''}. ${[ch(o.ch[0], 'Left'), ch(o.ch[2], 'Right')].filter(Boolean).join('; ')}${o.ch[0] || o.ch[2] ? ' (only what the bus ahead can\'t take).' : ''}`;
}
// Inserters and drills putting items on each line, and inserters taking them off, in one pass over the buildings.
let tapCache = { key: '', map: new Map() };
function taps() {
  const k = (world.beltVersion || 0) + '|' + world.ents.size;
  if (tapCache.key === k) return tapCache.map;
  const m = new Map(), get = ln => m.get(ln) || m.set(ln, { ins: 0, drills: 0, outs: 0 }).get(ln);
  for (const e of world.ents.values()) {
    if (e.kind !== 'inserter' && e.kind !== 'drill') continue;
    const [dx, dz] = [[0, -1], [1, 0], [0, 1], [-1, 0]][e.dir], r = e.reach || 1;
    const to = world.ents.get(key(e.x + dx * r, e.y + (e.dy || 0), e.z + dz * r));
    if (to?.line) get(to.line)[e.kind === 'drill' ? 'drills' : 'ins']++;
    if (e.kind === 'inserter') { const from = world.ents.get(key(e.x - dx * r, e.y, e.z - dz * r)); if (from?.line) get(from.line).outs++; }
  }
  tapCache = { key: k, map: m };
  return m;
}
// How many items a line hands on per minute, smoothed over the panel's refreshes.
function lineRate(ln) {
  const id = ln.segs[0].x + ',' + ln.segs[0].y + ',' + ln.segs[0].z, r = L.rate.get(id), now = S.T;
  if (!r || r.ln !== ln) { L.rate.set(id, { ln, T: now, n: ln.moved, v: null }); return null; }
  if (now - r.T >= 1) { const v = (ln.moved - r.n) / (now - r.T) * 60; r.v = r.v === null ? v : r.v * .6 + v * .4; r.T = now; r.n = ln.moved; }
  return r.v;
}
function beltSide() {
  const ln = curLine(), t = taps();
  let h = `<div class="dim">${WAYS.belt.how}</div><div class="btns"><button data-lact="bview:map" class="${L.bview === 'map' ? 'on' : ''}">map</button><button data-lact="bview:net" class="${L.bview === 'net' ? 'on' : ''}"${ln ? '' : ' disabled'}>network</button></div>`;
  if (ln) {
    const n = ln.n, cap = Math.floor(ln.len / SPACING), rate = lineRate(ln), tp = t.get(ln) || {};
    h += `<hr><input class="txt" data-lchg="bname" maxlength="32" value="${esc(ln.cfg.name)}" placeholder="${esc(lineName(ln))}">`;
    h += `<div class="dim">${ln.segs.length} tile${ln.segs.length > 1 ? 's' : ''} · ${n} lanes · ${(+ln.speed.toFixed(2))} tiles/s${ln.speed > ln.base ? ` (${(+ln.base.toFixed(2))} without augments)` : ''} · ${lineItems(ln)} items${rate !== null ? ` · ${Math.round(rate)}/min out` : ''}</div>`;
    h += `<div class="lanes">${ln.L.map((Ln, i) => { const c = new Map(); for (const it of Ln.items) c.set(it.type, (c.get(it.type) || 0) + 1); return `<div><span class="dim">${laneName(n, i)}</span> <span class="bar"><i style="width:${Math.min(100, Ln.items.length / cap * 100)}%"></i></span> ${[...c].map(([k, v]) => iconHTML(k, v)).join('')}</div>`; }).join('')}</div>`;
    if (lineWarn(ln)) h += `<div class="warn">${lineWarn(ln)}</div>`;
    if (!isSplitter(ln)) {
      const augs = lineAugs(ln), cand = Object.keys(ITEMS).filter(it => AUGMENTS[ITEMS[it].aug]?.belts && invGet(it) > 0);
      h += `<h4>Augments</h4><div class="stopi">${augs.map((a, i) => `<span data-lact="baugrm:${a}"${i >= AUG_RULES.lineSlots ? ' class="dim"' : ''}>${iconHTML(a)}</span>`).join('')}${augs.length < AUG_RULES.lineSlots ? `<button data-lact="bpick:aug">${L.bpick === 'aug' ? 'done' : '+ speed augment'}</button>` : ''} <span class="dim">${augs.length}/${AUG_RULES.lineSlots} · click one to take it out</span></div>`;
      if (augs.length > AUG_RULES.lineSlots) h += `<div class="dim">This line was joined from lines that each had augments: only ${AUG_RULES.lineSlots} count. Take the rest out.</div>`;
      if (L.bpick === 'aug') h += cand.length ? `<div class="grid small">${cand.map(it => `<div class="cell" data-lact="baug:${it}">${iconHTML(it, invGet(it))}</div>`).join('')}</div>` : '<div class="dim">no speed augments in your inventory</div>';
      h += `<h4>Filter</h4><div class="stopi">${ln.cfg.filter.length ? 'only ' + ln.cfg.filter.map(f => `<span data-lact="bfilter:${f}">${iconHTML(f)}</span>`).join('') : '<span class="dim">takes anything</span>'} <button data-lact="bpick:filter">${L.bpick === 'filter' ? 'done' : '+ item'}</button>${ln.cfg.filter.length ? '<button data-lact="bclear">clear</button>' : ''}</div>`;
      h += `<div class="dim">A filtered line only lets those items on, from belts, inserters and drills alike.</div>`;
      if (L.bpick === 'filter') h += `<div class="grid small">${known().filter(it => !ln.cfg.filter.includes(it)).map(it => `<div class="cell" data-lact="bfilter:${it}">${iconHTML(it)}</div>`).join('')}</div>`;
    } else {   // a splitter's line: filters per way
      const sp = ln.segs[0];
      h += `<h4>Filters</h4>` + WAY_NAMES.map((w, k) => `<div class="stopi">${w}: ${sp.sf?.[k] ? `<span data-lact="bsf:${k}:">${iconHTML(sp.sf[k])}</span> only` : '<span class="dim">anything else</span>'} <button data-lact="bpick:sf${k}">${L.bpick === 'sf' + k ? 'done' : 'set'}</button></div>`
        + (L.bpick === 'sf' + k ? `<div class="grid small">${known().map(it => `<div class="cell" data-lact="bsf:${k}:${it}">${iconHTML(it)}</div>`).join('')}</div>` : '')).join('');
    }
    h += `<h4>Ends in</h4><div>${lineEndHTML(ln)}</div>`;
    const feeds = (feedsOf().get(ln) || []);
    h += `<h4>Fed by</h4><div>${[...feeds.map(f => `${lineLink(f.from)}${f.side ? ' <span class="dim">(side)</span>' : ''}`), tp.ins ? `${tp.ins} inserter${tp.ins > 1 ? 's' : ''}` : '', tp.drills ? `${tp.drills} drill${tp.drills > 1 ? 's' : ''}` : ''].filter(Boolean).join(' · ') || '<span class="dim">nothing</span>'}</div>`;
    h += `<div class="dim">${tp.outs ? `${tp.outs} inserter${tp.outs > 1 ? 's' : ''} take items off it` : 'no inserters take items off it'}</div>`;
  }
  const all = world.lines.filter(l => !isSplitter(l)).sort((a, b) => (b.cfg.name ? 1 : 0) - (a.cfg.name ? 1 : 0) || b.segs.length - a.segs.length);
  h += `<hr><h4>Lines <span class="dim">${all.length}</span></h4>`;
  h += all.slice(0, 150).map(l => `<div class="mrow${l === ln ? ' on' : ''}" data-lact="bsel:${l.segs[0].x},${l.segs[0].y},${l.segs[0].z}"><i style="background:${lineColor(l)}"></i>${esc(lineName(l))} <span class="dim">${l.segs.length} tiles · ${lineItems(l)} items${lineWarn(l) ? ' · <span class="warn">!</span>' : ''}</span></div>`).join('') || '<div class="dim">No belts built yet.</div>';
  if (all.length > 150) h += `<div class="dim">and ${all.length - 150} more: click one on the map</div>`;
  return h;
}
function beltAct(cmd, x, y) {
  const ln = curLine();
  switch (cmd) {
    case 'bsel': { if (S.modal !== 'logistics') bus.emit('openlogistics'); const [bx, by, bz] = x.split(',').map(Number); L.way = 'belt'; L.line = key(bx, by, bz); L.bpick = null; L.gv = null; return true; }
    case 'bview': L.bview = x; L.gv = null; return true;
    case 'bpick': L.bpick = L.bpick === x ? null : x; return true;
    case 'bfilter': if (ln) lineCmd(ln, 'lfilter', x); return true;
    case 'bclear': if (ln) lineCmd(ln, 'lfilterclear'); return true;
    case 'baug': if (ln) lineCmd(ln, 'laugput', x); L.bpick = null; return true;
    case 'baugrm': if (ln) lineCmd(ln, 'laugtake', x); return true;
    case 'bsf': if (ln && isSplitter(ln)) { lineCmd(ln, 'sfilter', x + ':' + (y || '')); L.bpick = null; } return true;
  }
  return false;
}
// Click a belt on the map to pick its line (any layer, the ground first).
function beltClick(e) {
  if (L.bview === 'net') { netClick(e); return; }
  const t = tileAtEvent(e);
  for (const y of [0, 1, -1, 2, -2, 3, 4]) { const b = world.ents.get(key(t.x, y, t.z)); if (isBeltLike(b) && b.line) { pickLine(b.line); renderLogistics(true); return; } }
  pickLine(null); renderLogistics(true);
}
function drawBelts() {
  const c = cv(), ctx = c.getContext('2d'), ln = curLine();
  if (L.bview === 'net' && ln) { drawNet(ctx, c.width, c.height, ln); return; }
  const net = ln ? new Set(networkOf(ln)) : null;
  drawMapView(ctx, c.width, c.height, L.view, true, (sx, sz) => {
    const p = L.view.ppt, inset = Math.max(1, p * .15);
    for (const l of world.lines) {
      const on = l === ln, near = net?.has(l);
      ctx.globalAlpha = on ? 1 : net ? (near ? .85 : .3) : .7; ctx.fillStyle = on ? '#fff' : lineColor(l, near ? 60 : 50);
      for (const s of l.segs) { const d = s.y === 0 ? inset : inset * 2; ctx.fillRect(sx(s.x) + d, sz(s.z) + d, p - d * 2, p - d * 2); }
    }
    ctx.globalAlpha = 1;
    if (!ln) return;
    // the picked line's path, its end, and the joins in its network
    ctx.strokeStyle = '#000'; ctx.lineWidth = Math.max(2, p / 4);
    ctx.beginPath(); ln.segs.forEach((s, j) => j ? ctx.lineTo(sx(s.x + .5), sz(s.z + .5)) : ctx.moveTo(sx(s.x + .5), sz(s.z + .5))); ctx.stroke();
    for (const l of net) {
      const b = l.segs[l.segs.length - 1], [dx, dz] = [[0, -1], [1, 0], [0, 1], [-1, 0]][b.dir], x = sx(b.x + .5 + dx * .5), z = sz(b.z + .5 + dz * .5);
      ctx.fillStyle = lineWarn(l) ? '#ff4a4a' : !l.out ? '#888' : l.out.kind === 'split' ? '#fff' : l.out.kind === 'bus' ? '#ffa53d' : '#ffd23f';
      ctx.beginPath(); ctx.arc(x, z, Math.max(3, p / 4), 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = '#000'; ctx.lineWidth = 1; ctx.stroke();
    }
  });
}
// The network as a diagram: each line a box (splitters small), arrows for where items go, columns from upstream to
// downstream. Buildings fed by bus channels hang off the end. Drag to pan, wheel to zoom, click a box to pick it.
let netCache = { key: '' };
function netLayout(ln) {
  const k = (world.beltVersion || 0) + ':' + key(ln.segs[0].x, ln.segs[0].y, ln.segs[0].z) + ':' + world.ents.size;
  if (netCache.key === k) return netCache;
  const lines = networkOf(ln), set = new Set(lines), rank = new Map(lines.map(l => [l, 0]));
  for (let pass = 0; pass < lines.length; pass++) {   // longest path from the sources (loops stop growing at the size of the network)
    let changed = false;
    for (const a of lines) for (const t of outTargets(a)) if (t.line && set.has(t.line) && rank.get(t.line) < rank.get(a) + 1 && rank.get(a) + 1 < lines.length) { rank.set(t.line, rank.get(a) + 1); changed = true; }
    if (!changed) break;
  }
  const cols = [], boxes = new Map(), ents = [];
  for (const l of lines) (cols[rank.get(l)] ||= []).push(l);
  const BW = 200, BH = 58, GX = 80, GY = 22;
  cols.forEach((col, i) => col.sort((a, b) => a.segs[0].z - b.segs[0].z || a.segs[0].x - b.segs[0].x).forEach((l, j) => {
    const sp = isSplitter(l);
    boxes.set(l, { x: i * (BW + GX) + (sp ? BW / 2 - 30 : 0), y: j * (BH + GY), w: sp ? 60 : BW, h: sp ? 40 : BH });
  }));
  for (const l of lines) if (l.out?.kind === 'bus') for (const c of [l.out.ch[0], l.out.ch[2]]) if (c?.t?.ent) { const b = boxes.get(l); ents.push({ from: l, e: c.t.ent, f: c.f, x: b.x + b.w + GX * .25, y: b.y + BH + 4 + ents.filter(q => q.from === l).length * 34, w: 150, h: 28 }); }
  let maxX = 0, maxY = 0; for (const b of [...boxes.values(), ...ents]) { maxX = Math.max(maxX, b.x + b.w); maxY = Math.max(maxY, b.y + b.h); }
  netCache = { key: k, lines, boxes, ents, w: maxX, h: maxY };
  return netCache;
}
function drawNet(ctx, W, H, ln) {
  const g = netLayout(ln), t = taps();
  if (!L.gv) { const s = Math.min(1.2, (W - 60) / Math.max(1, g.w), (H - 60) / Math.max(1, g.h)); L.gv = { s, ox: (W - g.w * s) / 2, oy: (H - g.h * s) / 2 }; }
  const { s, ox, oy } = L.gv, X = x => ox + x * s, Y = y => oy + y * s;
  ctx.fillStyle = '#0b0d12'; ctx.fillRect(0, 0, W, H);
  ctx.lineWidth = Math.max(1.5, 2 * s);
  const arrowTo = (x1, y1, x2, y2, col, dash) => {
    ctx.strokeStyle = col; ctx.setLineDash(dash ? [6, 5] : []);
    const mx = (x1 + x2) / 2; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.bezierCurveTo(mx, y1, mx, y2, x2, y2); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(x2, y2); ctx.lineTo(x2 - 9 * s, y2 - 5 * s); ctx.lineTo(x2 - 9 * s, y2 + 5 * s); ctx.fill();
  };
  // connections first, under the boxes
  for (const l of g.lines) {
    const a = g.boxes.get(l);
    for (const tg of outTargets(l)) {
      if (!tg.line || !g.boxes.has(tg.line)) continue;
      const b = g.boxes.get(tg.line), self = tg.line === l;
      if (self) { ctx.strokeStyle = lineColor(l, 65); ctx.beginPath(); ctx.arc(X(a.x + a.w / 2), Y(a.y), 18 * s, Math.PI, 0); ctx.stroke(); continue; }
      const back = b.x <= a.x;   // a loop back upstream goes round underneath
      arrowTo(X(a.x + a.w), Y(a.y + a.h / 2), back ? X(b.x + b.w / 2) : X(b.x), back ? Y(b.y + b.h) : Y(b.y + b.h / 2), tg.side !== undefined ? '#9aa1ad' : lineColor(l, 65), tg.side !== undefined);
    }
  }
  for (const q of g.ents) { const a = g.boxes.get(q.from); arrowTo(X(a.x + a.w), Y(a.y + a.h - 8), X(q.x), Y(q.y + q.h / 2), '#ffa53d', false); }
  ctx.textBaseline = 'top';
  for (const l of g.lines) {
    const b = g.boxes.get(l), x = X(b.x), y = Y(b.y), w = b.w * s, h = b.h * s, on = l === ln, tp = t.get(l) || {};
    ctx.fillStyle = '#161b24'; ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = lineWarn(l) ? '#ff4a4a' : on ? '#fff' : lineColor(l, 55); ctx.lineWidth = on ? 3 : 1.5; ctx.strokeRect(x + .5, y + .5, w, h);
    ctx.fillStyle = '#e8ecf2'; ctx.font = `${Math.round(17 * s)}px VT323, monospace`;
    if (isSplitter(l)) { ctx.fillText('split', x + 6 * s, y + 4 * s); if (l.segs[0].sf?.some(Boolean)) { ctx.fillStyle = '#ffd23f'; ctx.fillText('filters', x + 6 * s, y + 20 * s); } continue; }
    ctx.fillText(lineName(l).slice(0, 22), x + 6 * s, y + 3 * s);
    ctx.fillStyle = '#9aa1ad'; ctx.font = `${Math.round(14 * s)}px VT323, monospace`;
    ctx.fillText(`${l.segs.length} tiles · ${lineItems(l)} items · ${(+l.speed.toFixed(1))}/s`, x + 6 * s, y + 20 * s);
    const io = [tp.ins ? `▶${tp.ins} ins` : '', tp.drills ? `▶${tp.drills} drills` : '', tp.outs ? `◀${tp.outs} out` : '', l.cfg.filter.length ? 'filtered' : '', lineAugs(l).length ? `+${lineAugs(l).length} aug` : ''].filter(Boolean).join(' ');
    if (io) ctx.fillText(io, x + 6 * s, y + 34 * s);
    // lane fill bars along the bottom
    const cap = Math.max(1, l.len / SPACING);
    l.L.forEach((Ln, i) => { ctx.fillStyle = '#2a3140'; ctx.fillRect(x + 6 * s, y + h - (8 + i * 5) * s, w - 12 * s, 3 * s); ctx.fillStyle = lineColor(l, 60); ctx.fillRect(x + 6 * s, y + h - (8 + i * 5) * s, (w - 12 * s) * Math.min(1, Ln.items.length / cap), 3 * s); });
    if (!l.out) { ctx.fillStyle = '#888'; ctx.fillRect(x + w + 4 * s, y + h / 2 - 4 * s, 8 * s, 8 * s); }
  }
  for (const q of g.ents) {
    const x = X(q.x), y = Y(q.y), w = q.w * s, h = q.h * s;
    ctx.fillStyle = '#20180f'; ctx.fillRect(x, y, w, h); ctx.strokeStyle = '#ffa53d'; ctx.lineWidth = 1.5; ctx.strokeRect(x + .5, y + .5, w, h);
    ctx.fillStyle = '#ffd8a8'; ctx.font = `${Math.round(14 * s)}px VT323, monospace`;
    ctx.fillText(`${ENTITIES[q.e.type].name} ← ${q.f === '*' ? 'any' : itemName(q.f)}`.slice(0, 26), x + 5 * s, y + 6 * s);
  }
  ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillRect(0, 0, W, 22); ctx.fillStyle = '#9aa1ad'; ctx.font = '16px VT323, monospace';
  ctx.fillText(`Network of ${lineName(ln)}: ${g.lines.length} lines. Arrows: where items go (dashed: side-load, orange: bus channel). Drag, wheel, click a box.`, 8, 4);
}
function netClick(e) {
  const g = netCache, ln = curLine(); if (!ln || !L.gv || !g.boxes) return;
  const r = cv().getBoundingClientRect(), mx = (e.clientX - r.left - L.gv.ox) / L.gv.s, my = (e.clientY - r.top - L.gv.oy) / L.gv.s;
  for (const [l, b] of g.boxes) if (mx >= b.x && mx <= b.x + b.w && my >= b.y && my <= b.y + b.h) { pickLine(l); renderLogistics(true); return; }
  for (const q of g.ents) if (mx >= q.x && mx <= q.x + q.w && my >= q.y && my <= q.y + q.h) { L.view.cx = q.e.x; L.view.cz = q.e.z; L.bview = 'map'; renderLogistics(true); return; }
}
export { roadAt };
