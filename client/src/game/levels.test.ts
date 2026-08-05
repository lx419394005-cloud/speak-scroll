import { beforeEach, describe, expect, it, vi } from 'vitest'
import { BEAST_IDS, FRUIT_IDS, VOYAGE_IDS, WORDS } from '../data/words'
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

  it('defines three thematic levels', () => {
    expect(LEVELS).toHaveLength(3)
    expect(LEVELS.map((l) => l.id)).toEqual(['beasts', 'fruits', 'voyage'])
    expect(LEVELS.map((l) => l.order)).toEqual([1, 2, 3])
  })

  it('isLevelId validates ids and rejects legacy ids', () => {
    expect(isLevelId('beasts')).toBe(true)
    expect(isLevelId('fruits')).toBe(true)
    expect(isLevelId('voyage')).toBe(true)
    expect(isLevelId('easy')).toBe(false)
    expect(isLevelId(null)).toBe(false)
  })

  it('getLevel returns theme packs', () => {
    expect(getLevel('beasts').title).toBe('奇兽')
    expect(getLevel('fruits').durationMs).toBe(60_000)
    expect(getLevel('voyage').passScore).toBeGreaterThan(getLevel('beasts').passScore)
  })

  it('wordsForLevel returns curated thematic pools', () => {
    const beasts = wordsForLevel(getLevel('beasts'))
    const fruits = wordsForLevel(getLevel('fruits'))
    const voyage = wordsForLevel(getLevel('voyage'))

    expect(beasts.map((w) => w.id).sort()).toEqual([...BEAST_IDS].sort())
    expect(fruits.map((w) => w.id).sort()).toEqual([...FRUIT_IDS].sort())
    expect(voyage.map((w) => w.id).sort()).toEqual([...VOYAGE_IDS].sort())
    expect(beasts.every((w) => WORDS.some((x) => x.id === w.id))).toBe(true)
    expect(fruits.some((w) => w.id === 'soursop')).toBe(true)
    expect(voyage.some((w) => w.id === 'passport')).toBe(true)
  })

  it('persists selected level id and maps legacy values', () => {
    expect(loadSelectedLevelId()).toBe('fruits')
    saveSelectedLevelId('voyage')
    expect(loadSelectedLevelId()).toBe('voyage')

    localStorage.setItem('speak-scroll-level', 'easy')
    expect(loadSelectedLevelId()).toBe('beasts')
  })

  it('formatDurationLabel', () => {
    expect(formatDurationLabel(60_000)).toBe('1 分钟')
    expect(formatDurationLabel(90_000)).toBe('90 秒')
  })
})
