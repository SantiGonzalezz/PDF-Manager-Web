import type { PageSlot } from "../state";
import { button, clear, el } from "./dom";

let dragFrom: number | null = null;

/**
 * Pinta la grilla de páginas dentro de `host`. Se llama muchas veces (cada
 * miniatura que llega, cada rotación), así que reconstruye en sitio y deja el
 * reordenamiento en el array que recibe.
 */
export function renderPageGrid(
  host: HTMLElement,
  slots: PageSlot[],
  onChange: () => void,
): void {
  clear(host);

  slots.forEach((slot, position) => {
    const cell = el("div", slot.removed ? "pg gone" : "pg");
    cell.draggable = true;

    if (slot.thumbnail) {
      const img = new Image();
      img.src = slot.thumbnail;
      img.alt = `Página ${slot.source + 1}`;
      img.style.transform = `rotate(${slot.extraRotation}deg)`;
      cell.appendChild(img);
    } else {
      cell.appendChild(el("div", "ph", `pág ${slot.source + 1}`));
    }

    cell.appendChild(el("div", "no", String(position + 1)));

    const actions = el("div", "acts");
    const rotate = button("", "⟳", () => {
      slot.extraRotation = (slot.extraRotation + 90) % 360;
      onChange();
    });
    rotate.title = "Rotar 90°";
    rotate.setAttribute("aria-label", `Rotar página ${position + 1}`);

    const toggle = button("", slot.removed ? "↺" : "✕", () => {
      slot.removed = !slot.removed;
      onChange();
    });
    toggle.title = slot.removed ? "Restaurar" : "Eliminar";
    toggle.setAttribute(
      "aria-label",
      `${slot.removed ? "Restaurar" : "Eliminar"} página ${position + 1}`,
    );

    actions.append(rotate, toggle);
    cell.appendChild(actions);

    cell.addEventListener("dragstart", () => {
      dragFrom = position;
      cell.classList.add("dragging");
    });
    cell.addEventListener("dragend", () => {
      dragFrom = null;
      cell.classList.remove("dragging");
    });
    cell.addEventListener("dragover", (e) => e.preventDefault());
    cell.addEventListener("drop", (e) => {
      e.preventDefault();
      if (dragFrom == null || dragFrom === position) return;
      const [moved] = slots.splice(dragFrom, 1);
      if (moved) slots.splice(position, 0, moved);
      onChange();
    });

    host.appendChild(cell);
  });
}
