import { COLORES } from './constants'
import { parseGpx, toGpx, type GpxData } from './gpx'
import { validateBackup, type Backup } from '../db/db'
import { simplify, type LatLon } from '../lib/geo'

export const MAX_TRANSFER_BYTES = 100 * 1024 * 1024

/** Hash corto y estable (FNV-1a): el mismo contenido da siempre el mismo id */
function hash(s: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(36)
}
const pt = (p: LatLon) => `${p[0].toFixed(6)},${p[1].toFixed(6)}`

/**
 * Convierte un GPX en una copia de Anjamap. Los ids salen del contenido (nombre y coordenadas),
 * así importar el mismo archivo dos veces actualiza lo que ya había en vez de duplicarlo.
 */
export function gpxABackup(data: GpxData, now = Date.now()): Backup {
  return validateBackup({
    app: 'anjamap',
    version: 3,
    fecha: new Date(now).toISOString(),
    bancales: data.waypoints.map((w, i) => {
      const nombre = w.name?.trim() || `Punto ${i + 1}`
      return { id: `gpx-b-${hash(`${nombre}|${pt(w.point)}`)}`, nombre, nota: w.desc, lat: w.point[0], lon: w.point[1], precision: null, color: COLORES[0].color, creado: now, actualizado: now }
    }),
    caminos: data.tracks.map((t, i) => {
      const nombre = t.name?.trim() || `Camino ${i + 1}`
      return { id: `gpx-c-${hash(`${nombre}|${t.points.length}|${pt(t.points[0])}|${pt(t.points[t.points.length - 1])}`)}`, nombre, puntos: simplify(t.points, 1.5), tipo: 'senda', origen: 'gpx', creado: now }
    }),
    rutas: [],
    fotos: [],
  })
}

export function readTransfer(content: string, filename: string): Backup {
  if (/\.gpx$/i.test(filename) || content.trimStart().startsWith('<')) {
    const data = parseGpx(content)
    if (!data.waypoints.length && !data.tracks.length) throw new Error('El GPX no tiene bancales ni caminos')
    return gpxABackup(data)
  }
  try { return validateBackup(JSON.parse(content)) } catch (error) {
    if (error instanceof SyntaxError) throw new Error('El archivo no contiene un JSON válido', { cause: error })
    throw error
  }
}

export function transferGpx(backup: Backup): string {
  return toGpx({ waypoints: backup.bancales.map((b) => ({ name: b.nombre, point: [b.lat, b.lon], desc: [b.finca, b.nota].filter(Boolean).join(' · ') || undefined })), tracks: [...backup.caminos, ...backup.rutas].map((r) => ({ name: r.nombre, points: r.puntos })) })
}
