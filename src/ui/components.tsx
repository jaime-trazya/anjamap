import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { ChevronLeft, X } from 'lucide-react'
import { back } from './router'

interface SheetProps {
  title?: ReactNode
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  full?: boolean
  headerAction?: ReactNode
}

// Hojas abiertas, de abajo arriba. La página no se desplaza mientras haya alguna abierta y Escape cierra la de arriba.
const openSheets: symbol[] = []
function syncScrollLock() {
  document.body.style.overflow = openSheets.length ? 'hidden' : ''
}

/** Hoja inferior al estilo iOS. Se cierra con el fondo, la X o Escape. */
export function Sheet({ title, onClose, children, footer, full, headerAction }: SheetProps) {
  const [closing, setClosing] = useState(false)
  const closeRef = useRef(onClose)
  const closingRef = useRef(false)
  useEffect(() => {
    closeRef.current = onClose
  }, [onClose])
  const close = () => {
    if (closingRef.current) return
    closingRef.current = true
    setClosing(true)
    window.setTimeout(() => closeRef.current(), 200)
  }
  const closeFnRef = useRef(close)
  useEffect(() => {
    closeFnRef.current = close
  })
  useEffect(() => {
    const id = Symbol('hoja')
    openSheets.push(id)
    syncScrollLock()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && openSheets[openSheets.length - 1] === id) closeFnRef.current()
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      openSheets.splice(openSheets.indexOf(id), 1)
      syncScrollLock()
    }
  }, [])
  return createPortal(
    <div className={`sheet-root ${closing ? 'sheet-closing' : ''}`} role="dialog" aria-modal="true" aria-label={typeof title === 'string' ? title : undefined}>
      <div className="sheet-scrim" onClick={close} />
      <div className={`sheet ${full ? 'full' : ''}`}>
        <div className="sheet-grabber" />
        <div className="sheet-head">
          <h2>{title}</h2>
          <div className="row" style={{ gap: 4 }}>
            {headerAction}
            <button className="icon-btn plain" onClick={close} aria-label="Cerrar">
              <X size={22} />
            </button>
          </div>
        </div>
        <div className="sheet-body">{children}</div>
        {footer && <div className="sheet-foot">{footer}</div>}
      </div>
    </div>,
    document.body,
  )
}

export function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; label?: string }) {
  return (
    <div className="segmented" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" aria-pressed={o.value === value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Notice({ tone = 'accent', icon, title, children, actions }: { tone?: 'warn' | 'accent' | 'neg'; icon: ReactNode; title: string; children?: ReactNode; actions?: ReactNode }) {
  return (
    <div className={`notice ${tone}`} role={tone === 'neg' ? 'alert' : 'status'}>
      <span className="notice-icon">{icon}</span>
      <div className="grow">
        <strong>{title}</strong>
        {children && <p>{children}</p>}
        {actions && <div className="notice-actions">{actions}</div>}
      </div>
    </div>
  )
}

export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="switch">
      <input type="checkbox" role="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} aria-label={label} />
      <span />
    </label>
  )
}

export function BackBar({ label = 'Atrás', fallback = '/', right }: { label?: string; fallback?: string; right?: ReactNode }) {
  return (
    <div className="back-bar">
      <button onClick={() => back(fallback)}>
        <ChevronLeft size={24} />
        {label}
      </button>
      {right && <div style={{ marginLeft: 'auto' }}>{right}</div>}
    </div>
  )
}

export function Empty({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty">
      <strong>{title}</strong>
      {children && <p>{children}</p>}
      {action && <div style={{ marginTop: 14 }}>{action}</div>}
    </div>
  )
}

/** Tesela de color de un bancal (como las categorías de Claudio) */
export function BancalTile({ color, size = 'md', children }: { color: string; size?: 'sm' | 'md'; children?: ReactNode }) {
  return (
    <span className={`tile ${size === 'sm' ? 'sm' : ''}`} style={{ '--c': color } as React.CSSProperties} aria-hidden>
      {children}
    </span>
  )
}

/** Flecha pequeña que apunta en un rumbo (grados respecto a arriba) */
export function MiniArrow({ deg, size = 16 }: { deg: number; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" style={{ transform: `rotate(${deg}deg)`, transition: 'transform 200ms' }} aria-hidden>
      <path d="M12 3 L19 20 L12 16 L5 20 Z" fill="currentColor" />
    </svg>
  )
}
