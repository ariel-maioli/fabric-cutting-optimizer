# Fabric Cutting Optimizer

SPA estática para calcular el largo mínimo de tela necesario cuando el ancho es fijo, usando un algoritmo shelf/first-fit sin rotación.

## Características

- Dimensiones en centímetros dentro del núcleo lógico.
- Hasta 10 tipos de corte, con expansión de cantidades antes del layout.
- Márgenes y separaciones configurables.
- Vista previa en canvas con ancho fiel y largo comprimido.
- Exportación instantánea a PNG mediante `canvas.toDataURL()`.
- Dos temas (claro/oscuro) con persistencia en `localStorage`.
- Diseño desktop-first sin scroll global (los paneles internos son quienes reciben el scroll).

## Modelo de datos

- **FabricSpec**: `{ widthCm, marginX, marginY, gapX, gapY }`. Define el ancho útil (restando márgenes laterales), los márgenes verticales y los gaps que aplican a filas y piezas.
- **CutPiece**: `{ id, label, width, height, quantity }` antes de expandir; tras la expansión cada pieza individual queda como `{ id, label, width, height }`.
- **Band**: `{ id, index, y, height, widthUsed, placements[] }` donde `placements` es un arreglo de rectángulos ya posicionados `{ pieceId, label, width, height, x, y }`.

La expansión de cantidades se realiza antes de ordenar e ingresar al algoritmo, garantizando que cada pieza individual respete las mismas reglas.

## Algoritmo shelf / first-fit

1. Se ordenan las piezas por altura descendente (y por ancho como segundo criterio) para reducir desperdicio vertical.
2. Se crean bandas (shelves) con el ancho útil `widthCm - 2 * marginX`.
3. Para cada pieza:
   - Si el ancho supera el ancho útil se aborta con error.
   - Se intenta colocar en la banda actual respetando gaps horizontales.
   - Si no entra, se cierra la banda (sumando su altura) y se crea una nueva en la siguiente posición vertical (gapY incluido).
4. La altura de cada banda es el máximo alto de las piezas que contiene. El largo total es la suma de alturas más gaps verticales y los dos márgenes verticales.
5. El algoritmo es determinista y no permite rotaciones.

## Vista previa y métricas

- El canvas usa una escala horizontal fija basada en el ancho real de la tela; la escala vertical se comprime para que todo el largo entre en pantalla.
- Se dibujan márgenes, área imprimible y piezas alternando colores de banda.
- Las métricas incluyen: largo total, cantidad de bandas, piezas y porcentaje de uso (área piezas / área ocupada de tela).

## Exportación

El botón "Exportar PNG" genera una imagen del canvas actual usando `toDataURL('image/png')` y dispara una descarga directa, sin dependencias externas.

## Ejecución

No hay dependencias ni build steps. Cualquier servidor estático alcanza:

```bash
cd fabric-cutting-optimizer
python -m http.server 8080
```

Luego abrir `http://localhost:8080` en el navegador.
