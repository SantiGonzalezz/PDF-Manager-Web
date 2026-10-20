import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { inspect } from "./files";
import type { LoadedFile } from "../state";

/**
 * Genera un documento de prueba con imágenes pesadas, para que la app arranque
 * usable y para que "Comprimir" tenga algo real que comprimir. Se dibuja en un
 * canvas local: no descarga nada.
 */
async function syntheticPhoto(seed: number): Promise<Uint8Array> {
  const canvas = document.createElement("canvas");
  canvas.width = 1400;
  canvas.height = 900;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("El navegador no dio un contexto 2D");

  const gradient = ctx.createLinearGradient(0, 0, 1400, 900);
  gradient.addColorStop(0, `hsl(${(seed * 47) % 360}, 55%, 42%)`);
  gradient.addColorStop(1, `hsl(${(seed * 47 + 90) % 360}, 60%, 62%)`);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 1400, 900);

  // Ruido determinista: el mismo seed da siempre el mismo "documento".
  let s = seed * 9301 + 49297;
  const rnd = () => (s = (s * 9301 + 49297) % 233280) / 233280;
  for (let i = 0; i < 2600; i++) {
    ctx.fillStyle = `hsla(${Math.floor(rnd() * 360)}, 65%, ${Math.floor(30 + rnd() * 55)}%, .55)`;
    ctx.beginPath();
    ctx.arc(rnd() * 1400, rnd() * 900, rnd() * 26, 0, Math.PI * 2);
    ctx.fill();
  }

  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/png"));
  if (!blob) throw new Error("No se pudo generar la imagen de ejemplo");
  return new Uint8Array(await blob.arrayBuffer());
}

export async function buildSampleDocument(): Promise<LoadedFile> {
  const doc = await PDFDocument.create();
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const tints: [number, number, number][] = [
    [0.11, 0.42, 0.35],
    [0.61, 0.31, 0.05],
    [0.2, 0.28, 0.55],
    [0.44, 0.18, 0.42],
    [0.13, 0.35, 0.45],
    [0.55, 0.35, 0.1],
  ];

  for (let i = 0; i < 6; i++) {
    const page = doc.addPage([595, 842]);
    const tint = tints[i] ?? [0.11, 0.42, 0.35];

    page.drawRectangle({ x: 0, y: 742, width: 595, height: 100, color: rgb(...tint) });
    page.drawText("Documento de ejemplo", {
      x: 44, y: 788, size: 22, font: bold, color: rgb(1, 1, 1),
    });
    page.drawText(`Pagina ${i + 1} de 6`, {
      x: 44, y: 762, size: 11, font: regular, color: rgb(1, 1, 1),
    });

    const image = await doc.embedPng(await syntheticPhoto(i + 1));
    page.drawImage(image, { x: 44, y: 420, width: 507, height: 290 });

    for (let r = 0; r < 11; r++) {
      page.drawRectangle({
        x: 44, y: 370 - r * 24, width: 507 - (r % 3) * 120, height: 8,
        color: rgb(0.86, 0.88, 0.87),
      });
    }

    page.drawText(String(i + 1), { x: 520, y: 44, size: 34, font: bold, color: rgb(...tint) });
    page.drawText("generado en tu navegador, sin red", {
      x: 44, y: 52, size: 9, font: regular, color: rgb(0.55, 0.58, 0.57),
    });
  }

  return inspect("ejemplo.pdf", await doc.save());
}
