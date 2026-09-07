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

Practice now has a dedicated setup screen for horse count (4–8), laps (1–8),
starting bankroll ($100–$1,000), days (1–10), races per day (1–6), and four crowd frequencies. Rules update the
starting field, odds, lane markings, finish threshold and crowd scheduler.
Cancelled edits do not affect the game. Online entry restores online defaults;
host-editable synchronized rules are not implemented yet.

Run length is days multiplied by races per day. The HUD and final-race checks
use that total. Existing day-two/day-three allowances remain; later days grant
no automatic allowance until the v13 daily reward system is implemented.
Restarting cancels the current day screen and invalidates delayed progression.

Still required in Phase 1: the remaining configurable, synchronized match settings; stronger
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

The experimental commentator booth has been removed from the live stadium. Its
former upper-floor cutout, seats, rail opening, collision panels, special stairs
and NPCs are restored/cleared as appropriate. Commentary audio remains a game
audio feature and does not require a physical booth.

## User-created models

Tinkercad account: hayhamcow. All 18 supplied GLBs have optimized copies under
`assets/Models/optimized`, now archived and not loaded by the live game.
The user rejected their appearance on September 7. The 18 images in Downloads /
Photos of models are now the visual authority. `src/reference-models.js`
recreates the 17 props, and `src/models.js` retains an animated player rig with
the reference's tapered shirt, floating head and matching sleeve colors.
Open `model-gallery.html` through the game server to inspect the full set.
Final horse/jockey assets remain required. New item mechanics are tracked
separately from asset readiness. The imported reflection environment is disabled.

Follow [the checked task list](FEATURE-CHECKLIST.md) for completed work and all
136 specification sections. Do not mark entire systems done from asset work alone.
