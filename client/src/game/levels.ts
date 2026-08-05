import {
  BEAST_IDS,
  FRUIT_IDS,
  VOYAGE_IDS,
  WORDS,
  type WordCard,
} from '../data/words'

export type LevelId = 'beasts' | 'fruits' | 'voyage'

export type LevelConfig = {
  id: LevelId
  order: number
  /** 关卡短名，HUD / 按钮用 */
  title: string
  /** 关卡全名 */
  name: string
  blurb: string
  durationMs: number
  passScore: number
  passAccuracy: number
  /** null = 使用全部词 */
  wordIds: string[] | null
}

/**
 * 主题关卡（抽象题材包，而非难度阶梯）：
 * - 奇兽：小众动物
 * - 怪果：冷门水果
 * - 旅途：旅行场景物件/场所
 */
export const LEVELS: LevelConfig[] = [
  {
    id: 'beasts',
    order: 1,
    title: '奇兽',
    name: '第1关 · 奇兽',
    blurb: '小众动物图鉴，90 秒乱序说名',
    durationMs: 90_000,
    passScore: 55,
    passAccuracy: 50,
    wordIds: [...BEAST_IDS],
  },
  {
    id: 'fruits',
    order: 2,
    title: '怪果',
    name: '第2关 · 怪果',
    blurb: '冷门水果，1 分钟看图喊名',
    durationMs: 60_000,
    passScore: 60,
    passAccuracy: 55,
    wordIds: [...FRUIT_IDS],
  },
  {
    id: 'voyage',
    order: 3,
    title: '旅途',
    name: '第3关 · 旅途',
    blurb: '旅行场景词，节奏更紧、评分更严',
    durationMs: 60_000,
    passScore: 65,
    passAccuracy: 60,
    wordIds: [...VOYAGE_IDS],
  },
]

const STORAGE_KEY = 'speak-scroll-level'
const DEFAULT_LEVEL: LevelId = 'fruits'

/** 旧版关卡 id → 新主题 */
const LEGACY_LEVEL_MAP: Record<string, LevelId> = {
  easy: 'beasts',
  normal: 'fruits',
  hard: 'voyage',
}

export function isLevelId(value: string | null | undefined): value is LevelId {
  return value === 'beasts' || value === 'fruits' || value === 'voyage'
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

export function formatDurationLabel(ms: number): string {
  const sec = Math.round(ms / 1000)
  if (sec % 60 === 0) return `${sec / 60} 分钟`
  return `${sec} 秒`
}
