/** Importación y exportación GPX (Wikiloc, Google Earth vía GPX, otros GPS) */
import { isLatLon, type LatLon } from '../lib/geo'

export interface GpxData {
  tracks: { name: string; points: LatLon[] }[]
  waypoints: { name: string; point: LatLon; desc?: string }[]
}

const num = (v: string | null) => (v === null || !v.trim() ? NaN : Number(v))

export function parseGpx(xml: string): GpxData {
  const doc = new DOMParser().parseFromString(xml, 'application/xml')
  if (doc.getElementsByTagName('parsererror').length || doc.documentElement.localName !== 'gpx') throw new Error('El archivo no es un GPX válido')
  const elements = (el: Document | Element, tag: string) => Array.from(el.getElementsByTagNameNS('*', tag))
  const text = (el: Element, tag: string) => Array.from(el.childNodes).find((n) => n.nodeType === 1 && (n as Element).localName === tag)?.textContent?.trim() ?? ''
  const pts = (els: Element[]): LatLon[] => {
    const points = els.map((p) => [num(p.getAttribute('lat')), num(p.getAttribute('lon'))] as LatLon)
    if (!points.every(isLatLon)) throw new Error('El GPX contiene coordenadas no válidas')
    return points
  }

  const tracks: GpxData['tracks'] = []
  for (const trk of elements(doc, 'trk')) {
    const name = text(trk, 'name') || 'Camino importado'
    const segs = elements(trk, 'trkseg')
    segs.forEach((seg, i) => {
      const p = pts(elements(seg, 'trkpt'))
      if (p.length >= 2) tracks.push({ name: segs.length > 1 ? `${name} (${i + 1})` : name, points: p })
    })
  }
  for (const rte of elements(doc, 'rte')) {
    const p = pts(elements(rte, 'rtept'))
    if (p.length >= 2) tracks.push({ name: text(rte, 'name') || 'Ruta importada', points: p })
  }
  const waypoints: GpxData['waypoints'] = []
  for (const w of elements(doc, 'wpt')) {
    const [p] = pts([w])
    if (p) waypoints.push({ name: text(w, 'name') || 'Punto', point: p, desc: text(w, 'desc') || undefined })
  }
  return { tracks, waypoints }
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

export function toGpx(data: GpxData): string {
  const wpts = data.waypoints
    .map((w) => `  <wpt lat="${w.point[0]}" lon="${w.point[1]}"><name>${esc(w.name)}</name>${w.desc ? `<desc>${esc(w.desc)}</desc>` : ''}</wpt>`)
    .join('\n')
  const trks = data.tracks
    .map((t) => `  <trk><name>${esc(t.name)}</name><trkseg>\n${t.points.map((p) => `    <trkpt lat="${p[0]}" lon="${p[1]}"/>`).join('\n')}\n  </trkseg></trk>`)
    .join('\n')
  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Anjamap" xmlns="http://www.topografix.com/GPX/1/1">
${wpts}
${trks}
</gpx>
`
}
