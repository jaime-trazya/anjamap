import { useRef, useState } from 'react'
import { Download, FileDown, Share2, Upload } from 'lucide-react'
import { db, exportBackup, importBackup, type Backup } from '../db/db'
import { MAX_TRANSFER_BYTES, readTransfer, transferGpx } from '../domain/transfer'
import { saveFile, shareFile, today } from './files'
import { useData } from './useData'
import { useAction } from './useAction'
import { useToast } from './toast'
import { Sheet } from './components'

export function TransferSheet({ ids, onClose }: { ids?: string[]; onClose: () => void }) {
  const { bancales } = useData()
  const { busy, run } = useAction()
  const toast = useToast()
  const input = useRef<HTMLInputElement>(null)
  const [restore, setRestore] = useState<Backup | null>(null)
  const total = ids?.length ?? bancales.length
  const exportData = async (share: boolean, gpx = false) => {
    const data = await exportBackup(db, ids)
    const filename = `anjamap-${today()}.${gpx ? 'gpx' : 'json'}`
    const content = gpx ? transferGpx(data) : JSON.stringify(data)
    if (new Blob([content]).size > MAX_TRANSFER_BYTES) throw new Error('El archivo supera los 100 MB. Selecciona menos bancales y envíalos en varios archivos.')
    const type = gpx ? 'application/gpx+xml' : 'application/json'
    if (share) await shareFile(filename, content, type)
    else await saveFile(filename, content, type)
  }
  const load = (file?: File) => {
    if (!file) return
    void run(async () => {
      if (file.size > MAX_TRANSFER_BYTES) throw new Error('El archivo supera los 100 MB. Pide que te envíen los bancales en varios archivos.')
      setRestore(readTransfer(await file.text(), file.name))
    })
  }
  return <Sheet title={restore ? 'Importar bancales' : 'Importar y compartir'} onClose={onClose}>
    {restore ? <>
      <section className="card stack"><strong>{restore.bancales.length} bancales · {restore.fotos?.length ?? 0} fotos</strong><p className="meta">{restore.caminos.length} caminos · {restore.rutas.length} rutas. Los identificadores coincidentes se actualizarán; el resto se añadirá.</p></section>
      <button className="btn primary block big" disabled={busy} onClick={() => void run(async () => { await importBackup(restore, 'fusionar'); toast.show('Datos importados, incluidas las fotos'); onClose() })}>Añadir a mis bancales</button>
      <button className="btn block" disabled={busy} onClick={() => setRestore(null)}>Elegir otro archivo</button>
      <button className="btn danger block" disabled={busy} onClick={() => void run(async () => {
        if (!(await toast.confirm({ title: '¿Reemplazar todos tus datos?', message: 'Se borrarán tus bancales, fotos, caminos y rutas actuales. Guarda primero una copia si quieres conservarlos.', confirmLabel: 'Reemplazar todo', danger: true }))) return
        await importBackup(restore, 'reemplazar'); toast.show('Datos reemplazados'); onClose()
      })}>Reemplazar todos mis datos</button>
    </> : <>
      <p className="muted">{ids ? `${total} bancales seleccionados` : 'Todos tus bancales'}, con sus fotos y rutas. La otra persona solo necesita abrir Anjamap e importar el archivo.</p>
      <button className="btn primary block big" disabled={busy || !total} onClick={() => void run(() => exportData(true))}><Share2 size={20} /> Enviar archivo con fotos</button>
      <button className="btn block" disabled={busy || !total} onClick={() => void run(() => exportData(false))}><Download size={18} /> Descargar copia completa</button>
      <button className="btn block" disabled={busy || !total} onClick={() => void run(() => exportData(false, true))}><FileDown size={18} /> Exportar GPX · sin fotos</button>
      <div className="section"><h2>Recibir bancales</h2></div>
      <button className="btn block big" disabled={busy} onClick={() => input.current?.click()}><Upload size={20} /> Importar JSON o GPX</button>
      <p className="meta">Los archivos JSON de Anjamap conservan las fotos. GPX permite intercambiar ubicaciones y recorridos con otras aplicaciones. También se admiten las copias antiguas.</p>
    </>}
    <input ref={input} hidden type="file" accept=".json,.gpx,application/json,application/gpx+xml" onChange={(e) => { load(e.target.files?.[0]); e.target.value = '' }} />
  </Sheet>
}
