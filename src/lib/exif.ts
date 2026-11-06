import { isLatLon, type LatLon } from './geo'

/**
 * Lee la posición GPS guardada en una foto JPEG (EXIF). Devuelve null si la foto no la tiene
 * (muchas apps de mensajería la borran al enviar) o si no es un JPEG.
 */
export function gpsDeJpeg(buf: ArrayBuffer): LatLon | null {
  const v = new DataView(buf)
  if (v.byteLength < 4 || v.getUint16(0) !== 0xffd8) return null
  let o = 2
  while (o + 4 <= v.byteLength) {
    if (v.getUint8(o) !== 0xff) return null
    const marker = v.getUint8(o + 1)
    const size = v.getUint16(o + 2)
    if (marker === 0xda || size < 2) return null
    // APP1 con «Exif\0\0»
    if (marker === 0xe1 && o + 10 <= v.byteLength && v.getUint32(o + 4) === 0x45786966 && v.getUint16(o + 8) === 0) {
      return leerTiff(v, o + 10, Math.min(v.byteLength, o + 2 + size))
    }
    o += 2 + size
  }
  return null
}

function leerTiff(v: DataView, t: number, end: number): LatLon | null {
  if (t + 8 > end) return null
  const bo = v.getUint16(t)
  const le = bo === 0x4949
  if (!le && bo !== 0x4d4d) return null
  const u16 = (p: number) => v.getUint16(p, le)
  const u32 = (p: number) => v.getUint32(p, le)
  const inside = (p: number, n: number) => p >= t && p + n <= end
  const entries = (ifd: number): Map<number, { type: number; count: number; at: number }> => {
    const m = new Map<number, { type: number; count: number; at: number }>()
    if (!inside(ifd, 2)) return m
    const n = u16(ifd)
    for (let i = 0; i < n && i < 200; i++) {
      const e = ifd + 2 + i * 12
      if (!inside(e, 12)) break
      m.set(u16(e), { type: u16(e + 2), count: u32(e + 4), at: e + 8 })
    }
    return m
  }
  const ifd0 = entries(t + u32(t + 4))
  const gpsPtr = ifd0.get(0x8825)
  if (!gpsPtr) return null
  const gps = entries(t + u32(gpsPtr.at))
  const ref = (tag: number) => {
    const e = gps.get(tag)
    return e && inside(e.at, 1) ? String.fromCharCode(v.getUint8(e.at)) : ''
  }
  const dms = (tag: number): number | null => {
    const e = gps.get(tag)
    // 3 racionales (grados, minutos, segundos) fuera de la entrada
    if (!e || e.type !== 5 || e.count !== 3) return null
    const p = t + u32(e.at)
    if (!inside(p, 24)) return null
    const r = (k: number) => {
      const d = u32(p + k * 8 + 4)
      return d ? u32(p + k * 8) / d : 0
    }
    return r(0) + r(1) / 60 + r(2) / 3600
  }
  const lat = dms(2)
  const lon = dms(4)
  if (lat === null || lon === null) return null
  const p: LatLon = [ref(1) === 'S' ? -lat : lat, ref(3) === 'W' ? -lon : lon]
  return isLatLon(p) && (p[0] !== 0 || p[1] !== 0) ? p : null
}
