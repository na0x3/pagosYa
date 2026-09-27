import assert from "node:assert/strict";
import test from "node:test";
import { debtAmountInCents, debtDocumentDigits, parseDebtCollectionRows, parseDebtCsv } from "./debt-csv.mjs";

test("amounts in bolivianos become integer centavos, in either decimal style", () => {
  assert.equal(debtAmountInCents("Bs. 1.234,50"), 123450);
  assert.equal(debtAmountInCents("45,5"), 4550);
  assert.equal(debtAmountInCents(" 12.30 "), 1230);
  assert.throws(() => debtAmountInCents("0"), /Escribe un monto válido mayor a cero\./);
  assert.throws(() => debtAmountInCents("abc", 4), /Monto inválido en la línea 4\./);
});

test("a document keeps only its digits", () => {
  assert.equal(debtDocumentDigits(" 123-456 LP "), "123456");
  assert.equal(debtDocumentDigits(null), "");
});

test("pasted rows are carnet;nombre;monto with optional description, reference, email and phone", () => {
  assert.deepEqual(parseDebtCollectionRows("123 LP;Ana;50\n\n456;Luis;10,5;Cuota;R1;l@x.bo;700"), [
    { customerDocument: "123", customerName: "Ana", amount: 5000 },
    { customerDocument: "456", customerName: "Luis", amount: 1050, description: "Cuota", reference: "R1", customerEmail: "l@x.bo", customerPhone: "700" },
  ]);
  assert.throws(() => parseDebtCollectionRows("  \n "), /Agrega al menos una deuda\./);
  assert.throws(() => parseDebtCollectionRows("123;;50"), /Completa carnet, nombre y monto en la línea 1\./);
});

test("a CSV is read by its headers in any order, accents and case ignored, quoted cells kept whole", () => {
  const csv = '\uFEFFMonto,Nombre del cliente,Teléfono,CI\n"1.200,50","Pérez, Ana",700,123\n10,Luis,,456\n,Sin monto,,789';
  assert.deepEqual(parseDebtCsv(csv.replace("Nombre del cliente", "Cliente")), [
    { customerDocument: "123", customerName: "Pérez, Ana", amount: 120050, customerPhone: "700" },
    { customerDocument: "456", customerName: "Luis", amount: 1000 },
  ]);
});

test("a CSV without headers is carnet;nombre;monto;email;teléfono, and bad rows are skipped", () => {
  assert.deepEqual(parseDebtCsv("123;Ana;50;a@x.bo;700\nx;;\n456;Luis;cero"), [
    { customerDocument: "123", customerName: "Ana", amount: 5000, customerEmail: "a@x.bo", customerPhone: "700" },
  ]);
  assert.throws(() => parseDebtCsv(""), /El CSV está vacío\./);
  assert.throws(() => parseDebtCsv('123;"Ana;50'), /El CSV tiene una comilla sin cerrar\./);
  assert.throws(() => parseDebtCsv("CI;Nombre;Monto\n"), /El CSV no contiene deudas debajo de los encabezados\./);
  assert.throws(() => parseDebtCsv("x;;"), /El CSV no contiene filas con NIT\/CI, nombre y monto válidos\./);
});
