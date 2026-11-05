import { CornerUpLeft, CornerUpRight, MapPin, Route as RouteIcon, ArrowUp, Scissors, SprayCan, Sprout, Droplets, Tractor, Eye, NotebookPen, Leaf } from 'lucide-react'
import type { Giro } from '../domain/graph'
import type { TipoApunte } from '../db/db'

export function GiroIcon({ giro, size = 30 }: { giro: Giro | null; size?: number }) {
  const p = { size, strokeWidth: 2.4 }
  switch (giro) {
    case 'izquierda':
    case 'izquierda-cerrada':
      return <CornerUpLeft {...p} />
    case 'derecha':
    case 'derecha-cerrada':
      return <CornerUpRight {...p} />
    case 'coger':
      return <RouteIcon {...p} />
    case 'dejar':
      return <MapPin {...p} />
    default:
      return <ArrowUp {...p} />
  }
}

export function ApunteIcon({ tipo, size = 18 }: { tipo: TipoApunte; size?: number }) {
  switch (tipo) {
    case 'recoleccion':
      return <Leaf size={size} />
    case 'poda':
      return <Scissors size={size} />
    case 'tratamiento':
      return <SprayCan size={size} />
    case 'abono':
      return <Sprout size={size} />
    case 'riego':
      return <Droplets size={size} />
    case 'desbroce':
      return <Tractor size={size} />
    case 'visita':
      return <Eye size={size} />
    default:
      return <NotebookPen size={size} />
  }
}
