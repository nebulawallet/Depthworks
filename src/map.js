// The map. The surface is drawn one pixel per tile into cached 16x16-tile chunks, and only chunks whose tiles
// changed get redrawn (a few per frame at most), so even a big world never hitches. The minimap shows the
// area around you; the big map (M, or click the minimap) zooms and pans over everything, holds markers and
// labelled areas, and switches views: terrain, resources, production and power.
import { ENTITIES, ITEMS, TILES, VOLTAGES } from './data.js';
import { S, world, bus, key, GRID, LAYER_MAX } from './state.js';
import { nets, voltsOf } from './sim.js';
import { powerProblem } from './scene.js';
import { doAction } from './net.js';
import { iconHTML, fmtN } from './icons.js';

const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const setHTML = (el, html) => { if (el._html !== html) { el.innerHTML = html; el._html = html; } };
const MODES = [['terrain', 'Terrain'], ['resources', 'Resources'], ['production', 'Production'], ['power', 'Power']];
const TOOLS = [['pan', 'Move'], ['marker', 'Marker'], ['area', 'Area']];
const ZOOM = [2, 3, 4, 6, 8, 12, 16, 24];
const COLORS = ['#ffd23f', '#7ef6ff', '#9be37a', '#ff8a3d', '#ff5a7a', '#b07ad8', '#e8ecf2'];
const view = { cx: GRID / 2, cz: GRID / 2, ppt: 6 };
let mode = 'terrain', tool = 'pan', selected = null;

// ---------------------------------------------------------------- tile colours
const rgb = h => [h >> 16 & 255, h >> 8 & 255, h & 255];
const mix = (a, b, k) => a.map((v, i) => v + (b[i] - v) * k);
const shade = (c, k) => c.map(v => v * k);
const hashT = (x, z) => { let h = Math.imul(x, 374761393) + Math.imul(z, 668265263); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967295; };
const GROUND = rgb(TILES[0].map), TREE = rgb(0x2f5a2a), ROCK = rgb(0x7a7066), FRAME = rgb(0x8f9aa6);
const STATUS = { ok: rgb(0x6ac46a), idle: rgb(0xd8b84a), bad: rgb(0xe0503a), none: rgb(0x5c6470) };
const PROBLEM = /no power|out of fuel|not connected|no water|no steam|missing|exhausted|blocked|full|nothing/;
function topThing(x, z) {
  for (let y = LAYER_MAX; y >= 0; y--) { const e = world.ents.get(key(x, y, z)); if (e) return e; }
  for (let y = LAYER_MAX; y >= 0; y--) { const f = world.frames.get(key(x, y, z)); if (f) return f; }
  return null;
}
function entColor(e) {
  if (e.kind === 'frame') return FRAME;
  const c = rgb(ENTITIES[e.type].color);
  return e.items ? shade(c, .75) : c;
}
function tileColor(x, z) {
  const k = key(x, 0, z), t = TILES[world.tiles[z * GRID + x]], v = .92 + hashT(x, z) * .14;
  const ore = world.ores.get(k), feat = world.feats.get(k), e = topThing(x, z);
  let c = t.liquid ? rgb(t.map) : shade(GROUND, v);
  if (mode === 'terrain') {
    if (ore) c = mix(c, rgb(ITEMS[ore.type].color), .7);
    if (feat) c = feat.type === 'tree' ? shade(TREE, v) : ROCK;
    if (e) c = entColor(e);
  } else if (mode === 'resources') {
    c = t.liquid ? shade(c, .7) : shade(mix(c, [70, 70, 70], .5), .6);
    if (ore) c = mix(rgb(ITEMS[ore.type].color), [255, 255, 255], Math.min(.35, ore.amount / 4000));
    else if (e) c = mix(c, entColor(e), .3);
  } else {
    c = t.liquid ? shade(c, .55) : shade(mix(c, [60, 60, 60], .6), .5);
    if (ore && mode === 'production') c = mix(c, rgb(ITEMS[ore.type].color), .2);
    if (e && e.kind !== 'frame') c = mode === 'production' ? prodColor(e) : powerColor(e);
    else if (e) c = shade(FRAME, .5);
  }
  return c;
}
function prodColor(e) {
  if (e.items) return S.T - e.lastActive < 1 && e.items.length ? STATUS.ok : STATUS.none;
  if (e.kind === 'pole' || e.kind === 'chest') return STATUS.none;
  if (PROBLEM.test(e.status || '')) return STATUS.bad;
  return S.T - e.lastActive < 1.5 ? STATUS.ok : STATUS.idle;
}
function powerColor(e) {
  const def = ENTITIES[e.type];
  if (e.kind === 'pole') return voltsOf(def).length > 1 ? rgb(0x9fd0ff) : rgb(VOLTAGES[voltsOf(def)[0]].wire);
  if (def.out || e.kind === 'solar') return e.net ? rgb(0xffd23f) : STATUS.bad;
  if (e.kind === 'boiler' || e.kind === 'pump') return rgb(0xd8883a);
  const p = def.power ? powerProblem(e) : 'n/a';
  return p === 'n/a' ? STATUS.none : p === 'none' ? STATUS.bad : p === 'low' ? STATUS.idle : STATUS.ok;
}

// ---------------------------------------------------------------- chunk cache
const CH = 16, NCH = Math.ceil(GRID / CH);
const chunks = Array.from({ length: NCH * NCH }, () => {
  const cv = document.createElement('canvas'); cv.width = cv.height = CH;
  return { cv, ctx: cv.getContext('2d'), dirty: true, built: false };
});
const chunkAt = (x, z) => chunks[Math.floor(z / CH) * NCH + Math.floor(x / CH)];
const dirtyAt = (x, z) => { const c = chunkAt(x, z); if (c) c.dirty = true; };
const dirtyAll = () => { for (const c of chunks) c.dirty = true; };
function buildChunk(i) {
  const c = chunks[i], x0 = (i % NCH) * CH, z0 = Math.floor(i / NCH) * CH, img = c.ctx.createImageData(CH, CH), d = img.data;
  for (let dz = 0; dz < CH; dz++) for (let dx = 0; dx < CH; dx++) {
    const x = x0 + dx, z = z0 + dz; if (x >= GRID || z >= GRID) continue;
    const col = tileColor(x, z), j = (dz * CH + dx) * 4;
    d[j] = col[0]; d[j + 1] = col[1]; d[j + 2] = col[2]; d[j + 3] = 255;
  }
  c.ctx.putImageData(img, 0, 0); c.dirty = false; c.built = true;
}
// Rebuild at most `budget` stale chunks per call; never-built chunks always go first.
function refreshChunks(budget) {
  for (let pass = 0; pass < 2 && budget > 0; pass++)
    for (let i = 0; i < chunks.length && budget > 0; i++) if (chunks[i].dirty && (pass || !chunks[i].built)) { buildChunk(i); budget--; }
}
for (const ev of ['placed', 'removed', 'remesh']) bus.on(ev, e => dirtyAt(e.x, e.z));
bus.on('ore', (x, y, z) => { if (y === 0) dirtyAt(x, z); });
bus.on('feat', (x, z) => dirtyAt(x, z));
bus.on('marks', () => { if (S.modal === 'map') renderSide(true); });
export function resetMap() { dirtyAll(); hist.length = 0; selected = null; }

// ---------------------------------------------------------------- drawing
function drawWorld(ctx, W, H, v, big) {
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = '#0b0d12'; ctx.fillRect(0, 0, W, H);
  const sx = x => (x - v.cx) * v.ppt + W / 2, sz = z => (z - v.cz) * v.ppt + H / 2;
  for (let i = 0; i < chunks.length; i++) {
    const x0 = (i % NCH) * CH, z0 = Math.floor(i / NCH) * CH, px = sx(x0), pz = sz(z0), size = CH * v.ppt;
    if (px > W || pz > H || px + size < 0 || pz + size < 0 || !chunks[i].built) continue;
    ctx.drawImage(chunks[i].cv, Math.floor(px), Math.floor(pz), size, size);
  }
  ctx.strokeStyle = '#2a3140'; ctx.lineWidth = 1; ctx.strokeRect(Math.floor(sx(0)) + .5, Math.floor(sz(0)) + .5, GRID * v.ppt, GRID * v.ppt);
  if (mode === 'power') for (const n of nets) {   // supply areas, one colour per network
    ctx.fillStyle = `hsla(${(n.id * 137) % 360}, 80%, 60%, .16)`;
    for (const p of n.poles) { if (p.y < 0) continue; const s = ENTITIES[p.type].supply; ctx.fillRect(sx(p.x - s), sz(p.z - s), (s * 2 + 1) * v.ppt, (s * 2 + 1) * v.ppt); }
  }
  ctx.font = `${big ? 18 : 14}px VT323, monospace`; ctx.textBaseline = 'top';
  for (const a of world.marks.areas) {
    const x = sx(a.x0), z = sz(a.z0), w = (a.x1 - a.x0 + 1) * v.ppt, h = (a.z1 - a.z0 + 1) * v.ppt;
    ctx.globalAlpha = .18; ctx.fillStyle = a.color; ctx.fillRect(x, z, w, h); ctx.globalAlpha = 1;
    ctx.strokeStyle = a.color; ctx.lineWidth = selected === a.id ? 3 : 1.5; ctx.strokeRect(x, z, w, h);
    if (big || w > 40) { ctx.fillStyle = a.color; ctx.fillText(a.name, x + 4, z + 3); }
  }
  for (const m of world.marks.markers) {
    const x = sx(m.x + .5), z = sz(m.z + .5);
    ctx.fillStyle = '#000'; ctx.beginPath(); ctx.arc(x, z - 7, 6, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = m.color; ctx.beginPath(); ctx.arc(x, z - 7, 4.5, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.moveTo(x - 3, z - 4); ctx.lineTo(x + 3, z - 4); ctx.lineTo(x, z + 1); ctx.fill();
    if (selected === m.id) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, z - 7, 9, 0, Math.PI * 2); ctx.stroke(); }
    if (big) { ctx.fillStyle = '#000'; ctx.fillText(m.name, x + 9, z - 15); ctx.fillStyle = m.color; ctx.fillText(m.name, x + 8, z - 16); }
  }
  for (const p of S.players.values()) {
    const x = sx(p.local ? p.x : p.rx ?? p.x), z = sz(p.local ? p.z : p.rz ?? p.z), r = big ? 7 : 5, f = p.face || 0;
    ctx.fillStyle = p.local ? '#ffffff' : '#' + p.color.toString(16).padStart(6, '0'); ctx.strokeStyle = '#000'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x + Math.sin(f) * r, z + Math.cos(f) * r); ctx.lineTo(x + Math.sin(f + 2.5) * r * .8, z + Math.cos(f + 2.5) * r * .8); ctx.lineTo(x + Math.sin(f - 2.5) * r * .8, z + Math.cos(f - 2.5) * r * .8); ctx.closePath(); ctx.stroke(); ctx.fill();
    if (big && !p.local) { ctx.fillStyle = '#fff'; ctx.fillText(p.name, x + 9, z - 6); }
  }
}

// ---------------------------------------------------------------- minimap
const mini = $('minimap'), mctx = mini.getContext('2d');
let miniT = 0, liveT = 0;
mini.addEventListener('pointerdown', e => { e.preventDefault(); bus.emit('openmap'); });
export function updateMap(dt) {
  if (!S.started) return;
  if ((liveT += dt) > 1) { liveT = 0; if (mode === 'production' || mode === 'power') dirtyAll(); sampleStats(); }
  const open = S.modal === 'map';
  refreshChunks(open ? 8 : 3);
  if (open) { drawBig(); return; }
  if (S.hideUI || (miniT += dt) < .2) return;
  miniT = 0;
  drawWorld(mctx, mini.width, mini.height, { cx: S.player.x, cz: S.player.z, ppt: 4 }, false);
}

// ---------------------------------------------------------------- the big map
const cv = $('mapCanvas'), ctx = cv.getContext('2d');
function fitCanvas() {
  const r = cv.getBoundingClientRect(), w = Math.max(100, Math.floor(r.width)), h = Math.max(100, Math.floor(r.height));
  if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
}
function drawBig() {
  fitCanvas();
  drawWorld(ctx, cv.width, cv.height, view, true);
  if (drag?.area) {   // the area being drawn
    const [a, b] = [drag.area, drag.cur], W = cv.width, H = cv.height;
    const x = (Math.min(a.x, b.x) - view.cx) * view.ppt + W / 2, z = (Math.min(a.z, b.z) - view.cz) * view.ppt + H / 2;
    ctx.strokeStyle = '#fff'; ctx.setLineDash([4, 3]); ctx.lineWidth = 1.5;
    ctx.strokeRect(x, z, (Math.abs(a.x - b.x) + 1) * view.ppt, (Math.abs(a.z - b.z) + 1) * view.ppt); ctx.setLineDash([]);
  }
}
export function openMapView() {
  view.cx = S.player.x; view.cz = S.player.z;
  if (!ZOOM.includes(view.ppt)) view.ppt = 6;
  selected = null; renderSide(true);
}
const tileAtEvent = e => {
  const r = cv.getBoundingClientRect();
  return { x: Math.floor((e.clientX - r.left - cv.width / 2) / view.ppt + view.cx), z: Math.floor((e.clientY - r.top - cv.height / 2) / view.ppt + view.cz) };
};
const clampView = () => { view.cx = Math.max(0, Math.min(GRID, view.cx)); view.cz = Math.max(0, Math.min(GRID, view.cz)); };
function zoomAt(dir, e) {
  const i = ZOOM.indexOf(view.ppt), n = ZOOM[Math.max(0, Math.min(ZOOM.length - 1, i + dir))];
  if (n === view.ppt) return;
  if (e) {   // keep the tile under the cursor where it is
    const r = cv.getBoundingClientRect(), ox = e.clientX - r.left - cv.width / 2, oz = e.clientY - r.top - cv.height / 2;
    view.cx += ox / view.ppt - ox / n; view.cz += oz / view.ppt - oz / n;
  }
  view.ppt = n; clampView();
}
cv.addEventListener('wheel', e => { e.preventDefault(); zoomAt(e.deltaY < 0 ? 1 : -1, e); }, { passive: false });
cv.addEventListener('contextmenu', e => e.preventDefault());
let drag = null;
cv.addEventListener('pointerdown', e => {
  e.preventDefault(); cv.setPointerCapture(e.pointerId);
  const t = tileAtEvent(e);
  if (e.button === 0 && tool === 'area') drag = { area: t, cur: t };
  else drag = { x: e.clientX, y: e.clientY, cx: view.cx, cz: view.cz, moved: false, button: e.button };
});
cv.addEventListener('pointermove', e => {
  if (!drag) return;
  if (drag.area) { drag.cur = tileAtEvent(e); return; }
  const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
  if (Math.hypot(dx, dy) > 4) drag.moved = true;
  if (drag.moved) { view.cx = drag.cx - dx / view.ppt; view.cz = drag.cz - dy / view.ppt; clampView(); }
});
cv.addEventListener('pointerup', e => {
  const d = drag; drag = null; if (!d) return;
  const t = tileAtEvent(e);
  if (d.area) {
    if (d.area.x === t.x && d.area.z === t.z) return;
    addMark({ kind: 'area', x0: d.area.x, z0: d.area.z, x1: t.x, z1: t.z, name: `Area ${world.marks.next}` });
    return;
  }
  if (d.moved || d.button !== 0) return;
  if (tool === 'marker') { addMark({ kind: 'marker', x: t.x, z: t.z, name: `Marker ${world.marks.next}` }); return; }
  selected = pickMark(e)?.id ?? null; renderSide(true);
});
// Markers win over areas; the smallest area under the cursor wins over bigger ones.
function pickMark(e) {
  const r = cv.getBoundingClientRect(), px = e.clientX - r.left, pz = e.clientY - r.top;
  const sx = x => (x - view.cx) * view.ppt + cv.width / 2, sz = z => (z - view.cz) * view.ppt + cv.height / 2;
  const m = world.marks.markers.find(m => Math.hypot(sx(m.x + .5) - px, sz(m.z + .5) - 7 - pz) < 10);
  if (m) return m;
  const t = tileAtEvent(e);
  return world.marks.areas.filter(a => t.x >= a.x0 && t.x <= a.x1 && t.z >= a.z0 && t.z <= a.z1)
    .sort((a, b) => (a.x1 - a.x0) * (a.z1 - a.z0) - (b.x1 - b.x0) * (b.z1 - b.z0))[0];
}
function addMark(o) {
  const color = COLORS[(world.marks.next - 1) % COLORS.length], next = world.marks.next;
  doAction({ a: 'mark', do: 'add', color, ...o });
  if (S.net.role !== 'client') selected = next;   // in co-op the host numbers it, so pick it once it arrives
  tool = 'pan'; renderSide(true);
}

// ---------------------------------------------------------------- side panel: views, tools, stats, editor
$('mapBar').addEventListener('pointerdown', e => {
  const b = e.target.closest?.('[data-map]'); if (!b) return;
  e.preventDefault();
  const [cmd, arg] = b.dataset.map.split(':');
  if (cmd === 'mode') { mode = arg; dirtyAll(); }
  if (cmd === 'tool') tool = arg;
  if (cmd === 'zoom') zoomAt(+arg);
  if (cmd === 'home') { view.cx = S.player.x; view.cz = S.player.z; }
  if (cmd === 'close') { bus.emit('closemap'); return; }
  renderSide(true);
});
$('mapSide').addEventListener('pointerdown', e => {
  const b = e.target.closest?.('[data-map]'); if (!b) return;
  const [cmd, arg] = b.dataset.map.split(':');
  if (cmd === 'goto') { const m = findMark(+arg); if (m) { selected = m.id; view.cx = (m.x ?? (m.x0 + m.x1) / 2) + .5; view.cz = (m.z ?? (m.z0 + m.z1) / 2) + .5; } }
  else if (cmd === 'color') doAction({ a: 'mark', do: 'edit', id: selected, color: arg });
  else if (cmd === 'remove') { doAction({ a: 'mark', do: 'remove', id: selected }); selected = null; }
  else return;
  e.preventDefault(); renderSide(true);
});
$('mapSide').addEventListener('change', e => { if (e.target.id === 'markName') doAction({ a: 'mark', do: 'edit', id: selected, name: e.target.value }); });
$('mapSide').addEventListener('keydown', e => { if (e.target.id === 'markName' && e.key === 'Enter') e.target.blur(); });
const findMark = id => world.marks.markers.find(m => m.id === id) || world.marks.areas.find(a => a.id === id);

let sideT = 0;
export function renderSide(force) {
  if (S.modal !== 'map') return;
  if (!force && (sideT += .2) < .8) return;   // called from the UI timer: stats refresh about once a second
  sideT = 0;
  const btn = (cmd, label, on) => `<button data-map="${cmd}" class="${on ? 'on' : ''}">${label}</button>`;
  setHTML($('mapBar'), `<b class="logo">MAP</b>${MODES.map(([id, n]) => btn('mode:' + id, n, mode === id)).join('')}<span class="sep"></span>`
    + TOOLS.map(([id, n]) => btn('tool:' + id, n, tool === id)).join('') + `<span class="sep"></span>${btn('zoom:-1', '−')}${btn('zoom:1', '+')}${btn('home', 'Me')}<span class="grow"></span>${btn('close', '✕')}`);
  const sel = selected && findMark(selected);
  let html = '';
  if (sel) {
    if (document.activeElement?.id === 'markName') return;   // don't rebuild under someone typing
    html += `<h3>${sel.x0 !== undefined ? 'Area' : 'Marker'}</h3><input id="markName" maxlength="32" value="${esc(sel.name)}" autocomplete="off" spellcheck="false">
      <div class="swatches">${COLORS.map(c => `<i data-map="color:${c}" style="background:${c}" class="${sel.color === c ? 'on' : ''}"></i>`).join('')}</div>
      <div class="dim">${sel.x0 !== undefined ? `${sel.x1 - sel.x0 + 1}×${sel.z1 - sel.z0 + 1} tiles` : `at ${sel.x}, ${sel.z}`}</div>
      <div class="btns"><button data-map="remove">Remove</button></div><hr>`;
  }
  html += tool === 'marker' ? '<div class="hint">Click the map to drop a marker.</div>' : tool === 'area' ? '<div class="hint">Drag across the map to mark an area.</div>'
    : '<div class="dim">Drag to move, wheel to zoom, click a marker or area to edit it.</div>';
  html += modeHTML();
  const list = [...world.marks.markers, ...world.marks.areas];
  if (list.length) html += `<h4>Markers and areas</h4>` + list.map(m => `<div class="mrow${m.id === selected ? ' on' : ''}" data-map="goto:${m.id}"><i style="background:${m.color}"></i>${esc(m.name)}</div>`).join('');
  setHTML($('mapSide'), html);
}
function modeHTML() {
  if (mode === 'terrain') return `<h4>Legend</h4><div class="legend"><i style="background:#${TILES[1].map.toString(16)}"></i>water <i style="background:#${TILES[2].map.toString(16)}"></i>river <i style="background:#2f5a2a"></i>trees</div>`;
  if (mode === 'resources') {
    const by = {};
    for (const [k, o] of world.ores) { const y = +k.split(',')[1], r = by[o.type] ||= { 0: 0, '-1': 0, '-2': 0, tiles: 0 }; r[y] += o.amount; r.tiles++; }
    const rows = Object.entries(by).sort((a, b) => (b[1][0] + b[1][-1] + b[1][-2]) - (a[1][0] + a[1][-1] + a[1][-2]));
    return `<h4>Deposits left</h4><table class="mt"><tr class="dim"><td></td><td>surface</td><td>L-1</td><td>L-2</td></tr>${rows.map(([t, r]) => `<tr><td>${iconHTML(t)}</td><td>${r[0] ? fmtN(r[0]) : '·'}</td><td>${r[-1] ? fmtN(r[-1]) : '·'}</td><td>${r[-2] ? fmtN(r[-2]) : '·'}</td></tr>`).join('')}</table><div class="dim">The map shows the surface. Bright tiles are rich.</div>`;
  }
  if (mode === 'production') {
    const rate = rates(), items = Object.keys(ITEMS).filter(it => rate.made[it] || rate.used[it]).sort((a, b) => (rate.made[b] || 0) + (rate.used[b] || 0) - (rate.made[a] || 0) - (rate.used[a] || 0)).slice(0, 16);
    return `<div class="legend"><i style="background:#6ac46a"></i>working <i style="background:#d8b84a"></i>idle <i style="background:#e0503a"></i>stuck</div>
      <h4>Per minute ${rate.span < 55 ? `<span class="dim">(last ${Math.round(rate.span)} s)</span>` : ''}</h4>
      ${items.length ? `<table class="mt"><tr class="dim"><td></td><td>made</td><td>used</td></tr>${items.map(it => `<tr><td>${iconHTML(it)}</td><td class="okc">${rate.made[it] ? '+' + fmtN(rate.made[it]) : '·'}</td><td class="warn">${rate.used[it] ? '−' + fmtN(rate.used[it]) : '·'}</td></tr>`).join('')}</table>` : '<div class="dim">Nothing made in the last minute.</div>'}`;
  }
  const unpowered = [...world.ents.values()].filter(e => ENTITIES[e.type].power && powerProblem(e) === 'none').length;
  return `<div class="legend"><i style="background:#6ac46a"></i>powered <i style="background:#d8b84a"></i>short <i style="background:#e0503a"></i>no power</div>
    ${unpowered ? `<div class="warn">${unpowered} machine${unpowered > 1 ? 's' : ''} without power</div>` : ''}
    <h4>Networks</h4>${nets.length ? nets.map(n => {
      const short = n.demand > n.capacity, hue = (n.id * 137) % 360;
      return `<div class="net"><i style="background:hsl(${hue},80%,60%)"></i><b>Network ${n.id + 1}</b> <span class="dim">${n.poles.length} poles</span>
        <div class="bar pw"><i style="width:${n.capacity ? Math.min(100, n.produced / n.capacity * 100) : 0}%"></i></div>
        <div class="${short ? 'warn' : 'dim'}">${Math.round(n.produced)} / ${Math.round(n.capacity)} kW${short ? ` · brownout, machines at ${Math.round(n.sat * 100)}%` : n.capacity ? '' : ' · no power'}</div></div>`;
    }).join('') : '<div class="dim">No poles yet.</div>'}`;
}

// ---------------------------------------------------------------- production history (for per-minute rates)
const hist = [];
function sampleStats() {
  if (hist.length && S.T - hist[hist.length - 1].T < 5) return;
  hist.push({ T: S.T, made: { ...S.stats.made }, used: { ...S.stats.used } });
  while (hist.length > 2 && S.T - hist[1].T >= 60) hist.shift();
}
function rates() {
  const now = { made: S.stats.made || {}, used: S.stats.used || {} }, old = hist[0] || { T: S.T, made: {}, used: {} };
  const span = Math.max(1, S.T - old.T), out = { made: {}, used: {}, span };
  for (const s of ['made', 'used']) for (const [it, n] of Object.entries(now[s])) { const d = n - (old[s][it] || 0); if (d > 0) out[s][it] = d / span * 60; }
  return out;
}
