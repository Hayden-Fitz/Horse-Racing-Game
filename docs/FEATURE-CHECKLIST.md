# Hotdog Derby v13 implementation checklist

The master spec is authoritative. A checked task has implementation and listed
verification. A whole specification section stays unchecked until all its
requirements work together. This avoids calling a partially built feature done.

## Completed migration tasks

- [x] Save the full v13 specification in the repository.
- [x] Rename the solo entry point to Practice Mode.
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

## Practice setup and race-reset slice

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

## Practice leaderboard and settings follow-up

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

## Whole specification sections

These include existing partial systems. They are not marked complete merely
because a UI or prototype exists. Follow the ten phases in section 131.

- [ ] 1. GAME NAME
- [ ] 2. CORE GAME CONCEPT
- [ ] 3. PLAYER COMBAT REMOVAL
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
- [ ] 72. PHONE KEY
- [ ] 73. CONCESSIONS APP
- [ ] 74. BETTING APP
- [ ] 75. HORSE APP
- [ ] 76. DERBYPAY
- [ ] 77. TRADE SAFETY
- [ ] 78. DERBYNEWS
- [ ] 79. SABOTAGE APP
- [ ] 80. CHARACTER CUSTOMIZATION
- [ ] 81. PLAYER CHARACTER
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
- [ ] 114. GLOBAL UI SCALE
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

## Verification record

- Automated UI, player animation, stadium, race and Practice Mode checks pass.
- Imported-model tests validate 18 assets, vertex colors, finite geometry,
  centered pivots, dimensions, independent transforms and triangle budgets.
- Browser gallery and game boot: 18 models load, imported hotdog is active,
  no JavaScript exceptions or asset-load failures.
- Network snapshot changes are code-level only; live-client verification pending.
