import { useEffect, useState } from 'react'

/** Enrutador mínimo por hash (#/movimientos). Funciona en GitHub Pages sin configuración. */
export function currentRoute(): string {
  const h = window.location.hash.replace(/^#/, '')
  return h || '/'
}

/**
 * Cada entrada del historial creada en Anjamap lleva su profundidad (0 = la primera página abierta).
 * Así «Atrás» solo retrocede dentro de la app y nunca devuelve a la web de la que venías.
 */
const depthOf = (state: unknown = window.history.state): number | null => {
  const d = (state as { anjamap?: unknown } | null)?.anjamap
  return typeof d === 'number' && Number.isInteger(d) && d >= 0 ? d : null
}
let depth = depthOf() ?? 0
if (depthOf() === null) window.history.replaceState({ anjamap: 0 }, '')

/** Los enlaces normales (#/ruta) crean entradas sin profundidad: se les pone la siguiente */
function stamp() {
  const d = depthOf()
  if (d === null) {
    depth += 1
    window.history.replaceState({ anjamap: depth }, '')
  } else depth = d
}

export function navigate(path: string, replace = false) {
  const url = `#${path}`
  if (replace) window.history.replaceState({ anjamap: depth }, '', url)
  else {
    depth += 1
    window.history.pushState({ anjamap: depth }, '', url)
  }
  window.dispatchEvent(new HashChangeEvent('hashchange'))
}

export function back(fallback = '/') {
  if ((depthOf() ?? 0) > 0) window.history.back()
  else navigate(fallback, true)
}

export function useRoute(): string {
  const [route, setRoute] = useState(currentRoute)
  useEffect(() => {
    const on = () => {
      stamp()
      setRoute(currentRoute())
      window.scrollTo({ top: 0 })
    }
    window.addEventListener('hashchange', on)
    window.addEventListener('popstate', on)
    return () => {
      window.removeEventListener('hashchange', on)
      window.removeEventListener('popstate', on)
    }
  }, [])
  return route
}

/** Parámetros de consulta del hash: #/movimientos?cat=x */
export function routeParams(route: string): URLSearchParams {
  const i = route.indexOf('?')
  return new URLSearchParams(i >= 0 ? route.slice(i + 1) : '')
}

export function routePath(route: string): string {
  const i = route.indexOf('?')
  return i >= 0 ? route.slice(0, i) : route
}
