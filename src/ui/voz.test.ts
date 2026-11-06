import { describe, expect, it, vi } from 'vitest'
import { conDistancia } from './voz'

describe('avisos por voz', () => {
  it('dice la distancia antes del giro', () => {
    expect(conDistancia(312, 'Gira a la derecha.')).toBe('En 310 metros, gira a la derecha.')
    expect(conDistancia(1540, 'Sal de la rotonda.')).toBe('En 1,5 kilómetros, sal de la rotonda.')
  })
})

describe('cola de avisos', () => {
  it('callar anula la frase que iba a sonar y un aviso nuevo sustituye al anterior', async () => {
    vi.useFakeTimers()
    const dichas: string[] = []
    vi.stubGlobal('SpeechSynthesisUtterance', class { lang = ''; voice = null; rate = 1; volume = 1; constructor(public text: string) {} })
    vi.stubGlobal('speechSynthesis', { getVoices: () => [], cancel: () => {}, resume: () => {}, speak: (u: { text: string }) => dichas.push(u.text) })
    if (typeof window === 'undefined') vi.stubGlobal('window', globalThis)
    vi.resetModules()
    const { hablar, callar } = await import('./voz')
    hablar('Gira a la derecha')
    callar()
    vi.advanceTimersByTime(200)
    expect(dichas).toEqual([])
    hablar('Primero')
    hablar('Segundo')
    vi.advanceTimersByTime(200)
    expect(dichas).toEqual(['Segundo'])
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })
})
