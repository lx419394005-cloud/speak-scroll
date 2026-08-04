import { json, type Env } from './env'

type PlayerRow = {
  nickname: string
  best_score: number
  plays: number
  updated_at: number
}

const TOP_N = 20
const MAX_NICK = 16

function normalizeNickname(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const nick = raw.trim().replace(/\s+/g, ' ')
  if (nick.length < 1 || nick.length > MAX_NICK) return null
  if (!/^[\p{L}\p{N} _.\-·]+$/u.test(nick)) return null
  return nick
}

async function ensureSchema(db: D1Database) {
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS players (
        nickname TEXT PRIMARY KEY COLLATE NOCASE,
        best_score INTEGER NOT NULL,
        plays INTEGER NOT NULL DEFAULT 1,
        updated_at INTEGER NOT NULL
      )`,
    )
    .run()
  await db
    .prepare(
      `CREATE INDEX IF NOT EXISTS idx_players_best_score
       ON players (best_score DESC, updated_at ASC)`,
    )
    .run()
}

async function topPlayers(db: D1Database): Promise<PlayerRow[]> {
  const { results } = await db
    .prepare(
      `SELECT nickname, best_score, plays, updated_at
       FROM players
       ORDER BY best_score DESC, updated_at ASC
       LIMIT ?`,
    )
    .bind(TOP_N)
    .all<PlayerRow>()
  return results ?? []
}

async function playerRank(db: D1Database, nickname: string, score: number): Promise<number> {
  const better = await db
    .prepare(
      `SELECT COUNT(*) AS c FROM players
       WHERE best_score > ?
          OR (best_score = ? AND updated_at < (
            SELECT updated_at FROM players WHERE nickname = ? COLLATE NOCASE
          ))`,
    )
    .bind(score, score, nickname)
    .first<{ c: number }>()
  return Number(better?.c ?? 0) + 1
}

function mapEntries(entries: PlayerRow[]) {
  return entries.map((row, i) => ({
    rank: i + 1,
    nickname: row.nickname,
    score: row.best_score,
    plays: row.plays,
    updatedAt: row.updated_at,
  }))
}

export async function handleLeaderboard(request: Request, env: Env): Promise<Response> {
  await ensureSchema(env.DB)

  if (request.method === 'GET') {
    const entries = await topPlayers(env.DB)
    return json({ entries: mapEntries(entries) })
  }

  if (request.method === 'POST') {
    const body = (await request.json().catch(() => null)) as {
      nickname?: unknown
      score?: unknown
    } | null

    const nickname = normalizeNickname(body?.nickname)
    const score = Number(body?.score)

    if (!nickname) {
      return json({ error: '昵称无效（1–16 字，可用中英文）' }, 400)
    }
    if (!Number.isFinite(score) || score < 0 || score > 999) {
      return json({ error: '分数无效' }, 400)
    }

    const safeScore = Math.floor(score)
    const now = Date.now()

    const existing = await env.DB.prepare(
      `SELECT nickname, best_score, plays, updated_at
       FROM players WHERE nickname = ? COLLATE NOCASE`,
    )
      .bind(nickname)
      .first<PlayerRow>()

    let improved = false
    if (!existing) {
      await env.DB.prepare(
        `INSERT INTO players (nickname, best_score, plays, updated_at)
         VALUES (?, ?, 1, ?)`,
      )
        .bind(nickname, safeScore, now)
        .run()
      improved = true
    } else {
      const nextBest = Math.max(existing.best_score, safeScore)
      improved = safeScore > existing.best_score
      await env.DB.prepare(
        `UPDATE players
         SET best_score = ?,
             plays = plays + 1,
             updated_at = ?
         WHERE nickname = ? COLLATE NOCASE`,
      )
        .bind(nextBest, improved ? now : existing.updated_at, nickname)
        .run()
    }

    const entries = await topPlayers(env.DB)
    const best = existing == null ? safeScore : Math.max(existing.best_score, safeScore)
    const rank = await playerRank(env.DB, nickname, best)

    return json({
      ok: true,
      improved,
      rank,
      best,
      entries: mapEntries(entries),
    })
  }

  return json({ error: 'Method not allowed' }, 405)
}
