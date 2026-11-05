import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { AnjamapDB, addRuta, campana, campanaLabel, deleteBancal, exportBackup, importBackup, loadSettings, saveApunte, setSetting, validateBackup, type Backup } from './db'

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

  it('acepta el diario antiguo pero las nuevas copias solo exportan lugares', async () => {
    const a = fresh()
    await a.bancales.add({ id: 'b1', nombre: 'A', lat: 39, lon: -0.7, precision: null, color: '#000', olivos: 40, creado: 1, actualizado: 1 })
    await saveApunte({ bancalId: 'b1', tipo: 'recoleccion', fecha: new Date(2026, 10, 5, 12).getTime(), kg: 350 }, a)
    const copia = validateBackup({ ...await exportBackup(a), version: 2, diario: await a.diario.toArray() })
    expect((await exportBackup(a)).diario).toBeUndefined()
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

const validBackup = (): Backup => ({
  app: 'anjamap', version: 2, fecha: '2026-11-05T12:00:00.000Z',
  bancales: [{ id: 'b1', nombre: 'Prueba', lat: 39, lon: -0.7, precision: null, color: '#6b7f1f', creado: 1, actualizado: 1 }],
  caminos: [{ id: 'c1', nombre: 'Senda', tipo: 'senda', puntos: [[39, -0.7], [39.001, -0.7]], origen: 'gpx', creado: 1 }],
  rutas: [{ id: 'r1', nombre: 'Ruta', bancalId: 'b1', puntos: [[39, -0.7], [39.001, -0.7]], origen: 'grabado', creado: 1 }],
  diario: [{ id: 'a1', bancalId: 'b1', tipo: 'recoleccion', fecha: 1, kg: 12.5, creado: 1 }],
})

describe('restauración segura', () => {
  it.each([
    ['versión futura', (b: Backup) => ({ ...b, version: 999 })],
    ['fecha inválida', (b: Backup) => ({ ...b, fecha: 'incorrecta' })],
    ['fila nula', (b: Backup) => ({ ...b, bancales: [null] })],
    ['identificador vacío', (b: Backup) => ({ ...b, bancales: [{ ...b.bancales[0], id: '' }] })],
    ['identificadores repetidos', (b: Backup) => ({ ...b, bancales: [...b.bancales, ...b.bancales] })],
    ['latitud como texto', (b: Backup) => ({ ...b, bancales: [{ ...b.bancales[0], lat: '39' }] })],
    ['coordenada nula', (b: Backup) => ({ ...b, bancales: [{ ...b.bancales[0], lon: null }] })],
    ['coordenada fuera del mundo', (b: Backup) => ({ ...b, bancales: [{ ...b.bancales[0], lat: 91 }] })],
    ['nombre ausente', (b: Backup) => ({ ...b, bancales: [{ ...b.bancales[0], nombre: undefined }] })],
    ['olivos no numéricos', (b: Backup) => ({ ...b, bancales: [{ ...b.bancales[0], olivos: '40' }] })],
    ['color inválido', (b: Backup) => ({ ...b, bancales: [{ ...b.bancales[0], color: 'red; display:none' }] })],
    ['camino vacío', (b: Backup) => ({ ...b, caminos: [{ ...b.caminos[0], puntos: [] }] })],
    ['puntos fuera del mundo', (b: Backup) => ({ ...b, caminos: [{ ...b.caminos[0], puntos: [[39, 181], [39, 0]] }] })],
    ['tipo de camino desconocido', (b: Backup) => ({ ...b, caminos: [{ ...b.caminos[0], tipo: 'otro' }] })],
    ['ruta huérfana', (b: Backup) => ({ ...b, rutas: [{ ...b.rutas[0], bancalId: 'borrado' }] })],
    ['apunte huérfano', (b: Backup) => ({ ...b, diario: [{ ...b.diario![0], bancalId: 'borrado' }] })],
    ['tipo de apunte desconocido', (b: Backup) => ({ ...b, diario: [{ ...b.diario![0], tipo: 'desconocido' }] })],
    ['kilos negativos', (b: Backup) => ({ ...b, diario: [{ ...b.diario![0], kg: -3 }] })],
    ['kilos no numéricos', (b: Backup) => ({ ...b, diario: [{ ...b.diario![0], kg: '3' }] })],
  ])('rechaza %s antes de reemplazar los datos', async (_name, corrupt) => {
    const d = fresh()
    await importBackup(validBackup(), 'fusionar', d)
    const before = await exportBackup(d)
    await expect(importBackup(corrupt(validBackup()) as Backup, 'reemplazar', d)).rejects.toThrow()
    const after = await exportBackup(d)
    expect(after.bancales).toEqual(before.bancales)
    expect(after.caminos).toEqual(before.caminos)
    expect(after.rutas).toEqual(before.rutas)
    expect(after.diario).toEqual(before.diario)
    await d.delete()
  })

  it('no guarda un apunte con kilos inválidos ni un bancal borrado', async () => {
    const d = fresh()
    await importBackup(validBackup(), 'fusionar', d)
    await expect(saveApunte({ bancalId: 'b1', tipo: 'recoleccion', fecha: 1, kg: NaN }, d)).rejects.toThrow()
    await expect(saveApunte({ bancalId: 'borrado', tipo: 'visita', fecha: 1 }, d)).rejects.toThrow('ya no existe')
    expect(await d.diario.count()).toBe(1)
    await d.delete()
  })
})
