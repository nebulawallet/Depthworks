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

## Status

| Area | State |
|---|---|
| Core loop (mine → smelt → craft → automate → research) | Done, played through in code-driven tests |
| Engineer, Factorio controls, reach, collision | Done. Hand mining shows one counting popup per haul ("+3 Iron ore (47)") |
| Inventories | Real slots (80 for the player, 16/32 for chests), drag and drop, typed machine slots. Clicking any usable item (building, road, vehicle, cable, signal, food) in the inventory puts it in the hand |
| Building | Placing something you've run out of crafts it (and its parts) if you have the materials; the spot waits as a pale square and builds itself when the craft lands, so belt drags keep going |
| Logistics | Two-lane belts in 3 tiers (4 items per lane per tile, side-loads onto the near lane, curves keep lanes), undergrounds, splitters with per-way filters, lifts. Simulated as lines (`belts.js`). Three-lane bus belts with filtered side channels and a bus underground. Belt lines tab in the logistics window: names, filters, speed augments, network diagram |
| Augments | Speed / efficiency / productivity in 5 tiers (10/15/25/35/50%), depth (2 tiers) for drills. 2 slots by default, 3 on assembler II, refinery, big drill, 4 on the vehicle factory |
| Deposits | Never run out: surface (4× the old amount), depth (10×, slower, 1 in 6 cycles gives two), endless bedrock. Burner drill reaches surface, electric drill depth, big drill bedrock |
| Sandbox | Title screen: everything researched, crafting free and instant, an Everything tab handing out any item |
| Health and stamina | 100 health: moving vehicles hurt (9 per tile/s of speed), it regenerates after 5 s (faster well fed), food heals, death respawns you at the landing site with your inventory. Hold Shift to sprint (x1.55) on stamina |
| Power | Solar, small/medium poles, separate networks. Steam chain (water pump → boilers → steam engines, Factorio's 1:20:40, load-based), high voltage power lines (21×21), transformer stations, hand-strung power and transformer cables, brownouts, flashing plugs on unpowered machines |
| World | Generated from a seed, 500 to 65536 tiles a side (2048 by default), in 32×32 chunks made when first needed (worldgen.js). World options on the new game screen: size, seed, biome size, water, ore. Saves keep only the seed, options and edits. Worlds from before chunks load as they were (96 tiles) and gain weedy patches |
| Rendering | Chunks around the camera only (terrain.js): a coarse picture at once, full detail painted a few tiles a frame, texture detail by zoom (16/8/4 texels a tile), flora hidden zoomed out, models only for buildings in shown chunks |
| Biomes | 11, defined in data (BIOMES): climate, ground, ores and patterns, trees, flora, weedy patches, oil, three crops. Biomes are large (climate scale 520 tiles by default) and ore patches big (starter patches 1.7× the old size). The landing site has livable biomes all around. Borders wander in a smooth warp, and each tile's ground colour is a 13-tile blur of the biomes actually around it (groundColors), on the ground and the map alike. Hazards in six (heat, cold, fumes, spores, resonance, radiation): exposure builds and fades, never kills, adaptations cut it |
| Water | Ocean rim at the world's edge and low land, lake blobs, rivers along noise channels in some regions, each river tile with a flow direction. Nothing within 44 tiles of the landing site. No walking or building on water except pumps and dams |
| Multi-tile objects | Greenhouse rooms and dams are one object over many tiles (`foot`, multi.js); touching ones join. Mining takes the whole; Ctrl + mining takes one tile where data allows (greenhouses, paths), and a cut room splits in two. Roads: each drag is one road, mined whole |
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
| Map | Minimap, big map (M) with zoom/pan, markers, labelled areas, terrain/resources/production/power views |
| Interface | One compact quickbar row with a 1/2/3 switch (X cycles), health and stamina bars beside it, Hide UI (H). Pause menu (F1, or Esc once nothing else is open): resume, settings (volume, building icons, goals list, minimap), controls and key rebinding, how to play, save, export, save and quit. It pauses solo games. Rendering is fixed at the normal pixel size |
| Research | 38 techs, 4 science pack tiers, gated by precision for depth |
| Depth | Layers −2..4, hollow frames, ghosting, lazily painted underground floors |
| Alien conversation | 9 scripted exchanges plus ambient replies, glyph animations, clarity that grows |
| Look | Pixel-snapped camera, toon shading, outline post pass, ore piles, trees/rocks, particles |
| Sound | All synthesised (Web Audio), proximity machine loops, volume slider. A high-shelf cut above 5 kHz on everything; labs and transmitters hum low instead of the old high beating tones |
| Co-op | Peer-to-peer (PeerJS), invite codes, nicknames, chat, host-authoritative sync. Played by the owner with a friend on another network. Messages travel as JSON text (see below) |
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

## Not verified (treat as risks)

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

## Judgment calls this session (confirm with the owner)

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

1. **Turn on GitHub Pages and test co-op with a friend on another network.** This is the biggest unknown.
2. **Performance pass:** build a 1000-plus entity factory and profile it. Likely wins are instancing belts and inserters,
   spatial lookup for picking, and limiting snapshot scans to changed entities (dirty flags).
3. **Accumulators**, now that solar stops at night.
4. **Blueprints / copy-paste.**
5. **Enemies and turrets**, if the game should have pressure. Health exists now, but only vehicles hurt.
6. **Play the new systems end to end** from a fresh world: oil → engines → a truck route between two factories, then
   rails and a sea lane, and tune costs, speeds and fuel use.
7. **One-way and chain signals**, and double-headed trains, if rail networks get busy. Rivers could push boats along
   `world.flow`.
8. Sync the host's clock to guests in snapshots, so day and night can't drift.
9. Richer alien grammar (glyph parameters carrying meaning) and music.

## How the owner likes to work

- They want it to play and feel like Factorio, with real systems behind it, not mock-ups.
- They are blunt about jank: smoothness, readability and polish matter as much as features.
- **Don't push until they say "push".** Commit only when asked or when they say push. Pushing to `main` deploys live.
- They test on localhost and with a friend over the internet, and report bugs with console screenshots.
- They give fast visual feedback ("the river is ugly"): check screenshots of anything visual before calling it done.

## Testing tips

- Another chat may already run the dev server on port 5173 for this folder; just open http://localhost:5173.
- Check `git status` first: the last session's work may still be uncommitted, waiting for the owner's "push".
- Use port 5174 (`depthworks-alt` in `.claude/launch.json`) for your own server. It's a different origin from 5173,
  so its localStorage (and saves) are separate.
- The browser caches modules hard. After editing, refresh them with `fetch('/src/<file>.js', { cache: 'reload' })`
  for each changed file, then reload, or the old code keeps running. Await all the fetches before reloading.
- To see night, set `depthworks.S.T` (T = 0 is hour `DAY.start`; an hour is `DAY.length / 24` seconds: `S.T = 14 * 60` is 22:00) and run a second.
- In the in-app browser pane, a hidden pane gets no animation frames. Taking a screenshot forces a frame, and
  `depthworks.run(seconds)` steps the simulation.
