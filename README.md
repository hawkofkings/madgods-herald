# The Madgod's Herald — Backend

Node.js + Express + Discord OAuth2 + Discord bot + SQLite backend for the GitHub Pages site.

## Important current scope

This is the first integration foundation. It includes Discord OAuth2, guild-membership verification, persistent sessions, a permanent assignment record, server-side scoring for the original nine A/B questions, and house-role assignment.

**Greymarch is deliberately guarded.** `/greymarch status` works, but `/greymarch start` refuses to run until the resumable, confirmed realm-wide role/assignment reset and the separate Greymarch quiz are implemented. Do not remove this safeguard.

## 1. Discord Developer Portal

In your existing application:

1. Open **OAuth2 → General**.
2. Add this exact redirect URI after Render creates your service:
   `https://YOUR-RENDER-SERVICE.onrender.com/auth/discord/callback`
3. Copy the Application ID and Client Secret into Render environment variables.
4. Keep the bot token private. Never paste it into website files or commit it to GitHub.
5. In the bot's server role hierarchy, place the bot's role above the Mania and Dementia roles.
6. Ensure the bot has **Manage Roles** permission and is a member of the target server.
7. Enable **Server Members Intent** under Bot → Privileged Gateway Intents.

The bot does not need the Message Content intent.

## 2. Render deployment

1. Push this folder to a private GitHub repository (or a subfolder in your existing repository).
2. In Render, choose **New → Blueprint** and connect the repository.
3. Render detects `render.yaml`. Create the service.
4. Set the environment variables listed below in the Render service dashboard.
5. Keep the persistent disk mounted at `/var/data`.

Required environment variables:

- `DISCORD_CLIENT_ID`
- `DISCORD_CLIENT_SECRET`
- `DISCORD_REDIRECT_URI`
- `DISCORD_BOT_TOKEN`
- `DISCORD_GUILD_ID`
- `MANIA_ROLE_ID`
- `DEMENTIA_ROLE_ID`
- `FRONTEND_ORIGIN` (the exact GitHub Pages origin, no trailing slash)
- `SESSION_SECRET` (Render can generate this)
- `DATABASE_PATH=/var/data/herald.sqlite`
- `TRUST_PROXY=true`

`FRONTEND_ORIGIN` examples:
- `https://yourname.github.io` for a project hosted at `https://yourname.github.io/repository/`
- `https://yourname.github.io` for a user site at `https://yourname.github.io`

Do not add a trailing slash to `FRONTEND_ORIGIN`.

## 3. Local testing

```bash
npm install
cp .env.example .env
# Fill in .env values
npm start
```

The API health endpoint is `/health`.

## 4. Connect the quiz page

The existing quiz page is a front-end prototype. It currently keeps answers in the browser and displays a not-yet-connected notice. Once Render is deployed, configure `API_BASE` in `quiz.html`, add a Discord sign-in button that opens `/auth/discord`, call `/api/me` on return, and POST the nine answer indexes to `/api/sort`.

The answer indexes are:
- `0` = first answer (Mania)
- `1` = second answer (Dementia)

Do not add the scoring mapping to client-side JavaScript. The backend currently validates nine binary answers and performs the scoring itself.

## 5. Current API routes

- `GET /health` — service health
- `GET /auth/discord` — start OAuth2
- `GET /auth/discord/callback` — OAuth2 callback and guild membership check
- `GET /api/me` — current user and permanent assignment state
- `POST /api/sort` — validate answers, score privately, assign role, save assignment
- `POST /api/logout` — destroy session

## 6. Important production notes

- Use the Render persistent disk for SQLite. The ephemeral filesystem is not suitable for permanent assignments.
- Use the exact GitHub Pages origin for CORS and session cookies.
- Browser requests to the API must use `credentials: "include"`.
- This initial build does not yet include a public Haskill result announcement, the separate Greymarch question set, or the resumable mass role-clearing workflow.
- The bot's Manage Roles permission and role hierarchy must be correct or Discord will reject role assignment.
