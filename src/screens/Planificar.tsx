import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowDownUp, Car, ClipboardPaste, Download, ListOrdered, LocateFixed, MapPin, MousePointerClick, Navigation, Plus, Save, Search, Star, X } from 'lucide-react'
import { MapView } from '../map/MapView'
import { addRuta, setSetting, type Bancal, type Transporte } from '../db/db'
import { formatDistance, simplify, type LatLon } from '../lib/geo'
import { bloquear, giroTexto, recommend } from '../domain/graph'
import { fetchJourney, formatDuration, ordenLocal, ordenServidor, TRANSPORT_LABELS, type Journey } from '../domain/routing'
import { useData } from '../ui/useData'
import { useGraph } from '../ui/graph'
import { usePosition } from '../ui/position'
import { back, navigate, routeParams } from '../ui/router'
import { useToast } from '../ui/toast'
import { codigoLugar, leerCoordenadas, puntoDeLlegada, resolverLugar, rutaNavegacion, type Lugar } from '../ui/destino'
import { descargarRuta, resultadoDescarga } from '../ui/offline'
import { Sheet } from '../ui/components'
import { MicButton } from '../ui/MicButton'
import { TransportPicker } from '../ui/TransportPicker'
import { useAction } from '../ui/useAction'

/** Qué lugar se está eligiendo: salida, llegada, una parada (su posición) o una parada nueva */
type Campo = 'desde' | 'hasta' | 'nueva' | number

interface Plan {
  points: LatLon[]
  length: number
  seconds: number
  steps: string[]
  /** calles = servidor de rutas; local = caminos guardados en el móvil, sin conexión */
  fuente: 'calles' | 'local'
}

const TODOS: Transporte[] = ['pie', 'coche', 'bici', 'patinete']
const MAX_PARADAS = 10
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
const aPlan = (j: Journey): Plan => ({ points: j.points, length: j.length, seconds: j.seconds, steps: j.steps.map((s) => s.instruction), fuente: 'calles' })
const ptKey = (p: LatLon) => `${p[0].toFixed(5)},${p[1].toFixed(5)}`

/**
 * Planificar una ruta antes de salir: de un punto a otro (tu posición, el coche, un sitio, un punto del mapa o coordenadas),
 * con paradas intermedias que se pueden ordenar para recorrer menos. Se comparan transportes, se eligen alternativas,
 * se evitan los pasos cerrados y se puede guardar la ruta y bajar su mapa para cuando no haya cobertura.
 */
export function PlanScreen({ route }: { route: string }) {
  const { bancales, marcas, settings } = useData()
  const { graph } = useGraph()
  const { fix } = usePosition()
  const toast = useToast()
  const { busy, run } = useAction()
  const query = routeParams(route).toString()
  const params = useMemo(() => new URLSearchParams(query), [query])
  const transport = settings.transporte
  const miPos = fix?.p ?? null
  const desde = resolverLugar(params.get('desde') ?? 'yo', bancales, settings.coche, miPos, transport)
  const hasta = resolverLugar(params.get('hasta'), bancales, settings.coche, miPos, transport)
  const paradaCodigos = (params.get('paradas') ?? '').split('|').filter(Boolean).slice(0, MAX_PARADAS)
  const paradas = paradaCodigos.map((c) => resolverLugar(c, bancales, settings.coche, miPos, transport)).filter((l): l is Lugar => !!l && !!l.p && l.codigo !== 'yo')
  const cerrados = useMemo(() => marcas.filter((m) => m.tipo === 'cerrado').map((m) => [m.lat, m.lon] as LatLon), [marcas])
  const red = useMemo(() => bloquear(graph, cerrados), [graph, cerrados])
  const [eligiendo, setEligiendo] = useState<Campo | null>(null)
  const [enMapa, setEnMapa] = useState<Campo | null>(null)
  const [stepsOpen, setStepsOpen] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const [alt, setAlt] = useState(0)

  const ir = (q: URLSearchParams) => navigate(`/planificar?${q}`, true)
  const conParadas = (q: URLSearchParams, codigos: string[]) => {
    if (codigos.length) q.set('paradas', codigos.join('|'))
    else q.delete('paradas')
    return q
  }
  const poner = (campo: Campo, codigo: string) => {
    const q = new URLSearchParams(params)
    if (campo === 'desde' || campo === 'hasta') q.set(campo, codigo)
    else if (campo === 'nueva') conParadas(q, [...paradaCodigos, codigo])
    else conParadas(q, paradaCodigos.map((c, i) => (i === campo ? codigo : c)))
    ir(q)
    setEligiendo(null)
    setEnMapa(null)
    setAlt(0)
  }
  const quitarParada = (i: number) => ir(conParadas(new URLSearchParams(params), paradaCodigos.filter((_, j) => j !== i)))
  const invertir = () => {
    const q = new URLSearchParams(params)
    q.set('desde', params.get('hasta') ?? 'yo')
    q.set('hasta', params.get('desde') && params.get('desde') !== 'yo' ? params.get('desde')! : 'yo')
    ir(conParadas(q, [...paradaCodigos].reverse()))
  }
  // Ordenar paradas para recorrer menos: con conexión por calles (servidor), sin ella en línea recta
  const ordenar = async () => {
    if (!desde?.p || paradas.length < 2) return
    const pts = paradas.map((l) => l.p!)
    let orden: number[]
    let porCalles = false
    try {
      if (!navigator.onLine) throw new Error('sin conexión')
      orden = await ordenServidor(desde.p, pts, hasta?.p ?? null, transport, settings)
      porCalles = true
    } catch {
      orden = ordenLocal(desde.p, pts, hasta?.p ?? null)
    }
    const codigos = paradas.map((l) => l.codigo)
    const nuevo = orden.map((i) => codigos[i])
    if (nuevo.join('|') === codigos.join('|')) toast.show('Las paradas ya estaban en el mejor orden')
    else {
      ir(conParadas(new URLSearchParams(params), nuevo))
      toast.show(porCalles ? 'Paradas ordenadas por el recorrido más corto' : 'Sin conexión: paradas ordenadas por cercanía en línea recta')
    }
  }

  // Tu posición cambia sin parar: la ruta solo se recalcula cuando cambian los lugares, no a cada lectura del GPS
  const fromKey = desde?.p ? (desde.codigo === 'yo' ? 'yo' : ptKey(desde.p)) : ''
  const toKey = hasta?.p ? (hasta.codigo === 'yo' ? 'yo' : ptKey(hasta.p)) : ''
  const viaKey = paradas.map((l) => ptKey(l.p!)).join(';')
  const cerradosKey = cerrados.map(ptKey).join(';')
  const ends = useRef<{ from: LatLon | null; to: LatLon | null; via: LatLon[]; lugares: (Lugar | null)[] }>({ from: null, to: null, via: [], lugares: [] })
  const cerradosRef = useRef(cerrados)
  useEffect(() => {
    ends.current = { from: desde?.p ?? null, to: hasta?.p ?? null, via: paradas.map((l) => l.p!), lugares: [desde, ...paradas, hasta] }
    cerradosRef.current = cerrados
  })
  const { servidorRutas, evitarPeajes, evitarAutopistas, velocidadPatinete } = settings
  const placesKey = fromKey && toKey ? `${fromKey}/${viaKey}/${toKey}/${cerradosKey}/${attempt}` : ''
  const key = placesKey ? `${placesKey}/${transport}/${servidorRutas}/${evitarPeajes}/${evitarAutopistas}/${velocidadPatinete}` : ''
  const [res, setRes] = useState<{ key: string; plans: Plan[]; error: string | null }>({ key: '', plans: [], error: null })
  useEffect(() => {
    const { from, to, via } = ends.current
    if (!key || !from || !to) return
    const ctrl = new AbortController()
    const options = { servidorRutas, evitarPeajes, evitarAutopistas, velocidadPatinete }
    void (async () => {
      try {
        if (!navigator.onLine) throw new Error('sin conexión')
        const j = await fetchJourney(from, to, transport, options, ctrl.signal, null, { via, evitar: cerradosRef.current, alternativas: via.length ? 0 : 2 })
        setRes({ key, plans: [aPlan(j), ...(j.alternativas ?? []).map(aPlan)], error: null })
      } catch (error) {
        if (ctrl.signal.aborted) return
        if (transport === 'pie') {
          // A pie se puede planificar sin conexión con la red de caminos guardada en el móvil, tramo a tramo
          const pts = [from, ...via, to]
          const plan: Plan = { points: [], length: 0, seconds: 0, steps: [], fuente: 'local' }
          for (let i = 1; i < pts.length; i++) {
            const r = recommend(red, pts[i - 1], pts[i])
            plan.points.push(...(plan.points.length ? r.points.slice(1) : r.points))
            plan.length += r.length
            plan.steps.push(...r.steps.map((s) => giroTexto(s.giro)))
            if (i < pts.length - 1) plan.steps.push(`Parada ${i}`)
          }
          plan.seconds = plan.length / (4.5 / 3.6)
          setRes({ key, plans: [plan], error: null })
        } else {
          setRes({ key, plans: [], error: navigator.onLine ? (error instanceof Error ? error.message : 'No se ha podido calcular la ruta') : 'Necesitas conexión para planificar en coche, bici o patinete.' })
        }
      }
    })()
    return () => ctrl.abort()
  }, [key, transport, red, servidorRutas, evitarPeajes, evitarAutopistas, velocidadPatinete])
  const loading = !!key && res.key !== key
  const plans = res.key === key ? res.plans : []
  const plan = plans[Math.min(alt, plans.length - 1)] ?? null
  const error = res.key === key ? res.error : null

  // Comparar transportes: tiempo y distancia de cada uno (consultas en fila para no saturar el servidor)
  const [cmp, setCmp] = useState<{ key: string; items: Partial<Record<Transporte, { seconds: number; length: number } | 'error'>> } | null>(null)
  const comparar = async () => {
    const { from, to, via, lugares } = ends.current
    if (!from || !to || !key) return
    const k = placesKey
    // Cada transporte va a su punto de llegada: en coche al aparcamiento del sitio, a pie a su entrada
    const llegada = (l: Lugar | null, t: Transporte, p: LatLon) => (l?.bancal ? puntoDeLlegada(l.bancal, t).p : p)
    const options = { servidorRutas, evitarPeajes, evitarAutopistas, velocidadPatinete }
    let items: Partial<Record<Transporte, { seconds: number; length: number } | 'error'>> = {}
    setCmp({ key: k, items })
    for (const t of TODOS) {
      if (t === transport && plans[0]?.fuente === 'calles') items = { ...items, [t]: { seconds: plans[0].seconds, length: plans[0].length } }
      else {
        try {
          const [ld, ...resto] = lugares
          const lh = resto.pop() ?? null
          const j = await fetchJourney(llegada(ld, t, from), llegada(lh, t, to), t, options, undefined, null, { via: via.map((p, i) => llegada(resto[i] ?? null, t, p)), evitar: cerradosRef.current })
          items = { ...items, [t]: { seconds: j.seconds, length: j.length } }
        } catch {
          items = { ...items, [t]: 'error' }
        }
        await new Promise((r) => setTimeout(r, 600))
      }
      setCmp({ key: k, items })
    }
  }
  const cmpVisible = cmp && cmp.key === placesKey ? cmp : null

  // Empezar: se navega a la primera parada y las demás quedan encadenadas
  const destinos = [...paradas.map((l) => l.codigo), ...(hasta ? [hasta.codigo] : [])]
  const empezar = () => {
    const url = destinos.length ? rutaNavegacion(destinos[0], destinos.slice(1)) : null
    if (url) navigate(url)
  }
  const guardar = async () => {
    if (!plan || !hasta?.bancal) return
    await addRuta({ nombre: `Desde ${desde?.nombre ?? 'otro punto'}`, bancalId: hasta.bancal.id, puntos: simplify(plan.points, 2), origen: 'dibujado' })
    toast.show(`Ruta guardada en «${hasta.bancal.nombre}». Elígela en Opciones al navegar a pie.`)
  }
  const descargar = async () => {
    if (!plan) return
    toast.show('Descargando el mapa de la ruta…')
    const r = await descargarRuta(plan.points, `Ruta a ${hasta?.nombre ?? 'destino'}`, settings.capa)
    toast.show(resultadoDescarga(r, 'Mapa de la ruta guardado para usarlo sin cobertura'), { duration: 6000 })
  }

  // Encuadre: la ruta cuando está calculada; si no, los lugares elegidos
  const lugaresPts = [desde?.p, ...paradas.map((l) => l.p), hasta?.p].filter((p): p is LatLon => !!p)
  const fitPts = plan ? plan.points : lugaresPts.length ? lugaresPts : null
  const fitKey = plan ? `plan-${res.key}-${alt}` : `lugares-${fromKey}-${viaKey}-${toKey}`

  const ver = (l: Lugar | null, campo: Campo) => {
    const etiqueta = campo === 'desde' ? 'Desde' : campo === 'hasta' ? 'Hasta' : `Parada ${(campo as number) + 1}`
    return (
      <div className={`plan-field ${eligiendo === campo || enMapa === campo ? 'on' : ''}`} key={String(campo)}>
        <button className="plan-pick" onClick={() => setEligiendo(campo)}>
          {typeof campo === 'number' ? <span className="plan-num">{campo + 1}</span> : <span className={`plan-dot ${campo}`} />}
          <span className="grow">
            <span className="plan-label">{etiqueta}</span>
            <span className="plan-value ellipsis">{l ? (l.codigo === 'yo' && !l.p ? 'Tu ubicación (esperando GPS…)' : l.nombre) : 'Elige destino'}</span>
          </span>
        </button>
        {typeof campo === 'number' && <button className="icon-btn plain" aria-label={`Quitar la parada ${campo + 1}`} onClick={() => quitarParada(campo)}><X size={18} /></button>}
      </div>
    )
  }
  const textoMapa = enMapa === 'desde' ? 'la salida' : enMapa === 'hasta' ? 'el destino' : 'la parada'

  return (
    <div className="nav-screen journey-screen plan-screen">
      <header className="nav-head">
        <button className="icon-btn plain" aria-label="Cerrar" onClick={() => back('/')}><X size={25} /></button>
        <div className="grow"><div className="t">Planificar ruta</div><div className="meta">Prepárala antes de salir</div></div>
      </header>
      <div className="plan-fields">
        <div className="grow plan-stack">
          {ver(desde, 'desde')}
          {paradas.map((l, i) => ver(l, i))}
          {ver(hasta, 'hasta')}
          <div className="row" style={{ gap: 6 }}>
            {paradaCodigos.length < MAX_PARADAS && <button className="btn small" onClick={() => setEligiendo('nueva')}><Plus size={16} /> Añadir parada</button>}
            {paradas.length >= 2 && <button className="btn small" disabled={busy} onClick={() => void run(ordenar)}><ListOrdered size={16} /> {busy ? 'Ordenando…' : 'Ordenar paradas'}</button>}
          </div>
        </div>
        <button className="icon-btn float" aria-label="Intercambiar salida y destino" onClick={invertir}><ArrowDownUp size={20} /></button>
      </div>
      <div className="journey-transports"><TransportPicker value={transport} onChange={(v) => { setAlt(0); void setSetting('transporte', v) }} /></div>
      <div className="journey-map">
        <MapView
          capa={settings.capa}
          bancales={bancales}
          coche={settings.coche ? [settings.coche.lat, settings.coche.lon] : null}
          punto={hasta && !hasta.bancal && hasta.codigo !== 'coche' && hasta.codigo !== 'yo' ? hasta.p : null}
          origen={desde && desde.codigo !== 'yo' ? desde.p : null}
          paradas={paradas.map((l) => l.p!)}
          marcas={marcas}
          user={fix}
          route={plan?.points ?? null}
          selectedId={hasta?.bancal?.id}
          initial={settings.vista ? { center: [settings.vista.lat, settings.vista.lon], zoom: settings.vista.zoom } : null}
          fit={fitPts}
          fitKey={fitKey}
          onTap={enMapa !== null ? (p) => poner(enMapa, codigoLugar({ tipo: 'punto', p })) : undefined}
          onBancalClick={enMapa !== null ? (b) => poner(enMapa, codigoLugar({ tipo: 'bancal', id: b.id })) : undefined}
        />
        {enMapa !== null && <div className="plan-hint float" role="status"><MousePointerClick size={18} /> Toca el mapa o un sitio para elegir {textoMapa}<button className="btn small" onClick={() => setEnMapa(null)}>Cancelar</button></div>}
      </div>
      <section className="journey-panel">
        {!hasta ? (
          <p className="meta">Elige a dónde quieres ir. Puedes salir de tu posición, del coche, de un sitio guardado o de cualquier punto del mapa, y añadir paradas por el camino.</p>
        ) : error ? (
          <><p className="journey-note" role="alert">{error}</p><button className="btn block" onClick={() => setAttempt((a) => a + 1)}>Reintentar</button></>
        ) : (
          <>
            <div className="row between">
              <div>
                <strong className="journey-time num">{plan ? formatDuration(plan.seconds) : '—'}</strong>
                <div className="meta num">{loading ? 'Calculando ruta…' : plan ? `${formatDistance(plan.length)} · ${TRANSPORT_LABELS[transport].toLowerCase()}${paradas.length ? ` · ${paradas.length} ${paradas.length === 1 ? 'parada' : 'paradas'}` : ''}${plan.fuente === 'local' ? ' · caminos del móvil, sin conexión' : ''}` : desde?.p ? '' : 'Esperando tu posición GPS'}</div>
              </div>
              {plan && !!plan.steps.length && <button className="btn small" onClick={() => setStepsOpen(true)}>Indicaciones</button>}
            </div>
            {plans.length > 1 && (
              <div className="plan-compare" role="group" aria-label="Rutas posibles" style={{ gridTemplateColumns: `repeat(${plans.length}, 1fr)` }}>
                {plans.map((p, i) => (
                  <button key={i} aria-pressed={i === alt} onClick={() => setAlt(i)}>
                    <span>{i === 0 ? 'Más rápida' : `Otra ${i}`}</span>
                    <strong className="num">{formatDuration(p.seconds)}</strong>
                    <span className="num">{formatDistance(p.length)}</span>
                  </button>
                ))}
              </div>
            )}
            {cerrados.length > 0 && plan && <p className="meta">{cerrados.length === 1 ? 'Se evita el paso cerrado marcado' : `Se evitan los ${cerrados.length} pasos cerrados marcados`}.</p>}
            {plan?.fuente === 'local' && <p className="journey-note">Sin conexión: ruta por los caminos guardados. Puede pasar campo a través y no comprueba accesos.</p>}
            {plan && navigator.onLine && (
              cmpVisible ? (
                <div className="plan-compare" role="group" aria-label="Comparar transportes">
                  {TODOS.map((t) => {
                    const it = cmpVisible.items[t]
                    return (
                      <button key={t} aria-pressed={t === transport} onClick={() => { setAlt(0); void setSetting('transporte', t) }}>
                        <span>{TRANSPORT_LABELS[t]}</span>
                        <strong className="num">{it === undefined ? '…' : it === 'error' ? '—' : formatDuration(it.seconds)}</strong>
                        <span className="num">{it && it !== 'error' ? formatDistance(it.length) : ''}</span>
                      </button>
                    )
                  })}
                </div>
              ) : (
                <button className="btn block" onClick={() => void comparar()}>Comparar a pie, coche, bici y patinete</button>
              )
            )}
            {desde && desde.codigo !== 'yo' && <p className="meta">Al empezar, la navegación sale de donde estés en ese momento{paradas.length ? ' y va parada a parada' : ''}.</p>}
            {alt > 0 && <p className="meta">Al navegar se calcula la ruta más rápida desde tu posición; puedes cambiar a otra en Opciones.</p>}
            <div className="row">
              <button className="btn primary block" disabled={!hasta.p || hasta.codigo === 'yo'} onClick={empezar}><Navigation size={18} /> {hasta.codigo === 'yo' ? 'El destino es tu ubicación' : paradas.length ? `Empezar por la parada 1` : 'Empezar'}</button>
            </div>
            <div className="row">
              {hasta.bancal && transport === 'pie' && !paradas.length && <button className="btn block" disabled={!plan} onClick={() => void guardar()}><Save size={18} /> Guardar en el sitio</button>}
              <button className="btn block" disabled={!plan || !navigator.onLine} onClick={() => void descargar()}><Download size={18} /> Mapa sin cobertura</button>
            </div>
          </>
        )}
      </section>
      {eligiendo !== null && (
        <LugarSheet
          titulo={eligiendo === 'desde' ? '¿Desde dónde?' : eligiendo === 'hasta' ? '¿A dónde?' : eligiendo === 'nueva' ? 'Añadir parada' : `Parada ${eligiendo + 1}`}
          conYo={eligiendo === 'desde' || eligiendo === 'hasta'}
          bancales={bancales}
          recientes={settings.recientes}
          coche={!!settings.coche}
          onClose={() => setEligiendo(null)}
          onPick={(c) => poner(eligiendo, c)}
          onMapa={() => {
            setEnMapa(eligiendo)
            setEligiendo(null)
          }}
        />
      )}
      {stepsOpen && plan && (
        <Sheet title="Indicaciones" onClose={() => setStepsOpen(false)}>
          <p className="meta">{formatDistance(plan.length)} · {formatDuration(plan.seconds)}{plan.fuente === 'calles' ? ' · datos de OpenStreetMap / Valhalla' : ''}</p>
          <ol className="route-steps">{plan.steps.map((s, i) => <li key={i}><span>{s}</span></li>)}</ol>
        </Sheet>
      )}
    </div>
  )
}

function LugarSheet({ titulo, conYo, bancales, recientes, coche, onClose, onPick, onMapa }: { titulo: string; conYo: boolean; bancales: Bancal[]; recientes: string[]; coche: boolean; onClose: () => void; onPick: (codigo: string) => void; onMapa: () => void }) {
  const [q, setQ] = useState('')
  const coords = leerCoordenadas(q)
  const lista = useMemo(() => {
    const rank = (b: Bancal) => (b.favorito ? 0 : recientes.includes(b.id) ? 1 : 2)
    return bancales
      .filter((b) => !q || norm(`${b.nombre} ${b.finca ?? ''} ${b.nota ?? ''}`).includes(norm(q)))
      .sort((a, b) => rank(a) - rank(b) || (rank(a) === 1 ? recientes.indexOf(a.id) - recientes.indexOf(b.id) : a.nombre.localeCompare(b.nombre, 'es')))
  }, [bancales, q, recientes])
  const fijo = [
    { codigo: 'yo', icon: LocateFixed, titulo: 'Tu ubicación', show: conYo },
    { codigo: 'coche', icon: Car, titulo: 'El coche', show: coche },
  ]
  return (
    <Sheet title={titulo} onClose={onClose} full>
      <div className="search">
        <Search size={19} />
        <input className="input" type="search" aria-label="Buscar sitio o pegar coordenadas" placeholder="Sitio, zona o coordenadas…" value={q} onChange={(e) => setQ(e.target.value)} />
        <MicButton onText={setQ} />
      </div>
      <section className="card flush list">
        {coords && (
          <button className="list-item" onClick={() => onPick(codigoLugar({ tipo: 'punto', p: coords }))}>
            <span className="tile sm none"><ClipboardPaste size={18} /></span>
            <div className="grow"><div className="primary-line">Usar estas coordenadas</div><div className="secondary-line num">{coords[0].toFixed(5)}, {coords[1].toFixed(5)}</div></div>
          </button>
        )}
        {!q && fijo.filter((f) => f.show).map((f) => (
          <button key={f.codigo} className="list-item" onClick={() => onPick(f.codigo)}>
            <span className="tile sm none"><f.icon size={18} /></span>
            <div className="grow primary-line">{f.titulo}</div>
          </button>
        ))}
        {!q && (
          <button className="list-item" onClick={onMapa}>
            <span className="tile sm none"><MapPin size={18} /></span>
            <div className="grow"><div className="primary-line">Elegir en el mapa</div><div className="secondary-line">Toca cualquier punto o sitio</div></div>
          </button>
        )}
      </section>
      {lista.length ? (
        <section className="card flush list">
          {lista.map((b) => (
            <button key={b.id} className="list-item" onClick={() => onPick(codigoLugar({ tipo: 'bancal', id: b.id }))}>
              <span className="tile sm solid" style={{ '--c': b.color } as React.CSSProperties}>{b.favorito && <Star size={14} fill="currentColor" />}</span>
              <div className="grow">
                <div className="primary-line ellipsis">{b.nombre}</div>
                <div className="secondary-line ellipsis">{[b.favorito ? 'Favorito' : recientes.includes(b.id) ? 'Reciente' : '', b.finca].filter(Boolean).join(' · ')}</div>
              </div>
            </button>
          ))}
        </section>
      ) : q && !coords ? (
        <p className="empty">Nada coincide con «{q}»</p>
      ) : null}
    </Sheet>
  )
}
