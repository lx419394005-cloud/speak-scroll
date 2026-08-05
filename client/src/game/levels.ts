import {
  BEAST_IDS,
  FRUIT_IDS,
  MIXED_IDS,
  PACKING_IDS,
  VOYAGE_IDS,
  WORDS,
  wordImg,
  type WordCard,
} from '../data/words'

export type LevelId = 'beasts' | 'fruits' | 'voyage' | 'packing' | 'mixed'

export type LevelConfig = {
  id: LevelId
  order: number
  /** 关卡短名，HUD / 按钮用 */
  title: string
  /** 关卡全名 */
  name: string
  blurb: string
  /** 首页选关图标 */
  icon: string
  durationMs: number
  passScore: number
  passAccuracy: number
  /** null = 使用全部词 */
  wordIds: string[] | null
  /** 本局牌堆循环遍数（越大越晚才可能重复手感） */
  deckPasses: number
  /** 是否展示中文谜语提示 */
  showHints?: boolean
}

/**
 * 主题关卡 + 行囊情景 + 乱斗
 */
export const LEVELS: LevelConfig[] = [
  {
    id: 'beasts',
    order: 1,
    title: '奇兽',
    name: '第1关 · 奇兽',
    blurb: '小众动物',
    icon: wordImg('axolotl.webp'),
    durationMs: 30_000,
    passScore: 55,
    passAccuracy: 50,
    wordIds: [...BEAST_IDS],
    deckPasses: 3,
  },
  {
    id: 'fruits',
    order: 2,
    title: '怪果',
    name: '第2关 · 怪果',
    blurb: '冷门水果',
    icon: wordImg('durian.webp'),
    durationMs: 30_000,
    passScore: 60,
    passAccuracy: 55,
    wordIds: [...FRUIT_IDS],
    deckPasses: 3,
  },
  {
    id: 'voyage',
    order: 3,
    title: '旅途',
    name: '第3关 · 旅途',
    blurb: '旅行场景',
    icon: wordImg('compass.webp'),
    durationMs: 30_000,
    passScore: 65,
    passAccuracy: 60,
    wordIds: [...VOYAGE_IDS],
    deckPasses: 3,
  },
  {
    id: 'packing',
    order: 4,
    title: '行囊',
    name: '第4关 · 行囊',
    blurb: '情景谜语',
    icon: wordImg('travel-fun/passport.webp'),
    durationMs: 30_000,
    passScore: 58,
    passAccuracy: 52,
    wordIds: [...PACKING_IDS],
    deckPasses: 2,
    showHints: true,
  },
  {
    id: 'mixed',
    order: 5,
    title: '乱斗',
    name: '第5关 · 乱斗',
    blurb: '三套合集',
    icon: wordImg('postcard.webp'),
    durationMs: 30_000,
    passScore: 60,
    passAccuracy: 55,
    wordIds: [...MIXED_IDS],
    deckPasses: 2,
  },
]

const STORAGE_KEY = 'speak-scroll-level'
const DEFAULT_LEVEL: LevelId = 'packing'

/** 旧版关卡 id → 新主题 */
const LEGACY_LEVEL_MAP: Record<string, LevelId> = {
  easy: 'beasts',
  normal: 'fruits',
  hard: 'voyage',
}

export function isLevelId(value: string | null | undefined): value is LevelId {
  return (
    value === 'beasts' ||
    value === 'fruits' ||
    value === 'voyage' ||
    value === 'packing' ||
    value === 'mixed'
  )
}

export function getLevel(id: LevelId): LevelConfig {
  return LEVELS.find((l) => l.id === id) ?? LEVELS[1]!
}

export function loadSelectedLevelId(): LevelId {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (isLevelId(raw)) return raw
    if (raw && LEGACY_LEVEL_MAP[raw]) return LEGACY_LEVEL_MAP[raw]!
  } catch {
    /* ignore */
  }
  return DEFAULT_LEVEL
}

export function saveSelectedLevelId(id: LevelId) {
  try {
    localStorage.setItem(STORAGE_KEY, id)
  } catch {
    /* ignore quota */
  }
}

export function wordsForLevel(level: LevelConfig): WordCard[] {
  if (!level.wordIds) return [...WORDS]
  const byId = new Map(WORDS.map((w) => [w.id, w]))
  const picked = level.wordIds
    .map((id) => byId.get(id))
    .filter((w): w is WordCard => Boolean(w))
  return picked.length > 0 ? picked : [...WORDS]
}

export function shuffle<T>(items: T[]): T[] {
  const arr = [...items]
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j]!, arr[i]!]
  }
  return arr
}

/**
 * 多圈洗牌：同一词在相邻位置尽量隔开，避免「刚刷完又见到」。
 */
export function buildSessionDeck(
  pool: WordCard[],
  passes = 3,
  avoidIds: string[] = [],
): WordCard[] {
  if (pool.length === 0) return []
  if (pool.length === 1) {
    return Array.from({ length: Math.max(1, passes) }, () => pool[0]!)
  }

  const gap = Math.min(Math.max(3, Math.floor(pool.length / 2)), pool.length - 1)
  const out: WordCard[] = []

  for (let p = 0; p < passes; p += 1) {
    let batch = shuffle(pool)

    const recent = new Set(
    out.length > 0
      ? out.slice(-gap).map((w) => w.id)
      : avoidIds.slice(-gap),
  )

    for (let rot = 0; rot < batch.length; rot += 1) {
      const rotated = [...batch.slice(rot), ...batch.slice(0, rot)]
      if (!recent.has(rotated[0]!.id)) {
        batch = rotated
        break
      }
    }

    // 边界再修一次：首张不与上一张相同
    if (out.length > 0 && batch[0]?.id === out[out.length - 1]?.id && batch.length > 1) {
      const swapAt = batch.findIndex((w, i) => i > 0 && !recent.has(w.id))
      if (swapAt > 0) {
        ;[batch[0], batch[swapAt]] = [batch[swapAt]!, batch[0]!]
      }
    }

    out.push(...batch)
  }

  return out
}

export function formatDurationLabel(ms: number): string {
  const sec = Math.round(ms / 1000)
  if (sec % 60 === 0) return `${sec / 60} 分钟`
  return `${sec} 秒`
}
