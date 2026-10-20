// Entrega un archivo al usuario.
//
// En hosting normal (GitHub Pages, Cloudflare Pages) basta un <a download> con
// una URL de objeto. Dentro del visor de Artifacts de claude.ai eso está
// bloqueado y hay que pasar por la capability "downloads", así que se intenta
// primero esa y se cae al enlace si no existe.

type DownloadsCapability = {
  save(req: { filename: string; data: Blob }): Promise<{ status: string }>;
};
type ClaudeRuntime = { use(name: string): Promise<DownloadsCapability | null> };

function claudeRuntime(): ClaudeRuntime | null {
  const c = (globalThis as { claude?: ClaudeRuntime }).claude;
  return c && typeof c.use === "function" ? c : null;
}

export class SaveDeclined extends Error {
  constructor() {
    super("El usuario canceló la descarga");
    this.name = "SaveDeclined";
  }
}

export async function saveFile(filename: string, data: Uint8Array): Promise<void> {
  const blob = new Blob([data as BlobPart], { type: "application/pdf" });

  const runtime = claudeRuntime();
  if (runtime) {
    const downloads = await runtime.use("downloads");
    if (downloads) {
      try {
        await downloads.save({ filename, data: blob });
        return;
      } catch (e) {
        if ((e as { code?: string }).code === "declined") throw new SaveDeclined();
        throw e;
      }
    }
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Se revoca tarde para no cortar la descarga en Firefox.
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
