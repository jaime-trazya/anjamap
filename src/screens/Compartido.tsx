import { useMemo } from 'react'
import { MapPinCheck, Navigation } from 'lucide-react'
import { MapView } from '../map/MapView'
import { db, uid } from '../db/db'
import { COLORES } from '../domain/constants'
import { distance, formatCoord, formatDistance, isLatLon, type LatLon } from '../lib/geo'
import { useData } from '../ui/useData'
import { usePosition } from '../ui/position'
import { navigate, routeParams } from '../ui/router'
import { useToast } from '../ui/toast'
import { irAPunto } from '../ui/destino'
import { BackBar, Empty } from '../ui/components'
import { useAction } from '../ui/useAction'
import { autoDetalle } from '../ui/offline'

/** Abre un bancal que te han pasado por enlace y ofrece guardarlo */
export function Compartido({ route }: { route: string }) {
  const { bancales, settings } = useData()
  const { fix } = usePosition()
  const toast = useToast()
  const { busy, run } = useAction()
  const q = routeParams(route)
  const lat = Number(q.get('lat'))
  const lon = Number(q.get('lon'))
  const ok = !!q.get('lat')?.trim() && !!q.get('lon')?.trim() && isLatLon([lat, lon])
  const nombre = (q.get('n') ?? '').slice(0, 80) || 'Bancal compartido'
  const finca = (q.get('f') ?? '').slice(0, 80) || undefined
  const colorQ = q.get('c') ?? ''
  const color = COLORES.some((c) => c.color === colorQ) ? colorQ : COLORES[0].color
  const yaEsta = useMemo(() => (ok ? bancales.find((b) => distance([b.lat, b.lon], [lat, lon]) < 5) : undefined), [bancales, ok, lat, lon])

  if (!ok) {
    return (
      <main className="screen sub">
        <BackBar label="Mapa" fallback="/" />
        <Empty title="Enlace no válido">Pide que te lo vuelvan a enviar.</Empty>
      </main>
    )
  }
  const p: LatLon = [lat, lon]

  const guardar = async () => {
    const now = Date.now()
    const id = uid()
    await db.bancales.add({ id, nombre, finca, lat, lon, precision: null, color, creado: now, actualizado: now })
    if (settings.autoDetalle) autoDetalle({ lat, lon })
    toast.show(`«${nombre}» guardado en tus bancales`)
    navigate(`/bancal/${id}`, true)
  }

  return (
    <main className="screen sub">
      <BackBar label="Mapa" fallback="/" />
      <div>
        <div className="eyebrow">Te han pasado un bancal</div>
        <h1 className="title">{nombre}</h1>
        {finca && <div className="title-sub">{finca}</div>}
      </div>
      <section className="card flush">
        <div className="map-mini">
          <MapView
            capa={settings.capa}
            bancales={[{ id: 'compartido', nombre, finca, lat, lon, precision: null, color, creado: 0, actualizado: 0 }]}
            selectedId="compartido"
            user={fix}
            initial={{ center: p, zoom: 17 }}
          />
        </div>
      </section>
      <p className="meta num">
        {formatCoord(p)}
        {fix ? ` · a ${formatDistance(distance(fix.p, p))} de ti` : ''}
      </p>
      {yaEsta ? (
        <button className="btn primary block big" onClick={() => navigate(`/bancal/${yaEsta.id}`, true)}>
          <MapPinCheck size={20} /> Ya lo tienes: «{yaEsta.nombre}»
        </button>
      ) : (
        <button className="btn primary block big" disabled={busy} onClick={() => void run(guardar)}>
          <MapPinCheck size={20} /> Guardar en mis bancales
        </button>
      )}
      <button className="go-btn" onClick={() => navigate(irAPunto(p, nombre), true)}>
        <span className="go-icon">
          <Navigation size={24} />
        </span>
        <div className="grow">
          <strong>Ir ahora</strong>
          <span>Sin guardarlo</span>
        </div>
      </button>
    </main>
  )
}
