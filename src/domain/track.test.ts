import { describe, expect, it } from 'vitest'
import { distance, fromXY, splitRoute, pathLength, type LatLon } from '../lib/geo'
import { MAX_SPEED, PositionFilter } from './track'
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
