import { useMemo, type ReactNode } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, DEFAULT_SETTINGS, type Settings } from '../db/db'
import { buildGraph } from '../domain/graph'
import { DataCtx, type DataValue } from './useData'

export function DataProvider({ children }: { children: ReactNode }) {
  const bancales = useLiveQuery(() => db.bancales.toArray())
  const caminos = useLiveQuery(() => db.caminos.toArray())
  const rutas = useLiveQuery(() => db.rutas.toArray())
  const ajustes = useLiveQuery(() => db.ajustes.toArray())

  const settings = useMemo<Settings>(() => {
    const s: Record<string, unknown> = { ...DEFAULT_SETTINGS }
    for (const r of ajustes ?? []) if (r.clave in DEFAULT_SETTINGS) s[r.clave] = r.valor
    return s as unknown as Settings
  }, [ajustes])

  const graph = useMemo(() => buildGraph((caminos ?? []).map((c) => c.puntos)), [caminos])

  const value = useMemo<DataValue>(
    () => ({
      ready: !!(bancales && caminos && rutas && ajustes),
      bancales: [...(bancales ?? [])].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es', { numeric: true })),
      caminos: caminos ?? [],
      rutas: rutas ?? [],
      settings,
      graph,
    }),
    [bancales, caminos, rutas, ajustes, settings, graph],
  )
  return <DataCtx.Provider value={value}>{children}</DataCtx.Provider>
}
