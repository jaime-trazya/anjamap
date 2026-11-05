import { useMemo, useState } from 'react'
import { Car, ChevronLeft, ChevronRight, Copy, Footprints, Move, Navigation, PenLine, Pencil, Plus, Route as RouteIcon, Share2 } from 'lucide-react'
import { MapView } from '../map/MapView'
import { bearing, cardinal, distance, formatCoord, formatDistance, pathLength, walkMinutes, type LatLon } from '../lib/geo'
import { fechaCorta, hace, kg } from '../lib/fecha'
import { campana, campanaLabel } from '../db/db'
import { enlaceBancal } from '../ui/destino'
import { recommend } from '../domain/graph'
import { APUNTES, apunteLabel } from '../domain/constants'
import { useData } from '../ui/useData'
import { useGraph } from '../ui/graph'
import { usePosition } from '../ui/position'
import { useEditor } from '../ui/editor'
import { back, navigate } from '../ui/router'
import { useToast } from '../ui/toast'
import { BackBar, Empty, Stat } from '../ui/components'
import { ApunteIcon } from '../ui/icons'

export function BancalDetail({ id }: { id: string }) {
  const { bancales, rutas, caminos, diario, settings, osm } = useData()
  const { graph } = useGraph()
  const { fix } = usePosition()
  const editor = useEditor()
  const toast = useToast()
  const [campanaHoy] = useState(() => campana(Date.now()))
  const b = bancales.find((x) => x.id === id)
  const propias = rutas.filter((r) => r.bancalId === id)
  const apuntes = useMemo(() => diario.filter((a) => a.bancalId === id), [diario, id])
  const lat = b?.lat
  const lon = b?.lon
  const dest = useMemo<LatLon | null>(() => (lat !== undefined && lon !== undefined ? [lat, lon] : null), [lat, lon])
  const rec = useMemo(() => (fix && dest ? recommend(graph, fix.p, dest) : null), [graph, fix, dest])

  if (!b || !dest) {
    return (
      <main className="screen sub">
        <BackBar label="Bancales" fallback="/bancales" />
        <Empty title="Este bancal ya no existe" />
      </main>
    )
  }

  const fitPts: LatLon[] = [dest, ...propias.map((r) => r.puntos[0])]
  const copiar = async (texto: string, aviso: string) => {
    try {
      await navigator.clipboard.writeText(texto)
      toast.show(aviso)
    } catch {
      toast.show(texto)
    }
  }
  const compartir = async () => {
    const url = enlaceBancal(b)
    const text = `${b.nombre}${b.finca ? ` (${b.finca})` : ''}\nEn Anjamap: ${url}\nEn Google Maps: https://maps.google.com/?q=${b.lat.toFixed(6)},${b.lon.toFixed(6)}`
    if (navigator.share) {
      try {
        await navigator.share({ title: b.nombre, text })
      } catch {
        /* cancelado */
      }
    } else await copiar(text, 'Enlace copiado')
  }

  const actual = campanaHoy
  const kgCampana = apuntes.filter((a) => a.tipo === 'recoleccion' && campana(a.fecha) === actual).reduce((s, a) => s + (a.kg ?? 0), 0)
  const kgAnterior = apuntes.filter((a) => a.tipo === 'recoleccion' && campana(a.fecha) === actual - 1).reduce((s, a) => s + (a.kg ?? 0), 0)
  const ultimaPoda = apuntes.find((a) => a.tipo === 'poda')
  const ultimoTrat = apuntes.find((a) => a.tipo === 'tratamiento')
  const distRecta = fix ? distance(fix.p, dest) : null

  return (
    <main className="screen sub">
      <div className="map-hero">
        <MapView
          capa={settings.capa}
          bancales={[b]}
          caminos={caminos}
          rutas={propias}
          red={osm.net}
          route={rec?.kind === 'caminos' ? rec.points : null}
          user={fix}
          selectedId={b.id}
          fit={fitPts}
          fitKey={b.id}
          initial={{ center: dest, zoom: 17 }}
        />
        <button className="icon-btn float hero-back" aria-label="Atrás" onClick={() => back('/bancales')}>
          <ChevronLeft size={26} />
        </button>
        <div className="hero-right">
          <button className="icon-btn float" aria-label="Editar bancal" onClick={() => editor.openBancal(b.id)}>
            <Pencil size={20} />
          </button>
        </div>
      </div>

      <div>
        {b.finca && <div className="eyebrow">{b.finca}</div>}
        <h1 className="title">{b.nombre}</h1>
        <div className="row wrap" style={{ gap: 6, marginTop: 10 }}>
          {b.olivos ? <span className="pill olive">{b.olivos} olivos</span> : null}
          {b.variedad ? <span className="pill olive">{b.variedad}</span> : null}
          <span className="pill">{b.precision !== null ? `GPS ±${b.precision} m` : 'Marcado en el mapa'}</span>
        </div>
      </div>

      <button className="go-btn" onClick={() => navigate(`/ir/${b.id}`)}>
        <span className="go-icon">
          <Navigation size={26} />
        </span>
        <div className="grow">
          <strong>Ir al bancal</strong>
          <span>
            {!fix || distRecta === null
              ? 'Esperando al GPS'
              : rec?.kind === 'caminos'
                ? `${formatDistance(rec.length)} por caminos · ≈ ${walkMinutes(rec.length)} min`
                : `${formatDistance(distRecta)} al ${cardinal(bearing(fix.p, dest))} · ≈ ${walkMinutes(distRecta)} min`}
          </span>
        </div>
      </button>

      <div className="actions">
        <a className="action" href={`https://www.google.com/maps/dir/?api=1&destination=${b.lat},${b.lon}&travelmode=driving`} target="_blank" rel="noreferrer">
          <Car size={22} />
          En coche
        </a>
        <button className="action" onClick={() => void compartir()}>
          <Share2 size={22} />
          Compartir
        </button>
        <button className="action" onClick={() => navigate(`/dibujar?tipo=mover&bancal=${b.id}`)}>
          <Move size={22} />
          Mover
        </button>
        <button className="action" onClick={() => void copiar(formatCoord(dest), 'Coordenadas copiadas')}>
          <Copy size={22} />
          Coordenadas
        </button>
      </div>

      <div className="section">
        <h2>Diario</h2>
        {apuntes.length > 0 && (
          <a className="link" href={`#/diario?bancal=${encodeURIComponent(b.id)}`}>
            Ver todo <ChevronRight size={16} />
          </a>
        )}
      </div>
      <div className="chips">
        {APUNTES.filter((t) => ['recoleccion', 'poda', 'tratamiento', 'riego', 'visita'].includes(t.value)).map((t) => (
          <button key={t.value} className="chip" onClick={() => editor.openApunte({ bancalId: b.id, tipo: t.value })}>
            <ApunteIcon tipo={t.value} size={17} /> {t.label}
          </button>
        ))}
        <button className="chip" onClick={() => editor.openApunte({ bancalId: b.id, tipo: 'otro' })} aria-label="Otro apunte">
          <Plus size={17} /> Otro
        </button>
      </div>
      <section className="card flush">
        <div className="stats" style={{ '--cols': 3 } as React.CSSProperties}>
          <Stat label={`Cosecha ${campanaLabel(actual)}`} value={kgCampana ? kg(kgCampana) : '—'} meta={kgAnterior ? `${kg(kgAnterior)} la anterior` : ' '} />
          <Stat label="Poda" value={ultimaPoda ? hace(ultimaPoda.fecha).replace('hace ', '') : '—'} meta={ultimaPoda ? fechaCorta(ultimaPoda.fecha) : 'Sin apuntar'} />
          <Stat label="Tratam." value={ultimoTrat ? hace(ultimoTrat.fecha).replace('hace ', '') : '—'} meta={ultimoTrat ? fechaCorta(ultimoTrat.fecha) : 'Sin apuntar'} />
        </div>
        {apuntes.length > 0 && (
          <div className="list" style={{ borderTop: '1px solid var(--hair)' }}>
            {apuntes.slice(0, 5).map((a) => (
              <button key={a.id} className="list-item" onClick={() => editor.openApunte({ apunte: a })}>
                <span className="tile sm none">
                  <ApunteIcon tipo={a.tipo} size={17} />
                </span>
                <div className="grow">
                  <div className="primary-line">
                    {apunteLabel(a.tipo)}
                    {a.kg ? ` · ${kg(a.kg)}` : ''}
                  </div>
                  {a.nota && <div className="secondary-line ellipsis">{a.nota}</div>}
                </div>
                <span className="trail small muted">{fechaCorta(a.fecha)}</span>
              </button>
            ))}
          </div>
        )}
      </section>

      {b.nota && (
        <>
          <div className="section">
            <h2>Nota</h2>
          </div>
          <section className="card">
            <p style={{ whiteSpace: 'pre-wrap' }}>{b.nota}</p>
          </section>
        </>
      )}

      <div className="section">
        <h2>Rutas a este bancal</h2>
      </div>
      <section className="card flush list">
        {propias.map((r) => (
          <a key={r.id} className="list-item tap" href={`#/ruta/${r.id}`}>
            <span className="tile sm" style={{ '--c': b.color } as React.CSSProperties}>
              <RouteIcon size={17} />
            </span>
            <div className="grow">
              <div className="primary-line ellipsis">{r.nombre}</div>
              <div className="secondary-line">
                {formatDistance(pathLength(r.puntos))} · {r.origen === 'grabado' ? 'grabada andando' : r.origen === 'gpx' ? 'importada' : 'dibujada'}
              </div>
            </div>
            <button
              className="btn small go"
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
            <p className="small muted">Si siempre entras por el mismo sitio (la acequia, la puerta de la finca…), guárdalo. Al navegar podrás elegirlo en vez de la ruta recomendada.</p>
          </div>
        )}
        <button className="list-item" onClick={() => navigate(`/grabar?tipo=ruta&bancal=${b.id}`)}>
          <span className="tile sm none">
            <Footprints size={17} />
          </span>
          <div className="grow primary-line">Grabar ruta andando</div>
          <ChevronRight size={18} className="chev" />
        </button>
        <button className="list-item" onClick={() => navigate(`/dibujar?tipo=ruta&bancal=${b.id}`)}>
          <span className="tile sm none">
            <PenLine size={17} />
          </span>
          <div className="grow primary-line">Dibujar ruta en el mapa</div>
          <ChevronRight size={18} className="chev" />
        </button>
      </section>
      <p className="meta num" style={{ padding: '0 4px' }}>
        {formatCoord(dest)}
      </p>
    </main>
  )
}
