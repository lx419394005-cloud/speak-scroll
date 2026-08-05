import { corsHeaders, json, type Env } from './env'
import { handleHealth, handleIseAuth } from './ise-auth'
import { handleLeaderboard } from './leaderboard'
import { handleWords } from './words'

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders })
    }

    const url = new URL(request.url)

    try {
      if (url.pathname === '/api/health') {
        return handleHealth(env)
      }
      if (url.pathname === '/api/ise-auth') {
        return handleIseAuth(env)
      }
      if (url.pathname === '/api/leaderboard') {
        return handleLeaderboard(request, env)
      }

      const wordRes = await handleWords(request, env, url.pathname)
      if (wordRes) return wordRes

      if (url.pathname.startsWith('/api/')) {
        return json({ error: 'Not found' }, 404)
      }

      // 静态前端（Vite build → client/dist）
      return env.ASSETS.fetch(request)
    } catch (err) {
      console.error(err)
      return json(
        { error: err instanceof Error ? err.message : 'Server error' },
        500,
      )
    }
  },
} satisfies ExportedHandler<Env>
