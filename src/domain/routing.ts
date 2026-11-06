import type { Settings, Transporte } from '../db/db'
import { distance, isLatLon, pathLength, type LatLon } from '../lib/geo'

export type RouteOptions = Pick<Settings, 'evitarPeajes' | 'evitarAutopistas' | 'velocidadPatinete' | 'servidorRutas'>
export const TRANSPORT_LABELS: Record<Transporte, string> = { pie: 'A pie', coche: 'Coche', bici: 'Bici', patinete: 'Patinete' }
export interface JourneyStep { along: number; end: number; instruction: string; seconds: number; type: number; p: LatLon }
export interface Journey {
  points: LatLon[]
  length: number
  seconds: number
  steps: JourneyStep[]
  tailGap: number
  hasToll: boolean
  hasHighway: boolean
}

/** El perfil motor_scooter es una motocicleta: nunca se usa para un patinete. */
/**
 * `heading` = hacia dónde te mueves (grados). Se manda a Valhalla para que la ruta salga en tu sentido de marcha
 * y no te proponga dar media vuelta donde no se puede: busca otro camino por delante.
 */
export function routeRequest(from: LatLon, to: LatLon, transport: Transporte, options: RouteOptions, heading: number | null = null) {
  if (!isLatLon(from) || !isLatLon(to)) throw new Error('Posición o destino no válidos')
  const origin: Record<string, number> = { lat: from[0], lon: from[1] }
  if (heading !== null && Number.isFinite(heading)) {
    origin.heading = Math.round(((heading % 360) + 360) % 360)
    origin.heading_tolerance = 45
  }
  const costing = transport === 'coche' ? 'auto' : transport === 'pie' ? 'pedestrian' : 'bicycle'
  const costing_options = costing === 'auto'
    ? { auto: { use_tolls: options.evitarPeajes ? 0 : 0.5, use_highways: options.evitarAutopistas ? 0 : 0.5 } }
    : costing === 'pedestrian'
      ? { pedestrian: { walking_speed: 4.5, use_ferry: 0 } }
      : { bicycle: { bicycle_type: 'hybrid', cycling_speed: transport === 'patinete' ? Math.max(5, Math.min(25, options.velocidadPatinete)) : 18, use_roads: transport === 'patinete' ? 0 : 0.25, use_hills: transport === 'patinete' ? 0 : 0.25, use_ferry: 0 } }
  return { locations: [origin, { lat: to[0], lon: to[1] }], costing, costing_options, units: 'kilometers', language: 'es-ES' }
}

export function routeEndpoint(server: string): string {
  let url: URL
  try { url = new URL(server.trim()) } catch { throw new Error('La dirección del servidor de rutas no es válida') }
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
  if ((url.protocol !== 'https:' && !(url.protocol === 'http:' && local)) || url.username || url.password || url.search || url.hash) throw new Error('Usa una dirección HTTPS sin usuario, contraseña ni parámetros')
  return `${url.href.replace(/\/+$/, '').replace(/\/route$/, '')}/route`
}

/** Geometría Valhalla: polyline de seis decimales (no la variante de cinco de Google). */
export function decodeShape(encoded: string): LatLon[] {
  if (encoded.length > 5_000_000) throw new Error('La ruta es demasiado grande')
  let index = 0, lat = 0, lon = 0
  const value = () => {
    let result = 0, shift = 0, byte: number
    do {
      if (index >= encoded.length || shift > 30) throw new Error('Geometría de ruta dañada')
      byte = encoded.charCodeAt(index++) - 63
      if (byte < 0 || byte > 63) throw new Error('Geometría de ruta dañada')
      result += (byte & 31) * 2 ** shift
      shift += 5
    } while (byte >= 32)
    return result % 2 ? -Math.floor(result / 2) - 1 : result / 2
  }
  const points: LatLon[] = []
  while (index < encoded.length) {
    lat += value(); lon += value()
    const p: LatLon = [lat / 1e6, lon / 1e6]
    if (!isLatLon(p)) throw new Error('La ruta contiene coordenadas no válidas')
    points.push(p)
  }
  return points
}

const object = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x)
const positive = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x) && x >= 0

export function parseJourney(data: unknown, dest: LatLon): Journey {
  if (!object(data) || !object(data.trip) || data.trip.status !== 0 || !object(data.trip.summary) || !Array.isArray(data.trip.legs) || !data.trip.legs.length) throw new Error('No se ha encontrado una ruta para ese transporte')
  const trip = data.trip
  const summary = trip.summary as Record<string, unknown>
  if (!positive(summary.length) || !positive(summary.time) || !['kilometers', 'miles'].includes(String(trip.units))) throw new Error('El servidor ha devuelto una ruta incompleta')
  const points: LatLon[] = [], steps: JourneyStep[] = []
  let offset = 0
  for (const leg of trip.legs as unknown[]) {
    if (!object(leg) || typeof leg.shape !== 'string' || !Array.isArray(leg.maneuvers)) throw new Error('El servidor no ha devuelto las indicaciones de la ruta')
    const pts = decodeShape(leg.shape)
    if (pts.length < 2) throw new Error('La ruta no tiene un recorrido válido')
    if (points.length && distance(points[points.length - 1], pts[0]) > 1) throw new Error('El servidor ha devuelto tramos de ruta desconectados')
    const along = [0]
    for (let i = 1; i < pts.length; i++) along.push(along[i - 1] + distance(pts[i - 1], pts[i]))
    for (const m of leg.maneuvers) {
      if (!object(m) || !Number.isInteger(m.begin_shape_index) || !Number.isInteger(m.end_shape_index) || !positive(m.time) || typeof m.instruction !== 'string' || !Number.isInteger(m.type)) throw new Error('Las indicaciones de la ruta están incompletas')
      const start = m.begin_shape_index as number, end = m.end_shape_index as number
      if (start < 0 || end < start || end >= pts.length) throw new Error('Las indicaciones no coinciden con el recorrido')
      steps.push({ along: offset + along[start], end: offset + along[end], instruction: m.instruction, seconds: m.time, type: m.type as number, p: pts[start] })
    }
    const start = points.length ? 1 : 0
    for (let i = start; i < pts.length; i++) points.push(pts[i])
    offset += along[along.length - 1]
  }
  return { points, steps, length: summary.length * (trip.units === 'miles' ? 1609.344 : 1000), seconds: summary.time, tailGap: distance(points[points.length - 1], dest), hasToll: summary.has_toll === true, hasHighway: summary.has_highway === true }
}

export function remainingSeconds(journey: Journey, along: number): number {
  if (!journey.steps.length) return journey.seconds * Math.max(0, 1 - along / Math.max(1, pathLength(journey.points)))
  return journey.steps.reduce((total, step) => total + (step.end > along ? step.seconds * Math.min(1, (step.end - along) / Math.max(1, step.end - step.along)) : 0), 0)
}

export function formatDuration(seconds: number): string {
  const mins = Math.max(1, Math.ceil(seconds / 60))
  return mins < 60 ? `${mins} min` : `${Math.floor(mins / 60)} h${mins % 60 ? ` ${mins % 60} min` : ''}`
}

export async function fetchJourney(from: LatLon, to: LatLon, transport: Transporte, options: RouteOptions, signal?: AbortSignal, heading: number | null = null): Promise<Journey> {
  const controller = new AbortController()
  const abort = () => controller.abort()
  if (signal?.aborted) throw new DOMException('Ruta cancelada', 'AbortError')
  signal?.addEventListener('abort', abort, { once: true })
  let timeout = false
  const timer = setTimeout(() => { timeout = true; controller.abort() }, 20000)
  try {
    const response = await fetch(routeEndpoint(options.servidorRutas), { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Client-Id': 'anjamap' }, body: JSON.stringify(routeRequest(from, to, transport, options, heading)), signal: controller.signal })
    if (response.status === 429) throw new Error('El servidor está ocupado. Espera un momento y vuelve a calcular.')
    if (!response.ok) throw new Error('No se ha podido calcular una ruta para ese destino y transporte')
    return parseJourney(await response.json(), to)
  } catch (error) {
    if (signal?.aborted) throw new DOMException('Ruta cancelada', 'AbortError')
    if (timeout) throw new Error('El servidor de rutas tarda demasiado. Vuelve a intentarlo.', { cause: error })
    if (error instanceof TypeError) throw new Error('No se puede conectar con el servidor de rutas. Revisa la conexión o cambia el servidor en Ajustes.', { cause: error })
    throw error
  } finally { clearTimeout(timer); signal?.removeEventListener('abort', abort) }
}

export type Maniobra = 'recto' | 'derecha' | 'ligera-derecha' | 'izquierda' | 'ligera-izquierda' | 'media-vuelta' | 'rotonda' | 'llegada'

/**
 * Flecha para cada tipo de maniobra de Valhalla (https://valhalla.github.io/valhalla/api/turn-by-turn/api-reference/).
 * 17 (rampa recta) y 22 (seguir recto) van rectas; 12 y 13 son cambios de sentido; 26 y 27, rotondas.
 */
export function maniobra(type: number | undefined): Maniobra {
  switch (type) {
    case 10: case 11: return 'derecha'
    case 2: case 9: case 18: case 20: case 23: case 37: return 'ligera-derecha'
    case 14: case 15: return 'izquierda'
    case 3: case 16: case 19: case 21: case 24: case 38: return 'ligera-izquierda'
    case 12: case 13: return 'media-vuelta'
    case 26: case 27: return 'rotonda'
    case 4: case 5: case 6: return 'llegada'
    default: return 'recto'
  }
}
