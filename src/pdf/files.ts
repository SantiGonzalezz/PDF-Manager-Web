import { PDFDocument } from "pdf-lib";
import { newFileId, type LoadedFile } from "../state";

/** Umbral a partir del cual el navegador puede quedarse sin memoria. */
export const SIZE_WARNING = 150 * 1024 * 1024;

export async function inspect(name: string, bytes: Uint8Array): Promise<LoadedFile> {
  const file: LoadedFile = {
    id: newFileId(),
    name,
    bytes,
    size: bytes.length,
    pages: null,
    locked: false,
  };
  try {
    file.pages = (await PDFDocument.load(bytes)).getPageCount();
  } catch (e) {
    // pdf-lib no abre documentos cifrados: eso ya es información útil.
    file.locked = /encrypt/i.test(String((e as Error).message));
    if (!file.locked) throw new Error(`No se pudo leer «${name}». ¿Seguro que es un PDF válido?`);
  }
  return file;
}

export async function readSelection(list: FileList | File[]): Promise<LoadedFile[]> {
  const out: LoadedFile[] = [];
  for (const f of Array.from(list)) {
    if (!/\.pdf$/i.test(f.name)) continue;
    out.push(await inspect(f.name, new Uint8Array(await f.arrayBuffer())));
  }
  return out;
}

/** "informe.pdf" + "-comprimido" -> "informe-comprimido.pdf" */
export function derivedName(original: string, suffix: string): string {
  return `${original.replace(/\.pdf$/i, "")}-${suffix}.pdf`;
}
