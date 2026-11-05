import { COLORES } from './constants'
import { parseGpx, toGpx } from './gpx'
import { uid, validateBackup, type Backup } from '../db/db'
import { simplify } from '../lib/geo'

export const MAX_TRANSFER_BYTES = 100 * 1024 * 1024

export function readTransfer(content: string, filename: string): Backup {
  if (/\.gpx$/i.test(filename) || content.trimStart().startsWith('<')) {
    const data = parseGpx(content)
    if (!data.waypoints.length && !data.tracks.length) throw new Error('El GPX no tiene bancales ni caminos')
    const now = Date.now()
    return validateBackup({ app: 'anjamap', version: 3, fecha: new Date(now).toISOString(),
      bancales: data.waypoints.map((w) => ({ id: uid(), nombre: w.name, nota: w.desc, lat: w.point[0], lon: w.point[1], precision: null, color: COLORES[0].color, creado: now, actualizado: now })),
      caminos: data.tracks.map((t) => ({ id: uid(), nombre: t.name, puntos: simplify(t.points, 1.5), tipo: 'senda', origen: 'gpx', creado: now })), rutas: [], fotos: [],
    })
  }
  try { return validateBackup(JSON.parse(content)) } catch (error) {
    if (error instanceof SyntaxError) throw new Error('El archivo no contiene un JSON válido', { cause: error })
    throw error
  }
}

export function transferGpx(backup: Backup): string {
  return toGpx({ waypoints: backup.bancales.map((b) => ({ name: b.nombre, point: [b.lat, b.lon], desc: [b.finca, b.nota].filter(Boolean).join(' · ') || undefined })), tracks: [...backup.caminos, ...backup.rutas].map((r) => ({ name: r.nombre, points: r.puntos })) })
}
