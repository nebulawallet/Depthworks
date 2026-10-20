// The change log: newest first. The title screen's Change logs and the wiki's Changelog page both read this, and the
// version in the title screen's corner is the newest entry's. Add an entry for every push players will notice: see
// CLAUDE.md for how versions are numbered and what an entry should say. Text may use <b> and <i>.
export const CHANGELOG = [
  {
    version: '0.5.3', stage: 'alpha', date: '2026-10-20', title: 'Simpler power, and going underground',
    summary: 'Generators now plug straight into ordinary poles, and the engineer can go below the ground: down slopes into the layers under it, and through underground belts.',
    changes: [
      '<b>No more extra-low voltage.</b> Steam engines and diesel generators feed whatever pole they stand next to, just like solar panels. The generator pole, step-up station and step-up cable are gone: they were an extra step every power plant needed with no choice in it, and the most common reason a first steam engine seemed not to work. Old worlds keep running: those poles and stations turn into small electric poles and their cables into power cables, and any you carry come back as the parts they were made of.',
      '<b>Walk underground.</b> A slope down to layer −1 opens the ground where it stands. Walk (or ride) down it, move about among what you have built down there, and come back up an upward slope. The view switches to depth mode on your layer by itself, and back when you climb out.',
      '<b>Ride through underground belts.</b> Step onto an entrance and the belt carries you down into its tunnel, under whatever it crosses, and up out of the exit. Walking forward speeds you along.',
      '<b>Longer underground belts:</b> 6 tiles for plain ones (was 4), 8 fast, 10 express and 8 for bus undergrounds, so every tier crosses the widest road. For anything longer, take the belt down to layer −1.',
      'The engineer moves in short steps, so climbing a slope works on a slow computer or at a sprint, and you stay on a slope while running down it instead of floating off it.',
      '<b>Change logs</b> on the title screen (this list) and in the wiki.',
    ],
  },
  {
    version: '0.5.2', stage: 'alpha', date: '2026-10-20', title: 'Climbing',
    summary: 'The engineer has a height now, so they can stand on things other than the ground.',
    changes: [
      'Walk up an angled belt (or let it carry you) onto the hollow frames it leads to, and walk about on top of them. Up there you bump into what is built on that layer. Walk off the edge and you drop back to the ground.',
      'The side of a slope is a wall above ankle height, so you get on at its low end. Frames overhead are still walked under.',
      'Vehicles only hit you on the ground. Your height is saved, and friends in co-op see you up there.',
    ],
  },
  {
    version: '0.5.1', stage: 'alpha', date: '2026-10-20', title: 'Slopes done properly, goodbye lifts',
    summary: 'Angled belts got a rule that makes them predictable, and they replace lifts entirely.',
    changes: [
      '<b>A slope stands on the lower of the two layers it joins.</b> A slope down placed on the ground brings a raised belt down onto it, where before it dug into layer −1. Point just past the end of a belt on your own layer to take that belt down a layer instead.',
      '<b>Lifts are retired</b>, with their research. Angled belts do the same job from the start, in flat mode too. Lifts in old worlds become angled belts where they stand, and lift items come back as belts, steel and frames.',
      'Angled belts looked like a dark slab because their moving surface sat inside the base. Fixed, with arrows the same size as on flat belts.',
      'The grey bar between belt tiles is gone: it was the steel rollers at the ends of each tile poking above the belt.',
      'The version number shows in the corner of the title screen.',
    ],
  },
  {
    version: '0.5', stage: 'alpha', date: '2026-10-20', title: 'The wiki, and belts that climb',
    summary: 'A full encyclopedia of the game, built into it, and the first belts that go up and down a layer.',
    changes: [
      '<b>Depthworks Wiki:</b> a beginner\'s guide, articles on every system, and a page for every item, building, technology and biome, built from the game\'s own data so the numbers always match. Open it with F2 or the Wiki button on the title screen; a solo game pauses while it is open.',
      '<b>Angled belts:</b> hold a belt and press V to make it slope one layer up or down, like an incline conveyor.',
      '<b>Underground belt tunnels</b> show in depth mode below the ground, as a belt in a dug channel carrying its traffic.',
    ],
  },
  {
    version: '0.4', stage: 'alpha', date: '2026-10-14', title: 'Research tree, blueprints and exploring', retro: true,
    summary: 'A proper research tree, planning ahead with blueprints, and a map that only knows what you have seen.',
    changes: [
      'A research queue and a left-to-right tech tree window with search. Electric furnaces at red science, the steel electric furnace, crafting stations that fetch from chests, and powered roads.',
      'Blueprints (Shift + place), Q over ore picks the best drill, Shift + click selects buildings for fuel, input, store and augment transfer modes, and belt outputs into chests.',
      'The map shows only explored ground, and radars keep it up to date. The 2×2 big mining drill reaches bedrock. Trading between engineers, and a medical research tree.',
      'The depth-mode camera orbits freely round what it looks at.',
    ],
  },
  {
    version: '0.3', stage: 'alpha', date: '2026-10-14', title: 'Big worlds', retro: true,
    summary: 'Generated worlds up to 65,536 tiles across, with biomes, farming and big power.',
    changes: [
      'Worlds made from a seed, chunk by chunk, with eleven biomes, their hazards, ores, trees and crops.',
      'Farming in greenhouses, the medical lab, dams, uranium reactors, and copying settings between buildings.',
      'A 24-hour clock with a smooth day; health, sprinting and stamina; crafting what you place when you run out; the F1 pause menu.',
    ],
  },
  {
    version: '0.2', stage: 'alpha', date: '2026-10-13', title: 'Logistics and power', retro: true,
    summary: 'The factory grows up: steam power, oil, vehicles and real belt lines.',
    changes: [
      'Water and steam power, high voltage lines, the map, quickbars and hiding the interface.',
      'Oil and pipes, vehicles built from engines and frames, roads, rails, routes, separate factories and fish.',
      'Two-lane belt lines, bus belts, augments, deposits that go deeper instead of running out, and sandbox mode.',
    ],
  },
  {
    version: '0.1', stage: 'alpha', date: '2026-10-13', title: 'First version', retro: true,
    summary: 'The 2.5D pixel factory game, and playing it together.',
    changes: [
      'Mining, crafting, belts, inserters, power, research, building on layers, precision, and the Signal.',
      'Free co-op with invite codes and nicknames, and slot inventories with drag and drop.',
    ],
  },
];
// The version the title screen shows: the newest entry's.
export const VERSION = `${CHANGELOG[0].version} ${CHANGELOG[0].stage}`;
