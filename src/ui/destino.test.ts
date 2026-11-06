import { describe, expect, it } from 'vitest'
import { resolverDestino, resolverModo } from './destino'

describe('destinos de navegación', () => {
  it.each(['lat=91&lon=0', 'lat=39&lon=181', 'lat=&lon=0', 'lat=%20&lon=0', 'lat=hola&lon=0', 'lon=0'])('rechaza las coordenadas inválidas %s', (query) => {
    expect(resolverDestino('punto', new URLSearchParams(query), [], null)).toBeNull()
  })
  it('acepta coordenadas cero', () => {
    expect(resolverDestino('punto', new URLSearchParams('lat=0&lon=0'), [], null)?.p).toEqual([0, 0])
  })
  it('usa la recomendada si falta la ruta o pertenece a otro bancal', () => {
    const rutas = [{ id: 'r1', bancalId: 'b1' }]
    expect(resolverModo(null, rutas, 'b1')).toBe('recomendada')
    expect(resolverModo('borrada', rutas, 'b1')).toBe('recomendada')
    expect(resolverModo('r1', rutas, 'b2')).toBe('recomendada')
    expect(resolverModo('r1', rutas, 'b1')).toBe('r1')
    expect(resolverModo('directa', rutas, 'b1')).toBe('directa')
  })
})

describe('coordenadas escritas o pegadas', () => {
  it('lee los formatos habituales', async () => {
    const { leerCoordenadas } = await import('./destino')
    expect(leerCoordenadas('39.1234, -0.6789')).toEqual([39.1234, -0.6789])
    expect(leerCoordenadas('39,1234 -0,6789')).toEqual([39.1234, -0.6789])
    expect(leerCoordenadas('https://www.google.com/maps/@39.1234,-0.6789,17z')).toEqual([39.1234, -0.6789])
    const dms = leerCoordenadas(`39°05'12.0"N 0°41'24.0"W`)!
    expect(dms[0]).toBeCloseTo(39.08667, 4)
    expect(dms[1]).toBeCloseTo(-0.69, 4)
    expect(leerCoordenadas('Huerto de la caseta')).toBeNull()
    expect(leerCoordenadas('120, 10')).toBeNull()
  })
})
