# Assets — Drop Tiled files here

Place your Tiled map export and tileset images in this folder.

## Expected files

| File | Description |
|------|-------------|
| `map.tmj` | Tiled map exported as JSON (File → Export As → map.tmj) |
| `tileset.png` | Tileset image referenced by the map |

## Tiled export settings

- Export format: **JSON** (`.tmj`)
- In Tiled: File → Export As → choose `public/assets/map.tmj`
- Tileset image path in Tiled should be relative: `tileset.png`

## Hot reload

The server watches this folder. Every time you save `map.tmj`, the display
screen reloads the map automatically — no need to refresh the browser.

## Layer naming convention

| Layer name | Purpose |
|------------|---------|
| `Ground`   | Base floor tiles (required) |
| `Walls`    | Collision layer (optional) |
| `Deco`     | Decorative overlay (optional) |

The Phaser scene will try to render any layer it finds. Unknown layers are skipped.
