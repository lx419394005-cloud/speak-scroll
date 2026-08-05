export type IseAuth = {
  appId: string
  url: string
}

export type IseResult = {
  totalScore: number
  accuracyScore: number | null
  /** 标准度/地道程度 */
  standardScore: number | null
  /** 音节分平均（无标准度时作地道度近似） */
  syllAvgScore: number | null
  content: string
  exceptInfo?: string
  exceptMessage?: string
  isRejected: boolean
  /** 单词层有增漏读/替换等错误 */
  hasPronError: boolean
  /** 音节检错（serr_msg 非 0） */
  hasSyllError: boolean
  /** 音素层有错误（排除 sil/fil） */
  hasPhoneError: boolean
  /** 有效音素正确率 0~1 */
  phoneOkRate: number | null
  /** 音素错误摘要，如「漏读×1 替换×2」 */
  phoneErrorSummary: string
  rawXml: string
}

export type PreparedIse = {
  auth: IseAuth
  ws: WebSocket
}

const FRAME_BYTES = 1280
/** 离线上传尽量大帧（文档上限约 19200B） */
const UPLOAD_FRAME_BYTES = 19200

/** 鉴权 URL 短缓存，避免每次评分都打本地 auth */
let authCache: { auth: IseAuth; at: number } | null = null
const AUTH_CACHE_MS = 45_000

const EXCEPT_MESSAGES: Record<string, string> = {
  '0': '',
  '28673': '没听清 / 音量太小',
  '28676': '听起来不像这个词',
  '28680': '噪音太大',
  '28689': '没有收到声音',
  '28690': '声音爆了（太大）',
}

export async function fetchIseAuth(): Promise<IseAuth> {
  if (authCache && Date.now() - authCache.at < AUTH_CACHE_MS) {
    return authCache.auth
  }
  const res = await fetch('/api/ise-auth')
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error || 'Failed to fetch ISE auth')
  }
  const auth = (await res.json()) as IseAuth
  authCache = { auth, at: Date.now() }
  return auth
}

/** 录音期间预连 WebSocket，说完即可直接传音频 */
export async function prepareIseConnection(signal?: AbortSignal): Promise<PreparedIse> {
  const auth = await fetchIseAuth()
  if (signal?.aborted) throw new Error('Aborted')

  return new Promise((resolve, reject) => {
    const ws = new WebSocket(auth.url)
    let done = false

    const fail = (err: Error) => {
      if (done) return
      done = true
      try {
        ws.close()
      } catch {
        /* ignore */
      }
      reject(err)
    }

    const onAbort = () => fail(new Error('Aborted'))
    signal?.addEventListener('abort', onAbort, { once: true })

    const timer = window.setTimeout(() => fail(new Error('连接讯飞超时')), 5000)

    ws.onopen = () => {
      if (done) return
      done = true
      window.clearTimeout(timer)
      signal?.removeEventListener('abort', onAbort)
      resolve({ auth, ws })
    }
    ws.onerror = () => fail(new Error('WebSocket error'))
    ws.onclose = () => {
      if (!done) fail(new Error('WebSocket closed before open'))
    }
  })
}

function decodeBase64Utf8(b64: string): string {
  const binary = atob(b64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i)
  }
  return new TextDecoder('utf-8').decode(bytes)
}

function pickAttr(attrs: string, name: string): string | undefined {
  return attrs.match(new RegExp(`${name}="([^"]*)"`, 'i'))?.[1]
}

const DP_LABELS: Record<number, string> = {
  16: '漏读',
  32: '增读',
  64: '回读',
  128: '替换',
}

function isNoisePhone(content: string): boolean {
  const c = content.toLowerCase()
  return c === 'sil' || c === 'silv' || c === 'fil'
}

function parseIseXml(xml: string): Omit<IseResult, 'rawXml'> {
  const plain = xml.match(/<total_score\b[^>]*\bvalue="([\d.]+)"/i)?.[1]

  // 优先 rec_paper 内的 read_word（真正带评测分的那一层）
  const paperWord = xml.match(/<rec_paper\b[^>]*>[\s\S]*?<read_word\b([^>]*)>/i)
  const allReadWords = [...xml.matchAll(/<read_word\b([^>]*)>/gi)].map((m) => m[1] ?? '')

  let metaSource = paperWord?.[1] || ''
  if (!metaSource || !/total_score="/i.test(metaSource)) {
    const scored = allReadWords.filter((a) => /total_score="/i.test(a))
    metaSource = scored[scored.length - 1] || allReadWords[allReadWords.length - 1] || ''
  }

  let totalScore = Number(pickAttr(metaSource, 'total_score') || plain || '0')
  if (!Number.isFinite(totalScore) || totalScore <= 0) {
    // 兜底：任意节点上最大的 total_score
    const allTotals = [
      ...xml.matchAll(/\btotal_score="([\d.]+)"/gi),
      ...xml.matchAll(/<total_score\b[^>]*\bvalue="([\d.]+)"/gi),
    ]
      .map((m) => Number(m[1]))
      .filter((n) => Number.isFinite(n) && n > 0)
    if (allTotals.length) {
      totalScore = Math.max(...allTotals)
    }
  }
  if (!Number.isFinite(totalScore) || totalScore <= 0) {
    const wordScores = [...xml.matchAll(/<word\b([^>]*)>/gi)]
      .map((m) => Number(pickAttr(m[1] ?? '', 'total_score') || NaN))
      .filter((n) => Number.isFinite(n) && n > 0)
    if (wordScores.length) {
      totalScore = wordScores.reduce((a, b) => a + b, 0) / wordScores.length
    }
  }

  // 未开百分制时英文常返回 5 分制，换算成百分制
  if (totalScore > 0 && totalScore <= 5) {
    console.warn('[ise] score looks 5-point, converting ×20', totalScore)
    totalScore = totalScore * 20
  }

  // ISE 常把未启用的维度写成 0，0 视为“无此项”
  const numOrNull = (raw: string | undefined) => {
    if (raw == null || raw === '') return null
    const n = Number(raw)
    if (!Number.isFinite(n) || n <= 0) return null
    // 5 分制 → 百分制
    if (n <= 5) return n * 20
    return n
  }

  const accuracyScore = numOrNull(
    pickAttr(metaSource, 'accuracy_score') || xml.match(/accuracy_score="([\d.]+)"/i)?.[1],
  )
  const standardScore = numOrNull(
    pickAttr(metaSource, 'standard_score') || xml.match(/standard_score="([\d.]+)"/i)?.[1],
  )

  const content =
    pickAttr(metaSource, 'content') ||
    xml.match(/<word\b[^>]*content="([^"]*)"/i)?.[1] ||
    ''

  const exceptInfo =
    pickAttr(metaSource, 'except_info') ||
    xml.match(/\bexcept_info="([^"]*)"/i)?.[1] ||
    '0'
  const isRejected =
    (
      pickAttr(metaSource, 'is_rejected') ||
      xml.match(/\bis_rejected="([^"]*)"/i)?.[1] ||
      'false'
    ).toLowerCase() === 'true'

  const dpMessages = [...xml.matchAll(/<word\b([^>]*)>/gi)].map(
    (m) => Number(pickAttr(m[1] ?? '', 'dp_message') || '0'),
  )
  const hasPronError = dpMessages.some((d) => d !== 0)

  const syllAttrs = [...xml.matchAll(/<syll\b([^>]*)>/gi)].map((m) => m[1] ?? '')
  const syllScores = syllAttrs
    .map((a) => Number(pickAttr(a, 'syll_score') || NaN))
    .filter((n) => Number.isFinite(n))
    .map((n) => (n > 0 && n <= 5 ? n * 20 : n))
  const syllAvgScore =
    syllScores.length > 0
      ? syllScores.reduce((a, b) => a + b, 0) / syllScores.length
      : null
  const hasSyllError = syllAttrs.some((a) => {
    const serr = Number(pickAttr(a, 'serr_msg') || '0')
    return serr !== 0
  })

  // 音素层：排除静音/噪音标记，统计 dp_message
  const phoneAttrs = [...xml.matchAll(/<phone\b([^>]*)>/gi)].map((m) => m[1] ?? '')
  const speechPhones = phoneAttrs.filter((a) => {
    const c = pickAttr(a, 'content') || ''
    return !isNoisePhone(c)
  })
  const phoneErrorCounts: Record<number, number> = {}
  let phoneOk = 0
  for (const a of speechPhones) {
    const dp = Number(pickAttr(a, 'dp_message') || '0')
    if (dp === 0) {
      phoneOk += 1
    } else {
      phoneErrorCounts[dp] = (phoneErrorCounts[dp] || 0) + 1
    }
  }
  const phoneTotal = speechPhones.length
  const hasPhoneError = phoneTotal > 0 && phoneOk < phoneTotal
  const phoneOkRate = phoneTotal > 0 ? phoneOk / phoneTotal : null
  const phoneErrorSummary = Object.entries(phoneErrorCounts)
    .map(([code, n]) => `${DP_LABELS[Number(code)] || `码${code}`}×${n}`)
    .join(' ')

  console.log('[ise][score-raw]', {
    totalScore,
    accuracyScore,
    standardScore,
    metaHasTotal: /total_score="/i.test(metaSource),
    plain,
    xmlHead: xml.slice(0, 280),
  })

  const exceptMessage =
    EXCEPT_MESSAGES[exceptInfo] || (exceptInfo !== '0' ? `异常 ${exceptInfo}` : '')

  return {
    totalScore: Number.isFinite(totalScore) ? totalScore : 0,
    accuracyScore,
    standardScore,
    syllAvgScore,
    content,
    exceptInfo,
    exceptMessage,
    isRejected,
    hasPronError,
    hasSyllError,
    hasPhoneError,
    phoneOkRate,
    phoneErrorSummary,
  }
}

export type PassThresholds = {
  passScore: number
  passAccuracy: number
}

/** 过关：总分 + 准确度（有该字段时）；不展示分数，不卡标准度/音素 */
export function isPronunciationPass(
  result: Omit<IseResult, 'rawXml'>,
  thresholds: PassThresholds,
): { ok: boolean; reason: string } {
  const { passScore, passAccuracy } = thresholds

  console.log('[ise][pass-check] inputs', {
    exceptInfo: result.exceptInfo,
    isRejected: result.isRejected,
    totalScore: result.totalScore,
    accuracyScore: result.accuracyScore,
    passScore,
    passAccuracy,
  })

  if (result.exceptInfo && result.exceptInfo !== '0') {
    const reason = result.exceptMessage || '识别异常，请再说一次'
    console.warn('[ise][pass-check] FAIL except_info', reason)
    return { ok: false, reason }
  }
  if (result.isRejected) {
    const reason = '发音被判定为不正确'
    console.warn('[ise][pass-check] FAIL is_rejected', reason)
    return { ok: false, reason }
  }
  if (result.totalScore < passScore) {
    const reason = '还差一点，再说一次'
    console.warn('[ise][pass-check] FAIL total_score', {
      totalScore: result.totalScore,
      need: passScore,
    })
    return { ok: false, reason }
  }
  if (result.accuracyScore != null && result.accuracyScore < passAccuracy) {
    const reason = '发音不够准，再说清楚一点'
    console.warn('[ise][pass-check] FAIL accuracy_score', {
      accuracyScore: result.accuracyScore,
      need: passAccuracy,
    })
    return { ok: false, reason }
  }

  console.log('[ise][pass-check] PASS')
  return { ok: true, reason: '' }
}

function buildWordPaper(word: string): string {
  return `\uFEFF[word]\n${word}\n`
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  const step = 0x8000
  for (let i = 0; i < bytes.length; i += step) {
    binary += String.fromCharCode(...bytes.subarray(i, i + step))
  }
  return btoa(binary)
}

function pcmToBytes(pcm: Int16Array): Uint8Array {
  return new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength)
}

/** 只去掉开头静音，保留完整词尾（尾部裁剪容易切掉末音节） */
export function trimPcmSilence(pcm: Int16Array): Int16Array {
  if (pcm.length < 1600) return pcm
  const win = 160 // 10ms @16k
  const threshold = 280
  const energy = (from: number) => {
    let sum = 0
    const end = Math.min(pcm.length, from + win)
    for (let i = from; i < end; i += 1) sum += Math.abs(pcm[i]!)
    return sum / (end - from)
  }

  let start = 0
  while (start + win < pcm.length && energy(start) < threshold) start += win
  // 多留一点开头，避免辅音起音被砍
  start = Math.max(0, start - win * 3)

  if (pcm.length - start < 1600) return pcm
  return pcm.subarray(start)
}

/**
 * 边录边传：录音过程中把 PCM 推上已预连的 WebSocket，说完立刻收尾等分。
 * 比「录完再整包上传」少一段说完后的空等。
 */
export type LiveIseUpload = {
  push: (chunk: Int16Array) => void
  finish: () => Promise<IseResult>
  cancel: () => void
}

export async function startLiveIseUpload(options: {
  word: string
  prepared?: PreparedIse | null
  auth?: IseAuth
  signal?: AbortSignal
}): Promise<LiveIseUpload> {
  if (options.signal?.aborted) throw new Error('Aborted')

  let ws: WebSocket
  let auth: IseAuth

  if (options.prepared && options.prepared.ws.readyState === WebSocket.OPEN) {
    ws = options.prepared.ws
    auth = options.prepared.auth
  } else {
    auth = options.auth ?? (await fetchIseAuth())
    if (options.signal?.aborted) throw new Error('Aborted')
    ws = await new Promise<WebSocket>((resolve, reject) => {
      const socket = new WebSocket(auth.url)
      const t = window.setTimeout(() => {
        socket.close()
        reject(new Error('连接讯飞超时'))
      }, 4000)
      socket.onopen = () => {
        window.clearTimeout(t)
        resolve(socket)
      }
      socket.onerror = () => {
        window.clearTimeout(t)
        reject(new Error('WebSocket error'))
      }
    })
  }

  const t0 = performance.now()
  let pending = new Uint8Array(0)
  let sentFirst = false
  let ssbSent = false
  let finished = false
  let cancelled = false
  let settled = false
  let closedByUs = false
  let finalTimer: number | null = null
  let resultPromise: Promise<IseResult> | null = null
  let resolveResult: ((r: IseResult) => void) | null = null
  let rejectResult: ((e: Error) => void) | null = null

  const fail = (err: Error) => {
    if (settled) return
    settled = true
    cancelled = true
    if (finalTimer != null) window.clearTimeout(finalTimer)
    closedByUs = true
    try {
      ws.close()
    } catch {
      /* ignore */
    }
    rejectResult?.(err)
  }

  const onAbort = () => fail(new Error('Aborted'))
  options.signal?.addEventListener('abort', onAbort, { once: true })

  resultPromise = new Promise<IseResult>((resolve, reject) => {
    resolveResult = resolve
    rejectResult = reject
  })

  const sendAudioFrame = (frame: Uint8Array, aus: 1 | 2 | 4, status: 1 | 2) => {
    ws.send(
      JSON.stringify({
        business: { cmd: 'auw', aus, aue: 'raw' },
        data: {
          status,
          data: bytesToBase64(frame),
          data_type: 1,
          encoding: 'raw',
        },
      }),
    )
  }

  const ensureSsb = () => {
    if (ssbSent || cancelled) return
    ssbSent = true
    // 去掉 multi_dimension，只要总分/准确度，评测更快
    ws.send(
      JSON.stringify({
        common: { app_id: auth.appId },
        business: {
          sub: 'ise',
          ent: 'en_vip',
          category: 'read_word',
          cmd: 'ssb',
          auf: 'audio/L16;rate=16000',
          aue: 'raw',
          tte: 'utf-8',
          ttp_skip: true,
          text: buildWordPaper(options.word),
          rstcd: 'utf8',
          rst: 'entirety',
          ise_unite: '1',
        },
        data: {
          status: 0,
          data: '',
          data_type: 1,
          encoding: 'raw',
        },
      }),
    )
  }

  const flushFullFrames = () => {
    while (pending.byteLength >= UPLOAD_FRAME_BYTES) {
      ensureSsb()
      const frame = pending.subarray(0, UPLOAD_FRAME_BYTES)
      pending = pending.subarray(UPLOAD_FRAME_BYTES)
      if (!sentFirst) {
        sendAudioFrame(frame.slice(), 1, 1)
        sentFirst = true
      } else {
        sendAudioFrame(frame.slice(), 2, 1)
      }
    }
  }

  ws.onmessage = (event) => {
    if (settled) return
    try {
      const msg = JSON.parse(String(event.data)) as {
        code?: number
        message?: string
        data?: { data?: string; status?: number | string }
        status?: number | string
      }

      if (msg.code !== undefined && msg.code !== 0) {
        fail(new Error(msg.message || `ISE error ${msg.code}`))
        return
      }

      const status = Number(msg.data?.status ?? msg.status)
      if (status !== 2 || !msg.data?.data) return

      const xml = decodeBase64Utf8(msg.data.data)
      const parsed = parseIseXml(xml)
      console.log('[ise][live-parsed]', {
        content: parsed.content,
        totalScore: parsed.totalScore,
        accuracyScore: parsed.accuracyScore,
        roundtripMs: Math.round(performance.now() - t0),
      })

      settled = true
      if (finalTimer != null) window.clearTimeout(finalTimer)
      closedByUs = true
      options.signal?.removeEventListener('abort', onAbort)
      try {
        ws.close()
      } catch {
        /* ignore */
      }
      resolveResult?.({ ...parsed, rawXml: xml })
    } catch (err) {
      fail(err instanceof Error ? err : new Error('Bad ISE response'))
    }
  }

  ws.onerror = () => fail(new Error('WebSocket error'))
  ws.onclose = () => {
    options.signal?.removeEventListener('abort', onAbort)
    if (!settled && !closedByUs) {
      fail(new Error('WebSocket closed before result'))
    }
  }

  return {
    push(chunk: Int16Array) {
      if (cancelled || finished || chunk.length === 0) return
      const bytes = pcmToBytes(chunk)
      const merged = new Uint8Array(pending.byteLength + bytes.byteLength)
      merged.set(pending, 0)
      merged.set(bytes, pending.byteLength)
      pending = merged
      flushFullFrames()
    },
    finish() {
      if (cancelled) return Promise.reject(new Error('Aborted'))
      if (finished) return resultPromise!
      finished = true

      ensureSsb()

      // 尾包：不足一帧也发出去
      const tail =
        pending.byteLength > 0
          ? pending
          : new Uint8Array(FRAME_BYTES)
      pending = new Uint8Array(0)

      const last =
        tail.byteLength === UPLOAD_FRAME_BYTES || tail.byteLength >= FRAME_BYTES
          ? tail
          : (() => {
              const padded = new Uint8Array(Math.max(FRAME_BYTES, tail.byteLength))
              padded.set(tail)
              return padded
            })()

      if (!sentFirst) {
        // 整段很短：先 aus=1 再空 aus=4
        sendAudioFrame(last.slice(), 1, 1)
        sendAudioFrame(new Uint8Array(FRAME_BYTES), 4, 2)
      } else {
        sendAudioFrame(last.slice(), 4, 2)
      }

      console.debug('[ise] live finish', {
        roundtripMs: Math.round(performance.now() - t0),
      })

      finalTimer = window.setTimeout(() => {
        if (!settled) fail(new Error('评测超时'))
      }, 5000)

      return resultPromise!
    },
    cancel() {
      fail(new Error('Aborted'))
    },
  }
}

/**
 * 本地录完后整包上传（live 失败时的兜底）。
 */
export async function evaluateRecordedWord(options: {
  word: string
  pcm: Int16Array
  prepared?: PreparedIse | null
  auth?: IseAuth
  signal?: AbortSignal
}): Promise<IseResult> {
  const pcm = trimPcmSilence(options.pcm)
  if (pcm.length < 1600) {
    throw new Error('录音太短，请再说一次')
  }
  const upload = await startLiveIseUpload({
    word: options.word,
    prepared: options.prepared,
    auth: options.auth,
    signal: options.signal,
  })
  try {
    upload.push(pcm)
    return await upload.finish()
  } catch (err) {
    upload.cancel()
    throw err
  }
}

/** 本地录音缓冲 */
export function createPcmQueue() {
  let buffer: Int16Array[] = []
  let bytes = 0

  return {
    push(chunk: Int16Array) {
      if (chunk.length === 0) return
      buffer.push(chunk.slice())
      bytes += chunk.byteLength
    },
    drain(): Int16Array {
      if (buffer.length === 0) return new Int16Array(0)
      const total = buffer.reduce((n, c) => n + c.length, 0)
      const merged = new Int16Array(total)
      let offset = 0
      for (const c of buffer) {
        merged.set(c, offset)
        offset += c.length
      }
      buffer = []
      bytes = 0
      return merged
    },
    byteLength() {
      return bytes
    },
    clear() {
      buffer = []
      bytes = 0
    },
  }
}
