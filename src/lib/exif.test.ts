import { describe, expect, it } from 'vitest'
import { gpsDeJpeg } from './exif'

/** JPEG mínimo con EXIF y GPS (big o little endian) */
function jpeg(lat: [number, number, number], latRef: string, lon: [number, number, number], lonRef: string, le = false): ArrayBuffer {
  const tiff: number[] = []
  const u16 = (x: number) => (le ? [x & 255, x >> 8] : [x >> 8, x & 255])
  const u32 = (x: number) => (le ? [x & 255, (x >> 8) & 255, (x >> 16) & 255, x >>> 24] : [x >>> 24, (x >> 16) & 255, (x >> 8) & 255, x & 255])
  // Cabecera TIFF + IFD0 con un puntero al GPS
  tiff.push(...(le ? [0x49, 0x49] : [0x4d, 0x4d]), ...u16(42), ...u32(8))
  const gpsIfd = 8 + 2 + 12 + 4
  tiff.push(...u16(1), ...u16(0x8825), ...u16(4), ...u32(1), ...u32(gpsIfd), ...u32(0))
  // IFD GPS: 4 entradas
  const data = gpsIfd + 2 + 4 * 12 + 4
  const ascii = (c: string) => [c.charCodeAt(0), 0, 0, 0]
  tiff.push(...u16(4))
  tiff.push(...u16(1), ...u16(2), ...u32(2), ...ascii(latRef))
  tiff.push(...u16(2), ...u16(5), ...u32(3), ...u32(data))
  tiff.push(...u16(3), ...u16(2), ...u32(2), ...ascii(lonRef))
  tiff.push(...u16(4), ...u16(5), ...u32(3), ...u32(data + 24))
  tiff.push(...u32(0))
  for (const x of [...lat, ...lon]) tiff.push(...u32(Math.round(x * 100)), ...u32(100))
  const app1 = [0x45, 0x78, 0x69, 0x66, 0, 0, ...tiff]
  const bytes = [0xff, 0xd8, 0xff, 0xe1, (app1.length + 2) >> 8, (app1.length + 2) & 255, ...app1, 0xff, 0xda, 0, 2]
  return new Uint8Array(bytes).buffer
}

describe('ubicación de una foto', () => {
  it('lee el GPS del EXIF', () => {
    const p = gpsDeJpeg(jpeg([39, 5, 12], 'N', [0, 41, 24], 'W'))!
    expect(p[0]).toBeCloseTo(39.08667, 4)
    expect(p[1]).toBeCloseTo(-0.69, 4)
    const q = gpsDeJpeg(jpeg([39, 5, 12], 'N', [0, 41, 24], 'E', true))!
    expect(q[1]).toBeCloseTo(0.69, 4)
  })
  it('devuelve null si no hay GPS o no es JPEG', () => {
    expect(gpsDeJpeg(new Uint8Array([0x89, 0x50, 0x4e, 0x47]).buffer)).toBeNull()
    expect(gpsDeJpeg(new Uint8Array([0xff, 0xd8, 0xff, 0xda, 0, 2]).buffer)).toBeNull()
  })
})
