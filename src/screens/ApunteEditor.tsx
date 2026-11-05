import { useState } from 'react'
import { db, saveApunte, type TipoApunte } from '../db/db'
import { APUNTES } from '../domain/constants'
import { fromDateInput, toDateInput } from '../lib/fecha'
import { Sheet } from '../ui/components'
import { ApunteIcon } from '../ui/icons'
import { useData } from '../ui/useData'
import { useToast } from '../ui/toast'
import type { ApunteOpts } from '../ui/editor'

/** Apuntar algo en el diario de un bancal: poda, tratamiento, recolección (con kilos)… */
export function ApunteEditor({ opts, onClose }: { opts: ApunteOpts; onClose: () => void }) {
  const { bancales } = useData()
  const toast = useToast()
  const a = opts.apunte
  const [bancalId, setBancalId] = useState(a?.bancalId ?? opts.bancalId ?? '')
  const [tipo, setTipo] = useState<TipoApunte>(a?.tipo ?? opts.tipo ?? 'visita')
  const [hoy] = useState(() => toDateInput(Date.now()))
  const [fecha, setFecha] = useState(() => (a ? toDateInput(a.fecha) : hoy))
  const [kg, setKg] = useState(a?.kg !== undefined ? String(a.kg) : '')
  const [nota, setNota] = useState(a?.nota ?? '')
  const fijo = !!(a || opts.bancalId)
  const bancal = bancales.find((b) => b.id === bancalId)
  const kgNum = Number(kg.replace(',', '.'))

  const save = async () => {
    if (!bancal || !fecha) return
    await saveApunte({
      id: a?.id,
      bancalId: bancal.id,
      tipo,
      fecha: fromDateInput(fecha),
      kg: tipo === 'recoleccion' && kg.trim() && isFinite(kgNum) && kgNum >= 0 ? kgNum : undefined,
      nota: nota.trim() || undefined,
    })
    toast.show(a ? 'Apunte actualizado' : `Apuntado en «${bancal.nombre}»`)
    onClose()
  }
  const remove = async () => {
    if (!a || !(await toast.confirm({ title: '¿Borrar este apunte?', confirmLabel: 'Borrar', danger: true }))) return
    await db.diario.delete(a.id)
    onClose()
  }

  return (
    <Sheet
      title={a ? 'Editar apunte' : fijo && bancal ? bancal.nombre : 'Apuntar en el diario'}
      onClose={onClose}
      footer={
        <>
          {a && (
            <button className="btn danger" onClick={() => void remove()}>
              Borrar
            </button>
          )}
          <button className="btn primary block" disabled={!bancal || !fecha} onClick={() => void save()}>
            Guardar
          </button>
        </>
      }
    >
      {!fijo && (
        <label className="field">
          <span>Bancal</span>
          <select className="select" value={bancalId} onChange={(e) => setBancalId(e.target.value)}>
            <option value="">Elige un bancal…</option>
            {bancales.map((b) => (
              <option key={b.id} value={b.id}>
                {b.nombre}
                {b.finca ? ` · ${b.finca}` : ''}
              </option>
            ))}
          </select>
        </label>
      )}
      <div className="field">
        <span className="field-label">¿Qué has hecho?</span>
        <div className="row wrap" style={{ gap: 8 }}>
          {APUNTES.map((t) => (
            <button key={t.value} type="button" className={`chip ${tipo === t.value ? 'on' : ''}`} aria-pressed={tipo === t.value} onClick={() => setTipo(t.value)}>
              <ApunteIcon tipo={t.value} size={17} /> {t.label}
            </button>
          ))}
        </div>
      </div>
      <div className="form-grid">
        <label className="field">
          <span>Día</span>
          <input className="input" type="date" value={fecha} max={hoy} onChange={(e) => setFecha(e.target.value)} />
        </label>
        {tipo === 'recoleccion' && (
          <label className="field">
            <span>Kilos</span>
            <input className="input num" inputMode="decimal" placeholder="0" value={kg} onChange={(e) => setKg(e.target.value.replace(/[^0-9.,]/g, ''))} />
          </label>
        )}
      </div>
      <label className="field">
        <span>Nota</span>
        <textarea className="textarea" value={nota} onChange={(e) => setNota(e.target.value)} placeholder={tipo === 'tratamiento' ? 'Producto y dosis' : tipo === 'recoleccion' ? 'Almazara, rendimiento…' : 'Opcional'} />
      </label>
    </Sheet>
  )
}
