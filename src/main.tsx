import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/manrope'
import 'leaflet/dist/leaflet.css'
import './styles.css'
import './map.css'
import { App } from './App'
import { requestPersistence } from './db/db'

// Pide almacenamiento persistente para que el sistema no borre datos ni mapas guardados
void requestPersistence()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
