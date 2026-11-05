import { useMemo, useState } from 'react'
import { Plus } from 'lucide-react'
import { campana, campanaLabel, type TipoApunte } from '../db/db'
import { APUNTES, apunteLabel } from '../domain/constants'
import { fechaCorta, kg, mesLargo } from '../lib/fecha'
import { useData } from '../ui/useData'
import { useEditor } from '../ui/editor'
import { Empty, Stat } from '../ui/components'
import { ApunteIcon } from '../ui/icons'
import { resumenCosecha } from '../domain/diario'
import { routeParams } from '../ui/router'

/** Diario de todos los bancales por campañas (septiembre a agosto) */
export function DiarioScreen({ route }: { route: string }) {
  const { diario, bancales } = useData()
  const editor = useEditor()
  const [actual] = useState(() => campana(Date.now()))
  const campanas = useMemo(() => [...new Set([actual, ...diario.map((a) => campana(a.fecha))])].sort((a, b) => b - a), [diario, actual])
  const [sel, setSel] = useState(actual)
  const [tipo, setTipo] = useState<TipoApunte | 'todo'>('todo')
  const [bancalId, setBancalId] = useState(() => routeParams(route).get('bancal') ?? '')
  const bancalActivo = bancales.some((b) => b.id === bancalId) ? bancalId : ''
  const deCampana = useMemo(() => diario.filter((a) => campana(a.fecha) === sel && (!bancalActivo || a.bancalId === bancalActivo)), [diario, sel, bancalActivo])
  // El filtro de una campaña puede no existir en otra: no dejar el diario vacío por un filtro oculto.
  const tipoActivo = deCampana.some((a) => a.tipo === tipo) ? tipo : 'todo'
  const byId = useMemo(() => new Map(bancales.map((b) => [b.id, b])), [bancales])

  const lista = useMemo(() => (tipoActivo === 'todo' ? deCampana : deCampana.filter((a) => a.tipo === tipoActivo)), [deCampana, tipoActivo])
  const { totalKg, porBancal, dias, kgPorOlivo } = useMemo(() => resumenCosecha(deCampana, bancales), [deCampana, bancales])
  const nb = new Set(deCampana.map((a) => a.bancalId)).size

  const meses = useMemo(() => {
    const m = new Map<string, typeof lista>()
    for (const a of lista) {
      const k = mesLargo(a.fecha)
      if (!m.has(k)) m.set(k, [])
      m.get(k)!.push(a)
    }
    return [...m.entries()]
  }, [lista])
  const tipos = APUNTES.filter((t) => deCampana.some((a) => a.tipo === t.value))

  return (
    <main className="screen">
      <div className="head">
        <div>
          <div className="eyebrow">Campaña {campanaLabel(sel)}</div>
          <h1 className="title">Diario</h1>
        </div>
        <button className="icon-btn primary" aria-label="Apuntar" disabled={!bancales.length} onClick={() => editor.openApunte({ bancalId: bancalActivo || undefined })}>
          <Plus size={24} />
        </button>
      </div>

      {bancales.length > 0 && (
        <label className="field">
          <span>Bancal</span>
          <select className="select" value={bancalActivo} onChange={(e) => setBancalId(e.target.value)}>
            <option value="">Todos los bancales</option>
            {bancales.map((b) => <option key={b.id} value={b.id}>{b.nombre}{b.finca ? ` · ${b.finca}` : ''}</option>)}
          </select>
        </label>
      )}

      {campanas.length > 1 && (
        <div className="chips">
          {campanas.map((c) => (
            <button key={c} className={`chip ${sel === c ? 'on' : ''}`} onClick={() => setSel(c)}>
              {campanaLabel(c)}
            </button>
          ))}
        </div>
      )}

      <section className="card flush">
        <div className="stats" style={{ '--cols': 2 } as React.CSSProperties}>
          <Stat
            label="Cosecha"
            value={totalKg ? kg(totalKg) : '—'}
            meta={kgPorOlivo !== null ? `${kgPorOlivo.toFixed(1).replace('.', ',')} kg por olivo` : `${dias} ${dias === 1 ? 'día' : 'días'} de recogida`}
          />
          <Stat label="Apuntes" value={deCampana.length} meta={nb === 1 ? 'en 1 bancal' : `en ${nb} bancales`} />
        </div>
      </section>

      {porBancal.length > 0 && (
        <>
          <div className="section">
            <h2>Kilos por bancal</h2>
          </div>
          <section className="card bars">
            {porBancal.map(([id, v]) => {
              const b = byId.get(id)
              return (
                <a key={id} className="bar-row" href={`#/bancal/${id}`} style={{ color: 'inherit', '--c': b?.color } as React.CSSProperties}>
                  <span className="ellipsis" style={{ fontWeight: 600 }}>
                    {b?.nombre ?? 'Bancal borrado'}
                  </span>
                  <span className="figure num" style={{ fontSize: 19 }}>
                    {kg(v)}
                  </span>
                  <span className="track">
                    <i style={{ width: `${(v / porBancal[0][1]) * 100}%` }} />
                  </span>
                </a>
              )
            })}
          </section>
        </>
      )}

      {tipos.length > 1 && (
        <div className="chips">
          <button className={`chip ${tipoActivo === 'todo' ? 'on' : ''}`} onClick={() => setTipo('todo')}>
            Todo
          </button>
          {tipos.map((t) => (
            <button key={t.value} className={`chip ${tipoActivo === t.value ? 'on' : ''}`} onClick={() => setTipo(t.value)}>
              <ApunteIcon tipo={t.value} size={16} /> {t.label}
            </button>
          ))}
        </div>
      )}

      {!lista.length ? (
        <section className="card">
          <Empty
            title={bancales.length ? 'Nada apuntado en esta campaña' : 'Primero guarda un bancal'}
            action={
              bancales.length ? (
                <button className="btn primary" onClick={() => editor.openApunte({ bancalId: bancalActivo || undefined })}>
                  Apuntar algo
                </button>
              ) : undefined
            }
          >
            Apunta la poda, los tratamientos, el riego o los kilos de cada recogida. También puedes hacerlo al llegar a un bancal.
          </Empty>
        </section>
      ) : (
        meses.map(([mes, items]) => (
          <section key={mes} className="stack" style={{ gap: 6 }}>
            <div className="group-head">
              <span>{mes}</span>
            </div>
            <div className="card flush list">
              {items.map((a) => {
                const b = byId.get(a.bancalId)
                return (
                  <button key={a.id} className="list-item" onClick={() => editor.openApunte({ apunte: a })}>
                    <span className="tile sm" style={{ '--c': b?.color } as React.CSSProperties}>
                      <ApunteIcon tipo={a.tipo} size={17} />
                    </span>
                    <div className="grow">
                      <div className="primary-line ellipsis">
                        {apunteLabel(a.tipo)}
                        {a.kg ? ` · ${kg(a.kg)}` : ''}
                      </div>
                      <div className="secondary-line ellipsis">{[b?.nombre ?? 'Bancal borrado', a.nota].filter(Boolean).join(' · ')}</div>
                    </div>
                    <span className="trail small muted">{fechaCorta(a.fecha)}</span>
                  </button>
                )
              })}
            </div>
          </section>
        ))
      )}
    </main>
  )
}
