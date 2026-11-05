import { describe, expect, it } from 'vitest'
import { bearing, closestOnPath, distance, formatDistance, fromXY, pathLength, pointAlong, simplify, type LatLon } from '../lib/geo'
import { readFileSync } from 'node:fs'
import { buildGraph, directRoute, pathRoute, recommend } from './graph'
import { navigate, nextStep, routeToDest } from './nav'
import { decodeOsm } from './osm'
import { toGpx } from './gpx'
import { COMARCAS } from './comarcas'
import { tilesAround, tilesForPolygons } from '../map/tiles'
import { tilesComarca } from '../ui/offline'

// Referencia cerca de Navarrés; los puntos se crean en metros (x este, y norte)
const REF: LatLon = [39.1, -0.69]
const m = (x: number, y: number): LatLon => fromXY({ x, y }, REF)

describe('geo', () => {
  it('mide distancias y rumbos', () => {
    expect(distance(m(0, 0), m(300, 400))).toBeCloseTo(500, 0)
    expect(bearing(m(0, 0), m(0, 100))).toBeCloseTo(0, 0)
    expect(bearing(m(0, 0), m(100, 0))).toBeCloseTo(90, 0)
    expect(bearing(m(0, 0), m(0, -100))).toBeCloseTo(180, 0)
    expect(bearing(m(0, 0), m(-100, 0))).toBeCloseTo(270, 0)
  })

  it('encuentra el punto más cercano y avanza sobre un recorrido', () => {
    const path = [m(0, 0), m(100, 0), m(100, 100)]
    expect(pathLength(path)).toBeCloseTo(200, 0)
    const hit = closestOnPath(m(50, 10), path)!
    expect(hit.dist).toBeCloseTo(10, 0)
    expect(hit.along).toBeCloseTo(50, 0)
    expect(distance(pointAlong(path, 150), m(100, 50))).toBeLessThan(0.5)
  })

  it('simplifica sin perder las curvas', () => {
    const line = [...Array.from({ length: 50 }, (_, i) => m(i * 2, 0)), ...Array.from({ length: 50 }, (_, i) => m(100, i * 2))]
    const s = simplify(line, 1)
    expect(s.length).toBeLessThanOrEqual(4)
    expect(s.some((p) => distance(p, m(100, 0)) < 3)).toBe(true)
  })

  it('formatea distancias en español', () => {
    expect(formatDistance(7.4)).toBe('7 m')
    expect(formatDistance(243)).toBe('245 m')
    expect(formatDistance(1234)).toBe('1,2 km')
  })
})

describe('red de caminos', () => {
  // Una pista en L y una senda que la cruza
  const pista = [m(0, 0), m(400, 0), m(400, 400)]
  const senda = [m(200, -100), m(200, 100)]

  it('crea un nodo en el cruce de dos caminos', () => {
    const g = buildGraph([pista, senda])!
    // del cruce salen 4 tramos
    expect(Math.max(...g.deg)).toBe(4)
  })

  it('engancha el final de un camino que se queda a pocos metros de otro', () => {
    const ramal = [m(100, 80), m(100, 6)] // termina a 6 m de la pista
    const g = buildGraph([pista, ramal])!
    const r = pathRoute(g, m(100, 80), m(400, 400))!
    expect(r).not.toBeNull()
    // 74 m de ramal + 6 m de enganche + 300 m + 400 m de pista
    expect(r.onPath).toBeCloseTo(780, -1)
  })

  it('va por caminos si compensa y en línea recta si no', () => {
    const g = buildGraph([pista, senda])
    // Desde el inicio de la pista hasta la esquina opuesta: por la pista (800 m) frente a 566 m campo a través × 2,5
    const viaPista = recommend(g, m(0, 0), m(400, 400))
    expect(viaPista.kind).toBe('caminos')
    expect(viaPista.length).toBeCloseTo(800, -1)
    // Un bancal a 30 m: mejor ir directo
    const cerca = recommend(g, m(0, 0), m(0, 30))
    expect(cerca.kind).toBe('directa')
  })

  it('indica los giros en los cruces', () => {
    // Pista recta hacia el este con un ramal al norte en x=200; el bancal está al norte del ramal
    const este = [m(0, 0), m(400, 0)]
    const ramal = [m(200, 0), m(200, 300)]
    const g = buildGraph([este, ramal])
    const r = recommend(g, m(0, 0), m(200, 300))
    expect(r.kind).toBe('caminos')
    expect(r.steps.map((p) => p.giro)).toEqual(['izquierda'])
    expect(r.steps[0].along).toBeCloseTo(200, -1)
    expect(nextStep(r.steps, 150)!.dist).toBeCloseTo(50, -1)
    expect(nextStep(r.steps, 210)).toBeNull()
  })

  it('avisa de dejar el camino si el bancal queda lejos de él', () => {
    const g = buildGraph([[m(0, 0), m(600, 0)]])
    const r = recommend(g, m(0, 0), m(600, 40))
    expect(r.kind).toBe('caminos')
    expect(r.steps.at(-1)!.giro).toBe('dejar')
  })

  it('sin caminos, la ruta es directa', () => {
    expect(recommend(null, m(0, 0), m(100, 0)).kind).toBe('directa')
    expect(directRoute(m(0, 0), m(100, 0)).length).toBeCloseTo(100, 0)
  })
})

describe('caminos de OpenStreetMap', () => {
  const net = decodeOsm(JSON.parse(readFileSync(new URL('../../public/caminos-osm.json', import.meta.url), 'utf8')))

  it('la red cubre las dos comarcas', () => {
    expect(net.edges.length).toBeGreaterThan(10000)
    const lats = net.nodes.map((p) => p[0])
    expect(Math.min(...lats)).toBeLessThan(38.95)
    expect(Math.max(...lats)).toBeGreaterThan(39.05)
  })

  it('calcula rutas por la red real y se une con los caminos propios', () => {
    const t0 = performance.now()
    const propio = [[39.1045, -0.6905], [39.1052, -0.6898]] as LatLon[]
    const g = buildGraph([propio], net)!
    const build = performance.now() - t0
    // De Navarrés (pueblo) a un punto del campo a unos 2 km
    const from: LatLon = [39.1012, -0.6957]
    const to: LatLon = [39.0885, -0.7158]
    const t1 = performance.now()
    const r = recommend(g, from, to)
    const route = performance.now() - t1
    expect(r.kind).toBe('caminos')
    expect(r.length).toBeGreaterThan(distance(from, to))
    expect(r.length).toBeLessThan(distance(from, to) * 2)
    expect(build).toBeLessThan(4000)
    expect(route).toBeLessThan(500)
    console.log(`red: ${g.x.length} nodos, ${g.ea.length} tramos, construida en ${build.toFixed(0)} ms; ruta ${r.length.toFixed(0)} m con ${r.steps.length} indicaciones (${r.steps.map((p) => p.giro).join(', ')}) en ${route.toFixed(1)} ms`)
  })
})

describe('navegación', () => {
  const route = [m(0, 0), m(200, 0), m(200, 200)]
  const dest = m(200, 200)

  it('apunta por delante sobre la ruta y calcula lo que falta', () => {
    const s = navigate(m(50, 3), route, dest)
    expect(s.offRoute).toBe(false)
    expect(s.remaining).toBeCloseTo(350 + 3, -1)
    expect(s.bearing).toBeGreaterThan(70)
    expect(s.bearing).toBeLessThan(110)
  })

  it('si te sales, te devuelve a la ruta', () => {
    const s = navigate(m(100, 80), route, dest)
    expect(s.offRoute).toBe(true)
    expect(s.bearing).toBeGreaterThan(150) // hacia el sur, a la pista
  })

  it('detecta la llegada', () => {
    expect(navigate(m(195, 195), route, dest).arrived).toBe(true)
  })

  it('completa una ruta guardada que no termina en el bancal', () => {
    expect(routeToDest([m(0, 0), m(100, 0)], m(150, 0))).toHaveLength(3)
    expect(routeToDest([m(0, 0), m(149, 0)], m(150, 0))).toHaveLength(2)
  })
})

describe('mapa sin conexión', () => {
  it('las dos comarcas tienen contorno', () => {
    expect(COMARCAS.map((c) => c.id)).toEqual(['canal-navarres', 'costera'])
    for (const c of COMARCAS) expect(Math.max(...c.anillos.map((a) => a.length))).toBeGreaterThan(50)
  })

  it('el nivel detallado cuesta unas 4 veces el básico', () => {
    const b = tilesComarca('canal-navarres', 'basico').length
    const d = tilesComarca('canal-navarres', 'detallado').length
    expect(d / b).toBeGreaterThan(3)
    expect(d).toBeLessThan(6000)
  })

  it('no incluye teselas fuera de la comarca', () => {
    const c = COMARCAS.find((x) => x.id === 'costera')!
    const t = tilesForPolygons(c.anillos, 12, 12)
    // Valencia ciudad (39.47, -0.38) queda fuera
    expect(t.some((x) => x.x === 2034 && x.y === 1567)).toBe(false)
    expect(t.length).toBeGreaterThan(0)
  })

  it('el detalle alrededor de un bancal es pequeño', () => {
    const t = tilesAround([REF], 250, 17, 19)
    expect(t.length).toBeGreaterThan(50)
    expect(t.length).toBeLessThan(200)
  })
})

describe('GPX', () => {
  it('exporta puntos y caminos escapando el texto', () => {
    const x = toGpx({ waypoints: [{ name: 'Bancal <1> & Cía', point: REF }], tracks: [{ name: 'Pista', points: [m(0, 0), m(10, 0)] }] })
    expect(x).toContain('Bancal &lt;1&gt; &amp; Cía')
    expect(x.match(/<trkpt/g)).toHaveLength(2)
  })
})
