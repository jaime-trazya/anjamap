/**
 * Carga, una sola vez, la red de caminos de OpenStreetMap (public/caminos-osm.json).
 * El service worker la guarda con la app, así que también está sin conexión.
 */
import { useEffect, useSyncExternalStore } from 'react'
import { decodeOsm, type OsmNet } from '../domain/osm'

export interface OsmState {
  net: OsmNet | null
  estado: 'apagado' | 'cargando' | 'listo' | 'error'
}

let state: OsmState = { net: null, estado: 'apagado' }
const OFF: OsmState = { net: null, estado: 'apagado' }
const listeners = new Set<() => void>()
const set = (s: OsmState) => {
  state = s
  listeners.forEach((f) => f())
}

function load() {
  if (state.estado === 'cargando' || state.estado === 'listo') return
  set({ net: null, estado: 'cargando' })
  fetch(`${import.meta.env.BASE_URL}caminos-osm.json`)
    .then((r) => {
      if (!r.ok) throw new Error(String(r.status))
      return r.json()
    })
    .then((j) => set({ net: decodeOsm(j), estado: 'listo' }))
    .catch(() => set({ net: null, estado: 'error' }))
}

const subscribe = (f: () => void) => {
  listeners.add(f)
  return () => listeners.delete(f)
}

export function useOsm(enabled: boolean): OsmState {
  useEffect(() => {
    if (enabled) load()
  }, [enabled])
  const s = useSyncExternalStore(subscribe, () => state)
  return enabled ? s : OFF
}
