import { PDFDocument } from "pdf-lib";
import type { LoadedFile, OperationResult, OutputFile, ResultItem } from "../state";
import { bytes as fmtBytes, plural } from "../lib/format";
import { runQpdf } from "../lib/qpdf";
import { derivedName } from "./files";

/**
 * Ambas operaciones trabajan sobre una lista, porque el caso normal es tener
 * muchos documentos con la misma contraseña. Un archivo solo es el caso de un
 * elemento, no un camino aparte.
 *
 * Un archivo que falle no cancela el lote: se anota y se sigue con el resto.
 * Lo contrario obligaría a adivinar cuáles ya se procesaron y a repetir todo.
 */

/** Traduce el resultado del lote a algo que la UI pueda pintar. */
function summarize(
  items: ResultItem[],
  outputs: OutputFile[],
  labels: { single: string; batch: (done: number, total: number) => string; zipName: string },
): OperationResult {
  // Con un solo archivo no hay lote del que informar: el mensaje es directo.
  const only = items.length === 1 ? items[0]! : null;
  if (only) {
    return only.ok
      ? { ok: true, title: labels.single, detail: only.detail, outputs }
      : { ok: false, title: "No se pudo", detail: only.detail };
  }

  const failed = items.filter((i) => !i.ok).length;

  if (outputs.length === 0) {
    return {
      ok: false,
      title: "No se pudo procesar ninguno",
      detail: `Los ${items.length} archivos fallaron. Abajo está el motivo de cada uno.`,
      items,
    };
  }

  return {
    ok: failed === 0,
    title: labels.batch(outputs.length, items.length),
    detail:
      failed === 0
        ? `Se descargan juntos en ${labels.zipName}.`
        : `${plural(failed, "archivo quedó", "archivos quedaron")} sin procesar. Los ${outputs.length} que sí salieron se descargan en ${labels.zipName}.`,
    outputs,
    items,
    zipName: labels.zipName,
  };
}

/**
 * Cifra con AES-256. Se usa la misma clave como contraseña de usuario y de
 * propietario: una app personal no gana nada con dos claves distintas y sí
 * pierde en confusión.
 */
export async function protect(
  files: LoadedFile[],
  password: string,
  onProgress: (message: string) => void,
): Promise<OperationResult> {
  if (!password) throw new Error("Escribe una contraseña.");
  if (files.length === 0) throw new Error("Carga al menos un archivo.");

  const items: ResultItem[] = [];
  const outputs: OutputFile[] = [];

  for (const [i, file] of files.entries()) {
    if (files.length > 1) onProgress(`Cifrando ${i + 1} de ${files.length}: ${file.name}`);

    if (file.locked) {
      items.push({
        name: file.name,
        ok: false,
        detail: "Ya está cifrado. Quítale la contraseña primero.",
      });
      continue;
    }

    try {
      const result = await runQpdf(
        ["--encrypt", password, password, "256", "--", "/in.pdf", "/out.pdf"],
        { "/in.pdf": file.bytes },
        "/out.pdf",
      );
      outputs.push({ filename: derivedName(file.name, "protegido"), bytes: result });
      items.push({
        name: file.name,
        ok: true,
        detail: `${fmtBytes(result.length)} · pide contraseña al abrir`,
      });
    } catch {
      items.push({ name: file.name, ok: false, detail: "qpdf no pudo cifrarlo." });
    }

    // Cede el hilo para que la UI repinte el progreso entre archivo y archivo.
    await new Promise((r) => setTimeout(r, 0));
  }

  return summarize(items, outputs, {
    single: "PDF cifrado con AES-256",
    batch: (done, total) =>
      done === total
        ? `${done} PDF cifrados con AES-256`
        : `${done} de ${total} PDF cifrados con AES-256`,
    zipName: "protegidos.zip",
  });
}

export async function unlock(
  files: LoadedFile[],
  password: string,
  onProgress: (message: string) => void,
): Promise<OperationResult> {
  if (files.length === 0) throw new Error("Carga al menos un archivo.");

  const items: ResultItem[] = [];
  const outputs: OutputFile[] = [];

  for (const [i, file] of files.entries()) {
    if (files.length > 1) onProgress(`Abriendo ${i + 1} de ${files.length}: ${file.name}`);

    // Descifrar algo que no está cifrado solo produce una copia. Mejor decirlo
    // que devolverle al usuario un duplicado disfrazado de resultado.
    if (!file.locked) {
      items.push({ name: file.name, ok: false, detail: "No está cifrado, no hay nada que quitar." });
      continue;
    }

    let result: Uint8Array;
    try {
      result = await runQpdf(
        [`--password=${password}`, "--decrypt", "/in.pdf", "/out.pdf"],
        { "/in.pdf": file.bytes },
        "/out.pdf",
      );
    } catch {
      // qpdf devuelve el mismo código para clave errada y archivo dañado, así que
      // no se puede afinar más el mensaje sin mentir.
      items.push({
        name: file.name,
        ok: false,
        detail:
          files.length === 1
            ? "No se pudo abrir con esa contraseña. Revisa la clave — qpdf no distingue entre clave errada y archivo dañado."
            : "La clave no sirve aquí, o el archivo está dañado.",
      });
      await new Promise((r) => setTimeout(r, 0));
      continue;
    }

    outputs.push({ filename: derivedName(file.name, "abierto"), bytes: result });
    items.push({ name: file.name, ok: true, detail: await describeOpened(result, files.length) });

    await new Promise((r) => setTimeout(r, 0));
  }

  return summarize(items, outputs, {
    single: "Contraseña eliminada",
    batch: (done, total) =>
      done === total
        ? `${done} archivos sin contraseña`
        : `${done} de ${total} archivos sin contraseña`,
    zipName: "sin-contrasena.zip",
  });
}

/**
 * Contar páginas obliga a parsear el documento otra vez. Con un archivo es
 * información útil y cuesta nada; multiplicado por un lote de treinta, es
 * duplicar el trabajo para una línea de texto que nadie va a leer entera.
 */
async function describeOpened(result: Uint8Array, batchSize: number): Promise<string> {
  if (batchSize > 1) return fmtBytes(result.length);
  const pageCount = (await PDFDocument.load(result)).getPageCount();
  return `${plural(pageCount, "página", "páginas")} · ${fmtBytes(result.length)}`;
}
