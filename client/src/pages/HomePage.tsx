import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { WORDS } from '../data/words'
import { loadNickname, saveNickname } from '../game/leaderboard'
import { loadScoreBoard } from '../game/records'

export function HomePage() {
  const navigate = useNavigate()
  const [nickname, setNickname] = useState(() => loadNickname())
  const [hint, setHint] = useState('填个昵称，开麦说怪词')
  const board = loadScoreBoard()
  const preview = WORDS.slice(0, 6)

  useEffect(() => {
    document.body.classList.add('page-scroll')
    return () => document.body.classList.remove('page-scroll')
  }, [])

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
    navigate('/play')
  }

  return (
    <main className="page home-page">
      <section className="home-hero">
        <p className="home-kicker">1 分钟口播闯关</p>
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

        <div className="home-cta-row">
          <button type="button" className="cta" onClick={goPlay}>
            开始挑战
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
