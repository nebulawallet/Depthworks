// Procedural 16x16 pixel icons for every item, drawn once and cached.
import { ITEMS, ENTITIES } from './data.js';
import { hash01 } from './state.js';

const cache = {};
const hex = (c, k = 1) => {
  const r = Math.min(255, ((c >> 16) & 255) * k), g = Math.min(255, ((c >> 8) & 255) * k), b = Math.min(255, (c & 255) * k);
  return `rgb(${r | 0},${g | 0},${b | 0})`;
};

export function iconCanvas(id) {
  if (cache[id]) return cache[id];
  const c = document.createElement('canvas'); c.width = c.height = 16;
  const g = c.getContext('2d', { willReadFrequently: true }), it = ITEMS[id] || { color: 0xff00ff, shape: 'ore' }, col = it.color;
  const px = (x, y, k = 1, w = 1, h = 1, cc = col) => { g.fillStyle = typeof k === 'string' ? k : hex(cc, k); g.fillRect(x, y, w, h); };
  switch (it.shape) {
    case 'ore': {
      for (let y = 3; y < 14; y++) for (let x = 2; x < 14; x++) {
        const d = Math.hypot(x - 7.5, (y - 8.5) * 1.2);
        if (d < 5.6 + hash01(id + x + 'r' + y) * .8) px(x, y, .7 + hash01(id + x * 3 + y) * .6 - (y > 10 ? .2 : 0));
      }
      px(5, 5, 1.5); px(9, 7, 1.4);
      break;
    }
    case 'crystal': for (let y = 1; y < 15; y++) { const w = y < 8 ? y - 1 : 15 - y; px(8 - (w >> 1), y, y < 8 ? 1.3 : .8, Math.max(1, w), 1); } px(7, 4, '#ffffff'); break;
    case 'plate': for (let y = 0; y < 6; y++) px(2 + y, 5 + y, 1 - y * .05, 9, 1); px(2, 5, 1.3, 9, 1); px(7, 11, .6, 9, 1); break;
    case 'wood': for (let i = 0; i < 3; i++) { const y = 3 + i * 4; px(2, y, 1, 12, 3); px(2, y, 1.3, 12, 1); px(1, y, .6, 2, 3); px(1, y + 1, '#d8b27a', 1, 1); } break;
    case 'brick': px(2, 5, 1, 12, 7); px(2, 8, .6, 12, 1); px(7, 5, .6, 1, 3); px(5, 9, .6, 1, 3); px(10, 9, .6, 1, 3); px(2, 5, 1.2, 12, 1); break;
    case 'lens': for (let y = 2; y < 14; y++) for (let x = 2; x < 14; x++) { const d = Math.hypot(x - 7.5, y - 7.5); if (d < 6) px(x, y, d < 4 ? 1.1 : .75); } px(5, 5, '#ffffff', 2, 2); break;
    case 'gear': for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
        const d = Math.hypot(x - 7.5, y - 7.5), a = Math.atan2(y - 7.5, x - 7.5), tooth = Math.cos(a * 8) > .2;
        if ((d < 5 || (tooth && d < 7)) && d > 2) px(x, y, d < 4 ? 1.1 : .85);
      } break;
    case 'cable': for (let i = 0; i < 4; i++) { px(3, 3 + i * 3, 1, 10, 2); px(3, 4 + i * 3, .6, 10, 1); } break;
    case 'chip': px(3, 3, 1, 10, 10); px(5, 5, .5, 6, 6); for (let i = 0; i < 4; i++) { px(1, 4 + i * 2, '#c0c4c8', 2, 1); px(13, 4 + i * 2, '#c0c4c8', 2, 1); } px(6, 6, 1.5, 2, 2); break;
    case 'coil': px(4, 2, .8, 8, 12); for (let y = 3; y < 13; y += 2) px(4, y, 1.25, 8, 1); px(3, 2, '#5b4a10', 10, 1); px(3, 13, '#5b4a10', 10, 1); break;
    case 'pack': px(6, 1, '#c8d0da', 4, 3); px(5, 4, '#c8d0da', 6, 2); for (let y = 6; y < 15; y++) { const w = Math.min(12, 6 + (y - 6) * 2); px(8 - w / 2, y, y < 9 ? 1.25 : 1, w, 1); } px(6, 9, '#ffffff'); break;
    case 'machine': drawMachine(px, it.entity, col); break;
  }
  // dark rim for legibility
  const img = g.getImageData(0, 0, 16, 16), d = img.data, o = new Uint8ClampedArray(d);
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const i = (y * 16 + x) * 4; if (d[i + 3]) continue;
    const near = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([a, b]) => { const X = x + a, Y = y + b; return X >= 0 && Y >= 0 && X < 16 && Y < 16 && d[(Y * 16 + X) * 4 + 3] > 0; });
    if (near) { o[i] = 12; o[i + 1] = 14; o[i + 2] = 19; o[i + 3] = 200; }
  }
  g.putImageData(new ImageData(o, 16, 16), 0, 0);
  cache[id] = c; return c;
}

function drawMachine(px, ent, col) {
  const kind = ENTITIES[ent].kind;
  switch (kind) {
    case 'belt': px(1, 3, '#2b2f36', 14, 10); for (let i = 0; i < 3; i++) { px(4 + i * 3, 5, 1, 2, 1); px(5 + i * 3, 6, 1, 2, 1); px(6 + i * 3, 7, 1, 2, 2); px(5 + i * 3, 9, 1, 2, 1); px(4 + i * 3, 10, 1, 2, 1); } px(1, 3, .7, 14, 1); px(1, 12, .7, 14, 1); break;
    case 'underground': px(1, 4, '#2b2f36', 7, 8); px(8, 2, 1, 7, 12); px(9, 4, '#111', 5, 8); px(2, 7, 1, 5, 2); px(5, 6, 1, 1, 4); break;
    case 'splitter': px(1, 6, '#2b2f36', 6, 4); px(6, 2, 1, 4, 12); px(10, 1, '#2b2f36', 5, 4); px(10, 11, '#2b2f36', 5, 4); px(10, 6, '#2b2f36', 5, 4); break;
    case 'lift': for (let i = 0; i < 6; i++) px(2 + i * 2, 12 - i * 2, 1, 3, 2); px(7, 1, '#ffffff', 2, 5); px(6, 2, '#ffffff', 4, 1); break;
    case 'inserter': px(4, 12, '#34373e', 8, 3); px(7, 6, 1, 2, 6); px(7, 5, 1, 6, 2); px(12, 4, '#34373e', 3, 4); px(6, 10, .7, 4, 2); break;
    case 'drill': px(2, 4, 1, 12, 9); px(6, 13, '#d8b24a', 4, 2); px(7, 15, '#d8b24a', 2, 1); px(4, 1, '#8c8f96', 8, 3); px(2, 4, 1.3, 12, 1); break;
    case 'furnace': px(3, 3, 1, 10, 12); px(3, 3, 1.25, 10, 1); px(6, 9, '#ff7a2a', 4, 3); px(7, 10, '#ffd23f', 2, 2); px(10, 0, '#4a4440', 2, 3); break;
    case 'assembler': px(1, 4, 1, 14, 10); px(1, 4, 1.3, 14, 1); for (let a = 0; a < 8; a++) px(8 + Math.round(Math.cos(a * .785) * 3) - 1, 9 + Math.round(Math.sin(a * .785) * 3) - 1, '#c0c6cf', 2, 2); px(7, 8, '#222', 2, 2); break;
    case 'lab': px(2, 9, '#4b4f5a', 12, 6); for (let y = 2; y < 10; y++) for (let x = 3; x < 13; x++) if (Math.hypot(x - 7.5, y - 9) < 6) px(x, y, '#58c8d8'); px(5, 4, '#ffffff'); break;
    case 'chest': px(2, 4, 1, 12, 10); px(2, 7, .7, 12, 1); px(7, 7, '#e8d48a', 2, 3); px(2, 4, 1.25, 12, 1); break;
    case 'frame': px(2, 2, 1, 12, 2); px(2, 2, 1, 2, 12); px(12, 2, 1, 2, 12); px(2, 12, .7, 12, 2); px(4, 4, .5, 1, 8); px(4, 4, .5, 8, 1); break;
    case 'pole': px(7, 2, 1, 2, 13); px(3, 3, 1, 10, 2); px(3, 2, '#c8d0da', 2, 1); px(11, 2, '#c8d0da', 2, 1); px(6, 14, .6, 4, 1); break;
    case 'generator': px(1, 6, 1, 14, 8); for (let y = 2; y < 9; y++) for (let x = 3; x < 13; x++) if (Math.hypot(x - 7.5, (y - 5.5) * 1.6) < 5) px(x, y, '#8a6a4a'); px(7, 8, '#ffe14a', 2, 4); px(6, 10, '#ffe14a', 2, 1); break;
    case 'solar': for (let y = 0; y < 3; y++) for (let x = 0; x < 3; x++) px(2 + x * 4, 3 + y * 4, 1.4, 3, 3); px(1, 14, '#888', 14, 1); break;
    case 'transmitter': for (let x = 2; x < 14; x++) { const y = 3 + Math.round(Math.pow((x - 7.5) / 6, 2) * 4); px(x, y, '#cfd6df', 1, 2); } px(7, 6, '#9aa1ad', 2, 7); px(4, 13, 1, 8, 2); px(7, 2, '#7ef6ff', 2, 2); break;
  }
}

export function iconURL(id) { const c = iconCanvas(id); return c._url ||= c.toDataURL(); }
export function iconHTML(id, n, cls = '') {
  return `<span class="icon ${cls}" title="${ITEMS[id]?.name ?? id}"><img src="${iconURL(id)}" alt="">${n !== undefined && n !== null && n !== '' ? `<b>${fmtN(n)}</b>` : ''}</span>`;
}
export function fmtN(n) { return n >= 10000 ? Math.round(n / 1000) + 'k' : n >= 1000 ? (n / 1000).toFixed(1) + 'k' : String(Math.floor(n)); }
