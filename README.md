# Globbal

Mobile-first geography word game with account-based multiplayer.

## Local development

```bash
npm install
cp .env.example .env   # then add your MongoDB URI
npm run start:local
```

Open [http://127.0.0.1:8080/](http://127.0.0.1:8080/) for the mobile preview.

## Multiplayer

1. Create accounts on the main menu
2. Search a username and send a challenge
3. Opponent accepts from **Games**
4. Both players open the match

Accounts and game records are stored in MongoDB when `MONGODB_URI` is set.

## Deploy

See [DEPLOY.md](./DEPLOY.md).

Required environment variables:

- `MONGODB_URI` — MongoDB Atlas connection string
- `MONGODB_DB` — database name (e.g. `ClusterGlobble`)

Do **not** commit `.env`.
