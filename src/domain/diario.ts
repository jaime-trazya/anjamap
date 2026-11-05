import type { Apunte, Bancal } from '../db/db'
import { toDateInput } from '../lib/fecha'

/** Resumen de los apuntes ya filtrados por campaña y, opcionalmente, bancal. */
export function resumenCosecha(apuntes: Apunte[], bancales: Pick<Bancal, 'id' | 'olivos'>[]) {
  const cosecha = apuntes.filter((a) => a.tipo === 'recoleccion')
  const totalKg = cosecha.reduce((sum, a) => sum + (a.kg ?? 0), 0)
  const kilos = new Map<string, number>()
  for (const a of cosecha) kilos.set(a.bancalId, (kilos.get(a.bancalId) ?? 0) + (a.kg ?? 0))
  const porBancal = [...kilos.entries()].filter(([, value]) => value > 0).sort((a, b) => b[1] - a[1])
  const censo = new Map(bancales.map((b) => [b.id, b.olivos ?? 0]))
  const completo = porBancal.length > 0 && porBancal.every(([id]) => (censo.get(id) ?? 0) > 0)
  const olivos = completo ? porBancal.reduce((sum, [id]) => sum + censo.get(id)!, 0) : 0
  return { totalKg, porBancal, dias: new Set(cosecha.map((a) => toDateInput(a.fecha))).size, kgPorOlivo: olivos ? totalKg / olivos : null }
}
