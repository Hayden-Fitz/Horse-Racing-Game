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
- [x] Reuse imported meshes for existing held/remote/thrown item models.
- [x] Keep procedural fallbacks for items without supplied models.
- [x] Add a gallery to inspect all supplied assets.
- [x] Protect focused text inputs from gameplay keyboard shortcuts.

## Asset completion gates

- [ ] Visually approve final edited gold/pillow materials and lighting.
- [ ] Rig the user's static player model and integrate its animations/customization.
- [ ] Integrate new normal-item assets with the exact v13 effects and inventory.
- [ ] Integrate gold assets with the legendary economy (not normal concessions).
- [ ] Model remaining normal and legendary items.
- [ ] Complete final horse/jockey geometry, rig and animation.
- [ ] Test hands, ground contact and throws for each imported item in gameplay.
- [ ] Verify imported props between two live multiplayer clients.

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
- [ ] 65. AUTOMATIC ITEM REPLACEMENT
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
