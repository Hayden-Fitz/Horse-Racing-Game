# Realtime multiplayer server

Hotdog Derby now uses its own WebSocket protocol instead of loading Firebase in
the game. `server/realtime-server.js` runs with the local Node server and the
Cloudflare Worker in `cloudflare/` is the free-host deployment target.

## Local verification

```powershell
npm install
npm run check
npm run test:realtime
npm start
```

Open `http://localhost:8080` in two browser windows. Create a lobby in one,
join by its six-character code in the other, ready both players, and start.
The server health endpoint is `http://localhost:8080/api/health`.

The automated integration test opens three simultaneous WebSocket clients and
checks lobby creation, atomic seat claims, membership and host permissions,
live subscriptions, private-lobby filtering, and reconnection.

## Deploy on Cloudflare's free plan

Cloudflare Durable Objects are available on the Workers Free plan when using a
SQLite-backed class. The checked-in configuration creates one coordinated
Durable Object for active prototype rooms, so early testing does not multiply
idle compute usage by the number of lobbies.

1. Create or sign in to a Cloudflare account.
2. From this repository, run `npx wrangler@latest login`.
3. Run `npm run deploy:cloudflare`.
4. Copy the resulting `https://...workers.dev` address into
   `src/realtime-config.js` as `window.HOTDOG_SERVER_URL`.
5. Publish the updated browser game and visit `<worker-url>/api/health`.
6. Test from two different devices/networks before removing the legacy Firebase
   configuration files.

Current preview server:
https://hotdog-downs-realtime.calm-snowstorm.workers.dev

This preview must be claimed within Cloudflare's displayed claim window to keep
control of it. After claiming, redeploy from the same Cloudflare account and
update `src/realtime-config.js` if Cloudflare assigns a different address.

The current free allowance is not unlimited. As of September 2026, Cloudflare
documents 100,000 Durable Object requests and 13,000 GB-s per day on Workers
Free. Incoming WebSocket messages are billed at a 20:1 ratio, while outgoing
messages are not charged as requests. At the game's current five updates per
second, a full eight-player room plus host race snapshots is roughly 8,100
billable Durable Object requests per active hour, before unusual event bursts.
That is suitable for development and early playtests, but usage must be watched
as the player base grows.

- Durable Objects pricing: https://developers.cloudflare.com/durable-objects/platform/pricing/
- WebSocket guidance: https://developers.cloudflare.com/durable-objects/best-practices/websockets/

## Release security boundary

The prototype server validates room membership, atomic seats, host-only race
state, event ownership, message size, paths, and per-socket message rate. Client
IDs are still self-asserted, and transfers/bets are not yet server-authoritative.
Before selling the game, issue signed Steam/session tokens and move bankroll,
inventory, bets, trades, sabotage, payouts, and match results into trusted
server transactions.
