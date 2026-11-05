import { useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Camera, ImagePlus, Trash2 } from 'lucide-react'
import { db, uid, type Foto } from '../db/db'
import { preparePhoto } from './photos'
import { useAction } from './useAction'
import { useToast } from './toast'
import { Sheet } from './components'

export function PhotoGallery({ bancalId }: { bancalId: string }) {
  const fotos = useLiveQuery(() => db.fotos.where('bancalId').equals(bancalId).toArray(), [bancalId]) ?? []
  const [open, setOpen] = useState<Foto | null>(null)
  const library = useRef<HTMLInputElement>(null)
  const camera = useRef<HTMLInputElement>(null)
  const { busy, run } = useAction()
  const toast = useToast()
  const add = (files: FileList | null) => {
    const selected = Array.from(files ?? [])
    if (!selected.length) return
    void run(async () => {
      if (fotos.length + selected.length > 20) throw new Error('Puedes guardar hasta 20 fotos por bancal')
      const rows: Foto[] = []
      // Una a una para no cargar varias fotos grandes a la vez en el móvil.
      for (const file of selected) rows.push({ id: uid(), bancalId, nombre: file.name || 'Foto del lugar', dataUrl: await preparePhoto(file), creado: Date.now() })
      await db.transaction('rw', db.bancales, db.fotos, async () => {
        if (!(await db.bancales.get(bancalId))) throw new Error('El bancal ya no existe')
        if ((await db.fotos.where('bancalId').equals(bancalId).count()) + rows.length > 20) throw new Error('Puedes guardar hasta 20 fotos por bancal')
        await db.fotos.bulkAdd(rows)
      })
      toast.show(rows.length === 1 ? 'Foto guardada' : `${rows.length} fotos guardadas`)
    })
  }
  return <>
    <div className="section"><h2>Fotos del lugar</h2><span className="meta">{fotos.length}/20</span></div>
    <div className="row">
      <button className="btn block" disabled={busy} onClick={() => library.current?.click()}><ImagePlus size={18} /> {busy ? 'Preparando…' : 'Añadir fotos'}</button>
      <button className="btn" disabled={busy} onClick={() => camera.current?.click()}><Camera size={18} /> Cámara</button>
    </div>
    <input ref={library} type="file" accept="image/*" multiple hidden onChange={(e) => { add(e.target.files); e.target.value = '' }} />
    <input ref={camera} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { add(e.target.files); e.target.value = '' }} />
    {fotos.length ? <div className="photo-grid">{fotos.map((f) => <button key={f.id} className="photo-thumb" aria-label={`Ver ${f.nombre}`} onClick={() => setOpen(f)}><img src={f.dataUrl} alt={f.nombre} loading="lazy" /></button>)}</div> : <p className="meta">Guarda una foto de la entrada o una referencia para reconocer el sitio al llegar.</p>}
    {open && <Sheet title="Foto del lugar" onClose={() => setOpen(null)} footer={<button className="btn danger block" disabled={busy} onClick={() => void run(async () => {
      if (!(await toast.confirm({ title: '¿Borrar esta foto?', confirmLabel: 'Borrar', danger: true }))) return
      await db.fotos.delete(open.id)
      setOpen(null)
    })}><Trash2 size={18} /> Borrar foto</button>}><img className="photo-full" src={open.dataUrl} alt={open.nombre} /></Sheet>}
  </>
}
