// Trading between engineers (co-op). Clicking another engineer opens a trade with them. Each side puts items from
// their inventory into their own offer; both see both offers as they change. Nothing moves until the end: an offer is
// only a promise, the items stay in their owner's inventory, so cancelling (or walking away, or leaving the game)
// leaves everything exactly as it was.
//
// Against last-second swaps: any change to either offer clears both accepts and restarts a short wait (TRADE.wait), and
// Accept only works once the wait is over. When both have accepted, the host checks both inventories at that moment
// (each still holds what it offers, each has room for what it gets, counting what it gives away) and swaps everything
// in one step, or changes nothing at all and says why. The host decides; guests see the trade in their snapshots.
import { TRADE, ITEMS } from './data.js';
import { S, Inventory, asActor, notify, bus } from './state.js';

S.trades = new Map();   // host: id -> { id, a, b, offer: { [player id]: { item: n } }, ok: { [player id]: bool }, t0 }
let nextTrade = 1;
const isClient = () => S.net.role === 'client';
const tell = (p, msg) => { if (p) asActor(p, () => notify('toast', msg)); };
export const tradeOf = pid => { for (const t of S.trades.values()) if (t.a === pid || t.b === pid) return t; return null; };
const otherOf = (t, pid) => t.a === pid ? t.b : t.a;
const near = (p, q) => Math.hypot(p.x - q.x, p.z - q.z) <= TRADE.reach;
const changed = t => { t.t0 = S.T; t.ok = { [t.a]: false, [t.b]: false }; bus.emit('trade'); };
function end(t, msg) {
  S.trades.delete(t.id);
  for (const pid of [t.a, t.b]) tell(S.players.get(pid), msg);
  bus.emit('trade');
}

// The acting engineer's trade requests (run on the host, as them). op.do: 'open' (with: player id), 'add' (it, n: put
// that many more into the offer), 'set' (it, n: offer exactly n, 0 takes it out), 'accept' (on), 'cancel'.
export function tradeAction(me, op) {
  const pid = me.id;
  if (op.do === 'open') {
    const other = S.players.get(op.with);
    if (!other || other === me) return;
    if (tradeOf(pid)) { tell(me, 'finish the trade you are in first'); return; }
    if (tradeOf(other.id)) { tell(me, `${other.name} is trading with someone else`); return; }
    if (!near(me, other)) { tell(me, `walk closer to ${other.name} to trade (${TRADE.reach} tiles)`); return; }
    const t = { id: nextTrade++, a: pid, b: other.id, offer: { [pid]: {}, [other.id]: {} }, ok: {}, t0: S.T };
    changed(t); S.trades.set(t.id, t);
    tell(other, `${me.name} wants to trade`);
    bus.emit('trade');
    return;
  }
  const t = tradeOf(pid); if (!t) return;
  if (op.do === 'cancel') { end(t, `${me.name} cancelled the trade: nothing changed hands`); return; }
  if (op.do === 'add' || op.do === 'set') {
    if (!ITEMS[op.it]) return;
    const mine = t.offer[pid], have = me.inv.count(op.it);
    const want = Math.max(0, Math.min(have, Math.floor(op.do === 'add' ? (mine[op.it] || 0) + (+op.n || 0) : +op.n || 0)));
    if ((mine[op.it] || 0) === want) return;
    if (want) mine[op.it] = want; else delete mine[op.it];
    changed(t);
    return;
  }
  if (op.do === 'accept') {
    if (op.on && S.T - t.t0 < TRADE.wait) { tell(me, 'wait for the timer: offers just changed'); return; }
    t.ok[pid] = !!op.on;
    bus.emit('trade');
  }
}

// Both inventories as they would be after the swap, or why it can't happen. Works on copies: nothing real changes here.
function settle(t) {
  const A = S.players.get(t.a), B = S.players.get(t.b), out = new Map();
  for (const [p, q] of [[A, B], [B, A]]) {
    const give = t.offer[p.id], get = t.offer[q.id], inv = new Inventory(p.inv.slots.length);
    inv.loadList(p.inv.toList());
    for (const [it, n] of Object.entries(give)) if (inv.remove(it, n) < n) return { err: `${p.name} no longer has ${n} ${ITEMS[it].name.toLowerCase()}` };
    for (const [it, n] of Object.entries(get)) if (inv.add(it, n) > 0) return { err: `${p.name} has no room for ${n} ${ITEMS[it].name.toLowerCase()}` };
    out.set(p, inv);
  }
  return { out };
}
function complete(t) {
  const r = settle(t);
  if (r.err) { changed(t); for (const pid of [t.a, t.b]) tell(S.players.get(pid), `Trade not done: ${r.err}. Accept again once it's fixed.`); return; }
  for (const [p, inv] of r.out) { p.inv.loadList(inv.toList()); if (p.local) bus.emit('inv'); }
  end(t, 'Trade done.');
}
// Host: trades end when someone leaves or walks off; they complete once both have accepted after the wait.
export function tradeTick() {
  if (isClient()) return;
  for (const t of [...S.trades.values()]) {
    const A = S.players.get(t.a), B = S.players.get(t.b);
    const gone = p => !p || (!p.local && p.heard && performance.now() - p.heard > TRADE.quiet * 1000);
    if (gone(A) || gone(B)) { end(t, 'The other engineer left: the trade is off, nothing changed hands'); continue; }
    if (!near(A, B)) { end(t, 'You walked too far apart: the trade is off, nothing changed hands'); continue; }
    if (t.ok[t.a] && t.ok[t.b] && S.T - t.t0 >= TRADE.wait) complete(t);
  }
}

// What one engineer sees of their trade (the host sends this to each guest in their snapshot).
export function tradeView(pid) {
  const t = tradeOf(pid); if (!t) return null;
  const o = otherOf(t, pid), q = S.players.get(o);
  return { id: t.id, with: o, name: q?.name ?? '?', mine: t.offer[pid], theirs: t.offer[o], okMe: !!t.ok[pid], okThem: !!t.ok[o], wait: Math.max(0, TRADE.wait - (S.T - t.t0)) };
}
// This screen's trade: worked out here on the host (or solo), from the last snapshot on a guest.
export const myTrade = () => isClient() ? S.tradeView || null : tradeView(S.player.id);
export const offerList = o => Object.entries(o || {}).filter(([, n]) => n > 0).sort((a, b) => a[0].localeCompare(b[0]));
