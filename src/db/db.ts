import Dexie, { type Table } from 'dexie'
import type { LatLon } from '../lib/geo'

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

export interface Zona {
  id: string
  nombre: string
  total: number
  guardadas: number
  fecha: number
}

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

  constructor(name = DB_NAME) {
    super(name)
    this.version(1).stores({
      bancales: 'id, finca, creado',
      caminos: 'id, creado',
      rutas: 'id, bancalId, creado',
      zonas: 'id',
      ajustes: 'clave',
    })
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
}

export const DEFAULT_SETTINGS: Settings = {
  tema: 'sistema',
  capa: 'satelite',
  autoDetalle: true,
  installHintSeen: false,
  vista: null,
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
  version: 1
  fecha: string
  bancales: Bancal[]
  caminos: Camino[]
  rutas: Ruta[]
}

export async function exportBackup(database = db): Promise<Backup> {
  const [bancales, caminos, rutas] = await Promise.all([database.bancales.toArray(), database.caminos.toArray(), database.rutas.toArray()])
  return { app: 'anjamap', version: 1, fecha: new Date().toISOString(), bancales, caminos, rutas }
}

const isLatLon = (p: unknown): p is LatLon => Array.isArray(p) && p.length === 2 && p.every((v) => typeof v === 'number' && isFinite(v))

export function validateBackup(data: unknown): Backup {
  const b = data as Partial<Backup>
  if (!b || b.app !== 'anjamap' || !Array.isArray(b.bancales) || !Array.isArray(b.caminos) || !Array.isArray(b.rutas)) {
    throw new Error('El archivo no es una copia de Anjamap')
  }
  for (const x of b.bancales) if (typeof x.id !== 'string' || !isFinite(x.lat) || !isFinite(x.lon)) throw new Error('Copia dañada: bancal sin coordenadas')
  for (const x of [...b.caminos, ...b.rutas]) if (typeof x.id !== 'string' || !Array.isArray(x.puntos) || !x.puntos.every(isLatLon)) throw new Error('Copia dañada: camino sin puntos')
  return b as Backup
}

/** Restaura una copia. "fusionar" añade y actualiza; "reemplazar" borra lo actual primero. */
export async function importBackup(b: Backup, modo: 'fusionar' | 'reemplazar', database = db) {
  await database.transaction('rw', database.bancales, database.caminos, database.rutas, async () => {
    if (modo === 'reemplazar') await Promise.all([database.bancales.clear(), database.caminos.clear(), database.rutas.clear()])
    await database.bancales.bulkPut(b.bancales)
    await database.caminos.bulkPut(b.caminos)
    await database.rutas.bulkPut(b.rutas)
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

/** Borra un bancal y sus rutas */
export async function deleteBancal(id: string, database = db) {
  await database.transaction('rw', database.bancales, database.rutas, async () => {
    await database.rutas.where('bancalId').equals(id).delete()
    await database.bancales.delete(id)
  })
}
