# Cacaotique — Game Design Document

## Overview

**Genre:** Chaotic co-op farming/cooking
**Players:** 2–4
**Platform:** Server display (PC/TV) + mobile clients (browser)
**Session length:** ~5–10 min per round
**Jam duration:** 6h

---

## Themes

| Theme | Implementation |
|---|---|
| Lazy | Players control from their phones, lying on the couch |
| Rhythm | Actions have timing windows — hit the beat for a bonus |
| Whatever happens | Random chaos events mid-round (rain of frogs, cursed cacao, etc.) |

---

## Core Loop

```
Harvest cacao pods → Break pods → Ferment beans → Roast → Grind → Make chocolate bar
```

Not all steps need to be in the jam build. **MVP targets 2–3 steps.**

---

## Gameplay for POC

### Server Screen (shared display)
- Top-down farm view (Phaser.js)
- Shows all player characters moving around

### Mobile Client (per player)
- Simple browser page (no app install)
- D-pad or joystick for movement
- One action button: **Interact**
- Shows player color/name

### Player Actions
- **Move** — walk around the farm

## Tech Stack

| Layer | Tech |
|---|---|
| Server display | Phaser.js (browser, fullscreen) |
| Client (mobile) | Plain HTML/JS (or lightweight framework) |
| Communication | WebSocket (Node.js server) |
| Network | Local WiFi — players connect via server's LAN IP |

### Architecture (simplified)
```
[Node.js WS Server]
    ├── Serves client HTML to phones
    ├── Receives input from clients (move, interact)
    └── Broadcasts game state to server display

[Phaser.js Display]
    └── Renders game state received from WS server
- [ ] 2 stations working (harvest + break pod) + item pickup |
- [ ] Full loop to chocolate bar + score/timer |
- [ ] Rhythm timing window + beat visual |
- [ ] 1–2 chaos events |
- [ ] Art + music integration |
- [ ] Polish, playtesting, bug fixes |

[Mobile Client x4]
    └── Sends input → receives minimal feedback
```

---

## Build Plan

- [] Setup: repo, Node server, WS handshake, Phaser scaffold |
- [] Player movement: phone → server → Phaser character moves |
