import { createContext, useContext } from 'react'
import type { Bancal, Camino, Ruta, Settings } from '../db/db'
import type { Graph } from '../domain/graph'

export interface DataValue {
  ready: boolean
  bancales: Bancal[]
  caminos: Camino[]
  rutas: Ruta[]
  settings: Settings
  graph: Graph | null
}

export const DataCtx = createContext<DataValue | null>(null)

export function useData(): DataValue {
  const v = useContext(DataCtx)
  if (!v) throw new Error('useData fuera de DataProvider')
  return v
}
