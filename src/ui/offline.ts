import { useSyncExternalStore } from 'react'
import { db, type Bancal, type Camino } from '../db/db'
import { COMARCAS } from '../domain/comarcas'
import { pathLength, type LatLon } from '../lib/geo'
import { densify, descargaActual, descargar, suscribirDescarga, tilesAround, tilesForPolygons, type Capa, type Descarga, type Tile } from '../map/tiles'

/** Mensaje tras una descarga: solo se da por buena si se han guardado todas las imágenes */
export function resultadoDescarga(r: Descarga, ok: string): string {
  if (r.estado === 'terminada' && !r.fallos) return ok
  if (r.estado === 'terminada') return `Mapa incompleto: ${r.hechas} de ${r.total} imágenes. Vuelve a descargarlo con buena cobertura.`
  if (r.estado === 'cancelada') return 'Descarga del mapa cancelada'
  return 'No se ha podido descargar el mapa. Comprueba la conexión y vuelve a intentarlo.'
}

/** Las zonas de la capa de calles llevan sufijo; las de satélite conservan el id de siempre */
export const zonaId = (id: string, capa: Capa) => (capa === 'satelite' ? id : `${id}-calles`)
const capaTexto = (capa: Capa) => (capa === 'satelite' ? '' : ' · calles')

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

export async function descargarComarca(id: string, nivel: Nivel, capa: Capa = 'satelite') {
  const c = COMARCAS.find((x) => x.id === id)!
  const tiles = tilesComarca(id, nivel)
  const zid = zonaId(`${id}-${nivel}`, capa)
  const r = await descargar(zid, `${c.nombre} · ${NIVELES[nivel].nombre}${capaTexto(capa)}`, tiles, capa)
  if (r.estado === 'terminada') await db.zonas.put({ id: zid, nombre: r.nombre, total: r.total, guardadas: r.hechas, fecha: Date.now() })
  return r
}

export async function descargarDetalle(bancales: Pick<Bancal, 'lat' | 'lon'>[], caminos: Pick<Camino, 'puntos'>[], capa: Capa = 'satelite') {
  const tiles = tilesDetalle(bancales, caminos)
  const zid = zonaId('detalle', capa)
  const nombre = `Detalle de bancales y caminos${capaTexto(capa)}`
  const r = await descargar(zid, nombre, tiles, capa)
  if (r.estado === 'terminada') await db.zonas.put({ id: zid, nombre, total: r.total, guardadas: r.hechas, fecha: Date.now() })
  return r
}

/** Tras guardar un bancal nuevo: baja el detalle de su alrededor si hay conexión y nada más descargándose */
export function autoDetalle(b: Pick<Bancal, 'lat' | 'lon'>, capa: Capa = 'satelite') {
  if (!navigator.onLine || descargaActual()?.estado === 'descargando') return
  void descargar(`bancal-${Date.now()}`, 'Mapa detallado del bancal', tilesAround([[b.lat, b.lon]], 250, 14, 19), capa).catch(() => undefined)
}

/** Satélite detallado a lo largo de una ruta (franja de ~120 m, zoom 14-18), para seguirla sin cobertura */
export async function descargarRuta(points: LatLon[], nombre: string, capa: Capa = 'satelite') {
  // Rutas largas (en coche) con menos detalle para no bajar miles de teselas
  const largo = pathLength(points)
  const tiles = tilesAround(densify([points], 50), 120, 14, largo > 30000 ? 16 : largo > 12000 ? 17 : 18)
  const id = `ruta-${Date.now()}`
  const r = await descargar(id, nombre, tiles, capa)
  if (r.estado === 'terminada') await db.zonas.put({ id, nombre, total: r.total, guardadas: r.hechas, fecha: Date.now() })
  return r
}
