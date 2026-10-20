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
  sulfuric_acid: { name: 'Sulfuric acid', color: 0xd8e04a, barrel: true },
};
export const FUELS = Object.keys(FLUIDS).filter(f => FLUIDS[f].fuel);
// A barrel holds 10 of any fluid. Saves from when barrels held 50 get five barrels for each one (see save.js), and a
// barrel stack is five times bigger, so the same slot still carries the same amount of fluid.
export const BARREL_SIZE = 10;
export const OLD_BARREL_SIZE = 50;

// Road surfaces (see roads in transport.js). Each is also the item you lay it with. `speed` is how fast trucks go on it.
// A road is one object, everything laid in one drag: mining takes it all up, unless `tileMine` lets Ctrl take one tile.
export const ROADS = {
  gravel_road:   { name: 'Gravel road', speed: .7, paint: [116, 106, 90] },
  cobble_road:   { name: 'Cobblestone road', speed: .85, paint: [112, 104, 98] },
  asphalt_road:  { name: 'Asphalt road', speed: 1, paint: [50, 52, 58] },
  concrete_road: { name: 'Concrete road', speed: 1, paint: [146, 146, 142] },
  path_tile:     { name: 'Path', walk: true, tileMine: true, paint: [166, 158, 146], desc: 'Paving for people. Walking on it is faster. Roads use it for sidewalks. Ctrl + mine takes up a single tile.' },
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
  power_cable:       { name: 'Power cable', color: 0xd88a4a, shape: 'cable', tool: 'link', reach: 32, toBuilding: 12, desc: 'Click two poles of the same voltage to connect them, up to 32 tiles apart. With Direct wiring researched, also from an electric pole to a machine up to 12 tiles away, which then draws from that pole. Click a linked pair again to take it down.' },
  transformer_cable: { name: 'Transformer cable', color: 0x6ab8ff, shape: 'cable', tool: 'link', reach: 32, transformer: true, steps: [0, 1], desc: 'Connects a transformer station to a high voltage line, up to 32 tiles away.' },
  // `steps`: the two voltages a transformer cable joins (the station's own, then the one it steps into)
  road_conduit:   { name: 'Road conduit', color: 0xffc83a, shape: 'cable', tool: 'conduit', desc: 'Hold it and drag over road tiles to lay a power conduit inside them (one a tile). Touching conduit tiles carry low voltage from a pole near them to machines right beside the road, with no poles or wires. Mining the road gives it back.' },
  rail_signal:    { name: 'Rail signal', color: 0xd84a3a, shape: 'signal', tool: 'signal', desc: 'Click a rail to split the track into blocks there: only one train at a time in each block. R turns which side it stands on.' },
  barrel:         { name: 'Empty barrel', color: 0x8a96a6, shape: 'barrel', desc: `Fill it with ${BARREL_SIZE} of any fluid in a barreling station.` },
  solid_fuel:     { name: 'Solid fuel', color: 0x8a6a3a, shape: 'brick', fuel: 12 },
  rubber:         { name: 'Rubber', color: 0x2a2a2a, shape: 'coil' },
  chassis:        { name: 'Chassis', color: 0x6a7480, shape: 'part' },
  wheel:          { name: 'Wheel', color: 0x30333a, shape: 'wheel' },
  hull:           { name: 'Hull', color: 0x5a6a7a, shape: 'hull' },
  armor_plate:    { name: 'Armour plate', color: 0x5a6250, shape: 'plate' },
  turret:         { name: 'Turret', color: 0x6a7258, shape: 'part' },
  fishing_net:    { name: 'Fishing net', color: 0xb8a878, shape: 'net', desc: 'Put it on a boat. The boat catches fish it passes. Past one stack of fish the net strains, and at two it breaks.' },
  raw_fish:       { name: 'Raw fish', color: 0x8ab0c8, shape: 'fish', food: 60, heal: 15, desc: 'Food. Hold it and click to eat: heals a little, and you walk, mine and heal faster for a minute. Cook it in a furnace for more.' },
  cooked_fish:    { name: 'Cooked fish', color: 0xd8904a, shape: 'fish', food: 180, heal: 40, desc: 'Food. Hold it and click to eat: heals, and you walk, mine and heal faster for three minutes.' },
  // uranium: needs acid to mine with a drill (see `mineFluid`), and only a leaching drill can feed it acid
  uranium_ore:    { name: 'Uranium ore', color: 0x6ad84a, emissive: 0x1a5a12, shape: 'ore', mineFluid: 'sulfuric_acid', handSlow: 3,
    desc: 'Drills need sulfuric acid to mine it: only a leaching drill can feed it acid. By hand it is slow, and a little radioactive. Refine it in a centrifuge.' },
  enriched_uranium: { name: 'Enriched uranium', color: 0x4ae83a, emissive: 0x1a6a12, shape: 'pellet', desc: 'Made from uranium ore in a centrifuge. Goes into nuclear fuel cells.' },
  uranium_fuel_cell: { name: 'Uranium fuel cell', color: 0x9be37a, emissive: 0x2a6a12, shape: 'cell', nuclear: 4000, desc: 'Fuel for a uranium reactor only: 4000 MJ, a thousand pieces of coal.' },
  chlorophyll:    { name: 'Chlorophyll', color: 0x3ad84a, emissive: 0x0a3a10, shape: 'vial', desc: 'Pressed from seeds. Goes into green lamps, terrestrial science packs, greenhouses and medical research.' },
  terrestrial_pack: { name: 'Terrestrial pack', color: 0xb8d84a, shape: 'pack', desc: 'Science of living things: research and the medical lab use it.' },
};
for (const id of ROAD_IDS) ITEMS[id] = { name: ROADS[id].name, color: (ROADS[id].paint[0] << 16) | (ROADS[id].paint[1] << 8) | ROADS[id].paint[2], shape: 'road', road: id,
  desc: ROADS[id].desc ?? `Hold it and drag to lay road. The road panel next to your hand sets width, lanes, markings and sidewalks. Trucks drive at ${Math.round(ROADS[id].speed * 100)}% speed on it.` };
for (const [f, d] of Object.entries(FLUIDS)) if (d.barrel) ITEMS[f + '_barrel'] = { name: d.name + ' barrel', color: d.color, shape: 'barrel', barrel: f, desc: `${BARREL_SIZE} ${d.name.toLowerCase()}. Empty it in a barreling station${d.fuel ? ', a depot or a vehicle that burns it' : ''}.` };

// ---------------------------------------------------------------- crops
// Every biome grows three crops. Each crop is a seed (from shovelling weedy patches, or a greenhouse's surplus) and the
// harvest a greenhouse grows from it. Harvests are food. `irr`: irradiated, from the Pripyatic wastes: these unlock
// the mutation upgrades in the medical lab.
export const CROPS = {
  wheat: { name: 'Wheat', color: 0xd8b84a }, flax: { name: 'Flax', color: 0x7a9ad8 }, clover: { name: 'Clover', color: 0x5ab84a },
  blueberry: { name: 'Blueberry', color: 0x4a5ad8 }, hops: { name: 'Hops', color: 0x9ad86a }, beet: { name: 'Beet', color: 0xa83a5a },
  millet: { name: 'Millet', color: 0xe0c88a }, sunflower: { name: 'Sunflower', color: 0xf0c83a }, sorghum: { name: 'Sorghum', color: 0xb8643a },
  rye: { name: 'Rye', color: 0xb89a5a }, cranberry: { name: 'Cranberry', color: 0xd83a4a }, potato: { name: 'Potato', color: 0xc8a06a },
  rice: { name: 'Rice', color: 0xe8e4d0 }, reedgrass: { name: 'Reedgrass', color: 0x8a9a4a }, taro: { name: 'Taro', color: 0x8a6aa8 },
  prickly_pear: { name: 'Prickly pear', color: 0xd85a8a }, date_palm: { name: 'Dates', color: 0x9a5a2a }, agave: { name: 'Agave', color: 0x6ab8a0 },
  lichen: { name: 'Lichen', color: 0x9ab8a0 }, snowberry: { name: 'Snowberry', color: 0xe8f0f8 }, arctic_moss: { name: 'Arctic moss', color: 0x6a9a7a },
  emberroot: { name: 'Emberroot', color: 0xe8603a, glow: 0x6a1a08 }, ash_pepper: { name: 'Ash pepper', color: 0x5a5a5a }, cinderbloom: { name: 'Cinderbloom', color: 0xff8a2a, glow: 0x6a2a08 },
  glowspore: { name: 'Glowspore', color: 0x7ef6c8, glow: 0x1a6a5a }, puffball: { name: 'Puffball', color: 0xd8c8e8 }, threadmold: { name: 'Threadmold', color: 0xb07ad8 },
  chimegrass: { name: 'Chimegrass', color: 0x9fe8f2 }, prism_lily: { name: 'Prism lily', color: 0xd8a8ff, glow: 0x3a1a6a }, shardroot: { name: 'Shardroot', color: 0x7ab8d8 },
  wormwood: { name: 'Wormwood', color: 0x9ab83a, glow: 0x2a4a08, irr: true }, rust_potato: { name: 'Rust potato', color: 0xa8603a, irr: true }, ghost_rye: { name: 'Ghost rye', color: 0xd8f0a8, glow: 0x3a5a1a, irr: true },
};
export const seedId = c => c + '_seeds';
for (const [id, c] of Object.entries(CROPS)) {
  ITEMS[seedId(id)] = { name: `${c.name} seeds`, color: c.color, emissive: c.glow, shape: 'seed', seed: id, irr: !!c.irr,
    desc: `Plant them in a greenhouse with water to grow ${c.name.toLowerCase()}. Pressed, any seeds make chlorophyll.${c.irr ? ' Irradiated: they open the mutation upgrades in the medical lab.' : ''}` };
  ITEMS[id] = { name: c.name, color: c.color, emissive: c.glow, shape: 'crop', crop: id, irr: !!c.irr, food: 25, heal: 6,
    desc: `Grown in a greenhouse. Food (hold it and click to eat), and the medical lab needs it for some upgrades.${c.irr ? ' Irradiated.' : ''}` };
}
// Ingredient groups: a recipe ingredient written '#seed' takes any item of the group.
export const GROUPS = { seed: { name: 'Any seeds', icon: 'wheat_seeds', match: it => !!ITEMS[it]?.seed } };
export const groupOf = k => k[0] === '#' ? GROUPS[k.slice(1)] : null;
export const ingredientMatches = (k, it) => k === it || !!groupOf(k)?.match(it);

// ---------------------------------------------------------------- hazards and biomes
// Hazards build up while you stand in a biome that has one and fade once you leave. At full exposure their effects
// apply, less whatever the matching adaptation (medical lab) takes off. None of them can kill you. Effects:
// staminaRegen / walk / mine / craft: fractions added to that rate; sprintCost: extra stamina per sprint;
// reach: tiles; regen: fraction of health regen; drain: health per second, never below half.
export const HAZARDS = {
  heat: { name: 'Heat', color: '#ff8a3d', fx: { staminaRegen: -.5 }, desc: 'Stamina comes back at half speed.' },
  cold: { name: 'Cold', color: '#9fd0ff', fx: { walk: -.15 }, desc: 'You walk 15% slower.' },
  fumes: { name: 'Toxic fumes', color: '#d8c84a', fx: { sprintCost: 1, staminaRegen: -.25 }, desc: 'Sprinting costs twice the stamina, and it comes back slower.' },
  spores: { name: 'Neurotoxic spores', color: '#c08aff', fx: { mine: -.25, craft: -.25 }, desc: 'Hand mining and hand crafting are 25% slower.' },
  resonance: { name: 'Resonance', color: '#7ef6ff', fx: { reach: -3 }, desc: 'The ringing in the ground shortens your reach by 3 tiles.' },
  radiation: { name: 'Radiation', color: '#9be37a', fx: { regen: -1, drain: .4 }, desc: 'Health stops coming back and slowly drains, down to half.' },
};
export const EXPOSURE_TIME = 12;   // seconds to full exposure, and to recover from it
// Trees, rocks and other things standing on the ground that you mine by hand. `tool` decides which tool works on it
// (and which cursor shows). `look` is how the scene draws it: a crown shape and colours.
export const FEATURES = {
  tree: { name: 'Oak', tool: 'axe', time: .6, gives: { wood: 4 }, look: { shape: 'round', trunk: 0x5a3a22, hue: .3, hueV: .16, sat: .38, lit: .25 } },
  birch: { name: 'Birch', tool: 'axe', time: .55, gives: { wood: 3 }, look: { shape: 'round', trunk: 0xd8d4c8, hue: .22, hueV: .06, sat: .45, lit: .38, slim: true } },
  pine: { name: 'Pine', tool: 'axe', time: .65, gives: { wood: 4 }, look: { shape: 'cone', trunk: 0x4a3020, hue: .38, hueV: .06, sat: .35, lit: .2 } },
  snow_pine: { name: 'Snowy pine', tool: 'axe', time: .7, gives: { wood: 4 }, look: { shape: 'cone', trunk: 0x4a3020, hue: .45, hueV: .05, sat: .12, lit: .62 } },
  acacia: { name: 'Acacia', tool: 'axe', time: .6, gives: { wood: 3 }, look: { shape: 'flat', trunk: 0x6a4a2a, hue: .2, hueV: .05, sat: .4, lit: .3 } },
  willow: { name: 'Willow', tool: 'axe', time: .6, gives: { wood: 4 }, look: { shape: 'droop', trunk: 0x4a3a22, hue: .27, hueV: .05, sat: .35, lit: .28 } },
  cactus: { name: 'Cactus', tool: 'axe', time: .5, gives: { wood: 1 }, look: { shape: 'cactus', trunk: 0x4a8a3a, hue: .3, hueV: .03, sat: .45, lit: .32 } },
  deadwood: { name: 'Dead tree', tool: 'axe', time: .4, gives: { wood: 2 }, look: { shape: 'dead', trunk: 0x6a5a4a } },
  charred: { name: 'Charred tree', tool: 'axe', time: .45, gives: { wood: 1, coal: 2 }, look: { shape: 'dead', trunk: 0x2a2624, ember: 0xff5a1a } },
  glowcap: { name: 'Glowcap', tool: 'axe', time: .5, gives: { wood: 2 }, look: { shape: 'cap', trunk: 0xd8d0c0, hue: .48, hueV: .2, sat: .6, lit: .45, glow: 0x1a6a5a } },
  crystal_spire: { name: 'Crystal spire', tool: 'pickaxe', time: 1.2, gives: { stone: 8 }, look: { shape: 'spire', trunk: 0x9fe8f2, glow: 0x1d6a77 } },
  mutant_tree: { name: 'Mutant tree', tool: 'axe', time: .6, gives: { wood: 3 }, look: { shape: 'round', trunk: 0x4a4a3a, hue: .2, hueV: .08, sat: .55, lit: .3, glow: 0x2a4a08, lumpy: true } },
  rock: { name: 'Rock', tool: 'pickaxe', time: 1.6, gives: { stone: 20, coal: 6 }, look: { shape: 'rock', trunk: 0x8f8576 } },
  ice_rock: { name: 'Frozen rock', tool: 'pickaxe', time: 1.6, gives: { stone: 16 }, look: { shape: 'rock', trunk: 0xc8d8e8 } },
  ash_rock: { name: 'Ash rock', tool: 'pickaxe', time: 1.4, gives: { stone: 10, coal: 12 }, look: { shape: 'rock', trunk: 0x4a4440 } },
};
// Biomes. `clim` is where the biome sits in climate space: temperature, moisture and weirdness, each 0 to 1. Every tile
// takes the biome closest to its own climate, and borders blend. `spawn`: how much the landing site likes it (0: never).
// `ground` is the soil (name, palette). Ore tables give each ore an abundance `w`, a patch scale `size`, a richness
// `rich` and a pattern ('blob', 'vein' or 'scatter'). `under` and `deep` are layers -1 and -2. `trees` weights tree
// kinds; `flora` is ground cover drawn for looks: [kind, colour, share of tiles, glows]; `patches` is the share of
// weedy ground (its tangle drawn in `weed`, else the first flora colour); `seeds` are the three crops whose seeds its weedy patches give.
export const BIOMES = [
  { id: 'meadow', name: 'Temperate meadow', clim: [.5, .5, .15], spawn: 4, hazard: null, ground: { name: 'Meadow soil', pal: [[56, 78, 32], [84, 114, 44], [68, 104, 38], [112, 134, 60]] },
    ores: { iron_ore: { w: 1 }, copper_ore: { w: 1 }, coal: { w: 1 }, stone: { w: .8 } }, under: { crystal: { w: 1 }, iron_ore: { w: .6, rich: 3 }, copper_ore: { w: .5, rich: 3 } }, deep: { abyssal_ore: { w: 1, rich: 2 }, crystal: { w: .3, rich: 3 } },
    trees: { tree: 3, birch: 1 }, treeDensity: .5, rocks: .004, flora: [['tuft', 0x5a8a3a, .2], ['flower', 0xe0d04a, .03], ['flower', 0xd84a8a, .02]], patches: .06, oil: .25, seeds: ['wheat', 'flax', 'clover'] },
  { id: 'forest', name: 'Old forest', clim: [.42, .72, .2], spawn: 3, hazard: null, ground: { name: 'Forest loam', pal: [[38, 56, 30], [58, 84, 40], [46, 74, 36], [80, 98, 50]] },
    ores: { iron_ore: { w: 1.1 }, coal: { w: 1.2 }, stone: { w: .7 }, copper_ore: { w: .6 } }, under: { crystal: { w: .8 }, iron_ore: { w: .8, rich: 3 } }, deep: { abyssal_ore: { w: 1, rich: 2 } },
    trees: { tree: 3, pine: 2, birch: 1 }, treeDensity: 1, rocks: .006, flora: [['tuft', 0x3a6a2a, .22], ['fern', 0x3a7a3a, .08], ['shroom', 0xc8603a, .01]], patches: .05, oil: .2, seeds: ['blueberry', 'hops', 'beet'] },
  { id: 'steppe', name: 'Dry steppe', clim: [.66, .3, .2], spawn: 3, hazard: null, ground: { name: 'Steppe dirt', pal: [[146, 112, 56], [180, 142, 70], [160, 134, 58], [198, 166, 90]] },
    ores: { copper_ore: { w: 1.2, size: 1.4 }, stone: { w: 1.2, size: 1.3 }, iron_ore: { w: .8 }, coal: { w: .7 } }, under: { crystal: { w: .7 }, copper_ore: { w: .9, rich: 3 } }, deep: { abyssal_ore: { w: .8, rich: 2 } },
    trees: { acacia: 2, tree: 1 }, treeDensity: .15, rocks: .006, flora: [['tuft', 0x9a9a4a, .25], ['tuft', 0xb8a85a, .1]], patches: .05, oil: .45, seeds: ['millet', 'sunflower', 'sorghum'] },
  { id: 'taiga', name: 'Boreal taiga', clim: [.25, .6, .2], spawn: 2, hazard: null, ground: { name: 'Taiga peat', pal: [[46, 66, 60], [66, 94, 80], [54, 84, 70], [90, 114, 94]] },
    ores: { iron_ore: { w: 1.3, size: 1.2 }, coal: { w: 1 }, stone: { w: 1 }, copper_ore: { w: .6 } }, under: { iron_ore: { w: 1, rich: 3 }, crystal: { w: .7 } }, deep: { abyssal_ore: { w: 1, rich: 2 } },
    trees: { pine: 4, snow_pine: 1, birch: 1 }, treeDensity: .9, rocks: .008, flora: [['tuft', 0x4a6a4a, .15], ['berry', 0xd83a4a, .02]], patches: .05, oil: .2, seeds: ['rye', 'cranberry', 'potato'] },
  { id: 'marsh', name: 'Fen', clim: [.55, .92, .25], spawn: 1, hazard: null, wet: 1, ground: { name: 'Fen mud', pal: [[36, 62, 44], [52, 88, 58], [42, 80, 66], [68, 102, 66]] },
    ores: { coal: { w: 1.3, rich: 1.3 }, iron_ore: { w: .6 }, copper_ore: { w: .8 } }, under: { coal: { w: .8, rich: 3 }, crystal: { w: .6 } }, deep: { abyssal_ore: { w: .8, rich: 2 } },
    trees: { willow: 3, tree: 1 }, treeDensity: .45, rocks: .002, flora: [['reed', 0x8a9a4a, .25], ['tuft', 0x4a7a4a, .1]], patches: .07, oil: .5, seeds: ['rice', 'reedgrass', 'taro'] },
  { id: 'desert', name: 'Glass desert', clim: [.93, .08, .3], spawn: 0, hazard: 'heat', dry: 1, ground: { name: 'Sand', pal: [[210, 166, 94], [234, 192, 114], [220, 174, 98], [244, 212, 140]] },
    ores: { copper_ore: { w: 1.4, pat: 'vein', rich: 1.4 }, stone: { w: 1.5, size: 1.6 }, iron_ore: { w: .5 } }, under: { copper_ore: { w: 1, rich: 4 }, crystal: { w: .8 } }, deep: { abyssal_ore: { w: 1, rich: 2.5 } },
    trees: { cactus: 1 }, treeDensity: .08, weed: 0x8a8a4a, rocks: .006, flora: [['tuft', 0xb8a86a, .05], ['shard', 0xe8d8a8, .02]], patches: .03, oil: .9, seeds: ['prickly_pear', 'date_palm', 'agave'] },
  { id: 'tundra', name: 'Frost waste', clim: [.04, .35, .3], spawn: 0, hazard: 'cold', ground: { name: 'Frozen ground', pal: [[172, 194, 224], [206, 224, 244], [186, 210, 236], [230, 242, 254]] },
    ores: { iron_ore: { w: 1.5, size: 1.5, rich: 1.3 }, coal: { w: 1.2 }, stone: { w: .8 } }, under: { iron_ore: { w: 1.1, rich: 4 }, crystal: { w: 1 } }, deep: { abyssal_ore: { w: 1.1, rich: 2.5 } },
    trees: { snow_pine: 2, deadwood: 1 }, treeDensity: .12, weed: 0x6a7a70, rocks: .01, rockKind: 'ice_rock', flora: [['tuft', 0x8a9aa0, .06], ['shard', 0xe8f0ff, .02]], patches: .04, oil: .3, seeds: ['lichen', 'snowberry', 'arctic_moss'] },
  { id: 'ashlands', name: 'Ashlands', clim: [.9, .5, .95], spawn: 0, hazard: 'fumes', dry: 1, ground: { name: 'Ash', pal: [[54, 40, 38], [80, 58, 50], [72, 44, 36], [98, 72, 60]] },
    ores: { coal: { w: 1.6, pat: 'scatter', rich: 1.6 }, iron_ore: { w: 1, pat: 'scatter', rich: 1.4 }, stone: { w: 1 } }, under: { abyssal_ore: { w: .5, rich: 2 }, crystal: { w: .6 } }, deep: { abyssal_ore: { w: 1.6, rich: 3 } },
    trees: { charred: 2, deadwood: 1 }, treeDensity: .15, rocks: .012, rockKind: 'ash_rock', weed: 0x6a4a3a, flora: [['ember', 0xff5a1a, .03, true], ['shard', 0x3a3430, .05]], patches: .04, oil: .7, seeds: ['emberroot', 'ash_pepper', 'cinderbloom'] },
  { id: 'fungal', name: 'Glowcap hollows', clim: [.45, .8, .95], spawn: 0, hazard: 'spores', ground: { name: 'Mycelium', pal: [[66, 38, 92], [96, 56, 128], [84, 44, 112], [118, 76, 146]] },
    ores: { copper_ore: { w: 1 }, stone: { w: .8 }, coal: { w: .8 }, iron_ore: { w: .7 } }, under: { crystal: { w: 1.3, rich: 2 } }, deep: { abyssal_ore: { w: 1, rich: 2 } },
    trees: { glowcap: 4, tree: 1 }, treeDensity: .75, rocks: .004, flora: [['shroom', 0x7ef6c8, .1, true], ['shroom', 0xd8a8ff, .05, true], ['tuft', 0x6a4a7a, .1]], patches: .07, oil: .2, seeds: ['glowspore', 'puffball', 'threadmold'] },
  { id: 'crystal', name: 'Singing steppe', clim: [.25, .25, .95], spawn: 0, hazard: 'resonance', ground: { name: 'Glass silt', pal: [[80, 106, 152], [108, 140, 188], [92, 124, 174], [130, 162, 206]] },
    ores: { stone: { w: 1.4, pat: 'vein' }, copper_ore: { w: 1.1 }, iron_ore: { w: .8 } }, under: { crystal: { w: 2, rich: 3 } }, deep: { crystal: { w: 1, rich: 4 }, abyssal_ore: { w: .8, rich: 2 } },
    trees: { crystal_spire: 1 }, treeDensity: .12, weed: 0x6a8a98, rocks: .004, flora: [['shard', 0x9fe8f2, .08, true], ['tuft', 0x8aa0b8, .08]], patches: .04, oil: .15, seeds: ['chimegrass', 'prism_lily', 'shardroot'] },
  { id: 'pripyat', name: 'Pripyatic wastes', clim: [.62, .4, .95], spawn: 0, hazard: 'radiation', ground: { name: 'Fallout dust', pal: [[96, 98, 42], [126, 128, 54], [108, 120, 44], [146, 144, 70]] },
    ores: { uranium_ore: { w: 1.7, size: 1.1, rich: 1.2 }, iron_ore: { w: 1 }, stone: { w: .8 }, copper_ore: { w: .6 } }, under: { uranium_ore: { w: .8, rich: 3 }, crystal: { w: .5 } }, deep: { abyssal_ore: { w: 1, rich: 2 } },
    trees: { mutant_tree: 3, deadwood: 2 }, treeDensity: .35, rocks: .008, flora: [['tuft', 0x9ab83a, .12], ['glowtuft', 0xb8f04a, .03, true]], patches: .06, oil: .4, seeds: ['wormwood', 'rust_potato', 'ghost_rye'] },
];
export const BIOME = Object.fromEntries(BIOMES.map((b, i) => [b.id, i]));
// Uranium shows up outside the wastes too, rarely, but never near the landing site.
export const STRAY_ORES = { uranium_ore: { w: .06, pat: 'scatter', rich: .8, far: 300 } };
// World options for a new game. Sizes are tiles per side.
export const WORLD = { sizes: [512, 1024, 2048, 4096, 8192, 16384, 32768, 65536], size: 2048, min: 500, max: 65536, chunk: 32,
  biomeScale: { small: 300, normal: 520, large: 900 }, water: { low: .8, normal: 1, high: 1.25 }, ores: { poor: .6, normal: 1, rich: 1.6 } };

// ---------------------------------------------------------------- tools
// The engineer always carries an axe and a pickaxe (the shovel comes with Soil science). Each tool mines what it is
// for: trees with the axe, ore and rocks with the pickaxe, weedy patches with the shovel. Research makes them faster
// (`speed`: mining speed per level) and wider (`radius`: everything of its kind this close to what you mine goes too).
export const TOOLS = {
  axe: { name: 'Axe', color: 0xc8483a, speed: [1.4, 1.9, 2.6], radius: [1, 1.8, 2.6], packs: [['red_pack'], ['red_pack', 'green_pack'], ['red_pack', 'green_pack', 'blue_pack']],
    desc: 'Fells trees. Hold right-click on one.' },
  pickaxe: { name: 'Pickaxe', color: 0x9aa8b8, speed: [1.4, 1.9, 2.6], radius: [1, 1.8, 2.6], packs: [['red_pack'], ['red_pack', 'green_pack'], ['red_pack', 'green_pack', 'blue_pack']],
    desc: 'Breaks ore and rock. Hold right-click on a deposit or a rock.' },
  shovel: { name: 'Shovel', color: 0xc8a050, tech: 'soil_science', speed: [1.5, 2.2, 3], radius: [1, 1.8, 2.6], packs: [['red_pack', 'green_pack'], ['red_pack', 'green_pack', 'blue_pack'], ['red_pack', 'green_pack', 'blue_pack', 'terrestrial_pack']],
    desc: 'Digs up weedy patches for seeds. Hold right-click on one.' },
};

// ---------------------------------------------------------------- the medical lab
// Upgrades for every engineer in the world, researched in medical labs with terrestrial packs and chlorophyll (and a
// crop for adaptations and mutations). Each level costs `units` × growth^level units; a unit takes one of each item
// in `cost`. `fx` is what one level adds (see playerMods in sim.js). Adaptations take a share off one hazard per level.
// Mutations need irradiated seeds to have been found first.
export const MEDICAL = [
  { id: 'vitality', name: 'Vitality', levels: 5, units: 60, fx: { health: 20 }, desc: '+20 maximum health a level.' },
  { id: 'endurance', name: 'Endurance', levels: 5, units: 60, fx: { stamina: 20 }, desc: '+20 maximum stamina a level.' },
  { id: 'recovery', name: 'Recovery', levels: 4, units: 80, fx: { regen: .3 }, pre: [['vitality', 1]], desc: 'Health comes back 30% faster a level.' },
  { id: 'stride', name: 'Stride', levels: 4, units: 80, fx: { walk: .05 }, pre: [['endurance', 1]], desc: 'Walk 5% faster a level.' },
  { id: 'dexterity', name: 'Dexterity', levels: 4, units: 80, fx: { mine: .1, craft: .1 }, desc: 'Hand mining and crafting 10% faster a level.' },
  { id: 'reach_training', name: 'Long reach', levels: 3, units: 100, fx: { reach: 1 }, pre: [['dexterity', 2]], desc: '+1 tile of reach a level.' },
  { id: 'adapt_heat', name: 'Heat adaptation', levels: 2, units: 80, hazard: 'heat', crop: 'prickly_pear', desc: 'Halves the effect of heat a level.' },
  { id: 'adapt_cold', name: 'Cold adaptation', levels: 2, units: 80, hazard: 'cold', crop: 'snowberry', desc: 'Halves the effect of cold a level.' },
  { id: 'adapt_fumes', name: 'Fume tolerance', levels: 2, units: 80, hazard: 'fumes', crop: 'emberroot', desc: 'Halves the effect of toxic fumes a level.' },
  { id: 'adapt_spores', name: 'Neurotoxin resistance', levels: 2, units: 80, hazard: 'spores', crop: 'puffball', desc: 'Halves the effect of neurotoxic spores a level.' },
  { id: 'adapt_resonance', name: 'Resonance damping', levels: 2, units: 80, hazard: 'resonance', crop: 'prism_lily', desc: 'Halves the effect of resonance a level.' },
  { id: 'adapt_radiation', name: 'Radiation resistance', levels: 2, units: 100, hazard: 'radiation', crop: 'wormwood', desc: 'Halves the effect of radiation a level.' },
  { id: 'photosynthesis', name: 'Photosynthetic skin', levels: 3, units: 120, mutation: true, crop: 'ghost_rye', fx: { sunHeal: 1.5 }, pre: [['recovery', 2]], desc: 'Mutation: heal 1.5 health a second a level in daylight.' },
  { id: 'night_eyes', name: 'Night eyes', levels: 2, units: 120, mutation: true, crop: 'wormwood', fx: { light: .6 }, desc: 'Mutation: your own light reaches 60% further a level.' },
  { id: 'lead_lungs', name: 'Lead lungs', levels: 2, units: 150, mutation: true, crop: 'rust_potato', fx: { hazards: .25 }, pre: [['adapt_radiation', 1]], desc: 'Mutation: every hazard is 25% weaker a level.' },
  { id: 'adrenal', name: 'Adrenal gland', levels: 3, units: 120, mutation: true, crop: 'ghost_rye', fx: { sprint: .1 }, pre: [['stride', 1]], desc: 'Mutation: sprinting is 10% faster a level.' },
];
export const MED = Object.fromEntries(MEDICAL.map(m => [m.id, m]));
// The medical tree's sections, like TECH_CATS. Every level of an upgrade is its own node, needing the level before it;
// an upgrade's first level needs what its `pre` lists ([upgrade, level] pairs).
export const MED_CATS = [
  { id: 'body', name: 'Body', color: '#e8e0e8' },
  { id: 'adapt', name: 'Adaptations', color: '#9fd0ff' },
  { id: 'mutation', name: 'Mutations', color: '#9be37a' },
];
export const MED_RULES = { growth: 1.8, time: 30, cost: { terrestrial_pack: 1, chlorophyll: 2 } };
for (const m of MEDICAL) if (m.hazard) HAZARDS[m.hazard].adapt = m.id;

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


// Voltage tiers. Poles of one tier wire to each other; transformer stations step between tiers. The index is what
// saves and poles store (`volt`, `volts`), so new tiers go on the end; `rank` is the order from lowest to highest.
// Generators feed the pole whose area they stand in, like any machine draws from one; a transformer station carries low
// voltage on into high voltage for long lines. `consumers`: machines can draw from poles of this tier.
// (There was once a third, extra-low voltage only generators fed, at index 2: its poles are gone, see RETIRED.)
export const VOLTAGES = [
  { name: 'Low voltage', short: 'LV', rank: 1, wire: 0xb8683a, consumers: true },
  { name: 'High voltage', short: 'HV', rank: 2, wire: 0x6ab8ff, consumers: true },
];
// Power in roads (Powered roads research): road tiles with a conduit in them carry low voltage underground. Every
// touching conduit tile is one grid. A grid joins a low voltage pole whose supply area covers one of its tiles (or that
// stands within `poleReach` of one), and powers machines standing within `reach` tiles of it. A grid carries at most
// `capacity` kW to the machines it powers itself; past that they slow down, like a brownout.
export const ROAD_POWER = { reach: 1, poleReach: 1, capacity: 3000, volt: 0, color: 0xffc83a };

// kind drives simulation + model. vol = engineering volume when active. glyph = what the aliens hear.
export const ENTITIES = {
  belt:             { name: 'Belt', kind: 'belt', speed: 1.5, color: 0xc9a227, vol: .25, glyph: 'flow', desc: 'Moves items. Feed into its side to merge.' },
  fast_belt:        { name: 'Fast belt', kind: 'belt', speed: 3, color: 0xd8483a, vol: .35, glyph: 'flow', desc: 'Twice as fast.' },
  express_belt:     { name: 'Express belt', kind: 'belt', speed: 4.5, color: 0x3a9ad8, vol: .5, glyph: 'flow', desc: 'Three times as fast.' },
  // Undergrounds run at their belt's speed, so a belt and its tunnels make one line (see belts.js).
  underground:      { name: 'Underground belt', kind: 'underground', speed: 1.5, color: 0xc9a227, range: 7, vol: .6, glyph: 'tunnel', desc: 'Place an entrance, then an exit up to 6 tiles ahead: enough to cross any road. Passes under anything between. For longer runs, angle a belt down to layer -1.' },
  fast_underground: { name: 'Fast underground belt', kind: 'underground', speed: 3, color: 0xd8483a, range: 9, vol: .7, glyph: 'tunnel', desc: 'Entrance and exit up to 8 tiles apart.' },
  express_underground: { name: 'Express underground belt', kind: 'underground', speed: 4.5, color: 0x3a9ad8, range: 11, vol: .8, glyph: 'tunnel', desc: 'Entrance and exit up to 10 tiles apart.' },
  // Bus belts carry three lanes and take items only from the belt behind them. Any tile can send its left or right
  // lane off to the side through a filtered channel (see belts.js); the middle lane always goes straight.
  bus_belt:         { name: 'Bus belt', kind: 'belt', lanes: 3, speed: 3, color: 0x8a5ad8, vol: .4, glyph: 'flow', desc: 'Three lanes, fed only from behind. Click a tile to send its left or right lane off to the side, with a filter. The middle lane goes straight.' },
  bus_underground:  { name: 'Bus underground', kind: 'underground', lanes: 3, speed: 3, color: 0x8a5ad8, range: 9, vol: .7, glyph: 'tunnel', desc: 'Takes a bus belt under anything, up to 8 tiles.' },
  splitter:         { name: 'Splitter', kind: 'splitter', speed: 3, color: 0xc9a227, vol: .8, glyph: 'split', desc: 'Deals items in turn to the belts in front, left and right of it. Each way can have a filter.' },
  burner_inserter:  { name: 'Burner inserter', kind: 'inserter', swing: .9, reach: 1, burner: true, color: 0x9a6a3a, vol: .4, glyph: 'swing', desc: 'Slow, needs no power. Burns fuel, and keeps fuel it carries when it runs dry.' },
  inserter:         { name: 'Inserter', kind: 'inserter', swing: .6, reach: 1, power: 13, color: 0xe0a92e, vol: .5, glyph: 'swing', desc: 'Moves items from behind it to in front of it.' },
  long_inserter:    { name: 'Long arm', kind: 'inserter', swing: .8, reach: 2, power: 20, color: 0xc8483a, vol: .75, glyph: 'swing', desc: 'Reaches two tiles.' },
  fast_inserter:    { name: 'Fast inserter', kind: 'inserter', swing: .25, reach: 1, power: 46, color: 0x3a8fd8, vol: .8, glyph: 'swing', desc: 'Swings more than twice as fast.' },
  filter_inserter:  { name: 'Filter inserter', kind: 'inserter', swing: .25, reach: 1, power: 53, color: 0xb04ad8, filter: true, vol: 1, glyph: 'swing', desc: 'Fast, and only moves the item you choose.' },
  // `depth`: the deepest deposit layer a drill reaches (see DEPOSIT): 0 surface, 1 depth, 2 bedrock.
  burner_drill:     { name: 'Burner drill', kind: 'drill', rate: .25, depth: 0, burner: true, fuelStacks: 1, color: 0x6a5a48, vol: .8, glyph: 'bore', desc: 'Mines surface deposits without power. Burns coal or wood. Holds a full stack of fuel.' },
  drill:            { name: 'Electric drill', kind: 'drill', rate: .5, depth: 1, power: 90, color: 0x5d6b43, vol: 1, glyph: 'bore', desc: 'Mines the deposit under it, down to its depth layer, and pushes ore forward.' },
  // Big mining drill: 2×2, one object. It works every deposit under its four tiles in turn: `rate` is for all four
  // covered (four electric drills' worth), less over fewer, and its power follows how much it covers. Old saves' one-tile
  // big drills stay one tile (`compact`), which counts as a quarter covered.
  big_drill:        { name: 'Big mining drill', kind: 'drill', rate: 2, depth: 2, power: 400, augSlots: 3, size: [2, 2], big: true, multi: true, color: 0x8a6a3a, vol: 4, glyph: 'bore',
    desc: '2×2. Mines the deposits under all four of its tiles, down to bedrock: four times an electric drill when ore covers it all, less over fewer. Up to 400 kW. Three augment slots. Ore comes out at the front, on its left.' },
  furnace:          { name: 'Stone furnace', kind: 'furnace', speed: 1, burner: true, color: 0x857a6d, vol: 1, glyph: 'heat', desc: 'Smelts. Burns coal.' },
  electric_furnace: { name: 'Electric furnace', kind: 'furnace', speed: 2, power: 180, color: 0x6a7480, vol: 1.5, glyph: 'heat', desc: 'Smelts twice as fast as a stone furnace, on 180 kW. No fuel needed.' },
  steel_furnace:    { name: 'Steel electric furnace', kind: 'furnace', speed: 3, power: 165, augSlots: 3, color: 0x8fa3b8, vol: 2, glyph: 'heat', desc: 'Smelts three times as fast as a stone furnace, on less power than an electric furnace (165 kW). Three augment slots.' },
  assembler:        { name: 'Assembler', kind: 'assembler', speed: .75, power: 75, color: 0x35567a, vol: 1.5, glyph: 'make', desc: 'Crafts the recipe you choose.' },
  assembler2:       { name: 'Assembler II', kind: 'assembler', speed: 1.5, power: 150, augSlots: 3, color: 0x2f7a72, vol: 2, glyph: 'make', desc: 'Crafts twice as fast. Three augment slots.' },
  // A crafting station reaches into chests around it with its own arm, one item at a time, for what its recipe needs.
  // `pull`: how far (tiles, square) it reaches and how long one trip takes (seconds out and back).
  crafting_station: { name: 'Crafting station', kind: 'assembler', model: 'station', speed: .75, power: 90, pull: { radius: 3, trip: .7 }, color: 0x9a6a3a, vol: 1.5, glyph: 'make',
    desc: 'An assembler that fetches its own ingredients: its arm takes them one at a time from any chest within 3 tiles. Inserters take what it makes, and can feed it too.' },
  lab:              { name: 'Lab', kind: 'lab', speed: 1, power: 60, color: 0xd8dde4, vol: 1.5, glyph: 'think', desc: 'Uses science packs to research.' },
  wooden_chest:     { name: 'Wooden chest', kind: 'chest', cap: 16, color: 0x8a5a2c, vol: .3, glyph: 'keep', desc: '16 slots of storage.' },
  chest:            { name: 'Iron chest', kind: 'chest', cap: 32, color: 0x8b8f98, vol: .5, glyph: 'keep', desc: '32 slots of storage.' },
  frame:            { name: 'Hollow frame', kind: 'frame', color: 0x8f9aa6, vol: .75, glyph: 'hollow', desc: 'You can build inside it and on top of it.' },
  small_pole:       { name: 'Small electric pole', kind: 'pole', volt: 0, supply: 4, wire: 7.5, top: 1.26, color: 0x8a5a2c, vol: .1, glyph: 'spark', desc: 'Powers machines in a {area} area. Connects to poles up to 7.5 tiles away.' },
  medium_pole:      { name: 'Medium electric pole', kind: 'pole', volt: 0, supply: 5, wire: 9, top: 1.58, color: 0x8a929c, vol: .2, glyph: 'spark', desc: 'Powers a {area} area. Connects up to 9 tiles.' },
  power_line:       { name: 'Power line', kind: 'pole', volt: 1, supply: 12, wire: 24, top: 2.9, color: 0x9aa8b8, vol: .3, glyph: 'spark', desc: 'High voltage. Powers everything in a {area} area and wires to other lines up to 24 tiles away.' },
  // volts[0] is the side that wires itself up; the other sides need a transformer cable
  transformer:      { name: 'Transformer station', kind: 'pole', volts: [0, 1], supply: 3, wire: 7.5, top: 1.2, color: 0x4a6a8a, vol: .5, glyph: 'spark', desc: 'Steps power between voltages. Powers a {area} area. Wires to low voltage poles nearby; link it to a power line with a transformer cable.' },
  // Factorio's chain: one pump feeds 20 boilers, one boiler feeds 2 engines (rates in units per second).
  water_pump:       { name: 'Water pump', kind: 'pump', onWater: true, fluids: { water: 'out' }, rate: 1200, color: 0x3a7ab8, vol: .4, glyph: 'flow', desc: 'Place it on water. Pumps up to 1200 water/s into boilers next to it: enough for 20.' },
  // Boilers and steam engines are big: `size` is [width, depth] as built facing north (R turns them). `gen`: a generator,
  // feeding the pole whose area it stands in. Ones from older saves stay one tile (`compact`).
  boiler:           { name: 'Boiler', kind: 'boiler', burner: true, fuelStacks: 1, fluids: { water: 'in', steam: 'out' }, heat: 1.8, steam: 60, size: [2, 1], big: true, multi: true, color: 0x8a5a3a, vol: 1, glyph: 'heat',
    desc: 'Two tiles wide. Burns fuel to turn 60 water/s into steam (1.8 MW). Water goes in and through at either end; steam comes out of the back. Touching boilers and engines pass water and steam on.' },
  steam_engine:     { name: 'Steam engine', kind: 'engine', fluids: { steam: 'in' }, out: 900, steam: 30, size: [2, 2], big: true, multi: true, gen: true, color: 0x7a8a6a, vol: 1.5, glyph: 'spark',
    desc: '2×2. Turns 30 steam/s into up to 900 kW. Steam goes in and through at the front and back, so engines chain end to end (touching ones join on any side). Feeds the pole whose area it stands in. Only works as hard as the network needs.' },
  solar:            { name: 'Solar panel', kind: 'solar', out: 60, color: 0x2a4a7a, vol: 1, glyph: 'shine', desc: 'Up to 60 kW in daylight, less at dusk and dawn, nothing at night.' },
  // A radar keeps the map live (see explore.js) within `scan` tiles while it has power, and explores outward while it
  // runs: `sweep` tiles a second, up to `reveal` tiles away.
  radar:            { name: 'Radar', kind: 'radar', power: 300, scan: 48, reveal: 160, sweep: 1.5, color: 0x8a96a6, vol: .6, glyph: 'think',
    desc: 'Keeps the map up to date for 48 tiles around it while it has power (300 kW), and slowly explores further, out to 160 tiles. Elsewhere the map only shows what was last seen.' },
  // Lamps come on by themselves when it gets dark. `light`: radius in tiles and colour of the pool of light.
  lamp:             { name: 'Lamp', kind: 'lamp', power: 5, light: { r: 7.5, color: 0xfff0d0 }, color: 0xc3cad3, vol: .1, glyph: 'shine', desc: 'Lights the ground around it at night (5 kW). Put it in a pole\'s area.' },
  brazier:          { name: 'Brazier', kind: 'lamp', burner: true, burn: .02, light: { r: 5.5, color: 0xffa04a, flicker: true }, color: 0x8f8373, vol: .1, glyph: 'heat', desc: 'Burns coal or wood to light the ground at night. A piece of coal lasts about a night.' },
  transmitter:      { name: 'Transmitter', kind: 'transmitter', power: 500, color: 0x4b4f5a, vol: 3, glyph: 'pulse', desc: 'Sends what it hears around it. Burns resonance packs.' },
  // Fluid handling (fluids.js). `cap` is how much fluid one tile holds. Pipe-like things carry whatever their line carries.
  pipe:             { name: 'Pipe', kind: 'pipe', cap: 100, color: 0x8a96a6, vol: .05, glyph: 'flow', desc: 'Carries one fluid. Joins every pipe and fluid port next to it, so lines branch wherever pipes meet. Long lines carry less per second.' },
  underground_pipe: { name: 'Underground pipe', kind: 'upipe', cap: 100, range: 11, color: 0x6a7686, vol: .2, glyph: 'tunnel', desc: 'Place one end, then the other up to 10 tiles ahead, facing the same way. Fluid passes under belts, roads and rails between.' },
  pump:             { name: 'Pump', kind: 'fpump', cap: 100, rate: 6000, power: 30, color: 0x3a7ab8, vol: .4, glyph: 'flow', desc: 'Pushes fluid one way, from behind it to in front, up to 6000/s. It splits a line in two and gives the far side full flow again.' },
  valve:            { name: 'Valve', kind: 'valve', cap: 100, color: 0xc84a3a, vol: .2, glyph: 'flow', desc: 'Lets fluid through one way only. Set it to pass only overflow (input side more than 80% full) or only to top up (output side under 50%).' },
  storage_tank:     { name: 'Storage tank', kind: 'tank', cap: 25000, color: 0x9aa4b0, vol: .5, glyph: 'keep', desc: 'Holds 25,000 units of one fluid. Connects on every side.' },
  oil_pump:         { name: 'Pumpjack', kind: 'oilpump', rate: 10, power: 90, cap: 100, ports: [{ side: 0, io: 'out', fluid: 'crude_oil' }], color: 0x6a5a8a, vol: 1, glyph: 'bore', desc: 'Place it on crude oil. Pumps 10 crude/s at 100% yield out of its front. Deposits never run dry, but slow down to 20%.' },
  refinery:         { name: 'Oil refinery', kind: 'assembler', model: 'refinery', cats: ['refine'], speed: 1, power: 420, cap: 200, augSlots: 3, color: 0x8a5a4a, vol: 2.5, glyph: 'heat',
    ports: [{ side: 2, io: 'in' }, { side: 3, io: 'out' }, { side: 0, io: 'out' }, { side: 1, io: 'out' }], desc: 'Splits crude oil into fuels. Crude goes in the back; the products come out left, front and right.' },
  chem_plant:       { name: 'Chemical plant', kind: 'assembler', model: 'chem', cats: ['chem'], speed: 1, power: 210, cap: 100, color: 0x4a8a6a, vol: 2, glyph: 'make',
    ports: [{ side: 2, io: 'in' }, { side: 3, io: 'in' }, { side: 0, io: 'out' }], desc: 'Fluid chemistry. Fluids go in the back and left side and come out the front; items by inserter.' },
  barreler:         { name: 'Barreling station', kind: 'assembler', model: 'barreler', cats: ['barrel'], speed: 1, power: 50, cap: 100, color: 0x6a7a5a, vol: 1, glyph: 'keep',
    ports: [{ side: 2, io: 'in' }, { side: 2, io: 'out' }], desc: 'Fills empty barrels from a pipe at its back, or empties barrels into it. Pick fill or empty as its recipe.' },
  fuel_generator:   { name: 'Diesel generator', kind: 'fgen', fluids: { diesel: 'in' }, out: 1500, cap: 100, gen: true, color: 0x7a6a4a, vol: 1.5, glyph: 'spark', desc: 'Burns diesel from a pipe for up to 1.5 MW. Only works as hard as the network needs. Feeds the pole whose area it stands in.' },
  vehicle_factory:  { name: 'Vehicle factory', kind: 'assembler', model: 'vfactory', cats: ['vehicle'], speed: 1, power: 300, augSlots: 4, color: 0x5a6a8a, vol: 3, glyph: 'make', desc: 'Builds vehicles. Pick a frame and an engine: together they decide speed and fuel.' },
  // Depots: storage for goods and fuel where vehicles dock. They sit next to the rail, road or water they serve.
  train_station:    { name: 'Train station', kind: 'depot', way: 'rail', cap: 40, fluidCap: 2000, color: 0xb84a3a, vol: 1, glyph: 'keep', desc: 'Put it beside a rail. Trains stop here, refuel from its tank, then load or unload by their schedule and its settings.' },
  truck_depot:      { name: 'Truck depot', kind: 'depot', way: 'road', cap: 32, fluidCap: 1000, color: 0x3a7ad8, vol: 1, glyph: 'keep', desc: 'Put it beside a road. Trucks park at the road tile next to it, refuel, and load or unload.' },
  port:             { name: 'Port', kind: 'depot', way: 'sea', cap: 48, fluidCap: 2000, color: 0x4a8aa8, vol: 1, glyph: 'keep', desc: 'Put it on the shore. Boats dock at the water next to it, refuel, and load or unload. Fish from nets unload here too.' },
  rail:             { name: 'Rail', kind: 'rail', shared: true, onRoad: true, color: 0x8a7a6a, vol: 0, glyph: 'flow', desc: 'Drag to lay track. Rails join every rail next to them: corners curve, three or four ways make a junction. Trains belong to no factory.' },
  // Advanced fluids. `flow` multiplies how much a line can carry: a line is as quick as its slowest pipe.
  steel_pipe:       { name: 'Steel pipe', kind: 'pipe', cap: 100, flow: 5, color: 0x5a6a7c, vol: .08, glyph: 'flow', desc: 'A pipe that carries five times as much. A line is only as quick as its slowest pipe, so a high pressure pump needs steel all the way.' },
  underground_steel_pipe: { name: 'Underground steel pipe', kind: 'upipe', cap: 100, flow: 5, range: 16, color: 0x4a5866, vol: .25, glyph: 'tunnel', desc: 'Steel underground pipe: ends up to 15 tiles apart, and five times the flow.' },
  // Irrigation: water only. Joins greenhouses, other irrigation pipes and water pipes. Greenhouses on one network share
  // its water by what each needs, so there is nothing to set up.
  irrigation_pipe:  { name: 'Irrigation pipe', kind: 'pipe', irrigation: true, cap: 100, color: 0x4a8a5a, vol: .05, glyph: 'flow', desc: 'Carries water to greenhouses on any side of them, and between greenhouses. Every greenhouse on the line gets what it needs while there is water to go round. Joins water pipes too.' },
  underground_irrigation: { name: 'Underground irrigation pipe', kind: 'upipe', irrigation: true, cap: 100, range: 11, color: 0x3a7a4a, vol: .2, glyph: 'tunnel', desc: 'Place one end, then the other up to 10 tiles ahead, facing the same way. Water passes under belts, roads and rails between.' },
  steel_irrigation_pipe: { name: 'Steel irrigation pipe', kind: 'pipe', irrigation: true, flow: 5, cap: 100, color: 0x3a6a5a, vol: .08, glyph: 'flow', desc: 'Irrigation pipe with five times the flow, for big greenhouse networks.' },
  underground_steel_irrigation: { name: 'Underground steel irrigation pipe', kind: 'upipe', irrigation: true, flow: 5, cap: 100, range: 16, color: 0x2a5a4a, vol: .25, glyph: 'tunnel', desc: 'Steel underground irrigation: ends up to 15 tiles apart, five times the flow.' },
  hp_pump:          { name: 'High pressure pump', kind: 'pump', onWater: true, fluids: { water: 'out' }, rate: 3600, fullRate: 'steel', cap: 200, color: 0x2a5a98, vol: .6, glyph: 'flow',
    desc: 'Place it on water. Pumps 3600 water/s, three water pumps\' worth: enough for 60 boilers and 120 steam engines, or two coolant towers. Only at full rate when its line is steel pipe all the way; through iron pipe it pumps 1200/s.' },
  green_lamp:       { name: 'Green lamp', kind: 'lamp', power: 5, light: { r: 7.5, color: 0x6aff7a }, color: 0x7ad88a, vol: .1, glyph: 'shine', desc: 'A lamp with a green light (5 kW). Lit green lamps next to a greenhouse make it grow 20% faster each, up to two.' },
  // Greenhouses are one room per group of touching greenhouse tiles (see multi.js): a greenhouse is 25 tiles, a panel
  // one. Mining a room takes all of it; Ctrl + mining takes one tile. `perTile`: every tile is worth its own share of an
  // item (perItem tiles to an item), so mining gives back by the tile; anything else over several tiles is one object
  // built from one item, and gives back exactly that one.
  greenhouse:       { name: 'Greenhouse', kind: 'greenhouse', size: [5, 5], multi: true, merge: true, perTile: true, tileMine: true, tileItem: 'greenhouse_panel', perItem: 25, water: 1.5, color: 0x7ad88a, vol: 2, glyph: 'keep',
    desc: 'A 5×5 glass room for growing crops. Touching greenhouses join into one room. Put seeds in with an inserter (or by hand), lead water in with irrigation pipe on any side, and inserters take out the harvest and spare seeds. Ctrl + mine removes one tile.' },
  greenhouse_panel: { name: 'Greenhouse panel', kind: 'greenhouse', as: 'greenhouse', size: [1, 1], multi: true, merge: true, perTile: true, tileMine: true, tileItem: 'greenhouse_panel', perItem: 1, water: 1.5, color: 0x8ae89a, vol: .1, glyph: 'keep',
    desc: 'One tile of greenhouse. Place it against a greenhouse to grow the room. 25 make a greenhouse.' },
  medical_lab:      { name: 'Medical lab', kind: 'medlab', speed: 1, power: 120, color: 0xe8e0e8, vol: 2, glyph: 'think', desc: 'Researches upgrades for every engineer in the world, using terrestrial packs, chlorophyll and crops. Choose them in research (T), Medical tab.' },
  // Nuclear. The leaching drill feeds sulfuric acid into the ground, which uranium needs.
  leach_drill:      { name: 'Leaching drill', kind: 'drill', rate: .4, depth: 1, power: 150, cap: 100, acid: 10, ports: [{ side: 2, io: 'in', fluid: 'sulfuric_acid' }], color: 0x6a8a3a, vol: 1.2, glyph: 'bore',
    desc: 'An electric drill that pumps sulfuric acid into the deposit (10 a piece of ore, piped in at the back). The only drill that can mine uranium; it mines anything else too.' },
  centrifuge:       { name: 'Centrifuge', kind: 'assembler', model: 'centrifuge', cats: ['centrifuge'], speed: 1, power: 350, augSlots: 2, color: 0x9ab83a, vol: 2, glyph: 'make', desc: 'Spins uranium ore into enriched uranium.' },
  reactor:          { name: 'Uranium reactor', kind: 'reactor', fluids: { water: 'in', steam: 'out' }, steam: 2000, heat: 60, cap: 2000, color: 0x5a6a4a, vol: 4, glyph: 'heat',
    repair: { steel: 40, adv_circuit: 10, brick: 20 }, scrap: { steel: 20, brick: 10 },
    desc: 'Burns uranium fuel cells to boil 2000 water/s into steam: 60 MW, the most of anything, and a fuel cell lasts over a minute at full power. Pipes join water at its left and right, steam at its front and back; steam engines and coolant towers can simply touch it. It runs hot: coolant towers touching it must keep it cool, or it breaks.' },
  coolant_tower:    { name: 'Coolant tower', kind: 'coolant', fluids: { water: 'in' }, cool: 1800, cap: 2000, color: 0xa8b0b8, vol: 2, glyph: 'flow',
    repair: { steel: 20, pipe: 10 }, scrap: { steel: 10 },
    desc: 'Put it against a uranium reactor and pipe water to it. One tower cools a reactor at full power, drawing up to 1800 water/s. Short of water, the reactor heats up and both break.' },
  // A dam is one object: drag it across water, a strip `width` tiles wide (like a road), one item a tile. It needs some
  // power to run, then gives a lot.
  dam:              { name: 'Dam', kind: 'dam', multi: true, onWater: true, drag: true, width: 2, merge: true, perTile: true, tileMine: false, onRoad: true, hv: true, power: 300, outTile: 180, current: 1, color: 0x8a8478, vol: 3, glyph: 'spark',
    desc: 'Drag it across water: it goes down two tiles wide, and every tile is one dam. Needs 300 kW to run its gates; running, it gives 180 kW a tile on still water and more on a river\'s current. It is high voltage: power it with a power line, or a transformer station. Roads can go on top.' },
};
// Poles: `supply` is how many tiles their powered area reaches out from the pole on every side (every pole's went up by
// two). Descriptions name the area as {area}, filled in here so they always match the numbers.
for (const d of Object.values(ENTITIES)) if (d.kind === 'pole') d.desc = d.desc.replace('{area}', `${d.supply * 2 + 1}×${d.supply * 2 + 1}`);
// Direct wiring (research): a power cable from a pole that `wiresBuildings` straight to a machine, up to the cable's
// `toBuilding` tiles away, powers it from that pole wherever it stands. Stations never do.
export const WIRE_TECH = 'direct_wiring';
export const wiresBuildings = d => d?.kind === 'pole' && !d.volts;
// How fluids connect: `fluids` buildings join neighbours on every side. Boilers take pipes only at their drum ends
// (water) and back (steam), so one pipe can't touch both. `ports` machines connect only at the listed sides.
ENTITIES.boiler.pipeSides = { water: [1, 3], steam: [2] };
// Big steam engines take pipes at their two ends; one-tile engines from old saves take them on every side.
ENTITIES.steam_engine.pipeSides = { steam: [0, 2] };
// Which fluid connections pass straight through (drawn as an in and an out arrow) rather than only going one way.
ENTITIES.boiler.through = ['water']; ENTITIES.steam_engine.through = ['steam'];
ENTITIES.reactor.pipeSides = { water: [1, 3], steam: [0, 2] };   // pipes: water at the sides, steam front and back
for (const id of ['water_pump', 'boiler', 'steam_engine']) ENTITIES[id].cap = 200;

// What the engineer bumps into. Machines are solid squares, a little inside their tile so you brush past their corners
// (two touching machines still leave no gap); things smaller than a tile get a smaller shape, so a row of them leaves
// room to squeeze past (the engineer is PLAYER.radius round: two rows of these always leave a gap wider than that, and
// so do two parallel pipe lines). `r`: a circle; `sq`: half the side of a square; 'pipe': a thin bar along each
// connected side; null: walk over it. Anything not listed is a full square (`SOLID`). Buildings over several tiles are
// solid right across, walls and water too.
export const SOLID = .43;
export const HIT_BY_KIND = { pipe: 'pipe', upipe: { sq: .16 }, fpump: { sq: .16 }, valve: { sq: .13 }, inserter: { r: .13 }, chest: { sq: .19 }, pole: { r: .08 },
  lamp: { r: .09 }, rail: null, belt: null, underground: null, splitter: null, dam: null };
export const HIT_BY_TYPE = { transformer: { sq: .26 }, power_line: { sq: .16 }, brazier: { r: .15 }, wooden_chest: { sq: .18 }, chest: { sq: .19 }, burner_inserter: { r: .13 } };
// Trees and rocks: a circle each.
export const FEATURE_HIT = { tree: .17, rock: .38 };
export const hitOf = type => { const def = ENTITIES[type]; return type in HIT_BY_TYPE ? HIT_BY_TYPE[type] : def && def.kind in HIT_BY_KIND ? HIT_BY_KIND[def.kind] : { sq: SOLID }; };
export const PIPE_HIT = .12;   // half the width of a pipe's bar

// Working machines glow at night: [radius, colour, flickers]. Depots keep a light on for the vehicles.
const GLOW = { furnace: [2.4, 0xff7a2a, 1], electric_furnace: [2, 0xff8a3a], steel_furnace: [2.2, 0xffa04a], crafting_station: [1.4, 0xffd88a], boiler: [2.6, 0xff7a2a, 1], burner_drill: [1.6, 0xff7a2a, 1],
  assembler: [1.4, 0x9fe8f2], assembler2: [1.6, 0x9fe8f2], lab: [2.2, 0x58c8d8], transmitter: [3.5, 0x7ef6ff], refinery: [2.4, 0xff8a3a, 1],
  chem_plant: [1.6, 0x9fe8f2], fuel_generator: [1.8, 0xffaa3a, 1], steam_engine: [1.2, 0x7ef6ff], vehicle_factory: [2, 0xfff0d0],
  train_station: [3, 0xffe0a0], truck_depot: [3, 0xffe0a0], port: [3, 0xffe0a0], medical_lab: [2.2, 0xd8f0ff], centrifuge: [1.8, 0x9be37a],
  reactor: [4.5, 0x9be37a], leach_drill: [1.4, 0xd8e04a], greenhouse: [3, 0x7aff8a], radar: [1.2, 0x7ef6ff] };
for (const [id, [r, color, flicker]] of Object.entries(GLOW)) ENTITIES[id].light = { r, color, flicker: !!flicker, machine: true };
// The day runs on a clock: `length` real seconds a full 24 hours (24 minutes: a minute an hour), and a world starts at
// hour `start`. The sun rises at `sunrise` and sets at `sunset` (hours) and climbs and sinks smoothly in between, so the
// light changes all day: warm and low in the morning and evening, white at midday, moonlight at night (the tints).
// Night deepens after dusk: the light falls from `nightLight` (late evening) to `midnightLight` at the middle of the
// night and comes back before dawn. `nightCurve` shapes that: higher keeps evenings lighter and makes only the hours
// around midnight really dark. Lamps, braziers, glowing machines and the engineer's own light still show through, and
// the interface is drawn after the lighting, so it never darkens.
export const DAY = { length: 1440, start: 8, sunrise: 5.5, sunset: 20, nightLight: [.2, .23, .36], midnightLight: [.042, .05, .1], nightCurve: 1.4, duskLight: [1, .86, .72] };
// Stippled see-through (see dither in models.js): how much of a thing is drawn, pixel by pixel, for each kind of
// see-through look. Nothing is ever half blended.
export const DITHER = { ghost: .25, preview: .6, blueprint: .5, glass: .4, ground: .1, roof: .5, tunnel: .35 };
// Levels of detail by zoom (pixels a tile takes on screen), shared by alt mode and the map. close: alt mode shows
// icons, fill and progress bars, and the map shows a rendered close-up; near: icons and bars; tiles: icons only, the map
// draws a pixel a tile; regions: no alt icons, the map draws whole regions at a quarter of that.
// Exploring the map (explore.js): an engineer sees `view` tiles around them, which explores those tiles and keeps them
// live on the map. Radars do the same further out (their `scan` and `reveal` in ENTITIES).
export const EXPLORE = { view: 40 };
export const LOD = [{ min: 16, id: 'close' }, { min: 8, id: 'near' }, { min: 1, id: 'tiles' }, { min: 0, id: 'regions' }];
// Producers take augments: two slots unless the building sets `augSlots`.
export const PRODUCER_KINDS = new Set(['drill', 'furnace', 'assembler', 'lab', 'oilpump', 'medlab']);
for (const e of Object.values(ENTITIES)) if (PRODUCER_KINDS.has(e.kind)) e.augSlots ??= 2;
for (const [id, e] of Object.entries(ENTITIES)) ITEMS[id] = { name: e.name, color: e.color, shape: 'machine', entity: id };

// Augments slot into producers. Each type has a boost per tier, and the boosts of every augment in a building add up
// (machineStats in sim.js turns them into the machine's numbers). speed: faster work. efficiency: less power and fuel,
// never below `minPower` of the normal draw. productivity: extra output from the same inputs. depth: drills only;
// tier n reaches n deposit layers deeper than the drill could (the deepest installed counts, since layers can't add
// up past bedrock, and two tiers already take any drill there). `belts`: also fits a belt line's slots (belts.js).
export const AUGMENTS = {
  speed:        { name: 'Speed', color: 0x4a9ad8, tiers: [.10, .15, .25, .35, .50], belts: true },
  efficiency:   { name: 'Efficiency', color: 0x6ac46a, tiers: [.10, .15, .25, .35, .50] },
  productivity: { name: 'Productivity', color: 0xe08a3a, tiers: [.10, .15, .25, .35, .50] },
  depth:        { name: 'Depth', color: 0xb07ad8, tiers: [1, 2], only: ['drill'] },
};
export const AUG_RULES = { minPower: .2, lineSlots: 2 };
export const augId = (type, tier) => `${type}_aug_${tier}`;
for (const [type, a] of Object.entries(AUGMENTS)) a.tiers.forEach((v, i) => {
  ITEMS[augId(type, i + 1)] = { name: `${a.name} augment ${i + 1}`, color: a.color, shape: 'aug', aug: type, tier: i + 1,
    desc: type === 'depth' ? `Drills only: reaches ${v} deposit layer${v > 1 ? 's' : ''} deeper.${v > 1 ? ' Takes any drill down to bedrock.' : ''}`
      : `${type === 'efficiency' ? '−' : '+'}${Math.round(v * 100)}% ${type === 'speed' ? 'speed' : type === 'efficiency' ? 'power and fuel' : 'output'}. Goes into drills, furnaces, assemblers, labs and pumpjacks${a.belts ? ', or a belt line' : ''}.` };
});

// Ore deposits never run dry: when a layer is used up, the deposit drops to the next one down. `size` multiplies the
// tile's generated richness (null: endless), `speed` scales how fast it is mined, and `double` is the chance that a
// drill's cycle yields two items instead of one.
export const DEPOSIT = [
  { id: 'surface', name: 'Surface', size: 4, speed: 1, double: 0 },
  { id: 'depth', name: 'Depth', size: 10, speed: .65, double: 1 / 6 },
  { id: 'bedrock', name: 'Bedrock', size: null, speed: .45, double: 0 },
];
// How an ore tile looks as it is worked, the same for every ore: a tile's wear is its deposit layer plus how much of that
// layer is gone (0 untouched, 1 the surface worked out, 2 down to bedrock), and its stage is the last one whose `at` it
// has passed. Untouched ground barely shows its ore (the map still does): a few stones in the soil. Worked tiles show
// more and more ore, dug down into a darker pit. piles: ore chunks on the tile; size: their scale; tint: how much the ore
// colour shows in the ground; specks: share of ground pixels that are bare ore; pit: how much darker the dug ground is;
// rubble: grey spoil mixed in; edge: how far ore ground spreads past its tile, so patches read as solid shapes.
export const ORE_STAGES = [
  { at: 0,   piles: 1, size: .5,  tint: .015, specks: .035, pit: 0,   rubble: 0,   edge: .38 },
  { at: .2,  piles: 2, size: .7,  tint: .04,  specks: .08,  pit: .05, rubble: .08, edge: .42 },
  { at: .5,  piles: 3, size: .85, tint: .07,  specks: .13,  pit: .1,  rubble: .14, edge: .45 },
  { at: .85, piles: 4, size: 1,   tint: .1,   specks: .18,  pit: .17, rubble: .2,  edge: .47 },
  { at: 1.3, piles: 4, size: 1.1, tint: .12,  specks: .22,  pit: .26, rubble: .26, edge: .48 },
  { at: 2,   piles: 3, size: 1.15, tint: .14, specks: .27,  pit: .36, rubble: .32, edge: .5 },
];
export const oreStage = wear => { let s = 0; for (let k = 0; k < ORE_STAGES.length; k++) if (wear >= ORE_STAGES[k].at - 1e-6) s = k; return s; };

// Things that no longer exist, and the parts a save gets back for each one it still holds.
// Lifts: angled belts do what they did, from the start. Lifts standing in a save become angled belts (save.js).
// Extra-low voltage: generators feed ordinary poles now. Its poles in a save become small poles, its cables power cables.
export const RETIRED = { generator: { brick: 10, gear: 8, iron_plate: 5 }, lift: { belt: 4, steel: 2, frame: 1 },
  generator_pole: { cable: 1 }, step_up: { iron_plate: 5, gear: 2, cable: 8 }, step_up_cable: { cable: 4, copper_plate: 1 } };

// Stack sizes decide how many inventory / chest slots things take.
const STACKS = { ore: 50, crystal: 50, wood: 100, plate: 100, brick: 100, lens: 100, gear: 100, cable: 200, chip: 200, coil: 100, pack: 200,
  barrel: 50, engine: 10, vehicle: 1, part: 20, wheel: 50, hull: 10, signal: 50, net: 5, fish: 50, road: 100, aug: 50, seed: 100, crop: 50, vial: 100, pellet: 50, cell: 50 };
const MACHINE_STACKS = { lamp: 50, brazier: 50, belt: 100, fast_belt: 100, express_belt: 100, bus_belt: 100, small_pole: 50, medium_pole: 50, lab: 10, transmitter: 5, frame: 50, big_drill: 10,
  power_line: 20, transformer: 10, crafting_station: 10, water_pump: 20, steam_engine: 10, pipe: 100, rail: 100, storage_tank: 10, refinery: 10, vehicle_factory: 5,
  steel_pipe: 100, irrigation_pipe: 100, steel_irrigation_pipe: 100, green_lamp: 50, greenhouse: 10, greenhouse_panel: 100, dam: 100, reactor: 5, coolant_tower: 5, hp_pump: 10 };
for (const [id, it] of Object.entries(ITEMS)) it.stack = it.shape === 'machine' ? (MACHINE_STACKS[id] ?? 50) : (STACKS[it.shape] ?? 50);

// `radius`: the engineer's round footprint. Small things (HIT_BY_KIND) leave gaps wider than it, so rows of them can be squeezed past.
// `slide`: brushing a corner, the engineer is nudged up to this far sideways around it instead of stopping dead.
export const PLAYER = { speed: 6.5, reach: 10, mineReach: 3, inventory: 80, radius: .22, slide: .34,
  // health comes back `regen` a second once `regenDelay` seconds pass without a hit (faster while well fed);
  // sprinting multiplies speed by `sprint` and burns stamina, and an empty bar has to refill to `rested` first
  health: 100, regen: 2, fedRegen: 6, regenDelay: 5, stamina: 100, sprint: 1.55, sprintCost: 20, staminaRegen: 16, staminaDelay: .8, rested: 25,
  hitSpeed: 1.5, hitDamage: 9 };   // vehicles moving faster than hitSpeed hurt you: hitDamage per tile a second

// Trading between engineers (trade.js): accept works only `wait` seconds after the last change to either offer, and a
// trade is called off when the two are more than `reach` tiles apart.
// A guest whose input hasn't arrived for `quiet` seconds counts as gone (a closed tab can take a while to be noticed).
export const TRADE = { wait: 3, reach: 16, quiet: 5 };
export const BELT_KINDS = new Set(['belt', 'underground', 'splitter']);

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
  R('burner_inserter', { gear: 1, iron_plate: 1 }, .5),
  R('inserter', { circuit: 1, gear: 1, iron_plate: 1 }, .5),
  R('long_inserter', { inserter: 1, gear: 1, iron_plate: 1 }, .5, { tech: 'long_arms' }),
  R('fast_inserter', { inserter: 1, circuit: 2, iron_plate: 2 }, .5, { tech: 'fast_inserter' }),
  R('filter_inserter', { fast_inserter: 1, circuit: 4 }, .5, { tech: 'filter_inserter' }),
  R('burner_drill', { gear: 3, furnace: 1, iron_plate: 3 }, 2),
  R('drill', { circuit: 3, gear: 5, iron_plate: 10 }, 2),
  R('furnace', { stone: 5 }, .5),
  R('electric_furnace', { steel: 10, circuit: 5, brick: 10 }, 5, { tech: 'electric_smelting' }),
  R('steel_furnace', { electric_furnace: 1, steel: 10, circuit: 10, brick: 10 }, 5, { tech: 'advanced_smelting' }),
  R('crafting_station', { assembler: 1, inserter: 2, wooden_chest: 1 }, 2, { tech: 'crafting_stations' }),
  R('assembler', { circuit: 3, gear: 5, iron_plate: 9 }, .5, { tech: 'automation' }),
  R('assembler2', { assembler: 1, adv_circuit: 3, steel: 5, gear: 5 }, .5, { tech: 'automation2' }),
  R('lab', { circuit: 10, gear: 10, belt: 4 }, 2),
  R('wooden_chest', { wood: 2 }, .5),
  R('chest', { iron_plate: 8 }, .5),
  { ...R('small_pole', { wood: 1, cable: 2 }, .5), out: { small_pole: 2 } },
  R('medium_pole', { steel: 2, copper_plate: 2, iron_plate: 2 }, .5, { tech: 'electric_distribution' }),
  R('frame', { iron_plate: 4, gear: 2 }, .5),
  R('water_pump', { circuit: 2, gear: 1, iron_plate: 2 }, .5),
  R('boiler', { furnace: 1, iron_plate: 4 }, .5),
  R('steam_engine', { gear: 8, iron_plate: 15 }, .5),
  R('power_cable', { cable: 4, iron_plate: 1 }, .5),
  R('power_line', { steel: 6, circuit: 4, copper_plate: 6 }, 1, { tech: 'high_voltage' }),
  R('transformer', { steel: 10, coil: 6, circuit: 6 }, 2, { tech: 'high_voltage' }),
  R('transformer_cable', { power_cable: 2, steel: 1 }, .5, { tech: 'high_voltage' }),
  R('solar', { steel: 5, circuit: 15, copper_plate: 5 }, 10, { tech: 'solar' }),
  R('brazier', { stone: 5, iron_plate: 1 }, .5),
  R('lamp', { iron_plate: 2, cable: 3, circuit: 1 }, .5),
  R('radar', { circuit: 5, gear: 5, iron_plate: 10 }, 2),   // from the start, as in Factorio: it needs power, which comes early
  R('transmitter', { adv_circuit: 20, steel: 20, lens: 10, abyssal_alloy: 10 }, 10, { tech: 'signal_theory' }),
  { ...R('fast_underground', { underground: 2, gear: 8 }, 1, { tech: 'logistics2' }), out: { fast_underground: 2 } },
  { ...R('express_underground', { fast_underground: 2, steel: 4, circuit: 2 }, 1, { tech: 'logistics3' }), out: { express_underground: 2 } },
  R('bus_belt', { fast_belt: 1, belt: 1, iron_plate: 2 }, .5, { tech: 'bus_belts' }),
  { ...R('bus_underground', { bus_belt: 6, steel: 4 }, 1, { tech: 'bus_belts' }), out: { bus_underground: 2 } },
  R('big_drill', { drill: 4, steel: 20, adv_circuit: 5, gear: 10 }, 6, { tech: 'deep_drilling' }),   // four drills' worth, plus what reaches bedrock
  // fluids and oil
  R('pipe', { iron_plate: 1 }, .5),   // from the start: boilers, pumps and engines join by pipe
  { ...R('underground_pipe', { pipe: 10, iron_plate: 5 }, 1, { tech: 'fluid_handling' }), out: { underground_pipe: 2 } },
  R('pump', { circuit: 2, gear: 1, pipe: 1 }, 1, { tech: 'fluid_handling' }),
  R('valve', { pipe: 2, gear: 1, circuit: 1 }, .5, { tech: 'fluid_handling' }),
  R('storage_tank', { iron_plate: 20, steel: 5 }, 3, { tech: 'advanced_fluids' }),
  R('barrel', { iron_plate: 1 }, .5, { tech: 'advanced_fluids' }),
  R('barreler', { iron_plate: 10, gear: 5, pipe: 5, circuit: 2 }, 2, { tech: 'advanced_fluids' }),
  R('oil_pump', { steel: 5, gear: 10, circuit: 5, pipe: 10 }, 5, { tech: 'oil_processing' }),
  R('refinery', { steel: 15, gear: 10, circuit: 10, pipe: 10, brick: 10 }, 8, { tech: 'oil_processing' }),
  R('chem_plant', { steel: 5, gear: 5, circuit: 5, pipe: 5 }, 5, { tech: 'oil_processing' }),
  R('fuel_generator', { steel: 10, gear: 10, pipe: 5, circuit: 5 }, 5, { tech: 'oil_processing' }),
  // roads, rails, depots, vehicles
  { ...R('gravel_road', { stone: 2 }, .5, { tech: 'roads' }), out: { gravel_road: 4 } },
  { ...R('cobble_road', { brick: 2 }, .5, { tech: 'roads' }), out: { cobble_road: 4 } },
  { ...R('path_tile', { brick: 1 }, .5, { tech: 'roads' }), out: { path_tile: 2 } },
  { ...R('road_conduit', { cable: 4, steel: 1, brick: 1 }, .5, { tech: 'road_power' }), out: { road_conduit: 2 } },
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
  // advanced fluids
  R('steel_pipe', { steel: 1 }, .5, { tech: 'advanced_fluids' }),
  { ...R('underground_steel_pipe', { steel_pipe: 10, steel: 5 }, 1, { tech: 'advanced_fluids' }), out: { underground_steel_pipe: 2 } },
  R('steel_irrigation_pipe', { irrigation_pipe: 1, steel: 1 }, .5, { tech: 'advanced_fluids' }),
  { ...R('underground_steel_irrigation', { steel_irrigation_pipe: 10, steel: 5 }, 1, { tech: 'advanced_fluids' }), out: { underground_steel_irrigation: 2 } },
  R('hp_pump', { circuit: 4, gear: 2, iron_plate: 4, steel: 10 }, 2, { tech: 'advanced_fluids' }),   // steel plus twice a water pump's recipe
  // agriculture
  { ...R('irrigation_pipe', { pipe: 1, copper_plate: 1 }, .5, { tech: 'agriculture' }), out: { irrigation_pipe: 2 } },
  { ...R('underground_irrigation', { irrigation_pipe: 10, iron_plate: 5 }, 1, { tech: 'agriculture' }), out: { underground_irrigation: 2 } },
  R('chlorophyll', { '#seed': 4 }, 2, { tech: 'agriculture' }),
  R('green_lamp', { lamp: 1, chlorophyll: 1 }, .5, { tech: 'agriculture' }),
  R('greenhouse', { lamp: 4, chlorophyll: 10, steel: 10 }, 5, { tech: 'agriculture' }),
  { ...R('greenhouse_panel', { greenhouse: 1 }, .5, { tech: 'agriculture' }), out: { greenhouse_panel: 25 } },
  { ...R('greenhouse', { greenhouse_panel: 25 }, .5, { tech: 'agriculture' }), id: 'greenhouse_from_panels', name: 'Greenhouse from panels', icon: 'greenhouse' },
  R('terrestrial_pack', { '#seed': 1, chlorophyll: 2, green_lamp: 1 }, 10, { tech: 'terrestrial_science' }),
  R('medical_lab', { lab: 1, chlorophyll: 20, steel: 10, circuit: 10 }, 5, { tech: 'terrestrial_science' }),
  // power from water, and nuclear
  R('dam', { brick: 6, steel: 2, gear: 2 }, 1, { tech: 'hydro_power' }),
  R('leach_drill', { drill: 1, steel: 10, pipe: 5, circuit: 5 }, 3, { tech: 'uranium_processing' }),
  R('centrifuge', { steel: 50, gear: 50, adv_circuit: 10, brick: 50 }, 8, { tech: 'uranium_processing' }),
  { id: 'uranium_processing', cat: 'centrifuge', in: { uranium_ore: 10 }, out: { enriched_uranium: 1 }, time: 12, tech: 'uranium_processing' },
  { ...R('uranium_fuel_cell', { enriched_uranium: 1, iron_plate: 10 }, 10, { tech: 'nuclear_power', hand: false }), out: { uranium_fuel_cell: 10 } },
  R('reactor', { steel: 150, adv_circuit: 50, concrete_road: 100, brick: 100 }, 20, { tech: 'nuclear_power' }),
  R('coolant_tower', { steel: 30, concrete_road: 50, pipe: 20, gear: 10 }, 8, { tech: 'nuclear_power' }),
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
  F('sulfuric_acid', 'chem', 'Sulfuric acid', 'sulfuric_acid', 1, { fin: { water: 100 }, in: { iron_plate: 1, coal: 2 }, fout: { sulfuric_acid: 50 }, tech: 'uranium_processing' }),
);
// Augments: tier 1 from plain parts, every tier after from two of the tier below plus rarer parts.
const AUG_FIRST = { speed: { circuit: 5, gear: 5, coil: 2 }, efficiency: { circuit: 5, cable: 10, steel: 2 }, productivity: { circuit: 5, steel: 3, brick: 5 } };
const AUG_UP = [null, { adv_circuit: 3 }, { adv_circuit: 5, lens: 3 }, { adv_circuit: 5, abyssal_alloy: 4 }, { adv_circuit: 10, abyssal_alloy: 8, crystal: 8 }];
for (const type of ['speed', 'efficiency', 'productivity']) for (let t = 1; t <= 5; t++)
  RECIPES.push(R(augId(type, t), t === 1 ? AUG_FIRST[type] : { [augId(type, t - 1)]: 2, ...AUG_UP[t - 1] }, 5 * t, { tech: t === 1 ? 'augments' : 'augments_' + t }));
RECIPES.push(R(augId('depth', 1), { steel: 10, gear: 10, circuit: 10, adv_circuit: 2 }, 10, { tech: 'deep_drilling' }),
  R(augId('depth', 2), { [augId('depth', 1)]: 2, abyssal_alloy: 5, adv_circuit: 5 }, 20, { tech: 'augments_4' }));
// A barreling station picks these itself: in fill mode by the fluid in its pipe, in empty mode by the barrels it gets.
for (const [f, d] of Object.entries(FLUIDS)) if (d.barrel) RECIPES.push(
  F('fill_' + f, 'barrel', 'Fill ' + d.name.toLowerCase() + ' barrel', f + '_barrel', .2, { in: { barrel: 1 }, fin: { [f]: BARREL_SIZE }, out: { [f + '_barrel']: 1 }, tech: 'advanced_fluids', auto: true }),
  F('empty_' + f, 'barrel', 'Empty ' + d.name.toLowerCase() + ' barrel', 'barrel', .2, { in: { [f + '_barrel']: 1 }, fout: { [f]: BARREL_SIZE }, out: { barrel: 1 }, tech: 'advanced_fluids', auto: true }));
for (const [id, v] of Object.entries(VEHICLES)) {
  const fr = FRAMES[v.frame];
  RECIPES.push({ id, cat: 'vehicle', in: { ...fr.parts, ...(v.engine ? { [v.engine]: 1 } : {}) }, out: { [id]: 1 }, time: fr.time, tech: v.engine === 'turbine_engine' ? 'advanced_oil' : fr.tech });
}
export const RECIPE = Object.fromEntries(RECIPES.map(r => [r.id, r]));
export const recipeIcon = r => r.icon || r.id;
export const recipeName = r => r.name || ITEMS[r.id]?.name || r.id;

const r = 'red_pack', g = 'green_pack', b = 'blue_pack', AUG3 = ['speed', 'efficiency', 'productivity'];
const T = (id, name, packs, count, time, pre, unlocks, extra = {}) =>
  ({ id, name, cost: Object.fromEntries(packs.map(p => [p, 1])), count, time, pre, unlocks, ...extra });
export const TECHS = [
  T('automation', 'Automation', [r], 10, 10, [], ['assembler']),
  T('logistics', 'Logistics', [r], 20, 15, [], ['underground', 'splitter']),
  T('long_arms', 'Long arms', [r], 15, 10, ['automation'], ['long_inserter']),
  T('steel', 'Steel processing', [r], 25, 5, [], ['steel']),
  T('logistic_science', 'Logistic science', [r], 40, 5, ['automation'], ['green_pack']),
  T('fast_inserter', 'Fast inserter', [r], 30, 15, ['automation'], ['fast_inserter']),
  T('logistics2', 'Logistics 2', [r, g], 50, 15, ['logistics', 'logistic_science'], ['fast_belt']),
  T('electric_distribution', 'Electric distribution', [r, g], 40, 10, ['steel', 'logistic_science'], ['medium_pole']),
  T('high_voltage', 'High voltage', [r, g], 60, 15, ['electric_distribution'], ['power_line', 'transformer', 'transformer_cable']),
  // electric poles (not stations) run power cables straight to machines
  T('direct_wiring', 'Direct wiring', [r, g], 40, 10, ['electric_distribution'], ['cables from poles to machines']),
  T('solar', 'Solar energy', [r, g], 60, 10, ['steel', 'logistic_science'], ['solar']),
  // electric furnaces come with red science, right after steel; the steel electric furnace is their green upgrade
  T('electric_smelting', 'Electric smelting', [r], 50, 15, ['steel'], ['electric_furnace']),
  T('advanced_smelting', 'Advanced smelting', [r, g], 75, 15, ['electric_smelting', 'logistic_science'], ['steel_furnace']),
  T('crafting_stations', 'Crafting stations', [r], 30, 10, ['automation', 'logistics'], ['crafting_station']),
  T('filter_inserter', 'Filter inserter', [r, g], 60, 15, ['fast_inserter', 'logistic_science'], ['filter_inserter']),
  T('excavation', 'Excavation', [r, g], 60, 15, ['logistics', 'logistic_science'], ['layer -1'], { precision: 1 }),
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
  T('road_power', 'Powered roads', [r, g], 60, 15, ['roads', 'electric_distribution'], ['road_conduit']),
  T('fluid_handling', 'Fluid handling', [r, g], 50, 10, ['steel', 'logistic_science'], ['underground_pipe', 'pump', 'valve']),
  // exactly these seven, nothing more: Factorio-sized pipes and pumps, and the fluid storage and barreling that go with them
  T('advanced_fluids', 'Advanced fluids', [r, g, b], 120, 20, ['fluid_handling', 'precision_science'], ['steel_pipe', 'underground_steel_pipe', 'steel_irrigation_pipe', 'underground_steel_irrigation', 'hp_pump', 'storage_tank', 'barreler']),
  T('soil_science', 'Soil science', [r, g], 40, 10, ['logistic_science'], ['shovel']),
  T('agriculture', 'Agriculture', [r, g], 75, 15, ['soil_science', 'fluid_handling', 'steel'], ['greenhouse', 'greenhouse_panel', 'irrigation_pipe', 'underground_irrigation', 'chlorophyll', 'green_lamp']),
  T('terrestrial_science', 'Terrestrial science', [r, g], 100, 15, ['agriculture'], ['terrestrial_pack', 'medical_lab']),
  T('hydro_power', 'Hydro power', [r, g, b], 120, 20, ['high_voltage', 'fluid_handling'], ['dam']),
  // anything nuclear needs steel pipe first
  T('uranium_processing', 'Uranium processing', [r, g, b], 150, 20, ['advanced_fluids', 'oil_processing'], ['leach_drill', 'centrifuge', 'sulfuric_acid', 'uranium_processing']),
  T('nuclear_power', 'Nuclear power', [r, g, b, 'terrestrial_pack'], 200, 30, ['uranium_processing', 'advanced_fluids', 'terrestrial_science'], ['reactor', 'coolant_tower', 'uranium_fuel_cell']),
  T('oil_processing', 'Oil processing', [r, g], 75, 15, ['fluid_handling'], ['oil_pump', 'refinery', 'chem_plant', 'basic_refining', 'heavy_cracking', 'rubber', 'solid_fuel', 'asphalt_road', 'concrete_road', 'fuel_generator']),
  T('vehicles', 'Vehicles', [r, g], 75, 15, ['oil_processing', 'automation'], ['vehicle_factory', 'chassis', 'wheel', 'petrol_engine', 'diesel_engine', 'car_petrol', 'car_diesel', 'truck_diesel', 'truck_depot']),
  T('railways', 'Railways', [r, g], 75, 15, ['vehicles'], ['rail', 'rail_signal', 'train_station', 'locomotive_diesel', 'cargo_wagon']),
  T('shipping', 'Shipping', [r, g], 60, 15, ['vehicles'], ['port', 'hull', 'marine_engine', 'boat_marine', 'boat_diesel', 'fishing_net']),
  T('advanced_oil', 'Advanced oil processing', [r, g, b], 100, 15, ['oil_processing', 'precision_science'], ['advanced_refining', 'jet_blending', 'turbine_engine', 'truck_turbine', 'locomotive_turbine', 'boat_turbine']),
  T('tanks', 'Tanks', [r, g, b], 100, 20, ['vehicles', 'advanced_oil'], ['armor_plate', 'turret', 'tank_diesel', 'tank_turbine']),
  T('bus_belts', 'Bus belts', [r, g], 60, 15, ['logistics2'], ['bus_belt', 'bus_underground']),
  T('deep_drilling', 'Deep drilling', [r, g, b], 100, 20, ['advanced_electronics'], ['big_drill', augId('depth', 1)]),
  T('augments', 'Augments', [r, g], 75, 15, ['steel', 'logistic_science'], AUG3.map(a => augId(a, 1))),
  T('augments_2', 'Augments 2', [r, g, b], 100, 20, ['augments', 'advanced_electronics'], AUG3.map(a => augId(a, 2))),
  T('augments_3', 'Augments 3', [r, g, b], 150, 20, ['augments_2', 'optics'], AUG3.map(a => augId(a, 3))),
  T('augments_4', 'Augments 4', [r, g, b], 200, 25, ['augments_3', 'deep_excavation'], [...AUG3.map(a => augId(a, 4)), augId('depth', 2)]),
  T('augments_5', 'Augments 5', [r, g, b, 'resonance_pack'], 150, 30, ['augments_4', 'signal_theory'], AUG3.map(a => augId(a, 5))),
];
for (const [t, u] of [['logistics2', 'fast_underground'], ['logistics3', 'express_underground']]) TECHS.find(x => x.id === t).unlocks.push(u);
// Tool upgrades: a speed line and a radius line per tool, each level needing the one before.
for (const [tool, d] of Object.entries(TOOLS)) for (const kind of ['speed', 'radius']) d[kind].forEach((v, i) => TECHS.push(T(
  `${tool}_${kind}_${i + 1}`, `${d.name} ${kind === 'speed' ? 'speed' : 'sweep'} ${i + 1}`, d.packs[i], [30, 75, 150][i], 15,
  i ? [`${tool}_${kind}_${i}`] : d.tech ? [d.tech] : [], [kind === 'speed' ? `${d.name.toLowerCase()} ×${v} speed` : `${d.name.toLowerCase()} hits within ${v} tiles`], { tool, toolKind: kind })));
// The research tree's sections, top to bottom. Each tech names its section in TECH_CAT; anything not listed falls into
// `fallback` (tool upgrades go to Tools by themselves), so a new tech always lands somewhere.
export const TECH_CATS = [
  { id: 'production', name: 'Production', color: '#e0a92e' },
  { id: 'logistics', name: 'Logistics', color: '#7ef6ff' },
  { id: 'power', name: 'Power', color: '#ffd23f' },
  { id: 'fluids', name: 'Fluids and oil', color: '#4aa3ff' },
  { id: 'transport', name: 'Transport', color: '#d8b07a' },
  { id: 'military', name: 'Military', color: '#d84a3a' },
  { id: 'biology', name: 'Biology', color: '#9be37a' },
  { id: 'science', name: 'Science and depth', color: '#b07ad8' },
  { id: 'tools', name: 'Tools', color: '#c3cad3' },
];
const TECH_CAT = {
  production: ['automation', 'automation2', 'electric_smelting', 'advanced_smelting', 'crafting_stations', 'steel', 'deep_drilling', 'augments', 'augments_2', 'augments_3', 'augments_4', 'augments_5', 'factory_planning'],
  logistics: ['logistics', 'logistics2', 'logistics3', 'long_arms', 'fast_inserter', 'filter_inserter', 'bus_belts'],
  power: ['electric_distribution', 'direct_wiring', 'high_voltage', 'solar', 'hydro_power', 'nuclear_power', 'road_power'],
  fluids: ['fluid_handling', 'advanced_fluids', 'oil_processing', 'advanced_oil', 'uranium_processing'],
  transport: ['roads', 'vehicles', 'railways', 'shipping'],
  military: ['tanks'],
  biology: ['soil_science', 'agriculture', 'terrestrial_science'],
  science: ['logistic_science', 'precision_science', 'advanced_electronics', 'optics', 'excavation', 'deep_excavation', 'signal_theory', 'resonance'],
};
for (const t of TECHS) t.cat = Object.keys(TECH_CAT).find(c => TECH_CAT[c].includes(t.id)) || (t.tool ? 'tools' : 'science');
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
