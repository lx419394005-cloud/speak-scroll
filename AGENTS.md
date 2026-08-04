# AGENTS.md

## Cursor Cloud specific instructions

Speak Scroll (看图说词) is a 1‑minute "see the picture, say the English word out loud" game. It has three dev services, all started together with `npm run dev` (see `README.md` / root `package.json`):

- `client` — React + Vite frontend on http://localhost:5173 (the URL you open).
- `server` — Express iFlytek/讯飞 ISE auth service on http://localhost:8790 (`server/index.ts`).
- `worker` — Cloudflare Worker + D1 global leaderboard on http://localhost:8787 (`wrangler dev`, runs in local mode).

### Non-obvious caveats

- Vite proxies API calls (`client/vite.config.ts`): `/api/leaderboard` → worker `:8787`, and everything else under `/api` → Express `:8790`. Always drive the app through `:5173` so both proxies apply.
- The global leaderboard works fully offline: `wrangler dev` uses a local D1 instance and the worker auto-creates the table on first request (`ensureSchema` in `worker/src/leaderboard.ts`). Pre-seeding via `npm run db:local --prefix worker` is optional. You can exercise it end-to-end without any credentials, e.g. `curl -X POST http://localhost:5173/api/leaderboard -H 'Content-Type: application/json' -d '{"nickname":"Test","score":5}'` then `curl http://localhost:5173/api/leaderboard`.
- The pronunciation-scoring core loop (pressing "开麦开玩" to actually play) needs a real microphone (`getUserMedia`) plus iFlytek/讯飞 `XFYUN_APP_ID` / `XFYUN_API_KEY` / `XFYUN_API_SECRET`. It cannot run in a headless VM. Without those creds, `/api/ise-auth` returning `讯飞密钥未配置` and the server logging empty credentials is EXPECTED, not a bug. To enable it locally, put the keys in a root `.env` (see `.env.example`); for the unified worker use `worker/.dev.vars`.
- The `worker` package must be installed with `npm install --prefix worker --legacy-peer-deps` (peer-dep conflict otherwise). This is already handled by the startup update script.

### Lint / build / test

- Lint: `npm run lint --prefix client` (oxlint). No lint config exists for `server` or `worker`.
- Build (production client bundle): `npm run build --prefix client` (`tsc -b && vite build`).
- There is no automated test suite in this repo.
- `npm run deploy` / `scripts/cf-deploy.sh` are for Cloudflare production deploys (need `wrangler login` + secrets); do not run them for local development.
