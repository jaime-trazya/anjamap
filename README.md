# Anjamap · Bancales

PWA para llegar andando a los bancales de olivos de **la Canal de Navarrés** y **La Costera**. Funciona sin conexión. No tiene backend: todo se guarda en el móvil (IndexedDB) y se instala con «Añadir a pantalla de inicio». Usa el mismo estilo y la misma base técnica que [Claudio](https://github.com/jaime-trazya/claudio).

Instrucciones de uso: **[GUIA_USO.md](GUIA_USO.md)**

## Funciones

- **Bancales:** se guardan con el GPS estando en el bancal (promedia varias lecturas para ganar precisión), marcándolos en el satélite o importándolos de un GPX. Cada uno lleva nombre, finca o partida, nota y color.
- **Ir al bancal:** una flecha que apunta hacia dónde ir (con la brújula del móvil o, si no la hay, con el rumbo al andar), la distancia que falta y el tiempo andando. Abajo, el mapa sigue tu posición. Avisa al llegar.
- **Tres formas de ir:**
  - *Recomendada:* calcula la ruta por la red de caminos y penaliza el campo a través (×2,5). Se recalcula con cada lectura del GPS.
  - *Directa:* en línea recta.
  - *Rutas guardadas:* las que has grabado andando o dibujado para ese bancal.
- **Caminos:** se graban andando, se dibujan punto a punto con una cruz en el centro del mapa o se importan de GPX (por ejemplo, de Wikiloc). Los cruces y los extremos cercanos (12 m) se unen solos en una red.
- **Sin conexión:**
  - El GPS, la flecha y la distancia nunca necesitan datos.
  - Las imágenes del mapa se descargan por comarca en dos niveles: básico (zoom ≤15) o detallado (zoom ≤16).
  - El detalle máximo (zoom hasta 19) se descarga solo alrededor de los bancales y a lo largo de los caminos.
  - Todo lo que se ve con conexión también se guarda.
- **Copia de seguridad** en JSON (para iCloud Drive o Google Drive) y exportación de todo a GPX.
- Modo claro y oscuro.

## Fuentes de datos

- Ortofoto **PNOA** y mapa base del **Instituto Geográfico Nacional** (WMTS, CC BY 4.0). Las teselas se piden con CORS y se guardan con la Cache API (`anjamap-teselas`).
- Límites de las dos comarcas: **OpenStreetMap** (relaciones 1691747 y 1691752, ODbL), simplificados en [src/domain/comarcas.ts](src/domain/comarcas.ts).

## Desarrollo

```bash
npm install
npm run dev        # servidor local
npm test           # Vitest
npm run lint       # ESLint
npm run build      # build de producción en dist/
npm run iconos     # regenera iconos y pantallas de inicio (necesita Playwright)
```

El GPS y la brújula solo funcionan con HTTPS (o en `localhost`).

## Estructura

| Carpeta | Qué hay |
| --- | --- |
| `src/lib/geo.ts` | Distancias, rumbos, proyección local y simplificación de recorridos |
| `src/domain/graph.ts` | Red de caminos y ruta recomendada (Dijkstra) |
| `src/domain/nav.ts` | Seguimiento de la ruta: hacia dónde apunta la flecha y cuánto falta |
| `src/map/` | Capa de Leaflet con caché sin conexión y descargas por zona |
| `src/db/db.ts` | Base de datos local (Dexie), ajustes y copia de seguridad |
| `src/screens/` | Pantallas |

## Publicación

`.github/workflows/deploy.yml` publica en GitHub Pages cada vez que se sube algo a `main`, en `https://jaime-trazya.github.io/anjamap/`. Antes hay que activar Pages en el repositorio, con *Settings → Pages → Source: GitHub Actions*. La página lleva `noindex`.
