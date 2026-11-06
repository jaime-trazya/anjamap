import { describe, expect, it } from 'vitest'
import { conDistancia } from './voz'

describe('avisos por voz', () => {
  it('dice la distancia antes del giro', () => {
    expect(conDistancia(312, 'Gira a la derecha.')).toBe('En 310 metros, gira a la derecha.')
    expect(conDistancia(1540, 'Sal de la rotonda.')).toBe('En 1,5 kilómetros, sal de la rotonda.')
  })
})
