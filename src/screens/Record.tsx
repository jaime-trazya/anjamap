import { useEffect, useRef, useState } from 'react'
import { Pause, Play, Square, Trash2, TriangleAlert } from 'lucide-react'
import { MapView } from '../map/MapView'
import { addCamino, addRuta, type TipoCamino } from '../db/db'
import { distance, formatDistance, isLatLon, pathLength, simplify, type LatLon } from '../lib/geo'
import { useData } from '../ui/useData'
import { usePosition } from '../ui/position'
import { useWakeLock } from '../ui/wakelock'
import { back, navigate, routeParams } from '../ui/router'
import { useToast } from '../ui/toast'
import { Empty, Notice, Segmented, Sheet, Stat } from '../ui/components'
import { TIPOS } from '../domain/constants'
import { tramos } from '../domain/track'
import { useAction } from '../ui/useAction'

const DRAFT_KEY = 'anjamap-grabacion'
/** Lecturas peores que esto no se apuntan */
const MAX_ACC = 25
const MIN_STEP = 3
/** Si al seguir tras una pausa estás más lejos que esto, el hueco no se une en línea recta */
const GAP = 25

interface Draft {
  tipo: 'camino' | 'ruta'
  bancalId: string | null
  puntos: LatLon[]
  t0: number
  /** Índice del primer punto tras la última pausa (aún sin apuntar) */
  pausa?: number
  /** Índices donde empieza un tramo nuevo porque durante la pausa te moviste */
  cortes?: number[]
}

/** Cada grabación pendiente se guarda aparte (un camino, o la ruta de cada bancal): empezar otra no la pisa */
const draftKey = (tipo: Draft['tipo'], bancalId: string | null) => `${DRAFT_KEY}:${tipo}:${bancalId ?? ''}`

function parseDraft(s: string | null): Draft | null {
  if (!s) return null
  const d = JSON.parse(s) as Draft
  return d && (d.tipo === 'camino' || d.tipo === 'ruta') && (d.bancalId === null || typeof d.bancalId === 'string') &&
    Array.isArray(d.puntos) && d.puntos.every(isLatLon) && Number.isFinite(d.t0) &&
    (d.cortes === undefined || (Array.isArray(d.cortes) && d.cortes.every((i) => Number.isInteger(i) && i > 0 && i < d.puntos.length))) ? d : null
}

function loadDraft(tipo: Draft['tipo'], bancalId: string | null): Draft | null {
  try {
    const d = parseDraft(localStorage.getItem(draftKey(tipo, bancalId)))
    if (d) return d
    // Grabación de versiones anteriores (una sola para todo): se recupera si es de este mismo camino o ruta
    const old = parseDraft(localStorage.getItem(DRAFT_KEY))
    if (old && old.tipo === tipo && old.bancalId === bancalId) {
      localStorage.setItem(draftKey(tipo, bancalId), JSON.stringify(old))
      localStorage.removeItem(DRAFT_KEY)
      return old
    }
    return null
  } catch {
    return null
  }
}
function saveDraft(tipo: Draft['tipo'], bancalId: string | null, d: Draft | null) {
  try {
    if (d) localStorage.setItem(draftKey(tipo, bancalId), JSON.stringify(d))
    else localStorage.removeItem(draftKey(tipo, bancalId))
  } catch {
    /* sin almacenamiento local: la grabación sigue en memoria */
  }
}

export function RecordScreen({ route }: { route: string }) {
  const params = routeParams(route)
  const tipo = params.get('tipo') === 'ruta' ? 'ruta' : 'camino'
  const bancalId = params.get('bancal')
  const { bancales, caminos, settings } = useData()
  const toast = useToast()
  const { busy, run } = useAction()
  const bancal = bancalId ? bancales.find((b) => b.id === bancalId) : undefined
  const { fix, error } = usePosition()
  useWakeLock()

  const [draft, setDraft] = useState<Draft>(() => {
    const d = loadDraft(tipo, bancalId ?? null)
    if (d && d.puntos.length) return { ...d, pausa: d.puntos.length }
    return { tipo, bancalId: bancalId ?? null, puntos: [], t0: Date.now() }
  })
  const [paused, setPaused] = useState(false)
  const [finishing, setFinishing] = useState(false)
  const [nombre, setNombre] = useState('')
  const [tipoCamino, setTipoCamino] = useState<TipoCamino>('senda')
  const [now, setNow] = useState(() => Date.now())
  // Solo cuentan lecturas posteriores a abrir esta pantalla (la última posición guardada puede ser de otro sitio)
  const [openedAt] = useState(() => Date.now())
  const lastT = useRef(0)

  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(t)
  }, [])

  // Apuntar puntos nuevos
  useEffect(() => {
    if (!fix || paused || finishing || fix.acc > MAX_ACC || fix.t === lastT.current || fix.t < openedAt - 1000) return
    lastT.current = fix.t
    setDraft((d) => {
      const last = d.puntos[d.puntos.length - 1]
      if (last && distance(last, fix.p) < Math.max(MIN_STEP, fix.acc / 3)) return d
      // Primer punto tras una pausa: si te has movido, empieza un tramo nuevo en vez de unirlo en línea recta
      const corte = d.pausa === d.puntos.length && !!last && distance(last, fix.p) > Math.max(GAP, fix.acc * 2)
      const next: Draft = { ...d, puntos: [...d.puntos, fix.p], pausa: undefined, cortes: corte ? [...(d.cortes ?? []), d.puntos.length] : d.cortes }
      saveDraft(d.tipo, d.bancalId, next)
      return next
    })
  }, [fix, paused, finishing, openedAt])
  const pausar = () => {
    if (!paused) setDraft((d) => ({ ...d, pausa: d.puntos.length }))
    setPaused((p) => !p)
  }
  const partes = tramos(draft.puntos, draft.cortes)
  const huecos = (draft.cortes ?? []).reduce((a, c) => a + distance(draft.puntos[c - 1], draft.puntos[c]), 0)

  const len = partes.reduce((a, t) => a + pathLength(t), 0)
  const mins = Math.floor((now - draft.t0) / 60000)
  const endGap = bancal && draft.puntos.length ? distance(draft.puntos[draft.puntos.length - 1], [bancal.lat, bancal.lon]) : 0

  const descartar = async () => {
    if (draft.puntos.length > 2 && !(await toast.confirm({ title: '¿Descartar la grabación?', confirmLabel: 'Descartar', danger: true }))) return
    saveDraft(tipo, bancalId ?? null, null)
    back(tipo === 'ruta' && bancalId ? `/bancal/${bancalId}` : '/caminos')
  }

  const guardar = async () => {
    if (tipo === 'ruta' && bancal) {
      // La ruta tiene que ser continua para seguirla: los huecos se unen y se avisa antes de guardar
      const puntos = simplify(draft.puntos, 1.5)
      if (puntos.length < 2) return
      await addRuta({ nombre: nombre.trim() || `Ruta a ${bancal.nombre}`, bancalId: bancal.id, puntos, origen: 'grabado' })
      toast.show('Ruta guardada')
      saveDraft(tipo, bancal.id, null)
      navigate(`/bancal/${bancal.id}`, true)
      return
    }
    // Un camino por tramo: no se inventa el recorrido que no se ha grabado durante una pausa
    if (!partes.length) return
    const base = nombre.trim() || `Camino ${caminos.length + 1}`
    const ids: string[] = []
    for (const [i, t] of partes.entries()) {
      ids.push(await addCamino({ nombre: partes.length > 1 ? `${base} (${i + 1})` : base, tipo: tipoCamino, puntos: simplify(t, 1.5), origen: 'grabado' }))
    }
    toast.show(partes.length > 1 ? `Guardados ${partes.length} tramos` : 'Camino guardado')
    saveDraft(tipo, null, null)
    navigate(partes.length > 1 ? '/caminos' : `/camino/${ids[0]}`, true)
  }

  if (tipo === 'ruta' && !bancal) {
    return <main className="screen sub"><Empty title="Este bancal ya no existe" action={<button className="btn" onClick={() => navigate('/bancales', true)}>Volver a bancales</button>} /></main>
  }

  return (
    <div className="nav-screen">
      <header className="nav-head">
        <button className="icon-btn plain" aria-label="Descartar" onClick={() => void descartar()}>
          <Trash2 size={21} />
        </button>
        <div className="grow" style={{ textAlign: 'center' }}>
          <div className="t ellipsis">{tipo === 'ruta' ? `Grabando ruta${bancal ? ` a ${bancal.nombre}` : ''}` : 'Grabando camino'}</div>
          <div className="meta row" style={{ justifyContent: 'center', gap: 6 }}>
            {!paused && <span className="rec-dot" />}
            {paused ? 'En pausa' : 'Grabando: anda por el camino'}
          </div>
        </div>
        <span style={{ width: 44 }} />
      </header>

      <div className="rec-map">
        <MapView capa={settings.capa} bancales={bancal ? [bancal] : bancales} caminos={caminos} draft={draft.puntos} user={fix} follow initial={{ center: fix?.p ?? (bancal ? [bancal.lat, bancal.lon] : draft.puntos[0] ?? [39.0, -0.7]), zoom: 18 }} selectedId={bancal?.id} />
      </div>

      <section className="rec-panel">
        {error === 'denegado' && (
          <Notice tone="neg" icon={<TriangleAlert size={20} />} title="Sin permiso de ubicación">
            Actívalo en los ajustes del teléfono para poder grabar.
          </Notice>
        )}
        <div className="stats">
          <Stat label="Distancia" value={formatDistance(len)} meta={`${draft.puntos.length} puntos`} />
          <Stat label="Tiempo" value={`${mins} min`} meta={fix ? `GPS ±${Math.round(fix.acc)} m${fix.acc > MAX_ACC ? ' (esperando más precisión)' : ''}` : 'Buscando GPS…'} />
        </div>
        <p className="meta">Mantén la app abierta y la pantalla encendida: con la app cerrada el teléfono no apunta el recorrido.</p>
        <div className="row">
          <button className="btn block" onClick={pausar}>
            {paused ? <Play size={18} /> : <Pause size={18} />} {paused ? 'Seguir' : 'Pausa'}
          </button>
          <button className="btn primary block" disabled={draft.puntos.length < 2} onClick={() => setFinishing(true)}>
            <Square size={16} /> Terminar
          </button>
        </div>
      </section>

      {finishing && (
        <Sheet
          title={tipo === 'ruta' ? 'Guardar ruta' : 'Guardar camino'}
          onClose={() => setFinishing(false)}
          footer={
            <button className="btn primary block" disabled={busy} onClick={() => void run(guardar)}>
              {busy ? 'Guardando…' : 'Guardar'}
            </button>
          }
        >
          <p className="muted small">
            {formatDistance(len)} · {draft.puntos.length} puntos
          </p>
          {huecos > 0 && (
            <Notice tone="warn" icon={<TriangleAlert size={20} />} title={`Hay ${formatDistance(huecos)} sin grabar durante las pausas`}>
              {tipo === 'ruta' ? 'Se unirán en línea recta para que la ruta sea continua. Si no es así, descarta y vuelve a grabar ese tramo.' : `Se guardarán ${partes.length} tramos separados, sin inventar el recorrido de la pausa.`}
            </Notice>
          )}
          {tipo === 'ruta' && endGap > 30 && (
            <Notice tone="warn" icon={<TriangleAlert size={20} />} title={`Termina a ${formatDistance(endGap)} del bancal`}>
              Al navegar se añadirá el último tramo en línea recta hasta el bancal.
            </Notice>
          )}
          <label className="field">
            <span>Nombre</span>
            <input className="input" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder={tipo === 'ruta' ? 'Por la acequia' : 'Pista del barranco'} />
          </label>
          {tipo === 'camino' && <Segmented value={tipoCamino} onChange={setTipoCamino} options={TIPOS} label="Tipo de camino" />}
        </Sheet>
      )}
    </div>
  )
}
