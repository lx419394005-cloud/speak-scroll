#!/usr/bin/env bash
# 把 client/public/words/**/*.webp 同步到 R2（桶 speak-scroll-words）
# 用法：
#   bash scripts/upload-words-r2.sh          # 远程桶
#   bash scripts/upload-words-r2.sh --local  # wrangler 本地模拟桶
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WORKER="$ROOT/worker"
WORDS_DIR="$ROOT/client/public/words"
BUCKET="speak-scroll-words"
W=(npx --prefix "$WORKER" wrangler --cwd "$WORKER")

LOCAL=0
if [[ "${1:-}" == "--local" ]]; then
  LOCAL=1
fi

if [[ ! -d "$WORDS_DIR" ]]; then
  echo "找不到词图目录: $WORDS_DIR" >&2
  exit 1
fi

FILES=()
while IFS= read -r -d '' f; do
  FILES+=("$f")
done < <(find "$WORDS_DIR" -type f -name '*.webp' -print0 | sort -z)

if [[ ${#FILES[@]} -eq 0 ]]; then
  echo "没有 .webp 可上传" >&2
  exit 1
fi

if [[ "$LOCAL" -eq 0 ]]; then
  if [[ -z "${CLOUDFLARE_API_TOKEN:-}" ]] && ! "${W[@]}" whoami >/dev/null 2>&1; then
    echo "缺少 Cloudflare 鉴权：设置 CLOUDFLARE_API_TOKEN（CI）或先 wrangler login（本机）" >&2
    exit 1
  fi
  echo "==> 确保远程桶存在: $BUCKET"
  "${W[@]}" r2 bucket create "$BUCKET" 2>/dev/null || true
fi

echo "==> 上传 ${#FILES[@]} 张词图 → $BUCKET/words/ …"
# 并行上传，加快 CI / Workers Builds
UPLOAD_PIDS=()
UPLOAD_FAIL=0
for f in "${FILES[@]}"; do
  rel="${f#"$WORDS_DIR"/}"
  key="words/$rel"
  args=(r2 object put "$BUCKET/$key" --file="$f" --content-type=image/webp --cache-control='public, max-age=31536000, immutable')
  if [[ "$LOCAL" -eq 1 ]]; then
    args+=(--local)
  else
    args+=(--remote)
  fi
  (
    echo "  put $key"
    "${W[@]}" "${args[@]}"
  ) &
  UPLOAD_PIDS+=($!)
  # 限制并发，避免打爆 API
  if (( ${#UPLOAD_PIDS[@]} >= 6 )); then
    for pid in "${UPLOAD_PIDS[@]}"; do
      wait "$pid" || UPLOAD_FAIL=1
    done
    UPLOAD_PIDS=()
  fi
done
for pid in "${UPLOAD_PIDS[@]:-}"; do
  wait "$pid" || UPLOAD_FAIL=1
done
if [[ "$UPLOAD_FAIL" -ne 0 ]]; then
  echo "部分词图上传失败" >&2
  exit 1
fi

echo "==> 完成。线上由 Worker 提供 GET /words/.../*.webp（长缓存）。"
