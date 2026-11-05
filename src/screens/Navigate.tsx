import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowUp, Car, Check, Compass, CornerUpLeft, CornerUpRight, ExternalLink, LocateFixed, Route as RouteIcon, Volume2, VolumeX, X } from 'lucide-react'
import { MapView } from '../map/MapView'
import { angleDiff, bearing, distance, formatDistance, type LatLon } from '../lib/geo'
import { recommend } from '../domain/graph'
import { navigate as followRoute, nextStep, routeToDest, type NavState } from '../domain/nav'
import { formatDuration, remainingSeconds, TRANSPORT_LABELS } from '../domain/routing'
import { setSetting } from '../db/db'
import { useData } from '../ui/useData'
import { useGraph } from '../ui/graph'
import { usePosition } from '../ui/position'
import { useHeading } from '../ui/heading'
import { useWakeLock } from '../ui/wakelock'
import { back, navigate, routeParams } from '../ui/router'
import { conModo, resolverDestino, resolverModo } from '../ui/destino'
import { Empty, Sheet } from '../ui/components'
import { TransportPicker } from '../ui/TransportPicker'
import { useJourney } from '../ui/useJourney'

class Progress {
  private key = ''
  private route: LatLon[] | null = null
  private along = 0
  update(key: string, route: LatLon[], pos: LatLon, dest: LatLon, acc: number): NavState {
    if (key !== this.key || route !== this.route) { this.key = key; this.route = route; this.along = 0 }
    const state = followRoute(pos, route, dest, this.along, acc)
    if (!state.offRoute) this.along = Math.max(this.along, state.along)
    return state
  }
}

function TurnIcon({ type }: { type?: number }) {
  if (type !== undefined && [9, 10, 11, 12].includes(type)) return <CornerUpRight size={32} />
  if (type !== undefined && [14, 15, 16, 17].includes(type)) return <CornerUpLeft size={32} />
  return <ArrowUp size={32} />
}

export function Navigate({ id, route: hash }: { id: string; route: string }) {
  const { bancales, rutas, caminos, settings } = useData()
  const { graph } = useGraph()
  const { fix, error } = usePosition()
  const { heading, needsPermission, request } = useHeading(fix?.heading ?? null, fix?.speed ?? null)
  useWakeLock()
  const query = routeParams(hash).toString()
  const d = useMemo(() => resolverDestino(id, new URLSearchParams(query), bancales, settings.coche), [id, query, bancales, settings.coche])
  const lat = d?.p[0], lon = d?.p[1]
  const dest = useMemo<LatLon | null>(() => lat === undefined || lon === undefined ? null : [lat, lon], [lat, lon])
  const transport = settings.transporte
  const requested = new URLSearchParams(query).get('ruta')
  const modo = transport === 'pie' ? (requested === 'local' ? 'local' : resolverModo(requested, rutas, id)) : 'recomendada'
  const saved = useMemo(() => rutas.find((r) => r.id === modo && r.bancalId === id), [rutas, modo, id])
  const local = modo === 'local' || modo === 'directa' || !!saved
  const remote = useJourney(fix, dest, transport, settings, !local && !!dest)
  const [follow, setFollow] = useState(true)
  const [stepsOpen, setStepsOpen] = useState(false)
  const [optionsOpen, setOptionsOpen] = useState(false)
  const [fitKey, setFitKey] = useState('inicio')
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 5000); return () => window.clearInterval(timer) }, [])
  const localRoute = useMemo(() => {
    if (!dest) return null
    if (saved) return routeToDest(saved.puntos, dest)
    if (!fix) return null
    if (modo === 'directa') return [fix.p, dest]
    return modo === 'local' ? recommend(graph, fix.p, dest).points : null
  }, [dest, saved, fix, modo, graph])
  const points = local ? localRoute : remote.journey?.points ?? null
  const [progress] = useState(() => new Progress())
  const nav = useMemo(() => fix && dest && points ? progress.update(`${id}/${modo}/${transport}`, points, fix.p, dest, fix.acc) : null, [progress, fix, dest, points, id, modo, transport])
  const next = nav && remote.journey && !local ? nextStep(remote.journey.steps, nav.along) : null
  const stale = !!fix && now - fix.t > 30000
  const gpsOk = !!fix && !error && !stale && fix.acc <= 100
  const arrived = gpsOk && !!nav?.arrived
  const warned = useRef('')
  const cue = next && next.dist < (transport === 'coche' ? 100 : 30) ? next.paso.instruction : ''
  useEffect(() => {
    if (!gpsOk || !cue || warned.current === cue) return
    warned.current = cue
    navigator.vibrate?.(160)
    if (settings.voz && 'speechSynthesis' in window) {
      const utterance = new SpeechSynthesisUtterance(cue)
      utterance.lang = 'es-ES'
      window.speechSynthesis.cancel()
      window.speechSynthesis.speak(utterance)
    }
  }, [cue, gpsOk, settings.voz])
  useEffect(() => {
    if (arrived) navigator.vibrate?.([120, 80, 200])
  }, [arrived])
  useEffect(() => () => { if ('speechSynthesis' in window) window.speechSynthesis.cancel() }, [])
  if (!d || !dest) return <main className="screen sub"><Empty title="Este destino ya no existe" action={<button className="btn" onClick={() => navigate('/', true)}>Volver al mapa</button>} /></main>
  const seconds = nav ? (local ? nav.remaining / (4.5 / 3.6) : remote.journey ? remainingSeconds(remote.journey, nav.along) : 0) : 0
  const arrival = new Date(now + seconds * 1000).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
  const transportLabel = TRANSPORT_LABELS[transport]
  const tailGap = remote.journey?.tailGap ?? 0
  const startGap = fix && remote.journey && nav && nav.along < 10 ? distance(fix.p, remote.journey.points[0]) : 0
  const finalInstruction = remote.journey?.steps.at(-1)?.instruction
  const instruction = arrived ? 'Has llegado al sitio' : !gpsOk ? error === 'denegado' ? 'Activa el permiso de ubicación' : 'Esperando señal GPS actualizada…' : remote.loading ? (points ? 'Recalculando ruta…' : 'Calculando ruta…') : nav?.offRoute ? local ? 'Vuelve a tu recorrido guardado' : 'Fuera de la ruta · solicita recalcular' : next?.paso.instruction ?? finalInstruction ?? (local ? saved ? 'Sigue tu recorrido guardado a pie' : 'Orientación a pie hacia el punto' : 'Elige transporte y calcula tu ruta')
  const externalMode = transport === 'coche' ? 'driving' : transport === 'pie' ? 'walking' : 'bicycling'
  const externalUrl = `https://www.google.com/maps/dir/?api=1&destination=${dest[0]},${dest[1]}&travelmode=${externalMode}`
  const chooseMode = (value: string) => { navigate(conModo(id, new URLSearchParams(query), value), true); setOptionsOpen(false) }
  return <div className="nav-screen journey-screen">
    <header className="nav-head">
      <button className="icon-btn plain" aria-label="Salir de navegación" onClick={() => back(d.bancal ? `/bancal/${id}` : '/')}><X size={25} /></button>
      <div className="grow"><div className="t ellipsis">{d.nombre}</div><div className="meta">{transportLabel}{local ? ' · recorrido propio / orientación' : ' · ruta por calles y caminos'}</div></div>
      <button className="icon-btn plain" aria-label={settings.voz ? 'Silenciar indicaciones' : 'Activar voz'} aria-pressed={settings.voz} onClick={() => void setSetting('voz', !settings.voz)}>{settings.voz ? <Volume2 size={21} /> : <VolumeX size={21} />}</button>
    </header>
    <div className="journey-transports"><TransportPicker value={transport} onChange={(value) => void setSetting('transporte', value)} /></div>
    <div className={`instr journey-instruction ${arrived ? 'now' : nav?.offRoute ? 'off' : ''}`} role="status">
      <span className="ic">{arrived ? <Check size={32} /> : <TurnIcon type={next?.paso.type} />}</span>
      <div className="grow">{next && !arrived && <div className="d">{next.dist < 15 ? 'Ahora' : `En ${formatDistance(next.dist)}`}</div>}<div className="txt">{instruction}</div></div>
    </div>
    <div className="journey-map">
      <MapView capa={settings.capa} bancales={d.bancal ? [d.bancal] : []} caminos={local ? caminos : undefined} route={points} coche={settings.coche ? [settings.coche.lat, settings.coche.lon] : null} punto={d.tipo === 'punto' ? dest : null} user={fix} heading={heading} follow={follow} onUserPan={() => setFollow(false)} selectedId={d.bancal?.id} initial={{ center: fix?.p ?? dest, zoom: 17 }} fit={!follow ? points : null} fitKey={fitKey} />
      <div className="journey-tools"><button className={`icon-btn float ${follow ? 'on' : ''}`} aria-label="Seguir mi posición" onClick={() => setFollow(true)}><LocateFixed size={22} /></button><button className="icon-btn float" aria-label="Ver ruta completa" disabled={!points} onClick={() => { setFollow(false); setFitKey(String(Date.now())) }}><RouteIcon size={22} /></button>{needsPermission && <button className="icon-btn float" aria-label="Activar brújula" onClick={() => void request()}><Compass size={21} /></button>}</div>
      {local && nav && <div className="journey-arrow float" aria-label="Dirección al punto"><ArrowUp size={30} style={{ transform: `rotate(${angleDiff(bearing(fix!.p, nav.target) - (heading ?? 0))}deg)` }} /></div>}
    </div>
    <section className="journey-panel">
      {transport === 'patinete' && <p className="journey-note">Patinete: trazado orientativo de bicicleta. No comprueba las restricciones específicas de VMP.</p>}
      {remote.error && !local && <p className="journey-note" role="alert">{remote.error}</p>}
      {startGap > 40 && !local && <p className="journey-note">El recorrido empieza en la vía más cercana, a {formatDistance(startGap)} de tu posición. No se ha calculado el acceso hasta ella.</p>}
      {tailGap > 25 && !local && <p className="journey-note">La ruta llega al acceso, a {formatDistance(tailGap)} del punto guardado en línea recta. Ese último tramo no se incluye como vía transitable.</p>}
      {!!remote.journey && !local && ((settings.evitarPeajes && remote.journey.hasToll) || (settings.evitarAutopistas && remote.journey.hasHighway)) && <p className="journey-note">La ruta aún incluye {remote.journey.hasToll && settings.evitarPeajes ? 'peajes' : 'autopista'}; no se ha podido evitar con estas preferencias.</p>}
      <div className="row between"><div><strong className="journey-time num">{arrived ? 'Has llegado' : nav ? formatDuration(seconds) : '—'}</strong><div className="meta num">{nav ? `${formatDistance(nav.remaining)} · llegada ≈ ${arrival}` : 'Esperando cálculo de ruta'}{fix ? ` · GPS ±${Math.round(fix.acc)} m` : ''}</div></div><button className="btn small" onClick={() => setOptionsOpen(true)}>Opciones</button></div>
      <div className="row">
        {!local && <button className="btn block" disabled={remote.loading || !gpsOk} onClick={remote.retry}>{remote.loading ? 'Calculando…' : 'Recalcular'}</button>}
        {remote.journey && !local && <button className="btn block" onClick={() => setStepsOpen(true)}>Indicaciones</button>}
        {arrived && d.tipo === 'coche' && <button className="btn block" onClick={() => { void setSetting('coche', null); navigate('/', true) }}>Quitar coche</button>}
        {arrived && d.bancal && <button className="btn primary block" onClick={() => navigate(`/bancal/${id}`, true)}>Ver sitio y fotos</button>}
        {nav && tailGap > 25 && transport !== 'pie' && nav.remaining < 40 && <button className="btn primary block" onClick={() => void setSetting('transporte', 'pie')}>Continuar andando</button>}
      </div>
    </section>
    {optionsOpen && <Sheet title="Opciones de la ruta" onClose={() => setOptionsOpen(false)}>
      <button className="btn primary block" onClick={() => chooseMode('recomendada')}>Ruta calculada por calles y caminos</button>
      {transport === 'pie' && <><button className="btn block" onClick={() => chooseMode('local')}>Orientación local sin conexión</button><button className="btn block" onClick={() => chooseMode('directa')}>Flecha en línea recta</button>{rutas.filter((r) => r.bancalId === id).map((r) => <button className="btn block" key={r.id} onClick={() => chooseMode(r.id)}>{r.nombre} · recorrido propio</button>)}<p className="meta">La orientación local puede pasar campo a través. No comprueba accesos ni restricciones de paso.</p></>}
      <a className="btn block" href={externalUrl} target="_blank" rel="noreferrer"><ExternalLink size={18} /> Abrir en Google Maps{transport === 'patinete' ? ' · bicicleta' : ''}</a>
      {settings.coche && d.tipo !== 'coche' && <button className="btn block" onClick={() => navigate('/ir/coche', true)}><Car size={18} /> Volver al coche</button>}
    </Sheet>}
    {stepsOpen && remote.journey && <Sheet title="Indicaciones" onClose={() => setStepsOpen(false)}><p className="meta">{formatDistance(remote.journey.length)} · {formatDuration(remote.journey.seconds)} · datos de OpenStreetMap / Valhalla</p><ol className="route-steps">{remote.journey.steps.map((step, i) => <li key={i}><span>{step.instruction}</span></li>)}</ol></Sheet>}
  </div>
}
