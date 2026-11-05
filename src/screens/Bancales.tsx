import { useMemo, useState } from 'react'
import { Check, ChevronRight, Import, Plus, Search, Share2, X } from 'lucide-react'
import { bearing, distance, formatDistance } from '../lib/geo'
import { useData } from '../ui/useData'
import { usePosition } from '../ui/position'
import { useEditor } from '../ui/editor'
import { Empty, MiniArrow, Segmented } from '../ui/components'
import { TransferSheet } from '../ui/TransferSheet'

const norm = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()

export function BancalesScreen() {
  const { bancales } = useData()
  const { fix } = usePosition()
  const editor = useEditor()
  const [q, setQ] = useState('')
  const [orden, setOrden] = useState<'cerca' | 'finca'>('cerca')
  const [selecting, setSelecting] = useState(false)
  const [selected, setSelected] = useState<string[]>([])
  const [transfer, setTransfer] = useState(false)
  const toggle = (id: string) => setSelected((list) => list.includes(id) ? list.filter((v) => v !== id) : [...list, id])
  const items = useMemo(() => {
    const list = bancales.filter((b) => !q || norm(`${b.nombre} ${b.finca ?? ''} ${b.nota ?? ''}`).includes(norm(q)))
      .map((b) => ({ b, d: fix ? distance(fix.p, [b.lat, b.lon]) : null, rumbo: fix ? bearing(fix.p, [b.lat, b.lon]) : 0 }))
    if (orden === 'cerca' && fix) list.sort((a, b) => a.d! - b.d!)
    return list
  }, [bancales, q, fix, orden])
  const porGrupo = orden === 'finca' || !fix
  const groups = useMemo(() => {
    if (!porGrupo) return [{ name: '', items }]
    const map = new Map<string, typeof items>()
    for (const it of items) { const name = it.b.finca ?? ''; if (!map.has(name)) map.set(name, []); map.get(name)!.push(it) }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b, 'es')).map(([name, items]) => ({ name, items }))
  }, [items, porGrupo])
  return <main className="screen">
    <div className="head"><div><div className="eyebrow">Tus sitios guardados</div><h1 className="title">{bancales.length} {bancales.length === 1 ? 'bancal' : 'bancales'}</h1></div><button className="icon-btn primary" aria-label="Nuevo bancal" onClick={() => editor.openAdd()}><Plus size={24} /></button></div>
    <div className="row"><button className="btn block" onClick={() => setTransfer(true)}><Import size={18} /> Importar / enviar</button>{bancales.length > 0 && <button className="btn" onClick={() => { setSelecting((v) => !v); setSelected([]) }}>{selecting ? <X size={18} /> : <Check size={18} />}{selecting ? 'Cancelar' : 'Seleccionar'}</button>}</div>
    {bancales.length > 0 && <>
      <div className="search"><Search size={19} /><input className="input" type="search" aria-label="Buscar bancal o zona" placeholder="Buscar bancal o zona" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      <Segmented value={orden} onChange={setOrden} label="Orden" options={[{ value: 'cerca', label: 'Más cerca' }, { value: 'finca', label: 'Por grupo' }]} />
    </>}
    {selecting && <div className="row"><button className="btn small" onClick={() => setSelected(items.map(({ b }) => b.id))}>Seleccionar visibles</button><button className="btn primary block" disabled={!selected.length} onClick={() => setTransfer(true)}><Share2 size={17} /> Enviar {selected.length}</button></div>}
    {!bancales.length ? <section className="card"><Empty title="Aún no hay bancales" action={<button className="btn primary" onClick={() => editor.openAdd()}>Añadir bancal</button>}>Guarda tu posición, marca un punto en el mapa o importa los bancales que te hayan enviado.</Empty></section> : !items.length ? <p className="empty">Nada coincide con «{q}»</p> : groups.map((group) => <section key={group.name || '_'} className="stack" style={{ gap: 6 }}>
      {porGrupo && <div className="group-head"><span>{group.name || 'Sin grupo'}</span><span>{group.items.length}</span></div>}
      <div className="card flush list">{group.items.map(({ b, d, rumbo }) => <div className="row saved-place" key={b.id}>
        {selecting && <label className="selection-check"><input type="checkbox" aria-label={`Seleccionar ${b.nombre}`} checked={selected.includes(b.id)} onChange={() => toggle(b.id)} /></label>}
        <a className="list-item tap grow" href={`#/bancal/${b.id}`} onClick={(e) => { if (selecting) { e.preventDefault(); toggle(b.id) } }}>
          <span className="tile solid" style={{ '--c': b.color } as React.CSSProperties} aria-hidden>{d !== null ? <MiniArrow deg={rumbo} size={19} /> : null}</span>
          <div className="grow"><div className="primary-line ellipsis">{b.nombre}</div><div className="secondary-line ellipsis">{[!porGrupo ? b.finca : null, b.nota].filter(Boolean).join(' · ') || 'Ver lugar y fotos'}</div></div>
          {d !== null && <span className="trail num small muted">{formatDistance(d)}</span>}<ChevronRight size={18} className="chev" />
        </a>
      </div>)}</div>
    </section>)}
    {transfer && <TransferSheet ids={selecting && selected.length ? selected : undefined} onClose={() => setTransfer(false)} />}
  </main>
}
