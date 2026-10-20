import { ENTITIES, ITEMS, OLD_HOTBARS, TIERS, PLAYER, ROADS, VEHICLES, WORLD, RECIPE, TECH, WIRE_TECH } from './data.js';
import { CHANGELOG, VERSION } from './changelog.js';
import { S, world, inv, invGet, bus, key, DIRS, startingInventory, layerRange, layerLockReason, freshBars, factoryOf, unlockAll, SPAWN, GRID, recipeUnlocked, isResearched } from './state.js';
import { newWorld, ensureChunks } from './worldgen.js';
import { stockFish } from './fish.js';
import { simulate, place, removeAt, canPlace, canSlope, slopeLayer, computeVolume, completeResearch, distTo, mineTargetAt, planCraft, depositLayer, machineStats } from './sim.js';
import { bpAt } from './blueprint.js';
import { sizeOf } from './multi.js';
import { toolCursor } from './icons.js';
import { renderer, render, pickCell, pickTarget, setMouseFromEvent, zoomStep, mouse, keys, moveInput, buildTerrain, applyGhostAll, resize, remeshAll } from './scene.js';
import { toast, openModal, closeModals, toggleModal, selectItem, renderHotbar, openEntity, closeEntity, entityOpen, updateUI, initUI, drawSignalCanvases, renderNametags, openChat, cancelCursor, cycleBar, setHideUI, openMenu, setMenuTab, setSetting, openWiki, closeWiki, toggleWiki, pickTargetFor, clearPick, openPlayer, isPicked } from './ui.js';
import { save, load, loadData, hasSave, wipeSave, slotList, freeSlot, latestSlot, exportSave, exportSlot, importSave } from './save.js';
import { doAction, host, join, netTick, leave, rememberFriends, cleanName } from './net.js';
import './signal.js';
import { updateAudio, sfx, getVolume, setVolume } from './audio.js';
import { is, combo, keyName } from './input.js';
import { copyBuilding } from './copypaste.js';
import { roadAt } from './transport.js';
import { setClip } from './copypaste.js';
import { updateMap, resetMap } from './map.js';
import { exploredFromJSON } from './explore.js';
import { myTrade } from './trade.js';

const $ = id => document.getElementById(id);
$('version').textContent = VERSION;
let chartT = 0, started = false, hover = null, building = false, rmb = false, lastPaint = null, lastPlacedCell = null;

// ---------------------------------------------------------------- nickname
const NICK_KEY = 'depthworks.nick';
const nick = () => cleanName($('nick').value);
$('nick').value = (() => { try { return localStorage.getItem(NICK_KEY) || ''; } catch { return ''; } })() || 'Engineer' + Math.floor(100 + Math.random() * 900);
$('nick').addEventListener('input', () => { try { localStorage.setItem(NICK_KEY, nick()); } catch { /* storage unavailable */ } });

// ---------------------------------------------------------------- game start
function enterWorld(fresh) {
  Object.assign(S.cam, { x: S.player.x, z: S.player.z, yaw: 0, yawT: 0, pitch: .82, pitchT: .82, ppu: 20, ppuT: 20, panX: 0, panZ: 0, panXT: 0, panZT: 0 });
  delete S.cam.free;   // saves from when there was a free camera
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
    S.research = { done: new Set(), current: null, queue: [], progress: {}, extra: new Set() }; S.maxTier = 0;
    if (sandbox) unlockAll();
    Object.assign(world, { vehicles: [], units: [], routes: [], factories: [{ id: 1, name: 'Main factory', color: '#7ef6ff' }], facNext: 2, nextId: 1, links: [], marks: { markers: [], areas: [], next: 1 } });
    world.roads.clear(); world.ents.clear(); world.frames.clear(); world.bps.clear(); world.lines = []; world.beltDirty = world.powerDirty = world.fluidDirty = world.railDirty = true;
    S.stats = { made: {} }; S.goalsDone = new Set(); S.med = { levels: {}, current: null, progress: {}, mutations: false };
    newWorld(opts);   // its own seed: biomes, coastlines, lakes and rivers of its own
    exploredFromJSON([]);   // a new world: nothing seen yet (the engineer sees round them as soon as it starts)
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
      + btn('bHost', 'Host co-op') + btn('bJoin', 'Join co-op') + btn('bHelp', 'How to play') + btn('bWiki', 'Wiki') + btn('bLog', 'Change logs');
    $('bContinue')?.addEventListener('click', () => begin(false, false, latestSlot()));
    $('bNew').addEventListener('click', () => startNew(false));
    $('bSandbox').addEventListener('click', () => startNew(true));
    $('bLoad').addEventListener('click', () => titleScreen('slots', { mode: 'load' }));
    $('bHost').addEventListener('click', () => titleScreen('slots', { mode: 'host' }));
    $('bJoin').addEventListener('click', () => titleScreen('join'));
    $('bHelp').addEventListener('click', () => openMenu('guide'));
    $('bWiki').addEventListener('click', openWiki);
    $('bLog').addEventListener('click', () => titleScreen('changelog'));
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
  } else if (view === 'changelog') {   // what changed in each version, newest first (changelog.js)
    $('titleBtns').innerHTML = `<div class="changelog">${CHANGELOG.map(c => `<div class="cl"><div class="clh"><b>${c.version}</b> ${c.stage} <span class="dim">· ${c.date}${c.retro ? ' · numbered afterwards' : ''}</span></div>`
      + `<div class="clt">${c.title}</div><div class="cls dim">${c.summary}</div><ul>${c.changes.map(x => `<li>${x}</li>`).join('')}</ul></div>`).join('')}</div>` + btn('bBack', 'Back');
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

// the pause menu's buttons and settings
$('help').addEventListener('click', e => {
  const b = e.target.closest?.('[data-pm]'); if (!b) return;
  const a = b.dataset.pm;
  sfx('click');
  if (a.startsWith('tab:')) setMenuTab(a.slice(4));
  else if (a === 'resume') closeModals();
  else if (a === 'back') openModal('title');
  else if (a === 'wiki') openWiki();
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
// The camera. Outside depth mode it follows the engineer, looking north, and nothing turns it. In depth mode it rotates
// on a sphere round the point it looks at: a middle-button drag (camOrbit) swings it round freely, sideways all the way
// round and up and down between ORBIT_PITCH, and the keys step it a quarter turn (camLeft / camRight) or a tilt step
// (camLower / camHigher) from wherever it is. Shift + middle drag (camPan) moves the point it looks at. A middle click
// that doesn't drag is still the pipette. Leaving depth mode tweens it back to the default view. Every key and button
// is rebindable (input.js).
const TILTS = [.35, .55, .75, .95, 1.15, 1.35], FLAT_PITCH = .82, DEPTH_PITCH = .55, ORBIT_PITCH = [.3, 1.45];
// Walking down into the layers under the ground (not riding a tunnel), the view follows you: depth mode, on your layer,
// and back to the ground layer when you climb out.
let lastFoot = 0;
function followUnderground() {
  const p = S.player, L = p.tun ? lastFoot : Math.round(p.h || 0);
  if (L === lastFoot) return;
  const [lo] = layerRange();
  if (L < 0 && L >= lo) { if (S.mode !== 'depth') toggleMode(); setLayer(L); }
  else if (L >= 0 && lastFoot < 0 && S.mode === 'depth' && S.layer < 0) setLayer(0);
  lastFoot = L;
}
function toggleMode() {
  const C = S.cam;
  if (S.mode === 'flat') { S.mode = 'depth'; C.pitchT = DEPTH_PITCH; }
  else { S.mode = 'flat'; S.layer = 0; resetCamera(); }
  applyGhostAll(); renderHotbar();
  toast(S.mode === 'depth' ? `DEPTH MODE · ${keyName('layerUp')}/${keyName('layerDown')}: layer · ${keyName('camLeft')} ${keyName('camRight')}: orbit · ${keyName('camLower')} ${keyName('camHigher')}: tilt · drag ${keyName('camOrbit')}: rotate · ${keyName('camPan')} drag: pan · ${keyName('depthGrid')}: grid` : 'FLAT MODE', 2600);
}
// Back to the default view: facing north (the nearest whole turn, so it unwinds the short way), the usual tilt, no pan.
function resetCamera() { const C = S.cam; C.yawT = Math.round(C.yawT / (Math.PI * 2)) * Math.PI * 2; C.pitchT = FLAT_PITCH; C.panXT = C.panZT = 0; }
function tilt(by) {
  const C = S.cam, i = TILTS.reduce((b, t, k) => Math.abs(t - C.pitchT) < Math.abs(TILTS[b] - C.pitchT) ? k : b, 0);
  C.pitchT = TILTS[Math.max(0, Math.min(TILTS.length - 1, i + by))];
}
let rot = null;   // a middle-button drag: { x, y, pan (or orbit), panX, panZ, yaw, pitch, moved }
function setLayer(l) {
  const [lo, hi] = layerRange();
  if (l < lo || l > hi) { toast(layerLockReason(l)); return; }
  S.layer = l; applyGhostAll();
}
// Inserters only pitch in depth mode; belts angle in either.
// Belts can be angled up or down a layer, in depth mode like inserter pitch.
const effDy = type => (ENTITIES[type]?.kind === 'inserter' && S.mode === 'depth') || canSlope(type) ? S.dy : 0;

// ---------------------------------------------------------------- keyboard (Factorio layout)
const held = c => keys.has(c);
addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT') return;
  // the wiki opens anywhere, the title screen included
  if (is('wiki', e.code)) { e.preventDefault(); keys.clear(); toggleWiki(); return; }
  if (e.code === 'Escape' && S.modal === 'wiki') { closeWiki(); return; }
  if (!started) return;
  keys.add(e.code);
  const c = e.code;
  if (is('depthMode', c)) { e.preventDefault(); toggleMode(); return; }
  if (c === 'Escape') {
    if (cancelCursor()) return;
    if (S.linkFrom) { S.linkFrom = null; renderHotbar(); return; }
    if (S.picks.length) { clearPick(); return; }
    if (myTrade()) { doAction({ a: 'trade', do: 'cancel' }); return; }   // closing a trade calls it off
    // Esc closes whatever is open, then empties the hand, and only then opens the menu
    if (S.modal) closeModals(); else if (entityOpen()) closeEntity(); else if (S.sel) selectItem(null); else if (S.clip) setClip(null); else openMenu('settings');
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
    if (canSlope(S.sel)) { S.dy = S.dy === 0 ? 1 : S.dy === 1 ? -1 : 0; toast('belt: ' + ['level', 'slopes up ↑', 'slopes down ↓'][[0, 1, -1].indexOf(S.dy)] + (S.dy > 0 ? ': it goes up from where you place it, and you carry on one layer up' : S.dy < 0 ? ': place it on the lower layer, past the end of the belt coming down (or just past the end of a belt to take it down a layer)' : '')); }
    else if (S.mode !== 'depth') toast('inserter pitch is a depth control: press Tab');
    else { S.dy = S.dy === 0 ? 1 : S.dy === 1 ? -1 : 0; toast('inserter pitch: ' + ['level', 'lift ↑', 'drop ↓'][[0, 1, -1].indexOf(S.dy)]); }
    renderHotbar(); return;
  }
  const depthKey = ['layerUp', 'layerDown', 'camLeft', 'camRight', 'camLower', 'camHigher', 'depthGrid'].find(a => is(a, c));
  if (depthKey) {
    e.preventDefault();
    if (S.mode !== 'depth') { toast(`that is a depth control: press ${keyName('depthMode')}`); return; }
    const C = S.cam, quarter = Math.round(C.yawT / (Math.PI / 2)) * Math.PI / 2;
    if (depthKey === 'layerUp') setLayer(S.layer + 1);
    if (depthKey === 'layerDown') setLayer(S.layer - 1);
    if (depthKey === 'camLeft') C.yawT = quarter - Math.PI / 2;
    if (depthKey === 'camRight') C.yawT = quarter + Math.PI / 2;
    if (depthKey === 'camLower') tilt(-1);
    if (depthKey === 'camHigher') tilt(1);
    if (depthKey === 'depthGrid') { setSetting('depthGrid', S.settings.depthGrid === false); toast(S.settings.depthGrid ? 'depth grid on' : 'depth grid off', 1200); }
  }
});
addEventListener('keyup', e => { keys.delete(e.code); if (is('pickup', e.code)) S.player.pickup = false; });
addEventListener('blur', () => { keys.clear(); S.player.pickup = false; rmb = false; building = false; });

// Q: copy what is under the cursor into the hand (with its direction), or empty the hand. A building you have none of
// (and can't craft) goes into the hand as a blueprint, to plan with. Over ore with nothing built on it, it picks the best
// drill you carry that reaches the deposit, or the best one you could build, as a blueprint.
function pipette() {
  if (S.sel) { selectItem(null); return; }
  if (!hover) return;
  const k = key(hover.x, hover.y, hover.z), ent = world.ents.get(k) || world.frames.get(k), bp = bpAt(hover.x, hover.y, hover.z), road = hover.y === 0 && roadAt(hover.x, hover.z);
  let type = ent ? (ENTITIES[ent.type]?.tileItem && !ENTITIES[ent.type]?.perItem ? ENTITIES[ent.type].tileItem : ent.type) : bp ? bp.type : road ? road.s : null, dir = ent?.dir ?? bp?.dir ?? S.dir;
  const ore = !ent && !bp && world.ores.get(k);
  if (ore) type = bestDrill(ore);
  if (!type) return;
  const have = invGet(type) > 0 || S.sandbox;
  selectItem(type); S.dir = dir;
  S.bpHand = !have && !planCraft(type, 1) && !!ENTITIES[type];
  if (!have && !S.bpHand) toast(`no ${itemName(type).toLowerCase()} in inventory: placing crafts one`);
  else if (S.bpHand) toast(`no ${itemName(type).toLowerCase()} to build: placing plans it as a blueprint`);
  renderHotbar();
}
const itemName = it => ITEMS[it]?.name ?? it;
// The drill for a deposit: the best one in the inventory that reaches its layer (and mines its ore), else the best
// unlocked one that would.
function bestDrill(ore) {
  const drills = Object.keys(ENTITIES).filter(t => ENTITIES[t].kind === 'drill'), lay = ore.layer || 0;
  const fits = t => { const d = ENTITIES[t]; return (d.depth ?? 0) >= lay && (!ITEMS[ore.type]?.mineFluid || d.ports?.some(p => p.fluid === ITEMS[ore.type].mineFluid)); };
  const score = t => (ENTITIES[t].depth ?? 0) * 10 + ENTITIES[t].rate * 4 + (ENTITIES[t].burner ? 0 : 1);
  const held = drills.filter(t => invGet(t) > 0 && fits(t)).sort((a, b) => score(b) - score(a));
  if (held.length) return held[0];
  const known = drills.filter(t => RECIPE[t] && recipeUnlocked(RECIPE[t]) && fits(t)).sort((a, b) => score(b) - score(a));
  return known[0] || drills.filter(fits)[0] || 'burner_drill';
}

// ---------------------------------------------------------------- mouse
const view = renderer.domElement;
// Browsers can take the GPU away from a background tab. Three.js recovers, but say so if the view goes still.
view.addEventListener('webglcontextlost', () => { console.warn('WebGL context lost'); toast('The graphics were reset. They should come back in a moment.', 5000); });
view.addEventListener('webglcontextrestored', () => console.warn('WebGL context restored'));
const setMouse = e => { setMouseFromEvent(e); S.mouseClient = { x: e.clientX, y: e.clientY }; };
// With a building (or road, vehicle, signal) in hand you aim at the floor tile; with an empty hand you aim at
// whatever is drawn under the cursor.
const floorTool = it => !!it && (ENTITIES[it] || ROADS[it] || VEHICLES[it] || ITEMS[it]?.tool === 'signal' || ITEMS[it]?.tool === 'conduit');
// A big building in hand (2 wide or deep) follows the mouse within the tile, so it centres where you point.
function snapBig(c) {
  if (!c || !ENTITIES[S.sel]?.big || c.px === undefined) return c;
  const [w, h] = sizeOf(S.sel, S.dir);
  return { ...c, x: Math.round(c.px - w / 2) + Math.floor((w - 1) / 2), z: Math.round(c.pz - h / 2) + Math.floor((h - 1) / 2) };
}
const pick = () => floorTool(S.sel) ? snapBig(pickCell()) : pickTarget();
// Holding Shift while placing (or a blueprint in hand) plans instead of building.
let planning = false;
const planOn = () => planning || S.bpHand;
view.addEventListener('contextmenu', e => e.preventDefault());
view.addEventListener('pointermove', e => {
  setMouse(e);
  if (rot) {   // depth mode: drag to rotate round the focus (sideways: round it, up and down: over it), or to pan
    const dx = e.clientX - rot.x, dy = e.clientY - rot.y, C = S.cam;
    if (Math.hypot(dx, dy) > 4) rot.moved = true;
    if (rot.moved && S.mode === 'depth' && !rot.pan) {
      C.yawT = C.yaw = rot.yaw - dx * .008;
      C.pitchT = C.pitch = Math.max(ORBIT_PITCH[0], Math.min(ORBIT_PITCH[1], rot.pitch + dy * .005));
    } else if (rot.moved && S.mode === 'depth') {
      const k = 1 / (C.ppu * S.pix), sy = Math.sin(C.yaw), cy = Math.cos(C.yaw), fwd = dy * k / Math.max(.3, Math.sin(C.pitch));
      C.panXT = C.panX = rot.panX - cy * dx * k + sy * fwd; C.panZT = C.panZ = rot.panZ + sy * dx * k + cy * fwd;
    }
  }
});
view.addEventListener('pointerleave', () => { mouse.set(9, 9); S.mouseClient = null; });
view.addEventListener('pointerdown', e => {
  if (!started) return;
  if (S.modal && S.modal !== 'title') closeModals();
  setMouse(e); hover = pick();
  const pan = is('camPan', combo(e));
  if (pan || is('camOrbit', combo(e)) || e.button === 1) { e.preventDefault(); rot = { x: e.clientX, y: e.clientY, pan, panX: S.cam.panX || 0, panZ: S.cam.panZ || 0, yaw: S.cam.yaw, pitch: S.cam.pitch, moved: false, button: e.button }; return; }
  // Shift + left click: with something to build in hand it plans a blueprint (below); with an empty hand it pastes
  // copied settings, or with nothing copied, selects what is under the cursor for transfer modes
  // with a selection going, Shift + click keeps adding to it (or taking out) even with settings copied: paste onto it
  // from its bar
  const placing = e.shiftKey && e.button === 0 && ENTITIES[S.sel], selecting = e.shiftKey && e.button === 0 && !S.sel && (!S.clip || S.picks.length);
  if (!placing && !selecting && clipClick(combo(e))) { e.preventDefault(); return; }
  if (e.button === 2) { rmb = true; return; }    // hold right-click to mine
  if (e.button !== 0 || !hover) return;
  if (e.shiftKey && !S.sel) { pickTargetFor(hover); return; }
  if (hover.player && !S.sel) { openPlayer(hover.player); sfx('open'); return; }
  const hv = hover.veh && world.vehicles.find(x => x.id === hover.veh);
  if (hv && e.ctrlKey && (S.sel || isPicked(hv))) { fastClick(hv); return; }
  if (hover.veh && !S.sel) { const v = world.vehicles.find(x => x.id === hover.veh); if (v) { if (Math.hypot(v.x - S.player.x, v.z - S.player.z) > PLAYER.reach + 1) toast('out of reach'); else { openEntity(v); sfx('open'); } } return; }
  if (ITEMS[S.sel]?.food) { doAction({ a: 'eat', it: S.sel }); sfx('craft'); renderHotbar(); return; }
  const ent = world.ents.get(key(hover.x, hover.y, hover.z));
  if (ITEMS[S.sel]?.tool === 'link') { linkClick(ent); return; }
  if (e.ctrlKey && ent) {                                         // Ctrl+click fast transfer (in the selection's mode)
    if (distTo(hover.x, hover.z) > PLAYER.reach) { toast('out of reach'); return; }
    fastClick(ent); return;
  }
  if (!S.sel && !ent && !e.shiftKey && S.picks.length && !bpAt(hover.x, hover.y, hover.z)) { clearPick(); return; }   // a click on empty ground clears the selection
  if (!S.sel && !ent && bpAt(hover.x, hover.y, hover.z)) { doAction({ a: 'bpbuild', x: hover.x, y: hover.y, z: hover.z }); sfx('place'); return; }   // build a planned building
  planning = e.shiftKey && !!ENTITIES[S.sel];
  building = true; lastPaint = null; lastPlacedCell = null;
  paintAt(hover, true);
});
addEventListener('pointerup', e => {
  if (e.button === 2) { rmb = false; return; }
  if (rot && e.button === rot.button) { const r = rot; rot = null; if (!r.moved) pipette(); return; }
  building = false;
  if (S.dragTiles) { if (S.dragTiles.length) doAction({ a: 'drag', type: S.sel, tiles: S.dragTiles, fac: S.player.fac }); S.dragTiles = null; renderHotbar(); }
  if (S.poleDrag) { placePoles(); S.poleDrag = null; renderHotbar(); }
  if (conduitTiles.length) { doAction({ a: 'conduit', tiles: conduitTiles.splice(0) }); renderHotbar(); }
  planning = false;
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
// Ctrl + click: on something selected, it acts on the whole selection (sharing the held stack out, or emptying them
// all); on anything else, on that alone.
function fastClick(t) {
  const many = isPicked(t) && S.picks.length > 1, mode = isPicked(t) && S.sel ? S.pickMode : null;
  if (many) doAction({ a: 'fastmany', list: S.picks.map(r => r.veh ? { veh: r.veh } : [r.x, r.y, r.z]), sel: S.sel, mode });
  else doAction(t.isVeh ? { a: 'fast', veh: t.id, sel: S.sel, mode } : { a: 'fast', x: t.x, y: t.y, z: t.z, sel: S.sel, mode });
  renderHotbar();
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
// With a cable in hand: click one pole, then another (or, with Direct wiring, a machine). Clicking a linked pair again
// takes the cable down.
function linkClick(ent) {
  const toMachine = !!ITEMS[S.sel]?.toBuilding && isResearched(WIRE_TECH) && !!ENTITIES[ent?.type]?.power && ent.kind !== 'pole';
  if (ent?.kind !== 'pole' && !(toMachine && S.linkFrom)) { toast(toMachine ? 'click the pole first, then the machine' : ITEMS[S.sel]?.toBuilding && !isResearched(WIRE_TECH) && ENTITIES[ent?.type]?.power ? `cables go between poles: research ${TECH[WIRE_TECH].name} to wire machines` : 'cables go between poles: click a pole'); sfx('error'); return; }
  if (distTo(ent.x, ent.z) > PLAYER.reach) { toast('out of reach'); sfx('error'); return; }
  const at = [ent.x, ent.y, ent.z], from = S.linkFrom;
  S.linkFrom = from ? null : at;
  if (from && from.join() !== at.join()) { doAction({ a: 'link', kind: S.sel, from, to: at }); sfx('place'); }
  renderHotbar();
}

function paintAt(c, first) {
  if (ROADS[S.sel]) { paintRoad(c, first); return; }
  if (ITEMS[S.sel]?.tool === 'conduit') { paintConduit(c); return; }
  if (ENTITIES[S.sel]?.drag) { paintDrag(c, first); return; }
  if (isPoleLine(S.sel)) { paintPoles(c, first); return; }
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
  // Belts keep the direction R gave them while you drag (walking with WASD moves the cursor, never turns them).
  const dy = effDy(S.sel);
  c = { ...c, y: slopeLayer(S.sel, c.x, c.y, c.z, S.dir, dy) };   // a slope down may belong a layer lower
  if (planOn()) {   // a blueprint: planned, anywhere you can see, built later
    if (canPlace(S.sel, c.x, c.y, c.z, S.dir, dy, { noInv: true, bp: true }) === 'occupied' && ent && first && !planning) { if (distTo(c.x, c.z) <= PLAYER.reach) { openEntity(ent); sfx('open'); } building = false; return; }
    doAction({ a: 'bp', type: S.sel, x: c.x, y: c.y, z: c.z, dir: S.dir, dy, fac: S.player.fac, quiet: !first });
    lastPaint = c; return;
  }
  // running out is fine: the host crafts another if it can (placeOrCraft in sim.js)
  const err = canPlace(S.sel, c.x, c.y, c.z, S.dir, dy, { reach: true, noInv: true });
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
  if (canSlope(S.sel) && dy) {   // carry on where the slope leads, level again, so a drag goes on along that layer
    const ny = c.y + (dy > 0 ? 1 : 0);
    S.dy = 0;
    if (ny !== S.layer) { if (S.mode !== 'depth') toggleMode(); setLayer(ny); }
    lastPaint = { x: c.x, y: ny, z: c.z };   // the cell over the slope is not the next one along: wait for the cursor to move on
    toast(ny !== c.y || ny !== 0 ? `now building on layer ${S.layer}${S.layer > 0 ? ': belts up here stand on hollow frames' : ''}` : 'belt angled down onto the ground');
  }
  renderHotbar();
}

// Power poles dragged out in a line: spaced as far apart as their supply areas allow without gaps (and never further
// than their wires reach), shown while you drag, placed when you let go. Where one can't stand, it tries a tile to
// either side. Those out of reach are planned as blueprints; holding Shift plans them all.
const isPoleLine = t => ENTITIES[t]?.kind === 'pole' && !ENTITIES[t].volts;
const poleStep = t => { const d = ENTITIES[t]; return Math.max(1, Math.min(Math.floor(d.wire), d.supply * 2 + 1)); };
function paintPoles(c, first) {
  if (first) S.poleDrag = { type: S.sel, y: c.y, from: c, list: [] };
  const D = S.poleDrag; if (!D) return;
  const dx = c.x - D.from.x, dz = c.z - D.from.z, along = Math.abs(dx) >= Math.abs(dz), len = Math.max(Math.abs(dx), Math.abs(dz)), step = poleStep(D.type), n = Math.ceil(len / step);
  D.list = [];
  for (let i = 0; i <= n; i++) {
    const t = n ? Math.round(i * len / n) : 0, x = along ? D.from.x + Math.sign(dx) * t : D.from.x, z = along ? D.from.z : D.from.z + Math.sign(dz) * t;
    let spot = null;
    for (const [ox, oz] of [[0, 0], along ? [0, 1] : [1, 0], along ? [0, -1] : [-1, 0]]) if (!canPlace(D.type, x + ox, D.y, z + oz, 0, 0, { noInv: true, bp: true })) { spot = { x: x + ox, z: z + oz }; break; }
    D.list.push(spot || { x, z, bad: true });
  }
}
function placePoles() {
  const D = S.poleDrag; let planned = 0, built = 0;
  for (const p of D.list) {
    if (p.bad) continue;
    if (planning || S.bpHand || distTo(p.x, p.z) > PLAYER.reach) { doAction({ a: 'bp', type: D.type, x: p.x, y: D.y, z: p.z, dir: 0, fac: S.player.fac, quiet: true }); planned++; }
    else { doAction({ a: 'place', type: D.type, x: p.x, y: D.y, z: p.z, dir: 0, dy: 0, fac: S.player.fac }); built++; }
  }
  if (planned && !planning && !S.bpHand) toast(`${built} placed · ${planned} out of reach, planned as blueprints: click them to build`);
  sfx('place');
}
// Road conduits: dragged over road tiles, sent in batches.
const conduitTiles = [];
function paintConduit(c) {
  if (c.y !== 0 || !roadAt(c.x, c.z) || roadAt(c.x, c.z).p || conduitTiles.some(t => t[0] === c.x && t[1] === c.z)) return;
  conduitTiles.push([c.x, c.z]);
  if (conduitTiles.length >= 8) doAction({ a: 'conduit', tiles: conduitTiles.splice(0) });
}

// Things laid by dragging across tiles (dams): a straight run from where the drag started, `width` tiles wide across it
// (like a road), placed on release as one.
let dragFrom = null;
function paintDrag(c, first) {
  if (c.y !== 0) return;
  if (first) dragFrom = c;
  const dx = c.x - dragFrom.x, dz = c.z - dragFrom.z, along = Math.abs(dx) >= Math.abs(dz), n = Math.max(Math.abs(dx), Math.abs(dz)), tiles = [], w = ENTITIES[S.sel].width || 1;
  for (let i = 0; i <= Math.min(n, 64); i++) for (let k = 0; k < w; k++) tiles.push(along ? [dragFrom.x + Math.sign(dx) * i, dragFrom.z + k] : [dragFrom.x + k, dragFrom.z + Math.sign(dz) * i]);
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
    const paused = (S.modal === 'help' || S.modal === 'wiki') && S.net.role === 'solo';   // the menu and the wiki pause a solo game
    if (started && S.modal !== 'title' && !paused) {
      hover = pick();
      if (hover) hover.ctrl = held('ControlLeft') || held('ControlRight');   // Ctrl: mine single tiles
      S.player.sel = S.sel;
      setToolCursor();
      S.player.mineCell = rmb && !S.modal ? hover : null;
      const typing = document.activeElement?.tagName === 'INPUT';
      simulate(dt, S.modal || typing ? { mx: 0, mz: 0 } : moveInput());
      followUnderground();
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
