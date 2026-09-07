# Tinkercad model intake

September 7 update: the user rejected the imported appearance. Optimized GLBs
below are archived, not live assets. The game now uses screenshot-based editable
meshes in `src/reference-models.js`; the gallery displays those recreations.
Source screenshots are in Downloads / Photos of models. Do not re-enable the
GLB route or override the screenshot colors without a new user request.

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
