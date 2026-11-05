import { useCallback, useRef, useState } from 'react'
import { useToast } from './toast'

/** Evita dobles pulsaciones y mantiene el formulario abierto si no se puede guardar. */
export function useAction() {
  const toast = useToast()
  const locked = useRef(false)
  const [busy, setBusy] = useState(false)
  const run = useCallback(async (action: () => Promise<unknown>) => {
    if (locked.current) return
    locked.current = true
    setBusy(true)
    try {
      await action()
    } catch (error) {
      toast.show(error instanceof Error ? error.message : 'No se ha podido completar la operación')
    } finally {
      locked.current = false
      setBusy(false)
    }
  }, [toast])
  return { busy, run }
}
