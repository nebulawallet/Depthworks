# Depthworks

A pixelated 2.5D factory game in the spirit of Factorio. You walk an engineer around, mine by hand,
craft, automate, research, build up onto hollow frames and down into the rock. Then you build a
transmitter and hold a conversation with something that only understands machines.

Controls follow Factorio: WASD walk, hold right-click to mine, E inventory, Q pipette, R rotate,
Z drop, F pick up, Ctrl+click to transfer, T research. Tab switches to depth mode for layers.

## Play

Play in the browser: https://nebulawallet.github.io/Depthworks/

## Co-op

Free and peer to peer, so it works straight from GitHub Pages:

1. Everyone types a nickname on the title screen.
2. The host clicks **Host co-op** and picks a world. A 6-character invite code appears in the co-op panel (click it to copy).
3. Friends click **Join co-op**, type the code, and spawn next to the host with their own engineer and inventory.

Press **Enter** to chat. The host's browser runs the world, so the host keeps their tab open (it keeps running in the
background if they switch tabs). Friends' inventories are kept in the host's save under their nickname, so they get
their stuff back when they rejoin. PeerJS's free public broker introduces the browsers and offers free relays for strict networks.

## Run it locally

The game uses ES modules, so it has to be served over HTTP. Opening `index.html` as a file won't work.

```bash
python -m http.server 5173
```

Then open http://localhost:5173. On Windows you can double-click `play.bat` instead.
The game autosaves to your browser every 30 seconds.

## Code map

| File | What it holds |
|---|---|
| `src/data.js` | Items, machines, recipes, research tree, precision tiers, the alien script |
| `src/state.js` | Shared state, ore generation, inventory, layer rules |
| `src/sim.js` | Belts, inserters, machines, power, research, precision, crafting, building |
| `src/models.js` | Toon-shaded procedural models with baked occlusion, the engineer, inserter IK |
| `src/scene.js` | Pixel-snapped camera, outline post pass, terrain, ore piles and ground cover, particles, picking, selection |
| `src/signal.js` | What the transmitter hears, the conversation, glyph animations |
| `src/ui.js` | HUD, hotbar, inventory/crafting, research, machine panels, goals |
| `src/save.js` | Save / load, and the entity format shared with co-op sync |
| `src/net.js` | Co-op: invite codes, host-authoritative sync, chat (PeerJS / WebRTC) |
| `src/icons.js` | Procedural pixel icons |
| `src/audio.js` | Synthesised sound effects and ambient machine loops (Web Audio, no sample files) |
| `src/main.js` | Input, game loop, title screen |

In the browser console, `depthworks` exposes the state plus `run(seconds)` and `give(item, n)` for testing.
