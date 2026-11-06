import Dexie, { type Table } from 'dexie'
import { distance, isLatLon, type LatLon } from '../lib/geo'

export const DB_NAME = 'anjamap'

export interface Bancal {
  id: string
  nombre: string
  /** Finca o partida a la que pertenece (para agrupar) */
  finca?: string
  nota?: string
  lat: number
  lon: number
  /** Precisión del GPS al guardarlo (m); null si se marcó en el mapa */
  precision: number | null
  color: string
  /** Número de olivos */
  olivos?: number
  variedad?: string
  /** Puerta o entrada exacta: a pie se navega hasta aquí */
  acceso?: { lat: number; lon: number }
  /** Dónde dejar el coche: en coche se navega hasta aquí y se sigue andando */
  aparcamiento?: { lat: number; lon: number }
  /** Sitio habitual, a un toque desde el mapa */
  favorito?: boolean
  creado: number
  actualizado: number
}

export type TipoCamino = 'pista' | 'senda' | 'atajo'
export type Origen = 'grabado' | 'dibujado' | 'gpx'

export interface Camino {
  id: string
  nombre: string
  tipo: TipoCamino
  puntos: LatLon[]
  origen: Origen
  creado: number
}

/** Ruta predefinida hasta un bancal */
export interface Ruta {
  id: string
  nombre: string
  bancalId: string
  puntos: LatLon[]
  origen: Origen
  nota?: string
  creado: number
}

export type TipoApunte = 'poda' | 'tratamiento' | 'abono' | 'riego' | 'desbroce' | 'recoleccion' | 'visita' | 'otro'

/** Apunte del diario de un bancal */
export interface Apunte {
  id: string
  bancalId: string
  tipo: TipoApunte
  /** Día (ms, a mediodía local) */
  fecha: number
  /** Kilos recogidos (solo recolección) */
  kg?: number
  nota?: string
  creado: number
}

export interface Zona {
  id: string
  nombre: string
  total: number
  guardadas: number
  fecha: number
}

export interface Foto {
  id: string
  bancalId: string
  nombre: string
  /** Imagen reducida, lista para mostrar y transportar en una copia JSON. */
  dataUrl: string
  creado: number
}

export type Transporte = 'pie' | 'coche' | 'bici' | 'patinete'

export interface Ajuste {
  clave: string
  valor: unknown
}

/**
 * Base de datos local (IndexedDB).
 * Para cambiar el esquema: añadir this.version(n + 1) con su upgrade; nunca tocar una versión publicada.
 */
export class AnjamapDB extends Dexie {
  bancales!: Table<Bancal, string>
  caminos!: Table<Camino, string>
  rutas!: Table<Ruta, string>
  zonas!: Table<Zona, string>
  ajustes!: Table<Ajuste, string>
  diario!: Table<Apunte, string>
  fotos!: Table<Foto, string>

  constructor(name = DB_NAME) {
    super(name)
    this.version(1).stores({
      bancales: 'id, finca, creado',
      caminos: 'id, creado',
      rutas: 'id, bancalId, creado',
      zonas: 'id',
      ajustes: 'clave',
    })
    this.version(2).stores({ diario: 'id, bancalId, fecha' })
    // Se conserva la tabla antigua por compatibilidad; la app ya no usa el diario.
    this.version(3).stores({ fotos: 'id, bancalId, creado' })
  }
}

export const db = new AnjamapDB()

export const uid = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`)

/** Pide almacenamiento persistente para que el sistema no borre datos ni mapas */
export async function requestPersistence(): Promise<boolean> {
  try {
    if (!navigator.storage?.persist) return false
    if (await navigator.storage.persisted()) return true
    return await navigator.storage.persist()
  } catch {
    return false
  }
}

// ---------- Ajustes ----------

export interface Settings {
  tema: 'sistema' | 'claro' | 'oscuro'
  capa: 'satelite' | 'mapa'
  /** Descargar el detalle del satélite alrededor de cada bancal nuevo */
  autoDetalle: boolean
  installHintSeen: boolean
  /** Última vista del mapa */
  vista: { lat: number; lon: number; zoom: number } | null
  /** Usar las pistas y sendas de OpenStreetMap para recomendar rutas */
  caminosOsm: boolean
  /** Dónde se dejó el coche */
  coche: { lat: number; lon: number; t: number } | null
  transporte: Transporte
  evitarPeajes: boolean
  evitarAutopistas: boolean
  voz: boolean
  /** Al navegar, el mapa gira para que hacia donde vas quede arriba */
  mapaGira: boolean
  /** Últimos sitios a los que has navegado (ids de bancal, el más reciente primero) */
  recientes: string[]
  velocidadPatinete: number
  servidorRutas: string
}

export const DEFAULT_SETTINGS: Settings = {
  tema: 'sistema',
  capa: 'satelite',
  autoDetalle: true,
  installHintSeen: false,
  vista: null,
  caminosOsm: true,
  coche: null,
  transporte: 'pie',
  evitarPeajes: false,
  evitarAutopistas: false,
  voz: true,
  mapaGira: true,
  recientes: [],
  velocidadPatinete: 15,
  servidorRutas: 'https://valhalla1.openstreetmap.de',
}

export async function loadSettings(database = db): Promise<Settings> {
  const rows = await database.ajustes.toArray()
  const s: Record<string, unknown> = { ...DEFAULT_SETTINGS }
  for (const r of rows) if (r.clave in DEFAULT_SETTINGS) s[r.clave] = r.valor
  return s as unknown as Settings
}

export async function setSetting<K extends keyof Settings>(clave: K, valor: Settings[K], database = db) {
  await database.ajustes.put({ clave, valor })
}

// ---------- Copia de seguridad ----------

export interface Backup {
  app: 'anjamap'
  version: 1 | 2 | 3
  fecha: string
  bancales: Bancal[]
  caminos: Camino[]
  rutas: Ruta[]
  diario?: Apunte[]
  fotos?: Foto[]
}

export async function exportBackup(database = db, ids?: string[]): Promise<Backup> {
  return database.transaction('r', [database.bancales, database.caminos, database.rutas, database.fotos], async () => {
    const [all, caminos, allRutas, allFotos] = await Promise.all([database.bancales.toArray(), database.caminos.toArray(), database.rutas.toArray(), database.fotos.toArray()])
    const selected = ids ? new Set(ids) : null
    // Las nuevas copias contienen los datos del lugar, sin los antiguos campos agrícolas.
    const bancales = all.filter((b) => !selected || selected.has(b.id)).map(({ id, nombre, finca, nota, lat, lon, precision, color, acceso, aparcamiento, favorito, creado, actualizado }) => ({ id, nombre, finca, nota, lat, lon, precision, color, acceso, aparcamiento, favorito, creado, actualizado }))
    const included = new Set(bancales.map((b) => b.id))
    return { app: 'anjamap' as const, version: 3 as const, fecha: new Date().toISOString(), bancales, caminos: selected ? [] : caminos, rutas: allRutas.filter((r) => included.has(r.bancalId)), fotos: allFotos.filter((f) => included.has(f.bancalId)) }
  })
}

const record = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x)
const text = (x: unknown): x is string => typeof x === 'string' && x.trim().length > 0
const optionalText = (x: unknown) => x === undefined || typeof x === 'string'
const nonnegative = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x) && x >= 0
const timestamp = (x: unknown): x is number => nonnegative(x) && Number.isFinite(new Date(x).getTime())
const optionalPoint = (x: unknown) => x === undefined || (record(x) && isLatLon([x.lat, x.lon]))
const apunteTypes = new Set<TipoApunte>(['poda', 'tratamiento', 'abono', 'riego', 'desbroce', 'recoleccion', 'visita', 'otro'])

function validApunte(x: Record<string, unknown>): boolean {
  return text(x.bancalId) && apunteTypes.has(x.tipo as TipoApunte) && timestamp(x.fecha) && optionalText(x.nota) && (x.kg === undefined || nonnegative(x.kg))
}

export function validateBackup(data: unknown): Backup {
  if (!record(data) || data.app !== 'anjamap' || !Array.isArray(data.bancales) || !Array.isArray(data.caminos) || !Array.isArray(data.rutas)) {
    throw new Error('El archivo no es una copia de Anjamap')
  }
  if (data.version !== 1 && data.version !== 2 && data.version !== 3) throw new Error('Versión de copia no compatible')
  if (typeof data.fecha !== 'string' || !Number.isFinite(Date.parse(data.fecha))) throw new Error('Copia dañada: fecha no válida')
  if (data.diario !== undefined && !Array.isArray(data.diario)) throw new Error('Copia dañada: diario')
  const diario = data.diario ?? []
  if (data.fotos !== undefined && !Array.isArray(data.fotos)) throw new Error('Copia dañada: fotos')
  const fotos = data.fotos ?? []
  // Validar antes de abrir la transacción que puede reemplazar los datos actuales.
  for (const rows of [data.bancales, data.caminos, data.rutas, diario, fotos]) {
    const ids = new Set<string>()
    for (const x of rows) {
      if (!record(x) || !text(x.id) || ids.has(x.id)) throw new Error('Copia dañada: identificadores vacíos o repetidos')
      ids.add(x.id)
    }
  }
  for (const x of data.bancales) {
    if (!text(x.nombre) || !isLatLon([x.lat, x.lon]) || !timestamp(x.creado) || !timestamp(x.actualizado) ||
      !(x.precision === null || nonnegative(x.precision)) || typeof x.color !== 'string' || !/^#(?:[\da-f]{3}|[\da-f]{6})$/i.test(x.color) ||
      !optionalText(x.finca) || !optionalText(x.nota) || !optionalText(x.variedad) ||
      !optionalPoint(x.acceso) || !optionalPoint(x.aparcamiento) || !(x.favorito === undefined || typeof x.favorito === 'boolean') ||
      (x.olivos !== undefined && !(Number.isSafeInteger(x.olivos) && x.olivos >= 0))) throw new Error('Copia dañada: datos de bancal no válidos')
  }
  const bancales = new Set(data.bancales.map((x) => x.id))
  for (const x of [...data.caminos, ...data.rutas]) {
    if (!text(x.nombre) || !timestamp(x.creado) || !['grabado', 'dibujado', 'gpx'].includes(x.origen) ||
      !Array.isArray(x.puntos) || x.puntos.length < 2 || !x.puntos.every(isLatLon)) throw new Error('Copia dañada: camino o ruta sin puntos válidos')
  }
  for (const x of data.caminos) if (!['pista', 'senda', 'atajo'].includes(x.tipo)) throw new Error('Copia dañada: tipo de camino')
  for (const x of data.rutas) if (!bancales.has(x.bancalId) || !optionalText(x.nota)) throw new Error('Copia dañada: ruta sin bancal')
  for (const x of diario) if (!validApunte(x) || !timestamp(x.creado) || !bancales.has(x.bancalId)) throw new Error('Copia dañada: apunte no válido o sin bancal')
  for (const x of fotos) if (!bancales.has(x.bancalId) || !text(x.nombre) || !timestamp(x.creado) || typeof x.dataUrl !== 'string' || x.dataUrl.length > 5_000_000 || !/^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(x.dataUrl)) throw new Error('Copia dañada: foto no válida o sin bancal')
  return { ...data, diario, fotos } as unknown as Backup
}

const mismoNombre = (a: string, b: string) => a.trim().toLocaleLowerCase('es') === b.trim().toLocaleLowerCase('es')

/**
 * Restaura una copia. "fusionar" añade y actualiza; "reemplazar" borra lo actual primero.
 * Al fusionar no se duplican sitios: si ya tienes uno con el mismo nombre a menos de 5 m, se conserva el tuyo
 * (y sus rutas y fotos nuevas se le asignan). Lo que viene de un GPX y ya estaba importado no pisa tus cambios.
 * Devuelve cuántos sitios repetidos se han saltado.
 */
export async function importBackup(b: Backup, modo: 'fusionar' | 'reemplazar', database = db): Promise<{ repetidos: number }> {
  b = validateBackup(b)
  return database.transaction('rw', [database.bancales, database.caminos, database.rutas, database.diario, database.fotos], async () => {
    if (modo === 'reemplazar') await Promise.all([database.bancales.clear(), database.caminos.clear(), database.rutas.clear(), database.diario.clear(), database.fotos.clear()])
    let { bancales, caminos } = b
    const remap = new Map<string, string>()
    if (modo === 'fusionar') {
      const existentes = await database.bancales.toArray()
      const ids = new Set(existentes.map((e) => e.id))
      bancales = bancales.filter((x) => {
        if (x.id.startsWith('gpx-') && ids.has(x.id)) return false
        const dup = existentes.find((e) => e.id !== x.id && mismoNombre(e.nombre, x.nombre) && distance([e.lat, e.lon], [x.lat, x.lon]) < 5)
        if (dup) remap.set(x.id, dup.id)
        return !dup
      })
      const caminoIds = new Set((await database.caminos.toArray()).map((c) => c.id))
      caminos = caminos.filter((c) => !(c.id.startsWith('gpx-') && caminoIds.has(c.id)))
    }
    const fix = <T extends { bancalId: string }>(rows: T[]) => rows.map((r) => (remap.has(r.bancalId) ? { ...r, bancalId: remap.get(r.bancalId)! } : r))
    await database.bancales.bulkPut(bancales)
    await database.caminos.bulkPut(caminos)
    await database.rutas.bulkPut(fix(b.rutas))
    await database.diario.bulkPut(fix(b.diario ?? []))
    await database.fotos.bulkPut(fix(b.fotos ?? []))
    return { repetidos: b.bancales.length - bancales.length }
  })
}

export async function addCamino(c: Omit<Camino, 'id' | 'creado'>, database = db): Promise<string> {
  const id = uid()
  await database.caminos.add({ ...c, id, creado: Date.now() })
  return id
}

export async function addRuta(r: Omit<Ruta, 'id' | 'creado'>, database = db): Promise<string> {
  const id = uid()
  await database.rutas.add({ ...r, id, creado: Date.now() })
  return id
}

/** Lo que se borra con un bancal, para poder deshacerlo */
export interface Borrado {
  bancal: Bancal
  rutas: Ruta[]
  fotos: Foto[]
  diario: Apunte[]
}

/** Borra un bancal, sus rutas, fotos y diario. Devuelve lo borrado para poder deshacerlo. */
export async function deleteBancal(id: string, database = db): Promise<Borrado | null> {
  return database.transaction('rw', [database.bancales, database.rutas, database.diario, database.fotos], async () => {
    const bancal = await database.bancales.get(id)
    const [rutas, fotos, diario] = await Promise.all([database.rutas.where('bancalId').equals(id).toArray(), database.fotos.where('bancalId').equals(id).toArray(), database.diario.where('bancalId').equals(id).toArray()])
    await database.rutas.where('bancalId').equals(id).delete()
    await database.diario.where('bancalId').equals(id).delete()
    await database.fotos.where('bancalId').equals(id).delete()
    await database.bancales.delete(id)
    return bancal ? { bancal, rutas, fotos, diario } : null
  })
}

/** Deshace un borrado */
export async function restoreBancal(b: Borrado, database = db) {
  await database.transaction('rw', [database.bancales, database.rutas, database.diario, database.fotos], async () => {
    await database.bancales.put(b.bancal)
    await database.rutas.bulkPut(b.rutas)
    await database.fotos.bulkPut(b.fotos)
    await database.diario.bulkPut(b.diario)
  })
}

/** Crea o actualiza un apunte del diario */
export async function saveApunte(a: Omit<Apunte, 'id' | 'creado'> & { id?: string }, database = db): Promise<string> {
  if (!validApunte(a)) throw new Error('Revisa el bancal, la fecha y los kilos del apunte')
  const id = a.id ?? uid()
  await database.transaction('rw', database.bancales, database.diario, async () => {
    if (!(await database.bancales.get(a.bancalId))) throw new Error('El bancal ya no existe')
    const prev = a.id ? await database.diario.get(a.id) : undefined
    await database.diario.put({ ...a, id, creado: prev?.creado ?? Date.now() })
  })
  return id
}

/** Campaña de la aceituna: de septiembre a agosto. Devuelve el año en que empieza. */
export function campana(t: number): number {
  const d = new Date(t)
  return d.getMonth() >= 8 ? d.getFullYear() : d.getFullYear() - 1
}

/** "26/27" */
export const campanaLabel = (y: number) => `${String(y).slice(2)}/${String(y + 1).slice(2)}`
