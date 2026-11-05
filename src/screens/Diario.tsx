import { useMemo, useState } from 'react'
import { Plus } from 'lucide-react'
import { campana, campanaLabel, type TipoApunte } from '../db/db'
import { APUNTES, apunteLabel } from '../domain/constants'
import { fechaCorta, kg, mesLargo } from '../lib/fecha'
import { useData } from '../ui/useData'
import { useEditor } from '../ui/editor'
import { Empty, Stat } from '../ui/components'
import { ApunteIcon } from '../ui/icons'

/** Diario de todos los bancales por campañas (septiembre a agosto) */
export function DiarioScreen() {
  const { diario, bancales } = useData()
  const editor = useEditor()
  const [actual] = useState(() => campana(Date.now()))
  const campanas = useMemo(() => [...new Set([actual, ...diario.map((a) => campana(a.fecha))])].sort((a, b) => b - a), [diario, actual])
  const [sel, setSel] = useState(actual)
  const [tipo, setTipo] = useState<TipoApunte | 'todo'>('todo')
  const byId = useMemo(() => new Map(bancales.map((b) => [b.id, b])), [bancales])

  const deCampana = useMemo(() => diario.filter((a) => campana(a.fecha) === sel), [diario, sel])
  const lista = useMemo(() => (tipo === 'todo' ? deCampana : deCampana.filter((a) => a.tipo === tipo)), [deCampana, tipo])
  const cosecha = useMemo(() => deCampana.filter((a) => a.tipo === 'recoleccion'), [deCampana])
  const totalKg = cosecha.reduce((s, a) => s + (a.kg ?? 0), 0)
  const porBancal = useMemo(() => {
    const m = new Map<string, number>()
    for (const a of cosecha) m.set(a.bancalId, (m.get(a.bancalId) ?? 0) + (a.kg ?? 0))
    return [...m.entries()].filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1])
  }, [cosecha])
  const nb = new Set(deCampana.map((a) => a.bancalId)).size
  const olivos = porBancal.reduce((s, [id]) => s + (byId.get(id)?.olivos ?? 0), 0)

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
        <button className="icon-btn primary" aria-label="Apuntar" disabled={!bancales.length} onClick={() => editor.openApunte()}>
          <Plus size={24} />
        </button>
      </div>

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
            meta={olivos && totalKg ? `${(totalKg / olivos).toFixed(1).replace('.', ',')} kg por olivo` : `${cosecha.length} ${cosecha.length === 1 ? 'día' : 'días'} de recogida`}
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
          <button className={`chip ${tipo === 'todo' ? 'on' : ''}`} onClick={() => setTipo('todo')}>
            Todo
          </button>
          {tipos.map((t) => (
            <button key={t.value} className={`chip ${tipo === t.value ? 'on' : ''}`} onClick={() => setTipo(t.value)}>
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
                <button className="btn primary" onClick={() => editor.openApunte()}>
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
