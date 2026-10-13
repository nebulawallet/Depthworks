import { ENTITIES, HOTBAR_SIZE, OLD_HOTBARS, TIERS } from './data.js';
import { S, world, inv, invGet, bus, key, DIRS, generateOres, generateFeatures, startingInventory, layerRange, layerLockReason, itemName } from './state.js';
import { simulate, place, removeAt, rotateEntity, canPlace, computeVolume, completeResearch, dropAt, fastTransfer, distTo } from './sim.js';
import { renderer, render, pickCell, pickTarget, setMouseFromEvent, zoomStep, mouse, keys, moveInput, buildTerrain, applyGhostAll, resize, remeshAll } from './scene.js';
import { toast, openModal, closeModals, toggleModal, selectItem, renderHotbar, openEntity, closeEntity, entityOpen, updateUI, initUI, drawSignalCanvases } from './ui.js';
import { save, load, hasSave, wipeSave } from './save.js';
import { PLAYER } from './data.js';
import './signal.js';
import { updateAudio, sfx, getVolume, setVolume } from './audio.js';

const $ = id => document.getElementById(id);
let started = false, hover = null, building = false, rmb = false, lastPaint = null, lastPlaced = null;

// ---------------------------------------------------------------- game start
function begin(fresh) {
  generateOres();
  if (fresh) {
    Object.assign(S.player, { x: 48.5, z: 52.5, face: 0 });
    startingInventory(); generateFeatures();
    S.hotbar = Array(HOTBAR_SIZE).fill(null); S.hotbarSeen = new Set();
  } else {
    if (!load()) { toast('save could not be read, starting fresh'); return begin(true); }
    // saves from before the quickbar filled itself carried a fixed list of things you might not own
    if (!S.hotbar?.length || OLD_HOTBARS.some(h => h.join() === S.hotbar.join())) { S.hotbar = Array(HOTBAR_SIZE).fill(null); S.hotbarSeen = new Set(); }
  }
  Object.assign(S.cam, { x: S.player.x, z: S.player.z });
  Object.assign(S.cam, { yaw: 0, yawT: 0, pitch: .82, pitchT: .82, ppu: 20, ppuT: 20 }); S.mode = 'flat'; S.layer = 0;
  buildTerrain(); remeshAll(); applyGhostAll(); initUI(); resize();
  started = S.started = true; document.body.classList.add('ingame'); closeModals();
  if (fresh) openModal('help');
}
function titleScreen() {
  generateOres(); generateFeatures(); buildTerrain();
  $('titleBtns').innerHTML = (hasSave() ? '<button id="bContinue">Continue</button>' : '') + '<button id="bNew">New game</button><button id="bHelp">How to play</button>';
  $('bContinue')?.addEventListener('click', () => begin(false));
  $('bNew').addEventListener('click', e => {
    if (hasSave() && !e.target.dataset.armed) { e.target.dataset.armed = 1; e.target.textContent = 'Replace save? Click again'; return; }
    wipeSave(); begin(true);
  });
  $('bHelp').addEventListener('click', () => openModal('help'));
  openModal('title');
}
$('helpClose').addEventListener('click', () => started ? closeModals() : openModal('title'));
$('saveBtn').addEventListener('click', () => { if (started && save()) toast('saved'); });
$('quitBtn').addEventListener('click', () => { if (started) save(); started = false; location.reload(); });
for (const b of document.querySelectorAll('[data-pix]')) b.addEventListener('click', () => { S.pix = +b.dataset.pix; resize(); });
$('volume').value = Math.round(getVolume() * 100);
$('volume').addEventListener('input', e => { setVolume(e.target.value / 100); sfx('click'); });
setInterval(() => { if (started) save(); }, 30000);
addEventListener('beforeunload', () => { if (started) save(); });

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

// ---------------------------------------------------------------- keyboard (Factorio layout)
const held = c => keys.has(c);
addEventListener('keydown', e => {
  if (!started) return;
  keys.add(e.code);
  const c = e.code;
  if (c === 'Tab') { e.preventDefault(); toggleMode(); return; }
  if (c === 'Escape') { if (S.modal) closeModals(); else if (entityOpen()) closeEntity(); else selectItem(null); return; }
  if (c === 'KeyF') S.player.pickup = true;
  if (e.repeat) { if (c === 'KeyZ') dropAt(hover); return; }
  if (c.startsWith('Digit')) { const i = (+c.slice(5) + 9) % 10; const it = S.hotbar[i]; selectItem(it && it !== S.sel ? it : null); return; }
  if (c === 'KeyE' || c === 'KeyI') { closeEntity(); sfx(S.modal === 'inventory' ? 'close' : 'open'); return toggleModal('inventory'); }
  if (c === 'KeyT') { sfx(S.modal === 'research' ? 'close' : 'open'); return toggleModal('research'); }
  if (c === 'KeyH' || c === 'F1') return toggleModal('help');
  if (c === 'KeyG') return $('signal').classList.toggle('collapsed');
  if (c === 'KeyQ') return pipette();
  if (c === 'KeyZ') { dropAt(hover); renderHotbar(); return; }
  if (c === 'AltLeft' || c === 'AltRight') { e.preventDefault(); S.altMode = !S.altMode; return; }
  if (c === 'KeyR') {
    const ent = hover && world.ents.get(key(hover.x, hover.y, hover.z));
    if (!S.sel && ent) rotateEntity(ent, e.shiftKey ? -1 : 1);
    else S.dir = (S.dir + (e.shiftKey ? 3 : 1)) % 4;
    renderHotbar(); return;
  }
  if (c === 'KeyV') {
    const kind = S.sel && ENTITIES[S.sel]?.kind;
    if (kind === 'lift') { S.dy = S.dy === -1 ? 1 : -1; toast('lift goes ' + (S.dy > 0 ? 'up' : 'down')); }
    else if (S.mode !== 'depth') toast('inserter pitch is a depth control: press Tab');
    else { S.dy = S.dy === 0 ? 1 : S.dy === 1 ? -1 : 0; toast('inserter pitch: ' + ['level', 'lift ↑', 'drop ↓'][[0, 1, -1].indexOf(S.dy)]); }
    renderHotbar(); return;
  }
  if (c === 'PageUp' || c === 'PageDown' || c === 'BracketLeft' || c === 'BracketRight') {
    if (S.mode !== 'depth') { toast('that is a depth control: press Tab'); return; }
    if (c === 'PageUp') setLayer(S.layer + 1);
    if (c === 'PageDown') setLayer(S.layer - 1);
    if (c === 'BracketLeft') S.cam.yawT -= Math.PI / 2;
    if (c === 'BracketRight') S.cam.yawT += Math.PI / 2;
  }
});
addEventListener('keyup', e => { keys.delete(e.code); if (e.code === 'KeyF') S.player.pickup = false; });
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
const setMouse = e => { setMouseFromEvent(e); S.mouseClient = { x: e.clientX, y: e.clientY }; };
// With a building in hand you aim at the floor tile; with an empty hand you aim at whatever is drawn under the cursor.
const pick = () => S.sel && ENTITIES[S.sel] ? pickCell() : pickTarget();
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
  const ent = world.ents.get(key(hover.x, hover.y, hover.z));
  if (e.ctrlKey && ent) {                                         // Ctrl+click fast transfer
    if (distTo(hover.x, hover.z) > PLAYER.reach) { toast('out of reach'); return; }
    const n = fastTransfer(ent);
    toast(n ? `${S.sel ? 'put in' : 'took'} ${n} item${n > 1 ? 's' : ''}` : 'nothing to move', 1200);
    renderHotbar(); return;
  }
  building = true; lastPaint = null; lastPlaced = null;
  paintAt(hover, true);
});
addEventListener('pointerup', e => { if (e.button === 2) rmb = false; else building = false; });
view.addEventListener('wheel', e => {
  if (e.shiftKey && S.mode === 'depth') { setLayer(S.layer + (e.deltaY < 0 ? 1 : -1)); return; }
  zoomStep(e.deltaY > 0 ? -1 : 1);
}, { passive: true });

function paintAt(c, first) {
  const k = key(c.x, c.y, c.z), ent = world.ents.get(k), def = S.sel && ENTITIES[S.sel];
  if (!def) {
    if (first && ent) { if (distTo(c.x, c.z) > PLAYER.reach) { toast('out of reach'); sfx('error'); } else { openEntity(ent); sfx('open'); } building = false; }
    return;
  }
  // dragging belts lays them along the direction of travel
  if (def.kind === 'belt' && lastPaint) {
    const dx = c.x - lastPaint.x, dz = c.z - lastPaint.z;
    if (Math.abs(dx) + Math.abs(dz) === 1) {
      S.dir = DIRS.findIndex(([a, b]) => a === dx && b === dz);
      if (lastPlaced && lastPlaced.kind === 'belt' && lastPlaced.dir !== S.dir) rotateEntity(lastPlaced, (S.dir - lastPlaced.dir + 4) % 4);
    }
  }
  const err = canPlace(S.sel, c.x, c.y, c.z, S.dir, S.dy, { reach: true });
  if (err) {
    if (first) {
      if (err === 'occupied' && ent && S.sel !== 'frame') { if (distTo(c.x, c.z) <= PLAYER.reach) { openEntity(ent); sfx('open'); } building = false; }
      else { toast(err); sfx('error'); }
    }
    lastPaint = c; lastPlaced = null; return;
  }
  const placed = place(S.sel, c.x, c.y, c.z, S.dir, S.dy);
  lastPlaced = typeof placed === 'object' ? placed : null;
  lastPaint = c;
  if (!invGet(S.sel)) toast(`out of ${itemName(S.sel)}`);
  renderHotbar();
}

// ---------------------------------------------------------------- loop
let last = performance.now();
function frame() {
  const n = performance.now(), dt = Math.min(.05, (n - last) / 1000); last = n;
  if (started && S.modal !== 'title') {
    hover = pick();
    S.player.mineCell = rmb && !S.modal ? hover : null;
    simulate(dt, S.modal ? { mx: 0, mz: 0 } : moveInput());
    if (building && hover && (!lastPaint || key(hover.x, hover.y, hover.z) !== key(lastPaint.x, lastPaint.y, lastPaint.z))) paintAt(hover, false);
    updateUI(dt, hover);
  } else if (!started) S.cam.yawT += dt * .06;
  updateAudio(dt);
  render(dt, started ? hover : null);
  drawSignalCanvases();
  requestAnimationFrame(frame);
}
titleScreen();
frame();

// Console hooks for testing and tinkering.
window.depthworks = {
  S, world, inv, place, removeAt, simulate, begin, save, load, completeResearch, computeVolume, TIERS, held,
  run(seconds, input) { for (let i = 0; i < seconds * 20; i++) simulate(.05, input); },
  give(it, n = 100) { inv.set(it, (inv.get(it) || 0) + n); bus.emit('inv'); },
};
