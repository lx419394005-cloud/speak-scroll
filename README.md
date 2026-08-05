# Speak Scroll

紧张节奏的看图说词：滑稽图片冲过来，大声说出英文单词才能过关。

## 上架 Cloudflare

完整步骤见 **[DEPLOY.md](./DEPLOY.md)**。

一句话上线（需已登录 wrangler、配好 D1 id 与 secrets）：

```bash
npm run deploy
```

## 本地开发

1. 复制环境变量并填入讯飞密钥：

```bash
cp .env.example .env
```

2. 安装依赖：

```bash
npm install --prefix server
npm install --prefix client
npm install --prefix worker --legacy-peer-deps
npm install
```

3. 启动：

```bash
npm run dev
```

- 前端：http://localhost:5180
- 鉴权服务：http://localhost:8790
- 排行榜 Worker：http://localhost:8787

## 玩法

- 填写昵称后开始
- 只看图，说对才翻下一张；整局 1 分钟
- 本机纪录 + Cloudflare D1 全球排行榜
