import { json, type Env } from './env'

const WORD_KEY = /^\/words\/((?:[a-z0-9_-]+\/)*[a-z0-9_-]+\.webp)$/i

/**
 * 词图走 R2：同域 /words/.../*.webp，长缓存。
 * 桶内 key 形如 words/axolotl.webp 或 words/travel-fun/passport.webp。
 * 未命中时返回真正的 404（绝不回退 SPA HTML，否则浏览器会把 HTML 当图缓存）。
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
      headers.set('Access-Control-Allow-Origin', '*')
      headers.set('X-Content-Type-Options', 'nosniff')

      if (request.method === 'HEAD') {
        return new Response(null, { status: 200, headers })
      }
      return new Response(object.body, { status: 200, headers })
    }
  } catch (err) {
    console.error('[words] R2 get failed', key, err)
  }

  return new Response(JSON.stringify({ error: 'Word image not found', key }), {
    status: 404,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      'Access-Control-Allow-Origin': '*',
    },
  })
}
