// Copia el motor qpdf (WASM) desde node_modules a public/qpdf/.
//
// Por qué no se importa como módulo normal: qpdf.js es una salida de Emscripten
// que se auto-registra en globalThis y busca su .wasm por fetch relativo. Meterla
// al grafo de Vite rompe ambas cosas. Se sirve como archivo estático y se carga
// en runtime con una etiqueta <script> (ver src/lib/qpdf.ts).
//
// Corre solo en postinstall. public/qpdf/ está en .gitignore: se regenera.

import { mkdir, copyFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const from = join(root, "node_modules", "@jspawn", "qpdf-wasm");
const to = join(root, "public", "qpdf");

if (!existsSync(from)) {
  console.error("[sync-qpdf] falta @jspawn/qpdf-wasm en node_modules — corre npm install primero");
  process.exit(1);
}

await mkdir(to, { recursive: true });
for (const f of ["qpdf.js", "qpdf.wasm"]) {
  await copyFile(join(from, f), join(to, f));
}
// qpdf.js espera que exista globalThis.exports antes de evaluarse.
await writeFile(join(to, "qpdf-shim.js"), "globalThis.exports = {};\n");

console.log("[sync-qpdf] public/qpdf/ listo");
