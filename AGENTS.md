# AGENTS.md — Cacaotique

This file provides context for AI agents (Claude, Codex, etc.) working on this project.
**Keep this file up to date whenever the architecture, endpoints, or conventions change.**

---

## Project Summary

Cacaotique is a chaotic co-op farming/cooking game for a 6h game jam.
- 2–4 players connect via mobile browser on local WiFi
- A shared display screen (TV/PC) runs the game view
- Players control characters from their phones using a D-pad

---

## Architecture

```
[Node.js server — server.js]
    ├── Serves static files from /public via express
    ├── Creates shared HTTP server
    └── Delegates WebSocket setup to /scripts/websocket.js

[WebSocket module — /scripts/websocket.js]
    ├── Opens a WebSocket server on the same HTTP port
    ├── Tracks game state (player positions, etc.)
    ├── Receives input messages from mobile clients
    ├── Broadcasts full game state to all connected clients
    ├── Coordinates action assignments/progress with /scripts/actions.js
    ├── Loads collision/nav data from /scripts/map-nav.js
    └── Starts map-watcher on /public/assets/ for hot-reload

[Movement module — /scripts/movement.js]
    └── Applies move directions with grid bounds + collision checks

[Actions module — /scripts/actions.js]
    ├── Stores contextual station actions (seed/well/water/harvest)
    ├── Detects available action per player from map proximity
    ├── Starts per-player action progress on interact
    └── Broadcasts per-player pending/in-progress action state

[Map watcher — /scripts/map-watcher.js]
    └── Watches /public/assets/ for .tmj changes, calls back with filename

[Map nav loader — /scripts/map-nav.js]
    └── Reads basemap2.tmj and builds blocked grid cells for server collisions

[Display — /public/server.html]
    └── Phaser 3 game view: loads Tiled map, renders players, hot-reloads on reload_map

[Mobile controller — /public/index.html  (root)]
    └── Joystick HTML page, connects via WS, sends input, shows player color
```

## Endpoints

| URL | Purpose |
|-----|---------|
| `http://<LAN-IP>:3000/` | Mobile controller (players open this on their phones) |
| `http://localhost:3000/server.html` | Game display (shown on TV/shared screen) |
| `http://localhost:3000/connect-info` | Returns mobile URL + QR code payload for display overlay |

---

## File Map

```
gorockit-jam/
├── server.js                  # Node.js express server + HTTP bootstrap
├── scripts/
│   ├── dev.js                 # Dev startup script (prints LAN URLs, starts server)
│   ├── actions.js             # Action assignment + interaction/timer logic
│   ├── map-nav.js             # TMJ parser for blocked cells and grid dimensions
│   ├── movement.js            # Movement rules (directions, bounds, collisions)
│   ├── websocket.js           # WebSocket setup + game state logic + map hot-reload
│   └── map-watcher.js         # fs.watch wrapper for .tmj files in public/assets/
├── public/
│   ├── index.html             # Mobile controller (D-pad)
│   ├── server.html            # Game display (Phaser 3 + Tiled map)
│   └── assets/
│       ├── map.tmj            # Tiled map export (JSON) — artist edits this
│       └── tileset.png        # Tileset image referenced by the map
├── package.json
├── POC.md                     # Original game design document
└── AGENTS.md                  # This file
```

---

## WebSocket Protocol

All messages are JSON.

### Client → Server

| `type` | Fields | Description |
|--------|--------|-------------|
| `join` | `name: string, character: "red"\|"blue"\|"white"\|"yellow"` | First message after connect; registers the player with name + preferred character |
| `move` | `dir: "up"\|"down"\|"left"\|"right"\|"up-left"\|"up-right"\|"down-left"\|"down-right"` | Set player velocity in given direction (sent once on direction change) |
| `stop` | _(none)_ | Zero player velocity (sent on joystick release) |
| `interact` | `key: "plant_seed"\|"fetch_seed"\|"fetch_water"\|"water_plants"\|"talk_bees"\|"harvest_cacao"\|"burn_tree"\|"pet_llama"\|"feed_rabbit"\|"harvest_choco"` | Attempt the selected action button |
| `interact` | `key: "plant_seed"\|"fetch_seed"\|"fetch_water"\|"water_plants"\|"talk_bees"\|"harvest_cacao"\|"burn_tree"\|"pet_llama"\|"feed_rabbit"\|"greet_player"` | Attempt the selected action button |

### Server → Client (broadcast to all)

| `type` | Fields | Description |
|--------|--------|-------------|
| `init` | `id, name, character, color, x, y, gridX, gridY, gridSize, gridCols, gridRows` | Sent once after `join` to the joining client with assigned character/color |
| `state` | `players: [{id, name, character, color, x, y, gridX, gridY}]` | Full player state, broadcast by game loop (~20fps) while any player is moving |
| `action_update` | `actionsByPlayer: { [playerId]: { plant_seed, fetch_seed, fetch_water, water_plants, talk_bees, harvest_cacao, burn_tree, pet_llama, feed_rabbit, harvest_choco, activeAction } }, inProgressByPlayer: { [playerId]: action }, hasWaterByPlayer: { [playerId]: boolean }, seedsByPlayer: { [playerId]: number }, cacaoByPlayer: { [playerId]: number }, moneyByPlayer: { [playerId]: number }, plants: [{id,gridX,gridY,stage}], beeFlights: [{id,targetGridX,targetGridY,startedAt,durationMs}], fireBursts: [{id,targetGridX,targetGridY,startedAt,durationMs}], rabbitCacaoTiles: [{id,targetGridX,targetGridY}], serverTime` | Per-player action buttons state + active progress + world farming state. Each action entry includes `canInteract`, `isVisible`, and `blockedReason`. |
| `action_result` | `actionId, actionKey, success, message, playerId, targetGridX, targetGridY, hasWater, seeds, cacao, money` | Result/feedback after interact attempts or completion (includes concerned player inventory) |
| `action_update` | `actionsByPlayer: { [playerId]: { plant_seed, fetch_seed, fetch_water, water_plants, talk_bees, harvest_cacao, burn_tree, pet_llama, feed_rabbit, activeAction } }, inProgressByPlayer: { [playerId]: action }, hasWaterByPlayer: { [playerId]: boolean }, seedsByPlayer: { [playerId]: number }, cacaoByPlayer: { [playerId]: number }, plants: [{id,gridX,gridY,stage}], beeFlights: [{id,targetGridX,targetGridY,startedAt,durationMs}], fireBursts: [{id,targetGridX,targetGridY,startedAt,durationMs}], rabbitCacaoTiles: [{id,targetGridX,targetGridY}], serverTime` | Per-player action buttons state + active progress + world farming state. Each action entry includes `canInteract`, `isVisible`, and `blockedReason`. |
| `action_result` | `actionId, success, message, playerId, hasWater, seeds, cacao, sfxFile?, sfxTargetIds?` | Result/feedback after interact attempts or completion. `sfxFile` and `sfxTargetIds` are present on successful `greet_player` — each client plays the sound if its id is in `sfxTargetIds`. |
| `reload_map` | `file: string` | Sent when a .tmj file changes; display restarts its Phaser scene |

---

## Grid

- Tile size: `32px`
- Grid dimensions: loaded from `public/assets/basemap2.tmj` (currently `30 × 20`)
- Movement is continuous — players have pixel positions (`x`, `y`) and velocity; `gridX`/`gridY` are derived for the action system
- Player speed: `96 px/s` (3 tiles/s); hitbox radius: `10 px`
- Collision is axis-separated (wall sliding)

---

## Conventions

- Game state lives entirely on the server (`scripts/websocket.js`). Clients are dumb input/output terminals.
- Movement/collision rules live in `scripts/movement.js` and are applied server-side.
- Contextual action detection/timer/validation live in `scripts/actions.js` and are applied server-side.
- The display (`server.html`) only renders what it receives — no local simulation.
- Players choose a name and character (red/blue/white/yellow) in the lobby before connecting. Server honours the preference if the character is free, otherwise assigns the first available one.
- Max 4 players (limited by color array).

## Action Flow (Current)

- Mobile shows 7 explicit buttons (`plant_seed`, `fetch_seed`, `fetch_water`, `water_plants`, `talk_bees`, `harvest_cacao`, `burn_tree`) that are disabled when conditions are not met.
- Each player starts with `1` seed.
- `fetch_seed` around the house (`x:3..5`, `y:1..3` blocked footprint) converts `1` cacao into `3` seeds.
- Brown zone (`x:2..10`, `y:8..14`) enables planting; planting creates a plant at player position.
- Planting consumes one seed.
- Watering requires both proximity to a stage-0 plant and player water state.
- Talking to bees requires proximity to the hive and at least one stage-1 plant; bees fly from hive to plant then back, and plant becomes stage-2.
- Harvesting cacao requires proximity to a stage-2 plant and turns it into stage-3.
- Harvesting increments per-player cacao inventory.
- Burning requires proximity to a stage-3 plant and triggers fire particles.
- Extinguishing a burning tree removes it from the tile.
- Llama interactions use fixed cells (`23,15` and `23,16`).
- Rabbit interactions use fixed cells (`20,14`, `21,15`, `22,14`).
- `interact` starts a 3s progress for that player; moving out of valid range cancels progress.
- Active action progress is rendered above the corresponding player on display.

---

## What's Not Built Yet

- Items / inventory
- Rhythm timing windows
- Chaos events
- Scoring / timer
- Art / sprites (currently plain colored circles)

---

## Agent Directives

- **When adding a new message type**, document it in the WebSocket Protocol table above.
- **When adding a new file**, add it to the File Map.
- **When changing an endpoint or URL**, update the Endpoints table and `scripts/dev.js`.
- **When changing the grid config**, update the Grid section (it is currently duplicated in `server.js` and `server.html` — keep them in sync or refactor to a shared config).
- **When a major system is implemented** (stations, items, rhythm, etc.), add a section describing its state shape and protocol messages.
- **Do not add features beyond what is scoped** unless explicitly asked — this is a 6h jam build.
