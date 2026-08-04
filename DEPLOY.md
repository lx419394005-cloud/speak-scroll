# Speak Scroll 上架 Cloudflare

整站跑在一个 Worker 上：

| 部分 | 说明 |
|------|------|
| 前端 | `client/dist` 静态资源（Workers Assets） |
| 讯飞鉴权 | `GET /api/ise-auth`（Secrets） |
| 排行榜 | `GET/POST /api/leaderboard`（D1） |

线上域名形如：`https://speak-scroll.<你的子域>.workers.dev`

---

## 推荐工作流：GitHub + Cloud Agent + 自动部署

```text
本机 / Cursor Cloud Agent
        │  push / PR merge
        ▼
     GitHub (main)
        │  GitHub Actions
        ▼
  Cloudflare Workers  ← 实时可玩的线上站
```

1. **代码进 GitHub**（不要提交 `.env` / `.dev.vars`）
2. **Cloud Agent** 对着这个仓库改代码、提 PR；合并进 `main` 就会自动部署
3. **Cloudflare** 用 Actions（本仓库已带 `.github/workflows/deploy.yml`）或 Dashboard 的 Workers Git 集成

### GitHub Secrets（仓库 Settings → Secrets）

| Secret | 说明 |
|--------|------|
| `CLOUDFLARE_API_TOKEN` | Cloudflare API Token（Workers 编辑权限） |
| `CLOUDFLARE_ACCOUNT_ID` | 账号 ID（Dashboard 右侧可复制） |

讯飞密钥仍用 `wrangler secret put` 写在 Worker 上（不要放进 GitHub Secrets 除非改成 Actions 同步）。

首次仍需在本机或 CI 外执行一次：D1 建库/建表 + `XFYUN_*` secrets（见下文）。

---

## 一键上架（本机）

本机已 `wrangler login` 后，在**系统终端**执行：

```bash
npm run deploy:cf
```

脚本会：创建 D1 → 写 `database_id` → 建表 → 写入讯飞 Secrets → build 前端 → `wrangler deploy`。

词图已压成 WebP。之后日常改代码：`git push` → Actions 自动上线。

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
# client :5173  |  express ise-auth :8790  |  worker/D1 :8787
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

3. **打开站点是空白**  
   先确认 `client/dist` 存在（部署脚本会先 build）。词图在 `client/public/words/`，会打进 dist。

4. **麦克风 / 讯飞连不上**  
   必须用 HTTPS（workers.dev 自带）。浏览器允许麦克风；讯飞控制台应用状态正常。
