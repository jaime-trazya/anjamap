import { afterEach, describe, expect, it, vi } from 'vitest'
import { CAPAS, cancelarDescarga, descargaActual, descargar, getTile, lat2y, tilesAround } from './tiles'

const image = () => new Response('imagen', { headers: { 'Content-Type': 'image/jpeg' } })
const tiles = [{ z: 14, x: 1, y: 2 }, { z: 14, x: 2, y: 2 }]
const cache = () => ({ match: vi.fn().mockResolvedValue(undefined), put: vi.fn().mockResolvedValue(undefined) })

afterEach(() => { vi.unstubAllGlobals() })

describe('límites de la proyección del mapa', () => {
  it('no intenta descargar los polos ni genera coordenadas infinitas', () => {
    expect(tilesAround([[90, 0], [-90, 0]], 250, 14, 19)).toEqual([])
    expect(Number.isFinite(lat2y(90, 19))).toBe(true)
    expect(Number.isFinite(lat2y(-90, 19))).toBe(true)
  })
  it('mantiene las teselas dentro de los límites del mundo', () => {
    const result = tilesAround([[85.051, 180], [-85.051, -180]], 250, 14, 14)
    expect(result.length).toBeGreaterThan(0)
    expect(result.every((t) => t.x >= 0 && t.y >= 0 && t.x < 2 ** t.z && t.y < 2 ** t.z)).toBe(true)
  })
})

describe('mapas con caché bloqueada', () => {
  it('muestra el mapa en línea aunque no pueda abrir su caché', async () => {
    vi.stubGlobal('navigator', { onLine: true })
    vi.stubGlobal('caches', { open: vi.fn().mockRejectedValue(new Error('bloqueada')) })
    const fetch = vi.fn().mockResolvedValue(image())
    vi.stubGlobal('fetch', fetch)
    const blob = await getTile('https://example.test/tile')
    expect(blob?.type).toBe('image/jpeg')
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('no interpreta como imagen la respuesta XML de error del proveedor', async () => {
    vi.stubGlobal('navigator', { onLine: true })
    vi.stubGlobal('caches', undefined)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<error/>', { headers: { 'Content-Type': 'application/xml' } })))
    expect(await getTile('https://example.test/tile')).toBeNull()
  })

  it('lee imágenes ya guardadas sin conexión y no intenta descargarlas', async () => {
    vi.stubGlobal('navigator', { onLine: false })
    vi.stubGlobal('caches', { open: vi.fn().mockResolvedValue({ match: vi.fn().mockResolvedValue(image()) }) })
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    expect((await getTile('https://example.test/tile'))?.size).toBeGreaterThan(0)
    expect(fetch).not.toHaveBeenCalled()
  })
})

describe('estado de las descargas', () => {
  it('sale del estado descargando si no se puede abrir la caché y permite reintentar', async () => {
    vi.stubGlobal('caches', { open: vi.fn().mockRejectedValue(new Error('sin espacio')) })
    expect((await descargar('fallo', 'Prueba', tiles)).estado).toBe('error')
    expect(descargaActual()?.estado).toBe('error')
    const c = cache()
    vi.stubGlobal('caches', { open: vi.fn().mockResolvedValue(c) })
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => image()))
    expect(await descargar('reintento', 'Prueba', tiles)).toMatchObject({ estado: 'terminada', hechas: 2, fallos: 0 })
  })

  it('cuenta las imágenes fallidas y reutiliza las que ya están guardadas', async () => {
    const c = cache()
    c.match.mockImplementation(async (url: string) => url === CAPAS.satelite.url(14, 1, 2) ? image() : undefined)
    vi.stubGlobal('caches', { open: vi.fn().mockResolvedValue(c) })
    const fetch = vi.fn().mockResolvedValue(new Response('no existe', { status: 404 }))
    vi.stubGlobal('fetch', fetch)
    expect(await descargar('parcial', 'Prueba', tiles)).toMatchObject({ estado: 'terminada', hechas: 1, fallos: 1, total: 2 })
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('no permite dos descargas y cancela antes de pedir nuevas imágenes', async () => {
    let finish!: (value: Response) => void
    const fetch = vi.fn().mockImplementation(() => new Promise<Response>((resolve) => { finish = resolve }))
    vi.stubGlobal('fetch', fetch)
    vi.stubGlobal('caches', { open: vi.fn().mockResolvedValue(cache()) })
    const pending = descargar('cancelar', 'Prueba', tiles, 'satelite', 1)
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1))
    await expect(descargar('otra', 'Otra', tiles)).rejects.toThrow('en marcha')
    cancelarDescarga()
    finish(image())
    expect((await pending).estado).toBe('cancelada')
    expect(fetch).toHaveBeenCalledTimes(1)
  })
})
