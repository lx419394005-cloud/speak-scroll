const STORAGE_KEY = 'speak-scroll-records'
const MAX_RECENT = 8

export type GameRecord = {
  score: number
  at: number
}

export type ScoreBoard = {
  best: number
  recent: GameRecord[]
  gamesPlayed: number
}

const emptyBoard = (): ScoreBoard => ({
  best: 0,
  recent: [],
  gamesPlayed: 0,
})

export function loadScoreBoard(): ScoreBoard {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return emptyBoard()
    const parsed = JSON.parse(raw) as Partial<ScoreBoard>
    return {
      best: Number(parsed.best) || 0,
      recent: Array.isArray(parsed.recent) ? parsed.recent.slice(0, MAX_RECENT) : [],
      gamesPlayed: Number(parsed.gamesPlayed) || 0,
    }
  } catch {
    return emptyBoard()
  }
}

export function saveGameScore(score: number): {
  board: ScoreBoard
  isNewBest: boolean
} {
  const board = loadScoreBoard()
  const isNewBest = score > board.best
  const next: ScoreBoard = {
    best: Math.max(board.best, score),
    gamesPlayed: board.gamesPlayed + 1,
    recent: [{ score, at: Date.now() }, ...board.recent].slice(0, MAX_RECENT),
  }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    /* ignore quota */
  }
  return { board: next, isNewBest }
}

export function formatRecordTime(at: number): string {
  const d = new Date(at)
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  const hh = String(d.getHours()).padStart(2, '0')
  const mi = String(d.getMinutes()).padStart(2, '0')
  return `${mm}/${dd} ${hh}:${mi}`
}
