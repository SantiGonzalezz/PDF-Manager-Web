# Contexto del proyecto

Copia de iLovePDF que corre **entera en el navegador**. Uso personal. La razón de existir es no
subir documentos a un servicio de terceros, así que la regla que manda sobre todas las demás es:

> **Ningún archivo del usuario sale del navegador. No hay backend y no debe haberlo.**

Cualquier propuesta que implique subir un PDF a algún lado contradice el propósito del proyecto.

## Estado

Las seis herramientas de la v1 funcionan: unir, editar páginas (rotar/eliminar/reordenar),
extraer rango, comprimir, proteger con AES-256, quitar contraseña.

Proteger y quitar contraseña corren por lotes con una sola clave, y entregan el resultado en un ZIP.
Un archivo que falla no cancela el lote: se anota en `items` y la UI lo lista aparte.

## Stack

- **Vite + TypeScript**, sin framework. La UI es pequeña y se renderiza con helpers de DOM
  (`src/ui/dom.ts`). No introduzcas React/Svelte sin una razón concreta.
- **pdf-lib** — estructura de páginas: unir, copiar, rotar, eliminar, reordenar. No sabe de cifrado.
- **qpdf** compilado a WASM (`@jspawn/qpdf-wasm`) — cifrado AES-256, descifrado, optimización de
  streams. Es el CLI, no la librería: se invoca con argumentos y un FS en memoria.
- **pdf.js** (`pdfjs-dist`) — miniaturas del editor y rasterizado al comprimir.

Las tres licencias son permisivas (MIT / Apache-2.0). **Evita MuPDF y Ghostscript**: son AGPL y
obligarían a publicar el código o pagar licencia comercial.

## Mapa del código

```
src/
  main.ts            arranque
  state.ts           estado de la app y tipos
  tools.ts           definición de las 6 herramientas
  styles.css         tokens de color y todos los estilos
  lib/
    qpdf.ts          puente al CLI de qpdf en WASM
    pdfjs.ts         carga de pdf.js y rasterizado de páginas
    save.ts          entrega del archivo al usuario
    zip.ts           empaqueta varias salidas en un ZIP sin comprimir
    format.ts        formateo de tamaños
  pdf/               una operación por archivo, sin tocar el DOM
    files.ts  merge.ts  pages.ts  split.ts  compress.ts  crypto.ts  sample.ts
  ui/                todo lo que toca el DOM
    dom.ts  dropzone.ts  filelist.ts  pagegrid.ts  render.ts
```

Separación que conviene mantener: **`src/pdf/` no importa nada de `src/ui/`**. Las operaciones
reciben datos y devuelven un `OperationResult`; la UI decide cómo mostrarlo. Eso es lo que permite
probarlas sueltas y moverlas a un Web Worker el día que haga falta.

## Cosas que ya se probaron y no hay que volver a descubrir

- **qpdf necesita una instancia nueva por invocación.** `callMain` termina el runtime de Emscripten;
  reusar el módulo entre operaciones da resultados impredecibles. Instanciar cuesta poco porque el
  navegador cachea el `.wasm` compilado.
- **`qpdf.js` no se puede importar como módulo.** Es salida de Emscripten: se registra en
  `globalThis.exports` y busca su `.wasm` con fetch relativo. Se sirve estático desde `public/qpdf/`
  y se carga con `<script>` en runtime. `scripts/sync-qpdf.mjs` lo copia en `postinstall`.
- **qpdf devuelve 3 para advertencias** con el archivo ya escrito, y 2 para errores reales. Tratar
  3 como fallo rompe archivos que sí funcionan.
- **pdf.js se apropia del buffer** que recibe. Hay que pasarle una copia (`bytes.slice()`) o pdf-lib
  se queda sin datos después.
- **El render de pdf.js necesita `intent: "print"`.** Con el intent por defecto trocea el dibujo en
  callbacks de `requestAnimationFrame`, y el navegador no dispara rAF en pestañas ocultas: comprimir
  se congela si el usuario se cambia de pestaña, y no avanza hasta que vuelve. Medido con la pestaña
  oculta: nunca termina contra 147 ms. Ningún test e2e lo detecta, porque Playwright siempre corre
  con la página visible.
- **El ZIP se escribe a mano y sin comprimir** (`src/lib/zip.ts`, método "store"). Un PDF ya viene
  comprimido por dentro, así que deflate no ganaría nada, y el formato que queda es tan chico que no
  justifica una dependencia. Lleva el bit 11 de UTF-8 en el nombre; verificado con `Expand-Archive`
  de Windows, incluidos nombres con acentos y archivos vacíos.
- **Comprimir rasteriza.** Gana muchísimo en documentos con fotos (probado: 5.95 MB → 698 KB, −89%)
  y *engorda* los de puro texto vectorial. Ese caso se detecta y se le dice al usuario que se quede
  con el original, en vez de ofrecerle una descarga peor.
- **`base: "./"` en Vite** es lo que hace que el mismo build sirva en la raíz de un dominio y en
  `usuario.github.io/PDF-Manager-Web/`. No lo cambies a `/` sin arreglar el despliegue.

## Límites conocidos (documentados, no bugs)

- WASM es de 32 bits: el techo práctico está entre 2 y 4 GB de RAM y el PDF vive en memoria
  mientras se procesa. Por encima de ~150 MB se avisa; por encima de ~200 MB la pestaña puede morir.
- Safari en iPhone corta pestañas mucho antes que Chrome de escritorio.
- "Quitar contraseña" exige conocer la contraseña. No es un desbloqueador y no debe presentarse así.
- qpdf devuelve el mismo código para clave errada y archivo dañado, así que el mensaje de error no
  puede afinarse más sin mentir.

## Despliegue

GitHub Pages vía `.github/workflows/deploy.yml` en cada push a `main`. Con el plan gratis el repo
debe ser público. Límites: 1 GB de sitio, ~100 GB/mes de tráfico — la app pesa ~4 MB.

Restricción a tener presente: **GitHub Pages no permite headers personalizados**, así que no hay
`COOP`/`COEP` y por tanto no hay `SharedArrayBuffer` ni WASM multihilo. Hoy no importa (todo corre
en un hilo). Si algún día hace falta, tocaría mudarse a Cloudflare Pages.

## Convenciones

- Comentarios y textos de la UI en español. Nombres de código en inglés.
- Los mensajes de error se le escriben al usuario: qué pasó y qué hacer. Nada de volcados técnicos.
- `npm run typecheck` tiene que pasar antes de dar algo por terminado. TypeScript está en `strict`
  con `noUncheckedIndexedAccess`.
- Las pruebas de `tests/e2e.spec.ts` generan sus PDF en el navegador: no metas fixtures binarios.
- Las herramientas `multi` acumulan archivos; `ordered` (solo unir) es lo que muestra las flechas de
  reordenar. No uses `multi` para decidir si el orden importa.
