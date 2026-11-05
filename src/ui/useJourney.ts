import { useCallback, useEffect, useRef, useState } from 'react'
import type { Transporte } from '../db/db'
import { closestOnPath, type LatLon } from '../lib/geo'
import { fetchJourney, type Journey, type RouteOptions } from '../domain/routing'
import type { Fix } from './position'

interface State { key: string; journey: Journey | null; loading: boolean; error: string | null }

/** Conserva el recorrido al perder cobertura y consulta de nuevo solo si hay un desvío real. */
export function useJourney(fix: Fix | null, dest: LatLon | null, transport: Transporte, options: RouteOptions, enabled: boolean) {
  const latestFix = useRef(fix)
  useEffect(() => { latestFix.current = fix }, [fix])
  const [attempt, setAttempt] = useState(0)
  const [state, setState] = useState<State>({ key: '', journey: null, loading: false, error: null })
  const key = `${dest?.join(',')}/${transport}/${options.servidorRutas}/${options.evitarPeajes}/${options.evitarAutopistas}/${options.velocidadPatinete}/${attempt}`
  const lat = dest?.[0], lon = dest?.[1]
  const { servidorRutas, evitarPeajes, evitarAutopistas, velocidadPatinete } = options
  useEffect(() => {
    if (!enabled || lat === undefined || lon === undefined) return
    let alive = true, pending = false, lastTry = 0
    let journey: Journey | null = null
    const controller = new AbortController()
    const calculate = async (force = false) => {
      const f = latestFix.current
      if (!alive || pending || !f || Date.now() - f.t > 30000) return
      if (f.acc > 100) {
        setState({ key, journey, loading: false, error: `GPS poco preciso (±${Math.round(f.acc)} m). Espera a que mejore para calcular la ruta.` })
        return
      }
      if (!navigator.onLine) {
        setState({ key, journey, loading: false, error: journey ? 'Sin conexión: sigue la ruta calculada. Los desvíos se recalcularán al recuperar cobertura.' : 'Necesitas conexión para calcular esta ruta. Puedes usar una ruta propia guardada o la orientación a pie.' })
        return
      }
      const hit = journey ? closestOnPath(f.p, journey.points) : null
      if (!force && journey && hit && hit.dist <= Math.max(60, f.acc * 2)) return
      // Una petición por cálculo y como mínimo 20 s entre recálculos. Los fallos requieren reintentar.
      if (!force && (lastTry && (!journey || Date.now() - lastTry < 20000))) return
      pending = true; lastTry = Date.now()
      setState({ key, journey, loading: true, error: null })
      try {
        const next = await fetchJourney(f.p, [lat, lon], transport, { servidorRutas, evitarPeajes, evitarAutopistas, velocidadPatinete }, controller.signal)
        if (alive) { journey = next; setState({ key, journey, loading: false, error: null }) }
      } catch (error) {
        if (alive) setState({ key, journey, loading: false, error: error instanceof Error ? error.message : 'No se ha podido calcular la ruta' })
      } finally { pending = false }
    }
    const initial = window.setTimeout(() => void calculate(), 0)
    const timer = window.setInterval(() => void calculate(), 3000)
    const online = () => void calculate(true)
    window.addEventListener('online', online)
    return () => { alive = false; controller.abort(); window.clearTimeout(initial); window.clearInterval(timer); window.removeEventListener('online', online) }
  }, [key, lat, lon, transport, servidorRutas, evitarPeajes, evitarAutopistas, velocidadPatinete, enabled])
  const retry = useCallback(() => setAttempt((value) => value + 1), [])
  const visible = state.key === key && enabled ? state : { journey: null, loading: false, error: null }
  return { ...visible, retry }
}
