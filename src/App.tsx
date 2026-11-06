import { useCallback, useEffect, useState } from 'react'
import { Camera, Car, Footprints, List, LocateFixed, Map as MapIcon, MapPinPlus, PenLine, ScanLine, Settings as SettingsIcon, Waypoints } from 'lucide-react'
import { gpsDeJpeg } from './lib/exif'
import { preparePhoto } from './ui/photos'
import { pickFile } from './ui/files'
import { QrScanner } from './ui/Qr'
import { puedeEscanear } from './ui/qrUtil'
import { useRegisterSW } from 'virtual:pwa-register/react'
import { DataProvider } from './ui/data'
import { useData } from './ui/useData'
import { ToastProvider } from './ui/Toaster'
import { useToast } from './ui/toast'
import { EditorCtx, type EditorApi, type NewBancalOpts } from './ui/editor'
import { navigate, routePath, useRoute } from './ui/router'
import { lastFix } from './ui/position'
import { setSetting } from './db/db'
import { Sheet } from './ui/components'
import { MapScreen } from './screens/MapScreen'
import { BancalesScreen } from './screens/Bancales'
import { BancalDetail } from './screens/BancalDetail'
import { BancalEditor } from './screens/BancalEditor'
import { Navigate } from './screens/Navigate'
import { PlanScreen } from './screens/Planificar'
import { CaminosScreen } from './screens/Caminos'
import { LineDetail } from './screens/LineDetail'
import { RecordScreen } from './screens/Record'
import { DrawScreen } from './screens/Draw'
import { SettingsScreen } from './screens/Settings'
import { Compartido } from './screens/Compartido'
import { InstallGuide, InstallHint } from './screens/Install'

const TABS = [
  { path: '/', label: 'Mapa', icon: MapIcon },
  { path: '/bancales', label: 'Bancales', icon: List },
  { path: '/caminos', label: 'Caminos', icon: Waypoints },
  { path: '/ajustes', label: 'Ajustes', icon: SettingsIcon },
]

function useTheme() {
  const { settings } = useData()
  useEffect(() => {
    const root = document.documentElement
    if (settings.tema === 'claro') root.dataset.theme = 'light'
    else if (settings.tema === 'oscuro') root.dataset.theme = 'dark'
    else delete root.dataset.theme
  }, [settings.tema])
}

function UpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, reg) {
      if (reg) window.setInterval(() => void reg.update(), 60 * 60 * 1000)
    },
  })
  if (!needRefresh) return null
  return (
    <div className="update-bar">
      <div className="toast" style={{ width: '100%', justifyContent: 'space-between' }}>
        <span>Hay una versión nueva. Tus datos se conservan.</span>
        <span className="row" style={{ gap: 14 }}>
          <button onClick={() => setNeedRefresh(false)}>Luego</button>
          <button onClick={() => void updateServiceWorker(true)}>Actualizar</button>
        </span>
      </div>
    </div>
  )
}

function AddSheet({ onClose, editor, onScan }: { onClose: () => void; editor: EditorApi; onScan: () => void }) {
  const toast = useToast()
  // Sitio desde una foto: usa la posición GPS guardada en la foto y la añade al sitio
  const desdeFoto = async () => {
    onClose()
    const file = await pickFile('image/jpeg,image/*')
    if (!file) return
    try {
      const p = gpsDeJpeg(await file.arrayBuffer())
      if (!p) return toast.show('Esta foto no tiene ubicación GPS. Activa la ubicación en la cámara o márcalo en el mapa.', { duration: 6000 })
      const foto = await preparePhoto(file).catch(() => undefined)
      editor.openBancal(undefined, { point: p, precision: null, foto, nombre: file.name.replace(/.[^.]+$/, '').slice(0, 60) || undefined })
    } catch (e) {
      toast.show(e instanceof Error ? e.message : 'No se ha podido leer la foto')
    }
  }
  const go = (path: string) => {
    onClose()
    navigate(path)
  }
  const items = [
    { icon: LocateFixed, title: 'Guardar bancal aquí', sub: 'Con el GPS, estando en el bancal', run: () => (onClose(), editor.openBancal(undefined, { gps: true })) },
    { icon: MapPinPlus, title: 'Marcar bancal en el mapa', sub: 'Desde casa, sobre el satélite', run: () => go('/dibujar?tipo=bancal') },
    {
      icon: Car,
      title: 'Dejar el coche aquí',
      sub: 'Para volver luego con la flecha',
      run: () => {
        onClose()
        const f = lastFix()
        if (!f || Date.now() - f.t > 30000) return toast.show('Espera una posición GPS actualizada para guardar el coche')
        void setSetting('coche', { lat: f.p[0], lon: f.p[1], t: Date.now() })
        toast.show('Coche guardado aquí')
      },
    },
    { icon: Camera, title: 'Sitio desde una foto', sub: 'Con la ubicación GPS que guarda la foto', run: () => void desdeFoto() },
    {
      icon: ScanLine,
      title: 'Escanear código QR',
      sub: 'De un sitio que te enseñan en otro móvil',
      run: () => {
        onClose()
        if (puedeEscanear()) onScan()
        else toast.show('Abre la cámara del móvil, enfoca el código y pulsa el enlace: se abrirá aquí.', { duration: 7000 })
      },
    },
    { icon: Footprints, title: 'Grabar camino andando', sub: 'Se apunta el recorrido con el GPS', run: () => go('/grabar?tipo=camino') },
    { icon: PenLine, title: 'Dibujar camino', sub: 'Punto a punto sobre el mapa', run: () => go('/dibujar?tipo=camino') },
  ]
  return (
    <Sheet title="Añadir" onClose={onClose}>
      <section className="card flush list">
        {items.map((it) => (
          <button key={it.title} className="list-item" onClick={it.run}>
            <span className="tile none">
              <it.icon size={21} />
            </span>
            <div className="grow">
              <div className="primary-line">{it.title}</div>
              <div className="secondary-line">{it.sub}</div>
            </div>
          </button>
        ))}
      </section>
    </Sheet>
  )
}

function Shell() {
  const route = useRoute()
  const path = routePath(route)
  const { ready } = useData()
  useTheme()
  const [bancalEdit, setBancalEdit] = useState<{ id?: string; opts?: NewBancalOpts; key: number } | null>(null)
  const [adding, setAdding] = useState(false)
  const [scanning, setScanning] = useState(false)
  const closeScan = useCallback(() => setScanning(false), [setScanning])
  const [editor] = useState<EditorApi>(() => ({
    openBancal: (id, opts) => setBancalEdit({ id, opts, key: Date.now() }),
    openAdd: () => setAdding(true),
  }))

  const fullScreen = /^\/(ir|grabar|dibujar|planificar)/.test(path)
  const tab =
    path === '/'
      ? '/'
      : path.startsWith('/bancal')
        ? '/bancales'
        : /^\/(camino|ruta)/.test(path)
          ? '/caminos'
          : (TABS.find((t) => t.path !== '/' && path.startsWith(t.path))?.path ?? '')
  const seg = path.split('/')

  let screen: React.ReactNode
  if (!ready) screen = <div className="screen" aria-busy="true" />
  else if (path === '/') screen = <MapScreen />
  else if (path === '/bancales') screen = <BancalesScreen />
  else if (seg[1] === 'bancal' && seg[2]) screen = <BancalDetail key={seg[2]} id={seg[2]} />
  else if (seg[1] === 'ir' && seg[2]) screen = <Navigate key={seg[2]} id={seg[2]} route={route} />
  else if (path === '/planificar') screen = <PlanScreen route={route} />
  else if (path === '/caminos') screen = <CaminosScreen />
  else if ((seg[1] === 'camino' || seg[1] === 'ruta') && seg[2]) screen = <LineDetail key={path} kind={seg[1]} id={seg[2]} />
  else if (path === '/grabar') screen = <RecordScreen route={route} />
  else if (path === '/dibujar') screen = <DrawScreen key={route} route={route} />
  else if (path === '/compartido') screen = <Compartido route={route} />
  else if (path === '/ajustes') screen = <SettingsScreen />
  else if (path === '/ajustes/instalar') screen = <InstallGuide />
  else {
    screen = null
    queueMicrotask(() => navigate('/', true))
  }

  return (
    <EditorCtx.Provider value={editor}>
      <div className="app">
        {screen}
        {!fullScreen && (
          <nav className="tabbar" aria-label="Navegación principal">
            <div className="tabbar-inner">
              {TABS.map((t) => {
                const Icon = t.icon
                const active = tab === t.path
                return (
                  <a key={t.path} className="tab" href={`#${t.path}`} aria-current={active ? 'page' : undefined}>
                    <Icon size={23} strokeWidth={active ? 2.2 : 1.8} />
                    {t.label}
                  </a>
                )
              })}
            </div>
          </nav>
        )}
        {adding && <AddSheet editor={editor} onClose={() => setAdding(false)} onScan={() => setScanning(true)} />}
        {scanning && <QrScanner onClose={closeScan} />}
        {bancalEdit && <BancalEditor key={bancalEdit.key} id={bancalEdit.id} opts={bancalEdit.opts} onClose={() => setBancalEdit(null)} />}
        {ready && <InstallHint />}
        <UpdatePrompt />
      </div>
    </EditorCtx.Provider>
  )
}

export function App() {
  return (
    <DataProvider>
      <ToastProvider>
        <Shell />
      </ToastProvider>
    </DataProvider>
  )
}
