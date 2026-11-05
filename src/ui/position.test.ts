import { afterEach, describe, expect, it, vi } from 'vitest'
import { capturePoint } from './position'

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })

describe('captura GPS', () => {
  it('cancela el GPS y los temporizadores cuando se cierra el editor', async () => {
    vi.useFakeTimers()
    let callback!: PositionCallback
    const clearWatch = vi.fn()
    vi.stubGlobal('navigator', { geolocation: { watchPosition: vi.fn((cb: PositionCallback) => { callback = cb; return 7 }), clearWatch } })
    const controller = new AbortController()
    const progress = vi.fn()
    const capture = capturePoint(progress, 12000, 6, controller.signal)
    const rejected = expect(capture).rejects.toMatchObject({ name: 'AbortError' })
    controller.abort()
    await rejected
    expect(clearWatch).toHaveBeenCalledWith(7)
    expect(vi.getTimerCount()).toBe(0)
    callback({ coords: { latitude: 39, longitude: -0.7, accuracy: 3 }, timestamp: Date.now() } as GeolocationPosition)
    expect(progress).not.toHaveBeenCalled()
  })

  it('conserva lecturas válidas si se agota el tiempo antes de afinar', async () => {
    vi.useFakeTimers()
    let callback!: PositionCallback
    const clearWatch = vi.fn()
    vi.stubGlobal('navigator', { geolocation: { watchPosition: vi.fn((cb: PositionCallback) => { callback = cb; return 8 }), clearWatch } })
    const capture = capturePoint(vi.fn())
    callback({ coords: { latitude: 39, longitude: -0.7, accuracy: 20, speed: null }, timestamp: Date.now() } as GeolocationPosition)
    await vi.advanceTimersByTimeAsync(12000)
    expect((await capture).p).toEqual([39, -0.7])
    expect(clearWatch).toHaveBeenCalledWith(8)
    expect(vi.getTimerCount()).toBe(0)
  })
})
