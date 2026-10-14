// Co-op over WebRTC, peer to peer, so it works from a static site like GitHub Pages.
// PeerJS's free public broker introduces the browsers (and offers free relay servers for strict networks);
// after that, game traffic goes directly between players.
//
// The host's browser owns the world. Friends send inputs and actions; the host runs them with the same
// rules (as that player) and streams back world changes plus regular snapshots. Friends also simulate
// locally between snapshots, so belts and arms keep moving smoothly.
import { Peer } from 'peerjs';
import { patchAt, clearPatch, removeFeat, S, world, bus, key, newPlayer, asActor, notify, inv, invGet, invAdd, invGive, actor, factoryOf, FAC_COLORS, isResearched } from './state.js';
import { ITEMS, TECH, MED } from './data.js';
import { placeDrag, placeOrCraft, turnPending, heal, place, rotateEntity, queueCraft, cancelCraft, fastTransfer, fastTransferMany, dropAt, entityCommand, canPlace, completeResearch, moveItems, shiftMove, linkPoles, editMarks, setFactory, researchAction } from './sim.js';
import { placeBlueprint, buildBlueprint, removeBlueprint, bpOp, applyBpOp } from './blueprint.js';
import { serialize, entToJSON, entFromJSON, applyEntJSON } from './save.js';
import { clearFoot } from './multi.js';
import { applyToBuilding } from './copypaste.js';
import { medToJSON, medFromJSON, medAction } from './body.js';
import { roadAt, pasteRoad, placeRoad, applyRoads, placeSignal, placeVehicle, board, routeAction, vehToJSON, unitToJSON, applyVehicles, layConduit, vehicleById } from './transport.js';
import { fishToList, fishFromList } from './fish.js';
import { tradeAction, tradeView } from './trade.js';

const PREFIX = 'depthworks-v1-';
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const COLORS = [0xe07a2e, 0x3a9ad8, 0x6ac46a, 0xd84a8a, 0xb07ad8, 0xe0c03a, 0x3ac4b8, 0xd8483a];
const ITEM_IDS = Object.keys(ITEMS);
const net = { peer: null, conns: new Map(), conn: null, ops: [], applying: false, stateT: 0, inputT: 0, keyT: 0, statsT: 0 };
export const netInfo = () => ({ role: S.net.role, code: S.net.code, players: [...S.players.values()].map(p => ({ id: p.id, name: p.name, color: p.color, local: p.local })) });

const makeCode = () => Array.from({ length: 6 }, () => ALPHABET[Math.floor(Math.random() * ALPHABET.length)]).join('');
export const cleanName = n => (String(n || '').replace(/[^\p{L}\p{N} _\-.]/gu, '').trim().slice(0, 16)) || 'Engineer';
const invToList = inv => inv.toList();
// Messages travel as JSON text. PeerJS's binary packer throws on Infinity, and that exception stopped the game
// loop (the host's picture froze for good). JSON writes such numbers as null; the warning names the field.
let badNumberWarned = false;
const finite = (k, v) => {
  if (typeof v !== 'number' || Number.isFinite(v)) return v;
  if (!badNumberWarned) { badNumberWarned = true; console.warn(`co-op: "${k}" was ${v}, sent as null`); }
  return null;
};
const send = (conn, m) => { if (conn?.open) conn.send(JSON.stringify(m, finite)); };
const recv = m => typeof m === 'string' ? JSON.parse(m) : m;

// ---------------------------------------------------------------- actions (same entry point for everyone)
// Solo and host apply immediately; a friend's browser forwards to the host.
export function doAction(op) {
  if (S.net.role === 'client') { send(net.conn, { t: 'act', op }); return null; }
  return applyAction(op);
}
function applyAction(op) {
  const e = op.x !== undefined ? world.ents.get(key(op.x, op.y, op.z)) : null;
  switch (op.a) {
    case 'place': {
      const fac = factoryOf(op.fac) ? op.fac : actor.fac;
      return placeOrCraft(op, fac);
    }
    case 'road': { const err = placeRoad(op); if (err) notify('toast', err); break; }
    case 'drag': { const err = placeDrag(op, factoryOf(op.fac) ? op.fac : actor.fac); if (err) notify('toast', err); break; }
    case 'signal': { const err = placeSignal(op.x, op.z, op.dir); if (err) notify('toast', err); break; }
    case 'vehicle': { const err = placeVehicle(op.type, op.x, op.z, op.dir); if (err) notify('toast', err); break; }
    case 'board': board(); break;
    case 'route': routeAction(op); break;
    case 'factory': factoryAction(op); break;
    case 'setfac': {
      const list = [];
      if (Array.isArray(op.area)) { const [x0, z0, x1, z1] = op.area; for (const e of world.ents.values()) if (e.x >= Math.min(x0, x1) && e.x <= Math.max(x0, x1) && e.z >= Math.min(z0, z1) && e.z <= Math.max(z0, z1)) list.push(e); }
      setFactory(list, op.fac);
      notify('toast', list.filter(e => e.fac === op.fac).length + ' buildings now belong to ' + (factoryOf(op.fac)?.name ?? '?'));
      break;
    }
    case 'eat': {
      const food = ITEMS[op.it]?.food;
      if (!food || !invGet(op.it)) break;
      invAdd(op.it, -1); actor.fed = Math.max(actor.fed || 0, S.T) + food; heal(actor, ITEMS[op.it].heal || 0);
      notify('toast', 'well fed: faster walking, mining and healing for ' + Math.round(actor.fed - S.T) + ' s');
      break;
    }
    case 'rotate': if (e) rotateEntity(e, op.by || 1); break;
    case 'setdir': if (e && e.dir !== op.dir) rotateEntity(e, (op.dir - e.dir + 4) % 4); else if (!e) turnPending(op.x, op.y, op.z, op.dir); break;
    case 'craft': if (!queueCraft(op.rid, op.n || 1)) notify('toast', 'missing ingredients for ' + (ITEMS[op.rid]?.name ?? op.rid)); break;
    case 'give': if (S.sandbox && ITEMS[op.it]) invGive(op.it, Math.max(1, Math.min(1000, Math.floor(op.n) || 1))); break;   // sandbox only
    case 'cancel': cancelCraft(op.i); break;
    case 'fast': {   // Ctrl+click on a building or a vehicle, with what is in hand, in a transfer mode or not
      const t = op.veh ? vehicleById(op.veh) : e;
      if (t) { const n = fastTransfer(t, op.sel, op.mode); notify('toast', n ? `${op.sel ? 'put in' : 'took'} ${n} item${n > 1 ? 's' : ''}` : op.sel ? 'it won\'t take that' : 'nothing to take'); }
      break;
    }
    case 'bp': { const err = placeBlueprint(op); if (err && !op.quiet) notify('toast', err); break; }
    case 'bpbuild': buildBlueprint(op.x, op.y, op.z); break;
    case 'bprm': removeBlueprint(op.x, op.y, op.z); break;
    case 'conduit': { const err = layConduit(op.tiles); if (err) notify('toast', err); break; }
    case 'drop': dropAt({ x: op.x, y: op.y, z: op.z }, op.sel); break;
    case 'cmd': if (e) entityCommand(e, op.cmd, op.arg); break;
    case 'paste': {   // settings from the clipboard onto a building or a road (see copypaste.js)
      const r = op.y === 0 && !e ? roadAt(op.x, op.z) : null;
      const done = e ? applyToBuilding(e, op.clip, (t, c, a) => c === 'setdir' ? rotateEntity(t, (a - t.dir + 4) % 4) : entityCommand(t, c, a)) : r ? pasteRoad(r, op.clip) : [];
      notify('toast', done.length ? `Pasted ${done.join(', ')}` : `${op.clip?.from ?? 'that'} has nothing that fits there`);
      break;
    }
    case 'fastmany': {   // Ctrl+click on a selection: the held stack shared out over all of it (or all of them emptied)
      const list = (Array.isArray(op.list) ? op.list : []).slice(0, 256).map(r => r?.veh ? vehicleById(r.veh) : Array.isArray(r) ? world.ents.get(key(r[0], r[1], r[2])) : null).filter(Boolean);
      const n = fastTransferMany(list, op.sel, op.mode);
      notify('toast', n ? `${op.sel ? 'put in' : 'took'} ${n} item${n > 1 ? 's' : ''} across ${list.length}` : op.sel ? 'none of them take that' : 'nothing to take');
      break;
    }
    case 'pastemany': {   // settings onto every selected building they fit
      let hit = 0;
      for (const r of (Array.isArray(op.list) ? op.list : []).slice(0, 256)) {
        const t = Array.isArray(r) && world.ents.get(key(r[0], r[1], r[2])); if (!t) continue;
        if (applyToBuilding(t, op.clip, (b, c, a) => c === 'setdir' ? rotateEntity(b, (a - b.dir + 4) % 4) : entityCommand(b, c, a)).length) hit++;
      }
      notify('toast', hit ? `Pasted ${op.clip?.from ?? 'settings'} onto ${hit} of ${op.list.length}` : `${op.clip?.from ?? 'that'} has nothing that fits these`);
      break;
    }
    case 'move': moveItems(op.from, op.to, op.n); break;
    case 'shift': shiftMove(op.from, op.ent); break;
    case 'research': if (TECH[op.id]) researchAction({ id: op.id, do: ['now', 'queue', 'remove', 'move'].includes(op.do) ? op.do : 'now', by: op.by }); break;
    case 'link': { const msg = linkPoles(op.kind, op.from, op.to); if (msg) notify('toast', msg); break; }
    case 'mark': editMarks(op); break;
    case 'trade': tradeAction(actor, op); break;
    case 'med': medAction({ id: op.id, do: ['now', 'queue', 'remove', 'move'].includes(op.do) ? op.do : 'now', by: op.by }); break;
  }
  return null;
}

// Factories: create, rename, recolour, remove (its buildings go to the first factory), and pick the one you build for.
function factoryAction(op) {
  const F = world.factories, f = factoryOf(op.id), name = String(op.name ?? '').replace(/[<>]/g, '').trim().slice(0, 24);
  switch (op.do) {
    case 'add': {
      if (!isResearched('factory_planning')) { notify('toast', 'research Factory planning to found more factories'); return; }
      if (F.length >= 8) { notify('toast', 'eight factories is the limit'); return; }
      const id = world.facNext++;
      F.push({ id, name: name || 'Factory ' + id, color: FAC_COLORS.find(c => !F.some(x => x.color === c)) ?? FAC_COLORS[id % FAC_COLORS.length] });
      actor.fac = id;
      break;
    }
    case 'rename': if (f && name) f.name = name; break;
    case 'color': if (f && /^#[0-9a-f]{6}$/i.test(op.color || '')) f.color = op.color; break;
    case 'remove': {
      if (!f || F.length < 2) return;
      const to = F.find(x => x.id !== f.id);
      setFactory([...world.ents.values()].filter(e => e.fac === f.id), to.id);
      F.splice(F.indexOf(f), 1);
      for (const p of S.players.values()) if (p.fac === f.id) p.fac = to.id;
      break;
    }
    case 'select': if (f) actor.fac = f.id; return;
    default: return;
  }
  bus.emit('factories');
}

// ---------------------------------------------------------------- hosting
export function host({ onReady, onError }) {
  S.net.role = 'host';
  rekeyLocal('host');
  let tries = 0;
  const attempt = () => {
    const code = makeCode(), peer = new Peer(PREFIX + code, { debug: 0 });
    peer.on('open', () => { if (net.peer === peer) return; net.peer = peer; S.net.code = code; onReady?.(code); bus.emit('players'); });
    peer.on('error', err => {
      // A taken code only matters before the game is up. Later it means the broker still remembers us after a
      // dropped link (common after tabbing out): destroying the peer here would kick every friend and change the code.
      if (err.type === 'unavailable-id' && !net.peer && tries++ < 5) { peer.destroy(); attempt(); return; }
      if (net.peer === peer) return;   // broker trouble after hosting started: friends stay connected, 'disconnected' retries
      if (err.type === 'network' || err.type === 'server-error' || err.type === 'socket-error') bus.emit('toast', 'co-op: trouble reaching the matchmaking server, retrying');
      else onError?.(err.message || String(err.type));
    });
    // The broker link only matters for new friends joining. Reconnect gently, not in a tight loop.
    peer.on('disconnected', () => setTimeout(() => { if (peer.disconnected && !peer.destroyed) try { peer.reconnect(); } catch { /* destroyed meanwhile */ } }, 3000));
    peer.on('connection', conn => {
      conn.on('data', m => onHostMessage(conn, recv(m)));
      conn.on('close', () => dropFriend(conn.peer));
      conn.on('error', () => dropFriend(conn.peer));
    });
  };
  attempt();
}
function rekeyLocal(id) { S.players.delete(S.player.id); S.player.id = id; S.players.set(id, S.player); }
function onHostMessage(conn, m) {
  const c = net.conns.get(conn.peer);
  if (m.t === 'hello') {
    if (c) return;
    let name = cleanName(m.name);
    const taken = new Set([...S.players.values()].map(p => p.name));
    for (let i = 2; taken.has(name); i++) name = cleanName(m.name).slice(0, 13) + ' ' + i;
    const used = new Set([...S.players.values()].map(p => p.color));
    const p = newPlayer(conn.peer, name, COLORS.find(col => !used.has(col)) ?? COLORS[S.players.size % COLORS.length]);
    const back = S.remoteInv?.[name];
    if (back) { p.inv.loadAny(back.inv); p.x = back.x; p.z = back.z; if (back.hp > 0) p.hp = back.hp; }
    else {   // newcomers land next to the host with the same starter kit everyone gets
      p.x = S.player.x + 1.2; p.z = S.player.z + .6;
      for (const [k, v] of Object.entries({ iron_plate: 8, burner_drill: 1, furnace: 1 })) p.inv.add(k, v);
    }
    S.players.set(p.id, p);
    net.conns.set(conn.peer, { conn, p, cache: new Map() });
    send(conn, { t: 'welcome', id: p.id, name, color: p.color, world: serialize(), you: { x: p.x, z: p.z, inv: invToList(p.inv) } });
    systemChat(`${name} joined${back ? ' (welcome back)' : ''}`);
    bus.emit('players');
    return;
  }
  if (!c) return;
  const p = c.p;
  switch (m.t) {
    case 'input':
      p.heard = performance.now();   // trades call it off when this goes quiet (trade.js)
      if (!p.veh) Object.assign(p, { x: m.x, z: m.z });
      Object.assign(p, { face: m.face, walk: m.walk, moving: m.moving, vx: m.vx, vz: m.vz, pickup: !!m.pickup, drive: m.drive && typeof m.drive.t === 'number' ? { t: Math.max(-1, Math.min(1, m.drive.t)), s: Math.max(-1, Math.min(1, m.drive.s || 0)) } : null });
      if (typeof m.fac === 'number' && factoryOf(m.fac)) p.fac = m.fac;
      p.sel = typeof m.sel === 'string' && ITEMS[m.sel] ? m.sel : null;   // what they hold, for anyone looking at them
      p.mineCell = m.mine && typeof m.mine.x === 'number' ? m.mine : null;
      break;
    case 'act': asActor(p, () => applyAction(m.op)); break;
    case 'chat': sendChat(p, m.text); break;
  }
}
function dropFriend(id) {
  const c = net.conns.get(id); if (!c) return;
  net.conns.delete(id);
  const p = c.p;
  (S.remoteInv ||= {})[p.name] = { inv: invToList(p.inv), x: p.x, z: p.z, hp: p.hp };   // their stuff waits for them
  for (const q of p.craft) for (const [k, n] of Object.entries(q.give || {})) p.inv.add(k, n);
  (S.remoteInv[p.name]).inv = invToList(p.inv);
  S.players.delete(id);
  systemChat(`${p.name} left`);
  bus.emit('players');
}
export function rememberFriends() { for (const { p } of net.conns.values()) (S.remoteInv ||= {})[p.name] = { inv: invToList(p.inv), x: p.x, z: p.z }; }

// World changes made on the host are mirrored to everyone.
const op = o => { if (S.net.role === 'host' && net.conns.size && !net.applying) net.ops.push(o); };
bus.on('placed', e => op({ o: 'place', e: entToJSON(e) }));
bus.on('removed', e => op({ o: 'remove', x: e.x, y: e.y, z: e.z, frame: e.kind === 'frame' }));
bus.on('remesh', e => { if (e.kind !== 'frame') op({ o: 'update', e: entToJSON(e) }); });
bus.on('ore', (x, y, z) => op({ o: 'ore', x, y, z }));
bus.on('orelayer', (x, y, z, d) => op({ o: 'orelayer', x, y, z, layer: d.layer, amount: d.amount }));
bus.on('feat', (x, z) => op({ o: 'feat', x, z }));
bus.on('patch', (x, z) => op({ o: 'patch', x, z }));
bus.on('medical', () => op({ o: 'med', med: medToJSON() }));
bus.on('medqueue', () => op({ o: 'med', med: medToJSON() }));
bus.on('research', id => op({ o: 'research', id }));
bus.on('bp', (b, on) => op({ o: 'bp', b: bpOp(b), on }));
bus.on('pulse', e => op({ o: 'pulse', x: e.x, y: e.y, z: e.z }));
bus.on('signal', kind => op({ o: 'signal', kind, sig: signalJSON() }));
bus.on('links', () => op({ o: 'links', links: world.links }));
bus.on('marks', () => op({ o: 'marks', marks: world.marks }));
bus.on('roads', list => op({ o: 'roads', list }));
// News for everyone (a net tearing, say): a toast here and in every friend's browser.
bus.on('announce', text => { bus.emit('toast', text); op({ o: 'announce', text }); });
bus.on('routes', () => op({ o: 'routes', routes: world.routes }));
bus.on('factories', () => op({ o: 'factories', factories: world.factories, facNext: world.facNext }));
// Feedback meant for a friend (their toasts, floating text, pickup sounds) goes to their browser only.
bus.on('remote', (p, ev, args) => { const c = net.conns.get(p.id); if (c) send(c.conn, { t: 'fx', ev, args }); });

const signalJSON = () => ({ ...S.signal, taught: [...S.signal.taught], seen: [...S.signal.seen] });
const playerJSON = p => ({ id: p.id, name: p.name, color: p.color, x: +p.x.toFixed(3), z: +p.z.toFixed(3), face: +(p.face || 0).toFixed(2), walk: +(p.walk || 0).toFixed(2),
  hp: Math.round(p.hp ?? 0), sta: Math.round(p.sta ?? 0), sel: p.sel || null, fac: p.fac ?? 1, fed: p.fed || 0, veh: p.veh || null, expo: p.expo || null,
  moving: !!p.moving, vx: +(p.vx || 0).toFixed(2), vz: +(p.vz || 0).toFixed(2), mining: p.mining ? { prog: +p.mining.prog.toFixed(2), kind: p.mining.kind, tool: p.mining.tool || null, name: p.mining.name, blocked: p.mining.blocked || null } : null,
  mineCell: p.mineCell || null });
function entState(e) { const o = entToJSON(e); o.st = e.status; o.age = Math.min(9, Math.round((S.T - e.lastActive) * 4) / 4); if (e.t !== undefined) o.ph = +e.t.toFixed(3); return o; }
function hostTick(dt) {
  if (!net.conns.size) { net.ops.length = 0; return; }
  if (net.ops.length) { const ops = net.ops.splice(0); for (const { conn } of net.conns.values()) send(conn, { t: 'ops', ops }); }
  if ((net.stateT += dt) < .15) return;
  net.stateT = 0;
  const key0 = (net.keyT += .15) > 3; if (key0) net.keyT = 0;          // every 3 s, a full correction
  const withStats = (net.statsT += .15) > 1; if (withStats) net.statsT = 0;
  const common = {
    t: 'state', players: [...S.players.values()].map(playerJSON),
    ground: world.ground.map(g => [ITEM_IDS.indexOf(g.type), +g.x.toFixed(2), +g.z.toFixed(2)]),
    research: { current: S.research.current, queue: S.research.queue || [], progress: S.research.progress, done: [...S.research.done] }, maxTier: S.maxTier,
    stats: withStats ? S.stats : undefined, med: withStats ? medToJSON() : undefined,
    veh: world.vehicles.map(vehToJSON), units: withStats ? world.units.map(u => unitToJSON(u, false)) : undefined,
    fish: (net.fishT = (net.fishT || 0) + 1) % 3 === 0 ? fishToList() : undefined,
  };
  const states = new Map();
  for (const e of world.ents.values()) states.set(key(e.x, e.y, e.z), entState(e));
  for (const c of net.conns.values()) {
    if (!c.conn.open) continue;
    const ents = [];
    for (const [k, o] of states) {
      const str = JSON.stringify(o), prev = c.cache.get(k);
      if (key0 || str !== prev) { ents.push(o); c.cache.set(k, str); }
    }
    for (const k of c.cache.keys()) if (!states.has(k)) c.cache.delete(k);
    const p = c.p;
    send(c.conn, { ...common, ents, you: { inv: invToList(p.inv), craft: p.craft, mining: p.mining ? { ...p.mining } : null, veh: p.veh, fed: p.fed, hp: Math.round(p.hp), fac: p.fac, expo: p.expo || {}, pend: (p.pending || []).map(q => ({ ...q })), trade: tradeView(p.id) } });
  }
}

// ---------------------------------------------------------------- joining
let onWelcomeCb = null;
export function join(code, name, { onWelcome, onError }) {
  S.net.role = 'client';
  onWelcomeCb = onWelcome;
  const peer = new Peer({ debug: 0 });
  net.peer = peer;
  let done = false;
  const fail = msg => { if (done) return; done = true; S.net.role = 'solo'; try { peer.destroy(); } catch { /* ignore */ } onError?.(msg); };
  const timer = setTimeout(() => fail('Could not reach that game. Check the code, or ask the host to keep their tab open.'), 20000);
  peer.on('open', () => {
    const conn = peer.connect(PREFIX + code.toUpperCase().trim(), { reliable: true });
    net.conn = conn;
    conn.on('open', () => send(conn, { t: 'hello', name: cleanName(name) }));
    conn.on('data', raw => { const m = recv(raw); if (m.t === 'welcome') { done = true; clearTimeout(timer); } onClientMessage(m); });
    conn.on('close', () => { if (done) bus.emit('netlost'); else fail('The host closed the connection.'); });
  });
  peer.on('error', err => fail(err.type === 'peer-unavailable' ? 'No game found with that code.' : 'Connection problem: ' + (err.message || err.type)));
}
function onClientMessage(m) {
  switch (m.t) {
    case 'welcome': {
      S.players.delete(S.player.id);
      Object.assign(S.player, { id: m.id, name: m.name, color: m.color });
      S.players.set(m.id, S.player);
      S.net.hostName = 'host';
      onWelcomeCb?.(JSON.parse(m.world), m.you);
      bus.emit('players');
      break;
    }
    case 'ops': net.applying = true; try { for (const o of m.ops) applyOp(o); } finally { net.applying = false; } break;
    case 'state': applyState(m); break;
    case 'fx': bus.emit(m.ev, ...(m.args || [])); break;
    case 'chat': bus.emit('chat', m); break;
  }
}
function rawRemove(x, y, z, frame) {
  const k = key(x, y, z), map = frame ? world.frames : world.ents, e = map.get(k);
  if (!e) return;
  if (e.foot) { clearFoot(e); map.delete(key(e.x, e.y, e.z)); } else map.delete(k);
  if (e.pair) e.pair.pair = null;
  if (e.belt) world.beltDirty = true;
  world.powerDirty = true;
  bus.emit('removed', e);
}
function applyOp(o) {
  switch (o.o) {
    case 'place': {
      const k = key(o.e.x, o.e.y, o.e.z), ex = o.e.t === 'frame' ? world.frames.get(k) : world.ents.get(k);
      if (ex && ex.type === (o.e.t === 'frame' ? 'frame' : o.e.t)) { applyEntJSON(ex, o.e); break; }
      if (ex) rawRemove(ex.x, ex.y, ex.z, o.e.t === 'frame');
      entFromJSON(o.e);
      break;
    }
    case 'remove': rawRemove(o.x, o.y, o.z, o.frame); break;
    case 'update': { const e = world.ents.get(key(o.e.x, o.e.y, o.e.z)); if (e) applyEntJSON(e, o.e, true); break; }
    case 'ore': if (world.ores.delete(key(o.x, o.y, o.z))) bus.emit('ore', o.x, o.y, o.z); break;
    case 'orelayer': { const k = key(o.x, o.y, o.z), d = world.ores.get(k); world.edits.ores.set(k, [o.layer, o.amount]); if (d) { d.layer = o.layer; d.amount = o.amount; bus.emit('orelayer', o.x, o.y, o.z, d); } break; }
    case 'feat': { const k = key(o.x, 0, o.z), had = world.feats.has(k); removeFeat(k); if (had) bus.emit('feat', o.x, o.z); break; }
    case 'research': if (!S.research.done.has(o.id)) completeResearch(o.id); break;
    case 'bp': applyBpOp(o.b, o.on); break;
    case 'patch': if (patchAt(o.x, o.z)) { clearPatch(o.x, o.z); bus.emit('patch', o.x, o.z); } else world.edits.patches.add(o.x + ',' + o.z); break;
    case 'med': medFromJSON(o.med); bus.emit('medical'); break;
    case 'pulse': bus.emit('pulse', { x: o.x, y: o.y, z: o.z }); break;
    case 'links': world.links = o.links || []; world.powerDirty = true; break;
    case 'marks': world.marks = o.marks; bus.emit('marks'); break;
    case 'roads': applyRoads(o.list); break;
    case 'announce': bus.emit('toast', o.text); break;
    case 'routes': world.routes = o.routes || []; bus.emit('routes'); break;
    case 'factories': world.factories = o.factories; world.facNext = o.facNext; bus.emit('factories'); break;
    case 'signal': {
      const s = o.sig;
      Object.assign(S.signal, s, { taught: new Set(s.taught), seen: new Set(s.seen) });
      bus.emit('signal', o.kind);
      break;
    }
  }
}
function applyState(m) {
  // other engineers
  const seen = new Set([S.player.id]);
  for (const pj of m.players) {
    if (pj.id === S.player.id) continue;
    seen.add(pj.id);
    let p = S.players.get(pj.id);
    if (!p) { p = newPlayer(pj.id, pj.name, pj.color); p.rx = pj.x; p.rz = pj.z; S.players.set(pj.id, p); bus.emit('players'); }
    Object.assign(p, pj);
  }
  for (const id of [...S.players.keys()]) if (!seen.has(id)) { S.players.delete(id); bus.emit('players'); }
  // me
  const you = m.you;
  inv.loadAny(you.inv);
  S.player.craft = you.craft || [];
  S.player.mining = you.mining;
  if (S.player.veh !== (you.veh ?? null)) { S.player.veh = you.veh ?? null; bus.emit('vehicles'); }
  S.player.fed = you.fed || 0;
  if (typeof you.hp === 'number') S.player.hp = you.hp;
  S.player.pending = you.pend || [];
  if (JSON.stringify(S.tradeView ?? null) !== JSON.stringify(you.trade ?? null)) { S.tradeView = you.trade || null; bus.emit('trade'); }
  bus.emit('inv');
  // world
  world.ground = m.ground.map(([i, x, z]) => ({ type: ITEM_IDS[i], x, z }));
  S.research.progress = m.research.progress;
  for (const id of m.research.done) S.research.done.add(id);
  S.research.queue = m.research.queue || (m.research.current ? [m.research.current] : []); S.research.current = m.research.current;
  if (m.maxTier > S.maxTier) { S.maxTier = m.maxTier; bus.emit('tier', m.maxTier); }
  if (m.stats) S.stats = m.stats;
  if (m.med) medFromJSON(m.med);
  S.player.expo = you.expo || {};
  if (m.veh) applyVehicles(m.veh, m.units);
  if (m.fish) fishFromList(m.fish);
  net.applying = true;
  try {
    for (const o of m.ents) {
      const e = world.ents.get(key(o.x, o.y, o.z));
      if (!e || e.type !== o.t) { if (e) rawRemove(e.x, e.y, e.z, false); const n = entFromJSON(o); if (n && typeof n === 'object') applyEntJSON(n, o); }
      else applyEntJSON(e, o);
    }
  } finally { net.applying = false; }
}

// ---------------------------------------------------------------- chat
export function chat(text) {
  text = String(text || '').trim().slice(0, 200); if (!text) return;
  if (S.net.role === 'client') { send(net.conn, { t: 'chat', text }); return; }
  sendChat(S.player, text);
}
function sendChat(p, text) {
  const m = { t: 'chat', name: p.name, color: p.color, text: String(text).slice(0, 200) };
  bus.emit('chat', m);
  for (const { conn } of net.conns.values()) send(conn, m);
}
function systemChat(text) { sendChat({ name: '', color: 0x7d8796 }, text); }

// ---------------------------------------------------------------- per frame
export function netTick(dt) {
  if (S.net.role === 'host') hostTick(dt);
  else if (S.net.role === 'client' && net.conn?.open && (net.inputT += dt) > .066) {
    net.inputT = 0;
    const p = S.player;
    send(net.conn, { t: 'input', x: p.x, z: p.z, face: p.face, walk: p.walk, moving: p.moving, vx: p.vx, vz: p.vz, mine: p.mineCell, pickup: !!p.pickup, drive: p.drive, fac: p.fac, sel: S.sel || null });
  }
}
export function leave() { try { net.peer?.destroy(); } catch { /* ignore */ } }

