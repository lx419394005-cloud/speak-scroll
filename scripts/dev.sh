#!/usr/bin/env bash
# 本地一键开发：鉴权 + 排行榜 Worker + Vite
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

bash "$ROOT/scripts/ensure-dist.sh"

if [[ ! -f "$ROOT/.env" ]]; then
  echo "缺少 $ROOT/.env — 请从本机已有项目复制，或 cp .env.example .env 后填入讯飞密钥" >&2
  exit 1
fi

if grep -q 'your_app_id\|your_api_key\|your_api_secret' "$ROOT/.env"; then
  echo "警告: .env 里还是占位密钥，开麦评测会失败。请换成真实 XFYUN_*。" >&2
fi

# 本地 D1 表（已存在则忽略错误）
npm run db:local --prefix worker >/dev/null 2>&1 || true

exec npx concurrently -n server,worker,client -c cyan,yellow,magenta \
  "npm run dev --prefix server" \
  "npm run dev --prefix worker" \
  "npm run dev --prefix client"
