import { PDFDocument } from "pdf-lib";
import type { LoadedFile, OperationResult } from "../state";
import { bytes as fmtBytes, plural } from "../lib/format";

export async function merge(files: LoadedFile[]): Promise<OperationResult> {
  if (files.length < 2) throw new Error("Necesitas al menos dos archivos para unir.");
  const locked = files.find((f) => f.locked);
  if (locked) throw new Error(`«${locked.name}» está cifrado. Quítale la contraseña primero.`);

  const out = await PDFDocument.create();
  for (const f of files) {
    const src = await PDFDocument.load(f.bytes);
    const copied = await out.copyPages(src, src.getPageIndices());
    for (const page of copied) out.addPage(page);
  }
  const result = await out.save();

  return {
    ok: true,
    title: "PDF unido",
    detail: `${plural(out.getPageCount(), "página", "páginas")} · ${fmtBytes(result.length)}`,
    outputs: [{ filename: "unido.pdf", bytes: result }],
  };
}
