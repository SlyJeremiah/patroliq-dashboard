// SOS alarm: short Web Audio beeps while an unacknowledged panic / dead man's switch alert is open.
// Browsers block audio until the user interacts with the page, so the hook reports `blocked` for a
// "Click to enable alarm sound" prompt, and resumes automatically on the next click anywhere.
import { useCallback, useEffect, useState } from 'react'

const MUTE_KEY = 'patroliq.alarmMuted'
const INTERVAL_MS = 4000

let ctx: AudioContext | null = null
const listeners = new Set<() => void>()

function audio(): AudioContext | null {
  if (ctx) return ctx
  const C = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!C) return null
  try {
    ctx = new C()
    ctx.onstatechange = () => listeners.forEach((fn) => fn())
  } catch {
    ctx = null
  }
  return ctx
}

function beep(c: AudioContext) {
  const start = c.currentTime + 0.02
  for (let i = 0; i < 3; i++) {
    const t = start + i * 0.22
    const osc = c.createOscillator()
    const gain = c.createGain()
    osc.type = 'square'
    osc.frequency.setValueAtTime(i % 2 ? 660 : 880, t)
    gain.gain.setValueAtTime(0.0001, t)
    gain.gain.exponentialRampToValueAtTime(0.18, t + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.16)
    osc.connect(gain).connect(c.destination)
    osc.start(t)
    osc.stop(t + 0.18)
  }
}

function readMuted(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) === '1'
  } catch {
    return false
  }
}

export interface AlarmState {
  /** Beeping right now. */
  sounding: boolean
  muted: boolean
  /** Audio is waiting for a user gesture (autoplay rules). */
  blocked: boolean
  toggleMute: () => void
  enable: () => void
}

export function useSosAlarm(shouldSound: boolean): AlarmState {
  const [muted, setMuted] = useState(readMuted)
  const [state, setState] = useState<AudioContextState | 'unsupported'>(() => (ctx ? ctx.state : 'suspended'))

  useEffect(() => {
    const update = () => setState(ctx ? ctx.state : 'unsupported')
    listeners.add(update)
    const onMute = (e: StorageEvent) => e.key === MUTE_KEY && setMuted(readMuted())
    window.addEventListener('storage', onMute)
    return () => {
      listeners.delete(update)
      window.removeEventListener('storage', onMute)
    }
  }, [])

  const active = shouldSound && !muted

  // Resume on the first interaction anywhere while the alarm is waiting.
  useEffect(() => {
    if (!active) return
    const c = audio()
    if (!c) {
      setState('unsupported')
      return
    }
    setState(c.state)
    if (c.state === 'running') return
    const unlock = () => void c.resume().catch(() => undefined)
    window.addEventListener('pointerdown', unlock, { once: true })
    window.addEventListener('keydown', unlock, { once: true })
    return () => {
      window.removeEventListener('pointerdown', unlock)
      window.removeEventListener('keydown', unlock)
    }
  }, [active])

  useEffect(() => {
    if (!active || state !== 'running' || !ctx) return
    const c = ctx
    beep(c)
    const t = setInterval(() => beep(c), INTERVAL_MS)
    return () => clearInterval(t)
  }, [active, state])

  const toggleMute = useCallback(() => {
    setMuted((m) => {
      try {
        localStorage.setItem(MUTE_KEY, m ? '0' : '1')
      } catch {
        /* storage unavailable */
      }
      return !m
    })
  }, [])

  const enable = useCallback(() => {
    const c = audio()
    if (!c) return
    void c.resume().then(() => setState(c.state)).catch(() => undefined)
  }, [])

  return {
    sounding: active && state === 'running',
    muted,
    blocked: active && state !== 'running' && state !== 'unsupported',
    toggleMute,
    enable,
  }
}
