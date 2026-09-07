# Hotdog Derby development

[Master specification v13](MASTER-SPEC-v13.txt) is the current design authority.
Its numbered phases are the implementation order, not a claim that features
already exist. Older conversation requests yield to v13.

## First migration slice

- Practice Mode label replaces Single Player.
- Simulated player opponents are removed; reserved seats remain for humans.
- Horse AI and the ambient crowd remain active.
- Lane centers adapt to 4–8 horses within the existing dirt surface.
- Starting lane order is inside to outside, including horse 8 outside horse 7.
- Opening odds normalize against the active field. Existing live betting and
  ticket-locked payout behavior remain in place.

Still required in Phase 1: configurable, synchronized match settings; stronger
field/stat odds calibration; expanded bet types; full multiplayer economy audit;
dynamic gate geometry and race camera framing. Later phases include personal
horses, inventory wheel, exact item roster/effects, auctions, run rewards,
collection, phone apps, world rebuild, presentation, and release hardening.

## Stadium target

Use the user's stadium concept as the art direction for one consistent 3D
structure: oval dirt track and infield, fenced outer interaction ring, lower and
middle seating tiers, roofed upper concourse, connected stair landings, horse
tunnel, starting gate and finish structure. Maintain this same architecture
from front, rear, side and overhead views. The full rebuild is pending; the
current procedural stadium is not the final asset.

## User-created models

Tinkercad account: hayhamcow. All 18 supplied GLBs have optimized copies under
`assets/Models/optimized`. Existing item types use them in hands and projectiles.
Open `model-gallery.html` through the game server to inspect the full set.
The static player export still needs rigging; final horse/jockey assets remain
required. New item mechanics are tracked separately from asset readiness.

Follow [the checked task list](FEATURE-CHECKLIST.md) for completed work and all
136 specification sections. Do not mark entire systems done from asset work alone.
