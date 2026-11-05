# Anjamap · Bancales

PWA para llegar andando a los bancales de olivos de **la Canal de Navarrés** y **La Costera**, y llevar su diario de campo. Funciona sin conexión. No tiene backend: todo se guarda en el móvil (IndexedDB) y se instala con «Añadir a pantalla de inicio».

Instrucciones de uso: **[GUIA_USO.md](GUIA_USO.md)**

## Funciones

- **Bancales:**
  - Se guardan de tres formas: con el GPS estando en el bancal (promedia varias lecturas para ganar precisión), marcándolos en el satélite o importándolos de un GPX.
  - Cada uno lleva nombre, finca o partida, número de olivos, variedad, nota y color.
- **Ir al bancal:**
  - Una brújula con una flecha naranja que apunta hacia dónde ir, la distancia que falta y el tiempo andando.
  - En los cruces da indicaciones: «En 40 m, gira a la izquierda». El móvil vibra al acercarse a cada giro y al llegar.
  - Abajo, el mapa sigue tu posición.
- **Tres formas de ir:**
  - *Recomendada:* por la red de pistas y sendas, penalizando el campo a través (×2,5). Se recalcula con cada lectura del GPS.
  - *Línea recta.*
  - *Rutas guardadas:* las que has grabado andando o dibujado para ese bancal.
- **Caminos de OpenStreetMap ya cargados:** unos 31.000 tramos de pistas, sendas y calles de las dos comarcas. Los caminos propios (grabados, dibujados o de GPX) se unen solos a esa red en los cruces y en los extremos cercanos (12 m).
- **Volver al coche:** se marca dónde aparcas y te lleva de vuelta con la misma flecha.
- **Ir a cualquier punto:** mantén pulsado el mapa y elige «Ir aquí», sin necesidad de guardarlo como bancal.
- **Compartir un bancal:** genera un enlace (para WhatsApp, por ejemplo). Quien lo abre puede guardarlo en su Anjamap o ir directamente.
- **Diario de campo:**
  - Apuntes de poda, tratamiento, abono, riego, desbroce, recolección (con kilos) y visitas.
  - Se organiza por campañas, de septiembre a agosto, con los kilos por bancal y los kilos por olivo.
  - Filtro por bancal, kilos con decimales y días de recogida sin duplicar fechas. El rendimiento por olivo solo se calcula con un censo completo de los bancales con cosecha.
- **Sin conexión:**
  - Siempre funcionan sin datos el GPS, la flecha, las rutas por caminos (la red de OSM viaja con la app) y el diario.
  - El satélite se descarga por comarca (básico o detallado) y con máximo detalle alrededor de tus bancales y caminos.
- **Copia de seguridad** en JSON (bancales, caminos, rutas y diario) y exportación a GPX.
- Modo claro y modo oscuro.

## Diseño

Es un «cuaderno de campo»:
- Papel cálido y tinta verde casi negra.
- Verde oliva para la marca.
- Naranja de señalización solo en lo que hay que ver de un vistazo al sol: la flecha, «Ir» y la ruta en el mapa.
- Tipografía Barlow para leer y Barlow Condensed para títulos y cifras. Se incluyen en la app, así que también se ven sin conexión.

## Fuentes de datos

- Ortofoto **PNOA** y mapa base del **Instituto Geográfico Nacional** (WMTS, CC BY 4.0). Las teselas se piden con CORS y se guardan con la Cache API (`anjamap-teselas`).
- Pistas, sendas, calles y límites de las comarcas: **© colaboradores de OpenStreetMap** (ODbL).
  - Red de caminos: [public/caminos-osm.json](public/caminos-osm.json), generada con `node scripts/generar-caminos-osm.mjs`.
  - Límites: relaciones 1691747 y 1691752, en [src/domain/comarcas.ts](src/domain/comarcas.ts).

## Desarrollo

```bash
npm install
npm run dev        # servidor local
npm test           # Vitest
npm run lint       # ESLint
npm run build      # build de producción en dist/
npm run iconos     # regenera iconos y pantallas de inicio (necesita Playwright)
node scripts/generar-caminos-osm.mjs   # vuelve a bajar la red de caminos de OSM
```

El GPS y la brújula solo funcionan con HTTPS (o en `localhost`).

## Estructura

| Carpeta | Qué hay |
| --- | --- |
| `src/lib/` | Distancias, rumbos, proyección local, simplificación y fechas |
| `src/domain/graph.ts` | Red de caminos (OSM y propios), ruta recomendada (A*) e indicaciones de giro |
| `src/domain/nav.ts` | Seguimiento de la ruta: hacia dónde apunta la flecha, cuánto falta y el siguiente giro |
| `src/domain/osm.ts` | Lectura de la red de OpenStreetMap |
| `src/map/` | Capa de Leaflet con caché sin conexión y descargas por zona |
| `src/db/db.ts` | Base de datos local (Dexie, versión 2 con el diario), ajustes y copia de seguridad |
| `src/screens/` | Pantallas |

La red de OSM se monta (unos 114.000 nodos) solo cuando una pantalla calcula rutas, después de pintar. En un ordenador tarda unos 0,4 s; cada ruta, unos 10 ms.

## Publicación

`.github/workflows/deploy.yml` compila, pasa lint y tests y publica `dist/` en la rama `gh-pages` cada vez que se sube algo a `main`. Pages sirve esa rama (*Settings → Pages → Deploy from a branch → gh-pages*) en https://jaime-trazya.github.io/anjamap/. La página lleva `noindex`.
