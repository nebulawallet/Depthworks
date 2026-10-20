// Every hand-written article, the redirects, and notes added to generated item pages.
import basics from './basics.js';
import logistics from './logistics.js';
import power from './power.js';
import progress, { BIOME_TEXT } from './progress.js';
import wildlife from './wildlife.js';

export const ARTICLES = [...basics, ...logistics, ...power, ...progress, ...wildlife];
export { BIOME_TEXT };

// Other names people search for: alias -> 'Page' or 'Page#Section'.
export const ALIASES = {
  'Belts': 'Belt logistics', 'Belt lines': 'Belt logistics#Belt lines', 'Bus belts': 'Belt logistics#Bus belts', 'Splitters': 'Belt logistics#Splitters',
  'Underground belts': 'Belt logistics#Underground belts', 'Lanes': 'Belt logistics#Lanes', 'Side-loading': 'Belt logistics#Lanes', 'Lifts': 'Belt logistics#Angled belts', 'Lift': 'Belt logistics#Angled belts', 'Slopes': 'Belt logistics#Angled belts', 'Inclines': 'Belt logistics#Angled belts',
  'Power': 'Electricity', 'Electric network': 'Electricity', 'Voltages': 'Electricity#Voltages', 'Brownout': 'Electricity#Brownouts', 'Direct wiring': 'Electricity#Direct wiring', 'Poles': 'Electricity#Poles',
  'Barrel': 'Empty barrel', 'Barrels': 'Fluids#Barrels', 'Pipes': 'Fluids', 'Valves': 'Fluids#Buildings', 'Oil': 'Oil processing', 'Refining': 'Oil processing#Refining', 'Chemistry': 'Oil processing#Chemistry',
  'Trains': 'Railways', 'Rail signals': 'Railways#Signals', 'Signals': 'Railways#Signals', 'Boats': 'Shipping', 'Ships': 'Shipping', 'Trucks': 'Vehicles', 'Cars': 'Vehicles', 'Tanks': 'Vehicles',
  'Engines': 'Vehicles#Engines', 'Frames (vehicles)': 'Vehicles#Frames', 'Driving': 'Vehicles#Driving',
  'Logistics window': 'Routes and depots', 'Routes': 'Routes and depots', 'Depots': 'Routes and depots', 'Schedules': 'Routes and depots#Routes',
  'Co-op': 'Multiplayer', 'Coop': 'Multiplayer', 'Invite code': 'Multiplayer#Hosting and joining', 'Chat': 'Multiplayer#Playing together',
  'Farming': 'Agriculture', 'Greenhouses': 'Agriculture#Greenhouses', 'Seeds': 'Agriculture#Seeds', 'Weedy patch': 'Agriculture#Seeds', 'Crops': 'Agriculture',
  'Medical lab upgrades': 'Medical research', 'Adaptations': 'Medical research#Adaptations', 'Mutations': 'Medical research#Mutations', 'Upgrades': 'Medical research',
  'Layers': 'Depth', 'Depth mode': 'Depth#Depth mode', 'Frames': 'Hollow frame', 'Excavation': 'Excavation (research)', 'Underground': 'Depth#Building down',
  'Precision tiers': 'Precision', 'Engineering volume': 'Precision#Active volume', 'Active volume': 'Precision#Active volume', 'Volume': 'Precision#Active volume',
  'Tech tree': 'Research', 'Research tree': 'Research', 'Technologies': 'List of technologies', 'Research queue': 'Research#The research window', 'Labs': 'Lab',
  'Aliens': 'The Signal', 'Signal': 'The Signal', 'Glyphs': 'The Signal#Sentences', 'Glyph': 'The Signal#Sentences', 'Clarity': 'The Signal#Clarity', 'Conversation': 'The Signal#The conversation', 'Endgame': 'The Signal',
  'Ores': 'Resources', 'Ore': 'Resources', 'Raw materials': 'Resources', 'Deposits': 'Mining#Deposits', 'Bedrock': 'Mining#Deposits', 'Drills': 'Mining#Drills', 'Hand mining': 'Mining#Hand mining',
  'Furnaces': 'Smelting', 'Assemblers': 'Crafting#Machines', 'Hand crafting': 'Crafting#Hand crafting', 'Recipes': 'List of recipes', 'Items': 'List of items', 'Buildings': 'List of buildings',
  'Player': 'Engineer', 'Character': 'Engineer', 'Health': 'Engineer#Health', 'Stamina': 'Engineer#Sprinting and stamina', 'Sprinting': 'Engineer#Sprinting and stamina', 'Reach': 'Engineer#Reach', 'Death': 'Engineer#Health', 'Inventory': 'Engineer#Inventory',
  'Axe': 'Tools#Axe', 'Pickaxe': 'Tools#Pickaxe', 'Shovel': 'Tools#Shovel', 'Tool upgrades': 'Tools#Upgrades',
  'Keys': 'Controls', 'Keybindings': 'Controls', 'Key bindings': 'Controls', 'Hotkeys': 'Controls', 'HUD': 'Interface', 'Quickbar': 'Interface#The HUD', 'Hotbar': 'Interface#The HUD', 'Alt mode': 'Interface#In the world', 'Menu': 'Interface#The menu', 'Settings': 'Interface#The menu',
  'Night': 'Day and night', 'Day': 'Day and night', 'Time': 'Day and night', 'Lamps': 'Day and night#Lights', 'Light': 'Day and night#Lights',
  'Dams': 'Hydroelectric power', 'Hydro power': 'Hydroelectric power', 'Nuclear': 'Nuclear power', 'Reactor': 'Uranium reactor', 'Uranium': 'Uranium ore', 'Solar': 'Solar power', 'Steam': 'Steam power',
  'Chests': 'Storage', 'Pipette': 'Building#Pipette', 'Selection': 'Building#Selecting many', 'Transfer modes': 'Building#Selecting many', 'Fast replace': 'Building#Placing', 'Placing': 'Building', 'Rotating': 'Building#Placing',
  'Fish': 'Fishing', 'Eating': 'Food', 'Well fed': 'Food',
  'Exploration': 'Map#Exploring', 'Minimap': 'Map', 'Radars': 'Radar', 'Markers': 'Map#Markers and areas',
  'Getting started': "Beginner's guide", 'Guide': "Beginner's guide", 'Tutorial': "Beginner's guide", 'How to play': "Beginner's guide", 'Walkthrough': "Beginner's guide", 'Goals': "Beginner's guide",
  'World options': 'World generation#World options', 'Seed (world)': 'World generation#World options', 'Landing site': 'World generation#The landing site', 'Rivers': 'World generation#Water', 'Lakes': 'World generation#Water',
  'Save': 'Saving', 'Saves': 'Saving', 'Export': 'Saving', 'Load': 'Saving', 'Autosave': 'Saving',
  'Factory': 'Factories', 'Fuel value': 'Fuel', 'Science': 'Science packs', 'Packs': 'Science packs', 'Modules': 'Augments', 'Augment': 'Augments',
  'Biome': 'Biomes', 'Hazard': 'Hazards', 'Exposure': 'Hazards', 'Copy settings': 'Copy and paste', 'Paste': 'Copy and paste', 'Blueprint': 'Blueprints', 'Trade': 'Trading', 'Creative mode': 'Sandbox',
  'Change logs': 'Changelog', 'Changes': 'Changelog', 'Patch notes': 'Changelog', 'Version history': 'Changelog', 'Updates': 'Changelog', 'Version': 'Changelog',
  'Wildlife': 'Animals', 'Animal': 'Animals', 'Fauna': 'Animals', 'Creatures': 'Animals', 'Livestock': 'Animals', 'Farm animals': 'Animals#How they behave', 'Shearing': 'Animals#By hand', 'Catching animals': 'Animals#By hand', 'Eggs': 'Egg', 'Meat': 'Raw meat', 'Steak': 'Cooked meat',
  'Guns': 'Weapons', 'Gun': 'Weapons', 'Weapon': 'Weapons', 'Firearms': 'Weapons#Research', 'Shooting': 'Weapons#Firing', 'Firing': 'Weapons#Firing', 'Reloading': 'Weapons#Ammunition and reloading', 'Reload': 'Weapons#Ammunition and reloading',
  'Ammo': 'Weapons#Ammunition', 'Ammunition': 'Weapons#Ammunition', 'Bullets': 'Weapons#Ammunition', 'Magazine': 'Weapons#Ammunition and reloading', 'Crosshair': 'Weapons#Firing', 'Hunt': 'Hunting', 'Hunting animals': 'Hunting',
  'Rifle': 'Bolt-action rifle', 'Submachine gun': 'SMG', 'Pistol round': 'Pistol rounds', 'Rifle round': 'Rifle rounds', 'Shells': 'Shotgun shells', 'Shotgun shell': 'Shotgun shells', 'Gun powder': 'Gunpowder',
  'Cows': 'Cow', 'Chickens': 'Chicken', 'Rabbits': 'Rabbit', 'Pigs': 'Pig', 'Foxes': 'Fox', 'Goats': 'Goat', 'Wild horses': 'Wild horse', 'Horse': 'Wild horse', 'Horses': 'Wild horse', 'Marmots': 'Marmot',
  'Snow hares': 'Snow hare', 'Hare': 'Snow hare', 'Ducks': 'Duck', 'Frogs': 'Frog', 'Herons': 'Heron', 'Lizards': 'Lizard', 'Fennec': 'Fennec fox', 'Fennec foxes': 'Fennec fox', 'Musk oxen': 'Musk ox', 'Arctic foxes': 'Arctic fox',
  'Ember beetles': 'Ember beetle', 'Beetle': 'Ember beetle', 'Cinder moths': 'Cinder moth', 'Moth': 'Cinder moth', 'Glowing snails': 'Glowing snail', 'Snail': 'Glowing snail', 'Spore moths': 'Spore moth', 'Crystal crabs': 'Crystal crab', 'Crab': 'Crystal crab',
  'Chime birds': 'Chime bird', 'Two-headed boars': 'Two-headed boar', 'Boar': 'Two-headed boar', 'Mutant boar': 'Two-headed boar',
  'FAQ': 'Tips and tricks', 'Tips': 'Tips and tricks', 'Game': 'Depthworks',
};

// Extra notes for generated item pages (wikitext), keyed by item id.
export const NOTES = {
  iron_plate: "Iron plates are the most used item in the game: gears, circuits, belts, inserters, chests and most buildings need them. You land with eight. Five plates smelt into one {{i|steel}}.",
  copper_plate: "Nearly all copper goes into {{i|cable|copper cable}} (two cables a plate), and from there into {{i|circuit|circuits}}.",
  coal: "The first fuel. Rocks give 6 coal each, a quick way to get started, and charred trees in the [[Ashlands]] give coal too.",
  wood: "Felled from trees with the axe. Wood is a weak fuel, and goes into wooden chests, small poles, ports, hulls and fishing nets.",
  stone: "Rocks give 20 stone each. Two stone smelt into a {{i|brick}}; five make a stone furnace.",
  crystal: "Resonant crystal lies '''under the ground''', on layer −1 (and layer −2 in the [[Singing steppe]]). It smelts into {{i|lens|lenses}} for precision packs and advanced circuits, and goes into resonance packs as it is. Reaching it needs {{t|excavation}} and [[Precision|precision]] 1.",
  abyssal_ore: "Abyssal ore lies on layer −2, the bottom of the world (and on layer −1 in the [[Ashlands]]). Reaching it needs {{t|deep_excavation}} and [[Precision|precision]] 2. Its alloy goes into the transmitter, resonance packs and the best augments.",
  burner_drill: "You land with one. It only reaches the surface layer of a deposit: when its tile is worked down to depth it stops with ''needs a depth upgrade''. Move it, give it a {{i|depth_aug_1}}, or replace it with an electric drill.",
  drill: "The workhorse of the mid game. It reaches the depth layer, where a deposit holds ten times as much again and one cycle in six gives two ores.",
  big_drill: "Over four ore tiles it mines exactly as much as four electric drills, using a little more power (400 kW against 360 kW) and with fewer augment slots (3 against 8). What it buys is '''bedrock''', a single output and fewer inserters. Over fewer ore tiles its rate and power fall to match.",
  furnace: "Furnaces choose their recipe from what is put in them. A furnace that changed recipe can show two result slots until the old results are taken out.",
  assembler: "Click an assembler to choose its recipe. Inserters will only bring it that recipe's ingredients.",
  crafting_station: "Its arm reaches into any wooden or iron chest of its factory within a 7×7 square and fetches ingredients one at a time, enough for two crafts. Put a chest of plates next to it and it makes gears with no inserters at all.",
  lab: "All labs work on the same technology. See [[Research]].",
  transmitter: "Everything about what it does is in [[The Signal]].",
  frame: "The key to building up. Anything above the ground stands on frames, and a working machine '''inside''' a frame counts double towards [[Precision|precision]]. See [[Depth]].",
  small_pole: "One recipe makes two. Small poles wire to each other up to 7.5 tiles apart: dragging a line spaces them 7 apart, so their areas overlap.",
  water_pump: "1,200 water a second: exactly enough for 20 boilers.",
  boiler: "At full output a boiler burns 1.8 MW of fuel, a piece of coal every 2.2 seconds, but it only works as hard as its engines need.",
  steam_engine: "Two engines take all the steam one boiler makes.",
  splitter: "Unlike in ''Factorio'', a splitter here is a single tile that deals to three ways: front, left and right.",
  radar: "Available from the start. It needs no research, only power.",
  reactor: "Keep a coolant tower against it at all times. See [[Nuclear power]] for heat and repairs.",
  greenhouse: "A greenhouse can be crafted into 25 panels, and 25 panels back into a greenhouse, so rooms can take any shape.",
  pipe: "Available from the start: you need pipes to connect a first steam engine if the buildings don't touch.",
  dam: "Each tile of a dam is one item. It needs at least two tiles along the water.",
  chlorophyll: "Any seeds will do: four of any mix make one.",
  resonance_pack: "Only an assembler can make it. Each pulse of the transmitter burns one.",
  rail_signal: "Signals here are two-way. See [[Railways#Signals]].",
  power_cable: "Strings a wire between two poles of one voltage, up to 32 tiles. After {{t|direct_wiring}} it can also run from a pole straight to a machine.",
};
