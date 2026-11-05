import type { TipoCamino } from '../db/db'

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
