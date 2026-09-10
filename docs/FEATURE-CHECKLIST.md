# Hotdog Derby v13 implementation checklist

The master spec is authoritative. A checked task has implementation and listed
verification. A whole specification section stays unchecked until all its
requirements work together. This avoids calling a partially built feature done.

## Completed migration tasks

### Latest model direction: original GLBs, screenshot-based materials

- [x] Restore supplied active-item GLBs instead of screenshot-built replacement shapes.
- [x] Preserve original triangles/normals and source files; verify geometry fingerprints.
- [x] Reduce restored downloads with exact vertex sharing, not shape simplification (about 15 MB total).
- [x] Correct chair wood/upholstery, blue foam/pillow, gold finishes and bottle transparency.
- [x] Restore a red/white wave label on the soda's exported silver wrapper.
- [x] Keep the hotdog's sausage/toppings visible in the first-person hand pose.
- [x] Preview all 18 corrected exports in the model gallery.
- [x] Split the original player export into named animation parts without changing its geometry.
- [ ] Finish supplied-base movement, phone and throwing animation review; the
  model is live, but imported elbow/knee deformation remains incomplete.
- [x] Layer hats, expressions, outfits, pants, shoes and accessories over the supplied base.
- [x] Keep lobby-seat shirt colors and selected skin/pants/shoe colors working on the supplied materials.
- [ ] Confirm material matching with the user under their display/game lighting.

Earlier screenshot-recreation and GLB-archiving tasks below are historical and
superseded by this direction. Tests: `npm.cmd test`; browser gallery, startup,
held hotdog and throwing checks: `node scripts/review-models.mjs 9338`.

- [x] Save the full v13 specification in the repository.
- [x] Rename the player-facing solo entry point to Single Player.
- [x] Remove simulated player opponents and fake transfer recipients.
- [x] Preserve reserved seats for actual online humans.
- [x] Put 4–8 starting lanes within the dirt, ordered inside to outside.
- [x] Normalize opening probabilities against the actual active field.
- [x] Include opening odds and live probability in host race snapshots.
- [x] Import and optimize all 18 supplied Tinkercad GLBs.
- [x] Preserve source exports; generate separate compact game assets.
- [x] Archive the imported-model route after user rejected its appearance.
- [x] Recreate 17 item models from the September 7 screenshots with editable meshes.
- [x] Rebuild the basic player shape while retaining its existing animation rig.
- [x] Batch static item meshes by material and remove GLB downloads from game startup.
- [x] Angle the first-person hotdog to show its sausage and toppings.
- [x] F toggles hold/unhold; only left mouse charges/releases throws.
- [x] Remove the obsolete R rankings key and saved binding.
- [x] Keep procedural fallbacks for items without supplied models.
- [x] Add a gallery to inspect all supplied assets.
- [x] Protect focused text inputs from gameplay keyboard shortcuts.

## Single Player setup and race-reset slice

- [x] Repair the Single Player button after removing the obsolete Fixer form
  field; opening and starting the setup now succeeds in the live browser.
- [x] Add a keyboard-accessible Practice setup screen with Back and Start actions.
- [x] Configure 4–8 horses, 1–8 laps, and $100–$1,000 starting practice money.
- [x] Rebuild lane markings when horse count changes and dispose old geometry/materials.
- [x] Support crowd Off / Relaxed / Normal / Lively; practice defaults to Lively.
- [x] Keep crowd throws staggered and confined to active racing.
- [x] Validate rule values and keep practice settings out of online defaults.
- [x] Reset horse positions to the start when a new run begins.
- [x] Cancel the previous race's delayed advancement when restarting a run.
- [x] Test setup/start/cancel in-browser and check narrow-screen overflow.
- [x] Add configurable Practice days (1–10) and races per day (1–6), live run
  summary, and dynamic HUD totals. Test short and long run progression, final
  results, and the existing day allowances. Full v13 reward choices remain pending.
- [ ] Add host-owned lobby rules with synchronized client display and live two-client tests.
- [ ] Connect remaining v13 settings only as their underlying systems become functional.
- [ ] Audit day-screen callbacks and online victory callbacks for stale-run cancellation.
- [x] Cancel old day-screen timers on restart and guard delayed day progression,
  countdown clearing, and victory checks against restarted runs.
- [ ] Verify online victory cancellation with two live clients, including reconnects.

Verification: `npm.cmd test` and `node scripts/review-models.mjs 9338`.
Visual capture: `artifacts/practice-setup.png`. Whole settings sections below
remain pending: this is the first working subset, not the complete settings system.

## Section 0 UI and stadium cleanup

- [x] Apply the lobby's race-club visual language to non-phone HUD, overlays,
  settings, counters, results, rankings, and day-change screens.
- [x] Keep the phone and its applications on their separate phone-specific design.
- [x] Remove the commentator booth, commentator NPCs, its special stairs, and
  its invisible projectile glass collision.
- [x] Restore the booth's upper-concourse floor, glass railing, tier segments,
  crowd seats, and nearby decorative-clearance space.
- [x] Test that the restored upper concourse is continuous away from the four
  intended public stair openings.

## Single Player leaderboard and settings follow-up

- [x] Remove the fabricated Practice Mode leaderboard, standings app, rankings
  button, and ranking rows; real-player standings remain available in an online
  match.
- [x] Restrict Practice starting money to a deliberate $100–$1,000 range in
  both the form and rule validation.
- [x] Give Practice setup the lobby's clubhouse card treatment.
- [x] Make the Settings heading and Done control sticky while its content scrolls.
- [x] Verify leaderboard visibility, money bounds, and sticky-heading behavior
  through browser automation.

## Small item-system slice

- [x] Add Weight (1–5) and Throwing Ease (1–5) data to every currently active
  throwable.
- [x] Apply those independent traits to first-person throw lift and horizontal
  reach without replacing each item's existing unique flight physics.
- [x] Show Weight and Throwing Ease in the phone shop and concourse vendor.
- [x] Validate every active item trait and the light-vs-heavy throw profile.
- [x] Correct Foam Horseshoe to the spec's Weight 3 / Throwing Ease 3.
- [x] Apply ease only to horizontal velocity and weight to vertical velocity,
  including the upward component of player aim.
- [x] Prefer the same item category after depletion, then fall back to other
  owned items; empty hands when the inventory is exhausted.
- [x] Show each active item's category alongside its throwing traits in shops.

## Reference model corrections

- [x] Round the blue cushion corners and add its perimeter seam.
- [x] Add the wooden chair's seat frame and rounded backrest.
- [x] Rebuild popcorn carton side stripes, scalloped rim, and oval label.
- [x] Verify corrected models in the gallery, including shared prop transforms,
  geometry budgets, ground contact, and live throwing.
- [ ] Review any additional specific model mismatches reported by the user.

This is a tested slice of sections 23 and 60, not the complete v13 item roster
or effect system.

Follow-up: the retired booth construction helpers are intentionally left unused
until the stadium receives its planned full asset rebuild; no game system calls
them or exposes a booth walk zone.

## Asset completion gates

- [x] Replace rejected gold/pillow materials with screenshot-based colors; render the gallery.
- [ ] Finish player appearance/customization review against the reference.
- [ ] Integrate new normal-item assets with the exact v13 effects and inventory.
- [ ] Integrate gold assets with the legendary economy (not normal concessions).
- [ ] Model remaining normal and legendary items.
- [ ] Complete final horse/jockey geometry, rig and animation.
- [x] Test recreated active-item ground contact and remote prop attachment.
- [ ] Complete first-person grip review for every item (hotdog checked).
- [ ] Verify recreated props between two live multiplayer clients.

## Supplied player model slice

- [x] Make the supplied base-player GLB the live local and multiplayer model.
- [x] Preserve its exact floating head, cone body, arms, hands, legs and shoes.
- [ ] Finish rigging its disconnected original pieces without decimating or
  remodeling them; original parts are attached, elbow/knee deformation is pending.
- [x] Attach selectable hats, facial expressions, outfits, pants, footwear and accessories.
- [x] Preserve seat-color identification and synchronized avatar selections.
- [x] Align the original head with the first-person eye level and shoes with the floor.
- [x] Start each run standing in the seating area as required by section 81.
- [x] Keep players standing at their current intermission position across day transitions.

Verification: imported-player structure/material tests, character animation tests,
full browser startup/Practice/throw tests, and `artifacts/player-customization.png`.

## Permanent horse identity and reserve-odds slice (sections 95–96)

- [x] Assign explicit permanent numbers to all 30 currently implemented horses;
  keep these values separate from lane slots and finishing positions.
- [x] Show matching identities above horses, on the stadium standings board,
  betting cards, tickets, wager tracker, ledger, fixer messages and winner notices.
- [x] Keep betting/network target indices unchanged; never index a race by its
  displayed horse number.
- [x] Show reserve horses as NOT ENTERED in OddsWatch instead of inventing a
  probability for a race they are not participating in.
- [x] Label base odds tendency separately from active-field odds.
- [x] Test number uniqueness and preservation across reordered fields and
  4–8 horse counts; browser-check identity cards and reserve probabilities.
- [ ] Expand the full normal roster to 48 with the complete specified stats,
  appearance, personality behavior, rarity and discovery system.
- [ ] Verify these identities between two live multiplayer clients.

Verification: `npm.cmd test`, `npm.cmd run check`, and
`node scripts/review-models.mjs 9344`. Whole roster/discovery sections remain open.

## Concessions delivery and purchase slice (section 19)

- [x] Extract shared purchase/delivery rules into a separately tested module.
- [x] Keep phone orders out of inventory until the full 12-second delivery ends.
- [x] Show item names, ORDERED / DELIVERING / DELIVERED states, remaining
  seconds and individual progress bars; retain delivered receipts briefly.
- [x] Stack multiple delivery cards without overlapping or stretching the phone.
- [x] Preserve the selected/held item when an order arrives.
- [x] Reject unknown items, stand-only phone orders, unaffordable purchases and
  instant-pickup requests outside an open stand.
- [x] Preserve discounted, instant stand purchases with shared price validation.
- [x] Verify duplicate-delivery protection, simultaneous arrivals, invalid time
  steps and cleared orders after restarting.

Verification: `npm.cmd test`, syntax checks, and
`node scripts/review-models.mjs 9343` (real order buttons, complete delivery flow,
unchanged held item and stacked-card bounds). Visual review:
`artifacts/concessions-deliveries.png`. The full new food roster and auction
system remain separate unfinished tasks.

## Customization materials and Fixer validation

- [x] Neutralize imported player vertex tints so selected shirt, skin and trouser
  colors render without being multiplied by the original blue/tan palette.
- [x] Preserve the original player geometry fingerprint during this correction.
- [x] Retire the temporary Fixer toggle; Fixer services are always enabled and
  invalid target horses remain rejected.
- [x] Include Practice setup in accessibility UI scaling.
- [x] Validate a complete requested asset batch before replacing its working files;
  allow focused rebuilds of individual assets while retaining the full manifest.
- [ ] Recheck the final scaled phone/setup bounds at 150% on a narrow screen.
- [ ] Finish imported elbow/knee deformation and check hands against held props;
  hierarchy tests alone do not establish natural-looking animation.
- [ ] Investigate the intermittent full-batch asset rebuild fingerprint failure;
  focused single-model rebuilds and all checked-in asset geometry tests pass.

Verification: `npm.cmd test`, `npm.cmd run check`, and
`node scripts/review-models.mjs 9341`: model gallery, startup, typing, Practice
setup including the fixer toggle, 125% UI scaling and throwing smoke checks.
Maximum-size/narrow-screen combinations remain a separate pending check above.

### Section 0: requested migration away from Firebase

- [ ] Implement and test a replacement realtime lobby/game transport locally.
- [ ] Add two-client reconnect, membership and host-permission checks.
- [ ] Select hosting after checking its actual free-tier limits; do not assume
  a free server provides unlimited simultaneous players.
- [ ] Deploy and verify the replacement before removing the working transport.

## Whole specification section completion gates

These include existing partial systems. They are not marked complete merely
because a UI or prototype exists. Follow the ten phases in section 131.

- [x] 1. GAME NAME — Hotdog Derby is used consistently by the game shell,
  package metadata, stadium branding, and authoritative specification.
- [ ] 2. CORE GAME CONCEPT
- [x] 3. PLAYER COMBAT REMOVAL — controls and gameplay expose no punching,
  player health, damage, stun, knockback, or player-attack action.
- [ ] 4. SINGLE-PLAYER MODE
- [ ] 5. CORE GAME LOOP
- [ ] 6. GAME SETTINGS
- [ ] 7. GAME SETTING DEPENDENCIES
- [ ] 8. ROGUELIKE STRUCTURE
- [ ] 9. DAY SYSTEM
- [ ] 10. LEADERBOARD / DAY CHANGE
- [ ] 11. POSITIVE REWARD CHOICE
- [ ] 12. UPGRADE SYSTEM
- [ ] 13. DAILY UPGRADE LIMIT
- [ ] 14. UPGRADE DESIGN
- [ ] 15. NEGATIVE EFFECT CHOICE
- [ ] 16. REWARD RANDOMIZATION
- [ ] 17. ECONOMY
- [ ] 18. CATCH-UP ECONOMY
- [ ] 19. FOOD / CONCESSIONS
- [ ] 20. AUCTION SYSTEM
- [ ] 21. AUCTION ECONOMY
- [ ] 22. ITEM SYSTEM OVERVIEW
- [ ] 23. ITEM PHYSICAL CHARACTERISTICS
- [ ] 24. HORSE EFFECT SYSTEM
- [ ] 25. SPEED BOOST
- [ ] 26. RESISTANCE GAIN
- [ ] 27. STUN
- [ ] 28. SLOW
- [ ] 29. KNOCKBACK
- [ ] 30. INTELLIGENCE BOOST
- [ ] 31. ITEM EFFECT LIMIT
- [ ] 32. NORMAL ITEM ROSTER
- [ ] 33. HOTDOG
- [ ] 34. SODA
- [ ] 35. OATS
- [ ] 36. CARROT
- [ ] 37. POPCORN
- [ ] 38. WATER BOTTLE
- [ ] 39. PRETZEL
- [ ] 40. PILLOW
- [ ] 41. CHAIR
- [ ] 42. RUBBER CHICKEN
- [ ] 43. FOAM HORSESHOE
- [ ] 44. TENNIS BALL
- [ ] 45. BEACH BALL
- [ ] 46. TRAFFIC CONE
- [ ] 47. BANANA PEEL
- [ ] 48. FRISBEE
- [ ] 49. FOAM FINGER
- [ ] 50. HURDLE
- [ ] 51. LEGENDARY SHOP
- [ ] 52. LEGENDARY ITEM ROSTER
- [ ] 53. GOLDEN HORSESHOE
- [ ] 54. GOLDEN CARROT
- [ ] 55. GOLDEN HOTDOG
- [ ] 56. BOWLING BALL
- [ ] 57. GIANT COWBELL
- [ ] 58. BOOMERANG
- [ ] 59. BOOMERANG RETURN SYSTEM
- [ ] 60. ITEM DATA SYSTEM
- [ ] 61. ITEM CATEGORIES
- [ ] 62. ITEM PHYSICS
- [ ] 63. INVENTORY SYSTEM
- [ ] 64. INVENTORY WHEEL
- [x] 65. AUTOMATIC ITEM REPLACEMENT — same category, fallback, and empty hands
  verified using actual browser throw events.
- [ ] 66. ITEM CONTROLS
- [ ] 67. PHONE SYSTEM
- [ ] 68. PHONE HOME SCREEN
- [ ] 69. PHONE APP DESIGN
- [ ] 70. PHONE ICONS
- [ ] 71. MESSAGES
- [x] 72. PHONE KEY — Left Shift is the remappable default, either Shift key
  matches that default outside text fields, and focused text entry is protected.
- [ ] 73. CONCESSIONS APP
- [ ] 74. BETTING APP
- [ ] 75. HORSE APP
- [ ] 76. DERBYPAY
- [ ] 77. TRADE SAFETY
- [ ] 78. DERBYNEWS
- [ ] 79. SABOTAGE APP
- [ ] 80. CHARACTER CUSTOMIZATION
- [ ] 81. PLAYER CHARACTER — supplied model and cosmetic layers integrated;
  imported limb deformation and full animation/eye-floor review remain pending.
- [ ] 82. PERSONAL HORSE
- [ ] 83. PERSONAL HORSE ARCHETYPES
- [ ] 84. PERSONAL HORSE NAMING
- [ ] 85. PERSONAL HORSE CUSTOMIZATION
- [ ] 86. PERSONAL HORSE RACE LIMIT
- [ ] 87. ENTER PERSONAL HORSE
- [ ] 88. PLAYER-CONTROLLED RACING
- [ ] 89. PLAYER RACE ECONOMY
- [ ] 90. PLAYER RACE INTERACTION
- [ ] 91. NORMAL HORSES
- [ ] 92. HORSE PERSONALITIES
- [ ] 93. HORSE RARITY
- [ ] 94. HORSE DISCOVERY
- [ ] 95. HORSE NUMBERS
- [ ] 96. HORSE ODDS
- [ ] 97. DYNAMIC HORSE COUNT / LANES
- [ ] 98. HORSE AI
- [ ] 99. CHAMPIONSHIP
- [ ] 100. STADIUM / ARENA
- [ ] 101. STADIUM TRACK
- [ ] 102. STADIUM SEATING / STRUCTURE
- [ ] 103. TOP FLOOR / ROOF
- [ ] 104. STAIRCASES / WALKWAYS
- [ ] 105. HORSE ENTRY / EXIT TUNNEL
- [ ] 106. PLAYER INTERACTION RING
- [ ] 107. STADIUM LIFE
- [ ] 108. THREE LOCATIONS
- [ ] 109. BACKGROUNDS
- [ ] 110. MUSIC
- [ ] 111. MAIN MENU
- [ ] 112. LOBBY
- [ ] 113. SETTINGS SCREEN
- [ ] 114. GLOBAL UI SCALE — persistent 70–150% control now covers the menu,
  phone/apps, betting, shops, HUD, notifications, results and popups without
  scaling the 3D canvas or changing pointer coordinates.
- [ ] 115. REPLAY SYSTEM
- [ ] 116. REPLAY DATA
- [ ] 117. DAILY HIGHLIGHTS
- [ ] 118. ONLINE MULTIPLAYER
- [ ] 119. SERVER AUTHORITY
- [ ] 120. SERVER ARCHITECTURE
- [ ] 121. NETWORK FAILURE
- [ ] 122. ANTI-EXPLOIT
- [ ] 123. PERFORMANCE
- [ ] 124. 3D ASSET STATUS
- [ ] 125. FINAL HORSE MODEL
- [ ] 126. JOCKEY
- [ ] 127. HORSE ANIMATIONS
- [ ] 128. ACHIEVEMENTS
- [ ] 129. XP / LEVELS
- [ ] 130. PERMANENT PROGRESSION
- [ ] 131. DEVELOPMENT PRIORITY
- [ ] 132. CURRENT KNOWN BUGS / REQUIRED CHANGES
- [ ] 133. IMPORTANT DESIGN DISTINCTIONS
- [ ] 134. FINAL DESIGN PHILOSOPHY
- [ ] 135. CORE SUCCESS CRITERIA
- [ ] 136. FINAL IMPLEMENTATION RULE

## Arena follow-up

- [x] Supersede the experimental multi-floor arena pass: remove the green/blue
  decks, roof sections, elevated terraces, and stair towers while retaining the
  continuous lower bowl, four main stairs, shop concourse, concessions, betting
  counters, support facilities, starting gate, and camera/replay groundwork.
- [x] Recenter the Fixer Hub inside the walkable concourse and move Stadium Vision
  opposite the entrance for a clear arrival sightline without covering a stair.

The completed multi-floor items below are historical implementation notes and
are no longer part of the active arena layout.

- [x] Rebuild the reference seating layout: three green middle sections, two
  covered blue upper sections, one intentionally single-level quadrant, and a 
  continuous gold lower bowl.
- [x] Replace undersized chairs with shared rounded 2.1-unit seats and raised
  supports; widen row spacing, reduce crowd density, and match reserved chairs.
- [x] Replace diagonal access stairs with four cardinal stair spines continuing
  from the lower aisles. Use shallow parallel switchbacks, solid concrete treads,
  blue rails with open ends, supported landings, and unobstructed turns.
- [x] Clear seating from real stair footprints and structural columns; verify
  standing-player headroom against rendered geometry and walk all main and upper
  flights in both directions, including main-stair concourse transitions and
  sideways entry from every lower-bowl row onto all four public stairs.
- [x] Keep three infield and two elevated camera crews, rescale equipment/operators
  to the player, and align future replay camera transforms with their lenses.
- [x] Replace blank betting-counter screens with shared live field/odds textures
  and open/live/closed betting status, with unchanged-data upload suppression.
- [x] Finish support-facility fronts: labeled men's, women's, and wider accessible
  restroom doors, framed entries, kick plates, canopy lighting, a separate medical
  sign panel, and an information window. These remain exterior-only facilities.
- [x] Keep concourse decorations clear of facility approaches and separate first
  aid from the neighboring shop. Add facility-label/spacing tests and two visual views.
- [x] Add framed concession menus using catalog item names, suspended clear of
  storefront headers, plus recessed waste/recycling stations inside stall collision.
  Verify menu visibility at player height and rerun all browser stair routes.
- [x] Replace raised concourse guide tubes with flat colored floor markings.
- [x] Finish concession counters with rounded worktops, inset front panels,
  payment terminals, and preparation tables; visually review at player height.

- [x] Apply the opening ARENA.txt notes: green seating above the lower bowl,
  blue seating above green, each set back by about two lower seat rows.
- [x] Provide two front throwing-terrace blocks at all five elevated sections.
- [x] Connect stacked floors with stair towers, landings, and concourse approaches;
  exercise every added flight in both directions through actual player controls.
- [x] Rebuild green-to-blue stair towers from their true entrances, using continuous
  U-shaped flights and landings instead of intersecting offset sections.
- [x] Add restroom, first-aid, and information-building exteriors to the concourse.
- [x] Smooth curved concrete/roof edges and replace fence lines with rounded rails.
- [x] Split the lower crowd into eight render sectors and add continuous mountain scenery.
- [x] Add numbered mobile starting stalls that open and clear the course at race start.
- [x] Restore compact concessions delivery indicators so purchases do not move buy buttons.
- [x] Browser-check five consecutive concessions orders: shopping controls stay
  at the same vertical position (132px before and after).
- [x] Add subtle repeatable dirt-track texture without changing its geometry.
- [x] Add three infield camera crews and two elevated camera crews, with named
  perspective-camera transforms available for future replay work.
- [x] Add collision footprints for elevated camera equipment.
- [x] Correct pond-rim orientation, floating sectional rail bases, and upper-roof
  headroom. Keep roof supports connected to the raised roof.
- [x] Complete connected navigation to all new seating floors, with two-way
  height-continuity checks for the added stair flights.
- [x] Finish the elevated-deck edges with dark structural fascia, floor-colored
  accent bands, closed section ends, flush landing pads, and clean parallel-run
  switchback stairs. Shorten canopy columns to begin at the concourse structure.
- [x] Break up the unfinished concourse slab with distinct promenade/service bands,
  add labeled main stair-arrival gateways with collision, finish betting-counter
  signage on both visible levels, and simplify the exterior support rhythm.
- [x] Replace full-height elevated stair blocks with individual concrete treads,
  dark sloped stringers, and consistent side curbs so upper flights no longer
  appear as large walls when viewed from the concourse or seating bowl.
- [x] Remove the horse tunnel, bridge, service yard, route rules, rail/floor gaps,
  and stale tests; restore the fourth normal staircase and continuous seating,
  player-ring concrete, track railings, concourse glass, and exterior facade.
- [x] Add two distinct secondary public entrances with exterior-facing ticket doors,
  canopies, signs, plaza lights, collision, and cleared landscape approaches.
- [x] Add a giant structurally supported Stadium Vision board behind the northwest
  single-level grandstand, with live race leaders, replay-ready 1024x576 canvas,
  rear branding/bracing, service catwalk and ladder, camera pod, and collision.
- [x] Visually review overview, opposite, upper-stair and camera-crew elevations;
  no runtime exceptions were reported.
- [x] Finish the simplified-bowl recovery pass: assisted four-way stair entry,
  clean landings without arrival arches, a continuous outer glass ring, restored
  canopy with replay-board clearance, far-side replay placement, and verified
  collision barriers for all four shops, four betting counters, and the Fixer.
- [x] Remove the Practice Mode Fixer toggle and keep Fixer services enabled for
  every match.
- [x] Rebuild the four lower-bowl stairs around seating-row elevations: sixteen
  physical treads create two steps per row transition, and the walking surface
  meets every row floor.
- [x] Replace centerline snapping with edge-only stair capture that preserves
  the player's lateral position whenever they are already inside the aisle.
- [x] Fill the structure beneath the upper concourse with a continuous concrete
  foundation so stairs and seating no longer expose the outside ground.
- [x] Browser-walk all stairs in both directions and enter them from all 28
  seating-row approaches; no route failures or runtime exceptions.
- [x] Remove the triangular lower-stair retaining walls and replace the paired
  side rails with one centered handrail. Keep the rail purely decorative and
  out of both player and projectile collision registries.
- [x] Close the accidental gaps between alternating stair treads and rebalance
  each row span to a 42% connector step followed by a 58% seating-row landing,
  while retaining equal riser heights and the centered handrail.
- [x] Restore free movement from stairs into every seating row by applying edge
  assistance only when entering an aisle, never while already walking on it.
- [x] Give each seating-row elevation a broad landing, use shorter connector
  treads between rows, and close the remaining concrete gap at both aisle edges.
- [x] Rebuild main aisles with broad landings centered on all seven seat rows,
  two shallower connector treads between landings, and matching stepped movement
  height so the player's feet follow the visible concrete.
- [x] Replace the floating straight center rail with joined sloped/level segments;
  anchor every post directly on its corresponding tread while retaining no collision.
- [x] Browser-test 28 assisted row entries and 56 left/right row exits in
  addition to full bottom-to-top routes; all complete without movement failures.
- [ ] Finish the remaining arena reference polish.

### Live broadcast and highlights

- [x] Render a live race camera to the stadium TV, capped at 20 feed frames/sec.
- [x] Add ten crew viewpoints: four upper concourse, two reserved seating bays,
  and four infield. Keep walkway clear and reserve bay seats from audience/throwers.
- [x] Keep live coverage on the current first-place horse, with changing angles
  and adaptive framing/zoom; airborne items no longer take over the live shot.
- [x] Keep a bounded 12-second visual history without rewinding game state.
- [x] Replay impacts within 18 units of the leader (excluding lapped horses)
  after a one-second live aftermath delay, then return to the current leader.
  Lead changes alone do not interrupt coverage; allow three seconds between replays.
- [x] Add LIVE/REPLAY graphics, event captions, and replay progress.
- [x] Remove lateral stair-entry snapping and extend the continuous outer
  glass ring to roof height, overlapping panes behind the mullions.
- [x] Verify live rendering, replay isolation, error recovery and history bounds
  in stadium tests. Browser replay smoke test reports no runtime errors;
  the arena route review reports no blocked stair entries/exits.
- [x] Test leader handover, airborne-item rejection, distant/lapped hit rejection,
  one-second replay delay, and return to the current leader. Visually review
  relocated seating camera bays with the browser broadcast review.
- [ ] Tune highlight selection and camera obstruction handling during extended
  multiplayer play; broadcasts currently use local directors, not synchronized cuts.

Verification: `npm.cmd test`, `node scripts/review-broadcast.mjs 9355`,
`node scripts/review-arena.mjs 9355`. Browser reviews require a local server
on port 8080 and a debugging browser on the supplied port.

## Verification record

- Automated UI, player animation, stadium, race and Practice Mode checks pass.
- Imported-model tests validate 18 assets, vertex colors, finite geometry,
  centered pivots, dimensions, independent transforms and triangle budgets.
- Browser gallery and game boot: 18 models load, imported hotdog is active,
  no JavaScript exceptions or asset-load failures.
- Network snapshot changes are code-level only; live-client verification pending.
