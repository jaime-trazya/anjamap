/** Fechas en español para el diario */
const DIA = 86400000

/** Medianoche local del día de `t` */
export const dayStart = (t: number) => {
  const d = new Date(t)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

/** "hoy", "ayer", "hace 3 días", "hace 2 semanas", "hace 4 meses" */
export function hace(t: number, now = Date.now()): string {
  const d = Math.round((dayStart(now) - dayStart(t)) / DIA)
  if (d <= 0) return 'hoy'
  if (d === 1) return 'ayer'
  if (d < 14) return `hace ${d} días`
  if (d < 60) return `hace ${Math.round(d / 7)} semanas`
  if (d < 365) return `hace ${Math.round(d / 30)} meses`
  const y = Math.round(d / 365)
  return y === 1 ? 'hace un año' : `hace ${y} años`
}

/** "12 nov" o "12 nov 2025" si no es de este año */
export function fechaCorta(t: number, now = Date.now()): string {
  const d = new Date(t)
  const opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' }
  if (d.getFullYear() !== new Date(now).getFullYear()) opts.year = 'numeric'
  return d.toLocaleDateString('es-ES', opts).replace('.', '')
}

/** "noviembre de 2026" */
export const mesLargo = (t: number) => new Date(t).toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })

/** Valor de <input type="date"> ↔ ms a mediodía local (evita saltos de día por la zona horaria) */
export function toDateInput(t: number): string {
  const d = new Date(t)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
export function fromDateInput(s: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return NaN
  const [y, m, d] = s.split('-').map(Number)
  const date = new Date(0)
  date.setFullYear(y, m - 1, d)
  date.setHours(12, 0, 0, 0)
  return toDateInput(date.getTime()) === s ? date.getTime() : NaN
}

export const kg = (n: number) => `${n.toLocaleString('es-ES', { maximumFractionDigits: 2 })} kg`
