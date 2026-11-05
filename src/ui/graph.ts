/**
 * Red de caminos para calcular rutas. Montarla con OpenStreetMap cuesta casi un segundo en un móvil,
 * así que solo se monta cuando una pantalla la pide, después de pintar, y se reutiliza mientras no cambien los caminos.
 */
import { useEffect, useState } from 'react'
import { buildGraph, type Graph } from '../domain/graph'
import type { Camino } from '../db/db'
import type { OsmNet } from '../domain/osm'
import { useData } from './useData'

let cache: { caminos: Camino[]; net: OsmNet | null; g: Graph | null } | null = null

/** La red, o la anterior mientras se monta la nueva (null si aún no hay ninguna) */
export function useGraph(): { graph: Graph | null; montando: boolean } {
  const { caminos, osm } = useData()
  const fresh = !!cache && cache.caminos === caminos && cache.net === osm.net
  const [, setTick] = useState(0)
  useEffect(() => {
    if (cache && cache.caminos === caminos && cache.net === osm.net) return
    const t = window.setTimeout(() => {
      cache = { caminos, net: osm.net, g: buildGraph(caminos.map((c) => c.puntos), osm.net) }
      setTick((x) => x + 1)
    }, 60)
    return () => window.clearTimeout(t)
  }, [caminos, osm.net])
  return { graph: cache?.g ?? null, montando: !fresh || osm.estado === 'cargando' }
}
