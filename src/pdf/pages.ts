import { PDFDocument, degrees } from "pdf-lib";
import type { LoadedFile, OperationResult, PageSlot } from "../state";
import { bytes as fmtBytes, plural } from "../lib/format";
import { openWithPdfjs, renderPage } from "../lib/pdfjs";
import { derivedName } from "./files";

/** Lee la estructura de páginas sin miniaturas (rápido, para pintar la grilla ya). */
export async function readSlots(file: LoadedFile): Promise<PageSlot[]> {
  const doc = await PDFDocument.load(file.bytes);
  return doc.getPages().map((page, i) => ({
    source: i,
    baseRotation: page.getRotation().angle,
    extraRotation: 0,
    removed: false,
    thumbnail: null,
  }));
}

/**
 * Va llenando las miniaturas una por una y avisa tras cada una, para que la
 * grilla se pueble progresivamente en vez de quedarse en blanco.
 */
export async function fillThumbnails(
  file: LoadedFile,
  slots: PageSlot[],
  onEach: () => void,
): Promise<void> {
  const doc = await openWithPdfjs(file.bytes);
  for (let n = 1; n <= doc.numPages; n++) {
    const slot = slots.find((s) => s.source === n - 1);
    if (!slot) continue;
    const canvas = await renderPage(doc, n, { maxWidth: 150, maxHeight: 200 });
    slot.thumbnail = canvas.toDataURL("image/jpeg", 0.7);
    onEach();
  }
}

export async function applyPageEdits(
  file: LoadedFile,
  slots: PageSlot[],
): Promise<OperationResult> {
  const keep = slots.filter((s) => !s.removed);
  if (keep.length === 0) {
    throw new Error("No queda ninguna página. Restaura alguna antes de exportar.");
  }

  const src = await PDFDocument.load(file.bytes);
  const out = await PDFDocument.create();
  const copied = await out.copyPages(
    src,
    keep.map((s) => s.source),
  );
  copied.forEach((page, i) => {
    const slot = keep[i];
    if (!slot) return;
    page.setRotation(degrees((slot.baseRotation + slot.extraRotation) % 360));
    out.addPage(page);
  });

  const result = await out.save();
  return {
    ok: true,
    title: "Páginas actualizadas",
    detail: `${plural(out.getPageCount(), "página", "páginas")} · ${fmtBytes(result.length)}`,
    outputs: [{ filename: derivedName(file.name, "editado"), bytes: result }],
  };
}
