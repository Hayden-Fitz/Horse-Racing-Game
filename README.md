# Hotdog Derby

Hotdog Derby is a first-person 3D horse-racing party game set at Hotdog Downs.
Players stand in an oval stadium, bet on a configurable race, walk through the
seating bowl and concourse, and throw physics-driven items at the field. The browser build
includes public lobbies, invite links, synchronized player movement, synchronized throws, and a
host-authoritative race simulation.

## Run the game

The easiest option on Windows is to double-click `START_MULTIPLAYER.cmd`. It opens the game and its
local realtime WebSocket server at `http://localhost:8080`. Two browser windows on this computer can
immediately create and join the same lobby; internet play uses the Cloudflare deployment below.

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

The browser now connects through `src/realtime.js` to the project-owned WebSocket server. A
deployment-ready Cloudflare Durable Objects target is checked in under `cloudflare/`. Follow
[`docs/MULTIPLAYER-SERVER.md`](docs/MULTIPLAYER-SERVER.md) to deploy it on Workers Free, copy the
resulting URL into `src/realtime-config.js`, and perform the required two-device playtest.

The old Firebase files remain only as a temporary rollback reference until the cloud deployment is
verified; they are not loaded by the game. GitHub Pages can still host the browser files, but it must
be paired with the deployed Worker URL because Pages cannot run the WebSocket server itself.

The included `Dockerfile` is an alternative for container hosts:

```powershell
docker build -t hotdog-downs .
docker run --rm -p 8080:8080 hotdog-downs
```

## Controls

- Mouse: look around in any direction.
- Space: jump between seating rows or down to the walkway.
- WASD: walk along seating rows, the trackside ring, stairs, and concourse.
- E: interact with physical shops and fee-free betting counters.
- Shift: raise or lower the phone.
- F: equip or put away the selected throwable.
- Q: cycle owned items.
- Number keys: select one of the ten hotbar items directly.
- Hold/release left mouse: charge and throw with the visible trajectory guide.
- Escape: open the menu. In an online lobby, the authoritative race continues for everyone.

The top-right **MENU** button opens Settings, Credits, and Quit alongside the
Play flow. Settings include adaptive or fixed 640p–2160p rendering, model detail,
field of view, mouse sensitivity, HUD opacity, fullscreen, reduced motion, interface scale, high
contrast, optional HUD readouts, and remappable controls. During play, the pause menu is reduced to
Resume, Settings, and Quit.

## Multiplayer model

The lobby creator starts as host. The host simulates the countdown, horse traffic, effects, race order,
and intermissions, then sends compact WebSocket snapshots five times per second. Other clients receive
realtime events and interpolate between snapshots. Player movement, throws, sabotage, ready
states, walking animation, held phones/items, throw poses, bankroll rankings, and the eight-player seat layout
are synchronized too.

Players send regular heartbeats. The server removes expired players and events, and the lowest occupied
seat takes over if the host leaves. Lobbies are temporary, hold up to eight players, and disappear when
the last player leaves normally. A commercial release still needs signed accounts, server-authoritative
economy transactions, moderation, region matchmaking, and Steam authentication.

## Performance

Grandstand chairs and the background crowd use instanced meshes. Only three nearby local stand-ins use
full character models, and online players replace those stand-ins after joining. Stair treads are also
instanced. Shadows use a lighter 512-pixel map, and render resolution adapts inside the selected
quality preset based on measured frame rate. Fixed internal-height options range from 640p to 2160p
for maximum scoreboard clarity; these deliberately trade GPU performance for sharpness.

The code is split by system under `src/`: configuration, models, stadium construction, race simulation,
UI, networking, controls, and the main loop. Three.js is included locally under `vendor/`.
