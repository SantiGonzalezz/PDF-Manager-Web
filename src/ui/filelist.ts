import { bytes as fmtBytes } from "../lib/format";
import type { LoadedFile } from "../state";
import { button, el } from "./dom";

export interface FileListOptions {
  files: LoadedFile[];
  /** Muestra las flechas de orden (solo tiene sentido al unir). */
  reorderable: boolean;
  onMove: (id: number, delta: -1 | 1) => void;
  onRemove: (id: number) => void;
}

function describe(file: LoadedFile): string {
  if (file.locked) return "cifrado";
  if (file.pages == null) return fmtBytes(file.size);
  return `${file.pages} pág · ${fmtBytes(file.size)}`;
}

export function fileList(opts: FileListOptions): HTMLElement {
  const list = el("div", "files");

  opts.files.forEach((file) => {
    const row = el("div", file.locked ? "frow locked" : "frow");
    row.appendChild(el("span", "nm", file.name));
    row.appendChild(el("span", "st", describe(file)));

    const actions = el("div", "hd");
    if (opts.reorderable && opts.files.length > 1) {
      const up = button("icb", "↑", () => opts.onMove(file.id, -1));
      up.title = "Subir";
      up.setAttribute("aria-label", `Subir ${file.name}`);
      const down = button("icb", "↓", () => opts.onMove(file.id, 1));
      down.title = "Bajar";
      down.setAttribute("aria-label", `Bajar ${file.name}`);
      actions.append(up, down);
    }
    const remove = button("icb", "✕", () => opts.onRemove(file.id));
    remove.title = "Quitar";
    remove.setAttribute("aria-label", `Quitar ${file.name}`);
    actions.appendChild(remove);

    row.appendChild(actions);
    list.appendChild(row);
  });

  return list;
}
