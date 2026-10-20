// Puente al CLI de qpdf compilado a WebAssembly.
//
// qpdf.js es una salida de Emscripten: se carga con <script>, se registra en
// globalThis.exports.Module y busca su .wasm con fetch relativo. Los archivos
// viven en public/qpdf/ (los copia scripts/sync-qpdf.mjs en postinstall).
//
// Cada invocación usa una instancia limpia: callMain termina el runtime, así que
// reusar la instancia entre operaciones da resultados impredecibles. Instanciar
// cuesta poco porque el navegador ya tiene el .wasm compilado en caché.

type EmscriptenFS = {
  writeFile(path: string, data: Uint8Array): void;
  readFile(path: string): Uint8Array;
};
type QpdfModule = { FS: EmscriptenFS; callMain(args: string[]): number };
type QpdfFactory = (opts: Record<string, unknown>) => Promise<QpdfModule>;

const BASE = import.meta.env.BASE_URL;
let factory: Promise<QpdfFactory> | null = null;

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = src;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`No se pudo cargar ${src}`));
    document.head.appendChild(s);
  });
}

function getFactory(): Promise<QpdfFactory> {
  factory ??= (async () => {
    await loadScript(`${BASE}qpdf/qpdf-shim.js`);
    await loadScript(`${BASE}qpdf/qpdf.js`);
    const f = (globalThis as { exports?: { Module?: QpdfFactory } }).exports?.Module;
    if (!f) throw new Error("El motor qpdf no expuso su fábrica");
    return f;
  })();
  return factory;
}

export class QpdfError extends Error {
  constructor(
    message: string,
    readonly code: number,
    readonly stderr: string,
  ) {
    super(message);
    this.name = "QpdfError";
  }
}

/**
 * Corre qpdf una vez sobre un sistema de archivos en memoria.
 *
 * @param args      argumentos del CLI, con rutas absolutas tipo "/in.pdf"
 * @param inputs    archivos a escribir antes de correr, por ruta
 * @param outPath   archivo a leer después de correr
 */
export async function runQpdf(
  args: string[],
  inputs: Record<string, Uint8Array>,
  outPath: string,
): Promise<Uint8Array> {
  const create = await getFactory();
  const stderr: string[] = [];
  const mod = await create({
    noInitialRun: true,
    locateFile: (f: string) => `${BASE}qpdf/${f}`,
    print: () => {},
    printErr: (line: string) => stderr.push(line),
  });

  for (const [path, data] of Object.entries(inputs)) mod.FS.writeFile(path, data);

  let code: number;
  try {
    code = mod.callMain(args);
  } catch (e) {
    throw new QpdfError(stderr.join(" ") || String(e), -1, stderr.join("\n"));
  }
  // qpdf usa 3 para advertencias (el archivo sí se escribió) y 2 para errores.
  if (code !== 0 && code !== 3) {
    throw new QpdfError(stderr.join(" ") || `qpdf terminó con código ${code}`, code, stderr.join("\n"));
  }
  return mod.FS.readFile(outPath);
}
