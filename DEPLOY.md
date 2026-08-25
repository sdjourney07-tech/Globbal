# Deploying Globbal (online + accounts)

The app is one Node process: **HTTP static files**, **REST account APIs**, and **`/ws`** WebSockets. Run **`npm start`** (runs `server-online.js`).

## Requirements

- **Single instance** (or sticky sessions). Live matches stay in memory.
- **WebSockets** enabled on `/ws`.
- **Accounts store**:
  - Set **`MONGODB_URI`** to use MongoDB (recommended for production).
  - If unset, accounts are stored in **`data/accounts-store.json`** (fine for local testing).

## Environment variables

| Variable        | Default   | Meaning |
|-----------------|-----------|---------|
| `PORT`          | `8080`    | HTTP listen port |
| `HOST`          | `0.0.0.0` | Bind address |
| `MONGODB_URI`   | _(empty)_ | MongoDB connection string. When empty, uses local JSON file store. |
| `ROOM_IDLE_MS`  | `3600000` | After **both** WebSockets disconnect, drop the in-memory match after this many ms. `0` / `never` = keep until process restart. |

## Multiplayer flow

1. Players create accounts / sign in on the main menu.
2. Search another username → **Challenge**.
3. Opponent opens **Games** → **Accept**.
4. Both open the match from **Games** (or the Accept button).

Room codes are removed.

## Docker

```bash
docker build -t globble-online .
docker run -p 8080:8080 -e MONGODB_URI="mongodb+srv://..." globble-online
```

## Railway / Render / Fly.io

1. Connect the repo.
2. Start command: `npm start` or `node server-online.js`.
3. One replica / sticky sessions for WebSockets.
4. Set `MONGODB_URI` to your Atlas (or other) cluster.
