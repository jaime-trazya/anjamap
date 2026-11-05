import { DOMParser } from '@xmldom/xmldom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { readTransfer, transferGpx } from './transfer'
import { photoSize } from '../ui/photos'

afterEach(() => vi.unstubAllGlobals())
describe('intercambio rápido', () => {
  it('importa puntos y caminos GPX desde el mismo diálogo que las copias', () => {
    vi.stubGlobal('DOMParser', DOMParser)
    const result = readTransfer('<gpx><wpt lat="39" lon="-0.7"><name>Entrada</name></wpt><trk><trkseg><trkpt lat="39" lon="-0.7"/><trkpt lat="39.001" lon="-0.7"/></trkseg></trk></gpx>', 'sitios.gpx')
    expect(result.version).toBe(3)
    expect(result.bancales[0].nombre).toBe('Entrada')
    expect(result.caminos).toHaveLength(1)
    expect(transferGpx(result)).toContain('<name>Entrada</name>')
  })
  it('rechaza JSON ilegible con un mensaje comprensible', () => {
    expect(() => readTransfer('{roto', 'datos.json')).toThrow('JSON válido')
  })
  it('reduce las fotos grandes conservando sus proporciones', () => {
    expect(photoSize(4000, 3000)).toEqual({ width: 1600, height: 1200 })
    expect(photoSize(3000, 4000)).toEqual({ width: 1200, height: 1600 })
    expect(photoSize(400, 300)).toEqual({ width: 400, height: 300 })
  })
})
