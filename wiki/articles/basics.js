// Articles: the main page, the game, getting started and the basics of playing.
// Wikitext: see the top of wiki.js. Raw HTML blocks must not contain blank lines.
export default [
{
  title: 'Main Page', desc: 'The front page of the wiki', cats: [], icon: 'transmitter',
  body: `<div class="mp-welcome"><h2>Welcome to Depthworks Wiki,</h2><p>the free encyclopedia of the factory that goes down, up, and out.</p><p class="dim">Everything about [[Depthworks]]: guides for your first hour, every item, building, recipe and technology, and how the deeper systems work. Numbers are read straight from the game, so they are always current.</p></div>

<div class="mp-cols">
<div class="mp-box"><h2>New to Depthworks?</h2><div class="in">
<p>Start with the '''[[Beginner's guide]]''': it walks you from the landing site to your first electric drill, your first research and beyond. Keep [[Controls]] open in another tab while you learn the keys.</p>
<ul><li>[[Beginner's guide]] · step by step</li><li>[[Controls]] · every key and mouse button</li><li>[[Interface]] · what is on screen</li><li>[[Tips and tricks]] · things the game doesn't tell you</li><li>[[Glossary]] · the words players use</li></ul>
</div></div>
<div class="mp-box"><h2>From today's featured article</h2><div class="in">
<div class="mp-feat-img">{{icon|transmitter}}</div>
<p>'''[[The Signal]]''' is the endgame of Depthworks. Instead of launching a rocket, the player builds a {{i|transmitter}} at the bottom of the world and sends out the machines working around it as a sentence of glyphs. Something answers, but it can only speak in the mechanisms it has heard you use. Nine exchanges later, it tells you what it has been building all along… ([[The Signal|read more]])</p>
</div></div>
<div class="mp-box"><h2>Did you know…</h2><div class="in">
<ul>
<li>…that [[Mining#Deposits|ore deposits]] never run out? A worked-out tile sinks to a richer ''depth'' layer, and finally to endless ''bedrock''.</li>
<li>…that one {{i|water_pump}} feeds 20 [[Boiler|boilers]], and every boiler two [[Steam engine|steam engines]]?</li>
<li>…that a [[Hollow frame|hollow frame]] with a working machine inside counts ''double'' towards [[Precision|precision]]?</li>
<li>…that a [[Hydroelectric power|dam]] on a river gives 2.4 times what it gives on still water?</li>
<li>…that [[Hazards#Radiation|radiation]] can never take you below half health?</li>
<li>…that a [[Fishing|fishing net]] strains past one stack of fish and tears at two?</li>
<li>…that every sound in the game is synthesised in your browser, with no sound files at all?</li>
</ul></div></div>
<div class="mp-box"><h2>Recent changes to the game</h2><div class="in">
<ul>
<li>The camera in [[Depth|depth mode]] now orbits freely round what it looks at.</li>
<li>[[Map|Map exploration]]: the map shows only what has been seen, and [[Radar|radars]] keep it live.</li>
<li>The 2×2 {{i|big_drill}} reaches bedrock; [[Trading|trading]] between engineers; a [[Medical research|medical research]] tree.</li>
<li>A [[Research|research queue]] and a new tech tree window, three [[Electricity#Voltages|voltages]], [[Blueprints|blueprints]] and the {{i|crafting_station}}.</li>
<li>Big [[World generation|generated worlds]] with eleven [[Biomes|biomes]], [[Agriculture|farming]], [[Nuclear power|nuclear power]] and [[Copy and paste|copy and paste]].</li>
</ul></div></div>
</div>

<div class="mp-box mp-wide"><h2>Explore by topic</h2><div class="in"><div class="portals">
<a href="#/Mining">{{icon|drill}}Mining</a><a href="#/Smelting">{{icon|furnace}}Smelting</a><a href="#/Crafting">{{icon|assembler}}Crafting</a><a href="#/Belt_logistics">{{icon|belt}}Belts</a><a href="#/Inserters">{{icon|inserter}}Inserters</a><a href="#/Electricity">{{icon|small_pole}}Electricity</a><a href="#/Fluids">{{icon|pipe}}Fluids</a><a href="#/Oil_processing">{{icon|refinery}}Oil</a><a href="#/Research">{{icon|lab}}Research</a><a href="#/Depth">{{icon|frame}}Depth</a><a href="#/Vehicles">{{icon|truck_diesel}}Vehicles</a><a href="#/Railways">{{icon|locomotive_diesel}}Railways</a><a href="#/Agriculture">{{icon|greenhouse}}Farming</a><a href="#/Biomes">{{icon|crystal}}Biomes</a><a href="#/Multiplayer">{{icon|transmitter}}Co-op</a><a href="#/The_Signal">{{icon|resonance_pack}}The Signal</a>
</div></div></div>

<div class="mp-box mp-wide"><h2>Everything, in one place</h2><div class="in">
<p>[[List of items]] · [[List of buildings]] · [[List of recipes]] · [[List of technologies]] · [[Biomes]] · [[Special:AllPages|All pages]]</p>
</div></div>`,
},
{
  title: 'Depthworks', desc: 'The game this wiki is about', cats: ['Depthworks'], icon: 'transmitter',
  box: { title: 'Depthworks', img: 'transmitter', caption: 'The transmitter, heart of the endgame', rows: [
    ['Genre', 'Factory building, automation'], ['Modes', 'Single-player, co-op, sandbox'], ['Platform', 'Web browser'], ['Engine', 'Three.js (WebGL), plain JavaScript'],
    ['Multiplayer', 'Peer to peer (WebRTC through PeerJS)'], ['World', '512 to 65,536 tiles a side, generated from a seed'], ['First version', 'October 2026'], ['Play', '<a href="../" target="_blank" rel="noopener">in your browser</a>']] },
  body: `'''Depthworks''' is a pixelated 2.5D factory-building game in the tradition of ''Factorio'', played in a web browser. The player controls an engineer who lands on an untouched world, mines it by hand, crafts tools and machines, and gradually automates everything with [[Belt logistics|belts]], [[Inserters|inserters]] and [[Electricity|power networks]], researching up a [[Research|technology tree]] as they go. Its tagline is "a factory that goes down, up, and out".

Two ideas set it apart. The first is '''[[Depth|depth]]''': the world has seven buildable layers, from two rock layers under the ground to hollow frames stacked above it, and the higher and deeper layers open only as your factory earns [[Precision|precision]] by keeping its machines busy. The second is its ending: there is no rocket to launch. Instead the player builds a [[The Signal|transmitter]] and holds a conversation with something that only understands machines.

== Gameplay ==

{{main|Beginner's guide}}

A game begins at the landing site with a few iron plates, a {{i|burner_drill}} and a {{i|furnace}}. The player mines coal and stone by hand, sets the drill on iron ore so it feeds the furnace, and crafts more machines from the plates it makes. From there the factory grows the way it does in other automation games: [[Smelting|furnaces]] turn ore into plates, [[Crafting|assemblers]] turn plates into parts, [[Belt logistics|belts]] and [[Inserters|inserters]] move everything between them, and [[Research|labs]] turn [[Science packs|science packs]] into new technology.

The player's own body matters. The [[Engineer|engineer]] has health and stamina, can sprint, gets hurt by vehicles, and is slowed or weakened by the [[Hazards|hazards]] of harsher [[Biomes|biomes]]. [[Food]] and [[Medical research|medical upgrades]] make them stronger.

Later systems include [[Fluids|fluids]] and [[Oil processing|oil refining]]; [[Vehicles|vehicles]] built from an engine and a frame; [[Roads|roads]], [[Railways|railways]] and [[Shipping|shipping]] run by [[Routes and depots|routes]]; [[Agriculture|farming]] in greenhouses; [[Hydroelectric power|dams]] and [[Nuclear power|uranium reactors]]; several separate [[Factories|factories]] in one world; and a [[Map|map]] that only shows what has been explored.

== Setting ==

The game has very little story until its end. The world is generated from a seed and made chunk by chunk as it is explored; it can be anywhere from 512 to 65,536 tiles across. It holds eleven [[Biomes|biomes]], from temperate meadows near the landing site to the glass desert, the ashlands and the Pripyatic wastes far away. Deep under the ground lie ''resonant crystal'' and ''abyssal ore'', the materials of the endgame.

At the end of the [[Research|research tree]], Signal theory lets the player build a {{i|transmitter}}. Every pulse it sends describes the working machines around it. Something answers. It speaks only in the mechanisms it has heard from you, so what it can say grows with what you show it. See [[The Signal]].

== Modes ==

; New game
: A normal world, with the [[World generation|world options]] of your choice.
; [[Sandbox]]
: Every technology researched, crafting free and instant, and any item on request.
; [[Multiplayer|Co-op]]
: Free peer-to-peer play with friends, joined with a six-character invite code.

== Presentation ==

Every machine is a real 3D model made of moving parts (jointed inserter arms, spinning drill heads, pistons, turbines), rendered at one third of the screen's resolution and scaled up, with dark outlines and toon shading, so the game reads as crisp pixel art with real depth and shadow. The camera moves in whole pixels so nothing shimmers. A day lasts 24 minutes: the light warms and cools with the hours, and at night only lamps, braziers and working machines light the ground. All sound is synthesised in the browser.

== Development ==

Depthworks is written in plain JavaScript modules with no build step, using Three.js for rendering and PeerJS to connect co-op players' browsers directly. Every model and every icon is drawn by code. The game saves to the browser (five slots, autosaved every 30 seconds) and can export a world to a file.

== See also ==

* [[Beginner's guide]]
* [[Controls]]
* [[Glossary]]`,
},
{
  title: "Beginner's guide", desc: 'Step by step from the landing site', cats: ['Guides'], icon: 'burner_drill',
  body: `This '''beginner's guide''' takes a new player from the landing site to automated research. It follows the '''goals''' list the game shows in the corner of the screen, so you can read along while you play. Keys are the defaults; see [[Controls]] for all of them.

{{tip|The game pauses while the menu ({{k|help}} or {{kbd|Esc}}) is open in a solo game. Its ''How to play'' page has a short version of this guide.}}

== 1. The landing site ==

You land with '''8 {{i|iron_plate|iron plates}}''', a {{i|burner_drill}} and a {{i|furnace}}. Every world places the same four small starter deposits close by: '''iron ore''' to the west-north-west, '''copper ore''' to the north-east, '''coal''' just to the south and '''stone''' to the south-east. Ore barely shows on untouched ground (a few stones in the soil), so look for it on the minimap or press {{k|map}} for the [[Map|map]].

Walk with {{kbd|W}}{{kbd|A}}{{kbd|S}}{{kbd|D}}. Hold {{kbd|Shift}} to sprint while your stamina lasts.

== 2. Mine by hand ==

''Goal: hold right-click on coal and stone to mine 10 of each.''

Hold the right mouse button on a deposit to dig it with your [[Tools|pickaxe]]. Ore must be within 3 tiles of you. Each stroke shows a small popup counting what you have. Mine some '''coal''' (fuel for everything early on) and '''stone''' (for furnaces).

== 3. Your first automation ==

''Goal: put the burner drill on iron ore facing the furnace, and fuel both.''

# Select the burner drill (click it in your inventory, {{k|inventory}}, or on the quickbar) and press {{k|rotate}} until its arrow points where you want the ore to go.
# Place it on the iron ore, then place the furnace on the tile in front of it. A drill pushes ore straight into whatever is in front of it.
# Hold a stack of coal and {{kbd|Ctrl}}+click the drill, then the furnace. Ctrl+click always puts fuel in a fuel slot and ingredients in input slots.

The drill now digs iron ore into the furnace, which smelts it into plates. {{kbd|Ctrl}}+click the furnace with an empty hand to take its plates. Hover over any building to see arrows: '''blue''' where things go in, '''orange''' where they come out, '''green''' where something is feeding it, a '''red ✕''' where something won't work.

== 4. Wood, and more of everything ==

''Goals: chop a few trees for wood; craft more burner drills and furnaces and run 4 drills.''

Hold right-click on a tree to fell it with your [[Tools|axe]]. Wood is fuel, and it makes {{i|wooden_chest|wooden chests}} and {{i|small_pole|small electric poles}}.

Press {{k|inventory}} to open your inventory and the crafting menu. Click a recipe to craft one, right-click for five, Shift+click for as many as you can. '''Missing parts are crafted for you''': a burner drill needs gears, and the game makes the gears from your plates first. Set up a few drill-and-furnace pairs on iron, then do the same on copper. A drill on stone feeding a furnace makes {{i|brick|stone bricks}}.

Burner buildings need refuelling now and then. Keep them fed by hand at first; later a [[Belt logistics|belt]] of coal and some [[Inserters|burner inserters]] do it for you.

== 5. Copper ==

''Goal: smelt 20 copper plates.''

Copper plates make {{i|cable|copper cable}}, which goes into {{i|circuit|circuits}}, which go into nearly everything electric.

== 6. Power ==

''Goals: make power; link a step-up station to a small pole; run an electric drill on the network.''

{{main|Steam power|Electricity}}

Electricity starts with steam, and water is never right next to the landing site: lakes and rivers begin at least 44 tiles away. You need:

# a {{i|water_pump}} placed on water;
# a {{i|boiler}} (two tiles wide) against the pump, fuelled with coal;
# a {{i|steam_engine}} (2×2) against the boiler. Water and steam pass between buildings that touch, or through [[Pipe|pipes]];
# a {{i|generator_pole}} next to the engine. Generators only feed '''extra-low voltage''', which machines can't use;
# a {{i|step_up}} near the generator pole (it wires itself to it), and a {{i|step_up_cable}}: hold it, click the station, then click a {{i|small_pole}};
# small poles leading to your machines. A machine runs when it stands inside a pole's supply area, shown in blue.

Now place an {{i|drill}} on ore inside a pole's area. A flashing plug on a machine means no power (red) or too little (yellow).

== 7. Research ==

''Goals: craft automation packs, place a lab and choose research; finish Automation.''

{{main|Research}}

Craft some {{i|red_pack|automation packs}} (a copper plate and a gear each) and a {{i|lab}}, put the lab on the network and feed it the packs. Press {{k|research}} for the research tree and click {{t|automation}} to queue it. When it finishes you can build {{i|assembler|assemblers}}.

== 8. Automating science ==

''Goals: make 20 automation packs in assemblers; reach precision 1.''

Set an assembler to make automation packs, feed it copper plates and gears with [[Inserters|inserters]] from a belt, and let another inserter carry the packs to your labs. As more machines keep working your factory gains '''[[Precision|precision]]'''. Precision 1 needs 15 ''volume'' of busy machines. See the [[Precision]] article for what each machine counts for.

== 9. Onwards ==

The remaining goals lead through the rest of the game:

# Research {{t|logistic_science}} and make green packs.
# Research {{t|lifts}} and run machinery on top of [[Hollow frame|hollow frames]] ([[Depth|depth mode]], {{k|depthMode}}).
# Research {{t|excavation}} and build on layer −1 (depth mode, then {{k|layerDown}}).
# Smelt [[Resonant crystal|resonant crystal]] from layer −1 into [[Lens|lenses]].
# Reach precision 2, research {{t|deep_excavation}} and mine [[Abyssal ore|abyssal ore]] on layer −2.
# Research {{t|signal_theory}}, build a {{i|transmitter}} and feed it {{i|resonance_pack|resonance packs}}.
# Answer their requests until you have heard everything they have to say. See [[The Signal]].

Along the way: [[Oil processing|oil]], [[Vehicles|vehicles]], [[Railways|trains]], [[Agriculture|greenhouses]] and [[Nuclear power|nuclear power]] are all optional, but they make the late game much easier.

== Common mistakes ==

* '''Belts never load machines directly.''' Put an inserter between a belt and a furnace or assembler.
* '''Inserters only take what the machine in front of them needs.''' An inserter facing an assembler with no recipe will wait.
* '''Steam engines can't power machines on their own.''' They feed generator poles; you need the step-up station and cable.
* '''Solar panels give nothing at night.''' There are no accumulators, so keep steam or diesel running.
* '''Drills need to reach the layer.''' A burner drill stops when its tile drops to the depth layer: use an electric drill there, or a depth augment.

== See also ==

* [[Controls]]
* [[Tips and tricks]]
* [[Crafting]]`,
},
{
  title: 'Controls', desc: 'Every key and mouse button', cats: ['Guides'], icon: 'chest',
  body: `This article lists the '''controls''' of [[Depthworks]]. Every key can be changed in the menu ({{k|help}} → ''Controls''): click an action, then press the new key. The number keys always pick quickbar slots and can't be rebound. Rebinds are saved in your browser.

== Mouse ==

! Input !! What it does
| {{kbd|LMB}} || Build what is in your hand (drag to lay belts, pipes, roads or a line of poles); open a building; click another engineer to trade with them
| hold {{kbd|RMB}} || Mine: trees with the axe, ore and rock with the pickaxe, weedy patches with the shovel, and take buildings back
| {{kbd|Ctrl}} + hold {{kbd|RMB}} || Take a single tile off a greenhouse or a path
| {{kbd|Ctrl}} + {{kbd|LMB}} || Move items: the held stack into the building (ingredients to inputs, fuel to fuel), or its output into your inventory
| {{kbd|Shift}} + {{kbd|LMB}} || With a building in hand: plan it as a blueprint. With an empty hand: paste copied settings, or select buildings
| {{kbd|Shift}} + {{kbd|RMB}} || Copy a building's settings
| {{kbd|Wheel}} || Zoom
| {{kbd|Shift}} + {{kbd|Wheel}} || Change layer in depth mode
| {{kbd|MMB}} drag || Orbit the camera (depth mode)
| {{kbd|Shift}} + {{kbd|MMB}} drag || Pan the camera (depth mode)

== Inventories ==

* '''Drag''' a stack from one slot to another.
* '''Right-drag''' to take half a stack.
* {{kbd|Shift}} + click to send a stack across to the other side (your inventory ↔ the open building).
* Click any usable item (a building, road, vehicle, cable, signal or food) to put it in your hand.
* In crafting: click for one, right-click for five, {{kbd|Shift}} + click for as many as you can.

== All key bindings ==

This table is read from the game's own defaults.

{{gen|controls}}

== Depth mode ==

{{main|Depth}}

{{k|depthMode}} switches between the normal flat view and '''depth mode''', where you build on other layers. In depth mode:

* {{k|layerUp}} / {{k|layerDown}} (or {{kbd|Shift}} + wheel) choose the working layer. Layers above yours are drawn as ghosts.
* {{k|camLeft}} / {{k|camRight}} orbit the camera 90° at a time; {{k|camLower}} / {{k|camHigher}} tilt it.
* Drag with the middle button to swing the camera round what it looks at; hold {{kbd|Shift}} to pan instead.
* {{k|depthGrid}} turns the grid on or off.
* {{k|pitch}} sets an inserter's pitch (level, lift up a layer, drop down a layer) or a lift's direction.

Leaving depth mode turns the camera back to face north, centred on you.

== Vehicles ==

{{k|board}} gets in or out of a vehicle next to you. {{kbd|W}} accelerates, {{kbd|S}} brakes and reverses, {{kbd|A}}/{{kbd|D}} steer. On rails, {{kbd|A}}/{{kbd|D}} pick which branch to take at the next junction.

== See also ==

* [[Interface]]
* [[Beginner's guide]]`,
},
{
  title: 'Interface', desc: 'The HUD, panels and menus', cats: ['Guides'], icon: 'lab',
  body: `The '''interface''' of [[Depthworks]] is the HUD drawn over the world, the windows you open with keys, and the overlays drawn into the world itself. All of it hides with {{k|hideUI}}.

== The HUD ==

; Quickbar
: One row of ten slots, picked with {{kbd|1}}–{{kbd|0}}. There are three bars, cycled with {{k|cycleBar}}: '''Equipment''' fills itself with each new kind of building you get; '''Resources''' starts with coal, wood, ores, plates, gears, circuits and steel; '''Custom''' is yours to fill.
; Health and stamina
: Two bars beside the quickbar. See [[Engineer]].
; Goals
: A short list of the next things to do, from mining coal to hearing the last message of [[The Signal]]. Done goals are ticked off with a toast. It can be turned off in the settings.
; Status panel
: Flat or depth mode and the current layer; your [[Precision|precision]] tier and active volume; the time of day on a 24-hour clock; the [[Biomes|biome]] you stand in and its [[Hazards|hazard]]; power produced against capacity; the current [[Research|research]]; and, when they apply, the vehicle you drive, how long you stay well fed and the [[Factories|factory]] you build for.
; Minimap
: A small [[Map|map]] around you; the wheel zooms it. Click it to open the big map.
; Signal panel
: {{k|signal}} opens the log of the [[The Signal|alien conversation]] once you have a transmitter.
; Crafting queue
: What you are crafting by hand, in a corner. A cancelled craft gives its materials back.

== Windows ==

! Key !! Window
| {{k|inventory}} || Inventory and crafting (also closes an open building)
| {{k|research}} || [[Research]] tree and queue, with a Medical tab
| {{k|map}} || [[Map]]
| {{k|logistics}} || [[Routes and depots|Logistics]]: rail lines, truck routes, sea lanes and belt lines
| {{k|factories}} || [[Factories]]
| {{k|help}} or {{kbd|Esc}} || The menu: resume, settings, controls, how to play, the wiki, save, export, quit
| {{k|wiki}} || This wiki, in a window over the game (the solo game pauses while it is open)
| {{kbd|Enter}} || Chat, in [[Multiplayer|co-op]]

Clicking a building opens its panel next to your inventory, with its typed slots: fuel, input, results, ingredients, science packs, augments or storage. {{kbd|Esc}} closes the topmost window first, then empties your hand, then opens the menu.

== In the world ==

; Arrows
: Hover over or hold a building to see where things go. '''Blue''': where an inserter picks up, or where one can feed this machine. '''Orange''': where things come out. '''Green''': something is feeding it. '''Red ✕''': that won't work.
; Alt mode
: {{k|altMode}} toggles recipe icons, fill bars and small arrows on every building, and factory tags. How much shows depends on zoom.
; Power
: Poles show their wires and their blue supply area while you hold a pole. A flashing plug on a machine means no power (red) or too little (yellow).
; Placement preview
: The building in your hand is drawn solid, tinted green where it fits and red where it doesn't. With {{kbd|Shift}} held it is drawn stippled, as a [[Blueprints|blueprint]].

== The menu ==

The menu ({{k|help}}) pauses a solo game. It holds '''Settings''' (volume, alt mode, inserter arrows, depth-mode grid, goals list, minimap), '''Controls''' (with key rebinding), '''How to play''', '''Save''', '''Export to file''' and '''Save and quit'''. See [[Saving]].

== See also ==

* [[Controls]]
* [[Map]]`,
},
{
  title: 'Engineer', desc: 'Your character: movement, health, stamina, reach', cats: ['Mechanics'], icon: 'small_pole',
  box: { title: 'The engineer', rows: [['Speed', '6.5 tiles/s'], ['Reach', '10 tiles (ore: 3)'], ['Inventory', '80 slots'], ['Health', '100'], ['Stamina', '100']] },
  body: `The '''engineer''' is the character every player controls in [[Depthworks]]. They walk the world, mine by hand, craft, build within reach, drive [[Vehicles|vehicles]], and in [[Multiplayer|co-op]] trade with other engineers. Many of their numbers can be raised by [[Medical research|medical upgrades]] and lowered by [[Hazards|hazards]].

== Base numbers ==

{{gen|stats}}

== Moving ==

The engineer walks with {{kbd|W}}{{kbd|A}}{{kbd|S}}{{kbd|D}} and bumps into machines, trees and rocks, sliding round their corners. Things smaller than a tile (inserters, poles, pipes, chests, lamps) leave gaps, so you can squeeze between two rows of them. You can walk over belts (they carry you), under [[Hollow frame|hollow frames]], and through greenhouse doors, but not into water.

Walking on a [[Path]] or a road's sidewalk is {{d|SIDEWALK_SPEED}} times faster.

=== Sprinting and stamina ===

Hold {{k|sprint}} to sprint at ×{{d|PLAYER.sprint}} speed. Sprinting burns {{d|PLAYER.sprintCost}} stamina a second, about five seconds from a full bar; stamina refills soon after you stop. If the bar runs empty, you can't sprint again until it is back to {{d|PLAYER.rested}}.

== Reach ==

You can build and open buildings up to 10 tiles away, and hand-mine ore up to 3 tiles away (4 below ground). Out of reach, a placement is refused; while dragging a line of poles, the ones out of reach are planned as [[Blueprints|blueprints]].

== Health ==

The engineer has 100 health. The only thing that hurts is a moving vehicle: anything driving faster than {{d|PLAYER.hitSpeed}} tiles/s deals {{d|PLAYER.hitDamage}} damage for every tile per second of its speed. [[Hazards#Radiation|Radiation]] also drains health, but never below half.

Health comes back by itself {{d|PLAYER.regenDelay}} seconds after the last hit, at {{d|PLAYER.regen}} a second, or {{d|PLAYER.fedRegen}} while well fed. [[Food]] heals at once.

If your health reaches zero you wake up at the landing site with everything you were carrying. Nothing is lost.

== Being well fed ==

{{main|Food}}

Eating (hold food and click) makes you '''well fed''' for a while: you walk 25% faster, mine 50% faster and heal three times as fast.

== The engineer's light ==

At night every engineer carries a small pool of light, so you can always see what is right around you. The ''Night eyes'' [[Medical research|mutation]] makes it reach further.

== Inventory ==

{{main|Crafting}}

The engineer carries 80 slots. Each slot holds one stack of one item; [[List of items|stack sizes]] differ (50 ore, 100 plates, 200 cables and circuits…). Items that don't fit when you take them out of a building spill onto the ground; press and hold {{k|pickup}} to pick up items near you, from the ground or from belts.

[[Tools]] (axe, pickaxe and shovel) are not items: you always carry them, and research improves them.

== Details of other engineers ==

Click another engineer (or yourself) to see their name, health, stamina, held item, what they are doing, the factory they build for, how long they stay well fed, their hazard exposure and their tool levels. In co-op the same click opens a [[Trading|trade]].

== See also ==

* [[Tools]]
* [[Hazards]]
* [[Medical research]]`,
},
{
  title: 'Tools', desc: 'Axe, pickaxe and shovel, and their upgrades', cats: ['Mechanics'], icon: 'wood',
  body: `The engineer's '''tools''' are an '''axe''', a '''pickaxe''' and, after research, a '''shovel'''. They are not items: you always carry them, they can't be lost, and their speed and reach go up with research. The cursor shows which tool you will use, and the engineer swings it.

{{gen|tools}}

== Axe ==

The axe fells trees, cacti, glowcaps and other growths: hold right-click on one. Trees give {{i|wood}} (charred trees in the ashlands also give coal). Felled trees stay gone, even after you walk away.

== Pickaxe ==

The pickaxe breaks ore deposits and rocks. Mining a deposit gives one ore a stroke and wears the deposit down (see [[Mining#Deposits|deposits]]). Rocks give a lot of {{i|stone}} and some {{i|coal}} in one go. Ore on layers below the ground is slower to dig by hand. Uranium ore can be dug by hand, slowly, and gives a little radiation.

== Shovel ==

The shovel comes with {{t|soil_science}}. It digs up '''weedy patches''', tangled ground found in every biome, which turns them into plain ground and often turns up seeds of that biome's crops. See [[Agriculture]].

== Upgrades ==

Each tool has two lines of research: '''speed''' (how fast a stroke lands) and '''sweep''' (a stroke also hits every tile of the same sort within that radius, so you fell a whole stand of trees or dig a patch of ore at once). Each line has three levels, each needing the one before.

{{gen|tooltechs}}

== See also ==

* [[Mining]]
* [[Research]]`,
},
{
  title: 'Mining', desc: 'Hand mining, drills and deposits', cats: ['Production'], icon: 'drill',
  body: `'''Mining''' is how raw ore gets out of the ground in [[Depthworks]], first by hand with the [[Tools|pickaxe]], then with drills. Ore deposits never run out: they get deeper, and deeper layers need better drills.

== Hand mining ==

Hold right-click on a deposit within 3 tiles to dig it. Each stroke gives one ore and shows a popup counting how many you have. Mining stops when your inventory is full. Below the ground you reach one tile further but dig 1.4 times slower, and deeper deposit layers are slower to dig too. Hand mining works at every deposit layer: only drills are limited by depth.

== Drills ==

A drill sits on a deposit and mines it without help. It pushes each ore '''straight forward''' into whatever is in front of it: a furnace, a chest, a belt, or the ground if nothing is there.

{{gen|drills}}

* The {{i|burner_drill}} needs no power. It burns coal or wood and holds a full stack of fuel; an inserter can keep it fed.
* The {{i|drill|electric drill}} needs power and reaches one layer deeper.
* The {{i|big_drill}} covers 2×2 tiles and works every deposit under it in turn, down to bedrock. Over four ore tiles it is exactly four electric drills, with one output, at the front on its left.
* The {{i|leach_drill}} pumps sulfuric acid into the ground: the only drill that can mine [[Uranium ore|uranium]].

Drills, like all producers, take [[Augments|augments]]. Pumpjacks are the oil equivalent: see [[Oil processing]].

== Deposits ==

Every ore tile is a deposit with three layers. When one layer is used up, the deposit simply drops to the next: '''it never disappears'''.

{{gen|deposits}}

The surface holds four times a tile's richness, the depth layer ten times as much again, and bedrock never ends. Deeper layers are slower to mine, but at depth one drill cycle in six gives two ores. A drill that can't reach the layer its tile has dropped to stops with "needs a depth upgrade": give it a [[Depth augment 1|depth augment]] or replace it with a deeper drill.

=== How worked ore looks ===

Untouched ore barely shows: a few stones in the soil (the map still shows it clearly). As a tile is worked, piles of ore turn up and the ground sinks into a darker pit. Every ore goes through the same six stages:

{{gen|orestages}}

== Ore below the ground ==

Layers −1 and −2 have their own deposits, reached by building there in [[Depth|depth mode]] once you have the research and the [[Precision|precision]]. Layer −1 holds {{i|crystal}} and richer iron and copper; layer −2 holds {{i|abyssal_ore}}. See [[Resources]].

== See also ==

* [[Resources]]
* [[Smelting]]
* [[Depth]]`,
},
{
  title: 'Resources', desc: 'Raw materials and where to find them', cats: ['Production'], icon: 'iron_ore',
  body: `'''Resources''' are the raw materials everything in [[Depthworks]] is made from. Most come from ore deposits, dug by hand or by [[Mining|drills]]; others from trees, rocks, water, oil wells, weedy patches and fish.

== Ores ==

! Resource !! Where !! Smelts into
| {{i|iron_ore}} || everywhere, most in taiga and frost waste || {{i|iron_plate}}, then {{i|steel}}
| {{i|copper_ore}} || everywhere, most in the steppe and glass desert || {{i|copper_plate}}
| {{i|coal}} || everywhere, most in fen and ashlands; also rocks || fuel; used in sulfuric acid and rubber
| {{i|stone}} || everywhere; also rocks || {{i|brick}}
| {{i|crystal}} || layer −1 (and −2 in the singing steppe) || {{i|lens}}
| {{i|abyssal_ore}} || layer −2 (also −1 in the ashlands) || {{i|abyssal_alloy}}
| {{i|uranium_ore}} || the Pripyatic wastes; rare strays far from the landing site || {{i|enriched_uranium}} (centrifuge)

Each [[Biomes|biome]] has its own mix of ores, patch sizes and patterns (blobs, veins or scattered nuggets): see the [[Biomes]] table. Starter deposits of iron, copper, coal and stone always lie near the landing site, and crystal and abyssal ore lie beneath it.

== Trees and rocks ==

{{gen|trees}}

== Other resources ==

* '''Water''': pumped from lakes, rivers and the sea by a {{i|water_pump}}. See [[Fluids]].
* '''Crude oil''': dark patches on the ground, pumped by a {{i|oil_pump}}. Wells never run dry but slow down to 20%. See [[Oil processing]].
* '''Seeds''': dug from weedy patches with the shovel. See [[Agriculture]].
* '''Fish''': in every body of water. See [[Fishing]].

== See also ==

* [[Mining]]
* [[World generation]]`,
},
{
  title: 'Crafting', desc: 'Hand crafting, assemblers and crafting stations', cats: ['Production'], icon: 'assembler',
  body: `'''Crafting''' turns items into other items. In [[Depthworks]] you craft by hand from your inventory at first, then in machines that run on their own.

{{further|List of recipes}}

== Hand crafting ==

Open your inventory with {{k|inventory}}: recipes you can make are listed beside it, in tabs. Click a recipe to craft one, right-click for five, {{kbd|Shift}} + click for as many as you can afford. Crafts go into a queue in the corner; cancelling one gives everything back.

'''Hand crafting is recursive''': if you lack a part, the game crafts the part first from what you have, and so on down. A burner drill needs gears; if you only have plates, it makes the gears too. Smelting, refining and chemistry can't be done by hand, and a few late recipes ({{i|resonance_pack|resonance packs}}, {{i|uranium_fuel_cell|fuel cells}}) need an assembler.

A craft takes its recipe's time (at least a quarter of a second). [[Hazards#Neurotoxic spores|Spores]] slow it, and the ''Dexterity'' [[Medical research|medical upgrade]] speeds it up.

=== Crafting what you place ===

If you try to place a building you have run out of, the game crafts one for you when you have the materials. The spot waits as a pale square and builds itself when the craft lands, so a long belt drag keeps going past the end of your stack.

== Machines ==

{{gen|assemblers}}

An '''assembler''' crafts the recipe you choose, at its own speed. Inserters feed it ingredients and take out results; it pulls only what its recipe needs. {{i|assembler2|Assembler II}} is twice as fast with three augment slots.

The {{i|crafting_station}} is an assembler with its own arm: it reaches into any wooden or iron chest of its factory within 3 tiles and fetches ingredients one at a time, enough for two crafts. Inserters can still feed it and take out what it makes.

Specialised machines handle other kinds of recipe: the {{i|refinery}} and {{i|chem_plant}} (see [[Oil processing]]), the {{i|barreler}} (see [[Fluids]]), the {{i|vehicle_factory}} (see [[Vehicles]]) and the {{i|centrifuge}} (see [[Nuclear power]]).

== Productivity and speed ==

Machines take [[Augments|augments]]: speed, efficiency (less power) and productivity (extra output from the same ingredients).

== Sandbox ==

In a [[Sandbox|sandbox]] world crafting is free and instant.

== See also ==

* [[List of recipes]]
* [[Smelting]]
* [[Augments]]`,
},
{
  title: 'Building', desc: 'Placing, rotating and taking down buildings', cats: ['Mechanics'], icon: 'frame',
  body: `'''Building''' in [[Depthworks]] means placing items from your inventory into the world as working buildings.

== Placing ==

Put a building in your hand (click it in the inventory or press its quickbar number) and click a tile within reach. {{k|rotate}} turns it before you place it. Belts, pipes, rails and roads are '''dragged''': hold the button and move. Dragging power poles lays a line spaced to their coverage. A building you have run out of is crafted for you if you can (see [[Crafting#Crafting what you place|crafting what you place]]).

The preview is tinted green where it fits and red where it doesn't; the reason shows if you click anyway: out of reach, something in the way, water, a road ("keep roads clear: build beside them, or pass under"), a locked layer, or a building of another factory.

; Fast replace
: Dragging a belt over an existing belt (or placing an inserter over an inserter) swaps it in place, keeping its items.
; Big buildings
: Boilers (2×1), steam engines and big drills (2×2) and greenhouses (5×5) cover several tiles. {{k|rotate}} turns them when there is room.
; On water
: Only [[Water pump|water pumps]] and [[Dam|dams]] go on water. Ports go on the shore beside it.

== Pipette ==

{{k|pipette}} puts the building under the cursor in your hand, facing the same way. Over bare ore it picks the best drill you carry that reaches the deposit (or the best one you have unlocked). If you have none, placing it crafts one; if you can't craft one either, it is planned as a [[Blueprints|blueprint]]. With something already in your hand, {{k|pipette}} empties it.

== Taking buildings down ==

Hold right-click on a building to mine it: you get the item back, plus whatever was inside it. A building over several tiles gives back the one item it was built from; greenhouses and dams give back by the tile. {{kbd|Ctrl}} + mining takes a single tile off a greenhouse room or a path.

== Selecting many ==

With an empty hand and nothing copied, {{kbd|Shift}} + click buildings to select them (click again to drop one; {{kbd|Esc}} or a click on empty ground clears the selection). A bar shows what is selected and lets you pick a '''transfer mode''':

; Fuel
: {{kbd|Ctrl}} + click with fuel fills only their fuel slots.
; Input
: {{kbd|Ctrl}} + click with an ingredient fills only their input slots.
; Store
: {{kbd|Ctrl}} + click spreads the stack evenly over their storage slots.
; Augment
: {{kbd|Ctrl}} + click puts an augment in a free augment slot.

{{kbd|Ctrl}} + click on any selected building shares the held stack evenly over all of them. The bar's ''paste to all'' button pastes [[Copy and paste|copied settings]] onto every one.

== See also ==

* [[Blueprints]]
* [[Copy and paste]]
* [[Depth]]`,
},
{
  title: 'Storage', desc: 'Chests, and moving items in and out', cats: ['Logistics'], icon: 'chest',
  body: `'''Storage''' in [[Depthworks]] means chests, and the slots inside every other building.

! Chest !! Slots !! Recipe
| {{i|wooden_chest}} || 16 || 2 wood
| {{i|chest}} || 32 || 8 iron plates

Each slot holds one stack of one item. Inserters put items in and take them out; drills and belts' [[Belt logistics#Outputs|outputs]] can push straight into a chest. A chest fed from a belt output stands open with its goods churning inside in the colours of what goes in.

Depots ([[Routes and depots|train stations, truck depots and ports]]) and vehicles' cargo are storage too, and so are the slots of every machine: fuel, inputs, results, packs and augments.

== Moving items ==

* Drag stacks between your inventory and an open building; right-drag for half; {{kbd|Shift}} + click to send a stack across.
* {{kbd|Ctrl}} + click a building with a stack in hand to put it where it belongs, or with an empty hand to take its results.
* Select several buildings with {{kbd|Shift}} + click and use ''Store'' mode to spread a stack over them. See [[Building#Selecting many|selecting many]].

The {{i|crafting_station}} takes its ingredients straight from chests within 3 tiles.

== See also ==

* [[Inserters]]
* [[Belt logistics]]`,
},
{
  title: 'Smelting', desc: 'Furnaces and what they make', cats: ['Production'], icon: 'furnace',
  body: `'''Smelting''' turns ore into plates in furnaces. Furnaces choose their recipe themselves from what is put in them.

== Furnaces ==

{{gen|furnaces}}

The {{i|furnace|stone furnace}} burns fuel; the electric ones need power instead. Smelting can't be done by hand.

== Recipes ==

{{gen|smelting}}

Raw fish can be cooked in any furnace, which makes it much better [[Food|food]].

== Layouts ==

The simplest layout is a [[Mining|drill]] pushing ore straight into a furnace. Bigger smelting lines run ore past a row of furnaces on a belt, with an inserter feeding each furnace and another taking plates to an output belt. Fuel can share the ore belt's other lane.

== See also ==

* [[Fuel]]
* [[Mining]]`,
},
{
  title: 'Fuel', desc: 'What burns, and for how long', cats: ['Production'], icon: 'coal',
  body: `'''Fuel''' powers burner buildings, boilers and vehicles. Each fuel has an energy value in megajoules (MJ).

{{gen|fuels}}

== Burner buildings ==

Burner buildings take solid fuel in a fuel slot and burn it while they work:

! Building !! Burns at
| {{i|burner_drill}} || 150 kW (a piece of coal every 27 s)
| {{i|furnace|Stone furnace}} || 90 kW (a piece of coal every 44 s)
| {{i|burner_inserter}} || 100 kW while it swings
| {{i|boiler}} || up to 1.8 MW at full steam
| {{i|brazier}} || 20 kW at night

Burner inserters fuel themselves: one that runs dry reaches for fuel behind it first, and fuel it carries goes into its own slot. Burner drills hold a whole stack of fuel.

== Engines ==

Vehicle engines and the {{i|fuel_generator}} burn liquid fuels from their tanks or pipes; see [[Vehicles]] and [[Oil processing]]. Liquid fuel travels in [[Barrel|barrels]]. A {{i|uranium_fuel_cell}} goes only into a [[Nuclear power|uranium reactor]].

== See also ==

* [[Electricity]]
* [[Oil processing]]`,
},
{
  title: 'Food', desc: 'Eating, healing and being well fed', cats: ['Mechanics'], icon: 'cooked_fish',
  body: `'''Food''' in [[Depthworks]] heals the engineer and makes them '''well fed''' for a while. Hold a food item and click to eat it.

! Food !! Heals !! Well fed for !! From
| {{i|raw_fish}} || 15 || 60 s || [[Fishing]]
| {{i|cooked_fish}} || 40 || 180 s || raw fish in a furnace
| Any crop || 6 || 25 s || [[Agriculture|greenhouses]]

While well fed you walk 25% faster, mine 50% faster, and heal 6 health a second instead of 2. Eating again adds to the time left.

== See also ==

* [[Engineer]]
* [[Fishing]]`,
},
{
  title: 'Glossary', desc: 'The words used in the game and on this wiki', cats: ['Guides'], icon: 'lens',
  body: `This '''glossary''' explains terms used in [[Depthworks]] and on this wiki.

; Active volume
: The summed [[Precision|precision volume]] of every machine that did work in the last 8 seconds. It decides your precision tier.
; Alt mode
: Icons, bars and arrows drawn on every building, toggled with {{k|altMode}}.
; Augment
: A module that slots into a producer for speed, efficiency, productivity or depth. See [[Augments]].
; Bedrock
: The third and endless [[Mining#Deposits|deposit layer]]. Only the big drill, or a drill with a depth augment, reaches it.
; Blueprint
: A planned, stippled building that does nothing until built. See [[Blueprints]].
; Brownout
: When a power network needs more than it has, every machine on it slows down.
; Bus belt
: A three-lane belt fed only from behind, with filtered side channels. See [[Belt logistics#Bus belts|bus belts]].
; Clarity
: How much of the aliens' messages you can read. See [[The Signal#Clarity|The Signal]].
; Depth mode
: The second camera mode ({{k|depthMode}}) for building on other layers. See [[Depth]].
; ELV, LV, HV
: Extra-low, low and high voltage. See [[Electricity#Voltages|voltages]].
; Exposure
: How much of a biome's [[Hazards|hazard]] you have taken in. It builds up over 12 s and fades over 12 s.
; Factory
: A separate network of buildings in one world. See [[Factories]].
; Glyph
: A word of the alien language, one per kind of mechanism. See [[The Signal]].
; Hollow frame
: A frame you can build inside and on top of. See [[Depth]].
; Layer
: A building level, from −2 (deep rock) to 4 (four frames up). Not to be confused with deposit layers.
; Line
: A run of belt tiles simulated as one, with its own name, filters and augments. See [[Belt logistics#Belt lines|belt lines]].
; Live
: Map tiles being watched right now, by an engineer or a radar. See [[Map]].
; Pitch
: Whether an inserter moves items level, up a layer or down a layer.
; Precision
: Tiers earned by keeping machines busy; they open layers and some research. See [[Precision]].
; Pulse
: One sentence sent by a transmitter, costing one resonance pack.
; Side-loading
: Feeding a belt into the side of another, which puts items on the near lane.
; Step-up
: Lifting generator power (ELV) into low voltage with a step-up station and cable.
; Sweep
: A tool upgrade that makes one stroke hit everything of the same kind nearby.
; Weedy patch
: Tangled ground that the shovel digs up for seeds.
; Well fed
: The buff from eating. See [[Food]].`,
},
{
  title: 'Tips and tricks', desc: 'Things the game doesn\'t tell you', cats: ['Guides'], icon: 'gear',
  body: `A collection of '''tips and tricks''' for [[Depthworks]], from the first minutes to the endgame.

== Early game ==

* '''Let the game craft for you.''' Clicking a recipe crafts every missing part; placing a building you've run out of crafts it on the spot.
* '''Ctrl+click is your friend.''' With coal in hand, Ctrl+click puts it in fuel slots only; with ore, into input slots only. With an empty hand it collects a machine's results.
* '''Q over ore''' picks the best drill you carry, facing the right way.
* '''Rocks are worth it.''' A single rock gives 20 stone and 6 coal.
* '''Mine coal first.''' Everything early burns it, and a stone furnace eats one piece every 44 seconds.
* '''Find water early.''' Lakes are at least 44 tiles from the landing site, and you need one for power. Check the minimap.

== Factory building ==

* Inserters drop items on the '''far''' lane of a belt; drills on the '''near''' lane. Use this to put two items on one belt.
* A belt fed into the side of another goes on the near lane; one side feed alone turns the belt into a curve.
* Inserters only take what the machine in front needs, so one mixed belt can feed several machines.
* Every machine you keep busy adds to [[Precision|precision]]. Idle or decorative buildings count for nothing; a frame with a working machine inside counts double.
* '''Hold Shift''' while placing to plan blueprints, then build them when you have the parts.
* Copy settings with {{kbd|Shift}} + right-click and paste with {{kbd|Shift}} + left-click: recipes, filters, augments, even whole belt lines.

== Power ==

* One water pump : 20 boilers : 40 steam engines. One boiler feeds two engines exactly.
* Steam engines only feed '''generator poles'''. Don't forget the step-up station and its cable.
* Engines and boilers only work as hard as the network needs, so spare capacity costs no fuel.
* Solar panels are useless at night and there are no accumulators: keep steam or diesel running.
* A dam needs a little power to start. Put a power line over it, connected to a network that is already running.

== Exploring ==

* Paths and sidewalks make you walk 35% faster.
* Eat cooked fish before long walks: 25% faster walking for three minutes.
* Harsh biomes never kill you; hazards only slow you down, and they fade a few seconds after you leave.
* A radar keeps 48 tiles of the map up to date and slowly explores out to 160.

== Logistics ==

* Trains on one track wait for each other forever if they meet head-on: use loops, or two tracks.
* Fuel left in a vehicle's tank is lost when you pick the vehicle up.
* Trucks drive at different speeds on different road surfaces: asphalt and concrete are fastest.

== Saving ==

* Browser storage can be cleared. '''Export to file''' from the menu now and then.

== See also ==

* [[Beginner's guide]]
* [[Glossary]]`,
},
{
  title: 'About this wiki', desc: 'How this wiki is made', cats: [], icon: 'lab',
  body: `'''Depthworks Wiki''' is a guide to [[Depthworks]] that ships with the game itself.

== How it stays up to date ==

The wiki reads the game's own data file. Every item page, building page and technology page, and every table of recipes, numbers and costs, is built in your browser from the same data the game uses, so when the game changes, the wiki changes with it. Icons are drawn by the same code that draws them in the game, and the glyphs on [[The Signal]] page are the game's own animations.

The articles (guides, mechanics and topics) are written by hand.

== Finding things ==

* Search with the box at the top; press {{kbd|/}} to jump to it.
* [[Special:AllPages|All pages]] lists every page.
* The lists: [[List of items]], [[List of buildings]], [[List of recipes]], [[List of technologies]].
* Tables with ⇅ in their headings can be sorted by clicking a heading.`,
},
];
