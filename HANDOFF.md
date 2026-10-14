# Handoff

Where Depthworks stands, what has been checked, what hasn't, and what to do next.
Written for whoever picks this up next, person or agent. Read [AGENTS.md](AGENTS.md) for how the code
fits together and [DESIGN.md](DESIGN.md) for the game's intent.

## The game in one paragraph

A pixelated 2.5D factory game modelled closely on Factorio: you walk an engineer, mine by hand, craft,
automate with belts and inserters, power machines through pole networks, and research up a tech tree.
Two things are its own. First, **depth**: you build on stacked layers, up onto hollow frames and down into
two rock layers, and "precision" (machinery that is actually working) unlocks more of them. Second, the
endgame is not a rocket but **a conversation**: a transmitter sends the mechanisms working around it as
glyphs, and something answers using only the mechanisms it has heard.

## Where the last session left off

The newest work is **not committed yet**: it waits for the owner's "push" (`main` is still at "Add research queue and
tree, power tiers, blueprints, crafting stations and more"). The owner has not played any of it by hand.

This session worked through another long list from the owner. In short:

- **Fixes:** chlorophyll can be hand-crafted from seeds again (hand crafting never understood the `'#seed'` group;
  cancelling gives back the very seeds it took). Pipes are available from the start (the recipe itself was locked
  behind Fluid handling, not just shown that way). Multi-tile buildings give back one item (a boiler gave 2, a steam
  engine 4); only `perTile` kinds (greenhouses, dams) give back by the tile.
- **Building:** dams go down two tiles wide. Big mining drills are 2×2 (4× an electric drill over full ore, power by
  coverage, bedrock, 3 augment slots). Every pole's supply area is 2 tiles wider; Direct wiring (research) runs power
  cables from electric poles straight to machines. The placement preview is a solid ghost tinted green / red, stippled
  only while planning a blueprint (Shift, or a blueprint in hand).
- **Looks:** new icons for everything that had none (dam, reactor, coolant tower, greenhouse and panel, medical lab,
  centrifuge, leaching drill, big drill, radar) and distinct ones for steel and irrigation pipes, the high pressure pump
  and uranium; no more blank or magenta fallbacks. New or reworked models: dam (deck, gates, turbine houses, lit spill),
  reactor (warning beacon: green, amber, flashing red, dark when broken; scorched when broken), coolant tower (basin
  light, blinks short of water, cracked when broken), high pressure pump, steel and irrigation pipe bands, greenhouse
  doorways, medical lab, radar, big drill.
- **Map:** the map shows only what has been seen, keeps only live tiles up to date (near engineers and working radars),
  and dims the rest. Radars (from the start, 300 kW) keep 48 tiles live and explore out to 160. Explored tiles save per
  chunk. The minimap zooms from ½ to 32 pixels a tile; zoomed in, its whole frame is the close-up with nothing over it.
- **Research:** one tree engine for technologies and medical upgrades (medical now has a tree a level a node, and a
  queue like research). Lines are right-angled with rounded corners, one trunk out of each node and one bus into each.
- **Camera:** free camera mode is gone. Depth mode orbits (`;` `'`), tilts (`-` `[`), pans (middle drag), and the grid
  can be turned off (`N`); leaving depth mode tweens back to the default view.
- **Hands and co-op:** Shift + click builds a selection of many; transfer modes and Ctrl + click share a stack over it,
  "paste to all" pastes settings onto it. Clicking another engineer opens a trade.
- **Collision:** smaller shapes for small things, machine squares a little inside their tile, and sliding round corners.

### The session before

A long list from the owner (research, power, interaction, visuals, map, camera, crafting stations, belt outputs):

- **Research:** a queue (labs work down it; queuing a tech queues what it needs first; reorder and remove from the
  panel; saved and synced) and a new research window, research.js: a left-to-right tree in sections (`TECH_CATS`),
  curved prerequisite lines, node states, tooltips, pan, zoom and search.
- **Rebalance:** electric furnaces at red science (Electric smelting needs only Steel), a Steel electric furnace (×3,
  165 kW, 3 augment slots) with green science (Advanced smelting), Crafting stations (red), Powered roads (red and green,
  after Roads and Electric distribution).
- **Power:** a third voltage, extra-low (`ELV`): generators feed only generator poles; a step-up station plus a step-up
  cable lift it into low voltage. Boilers are 2×1 and steam engines 2×2 (`big`, turned with R), with paired in and
  out arrows at their ports. Road conduits carry low voltage under roads to machines beside them. Power poles drag out
  in lines spaced to their coverage, previewed while dragging.
- **Building and hands:** blueprints (Shift + place, or Q on something you can't build; stippled; click one to build
  it), Q over ore picks the best drill, Ctrl+click routes items by slot kind everywhere, Shift+click selects a building
  for transfer modes (fuel, input, store evenly, augment), click an engineer for their details.
- **Looks:** a shared stippled see-through path (dither) for ghosts, previews, blueprints, glass and the see-through
  ground; the interface drawn after the night; darker midnights (`DAY.midnightLight`, `nightCurve`); more colourful
  biomes, and the real culprit behind the washed-out ground fixed (terrain textures were decoded as linear because
  the line setting their colour space sat inside a comment); ore that barely shows until it is worked, with global
  stages by wear and depth; fuller ore patches in new worlds (generation v2).
- **Belts and chests:** single belt tiles push one lane out to the side (Outputs in the belt panel, filters, copy and
  paste) without splitting the line; chests fed that way stand open with their goods churning in the fed colours.
  Underground belts show their traffic in depth mode, below the ground.
- **Crafting stations:** assemblers with an arm that fetches ingredients one at a time from chests within 3 tiles.
- **Map:** dirty-set refresh with a per-chunk building index and a time budget, quarter-resolution regions when zoomed
  out, a rendered close-up when zoomed in (turnable in depth mode), wheel zoom on the minimap.
- **Camera:** a free mode (C) turned and tilted with a middle-button drag, alongside the fixed one.
- **Collision:** smaller shapes for small things (`hitOf`), a smaller engineer (radius .22), and pipe lines that only
  block along their straight runs, so rows of anything small can be walked between.

## Status

| Area | State |
|---|---|
| Core loop (mine → smelt → craft → automate → research) | Done, played through in code-driven tests |
| Engineer, Factorio controls, reach, collision | Done. Hand mining shows one counting popup per haul ("+3 Iron ore (47)") |
| Inventories | Real slots (80 for the player, 16/32 for chests), drag and drop, typed machine slots. Clicking any usable item (building, road, vehicle, cable, signal, food) in the inventory puts it in the hand |
| Building | Placing something you've run out of crafts it (and its parts) if you have the materials; the spot waits as a pale square and builds itself when the craft lands, so belt drags keep going. Blueprints (Shift + place, Q on what you can't build, click to build). Belts keep the direction R gives them |
| Logistics | Two-lane belts in 3 tiers (4 items per lane per tile, side-loads onto the near lane, curves keep lanes), undergrounds, splitters with per-way filters, lifts. Simulated as lines (`belts.js`). Three-lane bus belts with filtered side channels and a bus underground. Belt lines tab in the logistics window: names, filters, speed augments, network diagram |
| Augments | Speed / efficiency / productivity in 5 tiers (10/15/25/35/50%), depth (2 tiers) for drills. 2 slots by default, 3 on assembler II, refinery, big drill, 4 on the vehicle factory |
| Deposits | Never run out: surface (4× the old amount), depth (10×, slower, 1 in 6 cycles gives two), endless bedrock. Burner drill reaches surface, electric drill depth, big drill bedrock |
| Sandbox | Title screen: everything researched, crafting free and instant, an Everything tab handing out any item |
| Health and stamina | 100 health: moving vehicles hurt (9 per tile/s of speed), it regenerates after 5 s (faster well fed), food heals, death respawns you at the landing site with your inventory. Hold Shift to sprint (x1.55) on stamina |
| Power | Three voltages: extra-low (generators, generator poles), low (machines), high (power lines). Steam chain (water pump → 2×1 boilers → 2×2 steam engines, Factorio's 1:20:40, load-based) into generator poles, a step-up station and step-up cable into low voltage, transformer stations into high voltage. Powered roads (conduits). Pole lines dragged out by coverage. Brownouts, flashing plugs on unpowered machines |
| World | Generated from a seed, 500 to 65536 tiles a side (2048 by default), in 32×32 chunks made when first needed (worldgen.js). World options on the new game screen: size, seed, biome size, water, ore. Saves keep only the seed, options and edits. Worlds from before chunks load as they were (96 tiles) and gain weedy patches |
| Rendering | Chunks around the camera only (terrain.js): a coarse picture at once, full detail painted a few tiles a frame, texture detail by zoom (16/8/4 texels a tile), flora hidden zoomed out, models only for buildings in shown chunks |
| Biomes | 11, defined in data (BIOMES): climate, ground, ores and patterns, trees, flora, weedy patches, oil, three crops. Biomes are large (climate scale 520 tiles by default) and ore patches big (starter patches 1.7× the old size). The landing site has livable biomes all around. Borders wander in a smooth warp, and each tile's ground colour is a 13-tile blur of the biomes actually around it (groundColors), on the ground and the map alike. Hazards in six (heat, cold, fumes, spores, resonance, radiation): exposure builds and fades, never kills, adaptations cut it |
| Water | Ocean rim at the world's edge and low land, lake blobs, rivers along noise channels in some regions, each river tile with a flow direction. Nothing within 44 tiles of the landing site. No walking or building on water except pumps and dams |
| Multi-tile objects | Greenhouse rooms, dams, 2×1 boilers, 2×2 steam engines and big drills are one object over many tiles (`foot`, multi.js); touching rooms and dams join. Mining takes the whole and gives back one item, except `perTile` kinds (greenhouses, dams) which give back by the tile; Ctrl + mining takes one tile where data allows (greenhouses, paths), and a cut room splits in two. Roads: each drag is one road, mined whole |
| Tools | Axe (trees), pickaxe (ore, rock), shovel (weedy patches, Soil science). Speed and sweep research lines per tool. Cursor shows the tool; the engineer swings the right one |
| Farming | Weedy patches per biome give that biome's seeds. Greenhouses (25 tiles a greenhouse, panels for single tiles) grow one crop from its seeds with irrigation water, shared by need over a network; harvest and spare seeds to inserters. Green lamps speed them. Chlorophyll from any seeds; terrestrial science packs |
| Medical lab | Global upgrades (body, six adaptations, four mutations after irradiated seeds), long research with terrestrial packs, chlorophyll and crops; Medical tab in research |
| Power plants | Dams (drag across water, high voltage only, need power to start, ~180 kW a tile, 2.4× on rivers). Uranium reactor (2000 steam/s, 60 MW) with coolant towers; overheating warning, critical, break, repair. High pressure pump (3600/s, full rate only through steel pipe) |
| Copy and paste | Shift + right/left click (rebindable): buildings (recipe, filters, augments from your inventory, modes, splitter and bus settings, station settings, crops), belt lines and whole networks, routes, stops, roads |
| Fluids and oil | Pipes (auto T and cross pieces), underground pipes (10 tiles), pumps, valves (one way / overflow / top up), storage tanks, throughput that falls with pipe length, no mixing. Pumpjacks on crude wells, refineries and chemical plants with fluid ports, barreling stations, diesel generators. Fluids: crude, heavy fuel oil, diesel, gasoline, jet fuel (plus water, steam) |
| Vehicles | Vehicle factory joins an engine (petrol, diesel, marine, turbine; each burns one fuel) to a frame (car, truck, tank, boat, locomotive, wagon): 12 vehicles, stats from power and mass. Fuel tanks, refuelling with barrels or at depots, driving with B and WASD, tanks flatten trees |
| Transport | Roads as a painted tile layer: 4 surfaces, width 1–4, 1–4 lanes, centre markings, edge lines, sidewalks, rounded corners, junctions with zebra crossings or stop lines. Paths speed walking. Rails join neighbours (curves, junctions), rail signals make blocks. Train stations, truck depots and ports store goods and fuel |
| Routes | One logistics window (L) for rail lines, truck routes and sea lanes: depot or waypoint stops, load / unload / both / pass, cargo filters, leave conditions (full, empty, time, idle, cargo has, depot has, next stop has room) joined by and/or, loops. Depots by name, priority, vehicle limit, import/export rules |
| Factories | Several factories in one world (after Factory planning research). Belts, inserters, drills, power, pipes and underground pairs never cross factories. Shown in alt mode tags, panels, hover info and a map view; reassigned per building or with the map's Assign tool |
| Fish | Fish swim near engineers; every chunk's water keeps a population with logistic regrowth (caught up when someone returns). Catch by hand (hold right-click), eat for a speed buff, cook in furnaces. Boat nets catch past a stack and tear at two |
| Map | Minimap, big map (M) with zoom/pan, markers, labelled areas, terrain/resources/production/power views. Only explored tiles are drawn; only live ones (near engineers and working radars) are kept up to date, the rest dimmed as last seen. Radars. The minimap's close-up fills it |
| Interface | One compact quickbar row with a 1/2/3 switch (X cycles), health and stamina bars beside it, Hide UI (H). Pause menu (F1, or Esc once nothing else is open): resume, settings (volume, building icons, goals list, minimap), controls and key rebinding, how to play, save, export, save and quit. It pauses solo games. Rendering is fixed at the normal pixel size |
| Research | 49 techs plus 18 tool upgrades in 9 sections, 4 science pack tiers, gated by precision for depth. A queue (saved, synced), and a left-to-right tree window with search. The medical tab is the same tree, with a queue of its own |
| Depth | Layers −2..4, hollow frames, ghosting, lazily painted underground floors |
| Alien conversation | 9 scripted exchanges plus ambient replies, glyph animations, clarity that grows |
| Look | Pixel-snapped camera, toon shading, outline post pass, ore piles, trees/rocks, particles |
| Sound | All synthesised (Web Audio), proximity machine loops, volume slider. A high-shelf cut above 5 kHz on everything; labs and transmitters hum low instead of the old high beating tones |
| Co-op | Peer-to-peer (PeerJS), invite codes, nicknames, chat, trading (click another engineer), host-authoritative sync. Played by the owner with a friend on another network. Messages travel as JSON text (see below) |
| Save | Five slots in localStorage (slot 1 is the old save key), autosave every 30 s to the slot in play, a Load game screen (load, export, delete), Load from file, Export to file from the pause menu. Old formats still load (older saves gain water, cables, marks, quickbars, oil wells, fish, deposit layers, and everything joins the main factory) |
| Day and night | A 24-minute day on a clock shown in the status panel (a minute an hour; the sun rises at 05:30, sets at 20:00 and climbs and sinks smoothly in between, so the light and its warmth change all day): solar follows daylight, the world dims to moonlight through a light buffer in the post pass. Lamps (5 kW) and braziers (fuel) light the ground; working machines, depots, engineers and moving vehicles glow |
| Hosting | Public repo, served from GitHub Pages off `main`. After a push, players need Ctrl+F5 once to get fresh modules |

## Verified, and how

Most checks used the `window.depthworks` console hooks plus screenshots in a headless-ish browser pane.

- **Single player:** hand mining, crafting (including auto-crafting missing parts), the burner start,
  the power network, belts/undergrounds/splitters/lifts, inserter pitch, research, transmitter first
  contact, and save/load round-trips.
- **Real mouse and keyboard:** clicking machines (object picking), inventory and crafting clicks, dragging a stack into a
  furnace slot, depth mode toggles, I/O arrows and hints.
- **Co-op, using two tabs on one machine:** host and join by code, building, mining and Ctrl+click transfer as a guest,
  chat, leaving and rejoining with the inventory restored, and drag/shift moves into a host's chest
  from a guest. Later: guest-built pumps, hand-strung cables and map markers sync, and water arrives with the world.
- **Steam power:** 1 pump + 20 boilers + 40 engines gives 36 MW at full water and steam; a 21st boiler and 2 more
  engines add nothing (pump-limited). Output follows demand (75 kW of use put engines and boiler at 4.2%, the pump
  at 0.2%). A network at 80% of demand slows machines (brownout).
- **Distribution:** poles join by wire reach, overlapping coverage and power cables; voltages stay apart until a
  transformer station plus transformer cable joins them; removing a pole splits networks and refunds its cables;
  linking a linked pair again takes the cable down.
- **Water:** no walking into it, nothing built on it but pumps, pumps only on water. Rivers appear in about half of
  worlds, 10–34 tiles long, at least 33 tiles from spawn and clear of ore, and every river tile's current reaches a lake.
- **Interface:** X cycles quickbars, H hides every panel and in-world overlay and restores them exactly, M and the
  minimap open the map, keys rebind from the help window. Map markers, areas, renaming, colours and all four views.
- **Fuel:** burner drills fill to a full stack from inserters; burner inserters fuel themselves.
- **Steam on the new fluid system:** the 36 MW test above was repeated with the pump feeding the boiler row through
  pipes: 36 MW, still 36 MW with 21 boilers and 42 engines (pump-limited), 900 kW of demand puts every engine at 2.4%.
  Pumps, boilers and engines touching directly (old saves) still work.
- **Oil:** pumpjack (9.3/s at 93% yield) → pipes → refinery → three tanks filled 30:30:40 (heavy oil, diesel, gasoline).
  A pipe that would join diesel and heavy oil is refused. Barreling station fills diesel barrels. 5000 gasoline went
  tank → underground pipe pair under a road → pump → valve → tank.
- **Factories:** moving the refinery to a second factory cut its power and its crude line; a belt from one factory
  into another's stops at the boundary. Guests build for the factory they picked.
- **Roads:** 2- and 3-wide asphalt with sidewalks, dashed or solid centre, edge lines and a 4-way junction with
  zebra crossings, laid by code and by a real mouse drag (fast drags fill every tile). Mining a road tile refunds it.
- **Trucks:** fuelled by dropping diesel barrels on the fuel slot (empties come back), drive Mine → Smelter on a
  2-lane road keeping right, refuel from the depot's tank (filled from barrels), load, unload and loop. A picked
  road waypoint makes the truck take that side of a loop.
- **Trains:** a locomotive and two wagons coupled by placing them in a row; North → South loop route with loading,
  unloading and refuelling. Six signals, a second train: no two cars ever shared a tile over 120 s, and the second
  train waited at the red signal. Driving a locomotive by hand: W, brake, S from a stop runs it the other way.
- **Boats:** port to port along the coast, refuelling from heavy oil barrels, a net catching 35 fish on the way,
  unloaded with the cargo. A net tears at 100 fish, keeps 50 and lets the rest go.
- **Cars and tanks:** driving, steering, braking, getting out onto dry land; a tank flattens a tree; picking a
  vehicle up returns it.
- **Co-op (two tabs):** a guest receives roads, oil, vehicles, units, routes, factories, fish and tank contents;
  lays road, places a car, eats, builds for factory 2, fuels the car and drives it.
- **Interface:** logistics window (all three tabs, map with route legs and stops, stop editing), depot panel (rules
  added and limits typed with real clicks and keys), vehicle panel, factories window, road bar, crafting tabs, research.

- **Belts as lines:** belt → underground → belt is one line; a line handing on to another keeps 12 items/s (2 lanes
  × 6) exactly. Side-loads land on the near lane, curves keep lanes, splitters deal round-robin and a filtered way
  takes only its item. Lines split and merge with their settings when tiles are removed and re-placed.
- **Bus belts:** outer lanes go onto a two-lane belt's lanes; a middle lane alone is split evenly; all three full
  holds the middle lane and shows the red cross. A channel feeds a chest only once the bus ahead backs up. Inserters
  and side-loads are refused.
- **Augments and deposits:** a burner drill stops with "needs a depth upgrade" when its tile drops to depth, and mines
  again with a depth augment 1. Productivity and efficiency change an assembler's output and power draw.
- **Old saves:** single-lane belt items land on the right lane, ores get layers (mined-out tiles come back one layer
  down), and steam generators anywhere in a save (buildings, inventories, the ground, recipes) come back as parts.
- **Co-op (two tabs) after the belt rewrite:** belt items, line names and bus settings sync both ways.
- **Since then, in the browser:** sandbox (Everything tab, free crafting); holding roads and cars from the
  inventory with real clicks; the compact quickbar; auto-craft while placing (six belts from two belts and six plates,
  corners on waiting tiles); the pause menu pauses solo play and Esc steps through close → empty hand → menu;
  sprint (×1.55, about 5 s of stamina), a car hit, regeneration, respawn and food healing; the pickaxe pose (checked
  by computing the handle and tips through the swing); night (solar 0 kW at midnight, a brazier lit, a lamp
  unpowered on solar alone) and dusk (lamp lit, 29 kW per panel), seen in screenshots; save slots (two worlds in two
  slots loaded back, a file imported into a slot, a non-save refused, an export read back as a valid save).

- **Since the chunked world (this session), in the browser pane:** new worlds of 1024, 2048 and 65536 tiles (start in
  0.2 s, 24 KB save), chunk generation ~3 ms, steady render ~0.5 ms CPU, streaming on a 400-tile jump; biome shares
  (about 62% livable, 19% strange) and the landing site in a meadow; an old-format save made by the committed code
  loads (drill mining, 7 barrels became 35, moved recipes kept) and saves back; a generated world round-trips (felled
  tree, mined ore, dug patch, greenhouse room, medical progress); greenhouse rooms joining, harvesting on irrigation,
  splitting by Ctrl-mining, refunds; a dam across a river running on solar kick-start (4.3 MW for 10 tiles); reactor
  steam, heating without a tower, breaking and repair; high pressure pump capped by iron pipe; barreling fill and
  empty; leaching drill on uranium (electric drill refused); shovel sweep for seeds; cold exposure, adaptation,
  fading; medical lab research; copy/paste assembler→assembler, augments onto a furnace, line filter onto another
  line and a filter inserter; co-op host and guest building identical chunks, a guest's greenhouse and a dug patch
  syncing.

- **This session, in the browser pane (two tabs for co-op, the last commit in a worktree for an old save):**
  - Chlorophyll: 2 crafts from 8 wheat seeds; a cancelled craft from mixed wheat and flax gave back exactly what it took.
  - Refunds: a 2×1 boiler and a 2×2 steam engine each give back 1; a big drill gives back 1.
  - Big drill on four iron tiles, on solar: mining at ~1.8/s (2/s at full power), 400 kW, ore into a chest at its front left.
  - Direct wiring: refused before the research, then an assembler 10 tiles from a small pole runs on the cable
    (`wired`); a generator pole is refused; mining the assembler gives the cable back.
  - Multi-select: four furnaces selected (a fifth toggled out), 50 coal in fuel mode went 13/13/12/12.
  - Camera: depth mode, orbit, tilt and pan applied; leaving depth mode brought yaw, tilt and pan back to the default.
  - Map: a radar on solar explored from 48 out to 71 tiles in 20 s; explored, live (clear) and stale (dim) areas seen
    in a screenshot; the minimap close-up fills the frame with no overlays.
  - Research: the tech tree's new lines and forks, and the medical tree (queuing Recovery 2 queued Vitality 1 and
    Recovery 1 first), seen in screenshots.
  - Trades (a fake second engineer, then two real tabs over PeerJS): early accept refused; a late change cleared both
    accepts and restarted the wait; the swap after both accepted; "no room" refused with nothing moved; walking apart
    and closing the guest's tab both called it off with nothing moved.
  - Collision (rows of 10, walking 3 s): two touching pipe rows, steel beside irrigation, inserter beside chest, pole
    beside filter inserter all pass; a single pipe line and two touching furnace rows block; brushing a furnace corner
    and walking straight into a pole slide past.
  - Placement preview: solid and shaded (green), stippled with Shift held. Models of the reactor, coolant towers,
    greenhouse, medical lab, pipes, dam and big drill seen in screenshots.
  - An old save from the last commit loads: its one-tile big drill stays one tile (`compact`) and refunds one, the wider
    pole area reaches a machine it didn't before, medical "current" became a queue, explored area appears round the
    engineer and the buildings, and it saves and loads back.

- **The session before, in the browser pane (two tabs for co-op, an old build in a worktree for old saves):**
  - Steam chain on the new tier: pump → 2×1 boiler → 2×2 engines → generator pole → step-up station → step-up cable →
    small pole → assembler: 'working'. Without the cable the assembler has no power. One boiler at full fire gives
    exactly 1800 kW, shared by three engines at 67% (two engines' worth: the ratio holds).
  - Collision: walking between two touching rows of pipes, three rows of pipes, irrigation and steel pipe, pipe and
    chest, inserter and chest, pole and filter inserter, valve and pump all get through; a single pipe line can't be
    walked through; full machines stay solid. (Test: a row of 10 at z and z+1, start at z+1 left of them, run 3 s.)
  - Research queue: prerequisites queue first, moves stop at dependencies, removal takes dependents along. Real clicks
    in the tree (queue), wheel zoom, typing in search.
  - Real mouse: placing a 2-wide boiler (preview follows the mouse, arrows pairs at its ports), Shift+click planning a
    blueprint, Q emptying the hand, clicking a blueprint to build it, Shift+click selecting a boiler, choosing Fuel
    and Ctrl+click with coal (all 50 went into its fuel), dragging small poles (3 placed 5 apart, the 4th out of reach
    planned as a blueprint), clicking the engineer for details, C and a middle drag turning and tilting the camera.
  - Ctrl+click routing: coal → furnace fuel, ore → furnace input, packs → lab inputs, augments → lab augment slots,
    coal refused by a lab, wood → brazier fuel; Fuel mode refuses ore; Store mode spreads 108 plates over 16 chest slots
    (7 or 6 each).
  - Belt outputs: 33 items of a mixed belt went into a chest from the left lane; the chest's lid opens and its goods
    take the blended colour. Crafting station: fetched 20 plates one trip at a time, made 9 gears, idle without power.
  - Q over ore: no drills held → electric drill as a blueprint; burner drills held → burner drill; both → electric.
  - Saves: a world with everything new round-trips identically. A save made by the previous commit loads: its boiler
    and engines stay one tile (`compact`), keep powering the assembler through the small pole, and its current
    research becomes the queue; its world keeps generation v1.
  - Co-op: a guest's blueprint, queued research and belt output reach the host (and the host's taps rebuild), and the
    host sees what the guest holds.
  - Map: the close-up renders the scene around you; zoomed out, regions draw the whole charted world; after building,
    a map update costs about 0.02 ms. Ore: new worlds' starter patches are solid (65% → 100% of the disc), ragged edge
    tiles 21% → 8% of biome ore, with about the same ore overall (the threshold lift was measured for that).
  - Looks seen in screenshots: midnight, the brazier's light, alt-mode icons and bars at night; worked against fresh
    ore; stippled ghosts, previews, blueprints and see-through ground in depth mode with tunnel traffic below.

## Not verified (treat as risks)

- **The newest work by hand.** Everything this session was driven from the console and screenshots in an 800×600 pane:
  not felt by hand are the depth-mode pan and tilt, corner sliding while walking, the trade window's drag and drop with
  a real mouse, Shift-selecting many with real clicks, the research lines on a big screen, and the map's dimming.
- **Exploring huge worlds:** a radar explores out to 160 tiles, making chunks as the map needs them (two a frame while
  in view). Not measured on a slow machine, nor with many radars at once.
- **Co-op for the newest pieces:** guests' explored maps are their own after joining (they get the host's at join, then
  explore locally); a guest's Direct wiring cable and multi-select were not tried from a guest.

- **This session's work by hand at length.** Everything above was driven from code and screenshots in an 800×600
  pane. Not felt by hand: the free camera's feel (and how much it shimmers), the research window on a big screen, pole
  dragging while walking, belt outputs at scale, crafting stations in a real build.
- **Picking with the free camera at low tilt** (raycasts are right in principle; only checked at one angle).
- **The map close-up's cost** on a slow machine: it renders and reads back up to 256×256 every 0.12 s while shown.
- **Co-op for the newest pieces:** step-up cables strung by a guest, a guest's crafting station arm (guests only draw
  the host's), a guest Shift-selecting and using transfer modes.
- **Brighter ground everywhere:** fixing the terrain colour space changed every biome (and underground floors are
  darker). The new palettes were chosen with it fixed, but only the meadow, steppe, taiga and the far map were looked at.

- **The new systems by hand.** Most of this session's work was driven from the console and checked with screenshots:
  dragging a dam with the mouse, Shift-click copy/paste in the logistics window and network diagram, rebinding copy
  and paste to other mouse buttons, the depth-mode greenhouse roof, walking through greenhouse doors, cursors.
- **Balance** of everything new: hazard strengths, medical costs (deliberately huge), greenhouse yields, dam output,
  reactor heat rates, seed drop rates, biome ore densities.
- **Precision far out.** Three.js draws in 32-bit floats: at 30,000+ tiles from the origin models may wobble by a
  fraction of a pixel. Not seen in a screenshot at 33,000, but not watched in motion.
- **Long trips in huge worlds.** Every chunk you pass stays in memory (its deposits and trees), so crossing tens of
  thousands of tiles grows memory. Drawn chunks are dropped; generated ones are not.
- **Reactor towers short of water while the reactor is not** (separate water lines) was not set up; heating without
  any tower and breaking were.

- **Co-op on strict networks or VPNs** (e.g. Cloudflare WARP): direct WebRTC may fail and fall back to PeerJS's
  free relays, which are slow or down at times.
- **Where the co-op `Infinity` came from.** A host froze for good when PeerJS's binary packer hit `Infinity` in a
  message (right after a friend placed a burner drill). Messages are now JSON, so it can't crash, and the console
  warns `co-op: "<field>" was Infinity, sent as null` once. The source was never found: if that warning shows up,
  fix the field it names.
- **New systems by hand:** stringing cables with real clicks, the river ripple animation in motion, and the map
  with a real mouse were only driven from code or seen in still screenshots.
- **Held input feel.** Holding WASD and holding right-click to mine were driven from code, not real held
  keys. The tuning (speed 6.5, acceleration) has not been judged by hand.
- **Late game.** Research costs, precision thresholds (15 / 45 / 110) and the full 9-step conversation
  have not been played end to end.
- **Big factories.** Not profiled. Each entity is its own Three.js group; `pickTarget` raycasts every
  entity on the layer, and the alt-arrow, audio and co-op snapshot loops scan every entity.
- **Sound mix.** Played without errors but never listened to for balance. Vehicle engines and pumpjacks reuse the
  existing machine loops.
- **New systems by hand, at length.** Oil, vehicles, routes and factories were mostly driven from the console and
  checked with screenshots. Nobody has played from research to a working rail network yet, so costs, speeds and
  fuel use are first guesses.
- **Train deadlocks.** Signals are two-way blocks (there are no one-way or chain signals). Trains prefer to keep going
  forward, so loops work, but two trains meeting head-on on a single line wait for each other forever, as on a real
  single track. A train only turns round at a stop when no forward path exists.
- **Guests driving.** Vehicles move only on the host; a guest's own driving has the round-trip delay of the
  connection, and their vehicle glides between snapshots.
- **The newest systems by hand:** auto-craft during a real mouse drag, the sound changes by ear, Export to file from
  inside a running game, health and the pause menu in co-op, and night with many lamps on screen (each light is a
  quad in a buffer, so it should be cheap, but it hasn't been measured).
- **Balance:** the 24-minute day, lamp and brazier costs, augment recipes, deposit layer sizes and vehicle damage are
  first guesses.
- **Old worlds stay 96×96.** Only new worlds are big; an old save can't grow.

## Judgment calls, newest session (confirm with the owner)

- **Big mining drill numbers:** 2/s over four ore tiles (exactly four electric drills), less over fewer (rate and power
  both follow how many tiles have ore it can reach). Up to 400 kW against four drills' 360 kW, 3 augment slots against
  their 8, one output, and it costs four electric drills plus 20 steel, 5 advanced circuits and 10 gears (Deep drilling,
  blue science). So per tile it is never better on power or augments; what it buys is bedrock, one output and fewer
  inserters. Ore comes out at the front, on its left as it faces (a 2-wide front has no middle).
- **Old big drills stay one tile** (`compact`, like old boilers): they mine their one tile at a quarter of the rate
  (0.5/s, close to the old 0.6) and draw a quarter of the power.
- **Dams two wide:** 180 kW and one item per tile as before, so a span costs and gives twice what a one-wide dam did,
  and old one-wide dams keep their output. They need at least two tiles along.
- **Pole areas +2 everywhere**, stations included (transformer and step-up station: 7×7). Wire reach is unchanged, so
  pole drags are still spaced by wire reach (small poles 7 apart, 9×9 areas overlapping).
- **"Direct wiring"** is the name for cables to buildings: Power section, after Electric distribution, red and green
  packs (40). Small and medium poles and power lines can; generator poles, step-up and transformer stations can't. The
  power cable item does it (up to 12 tiles to the machine's nearest tile), one cable a machine; click the pole first.
- **Pipes from the start, only pipes:** underground pipes, pumps and valves stay in Fluid handling.
- **Radar:** no research (as in Factorio), 300 kW, 48 tiles live, explores outward 1.5 tiles a second to 160.
  An engineer sees (explores and keeps live) 40 tiles round them. Switching the map's view mode redraws every explored
  tile once from what is known now, rather than keeping a separate last-seen picture per mode. Vehicles show on the map
  only where it is live. Saves from before exploring count the area round the engineer and every building as seen.
- **Medical tree:** a node per level of each upgrade. To make it a tree, a few first levels now need others: Recovery
  needs Vitality 1, Stride needs Endurance 1, Long reach needs Dexterity 2, Photosynthetic skin needs Recovery 2, Adrenal
  gland needs Stride 1, Lead lungs needs Radiation resistance 1. Adaptations stay roots.
- **Tree lines:** many far-apart prerequisites are handled by merging every line into one bus beside the node it enters
  (and forking every line out of one trunk). Lines from another section are fainter; hovering lights the path and fades
  the rest. Line width stays the same at every zoom.
- **Camera keys:** `-` tilts lower, `[` higher, in six steps. The grid toggle is `N` (also in settings). The old free
  camera (C) and the `[` `]` orbit keys are gone; saved rebinds of those are simply dropped.
- **Selection vs. paste:** with a selection going, Shift + click keeps adding and removing even with settings copied;
  pasting onto it is the "paste to all" button on its bar. With no selection, Shift + click pastes as before. A plain
  click on empty ground (empty hand) also clears the selection.
- **Trading:** offers stay in their owner's inventory until the swap (no escrow), so cancelling can never lose items.
  The wait is 3 s, trades end beyond 16 tiles, and a guest silent for 5 s counts as gone (PeerJS can take a long time to
  notice a closed tab). Esc or ✕ cancels. Clicking yourself still shows your own details.
- **Placement preview:** the model tinted green or red (the bracket too), no tile highlight over it. The scene's two
  lights now also reach the interface layer, so the preview is shaded; every other interface overlay is unlit anyway.
- **Collision:** small things shrank (inserters, poles, lamps, valves, braziers, chests a little), trees too; one-tile
  machines are .43 instead of .46 a side, so touching ones still leave no gap. Sliding nudges up to .34 tiles sideways.

## Judgment calls, the session before last (confirm with the owner)

- **The low tier is "extra-low voltage"** (ELV), below low voltage, to fit "Low voltage / High voltage". Its pieces:
  generator pole, step-up station, step-up cable, all craftable from the start from wood, copper cable, plates and
  gears. Steam engines and diesel generators feed it; **solar panels still feed low voltage directly** (they aren't a
  "steam" generator, and making them need a step-up too felt like a tax).
- **Old boilers and engines stay one tile and keep their direct connection** (`compact`) instead of being regrown to
  2×1 / 2×2: that never overlaps anything and nothing loses power. A new one placed (or an old one picked up and put
  back) is big and feeds generator poles only. A toast-free change: their panels say so.
- **Steam engines join any touching steam neighbour; pipes join only at their two ends.** Boilers: water in and on at
  both short ends, steam out of both back edges. Big buildings turn (R) on their north-west tile when there's room.
- **Powered roads:** conduits are laid into existing road tiles with a conduit item (drag), one a tile; any road
  surface or path. A grid joins low voltage poles of one factory whose supply area covers it (or within 1 tile), feeds
  machines within 1 tile of it, and carries at most 3 MW to those machines (past that they slow down). Rails are
  unaffected. Numbers in `ROAD_POWER`.
- **Belt drags no longer turn belts** (Factorio 1.1's way): a belt goes down facing where R points, however you drag or
  walk. Q still copies a building's direction (the pipette is "the player specifying" it).
- **Shift + left click with an empty hand pastes when something is copied, and selects otherwise.** Esc clears the
  clipboard (and the selection), so you can always get to selecting. With a building in hand Shift plans a blueprint.
- **Store mode spreads a stack over the target's storage slots** (chests, depots, vehicle cargo); machines without
  storage don't offer it.
- **Player info** shows name, health, stamina, held item, what they're doing (walking, mining what, driving what),
  the factory they build for, well-fed time, hazard exposure, and the tools (research levels, shared by everyone).
  There is no armour or equipment grid in the game, so "equipment" is the held item and the tools.
- **Pipes are walkable between, not across:** a link is solid only along a plain straight run, so a single line still
  blocks while touching lines (which join each other everywhere) leave their gaps open. The engineer got smaller
  (radius .28 → .22) so every two-row layout of small things clears.
- **The map close-up lives in the big map and the minimap** (wheel zooms the minimap now). Only where the world is
  loaded (around you); elsewhere it says it is too far. "Pannable in every direction" in depth mode: the map pans as
  always, and a right-drag turns and tilts the close-up all the way round.
- **The free camera** is a second mode (C, also in settings), not a replacement: a middle-button drag turns and tilts
  it in flat and depth mode; a middle click without dragging is still the pipette. Going back snaps to the fixed view.
- **Dither:** ghosts, previews, blueprints, glass, roofs and the see-through ground are stippled. Interface overlays
  (tile highlights, supply areas, arrows) and water streaks stay blended: they are interface or effects, not things.
- **Ore stages are global** (one table for every ore, by wear plus layer). The "transitions" are the ground and piles
  changing over six stages and a shared edge blend between ore and ground (and between ores).
- **Fuller ore patches only in new worlds** (`world.gen.v` 2): older worlds' chunks are made again from their seed, and
  their buildings stand on that ore.
- **Crafting stations** take from chests (wooden and iron) of their factory within a 7×7 square, enough for two
  crafts at a time, and also accept inserters like any assembler.
- **Research clicks:** click queues (with prerequisites), Ctrl+click researches first, right-click unqueues. Moving an
  item stops at its prerequisites and dependents.

## Judgment calls, older (confirm with the owner)

- Barrels hold 10 (asked for) instead of 50. Old saves get five barrels for each filled one, and the barrel stack went
  from 10 to 50 so slots carry the same fluid. Filled barrels on belts keep one there and drop four beside it.
- Advanced fluids holds storage tanks and barreling, as asked; worlds that had Fluid handling keep those recipes
  (`S.research.extra`).
- Barreling stations no longer take a recipe: fill mode follows the pipe's fluid, empty mode takes any filled barrel.
- Tools are carried, not items, so they can't be lost; their tiers are research levels.
- Roads became one object per drag; old roads are grouped by connected tiles of one surface. Paths allow Ctrl-mining
  single tiles; roads and dams don't.
- Greenhouses keep their planting seeds (one per five tiles) forever; harvests add crops and spare seeds.
- The greenhouse roof is one glass pyramid over rectangular rooms, a small one per tile otherwise.
- Hazards never kill: radiation drains health only down to half.
- Uranium ore can be mined by hand (slowly, with a little radiation); only drills need acid.
- "Every biome livable": no hazard can kill or block; adaptations remove the slowdowns.
- Reactors produce steam (water in, steam out) to fit the existing steam chain, instead of Factorio's heat pipes.

## Known rough edges

- Belt lines rebuild from scratch on every belt change (fine at this map size; a big factory might want local rebuilds).
  A guest gets items per tile in snapshots, so their lines come apart and rejoin every 150 ms.
- Splitters are still this game's one-tile three-way splitter, not Factorio's two-wide one.
- A bus channel only fills when the bus ahead is backed up, so its first items arrive after the bus fills.
- Lane rules: inserters drop on the far lane, drills on the near lane, both on the right lane when facing along the belt.
- Light pools ignore walls (they're flat quads in a buffer), and underground layers get the same day and night as the surface.
- A guest's clock starts at the host's when they join and isn't corrected after, so a long session can drift the
  time of day a little between them.
- There are no accumulators, so solar is useless at night; keep steam or diesel running.
- Vehicles are the only thing that hurts. There are no enemies.
- Hand mining works at every deposit layer (just slower deeper down); only drills are limited by depth.

- In co-op, guests also simulate between host snapshots, so belts and machines can visibly "pop" when a
  correction lands (snapshots every 150 ms, a full one every 3 s).
- The building hand (`S.sel`, a reference into the inventory) and the drag cursor (a pending move
  between slots) are separate concepts. That's fine in play, but worth knowing before touching either.
- Furnace result slots show one slot per output type. A furnace that switched recipes can show two.
- Saves live in the browser unless exported. Five slots share the browser's ~5 MB of storage; a full browser says so on save.
- A harmless 404 for a CDN source map shows up in the console.
- Voltage tiers only decide what can connect; transformers don't limit how much power crosses.
- Number keys 1–0 always pick quickbar slots and can't be rebound.
- Pipe junctions and splits are just pipe layouts (pipes join every neighbour, drawn as T and cross pieces): there
  is no separate junction item. A network is one pool, so a split shares out by demand, not evenly.
- Every machine is one tile, so a refinery has four ports at most (crude in, three products out).
- Vehicles are one tile long (trains are one tile per car). Rails are four-way only: no diagonals.
- Crude oil wells deplete slowly to 20% yield; guests see a well's yield from the save they joined with.
- Fuel left in a vehicle's tank is lost when you pick the vehicle up.
- Creating a factory needs the Factory planning research. The original request was cut off at
  "To be able to create factories,", so that gate is a guess to confirm with the owner.

## Suggested next steps (in rough priority)

1. **Play the big-world systems by hand** (see "Not verified"): dam drags, copy/paste in the logistics window,
   greenhouse doors and roof, a long drive across a huge world (memory), and balance of everything new.
2. **Test co-op with a friend on another network** on a generated world. Two local tabs agree chunk for chunk.
3. **Performance pass:** (also: scene.js finds a chunk's buildings by scanning every building, `entsInChunk`;
   index buildings by chunk if big factories make chunk loads slow) build a 1000-plus entity factory and profile it. Likely wins are instancing belts and inserters,
   spatial lookup for picking, and limiting snapshot scans to changed entities (dirty flags).
4. **Accumulators**, now that solar stops at night.
5. **Blueprints.** Copying settings exists (copypaste.js); copying layouts doesn't.
6. **Enemies and turrets**, if the game should have pressure. Health exists now, but only vehicles hurt.
7. **Play the new systems end to end** from a fresh world: oil → engines → a truck route between two factories, then
   rails and a sea lane, and tune costs, speeds and fuel use.
8. **One-way and chain signals**, and double-headed trains, if rail networks get busy. Rivers could push boats along
   `world.flow`.
9. Sync the host's clock to guests in snapshots, so day and night can't drift.
10. Richer alien grammar (glyph parameters carrying meaning) and music.

## How the owner likes to work

- They want it to play and feel like Factorio, with real systems behind it, not mock-ups.
- They are blunt about jank: smoothness, readability and polish matter as much as features.
- **Don't push until they say "push".** Commit only when asked or when they say push. Pushing to `main` deploys live.
- They test on localhost and with a friend over the internet, and report bugs with console screenshots.
- They give fast visual feedback ("the river is ugly", "the colours look weird", "transitions should look smooth"):
  check screenshots of anything visual before calling it done. They like big, natural-looking features and smooth,
  gradual changes (biome borders, daylight).

## Testing tips

- Another chat may already run the dev server on port 5173 for this folder; just open http://localhost:5173.
- Check `git status` first: the last session's work may still be uncommitted, waiting for the owner's "push".
- Use port 5174 (`depthworks-alt` in `.claude/launch.json`) for your own server. It's a different origin from 5173,
  so its localStorage (and saves) are separate.
- The browser caches modules hard. After editing, refresh them with `fetch('/src/<file>.js', { cache: 'reload' })`
  for each changed file (and `/` for index.html), then reload, or the old code keeps running. Await all the fetches
  before reloading.
- To check an old save against new code: `git worktree add --detach <dir> HEAD~n`, serve it on another port, build
  something there, read `(await import('/src/save.js')).serialize()`, and `loadData(JSON.parse(text))` it here.
- To see night, set `depthworks.S.T` (T = 0 is hour `DAY.start`; an hour is `DAY.length / 24` seconds: `S.T = 14 * 60` is 22:00) and run a second.
- In the in-app browser pane, a hidden pane gets no animation frames. Taking a screenshot forces a frame, and
  `depthworks.run(seconds)` steps the simulation.
