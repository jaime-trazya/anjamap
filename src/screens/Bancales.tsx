import { useMemo, useState } from 'react'
import { ChevronRight, Plus, Search } from 'lucide-react'
import { bearing, distance, formatDistance } from '../lib/geo'
import { hace } from '../lib/fecha'
import type { Apunte } from '../db/db'
import { apunteLabel } from '../domain/constants'
import { useData } from '../ui/useData'
import { usePosition } from '../ui/position'
import { useEditor } from '../ui/editor'
import { Empty, MiniArrow, Segmented } from '../ui/components'

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

export function BancalesScreen() {
  const { bancales, diario } = useData()
  const { fix } = usePosition()
  const editor = useEditor()
  const [q, setQ] = useState('')
  const [orden, setOrden] = useState<'cerca' | 'finca'>('cerca')

  // Último apunte de cada bancal (el diario viene ordenado del más reciente al más antiguo)
  const ultimo = useMemo(() => {
    const m = new Map<string, Apunte>()
    for (const a of diario) if (!m.has(a.bancalId)) m.set(a.bancalId, a)
    return m
  }, [diario])

  const items = useMemo(() => {
    const list = bancales
      .filter((b) => !q || norm(`${b.nombre} ${b.finca ?? ''} ${b.variedad ?? ''} ${b.nota ?? ''}`).includes(norm(q)))
      .map((b) => ({ b, d: fix ? distance(fix.p, [b.lat, b.lon]) : null, rumbo: fix ? bearing(fix.p, [b.lat, b.lon]) : 0 }))
    if (orden === 'cerca' && fix) list.sort((x, y) => x.d! - y.d!)
    return list
  }, [bancales, q, fix, orden])

  // Agrupar por finca
  const porFinca = orden === 'finca' || !fix
  const groups = useMemo(() => {
    if (!porFinca) return [{ finca: '', items }]
    const m = new Map<string, typeof items>()
    for (const it of items) {
      const k = it.b.finca ?? ''
      if (!m.has(k)) m.set(k, [])
      m.get(k)!.push(it)
    }
    return [...m.entries()].sort(([a], [b]) => (a ? (b ? a.localeCompare(b, 'es') : -1) : 1)).map(([finca, items]) => ({ finca, items }))
  }, [items, porFinca])

  const olivos = bancales.reduce((s, b) => s + (b.olivos ?? 0), 0)
  const fincas = new Set(bancales.map((b) => b.finca).filter(Boolean)).size

  return (
    <main className="screen">
      <div className="head">
        <div>
          <div className="eyebrow">{[fincas ? `${fincas} ${fincas === 1 ? 'finca' : 'fincas'}` : null, olivos ? `${olivos.toLocaleString('es-ES')} olivos` : null].filter(Boolean).join(' · ') || 'Tus olivos'}</div>
          <h1 className="title">{bancales.length === 1 ? '1 bancal' : `${bancales.length} bancales`}</h1>
        </div>
        <button className="icon-btn primary" aria-label="Nuevo bancal" onClick={() => editor.openAdd()}>
          <Plus size={24} />
        </button>
      </div>

      {bancales.length > 0 && (
        <>
          <div className="search">
            <Search size={19} />
            <input className="input" type="search" placeholder="Buscar bancal, finca o variedad" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <Segmented
            value={orden}
            onChange={setOrden}
            label="Orden"
            options={[
              { value: 'cerca', label: 'Más cerca' },
              { value: 'finca', label: 'Por finca' },
            ]}
          />
        </>
      )}

      {!bancales.length ? (
        <section className="card">
          <Empty title="Aún no hay bancales" action={<button className="btn primary" onClick={() => editor.openAdd()}>Añadir bancal</button>}>
            Ve hasta un bancal y guárdalo con el GPS, o márcalo en el mapa desde casa.
          </Empty>
        </section>
      ) : !items.length ? (
        <p className="empty">Nada coincide con «{q}»</p>
      ) : (
        groups.map((g) => (
          <section key={g.finca || '_'} className="stack" style={{ gap: 6 }}>
            {porFinca && (
              <div className="group-head">
                <span>{g.finca || 'Sin finca'}</span>
                <span>{g.items.length}</span>
              </div>
            )}
            <div className="card flush list">
              {g.items.map(({ b, d, rumbo }) => {
                const u = ultimo.get(b.id)
                const sub = [!porFinca ? b.finca : null, b.olivos ? `${b.olivos} olivos` : null, u ? `${apunteLabel(u.tipo)} ${hace(u.fecha)}` : null].filter(Boolean).join(' · ')
                return (
                  <a key={b.id} className="list-item tap" href={`#/bancal/${b.id}`}>
                    <span className="tile solid" style={{ '--c': b.color } as React.CSSProperties} aria-hidden>
                      {d !== null ? <MiniArrow deg={rumbo} size={19} /> : null}
                    </span>
                    <div className="grow">
                      <div className="primary-line ellipsis">{b.nombre}</div>
                      <div className="secondary-line ellipsis">{sub || 'Sin apuntes'}</div>
                    </div>
                    {d !== null && <span className="trail figure num" style={{ fontSize: 20 }}>{formatDistance(d)}</span>}
                    <ChevronRight size={18} className="chev" />
                  </a>
                )
              })}
            </div>
          </section>
        ))
      )}
    </main>
  )
}
