/**
 * Posición GPS compartida por toda la app: un único watchPosition mientras alguien la use.
 */
import { useEffect, useSyncExternalStore } from 'react'
import type { LatLon } from '../lib/geo'

export interface Fix {
  p: LatLon
  /** Precisión horizontal (m) */
  acc: number
  /** Rumbo de movimiento (grados) si el GPS lo da */
  heading: number | null
  /** m/s */
  speed: number | null
  t: number
}

export interface PosState {
  fix: Fix | null
  error: 'denegado' | 'no-disponible' | 'sin-gps' | null
}

let state: PosState = { fix: null, error: null }
const listeners = new Set<() => void>()
let watchId: number | null = null
let users = 0

function set(next: Partial<PosState>) {
  state = { ...state, ...next }
  listeners.forEach((f) => f())
}

function start() {
  if (watchId !== null) return
  if (!('geolocation' in navigator)) {
    set({ error: 'sin-gps' })
    return
  }
  watchId = navigator.geolocation.watchPosition(
    (pos) => {
      const c = pos.coords
      set({
        fix: {
          p: [c.latitude, c.longitude],
          acc: c.accuracy,
          heading: c.heading !== null && !isNaN(c.heading) ? c.heading : null,
          speed: c.speed,
          t: pos.timestamp,
        },
        error: null,
      })
    },
    (err) => set({ error: err.code === err.PERMISSION_DENIED ? 'denegado' : 'no-disponible' }),
    { enableHighAccuracy: true, maximumAge: 1000, timeout: 30000 },
  )
}

function stop() {
  if (watchId !== null) navigator.geolocation.clearWatch(watchId)
  watchId = null
}

const subscribe = (f: () => void) => {
  listeners.add(f)
  return () => listeners.delete(f)
}

/** Última posición conocida (aunque nadie esté usando el GPS ahora) */
export function lastFix(): Fix | null {
  return state.fix
}

/** Activa el GPS mientras el componente esté montado */
export function usePosition(active = true): PosState {
  useEffect(() => {
    if (!active) return
    users++
    start()
    return () => {
      users--
      if (users === 0) stop()
    }
  }, [active])
  return useSyncExternalStore(subscribe, () => state)
}

/**
 * Promedia varias lecturas para guardar un punto con más precisión.
 * Termina cuando la precisión es buena o pasa el tiempo máximo.
 */
export function capturePoint(onProgress: (f: Fix, n: number) => void, maxMs = 12000, goodAcc = 6, signal?: AbortSignal): Promise<Fix> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new DOMException('Captura cancelada', 'AbortError'))
    if (!('geolocation' in navigator)) return reject(new Error('Este dispositivo no tiene GPS'))
    const fixes: Fix[] = []
    const t0 = Date.now()
    // La última lectura del GPS compartido, si es reciente, ya cuenta
    const prev = state.fix
    if (prev && t0 - prev.t < 5000) {
      fixes.push(prev)
      queueMicrotask(() => { if (!done) onProgress(prev, 1) })
    }
    let done = false
    let id: number | null = null
    const timers: { max?: ReturnType<typeof setTimeout>; early?: ReturnType<typeof setInterval> } = {}
    const cleanup = () => {
      if (id !== null) navigator.geolocation.clearWatch(id)
      clearTimeout(timers.max)
      clearInterval(timers.early)
      signal?.removeEventListener('abort', abort)
    }
    const abort = () => {
      if (done) return
      done = true
      cleanup()
      reject(new DOMException('Captura cancelada', 'AbortError'))
    }
    const finish = () => {
      if (done) return
      done = true
      cleanup()
      if (!fixes.length) return reject(new Error('No se ha podido obtener la posición'))
      // Media ponderada por 1/precisión² de las lecturas más precisas
      const best = [...fixes].sort((a, b) => a.acc - b.acc).slice(0, Math.max(3, Math.ceil(fixes.length / 2)))
      let wsum = 0, la = 0, lo = 0
      for (const f of best) {
        const w = 1 / Math.max(1, f.acc) ** 2
        wsum += w
        la += f.p[0] * w
        lo += f.p[1] * w
      }
      resolve({ ...best[0], p: [la / wsum, lo / wsum], acc: best[0].acc })
    }
    signal?.addEventListener('abort', abort, { once: true })
    id = navigator.geolocation.watchPosition(
      (pos) => {
        if (done) return
        const c = pos.coords
        const f: Fix = { p: [c.latitude, c.longitude], acc: c.accuracy, heading: null, speed: c.speed, t: pos.timestamp }
        fixes.push(f)
        onProgress(f, fixes.length)
        const good = fixes.filter((x) => x.acc <= goodAcc).length
        if (good >= 4 || (Date.now() - t0 > 4000 && good >= 2)) finish()
      },
      (err) => {
        if (done) return
        // Si ya hay lecturas, un fallo posterior (p. ej. tiempo agotado) no estropea la captura
        if (fixes.length && err.code !== err.PERMISSION_DENIED) return finish()
        done = true
        cleanup()
        reject(new Error(err.code === err.PERMISSION_DENIED ? 'Permiso de ubicación denegado' : 'No se ha podido obtener la posición'))
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: maxMs },
    )
    // Con pocas lecturas pero buenas, no hace falta esperar al máximo
    // También libera el watch si una implementación llama inmediatamente al callback.
    if (done) { cleanup(); return }
    timers.max = setTimeout(finish, maxMs)
    timers.early = setInterval(() => {
      if (Date.now() - t0 > 5000 && fixes.length && fixes.every((f) => f.acc <= goodAcc * 2)) finish()
    }, 1000)
  })
}
