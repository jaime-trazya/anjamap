import type { TipoApunte, TipoCamino } from '../db/db'

export const COLORES = [
  { nombre: 'Oliva', color: '#6b7f1f' },
  { nombre: 'Verde', color: '#2f8a4c' },
  { nombre: 'Ocre', color: '#b07d12' },
  { nombre: 'Tierra', color: '#a0522d' },
  { nombre: 'Azul', color: '#2f6fa8' },
  { nombre: 'Morado', color: '#7a4a8c' },
  { nombre: 'Rojo', color: '#c0392b' },
  { nombre: 'Grafito', color: '#4a4f55' },
]

export const TIPOS: { value: TipoCamino; label: string }[] = [
  { value: 'pista', label: 'Pista' },
  { value: 'senda', label: 'Senda' },
  { value: 'atajo', label: 'Atajo' },
]

export const APUNTES: { value: TipoApunte; label: string; verbo: string }[] = [
  { value: 'recoleccion', label: 'Recolección', verbo: 'Recogido' },
  { value: 'poda', label: 'Poda', verbo: 'Podado' },
  { value: 'tratamiento', label: 'Tratamiento', verbo: 'Tratado' },
  { value: 'abono', label: 'Abono', verbo: 'Abonado' },
  { value: 'riego', label: 'Riego', verbo: 'Regado' },
  { value: 'desbroce', label: 'Desbroce', verbo: 'Desbrozado' },
  { value: 'visita', label: 'Visita', verbo: 'Visitado' },
  { value: 'otro', label: 'Otro', verbo: 'Apunte' },
]
export const apunteLabel = (t: TipoApunte) => APUNTES.find((a) => a.value === t)?.label ?? 'Apunte'

/** Variedades de olivo habituales en la zona (solo sugerencias al escribir) */
export const VARIEDADES = ['Serrana', 'Blanqueta', 'Villalonga', 'Farga', 'Morruda', 'Alfafara', 'Manzanilla', 'Arbequina', 'Picual', 'Cornicabra']
