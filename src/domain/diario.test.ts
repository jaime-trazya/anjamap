import { describe, expect, it } from 'vitest'
import { resumenCosecha } from './diario'
import type { Apunte } from '../db/db'

const apuntes: Apunte[] = [
  { id: 'a1', bancalId: 'b1', tipo: 'recoleccion', fecha: new Date(2026, 10, 5, 10).getTime(), kg: 12.5, creado: 1 },
  { id: 'a2', bancalId: 'b1', tipo: 'recoleccion', fecha: new Date(2026, 10, 5, 12).getTime(), kg: 7.5, creado: 1 },
  { id: 'a3', bancalId: 'b2', tipo: 'recoleccion', fecha: new Date(2026, 10, 6, 12).getTime(), kg: 30, creado: 1 },
  { id: 'a4', bancalId: 'b2', tipo: 'poda', fecha: new Date(2026, 10, 7, 12).getTime(), creado: 1 },
]

describe('resumen de cosecha', () => {
  it('cuenta días distintos y suma los decimales de cada bancal', () => {
    expect(resumenCosecha(apuntes, [{ id: 'b1', olivos: 10 }, { id: 'b2', olivos: 15 }])).toEqual({
      totalKg: 50, porBancal: [['b2', 30], ['b1', 20]], dias: 2, kgPorOlivo: 2,
    })
  })
  it('no divide toda la cosecha entre un censo de olivos incompleto', () => {
    expect(resumenCosecha(apuntes, [{ id: 'b1', olivos: 10 }, { id: 'b2' }]).kgPorOlivo).toBeNull()
  })
  it('permite resumir un bancal sin añadir cosecha de otros', () => {
    expect(resumenCosecha(apuntes.filter((a) => a.bancalId === 'b1'), [{ id: 'b1', olivos: 10 }])).toMatchObject({ totalKg: 20, dias: 1, kgPorOlivo: 2 })
  })
})
