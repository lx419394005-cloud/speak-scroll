import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  LEVELS,
  formatDurationLabel,
  loadSelectedLevelId,
  saveSelectedLevelId,
  wordsForLevel,
  type LevelId,
} from '../game/levels'
import { loadNickname, saveNickname } from '../game/leaderboard'
import { loadScoreBoard } from '../game/records'

export function HomePage() {
  const navigate = useNavigate()
  const [nickname, setNickname] = useState(() => loadNickname())
  const [levelId, setLevelId] = useState<LevelId>(() => loadSelectedLevelId())
  const [hint, setHint] = useState('')
  const board = loadScoreBoard()
  const selected = LEVELS.find((l) => l.id === levelId) ?? LEVELS[1]!
  const preview = useMemo(
    () => wordsForLevel(selected).slice(0, 4),
    [selected],
  )

  useEffect(() => {
    for (const w of wordsForLevel(selected)) {
      if (!w.image) continue
      const img = new Image()
      img.decoding = 'async'
      img.src = w.image
    }
  }, [selected])

  const pickLevel = (id: LevelId) => {
    setLevelId(id)
    saveSelectedLevelId(id)
    setHint('')
  }

  const goPlay = () => {
    const nick = nickname.trim()
    if (!nick) {
      setHint('先填个昵称再开始')
      return
    }
    if (nick.length > 16) {
      setHint('昵称最多 16 个字')
      return
    }
    saveNickname(nick)
    saveSelectedLevelId(levelId)
    navigate(`/play?level=${levelId}`)
  }

  return (
    <main className="page home-page">
      <section className="home-hero">
        <h1 className="home-brand">Speak Scroll</h1>
        <p className="home-lead">看情景图、听谜语，大声说英文名</p>

        <label className="nick-field home-nick">
          <span>昵称</span>
          <input
            type="text"
            maxLength={16}
            placeholder="例如：龙仔"
            value={nickname}
            onChange={(e) => {
              setNickname(e.target.value)
              if (hint) setHint('')
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') goPlay()
            }}
            onBlur={() => {
              const n = nickname.trim()
              if (n) saveNickname(n)
            }}
          />
        </label>

        <fieldset className="level-picker home-levels">
          <legend>选关卡</legend>
          <div className="level-grid" role="radiogroup" aria-label="关卡">
            {LEVELS.map((level) => {
              const active = level.id === levelId
              return (
                <button
                  key={level.id}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  className={`level-card${active ? ' active' : ''}`}
                  onClick={() => pickLevel(level.id)}
                >
                  <span className="level-icon" aria-hidden="true">
                    <img
                      src={level.icon}
                      alt=""
                      width={96}
                      height={96}
                      loading="lazy"
                      decoding="async"
                    />
                  </span>
                  <strong className="level-title">{level.title}</strong>
                  <span className="level-meta">{formatDurationLabel(level.durationMs)}</span>
                </button>
              )
            })}
          </div>
          <p className="level-selected-blurb">{selected.blurb}</p>
        </fieldset>

        <div className="home-cta-row">
          <button type="button" className="cta" onClick={goPlay}>
            开始 · {selected.title}
          </button>
        </div>
        {hint ? <p className="hint home-hint">{hint}</p> : null}
      </section>

      <section className="home-strip" aria-label={`${selected.title}词卡预览`}>
        {preview.map((w) => (
          <div key={w.id} className="home-strip-card">
            <img
              src={w.image}
              alt=""
              width={160}
              height={160}
              loading="lazy"
              decoding="async"
            />
          </div>
        ))}
      </section>

      <footer className="home-meta">
        <div className="home-meta-stats">
          <span>
            最高 <strong>{board.best}</strong>
          </span>
          <span>
            已玩 <strong>{board.gamesPlayed}</strong>
          </span>
        </div>
        <div className="home-meta-links">
          <Link className="text-link" to="/leaderboard">
            排行榜
          </Link>
          <Link className="text-link" to="/how-to">
            怎么玩
          </Link>
        </div>
      </footer>
    </main>
  )
}
