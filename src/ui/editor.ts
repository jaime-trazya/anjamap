import { createContext, useContext } from 'react'
import type { LatLon } from '../lib/geo'

export interface NewBancalOpts {
  point?: LatLon
  precision?: number | null
  /** Capturar con el GPS al abrir */
  gps?: boolean
  nombre?: string
  finca?: string
  color?: string
}

export interface EditorApi {
  /** Abre el editor de un bancal existente o uno nuevo */
  openBancal(id?: string, opts?: NewBancalOpts): void
  /** Hoja de acciones "Añadir" */
  openAdd(): void
}

export const EditorCtx = createContext<EditorApi | null>(null)

export function useEditor(): EditorApi {
  const v = useContext(EditorCtx)
  if (!v) throw new Error('useEditor fuera de EditorCtx')
  return v
}
