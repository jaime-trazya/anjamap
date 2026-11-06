import { afterEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_SETTINGS } from '../db/db'
import { decodeShape, fetchJourney, formatDuration, parseJourney, remainingSeconds, routeEndpoint, routeRequest } from './routing'
import { distance, type LatLon } from '../lib/geo'

// Codificador de referencia para construir respuestas pequeñas del proveedor.
function encode(points: LatLon[]) {
  let lastLat = 0, lastLon = 0, result = ''
  const number = (n: number) => {
    let value = n < 0 ? -n * 2 - 1 : n * 2
    let out = ''
    while (value >= 32) { out += String.fromCharCode((value % 32) + 95); value = Math.floor(value / 32) }
    return out + String.fromCharCode(value + 63)
  }
  for (const [lat, lon] of points) {
    const la = Math.round(lat * 1e6), lo = Math.round(lon * 1e6)
    result += number(la - lastLat) + number(lo - lastLon)
    lastLat = la; lastLon = lo
  }
  return result
}
const points: LatLon[] = [[39, -0.7], [39.001, -0.7], [39.001, -0.699]]
const response = () => ({ trip: { status: 0, units: 'kilometers', summary: { length: 0.2, time: 120, has_toll: false, has_highway: false }, legs: [{ shape: encode(points), maneuvers: [
  { instruction: 'Sigue al norte', begin_shape_index: 0, end_shape_index: 1, time: 90, type: 1 },
  { instruction: 'Gira a la derecha', begin_shape_index: 1, end_shape_index: 2, time: 30, type: 10 },
  { instruction: 'Has llegado', begin_shape_index: 2, end_shape_index: 2, time: 0, type: 4 },
] }] } })
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers() })

describe('perfiles de transporte', () => {
  it('elige un perfil distinto para peatón, coche y bicicleta', () => {
    expect(routeRequest(points[0], points[2], 'pie', DEFAULT_SETTINGS).costing).toBe('pedestrian')
    expect(routeRequest(points[0], points[2], 'coche', DEFAULT_SETTINGS).costing).toBe('auto')
    expect(routeRequest(points[0], points[2], 'bici', DEFAULT_SETTINGS).costing).toBe('bicycle')
  })
  it('el patinete es una aproximación de bici, nunca el perfil de motocicleta', () => {
    const r = routeRequest(points[0], points[2], 'patinete', { ...DEFAULT_SETTINGS, velocidadPatinete: 20 })
    expect(r.costing).toBe('bicycle')
    expect(r.costing_options.bicycle).toMatchObject({ cycling_speed: 20, use_roads: 0, use_hills: 0 })
    expect(JSON.stringify(r)).not.toContain('motor_scooter')
  })
  it('envía las preferencias de coche al motor', () => {
    expect(routeRequest(points[0], points[2], 'coche', { ...DEFAULT_SETTINGS, evitarPeajes: true, evitarAutopistas: true }).costing_options.auto).toEqual({ use_tolls: 0, use_highways: 0 })
  })
  it.each(['https://example.test', 'https://example.test/', 'https://example.test/route'])('normaliza el servidor %s', (url) => {
    expect(routeEndpoint(url)).toBe('https://example.test/route')
  })
  it.each(['http://example.test', 'https://user:password@example.test', 'https://example.test?key=secreto', 'javascript:alert(1)', 'texto'])('rechaza el servidor %s', (url) => {
    expect(() => routeEndpoint(url)).toThrow()
  })
})

describe('recorridos y tiempos', () => {
  it('decodifica seis decimales y deltas negativos', () => {
    expect(decodeShape(encode(points))).toEqual(points)
    expect(decodeShape('??_c`|@?')).toEqual([[0, 0], [1, 0]])
  })
  it.each(['?', '~', '\n\n', '~~~~~~~?'])('rechaza una geometría dañada %j', (value) => {
    expect(() => decodeShape(value)).toThrow()
  })
  it('conserva las indicaciones y convierte kilómetros a metros', () => {
    const result = parseJourney(response(), points[2])
    expect(result.points).toEqual(points)
    expect(result.length).toBe(200)
    expect(result.seconds).toBe(120)
    expect(result.steps[1].instruction).toBe('Gira a la derecha')
    expect(result.steps[1].along).toBeCloseTo(distance(points[0], points[1]), 2)
  })
  it('no añade al itinerario en coche un tramo imaginario campo a través', () => {
    const result = parseJourney(response(), [39.01, -0.69])
    expect(result.points.at(-1)).toEqual(points[2])
    expect(result.tailGap).toBeGreaterThan(100)
  })
  it('calcula el tiempo restante con los tiempos de cada tramo', () => {
    const result = parseJourney(response(), points[2])
    expect(remainingSeconds(result, result.steps[1].along)).toBeCloseTo(30, 5)
    expect(remainingSeconds(result, result.steps[1].along / 2)).toBeCloseTo(75, 5)
    expect(remainingSeconds(result, result.steps[2].along)).toBe(0)
  })
  it('rechaza una respuesta sin ruta o con índices incoherentes', () => {
    expect(() => parseJourney({ error_code: 442 }, points[2])).toThrow()
    const data = response(); data.trip.legs[0].maneuvers[0].end_shape_index = 999
    expect(() => parseJourney(data, points[2])).toThrow()
  })
  it('formatea minutos y horas', () => {
    expect(formatDuration(100)).toBe('2 min')
    expect(formatDuration(3600)).toBe('1 h')
    expect(formatDuration(3900)).toBe('1 h 5 min')
  })
})

describe('peticiones al servidor de rutas', () => {
  it('envía la petición de navegación en español con un identificador de cliente', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify(response())))
    vi.stubGlobal('fetch', fetch)
    const journey = await fetchJourney(points[0], points[2], 'pie', DEFAULT_SETTINGS)
    expect(journey.points).toEqual(points)
    const [url, request] = fetch.mock.calls[0]
    expect(url).toBe('https://valhalla1.openstreetmap.de/route')
    expect(request.headers['X-Client-Id']).toBe('anjamap')
    expect(JSON.parse(request.body)).toMatchObject({ costing: 'pedestrian', language: 'es-ES', units: 'kilometers' })
  })
  it('informa si el servidor limita las peticiones', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 429 })))
    await expect(fetchJourney(points[0], points[2], 'coche', DEFAULT_SETTINGS)).rejects.toThrow('ocupado')
  })
  it('cancela una petición que supera el tiempo máximo', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('fetch', vi.fn((_url: string, opts: RequestInit) => new Promise((_resolve, reject) => opts.signal!.addEventListener('abort', () => reject(new DOMException('Cancelado', 'AbortError'))))))
    const result = fetchJourney(points[0], points[2], 'coche', DEFAULT_SETTINGS)
    const rejection = expect(result).rejects.toThrow('tarda demasiado')
    await vi.advanceTimersByTimeAsync(20000)
    await rejection
    expect(vi.getTimerCount()).toBe(0)
  })
})

describe('flechas de las maniobras', () => {
  it('no confunde una incorporación recta con un giro', async () => {
    const { maniobra } = await import('./routing')
    expect(maniobra(17)).toBe('recto')
    expect(maniobra(22)).toBe('recto')
    expect(maniobra(15)).toBe('izquierda')
    expect(maniobra(14)).toBe('izquierda')
    expect(maniobra(16)).toBe('ligera-izquierda')
    expect(maniobra(10)).toBe('derecha')
    expect(maniobra(20)).toBe('ligera-derecha')
    expect(maniobra(12)).toBe('media-vuelta')
    expect(maniobra(13)).toBe('media-vuelta')
    expect(maniobra(26)).toBe('rotonda')
    expect(maniobra(4)).toBe('llegada')
    expect(maniobra(undefined)).toBe('recto')
  })
})

describe('recalcular hacia delante', () => {
  it('manda el rumbo de marcha para que la ruta no te haga dar la vuelta', () => {
    const r = routeRequest([39.1, -0.69], [39.2, -0.7], 'coche', DEFAULT_SETTINGS, -90)
    expect(r.locations[0]).toMatchObject({ heading: 270, heading_tolerance: 45 })
    expect(routeRequest([39.1, -0.69], [39.2, -0.7], 'coche', DEFAULT_SETTINGS).locations[0]).not.toHaveProperty('heading')
  })
})

describe('ordenar paradas', () => {
  it('propone el orden que recorre menos sin conexión', async () => {
    const { ordenLocal } = await import('./routing')
    const desde: LatLon = [39.1, -0.7]
    // Paradas desordenadas a lo largo de una línea hacia el norte
    const paradas: LatLon[] = [[39.13, -0.7], [39.11, -0.7], [39.14, -0.7], [39.12, -0.7]]
    expect(ordenLocal(desde, paradas, [39.15, -0.7])).toEqual([1, 3, 0, 2])
    expect(ordenLocal(desde, [[39.11, -0.7]], null)).toEqual([0])
  })
})

describe('evitar pasos cerrados y alternativas', () => {
  it('añade paradas, zonas a evitar y alternativas a la petición', () => {
    const r = routeRequest([39.1, -0.69], [39.2, -0.7], 'pie', DEFAULT_SETTINGS, null, { via: [[39.15, -0.69]], evitar: [[39.12, -0.69], [39.1, -0.69]], alternativas: 2 })
    expect(r.locations).toHaveLength(3)
    expect(r.locations[1]).toMatchObject({ type: 'break' })
    // El cierre junto a la salida no se manda (te dejaría sin ruta) y sin paradas no hay alternativas
    expect(r.exclude_locations).toEqual([{ lat: 39.12, lon: -0.69 }])
    expect(r.alternates).toBeUndefined()
    expect(routeRequest([39.1, -0.69], [39.2, -0.7], 'pie', DEFAULT_SETTINGS, null, { alternativas: 2 }).alternates).toBe(2)
  })
})
