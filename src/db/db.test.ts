import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { AnjamapDB, addRuta, deleteBancal, exportBackup, importBackup, loadSettings, setSetting, validateBackup } from './db'

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
})
