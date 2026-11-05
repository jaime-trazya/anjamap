import { useSyncExternalStore } from 'react'
import { db, type Bancal, type Camino } from '../db/db'
import { COMARCAS } from '../domain/comarcas'
import type { LatLon } from '../lib/geo'
import { densify, descargaActual, descargar, suscribirDescarga, tilesAround, tilesForPolygons, type Tile } from '../map/tiles'

export function useDescarga() {
  return useSyncExternalStore(suscribirDescarga, descargaActual)
}

/** Niveles de descarga de las comarcas */
export const NIVELES = {
  basico: { nombre: 'Básico', zmax: 15, detalle: 'Se ven parcelas y caminos grandes' },
  detallado: { nombre: 'Detallado', zmax: 16, detalle: 'Se distinguen los bancales' },
} as const
export type Nivel = keyof typeof NIVELES

const cacheTiles = new Map<string, Tile[]>()
export function tilesComarca(id: string, nivel: Nivel): Tile[] {
  const k = `${id}-${nivel}`
  if (!cacheTiles.has(k)) {
    const c = COMARCAS.find((x) => x.id === id)!
    cacheTiles.set(k, tilesForPolygons(c.anillos, 10, NIVELES[nivel].zmax))
  }
  return cacheTiles.get(k)!
}

/** Máximo detalle alrededor de bancales (zoom 14-19) y a lo largo de caminos (15-18) */
export function tilesDetalle(bancales: Pick<Bancal, 'lat' | 'lon'>[], caminos: Pick<Camino, 'puntos'>[]): Tile[] {
  const pts: LatLon[] = bancales.map((b) => [b.lat, b.lon])
  const near = tilesAround(pts, 250, 14, 19)
  const along = tilesAround(densify(caminos.map((c) => c.puntos), 60), 70, 15, 18)
  const seen = new Set(near.map((t) => `${t.z}/${t.x}/${t.y}`))
  return [...near, ...along.filter((t) => !seen.has(`${t.z}/${t.x}/${t.y}`))]
}

export async function descargarComarca(id: string, nivel: Nivel) {
  const c = COMARCAS.find((x) => x.id === id)!
  const tiles = tilesComarca(id, nivel)
  const r = await descargar(`${id}-${nivel}`, `${c.nombre} · ${NIVELES[nivel].nombre}`, tiles)
  if (r.estado === 'terminada') await db.zonas.put({ id: `${id}-${nivel}`, nombre: r.nombre, total: r.total, guardadas: r.hechas, fecha: Date.now() })
  return r
}

export async function descargarDetalle(bancales: Pick<Bancal, 'lat' | 'lon'>[], caminos: Pick<Camino, 'puntos'>[], nombre = 'Detalle de bancales y caminos') {
  const tiles = tilesDetalle(bancales, caminos)
  const r = await descargar('detalle', nombre, tiles)
  if (r.estado === 'terminada') await db.zonas.put({ id: 'detalle', nombre: 'Detalle de bancales y caminos', total: r.total, guardadas: r.hechas, fecha: Date.now() })
  return r
}

/** Tras guardar un bancal nuevo: baja el detalle de su alrededor si hay conexión y nada más descargándose */
export function autoDetalle(b: Pick<Bancal, 'lat' | 'lon'>) {
  if (!navigator.onLine || descargaActual()?.estado === 'descargando') return
  void descargar(`bancal-${Date.now()}`, 'Mapa detallado del bancal', tilesAround([[b.lat, b.lon]], 250, 14, 19)).catch(() => undefined)
}
