import { ENTITIES, ITEMS, OLD_HOTBARS, TIERS, PLAYER, ROADS, VEHICLES, WORLD } from './data.js';
import { S, world, inv, invGet, bus, key, DIRS, startingInventory, layerRange, layerLockReason, freshBars, factoryOf, unlockAll, SPAWN, GRID } from './state.js';
import { newWorld, ensureChunks } from './worldgen.js';
import { stockFish } from './fish.js';
import { simulate, place, removeAt, canPlace, computeVolume, completeResearch, distTo, mineTargetAt } from './sim.js';
import { toolCursor } from './icons.js';
import { renderer, render, pickCell, pickTarget, setMouseFromEvent, zoomStep, mouse, keys, moveInput, buildTerrain, applyGhostAll, resize, remeshAll } from './scene.js';
import { toast, openModal, closeModals, toggleModal, selectItem, renderHotbar, openEntity, closeEntity, entityOpen, updateUI, initUI, drawSignalCanvases, renderNametags, openChat, cancelCursor, cycleBar, setHideUI, openMenu, setMenuTab, setSetting } from './ui.js';
import { save, load, loadData, hasSave, wipeSave, slotList, freeSlot, latestSlot, exportSave, exportSlot, importSave } from './save.js';
import { doAction, host, join, netTick, leave, rememberFriends, cleanName } from './net.js';
import './signal.js';
import { updateAudio, sfx, getVolume, setVolume } from './audio.js';
import { is, combo } from './input.js';
import { copyBuilding, setClip } from './copypaste.js';
import { roadAt } from './transport.js';
import { updateMap, resetMap } from './map.js';

const $ = id => document.getElementById(id);
let chartT = 0, started = false, hover = null, building = false, rmb = false, lastPaint = null, lastPlacedCell = null;

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
  if (fresh) openMenu('guide');
}
// opts: the world options from the new game screen (size, seed, biome size, water, ores; see newWorld in worldgen.js)
function begin(fresh, sandbox = false, slot = S.slot, opts = {}) {
  S.player.name = nick();
  S.slot = slot;
  if (fresh) {
    wipeSave(slot);
    S.sandbox = sandbox;
    S.research = { done: new Set(), current: null, progress: {}, extra: new Set() }; S.maxTier = 0;
    if (sandbox) unlockAll();
    Object.assign(world, { vehicles: [], units: [], routes: [], factories: [{ id: 1, name: 'Main factory', color: '#7ef6ff' }], facNext: 2, nextId: 1, links: [], marks: { markers: [], areas: [], next: 1 } });
    world.roads.clear(); world.ents.clear(); world.frames.clear(); world.lines = []; world.beltDirty = world.powerDirty = world.fluidDirty = world.railDirty = true;
    S.stats = { made: {} }; S.goalsDone = new Set(); S.med = { levels: {}, current: null, progress: {}, mutations: false };
    newWorld(opts);   // its own seed: biomes, coastlines, lakes and rivers of its own
    Object.assign(S.player, { x: SPAWN.x, z: SPAWN.z, face: 0, fac: 1, veh: null, hp: PLAYER.health, sta: PLAYER.stamina, tired: false });
    startingInventory(); stockFish();
    freshBars();
  } else {
    if (!load(slot)) { toast('save could not be read, starting fresh'); return begin(true, false, slot); }
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
const ago = t => { const s = Math.max(0, (Date.now() - t) / 1000); return s < 90 ? 'just now' : s < 5400 ? Math.round(s / 60) + ' min ago' : s < 129600 ? Math.round(s / 3600) + ' h ago' : Math.round(s / 86400) + ' days ago'; };
const played = T => T >= 3600 ? `${Math.floor(T / 3600)} h ${Math.floor(T % 3600 / 60)} min` : `${Math.max(1, Math.round(T / 60))} min`;
const escH = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
function hostWorld() {
  host({
    onReady: code => { navigator.clipboard?.writeText(code).catch(() => {}); toast(`Invite code: ${code}. Send it to your friends (click the code to copy it).`, 6000, 'good'); },
    onError: m => toast('Could not start co-op: ' + m, 6000),
  });
}
// Start a new world: world options first, then a free slot (with every slot taken, pick one to replace).
function startNew(sandbox, hosting) { titleScreen('options', { sandbox, hosting }); }
function startWith(opt) {
  const n = freeSlot();
  if (n === null) { titleScreen('slots', { mode: 'new', ...opt }); return; }
  begin(true, opt.sandbox, n, opt.world); if (opt.hosting) hostWorld();
}
// The world options last chosen, kept in this browser.
const OPTS_KEY = 'depthworks.worldopts';
const lastOpts = () => { try { return { size: WORLD.size, biomes: 'normal', water: 'normal', ores: 'normal', ...JSON.parse(localStorage.getItem(OPTS_KEY) || '{}') }; } catch { return { size: WORLD.size, biomes: 'normal', water: 'normal', ores: 'normal' }; } };
// A file from disk goes into a free slot (or the one you pick) and starts.
function loadFile(slot) {
  const input = document.createElement('input'); input.type = 'file'; input.accept = '.json,application/json';
  input.addEventListener('change', () => {
    const f = input.files?.[0]; if (!f) return;
    const n = slot ?? freeSlot();
    if (n === null) { $('lobbyMsg').textContent = 'Every slot is full: delete one first.'; return; }
    f.text().then(text => { const err = importSave(text, n); if (err) $('lobbyMsg').textContent = err; else begin(false, false, n); });
  });
  input.click();
}
function titleScreen(view = 'main', opt = {}) {
  const btn = (id, label) => `<button id="${id}">${label}</button>`, msg = $('lobbyMsg');
  msg.textContent = '';
  if (view === 'main') {
    $('titleBtns').innerHTML = (hasSave() ? btn('bContinue', 'Continue') : '') + btn('bNew', 'New game') + btn('bSandbox', 'Sandbox') + btn('bLoad', 'Load game')
      + btn('bHost', 'Host co-op') + btn('bJoin', 'Join co-op') + btn('bHelp', 'How to play');
    $('bContinue')?.addEventListener('click', () => begin(false, false, latestSlot()));
    $('bNew').addEventListener('click', () => startNew(false));
    $('bSandbox').addEventListener('click', () => startNew(true));
    $('bLoad').addEventListener('click', () => titleScreen('slots', { mode: 'load' }));
    $('bHost').addEventListener('click', () => titleScreen('slots', { mode: 'host' }));
    $('bJoin').addEventListener('click', () => titleScreen('join'));
    $('bHelp').addEventListener('click', () => openMenu('guide'));
  } else if (view === 'slots') {
    // load: load / export / delete each world, or load one from a file. new: pick a slot to start in (replacing
    // what is there, after a second click). host: host a saved world, or start a new one to host.
    const { mode } = opt;
    const head = mode === 'load' ? 'Your worlds live in this browser. Export them to files to keep them safe, or to move them to another computer.'
      : mode === 'host' ? 'Friends join your world and play in it with you. Keep this tab open while they play.'
      : `Every slot is taken. Pick one for the new ${opt.sandbox ? 'sandbox' : 'world'}: what is in it now is lost unless you export it first.`;
    const row = s => !s.used
      ? `<div class="slotrow empty"><b>Slot ${s.n}</b> <span class="dim">empty</span>${mode === 'new' ? `<button data-slot-act="new:${s.n}">Start here</button>` : ''}</div>`
      : `<div class="slotrow"><b>Slot ${s.n}</b> <span>${escH(s.name)}</span> <span class="dim">${s.savedAt ? 'saved ' + ago(s.savedAt) : ''}${s.T ? ' · ' + played(s.T) + ' in game' : ''}</span>
        <span class="grow"></span>${mode === 'load' ? `<button data-slot-act="load:${s.n}">Load</button><button data-slot-act="export:${s.n}">Export</button><button data-slot-act="del:${s.n}">Delete</button>`
          : mode === 'host' ? `<button data-slot-act="host:${s.n}">Host</button>` : `<button data-slot-act="new:${s.n}">Replace</button>`}</div>`;
    $('titleBtns').innerHTML = `<div class="dim slothead">${head}</div><div class="slots">${slotList().map(row).join('')}</div>`
      + (mode === 'load' ? btn('bFile', 'Load from file…') : mode === 'host' ? btn('bHostNew', 'Host a new world') + btn('bHostSand', 'Host a sandbox') : '') + btn('bBack', 'Back');
    $('bFile')?.addEventListener('click', () => loadFile(null));
    $('bHostNew')?.addEventListener('click', () => startNew(false, true));
    $('bHostSand')?.addEventListener('click', () => startNew(true, true));
    $('bBack').addEventListener('click', () => titleScreen('main'));
    $('titleBtns').querySelectorAll('[data-slot-act]').forEach(b => b.addEventListener('click', () => {
      const [a, n] = b.dataset.slotAct.split(':'), slot = +n;
      const armed = () => { if (b.dataset.armed) return true; b.dataset.armed = 1; b.textContent = 'Sure? Click again'; return false; };
      if (a === 'load') begin(false, false, slot);
      else if (a === 'host') { begin(false, false, slot); hostWorld(); }
      else if (a === 'export') exportSlot(slot);
      else if (a === 'del') { if (armed()) { wipeSave(slot); titleScreen('slots', opt); } }
      else if (a === 'new') { if (!slotList()[slot - 1].used || armed()) { begin(true, opt.sandbox, slot, opt.world); if (opt.hosting) hostWorld(); } }
    }));
  } else if (view === 'options') {
    // world options: size, seed, how big biomes are, how much water, how rich the ore
    const o = lastOpts(), sel = (id, list, cur) => `<select id="${id}">${list.map(([v, l]) => `<option value="${v}"${String(v) === String(cur) ? ' selected' : ''}>${l}</option>`).join('')}</select>`;
    const sizes = WORLD.sizes.map(n => [n, `${n} × ${n}${n === WORLD.size ? ' (default)' : n >= 16384 ? ' (huge)' : ''}`]);
    $('titleBtns').innerHTML = `<div class="dim slothead">${opt.sandbox ? 'A sandbox world: everything researched, crafting free.' : 'A new world.'} Only the parts someone has been near ever get made, so even the biggest worlds start at once.</div>
      <div class="wopts">
        <label>World size</label>${sel('woSize', [...sizes, ['custom', 'Custom…']], WORLD.sizes.includes(+o.size) ? o.size : 'custom')}
        <label>Custom size</label><input id="woCustom" class="num" value="${o.size}" title="${WORLD.min} to ${WORLD.max} tiles a side">
        <label>Seed</label><input id="woSeed" placeholder="random" autocomplete="off" spellcheck="false">
        <label>Biomes</label>${sel('woBiomes', [['small', 'Small'], ['normal', 'Normal'], ['large', 'Large']], o.biomes)}
        <label>Water</label>${sel('woWater', [['low', 'Little'], ['normal', 'Normal'], ['high', 'Lots']], o.water)}
        <label>Ore</label>${sel('woOres', [['poor', 'Poor'], ['normal', 'Normal'], ['rich', 'Rich']], o.ores)}
      </div>` + btn('bWorldGo', opt.hosting ? 'Start and host' : 'Start') + btn('bBack', 'Back');
    const custom = () => { $('woCustom').disabled = $('woSize').value !== 'custom'; };
    $('woSize').addEventListener('change', custom); custom();
    $('bBack').addEventListener('click', () => titleScreen('main'));
    $('bWorldGo').addEventListener('click', () => {
      const size = $('woSize').value === 'custom' ? Math.round(+$('woCustom').value) : +$('woSize').value;
      if (!(size >= WORLD.min && size <= WORLD.max)) { msg.textContent = `World size goes from ${WORLD.min} to ${WORLD.max} tiles a side.`; return; }
      const world = { size, seed: $('woSeed').value.trim(), biomes: $('woBiomes').value, water: $('woWater').value, ores: $('woOres').value };
      try { localStorage.setItem(OPTS_KEY, JSON.stringify({ size, biomes: world.biomes, water: world.water, ores: world.ores })); } catch { /* storage unavailable */ }
      startWith({ sandbox: opt.sandbox, hosting: opt.hosting, world });
    });
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

// the pause menu's buttons and settings
$('help').addEventListener('click', e => {
  const b = e.target.closest?.('[data-pm]'); if (!b) return;
  const a = b.dataset.pm;
  sfx('click');
  if (a.startsWith('tab:')) setMenuTab(a.slice(4));
  else if (a === 'resume') closeModals();
  else if (a === 'back') openModal('title');
  else if (a === 'save') saveNow();
  else if (a === 'export') { if (S.net.role === 'client') toast('only the host can export this world'); else { exportSave(); toast('saved to a file in your downloads'); } }
  else if (a === 'quit') { if (started) save(); started = false; leave(); location.reload(); }
});
$('help').addEventListener('change', e => { const c = e.target.closest?.('[data-set]'); if (c) setSetting(c.dataset.set, c.checked); });
const showVolume = () => { $('volumeN').textContent = $('volume').value + '%'; };
$('volume').value = Math.round(getVolume() * 100); showVolume();
$('volume').addEventListener('input', e => { setVolume(e.target.value / 100); showVolume(); sfx('click'); });
// Autosave. A full browser says so once, instead of failing quietly.
let fullWarned = false;
function saveNow(auto = false) {
  const r = save();
  if (r === true) { if (!auto) toast('saved to slot ' + S.slot); fullWarned = false; }
  else if (r === 'full') { if (!auto || !fullWarned) toast('The browser has no room left for saves. Export your world to a file (menu), or delete a slot from Load game.', 7000); fullWarned = true; }
  else if (!auto && S.net.role === 'client') toast('only the host can save this world');
}
setInterval(() => { if (started) saveNow(true); }, 30000);
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
    // Esc closes whatever is open, then empties the hand, and only then opens the menu
    if (S.modal) closeModals(); else if (entityOpen()) closeEntity(); else if (S.sel) selectItem(null); else openMenu('settings');
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
  if (is('help', c)) { e.preventDefault(); if (S.modal === 'help') closeModals(); else openMenu('settings'); return; }
  if (is('hideUI', c)) return setHideUI(!S.hideUI);
  if (is('cycleBar', c)) return cycleBar();
  if (is('signal', c)) return $('signal').classList.toggle('collapsed');
  if (is('board', c)) { doAction({ a: 'board' }); return; }
  if (is('logistics', c)) { sfx(S.modal === 'logistics' ? 'close' : 'open'); return toggleModal('logistics'); }
  if (is('factories', c)) { sfx(S.modal === 'factories' ? 'close' : 'open'); return toggleModal('factories'); }
  if (is('nextFactory', c)) { const F = world.factories, i = F.findIndex(f => f.id === S.player.fac); S.player.fac = F[(i + 1) % F.length].id; toast('building for ' + factoryOf(S.player.fac).name, 1500); renderHotbar(); return; }
  if (is('pipette', c)) return pipette();
  if (is('copySettings', c)) { copyAt(hover); return; }
  if (is('pasteSettings', c) && S.clip) { pasteAt(hover); return; }
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
  if (clipClick(combo(e))) { e.preventDefault(); return; }
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
addEventListener('pointerup', e => {
  if (e.button === 2) { rmb = false; return; }
  building = false;
  if (S.dragTiles) { if (S.dragTiles.length) doAction({ a: 'drag', type: S.sel, tiles: S.dragTiles, fac: S.player.fac }); S.dragTiles = null; renderHotbar(); }
});
view.addEventListener('wheel', e => {
  if (e.shiftKey && S.mode === 'depth') { setLayer(S.layer + (e.deltaY < 0 ? 1 : -1)); return; }
  zoomStep(e.deltaY > 0 ? -1 : 1);
}, { passive: true });

// Copy and paste settings (Shift + right / left click by default; see copypaste.js). With a building in hand, copying
// still reads what is under the cursor.
function clipClick(code) {
  if (is('copySettings', code)) { copyAt(pickTarget()); return true; }
  if (is('pasteSettings', code) && S.clip) { pasteAt(pickTarget()); return true; }
  return false;
}
function copyAt(c) {
  if (!c) return;
  const e = world.ents.get(key(c.x, c.y, c.z)), r = c.y === 0 && roadAt(c.x, c.z);
  if (e) { const clip = copyBuilding(e); if (clip) { setClip(clip); sfx('click'); } return; }
  if (r && r.w) { setClip({ kind: 'road', from: ITEMS[r.s].name, what: ['lanes', 'markings', 'edges', 'crossings'], data: { road: { l: r.l, m: r.m, e: r.e, c: r.c, w: r.w, sw: false } } }); Object.assign(S.roadCfg, { l: r.l, m: r.m, edges: r.e, cross: r.c, w: r.w }); renderHotbar(); return; }
  toast('nothing to copy there');
}
function pasteAt(c) {
  if (!c) return;
  if (distTo(c.x, c.z) > PLAYER.reach + 2) { toast('out of reach'); sfx('error'); return; }
  doAction({ a: 'paste', x: c.x, y: c.y, z: c.z, clip: S.clip }); sfx('place');
}
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
  if (ENTITIES[S.sel]?.drag) { paintDrag(c, first); return; }
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
  // running out is fine: the host crafts another if it can (placeOrCraft in sim.js)
  const dy = effDy(S.sel), err = canPlace(S.sel, c.x, c.y, c.z, S.dir, dy, { reach: true, noInv: true });
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
  renderHotbar();
}

// Things laid by dragging across tiles (dams): a straight run from where the drag started, placed on release as one.
let dragFrom = null;
function paintDrag(c, first) {
  if (c.y !== 0) return;
  if (first) dragFrom = c;
  const dx = c.x - dragFrom.x, dz = c.z - dragFrom.z, along = Math.abs(dx) >= Math.abs(dz), n = Math.max(Math.abs(dx), Math.abs(dz)), tiles = [];
  for (let i = 0; i <= Math.min(n, 64); i++) tiles.push(along ? [dragFrom.x + Math.sign(dx) * i, dragFrom.z] : [dragFrom.x, dragFrom.z + Math.sign(dz) * i]);
  S.dragTiles = tiles;
  S.dragErr = canPlace(S.sel, c.x, 0, c.z, 0, 0, { tiles, reach: true, fac: S.player.fac }); S.dragOk = !S.dragErr;
}
// Dragging a road lays it in straight runs along the drag, every tile, even when the mouse skips some. Each step
// covers the road's width across the way you move; changing direction starts a new run from the corner.
let roadDrag = null, strokes = 0;
// every tile of one drag belongs to one road (see transport.js)
const layRoad = (x, z, ax) => doAction({ a: 'road', x, z, ax, surf: S.sel, cfg: S.roadCfg, stroke: roadDrag?.stroke });
function paintRoad(c, first) {
  if (c.y !== 0) { if (first) toast('roads go on the ground layer'); return; }
  if (first) { roadDrag = { last: c, start: c, a: S.dir % 2, fresh: true, stroke: `${S.player.id}.${Date.now() % 1e7}.${strokes++}` }; layRoad(c.x, c.z, roadDrag.a); lastPaint = c; renderHotbar(); return; }
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

// The cursor shows the tool that works on what it points at: axe on trees, pickaxe on ore and rock, shovel on weeds.
let shownCursor = '';
function setToolCursor() {
  const t = !S.sel && hover && !S.modal ? mineTargetAt(hover) : null, c = t?.tool && toolCursor(t.tool) || '';
  if (c !== shownCursor) { shownCursor = c; view.style.cursor = c; }
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
    const paused = S.modal === 'help' && S.net.role === 'solo';   // the menu pauses a solo game
    if (started && S.modal !== 'title' && !paused) {
      hover = pick();
      if (hover) hover.ctrl = held('ControlLeft') || held('ControlRight');   // Ctrl: mine single tiles
      setToolCursor();
      S.player.mineCell = rmb && !S.modal ? hover : null;
      const typing = document.activeElement?.tagName === 'INPUT';
      simulate(dt, S.modal || typing ? { mx: 0, mz: 0 } : moveInput());
      netTick(dt);
      if (building && hover && (!lastPaint || key(hover.x, hover.y, hover.z) !== key(lastPaint.x, lastPaint.y, lastPaint.z))) paintAt(hover, false);
      updateUI(dt, hover);
      updateMap(dt);
      if ((chartT += dt) > 2) { chartT = 0; for (const p of S.players.values()) ensureChunks(p.x, p.z, 64); }   // the map charts where everyone is
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
  S, world, inv, place, removeAt, simulate, begin, beginGuest, save, load, ensureChunks, completeResearch, computeVolume, TIERS, held, doAction, host, join, toggleModal,
  run(seconds, input) { for (let i = 0; i < seconds * 20; i++) { simulate(.05, input); netTick(.05); } },
  give(it, n = 100) { inv.add(it, n); bus.emit('inv'); },
};
