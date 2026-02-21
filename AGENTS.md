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
    └── Starts map-watcher on /public/assets/ for hot-reload

[Movement module — /scripts/movement.js]
    └── Applies move directions with grid bounds + collision checks

[Actions module — /scripts/actions.js]
    ├── Stores action library (map tasks)
    ├── Assigns requester player (A) + actor player (B)
    ├── Validates interact at target position
    └── Runs action completion timer and rotates to next task

[Map watcher — /scripts/map-watcher.js]
    └── Watches /public/assets/ for .tmj changes, calls back with filename

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
| `move` | `dir: "up"\|"down"\|"left"\|"right"\|"up-left"\|"up-right"\|"down-left"\|"down-right"` | Move player one grid step |
| `interact` | _(none)_ | Attempt interaction for current assigned action |

### Server → Client (broadcast to all)

| `type` | Fields | Description |
|--------|--------|-------------|
| `init` | `id, name, character, color, gridX, gridY, gridSize, gridCols, gridRows` | Sent once after `join` to the joining client with assigned character/color |
| `state` | `players: [{id, name, character, color, gridX, gridY}]` | Full player state, sent after every change |
| `action_update` | `action: {id,key,title,description,targetName,gridX,gridY,durationMs,status,requesterId,actorId,startedAt}\|null, serverTime` | Current cooperative action state (or null if unavailable) |
| `action_result` | `actionId, success, message` | Result/feedback after interact attempts or completion |
| `reload_map` | `file: string` | Sent when a .tmj file changes; display restarts its Phaser scene |

---

## Grid

- Tile size: `32px`
- Grid dimensions: `20 × 15` tiles
- Movement is discrete — players snap to grid cells, no interpolation

---

## Conventions

- Game state lives entirely on the server (`scripts/websocket.js`). Clients are dumb input/output terminals.
- Movement/collision rules live in `scripts/movement.js` and are applied server-side.
- Action assignment/timer/validation live in `scripts/actions.js` and are applied server-side.
- The display (`server.html`) only renders what it receives — no local simulation.
- Players choose a name and character (red/blue/white/yellow) in the lobby before connecting. Server honours the preference if the character is free, otherwise assigns the first available one.
- Max 4 players (limited by color array).

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
