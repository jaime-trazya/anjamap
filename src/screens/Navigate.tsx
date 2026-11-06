import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowUp, ArrowUpLeft, ArrowUpRight, Car, Check, Compass, CornerUpLeft, CornerUpRight, Download, Flag, MapPin, RotateCw, Undo2, ExternalLink, Footprints, LocateFixed, Navigation2, Route as RouteIcon, Save, Volume2, VolumeX, X } from 'lucide-react'
import { useLiveQuery } from 'dexie-react-hooks'
import { MapView } from '../map/MapView'
import { angleDiff, bearing, distance, formatDistance, pathLength, simplify, type LatLon } from '../lib/geo'
import { bloquear, giroTexto, recommend, type Giro } from '../domain/graph'
import { nextStep, RouteTracker, routeToDest } from '../domain/nav'
import { MAX_SPEED, OFF_ROUTE_BASE, PositionFilter, TrailRecorder } from '../domain/track'
import { formatDuration, maniobra, remainingSeconds, TRANSPORT_LABELS, type Maniobra } from '../domain/routing'
import { addCamino, addRuta, db, setSetting, type Transporte } from '../db/db'
import { callar, conDistancia, desbloquearVoz, hablar } from '../ui/voz'
import { useToast } from '../ui/toast'
import { descargarRuta } from '../ui/offline'
import { useData } from '../ui/useData'
import { useGraph } from '../ui/graph'
import { usePosition } from '../ui/position'
import { useHeading } from '../ui/heading'
import { useWakeLock } from '../ui/wakelock'
import { back, navigate, routeParams } from '../ui/router'
import { conModo, leerSiguientes, resolverDestino, resolverLugar, resolverModo, rutaNavegacion } from '../ui/destino'
import { Empty, Sheet } from '../ui/components'
import { TransportPicker } from '../ui/TransportPicker'
import { useJourney } from '../ui/useJourney'

/** Tipos de maniobra de Valhalla para las indicaciones de la red local (giros a izquierda y derecha) */
const GIRO_TIPO: Record<Giro, number> = { izquierda: 15, 'izquierda-cerrada': 14, derecha: 10, 'derecha-cerrada': 11, coger: 8, dejar: 8 }

/** Zoom al seguir según la velocidad: más lejos cuanto más rápido vas */
function zoomFor(speed: number, transport: string): number {
  if (transport === 'pie') return 18
  return speed > 14 ? 16 : speed > 6 ? 17 : 18
}

/** Aviso con vibración y, si está activada, voz */
function avisar(texto: string, voz: boolean, vibracion: number | number[] = 160) {
  navigator.vibrate?.(vibracion)
  if (voz) hablar(texto)
}

/** Metros a los que se avisa cada giro: [con antelación, al llegar] */
const CUE_DIST: Record<Transporte, [number, number]> = { coche: [400, 90], bici: [160, 40], patinete: [160, 40], pie: [60, 18] }

/** Lecturas peores que esto no se apuntan en el recorrido */
const TRAIL_ACC = 25

const ICONOS: Record<Maniobra, typeof ArrowUp> = {
  recto: ArrowUp,
  derecha: CornerUpRight,
  'ligera-derecha': ArrowUpRight,
  izquierda: CornerUpLeft,
  'ligera-izquierda': ArrowUpLeft,
  'media-vuelta': Undo2,
  rotonda: RotateCw,
  llegada: Flag,
}

function TurnIcon({ type }: { type?: number }) {
  const Icon = ICONOS[maniobra(type)]
  return <Icon size={32} />
}

export function Navigate({ id, route: hash }: { id: string; route: string }) {
  const { bancales, rutas, caminos, marcas, settings } = useData()
  // Pasos cerrados: las rutas los evitan. Referencias: se leen al pasar cerca.
  const cerrados = useMemo(() => marcas.filter((m) => m.tipo === 'cerrado').map((m) => [m.lat, m.lon] as LatLon), [marcas])
  const referencias = useMemo(() => marcas.filter((m) => m.tipo === 'referencia'), [marcas])
  const { graph } = useGraph()
  const { fix: raw, error } = usePosition()
  const transport = settings.transporte
  // Posición filtrada: sin saltos imposibles para el transporte y suavizada según la precisión
  const [filter] = useState(() => new PositionFilter(MAX_SPEED[transport]))
  const fix = useMemo(() => {
    filter.setMaxSpeed(MAX_SPEED[transport])
    return raw ? filter.push(raw) : null
  }, [filter, raw, transport])
  const { heading, needsPermission, request } = useHeading(fix?.heading ?? null, fix?.speed ?? null)
  useWakeLock()
  const offRef = useRef(false)
  const query = routeParams(hash).toString()
  // Ruta con varias paradas: las que quedan después de este destino
  const siguientes = useMemo(() => leerSiguientes(new URLSearchParams(query)), [query])
  const siguienteLugar = siguientes.length ? resolverLugar(siguientes[0], bancales, settings.coche, null) : null
  const siguienteNombre = siguienteLugar?.nombre ?? ''
  const toast = useToast()
  const d = useMemo(() => resolverDestino(id, new URLSearchParams(query), bancales, settings.coche, transport), [id, query, bancales, settings.coche, transport])
  // Destinos recientes: el sitio pasa a ser el primero de la lista
  const recientes = settings.recientes
  const esBancal = d?.tipo === 'bancal'
  useEffect(() => {
    if (!esBancal || recientes[0] === id) return
    void setSetting('recientes', [id, ...recientes.filter((x) => x !== id)].slice(0, 6))
  }, [esBancal, id, recientes])
  // Foto del sitio para reconocer la entrada al llegar
  const foto = useLiveQuery(() => (esBancal ? db.fotos.where('bancalId').equals(id).first() : undefined), [esBancal, id])
  const lat = d?.p[0], lon = d?.p[1]
  const dest = useMemo<LatLon | null>(() => lat === undefined || lon === undefined ? null : [lat, lon], [lat, lon])
  const requested = new URLSearchParams(query).get('ruta')
  const modo = transport === 'pie' ? (requested === 'local' ? 'local' : resolverModo(requested, rutas, id)) : 'recomendada'
  const saved = useMemo(() => rutas.find((r) => r.id === modo && r.bancalId === id), [rutas, modo, id])
  const local = modo === 'local' || modo === 'directa' || !!saved
  const remote = useJourney(fix, dest, transport, settings, !local && !!dest, offRef, cerrados)
  const [follow, setFollow] = useState(true)
  const [stepsOpen, setStepsOpen] = useState(false)
  const [optionsOpen, setOptionsOpen] = useState(false)
  const [fitKey, setFitKey] = useState('inicio')
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 5000); return () => window.clearInterval(timer) }, [])
  // Red local sin conexión: se recalcula desde tu posición y también da indicaciones en los cruces
  const red = useMemo(() => bloquear(graph, cerrados), [graph, cerrados])
  const localRec = useMemo(() => (fix && dest && modo === 'local' ? recommend(red, fix.p, dest) : null), [fix, dest, modo, red])
  const localRoute = useMemo(() => {
    if (!dest) return null
    if (saved) return routeToDest(saved.puntos, dest)
    if (!fix) return null
    if (modo === 'directa') return [fix.p, dest]
    return localRec?.points ?? null
  }, [dest, saved, fix, modo, localRec])
  const points = local ? localRoute : remote.journey?.points ?? null
  const steps = useMemo(
    () => (local ? (localRec?.steps.map((s) => ({ along: s.along, instruction: giroTexto(s.giro), type: GIRO_TIPO[s.giro], p: s.p })) ?? []) : (remote.journey?.steps ?? [])),
    [local, localRec, remote.journey],
  )
  const [tracker] = useState(() => new RouteTracker())
  const nav = useMemo(
    () => (fix && dest && points ? tracker.update(`${id}/${modo}/${transport}`, points, fix.p, dest, fix.acc, OFF_ROUTE_BASE[transport], fix.speed, 3, fix.heading) : null),
    [tracker, fix, dest, points, id, modo, transport],
  )
  // Sentido contrario solo cuenta con ruta calculada por el servidor (a pie por la red local basta con girarse)
  const wrongWay = !local && modo !== 'directa' && !!nav?.wrongWay
  useEffect(() => {
    offRef.current = !!nav?.offRoute || wrongWay
  }, [nav, wrongWay])
  const next = nav ? nextStep(steps, nav.along) : null
  const then = next ? steps.find((s) => s.along > next.paso.along + 3 && s.along - next.paso.along < 250) : undefined
  const stale = !!fix && now - fix.t > 30000
  const gpsOk = !!fix && !error && !stale && fix.acc <= 100

  // Voz: en iPhone solo puede hablar después de un toque en la pantalla; el primero la desbloquea
  useEffect(() => {
    const on = () => desbloquearVoz()
    window.addEventListener('pointerdown', on, { once: true })
    return () => window.removeEventListener('pointerdown', on)
  }, [])
  const arrived = gpsOk && !!nav?.arrived
  // Cada giro se avisa dos veces: con antelación («En 300 metros, gira…») y al llegar («Gira…»).
  // Se identifica por el punto del giro: dos giros con el mismo texto se avisan los dos.
  const [lejos, cerca] = CUE_DIST[transport]
  const stage = next && !nav?.offRoute && !wrongWay ? (next.dist <= cerca ? 'cerca' : next.dist <= lejos ? 'lejos' : '') : ''
  const cueText = next && stage ? (stage === 'cerca' ? next.paso.instruction : conDistancia(next.dist, next.paso.instruction)) : ''
  const cueKey = next && stage ? `${stage}|${next.paso.p[0].toFixed(5)},${next.paso.p[1].toFixed(5)}|${next.paso.instruction}` : ''
  const warned = useRef(new Set<string>())
  useEffect(() => {
    if (!gpsOk || !cueKey || warned.current.has(cueKey)) return
    warned.current.add(cueKey)
    // Si ya estás cerca no se repite el aviso de lejos
    if (cueKey.startsWith('cerca|')) warned.current.add(cueKey.replace(/^cerca/, 'lejos'))
    avisar(cueText, settings.voz, cueKey.startsWith('cerca|') ? 200 : 80)
  }, [cueText, cueKey, gpsOk, settings.voz])
  // Ruta nueva: se dice que está lista o recalculada, con la primera indicación
  const journeyRef = remote.journey
  const routesSeen = useRef(0)
  useEffect(() => {
    if (!journeyRef || local) return
    routesSeen.current += 1
    const first = journeyRef.steps.find((s) => s.along > 5)
    const inicio = routesSeen.current === 1 ? 'Ruta calculada.' : 'Nueva ruta.'
    avisar(first ? `${inicio} ${conDistancia(first.along, first.instruction)}` : inicio, settings.voz, 60)
    // Solo cuando cambia la ruta
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [journeyRef, local])
  // Aviso al salirte de la ruta o ir en sentido contrario (confirmado en varias lecturas)
  const offRoute = gpsOk && !arrived && (!!nav?.offRoute || wrongWay)
  const wasOff = useRef(false)
  useEffect(() => {
    if (offRoute === wasOff.current) return
    wasOff.current = offRoute
    if (offRoute) avisar(local ? 'Te has salido de la ruta. Vuelve al recorrido.' : wrongWay ? 'Vas en sentido contrario. Buscando otra ruta por delante.' : 'Te has salido de la ruta. Buscando otra.', settings.voz, [220, 100, 220])
  }, [offRoute, local, wrongWay, settings.voz])
  const etapa = d?.etapa
  useEffect(() => {
    if (arrived) avisar(etapa === 'aparcamiento' ? 'Has llegado al aparcamiento. Sigue andando.' : siguienteNombre ? `Has llegado. Siguiente parada: ${siguienteNombre}.` : 'Has llegado', settings.voz, [120, 80, 200])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [arrived, etapa, settings.voz])

  // Referencias propias: se leen una vez al acercarte (más lejos cuanto más rápido vas)
  const radioRef = transport === 'coche' ? 120 : transport === 'pie' ? 35 : 60
  const refCerca = fix ? referencias.find((r) => distance(fix.p, [r.lat, r.lon]) < radioRef) : undefined
  const dichas = useRef(new Set<string>())
  useEffect(() => {
    if (!refCerca || !gpsOk || dichas.current.has(refCerca.id)) return
    dichas.current.add(refCerca.id)
    avisar(`Referencia: ${refCerca.texto}`, settings.voz, 120)
  }, [refCerca, gpsOk, settings.voz])
  useEffect(() => () => callar(), [])

  // Recorrido hecho: se apunta mientras navegas y se puede guardar como ruta del sitio o como camino
  const [openedAt] = useState(() => Date.now())
  const [recorder] = useState(() => new TrailRecorder(openedAt, TRAIL_ACC))
  const trail = useMemo(() => (fix ? recorder.push(fix) : recorder.points), [recorder, fix])
  const [trailSaved, setTrailSaved] = useState(0)
  // Lo ya guardado se actualiza al volver a guardar, en vez de crear otra ruta o camino
  const [guardado, setGuardado] = useState<{ tabla: 'rutas' | 'caminos'; id: string } | null>(null)
  const [exitOpen, setExitOpen] = useState(false)
  const trailLen = useMemo(() => pathLength(trail), [trail])
  const unsaved = trailLen >= 50 && trailSaved !== trail.length

  // Mapa girado hacia donde vas (con el rumbo del movimiento, no de la brújula, para que no baile parado)
  const rotar = settings.mapaGira && follow && modo !== 'directa'
  const mapBearing = rotar ? (fix?.heading ?? null) : null
  if (!d || !dest) return <main className="screen sub"><Empty title="Este destino ya no existe" action={<button className="btn" onClick={() => navigate('/', true)}>Volver al mapa</button>} /></main>
  const seconds = nav ? (local ? nav.remaining / (4.5 / 3.6) : remote.journey ? remainingSeconds(remote.journey, nav.along) : 0) : 0
  const arrival = new Date(now + seconds * 1000).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
  const transportLabel = TRANSPORT_LABELS[transport]
  const tailGap = remote.journey?.tailGap ?? 0
  const startGap = fix && remote.journey && nav && nav.along < 10 ? distance(fix.p, remote.journey.points[0]) : 0
  const finalInstruction = remote.journey?.steps.at(-1)?.instruction
  const instruction = arrived ? (d.etapa === 'aparcamiento' ? 'Has llegado al aparcamiento' : d.etapa === 'acceso' ? 'Has llegado a la entrada' : 'Has llegado al sitio') : !gpsOk ? error === 'denegado' ? 'Activa el permiso de ubicación' : 'Esperando señal GPS actualizada…' : remote.loading ? (points ? 'Recalculando ruta…' : 'Calculando ruta…') : wrongWay ? 'Vas en sentido contrario · buscando otra ruta por delante' : nav?.offRoute ? local ? 'Vuelve a tu recorrido guardado' : 'Fuera de la ruta · buscando otra por delante' : next?.paso.instruction ?? finalInstruction ?? (local ? saved ? 'Sigue tu recorrido guardado a pie' : 'Orientación a pie hacia el punto' : 'Elige transporte y calcula tu ruta')
  const externalMode = transport === 'coche' ? 'driving' : transport === 'pie' ? 'walking' : 'bicycling'
  const externalUrl = `https://www.google.com/maps/dir/?api=1&destination=${dest[0]},${dest[1]}&travelmode=${externalMode}`
  const chooseMode = (value: string) => { navigate(conModo(id, new URLSearchParams(query), value), true); setOptionsOpen(false) }
  // Los recorridos a pie hasta un sitio se guardan como sus rutas propias; el resto, como caminos
  const comoRuta = !!d.bancal && transport === 'pie'
  const salir = () => back(d.bancal ? `/bancal/${id}` : '/')
  const fechaCorta = () => new Date().toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })
  const guardarRecorrido = async () => {
    const puntos = simplify(trail, 2)
    if (puntos.length < 2) return
    const tabla = comoRuta ? 'rutas' : 'caminos'
    if (guardado?.tabla === tabla && (await db[tabla].update(guardado.id, { puntos }))) {
      setTrailSaved(trail.length)
      toast.show('Recorrido actualizado')
      return
    }
    const nuevo = comoRuta
      ? await addRuta({ nombre: `Recorrido ${transportLabel.toLowerCase()} · ${fechaCorta()}`, bancalId: d.bancal!.id, puntos, origen: 'grabado' })
      : await addCamino({ nombre: `Hacia ${d.nombre} · ${fechaCorta()}`, tipo: transport === 'pie' ? 'senda' : 'pista', puntos, origen: 'grabado' })
    setGuardado({ tabla, id: nuevo })
    setTrailSaved(trail.length)
    toast.show(comoRuta ? 'Recorrido guardado en las rutas del sitio' : 'Recorrido guardado en Caminos')
  }
  // Para zonas sin cobertura: baja el satélite a lo largo de la ruta y, si es a un sitio, guarda el trazado para seguirlo sin conexión
  const prepararSinCobertura = async () => {
    if (!points) return
    setOptionsOpen(false)
    if (comoRuta && !local) await addRuta({ nombre: `Ruta ${transportLabel.toLowerCase()} · ${fechaCorta()}`, bancalId: d.bancal!.id, puntos: simplify(points, 2), origen: 'dibujado' })
    toast.show('Descargando el mapa de la ruta…')
    const r = await descargarRuta(points, `Ruta a ${d.nombre}`, settings.capa)
    toast.show(r.estado === 'terminada' ? `Mapa de la ruta guardado${comoRuta && !local ? ' y ruta añadida al sitio' : ''}` : 'No se ha podido terminar la descarga del mapa')
  }
  const etapaTexto = d.etapa === 'aparcamiento' ? ' · al aparcamiento' : d.etapa === 'acceso' ? ' · a la entrada' : ''
  const verFoto = !!foto && !!nav && nav.straight < 150 && d.etapa !== 'aparcamiento'
  return <div className="nav-screen journey-screen">
    <header className="nav-head">
      <button className="icon-btn plain" aria-label="Salir de navegación" onClick={() => (unsaved ? setExitOpen(true) : salir())}><X size={25} /></button>
      <div className="grow"><div className="t ellipsis">{d.nombre}</div><div className="meta">{transportLabel}{etapaTexto}{local ? ' · recorrido propio / orientación' : ' · ruta por calles y caminos'}</div></div>
      <button className="icon-btn plain" aria-label={settings.voz ? 'Silenciar indicaciones' : 'Activar voz'} aria-pressed={settings.voz} onClick={() => { desbloquearVoz(); if (!settings.voz) hablar('Indicaciones por voz activadas'); else callar(); void setSetting('voz', !settings.voz) }}>{settings.voz ? <Volume2 size={21} /> : <VolumeX size={21} />}</button>
    </header>
    <div className="journey-transports"><TransportPicker value={transport} onChange={(value) => void setSetting('transporte', value)} /></div>
    <div className={`instr journey-instruction ${arrived ? 'now' : nav?.offRoute || wrongWay ? 'off' : ''}`} role="status">
      <span className="ic">{arrived ? <Check size={32} /> : <TurnIcon type={next?.paso.type} />}</span>
      <div className="grow">{next && !arrived && <div className="d">{next.dist < 15 ? 'Ahora' : `En ${formatDistance(next.dist)}`}</div>}<div className="txt">{instruction}</div>{then && !arrived && !nav?.offRoute && <div className="journey-then">Luego: {then.instruction.charAt(0).toLowerCase() + then.instruction.slice(1)}</div>}</div>
    </div>
    <div className="journey-map">
      <MapView capa={settings.capa} bancales={d.bancal ? [d.bancal] : []} caminos={local ? caminos : undefined} route={points} coche={settings.coche ? [settings.coche.lat, settings.coche.lon] : null} punto={d.tipo === 'punto' || (d.etapa && d.etapa !== 'sitio') ? dest : null} user={fix ? { p: nav?.snapped ?? fix.p, acc: fix.acc } : null} heading={heading} navPuck routeDone={modo === 'directa' ? 0 : nav?.along} autoZoom={follow && fix ? zoomFor(fix.speed, transport) : null} follow={follow} onUserPan={() => setFollow(false)} selectedId={d.bancal?.id} initial={{ center: fix?.p ?? dest, zoom: 17 }} fit={!follow ? points : null} fitKey={fitKey} trail={trail} rotatable bearing={mapBearing} marcas={marcas} />
      <div className="journey-tools">{modo !== 'directa' && <button className={`icon-btn float ${settings.mapaGira ? 'on' : ''}`} aria-label={settings.mapaGira ? 'Poner el norte arriba' : 'Girar el mapa hacia donde vas'} aria-pressed={settings.mapaGira} onClick={() => { void setSetting('mapaGira', !settings.mapaGira); setFollow(true) }}><Navigation2 size={21} /></button>}<button className={`icon-btn float ${follow ? 'on' : ''}`} aria-label="Seguir mi posición" onClick={() => setFollow(true)}><LocateFixed size={22} /></button><button className="icon-btn float" aria-label="Ver ruta completa" disabled={!points} onClick={() => { setFollow(false); setFitKey(String(Date.now())) }}><RouteIcon size={22} /></button>{modo === 'directa' && needsPermission && <button className="icon-btn float" aria-label="Activar brújula" onClick={() => void request()}><Compass size={21} /></button>}</div>
      {modo === 'directa' && nav && fix && <div className="journey-arrow float" aria-label="Dirección al punto"><ArrowUp size={30} style={{ transform: `rotate(${angleDiff(bearing(fix.p, nav.target) - (heading ?? 0))}deg)` }} /></div>}
      {transport !== 'pie' && fix && gpsOk && <div className="journey-speed float"><div className="figure num">{Math.round(fix.speed * 3.6)}</div><div className="meta">km/h</div></div>}
    </div>
    <section className="journey-panel">
      {siguientes.length > 0 && <div className={`journey-note row between ${arrived ? 'journey-ref' : ''}`}><span>Siguiente parada: <b>{siguienteNombre || 'otro punto'}</b>{siguientes.length > 1 ? ` · quedan ${siguientes.length}` : ''}</span><button className={`btn small ${arrived ? 'primary' : ''}`} onClick={() => { const url = rutaNavegacion(siguientes[0], siguientes.slice(1)); if (url) navigate(url, true) }}>{arrived ? 'Ir ya' : 'Saltar a ella'}</button></div>}
      {refCerca && <p className="journey-note journey-ref"><MapPin size={18} /> {refCerca.texto}</p>}
      {verFoto && <figure className="journey-photo"><img src={foto.dataUrl} alt={`Foto de ${d.nombre}`} /><figcaption>{arrived ? 'Ya estás: así es el sitio' : 'Casi has llegado: así es el sitio'}</figcaption></figure>}
      {arrived && d.etapa === 'aparcamiento' && <button className="btn primary block" onClick={() => void setSetting('transporte', 'pie')}><Footprints size={18} /> Seguir andando hasta {d.bancal?.acceso ? 'la entrada' : 'el sitio'}</button>}
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
        {arrived && d.bancal && !siguientes.length && <button className="btn primary block" onClick={() => navigate(`/bancal/${id}`, true)}>Ver sitio y fotos</button>}
        {nav && tailGap > 25 && transport !== 'pie' && nav.remaining < 40 && d.etapa !== 'aparcamiento' && <button className="btn primary block" onClick={() => void setSetting('transporte', 'pie')}>Continuar andando</button>}
      </div>
      {unsaved && <button className={`btn block ${arrived ? 'primary' : ''}`} onClick={() => void guardarRecorrido()}><Save size={18} /> Guardar el recorrido hecho · {formatDistance(trailLen)}</button>}
    </section>
    {exitOpen && <Sheet title="¿Guardar el recorrido?" onClose={() => setExitOpen(false)}>
      <p className="meta">Llevas {formatDistance(trailLen)} recorridos. {comoRuta ? 'Se guardará como ruta propia del sitio, para seguirla sin conexión.' : 'Se guardará en Caminos.'}</p>
      <button className="btn primary block" onClick={() => void guardarRecorrido().then(salir)}><Save size={18} /> Guardar y salir</button>
      <button className="btn block" onClick={salir}>Salir sin guardar</button>
    </Sheet>}
    {optionsOpen && <Sheet title="Opciones de la ruta" onClose={() => setOptionsOpen(false)}>
      {!local && !!remote.journey?.alternativas?.length && <section className="card flush list">
        <div className="list-item"><div className="grow"><div className="primary-line">Ruta actual</div><div className="secondary-line num">{formatDuration(remote.journey.seconds)} · {formatDistance(remote.journey.length)}</div></div></div>
        {remote.journey.alternativas.map((alt, i) => <button key={i} className="list-item" onClick={() => { const actual = remote.journey!; remote.elegir({ ...alt, alternativas: [{ ...actual, alternativas: undefined }, ...actual.alternativas!.filter((x) => x !== alt)] }); setOptionsOpen(false) }}><div className="grow"><div className="primary-line">Otra ruta {i + 1}</div><div className="secondary-line num">{formatDuration(alt.seconds)} · {formatDistance(alt.length)} · {alt.seconds > remote.journey!.seconds ? `${Math.max(1, Math.round((alt.seconds - remote.journey!.seconds) / 60))} min más` : `${Math.max(1, Math.round((remote.journey!.seconds - alt.seconds) / 60))} min menos`}</div></div></button>)}
      </section>}
      <button className="btn primary block" onClick={() => chooseMode('recomendada')}>Ruta calculada por calles y caminos</button>
      {transport === 'pie' && <><button className="btn block" onClick={() => chooseMode('local')}>Orientación local sin conexión</button><button className="btn block" onClick={() => chooseMode('directa')}>Línea recta con brújula</button>{rutas.filter((r) => r.bancalId === id).map((r) => <button className="btn block" key={r.id} onClick={() => chooseMode(r.id)}>{r.nombre} · recorrido propio</button>)}<p className="meta">La orientación local puede pasar campo a través. No comprueba accesos ni restricciones de paso.</p></>}
      <button className="btn block" disabled={!points || !navigator.onLine} onClick={() => void prepararSinCobertura()}><Download size={18} /> Guardar ruta y mapa para sin cobertura</button>
      <a className="btn block" href={externalUrl} target="_blank" rel="noreferrer"><ExternalLink size={18} /> Abrir en Google Maps{transport === 'patinete' ? ' · bicicleta' : ''}</a>
      {settings.coche && d.tipo !== 'coche' && <button className="btn block" onClick={() => navigate('/ir/coche', true)}><Car size={18} /> Volver al coche</button>}
    </Sheet>}
    {stepsOpen && remote.journey && <Sheet title="Indicaciones" onClose={() => setStepsOpen(false)}><p className="meta">{formatDistance(remote.journey.length)} · {formatDuration(remote.journey.seconds)} · datos de OpenStreetMap / Valhalla</p><ol className="route-steps">{remote.journey.steps.map((step, i) => <li key={i}><span>{step.instruction}</span></li>)}</ol></Sheet>}
  </div>
}
