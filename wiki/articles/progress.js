// Articles: research and progression, depth, the Signal, the world, farming, the body, and playing together.
export default [
{
  title: 'Research', desc: 'Labs, the tech tree and the research queue', cats: ['Progression'], icon: 'lab',
  body: `'''Research''' unlocks new recipes, buildings and abilities in [[Depthworks]]. [[Lab|Labs]] use up [[Science packs|science packs]] to work through technologies chosen from the '''research tree'''.

{{further|List of technologies}}

== Labs ==

A {{i|lab}} needs power (60 kW) and science packs. Feed it the packs the current technology needs, by hand or with inserters. Every unit of a technology takes one of each of its packs and some seconds of lab time; all labs work on the same technology together, so more labs finish it sooner. A productivity [[Augments|augment]] in a lab sometimes finishes an extra unit for free.

== The research window ==

Press {{k|research}} to open the research tree. Technologies are laid out left to right, each after what it needs, in sections stacked top to bottom. Drag to pan, scroll to zoom, and type to search. Hovering over a technology shows what it costs and unlocks, and lights up the lines to its prerequisites.

* '''Click''' a technology to add it to the queue, along with anything it still needs.
* {{kbd|Ctrl}} + '''click''' puts it (and what it needs) at the front of the queue.
* '''Right-click''' takes it out of the queue, along with anything queued that needs it.

The queue panel shows what is coming; items can be moved up or down, but never ahead of what they need. Labs always work on the first queued technology that can run. One that needs more [[Precision|precision]] than you have waits its turn.

The window has a second tab, '''Medical''', for the [[Medical research|medical lab's]] upgrades.

== Sections ==

=== Production ===

Assemblers, steel, electric furnaces, crafting stations, the big drill, augments and factory planning.

=== Logistics ===

Undergrounds and splitters, faster belts, bus belts, and long, fast and filter inserters.

=== Power ===

Medium poles, high voltage, direct wiring, solar, dams, nuclear power and powered roads.

=== Fluids and oil ===

Underground pipes, pumps and valves, steel pipe and storage tanks, oil processing and uranium processing.

=== Transport ===

Roads, vehicles, railways and shipping.

=== Military ===

Tanks. There are no enemies in the game; tanks are heavy vehicles that drive through trees.

=== Biology ===

The shovel, greenhouses and terrestrial science.

=== Science and depth ===

The science packs, optics and advanced electronics, excavation into the ground, and the road to [[The Signal]].

=== Tools ===

Speed and sweep upgrades for the [[Tools|axe, pickaxe and shovel]].

== Precision gates ==

Three technologies also need your factory to have reached a [[Precision|precision tier]]: {{t|excavation}} (tier 1), {{t|deep_excavation}} (tier 2) and {{t|resonance}} (tier 3).

== In co-op ==

Research is shared by everyone in the world; any engineer can change the queue.

== See also ==

* [[Science packs]]
* [[List of technologies]]
* [[Precision]]`,
},
{
  title: 'Science packs', desc: 'The packs that labs use', cats: ['Progression'], icon: 'red_pack',
  body: `'''Science packs''' are what labs use to research technologies. There are five kinds, each opening more of the tree.

{{gen|packs}}

* {{i|red_pack|Automation packs}} are the first, made from a copper plate and a gear.
* {{i|green_pack|Logistic packs}} come with {{t|logistic_science}}; each takes an inserter and a belt.
* {{i|blue_pack|Precision packs}} need lenses, made from resonant crystal under the ground, so they mean building on layer −1.
* {{i|terrestrial_pack|Terrestrial packs}} come from [[Agriculture|farming]]: seeds, chlorophyll and green lamps. Nuclear power, the last shovel upgrade and the [[Medical research|medical lab]] use them.
* {{i|resonance_pack|Resonance packs}} need abyssal alloy from layer −2 and can only be made in an assembler. They feed the [[The Signal|transmitter]], the Resonance technology and the last augments.

== See also ==

* [[Research]]
* [[List of technologies]]`,
},
{
  title: 'Precision', desc: 'Tiers earned by keeping machines busy', cats: ['Progression'], icon: 'assembler2',
  body: `'''Precision''' is the measure of how much engineering your factory is actually doing. It rises as you keep more machines busy, and opens higher layers, deeper layers and the end of the research tree. It is one of the two ideas the game is built on (the other is [[Depth|depth]]).

== Active volume ==

Every building has a '''volume'''. Your '''active engineering volume''' is the sum of the volumes of every machine that did work in the last 8 seconds. Idle and decorative buildings count for nothing.

[[Hollow frame|Hollow frames]] reward using depth: a frame with a working machine '''inside''' it counts double its volume, and a frame holding up something working above it counts once.

The status panel shows your tier, your active volume and the volume the next tier needs.

== Tiers ==

{{gen|tiers}}

Tiers are never lost: once reached, a tier stays even if your factory goes quiet. Each tier-up rebuilds every model with finer detail, so precision is something you can see.

Some research needs a tier as well as packs: {{t|excavation}} needs tier 1, {{t|deep_excavation}} tier 2 and {{t|resonance}} tier 3.

== Volume of each building ==

{{gen|volumes}}

== See also ==

* [[Depth]]
* [[Research]]`,
},
{
  title: 'Depth', desc: 'Layers, hollow frames, angled belts and depth mode', cats: ['Progression'], icon: 'frame',
  body: `'''Depth''' is the idea that gives [[Depthworks]] its name. The world has seven buildable '''layers''', from −2 (deep rock) to 4 (four frames up), and you can build on all of them. The ground is layer 0.

== Depth mode ==

Press {{k|depthMode}} to switch to '''depth mode''', where the camera drops lower and you choose the working layer with {{k|layerUp}} and {{k|layerDown}} (or {{kbd|Shift}} + wheel). Layers above yours turn to ghosts so you can see what you are doing. The camera orbits with {{k|camLeft}}/{{k|camRight}} or a middle-button drag and tilts with {{k|camLower}}/{{k|camHigher}}; {{k|depthGrid}} toggles the grid. Leaving depth mode puts the camera back. Flat mode is for throughput; depth mode is for construction.

== Which layers are open ==

! Layer !! Needs
| 4 || precision tier 3
| 3 || precision tier 2
| 2 || precision tier 1
| 1 || from the start
| 0 (the ground) || from the start
| −1 || {{t|excavation}} and precision tier 1
| −2 || {{t|deep_excavation}} and precision tier 2

== Building up ==

Anything above the ground stands on a {{i|frame}}: every tile of a building on layer 1 needs a frame under it on layer 0, and so on up. Frames stack. You can also build '''inside''' a frame, on its own layer, and walk under frames. A working machine inside a frame counts double towards [[Precision|precision]].

== Building down ==

Layers −1 and −2 are solid rock with their own [[Mining#Ore below the ground|deposits]]: {{i|crystal}} and rich iron and copper on layer −1, {{i|abyssal_ore}} on layer −2. Drills placed there mine those deposits. These two materials are what [[Precision pack|precision packs]], [[Advanced circuit|advanced circuits]] and the [[The Signal|transmitter]] need, so the endgame literally sits at the bottom of the world.

== Moving items between layers ==

* An '''[[Belt logistics#Angled belts|angled belt]]''' slopes one layer up or down: hold a belt and press {{k|pitch}} before placing it. It always stands on the lower of its two layers, so a slope down onto the ground goes on the ground tile just past the end of the raised belt.
* An inserter's '''pitch''' ({{k|pitch}} in depth mode) can be level, lift (drop one layer up) or drop (one layer down).
* [[Belt logistics#Underground belts|Underground belts]]: page down below the ground in depth mode to see their tunnel, a belt in a dug channel with its traffic on it.

== See also ==

* [[Precision]]
* [[Hollow frame]]
* [[The Signal]]`,
},
{
  title: 'Augments', desc: 'Speed, efficiency, productivity and depth modules', cats: ['Production'], icon: 'speed_aug_1',
  body: `'''Augments''' are modules that slot into producing buildings to change how they work. There are four kinds, three of them in five tiers.

{{gen|augments}}

; Speed
: The building works faster. Speed augments also fit a [[Belt logistics#Belt lines|belt line's]] two augment slots, speeding up the whole line.
; Efficiency
: The building uses less power and fuel, never below 20% of its normal draw.
; Productivity
: Extra output from the same inputs. Each finished craft fills a bar by the augment's share; each time the bar passes full, one more of the result comes out.
; Depth
: Drills only. A drill reaches one (tier 1) or two (tier 2) [[Mining#Deposits|deposit layers]] deeper than it normally could. Two tiers take any drill to bedrock. Only the deepest depth augment in a drill counts.

Augments of the same kind in one building add up.

== Slots ==

Drills, furnaces, assemblers, labs, pumpjacks and medical labs have two augment slots unless they say otherwise:

{{gen|augslots}}

{{kbd|Ctrl}} + click a building with an augment in hand to put it in a free slot.

== Recipes ==

Tier 1 augments are made from plain parts; every tier after needs two of the tier below plus rarer parts.

{{gen|augrecipes}}

== See also ==

* [[Mining]]
* [[Crafting]]`,
},
{
  title: 'The Signal', desc: 'The transmitter and the alien conversation', cats: ['Progression'], icon: 'resonance_pack',
  box: { title: 'The Signal', glyph: 'pulse', img: 'transmitter', caption: 'The <code>pulse</code> glyph, which begins every sentence', rows: [['Building', '{{i|transmitter}}'], ['Research', '{{t|signal_theory}}'], ['Burns', '1 {{i|resonance_pack}} a pulse'], ['Power', '500 kW'], ['Pulse time', '4 s'], ['Hearing range', '5 tiles'], ['Exchanges', '9']] },
  body: `'''The Signal''' is the endgame of [[Depthworks]]. There is no rocket. Instead, the player builds a '''transmitter''' and holds a conversation with something far away that can only speak in the mechanisms it has heard you use.

== The transmitter ==

{{t|signal_theory}} unlocks the {{i|transmitter}} and {{i|resonance_pack|resonance packs}}. Both need [[Abyssal alloy|abyssal alloy]] from layer −2 and [[Resonant crystal|crystal]] from below the ground, so the conversation sits at the bottom of the world.

A transmitter uses 500 kW and burns one resonance pack for every '''pulse''', which takes 4 seconds to charge. Feed it packs with an inserter and it keeps pulsing.

== Sentences ==

Every pulse carries a '''sentence'''. The transmitter hears every '''working''' machine within 5 tiles of it (in a square), and each kind of mechanism is a '''glyph''', a word. The sentence starts with <code>pulse</code> and lists the glyphs it heard, nearest first, each once. Machines above the ground add <code>above</code>, below it <code>below</code>, and on layer −2 <code>abyss</code>; a frame with a working machine inside adds <code>hollow</code>.

{{gen|glyphs}}

{{gen|glyphtable}}

Every glyph you send is '''taught''' to them, and stays taught.

== The conversation ==

The first pulse makes contact; a reply arrives a few seconds later. Each message ends with a '''request''', shown as a hint in the signal panel ({{k|signal}}). You answer by building the mechanisms it asks for next to the transmitter, keeping them working, and pulsing again: once a sentence contains every glyph they asked for, the conversation moves on. There are nine exchanges.

Between requests, every fourth pulse may bring an '''ambient''' message: something they say using only glyphs you have already taught them.

<details class="spoil"><summary>Show the whole conversation (spoilers)</summary>
{{gen|conversation}}
<p>Ambient messages:</p>
{{gen|ambient}}
</details>

== Clarity ==

Their messages arrive partly unreadable: words you can't yet translate show as ▒ blocks. '''Clarity''' decides how many words come through. It grows with your [[Precision|precision tier]], with how many glyphs you have taught them, and with how far the conversation has gone, and the {{t|resonance}} technology adds a large step. Old messages in the log are re-translated as clarity improves, so you understand past messages better as your factory gets better.

== See also ==

* [[Depth]]
* [[Precision]]
* [[Transmitter]]`,
},
{
  title: 'Map', desc: 'The minimap, big map, exploration and radars', cats: ['Mechanics'], icon: 'radar',
  body: `The '''map''' shows the world as far as it has been seen. There is a '''minimap''' in the corner of the screen and a '''big map''' opened with {{k|map}} (or by clicking the minimap).

== Exploring ==

The map only ever draws tiles someone has seen. An engineer sees 40 tiles around them, which explores those tiles and keeps them '''live''': up to date. Everything explored but not watched shows as it was last seen, dimmed. Explored tiles are saved with the world.

=== Radars ===

A {{i|radar}} (craftable from the start) keeps 48 tiles around it live while it has power (300 kW), and slowly explores outward at 1.5 tiles a second, out to 160 tiles.

== The big map ==

Drag to pan and scroll to zoom. Zoomed out, it draws whole regions; zoomed right in, it shows a rendered close-up of the world itself, which in depth mode can be turned and tilted with a right-drag. The minimap zooms with the wheel, and its close-up fills the whole frame.

=== Views ===

! View !! Shows
| Terrain || the ground, water and biomes
| Resources || ore deposits and oil
| Production || buildings coloured by what they are doing
| Power || buildings coloured by power
| Factories || buildings coloured by [[Factories|factory]]

=== Markers and areas ===

Place '''markers''' and draw labelled '''areas''' on the map, with names and colours. In co-op they are shared. The ''Assign'' tool moves the buildings in an area to another [[Factories|factory]].

Vehicles show on the map only where it is live.

== See also ==

* [[World generation]]
* [[Factories]]`,
},
{
  title: 'World generation', desc: 'World options, chunks, water and the landing site', cats: ['World'], icon: 'gravel_road',
  body: `Every new world in [[Depthworks]] is '''generated''' from a seed, chunk by chunk (32×32 tiles) as it is needed, so even the largest worlds start in a fraction of a second and save as only their seed, options and what changed.

== World options ==

The new game screen offers:

! Option !! Choices
| Size || 512 to 65,536 tiles a side (2,048 by default)
| Seed || any number; the same seed makes the same world
| Biome size || small, normal or large
| Water || low, normal or high
| Ore || poor, normal or rich

== Biomes ==

{{main|Biomes}}

Each tile takes the biome closest to its climate (temperature, moisture and strangeness), so biomes are large, with wandering borders that blend smoothly into each other.

== The landing site ==

You always land in a gentle biome, with livable land all around. Every world puts the same small starter deposits nearby: iron ore to the west-north-west, copper ore to the north-east, coal just to the south and stone to the south-east, with larger ones a little further out and crystal and abyssal ore underneath. No water lies within 44 tiles of the landing site, and stray uranium no closer than 300 tiles.

== Water ==

The world's edge is ringed by ocean, and low land floods into lakes. In about half of worlds, rivers run along channels between lakes: every river tile has a current that flows on into a lake, and dams on rivers give much more power. Water can't be walked on or built on, except by [[Water pump|pumps]] and [[Dam|dams]].

== Ore and oil ==

Each biome has its own ores, in patches, veins or scattered nuggets, and its own chance of crude oil wells. Deposits also lie on layers −1 and −2. See [[Resources]].

== Weedy patches ==

Patches of tangled ground in every biome hold seeds for the [[Agriculture|shovel]].

== Old worlds ==

Worlds saved before generated worlds existed stay as they were: 96 tiles a side.

== See also ==

* [[Biomes]]
* [[Map]]`,
},
{
  title: 'Biomes', desc: 'The eleven biomes and what is in them', cats: ['World'], icon: 'crystal',
  body: `[[Depthworks]] worlds hold eleven '''biomes'''. Five are gentle and livable; six are harsh or strange, each with a [[Hazards|hazard]]. Every biome has its own ground, ores, trees, ground cover, weedy patches, crops and chance of crude oil.

{{gen|biomes}}

== Gentle biomes ==

[[Temperate meadow]], [[Old forest]], [[Dry steppe]], [[Boreal taiga]] and [[Fen]] have no hazard. You always land in one of them, usually a meadow.

== Harsh and strange biomes ==

! Biome !! Hazard !! Worth going for
| [[Glass desert]] || Heat || copper veins, crude oil
| [[Frost waste]] || Cold || rich iron
| [[Ashlands]] || Toxic fumes || coal, abyssal ore near the surface
| [[Glowcap hollows]] || Neurotoxic spores || crystal underground
| [[Singing steppe]] || Resonance || crystal on both underground layers
| [[Pripyatic wastes]] || Radiation || uranium, irradiated seeds

Hazards never kill and fade a few seconds after you leave. [[Medical research|Adaptations]] take them away.

== Crops by biome ==

{{gen|crops}}

== See also ==

* [[Hazards]]
* [[World generation]]
* [[Agriculture]]`,
},
{
  title: 'Hazards', desc: 'Heat, cold, fumes, spores, resonance and radiation', cats: ['World'], icon: 'uranium_ore',
  body: `'''Hazards''' are the dangers of the six harsh [[Biomes|biomes]]. Standing in one builds up '''exposure''' over 12 seconds; leaving lets it fade over 12 seconds. At full exposure the hazard's effect applies in full. '''No hazard can kill you.'''

{{gen|hazards}}

The status panel shows the biome you are in, its hazard and how much of it is getting through.

== Heat ==

The [[Glass desert]]. Stamina comes back at half speed.

== Cold ==

The [[Frost waste]]. You walk 15% slower.

== Toxic fumes ==

The [[Ashlands]]. Sprinting costs twice the stamina, and it comes back slower.

== Neurotoxic spores ==

The [[Glowcap hollows]]. Hand mining and hand crafting are 25% slower.

== Resonance ==

The [[Singing steppe]]. The ringing in the ground shortens your reach by 3 tiles.

== Radiation ==

The [[Pripyatic wastes]]. Health stops coming back and slowly drains, but never below half. Digging uranium ore by hand anywhere also gives a little radiation.

== Resisting hazards ==

Each hazard has an '''adaptation''' in the [[Medical research|medical lab]]: each of its two levels halves the effect, so both levels remove it. The ''Lead lungs'' mutation makes every hazard 25% weaker a level.

== See also ==

* [[Biomes]]
* [[Medical research]]`,
},
{
  title: 'Agriculture', desc: 'Seeds, greenhouses, chlorophyll and terrestrial science', cats: ['Biology'], icon: 'greenhouse',
  body: `'''Agriculture''' in [[Depthworks]] grows crops in greenhouses. It leads to chlorophyll, green lamps, [[Terrestrial pack|terrestrial science]], [[Medical research|medical upgrades]] and food.

== Seeds ==

Every biome has '''weedy patches''', tangled ground that the '''shovel''' digs up ({{t|soil_science}}). Digging a patch turns it into plain ground, and two times in three it turns up one or two seeds of one of that biome's three crops. Seeds from the [[Pripyatic wastes]] are '''irradiated''': finding one opens the mutation upgrades in the medical lab.

Any seeds press into {{i|chlorophyll}} (4 seeds each), the base of everything else here.

{{gen|crops}}

== Greenhouses ==

A {{i|greenhouse}} ({{t|agriculture}}) is a 5×5 glass room. Touching greenhouses join into one room; {{i|greenhouse_panel|greenhouse panels}} add single tiles, and {{kbd|Ctrl}} + mining takes one tile off. A cut room splits in two.

A room grows '''one crop''' and needs:

* '''seeds''' of that crop: one for every five tiles (a 25-tile greenhouse needs five). They are replanted after every harvest, so they are never used up. Put them in by hand or with an inserter;
* '''water''' from [[Irrigation pipe|irrigation pipe]] on any side: 1.5 water a second a tile while growing.

A crop takes 60 seconds to grow. Each harvest gives half a crop a tile and a few spare seeds (a 25-tile greenhouse: 13 crops and 4 seeds a minute), which inserters take out. A room stops when it holds 20 items a tile.

=== Sharing water ===

All greenhouses on one irrigation network share its water by need. When there isn't enough to go round, every room gets the same share and grows that much slower, so big networks need no setting up. Irrigation pipe joins water pipes too.

=== Green lamps ===

A lit {{i|green_lamp}} next to a greenhouse makes it grow 20% faster; up to two count (+40%). Like lamps, they only light up at night.

== Terrestrial science ==

{{t|terrestrial_science}} unlocks {{i|terrestrial_pack|terrestrial packs}} (seeds, chlorophyll and a green lamp) and the {{i|medical_lab}}.

== Recipes ==

{{gen|recipes-tech|agriculture}}

== See also ==

* [[Medical research]]
* [[Food]]
* [[Biomes]]`,
},
{
  title: 'Medical research', desc: 'The medical lab and its upgrades', cats: ['Biology'], icon: 'medical_lab',
  body: `'''Medical research''' upgrades the body of every engineer in the world. It runs in {{i|medical_lab|medical labs}} ({{t|terrestrial_science}}), on its own tree and queue under the '''Medical''' tab of the research window ({{k|research}}).

== How it works ==

A medical lab uses 120 kW. Each '''unit''' of research takes one {{i|terrestrial_pack}} and two {{i|chlorophyll}}, plus one of a particular crop for adaptations and mutations, and 30 seconds of lab time. Every level of every upgrade is its own node in the tree, needing the level before it; each level takes 1.8 times as many units as the last.

{{gen|medcosts}}

Upgrades apply to every engineer in the world at once, and are kept with the world.

== Body ==

{{gen|medical|body}}

== Adaptations ==

Each adaptation halves one [[Hazards|hazard's]] effect a level. Each needs that hazard's biome crop.

{{gen|medical|adapt}}

== Mutations ==

Mutations only open once someone has found '''irradiated seeds''' in the [[Pripyatic wastes]].

{{gen|medical|mutation}}

== See also ==

* [[Agriculture]]
* [[Hazards]]
* [[Engineer]]`,
},
{
  title: 'Multiplayer', desc: 'Co-op with friends: hosting, joining and chat', cats: ['Multiplayer'], icon: 'transmitter',
  body: `[[Depthworks]] has free '''co-op multiplayer''' straight from the browser. Players connect peer to peer, so there is no server to rent and nothing to install.

== Hosting and joining ==

# Everyone types a '''nickname''' on the title screen.
# The host clicks '''Host co-op''' and picks a world: a new one, a sandbox or a saved one. A six-character '''invite code''' appears in the co-op panel; click it to copy.
# Friends click '''Join co-op''' and type the code. They spawn next to the host with their own engineer and the starter kit.

The host's browser runs the world, so the host keeps the tab open; the game keeps running if they switch tabs. Friends' inventories are kept in the host's save under their nickname, so they get their things back when they rejoin with the same name.

== Playing together ==

* Everyone builds, mines, crafts and drives in the same world. Research and medical upgrades are shared.
* Each engineer builds for the [[Factories|factory]] they picked.
* {{kbd|Enter}} opens the '''chat'''.
* Click another engineer for their details, or to '''[[Trading|trade]]''' with them.
* The host decides everything that matters (crafting results, research, mining, vehicles); guests see the host's world and fill in smooth motion between updates.

== Connections ==

Browsers are introduced by PeerJS's free public broker and then talk directly over WebRTC. On strict networks or VPNs the direct link may fail and fall back to free relays, which can be slow.

== See also ==

* [[Trading]]
* [[Saving]]`,
},
{
  title: 'Trading', desc: 'Swapping items with another engineer', cats: ['Multiplayer'], icon: 'chest',
  body: `'''Trading''' swaps items between two engineers in [[Multiplayer|co-op]]. Click another engineer to open a trade with them.

== How a trade works ==

# Each side puts items from their inventory into '''their offer'''. Both see both offers as they change.
# After any change to either offer, there is a short '''wait''' (3 seconds) before anyone can accept, and any earlier accepts are cleared. This stops last-second swaps.
# When '''both''' have accepted, the host checks both inventories at that moment: each still holds what it offers, and each has room for what it gets. Then everything is swapped in one step, or nothing changes and both are told why.

An offer is only a promise: the items stay in your inventory until the swap, so cancelling never loses anything. A trade is called off if the two walk more than 16 tiles apart, if either leaves the game, or with {{kbd|Esc}} or ✕.

== See also ==

* [[Multiplayer]]`,
},
{
  title: 'Sandbox', desc: 'Everything unlocked, free crafting', cats: ['Modes'], icon: 'assembler2',
  body: `'''Sandbox''' is a game mode in [[Depthworks]] for building without limits. Start one with '''Sandbox''' on the title screen, or host one in [[Multiplayer|co-op]].

In a sandbox world:

* every technology is researched and every [[Depth|layer]] is open;
* crafting is '''free and instant''': any recipe goes straight into your inventory;
* an '''Everything''' tab in the crafting menu hands out any item.

The status panel shows a SANDBOX badge. Everything else (power, belts, fluids, the world) works exactly as in a normal game.

== See also ==

* [[World generation]]`,
},
{
  title: 'Saving', desc: 'Save slots, autosave and files', cats: ['Modes'], icon: 'chest',
  body: `[[Depthworks]] '''saves''' to your browser, with five save slots.

* The game '''autosaves every 30 seconds''' to the slot in play. '''Save''' in the menu saves at once.
* '''Load game''' on the title screen lists the slots: load, export or delete each.
* '''Export to file''' (in the menu) downloads the world as a file; '''Load from file''' brings one back, on any computer.
* '''Save and quit''' returns to the title screen.

Generated worlds save only their seed, options and what changed, so saves are small. Saves from older versions of the game still load.

{{note|Browser storage can be cleared (and private windows forget everything). Export to a file now and then.}}

In [[Multiplayer|co-op]], the world lives in the host's save, including the guests' inventories.

== See also ==

* [[Multiplayer]]`,
},
];

// Short descriptions for the generated biome pages.
export const BIOME_TEXT = {
  meadow: 'Rolling green grassland with oaks and birches, scattered flowers, and every basic ore. Most worlds land you in a meadow.',
  forest: 'Dense old woodland of oak, pine and birch on dark loam. Plenty of iron and coal, and wood everywhere.',
  steppe: 'Dry, open grassland of ochre dirt with lone acacias. Big copper and stone patches, and crude oil is common.',
  taiga: 'Cold northern forest of pines on blue-green peat. Large iron patches, and berries in the undergrowth.',
  marsh: 'Wet lowland of mud, reeds and willows, often beside water. Rich in coal and crude oil.',
  desert: 'Blazing sand strewn with glassy shards and cacti. Copper runs in veins, and crude oil is everywhere; the heat slows stamina.',
  tundra: 'Frozen, near-white ground with snowy pines and frozen rocks. The richest iron in the world, if you can stand the cold.',
  ashlands: 'Burnt black-red ground with glowing embers, charred trees and ash rocks full of coal. Abyssal ore lies close to the surface; the fumes make sprinting hard.',
  fungal: 'A violet mycelium floor under giant glowing mushrooms. Crystal runs thick underground; the spores slow your hands.',
  crystal: 'Blue glass silt with ringing crystal spires. The most crystal anywhere, even on layer −2; the resonance shortens your reach.',
  pripyat: 'Yellow fallout dust, mutant trees and glowing tufts. The home of uranium and irradiated crops; radiation drains your health.',
};
