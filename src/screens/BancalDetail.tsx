import { useMemo } from 'react'
import { Car, ChevronRight, Copy, Footprints, Move, Navigation, PenLine, Pencil, Route as RouteIcon } from 'lucide-react'
import { MapView } from '../map/MapView'
import { bearing, cardinal, distance, formatCoord, formatDistance, pathLength, walkMinutes, type LatLon } from '../lib/geo'
import { recommend } from '../domain/graph'
import { useData } from '../ui/useData'
import { usePosition } from '../ui/position'
import { useEditor } from '../ui/editor'
import { navigate } from '../ui/router'
import { useToast } from '../ui/toast'
import { BackBar, Empty } from '../ui/components'

export function BancalDetail({ id }: { id: string }) {
  const { bancales, rutas, caminos, settings, graph } = useData()
  const { fix } = usePosition()
  const editor = useEditor()
  const toast = useToast()
  const b = bancales.find((x) => x.id === id)
  const propias = rutas.filter((r) => r.bancalId === id)
  const dest: LatLon | null = b ? [b.lat, b.lon] : null
  const rec = useMemo(() => (fix && dest ? recommend(graph, fix.p, dest) : null), [graph, fix, dest?.[0], dest?.[1]]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!b || !dest) {
    return (
      <main className="screen sub">
        <BackBar label="Bancales" fallback="/bancales" />
        <Empty title="Este bancal ya no existe" />
      </main>
    )
  }

  const fitPts: LatLon[] = [dest, ...propias.flatMap((r) => [r.puntos[0]])]
  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(formatCoord(dest))
      toast.show('Coordenadas copiadas')
    } catch {
      toast.show(formatCoord(dest))
    }
  }

  return (
    <main className="screen sub">
      <BackBar
        label="Bancales"
        fallback="/bancales"
        right={
          <button className="btn ghost" onClick={() => editor.openBancal(b.id)}>
            <Pencil size={16} /> Editar
          </button>
        }
      />
      <div>
        <h1 className="title">{b.nombre}</h1>
        <div className="title-sub">{[b.finca, b.precision !== null ? `GPS ±${b.precision} m` : 'Marcado en el mapa'].filter(Boolean).join(' · ')}</div>
      </div>

      <section className="card flush">
        <div className="map-mini">
          <MapView capa={settings.capa} bancales={[b]} caminos={caminos} rutas={propias} route={rec?.kind === 'caminos' ? rec.points : null} user={fix} selectedId={b.id} fit={fitPts} fitKey={b.id} initial={{ center: dest, zoom: 17 }} />
        </div>
        <div className="kpis">
          <div className="kpi">
            <div className="card-label">Distancia</div>
            <div className="big-num">{fix ? formatDistance(distance(fix.p, dest)) : '—'}</div>
            <div className="meta">{fix ? `en línea recta, al ${cardinal(bearing(fix.p, dest))}` : 'Esperando al GPS'}</div>
          </div>
          <div className="kpi">
            <div className="card-label">Andando</div>
            <div className="big-num">{rec ? `${walkMinutes(rec.length)} min` : '—'}</div>
            <div className="meta">{rec ? (rec.kind === 'caminos' ? `${formatDistance(rec.length)} por caminos` : 'campo a través') : ' '}</div>
          </div>
        </div>
      </section>

      <button className="btn accent block big" onClick={() => navigate(`/ir/${b.id}`)}>
        <Navigation size={20} /> Ir al bancal
      </button>

      <div className="actions three">
        <a className="action" href={`https://www.google.com/maps/dir/?api=1&destination=${b.lat},${b.lon}&travelmode=driving`} target="_blank" rel="noreferrer">
          <Car size={22} />
          En coche
        </a>
        <button className="action" onClick={() => navigate(`/dibujar?tipo=mover&bancal=${b.id}`)}>
          <Move size={22} />
          Mover punto
        </button>
        <button className="action" onClick={() => void copiar()}>
          <Copy size={22} />
          Coordenadas
        </button>
      </div>

      {b.nota && (
        <section className="card">
          <div className="card-label" style={{ marginBottom: 4 }}>Nota</div>
          <p style={{ whiteSpace: 'pre-wrap' }}>{b.nota}</p>
        </section>
      )}

      <div className="section-head">
        <h2 className="section-title">Rutas a este bancal</h2>
      </div>
      <section className="card flush list">
        {propias.map((r) => (
          <a key={r.id} className="list-item tap" href={`#/ruta/${r.id}`}>
            <span className="tile sm" style={{ '--c': b.color } as React.CSSProperties}>
              <RouteIcon size={16} />
            </span>
            <div className="grow">
              <div className="primary-line ellipsis">{r.nombre}</div>
              <div className="secondary-line">
                {formatDistance(pathLength(r.puntos))} · {r.origen === 'grabado' ? 'grabada andando' : r.origen === 'gpx' ? 'importada' : 'dibujada'}
              </div>
            </div>
            <button
              className="btn small"
              onClick={(e) => {
                e.preventDefault()
                navigate(`/ir/${b.id}?ruta=${r.id}`)
              }}
            >
              Seguir
            </button>
          </a>
        ))}
        {!propias.length && (
          <div className="list-item">
            <p className="small muted">Guarda el camino que sueles hacer para llegar. Al navegar podrás elegirlo en vez de la ruta recomendada.</p>
          </div>
        )}
        <button className="list-item" onClick={() => navigate(`/grabar?tipo=ruta&bancal=${b.id}`)}>
          <span className="tile sm none">
            <Footprints size={16} />
          </span>
          <div className="grow primary-line">Grabar ruta andando</div>
          <ChevronRight size={18} className="chev" />
        </button>
        <button className="list-item" onClick={() => navigate(`/dibujar?tipo=ruta&bancal=${b.id}`)}>
          <span className="tile sm none">
            <PenLine size={16} />
          </span>
          <div className="grow primary-line">Dibujar ruta en el mapa</div>
          <ChevronRight size={18} className="chev" />
        </button>
      </section>
      <p className="meta" style={{ padding: '0 4px' }}>
        {formatCoord(dest)}
      </p>
    </main>
  )
}
