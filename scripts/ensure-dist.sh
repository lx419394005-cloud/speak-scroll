#!/usr/bin/env bash
# wrangler assets.directory 需要 client/dist 存在；本地 Vite 不依赖它
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DIST="$ROOT/client/dist"
if [[ ! -f "$DIST/index.html" ]]; then
  mkdir -p "$DIST"
  cat > "$DIST/index.html" <<'HTML'
<!doctype html>
<html lang="zh-CN">
  <head><meta charset="utf-8" /><title>Speak Scroll</title></head>
  <body>dev placeholder — use Vite on :5180</body>
</html>
HTML
  echo "[dev] created $DIST/index.html"
fi
