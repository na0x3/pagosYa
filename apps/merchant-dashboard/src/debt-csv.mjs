/** Debts a merchant pastes or uploads for a collection link: Bolivian amounts, documents and CSV files. */

export function debtAmountInCents(value, lineNumber) {
  let normalized = String(value || "").trim().replace(/\s|Bs\.?/gi, "");
  if (normalized.includes(",") && normalized.includes(".")) normalized = normalized.replace(/\./g, "").replace(",", ".");
  else normalized = normalized.replace(",", ".");
  const amount = Number(normalized);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error(lineNumber ? `Monto inválido en la línea ${lineNumber}.` : "Escribe un monto válido mayor a cero.");
  }
  return Math.round(amount * 100);
}

export function parseDebtCollectionRows(text) {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (!lines.length) throw new Error("Agrega al menos una deuda.");
  if (lines.length > 1000) throw new Error("Puedes cargar hasta 1.000 deudas por link.");
  return lines.map((line, index) => {
    const [rawDocument = "", customerName = "", rawAmount = "", description = "", reference = "", customerEmail = "", customerPhone = ""] = line.split(";").map((cell) => cell.trim());
    const customerDocument = debtDocumentDigits(rawDocument);
    if (!customerDocument || !customerName || !rawAmount) throw new Error(`Completa carnet, nombre y monto en la línea ${index + 1}.`);
    return {
      customerDocument,
      customerName,
      amount: debtAmountInCents(rawAmount, index + 1),
      ...(description && { description }),
      ...(reference && { reference }),
      ...(customerEmail && { customerEmail }),
      ...(customerPhone && { customerPhone }),
    };
  });
}

export function parseDebtCsv(text) {
  const source = String(text || "").replace(/^\uFEFF/, "").trim();
  if (!source) throw new Error("El CSV está vacío.");
  const delimiter = csvDelimiter(source);
  const table = parseCsvTable(source, delimiter).filter((row) => row.some((cell) => cell.trim()));
  if (!table.length) throw new Error("El CSV está vacío.");
  const aliases = {
    customerDocument: ["nit", "nro_nit", "numeronit", "carnet", "ci", "cedula", "documento", "nrodocumento", "identificacion", "customerdocument", "customer_document"],
    customerName: ["nombre", "cliente", "alumno", "estudiante", "socio", "nombrecliente", "customername", "customer_name"],
    amount: ["monto", "montobs", "importe", "deuda", "saldo", "saldobs", "cuota", "precio", "total", "amount"],
    customerEmail: ["gmail", "correo", "correoelectronico", "email", "customeremail", "customer_email"],
    customerPhone: ["telefono", "telefonocelular", "celular", "movil", "whatsapp", "phone", "customerphone", "customer_phone"],
  };
  const normalizedHeader = table[0].map(normalizeDebtCsvHeader);
  const positions = Object.fromEntries(Object.entries(aliases).map(([key, names]) => [key, normalizedHeader.findIndex((value) => names.includes(value))]));
  const hasHeader = positions.customerDocument >= 0 && positions.customerName >= 0 && positions.amount >= 0;
  const rows = hasHeader ? table.slice(1) : table;
  if (!rows.length) throw new Error("El CSV no contiene deudas debajo de los encabezados.");
  const parsed = rows.flatMap((row, index) => {
    const line = index + (hasHeader ? 2 : 1);
    const cell = (key, fallback) => String(row[hasHeader ? positions[key] : fallback] || "").trim();
    const customerDocument = debtDocumentDigits(cell("customerDocument", 0));
    const customerName = cell("customerName", 1);
    const rawAmount = cell("amount", 2);
    const customerEmail = cell("customerEmail", 3);
    const customerPhone = cell("customerPhone", 4);
    if (!customerDocument || !customerName || !rawAmount) return [];
    let amount;
    try { amount = debtAmountInCents(rawAmount, line); }
    catch { return []; }
    return [{
      customerDocument,
      customerName,
      amount,
      ...(customerEmail && { customerEmail }),
      ...(customerPhone && { customerPhone }),
    }];
  });
  if (!parsed.length) throw new Error("El CSV no contiene filas con NIT/CI, nombre y monto válidos.");
  return parsed.slice(0, 1000);
}

export function debtDocumentDigits(value) {
  return String(value || "").normalize("NFKC").replace(/[^0-9]/g, "");
}

function normalizeDebtCsvHeader(value) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9_]/g, "");
}

function csvDelimiter(text) {
  const firstLine = text.split(/\r?\n/, 1)[0] || "";
  return (firstLine.match(/;/g) || []).length >= (firstLine.match(/,/g) || []).length ? ";" : ",";
}

function parseCsvTable(text, delimiter) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === '"') {
      if (quoted && text[index + 1] === '"') { cell += '"'; index += 1; }
      else quoted = !quoted;
    } else if (char === delimiter && !quoted) {
      row.push(cell); cell = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && text[index + 1] === "\n") index += 1;
      row.push(cell); rows.push(row); row = []; cell = "";
    } else cell += char;
  }
  row.push(cell);
  if (row.some((value) => value.length)) rows.push(row);
  if (quoted) throw new Error("El CSV tiene una comilla sin cerrar.");
  return rows;
}
