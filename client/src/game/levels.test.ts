import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  BEAST_IDS,
  FRUIT_IDS,
  MIXED_IDS,
  PACKING_IDS,
  VOYAGE_IDS,
  WORDS,
} from '../data/words'
import {
  buildSessionDeck,
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

  it('defines thematic levels plus packing and mixed', () => {
    expect(LEVELS).toHaveLength(5)
    expect(LEVELS.map((l) => l.id)).toEqual([
      'beasts',
      'fruits',
      'voyage',
      'packing',
      'mixed',
    ])
  })

  it('isLevelId validates ids and rejects legacy ids', () => {
    expect(isLevelId('packing')).toBe(true)
    expect(isLevelId('mixed')).toBe(true)
    expect(isLevelId('easy')).toBe(false)
  })

  it('packing level uses travel-fun cards with Chinese hints', () => {
    const packing = wordsForLevel(getLevel('packing'))
    expect(packing).toHaveLength(PACKING_IDS.length)
    expect(packing.every((w) => Boolean(w.hint))).toBe(true)
    expect(packing.every((w) => w.image.includes('/travel-fun/'))).toBe(true)
    expect(getLevel('packing').showHints).toBe(true)
    const passport = packing.find((w) => w.word === 'passport')
    expect(passport?.hint).toContain('国门')
  })

  it('wordsForLevel returns curated thematic pools', () => {
    expect(wordsForLevel(getLevel('beasts')).map((w) => w.id).sort()).toEqual(
      [...BEAST_IDS].sort(),
    )
    expect(wordsForLevel(getLevel('fruits')).map((w) => w.id).sort()).toEqual(
      [...FRUIT_IDS].sort(),
    )
    expect(wordsForLevel(getLevel('voyage')).map((w) => w.id).sort()).toEqual(
      [...VOYAGE_IDS].sort(),
    )
    expect(wordsForLevel(getLevel('mixed'))).toHaveLength(MIXED_IDS.length)
    expect(WORDS.some((w) => w.id === 'tf-passport')).toBe(true)
  })

  it('buildSessionDeck spreads repeats across the run', () => {
    const pool = wordsForLevel(getLevel('packing'))
    const deck = buildSessionDeck(pool, 2)
    expect(deck).toHaveLength(pool.length * 2)
    for (let i = 1; i < deck.length; i += 1) {
      expect(deck[i]!.id).not.toBe(deck[i - 1]!.id)
    }
  })

  it('persists selected level id and maps legacy values', () => {
    expect(loadSelectedLevelId()).toBe('packing')
    saveSelectedLevelId('mixed')
    expect(loadSelectedLevelId()).toBe('mixed')
    localStorage.setItem('speak-scroll-level', 'easy')
    expect(loadSelectedLevelId()).toBe('beasts')
  })

  it('all levels are 30 seconds', () => {
    expect(LEVELS.every((l) => l.durationMs === 30_000)).toBe(true)
    expect(formatDurationLabel(30_000)).toBe('30 秒')
  })

  it('formatDurationLabel', () => {
    expect(formatDurationLabel(60_000)).toBe('1 分钟')
    expect(formatDurationLabel(90_000)).toBe('90 秒')
  })
})
