import { WORDS, type WordCard } from '../data/words'

export type LevelId = 'easy' | 'normal' | 'hard'

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

export const LEVELS: LevelConfig[] = [
  {
    id: 'easy',
    order: 1,
    title: '启蒙',
    name: '第1关 · 启蒙',
    blurb: '短词热身，90 秒放宽评分',
    durationMs: 90_000,
    passScore: 55,
    passAccuracy: 50,
    wordIds: [
      'cat',
      'dog',
      'pig',
      'duck',
      'fish',
      'cow',
      'frog',
      'hat',
      'bus',
      'apple',
      'banana',
      'cake',
      'sock',
      'rope',
    ],
  },
  {
    id: 'normal',
    order: 2,
    title: '冲刺',
    name: '第2关 · 冲刺',
    blurb: '经典 1 分钟，全词库乱序',
    durationMs: 60_000,
    passScore: 60,
    passAccuracy: 55,
    wordIds: null,
  },
  {
    id: 'hard',
    order: 3,
    title: '怪词',
    name: '第3关 · 怪词',
    blurb: '难词高压，评分更严',
    durationMs: 60_000,
    passScore: 65,
    passAccuracy: 60,
    wordIds: [
      'recipe',
      'receipt',
      'soursop',
      'emotion',
      'pickle',
      'waffle',
      'cactus',
      'sex',
    ],
  },
]

const STORAGE_KEY = 'speak-scroll-level'
const DEFAULT_LEVEL: LevelId = 'normal'

export function isLevelId(value: string | null | undefined): value is LevelId {
  return value === 'easy' || value === 'normal' || value === 'hard'
}

export function getLevel(id: LevelId): LevelConfig {
  return LEVELS.find((l) => l.id === id) ?? LEVELS[1]!
}

export function loadSelectedLevelId(): LevelId {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (isLevelId(raw)) return raw
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
