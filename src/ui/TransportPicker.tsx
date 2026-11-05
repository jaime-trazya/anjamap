import { Bike, Car, Footprints, Zap } from 'lucide-react'
import type { Transporte } from '../db/db'

const TRANSPORTS = [
  { value: 'pie', label: 'A pie', icon: Footprints },
  { value: 'coche', label: 'Coche', icon: Car },
  { value: 'bici', label: 'Bici', icon: Bike },
  { value: 'patinete', label: 'Patinete', icon: Zap },
] as const

export function TransportPicker({ value, onChange }: { value: Transporte; onChange: (value: Transporte) => void }) {
  return <div className="transport-picker" role="group" aria-label="Medio de transporte">{TRANSPORTS.map((t) => <button key={t.value} type="button" aria-pressed={t.value === value} onClick={() => onChange(t.value)}><t.icon size={21} /><span>{t.label}</span></button>)}</div>
}
