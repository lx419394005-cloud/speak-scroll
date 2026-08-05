import { json, type Env } from './env'

function isPlaceholder(value: string | undefined) {
  return !value || value.startsWith('your_')
}

async function hmacSha256Base64(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message))
  const bytes = new Uint8Array(sig)
  let binary = ''
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]!)
  }
  return btoa(binary)
}

async function buildIseAuthUrl(apiKey: string, apiSecret: string): Promise<string> {
  const host = 'ise-api.xfyun.cn'
  const pathName = '/v2/open-ise'
  const date = new Date().toUTCString()
  const signatureOrigin = `host: ${host}\ndate: ${date}\nGET ${pathName} HTTP/1.1`
  const signature = await hmacSha256Base64(apiSecret, signatureOrigin)
  const authorizationOrigin = `api_key="${apiKey}", algorithm="hmac-sha256", headers="host date request-line", signature="${signature}"`
  const authorization = btoa(authorizationOrigin)
  return (
    `wss://${host}${pathName}` +
    `?authorization=${encodeURIComponent(authorization)}` +
    `&date=${encodeURIComponent(date)}` +
    `&host=${encodeURIComponent(host)}`
  )
}

export async function handleIseAuth(env: Env): Promise<Response> {
  const appId = (env.XFYUN_APP_ID || '').trim()
  const apiKey = (env.XFYUN_API_KEY || '').trim()
  const apiSecret = (env.XFYUN_API_SECRET || '').trim()

  if (isPlaceholder(appId) || isPlaceholder(apiKey) || isPlaceholder(apiSecret)) {
    return json(
      {
        error:
          '讯飞密钥未配置。请用 wrangler secret put XFYUN_APP_ID / XFYUN_API_KEY / XFYUN_API_SECRET',
      },
      500,
    )
  }

  return json({
    appId,
    url: await buildIseAuthUrl(apiKey, apiSecret),
  })
}

export async function handleHealth(env: Env): Promise<Response> {
  const appId = (env.XFYUN_APP_ID || '').trim()
  const apiKey = (env.XFYUN_API_KEY || '').trim()
  const apiSecret = (env.XFYUN_API_SECRET || '').trim()
  let wordsBucket = false
  try {
    wordsBucket = Boolean(env.WORDS)
  } catch {
    wordsBucket = false
  }
  return json({
    ok: true,
    configured: !isPlaceholder(appId) && !isPlaceholder(apiKey) && !isPlaceholder(apiSecret),
    appIdPrefix: appId.slice(0, 4),
    wordsR2: wordsBucket,
  })
}
