// pdf.js se usa solo para pintar páginas: miniaturas del editor y rasterizado
// al comprimir. Vite resuelve la URL del worker con ?url, así que el worker se
// sirve como archivo aparte y no entra al bundle principal.

import * as pdfjs from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

export type PdfjsDocument = Awaited<ReturnType<typeof pdfjs.getDocument>["promise"]>;

/**
 * Abre un documento con pdf.js. Recibe una copia de los bytes porque pdf.js
 * toma posesión del buffer y lo deja inutilizable para pdf-lib.
 */
export function openWithPdfjs(data: Uint8Array): Promise<PdfjsDocument> {
  return pdfjs.getDocument({ data: data.slice() }).promise;
}

/** Dibuja una página en un canvas al ancho/alto máximo dado y devuelve el canvas. */
export async function renderPage(
  doc: PdfjsDocument,
  pageNumber: number,
  fit: { maxWidth: number; maxHeight: number } | { scale: number },
): Promise<HTMLCanvasElement> {
  const page = await doc.getPage(pageNumber);
  const natural = page.getViewport({ scale: 1 });
  const scale =
    "scale" in fit
      ? fit.scale
      : Math.min(fit.maxWidth / natural.width, fit.maxHeight / natural.height);
  const viewport = page.getViewport({ scale });

  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(viewport.width));
  canvas.height = Math.max(1, Math.round(viewport.height));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("El navegador no dio un contexto 2D");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // intent "print" es lo que evita que el render dependa de requestAnimationFrame.
  // Con el intent por defecto pdf.js trocea el dibujo en callbacks de rAF, y el
  // navegador no dispara rAF en pestañas ocultas: si el usuario se cambia de
  // pestaña a mitad de una compresión, la operación se queda congelada hasta que
  // vuelve. Aquí siempre estamos rasterizando a un bitmap, nunca pintando en
  // pantalla, así que trocear no aporta nada.
  await page.render({ canvasContext: ctx, viewport, intent: "print" }).promise;
  return canvas;
}

export function canvasToJpeg(canvas: HTMLCanvasElement, quality: number): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) return reject(new Error("No se pudo codificar el JPEG"));
        blob.arrayBuffer().then((b) => resolve(new Uint8Array(b)), reject);
      },
      "image/jpeg",
      quality,
    );
  });
}
