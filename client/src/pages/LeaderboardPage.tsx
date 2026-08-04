import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  fetchLeaderboard,
  loadNickname,
  type LeaderboardEntry,
} from '../game/leaderboard'
import { formatRecordTime, loadScoreBoard } from '../game/records'

export function LeaderboardPage() {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([])
  const [status, setStatus] = useState('加载中…')
  const nickname = loadNickname()
  const local = loadScoreBoard()

  useEffect(() => {
    document.body.classList.add('page-scroll')
    return () => document.body.classList.remove('page-scroll')
  }, [])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const rows = await fetchLeaderboard()
        if (cancelled) return
        setEntries(rows)
        setStatus(rows.length ? '' : '还没有人上榜，来抢第一！')
      } catch {
        if (!cancelled) setStatus('排行榜暂时连不上')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <main className="page lb-page">
      <header className="page-hero">
        <h1>全球排行榜</h1>
        <p>按昵称保留最高分。本机纪录也会留在浏览器里。</p>
      </header>

      <div className="record-strip">
        <div className="record-pill">
          <span className="record-pill-label">本机最高</span>
          <span className="record-pill-value">{local.best}</span>
        </div>
        <div className="record-pill">
          <span className="record-pill-label">已玩局数</span>
          <span className="record-pill-value">{local.gamesPlayed}</span>
        </div>
      </div>

      <div className="leaderboard lb-page-board">
        <div className="leaderboard-title">TOP {Math.max(entries.length, 10)}</div>
        {entries.length === 0 ? (
          <p className="leaderboard-empty">{status}</p>
        ) : (
          <ol className="leaderboard-list">
            {entries.map((row) => (
              <li
                key={row.nickname}
                className={
                  row.nickname.toLowerCase() === nickname.trim().toLowerCase()
                    ? 'me'
                    : undefined
                }
              >
                <span className="lb-rank">#{row.rank}</span>
                <span className="lb-nick">{row.nickname}</span>
                <strong className="lb-score">{row.score}</strong>
              </li>
            ))}
          </ol>
        )}
      </div>

      {local.recent.length > 0 && (
        <section className="local-recent">
          <h2>本机近况</h2>
          <ol className="record-list">
            {local.recent.slice(0, 5).map((r) => (
              <li key={r.at}>
                <span>{formatRecordTime(r.at)}</span>
                <strong>{r.score} 张</strong>
              </li>
            ))}
          </ol>
        </section>
      )}

      <div className="home-cta-row">
        <Link className="cta" to="/">
          回首页
        </Link>
        <Link className="cta ghost" to="/play">
          再冲一局
        </Link>
      </div>
    </main>
  )
}
