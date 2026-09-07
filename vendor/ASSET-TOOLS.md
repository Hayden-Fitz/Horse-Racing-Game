# Model tooling provenance

- GLTFLoader, BufferGeometryUtils, GLTFExporter: Three.js r180, matching the
  game's existing renderer. MIT license in THREE-LICENSE.txt.
- MeshoptSimplifier: meshoptimizer v0.25. MIT license in MESHOPT-LICENSE.md.

Downloaded from the respective upstream GitHub tagged revisions. Three.js bare
imports are changed to the local three.module.js paths. The exporter and
simplifier run only in the offline asset build. Only the loader and its geometry
utility dependency are imported by the game.
