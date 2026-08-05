#!/usr/bin/env bash
# Speak Scroll — 一键上架 Cloudflare（需已 wrangler login）
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
WORKER="$ROOT/worker"
W=(npx --prefix "$WORKER" wrangler --cwd "$WORKER")

echo "==> 检查登录"
"${W[@]}" whoami

echo "==> 创建 / 复用 D1"
# 若已存在同名库会报错，可忽略后续用 list 取 id
DB_OUT="$("${W[@]}" d1 create speak-scroll 2>&1 || true)"
echo "$DB_OUT"
DB_ID="$(echo "$DB_OUT" | sed -n 's/.*"database_id": *"\([^"]*\)".*/\1/p' | head -1)"
if [[ -z "${DB_ID}" ]]; then
  echo "未从 create 拿到 database_id，尝试 list…"
  LIST_OUT="$("${W[@]}" d1 list 2>&1)"
  echo "$LIST_OUT"
  DB_ID="$(echo "$LIST_OUT" | python3 -c "
import sys,re
text=sys.stdin.read()
m=re.search(r'speak-scroll\s+([0-9a-f-]{36})', text)
if not m:
  m=re.search(r'\"name\":\s*\"speak-scroll\".*?\"uuid\":\s*\"([0-9a-f-]{36})\"', text, re.S)
if not m:
  m=re.search(r'([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}).*speak-scroll|speak-scroll.*?([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})', text, re.S)
print((m.group(1) if m and m.group(1) else (m.group(2) if m else '')) or '')
" 2>/dev/null || true)"
fi

# 配置里已有真实 uuid 也可直接用
if [[ -z "${DB_ID}" ]]; then
  DB_ID="$(python3 -c "
import re
from pathlib import Path
t=Path('worker/wrangler.jsonc').read_text()
m=re.search(r'\"database_id\"\s*:\s*\"([0-9a-f-]{36})\"', t)
print(m.group(1) if m else '')
")"
fi

if [[ -z "${DB_ID}" || "${DB_ID}" == "local-speak-scroll-db" ]]; then
  echo "请手动把 database_id 填进 worker/wrangler.jsonc 后重跑"
  exit 1
fi

echo "使用 database_id=$DB_ID"
python3 - <<PY
from pathlib import Path
import re
p = Path("worker/wrangler.jsonc")
text = p.read_text()
text2, n = re.subn(
    r'("database_id"\s*:\s*")[^"]*(")',
    r'\g<1>' + "$DB_ID" + r'\2',
    text,
    count=1,
)
if n != 1:
    raise SystemExit("无法替换 database_id")
p.write_text(text2)
print("已写入 wrangler.jsonc")
PY

echo "==> 远程建表"
"${W[@]}" d1 execute speak-scroll --remote --file=./migrations/0001_init.sql

echo "==> 创建 / 复用 R2 词图桶"
"${W[@]}" r2 bucket create speak-scroll-words 2>/dev/null || true

echo "==> 写入讯飞 Secrets"
if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi
: "${XFYUN_APP_ID:?缺少 XFYUN_APP_ID（.env）}"
: "${XFYUN_API_KEY:?缺少 XFYUN_API_KEY（.env）}"
: "${XFYUN_API_SECRET:?缺少 XFYUN_API_SECRET（.env）}"
printf '%s' "$XFYUN_APP_ID"     | "${W[@]}" secret put XFYUN_APP_ID
printf '%s' "$XFYUN_API_KEY"    | "${W[@]}" secret put XFYUN_API_KEY
printf '%s' "$XFYUN_API_SECRET" | "${W[@]}" secret put XFYUN_API_SECRET

echo "==> 构建前端并部署"
npm run build --prefix client
# 词图改走 R2，不塞进 Workers Assets
rm -rf "$ROOT/client/dist/words"
bash "$ROOT/scripts/upload-words-r2.sh"
"${W[@]}" deploy --name speak-scroll

echo "==> 完成。打开上面打印的 workers.dev 链接即可。"
echo "    词图：https://…/words/<id>.webp （R2，经 Worker）"
