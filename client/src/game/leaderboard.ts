export type LeaderboardEntry = {
  rank: number
  nickname: string
  score: number
  plays: number
  updatedAt: number
}

export type LeaderboardResponse = {
  entries: LeaderboardEntry[]
}

export type SubmitScoreResponse = {
  ok: boolean
  improved: boolean
  rank: number
  best: number
  entries: LeaderboardEntry[]
  error?: string
}

const NICK_KEY = 'speak-scroll-nickname'

export function loadNickname(): string {
  try {
    return localStorage.getItem(NICK_KEY)?.trim() || ''
  } catch {
    return ''
  }
}

export function saveNickname(nickname: string) {
  try {
    localStorage.setItem(NICK_KEY, nickname.trim())
  } catch {
    /* ignore */
  }
}

export async function fetchLeaderboard(): Promise<LeaderboardEntry[]> {
  const res = await fetch('/api/leaderboard')
  if (!res.ok) throw new Error('排行榜加载失败')
  const data = (await res.json()) as LeaderboardResponse
  return data.entries ?? []
}

export async function submitScore(
  nickname: string,
  score: number,
): Promise<SubmitScoreResponse> {
  const res = await fetch('/api/leaderboard', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nickname, score }),
  })
  const data = (await res.json().catch(() => ({}))) as SubmitScoreResponse & {
    error?: string
  }
  if (!res.ok) {
    throw new Error(data.error || '提交失败')
  }
  return data
}
