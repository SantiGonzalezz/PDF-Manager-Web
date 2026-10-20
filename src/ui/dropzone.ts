import { el } from "./dom";

export interface DropzoneOptions {
  multi: boolean;
  /** true cuando ya hay archivos: la zona se encoge para no robar espacio. */
  compact: boolean;
  onFiles: (files: FileList) => void;
}

export function dropzone({ multi, compact, onFiles }: DropzoneOptions): HTMLElement {
  const zone = el("div", compact ? "drop compact" : "drop");
  zone.tabIndex = 0;
  zone.setAttribute("role", "button");

  const label = compact
    ? multi
      ? "Añadir más PDF"
      : "Cambiar de archivo"
    : multi
      ? "Suelta tus PDF aquí"
      : "Suelta un PDF aquí";
  zone.appendChild(el("b", undefined, label));
  if (!compact) {
    zone.appendChild(
      el("small", undefined, "o haz clic para escoger — el archivo se queda en tu equipo"),
    );
  }

  const input = el("input");
  input.type = "file";
  input.accept = "application/pdf";
  input.multiple = multi;
  input.hidden = true;
  input.addEventListener("change", () => {
    if (input.files?.length) onFiles(input.files);
    input.value = "";
  });
  zone.appendChild(input);

  zone.addEventListener("click", () => input.click());
  zone.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      input.click();
    }
  });
  zone.addEventListener("dragover", (e) => {
    e.preventDefault();
    zone.classList.add("over");
  });
  zone.addEventListener("dragleave", () => zone.classList.remove("over"));
  zone.addEventListener("drop", (e) => {
    e.preventDefault();
    zone.classList.remove("over");
    if (e.dataTransfer?.files.length) onFiles(e.dataTransfer.files);
  });

  return zone;
}
