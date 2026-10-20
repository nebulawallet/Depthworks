# Depthworks

A pixelated 2.5D factory game in the spirit of Factorio. Walk an engineer around, mine by hand, craft,
automate with belts and inserters, power it all through pole networks, and research your way up. Then
build *down* into the rock and *up* onto hollow frames, and finally build a transmitter and hold a
conversation with something that only understands machines.

**Play in the browser:** https://nebulawallet.github.io/Depthworks/ (alone, or co-op with friends)

## Features

- **Big generated worlds:** 500 to 65536 tiles a side, made chunk by chunk as you explore, with world options for
  size, seed, biome size, water and ore. Eleven biomes, from meadows and taiga to the glass desert, the ashlands, the
  glowcap hollows, the singing steppe and the Pripyatic wastes, each with its own ground, ores, trees and crops, and
  the harsh ones with a hazard you adapt to over time.
- **Tools:** an axe and a pickaxe from the start, a shovel later; research makes them faster and lets them sweep an area.
- **Farming:** dig weedy patches for seeds, grow crops in greenhouse rooms on irrigation, press seeds into chlorophyll,
  and research body upgrades and adaptations in the medical lab with terrestrial science.
- **Big power:** dams across rivers, uranium reactors with coolant towers, steel pipe and high pressure pumps.
- **Copy and paste settings:** Shift + right-click copies a building's, belt line's, route's or stop's settings,
  Shift + left-click pastes them onto another.
- **Factorio-style engineer:** walk with WASD, mine ore, trees and rocks by holding right-click, and craft from your
  inventory (missing parts get crafted for you). Building has a reach limit.
- **Real inventories:** 80 slots for you, typed slots for every machine (fuel, input, result, ingredients,
  science packs, storage). Drag stacks between them.
- **Logistics:** two-lane belts in three speeds that compress, side-load onto the near lane and curve; underground
  belts, splitters with a filter per way, and angled belts (V) that carry items a layer up or down. Three-lane bus belts with filtered
  side channels. Belts run as lines (see `src/belts.js`): each line can be named, filtered and sped up with augments
  in the logistics window, which also draws a line's whole network. Inserters can pitch up or down a layer.
- **Augments:** speed, efficiency and productivity augments in five tiers for drills, furnaces, assemblers, labs and
  pumpjacks; depth augments let drills reach deeper deposit layers.
- **Deposits that go deeper:** ore never runs out; each tile works down through surface, depth (richer, slower) and
  an endless bedrock layer that only big drills or depth augments reach.
- **Sandbox:** a world with everything researched, free and instant crafting, and any item on request.
- **Day and night:** solar panels follow the sun; lamps, braziers and working machines light the dark.
- **Health and stamina:** vehicles hurt, food heals, Shift sprints.
- **Saves:** five slots, plus export to and load from files.
- **Power:** steam (2-wide boilers, 2×2 steam engines), diesel generators and solar panels on separate pole networks,
  with visible wires and supply areas. Generators feed ordinary poles; transformer stations lift low voltage to high
  voltage lines for long runs. Powered roads carry it under
  roads. Pole lines drag out spaced to their coverage.
- **Oil and fluids:** pipes that branch wherever they meet, underground pipes, pumps, valves and storage tanks, with
  less flow down long lines. Pumpjacks on crude oil feed refineries and chemical plants that make heavy fuel oil,
  diesel, gasoline and jet fuel. Barrels carry fluids on belts and in vehicles.
- **Vehicles:** a vehicle factory joins an engine (petrol, diesel, marine or turbine, each burning its own fuel) to
  a frame: car, truck, tank, cargo boat, locomotive or cargo wagon. Engine and frame decide speed and fuel use.
- **Transport networks:** customisable roads (width, lanes, markings, sidewalks, junctions with crossings), rails
  with junctions and block signals, and the sea. Trucks keep to roads, trains to rails, boats to water.
- **Depots and routes:** train stations, truck depots and ports store goods and fuel. One logistics window (L)
  sets up rail lines, truck routes and sea lanes: stops, what to load, when to leave, and loops.
- **Factories:** found several separate factories in one world; belts, pipes and power never cross between them,
  so goods move from one to another only by truck, train or ship.
- **Fish:** catch fish by hand or with a net on a boat. Overfished water recovers slowly.
- **Research:** 48 technologies (plus tool upgrades) across four science packs, in a left-to-right tree with a
  queue, plus "precision" tiers earned by keeping machinery busy.
- **Blueprints and hands:** plan buildings as stippled blueprints (Shift + place) and build them later; Q copies what
  is under the cursor (over ore: the best drill); Ctrl + click sends ingredients, fuel and augments where they belong,
  and Shift + click picks a transfer mode for a building. Crafting stations fetch their own ingredients from chests.
- **Depth:** seven buildable layers, from two rock layers below ground to frames stacked above it.
- **The signal:** the endgame is a nine-step conversation answered by arranging working machines.
- **Co-op:** free, peer to peer, with invite codes, nicknames and chat.
- **Look and sound:** crisp pixel 3D with outlines, smoke and particles; all sound synthesised in the browser.

## Controls

| Key | Action |
|---|---|
| WASD | Walk (hold Shift to sprint) |
| Left click | Build (drag to lay belts or lines of poles) · open a machine · click an engineer for details |
| Hold right click | Mine ore, trees, rocks and buildings |
| E | Inventory and crafting (closes an open machine) |
| T | Research |
| 1–0 | Quickbar |
| Q / R / Z / F | Copy hovered building (over ore: the best drill) · rotate · drop · hold to pick up |
| Ctrl + click | Move items in or out of a machine (ingredients to inputs, fuel to fuel) |
| Shift + click (building in hand) | Plan it as a blueprint |
| Shift + click (empty hand) | Select a building for a transfer mode (or paste copied settings) |
| Shift + right click | Copy settings |
| C · middle drag | Free camera on or off · turn and tilt it |
| Ctrl + hold right click | Take one tile off a greenhouse or a path |
| In inventories | Drag stacks · right-drag for half · Shift + click to send across |
| Tab | Depth mode (PgUp/PgDn or Shift+wheel for layers, [ ] to orbit, V to set inserter pitch) |
| B | Get in or out of a vehicle (WASD drives; A/D pick the branch on rails) |
| L | Logistics: routes for trains, trucks and boats |
| K / J | Factories window · switch the factory you build for |
| M | Map |
| Enter | Chat (co-op) |
| Alt | Toggle the small arrows, recipe icons and factory tags |
| H | Hide the interface |
| F1 or Esc | Menu: settings, controls and key bindings, how to play, save, export, quit (pauses solo games) |
| F2 | The wiki, in a window over the game (also on the title screen and in the menu) |

## Co-op

Free and peer to peer, so it works straight from GitHub Pages:

1. Everyone types a nickname on the title screen.
2. The host clicks **Host co-op** and picks a world. A 6-character invite code appears in the co-op panel (click it to copy).
3. Friends click **Join co-op**, type the code, and spawn next to the host with their own engineer and starter kit.

The host's browser runs the world, so the host keeps the tab open. It keeps running if they switch tabs.
Friends' inventories are kept in the host's save under their nickname, so they get their stuff back when they rejoin.
PeerJS's free public broker introduces the browsers and offers free relays for strict networks.

## Run it locally

The game uses ES modules, so it has to be served over HTTP. Opening `index.html` as a file won't work.

```bash
python -m http.server 5173
```

Then open http://localhost:5173. On Windows you can double-click `play.bat` instead.
The game autosaves to your browser every 30 seconds, into one of five slots (Load game on the title screen).
Browser storage can be cleared, so use **Export to file** in the menu now and then; **Load from file** brings a world
back, on any computer.

## Publishing on GitHub Pages

In the repository: **Settings → Pages → Build and deployment → Deploy from a branch → `main` / (root) → Save.**
There's no build step; every push to `main` updates the site.

## Docs

- [The wiki](wiki/) (`/wiki/` on the live site): a player's guide in the style of an encyclopedia. Its articles are
  written by hand in `wiki/articles/`; every item, building, technology and biome page and every table of numbers is
  built in the browser from `src/data.js`, so it follows the game when the data changes.
- [DESIGN.md](DESIGN.md): what the game is going for, precision tiers, the signal, rendering.
- [HANDOFF.md](HANDOFF.md): current status, what has and hasn't been verified, next steps.
- [AGENTS.md](AGENTS.md): how the code fits together and the rules for changing it.

## Code map

| File | What it holds |
|---|---|
| `src/data.js` | Items, machines, recipes, research tree, precision tiers, the alien script |
| `src/state.js` | Shared state, players and inventories, world generation, layer rules |
| `src/sim.js` | Inserters, machines and their augments, crafting stations, power and voltages, research and its queue, precision, crafting, the engineer and collision, building, slots and transfer modes |
| `src/blueprint.js` | Blueprints: planned buildings that never run until built |
| `src/research.js` | The research window: the tech tree and the queue |
| `src/belts.js` | Belts as lines of lanes, the nodes where lines end (splitters, bus channels), line settings and networks |
| `src/fluids.js` | Pipe and fluid networks, pumps, valves, the steam chain, fluid ports on machines |
| `src/transport.js` | Roads, rails and signals, vehicles and driving, path finding, depots, routes and schedules |
| `src/fish.js` | Fish, water bodies and their populations, fishing nets |
| `src/logistics.js` | The logistics window: one route editor for rail, road and sea, plus belt lines and their network diagram |
| `src/map.js` | Minimap and big map with its views, markers and the factory assign tool; detail by zoom and a rendered close-up |
| `src/net.js` | Co-op: invite codes, host-authoritative sync, chat (PeerJS / WebRTC) |
| `src/save.js` | Save / load, and the entity format shared with co-op sync |
| `src/scene.js` | Pixel-snapped camera (fixed or free), outline post pass, night, terrain, ore piles and ground cover, particles, picking, arrows, alt mode |
| `src/models.js` | Toon-shaded procedural models with baked occlusion, stippled see-through, the engineer, inserter IK |
| `src/ui.js` | HUD, hotbar, inventories and drag and drop, crafting, research, machine windows, chat, goals |
| `src/signal.js` | What the transmitter hears, the conversation, glyph animations |
| `src/audio.js` | Synthesised sound effects and ambient machine loops (Web Audio, no sample files) |
| `src/icons.js` | Procedural pixel icons |
| `src/main.js` | Boot, title screen and lobby, input, game loop |

In the browser console, `depthworks` exposes the state plus `run(seconds)` and `give(item, n)` for testing.
