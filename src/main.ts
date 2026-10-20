import "./styles.css";
import { loadSample, render } from "./ui/render";

render();

// La app arranca con un documento cargado: así se ve qué hace sin tener que
// buscar un archivo primero, y "Comprimir" tiene algo real que comprimir.
void loadSample();
