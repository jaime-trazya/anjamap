import { useMemo, type ReactNode } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, DEFAULT_SETTINGS, type Settings } from '../db/db'
import { DataCtx, type DataValue } from './useData'
import { useOsm } from './osm'

export function DataProvider({ children }: { children: ReactNode }) {
  const bancales = useLiveQuery(() => db.bancales.toArray())
  const caminos = useLiveQuery(() => db.caminos.toArray())
  const rutas = useLiveQuery(() => db.rutas.toArray())
  const diario = useLiveQuery(() => db.diario.orderBy('fecha').reverse().toArray())
  const ajustes = useLiveQuery(() => db.ajustes.toArray())

  const settings = useMemo<Settings>(() => {
    const s: Record<string, unknown> = { ...DEFAULT_SETTINGS }
    for (const r of ajustes ?? []) if (r.clave in DEFAULT_SETTINGS) s[r.clave] = r.valor
    return s as unknown as Settings
  }, [ajustes])

  const osm = useOsm(!!ajustes && settings.caminosOsm)

  const value = useMemo<DataValue>(
    () => ({
      ready: !!(bancales && caminos && rutas && ajustes && diario),
      bancales: [...(bancales ?? [])].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es', { numeric: true })),
      caminos: caminos ?? [],
      rutas: rutas ?? [],
      diario: diario ?? [],
      settings,
      osm,
    }),
    [bancales, caminos, rutas, diario, ajustes, settings, osm],
  )
  return <DataCtx.Provider value={value}>{children}</DataCtx.Provider>
}
