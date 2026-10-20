# Taller PDF Local

Herramientas de PDF que corren enteras en el navegador. Ningún archivo se sube a ningún servidor:
no hay backend, y esa es la única razón por la que existe el proyecto.

Puedes abrir la pestaña de red del navegador mientras lo usas y comprobarlo.

## Qué hace

| Herramienta | Qué resuelve |
| --- | --- |
| Unir | Varios PDF en uno, en el orden que definas |
| Editar páginas | Rotar, eliminar y reordenar arrastrando miniaturas |
| Extraer páginas | Sacar un rango (`1-3, 5, 8-`) a un archivo nuevo |
| Comprimir | Reescalar y reencodear imágenes a 72 / 150 / 300 DPI |
| Proteger | Cifrar uno o varios con AES-256 y contraseña de apertura |
| Quitar contraseña | Eliminar el cifrado de uno o varios PDF cuya clave conoces |

## Arrancar

```bash
npm install     # postinstall copia el motor qpdf a public/qpdf/
npm run dev     # http://localhost:5173
```

Otros comandos:

```bash
npm run build       # typecheck + build de producción a dist/
npm run preview     # sirve dist/ en http://localhost:4173
npm run typecheck   # solo TypeScript
npm run test:e2e    # Playwright contra el build
```

La primera vez, Playwright necesita su navegador: `npx playwright install chromium`.

## Cómo funciona

Un PDF se puede leer y reescribir por completo con código que corre en tu máquina. El navegador ya
sabe hacerlo: JavaScript maneja la estructura del documento y WebAssembly ejecuta librerías nativas
de C++ —las mismas que usaría un backend— dentro de la pestaña.

- **[pdf-lib](https://pdf-lib.js.org/)** (MIT) — estructura de páginas
- **[qpdf](https://qpdf.readthedocs.io/)** compilado a WASM (Apache-2.0) — cifrado AES-256 y optimización
- **[pdf.js](https://mozilla.github.io/pdf.js/)** (Apache-2.0) — miniaturas y rasterizado

## Desplegar

Cada push a `main` publica en GitHub Pages mediante `.github/workflows/deploy.yml`. Se activa una
sola vez en **Settings → Pages → Source: GitHub Actions**.

El build usa rutas relativas (`base: "./"`), así que el mismo `dist/` funciona igual en un
subdirectorio de GitHub Pages que en la raíz de un dominio propio o de Cloudflare Pages.

## Límites

- El PDF se procesa en memoria. Por encima de ~150 MB la app avisa; por encima de ~200 MB la
  pestaña puede quedarse sin RAM. Safari en iPhone aguanta bastante menos.
- Comprimir rasteriza las páginas: el archivo pesa mucho menos pero el texto deja de ser
  seleccionable. En documentos de puro texto la app detecta que no hay ganancia y te lo dice.
- Quitar contraseña necesita que conozcas la contraseña.
- Proteger y Quitar contraseña trabajan por lotes: sueltas varios PDF, escribes la clave una vez y
  salen todos en un ZIP. Un archivo que falle no cancela el resto — se dice cuál fue y por qué.
- Convertir a Word/Excel, OCR y firma con certificado **no** están: son las tres cosas que sí
  exigirían un servidor.
