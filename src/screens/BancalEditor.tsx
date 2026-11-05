import { useEffect, useMemo, useRef, useState } from 'react'
import { LocateFixed, MapPin, Satellite } from 'lucide-react'
import { db, deleteBancal, uid, type Bancal } from '../db/db'
import { formatCoord, type LatLon } from '../lib/geo'
import { Notice, Sheet } from '../ui/components'
import { useData } from '../ui/useData'
import { capturePoint } from '../ui/position'
import { useToast } from '../ui/toast'
import { navigate } from '../ui/router'
import { autoDetalle } from '../ui/offline'
import type { NewBancalOpts } from '../ui/editor'
import { COLORES, VARIEDADES } from '../domain/constants'
import { useAction } from '../ui/useAction'

type Captura = { estado: 'buscando'; acc: number | null; n: number } | { estado: 'error'; msg: string } | null

export function BancalEditor({ id, opts, onClose }: { id?: string; opts?: NewBancalOpts; onClose: () => void }) {
  const { bancales, rutas, diario, settings } = useData()
  const toast = useToast()
  const { busy, run } = useAction()
  const capture = useRef<AbortController | null>(null)
  const existing = id ? bancales.find((b) => b.id === id) : undefined
  const [nombre, setNombre] = useState(existing?.nombre ?? opts?.nombre ?? `Bancal ${bancales.length + 1}`)
  const [finca, setFinca] = useState(existing?.finca ?? opts?.finca ?? '')
  const [olivos, setOlivos] = useState(existing?.olivos ? String(existing.olivos) : '')
  const [variedad, setVariedad] = useState(existing?.variedad ?? '')
  const [nota, setNota] = useState(existing?.nota ?? '')
  const [color, setColor] = useState(existing?.color ?? opts?.color ?? COLORES[0].color)
  const [point, setPoint] = useState<LatLon | null>(existing ? [existing.lat, existing.lon] : (opts?.point ?? null))
  const [precision, setPrecision] = useState<number | null>(existing ? existing.precision : (opts?.precision ?? null))
  const autoGps = !!opts?.gps && !existing
  const [captura, setCaptura] = useState<Captura>(autoGps ? { estado: 'buscando', acc: null, n: 0 } : null)
  const fincas = useMemo(() => [...new Set(bancales.map((b) => b.finca).filter(Boolean) as string[])].sort(), [bancales])
  const olivosOk = !olivos || (Number.isSafeInteger(Number(olivos)) && Number(olivos) > 0)

  const startCapture = () => {
    capture.current?.abort()
    const controller = new AbortController()
    capture.current = controller
    return capturePoint((f, n) => setCaptura({ estado: 'buscando', acc: f.acc, n }), 12000, 6, controller.signal)
      .then((f) => {
        if (controller.signal.aborted) return
        setPoint(f.p)
        setPrecision(Math.round(f.acc))
        setCaptura(null)
      })
      .catch((e: Error) => {
        if (!controller.signal.aborted) setCaptura({ estado: 'error', msg: e.message })
      })
  }

  const capturar = () => {
    setCaptura({ estado: 'buscando', acc: null, n: 0 })
    void startCapture()
  }

  useEffect(() => {
    if (autoGps) void startCapture()
    return () => capture.current?.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const save = async () => {
    if (!point || !olivosOk) return
    const now = Date.now()
    const b: Bancal = {
      id: existing?.id ?? uid(),
      nombre: nombre.trim() || 'Bancal',
      finca: finca.trim() || undefined,
      nota: nota.trim() || undefined,
      olivos: olivos ? Number(olivos) : undefined,
      variedad: variedad.trim() || undefined,
      lat: point[0],
      lon: point[1],
      precision,
      color,
      creado: existing?.creado ?? now,
      actualizado: now,
    }
    await db.bancales.put(b)
    onClose()
    if (!existing) {
      toast.show(`«${b.nombre}» guardado`, { action: { label: 'Ver', run: () => navigate(`/bancal/${b.id}`) } })
      if (settings.autoDetalle) autoDetalle(b)
    }
  }

  const remove = async () => {
    if (!existing) return
    const n = rutas.filter((r) => r.bancalId === existing.id).length
    const apuntes = diario.filter((a) => a.bancalId === existing.id).length
    const ok = await toast.confirm({
      title: `¿Borrar «${existing.nombre}»?`,
      message: n || apuntes ? `También se borrarán sus ${n} rutas guardadas y ${apuntes} apuntes del diario.` : undefined,
      confirmLabel: 'Borrar',
      danger: true,
    })
    if (!ok) return
    await deleteBancal(existing.id)
    onClose()
    navigate('/bancales', true)
  }

  return (
    <Sheet
      title={existing ? 'Editar bancal' : 'Nuevo bancal'}
      onClose={onClose}
      full
      footer={
        <>
          {existing && (
            <button className="btn danger" disabled={busy} onClick={() => void run(remove)}>
              Borrar
            </button>
          )}
          <button className="btn primary block" disabled={busy || !point || !olivosOk || captura?.estado === 'buscando'} onClick={() => void run(save)}>
            {busy ? 'Guardando…' : 'Guardar'}
          </button>
        </>
      }
    >
      <section className="card stack" style={{ gap: 10 }}>
        <div className="row">
          <span className="tile solid" style={{ '--c': color } as React.CSSProperties}>
            <MapPin size={19} />
          </span>
          <div className="grow">
            <div className="primary-line">Posición</div>
            {captura?.estado === 'buscando' ? (
              <div className="small muted">
                Afinando con el GPS… {captura.acc !== null ? `±${Math.round(captura.acc)} m` : ''} {captura.n ? `(${captura.n} lecturas)` : ''}
              </div>
            ) : point ? (
              <div className="small muted num">
                {formatCoord(point)} · {precision !== null ? `GPS ±${precision} m` : 'marcado en el mapa'}
              </div>
            ) : (
              <div className="small muted">Sin posición</div>
            )}
          </div>
        </div>
        {captura?.estado === 'buscando' && (
          <div className="track indeterminate">
            <i />
          </div>
        )}
        {captura?.estado === 'error' && (
          <Notice tone="neg" icon={<Satellite size={20} />} title="No se ha podido usar el GPS">
            {captura.msg}. Revisa que la app tenga permiso de ubicación.
          </Notice>
        )}
        <button className="btn small block" onClick={capturar} disabled={captura?.estado === 'buscando'}>
          <LocateFixed size={16} /> {point ? 'Usar mi posición actual' : 'Tomar posición GPS'}
        </button>
        <p className="meta">Para más precisión, quédate quieto en el bancal unos segundos mientras se afina.</p>
      </section>

      <label className="field">
        <span>Nombre</span>
        <input className="input" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Bancal de la balsa" />
      </label>
      <label className="field">
        <span>Finca o partida</span>
        <input className="input" value={finca} onChange={(e) => setFinca(e.target.value)} list="fincas" placeholder="Opcional" />
        <datalist id="fincas">
          {fincas.map((f) => (
            <option key={f} value={f} />
          ))}
        </datalist>
      </label>
      <div className="form-grid">
        <label className="field">
          <span>Olivos</span>
          <input className="input num" inputMode="numeric" value={olivos} aria-invalid={!olivosOk} onChange={(e) => setOlivos(e.target.value.replace(/\D/g, ''))} placeholder="Opcional" />
        </label>
        <label className="field">
          <span>Variedad</span>
          <input className="input" value={variedad} onChange={(e) => setVariedad(e.target.value)} list="variedades" placeholder="Opcional" />
          <datalist id="variedades">
            {[...new Set([...bancales.map((b) => b.variedad).filter(Boolean), ...VARIEDADES])].map((v) => (
              <option key={v} value={v} />
            ))}
          </datalist>
        </label>
      </div>
      <label className="field">
        <span>Nota</span>
        <textarea className="textarea" value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Por dónde se entra, riego, lindes…" />
      </label>
      <div className="field">
        <span className="field-label">Color</span>
        <div className="swatches">
          {COLORES.map((c) => (
            <button key={c.color} className="swatch" style={{ background: c.color }} aria-label={c.nombre} aria-pressed={color === c.color} onClick={() => setColor(c.color)} />
          ))}
        </div>
      </div>
    </Sheet>
  )
}
