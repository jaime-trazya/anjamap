import { createContext, useContext } from 'react'

export interface ToastOptions {
  action?: { label: string; run: () => void }
  duration?: number
}

export interface ToastApi {
  show(message: string, opts?: ToastOptions): void
  confirm(opts: ConfirmOptions): Promise<boolean>
}

export interface ConfirmOptions {
  title: string
  message?: string
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
  /** Texto que hay que escribir para confirmar (doble confirmación) */
  typeToConfirm?: string
}

export const ToastCtx = createContext<ToastApi | null>(null)

export function useToast(): ToastApi {
  const v = useContext(ToastCtx)
  if (!v) throw new Error('useToast fuera de ToastProvider')
  return v
}
