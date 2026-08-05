import { json, type Env } from './env'

const WORD_KEY = /^\/words\/((?:[a-z0-9_-]+\/)*[a-z0-9_-]+\.webp)$/i

/**
 * 词图走 R2：同域 `/words/**/*.webp`，长缓存。
 * 桶内 key 形如 `words/axolotl.webp` 或 `words/travel-fun/passport.webp`。
 * 未命中时回退到 Workers Assets（便于迁移期 / 本地未同步）。
 */
export async function handleWords(
  request: Request,
  env: Env,
  pathname: string,
): Promise<Response | null> {
  const match = pathname.match(WORD_KEY)
  if (!match) return null

  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response('Method Not Allowed', { status: 405 })
  }

  const file = match[1]!
  const key = `words/${file}`

  try {
    const object = await env.WORDS.get(key)
    if (object) {
      const headers = new Headers()
      object.writeHttpMetadata(headers)
      headers.set('etag', object.httpEtag)
      headers.set(
        'Cache-Control',
        'public, max-age=31536000, immutable',
      )
      if (!headers.has('Content-Type')) {
        headers.set('Content-Type', 'image/webp')
      }
      // 同域也可给预览/跨端用
      headers.set('Access-Control-Allow-Origin', '*')

      if (request.method === 'HEAD') {
        return new Response(null, { status: 200, headers })
      }
      return new Response(object.body, { status: 200, headers })
    }
  } catch (err) {
    console.error('[words] R2 get failed', key, err)
  }

  // 回退：仍打包在 Assets 里时可用
  try {
    const asset = await env.ASSETS.fetch(request)
    if (asset.ok) {
      const headers = new Headers(asset.headers)
      headers.set('Cache-Control', 'public, max-age=86400')
      headers.set('X-Words-Source', 'assets-fallback')
      return new Response(asset.body, { status: asset.status, headers })
    }
  } catch {
    /* ignore */
  }

  return json({ error: 'Word image not found', key }, 404)
}
