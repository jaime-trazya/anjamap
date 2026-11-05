import { describe, expect, it } from 'vitest'
import { fromDateInput, kg, toDateInput } from './fecha'

describe('fechas y kilos del diario', () => {
  it.each(['2026-11-05', '2024-02-29', '2026-03-29', '2026-10-25'])('conserva el día local %s y guarda al mediodía', (day) => {
    const t = fromDateInput(day)
    expect(toDateInput(t)).toBe(day)
    expect(new Date(t).getHours()).toBe(12)
  })
  it.each(['', '2026-02-29', '2026-04-31', '2026-13-01', '2026-00-01', 'texto', '2026-1-1'])('rechaza el día inválido %s', (day) => {
    expect(Number.isNaN(fromDateInput(day))).toBe(true)
  })
  it('muestra los kilos decimales sin redondearlos a enteros', () => {
    expect(kg(0.5)).toBe('0,5 kg')
    expect(kg(12.75)).toBe('12,75 kg')
    expect(kg(12)).toBe('12 kg')
  })
})
