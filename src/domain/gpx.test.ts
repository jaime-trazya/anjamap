import { DOMParser } from '@xmldom/xmldom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { parseGpx, toGpx, type GpxData } from './gpx'

beforeEach(() => vi.stubGlobal('DOMParser', DOMParser))
afterEach(() => vi.unstubAllGlobals())

describe('importación GPX', () => {
  it('recupera un archivo exportado con sus nombres, notas y coordenadas', () => {
    const data: GpxData = {
      waypoints: [{ name: 'Prueba <1> & olivos', point: [39, -0.7], desc: 'Puerta "verde"' }],
      tracks: [{ name: 'Camino', points: [[39, -0.7], [39.001, -0.7]] }],
    }
    expect(parseGpx(toGpx(data))).toEqual(data)
  })

  it('admite GPX con prefijos de espacio de nombres y mantiene separados los segmentos', () => {
    const xml = '<g:gpx xmlns:g="http://www.topografix.com/GPX/1/1"><g:trk><g:name>Ruta</g:name><g:trkseg><g:trkpt lat="39" lon="-0.7"/><g:trkpt lat="39.001" lon="-0.7"/></g:trkseg><g:trkseg><g:trkpt lat="39.01" lon="-0.7"/><g:trkpt lat="39.02" lon="-0.7"/></g:trkseg></g:trk></g:gpx>'
    const result = parseGpx(xml)
    expect(result.tracks.map((t) => t.name)).toEqual(['Ruta (1)', 'Ruta (2)'])
    expect(result.tracks.map((t) => t.points.length)).toEqual([2, 2])
  })

  it.each(['lat="" lon="0"', 'lat=" " lon="0"', 'lat="91" lon="0"', 'lat="39" lon="181"', 'lat="hola" lon="0"', 'lon="0"'])('rechaza coordenadas inválidas: %s', (attrs) => {
    expect(() => parseGpx(`<gpx><wpt ${attrs}/></gpx>`)).toThrow('coordenadas')
  })

  it('rechaza un punto inválido en vez de inventar un atajo entre los puntos restantes', () => {
    expect(() => parseGpx('<gpx><trk><trkseg><trkpt lat="39" lon="0"/><trkpt lat="99" lon="0"/><trkpt lat="39.01" lon="0"/></trkseg></trk></gpx>')).toThrow('coordenadas')
  })

  it('rechaza XML que no es GPX', () => {
    expect(() => parseGpx('<archivo><wpt lat="39" lon="0"/></archivo>')).toThrow('GPX válido')
  })
})
