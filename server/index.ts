import crypto from 'node:crypto'
import fs from 'node:fs'
import cors from 'cors'
import dotenv from 'dotenv'
import express from 'express'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

/** 按优先级查找 .env */
function resolveEnvPath(): string {
  const candidates = [
    path.resolve(__dirname, '../.env'),
    path.resolve(__dirname, '.env'),
    path.resolve(process.cwd(), '.env'),
    path.resolve(process.cwd(), '../.env'),
  ]
  for (const p of candidates) {
    if (fs.existsSync(p)) return p
  }
  return candidates[0]!
}

const ENV_PATH = resolveEnvPath()

function loadEnv() {
  const result = dotenv.config({ path: ENV_PATH, override: true })
  if (result.error) {
    console.warn('[env] failed to read', ENV_PATH, result.error.message)
  }

  return {
    appId: (process.env.XFYUN_APP_ID || '').trim(),
    apiKey: (process.env.XFYUN_API_KEY || '').trim(),
    apiSecret: (process.env.XFYUN_API_SECRET || '').trim(),
    envPath: ENV_PATH,
  }
}

const app = express()
const boot = loadEnv()
const PORT = Number(process.env.PORT || 8790)

app.use(cors({ origin: true }))

function isPlaceholder(value: string) {
  return !value || value.startsWith('your_')
}

function buildIseAuthUrl(apiKey: string, apiSecret: string): string {
  const host = 'ise-api.xfyun.cn'
  const pathName = '/v2/open-ise'
  const date = new Date().toUTCString()
  const signatureOrigin = `host: ${host}\ndate: ${date}\nGET ${pathName} HTTP/1.1`
  const signature = crypto
    .createHmac('sha256', apiSecret)
    .update(signatureOrigin)
    .digest('base64')
  const authorizationOrigin = `api_key="${apiKey}", algorithm="hmac-sha256", headers="host date request-line", signature="${signature}"`
  const authorization = Buffer.from(authorizationOrigin).toString('base64')
  return (
    `wss://${host}${pathName}` +
    `?authorization=${encodeURIComponent(authorization)}` +
    `&date=${encodeURIComponent(date)}` +
    `&host=${encodeURIComponent(host)}`
  )
}

app.get('/api/health', (_req, res) => {
  const { appId, apiKey, apiSecret, envPath } = loadEnv()
  res.json({
    ok: true,
    configured: !isPlaceholder(appId) && !isPlaceholder(apiKey) && !isPlaceholder(apiSecret),
    envPath,
    appId,
    apiKeyPrefix: apiKey.slice(0, 4),
    apiSecretPrefix: apiSecret.slice(0, 4),
  })
})

app.get('/api/ise-auth', (_req, res) => {
  const { appId, apiKey, apiSecret, envPath } = loadEnv()

  if (isPlaceholder(appId) || isPlaceholder(apiKey) || isPlaceholder(apiSecret)) {
    res.status(500).json({
      error: `讯飞密钥未配置。请编辑 ${envPath}`,
      envPath,
    })
    return
  }

  console.log(
    `[ise-auth] from ${envPath} appId=${appId} key=${apiKey.slice(0, 4)}… secret=${apiSecret.slice(0, 4)}…`,
  )

  res.json({
    appId,
    url: buildIseAuthUrl(apiKey, apiSecret),
  })
})

app.listen(PORT, () => {
  console.log(`ISE auth server on http://localhost:${PORT}`)
  console.log(`[env] using ${ENV_PATH}`)
  console.log(
    `[env] appId=${boot.appId || '(empty)'} key=${boot.apiKey.slice(0, 4) || '(empty)'}… secret=${boot.apiSecret.slice(0, 4) || '(empty)'}…`,
  )
  if (isPlaceholder(boot.appId) || isPlaceholder(boot.apiKey) || isPlaceholder(boot.apiSecret)) {
    console.warn('[env] credentials missing or still placeholders')
  }
})
