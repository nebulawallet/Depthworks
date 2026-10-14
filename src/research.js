// The research window: a tree drawn left to right like Factorio's, one section per category, with a line from every
// node to each node it opens. Beside it, the queue: what is being researched, what comes next, in order, with buttons
// to move or drop each one. Drag to pan, wheel to zoom, type to search. Two trees share all of it (layout, node states,
// tooltips, lines, queue): technologies (TECHS, sections TECH_CATS) and medical upgrades (one node a level, MED_CATS),
// each plugged in as a source below.
//
// The layout is worked out once from the data: a node's column is how many prerequisites deep it sits, and within its
// section it takes the row nearest the average of its prerequisites' rows, so chains run straight across. New nodes
// slot in by themselves. The nodes are rebuilt only when state changes; progress updates in place.
//
// Lines run at right angles with rounded corners. Each node's lines leave it on one trunk that forks a fixed step to
// its right; each node's incoming lines join one bus a fixed step to its left and enter it together. In between they
// run along the gaps between rows and columns, never through a node. Lines from another section are drawn fainter;
// hovering a node lights up everything it needs and everything it opens, and fades the rest.
import { TECHS, TECH, TECH_CATS, ITEMS, RECIPE, MED, MED_CATS, MED_RULES, HAZARDS, recipeIcon, recipeName } from './data.js';
import { S, itemName } from './state.js';
import { techAvailable, techPath } from './sim.js';
import { MED_NODES, MED_NODE, medNodeDone, medNodeAvailable, medPath, medLevel, unitCost } from './body.js';
import { doAction } from './net.js';
import { iconHTML } from './icons.js';

const NW = 172, NH = 60, CW = 232, RH = 72, HEAD = 30, GAP = 16, PAD = 26, STUB = 14, RAD = 6;
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const tipAttr = html => ` data-tip="${esc(html)}"`;
const STATE_NAME = { done: 'Researched', current: 'Researching now', queued: 'Queued', available: 'Can be researched', locked: 'Locked' };
const mark = (done, queued) => done ? '<span class="okc">✓</span>' : queued ? '<span class="tag">◷</span>' : '<span class="warn">✗</span>';

// ---------------------------------------------------------------- the two trees
export function techState(t) {
  const R = S.research;
  if (R.done.has(t.id)) return 'done';
  if (R.current === t.id) return 'current';
  if (R.queue?.includes(t.id)) return 'queued';
  return techAvailable(t) ? 'available' : 'locked';
}
const unlockHTML = u => ITEMS[u] ? iconHTML(u) : RECIPE[u] ? `<span${tipAttr(recipeName(RECIPE[u]))}>${iconHTML(recipeIcon(RECIPE[u]))}</span>` : `<span class="tag">${esc(u)}</span>`;
const unlockName = u => ITEMS[u] ? itemName(u) : RECIPE[u] ? recipeName(RECIPE[u]) : u;
const TECH_SRC = {
  key: 'tech', noun: 'technologies', nodes: TECHS, node: id => TECH[id], cats: TECH_CATS, state: techState,
  isDone: id => S.research.done.has(id), queue: () => S.research.queue || [], current: () => S.research.current, path: techPath,
  progress: t => (S.research.progress[t.id] || 0) / t.count,
  waits: t => techAvailable(t) ? '' : t.pre.some(p => !S.research.done.has(p)) ? 'waits for what it needs' : 'waits for precision ' + t.precision,
  count: t => `${S.research.progress[t.id] || 0}/${t.count}`,
  costIcons: t => Object.keys(t.cost).map(p => iconHTML(p)).join(''),
  body: t => `<div class="rnc">${Object.keys(t.cost).map(p => iconHTML(p)).join('')}<span class="dim"> ×${t.count}</span></div>
    <div class="rnu">${t.unlocks.slice(0, 6).map(unlockHTML).join('')}${t.unlocks.length > 6 ? '<span class="dim">…</span>' : ''}</div>`,
  search: (t, q) => t.name.toLowerCase().includes(q) || t.unlocks.some(u => unlockName(u).toLowerCase().includes(q)),
  tip(t) {
    const st = techState(t), R = S.research, need = techPath(t.id).filter(id => id !== t.id);
    const cost = Object.keys(t.cost).map(p => `${iconHTML(p)} ${itemName(p)}`).join('<br>');
    const pre = t.pre.map(p => `${mark(R.done.has(p), R.queue?.includes(p))} ${esc(TECH[p].name)}`).join('<br>') || '<span class="dim">none</span>';
    return `<b>${esc(t.name)}</b> <span class="dim">${STATE_NAME[st]}</span>
      <div class="dim" style="margin-top:4px">Cost: ${t.count} units × ${t.time} s, each unit one of:</div><div>${cost}</div>
      <div class="dim" style="margin-top:4px">Needs:</div><div>${pre}</div>${(t.precision ?? 0) > S.maxTier ? `<div class="warn">and precision ${t.precision}</div>` : ''}
      <div class="dim" style="margin-top:4px">Unlocks:</div><div>${t.unlocks.map(u => `${unlockHTML(u)} ${esc(unlockName(u))}`).join('<br>')}</div>
      <div class="dim" style="margin-top:6px">${st === 'done' ? '' : st === 'queued' || st === 'current' ? 'right-click: take it out of the queue · Ctrl + click: research it first' : `click: add to the queue${need.length ? ` (with ${need.length} it needs first)` : ''} · Ctrl + click: research it first`}</div>`;
  },
  act: (id, cmd, by) => doAction({ a: 'research', id, do: cmd, by }),
  stateKey: () => [[...S.research.done].join(), (S.research.queue || []).join(), S.research.current, S.maxTier].join('|'),
  empty: 'Empty. Click a technology to queue it; what it needs is queued first. Labs work down the queue by themselves.',
};
// Medical: one node a level. The node being worked is the first queued one that can run.
const medCurrent = () => (S.med.queue || []).find(id => medNodeAvailable(MED_NODE[id])) || null;
// the units a level takes (unitsFor in body.js is the next level's)
const medUnits = n => Math.round(MED[n.up].units * Math.pow(MED_RULES.growth, n.level - 1));
const medState = n => medNodeDone(n) ? 'done' : medCurrent() === n.id ? 'current' : S.med.queue?.includes(n.id) ? 'queued' : medNodeAvailable(n) ? 'available' : 'locked';
const MED_SRC = {
  key: 'med', noun: 'medical upgrades', nodes: MED_NODES, node: id => MED_NODE[id], cats: MED_CATS, state: medState,
  isDone: id => medNodeDone(MED_NODE[id]), queue: () => S.med.queue || [], current: medCurrent, path: medPath,
  progress: n => medNodeDone(n) ? 1 : medLevel(n.up) === n.level - 1 ? (S.med.progress[n.up] || 0) / medUnits(n) : 0,
  waits: n => medNodeAvailable(n) ? '' : MED[n.up].mutation && !S.med.mutations ? 'waits for irradiated seeds' : 'waits for what it needs',
  count: n => medLevel(n.up) === n.level - 1 ? `${S.med.progress[n.up] || 0}/${medUnits(n)}` : `${medUnits(n)} units`,
  costIcons: n => Object.keys(unitCost(MED[n.up])).map(it => iconHTML(it)).join(''),
  body(n) {
    const u = MED[n.up], hz = u.hazard && HAZARDS[u.hazard];
    return `<div class="rnc">${Object.keys(unitCost(u)).map(it => iconHTML(it)).join('')}<span class="dim"> ×${medUnits(n)}</span></div>
      <div class="rnu">${hz ? `<span class="tag" style="color:${hz.color};border-color:${hz.color}">${esc(hz.name.toLowerCase())}</span>` : u.mutation ? '<span class="tag">mutation</span>' : `<span class="dim tiny">${esc(u.desc)}</span>`}</div>`;
  },
  search: (n, q) => n.name.toLowerCase().includes(q) || MED[n.up].desc.toLowerCase().includes(q) || (MED[n.up].hazard && HAZARDS[MED[n.up].hazard].name.toLowerCase().includes(q)),
  tip(n) {
    const u = MED[n.up], st = medState(n), need = medPath(n.id).filter(id => id !== n.id), hz = u.hazard && HAZARDS[u.hazard];
    const cost = Object.entries(unitCost(u)).map(([it, k]) => `${iconHTML(it)} ${k} × ${itemName(it)}`).join('<br>');
    const pre = n.pre.map(p => `${mark(medNodeDone(MED_NODE[p]), S.med.queue?.includes(p))} ${esc(MED_NODE[p].name)}`).join('<br>') || '<span class="dim">none</span>';
    return `<b>${esc(n.name)}</b> <span class="dim">${STATE_NAME[st]} · level ${n.level} of ${u.levels}</span><div>${esc(u.desc)}</div>
      ${hz ? `<div>against <b style="color:${hz.color}">${esc(hz.name.toLowerCase())}</b>: ${esc(hz.desc)}</div>` : ''}
      <div class="dim" style="margin-top:4px">Cost: ${medUnits(n)} units × ${MED_RULES.time} s in medical labs, each unit:</div><div>${cost}</div>
      <div class="dim" style="margin-top:4px">Needs:</div><div>${pre}</div>${u.mutation && !S.med.mutations ? '<div class="warn">and irradiated seeds, found first</div>' : ''}
      <div class="dim" style="margin-top:6px">Every engineer in the world gets it. ${st === 'done' ? '' : st === 'queued' || st === 'current' ? 'right-click: take it out of the queue · Ctrl + click: research it first' : `click: add to the queue${need.length ? ` (with ${need.length} it needs first)` : ''} · Ctrl + click: research it first`}</div>`;
  },
  act: (id, cmd, by) => doAction({ a: 'med', id, do: cmd, by }),
  stateKey: () => [JSON.stringify(S.med.levels), (S.med.queue || []).join(), S.med.mutations].join('|'),
  empty: 'Empty. Click an upgrade to queue it; what it needs is queued first. Medical labs work down the queue.',
};
const SOURCES = { tech: TECH_SRC, med: MED_SRC };

// ---------------------------------------------------------------- layout
const layouts = {};
function layout(src) {
  if (layouts[src.key]) return layouts[src.key];
  const depth = new Map();
  const d = t => { if (depth.has(t.id)) return depth.get(t.id); depth.set(t.id, 0); const v = t.pre.length ? 1 + Math.max(...t.pre.map(p => d(src.node(p)))) : 0; depth.set(t.id, v); return v; };
  src.nodes.forEach(d);
  const pos = new Map(), bands = [];
  let y = PAD;
  for (const c of src.cats) {
    const list = src.nodes.filter(t => t.cat === c.id); if (!list.length) continue;
    const rows = new Map(), taken = new Map();
    for (const col of [...new Set(list.map(t => depth.get(t.id)))].sort((a, b) => a - b)) {
      const want = t => { const r = t.pre.filter(p => rows.has(p)).map(p => rows.get(p)); return r.length ? r.reduce((a, b) => a + b, 0) / r.length : -1; };
      const inCol = list.filter(t => depth.get(t.id) === col).sort((a, b) => want(a) - want(b));
      const used = taken.get(col) || new Set(); taken.set(col, used);
      for (const t of inCol) { let r = Math.max(0, Math.round(want(t))); while (used.has(r)) r++; used.add(r); rows.set(t.id, r); }
    }
    const n = Math.max(...rows.values()) + 1;
    bands.push({ cat: c, y, h: HEAD + n * RH });
    for (const t of list) pos.set(t.id, { x: PAD + depth.get(t.id) * CW, y: y + HEAD + rows.get(t.id) * RH, cat: c.id });
    y += HEAD + n * RH + GAP;
  }
  return (layouts[src.key] = { pos, bands, W: PAD * 2 + (Math.max(...depth.values()) + 1) * CW - (CW - NW), H: y + PAD - GAP });
}

// ---------------------------------------------------------------- lines
// A polyline through right-angle corners, each corner rounded (as far as the shorter of its two legs allows).
function rounded(pts) {
  const p = pts.filter((q, i) => i === 0 || q[0] !== pts[i - 1][0] || q[1] !== pts[i - 1][1]);
  const keep = p.filter((q, i) => i === 0 || i === p.length - 1 || !((p[i - 1][0] === q[0] && q[0] === p[i + 1][0]) || (p[i - 1][1] === q[1] && q[1] === p[i + 1][1])));
  let d = `M${keep[0][0]} ${keep[0][1]}`;
  for (let i = 1; i < keep.length - 1; i++) {
    const [ax, ay] = keep[i - 1], [bx, by] = keep[i], [cx, cy] = keep[i + 1];
    const r = Math.min(RAD, Math.hypot(bx - ax, by - ay) / 2, Math.hypot(cx - bx, cy - by) / 2);
    const ux = Math.sign(bx - ax), uy = Math.sign(by - ay), vx = Math.sign(cx - bx), vy = Math.sign(cy - by);
    d += ` L${bx - ux * r} ${by - uy * r} Q${bx} ${by} ${bx + vx * r} ${by + vy * r}`;
  }
  const z = keep[keep.length - 1];
  return d + ` L${z[0]} ${z[1]}`;
}
// From a's right side to b's left side: out along a's trunk, down its fork to the gap beside b's row (when they are
// columns apart, so it never crosses a node), across to b's bus, along the bus, and in.
function route(a, b) {
  const x1 = a.x + NW, y1 = a.y + NH / 2, x2 = b.x, y2 = b.y + NH / 2, xs = x1 + STUB, xm = x2 - STUB;
  if (b.x - a.x <= CW) return rounded([[x1, y1], [xs, y1], [xs, y2], [x2, y2]]);   // next column: fork straight into the bus
  const lane = y1 <= y2 ? b.y - (RH - NH) / 2 : b.y + NH + (RH - NH) / 2;
  return rounded([[x1, y1], [xs, y1], [xs, lane], [xm, lane], [xm, y2], [x2, y2]]);
}
function edgesSVG(src) {
  const { pos, W, H } = layout(src), q = src.queue(), paths = [];
  for (const t of src.nodes) for (const pid of t.pre) {
    const a = pos.get(pid), b = pos.get(t.id); if (!a || !b) continue;
    const cls = src.isDone(pid) && src.isDone(t.id) ? 'done' : src.isDone(pid) ? 'open' : (q.includes(t.id) ? 'queued' : 'locked');
    paths.push(`<path class="${cls}${a.cat !== b.cat ? ' far' : ''}" data-from="${pid}" data-to="${t.id}" d="${route(a, b)}"/>`);
  }
  return `<svg class="rte" width="${W}" height="${H}">${paths.join('')}</svg>`;
}

// ---------------------------------------------------------------- drawing
const views = { tech: { x: 0, y: 0, k: .85, placed: false }, med: { x: 0, y: 0, k: .85, placed: false } };
let built = '', search = '', cur = TECH_SRC;
const matches = t => !search || cur.search(t, search) || cur.cats.find(c => c.id === t.cat)?.name.toLowerCase().includes(search);
function nodeHTML(t) {
  const p = layout(cur).pos.get(t.id), st = cur.state(t), qi = cur.queue().indexOf(t.id), prog = cur.progress(t);
  return `<div class="rn ${st}${search && !matches(t) ? ' dimmed' : ''}${search && matches(t) ? ' hit' : ''}" data-tech="${t.id}" style="left:${p.x}px;top:${p.y}px"${tipAttr(cur.tip(t))}>
    <div class="rnh">${esc(t.name)}</div>${cur.body(t)}
    <i class="rnb" style="width:${(st === 'done' ? 1 : prog) * 100}%"></i>${qi >= 0 ? `<b class="rnq">${qi + 1}</b>` : ''}</div>`;
}
function queueHTML() {
  const q = cur.queue(), now = cur.current();
  const row = (id, i) => {
    const t = cur.node(id), c = now === id, wait = !c && cur.waits(t);
    return `<div class="rq${c ? ' cur' : ''}"><div class="rqh"><b>${i + 1}.</b> ${esc(t.name)}</div>
      <div class="rqc">${cur.costIcons(t)} <span class="dim">${cur.count(t)}</span>
        <span class="grow"></span><button data-rq="move|${id}|-1"${tipAttr('earlier (not ahead of what it needs)')}>▲</button><button data-rq="move|${id}|1"${tipAttr('later (not behind what needs it)')}>▼</button><button data-rq="remove|${id}"${tipAttr('take it out, with whatever queued needs it')}>✕</button></div>
      <div class="bar"><i style="width:${cur.progress(t) * 100}%"></i></div>${wait ? `<div class="dim tiny">${wait}</div>` : ''}</div>`;
  };
  return `<h4>Queue</h4>${q.length ? q.map(row).join('') : `<div class="dim">${cur.empty}</div>`}
    <h4>States</h4><div class="rlegend">${[['done', 'researched'], ['current', 'researching now'], ['queued', 'queued'], ['available', 'can be researched'], ['locked', 'locked: needs more first']].map(([c, n]) => `<div><span class="rn ${c} mini"></span>${n}</div>`).join('')}</div>
    <div class="dim tiny">Click: queue · Ctrl + click: research first · right-click: unqueue · drag: pan · wheel: zoom · hover a ${cur.key === 'med' ? 'node' : 'technology'} to light up what it needs and opens</div>`;
}
// `which`: 'tech' or 'med'.
export function renderTree(body, head, which = 'tech') {
  if (cur !== SOURCES[which]) { cur = SOURCES[which]; built = ''; search = ''; }
  const key = cur.key + '|' + cur.stateKey() + '|' + search + '|' + head.length;
  if (key !== built || !body.querySelector('#rtInner')) {
    const { bands, W, H } = layout(cur), view = views[cur.key];
    const scroll = body.querySelector('.rtq')?.scrollTop || 0;
    body.innerHTML = `${head}<div class="rt"><div class="rtq">${queueHTML()}</div><div class="rtv" id="rtView">
      <div class="rtbar"><input id="rtSearch" placeholder="search ${cur.noun}" value="${esc(search)}" autocomplete="off" spellcheck="false"><button data-rz="-1">−</button><button data-rz="1">+</button><button data-rz="0"${tipAttr('back to what is being researched')}>◎</button></div>
      <div class="rti" id="rtInner" style="width:${W}px;height:${H}px">
      ${bands.map(b => `<div class="rband" style="top:${b.y}px;height:${b.h}px;width:${W}px;border-color:${b.cat.color}"><span style="color:${b.cat.color}">${esc(b.cat.name)}</span></div>`).join('')}
      ${edgesSVG(cur)}${cur.nodes.map(nodeHTML).join('')}</div></div></div>`;
    body.querySelector('.rtq').scrollTop = scroll;
    built = key;
    if (!view.placed) { view.placed = true; centerOn(cur.current() || cur.queue()[0] || cur.nodes.find(t => cur.state(t) === 'available')?.id); }
    applyView(); wire(body);
    if (document.activeElement?.id !== 'rtSearch' && wantFocus) { const i = body.querySelector('#rtSearch'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); wantFocus = false; }
  } else {   // only progress moved: update the bars in place
    const id = cur.current(), t = id && cur.node(id);
    if (t) {
      const w = `${cur.progress(t) * 100}%`, n = body.querySelector(`.rn[data-tech="${id}"] .rnb`);
      if (n) n.style.width = w;
      const q = body.querySelector('.rq.cur .bar i'); if (q) q.style.width = w;
      const c = body.querySelector('.rq.cur .rqc .dim'); if (c) c.textContent = cur.count(t);
    }
  }
}
let wantFocus = false;
export const resetTreeView = () => { for (const v of Object.values(views)) v.placed = false; built = ''; };
function applyView() { const v = views[cur.key], el = document.getElementById('rtInner'); if (el) el.style.transform = `translate(${v.x}px, ${v.y}px) scale(${v.k})`; }
function centerOn(id) {
  const v = document.getElementById('rtView'), p = id && layout(cur).pos.get(id), view = views[cur.key]; if (!v || !p) return;
  view.x = v.clientWidth / 2 - (p.x + NW / 2) * view.k; view.y = v.clientHeight / 2 - (p.y + NH / 2) * view.k;
  applyView();
}

// ---------------------------------------------------------------- input
let drag = null;
function act(id, ev) {
  const t = cur.node(id), st = cur.state(t);
  if (ev.button === 2) { if (st === 'queued' || st === 'current') { cur.act(id, 'remove'); toast(`took ${t.name} out of the queue`); } return; }
  if (st === 'done') return;
  if (ev.ctrlKey) { cur.act(id, 'now'); toast(`researching ${t.name} first`); return; }
  if (st === 'queued' || st === 'current') { toast(`${t.name} is already queued (right-click takes it out)`); return; }
  const n = cur.path(id).length;
  cur.act(id, 'queue'); toast(n > 1 ? `queued ${t.name} and the ${n - 1} it needs first` : 'queued ' + t.name);
}
let toastFn = () => {};
export const setTreeToast = f => { toastFn = f; };
const toast = m => toastFn(m);
function zoomBy(f, cx, cy) {
  const view = views[cur.key], k = Math.max(.3, Math.min(1.6, view.k * f));
  view.x = cx - (cx - view.x) * k / view.k; view.y = cy - (cy - view.y) * k / view.k; view.k = k; applyView();
}
function wire(body) {
  const v = body.querySelector('#rtView');
  if (v._wired) return; v._wired = true;
  v.addEventListener('wheel', e => { e.preventDefault(); const r = v.getBoundingClientRect(); zoomBy(e.deltaY < 0 ? 1.15 : 1 / 1.15, e.clientX - r.left, e.clientY - r.top); }, { passive: false });
  v.addEventListener('pointerdown', e => {
    if (e.target.closest('.rtbar')) return;
    e.preventDefault(); v.setPointerCapture(e.pointerId);
    const view = views[cur.key];
    drag = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y, moved: false, node: e.target.closest('.rn')?.dataset.tech, button: e.button, ctrlKey: e.ctrlKey };
  });
  v.addEventListener('pointermove', e => {
    if (!drag) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y, view = views[cur.key];
    if (Math.hypot(dx, dy) > 5) drag.moved = true;
    if (drag.moved) { view.x = drag.vx + dx; view.y = drag.vy + dy; applyView(); }
  });
  v.addEventListener('pointerup', () => { const d = drag; drag = null; if (d && !d.moved && d.node) act(d.node, d); });
  // hovering a node lights what it needs (back to what is done) and what it opens, and fades every other line
  v.addEventListener('pointerover', e => {
    const n = e.target.closest?.('.rn'), svg = v.querySelector('.rte');
    for (const p of v.querySelectorAll('path.hl')) p.classList.remove('hl');
    svg?.classList.toggle('hovering', !!n);
    if (!n) return;
    const id = n.dataset.tech, want = new Set(cur.path(id));
    for (const p of v.querySelectorAll('path')) if ((want.has(p.dataset.to) && (want.has(p.dataset.from) || cur.isDone(p.dataset.from))) || p.dataset.from === id || p.dataset.to === id) p.classList.add('hl');
  });
  const research = body.closest('#research');
  if (!research._wired) {
    research._wired = true;
    research.addEventListener('input', e => { if (e.target.id === 'rtSearch') { search = e.target.value.trim().toLowerCase(); wantFocus = true; built = ''; } });
    research.addEventListener('keydown', e => {
      if (e.target.id !== 'rtSearch') return;
      e.stopPropagation();
      if (e.key === 'Enter') { const t = cur.nodes.find(matches); if (t) centerOn(t.id); }
      if (e.key === 'Escape') { search = ''; e.target.value = ''; built = ''; e.target.blur(); }
    });
    research.addEventListener('pointerdown', e => {
      const b = e.target.closest?.('[data-rq],[data-rz]'); if (!b) return;
      e.preventDefault();
      if (b.dataset.rz) {
        const z = +b.dataset.rz;
        if (!z) centerOn(cur.current() || cur.queue()[0]);
        else { const v2 = document.getElementById('rtView'); zoomBy(z > 0 ? 1.25 : .8, v2.clientWidth / 2, v2.clientHeight / 2); }
        return;
      }
      const [cmd, id, by] = b.dataset.rq.split('|');   // medical ids hold a colon
      cur.act(id, cmd, +by || 0);
    });
  }
}
