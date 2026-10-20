# Plan: 0.6 beta, animals and weapons

**Built and shipped as 0.6 beta** (see HANDOFF.md). The two open questions were settled by the owner: animal
products other than meat and eggs have no recipes yet (crafting with them comes later), and old worlds get no pistol.

The next update. Agreed with the owner on 2026-10-20. Read [CLAUDE.md](CLAUDE.md) first (the wiki and the change log
go with every change), then [AGENTS.md](AGENTS.md) (how the code fits together) and [HANDOFF.md](HANDOFF.md).

## What it is, in one paragraph

Animals wander every biome: familiar farm animals in the gentle ones, strange creatures in the harsh ones. They graze,
rest, keep together in small groups, run from engineers, vehicles and gunfire, and keep away from busy factories. Every
engineer starts with a **pistol**; research and the factory add a **shotgun, bolt-action rifle, SMG and assault
rifle**, with ammo made from coal, stone, copper, iron and steel. Shot animals drop meat, wool, leather and the like.
Slow small animals can be caught by hand, sheep sheared and eggs collected without killing anything. Nothing attacks
the engineer: the game still has no enemies.

## Decisions already made (don't reopen them)

- **Guns are ordinary items held in the hand.** No weapon slot. With a gun in hand, **left-click fires at the
  cursor**; holding the button fires automatic guns. The quickbar is the way to switch.
- **Animals and guns ship together as 0.6, and 0.6 is the first beta.** One change log entry, with `stage: 'beta'`:
  the title screen's corner then reads "0.6 beta". The entry says so near the top (Depthworks moves from alpha to beta:
  the big systems are in, and from here the work is filling out, balancing and polishing). Every later entry keeps
  `'beta'` until the owner says otherwise. The wiki's main page and Changelog follow by themselves.
- **Everyone starts with a pistol** and some pistol rounds, added to the starter kit (iron plates, burner drill,
  stone furnace) in both `startingInventory` (state.js) and the newcomer kit in net.js.
- **Gunpowder is a crafting recipe, not smelting:** 2 coal + 1 stone gives 2 gunpowder, by hand or in an assembler.
  (A furnace fed stone makes bricks: furnaces pick their recipe from what goes in, so gunpowder can't be smelted from
  stone.) No new ore.
- **No enemies, nothing dangerous.** Bullets hit animals only: not buildings, vehicles or other engineers.
- **Out of scope for 0.6:** pens and ranching, dangerous animals, weapon upgrades (damage, reload, magazine), the
  tank's turret firing, birds flying overhead, creatures on layers −1 and −2. They are good later updates.

## Animals

### Who lives where

| Biome | Animals (farm animals in bold) |
|---|---|
| Temperate meadow | **cows**, **sheep**, **chickens**, rabbits |
| Old forest | **pigs**, deer, foxes |
| Dry steppe | **goats**, **sheep**, wild horses, marmots |
| Boreal taiga | **sheep**, moose, snow hares |
| Fen | **ducks**, frogs, herons |
| Glass desert | lizards, fennec foxes (out at night) |
| Frost waste | musk oxen, arctic foxes |
| Ashlands | ember beetles (glow at night), cinder moths |
| Glowcap hollows | glowing snails, spore moths |
| Singing steppe | crystal crabs, chime birds (ring when they take off) |
| Pripyatic wastes | wild horses, two-headed boar |

If that is too many for one go, build the system with a first set (cows, sheep, chickens, pigs, deer, rabbits, plus one
strange animal per harsh biome) and add the rest as data. Every animal is data, so more is cheap once it works.

### Data (data.js)

An `ANIMALS` table, one entry per animal: name, biomes and how common (weights per biome, like `BIOMES[].trees`), group
size, speed (walk and flee), health, how skittish (flee distance), active hours (`day`, `night` or both), size, colours
and model shape, a `light` for the glowing ones, and what it gives:

- **When killed** (`drops`): meat (cows, pigs, sheep, goats, deer, moose, oxen, boar, horses), leather (cows, deer,
  horses, oxen), feathers (chickens, ducks), and an oddity per strange animal (glowing chitin from ember beetles, crystal
  shell from crabs, and so on). Keep the number of new items small: generic `raw_meat` and `cooked_meat` (furnace) rather
  than one meat per animal.
- **Without killing:** sheep give `wool` when sheared (it grows back over a few minutes), chickens and ducks leave
  `egg`s now and then. Interact (hold right-click) to take them.
- **Caught by hand** (hold right-click, like fish): small slow animals only, `catch: true` (chickens, ducks, rabbits,
  frogs, snails, crabs).

New items get food values like fish (`food`, `heal`). Wool, leather, feathers and the oddities need a use, or they are
clutter: suggest a few recipes (wool and leather in vehicle seats or a warm-clothes adaptation shortcut, feathers in
shotgun shells or arrows, chitin in a lamp) and confirm with the owner before adding many.

### Behaviour (a new `src/animals.js`, modelled on `src/fish.js`)

- **Populations per chunk**, exactly like fish: every chunk of a biome has a capacity from its animals' weights and land
  area; a count that grows back logistically; live animals exist only near engineers (fish use `LIVE_R` chunks), and a
  chunk away from everyone keeps only its count and catches up on growth when someone returns. A huge world costs
  nothing for its far side. Save the counts (fish: `poolsToList` / `poolsFromList` in save.js).
- **Live animals** have position, heading, state (`graze`, `walk`, `rest`, `flee`, `sleep`), health, group id. They
  wander in their group, stop to graze, rest, sleep in their off hours (`daylight()` in state.js; never a timer).
- **They avoid** water (`isWater`), buildings (`world.ents`), roads (`roadAt`) and the edges of frames. Steer round,
  don't path-find: animals are cheap, simple and many.
- **They flee** from engineers within their flee distance, from moving vehicles, and from gunshots (a shot alerts every
  animal within some radius). Fleeing animals run away, then calm down.
- **Busy factories push wildlife out:** a chunk with many active buildings (`isActive` in sim.js) has its capacity cut,
  so the land round your base slowly empties and animals live further out.
- **Vehicles running into an animal kill it** (it drops as if shot), like they hurt engineers (`healthTick` in sim.js).
- **The host decides** (AGENTS.md rule 3): movement, deaths, drops and regrowth run on the host; guests get animals in
  snapshots (fish: `fishToList` / `fishFromList` in net.js, every few snapshots) and glide between them.
- **Budget:** cap live animals (say 120 across all engineers) and keep their update cheap: no per-animal scans of all
  buildings, only the tiles around it.

### Drawing (models.js, scene.js)

- Procedural low-poly models in `models.js` like everything else (`makeAnimal(type)`: body, head, legs, tail from a
  few boxes per shape: quadruped large and small, bird, bug, snail, crab). Toon materials (`M`), outlines come free.
- Walking legs and a bob, grazing head-down, sleeping lying down, fleeing at a gallop. Instancing is optional:
  measure first, at the live cap.
- Glowing animals get a `light` (AGENTS.md rule 19: the light buffer, never scene lights).
- Depth mode: animals live on the ground (layer 0): ghost them like other things above the viewed layer.

## Weapons

### The guns

| Weapon | Ammo | Fire | Damage | Range | Magazine | Notes | Unlocked by |
|---|---|---|---|---|---|---|---|
| Pistol | pistol rounds | semi-auto, ~3/s | 12 | 14 tiles | 10 | the starting gun | the start |
| Shotgun | shotgun shells | ~1/s | 8 pellets × 6 | 8 tiles | 6 | a spread (~12°) | Firearms |
| Bolt-action rifle | rifle rounds | ~1 per 0.8 s | 60 | 30 tiles | 5 | drops most animals in one shot | Firearms 2 |
| SMG | pistol rounds | automatic, ~10/s | 7 | 12 tiles | 30 | eats ammo | Firearms 2 |
| Assault rifle | rifle rounds | automatic, ~7/s | 14 | 22 tiles | 30 | the all-rounder | Firearms 3 |

Numbers are first guesses: tune them against animal health in play (a rabbit: one pistol shot; a cow: a few; a moose
or musk ox: a rifle, or many pistol shots). Reload is automatic when the magazine empties, from the inventory's ammo
(about 1 to 2.5 s by gun); a gun with no ammo clicks and says so. A gun's magazine count belongs to the engineer (per
gun type), not to the item stack.

### Recipes and research

- Gunpowder: 2 coal + 1 stone → 2 gunpowder (hand or assembler), from the start.
- Pistol rounds: 1 copper plate + 1 iron plate + 1 gunpowder → 10, from the start.
- Shotgun shells: 1 iron plate + 1 gunpowder + 1 wood → 6, Firearms.
- Rifle rounds: 1 copper plate + 1 steel + 2 gunpowder → 10, assembler only (`hand: false`), Firearms 2.
- Pistol: iron plates and gears, from the start. Shotgun: iron, gears, wood (Firearms). Bolt-action rifle: steel,
  gears, wood (Firearms 2). SMG: steel, gears, circuits (Firearms 2). Assault rifle: steel, gears, advanced circuits
  (Firearms 3).
- Technologies in the **Military** section (`TECH_CAT.military`, next to Tanks): **Firearms** (red packs, after
  Automation), **Firearms 2** (red and green, after Firearms, Steel processing and Logistic science), **Firearms 3**
  (red, green and blue, after Firearms 2 and Advanced electronics).

### Shooting (sim.js, main.js, net.js, scene.js, audio.js)

- Guns are items with a `weapon` entry (ammo type, rate, damage, pellets, spread, range, magazine, reload, auto).
- In `main.js`, left-click with a weapon in hand fires instead of placing (see how food and tools are handled in
  `paintAt` and the mouse handlers); holding fires again at the gun's rate for automatic guns. The aim is the cursor's
  ground point; the engineer turns to face it.
- Firing goes through `doAction({ a: 'shoot', ... })` (AGENTS.md rule 1), with the aim point. The host resolves hits
  (rule 3): a ray (or pellets in a spread) on the ground plane from the engineer toward the aim, out to the range,
  stopped by solid buildings and trees, hitting the first animal within its radius. The acting engineer is `actor`
  (rule 2); ammo comes from their inventory (`invGet` / `invAdd`).
- Feedback: a tracer line and a muzzle flash (interface overlay, `UI_LAYER`, rule 6), a small light flash, a hit puff
  on the animal, and a synthesised shot per gun in `audio.js` (no sound files). Everyone sees everyone's tracers:
  broadcast them like other effects.
- Shots alert animals nearby (they flee).
- The hand label (ui.js) shows the gun's magazine and the ammo carried; the cursor becomes a crosshair while a gun is
  held (see `setToolCursor`).

## Saves and co-op

- New state must save and sync (AGENTS.md rule 4): animal populations per chunk (like fish pools), each engineer's
  magazines, sheep's wool regrowth if it lives on live animals (or just roll it on catch-up).
- Live animals don't need saving: like fish, a chunk's count is enough, and live ones respawn near engineers on load.
- Old saves: nothing to convert. Starting players get the pistol; existing worlds don't (or add a one-time gift when an
  old save loads without any pistol: owner's call, ask).

## The wiki and the change log (CLAUDE.md)

- Change log: one **0.6 beta** entry at the top of `src/changelog.js` (`version: '0.6'`, `stage: 'beta'`), saying the
  game is now in beta and explaining animals, hunting, every gun, ammo and what old worlds get.
- Wiki, generated: every new item gets its page automatically from data.js. Add generated tables to `wiki/wiki.js`
  (`GEN.animals` from `ANIMALS`, `GEN.weapons` from the guns) and an **Animals** section on every generated biome page
  (`biomeBody` in wiki.js).
- Wiki, written: new articles **Animals** (who lives where, behaviour, what they give), **Weapons** (each gun, ammo,
  firing, the research), **Hunting** (or a section of Animals); update **Food** (meat, eggs), **Beginner's guide** (you
  start with a pistol), **Controls** (left-click fires with a gun in hand), **Interface**, **Biomes**, **Glossary**,
  **Tips and tricks**, and the main page's portals. Redirects in `ALIASES` (Guns, Firearms, Pistol rounds, Hunting,
  Meat, Wildlife, the animal names). Run the wiki check in CLAUDE.md.

## Suggested order of work

1. Data: `ANIMALS`, the new items, recipes, technologies, gun stats. Check the wiki's generated pages appear.
2. `animals.js`: populations, spawning near engineers, wandering, avoiding things, fleeing, day and night. Draw them
   with placeholder boxes first, then the real models.
3. Hand interactions: catching small animals, shearing, eggs (through `mineTargetAt` / `mineTick` in sim.js, like fish).
4. Guns: holding, firing, ammo and reload, hits, drops, tracers, sound, the crosshair. Then co-op.
5. Saves, co-op sync, vehicles hitting animals, factories pushing wildlife away.
6. Tuning, the wiki, the change log. Test in the browser (AGENTS.md "Run and test"; use port 5174, the
   `depthworks-alt` launch config). Clear test saves afterwards.

## How to test (console, see AGENTS.md)

- `depthworks.begin(true, true, 5, { size: 512, seed: 7 })` for a sandbox world; walk with
  `depthworks.run(seconds, { mx, mz })`; give items with `depthworks.give('shotgun', 1)`.
- Check: animals appear near you and only in their biomes; they flee; they stay off water, roads and buildings; a busy
  factory empties its surroundings; each gun's rate, damage, range, spread, reload; drops land in the inventory;
  catching, shearing and eggs; a vehicle hitting an animal; a save and load keeps populations; co-op with two tabs
  (host and guest both see the same animals, a guest's shot kills on the host).
- Screenshots of the models by day and night, and in depth mode.
