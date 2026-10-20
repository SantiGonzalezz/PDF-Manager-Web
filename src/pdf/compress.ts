import { PDFDocument } from "pdf-lib";
import type { LoadedFile, OperationResult } from "../state";
import { bytes as fmtBytes } from "../lib/format";
import { canvasToJpeg, openWithPdfjs, renderPage } from "../lib/pdfjs";
import { runQpdf } from "../lib/qpdf";
import { derivedName } from "./files";

/** Calidad JPEG por resolución. Más DPI tolera menos compresión antes de verse mal. */
const QUALITY: Record<number, number> = { 72: 0.5, 150: 0.62, 300: 0.78 };

/**
 * Comprime rasterizando: cada página se dibuja al DPI pedido y se guarda como
 * JPEG. Es lo que hacen las herramientas comerciales y gana muchísimo en
 * documentos con fotos o escaneos. En documentos de puro texto vectorial
 * *engorda* el archivo, y en ese caso se devuelve un resultado que lo dice en
 * vez de ofrecer una descarga peor que el original.
 */
export async function compress(
  file: LoadedFile,
  dpi: 72 | 150 | 300,
  onProgress: (message: string) => void,
): Promise<OperationResult> {
  if (file.locked) throw new Error("El archivo está cifrado. Quítale la contraseña primero.");

  const doc = await openWithPdfjs(file.bytes);
  const out = await PDFDocument.create();
  const quality = QUALITY[dpi] ?? 0.62;

  for (let n = 1; n <= doc.numPages; n++) {
    onProgress(`Rasterizando página ${n} de ${doc.numPages}…`);
    const canvas = await renderPage(doc, n, { scale: dpi / 72 });
    const jpeg = await canvasToJpeg(canvas, quality);
    const image = await out.embedJpg(jpeg);

    const natural = (await doc.getPage(n)).getViewport({ scale: 1 });
    const page = out.addPage([natural.width, natural.height]);
    page.drawImage(image, { x: 0, y: 0, width: natural.width, height: natural.height });

    // Cede el hilo para que la UI pueda repintar el progreso.
    await new Promise((r) => setTimeout(r, 0));
  }

  let result = await out.save();

  onProgress("Optimizando estructura con qpdf…");
  try {
    result = await runQpdf(
      [
        "--object-streams=generate",
        "--compress-streams=y",
        "--recompress-flate",
        "--compression-level=9",
        "/in.pdf",
        "/out.pdf",
      ],
      { "/in.pdf": result },
      "/out.pdf",
    );
  } catch {
    // Si qpdf falla, el PDF que produjo pdf-lib ya es válido: se entrega ese.
  }

  const saved = Math.round(100 - (result.length / file.size) * 100);
  const detail = `${fmtBytes(file.size)} → ${fmtBytes(result.length)} · ${doc.numPages} páginas a ${dpi} DPI`;

  if (saved <= 0) {
    return {
      ok: false,
      title: "El original ya es más liviano",
      detail: `${detail}. Este PDF es casi todo texto vectorial, así que rasterizarlo lo engorda. Quédate con el original.`,
    };
  }

  return {
    ok: true,
    title: `${saved}% más liviano`,
    detail,
    outputs: [{ filename: derivedName(file.name, "comprimido"), bytes: result }],
  };
}
