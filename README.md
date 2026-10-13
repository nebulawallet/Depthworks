# Depthworks

A pixelated 2.5D factory game in the spirit of Factorio. Walk an engineer around, mine by hand, craft,
automate with belts and inserters, power it all through pole networks, and research your way up. Then
build *down* into the rock and *up* onto hollow frames, and finally build a transmitter and hold a
conversation with something that only understands machines.

**Play in the browser:** https://nebulawallet.github.io/Depthworks/ (alone, or co-op with friends)

## Features

- **Factorio-style engineer:** walk with WASD, mine ore, trees and rocks by holding right-click, and craft from your
  inventory (missing parts get crafted for you). Building has a reach limit.
- **Real inventories:** 80 slots for you, typed slots for every machine (fuel, input, result, ingredients,
  science packs, storage). Drag stacks between them.
- **Logistics:** belts in three speeds that compress, side-load and curve; underground belts, splitters,
  and lifts that move items between layers. Inserters can pitch up or down a layer.
- **Power:** coal generators and solar panels on separate pole networks, with visible wires and supply areas.
- **Research:** 21 technologies across four science packs, plus "precision" tiers earned by keeping machinery busy.
- **Depth:** seven buildable layers, from two rock layers below ground to frames stacked above it.
- **The signal:** the endgame is a nine-step conversation answered by arranging working machines.
- **Co-op:** free, peer to peer, with invite codes, nicknames and chat.
- **Look and sound:** crisp pixel 3D with outlines, smoke and particles; all sound synthesised in the browser.

## Controls

| Key | Action |
|---|---|
| WASD | Walk |
| Left click | Build (drag to lay belts) · open a machine |
| Hold right click | Mine ore, trees, rocks and buildings |
| E | Inventory and crafting (closes an open machine) |
| T | Research |
| 1–0 | Quickbar |
| Q / R / Z / F | Copy hovered building · rotate · drop · hold to pick up |
| Ctrl + click | Move items in or out of a machine |
| In inventories | Drag stacks · right-drag for half · Shift + click to send across |
| Tab | Depth mode (PgUp/PgDn or Shift+wheel for layers, [ ] to orbit, V to set inserter pitch) |
| Enter | Chat (co-op) |
| Alt | Toggle the small arrows and recipe icons |
| H | Help |

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
The game autosaves to your browser every 30 seconds.

## Publishing on GitHub Pages

In the repository: **Settings → Pages → Build and deployment → Deploy from a branch → `main` / (root) → Save.**
There's no build step; every push to `main` updates the site.

## Docs

- [DESIGN.md](DESIGN.md): what the game is going for, precision tiers, the signal, rendering.
- [HANDOFF.md](HANDOFF.md): current status, what has and hasn't been verified, next steps.
- [AGENTS.md](AGENTS.md): how the code fits together and the rules for changing it.

## Code map

| File | What it holds |
|---|---|
| `src/data.js` | Items, machines, recipes, research tree, precision tiers, the alien script |
| `src/state.js` | Shared state, players and inventories, world generation, layer rules |
| `src/sim.js` | Belts, inserters, machines, power, research, precision, crafting, the engineer, building, slots |
| `src/net.js` | Co-op: invite codes, host-authoritative sync, chat (PeerJS / WebRTC) |
| `src/save.js` | Save / load, and the entity format shared with co-op sync |
| `src/scene.js` | Pixel-snapped camera, outline post pass, terrain, ore piles and ground cover, particles, picking, arrows |
| `src/models.js` | Toon-shaded procedural models with baked occlusion, the engineer, inserter IK |
| `src/ui.js` | HUD, hotbar, inventories and drag and drop, crafting, research, machine windows, chat, goals |
| `src/signal.js` | What the transmitter hears, the conversation, glyph animations |
| `src/audio.js` | Synthesised sound effects and ambient machine loops (Web Audio, no sample files) |
| `src/icons.js` | Procedural pixel icons |
| `src/main.js` | Boot, title screen and lobby, input, game loop |

In the browser console, `depthworks` exposes the state plus `run(seconds)` and `give(item, n)` for testing.
