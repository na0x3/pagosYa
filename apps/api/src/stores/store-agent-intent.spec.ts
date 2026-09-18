import { requestsStoreRedesign } from "./store-agent-intent";

describe("full website redesign intent", () => {
  it.each([
    "haz el website de nuevo, quiero un cambio profundo coloca tabs unicas con animaciones textos con sentido, fotos",
    "Rediseña toda la tienda con fotos grandes y pestañas para cada colección",
    "Rehaz mi sitio web",
    "Haz la tienda desde cero",
    "Crea una nueva tienda con tabs y animaciones",
    "Quiero un cambio profundo en mi website",
    "Rebuild the entire website with animated tabs",
    "Create a new website with photos",
    "Build the whole website with new text",
  ])("routes an explicit full-site request to composition: %s", (instruction) => {
    expect(requestsStoreRedesign(instruction)).toBe(true);
  });

  it.each([
    "Rediseña el encabezado de la tienda",
    "Rehaz las pestañas del website",
    "Haz el título del website de nuevo",
    "Crea una nueva pestaña para mi tienda",
    "Cambia el texto de la portada",
    "Haz esta foto más grande",
    "Sin rediseñar el website, cambia el color del botón",
    "No quiero rediseñar la tienda, solo el texto",
    "No hagas la tienda de nuevo, solo arregla las pestañas",
    "Don't rebuild the website, just change the photo",
    'Cambia el título a "Rehaz mi sitio web"',
    "Pon en el botón «Haz el website de nuevo»",
  ])("preserves the scope of a local or negated edit: %s", (instruction) => {
    expect(requestsStoreRedesign(instruction)).toBe(false);
  });
});
