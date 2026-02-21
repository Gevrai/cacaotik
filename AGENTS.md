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
    └── Broadcasts full game state to all connected clients

[Display — /public/server.html]
    └── Canvas-based game view, connects via WS, renders state

[Mobile controller — /public/index.html  (root)]
    └── D-pad HTML page, connects via WS, sends input, shows player color
```

## Endpoints

| URL | Purpose |
|-----|---------|
| `http://<LAN-IP>:3000/` | Mobile controller (players open this on their phones) |
| `http://localhost:3000/server.html` | Game display (shown on TV/shared screen) |

---

## File Map

```
gorockit-jam/
├── server.js                  # Node.js express server + HTTP bootstrap
├── scripts/
│   ├── dev.js                 # Dev startup script (prints LAN URLs, starts server)
│   └── websocket.js           # WebSocket setup + game state logic
├── public/
│   ├── index.html             # Mobile controller (D-pad)
│   └── server.html            # Game display (canvas)
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
| `move` | `dir: "up"\|"down"\|"left"\|"right"` | Move player one grid step |

### Server → Client (broadcast to all)

| `type` | Fields | Description |
|--------|--------|-------------|
| `init` | `id, color, gridX, gridY, gridSize, gridCols, gridRows` | Sent once on connection to the connecting client |
| `state` | `players: [{id, color, gridX, gridY}]` | Full player state, sent after every change |

---

## Grid

- Tile size: `32px`
- Grid dimensions: `20 × 15` tiles
- Movement is discrete — players snap to grid cells, no interpolation

---

## Conventions

- Game state lives entirely on the server (`scripts/websocket.js`). Clients are dumb input/output terminals.
- The display (`server.html`) only renders what it receives — no local simulation.
- Player colors are assigned server-side in order: red, blue, green, orange.
- Max 4 players (limited by color array).

---

## What's Not Built Yet

- Interact action / stations (harvest, break pod, etc.)
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
