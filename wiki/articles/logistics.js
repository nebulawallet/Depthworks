// Articles: moving things. Belts, inserters, fluids, oil, vehicles, roads, rails, ships, routes, factories.
export default [
{
  title: 'Belt logistics', desc: 'Belts, lanes, undergrounds, splitters, bus belts and lines', cats: ['Logistics'], icon: 'belt',
  body: `'''Belts''' are the main way to move items in [[Depthworks]]. Every belt has two '''lanes''' (bus belts have three), and items ride on them at the belt's speed. Belts carry anything that walks on them, including the engineer.

== Belt tiers ==

{{gen|belts}}

Each lane holds four items per tile, so a lane carries four times the belt's speed in items per second, and a plain belt moves 12 items a second on both lanes together. Items '''compress''': they close up behind each other when the belt ahead is backed up.

== Laying belts ==

Hold a belt and drag to lay a line. A belt goes down facing where {{k|rotate}} points, however you drag. Dragging a belt over an existing one swaps it in place (''fast replace''), which is how you upgrade a belt line to a faster tier. A belt with a single belt feeding into its side turns into a curve by itself.

== Lanes ==

* A belt that runs into the '''side''' of another puts its items on the lane nearest to it (''side-loading''). One side feed alone turns the belt into a curve instead; curves keep their lanes.
* [[Inserters]] put items on the '''far''' lane; [[Mining|drills]] on the '''near''' lane; both use the right lane when they face along the belt.
* Belts never load furnaces or assemblers directly. Put an inserter between them.

== Underground belts ==

An underground belt carries items under anything in its way, roads included. Place the entrance, then the exit facing the same way up to its reach ahead (6 tiles for a plain one, 8 fast, 10 express, enough to cross any road); the two pair by themselves. For anything longer, angle a belt down to layer −1 and run it underground for real. Undergrounds run at their belt's speed, so belt, tunnel and belt make one line.

The engineer can ride through it: step onto the entrance. In [[Depth|depth mode]], page down below the ground ({{k|layerDown}}) to see the tunnel itself: a belt in a channel dug through the earth, diving down from the entrance and climbing up into the exit, with everything travelling through it.

== Splitters ==

The {{i|splitter}} is a single tile that deals items in turn to the belts in front of it, to its left and to its right. Each of the three ways can have a '''filter''': a filtered way takes only its item, and the rest go to the unfiltered ways. The {{i|bus_splitter}} does the same for [[Belt logistics#Bus belts|bus belts]], all three lanes at once, each lane keeping its place.

== Angled belts ==

From the start, any belt (plain, fast, express, and [[Belt logistics#Bus belts|bus belts]] once you have them) can be '''angled''' to carry items one layer up or down, like an incline conveyor:

# Hold a belt and press {{k|pitch}} to choose: level, slopes up, or slopes down. The hand bar shows which.
# Place it. A slope always '''stands on the lower of the two layers it joins''', on legs under its high end, so it never digs into the ground.
# Building moves to wherever the slope leads, in [[Depth|depth mode]], and the belt in your hand goes back to level, so a drag carries straight on.

'''Going up:''' place the slope where the belt should start climbing. It takes items in on its own layer and hands them to the tile ahead, one layer up. Belts above the ground stand on [[Hollow frame|hollow frames]], so put frames under the tiles after it.

'''Coming down:''' place the slope on the lower layer, on the tile just past the end of the raised belt (with a raised run on layer 1, that is on the ground). It takes items from the belt above and behind it and hands them on along the ground. Pointing just past the end of a belt on your own layer instead takes that belt down a layer: from the ground, down to layer −1 (which needs {{t|excavation}}).

A slope up followed straight away by a slope down makes a hump over something in the way. The engineer can walk up a slope (or let the belt carry them) onto the frames, and down again. See [[Engineer#Climbing|climbing]]. Slopes never curve or take items from the side, and an angled bus tile has no channels.

Angled belts replaced the old '''lift''' building and its research: lifts in older worlds turn into angled belts where they stand, and lift items come back as the belts, steel and frames they were made from.

== Bus belts ==

The {{i|bus_belt}} carries '''three lanes''' and takes items only from the belt behind it: no side-loading, no inserters. Any bus tile can send its left or right lane off to the side through a '''channel''' with a filter; the middle lane always goes straight on. A channel only fills once the bus ahead of it backs up, so the first items arrive after the bus is full.

'''Feeding a bus.''' A two-lane belt (or splitter) running into the back of a bus spreads its items over all three bus lanes in turn, so the bus fills evenly. A bus line can be set to '''keep to the outer lanes''' instead (click any tile of it, ''Line''): then the belt's left lane fills the bus's left lane, its right lane the right one, and the middle lane stays free for something else.

'''The end of a bus.''' Where a bus runs onto a two-lane belt, its outer lanes go onto that belt's lanes, and the middle lane only into a side they leave empty. Where a bus ends against a building (a chest, a machine, a depot), it feeds that building from every lane. The ''front'' setting on the last tile picks what goes in: anything (the default), one item, or nothing.

'''Shaping a bus.''' Bus belts turn corners, rotate ({{k|rotate}}) and [[Belt logistics#Angled belts|angle up or down a layer]] like any belt. A {{i|bus_underground}} takes a bus under anything for up to 8 tiles, and a {{i|bus_splitter}} divides one bus into three.

== Belt lines ==

Belts are simulated as '''lines''': a run of tiles, tunnels included, treated as one. Click any belt to see its line and its whole network; the same view is under ''Belt lines'' in the [[Routes and depots|logistics window]] ({{k|logistics}}), which also draws the network as a diagram. A line can be:

* '''named''';
* '''filtered''', so it only accepts certain items;
* '''sped up''' with up to two [[Augments|speed augments]] in its slots.

Lines split and merge with their settings as you remove and replace tiles. Line settings can be [[Copy and paste|copied and pasted]] onto other lines.

=== Outputs ===

A single belt tile can push one lane out to the side into whatever stands there, without splitting the line: set it under ''Outputs'' in the belt's panel, with a filter if you like. A chest fed this way stands open, its goods churning in the colours of what goes in.

== Picking up from belts ==

Holding {{k|pickup}} next to a belt picks items off it. {{k|drop}} drops one held item onto the belt under the cursor.

== See also ==

* [[Inserters]]
* [[Storage]]
* [[Augments]]`,
},
{
  title: 'Inserters', desc: 'Arms that move items between things', cats: ['Logistics'], icon: 'inserter',
  body: `'''Inserters''' are arms that pick items up from the tile behind them and put them down on the tile in front. They move items between belts, chests and machines, and are how machines are fed and emptied.

{{gen|inserters}}

== How they work ==

An inserter takes one item at a time. It only picks up what the thing in front of it can use: an inserter facing a furnace takes only ore and fuel, one facing an assembler only that recipe's ingredients, one facing a lab only science packs. This lets a single mixed belt feed many different machines.

Inserters and what they link must belong to the same [[Factories|factory]].

Hover over an inserter to see where it picks up (blue) and where it drops (orange). [[Interface#In the world|Alt mode]] can draw small arrows on every inserter.

== Kinds ==

* The {{i|burner_inserter}} needs no power. It burns fuel, and '''fuels itself''': a dry one reaches for fuel behind it first, and fuel it is carrying goes into its own slot.
* The {{i|inserter}} is the electric standard.
* The {{i|long_inserter|long arm}} reaches two tiles each way.
* The {{i|fast_inserter}} swings more than twice as fast.
* The {{i|filter_inserter}} is fast and only moves the item you choose in its panel.

== Pitch ==

In [[Depth|depth mode]], {{k|pitch}} sets an inserter's '''pitch''': ''level'' (the normal way), ''lift'' (drops one layer up) or ''drop'' (drops one layer down). This moves items between layers without a slope.

== Belts ==

Inserters drop items on a belt's far lane (the right lane when they face along it). They can't load or unload [[Belt logistics#Bus belts|bus belts]].

== See also ==

* [[Belt logistics]]
* [[Storage]]`,
},
{
  title: 'Fluids', desc: 'Pipes, pumps, valves, tanks and barrels', cats: ['Fluids'], icon: 'pipe',
  body: `'''Fluids''' in [[Depthworks]] are water, steam, oil and its products, and sulfuric acid. They move through pipes and between buildings that touch, and travel further in [[Barrel|barrels]].

== The fluids ==

{{gen|fluids}}

== Pipes ==

A {{i|pipe}} joins every pipe and fluid port next to it, so lines branch wherever pipes meet (drawn as T and cross pieces); there is no separate junction piece. Each pipe tile holds 100 units. Pipes are available from the start.

* '''One line, one fluid.''' A pipe that would join two different fluids is refused when you place it.
* '''Long lines carry less.''' Flow falls with the length of a line; a [[Pump|pump]] starts a fresh line at full flow.
* A line is only as quick as its '''slowest pipe'''. {{i|steel_pipe}} carries five times as much, and a {{i|hp_pump}} only runs flat out through steel all the way.

The engineer can walk between two touching pipe lines, but not across a single straight one.

=== Underground pipes ===

An {{i|underground_pipe}} carries fluid under belts, roads and rails: place one end, then the other up to 10 tiles ahead, facing the same way. The steel version reaches 15 tiles.

== Buildings ==

{{gen|fluidbuildings}}

; Pumps
: A {{i|pump}} pushes fluid one way, from behind it to in front, up to 6000 units a second. It splits a line in two and gives the far side full flow again.
; Valves
: A {{i|valve}} lets fluid through one way only. It can be set to pass only '''overflow''' (when the input side is more than 80% full) or only to '''top up''' (when the output side is under 50%).
; Storage tanks
: A {{i|storage_tank}} holds 25,000 units of one fluid and connects on every side.

== Machines with ports ==

Some buildings connect only at certain sides. Hover over one to see blue (in) and orange (out) arrows at its ports:

* [[Boiler|Boilers]]: water in and through at both short ends, steam out of the back.
* [[Steam engine|Steam engines]]: steam in and through at the front and back.
* [[Oil refinery|Refineries]]: crude in at the back, products out of the left, front and right.
* [[Chemical plant|Chemical plants]]: fluids in at the back and left, out of the front.
* [[Pumpjack|Pumpjacks]]: crude out of the front.
* [[Leaching drill|Leaching drills]]: acid in at the back.
* [[Uranium reactor|Reactors]]: water at the sides, steam front and back.

== Barrels ==

A {{i|barrel}} holds {{d|BARREL_SIZE}} units of any fluid that can be barrelled (not steam). A {{i|barreler}} fills barrels from a pipe at its back, or empties them into it: choose fill or empty as its mode; in fill mode it follows whatever fluid is in its pipe. Barrels ride on belts and in vehicles, and fuel barrels refuel vehicles and depots.

== Irrigation ==

[[Irrigation pipe]] carries only water, to and between [[Agriculture|greenhouses]]. It joins water pipes too.

== See also ==

* [[Oil processing]]
* [[Steam power]]`,
},
{
  title: 'Oil processing', desc: 'Pumpjacks, refineries and chemistry', cats: ['Fluids'], icon: 'refinery',
  body: `'''Oil processing''' turns crude oil into fuels, rubber, solid fuel, asphalt, concrete and acid. It opens with the {{t|oil_processing}} research and is the way to [[Vehicles|vehicles]].

== Crude oil ==

Crude oil wells are dark patches on the ground, more common in dry and harsh [[Biomes|biomes]]. A {{i|oil_pump}} placed on one pumps 10 crude a second at 100% yield out of its front. Wells never run dry, but pumping slowly lowers their yield, down to 20%.

== Refining ==

An {{i|refinery}} splits crude into three products. Crude goes in at the back; the products come out of the left, front and right, each into its own pipe.

{{gen|recipes|refine}}

== Chemistry ==

A {{i|chem_plant}} works with fluids in at its back and left, out of its front, and takes items by inserter.

{{gen|recipes|chem}}

== Fuels ==

! Fuel !! Energy !! Burned by
| {{i|heavy_oil}} || 0.6 MJ || [[Marine engine|marine engines]] (ships)
| {{i|diesel}} || 1 MJ || [[Diesel engine|diesel engines]], the {{i|fuel_generator}}
| {{i|gasoline}} || 0.9 MJ || [[Petrol engine|petrol engines]] (cars)
| {{i|jet_fuel}} || 1.5 MJ || [[Turbine engine|turbine engines]], the fastest

Heavy oil cracking turns surplus heavy oil into diesel. Jet fuel comes from advanced refining or from blending diesel and gasoline.

== Diesel power ==

The {{i|fuel_generator}} burns diesel from a pipe for up to 1.5 MW. Like a steam engine it feeds the pole whose area it stands in, and only works as hard as the network needs.

== See also ==

* [[Fluids]]
* [[Vehicles]]
* [[Fuel]]`,
},
{
  title: 'Vehicles', desc: 'Cars, trucks, tanks, boats and trains', cats: ['Transport'], icon: 'car_petrol',
  body: `'''Vehicles''' in [[Depthworks]] are built from two parts: a '''frame''' (car, truck, tank, cargo boat, locomotive or cargo wagon) and an '''engine''' (petrol, diesel, marine or turbine). The engine's power against the frame's weight decides how fast it goes and how much it burns.

{{main|Railways|Shipping|Routes and depots}}

== Building a vehicle ==

Vehicles are made in a {{i|vehicle_factory}} (the {{t|vehicles}} research). Choose a vehicle as its recipe; its panel shows the speed, power and fuel of that combination.

=== Frames ===

{{gen|frames}}

=== Engines ===

{{gen|engines}}

== All vehicles ==

{{gen|vehicles}}

Top speed is the frame's limit or what its engine can push, whichever is lower; heavier frames and extra wagons slow a vehicle down, and rails roll more freely than roads.

== Driving ==

Place a vehicle like a building, walk up to it and press {{k|board}}. {{kbd|W}} speeds up, {{kbd|S}} brakes and then reverses, {{kbd|A}} and {{kbd|D}} steer. Press {{k|board}} again to get out onto dry land.

* '''Cars''' and '''tanks''' drive anywhere on dry land. A tank drives straight through trees, flattening them.
* '''Trucks''' only drive on [[Roads|roads]], and keep to the right on two-lane roads.
* '''Boats''' only move on water. See [[Shipping]].
* '''Trains''' run on [[Railways|rails]]; {{kbd|A}}/{{kbd|D}} pick the branch at the next junction.

Trucks, boats and trains can also drive themselves along a [[Routes and depots|route]].

== Fuel ==

Each engine burns one fuel, from the vehicle's tank. Fill the tank by dropping fuel [[Barrel|barrels]] on its fuel slot (the empty barrels come back), or let it refuel at a depot with fuel in its tank. Fuel left in the tank is lost when you pick the vehicle up.

== Danger ==

A moving vehicle hurts any engineer it hits, more the faster it goes. See [[Engineer#Health|health]]. It kills any [[Animals|animal]] it runs into, and the driver gets what the animal gives; animals run from moving vehicles, so this takes some doing.

== Picking up ==

Hold right-click on a vehicle to pick it back up.

== See also ==

* [[Oil processing]]
* [[Roads]]`,
},
{
  title: 'Roads', desc: 'Road surfaces, paths and powered roads', cats: ['Transport'], icon: 'asphalt_road',
  body: `'''Roads''' are painted onto the ground as a tile layer. Trucks need them, walking on paths and sidewalks is faster, and powered roads carry electricity underneath. They open with the {{t|roads}} research.

== Surfaces ==

{{gen|roads}}

The {{i|path_tile|path}} is paving for people: walking on it (or on a road's sidewalk) is 35% faster. {{kbd|Ctrl}} + mining takes up a single path tile.

== Laying roads ==

Hold a road surface and drag. A bar next to your hand sets the road you lay:

* '''Width''' from 1 to 4 tiles, and '''1 to 4 lanes''';
* '''centre markings''' (none, dashed, solid or double yellow) and edge lines;
* '''sidewalks''', laid as paths along the edges;
* rounded corners, and '''junctions''' with zebra crossings or stop lines.

Each drag is one road: mining it takes up the whole drag at once.

Buildings can't stand on roads (keep them clear, or pass under with an [[Belt logistics#Underground belts|underground belt]] or [[Fluids#Underground pipes|pipe]]). Rails and dams can.

== Powered roads ==

With {{t|road_power}}, a {{i|road_conduit}} dragged over road tiles lays power cable inside them, one conduit a tile. Touching conduit tiles make one grid. A grid joins a low voltage pole whose supply area covers it (or that stands within a tile of it), and powers machines standing right beside the road, with no poles or wires. A grid carries at most 3 MW to the machines it powers; past that they slow down. Mining the road gives the conduits back.

== See also ==

* [[Vehicles]]
* [[Routes and depots]]`,
},
{
  title: 'Railways', desc: 'Rails, signals, stations and trains', cats: ['Transport'], icon: 'locomotive_diesel',
  body: `'''Railways''' carry trains of a locomotive and cargo wagons along rails, run by [[Routes and depots|routes]]. They open with the {{t|railways}} research.

== Rails ==

Drag {{i|rail}} to lay track. Rails join every rail next to them: corners curve, three or four ways make a junction. Track runs in the four main directions only (no diagonals). Rails can be laid over roads. Rails, and the trains on them, belong to no [[Factories|factory]]: any factory can use them.

== Trains ==

Place a {{i|locomotive_diesel|locomotive}} on a rail, then {{i|cargo_wagon|cargo wagons}} right behind it in a row: they couple into one train. Each car is one tile long. Wagons hold 40 slots each, and add weight that slows the train.

A train can be driven by hand ({{k|board}}): {{kbd|W}} to go, {{kbd|S}} to brake, and {{kbd|S}} from a stop to run the other way. {{kbd|A}}/{{kbd|D}} pick the branch at the next junction.

== Signals ==

A {{i|rail_signal}} is placed by clicking a rail; {{k|rotate}} turns which side it stands on. Signals split the track into '''blocks''', and only one train at a time may be in a block. Signals are two-way: there are no one-way or chain signals.

Trains prefer to keep going forward, so loops work well. Two trains meeting head-on on a single line will wait for each other forever, as on a real single track. A train only turns round at a stop when there is no way forward.

== Stations ==

A {{i|train_station}} goes right beside a rail. Trains stop at it, refuel from its tank, then load or unload by their schedule and its settings. See [[Routes and depots]].

== See also ==

* [[Vehicles]]
* [[Routes and depots]]`,
},
{
  title: 'Shipping', desc: 'Ports, cargo boats and sea lanes', cats: ['Transport'], icon: 'boat_marine',
  body: `'''Shipping''' moves goods by water in cargo boats between ports. It opens with the {{t|shipping}} research.

== Ports ==

A {{i|port}} goes on the shore, next to water. Boats dock at the water beside it, refuel from its tank, and load or unload. A port holds 48 slots and a 2,000-unit fuel tank. Fish caught by boat nets unload at ports too.

== Boats ==

The {{i|boat_marine|cargo boat}} carries 48 slots. It takes a marine engine (heavy fuel oil), a diesel engine or a turbine engine. Boats move only on water, along the coast, lakes and rivers, and follow [[Routes and depots|sea lanes]] set up in the logistics window.

== Fishing nets ==

Put a {{i|fishing_net}} on a boat and it catches every fish it passes. Past one stack of fish the net strains, and at two it tears: it keeps one stack and lets the rest go. See [[Fishing]].

== See also ==

* [[Vehicles]]
* [[Fishing]]
* [[Routes and depots]]`,
},
{
  title: 'Fishing', desc: 'Catching fish, by hand or by net', cats: ['Transport'], icon: 'raw_fish',
  body: `'''Fishing''' in [[Depthworks]] gives [[Food|food]]. Fish live in every body of water.

== By hand ==

Fish swim near engineers. Hold right-click on one within reach to catch it as {{i|raw_fish}}. Hold the fish and click to eat it, or cook it in a furnace into {{i|cooked_fish}}, which heals more and keeps you well fed three times as long.

== By net ==

A {{i|fishing_net}} on a [[Shipping|cargo boat]] catches every fish the boat passes. A net strains past one stack (50 fish) and tears at two, keeping 50. The catch unloads at a port.

== Populations ==

Each stretch of water holds a population of about one fish for every nine water tiles, and new water starts two-thirds full. Fish breed back toward that number: a half-empty lake recovers fastest, a fished-out one only trickles back, slowly. Water far from anyone keeps only its count and catches up on the growth it missed when someone returns.

== See also ==

* [[Food]]
* [[Shipping]]`,
},
{
  title: 'Routes and depots', desc: 'The logistics window: stops, cargo and when to leave', cats: ['Transport'], icon: 'truck_depot',
  body: `'''Routes''' make trucks, trains and boats drive themselves between '''depots'''. All of it is set up in the '''logistics window''' ({{k|logistics}}), which has tabs for rail lines, truck routes, sea lanes and [[Belt logistics#Belt lines|belt lines]], and a map showing every route's legs and stops.

== Depots ==

{{gen|depots}}

A depot is storage where vehicles dock. It has a '''name''': routes stop at depots by name, so several depots can share one. Each depot has a '''priority''', a '''vehicle limit''', and '''rules''':

* With no ''import'' rules, a depot takes anything vehicles unload; with some, only those items, up to the amount each rule sets.
* With no ''export'' rules, vehicles may load anything; with some, only those items, and the depot keeps at least the amount each rule sets.

Fuel barrels put into a depot's storage are emptied into its fuel tank (the empty barrels stay behind for the trip back), and vehicles refuel there.

When a route names a depot, the vehicle heads to the depot of that name with the highest priority, then the nearest, skipping full ones.

== Routes ==

A route is a list of '''stops'''. Each stop is a depot (by name) or a waypoint on the map, and says:

; What to do
: ''Load'', ''unload'', ''both'', or ''pass'' (drive through).
; Cargo
: Which items to load or unload (a filter).
; When to leave
: One or more conditions.

{{gen|conds}}

Conditions are joined by ''and'' or ''or'': ''or'' starts a new group, and the vehicle leaves when every condition of any one group holds. A route can '''loop''' back to its first stop. A road waypoint can be used to make a truck take a particular side of a loop.

Assign a vehicle to a route from its panel. Stops and whole routes can be [[Copy and paste|copied and pasted]].

== See also ==

* [[Vehicles]]
* [[Railways]]
* [[Shipping]]`,
},
{
  title: 'Factories', desc: 'Separate factories in one world', cats: ['Logistics'], icon: 'vehicle_factory',
  body: `'''Factories''' let one world hold several separate factories. Belts, inserters, drills, pipes, power and underground pairs never connect across two factories, so goods move from one to another only by [[Vehicles|truck, train or ship]]. Founding more than the first needs the {{t|factory_planning}} research.

== Using factories ==

* {{k|factories}} opens the '''factories window''': found a new factory, pick its colour, and choose which one you build for.
* {{k|nextFactory}} switches the factory you build for. Everything you place belongs to it.
* Every building shows its factory in [[Interface#In the world|alt mode]] tags, its panel and its tooltip, and the [[Map|map]] has a factories view.
* Buildings can be moved to another factory one by one, or a whole area at once with the map's ''Assign'' tool.

A machine moved to another factory loses its power and its links to its old neighbours at once. Rails and trains belong to no factory: every factory can use them.

In [[Multiplayer|co-op]] each engineer builds for the factory they picked.

== See also ==

* [[Routes and depots]]
* [[Map]]`,
},
{
  title: 'Copy and paste', desc: 'Copying settings between buildings', cats: ['Mechanics'], icon: 'filter_inserter',
  body: `'''Copy and paste''' copies a thing's settings and applies them to others. {{kbd|Shift}} + right-click copies; {{kbd|Shift}} + left-click pastes. {{kbd|Esc}} clears what is copied. Both can be rebound.

== What can be copied ==

* '''Buildings''': recipe, filters, augments (taken from your inventory), modes, splitter and bus settings, station settings, a greenhouse's crop.
* '''Belt lines''' and whole belt networks (name, filters, augments).
* '''Routes''' and '''stops''', in the logistics window.
* '''Roads''': the road settings.

There is one clipboard. Pasting onto something different but compatible applies what the two share and ignores the rest: an assembler's augments onto a furnace, a line's filter onto a filter inserter, one station's name and rules onto another.

== Pasting onto many ==

With [[Building#Selecting many|several buildings selected]], the selection bar's ''paste to all'' button pastes onto every one. While a selection is going, {{kbd|Shift}} + click keeps adding and removing buildings instead of pasting.

Copying '''layouts''' (several buildings at once) is not in the game; [[Blueprints]] plan one building at a time.

== See also ==

* [[Blueprints]]
* [[Building]]`,
},
{
  title: 'Blueprints', desc: 'Planning buildings to build later', cats: ['Mechanics'], icon: 'frame',
  body: `A '''blueprint''' is a planned building: drawn stippled, it does nothing at all. It uses no power, carries nothing and blocks nothing, until it is built.

== Planning ==

* Hold a building and {{kbd|Shift}} + click (or drag) to plan it as a blueprint instead of building it. Anything that could be built there can be planned, whether or not you have one, at any distance.
* {{k|pipette}} on something you can't build gives you a hand of blueprints.
* Dragging a line of poles past your reach plans the far ones as blueprints.

A blueprint over another blueprint replaces it.

== Building ==

Click a blueprint with an empty hand to build it from your inventory (crafting it if need be). Building the real thing on a blueprint's tiles also takes its place. Mining a blueprint (from much further than normal reach) removes it.

Blueprints are saved with the world and shared in [[Multiplayer|co-op]].

== See also ==

* [[Building]]
* [[Copy and paste]]`,
},
];
