import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  ATTEMPT_MAX_MS,
  FAIL_PAUSE_MS,
  GAME_DURATION_MS,
  MIN_RECORD_MS,
  PASS_PAUSE_MS,
  PASS_SCORE,
  PASS_ACCURACY,
  SILENCE_END_MS,
  WORDS,
  type WordCard,
} from '../data/words'
import { createMicRecorder, type MicRecorder } from '../ise/audio'
import {
  createPcmQueue,
  evaluateRecordedWord,
  isPronunciationPass,
  prepareIseConnection,
  type PreparedIse,
  type IseResult,
} from '../ise/client'
import {
  formatRecordTime,
  loadScoreBoard,
  saveGameScore,
  type ScoreBoard,
} from './records'
import {
  fetchLeaderboard,
  loadNickname,
  saveNickname,
  submitScore,
  type LeaderboardEntry,
} from './leaderboard'

type Phase = 'idle' | 'playing' | 'gameover'
type Flash = 'pass' | 'fail' | null
type RecState = 'idle' | 'listening' | 'scoring'

function shuffle<T>(items: T[]): T[] {
  const arr = [...items]
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j]!, arr[i]!]
  }
  return arr
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms)
  })
}

function preloadImages(urls: string[]) {
  for (const url of urls) {
    if (!url) continue
    const img = new Image()
    img.decoding = 'async'
    img.src = url
  }
}

export function Game() {
  const navigate = useNavigate()
  const [phase, setPhase] = useState<Phase>('idle')
  const [deck, setDeck] = useState<WordCard[]>([])
  const [index, setIndex] = useState(0)
  const [score, setScore] = useState(0)
  const [timeLeft, setTimeLeft] = useState(GAME_DURATION_MS)
  const [flash, setFlash] = useState<Flash>(null)
  const [recState, setRecState] = useState<RecState>('idle')
  const [statusText, setStatusText] = useState('准备好了吗？')
  const [heardText, setHeardText] = useState('')
  const [slideKey, setSlideKey] = useState(0)
  const [enterAnim, setEnterAnim] = useState(true)
  const [micLevel, setMicLevel] = useState(0)
  const [board, setBoard] = useState<ScoreBoard>(() => loadScoreBoard())
  const [isNewBest, setIsNewBest] = useState(false)
  const [nickname] = useState(() => loadNickname())
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([])
  const [globalRank, setGlobalRank] = useState<number | null>(null)
  const [lbStatus, setLbStatus] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const savedThisRoundRef = useRef(false)

  const recorderRef = useRef<MicRecorder | null>(null)
  const queueRef = useRef(createPcmQueue())
  const abortRef = useRef<AbortController | null>(null)
  const sessionRef = useRef(0)
  const indexRef = useRef(0)
  const deckRef = useRef<WordCard[]>([])
  const scoreRef = useRef(0)
  const gameStartRef = useRef(0)
  const endedRef = useRef(false)
  /** 下一轮预连的 WebSocket，说完即可上传 */
  const warmPromiseRef = useRef<Promise<PreparedIse | null> | null>(null)

  const current = deck[index]

  const closeWarm = useCallback(() => {
    const pending = warmPromiseRef.current
    warmPromiseRef.current = null
    if (!pending) return
    void pending.then((p) => {
      try {
        p?.ws.close()
      } catch {
        /* ignore */
      }
    })
  }, [])

  const armWarm = useCallback((signal?: AbortSignal) => {
    warmPromiseRef.current = prepareIseConnection(signal).catch((err) => {
      console.warn('[ise] warm connect failed', err)
      return null
    })
  }, [])

  const takeWarm = useCallback(
    async (signal: AbortSignal): Promise<PreparedIse | null> => {
      const pending = warmPromiseRef.current
      warmPromiseRef.current = null
      // 立刻补下一根，供下一轮用
      armWarm(signal)

      if (pending) {
        const prepared = await pending
        if (prepared && prepared.ws.readyState === WebSocket.OPEN) return prepared
        try {
          prepared?.ws.close()
        } catch {
          /* ignore */
        }
      }
      try {
        return await prepareIseConnection(signal)
      } catch (err) {
        console.warn('[ise] connect failed', err)
        return null
      }
    },
    [armWarm],
  )

  const cleanupMic = useCallback(async () => {
    abortRef.current?.abort()
    abortRef.current = null
    closeWarm()
    if (recorderRef.current) {
      recorderRef.current.stopCapture()
      await recorderRef.current.close()
      recorderRef.current = null
    }
    setMicLevel(0)
    setRecState('idle')
  }, [closeWarm])

  useEffect(() => {
    if (!loadNickname().trim()) {
      navigate('/', { replace: true })
    }
  }, [navigate])

  useEffect(() => {
    return () => {
      void cleanupMic()
    }
  }, [cleanupMic])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const entries = await fetchLeaderboard()
        if (!cancelled) setLeaderboard(entries)
      } catch {
        if (!cancelled) setLbStatus('排行榜暂时连不上（需启动 worker）')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    // 开局前预热全部词图，减少 Cloudflare 上偶发空白
    preloadImages(WORDS.map((w) => w.image))
  }, [])

  useEffect(() => {
    if (phase !== 'playing' || deck.length === 0) return
    const upcoming = [0, 1, 2, 3].map((offset) => {
      const i = (index + offset) % deck.length
      return deck[i]?.image
    })
    preloadImages(upcoming.filter(Boolean) as string[])
  }, [phase, deck, index])

  useEffect(() => {
    if (phase !== 'playing') {
      setMicLevel(0)
      return
    }
    const id = window.setInterval(() => {
      setMicLevel(recorderRef.current?.getLevel() ?? 0)
    }, 50)
    return () => window.clearInterval(id)
  }, [phase])

  const endGame = useCallback(() => {
    if (endedRef.current) return
    endedRef.current = true
    sessionRef.current += 1
    abortRef.current?.abort()
    recorderRef.current?.stopCapture()
    setTimeLeft(0)
    setRecState('idle')
    setPhase('gameover')
    setStatusText('时间到！')

    const finalScore = scoreRef.current
    if (!savedThisRoundRef.current) {
      savedThisRoundRef.current = true
      const { board: next, isNewBest: best } = saveGameScore(finalScore)
      setBoard(next)
      setIsNewBest(best)

      const nick = loadNickname().trim() || nickname.trim()
      if (nick) {
        setSubmitting(true)
        setLbStatus('正在上传排行榜…')
        void submitScore(nick, finalScore)
          .then((res) => {
            setLeaderboard(res.entries)
            setGlobalRank(res.rank)
            setLbStatus(
              res.improved
                ? `已上榜！全球第 ${res.rank} 名`
                : `本局未破个人纪录（当前第 ${res.rank}）`,
            )
          })
          .catch((err) => {
            setLbStatus(err instanceof Error ? err.message : '排行榜上传失败')
          })
          .finally(() => setSubmitting(false))
      } else {
        setLbStatus('填写昵称后可上传全球排行榜')
      }
    }

    void cleanupMic()
  }, [cleanupMic, nickname])

  useEffect(() => {
    if (phase !== 'playing') return
    const tick = window.setInterval(() => {
      const left = Math.max(0, GAME_DURATION_MS - (performance.now() - gameStartRef.current))
      setTimeLeft(left)
      if (left <= 0) endGame()
    }, 100)
    return () => window.clearInterval(tick)
  }, [phase, endGame])

  const advanceCard = useCallback(() => {
    scoreRef.current += 1
    setScore(scoreRef.current)

    let nextIndex = indexRef.current + 1
    let nextDeck = deckRef.current
    if (nextIndex >= nextDeck.length) {
      nextDeck = shuffle(WORDS)
      deckRef.current = nextDeck
      setDeck(nextDeck)
      nextIndex = 0
    }
    indexRef.current = nextIndex
    setIndex(nextIndex)
    setEnterAnim(true)
    setSlideKey((k) => k + 1)
  }, [])

  const recordUntilDone = useCallback(async (session: number, signal: AbortSignal) => {
    queueRef.current.clear()
    setRecState('listening')
    setStatusText('正在听，请大声说完…')
    setFlash(null)
    setHeardText('')

    await recorderRef.current?.startCapture()

    const started = performance.now()
    let spoken = false
    let silenceMs = 0

    await new Promise<void>((resolve, reject) => {
      let tick = 0
      const onAbort = () => {
        window.clearInterval(tick)
        reject(new Error('Aborted'))
      }
      if (signal.aborted) {
        onAbort()
        return
      }
      signal.addEventListener('abort', onAbort, { once: true })

      tick = window.setInterval(() => {
        if (sessionRef.current !== session || endedRef.current) {
          window.clearInterval(tick)
          signal.removeEventListener('abort', onAbort)
          reject(new Error('Aborted'))
          return
        }

        const elapsed = performance.now() - started
        const rms = recorderRef.current?.getRms() ?? 0

        if (rms > 0.012) {
          // 音节之间音量会掉，用较低阈值避免误判为说完
          spoken = true
          silenceMs = 0
          if (rms > 0.02) setStatusText('听到了，请继续…')
        } else if (spoken) {
          silenceMs += 30
        }

        const minBytes = 16000 * 2 * 0.5
        const hasAudio = queueRef.current.byteLength() >= minBytes
        const doneBySilence =
          spoken && silenceMs >= SILENCE_END_MS && elapsed >= MIN_RECORD_MS && hasAudio
        const doneByTimeout = elapsed >= ATTEMPT_MAX_MS && hasAudio
        const forceEnd = elapsed >= ATTEMPT_MAX_MS + 800

        if (doneBySilence || doneByTimeout || forceEnd) {
          window.clearInterval(tick)
          signal.removeEventListener('abort', onAbort)
          resolve()
        }
      }, 30)
    })

    recorderRef.current?.stopCapture()
    return queueRef.current.drain()
  }, [])

  const runOneAttempt = useCallback(
    async (word: WordCard, session: number) => {
      const abort = new AbortController()
      abortRef.current = abort

      let prepared: PreparedIse | null = null
      try {
        const pcm = await recordUntilDone(session, abort.signal)
        if (sessionRef.current !== session || endedRef.current) {
          throw new Error('Aborted')
        }

        // 先切到评分态，再等预连，避免“还在听”空等
        setRecState('scoring')
        setStatusText('评分中…')

        prepared = await takeWarm(abort.signal)
        return await evaluateRecordedWord({
          word: word.word,
          pcm,
          prepared,
          signal: abort.signal,
        })
      } catch (err) {
        prepared?.ws.close()
        throw err
      } finally {
        recorderRef.current?.stopCapture()
      }
    },
    [recordUntilDone, takeWarm],
  )

  const applyResult = useCallback((result: IseResult) => {
    console.log('[ise][score]', {
      content: result.content,
      totalScore: result.totalScore,
      accuracyScore: result.accuracyScore,
      standardScore: result.standardScore,
      exceptInfo: result.exceptInfo,
      isRejected: result.isRejected,
    })

    const { ok: passed, reason } = isPronunciationPass(result, {
      passScore: PASS_SCORE,
      passAccuracy: PASS_ACCURACY,
    })

    console.log('[ise][pass-result]', { passed, reason })

    if (passed) {
      setFlash('pass')
      setHeardText('对了')
      setStatusText('说对了！下一张…')
    } else {
      setFlash('fail')
      setHeardText('再试')
      setStatusText(reason || '请再说一次')
    }

    return passed
  }, [])

  useEffect(() => {
    if (phase !== 'playing' || endedRef.current) return

    // 整局共用一个 session：不因翻卡重跑 effect，避免「说对了却没 advance」
    const session = ++sessionRef.current
    let cancelled = false

    void (async () => {
      try {
        if (!recorderRef.current) {
          recorderRef.current = await createMicRecorder((chunk) => {
            queueRef.current.push(chunk)
          })
        }

        while (!cancelled && !endedRef.current && sessionRef.current === session) {
          const word = deckRef.current[indexRef.current]
          if (!word) break

          let result: IseResult
          try {
            result = await runOneAttempt(word, session)
          } catch (err) {
            if (cancelled || sessionRef.current !== session || endedRef.current) return
            if (err instanceof Error && err.message === 'Aborted') return
            console.error(err)
            setRecState('idle')
            setFlash('fail')
            setStatusText(err instanceof Error ? err.message : '评测失败')
            setHeardText('')
            await sleep(400)
            continue
          }

          if (cancelled || sessionRef.current !== session || endedRef.current) return

          const passed = applyResult(result)
          setRecState('idle')

          if (passed) {
            await sleep(PASS_PAUSE_MS)
            if (cancelled || sessionRef.current !== session || endedRef.current) return
            setFlash(null)
            setHeardText('')
            advanceCard()
            continue
          }

          await sleep(FAIL_PAUSE_MS)
          if (cancelled || sessionRef.current !== session || endedRef.current) return
          setFlash(null)
        }
      } catch (err) {
        console.error(err)
        if (!cancelled && !endedRef.current) {
          setStatusText('无法使用麦克风，请检查权限')
          setPhase('idle')
        }
      }
    })()

    return () => {
      cancelled = true
      abortRef.current?.abort()
      recorderRef.current?.stopCapture()
      closeWarm()
    }
  }, [phase, runOneAttempt, applyResult, advanceCard, closeWarm])

  const startGame = async () => {
    const nick = nickname.trim()
    if (!nick) {
      setStatusText('先填个昵称再开始')
      return
    }
    if (nick.length > 16) {
      setStatusText('昵称最多 16 个字')
      return
    }
    saveNickname(nick)
    setStatusText('正在开启麦克风…')
    try {
      sessionRef.current += 1
      endedRef.current = false
      await cleanupMic()
      queueRef.current = createPcmQueue()
      recorderRef.current = await createMicRecorder((chunk) => {
        queueRef.current.push(chunk)
      })
      recorderRef.current.stopCapture()

      // 开局先把鉴权 + WS 预热好
      void fetch('/api/ise-auth').catch(() => null)
      armWarm()

      const nextDeck = shuffle(WORDS)
      deckRef.current = nextDeck
      indexRef.current = 0
      scoreRef.current = 0
      gameStartRef.current = performance.now()
      savedThisRoundRef.current = false
      setIsNewBest(false)
      setGlobalRank(null)
      setLbStatus('')

      setDeck(nextDeck)
      setIndex(0)
      setScore(0)
      setTimeLeft(GAME_DURATION_MS)
      setFlash(null)
      setHeardText('')
      setEnterAnim(true)
      setSlideKey((k) => k + 1)
      setPhase('playing')
      setStatusText('正在听，请大声说完…')
    } catch (err) {
      console.error(err)
      setStatusText('请允许麦克风权限后再试')
      setPhase('idle')
    }
  }

  const progress = timeLeft / GAME_DURATION_MS
  const urgency = progress < 0.25

  const formatTime = (ms: number) => {
    const total = Math.ceil(ms / 1000)
    const m = Math.floor(total / 60)
    const s = total % 60
    return `${m}:${s.toString().padStart(2, '0')}`
  }

  return (
    <div
      className={`game ${flash ? `flash-${flash}` : ''} ${urgency && phase === 'playing' ? 'urgent' : ''}`}
    >
      <header className="hud">
        {phase === 'playing' ? (
          <div className="brand">Speak Scroll</div>
        ) : (
          <Link to="/" className="brand">
            Speak Scroll
          </Link>
        )}
        <div className="hud-stats">
          <div className="stat">
            <span className="stat-label">说对</span>
            <span className="stat-value">{score}</span>
          </div>
          <div className="stat">
            <span className="stat-label">最高</span>
            <span className="stat-value">{board.best}</span>
          </div>
          <div className="stat">
            <span className="stat-label">剩余</span>
            <span className="stat-value timer-stat">
              {phase === 'playing' || phase === 'gameover' ? formatTime(timeLeft) : '1:00'}
            </span>
          </div>
        </div>
      </header>

      <div className="timer-track" aria-hidden={phase !== 'playing'}>
        <div
          className="timer-fill"
          style={{
            transform: `scaleX(${phase === 'playing' ? progress : phase === 'gameover' ? 0 : 1})`,
          }}
        />
      </div>

      <div
        className="mic-meter"
        aria-label="microphone level"
        aria-hidden={phase !== 'playing'}
        style={phase !== 'playing' ? { opacity: 0.35 } : undefined}
      >
        <span className="mic-label">MIC</span>
        <div className="mic-track">
          <div className="mic-fill" style={{ transform: `scaleX(${micLevel})` }} />
        </div>
      </div>

      <main className="stage">
        {phase === 'idle' && (
          <div className="panel start-panel play-ready">
            <h1>准备开麦</h1>
            <p>
              你好，<strong>{nickname.trim() || '玩家'}</strong>
              。看图说词，1 分钟冲榜。
            </p>
            <div className="record-strip compact">
              <div className="record-pill">
                <span className="record-pill-label">本机最高</span>
                <span className="record-pill-value">{board.best}</span>
              </div>
              <div className="record-pill">
                <span className="record-pill-label">已玩</span>
                <span className="record-pill-value">{board.gamesPlayed}</span>
              </div>
            </div>
            <button type="button" className="cta" onClick={() => void startGame()}>
              开麦开玩
            </button>
            <div className="home-cta-row">
              <Link className="text-link" to="/">
                改昵称
              </Link>
              <Link className="text-link" to="/leaderboard">
                排行榜
              </Link>
              <Link className="text-link" to="/how-to">
                玩法
              </Link>
            </div>
            <p className="hint">{statusText}</p>
          </div>
        )}

        {phase === 'playing' && current && (
          <div className="play-area">
            <div key={slideKey} className="card-rail">
              <div
                className={`word-card ${enterAnim ? 'rush-in' : ''} ${flash === 'fail' ? 'shake-card' : ''}`}
                onAnimationEnd={() => setEnterAnim(false)}
              >
                <img
                  key={current.image}
                  src={current.image}
                  alt="guess the word"
                  draggable={false}
                  loading="eager"
                  decoding="async"
                  onError={(e) => {
                    const el = e.currentTarget
                    const retries = Number(el.dataset.retry || '0')
                    if (retries >= 3) return
                    el.dataset.retry = String(retries + 1)
                    window.setTimeout(() => {
                      el.src = `${current.image}?r=${retries + 1}`
                    }, 200 * (retries + 1))
                  }}
                />
              </div>
            </div>

            <div className={`rec-badge ${recState}`}>
              {recState === 'listening' && (
                <>
                  <span className="rec-dot" />
                  正在录音，说完即评…
                </>
              )}
              {recState === 'scoring' && '说完了，正在评分…'}
              {recState === 'idle' &&
                (flash === 'pass' ? '过关' : flash === 'fail' ? '再试' : '准备')}
            </div>

            <div className="heard-box">
              <div className="heard-label">结果</div>
              <div
                className={`heard-text ${
                  flash === 'pass' ? 'ok' : flash === 'fail' ? 'bad' : ''
                }`}
              >
                {heardText || '…'}
              </div>
            </div>
          </div>
        )}

        {phase === 'gameover' && (
          <div className="panel end-panel">
            <h1>时间到</h1>
            <p className="big-score">{score}</p>
            <p>
              {isNewBest && score > 0
                ? '本机新纪录！1 分钟说对了这么多张'
                : '1 分钟说对了这么多张'}
            </p>
            {isNewBest && score > 0 && <p className="new-best-tag">BEST</p>}
            {globalRank != null && (
              <p className="rank-line">
                {nickname.trim() || '你'} · 全球第 {globalRank} 名
              </p>
            )}
            <p className="hint lb-hint">{submitting ? '正在上传排行榜…' : lbStatus}</p>

            <div className="leaderboard">
              <div className="leaderboard-title">全球排行榜</div>
              {leaderboard.length === 0 ? (
                <p className="leaderboard-empty">暂无数据</p>
              ) : (
                <ol className="leaderboard-list">
                  {leaderboard.slice(0, 10).map((row) => (
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

            <div className="record-strip compact">
              <div className="record-pill">
                <span className="record-pill-label">本机最高</span>
                <span className="record-pill-value">{board.best}</span>
              </div>
              <div className="record-pill">
                <span className="record-pill-label">局数</span>
                <span className="record-pill-value">{board.gamesPlayed}</span>
              </div>
            </div>
            {board.recent.length > 0 && (
              <ol className="record-list">
                {board.recent.slice(0, 3).map((r, i) => (
                  <li key={r.at} className={i === 0 ? 'latest' : undefined}>
                    <span>{formatRecordTime(r.at)}</span>
                    <strong>{r.score} 张</strong>
                  </li>
                ))}
              </ol>
            )}
            <div className="home-cta-row">
              <button type="button" className="cta" onClick={() => void startGame()}>
                再来一局
              </button>
              <Link className="cta ghost" to="/leaderboard">
                排行榜
              </Link>
            </div>
            <Link className="text-link" to="/">
              回首页
            </Link>
          </div>
        )}
      </main>

      <footer className="footer">
        <span className="status">{statusText}</span>
      </footer>
    </div>
  )
}
