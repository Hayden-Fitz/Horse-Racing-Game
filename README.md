# Hotdog Downs — 3D playable prototype

Run the project through VS Code Live Server, then open the local address it provides. This project uses
browser ES modules, which should be served over HTTP instead of opened through a `file://` URL. The 3D
engine is included locally, so playing does not require an internet connection.

- Bet before and during races in RaceBet.
- Buy $8 hotdogs in TrackMart; click the dirt track during a race to throw.
- Click the stadium to capture the mouse, then move it to turn your head from your seat.
- Press **P** to pull out or put away the phone. Press **F** to ready or put away a hotdog.
- While holding an item, hold the left mouse button to build power and release to throw. The power meter
  and dotted trajectory update as the throw charges.
- Press **Q** to cycle between your purchased hotdog, soda, and foam horseshoe.
- Press **Escape** to pause and open the game menu.
- Six races form three rounds, with $150 and $250 bonuses in rounds two and three.
- Winning tickets pay the locked odds plus the returned stake.

The code is separated into systems under `src/`: configuration/state, models, stadium, race simulation, UI, first-person controls, and startup. The stadium wraps around the oval and the player's section contains seven detailed animated player stand-ins.

Online multiplayer and authoritative networking remain a separate engineering milestone; the visible neighboring players are currently local stand-ins, not network clients.

## Performance and seating

The oval grandstand uses instanced seats and background spectators so hundreds of visible crowd members
render in a handful of draw calls. Detailed character models are reserved for the seven players in the
local seating section. The player sits on the third tier, with the two lower rows positioned below the
track sightline. The scene also includes a lightweight gradient sky dome and instanced mountain horizon.

## Race format and physics

Every horse race now lasts three laps. Horses run at a higher base speed, turn continuously along the oval
tangent, and report their current lap through RaceBet and OddsWatch. Thrown items use gravity, bounce,
roll, lose momentum, and remain on the track for up to 18 seconds instead of disappearing on contact.

The phone includes RaceBet, TrackMart, OddsWatch, Bank, Leaderboard, and PonyCards applications.

## Throwable items

- **Ballpark Hotdog:** cheap and balanced.
- **Mega Soda:** faster projectile with a stronger slowdown.
- **Foam Horseshoe:** slower arc, highest price, and longest slowdown.
- **Turbo Carrot:** boosts a horse and grants temporary resistance to sabotage.

Hotdogs now tumble horses, soda slows them, and horseshoes apply both effects. The larger collision volume
makes clean-looking throws connect more consistently.
