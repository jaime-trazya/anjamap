import { useCallback, useEffect, useRef, useState } from 'react'
import type { Transporte } from '../db/db'
import { closestOnPath, type LatLon } from '../lib/geo'
import { fetchJourney, type Journey, type RouteOptions } from '../domain/routing'
import type { Fix } from './position'

interface State { key: string; journey: Journey | null; loading: boolean; error: string | null }

/** Conserva el recorrido al perder cobertura y consulta de nuevo solo si hay un desvío real. */
/** `offRef` lo actualiza la pantalla: desvío confirmado por el seguimiento (varias lecturas seguidas fuera de la ruta). */
export function useJourney(fix: Fix | null, dest: LatLon | null, transport: Transporte, options: RouteOptions, enabled: boolean, offRef?: { readonly current: boolean }) {
  const latestFix = useRef(fix)
  useEffect(() => { latestFix.current = fix }, [fix])
  const [attempt, setAttempt] = useState(0)
  const [state, setState] = useState<State>({ key: '', journey: null, loading: false, error: null })
  const base = `${dest?.join(',')}/${transport}/${options.servidorRutas}/${options.evitarPeajes}/${options.evitarAutopistas}/${options.velocidadPatinete}`
  const key = `${base}/${attempt}`
  // Última ruta buena para este destino y transporte: al pulsar «Recalcular» no se pierde si la nueva consulta falla
  const [lastGood, setLastGood] = useState<{ base: string; journey: Journey | null }>({ base: '', journey: null })
  const kept = useRef<{ base: string; journey: Journey | null }>({ base: '', journey: null })
  const lat = dest?.[0], lon = dest?.[1]
  const { servidorRutas, evitarPeajes, evitarAutopistas, velocidadPatinete } = options
  useEffect(() => {
    if (!enabled || lat === undefined || lon === undefined) return
    let alive = true, pending = false, lastTry = 0
    let journey: Journey | null = kept.current.base === base ? kept.current.journey : null
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
      const off = !!offRef?.current
      if (!force && journey && !off && hit && hit.dist <= Math.max(60, f.acc * 2)) return
      // Una petición por cálculo: 4 s entre recálculos si el desvío está confirmado, 20 s si no. Los fallos requieren reintentar.
      if (!force && (lastTry && (!journey || Date.now() - lastTry < (off ? 4000 : 20000)))) return
      pending = true; lastTry = Date.now()
      setState({ key, journey, loading: true, error: null })
      // En marcha se manda el rumbo: la ruta nueva sale hacia delante en vez de mandarte dar la vuelta
      const moving = f.speed !== null && f.speed > (transport === 'pie' ? 1.2 : 2.5)
      const heading = moving ? f.heading : null
      const options = { servidorRutas, evitarPeajes, evitarAutopistas, velocidadPatinete }
      try {
        let next: Journey
        try {
          next = await fetchJourney(f.p, [lat, lon], transport, options, controller.signal, heading)
        } catch (error) {
          // Si con el rumbo no encuentra ruta (calle cortada por delante), se intenta sin él
          if (heading === null || controller.signal.aborted) throw error
          next = await fetchJourney(f.p, [lat, lon], transport, options, controller.signal)
        }
        if (alive) { journey = next; kept.current = { base, journey }; setLastGood({ base, journey }); setState({ key, journey, loading: false, error: null }) }
      } catch (error) {
        if (alive) setState({ key, journey, loading: false, error: error instanceof Error ? error.message : 'No se ha podido calcular la ruta' })
      } finally { pending = false }
    }
    // Tras «Recalcular» (attempt > 0) se consulta aunque sigas sobre la ruta
    const initial = window.setTimeout(() => void calculate(attempt > 0), 0)
    const timer = window.setInterval(() => void calculate(), 1500)
    const online = () => void calculate(true)
    window.addEventListener('online', online)
    return () => { alive = false; controller.abort(); window.clearTimeout(initial); window.clearInterval(timer); window.removeEventListener('online', online) }
  }, [key, base, attempt, lat, lon, transport, servidorRutas, evitarPeajes, evitarAutopistas, velocidadPatinete, enabled, offRef])
  const retry = useCallback(() => setAttempt((value) => value + 1), [])
  const visible = state.key === key && enabled ? state : { journey: enabled && lastGood.base === base ? lastGood.journey : null, loading: false, error: null }
  return { ...visible, retry }
}
