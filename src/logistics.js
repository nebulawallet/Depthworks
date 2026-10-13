// The logistics window (L): routes for trains, trucks and boats in one place. Rail lines, truck routes and sea lanes
// are the same thing underneath (stops, what to do at each, when to leave, whether to loop), so one editor and one
// map serve all three; only the words, the depots and the tiles that count as "the way" change.
import { ITEMS, ENTITIES } from './data.js';
import { S, world, bus, key, GRID } from './state.js';
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
};
const ZOOM = [3, 4, 6, 8, 12, 16];
const L = { way: 'road', route: null, pick: false, itemPick: null, view: { cx: GRID / 2, cz: GRID / 2, ppt: 6 }, drag: null, delArm: false, unit: null };
const CARGO_ITEMS = () => Object.keys(ITEMS).filter(it => !ITEMS[it].vehicle && (!ITEMS[it].entity || ENTITIES[it]?.kind === 'belt'));

export function openLogistics() {
  L.pick = false; L.itemPick = null;
  requestAnimationFrame(() => {   // the whole world in view, as big as fits
    const r = cv().getBoundingClientRect();
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
    const i = ZOOM.indexOf(L.view.ppt), n = ZOOM[Math.max(0, Math.min(ZOOM.length - 1, i + (e.deltaY < 0 ? 1 : -1)))], r = c.getBoundingClientRect();
    const ox = e.clientX - r.left - c.width / 2, oz = e.clientY - r.top - c.height / 2;
    L.view.cx += ox / L.view.ppt - ox / n; L.view.cz += oz / L.view.ppt - oz / n; L.view.ppt = n;
  }, { passive: false });
  c.addEventListener('contextmenu', e => e.preventDefault());
  c.addEventListener('pointerdown', e => { e.preventDefault(); c.setPointerCapture(e.pointerId); L.drag = { x: e.clientX, y: e.clientY, cx: L.view.cx, cz: L.view.cz, moved: false, button: e.button }; });
  c.addEventListener('pointermove', e => {
    const d = L.drag; if (!d) return;
    const dx = e.clientX - d.x, dy = e.clientY - d.y; if (Math.hypot(dx, dy) > 4) d.moved = true;
    if (d.moved) { L.view.cx = Math.max(0, Math.min(GRID, d.cx - dx / L.view.ppt)); L.view.cz = Math.max(0, Math.min(GRID, d.cz - dy / L.view.ppt)); }
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
wireMap();
export const logisticsState = L;
export { roadAt };
