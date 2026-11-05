import 'fake-indexeddb/auto'
import Dexie from 'dexie'
import { describe, expect, it } from 'vitest'
import { AnjamapDB, deleteBancal, exportBackup, importBackup, validateBackup, type Bancal } from './db'

const fresh = () => new AnjamapDB(`photos-${Math.random()}`)
const bancal = (id: string): Bancal => ({ id, nombre: id, lat: 39, lon: -0.7, precision: null, color: '#000', creado: 1, actualizado: 1 })
const image = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aZeoAAAAASUVORK5CYII='

describe('bancales con fotos', () => {
  it('exporta, envía e importa las imágenes en otro dispositivo', async () => {
    const a = fresh(), b = fresh()
    await a.bancales.add({ ...bancal('b1'), olivos: 40, variedad: 'antigua' })
    await a.fotos.add({ id: 'f1', bancalId: 'b1', nombre: 'Entrada', dataUrl: image, creado: 1 })
    const backup = validateBackup(JSON.parse(JSON.stringify(await exportBackup(a))))
    expect(backup.version).toBe(3)
    expect(backup.bancales[0].olivos).toBeUndefined()
    expect(backup.bancales[0].variedad).toBeUndefined()
    await importBackup(backup, 'fusionar', b)
    expect((await b.fotos.get('f1'))?.dataUrl).toBe(image)
    await importBackup(backup, 'fusionar', b)
    expect(await b.fotos.count()).toBe(1)
    expect(await b.bancales.count()).toBe(1)
    await a.delete(); await b.delete()
  })
  it('exporta solo los bancales seleccionados, sus fotos y sus rutas', async () => {
    const a = fresh()
    await a.bancales.bulkAdd([bancal('b1'), bancal('b2')])
    await a.fotos.bulkAdd(['b1', 'b2'].map((id) => ({ id: `f-${id}`, bancalId: id, nombre: 'Foto', dataUrl: image, creado: 1 })))
    await a.rutas.bulkAdd(['b1', 'b2'].map((id) => ({ id: `r-${id}`, bancalId: id, nombre: 'Ruta', puntos: [[39, -0.7], [39.001, -0.7]], origen: 'dibujado' as const, creado: 1 })))
    const backup = await exportBackup(a, ['b2'])
    expect(backup.bancales.map((b) => b.id)).toEqual(['b2'])
    expect(backup.fotos?.map((f) => f.bancalId)).toEqual(['b2'])
    expect(backup.rutas.map((r) => r.bancalId)).toEqual(['b2'])
    expect(backup.caminos).toEqual([])
    await a.delete()
  })
  it('rechaza fotos huérfanas o SVG antes de borrar datos', async () => {
    const a = fresh()
    await a.bancales.add(bancal('b1'))
    const data = await exportBackup(a)
    for (const photo of [
      { id: 'f1', bancalId: 'borrado', nombre: 'Foto', dataUrl: image, creado: 1 },
      { id: 'f1', bancalId: 'b1', nombre: 'Foto', dataUrl: 'data:image/svg+xml;base64,PHN2Zz4=', creado: 1 },
    ]) await expect(importBackup({ ...data, fotos: [photo] }, 'reemplazar', a)).rejects.toThrow()
    expect(await a.bancales.count()).toBe(1)
    await a.delete()
  })
  it('borra las fotos junto con su bancal', async () => {
    const a = fresh()
    await a.bancales.add(bancal('b1'))
    await a.fotos.add({ id: 'f1', bancalId: 'b1', nombre: 'Foto', dataUrl: image, creado: 1 })
    await deleteBancal('b1', a)
    expect(await a.fotos.count()).toBe(0)
    await a.delete()
  })
  it('actualiza una instalación antigua sin perder bancales', async () => {
    const name = `upgrade-${Math.random()}`
    const old = new Dexie(name)
    old.version(1).stores({ bancales: 'id, finca, creado', caminos: 'id, creado', rutas: 'id, bancalId, creado', zonas: 'id', ajustes: 'clave' })
    old.version(2).stores({ diario: 'id, bancalId, fecha' })
    await old.table('bancales').add(bancal('b1')); old.close()
    const current = new AnjamapDB(name)
    expect((await current.bancales.get('b1'))?.nombre).toBe('b1')
    expect(await current.fotos.count()).toBe(0)
    await current.delete()
  })
})
