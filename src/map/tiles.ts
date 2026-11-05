/**
 * Teselas del IGN (PNOA y mapa base) y su almacenamiento sin conexión.
 *
 * Las teselas se guardan con la Cache API (caché "anjamap-teselas"). La capa del mapa mira primero ahí,
 * así funciona sin cobertura y sin depender del service worker. Todo lo que ves con conexión también se guarda.
 */
import { isLatLon, pointInRing, type LatLon } from '../lib/geo'

export type Capa = 'satelite' | 'mapa'

export const CACHE = 'anjamap-teselas'

export const CAPAS: Record<Capa, { nombre: string; url: (z: number, x: number, y: number) => string; maxNative: number; atribucion: string }> = {
  satelite: {
    nombre: 'Satélite',
    url: (z, x, y) =>
      `https://www.ign.es/wmts/pnoa-ma?request=GetTile&service=WMTS&VERSION=1.0.0&Layer=OI.OrthoimageCoverage&Style=default&Format=image/jpeg&TileMatrixSet=GoogleMapsCompatible&TileMatrix=${z}&TileRow=${y}&TileCol=${x}`,
    maxNative: 20,
    atribucion: 'PNOA cedido por © Instituto Geográfico Nacional',
  },
  mapa: {
    nombre: 'Mapa',
    url: (z, x, y) =>
      `https://www.ign.es/wmts/ign-base?request=GetTile&service=WMTS&VERSION=1.0.0&Layer=IGNBaseTodo&Style=default&Format=image/png&TileMatrixSet=GoogleMapsCompatible&TileMatrix=${z}&TileRow=${y}&TileCol=${x}`,
    maxNative: 19,
    atribucion: '© Instituto Geográfico Nacional',
  },
}

export interface Tile {
  z: number
  x: number
  y: number
}

export const lon2x = (lon: number, z: number) => ((lon + 180) / 360) * 2 ** z
const MERCATOR_LAT = 85.0511287798066
export const lat2y = (lat: number, z: number) => {
  lat = Math.max(-MERCATOR_LAT, Math.min(MERCATOR_LAT, lat))
  const r = (lat * Math.PI) / 180
  return ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z
}
export const x2lon = (x: number, z: number) => (x / 2 ** z) * 360 - 180
export const y2lat = (y: number, z: number) => {
  const n = Math.PI - (2 * Math.PI * y) / 2 ** z
  return (180 / Math.PI) * Math.atan(Math.sinh(n))
}

/** Teselas que tocan alguno de los polígonos (anillos [lat, lon]) */
export function tilesForPolygons(rings: LatLon[][], zmin: number, zmax: number): Tile[] {
  const out: Tile[] = []
  let s = Infinity, w = Infinity, n = -Infinity, e = -Infinity
  for (const r of rings)
    for (const [la, lo] of r) {
      s = Math.min(s, la); n = Math.max(n, la); w = Math.min(w, lo); e = Math.max(e, lo)
    }
  const inside = (p: LatLon) => rings.some((r) => pointInRing(p, r))
  for (let z = zmin; z <= zmax; z++) {
    const x0 = Math.floor(lon2x(w, z)), x1 = Math.floor(lon2x(e, z))
    const y0 = Math.floor(lat2y(n, z)), y1 = Math.floor(lat2y(s, z))
    for (let x = x0; x <= x1; x++)
      for (let y = y0; y <= y1; y++) {
        let hit = false
        for (const fx of [0, 0.5, 1]) for (const fy of [0, 0.5, 1]) if (!hit && inside([y2lat(y + fy, z), x2lon(x + fx, z)])) hit = true
        if (hit) out.push({ z, x, y })
      }
  }
  return out
}

/** Teselas alrededor de unos puntos (radio en metros) */
export function tilesAround(points: LatLon[], radius: number, zmin: number, zmax: number): Tile[] {
  const seen = new Set<string>()
  const out: Tile[] = []
  for (const point of points) {
    if (!isLatLon(point) || Math.abs(point[0]) > MERCATOR_LAT) continue
    const [lat, lon] = point
    const dLat = radius / 111320
    const dLon = radius / (111320 * Math.cos((lat * Math.PI) / 180))
    for (let z = zmin; z <= zmax; z++) {
      const max = 2 ** z - 1
      const x0 = Math.max(0, Math.floor(lon2x(lon - dLon, z))), x1 = Math.min(max, Math.floor(lon2x(lon + dLon, z)))
      const y0 = Math.max(0, Math.floor(lat2y(lat + dLat, z))), y1 = Math.min(max, Math.floor(lat2y(lat - dLat, z)))
      for (let x = x0; x <= x1; x++)
        for (let y = y0; y <= y1; y++) {
          const k = `${z}/${x}/${y}`
          if (!seen.has(k)) {
            seen.add(k)
            out.push({ z, x, y })
          }
        }
    }
  }
  return out
}

/** Puntos cada ~`step` metros a lo largo de unas líneas (para descargar alrededor de los caminos) */
export function densify(lines: LatLon[][], step: number): LatLon[] {
  const out: LatLon[] = []
  for (const l of lines) {
    for (let i = 0; i < l.length; i++) {
      out.push(l[i])
      if (i === l.length - 1) break
      const [a, b] = [l[i], l[i + 1]]
      const d = Math.hypot((b[0] - a[0]) * 111320, (b[1] - a[1]) * 111320 * Math.cos((a[0] * Math.PI) / 180))
      const n = Math.floor(d / step)
      for (let k = 1; k < n; k++) out.push([a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n])
    }
  }
  return out
}

/** Tamaño medio aproximado de una tesela del PNOA (para estimar) */
export const AVG_TILE_BYTES = 21_000

export function hasCacheApi(): boolean {
  return typeof caches !== 'undefined'
}

/** Pide una tesela: primero a la caché; si no está, a internet (y la guarda) */
export async function getTile(url: string, save = true): Promise<Blob | null> {
  let cache: Cache | null = null
  if (hasCacheApi()) {
    try {
      cache = await caches.open(CACHE)
      const hit = await cache.match(url)
      if (hit) return await hit.blob()
    } catch {
      // La caché puede estar bloqueada (modo privado, espacio...). El mapa en línea sigue disponible.
      cache = null
    }
  }
  if (!navigator.onLine) return null
  try {
    const res = await fetch(url, { mode: 'cors' })
    if (!res.ok || !(res.headers.get('content-type') ?? '').startsWith('image/')) return null
    if (save && cache) await cache.put(url, res.clone()).catch(() => undefined)
    return await res.blob()
  } catch {
    return null
  }
}

// ---------- Descargas en segundo plano (mientras la app está abierta) ----------

export interface Descarga {
  id: string
  nombre: string
  total: number
  hechas: number
  fallos: number
  estado: 'descargando' | 'terminada' | 'cancelada' | 'error'
}

type Listener = () => void
const listeners = new Set<Listener>()
let actual: Descarga | null = null
let cancelar = false

export function descargaActual(): Descarga | null {
  return actual
}
export function suscribirDescarga(fn: Listener): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}
function emitir() {
  actual = actual ? { ...actual } : null
  listeners.forEach((f) => f())
}

export function cancelarDescarga() {
  cancelar = true
}

/**
 * Descarga teselas a la caché. Pocas peticiones a la vez para no saturar al IGN.
 * Devuelve la descarga terminada.
 */
export async function descargar(id: string, nombre: string, tiles: Tile[], capa: Capa = 'satelite', concurrencia = 4): Promise<Descarga> {
  if (actual?.estado === 'descargando') throw new Error('Ya hay una descarga en marcha')
  if (!hasCacheApi()) throw new Error('Este navegador no permite guardar mapas sin conexión')
  cancelar = false
  const download: Descarga = { id, nombre, total: tiles.length, hechas: 0, fallos: 0, estado: 'descargando' }
  const publish = () => { actual = download; emitir() }
  publish()
  let i = 0
  let lastEmit = 0
  const worker = async (cache: Cache) => {
    while (!cancelar && i < tiles.length) {
      const t = tiles[i++]
      const url = CAPAS[capa].url(t.z, t.x, t.y)
      let ok = !!(await cache.match(url))
      for (let intento = 0; !ok && intento < 3 && !cancelar; intento++) {
        try {
          const res = await fetch(url, { mode: 'cors' })
          if (res.ok && (res.headers.get('content-type') ?? '').startsWith('image/')) {
            await cache.put(url, res)
            ok = true
          } else if (res.status < 500) break
        } catch {
          await new Promise((r) => setTimeout(r, 800 * (intento + 1)))
        }
      }
      if (ok) download.hechas++
      else download.fallos++
      const now = Date.now()
      if (now - lastEmit > 250) {
        lastEmit = now
        publish()
      }
    }
  }
  try {
    const cache = await caches.open(CACHE)
    // Esperar a todos los workers incluso si uno falla: no dejar tareas de una descarga anterior vivas.
    const results = await Promise.allSettled(Array.from({ length: Math.max(1, Math.floor(concurrencia)) }, () => worker(cache)))
    download.estado = results.some((r) => r.status === 'rejected') ? 'error' : cancelar ? 'cancelada' : 'terminada'
  } catch {
    download.estado = 'error'
  }
  publish()
  return { ...download }
}

/** Cuántas de estas teselas están ya guardadas */
export async function contarGuardadas(tiles: Tile[], capa: Capa = 'satelite'): Promise<number> {
  if (!hasCacheApi()) return 0
  const cache = await caches.open(CACHE)
  const keys = new Set((await cache.keys()).map((r) => r.url))
  return tiles.filter((t) => keys.has(CAPAS[capa].url(t.z, t.x, t.y))).length
}

export async function borrarTeselas(): Promise<void> {
  if (hasCacheApi()) await caches.delete(CACHE)
}

export async function espacio(): Promise<{ usado: number; cuota: number } | null> {
  try {
    const e = await navigator.storage?.estimate?.()
    return e ? { usado: e.usage ?? 0, cuota: e.quota ?? 0 } : null
  } catch {
    return null
  }
}

export function formatBytes(b: number): string {
  if (b < 1024 * 1024) return `${Math.max(1, Math.round(b / 1024))} KB`
  if (b < 1024 ** 3) return `${Math.round(b / 1024 / 1024)} MB`
  return `${(b / 1024 ** 3).toFixed(1).replace('.', ',')} GB`
}
