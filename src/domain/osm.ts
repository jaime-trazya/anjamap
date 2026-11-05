/**
 * Red de pistas, sendas y calles de OpenStreetMap ya preparada (public/caminos-osm.json,
 * generada con scripts/generar-caminos-osm.mjs). © colaboradores de OpenStreetMap, ODbL.
 */
import type { LatLon } from '../lib/geo'

/** 0 = pista o senda, 1 = calle o camino asfaltado, 2 = carretera */
export type TipoOsm = 0 | 1 | 2

export interface OsmEdge {
  a: number
  b: number
  tipo: TipoOsm
  /** Puntos intermedios (sin los extremos) */
  mid: LatLon[]
}

export interface OsmNet {
  nodes: LatLon[]
  edges: OsmEdge[]
  fecha: string
}

interface Raw {
  v: number
  fecha?: string
  n: number[]
  e: number[]
}

const S = 1e5

export function decodeOsm(raw: Raw): OsmNet {
  if (raw?.v !== 1 || !Array.isArray(raw.n) || !Array.isArray(raw.e)) throw new Error('Red de caminos no válida')
  const nodes: LatLon[] = []
  let la = 0, lo = 0
  for (let i = 0; i < raw.n.length; i += 2) {
    la += raw.n[i]
    lo += raw.n[i + 1]
    nodes.push([la / S, lo / S])
  }
  const edges: OsmEdge[] = []
  const e = raw.e
  let pa = 0, pb = 0
  for (let i = 0; i < e.length; ) {
    const a = (pa += e[i])
    const b = (pb += e[i + 1])
    const tipo = e[i + 2] as TipoOsm
    const k = e[i + 3]
    i += 4
    let qa = Math.round(nodes[a][0] * S)
    let qo = Math.round(nodes[a][1] * S)
    const mid: LatLon[] = []
    for (let j = 0; j < k; j++, i += 2) {
      qa += e[i]
      qo += e[i + 1]
      mid.push([qa / S, qo / S])
    }
    edges.push({ a, b, tipo, mid })
  }
  return { nodes, edges, fecha: raw.fecha ?? '' }
}

/** Líneas de la red agrupadas por tipo (para dibujarlas en el mapa) */
export function osmLines(net: OsmNet): Record<TipoOsm, LatLon[][]> {
  const out: Record<TipoOsm, LatLon[][]> = { 0: [], 1: [], 2: [] }
  for (const e of net.edges) out[e.tipo].push([net.nodes[e.a], ...e.mid, net.nodes[e.b]])
  return out
}
