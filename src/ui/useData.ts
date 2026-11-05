import { createContext, useContext } from 'react'
import type { Apunte, Bancal, Camino, Ruta, Settings } from '../db/db'
import type { OsmState } from './osm'

export interface DataValue {
  ready: boolean
  bancales: Bancal[]
  caminos: Camino[]
  rutas: Ruta[]
  /** Diario de todos los bancales, del más reciente al más antiguo */
  diario: Apunte[]
  settings: Settings
  osm: OsmState
}

export const DataCtx = createContext<DataValue | null>(null)

export function useData(): DataValue {
  const v = useContext(DataCtx)
  if (!v) throw new Error('useData fuera de DataProvider')
  return v
}
