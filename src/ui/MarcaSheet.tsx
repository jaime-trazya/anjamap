import { useState } from 'react'
import { Trash2 } from 'lucide-react'
import { db, uid, type Marca } from '../db/db'
import type { LatLon } from '../lib/geo'
import { Segmented, Sheet } from './components'
import { useToast } from './toast'
import { useAction } from './useAction'

const SUGERENCIAS: Record<Marca['tipo'], string[]> = {
  cerrado: ['Puerta cerrada', 'Cadena', 'Camino cortado', 'Paso inundable'],
  referencia: ['Gira junto a la caseta', 'Deja el coche en la explanada', 'Entra por la cadena verde'],
}

/**
 * Crear o editar un paso cerrado (las rutas lo evitan) o una referencia propia (se lee al pasar cerca navegando).
 */
export function MarcaSheet({ marca, punto, tipo: tipoInicial = 'cerrado', onClose }: { marca?: Marca; punto?: LatLon; tipo?: Marca['tipo']; onClose: () => void }) {
  const toast = useToast()
  const { busy, run } = useAction()
  const [tipo, setTipo] = useState<Marca['tipo']>(marca?.tipo ?? tipoInicial)
  const [texto, setTexto] = useState(marca?.texto ?? '')
  const guardar = async () => {
    const valor = texto.trim() || (tipo === 'cerrado' ? 'Paso cerrado' : '')
    if (tipo === 'referencia' && !valor) throw new Error('Escribe la referencia que quieres oír al pasar')
    if (marca) await db.marcas.update(marca.id, { tipo, texto: valor })
    else if (punto) await db.marcas.add({ id: uid(), tipo, lat: punto[0], lon: punto[1], texto: valor, creado: Date.now() })
    toast.show(tipo === 'cerrado' ? 'Paso cerrado: las rutas lo evitarán' : 'Referencia guardada: se leerá al pasar cerca')
    onClose()
  }
  const borrar = async () => {
    if (!marca) return
    await db.marcas.delete(marca.id)
    onClose()
    toast.show(marca.tipo === 'cerrado' ? 'Paso abierto otra vez' : 'Referencia borrada', { duration: 8000, action: { label: 'Deshacer', run: () => void db.marcas.put(marca) } })
  }
  return (
    <Sheet
      title={marca ? (marca.tipo === 'cerrado' ? 'Paso cerrado' : 'Referencia') : 'Marcar en el mapa'}
      onClose={onClose}
      footer={<button className="btn primary block" disabled={busy} onClick={() => void run(guardar)}>{busy ? 'Guardando…' : 'Guardar'}</button>}
    >
      <Segmented label="Tipo de marca" value={tipo} onChange={setTipo} options={[{ value: 'cerrado', label: 'Paso cerrado' }, { value: 'referencia', label: 'Referencia' }]} />
      <p className="meta">{tipo === 'cerrado' ? 'Las rutas buscarán otro camino para no pasar por aquí (puerta, cadena o camino cortado).' : 'Al navegar, cuando pases cerca, se mostrará y se leerá en voz alta.'}</p>
      <label className="field">
        <span>{tipo === 'cerrado' ? 'Qué hay (opcional)' : 'Qué decir al pasar'}</span>
        <input className="input" value={texto} maxLength={120} onChange={(e) => setTexto(e.target.value)} placeholder={SUGERENCIAS[tipo][0]} />
      </label>
      <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
        {SUGERENCIAS[tipo].map((s) => <button key={s} className="btn small" onClick={() => setTexto(s)}>{s}</button>)}
      </div>
      {marca && <button className="btn danger block" onClick={() => void borrar()}><Trash2 size={18} /> {marca.tipo === 'cerrado' ? 'Ya está abierto: quitar' : 'Borrar referencia'}</button>}
    </Sheet>
  )
}
