import { useEffect } from 'react'

type Sentinel = { release: () => Promise<void> }
type WakeNav = Navigator & { wakeLock?: { request: (t: 'screen') => Promise<Sentinel> } }

/** Mantiene la pantalla encendida mientras el componente está montado (si el navegador lo permite) */
export function useWakeLock(active = true) {
  useEffect(() => {
    if (!active) return
    const nav = navigator as WakeNav
    if (!nav.wakeLock) return
    let lock: Sentinel | null = null
    let alive = true
    const acquire = async () => {
      try {
        const l = await nav.wakeLock!.request('screen')
        if (alive) lock = l
        else void l.release()
      } catch {
        /* sin permiso o batería baja */
      }
    }
    void acquire()
    const onVis = () => {
      if (document.visibilityState === 'visible') void acquire()
    }
    document.addEventListener('visibilitychange', onVis)
    return () => {
      alive = false
      document.removeEventListener('visibilitychange', onVis)
      void lock?.release().catch(() => undefined)
    }
  }, [active])
}
