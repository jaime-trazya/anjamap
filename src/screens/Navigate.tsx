import { useEffect, useMemo, useRef, useState } from 'react'
import { Car, Check, Compass, Map as MapIcon, NotebookPen, X } from 'lucide-react'
import { MapView } from '../map/MapView'
import { angleDiff, cardinal, distance, formatDistance, walkMinutes, type LatLon } from '../lib/geo'
import { directRoute, giroTexto, recommend, type Paso, type RouteResult } from '../domain/graph'
import { navigate as navState, nextStep, routeToDest, type NavState } from '../domain/nav'
import { setSetting } from '../db/db'
import { useData } from '../ui/useData'
import { useGraph } from '../ui/graph'
import { usePosition } from '../ui/position'
import { useHeading } from '../ui/heading'
import { useWakeLock } from '../ui/wakelock'
import { useEditor } from '../ui/editor'
import { back, navigate, routeParams } from '../ui/router'
import { conModo, resolverDestino, resolverModo } from '../ui/destino'
import { Empty } from '../ui/components'
import { GiroIcon } from '../ui/icons'

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

/** Rosa de los vientos: gira con la brújula para que la N mire al norte de verdad */
function Dial({ ring, arrow, label }: { ring: number; arrow: number; label: string }) {
  const ticks = Array.from({ length: 36 }, (_, i) => i * 10)
  return (
    <div className="dial">
      <svg className="dial-ring" viewBox="0 0 200 200" style={{ transform: `rotate(${ring}deg)` }} aria-hidden>
        <circle cx="100" cy="100" r="98" />
        {ticks.map((t) => (
          <line key={t} className={`tick ${t % 90 === 0 ? 'major' : ''}`} x1="100" y1={t % 90 === 0 ? 6 : 8} x2="100" y2={t % 90 === 0 ? 20 : 15} transform={`rotate(${t} 100 100)`} />
        ))}
        {(['N', 'E', 'S', 'O'] as const).map((c, i) => (
          <text key={c} className={c === 'N' ? 'n' : ''} x="100" y="30" transform={`rotate(${i * 90} 100 100)`}>
            {c}
          </text>
        ))}
      </svg>
      <svg className="big-arrow" viewBox="0 0 100 100" style={{ transform: `rotate(${arrow}deg)` }} role="img" aria-label={label}>
        <path d="M50 6 L82 88 L50 70 L18 88 Z" />
      </svg>
    </div>
  )
}

function Instruccion({ pos, nav, next, rec, guardada }: { pos: LatLon; nav: NavState; next: { paso: Paso; dist: number } | null; rec: RouteResult | null; guardada: boolean }) {
  if (nav.offRoute) {
    return (
      <div className="instr off" role="status">
        <span className="ic">
          <GiroIcon giro={null} />
        </span>
        <div className="grow">
          <div className="d">{formatDistance(distance(pos, nav.target))}</div>
          <div className="txt">Te has salido: vuelve a la ruta</div>
        </div>
      </div>
    )
  }
  if (next && next.dist < 400) {
    const extra = next.paso.giro === 'dejar' && rec ? ` · el bancal queda a ${formatDistance(nav.remaining - next.dist)} campo a través` : ''
    return (
      <div className={`instr ${next.dist < 25 ? 'now' : ''}`} role="status">
        <span className="ic">
          <GiroIcon giro={next.paso.giro} />
        </span>
        <div className="grow">
          <div className="d">{next.dist < 15 ? 'Ahora' : `En ${formatDistance(next.dist)}`}</div>
          <div className="txt">
            {giroTexto(next.paso.giro)}
            {extra}
          </div>
        </div>
      </div>
    )
  }
  const txt = guardada ? 'Sigue tu ruta guardada' : rec?.kind === 'caminos' ? 'Sigue por el camino' : rec ? 'Campo a través: ningún camino compensa' : 'Sigue la flecha'
  return (
    <div className="instr" role="status">
      <span className="ic">
        <GiroIcon giro={null} />
      </span>
      <div className="grow">
        <div className="d">{next ? `${formatDistance(next.dist)}` : formatDistance(nav.remaining)}</div>
        <div className="txt">{next ? `${txt} hasta el siguiente cruce` : txt}</div>
      </div>
    </div>
  )
}

export function Navigate({ id, route: hash }: { id: string; route: string }) {
  const { bancales, rutas, caminos, settings, osm } = useData()
  const { graph } = useGraph()
  const { fix, error } = usePosition()
  const { heading, source, needsPermission, request } = useHeading(fix?.heading ?? null, fix?.speed ?? null)
  const editor = useEditor()
  useWakeLock()
  const query = routeParams(hash).toString()
  const coche = settings.coche
  const d = useMemo(() => resolverDestino(id, new URLSearchParams(query), bancales, coche), [id, query, bancales, coche])
  const dest: LatLon | null = d?.p ?? null
  const propias = d?.bancal ? rutas.filter((r) => r.bancalId === d.bancal!.id) : []
  const modo = resolverModo(new URLSearchParams(query).get('ruta'), rutas, id)
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
  const next = nav && rec ? nextStep(rec.steps, nav.along) : null

  // Vibra al llegar y al acercarse a cada giro
  const arrived = !!nav?.arrived
  useEffect(() => {
    if (arrived) navigator.vibrate?.([120, 80, 120, 80, 220])
  }, [arrived])
  const avisado = useRef('')
  const cerca = next && next.dist < 30 ? `${next.paso.giro}-${next.paso.p[0].toFixed(4)}-${next.paso.p[1].toFixed(4)}` : ''
  useEffect(() => {
    if (cerca && cerca !== avisado.current) {
      avisado.current = cerca
      navigator.vibrate?.(180)
    }
  }, [cerca])

  if (!d || !dest) {
    return (
      <main className="screen sub">
        <Empty title={id === 'coche' ? 'No hay coche guardado' : 'Este destino ya no existe'} action={<button className="btn" onClick={() => navigate('/', true)}>Volver al mapa</button>} />
      </main>
    )
  }

  const rot = nav ? (heading !== null ? angleDiff(nav.bearing - heading) : nav.bearing) : 0
  const opciones = [
    { id: 'recomendada', label: 'Recomendada' },
    { id: 'directa', label: 'Línea recta' },
    ...propias.map((r) => ({ id: r.id, label: r.nombre })),
  ]
  const kindLabel = saved
    ? 'Ruta guardada'
    : modo === 'directa'
      ? 'En línea recta'
      : rec?.kind === 'caminos'
        ? `Por caminos · ${formatDistance(rec.onPath)} de camino`
        : rec
          ? 'Campo a través'
          : osm.estado === 'cargando'
            ? 'Cargando caminos…'
            : ''
  const salir = () => back(d.bancal ? `/bancal/${d.bancal.id}` : '/')

  return (
    <div className="nav-screen">
      <header className="nav-head">
        <button className="icon-btn plain" aria-label="Salir" onClick={salir}>
          <X size={26} />
        </button>
        <div className="grow" style={{ textAlign: 'center', minWidth: 0 }}>
          <div className="t ellipsis">{d.nombre}</div>
          <div className="meta ellipsis">{kindLabel}</div>
        </div>
        <button className={`icon-btn plain ${showMap ? 'on' : ''}`} aria-label={showMap ? 'Ocultar mapa' : 'Ver mapa'} aria-pressed={showMap} onClick={() => setShowMap((v) => !v)}>
          <MapIcon size={24} />
        </button>
      </header>

      {!arrived && (
        <div className="chips nav-chips">
          {opciones.map((o) => (
            <button key={o.id} className={`chip ${modo === o.id ? 'on' : ''}`} onClick={() => navigate(conModo(id, new URLSearchParams(query), o.id), true)}>
              {o.label}
            </button>
          ))}
        </div>
      )}

      {nav && !arrived && fix && <Instruccion pos={fix.p} nav={nav} next={next} rec={rec} guardada={!!saved} />}

      <section className="nav-main">
        {error === 'denegado' ? (
          <p className="empty">Activa el permiso de ubicación para esta app en los ajustes del teléfono.</p>
        ) : !fix ? (
          <div className="nav-wait">
            <div className="spinner" />
            <p className="muted">Buscando señal GPS…</p>
          </div>
        ) : nav?.arrived ? (
          <div className="nav-arrived">
            <span className="badge">
              <Check size={46} strokeWidth={2.6} />
            </span>
            <strong>Has llegado</strong>
            <p className="muted">
              Estás a {formatDistance(nav.straight)} del punto guardado (GPS ±{Math.round(fix.acc)} m).
            </p>
            <div className="stack" style={{ width: '100%', gap: 8, marginTop: 6 }}>
              {d.bancal && (
                <button className="btn primary block big" onClick={() => editor.openApunte({ bancalId: d.bancal!.id, tipo: 'visita' })}>
                  <NotebookPen size={20} /> Apuntar en el diario
                </button>
              )}
              {d.tipo === 'coche' ? (
                <button
                  className="btn block"
                  onClick={() => {
                    void setSetting('coche', null)
                    navigate('/', true)
                  }}
                >
                  Ya estoy en el coche: quitarlo del mapa
                </button>
              ) : (
                settings.coche && (
                  <button className="btn block" onClick={() => navigate('/ir/coche', true)}>
                    <Car size={19} /> Volver al coche
                  </button>
                )
              )}
            </div>
          </div>
        ) : nav ? (
          <>
            <Dial ring={heading !== null ? -heading : 0} arrow={rot} label={`Ve hacia el ${cardinal(nav.bearing)}`} />
            <div className="nav-dist">
              <span className="figure num">{formatDistance(nav.remaining)}</span>
              <span className="sub">
                ≈ {walkMinutes(nav.remaining)} min andando
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
              <button className="pill go" onClick={() => void request()}>
                <Compass size={15} /> Activar brújula
              </button>
            ) : (
              <span className="pill warn">Sin brújula: la N roja es el norte</span>
            )}
          </div>
        )}
      </section>

      {showMap && (
        <div className="nav-map">
          <MapView
            capa={settings.capa}
            bancales={d.bancal ? [d.bancal] : []}
            caminos={caminos}
            red={osm.net}
            route={routePts}
            coche={settings.coche ? [settings.coche.lat, settings.coche.lon] : null}
            punto={d.tipo === 'punto' ? d.p : null}
            user={fix}
            heading={heading}
            follow
            selectedId={d.bancal?.id}
            initial={{ center: fix?.p ?? dest, zoom: 18 }}
          />
        </div>
      )}
    </div>
  )
}
