// Static game data: items, entities, recipes, research, precision tiers, the alien script.

export const TIERS = [
  { need: 0,   name: 'Coarse',     res: 5,  up: 1 },
  { need: 15,  name: 'Fitted',     res: 8,  up: 2 },
  { need: 45,  name: 'Toleranced', res: 12, up: 3 },
  { need: 110, name: 'Resonant',   res: 20, up: 4 },
];

// Fluids move through pipes and between neighbouring buildings that list them in `fluids` (see fluids.js).
// `fuel` is the energy in MJ per unit when an engine burns it; `barrel` means it can be put in barrels.
export const FLUIDS = {
  water: { name: 'Water', color: 0x3a8ad8, barrel: true },
  steam: { name: 'Steam', color: 0xd8dde4 },
  crude_oil: { name: 'Crude oil', color: 0x3a2a34, barrel: true },
  heavy_oil: { name: 'Heavy fuel oil', color: 0x9a5a1a, fuel: .6, barrel: true },
  diesel: { name: 'Diesel', color: 0xd8b03a, fuel: 1, barrel: true },
  gasoline: { name: 'Gasoline', color: 0x6ad84a, fuel: .9, barrel: true },
  jet_fuel: { name: 'Jet fuel', color: 0x4ac8e8, fuel: 1.5, barrel: true },
};
export const FUELS = Object.keys(FLUIDS).filter(f => FLUIDS[f].fuel);
export const BARREL_SIZE = 50;

// Road surfaces (see roads in sim.js). Each is also the item you lay it with. `speed` is how fast trucks go on it.
export const ROADS = {
  gravel_road:   { name: 'Gravel road', speed: .7, paint: [116, 106, 90] },
  cobble_road:   { name: 'Cobblestone road', speed: .85, paint: [112, 104, 98] },
  asphalt_road:  { name: 'Asphalt road', speed: 1, paint: [50, 52, 58] },
  concrete_road: { name: 'Concrete road', speed: 1, paint: [146, 146, 142] },
  path_tile:     { name: 'Path', walk: true, paint: [166, 158, 146], desc: 'Paving for people. Walking on it is faster. Roads use it for sidewalks.' },
};
export const ROAD_IDS = Object.keys(ROADS);
export const MARKINGS = [['none', 'No markings'], ['dashed', 'Dashed centre'], ['solid', 'Solid centre'], ['double', 'Double yellow']];
export const SIDEWALK_SPEED = 1.35;

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
  // tools: hold one and click two poles to string a cable between them (see VOLTAGES)
  power_cable:       { name: 'Power cable', color: 0xd88a4a, shape: 'cable', tool: 'link', reach: 32, desc: 'Click two poles of the same voltage to connect them, up to 32 tiles apart. Click a linked pair again to take it down.' },
  transformer_cable: { name: 'Transformer cable', color: 0x6ab8ff, shape: 'cable', tool: 'link', reach: 32, transformer: true, desc: 'Connects a transformer station to a high voltage line, up to 32 tiles away.' },
  rail_signal:    { name: 'Rail signal', color: 0xd84a3a, shape: 'signal', tool: 'signal', desc: 'Click a rail to split the track into blocks there: only one train at a time in each block. R turns which side it stands on.' },
  barrel:         { name: 'Empty barrel', color: 0x8a96a6, shape: 'barrel', desc: 'Fill it with 50 fluid in a barreling station.' },
  solid_fuel:     { name: 'Solid fuel', color: 0x8a6a3a, shape: 'brick', fuel: 12 },
  rubber:         { name: 'Rubber', color: 0x2a2a2a, shape: 'coil' },
  chassis:        { name: 'Chassis', color: 0x6a7480, shape: 'part' },
  wheel:          { name: 'Wheel', color: 0x30333a, shape: 'wheel' },
  hull:           { name: 'Hull', color: 0x5a6a7a, shape: 'hull' },
  armor_plate:    { name: 'Armour plate', color: 0x5a6250, shape: 'plate' },
  turret:         { name: 'Turret', color: 0x6a7258, shape: 'part' },
  fishing_net:    { name: 'Fishing net', color: 0xb8a878, shape: 'net', desc: 'Put it on a boat. The boat catches fish it passes. Past one stack of fish the net strains, and at two it breaks.' },
  raw_fish:       { name: 'Raw fish', color: 0x8ab0c8, shape: 'fish', food: 60, desc: 'Food. Hold it and click to eat: you walk and mine faster for a minute. Cook it in a furnace for longer.' },
  cooked_fish:    { name: 'Cooked fish', color: 0xd8904a, shape: 'fish', food: 180, desc: 'Food. Hold it and click to eat: you walk and mine faster for three minutes.' },
};
for (const id of ROAD_IDS) ITEMS[id] = { name: ROADS[id].name, color: (ROADS[id].paint[0] << 16) | (ROADS[id].paint[1] << 8) | ROADS[id].paint[2], shape: 'road', road: id,
  desc: ROADS[id].desc ?? `Hold it and drag to lay road. The road panel next to your hand sets width, lanes, markings and sidewalks. Trucks drive at ${Math.round(ROADS[id].speed * 100)}% speed on it.` };
for (const [f, d] of Object.entries(FLUIDS)) if (d.barrel) ITEMS[f + '_barrel'] = { name: d.name + ' barrel', color: d.color, shape: 'barrel', barrel: f, desc: `${BARREL_SIZE} ${d.name.toLowerCase()}. Empty it in a barreling station${d.fuel ? ', a depot or a vehicle that burns it' : ''}.` };

// Engines burn one fuel each. A vehicle's engine and frame decide how fast it goes and what it burns.
export const ENGINES = {
  petrol_engine:  { name: 'Petrol engine', short: 'petrol', fuel: 'gasoline', power: 300, color: 0x5ab84a },
  diesel_engine:  { name: 'Diesel engine', short: 'diesel', fuel: 'diesel', power: 600, color: 0xc8a03a },
  marine_engine:  { name: 'Marine engine', short: 'marine', fuel: 'heavy_oil', power: 900, color: 0x9a5a2a },
  turbine_engine: { name: 'Turbine engine', short: 'turbine', fuel: 'jet_fuel', power: 1500, color: 0x4ab8d8 },
};
for (const [id, en] of Object.entries(ENGINES)) ITEMS[id] = { name: en.name, color: en.color, shape: 'engine', engine: id,
  desc: `${en.power} kW, burns ${FLUIDS[en.fuel].name.toLowerCase()} (${FLUIDS[en.fuel].fuel} MJ a unit). Goes into vehicles in a vehicle factory.` };
// `way` is what a vehicle moves on: land (anywhere dry), road, rail or sea. mass is in tonnes-ish units.
export const FRAMES = {
  car:         { name: 'Car', way: 'land', mass: 1, vmax: 12, cargo: 8, tank: 100, len: .9, color: 0xd84a3a, engines: ['petrol_engine', 'diesel_engine'], parts: { chassis: 1, wheel: 4, iron_plate: 10 }, time: 8, tech: 'vehicles', desc: 'Drive it yourself (B to get in), anywhere on dry land.' },
  truck:       { name: 'Truck', way: 'road', mass: 3, vmax: 10, cargo: 32, tank: 200, len: 1.2, color: 0x3a7ad8, engines: ['diesel_engine', 'turbine_engine'], parts: { chassis: 2, wheel: 6, chest: 2 }, time: 10, tech: 'vehicles', desc: 'Carries 32 slots, only on roads. Give it a route and it drives itself.' },
  tank:        { name: 'Tank', way: 'land', mass: 6, vmax: 8, cargo: 16, tank: 300, len: 1.2, color: 0x6a7258, armor: true, engines: ['diesel_engine', 'turbine_engine'], parts: { chassis: 2, armor_plate: 12, turret: 1, wheel: 8 }, time: 15, tech: 'tanks', desc: 'Armoured and heavy. Drives through trees.' },
  boat:        { name: 'Cargo boat', way: 'sea', mass: 4, vmax: 9, cargo: 48, tank: 400, len: 1.6, color: 0xe0e4ea, net: true, engines: ['marine_engine', 'diesel_engine', 'turbine_engine'], parts: { hull: 2, chest: 2 }, time: 12, tech: 'shipping', desc: 'Sails between ports with 48 slots. Takes a fishing net.' },
  locomotive:  { name: 'Locomotive', way: 'rail', mass: 6, vmax: 14, cargo: 0, tank: 500, len: .96, color: 0xd8a02a, engines: ['diesel_engine', 'turbine_engine'], parts: { chassis: 3, wheel: 8, steel: 10 }, time: 15, tech: 'railways', desc: 'Pulls the cargo wagons behind it. Put it on a rail.' },
  cargo_wagon: { name: 'Cargo wagon', way: 'rail', mass: 2, vmax: 14, cargo: 40, tank: 0, len: .96, color: 0x8a6a4a, engines: [null], parts: { chassis: 2, wheel: 8, chest: 2 }, time: 8, tech: 'railways', desc: 'Put it on a rail right behind a locomotive or another wagon.' },
};
// how freely each way rolls: rails are smooth, water drags
const WAY_ROLL = { land: 1, road: 1.1, rail: 1.8, sea: .9 };
export const VEHICLES = {};   // vehicle item id -> { frame, engine }
for (const [f, fr] of Object.entries(FRAMES)) for (const en of fr.engines) {
  const id = en ? `${f}_${ENGINES[en].short}` : f;
  VEHICLES[id] = { frame: f, engine: en };
  ITEMS[id] = { name: en ? `${fr.name}, ${ENGINES[en].short}` : fr.name, color: fr.color, shape: 'vehicle', vehicle: id, desc: fr.desc };
}
// Engine power against the weight it moves gives top speed and acceleration; extra mass (wagons) slows a train.
export function vehicleStats(id, extraMass = 0) {
  const v = VEHICLES[id]; if (!v) return null;
  const fr = FRAMES[v.frame], en = ENGINES[v.engine], mass = fr.mass + extraMass, power = en?.power ?? 0;
  const top = power ? Math.min(fr.vmax, 4 * WAY_ROLL[fr.way] * Math.sqrt(power / (mass * 100))) : 0;
  return { frame: v.frame, engine: v.engine, way: fr.way, mass, power, fuel: en?.fuel ?? null, top, accel: power / (mass * 70) * WAY_ROLL[fr.way], cargo: fr.cargo, tank: fr.tank,
    burn: power && en ? power / 1000 / FLUIDS[en.fuel].fuel : 0 };   // fuel units per second at full throttle
}

// Ground tiles on the surface. `liquid` tiles can't be walked on or built on (except by things marked onWater).
// `current` is how fast a flowing tile carries things, in tiles per second, along its stored flow direction.
export const TILES = [
  { id: 'ground', name: 'Ground', map: 0x5a4c38 },
  { id: 'water', name: 'Water', liquid: true, map: 0x1f4a72, paint: [34, 74, 112] },
  { id: 'river', name: 'River', liquid: true, current: 1.4, map: 0x2f6a9a, paint: [44, 96, 138] },
];
export const TILE = Object.fromEntries(TILES.map((t, i) => [t.id, i]));


// Voltage tiers. Poles of one tier wire to each other; transformer stations step between tiers.
export const VOLTAGES = [
  { name: 'Low voltage', wire: 0xb8683a },
  { name: 'High voltage', wire: 0x6ab8ff },
];

// kind drives simulation + model. vol = engineering volume when active. glyph = what the aliens hear.
export const ENTITIES = {
  belt:             { name: 'Belt', kind: 'belt', speed: 1.5, color: 0xc9a227, vol: .25, glyph: 'flow', desc: 'Moves items. Feed into its side to merge.' },
  fast_belt:        { name: 'Fast belt', kind: 'belt', speed: 3, color: 0xd8483a, vol: .35, glyph: 'flow', desc: 'Twice as fast.' },
  express_belt:     { name: 'Express belt', kind: 'belt', speed: 4.5, color: 0x3a9ad8, vol: .5, glyph: 'flow', desc: 'Three times as fast.' },
  underground:      { name: 'Underground belt', kind: 'underground', speed: 3, color: 0xc9a227, range: 5, vol: .6, glyph: 'tunnel', desc: 'Place an entrance, then an exit up to 4 tiles ahead. Passes under anything between, roads too.' },
  fast_underground: { name: 'Fast underground belt', kind: 'underground', speed: 4.5, color: 0xd8483a, range: 7, vol: .7, glyph: 'tunnel', desc: 'Entrance and exit up to 6 tiles apart.' },
  express_underground: { name: 'Express underground belt', kind: 'underground', speed: 6, color: 0x3a9ad8, range: 9, vol: .8, glyph: 'tunnel', desc: 'Entrance and exit up to 8 tiles apart.' },
  splitter:         { name: 'Splitter', kind: 'splitter', speed: 3, color: 0xc9a227, vol: .8, glyph: 'split', desc: 'Deals items in turn to the belts in front, left and right of it.' },
  lift:             { name: 'Lift', kind: 'lift', speed: 2, color: 0x58c8d8, vol: 1, glyph: 'rise', desc: 'Carries items one layer up or down. Press V to choose.' },
  burner_inserter:  { name: 'Burner inserter', kind: 'inserter', swing: .9, reach: 1, burner: true, color: 0x9a6a3a, vol: .4, glyph: 'swing', desc: 'Slow, needs no power. Burns fuel, and keeps fuel it carries when it runs dry.' },
  inserter:         { name: 'Inserter', kind: 'inserter', swing: .6, reach: 1, power: 13, color: 0xe0a92e, vol: .5, glyph: 'swing', desc: 'Moves items from behind it to in front of it.' },
  long_inserter:    { name: 'Long arm', kind: 'inserter', swing: .8, reach: 2, power: 20, color: 0xc8483a, vol: .75, glyph: 'swing', desc: 'Reaches two tiles.' },
  fast_inserter:    { name: 'Fast inserter', kind: 'inserter', swing: .25, reach: 1, power: 46, color: 0x3a8fd8, vol: .8, glyph: 'swing', desc: 'Swings more than twice as fast.' },
  filter_inserter:  { name: 'Filter inserter', kind: 'inserter', swing: .25, reach: 1, power: 53, color: 0xb04ad8, filter: true, vol: 1, glyph: 'swing', desc: 'Fast, and only moves the item you choose.' },
  burner_drill:     { name: 'Burner drill', kind: 'drill', rate: .25, burner: true, fuelStacks: 1, color: 0x6a5a48, vol: .8, glyph: 'bore', desc: 'Mines without power. Burns coal or wood. Holds a full stack of fuel.' },
  drill:            { name: 'Electric drill', kind: 'drill', rate: .5, power: 90, color: 0x5d6b43, vol: 1, glyph: 'bore', desc: 'Mines the deposit under it and pushes ore forward.' },
  furnace:          { name: 'Stone furnace', kind: 'furnace', speed: 1, burner: true, color: 0x857a6d, vol: 1, glyph: 'heat', desc: 'Smelts. Burns coal.' },
  electric_furnace: { name: 'Electric furnace', kind: 'furnace', speed: 2, power: 180, color: 0x6a7480, vol: 1.5, glyph: 'heat', desc: 'Smelts twice as fast. No fuel needed.' },
  assembler:        { name: 'Assembler', kind: 'assembler', speed: .75, power: 75, color: 0x35567a, vol: 1.5, glyph: 'make', desc: 'Crafts the recipe you choose.' },
  assembler2:       { name: 'Assembler II', kind: 'assembler', speed: 1.5, power: 150, color: 0x2f7a72, vol: 2, glyph: 'make', desc: 'Crafts twice as fast.' },
  lab:              { name: 'Lab', kind: 'lab', speed: 1, power: 60, color: 0xd8dde4, vol: 1.5, glyph: 'think', desc: 'Uses science packs to research.' },
  wooden_chest:     { name: 'Wooden chest', kind: 'chest', cap: 16, color: 0x8a5a2c, vol: .3, glyph: 'keep', desc: '16 slots of storage.' },
  chest:            { name: 'Iron chest', kind: 'chest', cap: 32, color: 0x8b8f98, vol: .5, glyph: 'keep', desc: '32 slots of storage.' },
  frame:            { name: 'Hollow frame', kind: 'frame', color: 0x8f9aa6, vol: .75, glyph: 'hollow', desc: 'You can build inside it and on top of it.' },
  small_pole:       { name: 'Small electric pole', kind: 'pole', volt: 0, supply: 2, wire: 7.5, top: 1.26, color: 0x8a5a2c, vol: .1, glyph: 'spark', desc: 'Powers machines in a 5x5 area. Connects to poles up to 7.5 tiles away.' },
  medium_pole:      { name: 'Medium electric pole', kind: 'pole', volt: 0, supply: 3, wire: 9, top: 1.58, color: 0x8a929c, vol: .2, glyph: 'spark', desc: 'Powers a 7x7 area. Connects up to 9 tiles.' },
  power_line:       { name: 'Power line', kind: 'pole', volt: 1, supply: 10, wire: 24, top: 2.9, color: 0x9aa8b8, vol: .3, glyph: 'spark', desc: 'High voltage. Powers everything in a 21x21 area and wires to other lines up to 24 tiles away.' },
  // volts[0] is the side that wires itself up; the other sides need a transformer cable
  transformer:      { name: 'Transformer station', kind: 'pole', volts: [0, 1], supply: 1, wire: 7.5, top: 1.2, color: 0x4a6a8a, vol: .5, glyph: 'spark', desc: 'Steps power between voltages. Wires to low voltage poles nearby; link it to a power line with a transformer cable.' },
  generator:        { name: 'Steam generator', kind: 'generator', out: 900, color: 0x6b5a4a, vol: 1.5, glyph: 'spark', desc: 'Burns coal or wood. Put it next to a pole (900 kW).' },
  // Factorio's chain: one pump feeds 20 boilers, one boiler feeds 2 engines (rates in units per second).
  water_pump:       { name: 'Water pump', kind: 'pump', onWater: true, fluids: { water: 'out' }, rate: 1200, color: 0x3a7ab8, vol: .4, glyph: 'flow', desc: 'Place it on water. Pumps up to 1200 water/s into boilers next to it: enough for 20.' },
  boiler:           { name: 'Boiler', kind: 'boiler', burner: true, fuelStacks: 1, fluids: { water: 'in', steam: 'out' }, heat: 1.8, steam: 60, color: 0x8a5a3a, vol: 1, glyph: 'heat', desc: 'Burns fuel to turn 60 water/s into steam (1.8 MW). Boilers and engines pass water and steam to neighbours.' },
  steam_engine:     { name: 'Steam engine', kind: 'engine', fluids: { steam: 'in' }, out: 900, steam: 30, color: 0x7a8a6a, vol: 1.5, glyph: 'spark', desc: 'Turns 30 steam/s into up to 900 kW. Only works as hard as the network needs. Put it in a pole\'s area.' },
  solar:            { name: 'Solar panel', kind: 'solar', out: 60, color: 0x2a4a7a, vol: 1, glyph: 'shine', desc: '60 kW from starlight, forever.' },
  transmitter:      { name: 'Transmitter', kind: 'transmitter', power: 500, color: 0x4b4f5a, vol: 3, glyph: 'pulse', desc: 'Sends what it hears around it. Burns resonance packs.' },
  // Fluid handling (fluids.js). `cap` is how much fluid one tile holds. Pipe-like things carry whatever their line carries.
  pipe:             { name: 'Pipe', kind: 'pipe', cap: 100, color: 0x8a96a6, vol: .05, glyph: 'flow', desc: 'Carries one fluid. Joins every pipe and fluid port next to it, so lines branch wherever pipes meet. Long lines carry less per second.' },
  underground_pipe: { name: 'Underground pipe', kind: 'upipe', cap: 100, range: 11, color: 0x6a7686, vol: .2, glyph: 'tunnel', desc: 'Place one end, then the other up to 10 tiles ahead, facing the same way. Fluid passes under belts, roads and rails between.' },
  pump:             { name: 'Pump', kind: 'fpump', cap: 100, rate: 6000, power: 30, color: 0x3a7ab8, vol: .4, glyph: 'flow', desc: 'Pushes fluid one way, from behind it to in front, up to 6000/s. It splits a line in two and gives the far side full flow again.' },
  valve:            { name: 'Valve', kind: 'valve', cap: 100, color: 0xc84a3a, vol: .2, glyph: 'flow', desc: 'Lets fluid through one way only. Set it to pass only overflow (input side more than 80% full) or only to top up (output side under 50%).' },
  storage_tank:     { name: 'Storage tank', kind: 'tank', cap: 25000, color: 0x9aa4b0, vol: .5, glyph: 'keep', desc: 'Holds 25,000 units of one fluid. Connects on every side.' },
  oil_pump:         { name: 'Pumpjack', kind: 'oilpump', rate: 10, power: 90, cap: 100, ports: [{ side: 0, io: 'out', fluid: 'crude_oil' }], color: 0x6a5a8a, vol: 1, glyph: 'bore', desc: 'Place it on crude oil. Pumps 10 crude/s at 100% yield out of its front. Deposits never run dry, but slow down to 20%.' },
  refinery:         { name: 'Oil refinery', kind: 'assembler', model: 'refinery', cats: ['refine'], speed: 1, power: 420, cap: 200, color: 0x8a5a4a, vol: 2.5, glyph: 'heat',
    ports: [{ side: 2, io: 'in' }, { side: 3, io: 'out' }, { side: 0, io: 'out' }, { side: 1, io: 'out' }], desc: 'Splits crude oil into fuels. Crude goes in the back; the products come out left, front and right.' },
  chem_plant:       { name: 'Chemical plant', kind: 'assembler', model: 'chem', cats: ['chem'], speed: 1, power: 210, cap: 100, color: 0x4a8a6a, vol: 2, glyph: 'make',
    ports: [{ side: 2, io: 'in' }, { side: 3, io: 'in' }, { side: 0, io: 'out' }], desc: 'Fluid chemistry. Fluids go in the back and left side and come out the front; items by inserter.' },
  barreler:         { name: 'Barreling station', kind: 'assembler', model: 'barreler', cats: ['barrel'], speed: 1, power: 50, cap: 100, color: 0x6a7a5a, vol: 1, glyph: 'keep',
    ports: [{ side: 2, io: 'in' }, { side: 2, io: 'out' }], desc: 'Fills empty barrels from a pipe at its back, or empties barrels into it. Pick fill or empty as its recipe.' },
  fuel_generator:   { name: 'Diesel generator', kind: 'fgen', fluids: { diesel: 'in' }, out: 1500, cap: 100, color: 0x7a6a4a, vol: 1.5, glyph: 'spark', desc: 'Burns diesel from a pipe for up to 1.5 MW. Only works as hard as the network needs. Put it in a pole\'s area.' },
  vehicle_factory:  { name: 'Vehicle factory', kind: 'assembler', model: 'vfactory', cats: ['vehicle'], speed: 1, power: 300, color: 0x5a6a8a, vol: 3, glyph: 'make', desc: 'Builds vehicles. Pick a frame and an engine: together they decide speed and fuel.' },
  // Depots: storage for goods and fuel where vehicles dock. They sit next to the rail, road or water they serve.
  train_station:    { name: 'Train station', kind: 'depot', way: 'rail', cap: 40, fluidCap: 2000, color: 0xb84a3a, vol: 1, glyph: 'keep', desc: 'Put it beside a rail. Trains stop here, refuel from its tank, then load or unload by their schedule and its settings.' },
  truck_depot:      { name: 'Truck depot', kind: 'depot', way: 'road', cap: 32, fluidCap: 1000, color: 0x3a7ad8, vol: 1, glyph: 'keep', desc: 'Put it beside a road. Trucks park at the road tile next to it, refuel, and load or unload.' },
  port:             { name: 'Port', kind: 'depot', way: 'sea', cap: 48, fluidCap: 2000, color: 0x4a8aa8, vol: 1, glyph: 'keep', desc: 'Put it on the shore. Boats dock at the water next to it, refuel, and load or unload. Fish from nets unload here too.' },
  rail:             { name: 'Rail', kind: 'rail', shared: true, onRoad: true, color: 0x8a7a6a, vol: 0, glyph: 'flow', desc: 'Drag to lay track. Rails join every rail next to them: corners curve, three or four ways make a junction. Trains belong to no factory.' },
};
// How fluids connect: `fluids` buildings join neighbours on every side. Boilers take pipes only at their drum ends
// (water) and back (steam), so one pipe can't touch both. `ports` machines connect only at the listed sides.
ENTITIES.boiler.pipeSides = { water: [1, 3], steam: [2] };
for (const id of ['water_pump', 'boiler', 'steam_engine']) ENTITIES[id].cap = 200;
for (const [id, e] of Object.entries(ENTITIES)) ITEMS[id] = { name: e.name, color: e.color, shape: 'machine', entity: id };

// Stack sizes decide how many inventory / chest slots things take.
const STACKS = { ore: 50, crystal: 50, wood: 100, plate: 100, brick: 100, lens: 100, gear: 100, cable: 200, chip: 200, coil: 100, pack: 200,
  barrel: 10, engine: 10, vehicle: 1, part: 20, wheel: 50, hull: 10, signal: 50, net: 5, fish: 50, road: 100 };
const MACHINE_STACKS = { belt: 100, fast_belt: 100, express_belt: 100, small_pole: 50, medium_pole: 50, lab: 10, generator: 10, transmitter: 5, frame: 50,
  power_line: 20, transformer: 10, water_pump: 20, steam_engine: 10, pipe: 100, rail: 100, storage_tank: 10, refinery: 10, vehicle_factory: 5 };
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
  R('water_pump', { circuit: 2, gear: 1, iron_plate: 2 }, .5),
  R('boiler', { furnace: 1, iron_plate: 4 }, .5),
  R('steam_engine', { gear: 8, iron_plate: 15 }, .5),
  R('power_cable', { cable: 4, iron_plate: 1 }, .5),
  R('power_line', { steel: 6, circuit: 4, copper_plate: 6 }, 1, { tech: 'high_voltage' }),
  R('transformer', { steel: 10, coil: 6, circuit: 6 }, 2, { tech: 'high_voltage' }),
  R('transformer_cable', { power_cable: 2, steel: 1 }, .5, { tech: 'high_voltage' }),
  R('solar', { steel: 5, circuit: 15, copper_plate: 5 }, 10, { tech: 'solar' }),
  R('transmitter', { adv_circuit: 20, steel: 20, lens: 10, abyssal_alloy: 10 }, 10, { tech: 'signal_theory' }),
  { ...R('fast_underground', { underground: 2, gear: 8 }, 1, { tech: 'logistics2' }), out: { fast_underground: 2 } },
  { ...R('express_underground', { fast_underground: 2, steel: 4, circuit: 2 }, 1, { tech: 'logistics3' }), out: { express_underground: 2 } },
  // fluids and oil
  R('pipe', { iron_plate: 1 }, .5, { tech: 'fluid_handling' }),
  { ...R('underground_pipe', { pipe: 10, iron_plate: 5 }, 1, { tech: 'fluid_handling' }), out: { underground_pipe: 2 } },
  R('pump', { circuit: 2, gear: 1, pipe: 1 }, 1, { tech: 'fluid_handling' }),
  R('valve', { pipe: 2, gear: 1, circuit: 1 }, .5, { tech: 'fluid_handling' }),
  R('storage_tank', { iron_plate: 20, steel: 5 }, 3, { tech: 'fluid_handling' }),
  R('barrel', { iron_plate: 1 }, .5, { tech: 'fluid_handling' }),
  R('barreler', { iron_plate: 10, gear: 5, pipe: 5, circuit: 2 }, 2, { tech: 'fluid_handling' }),
  R('oil_pump', { steel: 5, gear: 10, circuit: 5, pipe: 10 }, 5, { tech: 'oil_processing' }),
  R('refinery', { steel: 15, gear: 10, circuit: 10, pipe: 10, brick: 10 }, 8, { tech: 'oil_processing' }),
  R('chem_plant', { steel: 5, gear: 5, circuit: 5, pipe: 5 }, 5, { tech: 'oil_processing' }),
  R('fuel_generator', { steel: 10, gear: 10, pipe: 5, circuit: 5 }, 5, { tech: 'oil_processing' }),
  // roads, rails, depots, vehicles
  { ...R('gravel_road', { stone: 2 }, .5, { tech: 'roads' }), out: { gravel_road: 4 } },
  { ...R('cobble_road', { brick: 2 }, .5, { tech: 'roads' }), out: { cobble_road: 4 } },
  { ...R('path_tile', { brick: 1 }, .5, { tech: 'roads' }), out: { path_tile: 2 } },
  { ...R('rail', { steel: 1, iron_plate: 1, stone: 1 }, .5, { tech: 'railways' }), out: { rail: 2 } },
  R('rail_signal', { circuit: 1, iron_plate: 3 }, .5, { tech: 'railways' }),
  R('train_station', { steel: 5, chest: 2, circuit: 5, pipe: 5 }, 2, { tech: 'railways' }),
  R('truck_depot', { iron_plate: 10, chest: 2, pipe: 5, brick: 10 }, 2, { tech: 'vehicles' }),
  R('port', { steel: 10, chest: 2, pipe: 5, wood: 20 }, 2, { tech: 'shipping' }),
  R('vehicle_factory', { steel: 20, gear: 20, circuit: 10, assembler: 1 }, 5, { tech: 'vehicles' }),
  R('chassis', { steel: 4, gear: 6, iron_plate: 4 }, 2, { tech: 'vehicles' }),
  R('wheel', { rubber: 2, steel: 1 }, 1, { tech: 'vehicles' }),
  R('hull', { steel: 8, wood: 10 }, 3, { tech: 'shipping' }),
  R('armor_plate', { steel: 5 }, 2, { tech: 'tanks' }),
  R('turret', { steel: 10, gear: 10, circuit: 10 }, 5, { tech: 'tanks' }),
  R('petrol_engine', { steel: 4, gear: 8, pipe: 4 }, 4, { tech: 'vehicles' }),
  R('diesel_engine', { steel: 8, gear: 10, pipe: 4, circuit: 2 }, 5, { tech: 'vehicles' }),
  R('marine_engine', { steel: 12, gear: 12, pipe: 8, circuit: 4 }, 6, { tech: 'shipping' }),
  R('turbine_engine', { steel: 10, adv_circuit: 4, pipe: 8, gear: 10 }, 8, { tech: 'advanced_oil' }),
  R('fishing_net', { wood: 5, cable: 5 }, 1, { tech: 'shipping' }),
  { id: 'cooked_fish', cat: 'smelt', in: { raw_fish: 1 }, out: { cooked_fish: 1 }, time: 3.2 },
];
// Fluid recipes: `fin` and `fout` are drawn and made bit by bit over the craft time, through the machine's ports
// (the fluids in `fin` go to its 'in' ports in order, `fout` to its 'out' ports). `icon` and `name` are for the panel.
const F = (id, cat, name, icon, time, o) => ({ id, cat, name, icon, time, in: {}, out: {}, ...o });
RECIPES.push(
  F('basic_refining', 'refine', 'Basic refining', 'diesel', 5, { fin: { crude_oil: 100 }, fout: { heavy_oil: 30, diesel: 30, gasoline: 40 }, tech: 'oil_processing' }),
  F('advanced_refining', 'refine', 'Advanced refining', 'jet_fuel', 5, { fin: { crude_oil: 100 }, fout: { heavy_oil: 20, diesel: 40, jet_fuel: 40 }, tech: 'advanced_oil' }),
  F('heavy_cracking', 'chem', 'Heavy oil cracking', 'diesel', 2, { fin: { heavy_oil: 40, water: 30 }, fout: { diesel: 30 }, tech: 'oil_processing' }),
  F('jet_blending', 'chem', 'Jet fuel blending', 'jet_fuel', 2, { fin: { diesel: 20, gasoline: 20 }, fout: { jet_fuel: 30 }, tech: 'advanced_oil' }),
  F('rubber', 'chem', 'Rubber', 'rubber', 2, { fin: { heavy_oil: 20 }, in: { coal: 1 }, out: { rubber: 2 }, tech: 'oil_processing' }),
  F('solid_fuel', 'chem', 'Solid fuel', 'solid_fuel', 2, { fin: { gasoline: 20 }, out: { solid_fuel: 1 }, tech: 'oil_processing' }),
  F('asphalt_road', 'chem', 'Asphalt', 'asphalt_road', 2, { fin: { heavy_oil: 10 }, in: { stone: 2 }, out: { asphalt_road: 4 }, tech: 'oil_processing' }),
  F('concrete_road', 'chem', 'Concrete', 'concrete_road', 3, { fin: { water: 50 }, in: { brick: 2, iron_ore: 1 }, out: { concrete_road: 5 }, tech: 'oil_processing' }),
);
for (const [f, d] of Object.entries(FLUIDS)) if (d.barrel) RECIPES.push(
  F('fill_' + f, 'barrel', 'Fill ' + d.name.toLowerCase() + ' barrel', f + '_barrel', .5, { in: { barrel: 1 }, fin: { [f]: BARREL_SIZE }, out: { [f + '_barrel']: 1 }, tech: 'fluid_handling' }),
  F('empty_' + f, 'barrel', 'Empty ' + d.name.toLowerCase() + ' barrel', 'barrel', .5, { in: { [f + '_barrel']: 1 }, fout: { [f]: BARREL_SIZE }, out: { barrel: 1 }, tech: 'fluid_handling' }));
for (const [id, v] of Object.entries(VEHICLES)) {
  const fr = FRAMES[v.frame];
  RECIPES.push({ id, cat: 'vehicle', in: { ...fr.parts, ...(v.engine ? { [v.engine]: 1 } : {}) }, out: { [id]: 1 }, time: fr.time, tech: v.engine === 'turbine_engine' ? 'advanced_oil' : fr.tech });
}
export const RECIPE = Object.fromEntries(RECIPES.map(r => [r.id, r]));
export const recipeIcon = r => r.icon || r.id;
export const recipeName = r => r.name || ITEMS[r.id]?.name || r.id;

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
  T('high_voltage', 'High voltage', [r, g], 60, 15, ['electric_distribution'], ['power_line', 'transformer', 'transformer_cable']),
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
  T('factory_planning', 'Factory planning', [r], 30, 10, [], ['factories']),
  T('roads', 'Roads', [r], 20, 10, [], ['gravel_road', 'cobble_road', 'path_tile']),
  T('fluid_handling', 'Fluid handling', [r, g], 50, 10, ['steel', 'logistic_science'], ['pipe', 'underground_pipe', 'pump', 'valve', 'storage_tank', 'barrel', 'barreler']),
  T('oil_processing', 'Oil processing', [r, g], 75, 15, ['fluid_handling'], ['oil_pump', 'refinery', 'chem_plant', 'basic_refining', 'heavy_cracking', 'rubber', 'solid_fuel', 'asphalt_road', 'concrete_road', 'fuel_generator']),
  T('vehicles', 'Vehicles', [r, g], 75, 15, ['oil_processing', 'automation'], ['vehicle_factory', 'chassis', 'wheel', 'petrol_engine', 'diesel_engine', 'car_petrol', 'car_diesel', 'truck_diesel', 'truck_depot']),
  T('railways', 'Railways', [r, g], 75, 15, ['vehicles'], ['rail', 'rail_signal', 'train_station', 'locomotive_diesel', 'cargo_wagon']),
  T('shipping', 'Shipping', [r, g], 60, 15, ['vehicles'], ['port', 'hull', 'marine_engine', 'boat_marine', 'boat_diesel', 'fishing_net']),
  T('advanced_oil', 'Advanced oil processing', [r, g, b], 100, 15, ['oil_processing', 'precision_science'], ['advanced_refining', 'jet_blending', 'turbine_engine', 'truck_turbine', 'locomotive_turbine', 'boat_turbine']),
  T('tanks', 'Tanks', [r, g, b], 100, 20, ['vehicles', 'advanced_oil'], ['armor_plate', 'turret', 'tank_diesel', 'tank_turbine']),
];
for (const [t, u] of [['logistics2', 'fast_underground'], ['logistics3', 'express_underground']]) TECHS.find(x => x.id === t).unlocks.push(u);
export const TECH = Object.fromEntries(TECHS.map(t => [t.id, t]));

// The quickbar starts empty and fills itself as you first get each kind of building (see ui.js).
export const HOTBAR_SIZE = 10;
// Quickbars, cycled with X. `auto` fills itself with new buildings; `items` is what a fresh bar starts with.
export const HOTBARS = [
  { name: 'Equipment', auto: true },
  { name: 'Resources', items: ['coal', 'wood', 'iron_ore', 'copper_ore', 'stone', 'iron_plate', 'copper_plate', 'gear', 'circuit', 'steel'] },
  { name: 'Custom' },
];
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
