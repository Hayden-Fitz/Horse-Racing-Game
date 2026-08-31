# Hotdog Downs

Hotdog Downs is a first-person 3D horse-racing party game. Players sit in an oval stadium, bet on a
three-lap race, walk to concourse shops, and throw physics-driven items at the field. The browser build
includes public lobbies, invite links, synchronized player movement, synchronized throws, and a
host-authoritative race simulation.

## Run the game

The easiest option on Windows is to double-click `START_MULTIPLAYER.cmd`. It opens a small local web
server at `http://localhost:8080`; Firebase provides multiplayer, so this window is not the lobby
server and friends do not connect to your computer.

You can also use VS Code Live Server, GitHub Pages, or any other static web host. To start the included
local web server manually, install Node.js 20 or newer and run:

```powershell
npm install
npm start
```

Use the in-game menu to create a public lobby, join a listed lobby, or enter a six-character invite
code. The **COPY INVITE LINK** button creates a URL that joins the same lobby automatically. Up to
eight players can connect from different computers and networks.

## Put it on the internet

GitHub Pages can host the complete browser game now because all clients connect directly to Firebase.
Enable Pages for the repository branch containing `index.html`; invite links will automatically use
that public Pages address. No Node server or PowerShell window is required for the hosted version.

The Firebase project is configured in `src/firebase.js`. Multiplayer data stays under
`hotdogDowns/lobbies`, and temporary presence/event data is cleaned up by each lobby host. Run the
following live database check after changing Firebase settings:

```powershell
npm run test:firebase
```

The checked-in `firebase.rules.json`, `firebase.json`, and `.firebaserc` are ready for Firebase CLI
deployment. The supplied prototype rules allow unauthenticated lobby access so invite links work
without accounts. Before a public or Steam release, add Firebase Authentication and stricter rules;
otherwise anyone who knows the database address can modify lobby data.

The included `Dockerfile` is an alternative for container hosts:

```powershell
docker build -t hotdog-downs .
docker run --rm -p 8080:8080 hotdog-downs
```

## Controls

- Mouse: look around; seated players can turn completely around.
- Space: stand up or return to the assigned seat.
- WASD: walk along seating rows, the wider trackside ring, stairs, and upper concourse.
- E: interact with physical shops and fee-free betting counters.
- P: raise or lower the phone.
- F: equip or put away the selected throwable.
- Q: cycle owned items.
- 1–8: select one of the eight hotbar items directly.
- R: open the animated current-rankings chart.
- Hold/release left mouse: charge and throw with the visible trajectory guide.
- Escape: open the menu. In an online lobby, the authoritative race continues for everyone.

The top-right **MENU** button opens settings for adaptive or fixed 640p–2160p rendering, model detail,
field of view, mouse sensitivity, HUD opacity, fullscreen, reduced motion, interface scale, high
contrast, optional HUD readouts, and remappable controls. During play, the pause menu is reduced to
Resume, Settings, and Quit.

## Multiplayer model

The lobby creator starts as host. The host simulates the countdown, horse traffic, effects, race order,
and intermissions, then writes compact Firebase snapshots five times per second. Other clients receive
realtime database events and interpolate between snapshots. Player movement, throws, sabotage, ready
states, walking animation, held phones/items, throw poses, bankroll rankings, and the 3-2-3 seat layout
are synchronized too.

Players send regular heartbeats. The host removes expired players and events, and the lowest occupied
seat takes over if the host leaves. Lobbies are temporary, hold up to eight players, and disappear when
the last player leaves normally. A commercial release should add accounts, authoritative Cloud
Functions or a dedicated game server, moderation, region matchmaking, and Steam authentication.

## Performance

Grandstand chairs and the background crowd use instanced meshes. Only three nearby local stand-ins use
full character models, and online players replace those stand-ins after joining. Stair treads are also
instanced. Shadows use a lighter 512-pixel map, and render resolution adapts inside the selected
quality preset based on measured frame rate. Fixed internal-height options range from 640p to 2160p
for maximum scoreboard clarity; these deliberately trade GPU performance for sharpness.

The code is split by system under `src/`: configuration, models, stadium construction, race simulation,
UI, networking, controls, and the main loop. Three.js is included locally under `vendor/`.
