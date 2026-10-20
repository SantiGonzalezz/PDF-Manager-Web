export type ToolId = "merge" | "pages" | "split" | "compress" | "protect" | "unlock";

export interface LoadedFile {
  id: number;
  name: string;
  bytes: Uint8Array;
  size: number;
  /** null cuando el archivo está cifrado y no se pudo inspeccionar. */
  pages: number | null;
  locked: boolean;
}

/** Una página dentro del editor, ya desacoplada del documento original. */
export interface PageSlot {
  /** Índice en el documento fuente (0-based). */
  source: number;
  /** Rotación que ya traía la página, en grados. */
  baseRotation: number;
  /** Rotación extra aplicada por el usuario, en grados. */
  extraRotation: number;
  removed: boolean;
  thumbnail: string | null;
}

export interface OutputFile {
  filename: string;
  bytes: Uint8Array;
}

/** Cómo le fue a un archivo dentro de una operación por lotes. */
export interface ResultItem {
  name: string;
  ok: boolean;
  detail: string;
}

export interface OperationResult {
  ok: boolean;
  title: string;
  detail: string;
  /** Vacío o ausente cuando no hay nada que descargar. */
  outputs?: OutputFile[];
  /**
   * Detalle archivo por archivo. Solo se llena cuando la operación corrió sobre
   * varios: con uno solo, el título y el detalle ya lo cuentan todo.
   */
  items?: ResultItem[];
  /** Nombre del ZIP cuando hay más de una salida. */
  zipName?: string;
}

export interface AppState {
  tool: ToolId;
  files: LoadedFile[];
  pages: PageSlot[] | null;
  /** Texto del indicador de trabajo en curso, o null. */
  busy: string | null;
  result: OperationResult | null;
  compressionDpi: 72 | 150 | 300;
  range: string;
  passwordNew: string;
  passwordCurrent: string;
}

export const state: AppState = {
  tool: "merge",
  files: [],
  pages: null,
  busy: null,
  result: null,
  compressionDpi: 150,
  range: "",
  passwordNew: "",
  passwordCurrent: "",
};

let nextId = 0;
export const newFileId = (): number => ++nextId;

/** Descarta lo derivado del conjunto de archivos. Llamar tras cambiarlo. */
export function invalidateDerived(): void {
  state.pages = null;
  state.result = null;
}
