// Key bindings. Every action has one or more key codes (KeyboardEvent.code). Defaults follow Factorio's
// layout; anything the player rebinds is kept in localStorage. Number keys 1-0 always pick quickbar slots.
const STORE = 'depthworks.keys';
export const ACTIONS = [
  ['up', 'Walk up', ['KeyW', 'ArrowUp']], ['down', 'Walk down', ['KeyS', 'ArrowDown']],
  ['left', 'Walk left', ['KeyA', 'ArrowLeft']], ['right', 'Walk right', ['KeyD', 'ArrowRight']],
  ['inventory', 'Inventory and crafting', ['KeyE', 'KeyI']], ['research', 'Research', ['KeyT']],
  ['map', 'Map', ['KeyM']], ['cycleBar', 'Next quickbar', ['KeyX']], ['hideUI', 'Hide interface', ['KeyH']],
  ['rotate', 'Rotate', ['KeyR']], ['pipette', 'Copy hovered building', ['KeyQ']], ['drop', 'Drop one item', ['KeyZ']],
  ['pickup', 'Pick up from the ground', ['KeyF']], ['altMode', 'Recipe icons and arrows', ['AltLeft', 'AltRight']],
  ['signal', 'Signal panel', ['KeyG']], ['help', 'Menu (also Esc)', ['F1']], ['chat', 'Chat', ['Enter', 'NumpadEnter']],
  ['depthMode', 'Depth mode', ['Tab']], ['layerUp', 'Layer up', ['PageUp']], ['layerDown', 'Layer down', ['PageDown']],
  ['orbitLeft', 'Orbit left', ['BracketLeft']], ['orbitRight', 'Orbit right', ['BracketRight']], ['pitch', 'Inserter pitch / lift direction', ['KeyV']],
  ['board', 'Get in or out of a vehicle', ['KeyB']], ['logistics', 'Routes for trains, trucks and boats', ['KeyL']],
  ['factories', 'Factories', ['KeyK']], ['nextFactory', 'Next factory to build for', ['KeyJ']],
];
const DEFAULTS = Object.fromEntries(ACTIONS.map(([id, , keys]) => [id, keys]));
let binds = load();
function load() {
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(STORE) || '{}') || {}; } catch { /* storage unavailable */ }
  const b = {};
  for (const [id, keys] of Object.entries(DEFAULTS)) b[id] = Array.isArray(saved[id]) ? saved[id].filter(k => typeof k === 'string') : [...keys];
  return b;
}
const store = () => { try { localStorage.setItem(STORE, JSON.stringify(binds)); } catch { /* storage unavailable */ } };

export const is = (action, code) => !!binds[action]?.includes(code);
export const isDown = (action, keys) => !!binds[action]?.some(c => keys.has(c));
// The new key replaces the action's main key and is taken away from any other action that used it.
export function rebind(action, code) {
  if (!binds[action] || /^Digit/.test(code) || code === 'Escape') return false;
  for (const a of Object.keys(binds)) binds[a] = binds[a].filter(c => c !== code);
  binds[action] = [code, ...binds[action].slice(1)];
  store(); return true;
}
export function resetKeys() { binds = Object.fromEntries(Object.entries(DEFAULTS).map(([id, k]) => [id, [...k]])); store(); }
const NAMES = { ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', BracketLeft: '[', BracketRight: ']', PageUp: 'PgUp', PageDown: 'PgDn',
  AltLeft: 'Alt', AltRight: 'Alt Gr', NumpadEnter: 'Num Enter', Backquote: '`', Minus: '-', Equal: '=', Semicolon: ';', Quote: "'", Comma: ',', Period: '.', Slash: '/', Backslash: '\\', Space: 'Space' };
export const codeName = c => !c ? '—' : NAMES[c] ?? c.replace(/^Key/, '').replace(/^Digit/, '').replace(/^Numpad/, 'Num ').replace(/(Left|Right)$/, '');
export const keyName = action => codeName(binds[action]?.[0]);
export const keyNames = action => (binds[action] || []).map(codeName);
