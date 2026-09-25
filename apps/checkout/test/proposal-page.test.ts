import { beforeEach, describe, expect, it, vi } from "vitest";

type Json = Record<string, unknown>;

const store = { name: "Estudio Illimani", logoUrl: null, contactEmail: "hola@illimani.bo", contactPhone: "+591 70000001" };
const inDays = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString();

function openProposal(overrides: Json = {}, document: Json = {}): Json {
  return {
    kind: "PROPOSAL",
    numberLabel: "PRO-0003",
    status: "VIEWED",
    version: 2,
    sha256: "b".repeat(64),
    sentAt: "2026-09-25T14:00:00.000Z",
    updatedAfterFirstSend: true,
    store,
    dueAt: null,
    paidAt: null,
    payable: false,
    preview: false,
    validUntil: inDays(9.5),
    acceptable: true,
    acceptance: null,
    changesRequestedAt: null,
    document: {
      kind: "PROPOSAL",
      numberLabel: "PRO-0003",
      title: "Identidad visual para Café Aroma",
      currency: "BOB",
      customer: { name: "Café Aroma", email: "aroma@example.com", phone: null, document: null },
      items: [
        { description: "Diseño de logo", quantity: 1, unitAmount: 150000, amount: 150000 },
        { description: "Tarjetas", quantity: 2, unitAmount: 35000, amount: 70000 },
      ],
      subtotalAmount: 220000,
      discountAmount: 0,
      totalAmount: 220000,
      dueAt: null,
      validUntil: inDays(9.5),
      blocks: [
        { type: "paragraph", title: "Introducción", text: "Gracias por pensar en nosotros." },
        { type: "list", title: "Alcance", items: ["Investigación", "Diseño del logo"] },
        { type: "list", title: "Cronograma", items: ["Semana 1 — Bocetos", "Semana 2 — Entrega"] },
        { type: "paragraph", title: "Inversión", text: "Incluye dos rondas de cambios." },
        { type: "clause", title: "Condiciones de pago", text: "50% al aceptar." },
      ],
      ...document,
    },
    ...overrides,
  };
}

function respond(status: number, body: unknown) {
  return Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));
}

async function loadProposalPage(view: Json, posts: Record<string, { status: number; body: unknown }> = {}, path = "/d/tok_1") {
  vi.resetModules();
  document.body.innerHTML = '<div id="app"></div>';
  document.body.className = "";
  window.history.pushState({}, "", path);
  const fetchMock = vi.fn((url: string, init?: RequestInit) => {
    if (init?.method === "POST") {
      const kind = /\/(accept|changes)$/.exec(url)?.[1] ?? "";
      const answer = posts[kind] ?? { status: 200, body: kind === "accept" ? { status: "ACCEPTED", acceptance: { name: "Ana Quispe", at: "2026-09-26T15:00:00.000Z" } } : { status: "CHANGES_REQUESTED" } };
      return respond(answer.status, answer.body);
    }
    return respond(200, view);
  });
  vi.stubGlobal("fetch", fetchMock);
  await import("../src/main");
  await vi.waitFor(() => {
    if (!document.querySelector("[data-proposal-page]")) throw new Error("not rendered yet");
  });
  return fetchMock;
}

const page = () => document.querySelector<HTMLElement>("[data-proposal-page]")!;
const click = (selector: string) => document.querySelector<HTMLElement>(selector)!.click();
function type(selector: string, value: string) {
  const input = document.querySelector<HTMLInputElement | HTMLTextAreaElement>(selector)!;
  input.value = value;
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

describe("the customer's proposal page (/d/:token)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    delete (globalThis as typeof globalThis & { __xss?: number }).__xss;
  });

  it("shows the store, the sections, the investment and how long it is valid", async () => {
    await loadProposalPage(openProposal());
    const text = page().textContent!;
    expect(document.body.classList.contains("proposal-document-page")).toBe(true);
    expect(text).toContain("Propuesta de");
    expect(text).toContain("Estudio Illimani");
    expect(text).toContain("PRO-0003");
    expect(text).toContain("Identidad visual para Café Aroma");
    expect(text).toContain("Para Café Aroma");
    expect([...page().querySelectorAll(".proposal-section h2")].map((node) => node.textContent)).toEqual(["Introducción", "Alcance", "Cronograma", "Inversión", "Condiciones de pago"]);
    expect(page().querySelectorAll(".proposal-timeline li")).toHaveLength(2);
    expect(text).toContain("Bs 2.200,00");
    expect(page().querySelector("[data-proposal-validity]")!.textContent).toMatch(/Válida hasta el .* · quedan 9 días/);
    expect(text).toContain("actualizó esta propuesta");
    expect(page().querySelector("[data-proposal-pdf]")!.getAttribute("href")).toMatch(/\/documents\/public\/tok_1\/pdf$/);
  });

  it("escapes everything the merchant and the AI wrote", async () => {
    const evil = '<img src=x onerror="globalThis.__xss=1">';
    await loadProposalPage(openProposal({}, { title: evil, blocks: [{ type: "list", title: evil, items: [evil] }], items: [{ description: evil, quantity: 1, unitAmount: 100, amount: 100 }] }));
    expect(page().querySelector("img")).toBeNull();
    expect((globalThis as typeof globalThis & { __xss?: number }).__xss).toBeUndefined();
    expect(page().textContent).toContain("<img src=x");
  });

  it("accepts with the customer's name, email and the version they read", async () => {
    const fetchMock = await loadProposalPage(openProposal());
    click("[data-proposal-accept-open]");
    const form = document.querySelector<HTMLFormElement>("[data-proposal-accept-form]")!;
    expect(form.hidden).toBe(false);
    expect(form.textContent).toContain("versión 2");
    click("[data-proposal-accept-submit]");
    expect(form.querySelector("[data-proposal-form-error]")!.textContent).toMatch(/nombre/);
    type("#proposalAcceptName", "Ana Quispe");
    type("#proposalAcceptEmail", "ana@example.com");
    click("[data-proposal-accept-submit]");
    await vi.waitFor(() => {
      if (!document.querySelector("[data-proposal-accepted]")) throw new Error("not accepted yet");
    });
    const post = fetchMock.mock.calls.find((call) => call[1]?.method === "POST")!;
    expect(post[0]).toMatch(/\/documents\/public\/tok_1\/accept$/);
    expect(JSON.parse(String(post[1]!.body))).toEqual({ name: "Ana Quispe", email: "ana@example.com", version: 2 });
    expect(page().textContent).toContain("¡Propuesta aceptada!");
    expect(page().querySelector("[data-proposal-accept-open]")).toBeNull();
  });

  it("shows the server's reason when accepting fails (e.g. a newer version)", async () => {
    await loadProposalPage(openProposal(), { accept: { status: 409, body: { message: "El comercio actualizó esta propuesta." } } });
    click("[data-proposal-accept-open]");
    type("#proposalAcceptName", "Ana Quispe");
    type("#proposalAcceptEmail", "ana@example.com");
    click("[data-proposal-accept-submit]");
    await vi.waitFor(() => {
      if (!document.querySelector("[data-proposal-form-error]")?.textContent) throw new Error("no error yet");
    });
    expect(document.querySelector("[data-proposal-form-error]")!.textContent).toContain("El comercio actualizó esta propuesta.");
  });

  it("sends a change request and confirms it", async () => {
    const fetchMock = await loadProposalPage(openProposal());
    click("[data-proposal-changes-open]");
    type("#proposalChangesName", "Ana");
    type("#proposalChangesEmail", "ana@example.com");
    type("#proposalChangesMessage", "¿Puede incluir el envío?");
    click("[data-proposal-changes-submit]");
    await vi.waitFor(() => {
      if (!document.querySelector("[data-proposal-changes-sent]")) throw new Error("not sent yet");
    });
    const post = fetchMock.mock.calls.find((call) => call[1]?.method === "POST")!;
    expect(post[0]).toMatch(/\/changes$/);
    expect(JSON.parse(String(post[1]!.body))).toEqual({ name: "Ana", email: "ana@example.com", message: "¿Puede incluir el envío?" });
  });

  it("an accepted proposal says who accepted it and offers nothing to click", async () => {
    await loadProposalPage(openProposal({ status: "ACCEPTED", acceptable: false, acceptance: { name: "Ana Quispe", at: "2026-09-26T15:00:00.000Z" } }));
    expect(page().querySelector("[data-proposal-status]")!.textContent).toMatch(/Aceptada por Ana Quispe el 26 de septiembre de 2026/);
    expect(page().querySelector("[data-proposal-accept-open]")).toBeNull();
    expect(page().querySelector("[data-proposal-changes-open]")).toBeNull();
  });

  it("an expired proposal cannot be accepted", async () => {
    await loadProposalPage(openProposal({ status: "EXPIRED", acceptable: false, validUntil: inDays(-2) }));
    expect(page().querySelector("[data-proposal-status]")!.textContent).toMatch(/Vencida/);
    expect(page().querySelector("[data-proposal-accept-open]")).toBeNull();
    expect(page().textContent).toContain("Pídele a Estudio Illimani una propuesta actualizada");
  });

  it("changes requested: still acceptable, and says the merchant is reviewing", async () => {
    await loadProposalPage(openProposal({ status: "CHANGES_REQUESTED", changesRequestedAt: "2026-09-26T15:00:00.000Z" }));
    expect(page().querySelector("[data-proposal-status]")!.textContent).toMatch(/Cambios pedidos/);
    expect(page().querySelector("[data-proposal-accept-open]")).not.toBeNull();
  });

  it("a voided proposal keeps only its identity", async () => {
    await loadProposalPage({ kind: "PROPOSAL", numberLabel: "PRO-0003", title: "Identidad visual", status: "VOIDED", voidedAt: "2026-09-27T12:00:00.000Z", store: { name: "Estudio Illimani", logoUrl: null } });
    expect(page().textContent).toContain("Anulada");
    expect(page().textContent).toContain("Identidad visual");
    expect(page().querySelector("[data-proposal-accept-open]")).toBeNull();
  });

  it("a merchant preview disables both actions", async () => {
    await loadProposalPage(openProposal({ preview: true }), {}, "/d/tok_1?preview=p");
    expect(page().textContent).toContain("Vista previa");
    expect(document.querySelector<HTMLButtonElement>("[data-proposal-accept-open]")!.disabled).toBe(true);
    expect(document.querySelector<HTMLButtonElement>("[data-proposal-changes-open]")!.disabled).toBe(true);
  });
});
