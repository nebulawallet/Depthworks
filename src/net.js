// Co-op over WebRTC, peer to peer, so it works from a static site like GitHub Pages.
// PeerJS's free public broker introduces the browsers (and offers free relay servers for strict networks);
// after that, game traffic goes directly between players.
//
// The host's browser owns the world. Friends send inputs and actions; the host runs them with the same
// rules (as that player) and streams back world changes plus regular snapshots. Friends also simulate
// locally between snapshots, so belts and arms keep moving smoothly.
import { Peer } from 'peerjs';
import { S, world, bus, key, newPlayer, asActor, notify, inv } from './state.js';
import { ITEMS, TECH } from './data.js';
import { place, rotateEntity, queueCraft, cancelCraft, fastTransfer, dropAt, entityCommand, techAvailable, canPlace, completeResearch } from './sim.js';
import { serialize, entToJSON, entFromJSON, applyEntJSON } from './save.js';

const PREFIX = 'depthworks-v1-';
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const COLORS = [0xe07a2e, 0x3a9ad8, 0x6ac46a, 0xd84a8a, 0xb07ad8, 0xe0c03a, 0x3ac4b8, 0xd8483a];
const ITEM_IDS = Object.keys(ITEMS);
const net = { peer: null, conns: new Map(), conn: null, ops: [], applying: false, stateT: 0, inputT: 0, keyT: 0, statsT: 0 };
export const netInfo = () => ({ role: S.net.role, code: S.net.code, players: [...S.players.values()].map(p => ({ id: p.id, name: p.name, color: p.color, local: p.local })) });

const makeCode = () => Array.from({ length: 6 }, () => ALPHABET[Math.floor(Math.random() * ALPHABET.length)]).join('');
export const cleanName = n => (String(n || '').replace(/[^\p{L}\p{N} _\-.]/gu, '').trim().slice(0, 16)) || 'Engineer';
const invToList = m => [...m].filter(([, v]) => v > 0);

// ---------------------------------------------------------------- actions (same entry point for everyone)
// Solo and host apply immediately; a friend's browser forwards to the host.
export function doAction(op) {
  if (S.net.role === 'client') { net.conn?.open && net.conn.send({ t: 'act', op }); return null; }
  return applyAction(op);
}
function applyAction(op) {
  const e = op.x !== undefined ? world.ents.get(key(op.x, op.y, op.z)) : null;
  switch (op.a) {
    case 'place': {
      const err = canPlace(op.type, op.x, op.y, op.z, op.dir, op.dy, { reach: true });
      if (err) { notify('toast', err); return null; }
      return place(op.type, op.x, op.y, op.z, op.dir, op.dy);
    }
    case 'rotate': if (e) rotateEntity(e, op.by || 1); break;
    case 'setdir': if (e && e.dir !== op.dir) rotateEntity(e, (op.dir - e.dir + 4) % 4); break;
    case 'craft': if (!queueCraft(op.rid, op.n || 1)) notify('toast', 'missing ingredients for ' + (ITEMS[op.rid]?.name ?? op.rid)); break;
    case 'cancel': cancelCraft(op.i); break;
    case 'fast': if (e) { const n = fastTransfer(e, op.sel); notify('toast', n ? `${op.sel ? 'put in' : 'took'} ${n} item${n > 1 ? 's' : ''}` : 'nothing to move'); } break;
    case 'drop': dropAt({ x: op.x, y: op.y, z: op.z }, op.sel); break;
    case 'cmd': if (e) entityCommand(e, op.cmd, op.arg); break;
    case 'research': { const t = TECH[op.id]; if (t && !S.research.done.has(op.id) && techAvailable(t)) S.research.current = op.id; break; }
  }
  return null;
}

// ---------------------------------------------------------------- hosting
export function host({ onReady, onError }) {
  S.net.role = 'host';
  rekeyLocal('host');
  let tries = 0;
  const attempt = () => {
    const code = makeCode(), peer = new Peer(PREFIX + code, { debug: 0 });
    peer.on('open', () => { net.peer = peer; S.net.code = code; onReady?.(code); bus.emit('players'); });
    peer.on('error', err => {
      if (err.type === 'unavailable-id' && tries++ < 5) { peer.destroy(); attempt(); return; }
      if (err.type === 'network' || err.type === 'server-error' || err.type === 'socket-error') bus.emit('toast', 'co-op: trouble reaching the matchmaking server, retrying');
      else if (!net.peer) onError?.(err.message || String(err.type));
    });
    peer.on('disconnected', () => { try { peer.reconnect(); } catch { /* already destroyed */ } });
    peer.on('connection', conn => {
      conn.on('data', m => onHostMessage(conn, m));
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
    if (back) { for (const [k, v] of back.inv) p.inv.set(k, v); p.x = back.x; p.z = back.z; }
    else {   // newcomers land next to the host with the same starter kit everyone gets
      p.x = S.player.x + 1.2; p.z = S.player.z + .6;
      for (const [k, v] of Object.entries({ iron_plate: 8, burner_drill: 1, furnace: 1 })) p.inv.set(k, v);
    }
    S.players.set(p.id, p);
    net.conns.set(conn.peer, { conn, p, cache: new Map() });
    conn.send({ t: 'welcome', id: p.id, name, color: p.color, world: serialize(), you: { x: p.x, z: p.z, inv: invToList(p.inv) } });
    systemChat(`${name} joined${back ? ' (welcome back)' : ''}`);
    bus.emit('players');
    return;
  }
  if (!c) return;
  const p = c.p;
  switch (m.t) {
    case 'input':
      Object.assign(p, { x: m.x, z: m.z, face: m.face, walk: m.walk, moving: m.moving, vx: m.vx, vz: m.vz, pickup: !!m.pickup });
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
  (S.remoteInv ||= {})[p.name] = { inv: invToList(p.inv), x: p.x, z: p.z };   // their stuff waits for them
  for (const q of p.craft) for (const [k, n] of Object.entries(q.give || {})) p.inv.set(k, (p.inv.get(k) || 0) + n);
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
bus.on('feat', (x, z) => op({ o: 'feat', x, z }));
bus.on('research', id => op({ o: 'research', id }));
bus.on('pulse', e => op({ o: 'pulse', x: e.x, y: e.y, z: e.z }));
bus.on('signal', kind => op({ o: 'signal', kind, sig: signalJSON() }));
// Feedback meant for a friend (their toasts, floating text, pickup sounds) goes to their browser only.
bus.on('remote', (p, ev, args) => { const c = net.conns.get(p.id); if (c?.conn.open) c.conn.send({ t: 'fx', ev, args }); });

const signalJSON = () => ({ ...S.signal, taught: [...S.signal.taught], seen: [...S.signal.seen] });
const playerJSON = p => ({ id: p.id, name: p.name, color: p.color, x: +p.x.toFixed(3), z: +p.z.toFixed(3), face: +(p.face || 0).toFixed(2), walk: +(p.walk || 0).toFixed(2),
  moving: !!p.moving, vx: +(p.vx || 0).toFixed(2), vz: +(p.vz || 0).toFixed(2), mining: p.mining ? { prog: +p.mining.prog.toFixed(2), kind: p.mining.kind, name: p.mining.name, blocked: p.mining.blocked || null } : null,
  mineCell: p.mineCell || null });
function entState(e) { const o = entToJSON(e); o.st = e.status; o.age = Math.min(9, Math.round((S.T - e.lastActive) * 4) / 4); if (e.t !== undefined) o.ph = +e.t.toFixed(3); return o; }
function hostTick(dt) {
  if (!net.conns.size) { net.ops.length = 0; return; }
  if (net.ops.length) { const ops = net.ops.splice(0); for (const { conn } of net.conns.values()) if (conn.open) conn.send({ t: 'ops', ops }); }
  if ((net.stateT += dt) < .15) return;
  net.stateT = 0;
  const key0 = (net.keyT += .15) > 3; if (key0) net.keyT = 0;          // every 3 s, a full correction
  const withStats = (net.statsT += .15) > 1; if (withStats) net.statsT = 0;
  const common = {
    t: 'state', players: [...S.players.values()].map(playerJSON),
    ground: world.ground.map(g => [ITEM_IDS.indexOf(g.type), +g.x.toFixed(2), +g.z.toFixed(2)]),
    research: { current: S.research.current, progress: S.research.progress, done: [...S.research.done] }, maxTier: S.maxTier,
    stats: withStats ? S.stats : undefined,
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
    c.conn.send({ ...common, ents, you: { inv: invToList(p.inv), craft: p.craft, mining: p.mining ? { ...p.mining } : null } });
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
    conn.on('open', () => conn.send({ t: 'hello', name: cleanName(name) }));
    conn.on('data', m => { if (m.t === 'welcome') { done = true; clearTimeout(timer); } onClientMessage(m); });
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
  map.delete(k);
  if (e.pair) e.pair.pair = null;
  if (e.items) world.beltDirty = true;
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
    case 'feat': if (world.feats.delete(key(o.x, 0, o.z))) bus.emit('feat', o.x, o.z); break;
    case 'research': if (!S.research.done.has(o.id)) completeResearch(o.id); break;
    case 'pulse': bus.emit('pulse', { x: o.x, y: o.y, z: o.z }); break;
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
  inv.clear(); for (const [k, v] of you.inv) inv.set(k, v);
  S.player.craft = you.craft || [];
  S.player.mining = you.mining;
  bus.emit('inv');
  // world
  world.ground = m.ground.map(([i, x, z]) => ({ type: ITEM_IDS[i], x, z }));
  S.research.current = m.research.current; S.research.progress = m.research.progress;
  for (const id of m.research.done) S.research.done.add(id);
  if (m.maxTier > S.maxTier) { S.maxTier = m.maxTier; bus.emit('tier', m.maxTier); }
  if (m.stats) S.stats = m.stats;
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
  if (S.net.role === 'client') { net.conn?.open && net.conn.send({ t: 'chat', text }); return; }
  sendChat(S.player, text);
}
function sendChat(p, text) {
  const m = { t: 'chat', name: p.name, color: p.color, text: String(text).slice(0, 200) };
  bus.emit('chat', m);
  for (const { conn } of net.conns.values()) if (conn.open) conn.send(m);
}
function systemChat(text) { sendChat({ name: '', color: 0x7d8796 }, text); }

// ---------------------------------------------------------------- per frame
export function netTick(dt) {
  if (S.net.role === 'host') hostTick(dt);
  else if (S.net.role === 'client' && net.conn?.open && (net.inputT += dt) > .066) {
    net.inputT = 0;
    const p = S.player;
    net.conn.send({ t: 'input', x: p.x, z: p.z, face: p.face, walk: p.walk, moving: p.moving, vx: p.vx, vz: p.vz, mine: p.mineCell, pickup: !!p.pickup });
  }
}
export function leave() { try { net.peer?.destroy(); } catch { /* ignore */ } }
