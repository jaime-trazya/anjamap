import { useEffect, useMemo, useState } from 'react'
import { Compass, Map as MapIcon, PartyPopper, X } from 'lucide-react'
import { MapView } from '../map/MapView'
import { angleDiff, cardinal, formatDistance, walkMinutes, type LatLon } from '../lib/geo'
import { directRoute, recommend, type RouteResult } from '../domain/graph'
import { navigate as navState, routeToDest, type NavState } from '../domain/nav'
import { useData } from '../ui/useData'
import { usePosition } from '../ui/position'
import { useHeading } from '../ui/heading'
import { useWakeLock } from '../ui/wakelock'
import { back, navigate, routeParams } from '../ui/router'
import { Empty } from '../ui/components'

/** Recuerda cuánto has avanzado en la ruta elegida (solo crece; se reinicia al cambiar de ruta) */
class Progress {
  private modo = ''
  private along = 0
  update(modo: string, pos: LatLon, route: LatLon[], dest: LatLon, acc: number): NavState {
    if (modo !== this.modo) {
      this.modo = modo
      this.along = 0
    }
    const s = navState(pos, route, dest, modo === 'recomendada' || modo === 'directa' ? 0 : this.along, acc)
    if (!s.offRoute) this.along = Math.max(this.along, s.along)
    return s
  }
}

export function Navigate({ id, route: hash }: { id: string; route: string }) {
  const { bancales, rutas, caminos, settings, graph } = useData()
  const { fix, error } = usePosition()
  const { heading, source, needsPermission, request } = useHeading(fix?.heading ?? null, fix?.speed ?? null)
  useWakeLock()
  const b = bancales.find((x) => x.id === id)
  const dest = useMemo<LatLon | null>(() => (b ? [b.lat, b.lon] : null), [b])
  const propias = rutas.filter((r) => r.bancalId === id)
  const modo = routeParams(hash).get('ruta') ?? 'recomendada'
  const saved = useMemo(() => rutas.find((r) => r.id === modo && r.bancalId === id), [rutas, modo, id])

  const [showMap, setShowMap] = useState(true)

  // Recomendada: se recalcula desde donde estás con cada lectura del GPS (si te desvías, ya te lleva por el mejor sitio).
  // Directa: línea recta. Guardada: la ruta tal cual, siguiendo el avance para no saltar atrás en rutas que vuelven.
  const rec: RouteResult | null = useMemo(() => (fix && dest && modo === 'recomendada' ? recommend(graph, fix.p, dest) : null), [fix, dest, modo, graph])
  const savedPts = saved?.puntos
  const routePts: LatLon[] | null = useMemo(() => {
    if (!dest) return null
    if (savedPts) return routeToDest(savedPts, dest)
    if (modo === 'directa') return fix ? directRoute(fix.p, dest).points : null
    return rec?.points ?? null
  }, [savedPts, modo, rec, fix, dest])

  const [progress] = useState(() => new Progress())
  const nav = useMemo(() => (fix && dest && routePts ? progress.update(modo, fix.p, routePts, dest, fix.acc) : null), [progress, modo, fix, routePts, dest])

  const arrived = !!nav?.arrived
  useEffect(() => {
    if (arrived) navigator.vibrate?.([120, 80, 120])
  }, [arrived])

  if (!b || !dest) {
    return (
      <main className="screen sub">
        <Empty title="Este bancal ya no existe" action={<button className="btn" onClick={() => navigate('/bancales', true)}>Volver</button>} />
      </main>
    )
  }

  const rot = nav ? (heading !== null ? angleDiff(nav.bearing - heading) : nav.bearing) : 0
  const opciones = [
    { id: 'recomendada', label: 'Recomendada' },
    { id: 'directa', label: 'Directa' },
    ...propias.map((r) => ({ id: r.id, label: r.nombre })),
  ]
  const kindLabel = saved ? 'Ruta guardada' : modo === 'directa' ? 'En línea recta' : rec?.kind === 'caminos' ? 'Por caminos' : rec ? 'Campo a través (no hay caminos que ayuden)' : ''

  return (
    <div className={`nav-screen ${nav?.arrived ? 'arrived' : ''}`}>
      <header className="nav-head">
        <button className="icon-btn plain" aria-label="Salir" onClick={() => back(`/bancal/${b.id}`)}>
          <X size={24} />
        </button>
        <div className="grow" style={{ textAlign: 'center', minWidth: 0 }}>
          <div className="primary-line ellipsis" style={{ fontWeight: 600 }}>{b.nombre}</div>
          <div className="meta ellipsis">{kindLabel}</div>
        </div>
        <button className={`icon-btn plain ${showMap ? 'on' : ''}`} aria-label={showMap ? 'Ocultar mapa' : 'Ver mapa'} onClick={() => setShowMap((v) => !v)}>
          <MapIcon size={22} />
        </button>
      </header>

      <div className="chips nav-chips">
        {opciones.map((o) => (
          <button key={o.id} className={`chip ${modo === o.id ? 'on' : ''}`} onClick={() => navigate(`/ir/${b.id}${o.id === 'recomendada' ? '' : `?ruta=${o.id}`}`, true)}>
            {o.label}
          </button>
        ))}
      </div>

      <section className="nav-main">
        {error === 'denegado' ? (
          <p className="empty">Activa el permiso de ubicación para esta app en Ajustes del teléfono.</p>
        ) : !fix ? (
          <div className="nav-wait">
            <div className="spinner" />
            <p className="muted">Buscando señal GPS…</p>
          </div>
        ) : nav?.arrived ? (
          <div className="nav-arrived">
            <PartyPopper size={44} />
            <strong>Has llegado</strong>
            <p className="muted">Estás a {formatDistance(nav.straight)} del punto guardado (GPS ±{Math.round(fix.acc)} m).</p>
          </div>
        ) : nav ? (
          <>
            <div className={`arrow-ring ${heading === null ? 'north' : ''}`}>
              {heading === null && <span className="ring-n" style={{ transform: `rotate(0deg)` }}>N</span>}
              <svg className="big-arrow" viewBox="0 0 100 100" style={{ transform: `rotate(${rot}deg)` }} aria-label={`Dirección ${cardinal(nav.bearing)}`}>
                <path d="M50 8 L80 86 L50 70 L20 86 Z" />
              </svg>
            </div>
            <div className="nav-dist">
              <span className="num">{formatDistance(nav.remaining)}</span>
              <span className="muted small">
                {nav.offRoute ? 'Vuelve a la ruta' : `≈ ${walkMinutes(nav.remaining)} min`}
                {nav.remaining - nav.straight > 15 ? ` · ${formatDistance(nav.straight)} en línea recta` : ''}
              </span>
            </div>
          </>
        ) : null}
        {fix && !nav?.arrived && (
          <div className="nav-status">
            <span className={`pill ${fix.acc <= 15 ? 'pos' : fix.acc <= 35 ? 'warn' : 'neg'}`}>GPS ±{Math.round(fix.acc)} m</span>
            {heading !== null ? (
              <span className="pill">{source === 'brujula' ? 'Brújula' : 'Rumbo al andar'}</span>
            ) : needsPermission ? (
              <button className="pill accent" onClick={() => void request()}>
                <Compass size={13} /> Activar brújula
              </button>
            ) : (
              <span className="pill warn">Sin brújula: la flecha mira al norte</span>
            )}
          </div>
        )}
      </section>

      {showMap && (
        <div className="nav-map">
          <MapView capa={settings.capa} bancales={[b]} caminos={caminos} route={routePts} user={fix} heading={heading} follow selectedId={b.id} initial={{ center: fix?.p ?? dest, zoom: 18 }} />
        </div>
      )}
    </div>
  )
}
