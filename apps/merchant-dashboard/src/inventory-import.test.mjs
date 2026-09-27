import assert from "node:assert/strict";
import test from "node:test";
import { inventoryFilenameKey, inventoryStemKey, prepareAiInventoryRows } from "./inventory-import.mjs";

const file = (name, type = "image/png", size = 1000) => ({ name, type, size });

test("file names compare by their last path segment, decoded and lower-cased; stems also drop accents and punctuation", () => {
  assert.equal(inventoryFilenameKey("fotos/Taza%20Azul.PNG?x=1"), "taza azul.png");
  assert.equal(inventoryStemKey("C:\\\\fotos\\\\Café_Molido-500g.jpg"), "cafe molido 500g");
});

test("photos are matched by exact name, by a unique stem, or automatically by SKU and name", () => {
  const photos = [file("taza.png"), file("MUG-1 frente.jpg", "image/jpeg"), file("sobrante.webp", "image/webp")];
  const { rows, warnings } = prepareAiInventoryRows([
    { name: "Taza", imageNames: ["TAZA.png"], amount: 1000 },
    { name: "Jarro", codigoProducto: "MUG-1", amount: 2000, sourceRow: 7 },
  ], photos);
  assert.deepEqual(rows.map((row) => [row.rowNumber, row.imageFiles.map((f) => f.name), row.errors]), [[2, ["taza.png"], []], [7, ["MUG-1 frente.jpg"], []]]);
  assert.deepEqual(rows[1].product, { name: "Jarro", codigoProducto: "MUG-1", description: null, tags: [], stock: null, variants: [], categoryName: undefined, color: null, amount: 2000, currency: "BOB" });
  assert.deepEqual(warnings, ["1 foto no pudo relacionarse con un producto. Puedes renombrarlas con el nombre o SKU del producto y volver a adaptar el archivo."]);
});

test("each row lists what is wrong with it, in Spanish", () => {
  const { rows } = prepareAiInventoryRows([
    { name: "A", codigoProducto: "SKU 1", imageNames: ["falta.png"], variants: [{ name: "S" }] },
    { name: "B", codigoProducto: "X", imageNames: ["big.gif"] },
    { name: "C", codigoProducto: "X" },
  ], [file("big.gif", "image/gif", 9_000_000)]);
  assert.deepEqual(rows.map((row) => row.errors), [
    ["El SKU solo admite letras, números, punto, guion y guion bajo", 'No se seleccionó la foto "falta.png"', "Un producto con tamaños necesita por lo menos 2 opciones"],
    ['Formato no admitido para "big.gif"'],
    ["El SKU X ya aparece en la fila 3"],
  ]);
});

test("refuses an empty or oversized extraction", () => {
  assert.throws(() => prepareAiInventoryRows([], []), /La IA no encontró productos en el archivo\./);
  assert.throws(() => prepareAiInventoryRows(Array.from({ length: 101 }, () => ({ name: "x" })), []), /más de 100 productos/);
});
