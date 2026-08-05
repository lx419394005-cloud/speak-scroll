import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { WORDS } from '../data/words'
import {
  LEVELS,
  formatDurationLabel,
  loadSelectedLevelId,
  saveSelectedLevelId,
  type LevelId,
} from '../game/levels'
import { loadNickname, saveNickname } from '../game/leaderboard'
import { loadScoreBoard } from '../game/records'

export function HomePage() {
  const navigate = useNavigate()
  const [nickname, setNickname] = useState(() => loadNickname())
  const [levelId, setLevelId] = useState<LevelId>(() => loadSelectedLevelId())
  const [hint, setHint] = useState('选关卡，填昵称，开麦说怪词')
  const board = loadScoreBoard()
  const preview = WORDS.slice(0, 6)
  const selected = LEVELS.find((l) => l.id === levelId) ?? LEVELS[1]!

  useEffect(() => {
    document.body.classList.add('page-scroll')
    return () => document.body.classList.remove('page-scroll')
  }, [])

  const pickLevel = (id: LevelId) => {
    setLevelId(id)
    saveSelectedLevelId(id)
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
        <p className="home-kicker">口播闯关</p>
        <h1 className="home-brand">Speak Scroll</h1>
        <p className="home-lead">看滑稽图，大声说出英文单词。说对才翻下一张。</p>

        <label className="nick-field home-nick">
          <span>你的昵称</span>
          <input
            type="text"
            maxLength={16}
            placeholder="例如：龙仔"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') goPlay()
            }}
            onBlur={() => {
              const n = nickname.trim()
              if (n) saveNickname(n)
            }}
          />
        </label>

        <fieldset className="level-picker">
          <legend>选择关卡</legend>
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
                  <span className="level-order">第 {level.order} 关</span>
                  <strong className="level-title">{level.title}</strong>
                  <span className="level-blurb">{level.blurb}</span>
                  <span className="level-meta">{formatDurationLabel(level.durationMs)}</span>
                </button>
              )
            })}
          </div>
        </fieldset>

        <div className="home-cta-row">
          <button type="button" className="cta" onClick={goPlay}>
            开始 · {selected.name}
          </button>
          <Link className="cta ghost" to="/leaderboard">
            全球排行榜
          </Link>
        </div>
        <p className="hint home-hint">{hint}</p>
      </section>

      <section className="home-strip" aria-label="词卡预览">
        {preview.map((w) => (
          <div key={w.id} className="home-strip-card">
            <img src={w.image} alt="" loading="lazy" decoding="async" />
          </div>
        ))}
      </section>

      <section className="home-meta">
        <div className="record-pill">
          <span className="record-pill-label">本机最高</span>
          <span className="record-pill-value">{board.best}</span>
        </div>
        <div className="record-pill">
          <span className="record-pill-label">已玩</span>
          <span className="record-pill-value">{board.gamesPlayed}</span>
        </div>
        <Link className="text-link" to="/how-to">
          怎么玩 →
        </Link>
      </section>
    </main>
  )
}
