// The research window: the tech tree, drawn left to right like Factorio's, one section per category (TECH_CATS in
// data.js), with a line from every tech to each tech it opens. Beside it, the research queue: what is being researched,
// what comes next, in order, with buttons to move or drop each one. Drag to pan, wheel to zoom, type to search.
//
// The layout is worked out once from the data: a tech's column is how many prerequisites deep it sits, and within its
// section it takes the row nearest the average of its prerequisites' rows, so chains run straight across. New techs
// slot in by themselves. The nodes are rebuilt only when research state changes; progress updates in place.
import { TECHS, TECH, TECH_CATS, ITEMS, RECIPE, recipeIcon, recipeName } from './data.js';
import { S, itemName } from './state.js';
import { techAvailable, techPath } from './sim.js';
import { doAction } from './net.js';
import { iconHTML } from './icons.js';

const NW = 172, NH = 60, CW = 232, RH = 72, HEAD = 30, GAP = 16, PAD = 26;
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const tipAttr = html => ` data-tip="${esc(html)}"`;

let L = null;
function layout() {
  if (L) return L;
  const depth = new Map();
  const d = t => { if (depth.has(t.id)) return depth.get(t.id); depth.set(t.id, 0); const v = t.pre.length ? 1 + Math.max(...t.pre.map(p => d(TECH[p]))) : 0; depth.set(t.id, v); return v; };
  TECHS.forEach(d);
  const pos = new Map(), bands = [];
  let y = PAD;
  for (const c of TECH_CATS) {
    const list = TECHS.filter(t => t.cat === c.id); if (!list.length) continue;
    const rows = new Map(), taken = new Map();
    for (const col of [...new Set(list.map(t => depth.get(t.id)))].sort((a, b) => a - b)) {
      const want = t => { const r = t.pre.filter(p => rows.has(p)).map(p => rows.get(p)); return r.length ? r.reduce((a, b) => a + b, 0) / r.length : -1; };
      const inCol = list.filter(t => depth.get(t.id) === col).sort((a, b) => want(a) - want(b));
      const used = taken.get(col) || new Set(); taken.set(col, used);
      for (const t of inCol) { let r = Math.max(0, Math.round(want(t))); while (used.has(r)) r++; used.add(r); rows.set(t.id, r); }
    }
    const n = Math.max(...rows.values()) + 1;
    bands.push({ cat: c, y, h: HEAD + n * RH });
    for (const t of list) pos.set(t.id, { x: PAD + depth.get(t.id) * CW, y: y + HEAD + rows.get(t.id) * RH });
    y += HEAD + n * RH + GAP;
  }
  return (L = { pos, bands, W: PAD * 2 + (Math.max(...depth.values()) + 1) * CW - (CW - NW), H: y + PAD - GAP });
}

// ---------------------------------------------------------------- state of a tech
export function techState(t) {
  const R = S.research;
  if (R.done.has(t.id)) return 'done';
  if (R.current === t.id) return 'current';
  if (R.queue?.includes(t.id)) return 'queued';
  return techAvailable(t) ? 'available' : 'locked';
}
const STATE_NAME = { done: 'Researched', current: 'Researching now', queued: 'Queued', available: 'Can be researched', locked: 'Locked' };
const unlockHTML = u => ITEMS[u] ? iconHTML(u) : RECIPE[u] ? `<span${tipAttr(recipeName(RECIPE[u]))}>${iconHTML(recipeIcon(RECIPE[u]))}</span>` : `<span class="tag">${esc(u)}</span>`;
const unlockName = u => ITEMS[u] ? itemName(u) : RECIPE[u] ? recipeName(RECIPE[u]) : u;
function tipFor(t) {
  const st = techState(t), R = S.research, need = techPath(t.id).filter(id => id !== t.id);
  const cost = Object.keys(t.cost).map(p => `${iconHTML(p)} ${itemName(p)}`).join('<br>');
  const pre = t.pre.map(p => `${R.done.has(p) ? '<span class="okc">✓</span>' : R.queue?.includes(p) ? '<span class="tag">◷</span>' : '<span class="warn">✗</span>'} ${esc(TECH[p].name)}`).join('<br>') || '<span class="dim">none</span>';
  return `<b>${esc(t.name)}</b> <span class="dim">${STATE_NAME[st]}</span>
    <div class="dim" style="margin-top:4px">Cost: ${t.count} units × ${t.time} s, each unit one of:</div><div>${cost}</div>
    <div class="dim" style="margin-top:4px">Needs:</div><div>${pre}</div>${(t.precision ?? 0) > S.maxTier ? `<div class="warn">and precision ${t.precision}</div>` : ''}
    <div class="dim" style="margin-top:4px">Unlocks:</div><div>${t.unlocks.map(u => `${unlockHTML(u)} ${esc(unlockName(u))}`).join('<br>')}</div>
    <div class="dim" style="margin-top:6px">${st === 'done' ? '' : st === 'queued' || st === 'current' ? 'right-click: take it out of the queue · Ctrl + click: research it first' : `click: add to the queue${need.length ? ` (with ${need.length} it needs first)` : ''} · Ctrl + click: research it first`}</div>`;
}

// ---------------------------------------------------------------- drawing
let built = '', view = { x: 0, y: 0, k: .85, placed: false }, search = '';
const matches = t => !search || t.name.toLowerCase().includes(search) || t.unlocks.some(u => unlockName(u).toLowerCase().includes(search)) || TECH_CATS.find(c => c.id === t.cat)?.name.toLowerCase().includes(search);
function nodeHTML(t) {
  const p = layout().pos.get(t.id), st = techState(t), qi = S.research.queue?.indexOf(t.id) ?? -1, prog = (S.research.progress[t.id] || 0) / t.count;
  const cost = Object.keys(t.cost).map(p2 => iconHTML(p2)).join('');
  return `<div class="rn ${st}${search && !matches(t) ? ' dimmed' : ''}${search && matches(t) ? ' hit' : ''}" data-tech="${t.id}" style="left:${p.x}px;top:${p.y}px"${tipAttr(tipFor(t))}>
    <div class="rnh">${esc(t.name)}</div><div class="rnc">${cost}<span class="dim"> ×${t.count}</span></div>
    <div class="rnu">${t.unlocks.slice(0, 6).map(unlockHTML).join('')}${t.unlocks.length > 6 ? '<span class="dim">…</span>' : ''}</div>
    <i class="rnb" style="width:${(st === 'done' ? 1 : prog) * 100}%"></i>${qi >= 0 ? `<b class="rnq">${qi + 1}</b>` : ''}</div>`;
}
function edgesSVG() {
  const { pos, W, H } = layout(), R = S.research, paths = [];
  for (const t of TECHS) for (const pid of t.pre) {
    const a = pos.get(pid), b = pos.get(t.id); if (!a || !b) continue;
    const x1 = a.x + NW, y1 = a.y + NH / 2, x2 = b.x, y2 = b.y + NH / 2, mx = (x1 + x2) / 2;
    const cls = R.done.has(pid) && R.done.has(t.id) ? 'done' : R.done.has(pid) ? 'open' : (R.queue?.includes(t.id) ? 'queued' : 'locked');
    paths.push(`<path class="${cls}" data-from="${pid}" data-to="${t.id}" d="M${x1} ${y1} C${mx} ${y1} ${mx} ${y2} ${x2} ${y2}"/>`);
  }
  return `<svg class="rte" width="${W}" height="${H}">${paths.join('')}</svg>`;
}
function queueHTML() {
  const R = S.research, q = R.queue || [];
  const row = (id, i) => {
    const t = TECH[id], prog = (R.progress[id] || 0) / t.count, cur = R.current === id, wait = !techAvailable(t) && !cur;
    return `<div class="rq${cur ? ' cur' : ''}"><div class="rqh"><b>${i + 1}.</b> ${esc(t.name)}</div>
      <div class="rqc">${Object.keys(t.cost).map(p => iconHTML(p)).join('')} <span class="dim">${R.progress[id] || 0}/${t.count}</span>
        <span class="grow"></span><button data-rq="move:${id}:-1"${tipAttr('earlier (not ahead of what it needs)')}>▲</button><button data-rq="move:${id}:1"${tipAttr('later (not behind what needs it)')}>▼</button><button data-rq="remove:${id}"${tipAttr('take it out, with whatever queued needs it')}>✕</button></div>
      <div class="bar"><i style="width:${prog * 100}%"></i></div>${wait ? `<div class="dim tiny">${t.pre.some(p => !R.done.has(p)) ? 'waits for what it needs' : 'waits for precision ' + t.precision}</div>` : ''}</div>`;
  };
  return `<h4>Queue</h4>${q.length ? q.map(row).join('') : '<div class="dim">Empty. Click a technology to queue it; what it needs is queued first. Labs work down the queue by themselves.</div>'}
    <h4>States</h4><div class="rlegend">${[['done', 'researched'], ['current', 'researching now'], ['queued', 'queued'], ['available', 'can be researched'], ['locked', 'locked: needs more first']].map(([c, n]) => `<div><span class="rn ${c} mini"></span>${n}</div>`).join('')}</div>
    <div class="dim tiny">Click: queue · Ctrl + click: research first · right-click: unqueue · drag: pan · wheel: zoom</div>`;
}
const stateKey = () => [[...S.research.done].join(), (S.research.queue || []).join(), S.research.current, S.maxTier, search].join('|');
export function renderTree(body, head) {
  const key = stateKey();
  if (key !== built || !body.querySelector('#rtInner')) {
    const { bands, W, H } = layout();
    const scroll = body.querySelector('.rtq')?.scrollTop || 0;
    body.innerHTML = `${head}<div class="rt"><div class="rtq">${queueHTML()}</div><div class="rtv" id="rtView">
      <div class="rtbar"><input id="rtSearch" placeholder="search technologies and what they unlock" value="${esc(search)}" autocomplete="off" spellcheck="false"><button data-rz="-1">−</button><button data-rz="1">+</button><button data-rz="0"${tipAttr('back to what is being researched')}>◎</button></div>
      <div class="rti" id="rtInner" style="width:${W}px;height:${H}px">
      ${bands.map(b => `<div class="rband" style="top:${b.y}px;height:${b.h}px;width:${W}px;border-color:${b.cat.color}"><span style="color:${b.cat.color}">${esc(b.cat.name)}</span></div>`).join('')}
      ${edgesSVG()}${TECHS.map(nodeHTML).join('')}</div></div></div>`;
    body.querySelector('.rtq').scrollTop = scroll;
    built = key;
    if (!view.placed) { view.placed = true; centerOn(S.research.current || TECHS.find(t => techState(t) === 'available')?.id); }
    applyView(); wire(body);
    if (document.activeElement?.id !== 'rtSearch' && wantFocus) { const i = body.querySelector('#rtSearch'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); wantFocus = false; }
  } else {   // only progress moved: update the bars in place
    const cur = TECH[S.research.current];
    if (cur) {
      const w = `${(S.research.progress[cur.id] || 0) / cur.count * 100}%`, n = body.querySelector(`.rn[data-tech="${cur.id}"] .rnb`);
      if (n) n.style.width = w;
      const q = body.querySelector('.rq.cur .bar i'); if (q) q.style.width = w;
      const c = body.querySelector('.rq.cur .rqc .dim'); if (c) c.textContent = `${S.research.progress[cur.id] || 0}/${cur.count}`;
    }
  }
}
let wantFocus = false;
export const resetTreeView = () => { view.placed = false; built = ''; };
function applyView() { const el = document.getElementById('rtInner'); if (el) el.style.transform = `translate(${view.x}px, ${view.y}px) scale(${view.k})`; }
function centerOn(id) {
  const v = document.getElementById('rtView'), p = id && layout().pos.get(id); if (!v || !p) return;
  view.x = v.clientWidth / 2 - (p.x + NW / 2) * view.k; view.y = v.clientHeight / 2 - (p.y + NH / 2) * view.k;
  applyView();
}

// ---------------------------------------------------------------- input
let drag = null;
function act(id, ev) {
  const t = TECH[id], st = techState(t);
  if (ev.button === 2) { if (st === 'queued' || st === 'current') { doAction({ a: 'research', id, do: 'remove' }); bus('research: took ' + t.name + ' out of the queue'); } return; }
  if (st === 'done') return;
  if (ev.ctrlKey) { doAction({ a: 'research', id, do: 'now' }); bus('researching ' + t.name + ' first'); return; }
  if (st === 'queued' || st === 'current') { bus(`${t.name} is already queued (right-click takes it out)`); return; }
  const n = techPath(id).length;
  doAction({ a: 'research', id, do: 'queue' }); bus(n > 1 ? `queued ${t.name} and the ${n - 1} it needs first` : 'queued ' + t.name);
}
let toastFn = () => {};
export const setTreeToast = f => { toastFn = f; };
const bus = m => toastFn(m);
function wire(body) {
  const v = body.querySelector('#rtView');
  if (v._wired) return; v._wired = true;
  v.addEventListener('wheel', e => {
    e.preventDefault();
    const r = v.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top, k = Math.max(.3, Math.min(1.6, view.k * (e.deltaY < 0 ? 1.15 : 1 / 1.15)));
    view.x = mx - (mx - view.x) * k / view.k; view.y = my - (my - view.y) * k / view.k; view.k = k; applyView();
  }, { passive: false });
  v.addEventListener('pointerdown', e => {
    if (e.target.closest('.rtbar')) return;
    e.preventDefault(); v.setPointerCapture(e.pointerId);
    drag = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y, moved: false, node: e.target.closest('.rn')?.dataset.tech, button: e.button, ctrlKey: e.ctrlKey };
  });
  v.addEventListener('pointermove', e => {
    if (!drag) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (Math.hypot(dx, dy) > 5) drag.moved = true;
    if (drag.moved) { view.x = drag.vx + dx; view.y = drag.vy + dy; applyView(); }
  });
  v.addEventListener('pointerup', () => { const d = drag; drag = null; if (d && !d.moved && d.node) act(d.node, d); });
  // highlight what a tech needs and what it opens while hovering it
  v.addEventListener('pointerover', e => {
    const n = e.target.closest?.('.rn'); for (const p of v.querySelectorAll('path.hl')) p.classList.remove('hl');
    if (!n) return;
    const id = n.dataset.tech, want = new Set(techPath(id));
    for (const p of v.querySelectorAll('path')) if ((want.has(p.dataset.to) && (want.has(p.dataset.from) || S.research.done.has(p.dataset.from))) || p.dataset.from === id) p.classList.add('hl');
  });
  const research = body.closest('#research');
  if (!research._wired) {
    research._wired = true;
    research.addEventListener('input', e => { if (e.target.id === 'rtSearch') { search = e.target.value.trim().toLowerCase(); wantFocus = true; built = ''; } });
    research.addEventListener('keydown', e => {
      if (e.target.id !== 'rtSearch') return;
      e.stopPropagation();
      if (e.key === 'Enter') { const t = TECHS.find(matches); if (t) centerOn(t.id); }
      if (e.key === 'Escape') { search = ''; e.target.value = ''; built = ''; e.target.blur(); }
    });
    research.addEventListener('pointerdown', e => {
      const b = e.target.closest?.('[data-rq],[data-rz]'); if (!b) return;
      e.preventDefault();
      if (b.dataset.rz) { const z = +b.dataset.rz; if (!z) centerOn(S.research.current || S.research.queue?.[0]); else { const v2 = document.getElementById('rtView'), cx = v2.clientWidth / 2, cy = v2.clientHeight / 2, k = Math.max(.3, Math.min(1.6, view.k * (z > 0 ? 1.25 : .8))); view.x = cx - (cx - view.x) * k / view.k; view.y = cy - (cy - view.y) * k / view.k; view.k = k; applyView(); } return; }
      const [cmd, id, by] = b.dataset.rq.split(':');
      doAction({ a: 'research', id, do: cmd, by: +by || 0 });
    });
  }
}
