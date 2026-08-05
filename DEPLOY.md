# Speak Scroll 上架 Cloudflare

整站跑在一个 Worker 上：

| 部分 | 说明 |
|------|------|
| 前端 | `client/dist` 静态资源（Workers Assets） |
| 词图 | Cloudflare **R2**（`speak-scroll-words`），经 Worker `GET /words/*.webp` |
| 讯飞鉴权 | `GET /api/ise-auth`（Secrets） |
| 排行榜 | `GET/POST /api/leaderboard`（D1） |

线上域名形如：`https://speak-scroll.<你的子域>.workers.dev`

---

## 推荐工作流：GitHub → Cloudflare Workers Builds

```text
本机 / Cursor
        │  push / PR merge → main
        ▼
     GitHub
        │  Cloudflare 拉取（Workers Builds）
        ▼
  build → 上传词图到 R2 → wrangler deploy
        ▼
  线上 Worker 可玩
```

**只走这一条自动部署**（不要和 GitHub Actions 同时开着 push 部署，会双部署）。

### Cloudflare Dashboard（连 GitHub）必填

Workers & Pages → `speak-scroll` → Settings → Builds：

| 项 | 建议值 |
|----|--------|
| Root directory | 留空（仓库根） |
| Build command | `npm run build` |
| Deploy command | `npm run deploy:git` |
| Production branch | `main` |

说明：

- `npm run build` = 装 client + 打前端包，并删掉 `dist/words`（词图不进 Assets）
- `npm run deploy:git` = 装 worker → **上传 R2 词图** → `wrangler deploy`
- Workers Builds 自带的 API Token 需含 **Workers R2 Storage (edit)**；若用「Create new token」默认就有。旧 Token 若只有 Scripts 权限，上传会失败，到 Builds → API token 重建一枚即可。

改完 Deploy command 后，再 push 一次 `main`（或 Dashboard 里 Retry build）。

### 备用：GitHub Actions

`.github/workflows/deploy.yml` 默认只支持手动 `workflow_dispatch`，避免和 Workers Builds 抢部署。

若改用 Actions 当主路径：在仓库 Secrets 配好 `CLOUDFLARE_API_TOKEN`（含 R2 edit）+ `CLOUDFLARE_ACCOUNT_ID`，并把 workflow 的 `on` 改回 `push: [main]`；同时关掉 Cloudflare Builds。

讯飞密钥仍用 `wrangler secret put` 写在 Worker 上。

首次仍需在本机执行一次：D1 建库/建表 + `XFYUN_*` secrets + R2 桶（见下文）。

---

## 一键上架（本机）

本机已 `wrangler login` 后，在**系统终端**执行：

```bash
npm run deploy:cf
```

脚本会：创建 D1 → 写 `database_id` → 建表 → 写入讯飞 Secrets → build 前端 → `wrangler deploy`。

词图源文件在 `client/public/words/`（本地 Vite 仍直接读这里）。上线时同步到 R2，Worker 提供同域 `/words/*.webp`（`Cache-Control: immutable`）。之后日常改代码：`git push` → Actions 自动上线。

---

## 0. 一次性准备

```bash
# 仓库根目录
npm install --prefix client
npm install --prefix worker --legacy-peer-deps

cd worker
npx wrangler login
```

确认本机能读到讯飞密钥（根目录 `.env`）：

```env
XFYUN_APP_ID=...
XFYUN_API_KEY=...
XFYUN_API_SECRET=...
```

---

## 1. 创建 D1 数据库

```bash
cd worker
npm run db:create
```

把终端输出的 `database_id` 写进 `worker/wrangler.jsonc`：

```jsonc
"d1_databases": [
  {
    "binding": "DB",
    "database_name": "speak-scroll",
    "database_id": "这里换成真实 ID"
  }
]
```

建表（远程）：

```bash
npm run db:remote
```

---

## 1.5 创建 R2 词图桶并上传

```bash
cd worker
npm run r2:create
cd ..
npm run words:upload
```

桶名固定为 `speak-scroll-words`，对象 key 为 `words/<id>.webp`。  
改词图后重新跑 `npm run words:upload`（`npm run deploy` / `deploy:cf` 也会自动上传）。

本地一体 Worker 调试可先：

```bash
npm run words:upload:local
```

---

## 2. 写入讯飞 Secrets

在 `worker/` 下执行（会交互式粘贴，勿提交到 git）：

```bash
npx wrangler secret put XFYUN_APP_ID
npx wrangler secret put XFYUN_API_KEY
npx wrangler secret put XFYUN_API_SECRET
```

也可从根目录 `.env` 一键注入（zsh）：

```bash
cd /Users/loong/Dev/software/english-speaker
set -a && source .env && set +a
cd worker
printf '%s' "$XFYUN_APP_ID"     | npx wrangler secret put XFYUN_APP_ID
printf '%s' "$XFYUN_API_KEY"    | npx wrangler secret put XFYUN_API_KEY
printf '%s' "$XFYUN_API_SECRET" | npx wrangler secret put XFYUN_API_SECRET
```

---

## 3. 构建前端并部署

在仓库根目录：

```bash
npm run deploy
```

等价于：

```bash
npm run build --prefix client
npm run deploy --prefix worker
```

部署成功后终端会打印 `https://speak-scroll.xxxx.workers.dev`，打开即可玩。

健康检查：

```text
https://speak-scroll.xxxx.workers.dev/api/health
```

应返回 `"configured": true`。

---

## 4. 自定义域名（可选）

Cloudflare Dashboard → Workers & Pages → `speak-scroll` → Settings → Domains & Routes → Add  
按提示绑到你的域名即可。

---

## 本地开发（对照）

日常开发仍可用三进程：

```bash
npm run dev
# client :5180  |  express ise-auth :8790  |  worker/D1 :8787
```

若要用「接近线上」的一体 Worker（需先 `npm run build --prefix client`）：

```bash
# 本地 secrets 放 worker/.dev.vars
cd worker
cat > .dev.vars <<EOF
XFYUN_APP_ID=...
XFYUN_API_KEY=...
XFYUN_API_SECRET=...
EOF
npm run db:local
npm run dev
# 打开 http://localhost:8787
```

`.dev.vars` 已在 `.gitignore` 中，不要提交。

---

## 更新上线

改代码后：

```bash
npm run deploy
```

只改排行榜表结构时再跑：

```bash
npm run db:remote --prefix worker
```

---

## 常见问题

1. **排行榜 500 / D1 报错**  
   检查 `wrangler.jsonc` 的 `database_id` 是否已换成远程 ID，并执行过 `npm run db:remote`。

2. **`/api/ise-auth` 提示密钥未配置**  
   Secrets 未写入或写错环境；用 `npx wrangler secret list` 核对。

3. **打开站点是空白 / 词图 404**  
   先确认 `client/dist` 存在（部署脚本会先 build）。词图应在 R2：Workers Builds 的 Deploy command 必须是 `npm run deploy:git`（会跑 `words:upload`）。若仍 404，本机跑一次 `npm run words:upload`，并确认 `wrangler.jsonc` 绑了 `speak-scroll-words`。本地 Vite 仍用 `client/public/words/`。

4. **麦克风 / 讯飞连不上**  
   必须用 HTTPS（workers.dev 自带）。浏览器允许麦克风；讯飞控制台应用状态正常。
