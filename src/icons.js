// Procedural 16x16 pixel icons for every item, drawn once and cached.
import { ITEMS, ENTITIES, FLUIDS, VEHICLES, ANIMALS } from './data.js';
import { hash01 } from './state.js';

const cache = {};
const hex = (c, k = 1) => {
  const r = Math.min(255, ((c >> 16) & 255) * k), g = Math.min(255, ((c >> 8) & 255) * k), b = Math.min(255, (c & 255) * k);
  return `rgb(${r | 0},${g | 0},${b | 0})`;
};

export function iconCanvas(id) {
  if (cache[id]) return cache[id];
  const c = document.createElement('canvas'); c.width = c.height = 16;
  const g = c.getContext('2d', { willReadFrequently: true }), it = ITEMS[id] || (FLUIDS[id] ? { color: FLUIDS[id].color, shape: 'fluid' } : ANIMALS[id] ? { color: ANIMALS[id].look.wool ?? ANIMALS[id].look.col, shape: 'animal' } : { color: 0x7d8796, shape: 'crate' }), col = it.color;   // unknown ids get a plain crate, not a glaring placeholder
  const px = (x, y, k = 1, w = 1, h = 1, cc = col) => { g.fillStyle = typeof k === 'string' ? k : hex(cc, k); g.fillRect(x, y, w, h); };
  switch (it.shape) {
    case 'ore': {
      if (it.mineFluid) {   // uranium: dark rock shot through with glowing green crystals
        for (let y = 3; y < 14; y++) for (let x = 2; x < 14; x++) {
          const d = Math.hypot(x - 7.5, (y - 8.5) * 1.2);
          if (d < 5.6 + hash01(id + x + 'r' + y) * .8) px(x, y, y > 10 ? '#2e3a2c' : '#465244');
        }
        for (const [x, y] of [[4, 6], [8, 4], [10, 8], [6, 10], [9, 11]]) { px(x, y, 1, 2, 2); px(x, y, 1.6, 1, 1); }
        px(7, 7, '#e8ffd8');
        break;
      }
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
    case 'crate': px(3, 4, 1, 10, 10); px(3, 4, 1.3, 10, 1); px(3, 8, .7, 10, 1); px(7, 4, .7, 1, 10); break;
    case 'fluid': for (let y = 2; y < 15; y++) for (let x = 2; x < 14; x++) { const d = y < 8 ? Math.abs(x - 7.5) * 2.2 - (y - 2) : Math.hypot(x - 7.5, y - 9.5) * 1.6 - 6; if (d < 0) px(x, y, y < 9 ? 1.25 : .9); } px(5, 9, '#ffffff', 1, 2); break;
    case 'barrel': {
      const f = it.barrel ? FLUIDS[it.barrel].color : null;
      px(4, 2, '#8a96a6', 8, 13); px(4, 2, '#b8c0ca', 8, 1); px(4, 14, '#5c6470', 8, 1); px(4, 6, '#5c6470', 8, 1); px(4, 10, '#5c6470', 8, 1);
      if (f) { px(5, 7, 1, 6, 3, f); px(5, 7, 1.3, 6, 1, f); }
      break;
    }
    case 'engine': px(2, 5, '#5c6470', 11, 8); px(3, 3, 1, 9, 3); for (let x = 3; x < 12; x += 2) px(x, 6, '#2c3038', 1, 6); px(12, 7, '#939ca8', 3, 4); px(1, 12, '#2c3038', 13, 2); px(4, 4, 1.35, 7, 1); break;
    case 'vehicle': drawVehicle(px, VEHICLES[id]?.frame, col); break;
    case 'part': px(2, 6, 1, 12, 5); px(2, 6, 1.3, 12, 1); px(3, 11, '#2c3038', 3, 3); px(10, 11, '#2c3038', 3, 3); px(6, 4, .8, 4, 2); break;
    case 'wheel': for (let y = 1; y < 15; y++) for (let x = 1; x < 15; x++) { const d = Math.hypot(x - 7.5, y - 7.5); if (d < 6.5) px(x, y, d > 4.5 ? 1 : d > 2 ? '#8a929c' : '#c3cad3'); } break;
    case 'hull': for (let y = 6; y < 13; y++) { const w = 14 - (y - 6) * 1.2; px(8 - w / 2, y, y === 6 ? 1.3 : 1, w, 1); } px(6, 3, '#e0e4ea', 4, 3); break;
    case 'signal': px(7, 5, '#2c3038', 2, 11); px(5, 1, '#16181d', 6, 6); px(6, 2, '#ff4a3a', 4, 2); px(6, 4, '#3aff5a', 4, 2); break;
    case 'net': for (let y = 2; y < 14; y++) for (let x = 2; x < 14; x++) if ((x + y) % 3 === 0 || (x - y + 30) % 3 === 0) px(x, y, (x + y) % 2 ? 1 : .8); break;
    case 'fish': for (let y = 4; y < 12; y++) for (let x = 2; x < 12; x++) if (Math.hypot((x - 7) / 1.6, y - 8) < 3.2) px(x, y, y < 7 ? 1.25 : 1); px(11, 5, 1, 2, 6); px(13, 4, .8, 2, 8); px(4, 7, '#16181d'); break;
    case 'aug': {   // a module: a framed core in its colour, one pip per tier
      px(2, 2, '#2c3038', 12, 12); px(3, 3, 1, 10, 10); px(3, 3, 1.3, 10, 1); px(5, 4, '#16181d', 6, 6); px(6, 5, 1.45, 4, 4);
      for (let i = 0; i < (it.tier || 1); i++) px(4 + i * 2, 12, '#f2f2f2', 1, 1);
      break;
    }
    case 'seed': for (const [x, y] of [[4, 6], [8, 4], [10, 9], [5, 11], [8, 10], [11, 5]]) { px(x, y, 1, 3, 2); px(x, y, 1.35, 1, 1); px(x + 2, y + 1, .65, 1, 1); } break;
    case 'crop': {   // a bunch: stalks with a head in the crop's colour
      for (const x of [5, 8, 11]) px(x, 6, '#4a7a3a', 1, 9);
      for (const [x, y] of [[3, 2], [7, 1], [10, 3]]) { px(x, y, 1, 4, 5); px(x, y, 1.35, 4, 1); px(x + 3, y + 1, .7, 1, 4); }
      break;
    }
    case 'vial': px(6, 1, '#c8d0da', 4, 2); px(7, 3, '#c8d0da', 2, 2); for (let y = 5; y < 15; y++) { const w = y < 7 ? 6 : 8; px(8 - w / 2, y, '#8a96a6', w, 1); px(9 - w / 2, y, y < 8 ? .7 : 1, w - 2, 1); } px(5, 8, '#ffffff', 1, 4); break;
    case 'pellet': for (const [x, y] of [[3, 3], [9, 4], [5, 9], [10, 10]]) for (let a = 0; a < 4; a++) for (let b = 0; b < 4; b++) if (Math.hypot(a - 1.5, b - 1.5) < 2) px(x + a, y + b, a + b < 2 ? '#f0ffe0' : a + b < 4 ? 1.35 : .9); break;
    case 'cell': px(4, 1, '#5c6470', 8, 14); px(5, 2, '#2c3038', 6, 12); for (let y = 3; y < 13; y += 3) px(6, y, 1, 4, 2); px(6, 3, 1.4, 4, 1); px(4, 1, '#939ca8', 8, 1); break;
    case 'meat': {   // a cut on the bone: red (or browned) flesh, a fat rim, a white bone end
      for (let y = 3; y < 13; y++) for (let x = 2; x < 12; x++) { const d = Math.hypot((x - 6.5) / 1.15, y - 8); if (d < 4.6) px(x, y, d > 3.7 ? 1.3 : y < 7 ? 1.12 : 1); }
      px(11, 5, '#f0ece4', 3, 2); px(13, 4, '#f0ece4', 2, 1); px(13, 7, '#f0ece4', 2, 1); px(5, 7, .8, 2, 1); px(7, 10, .8, 2, 1);
      break;
    }
    case 'egg': for (let y = 2; y < 15; y++) for (let x = 3; x < 13; x++) { const d = Math.hypot((x - 7.5) / 1, (y - 9) / (y < 9 ? 1.35 : 1.05)); if (d < 4.6) px(x, y, d < 2 && y < 9 ? 1.08 : y > 11 ? .86 : 1); } px(5, 5, '#ffffff', 2, 2); break;
    case 'wool': for (const [x, y, r] of [[5, 7, 3], [10, 6, 3], [8, 10, 3.4], [4, 11, 2.4], [12, 10, 2.4]]) for (let a = -4; a <= 4; a++) for (let b = -4; b <= 4; b++) if (Math.hypot(a, b) < r && x + a >= 0 && x + a < 16 && y + b >= 0 && y + b < 16) px(x + a, y + b, Math.hypot(a + 1, b + 1) < r * .6 ? 1.06 : .86); break;
    case 'hide': for (let y = 2; y < 14; y++) { const w = 10 + Math.round(Math.sin(y * 1.3) * 1.5) - (y < 4 || y > 11 ? 3 : 0); px(8 - w / 2, y, y % 3 ? 1 : .85, w, 1); } px(2, 5, 1, 1, 2); px(13, 9, 1, 1, 2); px(6, 6, 1.25, 4, 1); break;
    case 'feather': for (let i = 0; i < 11; i++) { const x = 3 + i, y = 13 - i, w = Math.round(Math.sin(i / 10 * Math.PI) * 3); for (let k = -w; k <= w; k++) px(x + k * .5 | 0, y + (k > 0 ? 1 : 0), k ? .92 : .75); } px(2, 14, '#8a8f96', 2, 1); break;
    case 'chitin': for (let y = 3; y < 14; y++) { const w = 12 - Math.abs(y - 8) * 1.2; px(8 - w / 2, y, y % 3 ? 1 : .55, w, 1); } px(8, 3, '#1a0c06', 1, 11); px(5, 6, 1.5, 2, 1); px(10, 9, 1.5, 2, 1); break;
    case 'slime': for (let y = 4; y < 14; y++) for (let x = 2; x < 14; x++) { const d = Math.hypot(x - 7.5, (y - 10) * (y < 10 ? .8 : 1.6)); if (d < 5.6 - Math.sin(x * 1.7) * .6) px(x, y, y < 8 ? 1.3 : 1); } px(5, 7, '#ffffff', 2, 1); px(10, 2, 1, 1, 2); break;
    case 'shell': for (let y = 3; y < 14; y++) for (let x = 2; x < 14; x++) { const d = Math.hypot(x - 7.5, y - 9.5); if (d < 5.6 && y < 13) px(x, y, Math.floor(Math.atan2(y - 13, x - 7.5) * 3) % 2 ? 1.2 : .9); } px(4, 2, '#e8fcff', 1, 3); px(10, 2, '#e8fcff', 1, 3); px(7, 1, '#ffffff', 2, 3); break;
    case 'powder': px(3, 12, '#5c6470', 10, 2); for (let y = 6; y < 12; y++) { const w = 4 + (y - 6) * 1.5; px(8 - w / 2, y, y < 8 ? 1.5 : 1, w, 1); } px(6, 4, '#c3cad3', 4, 2); px(7, 5, 2.4, 1, 1); break;
    case 'ammo': for (const x of [3, 7, 11]) { px(x, 6, 1, 3, 8); px(x, 6, 1.3, 1, 8); px(x, 3, '#c87a3a', 3, 3); px(x + 1, 2, '#c87a3a', 1, 1); px(x, 13, .7, 3, 1); } break;
    case 'shell_ammo': for (const x of [3, 9]) { px(x, 2, 1, 4, 9); px(x, 2, 1.3, 1, 9); px(x, 11, '#c8a04a', 4, 3); px(x, 11, '#e8d08a', 1, 3); } break;
    case 'gun': drawGun(px, id, col); break;
    case 'animal': drawAnimal(px, ANIMALS[id].look, col); break;
    case 'road': {
      const r = col >> 16 & 255;
      px(1, 3, 1, 14, 10);
      if (id === 'path_tile') { for (let x = 1; x < 15; x += 4) px(x, 3, .75, 1, 10); px(1, 8, .75, 14, 1); }
      else if (r < 90) { px(2, 7, '#e8e4d8', 3, 1); px(7, 7, '#e8e4d8', 3, 1); px(12, 7, '#e8e4d8', 3, 1); }
      else { for (let i = 0; i < 12; i++) px(2 + (i * 5) % 12, 4 + (i * 7) % 8, i % 2 ? 1.25 : .75); }
      px(1, 3, 1.25, 14, 1);
      break;
    }
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

// Animals in profile, facing right, by their model's shape (ANIMALS[t].look): for the wiki's pages and links.
function drawAnimal(px, L, col) {
  const head = L.head2 ?? L.col, leg = L.leg2 ?? L.col, glow = L.glow ?? L.accent ?? 0xffffff;
  switch (L.shape) {
    case 'quad': {
      const tall = L.leg > .35, small = L.body[2] < .3, y0 = tall ? 4 : small ? 8 : 6, h = small ? 4 : 5, x0 = small ? 4 : 2, w = small ? 7 : 10;
      px(x0, y0, 1, w, h); px(x0, y0, 1.2, w, 1);
      if (L.spots) { px(x0 + 2, y0 + 1, 1, 2, 2, L.spots); px(x0 + 6, y0 + 2, 1, 2, 2, L.spots); }
      for (const x of [x0, x0 + 2, x0 + w - 3, x0 + w - 1]) px(x, y0 + h, 1, 1, 15 - y0 - h, leg);
      const hx = x0 + w - 1, hy = tall ? 1 : y0 - 2;
      if (tall) px(hx, y0 - 3, 1, 2, 4, L.mane ?? L.col);
      px(hx, hy, 1, 4, 3, head); px(hx + 3, hy + 1, .6, 1, 1, head);
      if (L.ears) px(hx, hy - (L.earUp ? 3 : 1), 1, 1, L.earUp ? 3 : 1, head);
      if (L.horns || L.antlers) { px(hx + 1, hy - 2, 1, 1, 2, L.antlers ?? L.accent ?? 0xd8d0b8); px(hx - 1, hy - 3, 1, 2, 1, L.antlers ?? L.accent ?? 0xd8d0b8); }
      if (L.twoHeads) px(hx + 1, hy + 3, 1, 3, 2, head);
      if (L.tail === 'bushy' || L.tail === 'long') px(x0 - 2, y0 + 1, 1, 2, 3, L.mane ?? L.accent ?? L.col);
      else px(x0 - 1, y0, 1, 1, 2);
      px(hx + 2, hy + 1, '#101014');
      break;
    }
    case 'bird': {
      const tall = L.leg > .3;
      for (let y = 0; y < 5; y++) px(3 + (y === 0 || y === 4 ? 1 : 0), (tall ? 5 : 7) + y, 1, y === 0 || y === 4 ? 6 : 8, 1);
      px(9, tall ? 1 : 4, 1, 1, tall ? 5 : 3, head); px(9, tall ? 1 : 3, 1, 3, 2, head); px(12, tall ? 2 : 4, 1, tall ? 3 : 2, 1, L.beak);
      if (L.comb) px(9, 2, 1, 2, 1, L.comb);
      px(5, tall ? 6 : 8, .8, 4, 2); px(5, tall ? 10 : 12, 1, 1, tall ? 6 : 3, leg); px(8, tall ? 10 : 12, 1, 1, tall ? 6 : 3, leg);
      px(1, tall ? 6 : 6, 1, 2, 2); px(10, tall ? 2 : 4, '#101014');
      break;
    }
    case 'frog': px(3, 8, 1, 10, 5); px(3, 8, 1.2, 10, 1); px(9, 6, 1, 3, 2); px(10, 6, '#f0f0d0'); px(2, 12, .8, 4, 2); px(11, 13, .8, 3, 1); break;
    case 'lizard': px(3, 9, 1, 8, 3); px(11, 9, 1, 3, 2); px(13, 10, '#101014'); px(0, 10, 1, 3, 1); px(1, 11, 1, 2, 1); for (const x of [4, 9]) px(x, 12, .8, 1, 2); px(4, 9, 1.25, 6, 1, L.accent); break;
    case 'bug': for (let y = 5; y < 12; y++) { const w = 12 - Math.abs(y - 8) * 2; px(8 - w / 2, y, y < 7 ? 1.3 : 1, w, 1); } px(8, 5, 1, 1, 7, glow); px(13, 7, 1, 2, 3, leg); for (const x of [4, 7, 10]) px(x, 12, 1, 1, 2, leg); break;
    case 'moth': px(2, 3, 1.15, 5, 8); px(9, 3, 1.15, 5, 8); px(7, 4, 1, 2, 9); px(3, 5, 1, 2, 2, glow); px(10, 5, 1, 2, 2, glow); px(6, 2, 1, 1, 2); px(9, 2, 1, 1, 2); break;
    case 'snail': px(1, 11, 1, 13, 3); for (let y = 2; y < 11; y++) for (let x = 3; x < 12; x++) { const d = Math.hypot(x - 7, y - 6.5); if (d < 4.6) px(x, y, d < 1.5 || (d > 2.6 && d < 3.3) ? 1 : .75, 1, 1, d < 1.5 || (d > 2.6 && d < 3.3) ? glow : 0x8a7a6a); } px(13, 8, 1, 1, 3); px(13, 7, glow); break;
    case 'crab': px(3, 8, 1, 10, 4); px(3, 8, 1.2, 10, 1); for (const x of [5, 8, 10]) px(x, 5, 1, 1, 3, glow); px(1, 6, 1.2, 3, 2); px(12, 6, 1.2, 3, 2); for (const x of [3, 6, 9, 12]) px(x, 12, .8, 1, 3); break;
  }
}
// Guns, pointing right: a barrel, a body, a grip, and wood where the gun has it.
function drawGun(px, id, col) {
  const metal = '#3a3e46', hi = '#8a929c', wood = '#8a5a2c';
  switch (id) {
    case 'pistol': px(3, 5, metal, 10, 3); px(3, 5, hi, 10, 1); px(4, 8, metal, 3, 6); px(5, 8, '#5c6470', 1, 5); px(7, 8, metal, 2, 1); px(12, 4, hi, 1, 1); break;
    case 'shotgun': px(0, 6, metal, 16, 2); px(0, 6, hi, 16, 1); px(1, 8, wood, 6, 2); px(0, 9, wood, 3, 3); px(8, 8, wood, 5, 1); px(7, 8, metal, 1, 2); break;
    case 'rifle': px(0, 7, wood, 7, 2); px(0, 9, wood, 2, 3); px(5, 6, metal, 11, 2); px(5, 6, hi, 11, 1); px(7, 4, metal, 4, 2); px(8, 3, '#9fe8f2', 2, 1); px(9, 8, hi, 1, 2); break;
    case 'smg': px(2, 5, metal, 11, 4); px(2, 5, hi, 11, 1); px(13, 6, metal, 3, 1); px(5, 9, metal, 2, 5); px(9, 9, '#5c6470', 2, 4); px(0, 6, '#5c6470', 2, 2); break;
    default: px(0, 7, '#4a5040', 4, 3); px(0, 10, '#4a5040', 2, 2); px(3, 6, metal, 11, 3); px(3, 6, hi, 11, 1); px(14, 7, metal, 2, 1); px(6, 9, metal, 2, 4); px(9, 9, '#4a5040', 2, 4); px(6, 4, metal, 4, 2);
  }
}
function drawVehicle(px, frame, col) {
  switch (frame) {
    case 'car': px(2, 7, 1, 12, 4); px(4, 4, '#9fe8f2', 7, 3); px(4, 4, 1.2, 7, 1); for (const x of [3, 10]) px(x, 11, '#22252b', 3, 3); break;
    case 'truck': px(1, 3, '#c3cad3', 9, 8); px(10, 5, 1, 4, 6); px(11, 6, '#9fe8f2', 2, 2); px(1, 11, '#2c3038', 14, 1); for (const x of [2, 6, 11]) px(x, 12, '#22252b', 3, 3); break;
    case 'tank': px(1, 9, '#2a2c30', 14, 4); px(2, 6, 1, 12, 4); px(5, 3, 1, 6, 3); px(10, 4, '#2c3038', 6, 1); break;
    case 'boat': for (let y = 8; y < 13; y++) { const w = 15 - (y - 8) * 1.6; px(8 - w / 2, y, 1, w, 1); } px(3, 5, '#d84a3a', 3, 3); px(6, 5, '#3a7ad8', 3, 3); px(9, 5, '#e0c03a', 3, 3); px(12, 3, '#e0e4ea', 2, 5); break;
    case 'locomotive': px(1, 4, 1, 10, 7); px(11, 3, 1, 4, 8); px(12, 4, '#9fe8f2', 2, 2); px(4, 2, '#16181d', 2, 2); px(1, 11, '#2c3038', 14, 2); for (const x of [2, 6, 10]) px(x, 13, '#22252b', 2, 2); break;
    case 'cargo_wagon': px(1, 4, 1, 14, 7); for (const x of [4, 8, 12]) px(x, 4, .7, 1, 7); px(1, 11, '#2c3038', 14, 2); for (const x of [3, 11]) px(x, 13, '#22252b', 2, 2); break;
  }
}
function drawMachine(px, ent, col) {
  const def = ENTITIES[ent], kind = def.model || def.kind;
  switch (kind) {
    case 'pipe': {   // iron: plain; steel: darker, banded, heavy flanges; irrigation: green with a water drop
      const steel = !!def.flow, fl = steel ? '#2c3038' : '#5c6470';
      px(1, 6, 1, 14, 4); px(1, 6, 1.3, 14, 1); px(1, 9, .7, 14, 1);
      px(0, 5, fl, 2, 6); px(14, 5, fl, 2, 6);
      if (steel) { px(0, 4, fl, 2, 8); px(14, 4, fl, 2, 8); for (const x of [4, 8, 11]) px(x, 6, .6, 1, 4); }
      if (def.irrigation) { px(6, 1, '#4aa3ff', 3, 2); px(5, 2, '#4aa3ff', 5, 2); px(6, 4, '#2a6ab8', 3, 1); px(6, 1, '#bfe4ff'); }
      else px(7, 5, '#3a8ad8', 2, 2);
      break;
    }
    case 'station': px(1, 8, 1, 14, 5); px(1, 7, '#8a5a2c', 14, 2); px(2, 13, '#5e3b1a', 2, 3); px(12, 13, '#5e3b1a', 2, 3); px(3, 2, '#e5ad2e', 2, 6); px(3, 2, '#e5ad2e', 8, 2); px(10, 3, '#2c3038', 3, 2); break;
    case 'upipe': px(1, 6, 1, 7, 4); px(1, 6, 1.3, 7, 1); px(7, 4, '#2c3038', 8, 9); px(8, 5, def.flow ? '#939ca8' : '#5c6470', 6, 2); px(10, 9, def.irrigation ? '#4aa3ff' : '#9be37a', 2, 2); if (def.flow) px(1, 8, .6, 7, 1); px(8, 12, '#16181d', 6, 1); break;
    case 'fpump': px(0, 6, '#939ca8', 16, 4); px(4, 3, 1, 8, 10); px(4, 3, 1.3, 8, 1); px(7, 5, '#ffffff', 2, 5); px(6, 6, '#ffffff', 4, 1); break;
    case 'valve': px(0, 7, '#939ca8', 16, 3); px(5, 5, 1, 6, 7); px(7, 1, '#2c3038', 2, 5); px(4, 1, '#d84a3a', 8, 2); break;
    case 'tank': px(2, 3, 1, 12, 12); px(3, 2, 1.25, 10, 2); for (const y of [6, 10]) px(2, y, .75, 12, 1); px(4, 5, '#3a8ad8', 1, 8); break;
    case 'oilpump': px(1, 13, '#2c3038', 14, 2); px(6, 6, '#939ca8', 1, 7); px(9, 6, '#939ca8', 1, 7); px(1, 4, 1, 14, 2); px(1, 4, '#5c6470', 3, 6); px(12, 5, '#2c3038', 3, 3); break;
    case 'refinery': px(1, 13, '#2c3038', 14, 2); px(9, 1, '#c3cad3', 3, 12); px(12, 4, '#c3cad3', 3, 9); for (let y = 3; y < 13; y += 3) { px(9, y, 1, 3, 1); px(12, y + 1, 1, 3, 1); } px(1, 7, '#8f8373', 6, 6); px(2, 10, '#ff7a2a', 3, 2); px(3, 3, '#645a4d', 2, 4); break;
    case 'chem': px(1, 13, '#2c3038', 14, 2); px(2, 6, 1, 5, 7); px(9, 6, 1, 5, 7); px(2, 4, '#9fe8f2', 5, 2); px(9, 4, '#9fe8f2', 5, 2); px(7, 8, '#ffd23f', 2, 2); break;
    case 'barreler': px(1, 4, 1, 14, 9); px(1, 4, 1.3, 14, 1); px(9, 6, '#8a96a6', 4, 6); px(9, 8, '#5c6470', 4, 1); px(3, 7, '#3a8ad8', 4, 3); break;
    case 'vfactory': px(1, 4, 1, 14, 11); px(1, 3, '#939ca8', 14, 2); px(4, 8, '#16181d', 8, 7); px(5, 11, '#d84a3a', 6, 3); break;
    case 'fgen': px(1, 12, '#2c3038', 14, 3); px(2, 5, 1, 8, 7); for (let x = 3; x < 10; x += 2) px(x, 6, .7, 1, 5); px(3, 1, '#645a4d', 2, 4); for (let y = 4; y < 13; y++) for (let x = 10; x < 16; x++) { const d = Math.hypot(x - 12.5, y - 8.5); if (d < 3.4 && d > 2.2) px(x, y, '#c3cad3'); } break;
    case 'depot': {
      if (def.way === 'rail') { px(1, 9, '#8f8373', 14, 5); px(1, 3, 1, 14, 2); px(2, 5, '#939ca8', 1, 4); px(13, 5, '#939ca8', 1, 4); px(5, 6, '#ffd23f', 6, 2); }
      else if (def.way === 'road') { px(2, 4, 1, 12, 10); px(2, 3, '#939ca8', 12, 2); px(4, 8, '#2c3038', 6, 6); px(11, 9, '#d84a3a', 3, 5); }
      else { px(0, 10, '#3a8ad8', 16, 6); px(1, 8, '#8a5a2c', 14, 3); px(10, 1, '#e5ad2e', 1, 8); px(4, 1, '#e5ad2e', 7, 1); px(3, 5, 1, 4, 3); }
      break;
    }
    case 'rail': for (let x = 1; x < 16; x += 3) px(x, 3, '#5e3b1a', 2, 10); px(0, 5, '#c3cad3', 16, 1); px(0, 10, '#c3cad3', 16, 1); break;
    case 'belt': if (def.lanes === 3) { px(0, 2, '#2b2f36', 16, 12); for (const y of [2, 6, 10]) for (let i = 0; i < 3; i++) { px(3 + i * 4, y + 1, 1, 2, 1); px(4 + i * 4, y + 2, 1, 2, 1); px(3 + i * 4, y + 3, 1, 2, 1); } px(0, 5, '#5c6470', 16, 1); px(0, 9, '#5c6470', 16, 1); px(0, 2, .7, 16, 1); px(0, 13, .7, 16, 1); break; }
      px(1, 3, '#2b2f36', 14, 10); for (let i = 0; i < 3; i++) { px(4 + i * 3, 5, 1, 2, 1); px(5 + i * 3, 6, 1, 2, 1); px(6 + i * 3, 7, 1, 2, 2); px(5 + i * 3, 9, 1, 2, 1); px(4 + i * 3, 10, 1, 2, 1); } px(1, 3, .7, 14, 1); px(1, 12, .7, 14, 1); break;
    case 'underground': px(1, 4, '#2b2f36', 7, 8); px(8, 2, 1, 7, 12); px(9, 4, '#111', 5, 8); px(2, 7, 1, 5, 2); px(5, 6, 1, 1, 4); break;
    case 'splitter': if (def.lanes === 3) { px(0, 5, '#2b2f36', 6, 6); for (const y of [6, 8]) px(0, y, '#5c6470', 6, 1); px(5, 1, 1, 5, 14); px(5, 1, 1.3, 5, 1); for (const y of [0, 6, 12]) { px(10, y, '#2b2f36', 6, 4); px(10, y + 1, '#5c6470', 6, 1); px(10, y + 2, '#5c6470', 6, 1); } break; }
      px(1, 6, '#2b2f36', 6, 4); px(6, 2, 1, 4, 12); px(10, 1, '#2b2f36', 5, 4); px(10, 11, '#2b2f36', 5, 4); px(10, 6, '#2b2f36', 5, 4); break;
    case 'lift': for (let i = 0; i < 6; i++) px(2 + i * 2, 12 - i * 2, 1, 3, 2); px(7, 1, '#ffffff', 2, 5); px(6, 2, '#ffffff', 4, 1); break;
    case 'inserter': px(4, 12, '#34373e', 8, 3); px(7, 6, 1, 2, 6); px(7, 5, 1, 6, 2); px(12, 4, '#34373e', 3, 4); px(6, 10, .7, 4, 2); break;
    case 'drill': if (def.size) {   // big mining drill: a wide deck, a tall derrick, the cutter turning under it
        px(1, 9, 1, 14, 5); px(1, 9, 1.3, 14, 1); for (let x = 1; x < 15; x += 2) px(x, 13, x % 4 === 1 ? '#e5ad2e' : '#24262b', 1, 1);
        px(3, 1, '#939ca8', 1, 8); px(12, 1, '#939ca8', 1, 8); px(3, 4, '#939ca8', 10, 1); px(6, 0, '#e5ad2e', 4, 2); px(7, 2, '#c3cad3', 2, 7);
        px(4, 14, '#d8b24a', 8, 1); px(5, 15, '#d8b24a', 6, 1); px(2, 10, '#2c3038', 3, 2); break;
      }
      if (def.ports) {   // leaching drill: an electric drill with an acid tank on its back
        px(2, 5, 1, 10, 8); px(2, 5, 1.3, 10, 1); px(5, 13, '#d8b24a', 4, 2); px(6, 15, '#d8b24a', 2, 1); px(4, 2, '#8c8f96', 6, 3);
        px(11, 3, '#5c6470', 4, 9); px(12, 4, '#d8e04a', 2, 7); px(12, 4, '#f4f8a8', 2, 1); break;
      }
      if (def.depth >= 2) { px(4, 0, '#8c8f96', 1, 6); px(11, 0, '#8c8f96', 1, 6); px(4, 0, '#e5ad2e', 8, 2); }
      px(2, 4, 1, 12, 9); px(6, 13, '#d8b24a', 4, 2); px(7, 15, '#d8b24a', 2, 1); px(4, 1, '#8c8f96', 8, 3); px(2, 4, 1.3, 12, 1); break;
    case 'furnace': px(3, 3, 1, 10, 12); px(3, 3, 1.25, 10, 1); px(6, 9, '#ff7a2a', 4, 3); px(7, 10, '#ffd23f', 2, 2); px(10, 0, '#4a4440', 2, 3); break;
    case 'assembler': px(1, 4, 1, 14, 10); px(1, 4, 1.3, 14, 1); for (let a = 0; a < 8; a++) px(8 + Math.round(Math.cos(a * .785) * 3) - 1, 9 + Math.round(Math.sin(a * .785) * 3) - 1, '#c0c6cf', 2, 2); px(7, 8, '#222', 2, 2); break;
    case 'lab': px(2, 9, '#4b4f5a', 12, 6); for (let y = 2; y < 10; y++) for (let x = 3; x < 13; x++) if (Math.hypot(x - 7.5, y - 9) < 6) px(x, y, '#58c8d8'); px(5, 4, '#ffffff'); break;
    case 'chest': px(2, 4, 1, 12, 10); px(2, 7, .7, 12, 1); px(7, 7, '#e8d48a', 2, 3); px(2, 4, 1.25, 12, 1); break;
    case 'frame': px(2, 2, 1, 12, 2); px(2, 2, 1, 2, 12); px(12, 2, 1, 2, 12); px(2, 12, .7, 12, 2); px(4, 4, .5, 1, 8); px(4, 4, .5, 8, 1); break;
    case 'pole':
      if (ent === 'power_line') { for (let y = 3; y < 16; y++) { const w = 2 + Math.floor((y - 3) / 3); px(8 - w, y, 1, 1, 1); px(7 + w, y, 1, 1, 1); if (y % 3 === 0) px(8 - w, y, .7, w * 2, 1); } px(2, 3, '#2c3038', 12, 1); px(2, 4, '#9fd0ff', 1, 2); px(13, 4, '#9fd0ff', 1, 2); break; }
      if (ent === 'step_up') { px(4, 7, 1, 8, 8); for (let x = 5; x < 12; x += 2) px(x, 8, .7, 1, 6); px(5, 2, '#e5c83a', 2, 5); px(9, 2, '#d88a4a', 2, 5); px(7, 4, '#ffffff', 2, 1); px(4, 14, '#2c3038', 8, 1); break; }
      if (ent === 'generator_pole') { px(7, 3, '#5e3b1a', 2, 12); px(3, 3, 1, 10, 2); px(3, 2, '#e5c83a', 2, 1); px(11, 2, '#e5c83a', 2, 1); px(6, 14, '#e5c83a', 4, 1); break; }
      if (ent === 'transformer') { px(3, 6, 1, 10, 9); for (let x = 4; x < 13; x += 2) px(x, 7, .7, 1, 7); px(4, 2, '#9fd0ff', 2, 4); px(7, 1, '#9fd0ff', 2, 5); px(10, 2, '#9fd0ff', 2, 4); px(3, 14, '#2c3038', 10, 1); break; }
      px(7, 2, 1, 2, 13); px(3, 3, 1, 10, 2); px(3, 2, '#c8d0da', 2, 1); px(11, 2, '#c8d0da', 2, 1); px(6, 14, .6, 4, 1); break;
    case 'pump': if (def.fullRate) {   // high pressure pump: a steel housing, a pressure gauge and a fat steel outlet
        px(1, 13, '#3a8ad8', 14, 2); px(2, 7, '#2c3038', 12, 6); px(3, 4, 1, 10, 4); px(3, 4, 1.35, 10, 1); px(12, 2, '#5a6a7c', 4, 4); px(13, 3, '#939ca8', 2, 2);
        for (let y = 0; y < 3; y++) for (let x = 0; x < 3; x++) if (Math.hypot(x - 1, y - 1) < 1.6) px(5 + x, 8 + y, '#e8ecf2');
        px(6, 9, '#d84a3a'); px(10, 9, '#ffd23f', 2, 2); break;
      }
      px(2, 13, '#3a8ad8', 12, 2); px(3, 6, '#2c3038', 1, 7); px(12, 6, '#2c3038', 1, 7); px(2, 5, '#5c6470', 12, 2); px(4, 2, 1, 6, 4); px(8, 3, 1, 6, 2); px(13, 2, '#939ca8', 2, 4); break;
    case 'boiler': px(2, 9, '#8f8373', 12, 6); px(6, 11, '#ff7a2a', 4, 2); for (let x = 1; x < 15; x++) px(x, 4, x % 5 ? 1 : .6, 1, 5); px(11, 0, '#645a4d', 2, 4); break;
    case 'engine': px(1, 12, '#2c3038', 14, 3); px(1, 5, 1, 9, 7); px(1, 5, 1.3, 9, 1); for (let x = 2; x < 10; x += 3) px(x, 6, .7, 1, 6); for (let y = 2; y < 15; y++) for (let x = 9; x < 16; x++) { const d = Math.hypot(x - 12, y - 8); if (d < 3.6 && d > 2.4) px(x, y, '#c3cad3'); } px(11, 7, '#2c3038', 2, 2); break;
    case 'lamp':
      if (def.burner) { px(4, 13, '#2c3038', 2, 3); px(10, 13, '#2c3038', 2, 3); px(3, 9, '#8f8373', 10, 4); px(3, 9, '#a89c8a', 10, 1); px(6, 4, '#ff8a3a', 4, 5); px(7, 2, '#ffd23f', 2, 4); break; }
      px(7, 4, '#5c6470', 2, 11); px(5, 14, '#2c3038', 6, 2); px(4, 1, '#2c3038', 8, 2); px(5, 3, '#fff0d0', 6, 3); px(6, 3, '#ffffff', 2, 1); break;
    case 'solar': for (let y = 0; y < 3; y++) for (let x = 0; x < 3; x++) px(2 + x * 4, 3 + y * 4, 1.4, 3, 3); px(1, 14, '#888', 14, 1); break;
    case 'radar': px(3, 13, '#2c3038', 10, 2); px(6, 9, 1, 4, 4); px(7, 5, '#5c6470', 2, 4);
      for (let x = 1; x < 15; x++) { const y = 2 + Math.round(Math.pow((x - 7.5) / 6.5, 2) * 4); px(x, y, '#c3cad3', 1, 2); } px(7, 3, '#7ef6ff', 2, 2); break;
    case 'centrifuge': px(2, 13, '#2c3038', 12, 2); for (let y = 3; y < 13; y++) px(4, y, y < 5 ? 1.3 : 1, 8, 1); px(3, 2, '#e5ad2e', 10, 1); px(5, 7, '#9be37a', 6, 3); px(7, 8, '#e8ffd8', 2, 1); break;
    case 'greenhouse': {   // a glass house: frame posts, panes, a green roof and plants inside
      const one = def.size?.[0] === 1;
      px(1, 14, '#4a3424', 14, 2);
      for (let y = 6; y < 14; y++) px(2, y, '#c8f8e0', 12, 1);
      for (const x of one ? [2, 13] : [2, 7, 13]) px(x, 6, '#d8dde4', 1, 8);
      for (let y = 1; y < 6; y++) { const w = 2 + (y - 1) * 3; px(8 - w / 2, y, y % 2 ? 1 : .85, w, 1); }
      px(2, 6, '#d8dde4', 12, 1);
      for (const x of [4, 9, 11]) { px(x, 10, '#3a8a3a', 1, 4); px(x - 1, 9, '#5ab84a', 3, 2); }
      if (!one) px(7, 11, '#2c3038', 1, 3);   // a door
      break;
    }
    case 'dam': px(0, 10, '#2f6a9a', 16, 6); px(0, 3, '#1f4a72', 16, 2); px(1, 4, 1, 14, 9); px(1, 4, 1.25, 14, 1); px(0, 4, '#5a5650', 1, 9); px(15, 4, '#5a5650', 1, 9);
      for (const x of [3, 7, 11]) { px(x, 8, '#6a7a8a', 2, 4); px(x, 12, '#bfe4ff', 2, 2); }
      px(2, 5, '#7ef6ff', 12, 1); break;
    case 'medlab': px(1, 9, '#e8e4e8', 14, 6); px(1, 9, '#ffffff', 14, 1); px(1, 14, '#9aa1ad', 14, 1);
      for (let y = 2; y < 9; y++) for (let x = 3; x < 13; x++) if (Math.hypot(x - 7.5, y - 9) < 6.2) px(x, y, '#9fe8f2');
      for (let i = 0; i < 6; i++) { px(6 + Math.round(Math.sin(i) * 1.5), 3 + i, '#d84a8a'); px(9 - Math.round(Math.sin(i) * 1.5), 3 + i, '#7ef6ff'); }
      px(6, 11, '#d83a3a', 4, 2); px(7, 10, '#d83a3a', 2, 4); break;
    case 'reactor': px(1, 13, '#2c3038', 14, 2); for (let y = 3; y < 13; y++) { const w = y < 5 ? 8 + (y - 3) * 2 : 12; px(8 - w / 2, y, y < 5 ? '#c3cad3' : 1, w, 1); }
      for (const x of [1, 14]) px(x, 4, '#939ca8', 1, 9);
      px(5, 6, '#9be37a', 6, 4); px(6, 7, '#e8ffd8', 4, 2); px(7, 2, '#ff3a1a', 2, 1); for (const x of [4, 11]) px(x, 10, '#16181d', 1, 2); break;
    case 'coolant': for (let y = 1; y < 15; y++) { const t = (y - 1) / 13, w = Math.round(11 - Math.sin(t * Math.PI) * 4 - t); px(8 - Math.floor(w / 2), y, y < 3 ? 1.2 : y % 4 === 0 ? .85 : 1, w, 1); }
      px(4, 0, '#e8ecf2', 2, 1); px(8, 0, '#e8ecf2', 3, 1); px(6, 1, '#16181d', 4, 1); px(1, 15, '#2c3038', 14, 1); px(6, 12, '#3a8ad8', 4, 2); break;
    case 'transmitter': for (let x = 2; x < 14; x++) { const y = 3 + Math.round(Math.pow((x - 7.5) / 6, 2) * 4); px(x, y, '#cfd6df', 1, 2); } px(7, 6, '#9aa1ad', 2, 7); px(4, 13, 1, 8, 2); px(7, 2, '#7ef6ff', 2, 2); break;
    default:   // anything without its own drawing still reads as a machine in its colour, never a blank
      px(2, 4, 1, 12, 10); px(2, 4, 1.3, 12, 1); px(2, 13, .6, 12, 1); px(5, 7, '#2c3038', 6, 4); px(6, 8, 1.4, 4, 2);
  }
}

// Cursors for the engineer's tools, in the icons' pixel style: drawn 16x16, shown at 32x32 with a dark rim.
const cursorCache = {};
export function toolCursor(tool) {
  if (cursorCache[tool]) return cursorCache[tool];
  const c = document.createElement('canvas'); c.width = c.height = 32;
  const g = c.getContext('2d'), px = (x, y, col, w = 1, h = 1) => { g.fillStyle = col; g.fillRect(x * 2, y * 2, w * 2, h * 2); };
  const handle = (x0, y0, n) => { for (let i = 0; i < n; i++) { px(x0 + i, y0 + i, '#8a5a2c'); px(x0 + i + 1, y0 + i, '#5e3b1a'); } };
  if (tool === 'crosshair') {   // a gun in hand: a ring with four ticks and a centre dot, hot spot in the middle
    for (let a = 0; a < 32; a++) { const t = a / 32 * Math.PI * 2, x = Math.round(7.5 + Math.cos(t) * 4.5), y = Math.round(7.5 + Math.sin(t) * 4.5); px(x, y, '#ffffff'); }
    for (const [x, y, w, h] of [[7, 0, 2, 3], [7, 13, 2, 3], [0, 7, 3, 2], [13, 7, 3, 2]]) px(x, y, '#ffffff', w, h);
    px(7, 7, '#ff5a4a', 2, 2);
  } else if (tool === 'axe') { handle(5, 5, 10); for (let y = 0; y < 6; y++) px(1 + Math.floor(y / 2), y + 1, '#c3cad3', 5 - Math.floor(y / 2), 1); px(1, 1, '#ffffff', 2, 1); px(6, 2, '#5c6470', 1, 4); }
  else if (tool === 'pickaxe') { handle(5, 5, 10); for (let i = 0; i < 8; i++) { px(i, 7 - i, '#c3cad3'); px(i + 1, 7 - i, '#939ca8'); } px(0, 7, '#ffffff'); px(7, 0, '#ffffff'); }
  else { handle(7, 7, 8); px(1, 1, '#939ca8', 5, 5); px(2, 2, '#c3cad3', 3, 3); px(1, 1, '#ffffff', 2, 1); px(5, 5, '#5c6470', 2, 2); }
  // dark rim
  const img = g.getImageData(0, 0, 32, 32), d = img.data, o = new Uint8ClampedArray(d);
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
    const i = (y * 32 + x) * 4; if (d[i + 3]) continue;
    if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([a, b]) => { const X = x + a, Y = y + b; return X >= 0 && Y >= 0 && X < 32 && Y < 32 && d[(Y * 32 + X) * 4 + 3]; })) { o[i] = 12; o[i + 1] = 14; o[i + 2] = 19; o[i + 3] = 230; }
  }
  g.putImageData(new ImageData(o, 32, 32), 0, 0);
  return (cursorCache[tool] = `url(${c.toDataURL()}) ${tool === 'crosshair' ? '16 16' : '4 4'}, crosshair`);
}
export function iconURL(id) { const c = iconCanvas(id); return c._url ||= c.toDataURL(); }
export function iconHTML(id, n, cls = '') {
  return `<span class="icon ${cls}" title="${ITEMS[id]?.name ?? FLUIDS[id]?.name ?? id}"><img src="${iconURL(id)}" alt="">${n !== undefined && n !== null && n !== '' ? `<b>${fmtN(n)}</b>` : ''}</span>`;
}
export function fmtN(n) { return n >= 10000 ? Math.round(n / 1000) + 'k' : n >= 1000 ? (n / 1000).toFixed(1) + 'k' : String(Math.floor(n)); }
