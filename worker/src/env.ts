export type Env = {
  DB: D1Database
  ASSETS: Fetcher
  XFYUN_APP_ID: string
  XFYUN_API_KEY: string
  XFYUN_API_SECRET: string
}

export const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

export function json(data: unknown, status = 200): Response {
  return Response.json(data, { status, headers: corsHeaders })
}
