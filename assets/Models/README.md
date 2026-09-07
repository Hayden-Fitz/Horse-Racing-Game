# Tinkercad model intake

Latest direction: preserve the user's original GLB shapes, using screenshots
only as color/material references. `corrected/` now contains all 18 original,
unsimplified exports with corrected sRGB palettes and materials. Supplied active
items load through `src/assets.mjs`; procedural props are fallbacks only.

Rebuild with `node scripts/restore-models.mjs "C:\Users\Hamcow\Downloads\3d files"`.
This leaves the source files untouched. Geometry fingerprints in
`corrected/report.json` verify that every triangle and normal survives unchanged.
Exactly identical vertices are shared to reduce the complete asset set to about
15 MB without simplification; original geometry is never decimated.
The chair has wood and blue upholstery, pillow/foam shoe are blue, gold items
are gold, and the bottle has separate clear shell, liquid and opaque label/cap
finishes. A red/white wave texture repairs the soda's silver exported wrapper.
These are screenshot-matched materials, not a guarantee of identical lighting
between Tinkercad and the game.

`model-gallery.html` previews all 18 restored models. The player export is
unrigged and remains a gallery asset; the animated in-game player is unchanged.
Inactive props are not downloaded during game startup. Original high-resolution
geometry costs more memory/download size than the old simplified models.

## Historical optimization route (not live)

The following describes the archived `optimized/` assets, not the current build.

Place each exported design in its own folder here, using a descriptive name
such as `hotdog`, `chair`, or `player`. Keep the entire export together, including
OBJ, MTL and any textures. You can also supply the original export ZIP.

Send exported files or accessible design links. An account username alone does
not grant access to private models. No account password is needed.

Before an asset replaces the procedural version, check scale, orientation,
materials, triangle count, collision bounds, held-item alignment and projectile
appearance. Player and horse models also need separate movable parts or a rig
for animation. Static Tinkercad exports do not supply the game's animations.

All 18 supplied GLBs are now optimized in `optimized/`; the originals remain
untouched in Downloads. `catalog.mjs` maps source names, game IDs and dimensions.
Existing item types use these models through `HD.Models.throwable` in hands and
projectiles. Future items and the unrigged player are available in the gallery,
but are not falsely enabled as completed gameplay features.

Rebuild optimized copies with:

    node scripts/prepare-models.mjs "C:\Users\Hamcow\Downloads\3d files"

The build welds duplicate vertices, simplifies geometry within an error bound,
retains normals/colors, compacts unused vertices and exports ordinary GLB files.
No runtime decompression package or external asset CDN is needed. Materials for
gold, the foam horseshoe and the pillow receive readability improvements.
`optimized/report.json` records source/output sizes and triangle counts.

Open `http://localhost:8080/model-gallery.html` with the game server running.
The gallery uses one renderer and redraws only on load, scroll or resize.
