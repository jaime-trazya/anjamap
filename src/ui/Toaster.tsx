import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react'
import { ToastCtx, type ConfirmOptions, type ToastApi, type ToastOptions } from './toast'
import { Sheet } from './components'

interface ToastItem {
  id: number
  message: string
  opts: ToastOptions
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const [dialog, setDialog] = useState<(ConfirmOptions & { resolve: (v: boolean) => void }) | null>(null)
  const [typed, setTyped] = useState('')
  const seq = useRef(0)

  const show = useCallback((message: string, opts: ToastOptions = {}) => {
    const id = ++seq.current
    setToasts((t) => [...t.slice(-2), { id, message, opts }])
    window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), opts.duration ?? (opts.action ? 6000 : 3200))
  }, [])

  const confirm = useCallback(
    (opts: ConfirmOptions) =>
      new Promise<boolean>((resolve) => {
        setTyped('')
        setDialog({ ...opts, resolve })
      }),
    [],
  )

  const api = useMemo<ToastApi>(() => ({ show, confirm }), [show, confirm])
  const finish = (v: boolean) => {
    dialog?.resolve(v)
    setDialog(null)
  }
  const blocked = !!dialog?.typeToConfirm && typed.trim().toUpperCase() !== dialog.typeToConfirm.toUpperCase()

  return (
    <ToastCtx.Provider value={api}>
      {children}
      <div className="toasts" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className="toast">
            <span>{t.message}</span>
            {t.opts.action && (
              <button
                onClick={() => {
                  t.opts.action!.run()
                  setToasts((x) => x.filter((y) => y.id !== t.id))
                }}
              >
                {t.opts.action.label}
              </button>
            )}
          </div>
        ))}
      </div>
      {dialog && (
        <Sheet
          title={dialog.title}
          onClose={() => finish(false)}
          footer={
            <>
              <button className="btn block" onClick={() => finish(false)}>
                {dialog.cancelLabel ?? 'Cancelar'}
              </button>
              <button className={`btn block ${dialog.danger ? 'danger' : 'primary'}`} disabled={blocked} onClick={() => finish(true)}>
                {dialog.confirmLabel ?? 'Aceptar'}
              </button>
            </>
          }
        >
          {dialog.message && <p className="muted">{dialog.message}</p>}
          {dialog.typeToConfirm && (
            <label className="field">
              <span>
                Escribe <strong>{dialog.typeToConfirm}</strong> para confirmar
              </span>
              <input className="input" value={typed} onChange={(e) => setTyped(e.target.value)} autoCapitalize="characters" autoCorrect="off" />
            </label>
          )}
        </Sheet>
      )}
    </ToastCtx.Provider>
  )
}
