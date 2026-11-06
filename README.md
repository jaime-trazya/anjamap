# Anjamap · Bancales

Aplicación para guardar sitios, reconocerlos por sus fotos y llegar hasta ellos. React, TypeScript, Leaflet y Dexie; los datos personales se guardan en el dispositivo. No hay cuentas.

## Funciones

- Mapa de calles o satélite, búsqueda de bancales y posición GPS.
- Bancales con nombre, grupo o zona, nota de acceso y fotos.
- Fotos desde la cámara o la galería, reducidas antes de guardarse.
- Cómo llegar a pie, en coche o en bicicleta, con recorridos e indicaciones calculados por Valhalla.
- Patinete: aproximación mediante el perfil de bicicleta, preferencia por vías ciclistas y pendientes suaves. No es un perfil específico de VMP y no comprueba sus restricciones.
- Navegación centrada en el mapa, distancia, duración estimada, hora de llegada e indicaciones en español. Voz opcional.
- Preferencias para evitar peajes y autopistas en coche; se avisa si la ruta todavía incluye alguno.
- La ruta termina donde llega la red viaria. Si el bancal está más allá, se muestra la distancia en línea recta y se puede continuar a pie.
- Importación y exportación JSON con bancales, fotos, caminos y rutas. Se puede enviar todo, varios bancales seleccionados o uno desde su ficha.
- Importación y exportación GPX para intercambiar puntos y recorridos con otras apps (sin fotos).
- Coche aparcado, caminos propios grabados o dibujados y orientación a pie sin conexión.

No hay diario agrícola, tratamientos, podas, campañas ni formularios de producción. Se mantiene compatibilidad de lectura con copias antiguas y no se borra automáticamente la tabla histórica de instalaciones anteriores.

## Rutas y conexión

El cálculo en línea usa perfiles reales de peatón, automóvil y bicicleta. No se obtiene un recorrido de coche cambiando la velocidad de una ruta peatonal.

Por defecto se utiliza el servidor público de demostración de Valhalla/FOSSGIS, con identificador de cliente, peticiones cancelables y recálculo limitado. No ofrece garantía de disponibilidad ni tráfico en directo. La documentación del operador pide avisar antes de publicar aplicaciones que utilicen su servidor. Para distribuir un servicio estable, se recomienda configurar un servidor propio compatible con CORS en **Ajustes → Servidor de rutas**.

Al calcular una ruta, el servidor recibe el origen, destino y preferencias. Las fotos y las copias no se suben a ese servidor.

### Precisión al navegar

- **Filtro de posición** ([src/domain/track.ts](src/domain/track.ts)): suaviza cada lectura según su precisión y descarta saltos imposibles para el transporte elegido (4 m/s a pie, 12 en patinete, 15 en bici y 45 en coche). La velocidad y el rumbo salen del movimiento real.
- **Ajuste a la ruta**: si la separación cabe en el error del GPS, tu posición se pega a la ruta.
- **Desvíos**: solo cuentan tras tres lecturas seguidas fuera de la ruta. El umbral depende del transporte y de la precisión. Con un desvío confirmado, la ruta se recalcula a los 8 s, en vez de esperar 20.
- **Indicaciones**: siempre la siguiente y, si está cerca, también la de después («Luego: …»). La red local sin conexión también da indicaciones en los cruces.
- **Mapa**:
  - Lo recorrido se pinta en gris y lo que falta en naranja, con borde y flechas de sentido.
  - Tu posición es una flecha de navegación.
  - En coche, bici o patinete se ve la velocidad, y el zoom se ajusta a ella.
- **Brújula**: solo en el modo «Línea recta». Con ruta se sigue el mapa.

La ruta se calcula con conexión. Si se pierde cobertura durante la sesión, se conserva el trazado; los desvíos requieren conexión para recalcularse. La orientación local y los recorridos propios a pie funcionan sin conexión, pero pueden atravesar campo y no verifican restricciones de paso. La red local cubre la Canal de Navarrés y La Costera. El satélite se descarga desde Ajustes.

## Datos y fotos

IndexedDB versión 3 añade una tabla de fotos sin borrar los bancales de las versiones anteriores. Las nuevas copias son versión 3 y admiten importaciones de versiones 1 y 2.

Las fotos se reducen a un máximo de 1600 px y se guardan como JPEG, hasta 20 por bancal. La imagen viaja dentro del JSON: quien lo importa recibe el contenido, no un enlace que depende del dispositivo original. El archivo de intercambio admite hasta 100 MB; para cantidades mayores hay que seleccionar grupos y enviarlos en varios archivos.

Fusionar añade y actualiza identificadores coincidentes. Reemplazar sustituye todos los datos tras confirmación. Las copias se validan antes de modificar las tablas.

Guía: [GUIA_USO.md](GUIA_USO.md).

## Desarrollo

```bash
npm ci
npm run dev
npm run lint
npm test
npm run build
npm run preview
npm audit
```

El sitio se sirve bajo `/anjamap/`. GPS, cámara y brújula requieren un contexto seguro (HTTPS o localhost). La app conserva `noindex`.

## Fuentes

- Mapa base y ortofotos PNOA: © Instituto Geográfico Nacional.
- Caminos y red viaria: © colaboradores de OpenStreetMap, ODbL.
- Motor de rutas: [Valhalla](https://valhalla.github.io/valhalla/api/route/api-reference/).
- Condiciones del servidor público: [documentación de Valhalla](https://valhalla.github.io/valhalla/valhalla-intro/).

## Publicación existente

El workflow `.github/workflows/deploy.yml` compila, ejecuta lint y tests y publica en `gh-pages` al subir a `main`. Esta tarea no cambia ese workflow ni publica automáticamente los cambios de la rama de trabajo.
