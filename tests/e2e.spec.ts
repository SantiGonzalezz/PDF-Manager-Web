import { test, expect, type Page } from "@playwright/test";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Pruebas de las seis herramientas contra la app compilada.
 *
 * No hay fixtures binarios en el repo: los PDF de entrada se generan con pdf-lib
 * en el momento. La descarga se intercepta reemplazando window.claude por un
 * doble que guarda nombre y contenido, lo que además permite volver a subir un
 * resultado como entrada de la siguiente herramienta.
 */

interface SavedFile {
  filename: string;
  base64: string;
}

const rail = (page: Page, name: string) => page.locator("#rail button", { hasText: name });
const result = (page: Page) => page.locator(".result");

const savedFiles = (page: Page): Promise<SavedFile[]> =>
  page.evaluate(() => (window as unknown as { __saved: SavedFile[] }).__saved);

/** El guardado es asíncrono: espera a que el doble registre el archivo n-ésimo. */
async function waitForSave(page: Page, count: number): Promise<SavedFile> {
  await expect.poll(async () => (await savedFiles(page)).length).toBe(count);
  const files = await savedFiles(page);
  return files.at(-1)!;
}

async function toDisk(name: string, data: Uint8Array | Buffer): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "pdf-manager-"));
  const path = join(dir, name);
  await writeFile(path, data);
  return path;
}

async function makePdfOnDisk(name: string, pages: number): Promise<string> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let i = 0; i < pages; i++) {
    const p = doc.addPage([595, 842]);
    p.drawText(`SEGUNDO DOC - pagina ${i + 1}`, { x: 50, y: 780, size: 20, font });
  }
  return toDisk(name, await doc.save());
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    (window as unknown as { __saved: unknown[] }).__saved = [];
    (window as unknown as { claude: unknown }).claude = {
      use: async (name: string) =>
        name === "downloads"
          ? {
              save: async ({ filename, data }: { filename: string; data: Blob }) => {
                const buf = new Uint8Array(await data.arrayBuffer());
                let binary = "";
                for (const byte of buf) binary += String.fromCharCode(byte);
                (window as unknown as { __saved: unknown[] }).__saved.push({
                  filename,
                  base64: btoa(binary),
                });
                return { status: "saved" };
              },
            }
          : null,
    };
  });
  await page.goto("/");
  // El documento de ejemplo se genera al arrancar.
  await expect(page.locator(".frow")).toHaveCount(1, { timeout: 60_000 });
});

test("une dos archivos y respeta el orden de la lista", async ({ page }) => {
  const second = await makePdfOnDisk("segundo.pdf", 4);

  await rail(page, "Unir").click();
  await page.setInputFiles("input[type=file]", second);
  await expect(page.locator(".frow")).toHaveCount(2);

  await page.getByRole("button", { name: "Unir 2 archivos" }).click();
  await expect(result(page)).toContainText("10 páginas");

  await page.locator(".frow").nth(1).getByRole("button", { name: /^Subir/ }).click();
  await expect(page.locator(".frow .nm").first()).toHaveText("segundo.pdf");
});

test("edita páginas: miniaturas, rotación, borrado y exportación", async ({ page }) => {
  await rail(page, "Editar páginas").click();
  await expect(page.locator("#page-grid .pg img")).toHaveCount(6, { timeout: 60_000 });

  await page.locator("#page-grid .pg").first().hover();
  await page.locator("#page-grid .pg").first().getByRole("button", { name: /^Rotar/ }).click();

  await page.locator("#page-grid .pg").nth(1).hover();
  await page.locator("#page-grid .pg").nth(1).getByRole("button", { name: /^Eliminar/ }).click();

  await page.getByRole("button", { name: "Exportar PDF" }).click();
  await expect(result(page)).toContainText("5 páginas");

  await page.getByRole("button", { name: "Guardar archivo" }).click();
  const saved = await waitForSave(page, 1);
  expect(saved.filename).toBe("ejemplo-editado.pdf");

  // El PDF exportado tiene que abrirse y traer las páginas que quedaron.
  const bytes = Buffer.from(saved.base64, "base64");
  expect((await PDFDocument.load(bytes)).getPageCount()).toBe(5);
});

test("extrae un rango y explica los rangos inválidos", async ({ page }) => {
  await rail(page, "Extraer páginas").click();

  await page.fill("#range-input", "2-4");
  await page.getByRole("button", { name: "Extraer", exact: true }).click();
  await expect(result(page)).toContainText("3 de 6 páginas");

  await page.fill("#range-input", "abc");
  await page.getByRole("button", { name: "Extraer", exact: true }).click();
  await expect(page.locator(".result.bad")).toContainText("No entiendo");
});

test("comprime un documento con imágenes", async ({ page }) => {
  await rail(page, "Comprimir").click();
  await page.getByRole("button", { name: "Comprimir", exact: true }).click();
  await expect(result(page)).toContainText("% más liviano", { timeout: 90_000 });
});

test("cifra, rechaza la clave errada y abre con la correcta", async ({ page }) => {
  await rail(page, "Proteger").click();
  await page.fill("#password-new", "clave123");
  await page.getByRole("button", { name: "Cifrar PDF" }).click();
  await expect(result(page)).toContainText("AES-256", { timeout: 60_000 });
  await page.getByRole("button", { name: "Guardar archivo" }).click();

  const encrypted = await waitForSave(page, 1);
  expect(encrypted.filename).toBe("ejemplo-protegido.pdf");
  const encryptedBytes = Buffer.from(encrypted.base64, "base64");

  // El cifrado tiene que ser real: pdf-lib no debe poder abrirlo sin la clave.
  await expect(PDFDocument.load(encryptedBytes)).rejects.toThrow(/encrypt/i);

  const path = await toDisk("protegido.pdf", encryptedBytes);
  await rail(page, "Quitar contraseña").click();
  // Quitar contraseña trabaja por lotes, así que la lista acumula: el ejemplo
  // sin cifrar sobra para esta prueba, que es la de un archivo solo.
  await page.locator(".frow").first().getByRole("button", { name: /^Quitar ejemplo/ }).click();
  await page.setInputFiles("input[type=file]", path);
  await expect(page.locator(".frow.locked")).toHaveCount(1);
  await expect(page.locator(".frow")).toHaveCount(1);

  await page.fill("#password-current", "clave-equivocada");
  await page.getByRole("button", { name: "Quitar contraseña", exact: true }).last().click();
  await expect(page.locator(".result.bad")).toContainText("No se pudo abrir con esa contraseña");

  await page.fill("#password-current", "clave123");
  await page.getByRole("button", { name: "Quitar contraseña", exact: true }).last().click();
  await expect(page.locator(".result:not(.bad)")).toContainText("6 páginas", { timeout: 60_000 });
});

/**
 * Lee un ZIP con entradas sin comprimir, que es lo único que produce la app.
 * Se hace a mano en vez de con una dependencia nueva: así la prueba verifica el
 * formato de verdad en vez de confiar en el mismo código que lo escribió.
 */
function readZip(buf: Buffer): { name: string; bytes: Buffer }[] {
  const end = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  expect(end, "el archivo no tiene el registro final de un ZIP").toBeGreaterThan(-1);

  const count = buf.readUInt16LE(end + 10);
  let p = buf.readUInt32LE(end + 16);
  const entries: { name: string; bytes: Buffer }[] = [];

  for (let i = 0; i < count; i++) {
    expect(buf.readUInt32LE(p)).toBe(0x02014b50);
    expect(buf.readUInt16LE(p + 10), "debe estar sin comprimir").toBe(0);
    const size = buf.readUInt32LE(p + 24);
    const nameLength = buf.readUInt16LE(p + 28);
    const extraLength = buf.readUInt16LE(p + 30);
    const commentLength = buf.readUInt16LE(p + 32);
    const offset = buf.readUInt32LE(p + 42);
    const name = buf.subarray(p + 46, p + 46 + nameLength).toString("utf8");

    // La cabecera local repite el nombre y puede traer otro campo extra.
    const start = offset + 30 + buf.readUInt16LE(offset + 26) + buf.readUInt16LE(offset + 28);
    entries.push({ name, bytes: buf.subarray(start, start + size) });
    p += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

test("cifra y descifra un lote entero con la misma contraseña", async ({ page }) => {
  const otro = await makePdfOnDisk("otro.pdf", 2);
  const tercero = await makePdfOnDisk("tercero.pdf", 3);

  // ---- cifrar los tres de una (el ejemplo ya viene cargado) ----
  await rail(page, "Proteger").click();
  await page.setInputFiles("input[type=file]", [otro, tercero]);
  await expect(page.locator(".frow")).toHaveCount(3);

  await page.fill("#password-new", "la-misma-clave");
  await page.getByRole("button", { name: "Cifrar 3 PDF" }).click();
  await expect(result(page)).toContainText("3 PDF cifrados con AES-256", { timeout: 60_000 });

  await page.getByRole("button", { name: /^Descargar 3 archivos/ }).click();
  const zip = await waitForSave(page, 1);
  expect(zip.filename).toBe("protegidos.zip");

  const cifrados = readZip(Buffer.from(zip.base64, "base64"));
  expect(cifrados.map((e) => e.name).sort()).toEqual([
    "ejemplo-protegido.pdf",
    "otro-protegido.pdf",
    "tercero-protegido.pdf",
  ]);
  // Cada uno tiene que estar cifrado de verdad, no solo empaquetado.
  for (const entry of cifrados) {
    await expect(PDFDocument.load(entry.bytes)).rejects.toThrow(/encrypt/i);
  }

  // Un cuarto archivo con OTRA clave, para ver qué hace el lote con lo que falla.
  const ajeno = await makePdfOnDisk("ajeno.pdf", 1);
  await page.reload();
  await expect(page.locator(".frow")).toHaveCount(1, { timeout: 60_000 });
  await rail(page, "Proteger").click();
  await page.locator(".frow").first().getByRole("button", { name: /^Quitar/ }).click();
  await page.setInputFiles("input[type=file]", ajeno);
  await page.fill("#password-new", "otra-clave-distinta");
  await page.getByRole("button", { name: "Cifrar PDF" }).click();
  await expect(result(page)).toContainText("AES-256", { timeout: 60_000 });
  await page.getByRole("button", { name: "Guardar archivo" }).click();
  const suelto = await waitForSave(page, 1);

  const enDisco = await Promise.all([
    ...cifrados.map((e) => toDisk(e.name, e.bytes)),
    toDisk(suelto.filename, Buffer.from(suelto.base64, "base64")),
  ]);

  // ---- quitarles la contraseña a los cuatro de una ----
  await page.reload();
  await expect(page.locator(".frow")).toHaveCount(1, { timeout: 60_000 });
  await rail(page, "Quitar contraseña").click();
  await page.locator(".frow").first().getByRole("button", { name: /^Quitar ejemplo/ }).click();
  await page.setInputFiles("input[type=file]", enDisco);
  await expect(page.locator(".frow.locked")).toHaveCount(4);

  await page.fill("#password-current", "la-misma-clave");
  await page.getByRole("button", { name: "Quitar contraseña a 4 archivos" }).click();
  await expect(result(page)).toContainText("3 de 4 archivos sin contraseña", {
    timeout: 90_000,
  });

  // El que no abrió se nombra y se explica, en vez de desaparecer del resultado.
  const fallido = page.locator(".rrow.bad");
  await expect(fallido).toHaveCount(1);
  await expect(fallido).toContainText("ajeno-protegido.pdf");
  await expect(fallido).toContainText("La clave no sirve aquí");

  await page.getByRole("button", { name: /^Descargar 3 archivos/ }).click();
  const abierto = await waitForSave(page, 1);
  expect(abierto.filename).toBe("sin-contrasena.zip");

  // Los tres que sí salieron tienen que abrirse ya sin clave, con sus páginas.
  const abiertos = readZip(Buffer.from(abierto.base64, "base64"));
  expect(abiertos).toHaveLength(3);
  const conteos: Record<string, number> = {};
  for (const entry of abiertos) {
    conteos[entry.name] = (await PDFDocument.load(entry.bytes)).getPageCount();
  }
  expect(conteos).toEqual({
    "ejemplo-protegido-abierto.pdf": 6,
    "otro-protegido-abierto.pdf": 2,
    "tercero-protegido-abierto.pdf": 3,
  });
});
