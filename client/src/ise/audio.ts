function floatTo16BitPCM(input: Float32Array): Int16Array {
  const output = new Int16Array(input.length)
  for (let i = 0; i < input.length; i += 1) {
    const s = Math.max(-1, Math.min(1, input[i] ?? 0))
    output[i] = s < 0 ? s * 0x8000 : s * 0x7fff
  }
  return output
}

function downsampleBuffer(
  buffer: Float32Array,
  sampleRate: number,
  outRate: number,
): Float32Array {
  if (outRate === sampleRate) return buffer
  const ratio = sampleRate / outRate
  const newLength = Math.round(buffer.length / ratio)
  const result = new Float32Array(newLength)
  let offsetResult = 0
  let offsetBuffer = 0
  while (offsetResult < result.length) {
    const nextOffsetBuffer = Math.round((offsetResult + 1) * ratio)
    let accum = 0
    let count = 0
    for (let i = offsetBuffer; i < nextOffsetBuffer && i < buffer.length; i += 1) {
      accum += buffer[i] ?? 0
      count += 1
    }
    result[offsetResult] = count > 0 ? accum / count : 0
    offsetResult += 1
    offsetBuffer = nextOffsetBuffer
  }
  return result
}

export type MicRecorder = {
  /** 开始把 PCM 写入回调（评测用） */
  startCapture: () => Promise<void>
  /** 暂停写入 PCM，但麦克风与电平监测保持开启 */
  stopCapture: () => void
  close: () => Promise<void>
  getRms: () => number
  /** 0~1 可视化音量 */
  getLevel: () => number
}

/** 无硬件麦克风时可用：URL 加 `?mockMic=1` 进入假麦，方便测暂停/回主页等 UI */
export function wantsMockMic(): boolean {
  try {
    const q = new URLSearchParams(window.location.search)
    const v = q.get('mockMic')
    return v === '1' || v === 'true'
  } catch {
    return false
  }
}

/**
 * 合成假麦克风：周期性“说话”音量 + PCM，不调用 getUserMedia。
 * 仅用于本机/云端无麦时的 UI 联调，不走真实评测效果。
 */
export async function createMockMicRecorder(
  onPcm: (chunk: Int16Array) => void,
): Promise<MicRecorder> {
  let capturing = false
  let latestRms = 0
  let latestLevel = 0
  let tick = 0
  let phase = 0
  const sampleRate = 16000
  const frameSamples = 1024

  tick = window.setInterval(() => {
    // 约 2.2s 周期：先响后静，触发静音结束逻辑
    const cycle = (performance.now() / 2200) % 1
    const speaking = cycle < 0.45
    const amp = speaking ? 0.22 : 0.002
    latestRms = amp * 0.7
    latestLevel = speaking ? Math.min(1, amp * 3.2) : 0.02

    if (!capturing) return

    const pcm = new Int16Array(frameSamples)
    for (let i = 0; i < frameSamples; i += 1) {
      phase += (440 * Math.PI * 2) / sampleRate
      const sample = Math.sin(phase) * amp
      pcm[i] = Math.max(-1, Math.min(1, sample)) * 0x7fff
    }
    onPcm(pcm)
  }, 64)

  return {
    startCapture: async () => {
      capturing = true
    },
    stopCapture: () => {
      capturing = false
      latestRms = 0
      latestLevel = 0
    },
    getRms: () => latestRms,
    getLevel: () => latestLevel,
    close: async () => {
      capturing = false
      window.clearInterval(tick)
      latestRms = 0
      latestLevel = 0
    },
  }
}

export async function createGameMicRecorder(
  onPcm: (chunk: Int16Array) => void,
): Promise<MicRecorder> {
  if (wantsMockMic()) {
    console.info('[mic] using mockMic=1 synthetic recorder')
    return createMockMicRecorder(onPcm)
  }
  return createMicRecorder(onPcm)
}

export async function createMicRecorder(
  onPcm: (chunk: Int16Array) => void,
): Promise<MicRecorder> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      channelCount: 1,
      // 过强降噪会把语音压没，评测场景尽量关
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: true,
    },
  })

  const audioContext = new AudioContext({ sampleRate: 16000 })
  // 部分浏览器会忽略 sampleRate 请求，仍以下采样兜底
  const source = audioContext.createMediaStreamSource(stream)
  const analyser = audioContext.createAnalyser()
  analyser.fftSize = 2048
  analyser.smoothingTimeConstant = 0.7

  // ScriptProcessor 必须接到 destination 才会持续回调（即使用静音 gain）
  const processor = audioContext.createScriptProcessor(4096, 1, 1)
  const mute = audioContext.createGain()
  mute.gain.value = 0

  let capturing = false
  let latestRms = 0
  let latestLevel = 0
  const timeDomain = new Uint8Array(analyser.fftSize)

  const ensureRunning = async () => {
    if (audioContext.state === 'suspended') {
      await audioContext.resume()
    }
  }

  // 先接通图，保证电平始终有数据
  source.connect(analyser)
  source.connect(processor)
  processor.connect(mute)
  mute.connect(audioContext.destination)
  await ensureRunning()

  processor.onaudioprocess = (event) => {
    const input = event.inputBuffer.getChannelData(0)

    let sum = 0
    for (let i = 0; i < input.length; i += 1) {
      const v = input[i] ?? 0
      sum += v * v
    }
    latestRms = Math.sqrt(sum / Math.max(1, input.length))

    analyser.getByteTimeDomainData(timeDomain)
    let peak = 0
    for (let i = 0; i < timeDomain.length; i += 1) {
      const centered = Math.abs((timeDomain[i] ?? 128) - 128) / 128
      if (centered > peak) peak = centered
    }
    latestLevel = Math.min(1, Math.max(latestRms * 4, peak * 1.4))

    if (!capturing) return

    const down = downsampleBuffer(input, audioContext.sampleRate, 16000)
    if (down.length > 0) {
      onPcm(floatTo16BitPCM(down))
    }
  }

  return {
    startCapture: async () => {
      await ensureRunning()
      capturing = true
    },
    stopCapture: () => {
      capturing = false
    },
    getRms: () => latestRms,
    getLevel: () => latestLevel,
    close: async () => {
      capturing = false
      try {
        processor.disconnect()
        source.disconnect()
        analyser.disconnect()
        mute.disconnect()
      } catch {
        /* already disconnected */
      }
      stream.getTracks().forEach((t) => t.stop())
      if (audioContext.state !== 'closed') {
        await audioContext.close()
      }
    },
  }
}
