import { describe, expect, it } from 'vitest'
import { distance, fromXY, splitRoute, pathLength, type LatLon } from '../lib/geo'
import { MAX_SPEED, PositionFilter, TrailRecorder } from './track'
import { RouteTracker } from './nav'

const REF: LatLon = [39.1, -0.69]
const m = (x: number, y: number): LatLon => fromXY({ x, y }, REF)
const raw = (p: LatLon, t: number, acc = 5, speed: number | null = null) => ({ p, acc, t, speed, heading: null })

describe('filtro de posición', () => {
  it('descarta un salto imposible andando y lo acepta si se repite', () => {
    const f = new PositionFilter(MAX_SPEED.pie)
    f.push(raw(m(0, 0), 0))
    f.push(raw(m(1, 0), 1000))
    const salto = f.push(raw(m(300, 0), 2000))
    expect(salto.rejected).toBe(true)
    expect(distance(salto.p, m(0, 0))).toBeLessThan(5)
    f.push(raw(m(301, 0), 3000))
    const tercera = f.push(raw(m(302, 0), 4000))
    expect(tercera.rejected).toBe(false)
    expect(distance(tercera.p, m(302, 0))).toBeLessThan(150)
  })

  it('una lectura mala apenas mueve una posición buena', () => {
    const f = new PositionFilter(MAX_SPEED.pie)
    f.push(raw(m(0, 0), 0, 4))
    const r = f.push(raw(m(30, 0), 1000, 60))
    expect(distance(r.p, m(0, 0))).toBeLessThan(5)
  })

  it('saca rumbo y velocidad del movimiento', () => {
    const f = new PositionFilter(MAX_SPEED.coche)
    let r = f.push(raw(m(0, 0), 0, 4))
    for (let i = 1; i <= 6; i++) r = f.push(raw(m(0, i * 15), i * 1000, 4))
    expect(r.heading).not.toBeNull()
    expect(Math.abs(r.heading!)).toBeLessThan(10)
    expect(r.speed).toBeGreaterThan(8)
  })
})

describe('seguimiento de la ruta', () => {
  const route = [m(0, 0), m(300, 0), m(300, 300)]
  const dest = m(300, 300)

  it('pega la posición a la ruta y solo avisa del desvío tras varias lecturas', () => {
    const t = new RouteTracker()
    const s1 = t.update('a', route, m(100, 6), dest, 5, 25)
    expect(distance(s1.snapped, m(100, 0))).toBeLessThan(1)
    expect(t.update('a', route, m(150, 60), dest, 5, 25).offRoute).toBe(false)
    expect(t.update('a', route, m(150, 62), dest, 5, 25).offRoute).toBe(false)
    expect(t.update('a', route, m(150, 64), dest, 5, 25).offRoute).toBe(true)
    expect(t.update('a', route, m(200, 2), dest, 5, 25).offRoute).toBe(false)
  })

  it('parte la ruta en lo recorrido y lo que falta', () => {
    const [past, ahead] = splitRoute(route, 450)
    expect(pathLength(past)).toBeCloseTo(450, -1)
    expect(pathLength(ahead)).toBeCloseTo(150, -1)
  })
})

describe('recorrido hecho', () => {
  it('apunta solo lecturas buenas y separadas', async () => {
    const { TrailRecorder } = await import('./track')
    const r = new TrailRecorder(0)
    const fix = (x: number, t: number, acc = 5, rejected = false) => ({ p: m(x, 0), acc, t, rejected })
    r.push(fix(0, 1000))
    const igual = r.push(fix(1, 2000))
    expect(igual).toHaveLength(1)
    r.push(fix(10, 3000))
    r.push(fix(50, 4000, 80))
    r.push(fix(60, 5000, 5, true))
    expect(r.push(fix(20, 6000))).toHaveLength(3)
  })
})

describe('tramos de una grabación', () => {
  it('no une el hueco de una pausa', async () => {
    const { tramos } = await import('./track')
    const pts = [m(0, 0), m(10, 0), m(20, 0), m(200, 0), m(210, 0)]
    expect(tramos(pts, [3])).toEqual([pts.slice(0, 3), pts.slice(3)])
    expect(tramos(pts, [1])).toEqual([pts.slice(1)])
    expect(tramos(pts)).toEqual([pts])
  })
})

describe('sentido contrario', () => {
  it('lo detecta tras varias lecturas yendo al revés por la ruta', () => {
    const route = [m(0, 0), m(500, 0)]
    const t = new RouteTracker()
    // La ruta va hacia el este (90°); vas hacia el oeste (270°) a 10 m/s
    let s = t.update('w', route, m(300, 0), m(500, 0), 5, 25, 10, 3, 270)
    for (let x = 290; x > 240; x -= 10) s = t.update('w', route, m(x, 0), m(500, 0), 5, 25, 10, 3, 270)
    expect(s.wrongWay).toBe(true)
    const ok = new RouteTracker()
    let a = ok.update('w', route, m(100, 0), m(500, 0), 5, 25, 10, 3, 90)
    for (let x = 110; x < 170; x += 10) a = ok.update('w', route, m(x, 0), m(500, 0), 5, 25, 10, 3, 90)
    expect(a.wrongWay).toBe(false)
  })
})

describe('recorrido por transportes', () => {
  it('al pasar de coche a pie empieza un tramo nuevo', () => {
    const r = new TrailRecorder(0, 25)
    const f = (i: number) => ({ p: [39.1 + i * 0.001, -0.69] as [number, number], acc: 5, t: i * 1000, rejected: false })
    r.push(f(0), 'coche')
    r.push(f(1), 'coche')
    r.push(f(2), 'pie')
    r.push(f(3), 'pie')
    expect(r.points).toHaveLength(4)
    expect(r.tramoActual).toHaveLength(2)
    expect(r.inicioTramo).toBe(2)
  })
})
