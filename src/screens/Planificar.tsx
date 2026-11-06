import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowDownUp, Car, ClipboardPaste, Download, LocateFixed, MapPin, MousePointerClick, Navigation, Save, Search, Star, X } from 'lucide-react'
import { MapView } from '../map/MapView'
import { addRuta, setSetting, type Bancal, type Transporte } from '../db/db'
import { formatDistance, simplify, type LatLon } from '../lib/geo'
import { giroTexto, recommend } from '../domain/graph'
import { fetchJourney, formatDuration, TRANSPORT_LABELS } from '../domain/routing'
import { useData } from '../ui/useData'
import { useGraph } from '../ui/graph'
import { usePosition } from '../ui/position'
import { back, navigate, routeParams } from '../ui/router'
import { useToast } from '../ui/toast'
import { codigoLugar, irAPunto, leerCoordenadas, resolverLugar, type Lugar } from '../ui/destino'
import { descargarRuta } from '../ui/offline'
import { Sheet } from '../ui/components'
import { TransportPicker } from '../ui/TransportPicker'

type Campo = 'desde' | 'hasta'

interface Plan {
  points: LatLon[]
  length: number
  seconds: number
  steps: string[]
  /** calles = servidor de rutas; local = caminos guardados en el móvil, sin conexión */
  fuente: 'calles' | 'local'
}

const TODOS: Transporte[] = ['pie', 'coche', 'bici', 'patinete']
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/**
 * Planificar una ruta de un punto a otro antes de salir: desde tu posición, el coche, un sitio o un punto del mapa.
 * Se puede comparar el tiempo por transporte, ver las indicaciones, guardar la ruta y bajar su mapa para sin cobertura.
 */
export function PlanScreen({ route }: { route: string }) {
  const { bancales, settings } = useData()
  const { graph } = useGraph()
  const { fix } = usePosition()
  const toast = useToast()
  const query = routeParams(route).toString()
  const params = useMemo(() => new URLSearchParams(query), [query])
  const transport = settings.transporte
  const miPos = fix?.p ?? null
  const desde = resolverLugar(params.get('desde') ?? 'yo', bancales, settings.coche, miPos, transport)
  const hasta = resolverLugar(params.get('hasta'), bancales, settings.coche, miPos, transport)
  const [eligiendo, setEligiendo] = useState<Campo | null>(null)
  const [enMapa, setEnMapa] = useState<Campo | null>(null)
  const [stepsOpen, setStepsOpen] = useState(false)
  const [attempt, setAttempt] = useState(0)

  const poner = (campo: Campo, codigo: string) => {
    const q = new URLSearchParams(params)
    q.set(campo, codigo)
    navigate(`/planificar?${q}`, true)
    setEligiendo(null)
    setEnMapa(null)
  }
  const invertir = () => {
    const q = new URLSearchParams(params)
    q.set('desde', params.get('hasta') ?? 'yo')
    if (params.get('desde') && params.get('desde') !== 'yo') q.set('hasta', params.get('desde')!)
    else q.set('hasta', 'yo')
    navigate(`/planificar?${q}`, true)
  }

  // Tu posición cambia sin parar: la ruta solo se recalcula cuando cambian los lugares, no a cada lectura del GPS
  const fromKey = desde?.p ? (desde.codigo === 'yo' ? 'yo' : desde.p.join(',')) : ''
  const toKey = hasta?.p ? (hasta.codigo === 'yo' ? 'yo' : hasta.p.join(',')) : ''
  const ends = useRef<{ from: LatLon | null; to: LatLon | null }>({ from: null, to: null })
  useEffect(() => {
    ends.current = { from: desde?.p ?? null, to: hasta?.p ?? null }
  })
  const { servidorRutas, evitarPeajes, evitarAutopistas, velocidadPatinete } = settings
  const placesKey = fromKey && toKey ? `${fromKey}/${toKey}/${attempt}` : ''
  const key = fromKey && toKey ? `${fromKey}/${toKey}/${transport}/${servidorRutas}/${evitarPeajes}/${evitarAutopistas}/${velocidadPatinete}/${attempt}` : ''
  const [res, setRes] = useState<{ key: string; plan: Plan | null; error: string | null }>({ key: '', plan: null, error: null })
  useEffect(() => {
    const { from, to } = ends.current
    if (!key || !from || !to) return
    const ctrl = new AbortController()
    const options = { servidorRutas, evitarPeajes, evitarAutopistas, velocidadPatinete }
    void (async () => {
      try {
        if (!navigator.onLine) throw new Error('sin conexión')
        const j = await fetchJourney(from, to, transport, options, ctrl.signal)
        setRes({ key, plan: { points: j.points, length: j.length, seconds: j.seconds, steps: j.steps.map((s) => s.instruction), fuente: 'calles' }, error: null })
      } catch (error) {
        if (ctrl.signal.aborted) return
        if (transport === 'pie') {
          // A pie se puede planificar sin conexión con la red de caminos guardada en el móvil
          const r = recommend(graph, from, to)
          setRes({ key, plan: { points: r.points, length: r.length, seconds: r.length / (4.5 / 3.6), steps: r.steps.map((s) => giroTexto(s.giro)), fuente: 'local' }, error: null })
        } else {
          setRes({ key, plan: null, error: navigator.onLine ? (error instanceof Error ? error.message : 'No se ha podido calcular la ruta') : 'Necesitas conexión para planificar en coche, bici o patinete.' })
        }
      }
    })()
    return () => ctrl.abort()
  }, [key, transport, graph, servidorRutas, evitarPeajes, evitarAutopistas, velocidadPatinete])
  const loading = !!key && res.key !== key
  const plan = res.key === key ? res.plan : null
  const error = res.key === key ? res.error : null

  // Comparar transportes: tiempo y distancia de cada uno (consultas en fila para no saturar el servidor)
  const [cmp, setCmp] = useState<{ key: string; items: Partial<Record<Transporte, { seconds: number; length: number } | 'error'>> } | null>(null)
  const comparar = async () => {
    const { from, to } = ends.current
    if (!from || !to || !key) return
    const k = placesKey
    const options = { servidorRutas, evitarPeajes, evitarAutopistas, velocidadPatinete }
    let items: Partial<Record<Transporte, { seconds: number; length: number } | 'error'>> = {}
    setCmp({ key: k, items })
    for (const t of TODOS) {
      if (t === transport && plan?.fuente === 'calles') items = { ...items, [t]: { seconds: plan.seconds, length: plan.length } }
      else {
        try {
          const j = await fetchJourney(from, to, t, options)
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

  const empezar = () => {
    if (!hasta) return
    if (hasta.bancal) navigate(`/ir/${hasta.bancal.id}`)
    else if (hasta.codigo === 'coche') navigate('/ir/coche')
    else if (hasta.p) navigate(irAPunto(hasta.p, hasta.nombre))
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
    toast.show(r.estado === 'terminada' ? 'Mapa de la ruta guardado para usarlo sin cobertura' : 'No se ha podido terminar la descarga')
  }

  // Encuadre: la ruta cuando está calculada; si no, la salida y el destino
  const lugaresPts = [desde?.p, hasta?.p].filter((p): p is LatLon => !!p)
  const fitPts = plan ? plan.points : lugaresPts.length ? lugaresPts : null
  const fitKey = plan ? `plan-${res.key}` : `lugares-${fromKey}-${toKey}`

  const ver = (l: Lugar | null, campo: Campo) => (
    <button className={`plan-field ${eligiendo === campo || enMapa === campo ? 'on' : ''}`} onClick={() => setEligiendo(campo)}>
      <span className={`plan-dot ${campo}`} />
      <span className="grow">
        <span className="plan-label">{campo === 'desde' ? 'Desde' : 'Hasta'}</span>
        <span className="plan-value ellipsis">{l ? (l.codigo === 'yo' && !l.p ? 'Tu ubicación (esperando GPS…)' : l.nombre) : 'Elige destino'}</span>
      </span>
    </button>
  )

  return (
    <div className="nav-screen journey-screen plan-screen">
      <header className="nav-head">
        <button className="icon-btn plain" aria-label="Cerrar" onClick={() => back('/')}><X size={25} /></button>
        <div className="grow"><div className="t">Planificar ruta</div><div className="meta">Prepárala antes de salir</div></div>
      </header>
      <div className="plan-fields">
        <div className="grow plan-stack">{ver(desde, 'desde')}{ver(hasta, 'hasta')}</div>
        <button className="icon-btn float" aria-label="Intercambiar salida y destino" onClick={invertir}><ArrowDownUp size={20} /></button>
      </div>
      <div className="journey-transports"><TransportPicker value={transport} onChange={(v) => void setSetting('transporte', v)} /></div>
      <div className="journey-map">
        <MapView
          capa={settings.capa}
          bancales={bancales}
          coche={settings.coche ? [settings.coche.lat, settings.coche.lon] : null}
          punto={hasta && !hasta.bancal && hasta.codigo !== 'coche' && hasta.codigo !== 'yo' ? hasta.p : null}
          origen={desde && desde.codigo !== 'yo' ? desde.p : null}
          user={fix}
          route={plan?.points ?? null}
          selectedId={hasta?.bancal?.id}
          initial={settings.vista ? { center: [settings.vista.lat, settings.vista.lon], zoom: settings.vista.zoom } : null}
          fit={fitPts}
          fitKey={fitKey}
          onTap={enMapa ? (p) => poner(enMapa, codigoLugar({ tipo: 'punto', p })) : undefined}
          onBancalClick={enMapa ? (b) => poner(enMapa, codigoLugar({ tipo: 'bancal', id: b.id })) : undefined}
        />
        {enMapa && <div className="plan-hint float" role="status"><MousePointerClick size={18} /> Toca el mapa o un sitio para elegir {enMapa === 'desde' ? 'la salida' : 'el destino'}<button className="btn small" onClick={() => setEnMapa(null)}>Cancelar</button></div>}
      </div>
      <section className="journey-panel">
        {!hasta ? (
          <p className="meta">Elige a dónde quieres ir. Puedes salir de tu posición, del coche, de un sitio guardado o de cualquier punto del mapa.</p>
        ) : error ? (
          <><p className="journey-note" role="alert">{error}</p><button className="btn block" onClick={() => setAttempt((a) => a + 1)}>Reintentar</button></>
        ) : (
          <>
            <div className="row between">
              <div>
                <strong className="journey-time num">{plan ? formatDuration(plan.seconds) : '—'}</strong>
                <div className="meta num">{loading ? 'Calculando ruta…' : plan ? `${formatDistance(plan.length)} · ${TRANSPORT_LABELS[transport].toLowerCase()}${plan.fuente === 'local' ? ' · caminos del móvil, sin conexión' : ''}` : desde?.p ? '' : 'Esperando tu posición GPS'}</div>
              </div>
              {plan && !!plan.steps.length && <button className="btn small" onClick={() => setStepsOpen(true)}>Indicaciones</button>}
            </div>
            {plan?.fuente === 'local' && <p className="journey-note">Sin conexión: ruta por los caminos guardados. Puede pasar campo a través y no comprueba accesos.</p>}
            {plan && navigator.onLine && (
              cmpVisible ? (
                <div className="plan-compare" role="group" aria-label="Comparar transportes">
                  {TODOS.map((t) => {
                    const it = cmpVisible.items[t]
                    return (
                      <button key={t} aria-pressed={t === transport} onClick={() => void setSetting('transporte', t)}>
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
            {desde && desde.codigo !== 'yo' && <p className="meta">Al empezar, la navegación sale de donde estés en ese momento.</p>}
            <div className="row">
              <button className="btn primary block" disabled={!hasta.p || hasta.codigo === 'yo'} onClick={empezar}><Navigation size={18} /> {hasta.codigo === 'yo' ? 'El destino es tu ubicación' : 'Empezar'}</button>
            </div>
            <div className="row">
              {hasta.bancal && transport === 'pie' && <button className="btn block" disabled={!plan} onClick={() => void guardar()}><Save size={18} /> Guardar en el sitio</button>}
              <button className="btn block" disabled={!plan || !navigator.onLine} onClick={() => void descargar()}><Download size={18} /> Mapa sin cobertura</button>
            </div>
          </>
        )}
      </section>
      {eligiendo && (
        <LugarSheet
          campo={eligiendo}
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

function LugarSheet({ campo, bancales, recientes, coche, onClose, onPick, onMapa }: { campo: Campo; bancales: Bancal[]; recientes: string[]; coche: boolean; onClose: () => void; onPick: (codigo: string) => void; onMapa: () => void }) {
  const [q, setQ] = useState('')
  const coords = leerCoordenadas(q)
  const lista = useMemo(() => {
    const rank = (b: Bancal) => (b.favorito ? 0 : recientes.includes(b.id) ? 1 : 2)
    return bancales
      .filter((b) => !q || norm(`${b.nombre} ${b.finca ?? ''} ${b.nota ?? ''}`).includes(norm(q)))
      .sort((a, b) => rank(a) - rank(b) || (rank(a) === 1 ? recientes.indexOf(a.id) - recientes.indexOf(b.id) : a.nombre.localeCompare(b.nombre, 'es')))
  }, [bancales, q, recientes])
  const fijo = [
    { codigo: 'yo', icon: LocateFixed, titulo: 'Tu ubicación', show: true },
    { codigo: 'coche', icon: Car, titulo: 'El coche', show: coche },
  ]
  return (
    <Sheet title={campo === 'desde' ? '¿Desde dónde?' : '¿A dónde?'} onClose={onClose} full>
      <div className="search">
        <Search size={19} />
        <input className="input" type="search" aria-label="Buscar sitio o pegar coordenadas" placeholder="Sitio, zona o coordenadas…" value={q} onChange={(e) => setQ(e.target.value)} />
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
