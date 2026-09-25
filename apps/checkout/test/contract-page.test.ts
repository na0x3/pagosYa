import { beforeEach, describe, expect, it, vi } from "vitest";

type Json = Record<string, unknown>;

const store = { name: "Estudio Andino", logoUrl: null, contactEmail: "hola@andino.bo", contactPhone: "+591 70000001" };
const inDays = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString();

const contract = {
  contractType: "servicios",
  typeTitle: "Contrato de prestación de servicios",
  city: "La Paz",
  signingOrder: "merchant_first",
  roles: { merchant: "EL PRESTADOR", customer: "EL CLIENTE" },
  merchantParty: { legalName: "Estudio Andino SRL", document: "1020304050", representative: "", representativeDocument: "", address: "Av. Arce 123", email: "hola@andino.bo" },
  customerParty: { name: "Luis Mamani", document: "7788990", email: "luis@illimani.bo", address: "Calacoto 45", representative: "", representativeDocument: "" },
  preamble: "Conste por el presente documento privado…",
  partes: "Intervienen en la celebración del presente contrato:\n1. Estudio Andino SRL…\n2. Luis Mamani…",
  domicilios: "Para efectos de este contrato…",
  closing: "En señal de conformidad, las partes firman en la ciudad de La Paz.",
};

function openContract(overrides: Json = {}, signing: Json = {}, document: Json = {}): Json {
  return {
    kind: "CONTRACT",
    numberLabel: "CON-0002",
    status: "VIEWED",
    version: 3,
    sha256: "c".repeat(64),
    sentAt: "2026-09-25T14:00:00.000Z",
    updatedAfterFirstSend: false,
    store,
    preview: false,
    validUntil: inDays(20.5),
    signing: {
      order: "merchant_first",
      waitingFor: "customer",
      signable: true,
      codeSentTo: "l***@illimani.bo",
      verified: false,
      signatures: [{ role: "MERCHANT", name: "Ana Quispe", method: "TYPED", signedAt: "2026-09-25T14:05:00.000Z", imageUrl: null }],
      ...signing,
    },
    document: {
      kind: "CONTRACT",
      numberLabel: "CON-0002",
      title: "Contrato de diseño de identidad",
      currency: "BOB",
      customer: { name: "Luis Mamani", email: "luis@illimani.bo", phone: null, document: "7788990" },
      items: [],
      validUntil: inDays(20.5),
      blocks: [
        { type: "clause", title: "Objeto", text: "EL PRESTADOR diseñará la identidad visual." },
        { type: "clause", title: "Precio y forma de pago", text: "Bs 3.000,00 (TRES MIL 00/100 BOLIVIANOS)." },
      ],
      contract,
      ...document,
    },
    ...overrides,
  };
}

function respond(status: number, body: unknown) {
  return Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));
}

async function loadContractPage(view: Json, posts: Record<string, { status: number; body: unknown }> = {}) {
  vi.resetModules();
  document.body.innerHTML = '<div id="app"></div>';
  document.body.className = "";
  window.history.pushState({}, "", "/d/tok_9");
  const fetchMock = vi.fn((url: string, init?: RequestInit) => {
    if (init?.method === "POST") {
      const kind = /\/(sign\/code|sign\/verify|sign)$/.exec(url)?.[1] ?? "";
      const defaults: Record<string, unknown> = { "sign/code": { sentTo: "l***@illimani.bo", resendAfterSeconds: 60 }, "sign/verify": { verified: true }, sign: { status: "SIGNED" } };
      const answer = posts[kind] ?? { status: 200, body: defaults[kind] };
      return respond(answer.status, answer.body);
    }
    return respond(200, view);
  });
  vi.stubGlobal("fetch", fetchMock);
  await import("../src/main");
  await vi.waitFor(() => {
    if (!document.querySelector("[data-contract-page]")) throw new Error("not rendered yet");
  });
  return fetchMock;
}

const page = () => document.querySelector<HTMLElement>("[data-contract-page]")!;
const click = (selector: string) => document.querySelector<HTMLElement>(selector)!.click();
function type(selector: string, value: string) {
  const input = document.querySelector<HTMLInputElement>(selector)!;
  input.value = value;
  input.dispatchEvent(new Event("input", { bubbles: true }));
}
const posted = (fetchMock: ReturnType<typeof vi.fn>, path: string) =>
  fetchMock.mock.calls.filter((call) => call[1]?.method === "POST" && String(call[0]).endsWith(`/tok_9/${path}`)).map((call) => JSON.parse(String(call[1]!.body)));

describe("the customer's contract page (/d/:token)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    delete (globalThis as typeof globalThis & { __xss?: number }).__xss;
  });

  it("reads like a contract: parties, numbered clauses, closing, signatures and the signature-level notice", async () => {
    await loadContractPage(openContract());
    const text = page().textContent!;
    expect(document.body.classList.contains("contract-document-page")).toBe(true);
    expect(text).toContain("Contrato de");
    expect(text).toContain("CON-0002");
    expect(page().querySelector("[data-contract-status]")!.textContent).toContain("Esperando tu firma");
    expect([...page().querySelectorAll(".contract-clause h3")].map((node) => node.textContent!.replace(/\s+/g, " ").trim())).toEqual([
      "PRIMERA.- Partes", "SEGUNDA.- Objeto", "TERCERA.- Precio y forma de pago", "CUARTA.- Domicilios y firma electrónica",
    ]);
    expect(text).toContain("En señal de conformidad");
    expect(page().querySelector("[data-contract-signature='merchant']")!.textContent).toContain("Ana Quispe");
    expect(page().querySelector("[data-contract-signature='customer']")!.textContent).toContain("Pendiente de firma");
    expect(page().querySelector("[data-contract-notice]")!.textContent).toMatch(/consulta a un abogado o notario/);
    expect(page().querySelector("[data-contract-deadline]")!.textContent).toMatch(/Firmar antes del .* · quedan 20 días/);
  });

  it("escapes everything the merchant and the AI wrote", async () => {
    const evil = '<img src=x onerror="globalThis.__xss=1">';
    await loadContractPage(openContract({}, {}, { title: evil, blocks: [{ type: "clause", title: evil, text: evil }], contract: { ...contract, partes: evil, merchantParty: { ...contract.merchantParty, legalName: evil } } }));
    expect(page().querySelector("img")).toBeNull();
    expect((globalThis as typeof globalThis & { __xss?: number }).__xss).toBeUndefined();
    expect(page().textContent).toContain("<img src=x");
  });

  it("guides the signature: read → code to the email → name → Firmar, posting the version read", async () => {
    const fetchMock = await loadContractPage(openContract());
    const send = document.querySelector<HTMLButtonElement>("[data-contract-send-code]")!;
    expect(send.disabled).toBe(true);
    const read = document.querySelector<HTMLInputElement>("[data-contract-read]")!;
    read.checked = true;
    read.dispatchEvent(new Event("change", { bubbles: true }));
    expect(send.disabled).toBe(false);
    send.click();
    await vi.waitFor(() => {
      if (document.querySelector<HTMLElement>("[data-contract-step='code']")!.hidden) throw new Error("code step not shown");
    });
    expect(posted(fetchMock, "sign/code")).toEqual([{ version: 3 }]);
    expect(page().querySelector("[data-contract-step='code']")!.textContent).toContain("l***@illimani.bo");
    type("#contractCode", "12a3456");
    expect(document.querySelector<HTMLInputElement>("#contractCode")!.value).toBe("123456");
    click("[data-contract-verify]");
    await vi.waitFor(() => {
      if (document.querySelector<HTMLElement>("[data-contract-step='sign']")!.hidden) throw new Error("sign step not shown");
    });
    expect(posted(fetchMock, "sign/verify")).toEqual([{ version: 3, code: "123456" }]);
    expect(document.querySelector<HTMLInputElement>("#contractName")!.value).toBe("Luis Mamani");
    type("#contractName", "Luis Mamani Condori");
    expect(page().querySelector("[data-contract-typed-preview]")!.textContent).toBe("Luis Mamani Condori");
    click("[data-contract-submit]");
    await vi.waitFor(() => {
      if (!document.querySelector("[data-contract-signed]")) throw new Error("not signed yet");
    });
    expect(posted(fetchMock, "sign")).toEqual([{ version: 3, name: "Luis Mamani Condori", method: "TYPED", readConfirmed: true }]);
    expect(page().textContent).toContain("¡Contrato firmado!");
    expect(page().querySelector("[data-contract-signed-pdf]")!.getAttribute("href")).toMatch(/\/tok_9\/pdf\?download=1$/);
    expect(page().querySelector("[data-contract-signature='customer']")!.textContent).toContain("Luis Mamani Condori");
  });

  it("a wrong code shows the attempts left; a drawn signature needs a drawing", async () => {
    await loadContractPage(openContract({}, { verified: false }), { "sign/verify": { status: 400, body: { message: "Código incorrecto. Te quedan 4 intentos." } } });
    const read = document.querySelector<HTMLInputElement>("[data-contract-read]")!;
    read.checked = true;
    read.dispatchEvent(new Event("change", { bubbles: true }));
    click("[data-contract-send-code]");
    await vi.waitFor(() => {
      if (document.querySelector<HTMLElement>("[data-contract-step='code']")!.hidden) throw new Error("code step not shown");
    });
    type("#contractCode", "000000");
    click("[data-contract-verify]");
    await vi.waitFor(() => {
      if (!/Te quedan 4 intentos/.test(page().querySelector("[data-contract-step='code'] [data-contract-error]")!.textContent!)) throw new Error("no error yet");
    });
  });

  it("a verified signer lands on the last step; drawing is required when chosen", async () => {
    await loadContractPage(openContract({}, { verified: true }));
    expect(document.querySelector<HTMLElement>("[data-contract-step='sign']")!.hidden).toBe(false);
    click("[data-contract-method='DRAWN']");
    expect(document.querySelector<HTMLElement>("[data-contract-draw]")!.hidden).toBe(false);
    click("[data-contract-submit]");
    expect(page().querySelector("[data-contract-step='sign'] [data-contract-error]")!.textContent).toMatch(/Dibuja tu firma/);
  });

  it("a newer version refuses the signature and offers to reload", async () => {
    await loadContractPage(openContract({}, { verified: true }), { sign: { status: 409, body: { message: "El comercio actualizó el contrato. Vuelve a abrir el enlace y léelo antes de firmar." } } });
    click("[data-contract-submit]");
    await vi.waitFor(() => {
      if (!document.querySelector("[data-contract-reload]")) throw new Error("no reload yet");
    });
    expect(page().textContent).toContain("El comercio actualizó el contrato");
  });

  it("waiting for the merchant, already signed by the customer, fully signed, expired, voided and preview", async () => {
    await loadContractPage(openContract({}, { waitingFor: "merchant", signable: false, signatures: [] }));
    expect(page().querySelector("[data-contract-status]")!.textContent).toContain("Esperando la firma de Estudio Andino SRL");
    expect(page().querySelector("[data-contract-waiting]")).not.toBeNull();
    expect(page().querySelector("[data-contract-send-code]")).toBeNull();

    await loadContractPage(openContract({}, { order: "customer_first", waitingFor: "merchant", signable: false, signatures: [{ role: "CUSTOMER", name: "Luis Mamani", method: "TYPED", signedAt: "2026-09-25T15:00:00.000Z", imageUrl: null }] }));
    expect(page().querySelector("[data-contract-customer-signed]")!.textContent).toContain("Falta la firma de Estudio Andino SRL");

    await loadContractPage(openContract({ status: "SIGNED" }, { waitingFor: null, signable: false }));
    expect(page().querySelector("[data-contract-status]")!.textContent).toContain("Firmado por ambas partes");
    expect(page().querySelector("[data-contract-signed-pdf]")).not.toBeNull();

    await loadContractPage(openContract({ status: "EXPIRED" }, { signable: false }));
    expect(page().textContent).toContain("El plazo para firmar venció");

    await loadContractPage({ kind: "CONTRACT", numberLabel: "CON-0002", title: "Contrato de diseño", status: "VOIDED", voidedAt: "2026-09-26T12:00:00.000Z", store: { name: "Estudio Andino", logoUrl: null } });
    expect(page().textContent).toContain("Anulado");
    expect(page().textContent).toContain("ya no se puede firmar");

    await loadContractPage(openContract({ preview: true }));
    expect(page().textContent).toContain("Vista previa");
    expect(document.querySelector<HTMLInputElement>("[data-contract-read]")!.disabled).toBe(true);
    expect(page().querySelector("[data-contract-sticky]")).toBeNull();
  });
});
