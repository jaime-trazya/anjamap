import { describe, expect, it } from 'vitest'
import { distance, fromXY, type LatLon } from '../lib/geo'
import { bloquear, buildGraph, pathRoute } from './graph'

const REF: LatLon = [39.1, -0.69]
const m = (x: number, y: number): LatLon => fromXY({ x, y }, REF)

describe('pasos cerrados en la red local', () => {
  it('la ruta rodea un camino cortado', () => {
    // Dos caminos de A a B: uno recto (corto) y otro por el norte (largo)
    const recto = [m(0, 0), m(200, 0), m(400, 0)]
    const norte = [m(0, 0), m(0, 150), m(400, 150), m(400, 0)]
    const g = buildGraph([recto, norte])!
    const libre = pathRoute(g, m(0, 0), m(400, 0))!
    expect(libre.points.some((p) => distance(p, m(200, 150)) < 30 || distance(p, m(0, 150)) < 5)).toBe(false)
    const cortado = pathRoute(bloquear(g, [m(200, 0)]), m(0, 0), m(400, 0))!
    expect(cortado.points.some((p) => distance(p, m(0, 150)) < 5)).toBe(true)
    expect(bloquear(g, [])).toBe(g)
  })
})
