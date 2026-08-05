import { beforeEach, describe, expect, it, vi } from 'vitest'
import { WORDS } from '../data/words'
import {
  formatDurationLabel,
  getLevel,
  isLevelId,
  LEVELS,
  loadSelectedLevelId,
  saveSelectedLevelId,
  wordsForLevel,
} from './levels'

describe('levels', () => {
  beforeEach(() => {
    const store = new Map<string, string>()
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => {
        store.set(k, v)
      },
      removeItem: (k: string) => {
        store.delete(k)
      },
      clear: () => store.clear(),
    })
  })

  it('defines three ordered levels', () => {
    expect(LEVELS).toHaveLength(3)
    expect(LEVELS.map((l) => l.id)).toEqual(['easy', 'normal', 'hard'])
    expect(LEVELS.map((l) => l.order)).toEqual([1, 2, 3])
  })

  it('isLevelId validates ids', () => {
    expect(isLevelId('easy')).toBe(true)
    expect(isLevelId('normal')).toBe(true)
    expect(isLevelId('hard')).toBe(true)
    expect(isLevelId('boss')).toBe(false)
    expect(isLevelId(null)).toBe(false)
  })

  it('getLevel falls back to normal for unknown', () => {
    expect(getLevel('easy').title).toBe('启蒙')
    expect(getLevel('normal').durationMs).toBe(60_000)
    expect(getLevel('hard').passScore).toBeGreaterThan(getLevel('easy').passScore)
  })

  it('wordsForLevel returns curated pools', () => {
    const easy = wordsForLevel(getLevel('easy'))
    const hard = wordsForLevel(getLevel('hard'))
    const normal = wordsForLevel(getLevel('normal'))

    expect(easy.length).toBeGreaterThan(0)
    expect(easy.every((w) => WORDS.some((x) => x.id === w.id))).toBe(true)
    expect(hard.some((w) => w.id === 'soursop')).toBe(true)
    expect(normal).toHaveLength(WORDS.length)
  })

  it('persists selected level id', () => {
    expect(loadSelectedLevelId()).toBe('normal')
    saveSelectedLevelId('hard')
    expect(loadSelectedLevelId()).toBe('hard')
  })

  it('formatDurationLabel', () => {
    expect(formatDurationLabel(60_000)).toBe('1 分钟')
    expect(formatDurationLabel(90_000)).toBe('90 秒')
  })
})
