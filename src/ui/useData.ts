import { createContext, useContext } from 'react'
import type { Bancal, Camino, Marca, Ruta, Settings } from '../db/db'
import type { OsmState } from './osm'

export interface DataValue {
  ready: boolean
  bancales: Bancal[]
  caminos: Camino[]
  rutas: Ruta[]
  /** Pasos cerrados y referencias propias */
  marcas: Marca[]
  settings: Settings
  osm: OsmState
}

export const DataCtx = createContext<DataValue | null>(null)

export function useData(): DataValue {
  const v = useContext(DataCtx)
  if (!v) throw new Error('useData fuera de DataProvider')
  return v
}
