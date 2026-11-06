import { DOMParser } from '@xmldom/xmldom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { readTransfer, transferGpx } from './transfer'
import { photoSize } from '../ui/photos'

afterEach(() => vi.unstubAllGlobals())
describe('intercambio rápido', () => {
  it('importa puntos y caminos GPX desde el mismo diálogo que las copias', () => {
    vi.stubGlobal('DOMParser', DOMParser)
    const result = readTransfer('<gpx><wpt lat="39" lon="-0.7"><name>Entrada</name></wpt><trk><trkseg><trkpt lat="39" lon="-0.7"/><trkpt lat="39.001" lon="-0.7"/></trkseg></trk></gpx>', 'sitios.gpx')
    expect(result.version).toBe(3)
    expect(result.bancales[0].nombre).toBe('Entrada')
    expect(result.caminos).toHaveLength(1)
    expect(transferGpx(result)).toContain('<name>Entrada</name>')
  })
  it('rechaza JSON ilegible con un mensaje comprensible', () => {
    expect(() => readTransfer('{roto', 'datos.json')).toThrow('JSON válido')
  })
  it('reduce las fotos grandes conservando sus proporciones', () => {
    expect(photoSize(4000, 3000)).toEqual({ width: 1600, height: 1200 })
    expect(photoSize(3000, 4000)).toEqual({ width: 1200, height: 1600 })
    expect(photoSize(400, 300)).toEqual({ width: 400, height: 300 })
  })
})

describe('importar CSV', () => {
  it('lee una hoja española con punto y coma y coma decimal', async () => {
    const { csvABackup } = await import('./transfer')
    const { backup, descartadas } = csvABackup('﻿Nombre;Latitud;Longitud;Finca;Notas\n"Caseta; norte";39,1012;-0,6957;La Solana;Entrada por la cadena\nSin coordenadas;;;;\nPozo;39.2;-0.71;;\n')
    expect(backup.bancales.map((b) => b.nombre)).toEqual(['Caseta; norte', 'Pozo'])
    expect(backup.bancales[0]).toMatchObject({ lat: 39.1012, lon: -0.6957, finca: 'La Solana', nota: 'Entrada por la cadena' })
    expect(descartadas).toBe(1)
  })
  it('acepta una columna de coordenadas y da ids estables', async () => {
    const { csvABackup } = await import('./transfer')
    const a = csvABackup('sitio,coordenadas\nHuerto,"39.1, -0.7"\n').backup
    const b = csvABackup('sitio,coordenadas\nHuerto,"39.1, -0.7"\n').backup
    expect(a.bancales[0].id).toBe(b.bancales[0].id)
    expect(() => csvABackup('nombre\nHuerto\n')).toThrow(/latitud/)
  })
})
