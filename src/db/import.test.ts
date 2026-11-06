import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { AnjamapDB, deleteBancal, importBackup, restoreBancal, type Bancal } from './db'
import { gpxABackup } from '../domain/transfer'

const fresh = () => new AnjamapDB(`import-${Math.random()}`)
const gpx = { waypoints: [{ name: 'Caseta', point: [39.1, -0.69] as [number, number] }], tracks: [{ name: 'Senda', points: [[39.1, -0.69], [39.101, -0.69]] as [number, number][] }] }
const bancal = (id: string, nombre: string, lat = 39.1): Bancal => ({ id, nombre, lat, lon: -0.69, precision: null, color: '#000', creado: 1, actualizado: 1 })

describe('importar sin duplicar', () => {
  it('el mismo GPX dos veces deja un solo sitio y un solo camino', async () => {
    const d = fresh()
    await importBackup(gpxABackup(gpx), 'fusionar', d)
    const second = await importBackup(gpxABackup(gpx), 'fusionar', d)
    expect(await d.bancales.count()).toBe(1)
    expect(await d.caminos.count()).toBe(1)
    expect(second.repetidos).toBe(1)
  })

  it('no pisa los cambios hechos a un sitio que vino de un GPX', async () => {
    const d = fresh()
    await importBackup(gpxABackup(gpx), 'fusionar', d)
    const [b] = await d.bancales.toArray()
    await d.bancales.update(b.id, { favorito: true })
    await importBackup(gpxABackup(gpx), 'fusionar', d)
    expect((await d.bancales.get(b.id))?.favorito).toBe(true)
  })

  it('salta un sitio igual con otro id y le pasa sus rutas', async () => {
    const d = fresh()
    await d.bancales.add(bancal('mio', 'Caseta'))
    const r = await importBackup({ app: 'anjamap', version: 3, fecha: new Date().toISOString(), bancales: [bancal('otro', 'caseta '), bancal('lejos', 'Caseta', 39.2)], caminos: [], rutas: [{ id: 'r1', nombre: 'Acceso', bancalId: 'otro', puntos: [[39.1, -0.69], [39.1001, -0.69]], origen: 'grabado', creado: 1 }], fotos: [] }, 'fusionar', d)
    expect(r.repetidos).toBe(1)
    expect((await d.bancales.toArray()).map((b) => b.id).sort()).toEqual(['lejos', 'mio'])
    expect((await d.rutas.get('r1'))?.bancalId).toBe('mio')
  })
})

describe('deshacer', () => {
  it('recupera un sitio borrado con sus rutas', async () => {
    const d = fresh()
    await d.bancales.add(bancal('b1', 'Huerto'))
    await d.rutas.add({ id: 'r1', nombre: 'Acceso', bancalId: 'b1', puntos: [[39.1, -0.69], [39.1001, -0.69]], origen: 'grabado', creado: 1 })
    const borrado = await deleteBancal('b1', d)
    expect(await d.bancales.count()).toBe(0)
    await restoreBancal(borrado!, d)
    expect(await d.bancales.get('b1')).toBeTruthy()
    expect(await d.rutas.get('r1')).toBeTruthy()
  })
})
