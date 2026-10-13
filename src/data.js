// Static game data: items, entities, recipes, research, precision tiers, the alien script.

export const TIERS = [
  { need: 0,   name: 'Coarse',     res: 5,  up: 1 },
  { need: 15,  name: 'Fitted',     res: 8,  up: 2 },
  { need: 45,  name: 'Toleranced', res: 12, up: 3 },
  { need: 110, name: 'Resonant',   res: 20, up: 4 },
];

export const ITEMS = {
  iron_ore:       { name: 'Iron ore', color: 0x7d6f66, shape: 'ore' },
  copper_ore:     { name: 'Copper ore', color: 0xb8643a, shape: 'ore' },
  coal:           { name: 'Coal', color: 0x2a2a30, shape: 'ore', fuel: 4 },
  stone:          { name: 'Stone', color: 0xa89c8a, shape: 'ore' },
  wood:           { name: 'Wood', color: 0x8a5a2c, shape: 'wood', fuel: 2 },
  crystal:        { name: 'Resonant crystal', color: 0x7ef6ff, emissive: 0x1d8a99, shape: 'crystal' },
  abyssal_ore:    { name: 'Abyssal ore', color: 0x7a4ab8, emissive: 0x2a0f4a, shape: 'ore' },
  iron_plate:     { name: 'Iron plate', color: 0xcfd6df, shape: 'plate' },
  copper_plate:   { name: 'Copper plate', color: 0xff9a55, shape: 'plate' },
  steel:          { name: 'Steel', color: 0x8fa3b8, shape: 'plate' },
  brick:          { name: 'Stone brick', color: 0xc2ad8e, shape: 'brick' },
  lens:           { name: 'Lens', color: 0xbff8ff, emissive: 0x1d6a77, shape: 'lens' },
  abyssal_alloy:  { name: 'Abyssal alloy', color: 0xa77bea, emissive: 0x3a1a66, shape: 'plate' },
  gear:           { name: 'Gear', color: 0xaab2bd, shape: 'gear' },
  cable:          { name: 'Copper cable', color: 0xe07a3a, shape: 'cable' },
  circuit:        { name: 'Circuit', color: 0x3faa55, shape: 'chip' },
  coil:           { name: 'Coil', color: 0xffd23f, shape: 'coil' },
  adv_circuit:    { name: 'Advanced circuit', color: 0xd44a4a, shape: 'chip' },
  red_pack:       { name: 'Automation pack', color: 0xe04848, shape: 'pack' },
  green_pack:     { name: 'Logistic pack', color: 0x4ad46a, shape: 'pack' },
  blue_pack:      { name: 'Precision pack', color: 0x4a7ae0, shape: 'pack' },
  resonance_pack: { name: 'Resonance pack', color: 0x7ef6ff, emissive: 0x1d8a99, shape: 'pack' },
};

// kind drives simulation + model. vol = engineering volume when active. glyph = what the aliens hear.
export const ENTITIES = {
  belt:             { name: 'Belt', kind: 'belt', speed: 1.5, color: 0xc9a227, vol: .25, glyph: 'flow', desc: 'Moves items. Feed into its side to merge.' },
  fast_belt:        { name: 'Fast belt', kind: 'belt', speed: 3, color: 0xd8483a, vol: .35, glyph: 'flow', desc: 'Twice as fast.' },
  express_belt:     { name: 'Express belt', kind: 'belt', speed: 4.5, color: 0x3a9ad8, vol: .5, glyph: 'flow', desc: 'Three times as fast.' },
  underground:      { name: 'Underground belt', kind: 'underground', speed: 3, color: 0xc9a227, range: 5, vol: .6, glyph: 'tunnel', desc: 'Place an entrance, then an exit up to 4 tiles ahead.' },
  splitter:         { name: 'Splitter', kind: 'splitter', speed: 3, color: 0xc9a227, vol: .8, glyph: 'split', desc: 'Deals items in turn to the belts in front, left and right of it.' },
  lift:             { name: 'Lift', kind: 'lift', speed: 2, color: 0x58c8d8, vol: 1, glyph: 'rise', desc: 'Carries items one layer up or down. Press V to choose.' },
  burner_inserter:  { name: 'Burner inserter', kind: 'inserter', swing: .9, reach: 1, burner: true, color: 0x9a6a3a, vol: .4, glyph: 'swing', desc: 'Slow, needs no power. Burns fuel, and keeps fuel it carries when it runs dry.' },
  inserter:         { name: 'Inserter', kind: 'inserter', swing: .6, reach: 1, power: 13, color: 0xe0a92e, vol: .5, glyph: 'swing', desc: 'Moves items from behind it to in front of it.' },
  long_inserter:    { name: 'Long arm', kind: 'inserter', swing: .8, reach: 2, power: 20, color: 0xc8483a, vol: .75, glyph: 'swing', desc: 'Reaches two tiles.' },
  fast_inserter:    { name: 'Fast inserter', kind: 'inserter', swing: .25, reach: 1, power: 46, color: 0x3a8fd8, vol: .8, glyph: 'swing', desc: 'Swings more than twice as fast.' },
  filter_inserter:  { name: 'Filter inserter', kind: 'inserter', swing: .25, reach: 1, power: 53, color: 0xb04ad8, filter: true, vol: 1, glyph: 'swing', desc: 'Fast, and only moves the item you choose.' },
  burner_drill:     { name: 'Burner drill', kind: 'drill', rate: .25, burner: true, color: 0x6a5a48, vol: .8, glyph: 'bore', desc: 'Mines without power. Burns coal or wood.' },
  drill:            { name: 'Electric drill', kind: 'drill', rate: .5, power: 90, color: 0x5d6b43, vol: 1, glyph: 'bore', desc: 'Mines the deposit under it and pushes ore forward.' },
  furnace:          { name: 'Stone furnace', kind: 'furnace', speed: 1, burner: true, color: 0x857a6d, vol: 1, glyph: 'heat', desc: 'Smelts. Burns coal.' },
  electric_furnace: { name: 'Electric furnace', kind: 'furnace', speed: 2, power: 180, color: 0x6a7480, vol: 1.5, glyph: 'heat', desc: 'Smelts twice as fast. No fuel needed.' },
  assembler:        { name: 'Assembler', kind: 'assembler', speed: .75, power: 75, color: 0x35567a, vol: 1.5, glyph: 'make', desc: 'Crafts the recipe you choose.' },
  assembler2:       { name: 'Assembler II', kind: 'assembler', speed: 1.5, power: 150, color: 0x2f7a72, vol: 2, glyph: 'make', desc: 'Crafts twice as fast.' },
  lab:              { name: 'Lab', kind: 'lab', speed: 1, power: 60, color: 0xd8dde4, vol: 1.5, glyph: 'think', desc: 'Uses science packs to research.' },
  wooden_chest:     { name: 'Wooden chest', kind: 'chest', cap: 16, color: 0x8a5a2c, vol: .3, glyph: 'keep', desc: '16 slots of storage.' },
  chest:            { name: 'Iron chest', kind: 'chest', cap: 32, color: 0x8b8f98, vol: .5, glyph: 'keep', desc: '32 slots of storage.' },
  frame:            { name: 'Hollow frame', kind: 'frame', color: 0x8f9aa6, vol: .75, glyph: 'hollow', desc: 'You can build inside it and on top of it.' },
  small_pole:       { name: 'Small electric pole', kind: 'pole', supply: 2, wire: 7.5, color: 0x8a5a2c, vol: .1, glyph: 'spark', desc: 'Powers machines in a 5x5 area. Connects to poles up to 7.5 tiles away.' },
  medium_pole:      { name: 'Medium electric pole', kind: 'pole', supply: 3, wire: 9, color: 0x8a929c, vol: .2, glyph: 'spark', desc: 'Powers a 7x7 area. Connects up to 9 tiles.' },
  generator:        { name: 'Steam generator', kind: 'generator', out: 900, color: 0x6b5a4a, vol: 1.5, glyph: 'spark', desc: 'Burns coal or wood. Put it next to a pole (900 kW).' },
  solar:            { name: 'Solar panel', kind: 'solar', out: 60, color: 0x2a4a7a, vol: 1, glyph: 'shine', desc: '60 kW from starlight, forever.' },
  transmitter:      { name: 'Transmitter', kind: 'transmitter', power: 500, color: 0x4b4f5a, vol: 3, glyph: 'pulse', desc: 'Sends what it hears around it. Burns resonance packs.' },
};
for (const [id, e] of Object.entries(ENTITIES)) ITEMS[id] = { name: e.name, color: e.color, shape: 'machine', entity: id };

// Stack sizes decide how many inventory / chest slots things take.
const STACKS = { ore: 50, crystal: 50, wood: 100, plate: 100, brick: 100, lens: 100, gear: 100, cable: 200, chip: 200, coil: 100, pack: 200 };
const MACHINE_STACKS = { belt: 100, fast_belt: 100, express_belt: 100, small_pole: 50, medium_pole: 50, lab: 10, generator: 10, transmitter: 5, frame: 50 };
for (const [id, it] of Object.entries(ITEMS)) it.stack = it.shape === 'machine' ? (MACHINE_STACKS[id] ?? 50) : (STACKS[it.shape] ?? 50);

// Things standing on the surface that you can mine by hand.
export const FEATURES = {
  tree: { name: 'Tree', time: .6, gives: { wood: 4 } },
  rock: { name: 'Rock', time: 1.6, gives: { stone: 20, coal: 6 } },
};
export const PLAYER = { speed: 6.5, reach: 10, mineReach: 3, inventory: 80, radius: .28 };

export const BELT_KINDS = new Set(['belt', 'underground', 'splitter', 'lift']);

const R = (id, inp, time, extra = {}) => ({ id, in: inp, out: { [id]: 1 }, time, cat: 'craft', hand: true, ...extra });
export const RECIPES = [
  // smelting (furnaces pick these automatically)
  { id: 'iron_plate', cat: 'smelt', in: { iron_ore: 1 }, out: { iron_plate: 1 }, time: 3.2 },
  { id: 'copper_plate', cat: 'smelt', in: { copper_ore: 1 }, out: { copper_plate: 1 }, time: 3.2 },
  { id: 'brick', cat: 'smelt', in: { stone: 2 }, out: { brick: 1 }, time: 3.2 },
  { id: 'steel', cat: 'smelt', in: { iron_plate: 5 }, out: { steel: 1 }, time: 16, tech: 'steel' },
  { id: 'lens', cat: 'smelt', in: { crystal: 1 }, out: { lens: 1 }, time: 6, tech: 'optics' },
  { id: 'abyssal_alloy', cat: 'smelt', in: { abyssal_ore: 2 }, out: { abyssal_alloy: 1 }, time: 10, tech: 'deep_excavation' },
  // intermediates
  R('gear', { iron_plate: 2 }, .5),
  { ...R('cable', { copper_plate: 1 }, .5), out: { cable: 2 } },
  R('circuit', { iron_plate: 1, cable: 3 }, .5),
  R('coil', { cable: 4, gear: 1 }, 1),
  R('adv_circuit', { circuit: 2, coil: 1, lens: 1 }, 6, { tech: 'advanced_electronics' }),
  R('red_pack', { copper_plate: 1, gear: 1 }, 5),
  R('green_pack', { inserter: 1, belt: 1 }, 6, { tech: 'logistic_science' }),
  R('blue_pack', { circuit: 2, steel: 1, lens: 1 }, 10, { tech: 'precision_science' }),
  R('resonance_pack', { adv_circuit: 1, abyssal_alloy: 1, crystal: 2 }, 15, { tech: 'signal_theory', hand: false }),
  // buildings
  { ...R('belt', { gear: 1, iron_plate: 1 }, .5), out: { belt: 2 } },
  R('fast_belt', { belt: 1, gear: 3 }, .5, { tech: 'logistics2' }),
  R('express_belt', { fast_belt: 1, steel: 2, circuit: 1 }, .5, { tech: 'logistics3' }),
  { ...R('underground', { belt: 5, iron_plate: 10 }, 1, { tech: 'logistics' }), out: { underground: 2 } },
  R('splitter', { belt: 4, circuit: 5, iron_plate: 5 }, 1, { tech: 'logistics' }),
  R('lift', { belt: 4, steel: 2, frame: 1 }, 2, { tech: 'lifts' }),
  R('burner_inserter', { gear: 1, iron_plate: 1 }, .5),
  R('inserter', { circuit: 1, gear: 1, iron_plate: 1 }, .5),
  R('long_inserter', { inserter: 1, gear: 1, iron_plate: 1 }, .5, { tech: 'long_arms' }),
  R('fast_inserter', { inserter: 1, circuit: 2, iron_plate: 2 }, .5, { tech: 'fast_inserter' }),
  R('filter_inserter', { fast_inserter: 1, circuit: 4 }, .5, { tech: 'filter_inserter' }),
  R('burner_drill', { gear: 3, furnace: 1, iron_plate: 3 }, 2),
  R('drill', { circuit: 3, gear: 5, iron_plate: 10 }, 2),
  R('furnace', { stone: 5 }, .5),
  R('electric_furnace', { steel: 10, circuit: 5, brick: 10 }, 5, { tech: 'electric_smelting' }),
  R('assembler', { circuit: 3, gear: 5, iron_plate: 9 }, .5, { tech: 'automation' }),
  R('assembler2', { assembler: 1, adv_circuit: 3, steel: 5, gear: 5 }, .5, { tech: 'automation2' }),
  R('lab', { circuit: 10, gear: 10, belt: 4 }, 2),
  R('wooden_chest', { wood: 2 }, .5),
  R('chest', { iron_plate: 8 }, .5),
  { ...R('small_pole', { wood: 1, cable: 2 }, .5), out: { small_pole: 2 } },
  R('medium_pole', { steel: 2, copper_plate: 2, iron_plate: 2 }, .5, { tech: 'electric_distribution' }),
  R('frame', { iron_plate: 4, gear: 2 }, .5),
  R('generator', { brick: 10, gear: 8, iron_plate: 5 }, 2),
  R('solar', { steel: 5, circuit: 15, copper_plate: 5 }, 10, { tech: 'solar' }),
  R('transmitter', { adv_circuit: 20, steel: 20, lens: 10, abyssal_alloy: 10 }, 10, { tech: 'signal_theory' }),
];
export const RECIPE = Object.fromEntries(RECIPES.map(r => [r.id, r]));

const r = 'red_pack', g = 'green_pack', b = 'blue_pack';
const T = (id, name, packs, count, time, pre, unlocks, extra = {}) =>
  ({ id, name, cost: Object.fromEntries(packs.map(p => [p, 1])), count, time, pre, unlocks, ...extra });
export const TECHS = [
  T('automation', 'Automation', [r], 10, 10, [], ['assembler']),
  T('logistics', 'Logistics', [r], 20, 15, [], ['underground', 'splitter']),
  T('long_arms', 'Long arms', [r], 15, 10, ['automation'], ['long_inserter']),
  T('steel', 'Steel processing', [r], 25, 5, [], ['steel']),
  T('logistic_science', 'Logistic science', [r], 40, 5, ['automation'], ['green_pack']),
  T('fast_inserter', 'Fast inserter', [r], 30, 15, ['automation'], ['fast_inserter']),
  T('lifts', 'Lifts', [r, g], 40, 15, ['logistics', 'logistic_science'], ['lift']),
  T('logistics2', 'Logistics 2', [r, g], 50, 15, ['logistics', 'logistic_science'], ['fast_belt']),
  T('electric_distribution', 'Electric distribution', [r, g], 40, 10, ['steel', 'logistic_science'], ['medium_pole']),
  T('solar', 'Solar energy', [r, g], 60, 10, ['steel', 'logistic_science'], ['solar']),
  T('electric_smelting', 'Electric smelting', [r, g], 60, 15, ['steel', 'logistic_science'], ['electric_furnace']),
  T('filter_inserter', 'Filter inserter', [r, g], 60, 15, ['fast_inserter', 'logistic_science'], ['filter_inserter']),
  T('excavation', 'Excavation', [r, g], 60, 15, ['lifts'], ['layer -1'], { precision: 1 }),
  T('optics', 'Optics', [r, g], 50, 10, ['excavation'], ['lens']),
  T('precision_science', 'Precision science', [r, g], 75, 15, ['optics', 'steel'], ['blue_pack']),
  T('advanced_electronics', 'Advanced electronics', [r, g, b], 75, 15, ['precision_science'], ['adv_circuit']),
  T('automation2', 'Automation 2', [r, g, b], 100, 15, ['advanced_electronics'], ['assembler2']),
  T('logistics3', 'Logistics 3', [r, g, b], 100, 15, ['logistics2', 'precision_science'], ['express_belt']),
  T('deep_excavation', 'Deep excavation', [r, g, b], 150, 20, ['excavation', 'advanced_electronics'], ['layer -2', 'abyssal_alloy'], { precision: 2 }),
  T('signal_theory', 'Signal theory', [r, g, b], 200, 20, ['deep_excavation', 'automation2'], ['transmitter', 'resonance_pack']),
  T('resonance', 'Resonance', [r, g, b, 'resonance_pack'], 100, 30, ['signal_theory'], ['clarity'], { precision: 3 }),
];
export const TECH = Object.fromEntries(TECHS.map(t => [t.id, t]));

// The quickbar starts empty and fills itself as you first get each kind of building (see ui.js).
export const HOTBAR_SIZE = 10;
export const OLD_HOTBARS = [['belt', 'burner_inserter', 'inserter', 'burner_drill', 'drill', 'furnace', 'wooden_chest', 'small_pole', 'assembler', 'frame']];

// The aliens only speak in mechanisms they have heard from you.
// Each exchange: their message, then a request answered by sending a sentence containing `ask`.
export const CONVERSATION = [
  { seq: ['pulse', 'pulse', 'pulse'], text: 'a rhythm. it is ours. no. it is not ours', ask: ['flow'], hint: 'show us something moving' },
  { seq: ['flow', 'flow', 'pulse'], text: 'we have been moving toward you for a very long time', ask: ['swing', 'keep'], hint: 'what do you hold and how do you lift it' },
  { seq: ['swing', 'keep', 'swing'], text: 'you lift and you keep. we lifted once. we kept it too long', ask: ['heat', 'make'], hint: 'show us how you change things' },
  { seq: ['heat', 'make', 'heat'], text: 'everything we make is warm for a moment and then it is only ours', ask: ['bore', 'below'], hint: 'where do you go when you go down' },
  { seq: ['bore', 'below', 'below'], text: 'our oldest ones went down and did not come back up', ask: ['hollow', 'above'], hint: 'do you build over empty places' },
  { seq: ['hollow', 'above', 'hollow'], text: 'we live in the spaces underneath things. we thought you did too', ask: ['tunnel', 'split'], hint: 'show us how you come apart' },
  { seq: ['split', 'tunnel', 'flow'], text: 'when we were split we went under each other and came out somewhere else', ask: ['think', 'shine'], hint: 'what do you do with light' },
  { seq: ['think', 'abyss', 'think'], text: 'we thought you were a memory we were having', ask: ['rise', 'abyss', 'swing'], hint: 'lift something out of the deepest place' },
  { seq: ['rise', 'pulse', 'hollow', 'swing'], text: 'we made a hole in ourselves the exact shape of you. we are lifting it toward you now' },
];
export const AMBIENT = [
  { seq: ['heat', 'heat', 'keep'], text: 'we are warm and we are afraid to spend it' },
  { seq: ['swing', 'hollow', 'swing'], text: 'something lifted over an emptiness and never set down' },
  { seq: ['make', 'pulse', 'make'], text: 'every word we send is wound tight around something we cannot say' },
  { seq: ['below', 'heat', 'above'], text: 'grief rises the way heat leaves a deep place' },
  { seq: ['flow', 'keep', 'flow', 'keep'], text: 'we do not know whether to hold you or pass you along' },
  { seq: ['pulse', 'pulse', 'swing'], text: 'we are reaching. are you reaching' },
  { seq: ['keep', 'keep', 'keep'], text: 'we have kept everything. it did not help' },
  { seq: ['spark', 'flow', 'spark'], text: 'you burn to move. we did that. it is a good age' },
  { seq: ['split', 'split', 'keep'], text: 'we divided what we had until it was small enough to carry' },
  { seq: ['shine', 'think'], text: 'the light that reaches you left us before we knew you' },
  { seq: ['tunnel', 'rise'], text: 'we went under the problem and came up on the other side of it' },
];
