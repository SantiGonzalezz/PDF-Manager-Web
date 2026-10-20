import type { ToolId } from "./state";

export interface ToolDef {
  id: ToolId;
  /** Número de orden, visible en el menú. */
  key: string;
  name: string;
  hint: string;
  /** Cuántos archivos necesita para poder ejecutarse. */
  minFiles: number;
  /** true si acepta varios archivos a la vez. */
  multi: boolean;
  /** true si el orden de la lista cambia el resultado. Solo pasa al unir. */
  ordered: boolean;
}

export const TOOLS: ToolDef[] = [
  {
    id: "merge",
    key: "01",
    name: "Unir",
    hint: "Une varios PDF en uno solo, en el orden que quieras.",
    minFiles: 2,
    multi: true,
    ordered: true,
  },
  {
    id: "pages",
    key: "02",
    name: "Editar páginas",
    hint: "Rota, elimina y reordena páginas arrastrando las miniaturas.",
    minFiles: 1,
    multi: false,
    ordered: false,
  },
  {
    id: "split",
    key: "03",
    name: "Extraer páginas",
    hint: "Saca un rango de páginas a un archivo nuevo.",
    minFiles: 1,
    multi: false,
    ordered: false,
  },
  {
    id: "compress",
    key: "04",
    name: "Comprimir",
    hint: "Reescala y reencodea las imágenes del documento.",
    minFiles: 1,
    multi: false,
    ordered: false,
  },
  {
    id: "protect",
    key: "05",
    name: "Proteger",
    hint: "Cifra uno o varios PDF con AES-256 y una contraseña de apertura.",
    minFiles: 1,
    multi: true,
    ordered: false,
  },
  {
    id: "unlock",
    key: "06",
    name: "Quitar contraseña",
    hint: "Elimina el cifrado de uno o varios PDF que comparten la misma clave.",
    minFiles: 1,
    multi: true,
    ordered: false,
  },
];

export function toolById(id: ToolId): ToolDef {
  const t = TOOLS.find((x) => x.id === id);
  if (!t) throw new Error(`Herramienta desconocida: ${id}`);
  return t;
}
