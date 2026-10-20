import { defineConfig } from "vite";

// base "./" produce rutas relativas: el mismo build funciona en la raíz de un
// dominio (Cloudflare Pages) y en un subdirectorio (GitHub Pages de proyecto,
// usuario.github.io/PDF-Manager-Web/) sin recompilar.
export default defineConfig({
  base: "./",
  build: {
    target: "es2022",
    // pdf.js y pdf-lib son grandes por naturaleza; no queremos el aviso en cada build.
    chunkSizeWarningLimit: 1200,
  },
  server: { port: 5173 },
  preview: { port: 4173 },
});
