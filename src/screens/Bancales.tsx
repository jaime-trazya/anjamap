import { useMemo, useState } from 'react'
import { ChevronRight, Plus, Search } from 'lucide-react'
import { bearing, distance, formatDistance } from '../lib/geo'
import { useData } from '../ui/useData'
import { usePosition } from '../ui/position'
import { useEditor } from '../ui/editor'
import { BancalTile, Empty, MiniArrow, Segmented } from '../ui/components'

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

export function BancalesScreen() {
  const { bancales, rutas } = useData()
  const { fix } = usePosition()
  const editor = useEditor()
  const [q, setQ] = useState('')
  const [orden, setOrden] = useState<'cerca' | 'nombre'>('cerca')

  const items = useMemo(() => {
    const list = bancales
      .filter((b) => !q || norm(`${b.nombre} ${b.finca ?? ''} ${b.nota ?? ''}`).includes(norm(q)))
      .map((b) => ({ b, d: fix ? distance(fix.p, [b.lat, b.lon]) : null, rumbo: fix ? bearing(fix.p, [b.lat, b.lon]) : 0 }))
    if (orden === 'cerca' && fix) list.sort((x, y) => x.d! - y.d!)
    return list
  }, [bancales, q, fix, orden])

  // Agrupar por finca cuando se ordena por nombre
  const groups = useMemo(() => {
    if (orden === 'cerca' && fix) return [{ finca: '', items }]
    const m = new Map<string, typeof items>()
    for (const it of items) {
      const k = it.b.finca ?? ''
      if (!m.has(k)) m.set(k, [])
      m.get(k)!.push(it)
    }
    return [...m.entries()].sort(([a], [b]) => (a ? (b ? a.localeCompare(b, 'es') : -1) : 1)).map(([finca, items]) => ({ finca, items }))
  }, [items, orden, fix])

  return (
    <main className="screen">
      <div className="title-row">
        <div>
          <h1 className="title">Bancales</h1>
          <div className="title-sub">{bancales.length === 1 ? '1 bancal' : `${bancales.length} bancales`}</div>
        </div>
        <button className="icon-btn primary" aria-label="Nuevo bancal" onClick={() => editor.openAdd()}>
          <Plus size={22} />
        </button>
      </div>

      {bancales.length > 0 && (
        <>
          <div className="search">
            <Search size={18} />
            <input className="input" type="search" placeholder="Buscar bancal, finca o nota" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <Segmented
            value={orden}
            onChange={setOrden}
            label="Orden"
            options={[
              { value: 'cerca', label: 'Más cerca' },
              { value: 'nombre', label: 'Por finca' },
            ]}
          />
        </>
      )}

      {!bancales.length ? (
        <section className="card">
          <Empty title="Aún no hay bancales" action={<button className="btn primary" onClick={() => editor.openAdd()}>Añadir bancal</button>}>
            Ve hasta un bancal y guárdalo con el GPS, o márcalo en el mapa.
          </Empty>
        </section>
      ) : !items.length ? (
        <p className="empty">Nada coincide con «{q}»</p>
      ) : (
        groups.map((g) => (
          <section key={g.finca || '_'} className="stack" style={{ gap: 8 }}>
            {orden === 'nombre' || !fix ? <div className="day-head">{g.finca || 'Sin finca'}</div> : null}
            <div className="card flush list">
              {g.items.map(({ b, d, rumbo }) => {
                const nr = rutas.filter((r) => r.bancalId === b.id).length
                return (
                  <a key={b.id} className="list-item tap" href={`#/bancal/${b.id}`}>
                    <BancalTile color={b.color}>{d !== null ? <MiniArrow deg={rumbo} size={17} /> : null}</BancalTile>
                    <div className="grow">
                      <div className="primary-line ellipsis">{b.nombre}</div>
                      <div className="secondary-line ellipsis">
                        {[orden === 'cerca' && fix ? b.finca : null, nr ? `${nr} ${nr === 1 ? 'ruta' : 'rutas'}` : null, b.nota].filter(Boolean).join(' · ') || 'Sin notas'}
                      </div>
                    </div>
                    {d !== null && <span className="trail num small">{formatDistance(d)}</span>}
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
