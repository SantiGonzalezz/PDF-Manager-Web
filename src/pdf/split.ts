import { PDFDocument } from "pdf-lib";
import type { LoadedFile, OperationResult } from "../state";
import { bytes as fmtBytes } from "../lib/format";
import { derivedName } from "./files";

/**
 * Interpreta rangos al estilo "1-3, 5, 8-" y devuelve índices 0-based.
 * Conserva el orden escrito y permite repetir páginas a propósito.
 */
export function parseRanges(input: string, pageCount: number): number[] {
  const out: number[] = [];
  for (const part of input.split(",")) {
    const token = part.trim();
    if (!token) continue;

    const span = token.match(/^(\d+)\s*-\s*(\d*)$/);
    if (span) {
      const from = Number(span[1]);
      const to = span[2] ? Number(span[2]) : pageCount;
      if (from < 1) throw new Error("Las páginas se numeran desde 1.");
      for (let i = from; i <= Math.min(to, pageCount); i++) out.push(i - 1);
      continue;
    }

    if (/^\d+$/.test(token)) {
      const n = Number(token);
      if (n < 1 || n > pageCount) {
        throw new Error(`La página ${n} no existe: el documento tiene ${pageCount}.`);
      }
      out.push(n - 1);
      continue;
    }

    throw new Error(`No entiendo «${token}». Usa formatos como 1-3, 5, 8-`);
  }

  if (out.length === 0) throw new Error("Ese rango no selecciona ninguna página.");
  return out;
}

export async function extract(file: LoadedFile, range: string): Promise<OperationResult> {
  if (file.locked) throw new Error("El archivo está cifrado. Quítale la contraseña primero.");

  const src = await PDFDocument.load(file.bytes);
  const indices = parseRanges(range, src.getPageCount());

  const out = await PDFDocument.create();
  const copied = await out.copyPages(src, indices);
  for (const page of copied) out.addPage(page);

  const result = await out.save();
  return {
    ok: true,
    title: "Páginas extraídas",
    detail: `${indices.length} de ${src.getPageCount()} páginas · ${fmtBytes(result.length)}`,
    outputs: [{ filename: derivedName(file.name, "extraido"), bytes: result }],
  };
}
