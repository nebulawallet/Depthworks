import { ENTITIES, ITEMS, OLD_HOTBARS, TIERS, PLAYER, ROADS, VEHICLES } from './data.js';
import { S, world, inv, invGet, bus, key, DIRS, generateOres, generateFeatures, generateWater, generateOil, startingInventory, layerRange, layerLockReason, itemName, freshBars, factoryOf } from './state.js';
import { stockFish } from './fish.js';
import { simulate, place, removeAt, canPlace, computeVolume, completeResearch, distTo } from './sim.js';
import { renderer, render, pickCell, pickTarget, setMouseFromEvent, zoomStep, mouse, keys, moveInput, buildTerrain, applyGhostAll, resize, remeshAll } from './scene.js';
import { toast, openModal, closeModals, toggleModal, selectItem, renderHotbar, openEntity, closeEntity, entityOpen, updateUI, initUI, drawSignalCanvases, renderNametags, openChat, cancelCursor, cycleBar, setHideUI } from './ui.js';
import { save, load, loadData, hasSave, wipeSave } from './save.js';
import { doAction, host, join, netTick, leave, rememberFriends, cleanName } from './net.js';
import './signal.js';
import { updateAudio, sfx, getVolume, setVolume } from './audio.js';
import { is } from './input.js';
import { updateMap, resetMap } from './map.js';

const $ = id => document.getElementById(id);
let started = false, hover = null, building = false, rmb = false, lastPaint = null, lastPlacedCell = null;

// ---------------------------------------------------------------- nickname
const NICK_KEY = 'depthworks.nick';
const nick = () => cleanName($('nick').value);
$('nick').value = (() => { try { return localStorage.getItem(NICK_KEY) || ''; } catch { return ''; } })() || 'Engineer' + Math.floor(100 + Math.random() * 900);
$('nick').addEventListener('input', () => { try { localStorage.setItem(NICK_KEY, nick()); } catch { /* storage unavailable */ } });

// ---------------------------------------------------------------- game start
function enterWorld(fresh) {
  Object.assign(S.cam, { x: S.player.x, z: S.player.z, yaw: 0, yawT: 0, pitch: .82, pitchT: .82, ppu: 20, ppuT: 20 });
  S.mode = 'flat'; S.layer = 0;
  buildTerrain(); remeshAll(); applyGhostAll(); resetMap(); initUI(); resize();
  started = S.started = true; document.body.classList.add('ingame'); closeModals();
  bus.emit('players');
  if (fresh) openModal('help');
}
function begin(fresh) {
  generateOres();
  S.player.name = nick();
  if (fresh) {
    Object.assign(S.player, { x: 48.5, z: 52.5, face: 0, fac: 1, veh: null });
    Object.assign(world, { vehicles: [], units: [], routes: [], factories: [{ id: 1, name: 'Main factory', color: '#7ef6ff' }], facNext: 2, nextId: 1 });
    world.roads.clear();
    S.seed = Math.floor(Math.random() * 1e9);   // every new world gets its own coastline, lakes and maybe a river
    generateWater(S.seed); generateOil(S.seed);
    startingInventory(); generateFeatures(); stockFish();
    freshBars();
  } else {
    if (!load()) { toast('save could not be read, starting fresh'); return begin(true); }
    // saves from before the quickbar filled itself carried a fixed list of things you might not own
    if (OLD_HOTBARS.some(h => h.join() === S.bars[0].join())) { S.bars[0].fill(null); S.hotbarSeen = new Set(); }
  }
  enterWorld(fresh);
}
// A friend's world arrives over the network.
function beginGuest(data, you) {
  loadData(data, true);
  Object.assign(S.player, { x: you.x, z: you.z, face: 0 });
  inv.loadAny(you.inv);
  freshBars();
  enterWorld(false);
  toast(`Joined as ${S.player.name}. Enter to chat.`, 3500, 'good');
}

// ---------------------------------------------------------------- title + lobby
function titleScreen(view = 'main') {
  const btn = (id, label) => `<button id="${id}">${label}</button>`, msg = $('lobbyMsg');
  msg.textContent = '';
  if (view === 'main') {
    $('titleBtns').innerHTML = (hasSave() ? btn('bContinue', 'Continue') : '') + btn('bNew', 'New game') + btn('bHost', 'Host co-op') + btn('bJoin', 'Join co-op') + btn('bHelp', 'How to play');
    $('bContinue')?.addEventListener('click', () => begin(false));
    $('bNew').addEventListener('click', e => {
      if (hasSave() && !e.target.dataset.armed) { e.target.dataset.armed = 1; e.target.textContent = 'Replace save? Click again'; return; }
      wipeSave(); begin(true);
    });
    $('bHost').addEventListener('click', () => titleScreen('host'));
    $('bJoin').addEventListener('click', () => titleScreen('join'));
    $('bHelp').addEventListener('click', () => openModal('help'));
  } else if (view === 'host') {
    $('titleBtns').innerHTML = '<div class="dim">Friends join your world and play in it with you. Keep this tab open while they play.</div>'
      + (hasSave() ? btn('bHostSaved', 'Host my saved world') : '') + btn('bHostNew', 'Host a new world') + btn('bBack', 'Back');
    const go = fresh => {
      if (fresh) wipeSave();
      begin(fresh);
      host({
        onReady: code => { navigator.clipboard?.writeText(code).catch(() => {}); toast(`Invite code: ${code}. Send it to your friends (click the code to copy it).`, 6000, 'good'); },
        onError: m => toast('Could not start co-op: ' + m, 6000),
      });
    };
    $('bHostSaved')?.addEventListener('click', () => go(false));
    $('bHostNew').addEventListener('click', e => {
      if (hasSave() && !e.target.dataset.armed) { e.target.dataset.armed = 1; e.target.textContent = 'Replace your save? Click again'; return; }
      go(true);
    });
    $('bBack').addEventListener('click', () => titleScreen('main'));
  } else if (view === 'join') {
    $('titleBtns').innerHTML = '<div class="dim">Ask the host for their invite code.</div><input id="codeIn" maxlength="6" placeholder="CODE" autocomplete="off" spellcheck="false">'
      + btn('bJoinGo', 'Join') + btn('bBack', 'Back');
    const input = $('codeIn');
    input.addEventListener('input', () => { input.value = input.value.toUpperCase().replace(/[^A-Z0-9]/g, ''); });
    const go = () => {
      const code = input.value.trim();
      if (code.length !== 6) { msg.textContent = 'Codes are 6 letters and numbers.'; return; }
      msg.textContent = 'Connecting…'; $('bJoinGo').disabled = true;
      S.player.name = nick();
      join(code, nick(), {
        onWelcome: (data, you) => beginGuest(data, you),
        onError: m => { msg.textContent = m; $('bJoinGo').disabled = false; },
      });
    };
    $('bJoinGo').addEventListener('click', go);
    input.addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
    $('bBack').addEventListener('click', () => titleScreen('main'));
    input.focus();
  }
  openModal('title');
}
bus.on('netlost', () => { toast('Lost connection to the host.', 4000); setTimeout(() => location.reload(), 3000); });
bus.on('beforesave', rememberFriends);

$('helpClose').addEventListener('click', () => started ? closeModals() : openModal('title'));
$('saveBtn').addEventListener('click', () => { if (!started) return; if (save()) toast('saved'); else if (S.net.role === 'client') toast('only the host can save this world'); });
$('quitBtn').addEventListener('click', () => { if (started) save(); started = false; leave(); location.reload(); });
for (const b of document.querySelectorAll('[data-pix]')) b.addEventListener('click', () => { S.pix = +b.dataset.pix; resize(); });
$('volume').value = Math.round(getVolume() * 100);
$('volume').addEventListener('input', e => { setVolume(e.target.value / 100); sfx('click'); });
setInterval(() => { if (started) save(); }, 30000);
addEventListener('beforeunload', () => { if (started) save(); leave(); });

// ---------------------------------------------------------------- mode + layers
function toggleMode() {
  const C = S.cam;
  if (S.mode === 'flat') { S.mode = 'depth'; C.pitchT = .55; }
  else { S.mode = 'flat'; C.pitchT = .82; S.layer = 0; C.yawT = Math.round(C.yawT / (Math.PI * 2)) * Math.PI * 2; }
  applyGhostAll(); renderHotbar();
  toast(S.mode === 'depth' ? 'DEPTH MODE · PgUp/PgDn or Shift+wheel: layer · [ ] orbit · V pitch' : 'FLAT MODE', 2200);
}
function setLayer(l) {
  const [lo, hi] = layerRange();
  if (l < lo || l > hi) { toast(layerLockReason(l)); return; }
  S.layer = l; applyGhostAll();
}
// Lifts go up or down; inserters only pitch in depth mode.
const effDy = type => { const k = ENTITIES[type]?.kind; return k === 'lift' ? (S.dy === -1 ? -1 : 1) : k === 'inserter' && S.mode === 'depth' ? S.dy : 0; };

// ---------------------------------------------------------------- keyboard (Factorio layout)
const held = c => keys.has(c);
addEventListener('keydown', e => {
  if (!started || e.target.tagName === 'INPUT') return;
  keys.add(e.code);
  const c = e.code;
  if (is('depthMode', c)) { e.preventDefault(); toggleMode(); return; }
  if (c === 'Escape') {
    if (cancelCursor()) return;
    if (S.linkFrom) { S.linkFrom = null; renderHotbar(); return; }
    if (S.modal) closeModals(); else if (entityOpen()) closeEntity(); else selectItem(null);
    return;
  }
  if (is('chat', c)) { e.preventDefault(); keys.clear(); openChat(); return; }
  if (is('pickup', c)) S.player.pickup = true;
  const drop = () => hover && doAction({ a: 'drop', x: hover.x, y: hover.y, z: hover.z, sel: S.sel });
  if (e.repeat) { if (is('drop', c)) drop(); return; }
  if (c.startsWith('Digit')) { const i = (+c.slice(5) + 9) % 10; const it = S.bars[S.bar][i]; selectItem(it && it !== S.sel ? it : null); return; }
  if (is('inventory', c)) { if (entityOpen()) { closeEntity(); sfx('close'); return; } sfx(S.modal === 'inventory' ? 'close' : 'open'); return toggleModal('inventory'); }
  if (is('research', c)) { sfx(S.modal === 'research' ? 'close' : 'open'); return toggleModal('research'); }
  if (is('map', c)) { sfx(S.modal === 'map' ? 'close' : 'open'); return toggleModal('map'); }
  if (is('help', c)) { e.preventDefault(); return toggleModal('help'); }
  if (is('hideUI', c)) return setHideUI(!S.hideUI);
  if (is('cycleBar', c)) return cycleBar();
  if (is('signal', c)) return $('signal').classList.toggle('collapsed');
  if (is('board', c)) { doAction({ a: 'board' }); return; }
  if (is('logistics', c)) { sfx(S.modal === 'logistics' ? 'close' : 'open'); return toggleModal('logistics'); }
  if (is('factories', c)) { sfx(S.modal === 'factories' ? 'close' : 'open'); return toggleModal('factories'); }
  if (is('nextFactory', c)) { const F = world.factories, i = F.findIndex(f => f.id === S.player.fac); S.player.fac = F[(i + 1) % F.length].id; toast('building for ' + factoryOf(S.player.fac).name, 1500); renderHotbar(); return; }
  if (is('pipette', c)) return pipette();
  if (is('drop', c)) { drop(); renderHotbar(); return; }
  if (is('altMode', c)) { e.preventDefault(); S.altMode = !S.altMode; return; }
  if (is('rotate', c)) {
    const ent = hover && world.ents.get(key(hover.x, hover.y, hover.z));
    if (!S.sel && ent) doAction({ a: 'rotate', x: ent.x, y: ent.y, z: ent.z, by: e.shiftKey ? -1 : 1 });
    else S.dir = (S.dir + (e.shiftKey ? 3 : 1)) % 4;
    renderHotbar(); return;
  }
  if (is('pitch', c)) {
    const kind = S.sel && ENTITIES[S.sel]?.kind;
    if (kind === 'lift') { S.dy = S.dy === -1 ? 1 : -1; toast('lift goes ' + (S.dy > 0 ? 'up' : 'down')); }
    else if (S.mode !== 'depth') toast('inserter pitch is a depth control: press Tab');
    else { S.dy = S.dy === 0 ? 1 : S.dy === 1 ? -1 : 0; toast('inserter pitch: ' + ['level', 'lift ↑', 'drop ↓'][[0, 1, -1].indexOf(S.dy)]); }
    renderHotbar(); return;
  }
  const layerKey = ['layerUp', 'layerDown', 'orbitLeft', 'orbitRight'].find(a => is(a, c));
  if (layerKey) {
    if (S.mode !== 'depth') { toast('that is a depth control: press Tab'); return; }
    if (layerKey === 'layerUp') setLayer(S.layer + 1);
    if (layerKey === 'layerDown') setLayer(S.layer - 1);
    if (layerKey === 'orbitLeft') S.cam.yawT -= Math.PI / 2;
    if (layerKey === 'orbitRight') S.cam.yawT += Math.PI / 2;
  }
});
addEventListener('keyup', e => { keys.delete(e.code); if (is('pickup', e.code)) S.player.pickup = false; });
addEventListener('blur', () => { keys.clear(); S.player.pickup = false; rmb = false; building = false; });

// Q: copy the hovered building into the hand, or empty the hand.
function pipette() {
  const ent = hover && (world.ents.get(key(hover.x, hover.y, hover.z)) || world.frames.get(key(hover.x, hover.y, hover.z)));
  if (!ent || S.sel) { selectItem(null); return; }
  if (!invGet(ent.type)) { toast(`no ${ENTITIES[ent.type].name} in inventory`); return; }
  selectItem(ent.type); S.dir = ent.dir;
}

// ---------------------------------------------------------------- mouse
const view = renderer.domElement;
// Browsers can take the GPU away from a background tab. Three.js recovers, but say so if the view goes still.
view.addEventListener('webglcontextlost', () => { console.warn('WebGL context lost'); toast('The graphics were reset. They should come back in a moment.', 5000); });
view.addEventListener('webglcontextrestored', () => console.warn('WebGL context restored'));
const setMouse = e => { setMouseFromEvent(e); S.mouseClient = { x: e.clientX, y: e.clientY }; };
// With a building (or road, vehicle, signal) in hand you aim at the floor tile; with an empty hand you aim at
// whatever is drawn under the cursor.
const floorTool = it => !!it && (ENTITIES[it] || ROADS[it] || VEHICLES[it] || ITEMS[it]?.tool === 'signal');
const pick = () => floorTool(S.sel) ? pickCell() : pickTarget();
view.addEventListener('contextmenu', e => e.preventDefault());
view.addEventListener('pointermove', setMouse);
view.addEventListener('pointerleave', () => { mouse.set(9, 9); S.mouseClient = null; });
view.addEventListener('pointerdown', e => {
  if (!started) return;
  if (S.modal && S.modal !== 'title') closeModals();
  setMouse(e); hover = pick();
  if (e.button === 1) { e.preventDefault(); pipette(); return; }
  if (e.button === 2) { rmb = true; return; }    // hold right-click to mine
  if (e.button !== 0 || !hover) return;
  if (hover.veh && !S.sel) { const v = world.vehicles.find(x => x.id === hover.veh); if (v) { if (Math.hypot(v.x - S.player.x, v.z - S.player.z) > PLAYER.reach + 1) toast('out of reach'); else { openEntity(v); sfx('open'); } } return; }
  if (ITEMS[S.sel]?.food) { doAction({ a: 'eat', it: S.sel }); sfx('craft'); renderHotbar(); return; }
  const ent = world.ents.get(key(hover.x, hover.y, hover.z));
  if (ITEMS[S.sel]?.tool === 'link') { linkClick(ent); return; }
  if (e.ctrlKey && ent) {                                         // Ctrl+click fast transfer
    if (distTo(hover.x, hover.z) > PLAYER.reach) { toast('out of reach'); return; }
    doAction({ a: 'fast', x: ent.x, y: ent.y, z: ent.z, sel: S.sel });
    renderHotbar(); return;
  }
  building = true; lastPaint = null; lastPlacedCell = null;
  paintAt(hover, true);
});
addEventListener('pointerup', e => { if (e.button === 2) rmb = false; else building = false; });
view.addEventListener('wheel', e => {
  if (e.shiftKey && S.mode === 'depth') { setLayer(S.layer + (e.deltaY < 0 ? 1 : -1)); return; }
  zoomStep(e.deltaY > 0 ? -1 : 1);
}, { passive: true });

// With a cable in hand: click one pole, then another. Clicking a linked pair again takes the cable down.
function linkClick(ent) {
  if (ent?.kind !== 'pole') { toast('cables go between poles: click a pole'); sfx('error'); return; }
  if (distTo(ent.x, ent.z) > PLAYER.reach) { toast('out of reach'); sfx('error'); return; }
  const at = [ent.x, ent.y, ent.z], from = S.linkFrom;
  S.linkFrom = from ? null : at;
  if (from && from.join() !== at.join()) { doAction({ a: 'link', kind: S.sel, from, to: at }); sfx('place'); }
  renderHotbar();
}

function paintAt(c, first) {
  if (ROADS[S.sel]) { paintRoad(c, first); return; }
  if (VEHICLES[S.sel] || ITEMS[S.sel]?.tool === 'signal') {
    if (!first) return;
    if (c.y !== 0) { toast('that goes on the ground layer'); return; }
    doAction(VEHICLES[S.sel] ? { a: 'vehicle', type: S.sel, x: c.x, z: c.z, dir: S.dir } : { a: 'signal', x: c.x, z: c.z, dir: S.dir });
    building = false; renderHotbar(); return;
  }
  const k = key(c.x, c.y, c.z), ent = world.ents.get(k), def = S.sel && ENTITIES[S.sel];
  if (!def) {
    if (first && ent) { if (distTo(c.x, c.z) > PLAYER.reach) { toast('out of reach'); sfx('error'); } else { openEntity(ent); sfx('open'); } building = false; }
    return;
  }
  // dragging belts lays them along the direction of travel, turning the previous one into the corner
  if (def.kind === 'belt' && lastPaint) {
    const dx = c.x - lastPaint.x, dz = c.z - lastPaint.z;
    if (Math.abs(dx) + Math.abs(dz) === 1) {
      S.dir = DIRS.findIndex(([a, b]) => a === dx && b === dz);
      if (lastPlacedCell?.kind === 'belt') doAction({ a: 'setdir', x: lastPlacedCell.x, y: lastPlacedCell.y, z: lastPlacedCell.z, dir: S.dir });
    }
  }
  const dy = effDy(S.sel), err = canPlace(S.sel, c.x, c.y, c.z, S.dir, dy, { reach: true });
  if (err) {
    if (first) {
      if (err === 'occupied' && ent && S.sel !== 'frame') { if (distTo(c.x, c.z) <= PLAYER.reach) { openEntity(ent); sfx('open'); } building = false; }
      else { toast(err); sfx('error'); }
    }
    lastPaint = c; lastPlacedCell = null; return;
  }
  doAction({ a: 'place', type: S.sel, x: c.x, y: c.y, z: c.z, dir: S.dir, dy, fac: S.player.fac });
  lastPlacedCell = { ...c, kind: def.kind };
  lastPaint = c;
  if (S.net.role !== 'client' && !invGet(S.sel)) toast(`out of ${itemName(S.sel)}`);
  renderHotbar();
}

// Dragging a road lays it in straight runs along the drag, every tile, even when the mouse skips some. Each step
// covers the road's width across the way you move; changing direction starts a new run from the corner.
let roadDrag = null;
const layRoad = (x, z, ax) => doAction({ a: 'road', x, z, ax, surf: S.sel, cfg: S.roadCfg });
function paintRoad(c, first) {
  if (c.y !== 0) { if (first) toast('roads go on the ground layer'); return; }
  if (first) { roadDrag = { last: c, start: c, a: S.dir % 2, fresh: true }; layRoad(c.x, c.z, roadDrag.a); lastPaint = c; renderHotbar(); return; }
  const d = roadDrag; if (!d) return;
  const dx = c.x - d.last.x, dz = c.z - d.last.z; if (!dx && !dz) return;
  const a = Math.abs(dx) >= Math.abs(dz) ? 1 : 0, step = Math.sign(a ? dx : dz);
  if (d.fresh && a !== d.a) layRoad(d.start.x, d.start.z, a);   // now we know which way the first tile runs
  d.fresh = false; d.a = a;
  let { x, z } = d.last;
  for (let i = 0; i < Math.abs(a ? dx : dz); i++) { if (a) x += step; else z += step; layRoad(x, z, a); }
  d.last = { x, z }; lastPaint = c;
  S.dir = a ? (step > 0 ? 1 : 3) : (step > 0 ? 2 : 0);
  renderHotbar();
}

// ---------------------------------------------------------------- loop
let last = performance.now();
let lastFrame = 0;
// An error inside the loop used to stop requestAnimationFrame for good: the picture froze while the HTML
// panels kept working. Now the loop always continues, and the error is shown so it can be reported.
let lastErrT = -1e9;
function reportError(err) {
  console.error(err);
  const n = performance.now();
  if (n - lastErrT < 5000) return;
  lastErrT = n;
  try { toast(`Error: ${err?.message || err}. Details are in the console (F12).`, 6000); } catch { /* UI not ready */ }
}
function frame() {
  requestAnimationFrame(frame);
  const n = performance.now(), dt = Math.min(.05, (n - last) / 1000); last = n; lastFrame = n;
  try {
    if (started && S.modal !== 'title') {
      hover = pick();
      S.player.mineCell = rmb && !S.modal ? hover : null;
      const typing = document.activeElement?.tagName === 'INPUT';
      simulate(dt, S.modal || typing ? { mx: 0, mz: 0 } : moveInput());
      netTick(dt);
      if (building && hover && (!lastPaint || key(hover.x, hover.y, hover.z) !== key(lastPaint.x, lastPaint.y, lastPaint.z))) paintAt(hover, false);
      updateUI(dt, hover);
      updateMap(dt);
    } else if (!started) S.cam.yawT += dt * .06;
    updateAudio(dt);
    render(dt, started ? hover : null);
    renderNametags();
    drawSignalCanvases();
  } catch (err) { reportError(err); }
}
// Browsers stop animation frames in background or covered tabs. A worker's timer keeps ticking, so a host
// who alt-tabs keeps the world running (and friends stay in sync) instead of freezing everyone.
try {
  const beat = new Worker(URL.createObjectURL(new Blob(['setInterval(() => postMessage(0), 50)'], { type: 'text/javascript' })));
  let lastBeat = performance.now();
  beat.onmessage = () => {
    const n = performance.now(), dt = Math.min(.25, (n - lastBeat) / 1000); lastBeat = n;
    if (n - lastFrame < 200 || !started || S.net.role === 'solo') return;   // animation frames are running: nothing to do
    S.player.mineCell = null;   // the cursor isn't on the game while it's in the background
    try {
      for (let left = dt; left > 1e-4; left -= .05) simulate(Math.min(.05, left), { mx: 0, mz: 0 });
      netTick(dt);
    } catch (err) { reportError(err); }
  };
} catch { /* workers unavailable: the game simply pauses in the background */ }

titleScreen();
frame();

// Console hooks for testing and tinkering.
window.depthworks = {
  S, world, inv, place, removeAt, simulate, begin, beginGuest, save, load, completeResearch, computeVolume, TIERS, held, doAction, host, join, toggleModal,
  run(seconds, input) { for (let i = 0; i < seconds * 20; i++) { simulate(.05, input); netTick(.05); } },
  give(it, n = 100) { inv.add(it, n); bus.emit('inv'); },
};
