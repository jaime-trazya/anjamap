/**
 * Brújula del móvil. En iPhone hay que pedir permiso con un toque; en Android se usa
 * "deviceorientationabsolute". Si no hay brújula, se usa el rumbo del GPS al andar.
 */
import { useCallback, useEffect, useRef, useState } from 'react'

type OrientationEventWithCompass = DeviceOrientationEvent & { webkitCompassHeading?: number }
type PermissionFn = () => Promise<'granted' | 'denied'>

export interface HeadingState {
  heading: number | null
  source: 'brujula' | 'gps' | null
  needsPermission: boolean
  request: () => Promise<void>
}

const permFn = (): PermissionFn | null => {
  const D = (globalThis as { DeviceOrientationEvent?: { requestPermission?: PermissionFn } }).DeviceOrientationEvent
  return typeof D?.requestPermission === 'function' ? D.requestPermission.bind(D) : null
}

let granted = false

function screenAngle(): number {
  const a = screen.orientation?.angle ?? (window as { orientation?: number }).orientation ?? 0
  return typeof a === 'number' ? a : 0
}

export function useHeading(gpsHeading: number | null, gpsSpeed: number | null): HeadingState {
  const [compass, setCompass] = useState<number | null>(null)
  const [needsPermission, setNeeds] = useState(() => !!permFn() && !granted)
  const smooth = useRef<{ s: number; c: number } | null>(null)
  const lastEvent = useRef(0)

  const listen = useCallback(() => {
    const onEvent = (e: Event) => {
      const ev = e as OrientationEventWithCompass
      let h: number | null = null
      if (typeof ev.webkitCompassHeading === 'number' && !isNaN(ev.webkitCompassHeading)) h = ev.webkitCompassHeading
      else if ((e.type === 'deviceorientationabsolute' || ev.absolute) && ev.alpha !== null) h = 360 - ev.alpha
      if (h === null) return
      h = (h + screenAngle() + 360) % 360
      // Suavizado circular para que la flecha no tiemble
      const r = (h * Math.PI) / 180
      const k = 0.25
      const prev = smooth.current
      const next = prev ? { s: prev.s * (1 - k) + Math.sin(r) * k, c: prev.c * (1 - k) + Math.cos(r) * k } : { s: Math.sin(r), c: Math.cos(r) }
      smooth.current = next
      const now = performance.now()
      if (now - lastEvent.current < 50) return
      lastEvent.current = now
      setCompass(((Math.atan2(next.s, next.c) * 180) / Math.PI + 360) % 360)
    }
    const type = 'ondeviceorientationabsolute' in window ? 'deviceorientationabsolute' : 'deviceorientation'
    window.addEventListener(type, onEvent)
    return () => window.removeEventListener(type, onEvent)
  }, [])

  useEffect(() => {
    if (needsPermission) return
    return listen()
  }, [needsPermission, listen])

  const request = useCallback(async () => {
    const fn = permFn()
    if (!fn) return
    try {
      const r = await fn()
      if (r === 'granted') {
        granted = true
        setNeeds(false)
      }
    } catch {
      /* el usuario lo ha rechazado */
    }
  }, [])

  const moving = gpsHeading !== null && (gpsSpeed ?? 0) > 0.8
  if (compass !== null) return { heading: compass, source: 'brujula', needsPermission, request }
  if (moving) return { heading: gpsHeading, source: 'gps', needsPermission, request }
  return { heading: null, source: null, needsPermission, request }
}
