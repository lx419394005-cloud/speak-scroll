import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import {
  ATTEMPT_MAX_MS,
  FAIL_PAUSE_MS,
  MIN_RECORD_MS,
  PASS_PAUSE_MS,
  SILENCE_END_MS,
  SKIP_REVEAL_MS,
  type WordCard,
} from '../data/words'
import { createGameMicRecorder, type MicRecorder, wantsMockMic } from '../ise/audio'
import {
  createPcmQueue,
  evaluateRecordedWord,
  isPronunciationPass,
  prepareIseConnection,
  startLiveIseUpload,
  type PreparedIse,
  type IseResult,
  type LiveIseUpload,
} from '../ise/client'
import {
  formatDurationLabel,
  getLevel,
  isLevelId,
  buildSessionDeck,
  loadSelectedLevelId,
  saveSelectedLevelId,
  wordsForLevel,
  type LevelConfig,
  type LevelId,
} from './levels'
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

type Phase = 'idle' | 'playing' | 'paused' | 'gameover'
type Flash = 'pass' | 'fail' | null
type RecState = 'idle' | 'listening' | 'scoring'

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
    // 提前 decode，翻卡时少卡一帧
    if (typeof img.decode === 'function') {
      void img.decode().catch(() => null)
    }
  }
}

function resolveLevelId(param: string | null): LevelId {
  if (isLevelId(param)) return param
  return loadSelectedLevelId()
}

export function Game() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [levelId] = useState<LevelId>(() =>
    resolveLevelId(searchParams.get('level')),
  )
  const level = getLevel(levelId)

  const [phase, setPhase] = useState<Phase>('idle')
  const [deck, setDeck] = useState<WordCard[]>([])
  const [index, setIndex] = useState(0)
  const [score, setScore] = useState(0)
  const [timeLeft, setTimeLeft] = useState(level.durationMs)
  const [flash, setFlash] = useState<Flash>(null)
  const [recState, setRecState] = useState<RecState>('idle')
  const [statusText, setStatusText] = useState('准备好了吗？')
  const [heardText, setHeardText] = useState('')
  const [showAnswer, setShowAnswer] = useState(false)
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
  const [skipping, setSkipping] = useState(false)
  const savedThisRoundRef = useRef(false)

  const recorderRef = useRef<MicRecorder | null>(null)
  const queueRef = useRef(createPcmQueue())
  const abortRef = useRef<AbortController | null>(null)
  const sessionRef = useRef(0)
  const indexRef = useRef(0)
  const deckRef = useRef<WordCard[]>([])
  const scoreRef = useRef(0)
  const gameStartRef = useRef(0)
  const pauseStartedRef = useRef(0)
  const endedRef = useRef(false)
  const skipRef = useRef(false)
  const levelRef = useRef<LevelConfig>(level)
  const warmPromiseRef = useRef<Promise<PreparedIse | null> | null>(null)
  const liveUploadRef = useRef<LiveIseUpload | null>(null)
  const heardBytesRef = useRef(0)

  const current = deck[index]

  useEffect(() => {
    levelRef.current = level
  }, [level])

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
    const pendingLive = liveUploadRef.current
    liveUploadRef.current = null
    pendingLive?.cancel()
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
    // 只预热当前关词图（约 10 张），避免一进页拖 30 张
    preloadImages(wordsForLevel(level).map((w) => w.image))
  }, [level])

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
      const duration = levelRef.current.durationMs
      const left = Math.max(0, duration - (performance.now() - gameStartRef.current))
      setTimeLeft(left)
      if (left <= 0) endGame()
    }, 100)
    return () => window.clearInterval(tick)
  }, [phase, endGame])

  const moveToNextCard = useCallback(() => {
    let nextIndex = indexRef.current + 1
    let nextDeck = deckRef.current
    if (nextIndex >= nextDeck.length) {
      const level = levelRef.current
      const recentIds = nextDeck.slice(-6).map((w) => w.id)
      nextDeck = buildSessionDeck(
        wordsForLevel(level),
        level.deckPasses,
        recentIds,
      )
      deckRef.current = nextDeck
      setDeck(nextDeck)
      nextIndex = 0
    }
    indexRef.current = nextIndex
    setIndex(nextIndex)
    setEnterAnim(true)
    setSlideKey((k) => k + 1)
  }, [])

  const advanceCard = useCallback(() => {
    scoreRef.current += 1
    setScore(scoreRef.current)
    moveToNextCard()
  }, [moveToNextCard])

  const recordUntilDone = useCallback(async (session: number, signal: AbortSignal) => {
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

        const minBytes = 16000 * 2 * 0.35
        const hasAudio = heardBytesRef.current >= minBytes
        const doneBySilence =
          spoken && silenceMs >= SILENCE_END_MS && elapsed >= MIN_RECORD_MS && hasAudio
        const doneByTimeout = elapsed >= ATTEMPT_MAX_MS && hasAudio
        const forceEnd = elapsed >= ATTEMPT_MAX_MS + 600

        if (doneBySilence || doneByTimeout || forceEnd) {
          window.clearInterval(tick)
          signal.removeEventListener('abort', onAbort)
          resolve()
        }
      }, 30)
    })

    recorderRef.current?.stopCapture()
  }, [])

  const runOneAttempt = useCallback(
    async (word: WordCard, session: number) => {
      const abort = new AbortController()
      abortRef.current = abort
      liveUploadRef.current = null
      queueRef.current.clear()
      heardBytesRef.current = 0

      const cancelLive = { fn: null as null | (() => void) }

      // 录音同时预连并开始边录边传，减少说完后的空等
      const uploadReady = takeWarm(abort.signal)
        .then(async (prepared) => {
          if (abort.signal.aborted) throw new Error('Aborted')
          const live = await startLiveIseUpload({
            word: word.word,
            prepared,
            signal: abort.signal,
          })
          cancelLive.fn = () => live.cancel()
          liveUploadRef.current = live
          const backlog = queueRef.current.drain()
          if (backlog.length > 0) live.push(backlog)
          return live
        })
        .catch((err) => {
          console.warn('[ise] live upload start failed', err)
          return null
        })

      try {
        await recordUntilDone(session, abort.signal)
        if (sessionRef.current !== session || endedRef.current) {
          throw new Error('Aborted')
        }

        setRecState('scoring')
        setStatusText('评分中…')

        const live = await uploadReady
        const leftover = queueRef.current.drain()

        if (live) {
          if (leftover.length > 0) live.push(leftover)
          liveUploadRef.current = null
          return await live.finish()
        }

        // 预连失败：退回整包上传
        liveUploadRef.current = null
        cancelLive.fn = null
        if (leftover.length < 1600) {
          throw new Error('录音太短，请再说一次')
        }
        return await evaluateRecordedWord({
          word: word.word,
          pcm: leftover,
          signal: abort.signal,
        })
      } catch (err) {
        cancelLive.fn?.()
        liveUploadRef.current = null
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
      passScore: levelRef.current.passScore,
      passAccuracy: levelRef.current.passAccuracy,
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
          recorderRef.current = await createGameMicRecorder((chunk) => {
            heardBytesRef.current += chunk.byteLength
            if (liveUploadRef.current) {
              liveUploadRef.current.push(chunk)
            } else {
              queueRef.current.push(chunk)
            }
          })
        }

        while (!cancelled && !endedRef.current && sessionRef.current === session) {
          const word = deckRef.current[indexRef.current]
          if (!word) break

          const revealAndSkip = async () => {
            skipRef.current = false
            setSkipping(true)
            setRecState('idle')
            setFlash(null)
            setShowAnswer(true)
            setHeardText(word.word)
            setStatusText(`答案是 ${word.word}`)
            // 等两帧，确保揭晓 UI 先画出来
            await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())))
            await sleep(SKIP_REVEAL_MS)
            if (cancelled || sessionRef.current !== session || endedRef.current) return false
            setShowAnswer(false)
            setHeardText('')
            setSkipping(false)
            moveToNextCard()
            return true
          }

          if (skipRef.current) {
            const ok = await revealAndSkip()
            if (!ok) return
            continue
          }

          let result: IseResult
          try {
            result = await runOneAttempt(word, session)
          } catch (err) {
            if (cancelled || sessionRef.current !== session || endedRef.current) return
            if (skipRef.current) {
              const ok = await revealAndSkip()
              if (!ok) return
              continue
            }
            const aborted =
              (err instanceof Error && err.message === 'Aborted') ||
              (err instanceof DOMException && err.name === 'AbortError') ||
              (err instanceof Error && err.name === 'AbortError')
            if (aborted) return
            console.error(err)
            setRecState('idle')
            setFlash('fail')
            setStatusText(err instanceof Error ? err.message : '评测失败')
            setHeardText('再试')
            await sleep(FAIL_PAUSE_MS)
            if (cancelled || sessionRef.current !== session || endedRef.current) return
            if (skipRef.current) {
              const ok = await revealAndSkip()
              if (!ok) return
              continue
            }
            setFlash(null)
            continue
          }

          if (cancelled || sessionRef.current !== session || endedRef.current) return
          if (skipRef.current) {
            const ok = await revealAndSkip()
            if (!ok) return
            continue
          }

          const passed = applyResult(result)
          setRecState('idle')

          if (passed) {
            await sleep(PASS_PAUSE_MS)
            if (cancelled || sessionRef.current !== session || endedRef.current) return
            if (skipRef.current) {
              const ok = await revealAndSkip()
              if (!ok) return
              continue
            }
            setFlash(null)
            setHeardText('')
            advanceCard()
            continue
          }

          await sleep(FAIL_PAUSE_MS)
          if (cancelled || sessionRef.current !== session || endedRef.current) return
          if (skipRef.current) {
            const ok = await revealAndSkip()
            if (!ok) return
            continue
          }
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
  }, [phase, runOneAttempt, applyResult, advanceCard, moveToNextCard, closeWarm])

  const pauseGame = useCallback(() => {
    if (phase !== 'playing' || endedRef.current || skipping) return
    skipRef.current = false
    pauseStartedRef.current = performance.now()
    abortRef.current?.abort()
    recorderRef.current?.stopCapture()
    setRecState('idle')
    setMicLevel(0)
    setFlash(null)
    setShowAnswer(false)
    setPhase('paused')
    setStatusText('已暂停')
  }, [phase, skipping])

  const resumeGame = useCallback(() => {
    if (phase !== 'paused' || endedRef.current) return
    const pausedFor = performance.now() - pauseStartedRef.current
    gameStartRef.current += pausedFor
    setPhase('playing')
    setStatusText('继续说…')
  }, [phase])

  const skipCard = useCallback(() => {
    if (phase !== 'playing' || endedRef.current || skipping || skipRef.current) return
    const word = deckRef.current[indexRef.current]
    skipRef.current = true
    // 立刻揭晓，不等 abort 回调，避免「闪一下就跳走」
    setSkipping(true)
    setRecState('idle')
    setFlash(null)
    setShowAnswer(true)
    if (word) {
      setHeardText(word.word)
      setStatusText(`答案是 ${word.word}`)
    }
    setMicLevel(0)
    abortRef.current?.abort()
    recorderRef.current?.stopCapture()
  }, [phase, skipping])

  const goHome = useCallback(() => {
    endedRef.current = true
    sessionRef.current += 1
    abortRef.current?.abort()
    void cleanupMic().finally(() => {
      navigate('/')
    })
  }, [cleanupMic, navigate])

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
    saveSelectedLevelId(levelId)
    setStatusText(wantsMockMic() ? '假麦模式开启…' : '正在开启麦克风…')
    try {
      sessionRef.current += 1
      endedRef.current = false
      await cleanupMic()
      queueRef.current = createPcmQueue()
      recorderRef.current = await createGameMicRecorder((chunk) => {
        heardBytesRef.current += chunk.byteLength
        if (liveUploadRef.current) {
          liveUploadRef.current.push(chunk)
        } else {
          queueRef.current.push(chunk)
        }
      })
      recorderRef.current.stopCapture()

      // 开局先把鉴权 + WS 预热好
      void fetch('/api/ise-auth').catch(() => null)
      armWarm()

      const active = getLevel(levelId)
      levelRef.current = active
      const pool = wordsForLevel(active)
      const nextDeck = buildSessionDeck(pool, active.deckPasses)
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
      setTimeLeft(active.durationMs)
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

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (phase === 'playing') {
        e.preventDefault()
        pauseGame()
      } else if (phase === 'paused') {
        e.preventDefault()
        resumeGame()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [phase, pauseGame, resumeGame])

  const durationMs = level.durationMs
  const progress = timeLeft / durationMs
  const urgency = progress < 0.25
  const inRound = phase === 'playing' || phase === 'paused'

  const formatTime = (ms: number) => {
    const total = Math.max(0, Math.ceil(ms / 1000))
    const m = Math.floor(total / 60)
    const s = total % 60
    return `${m}:${s.toString().padStart(2, '0')}`
  }

  const countdownSec = Math.max(0, Math.ceil(timeLeft / 1000))

  const idleTimeLabel = () => {
    const total = Math.round(durationMs / 1000)
    return `${total} 秒`
  }

  return (
    <div
      className={`game ${flash ? `flash-${flash}` : ''} ${urgency && phase === 'playing' ? 'urgent' : ''} ${phase === 'idle' ? 'is-ready' : ''} ${phase === 'gameover' ? 'is-ended' : ''} ${inRound ? 'is-playing' : ''}`}
    >
      <header className={`hud${inRound ? ' hud-play' : ''}`}>
        {inRound ? (
          <>
            <div className="play-scoreline" aria-label="对局状态">
              <span className="play-score">
                <em>{score}</em> 说对
              </span>
              <span className="play-level">{level.title}</span>
            </div>
            <div
              className={`play-countdown${urgency ? ' urgent' : ''}`}
              aria-label={`剩余 ${countdownSec} 秒`}
            >
              {countdownSec}
            </div>
          </>
        ) : (
          <>
            <Link to="/" className="brand">
              Speak Scroll
            </Link>
            <div className="hud-right">
              <div className="hud-stats">
                {phase === 'gameover' ? (
                  <>
                    <div className="stat">
                      <span className="stat-label">说对</span>
                      <span className="stat-value">{score}</span>
                    </div>
                    <div className="stat">
                      <span className="stat-label">最高</span>
                      <span className="stat-value">{board.best}</span>
                    </div>
                  </>
                ) : (
                  <div className="stat">
                    <span className="stat-label">时长</span>
                    <span className="stat-value timer-stat">{idleTimeLabel()}</span>
                  </div>
                )}
              </div>
            </div>
          </>
        )}
        {inRound && (
          <div className="hud-actions">
            {phase === 'playing' ? (
              <button type="button" className="hud-btn" onClick={pauseGame}>
                暂停
              </button>
            ) : (
              <button type="button" className="hud-btn" onClick={resumeGame}>
                继续
              </button>
            )}
            <button type="button" className="hud-btn ghost" onClick={goHome}>
              主页
            </button>
          </div>
        )}
      </header>

      <div className="timer-track" aria-hidden={!inRound}>
        <div
          className="timer-fill"
          style={{
            transform: `scaleX(${
              phase === 'playing' || phase === 'paused'
                ? progress
                : phase === 'gameover'
                  ? 0
                  : 1
            })`,
          }}
        />
      </div>

      {phase === 'playing' && (
        <div className="mic-meter" aria-label="microphone level">
          <div className="mic-track">
            <div className="mic-fill" style={{ transform: `scaleX(${micLevel})` }} />
          </div>
        </div>
      )}

      <main className="stage">
        {phase === 'idle' && (
          <div className="panel start-panel play-ready">
            <p className="ready-hello">
              {nickname.trim() || '玩家'}，准备好了吗？
            </p>
            <div className="ready-level" aria-label="当前关卡">
              <strong className="ready-level-title">{level.title}</strong>
              <span className="ready-level-meta">
                {formatDurationLabel(level.durationMs)} · {level.blurb}
              </span>
            </div>
            <button type="button" className="cta" onClick={() => void startGame()}>
              开麦开始
            </button>
            {wantsMockMic() && (
              <p className="hint mock-mic-hint">假麦模式（mockMic=1）</p>
            )}
            <div className="home-cta-row ready-links">
              <Link className="text-link" to="/">
                换关卡
              </Link>
            </div>
            {statusText && statusText !== '准备好了吗？' ? (
              <p className="hint">{statusText}</p>
            ) : null}
          </div>
        )}

        {(phase === 'playing' || phase === 'paused') && current && (
          <div className={`play-area${phase === 'paused' ? ' is-paused' : ''}${current.hint && level.showHints ? ' has-hint' : ''}`}>
            {current.hint && level.showHints && !showAnswer && (
              <p className="card-hint" aria-label="中文提示">
                {current.hint}
              </p>
            )}
            {showAnswer && (
              <p className="card-answer-banner" aria-live="polite">
                答案是 <strong>{current.word}</strong>
              </p>
            )}
            <div key={slideKey} className="card-rail">
              <div
                className={`word-card ${enterAnim ? 'rush-in' : ''} ${flash === 'fail' ? 'shake-card' : ''}${showAnswer ? ' show-answer' : ''}`}
                onAnimationEnd={() => setEnterAnim(false)}
              >
                <img
                  key={current.image}
                  src={current.image}
                  alt="guess the word"
                  width={512}
                  height={512}
                  draggable={false}
                  loading="eager"
                  decoding="async"
                  fetchPriority="high"
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
                {showAnswer && (
                  <div className="word-reveal">
                    <span className="word-reveal-label">答案</span>
                    <strong className="word-reveal-text">{current.word}</strong>
                  </div>
                )}
              </div>
            </div>

            {phase === 'playing' && (
              <button
                type="button"
                className="skip-btn"
                onClick={skipCard}
                disabled={skipping}
              >
                不会这张
              </button>
            )}

            <div
              className={`play-status ${
                phase === 'paused'
                  ? 'paused'
                  : skipping
                    ? 'skipped'
                    : flash === 'pass'
                      ? 'ok'
                      : flash === 'fail'
                        ? 'bad'
                        : recState
              }`}
            >
              {phase === 'paused' && '已暂停'}
              {phase === 'playing' && skipping && `答案 · ${heardText || current.word}`}
              {phase === 'playing' && !skipping && recState === 'listening' && (
                <>
                  <span className="rec-dot" />
                  大声说完…
                </>
              )}
              {phase === 'playing' && !skipping && recState === 'scoring' && '评分中…'}
              {phase === 'playing' &&
                !skipping &&
                recState === 'idle' &&
                (flash === 'pass'
                  ? '对了！'
                  : flash === 'fail'
                    ? heardText || '再试一次'
                    : '准备开口')}
            </div>
          </div>
        )}

        {phase === 'paused' && (
          <div className="pause-overlay" role="dialog" aria-modal="true" aria-label="暂停菜单">
            <div className="panel pause-panel">
              <h1>暂停</h1>
              <p className="pause-summary">
                {level.name}
                <br />
                已说对 {score} 张 · 剩余 {formatTime(timeLeft)}
              </p>
              <div className="pause-actions">
                <button type="button" className="cta" onClick={resumeGame}>
                  继续游戏
                </button>
                <button type="button" className="text-link as-button" onClick={goHome}>
                  回到主页
                </button>
              </div>
              <p className="hint">Esc 继续 · 对局中点「不会」可看答案并跳过</p>
            </div>
          </div>
        )}

        {phase === 'gameover' && (
          <div className="panel end-panel">
            <div className="end-panel-top">
              <h1>时间到</h1>
              <p className="level-end-tag">{level.name}</p>
              <p className="big-score">{score}</p>
              <p className="end-summary">
                {isNewBest && score > 0
                  ? `本机新纪录！${formatDurationLabel(durationMs)}说对了这么多张`
                  : `${formatDurationLabel(durationMs)}说对了这么多张`}
              </p>
              {isNewBest && score > 0 && <p className="new-best-tag">BEST</p>}

              {current && (
                <div className="missed-reveal">
                  <p className="missed-label">最后这张是</p>
                  <div className="word-card missed-card">
                    <img src={current.image} alt="" draggable={false} />
                    <div className="word-reveal">
                      <span className="word-reveal-label">答案</span>
                      <strong className="word-reveal-text">{current.word}</strong>
                    </div>
                  </div>
                </div>
              )}

              <div className="end-actions">
                <div className="home-cta-row">
                  <button type="button" className="cta" onClick={() => void startGame()}>
                    再来一局
                  </button>
                  <button
                    type="button"
                    className="cta ghost"
                    onClick={() => navigate('/')}
                  >
                    换关卡
                  </button>
                </div>
                <div className="home-cta-row">
                  <Link className="text-link" to="/leaderboard">
                    排行榜
                  </Link>
                  <Link className="text-link" to="/">
                    回首页
                  </Link>
                </div>
              </div>
            </div>

            <div className="end-panel-more">
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
                    {leaderboard.slice(0, 5).map((row) => (
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
            </div>
          </div>
        )}
      </main>

      <footer className={`footer${inRound ? ' footer-play' : ''}`}>
        {!inRound && <span className="status">{statusText}</span>}
        {inRound && <span className="status level-footer">{statusText}</span>}
      </footer>
    </div>
  )
}
