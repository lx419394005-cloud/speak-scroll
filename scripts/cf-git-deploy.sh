#!/usr/bin/env bash
# Cloudflare Workers Builds（连 GitHub）的 Deploy command 入口：
#   上传词图到 R2 → 部署 Worker
# Dashboard 填：npm run deploy:git
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "==> Install worker deps"
npm ci --prefix worker --legacy-peer-deps

echo "==> Upload word images to R2"
bash "$ROOT/scripts/upload-words-r2.sh"

echo "==> Deploy Worker"
npm run deploy --prefix worker
