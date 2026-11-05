import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { AnjamapDB, addRuta, campana, campanaLabel, deleteBancal, exportBackup, importBackup, loadSettings, saveApunte, setSetting, validateBackup } from './db'

const fresh = () => new AnjamapDB(`test-${Math.random()}`)

describe('base de datos', () => {
  it('ajustes por defecto y guardados', async () => {
    const d = fresh()
    expect((await loadSettings(d)).capa).toBe('satelite')
    await setSetting('capa', 'mapa', d)
    expect((await loadSettings(d)).capa).toBe('mapa')
  })

  it('borrar un bancal borra sus rutas', async () => {
    const d = fresh()
    await d.bancales.add({ id: 'b1', nombre: 'A', lat: 39, lon: -0.7, precision: 5, color: '#000', creado: 1, actualizado: 1 })
    await addRuta({ nombre: 'r', bancalId: 'b1', puntos: [[39, -0.7], [39.001, -0.7]], origen: 'dibujado' }, d)
    await deleteBancal('b1', d)
    expect(await d.rutas.count()).toBe(0)
  })

  it('copia de seguridad ida y vuelta', async () => {
    const a = fresh()
    await a.bancales.add({ id: 'b1', nombre: 'A', lat: 39, lon: -0.7, precision: null, color: '#000', creado: 1, actualizado: 1 })
    await a.caminos.add({ id: 'c1', nombre: 'Pista', tipo: 'pista', puntos: [[39, -0.7], [39.01, -0.7]], origen: 'gpx', creado: 1 })
    const copia = validateBackup(JSON.parse(JSON.stringify(await exportBackup(a))))
    const b = fresh()
    await b.bancales.add({ id: 'otro', nombre: 'B', lat: 39, lon: -0.7, precision: null, color: '#000', creado: 1, actualizado: 1 })
    await importBackup(copia, 'fusionar', b)
    expect(await b.bancales.count()).toBe(2)
    await importBackup(copia, 'reemplazar', b)
    expect(await b.bancales.count()).toBe(1)
    expect(await b.caminos.count()).toBe(1)
  })

  it('rechaza archivos que no son copias', () => {
    expect(() => validateBackup({ app: 'claudio' })).toThrow()
    expect(() => validateBackup({ app: 'anjamap', bancales: [{ id: 'x' }], caminos: [], rutas: [] })).toThrow()
  })

  it('el diario viaja en la copia y se borra con su bancal', async () => {
    const a = fresh()
    await a.bancales.add({ id: 'b1', nombre: 'A', lat: 39, lon: -0.7, precision: null, color: '#000', olivos: 40, creado: 1, actualizado: 1 })
    await saveApunte({ bancalId: 'b1', tipo: 'recoleccion', fecha: new Date(2026, 10, 5, 12).getTime(), kg: 350 }, a)
    const copia = validateBackup(JSON.parse(JSON.stringify(await exportBackup(a))))
    expect(copia.diario).toHaveLength(1)
    const b = fresh()
    await importBackup(copia, 'reemplazar', b)
    expect((await b.diario.toArray())[0].kg).toBe(350)
    await deleteBancal('b1', b)
    expect(await b.diario.count()).toBe(0)
  })

  it('acepta copias antiguas sin diario', async () => {
    const v1 = { app: 'anjamap', version: 1, fecha: '2026-10-01', bancales: [{ id: 'b1', nombre: 'A', lat: 39, lon: -0.7, precision: null, color: '#000', creado: 1, actualizado: 1 }], caminos: [], rutas: [] }
    const copia = validateBackup(v1)
    expect(copia.diario).toEqual([])
    const d = fresh()
    await importBackup(copia, 'fusionar', d)
    expect(await d.bancales.count()).toBe(1)
  })

  it('las campañas van de septiembre a agosto', () => {
    expect(campana(new Date(2026, 8, 1).getTime())).toBe(2026)
    expect(campana(new Date(2027, 1, 15).getTime())).toBe(2026)
    expect(campana(new Date(2026, 7, 31).getTime())).toBe(2025)
    expect(campanaLabel(2026)).toBe('26/27')
  })
})
