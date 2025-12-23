
# Fabric Cutting Optimizer

> SPA para optimizar el corte de tela de ancho fijo, minimizando el largo necesario y el desperdicio, con interfaz moderna, ayuda integrada y soporte completo de temas.

## Características principales

- Hasta **10 tipos de corte** configurables (ID, ancho, alto, cantidad).
- Validación de **IDs únicos** para cada tipo de corte (no permite duplicados).
- Márgenes y **GAPs** (separaciones) configurables en cm.
- **Panel de cortes** con barra de desplazamiento vertical.
- **Vista previa interactiva** en canvas: muestra la disposición real de los cortes, márgenes y bandas.
- **Highlight sincronizado**: al pasar el mouse sobre un corte o tarjeta, se resalta en ambos paneles.
- **Exportación instantánea a PNG** de la previsualización (sin dependencias externas).
- **Métricas en tiempo real**: largo total, uso de tela, desperdicio, cantidad de cortes.
- **Temas claro/oscuro** con persistencia y sincronización en todas las vistas (incluida la ayuda).
- **Ayuda integrada** (help.html) que sigue el tema elegido.
- **Modal de configuración** accesible y con foco gestionado.
- Diseño desktop-first, sin scroll global: los paneles internos gestionan el desplazamiento.

## Flujo de uso

1. Configura el **ancho** y los **márgenes** de la tela.
2. Define los **GAPs** (separaciones) entre piezas y filas.
3. Agrega hasta 10 tipos de corte (ID, ancho, alto, cantidad).
4. Haz clic en **Optimizar** para calcular la mejor disposición.
5. Analiza la **vista previa** y las **métricas**.
6. Si lo deseas, **exporta** la imagen PNG.
7. Consulta la **ayuda** para detalles de uso y modelo.

## Modelo de datos

- **FabricSpec**: `{ widthCm, marginX, marginY, gapX, gapY }` — define el área útil y separaciones.
- **CutPiece**: `{ id, label, width, height, quantity }` (antes de expandir); luego cada pieza individual es `{ id, label, width, height }`.
- **Band**: `{ id, index, y, height, widthUsed, placements[] }`, donde `placements` son los cortes posicionados `{ pieceId, label, width, height, x, y }`.

## Algoritmo de optimización (shelf/first-fit)

1. Ordena piezas por altura descendente y luego por ancho.
2. Crea bandas horizontales (shelves) del ancho útil (`widthCm - 2*marginX`).
3. Coloca cada pieza en la banda actual si cabe (respetando gaps). Si no, inicia nueva banda.
4. Suma alturas de bandas, gaps y márgenes para obtener el largo total.
5. No permite rotaciones. Si una pieza no cabe en ancho, muestra error.
6. El proceso es determinista y rápido.

## Interfaz y experiencia de usuario

- **Panel de cortes**: lista editable, scroll vertical siempre visible, validación de IDs únicos, eliminación y edición en línea.
- **Highlight**: al pasar el mouse sobre un corte en la lista o en la preview, ambos se resaltan.
- **Modal de configuración**: permite ajustar tela y gaps, con foco y cierre accesibles.
- **Ayuda**: página dedicada, sincronizada con el tema elegido.
- **Dark mode**: selector persistente, afecta toda la app y la ayuda.
- **Exportar PNG**: botón dedicado, genera imagen de la preview actual.

## Exportación

El botón "Exportar PNG" descarga la imagen actual del canvas (`toDataURL('image/png')`). No requiere dependencias externas.

## Ejecución local

No requiere dependencias ni build steps. Basta un servidor estático:

```bash
cd fabric-cutting-optimizer
python -m http.server 8080
```

Luego abre `http://localhost:8080` en tu navegador.

---

Para dudas sobre el modelo, uso o interpretación de métricas, consulta la ayuda integrada (ícono ⓘ en la app).
