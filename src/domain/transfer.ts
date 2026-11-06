import { COLORES } from './constants'
import { parseGpx, toGpx, type GpxData } from './gpx'
import { validateBackup, type Backup } from '../db/db'
import { isLatLon, simplify, type LatLon } from '../lib/geo'

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
  if (/\.(csv|tsv|txt)$/i.test(filename)) return csvABackup(content).backup
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

const quitarAcentos = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
const COLUMNAS: Record<'nombre' | 'lat' | 'lon' | 'coords' | 'finca' | 'nota', string[]> = {
  nombre: ['nombre', 'name', 'sitio', 'bancal', 'lugar', 'titulo', 'title'],
  lat: ['lat', 'latitud', 'latitude', 'y'],
  lon: ['lon', 'lng', 'long', 'longitud', 'longitude', 'x'],
  coords: ['coordenadas', 'coords', 'coordinates', 'ubicacion', 'posicion'],
  finca: ['finca', 'grupo', 'zona', 'partida', 'paraje'],
  nota: ['nota', 'notas', 'descripcion', 'desc', 'comentario', 'observaciones'],
}

/** Filas de un CSV con comillas, separado por coma, punto y coma o tabulador */
function filasCsv(texto: string): string[][] {
  const limpio = texto.replace(/^\uFEFF/, '')
  const primera = limpio.split(/\r?\n/, 1)[0] ?? ''
  const sep = [';', '\t', ','].map((c) => ({ c, n: primera.split(c).length })).sort((a, b) => b.n - a.n)[0].c
  const filas: string[][] = []
  let fila: string[] = [], campo = '', comillas = false
  for (let i = 0; i < limpio.length; i++) {
    const ch = limpio[i]
    if (comillas) {
      if (ch === '"' && limpio[i + 1] === '"') { campo += '"'; i++ }
      else if (ch === '"') comillas = false
      else campo += ch
    } else if (ch === '"') comillas = true
    else if (ch === sep) { fila.push(campo); campo = '' }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && limpio[i + 1] === '\n') i++
      fila.push(campo); campo = ''
      if (fila.some((x) => x.trim())) filas.push(fila)
      fila = []
    } else campo += ch
  }
  fila.push(campo)
  if (fila.some((x) => x.trim())) filas.push(fila)
  return filas
}

const numero = (s: string | undefined) => {
  const t = (s ?? '').trim().replace(/\s/g, '')
  if (!t) return NaN
  // «39,1234» (coma decimal) o «39.1234»
  return Number(/^-?\d+,\d+$/.test(t) ? t.replace(',', '.') : t)
}

/**
 * Sitios desde una hoja de cálculo exportada a CSV. Necesita una columna de nombre y latitud/longitud
 * (o una sola columna de coordenadas). Admite «finca/grupo/zona» y «nota». Devuelve también las filas descartadas.
 */
export function csvABackup(texto: string, now = Date.now()): { backup: Backup; descartadas: number } {
  const filas = filasCsv(texto)
  if (filas.length < 2) throw new Error('El CSV está vacío o solo tiene la cabecera')
  const cab = filas[0].map(quitarAcentos)
  const col = (k: keyof typeof COLUMNAS) => cab.findIndex((h) => COLUMNAS[k].includes(h))
  const iNombre = col('nombre'), iLat = col('lat'), iLon = col('lon'), iCoords = col('coords'), iFinca = col('finca'), iNota = col('nota')
  if ((iLat < 0 || iLon < 0) && iCoords < 0) throw new Error('El CSV necesita columnas «latitud» y «longitud» (o «coordenadas»)')
  let descartadas = 0
  const ids = new Set<string>()
  const bancales = filas.slice(1).flatMap((f, i) => {
    let p: LatLon = [numero(f[iLat]), numero(f[iLon])]
    if ((!Number.isFinite(p[0]) || !Number.isFinite(p[1])) && iCoords >= 0) {
      const m = (f[iCoords] ?? '').match(/(-?\d+(?:[.,]\d+)?)\s*[,;\s]\s*(-?\d+(?:[.,]\d+)?)/)
      if (m) p = [numero(m[1]), numero(m[2])]
    }
    if (!isLatLon(p) || (p[0] === 0 && p[1] === 0)) { descartadas++; return [] }
    const nombre = (iNombre >= 0 ? f[iNombre]?.trim() : '') || `Sitio ${i + 1}`
    const id = `csv-b-${hash(`${nombre}|${pt(p)}`)}`
    if (ids.has(id)) { descartadas++; return [] }
    ids.add(id)
    const finca = iFinca >= 0 ? f[iFinca]?.trim() || undefined : undefined
    const nota = iNota >= 0 ? f[iNota]?.trim() || undefined : undefined
    return [{ id, nombre: nombre.slice(0, 80), finca, nota, lat: p[0], lon: p[1], precision: null, color: COLORES[0].color, creado: now, actualizado: now }]
  })
  if (!bancales.length) throw new Error('Ninguna fila del CSV tiene coordenadas válidas')
  return { backup: validateBackup({ app: 'anjamap', version: 3, fecha: new Date(now).toISOString(), bancales, caminos: [], rutas: [], fotos: [] }), descartadas }
}
