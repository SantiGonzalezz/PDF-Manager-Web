import {
  invalidateDerived,
  state,
  type LoadedFile,
  type OperationResult,
  type ResultItem,
} from "../state";
import { TOOLS, toolById } from "../tools";
import { SaveDeclined, saveFile } from "../lib/save";
import { makeZip } from "../lib/zip";
import { readSelection, SIZE_WARNING } from "../pdf/files";
import { merge } from "../pdf/merge";
import { applyPageEdits, fillThumbnails, readSlots } from "../pdf/pages";
import { extract } from "../pdf/split";
import { compress } from "../pdf/compress";
import { protect, unlock } from "../pdf/crypto";
import { buildSampleDocument } from "../pdf/sample";
import { button, clear, el, require$ } from "./dom";
import { dropzone } from "./dropzone";
import { fileList } from "./filelist";
import { renderPageGrid } from "./pagegrid";

const rail = require$<HTMLElement>("#rail");
const panel = require$<HTMLElement>("#panel");

let loadingSlots = false;

/* ------------------------------------------------------------------ acciones */

function fail(title: string, detail: string): void {
  state.result = { ok: false, title, detail };
  render();
}

async function run(work: () => Promise<OperationResult>): Promise<void> {
  state.result = null;
  state.busy = "Procesando…";
  render();
  try {
    state.result = await work();
  } catch (e) {
    state.result = { ok: false, title: "No se pudo", detail: (e as Error).message ?? String(e) };
  } finally {
    state.busy = null;
    render();
  }
}

/** Las operaciones largas van avisando por dónde van. */
function reportProgress(message: string): void {
  state.busy = message;
  render();
}

function deliver(filename: string, data: Uint8Array): void {
  void saveFile(filename, data).catch((e) => {
    if (e instanceof SaveDeclined) return;
    fail("No se guardó", (e as Error).message);
  });
}

async function addFiles(list: FileList): Promise<void> {
  try {
    const loaded = await readSelection(list);
    state.files.push(...loaded);
    // Las herramientas de un solo archivo reemplazan lo que hubiera cargado.
    if (!toolById(state.tool).multi && state.files.length > 1) {
      state.files = state.files.slice(-1);
    }
    invalidateDerived();
    const heavy = loaded.find((f) => f.size > SIZE_WARNING);
    if (heavy) {
      state.result = {
        ok: false,
        title: "Archivo grande",
        detail: `«${heavy.name}» pesa bastante. El navegador procesa todo en memoria, así que con archivos de este tamaño la pestaña puede quedarse sin RAM.`,
      };
    }
    render();
  } catch (e) {
    fail("No se pudo abrir", (e as Error).message);
  }
}

function removeFile(id: number): void {
  state.files = state.files.filter((f) => f.id !== id);
  invalidateDerived();
  render();
}

function moveFile(id: number, delta: -1 | 1): void {
  const from = state.files.findIndex((f) => f.id === id);
  const to = from + delta;
  if (from < 0 || to < 0 || to >= state.files.length) return;
  const next = [...state.files];
  const [moved] = next.splice(from, 1);
  if (moved) next.splice(to, 0, moved);
  state.files = next;
  render();
}

export async function loadSample(): Promise<void> {
  state.busy = "Generando documento de ejemplo…";
  render();
  try {
    state.files.push(await buildSampleDocument());
    invalidateDerived();
  } catch (e) {
    state.result = { ok: false, title: "No se pudo", detail: (e as Error).message };
  } finally {
    state.busy = null;
    render();
  }
}

function ensureSlots(file: LoadedFile): void {
  if (state.pages || loadingSlots) return;
  loadingSlots = true;
  void (async () => {
    try {
      const slots = await readSlots(file);
      state.pages = slots;
      render();
      // Las miniaturas llegan después: la grilla ya es usable sin ellas.
      await fillThumbnails(file, slots, () => {
        if (state.pages === slots) renderCurrentGrid();
      });
    } catch {
      // Sin pdf.js el editor sigue sirviendo, solo que sin miniaturas.
    } finally {
      loadingSlots = false;
    }
  })();
}

function renderCurrentGrid(): void {
  const host = document.querySelector<HTMLElement>("#page-grid");
  if (host && state.pages) renderPageGrid(host, state.pages, () => render());
}

/* -------------------------------------------------------------------- piezas */

function renderRail(): void {
  clear(rail);
  for (const tool of TOOLS) {
    const b = button("", "", () => {
      state.tool = tool.id;
      state.result = null;
      state.pages = null;
      render();
    });
    b.setAttribute("aria-current", state.tool === tool.id ? "true" : "false");
    b.append(el("span", "k", tool.key), el("span", undefined, tool.name));
    rail.appendChild(b);
  }
  rail.appendChild(
    el(
      "div",
      "railnote",
      "Cada herramienta carga su motor solo cuando la abres, para que el arranque sea liviano.",
    ),
  );
}

function labelledField(labelText: string, forId?: string): HTMLElement {
  const field = el("div", "field");
  const label = el("label", undefined, labelText);
  if (forId) label.htmlFor = forId;
  field.appendChild(label);
  return field;
}

function actionButton(label: string, disabled: boolean, work: () => Promise<OperationResult>) {
  const field = el("div", "field");
  const b = button("go", label, () => void run(work));
  b.disabled = disabled || state.busy != null;
  field.appendChild(b);
  return field;
}

function textInput(id: string, value: string, onInput: (v: string) => void): HTMLInputElement {
  const input = el("input");
  input.type = "text";
  input.id = id;
  input.value = value;
  input.addEventListener("input", () => onInput(input.value));
  return input;
}

function passwordInput(id: string, value: string, onInput: (v: string) => void): HTMLInputElement {
  const input = textInput(id, value, onInput);
  input.type = "password";
  return input;
}

/* ------------------------------------------------------------ panel por tool */

function renderControls(file: LoadedFile): HTMLElement {
  const box = el("div", "ctrl");

  switch (state.tool) {
    case "merge": {
      box.appendChild(
        el(
          "span",
          "hint",
          "Se unirán en el orden de la lista. Usa las flechas para reordenar.",
        ),
      );
      box.appendChild(
        actionButton(`Unir ${state.files.length} archivos`, false, () => merge(state.files)),
      );
      break;
    }

    case "pages": {
      if (file.locked) {
        box.appendChild(
          el("span", "hint", "Este archivo está cifrado. Quítale la contraseña primero."),
        );
        break;
      }
      ensureSlots(file);
      if (!state.pages) {
        box.appendChild(el("span", "hint", "Leyendo páginas…"));
        break;
      }
      const grid = el("div", "pages");
      grid.id = "page-grid";
      box.appendChild(grid);

      const kept = state.pages.filter((s) => !s.removed).length;
      box.appendChild(
        el(
          "span",
          "hint",
          `Arrastra para reordenar · ⟳ rota · ✕ elimina. Quedan ${kept} de ${state.pages.length} páginas.`,
        ),
      );
      box.appendChild(
        actionButton("Exportar PDF", kept === 0, () => applyPageEdits(file, state.pages ?? [])),
      );
      break;
    }

    case "split": {
      if (!state.range) state.range = `1-${file.pages ?? 1}`;
      const field = labelledField("Rango de páginas", "range-input");
      field.appendChild(
        textInput("range-input", state.range, (v) => {
          state.range = v;
        }),
      );
      field.appendChild(
        el(
          "span",
          "hint",
          `El documento tiene ${file.pages ?? "?"} páginas. Ejemplos: 1-3 · 2,5,9 · 4- (de la 4 al final).`,
        ),
      );
      box.appendChild(field);
      box.appendChild(actionButton("Extraer", file.locked, () => extract(file, state.range)));
      break;
    }

    case "compress": {
      const field = labelledField("Resolución de salida");
      const segs = el("div", "segs");
      const levels: [72 | 150 | 300, string, string][] = [
        [72, "Fuerte", "72 DPI · pantalla"],
        [150, "Equilibrado", "150 DPI · lectura"],
        [300, "Suave", "300 DPI · impresión"],
      ];
      for (const [dpi, name, note] of levels) {
        const b = button("", "", () => {
          state.compressionDpi = dpi;
          render();
        });
        b.setAttribute("aria-pressed", state.compressionDpi === dpi ? "true" : "false");
        b.append(document.createTextNode(name), el("small", undefined, note));
        segs.appendChild(b);
      }
      field.appendChild(segs);
      field.appendChild(
        el(
          "span",
          "hint",
          "Cada página se rasteriza y se guarda como JPEG. Pesa mucho menos, pero el texto deja de ser seleccionable.",
        ),
      );
      box.appendChild(field);
      box.appendChild(
        actionButton("Comprimir", file.locked, () =>
          compress(file, state.compressionDpi, reportProgress),
        ),
      );
      break;
    }

    case "protect": {
      const field = labelledField("Contraseña de apertura", "password-new");
      field.appendChild(
        passwordInput("password-new", state.passwordNew, (v) => {
          state.passwordNew = v;
        }),
      );
      field.appendChild(
        el(
          "span",
          "hint",
          state.files.length > 1
            ? `La misma contraseña para los ${state.files.length}. Cifrado AES-256 real: si la olvidas, no hay forma de recuperar los documentos.`
            : "Cifrado AES-256 real. Si la olvidas, no hay forma de recuperar el documento.",
        ),
      );
      box.appendChild(field);
      box.appendChild(
        actionButton(
          state.files.length > 1 ? `Cifrar ${state.files.length} PDF` : "Cifrar PDF",
          false,
          () => protect(state.files, state.passwordNew, reportProgress),
        ),
      );
      break;
    }

    case "unlock": {
      const field = labelledField("Contraseña actual", "password-current");
      field.appendChild(
        passwordInput("password-current", state.passwordCurrent, (v) => {
          state.passwordCurrent = v;
        }),
      );
      field.appendChild(
        el(
          "span",
          "hint",
          state.files.length > 1
            ? `Se prueba la misma clave en los ${state.files.length} archivos. Necesitas conocerla: esto la quita, no la adivina.`
            : "Necesitas conocer la clave: esto la quita, no la adivina.",
        ),
      );
      box.appendChild(field);
      box.appendChild(
        actionButton(
          state.files.length > 1
            ? `Quitar contraseña a ${state.files.length} archivos`
            : "Quitar contraseña",
          false,
          () => unlock(state.files, state.passwordCurrent, reportProgress),
        ),
      );
      break;
    }
  }

  return box;
}

/** Lista de qué pasó con cada archivo. Solo aparece en operaciones por lotes. */
function renderItems(items: ResultItem[]): HTMLElement {
  const rows = el("div", "rows");
  for (const item of items) {
    const row = el("div", item.ok ? "rrow" : "rrow bad");
    row.append(
      el("span", "mark", item.ok ? "✓" : "✕"),
      el("span", "nm", item.name),
      el("span", "why", item.detail),
    );
    rows.appendChild(row);
  }
  return rows;
}

function renderResult(result: OperationResult): HTMLElement {
  const box = el("div", result.ok ? "result" : "result bad");
  const text = el("div", "txt");
  text.append(el("b", undefined, result.title), el("span", undefined, result.detail));
  box.appendChild(text);

  const outputs = result.outputs ?? [];
  const only = outputs.length === 1 ? outputs[0] : null;

  if (only) {
    box.appendChild(button("go", "Guardar archivo", () => deliver(only.filename, only.bytes)));
  } else if (outputs.length > 1) {
    // Varios archivos van en un ZIP: así el navegador hace una sola descarga en
    // vez de una por documento, que dispara la alerta de descargas múltiples.
    const zipName = result.zipName ?? "resultado.zip";
    box.appendChild(
      button("go", `Descargar ${outputs.length} archivos (.zip)`, () => {
        try {
          deliver(zipName, makeZip(outputs.map((o) => ({ name: o.filename, bytes: o.bytes }))));
        } catch (e) {
          fail("No se pudo empaquetar", (e as Error).message);
        }
      }),
    );
  }

  if (result.items && result.items.length > 1) box.appendChild(renderItems(result.items));
  return box;
}

/* --------------------------------------------------------------------- render */

export function render(): void {
  renderRail();
  const tool = toolById(state.tool);
  clear(panel);

  const head = el("div", "phead");
  head.append(el("h2", undefined, tool.name), el("p", undefined, tool.hint));
  panel.appendChild(head);

  panel.appendChild(
    dropzone({
      multi: tool.multi,
      compact: state.files.length > 0,
      onFiles: (files) => void addFiles(files),
    }),
  );

  if (state.files.length > 0) {
    panel.appendChild(
      fileList({
        files: tool.multi ? state.files : state.files.slice(0, 1),
        reorderable: tool.ordered,
        onMove: moveFile,
        onRemove: removeFile,
      }),
    );
  } else {
    const row = el("div", "empty");
    row.appendChild(
      button("ghost", "Probar con un documento de ejemplo", () => void loadSample()),
    );
    panel.appendChild(row);
  }

  const file = state.files[0];
  if (file && state.files.length >= tool.minFiles) {
    panel.appendChild(renderControls(file));
  } else if (file) {
    panel.appendChild(el("div", "busy", "Agrega al menos un archivo más para unir."));
  }

  if (state.busy) {
    const box = el("div", "busy");
    box.append(el("div", "spin"), el("span", undefined, state.busy));
    panel.appendChild(box);
  }

  if (state.result) panel.appendChild(renderResult(state.result));

  if (state.tool === "pages" && state.pages) renderCurrentGrid();
}
