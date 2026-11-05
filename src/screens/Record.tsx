import { useEffect, useRef, useState } from 'react'
import { Pause, Play, Square, Trash2, TriangleAlert } from 'lucide-react'
import { MapView } from '../map/MapView'
import { addCamino, addRuta, type TipoCamino } from '../db/db'
import { distance, formatDistance, pathLength, simplify, type LatLon } from '../lib/geo'
import { useData } from '../ui/useData'
import { usePosition } from '../ui/position'
import { useWakeLock } from '../ui/wakelock'
import { back, navigate, routeParams } from '../ui/router'
import { useToast } from '../ui/toast'
import { Notice, Segmented, Sheet } from '../ui/components'
import { TIPOS } from '../domain/constants'

const DRAFT_KEY = 'anjamap-grabacion'
/** Lecturas peores que esto no se apuntan */
const MAX_ACC = 25
const MIN_STEP = 3

interface Draft {
  tipo: 'camino' | 'ruta'
  bancalId: string | null
  puntos: LatLon[]
  t0: number
}

function loadDraft(): Draft | null {
  try {
    const s = localStorage.getItem(DRAFT_KEY)
    return s ? (JSON.parse(s) as Draft) : null
  } catch {
    return null
  }
}
function saveDraft(d: Draft | null) {
  try {
    if (d) localStorage.setItem(DRAFT_KEY, JSON.stringify(d))
    else localStorage.removeItem(DRAFT_KEY)
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
  const bancal = bancalId ? bancales.find((b) => b.id === bancalId) : undefined
  const { fix, error } = usePosition()
  useWakeLock()

  const [draft, setDraft] = useState<Draft>(() => {
    const d = loadDraft()
    if (d && d.tipo === tipo && d.bancalId === (bancalId ?? null) && d.puntos.length) return d
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
      const next = { ...d, puntos: [...d.puntos, fix.p] }
      saveDraft(next)
      return next
    })
  }, [fix, paused, finishing, openedAt])

  const len = pathLength(draft.puntos)
  const mins = Math.floor((now - draft.t0) / 60000)
  const endGap = bancal && draft.puntos.length ? distance(draft.puntos[draft.puntos.length - 1], [bancal.lat, bancal.lon]) : 0

  const descartar = async () => {
    if (draft.puntos.length > 2 && !(await toast.confirm({ title: '¿Descartar la grabación?', confirmLabel: 'Descartar', danger: true }))) return
    saveDraft(null)
    back(tipo === 'ruta' && bancalId ? `/bancal/${bancalId}` : '/caminos')
  }

  const guardar = async () => {
    const puntos = simplify(draft.puntos, 1.5)
    if (tipo === 'ruta' && bancal) {
      await addRuta({ nombre: nombre.trim() || `Ruta a ${bancal.nombre}`, bancalId: bancal.id, puntos, origen: 'grabado' })
      toast.show('Ruta guardada')
      saveDraft(null)
      navigate(`/bancal/${bancal.id}`, true)
    } else {
      const id = await addCamino({ nombre: nombre.trim() || `Camino ${caminos.length + 1}`, tipo: tipoCamino, puntos, origen: 'grabado' })
      toast.show('Camino guardado')
      saveDraft(null)
      navigate(`/camino/${id}`, true)
    }
  }

  return (
    <div className="nav-screen">
      <header className="nav-head">
        <button className="icon-btn plain" aria-label="Descartar" onClick={() => void descartar()}>
          <Trash2 size={21} />
        </button>
        <div className="grow" style={{ textAlign: 'center' }}>
          <div style={{ fontWeight: 600 }}>{tipo === 'ruta' ? `Grabando ruta${bancal ? ` a ${bancal.nombre}` : ''}` : 'Grabando camino'}</div>
          <div className="meta">{paused ? 'En pausa' : 'Anda por el camino; se apunta solo'}</div>
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
        <div className="kpis card flush">
          <div className="kpi">
            <div className="card-label">Distancia</div>
            <div className="big-num">{formatDistance(len)}</div>
            <div className="meta">{draft.puntos.length} puntos</div>
          </div>
          <div className="kpi">
            <div className="card-label">Tiempo</div>
            <div className="big-num">{mins} min</div>
            <div className="meta">{fix ? `GPS ±${Math.round(fix.acc)} m${fix.acc > MAX_ACC ? ' (esperando más precisión)' : ''}` : 'Buscando GPS…'}</div>
          </div>
        </div>
        <p className="meta">Mantén la app abierta y la pantalla encendida: con la app cerrada el teléfono no apunta el recorrido.</p>
        <div className="row">
          <button className="btn block" onClick={() => setPaused((p) => !p)}>
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
            <button className="btn primary block" onClick={() => void guardar()}>
              Guardar
            </button>
          }
        >
          <p className="muted small">
            {formatDistance(len)} · {draft.puntos.length} puntos
          </p>
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
