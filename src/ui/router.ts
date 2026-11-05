import { useEffect, useState } from 'react'

/** Enrutador mínimo por hash (#/movimientos). Funciona en GitHub Pages sin configuración. */
export function currentRoute(): string {
  const h = window.location.hash.replace(/^#/, '')
  return h || '/'
}

export function navigate(path: string, replace = false) {
  const url = `#${path}`
  if (replace) window.history.replaceState(null, '', url)
  else window.history.pushState(null, '', url)
  window.dispatchEvent(new HashChangeEvent('hashchange'))
}

export function back(fallback = '/') {
  if (window.history.length > 1) window.history.back()
  else navigate(fallback, true)
}

export function useRoute(): string {
  const [route, setRoute] = useState(currentRoute)
  useEffect(() => {
    const on = () => {
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
