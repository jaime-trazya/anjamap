/**
 * Indicaciones por voz.
 *
 * - iPhone/Safari no deja hablar hasta que el usuario toca la pantalla: `desbloquearVoz` se llama en el primer toque
 *   (y al activar la voz) con una frase vacía, y a partir de ahí los avisos suenan solos.
 * - Chrome en Android a veces pierde una frase si se llama a `speak` justo después de `cancel`: se espera un instante.
 * - Se elige una voz en español si el sistema la tiene.
 */
let desbloqueada = false
let vozEs: SpeechSynthesisVoice | null = null

const disponible = () => typeof window !== 'undefined' && 'speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined'

function elegirVoz() {
  if (!disponible()) return
  const voces = window.speechSynthesis.getVoices()
  vozEs = voces.find((v) => v.lang === 'es-ES') ?? voces.find((v) => v.lang.toLowerCase().startsWith('es')) ?? null
}
if (disponible()) {
  elegirVoz()
  window.speechSynthesis.addEventListener?.('voiceschanged', elegirVoz)
}

function frase(texto: string): SpeechSynthesisUtterance {
  const u = new SpeechSynthesisUtterance(texto)
  u.lang = vozEs?.lang ?? 'es-ES'
  if (vozEs) u.voice = vozEs
  u.rate = 1.02
  return u
}

/** Llamar dentro de un toque del usuario */
export function desbloquearVoz() {
  if (!disponible() || desbloqueada) return
  desbloqueada = true
  const u = frase(' ')
  u.volume = 0
  window.speechSynthesis.speak(u)
}

export function hablar(texto: string) {
  if (!disponible() || !texto.trim()) return
  const s = window.speechSynthesis
  s.cancel()
  window.setTimeout(() => {
    s.resume()
    s.speak(frase(texto))
  }, 60)
}

export function callar() {
  if (disponible()) window.speechSynthesis.cancel()
}

/** «Gira a la derecha» → «En 300 metros, gira a la derecha» */
export function conDistancia(metros: number, instruccion: string): string {
  const m = metros >= 1000 ? `${(Math.round(metros / 100) / 10).toString().replace('.', ',')} kilómetros` : `${Math.max(10, Math.round(metros / 10) * 10)} metros`
  return `En ${m}, ${instruccion.charAt(0).toLowerCase()}${instruccion.slice(1)}`
}
