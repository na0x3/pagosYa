# Inbox del comercio — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que el comercio lea y responda, desde el panel, las conversaciones de correo con compradores y con quien escribió por el formulario del sitio.

**Architecture:** Dos tablas nuevas (`StoreInboxThread`, `StoreInboxMessage`) guardan la conversación. La salida reutiliza la cola `StoreEmailDelivery` que ya existe, con el remitente del dominio verificado de la tienda. La entrada llega por un webhook de Resend Inbound sobre el subdominio `inbound.<dominio>`, se correlaciona al hilo por `In-Reply-To`/`References` y, si faltan, por remitente.

**Tech Stack:** NestJS + Prisma + PostgreSQL en `apps/api`; JavaScript sin framework en `apps/merchant-dashboard`; Jest para unidad, Playwright para el panel.

**Spec:** `docs/superpowers/specs/2026-09-21-inbox-comercio-design.md`

## Global Constraints

- Solo tiendas con dominio verificado en el workspace de correo tienen inbox. `workspaceSender` (`apps/api/src/email-workspace/email-workspace.config.ts:43`) devuelve `undefined` sin dominio verificado; si devuelve `undefined`, no hay inbox.
- Un hilo solo nace de un `StoreLead` o de un `StoreOrder`. Nunca de un remitente desconocido.
- Todo cuerpo entrante se guarda como texto plano. El HTML se convierte a texto antes de escribir en base de datos, y el panel lo renderiza como texto, nunca como HTML.
- El webhook de entrada va fuera de `MerchantAuthGuard` y verifica firma, igual que `dlocal-webhook.controller.ts` y `baneco-qr-webhook.controller.ts`.
- Esta versión no acepta adjuntos entrantes ni salientes. Solo se registra que el mensaje traía adjuntos.
- Toda copia visible al comercio va en español.
- La página del panel debe ser el único bloque de su `data-dashboard-page`, o `initDashboardSections` la abrirá colapsada.

---

### Task 1: Tablas del inbox

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/20260922030000_store_inbox/migration.sql`

**Interfaces:**
- Consumes: nada.
- Produce: modelos Prisma `StoreInboxThread` y `StoreInboxMessage` con los campos de abajo, usados por todas las tareas siguientes.

- [ ] **Step 1: Añadir los modelos al schema**

En `apps/api/prisma/schema.prisma`, después de `model StoreEmailDelivery`:

```prisma
model StoreInboxThread {
  id String @id @default(cuid())
  storeId String
  store Store @relation(fields: [storeId], references: [id], onDelete: Cascade)
  merchantId String
  subject String
  customerEmail String
  customerName String?
  leadId String?
  orderId String?
  status String @default("OPEN")
  unreadForMerchant Boolean @default(true)
  lastMessageAt DateTime @default(now())
  createdAt DateTime @default(now())
  messages StoreInboxMessage[]
  @@unique([storeId, customerEmail, leadId, orderId])
  @@index([storeId, status, lastMessageAt])
}

model StoreInboxMessage {
  id String @id @default(cuid())
  threadId String
  thread StoreInboxThread @relation(fields: [threadId], references: [id], onDelete: Cascade)
  direction String
  fromEmail String
  toEmail String
  body String
  messageId String? @unique
  inReplyTo String?
  hadAttachments Boolean @default(false)
  createdAt DateTime @default(now())
  @@index([threadId, createdAt])
  @@index([inReplyTo])
}
```

En `model Store`, añadir a la lista de relaciones: `inboxThreads StoreInboxThread[]`

- [ ] **Step 2: Escribir la migración**

Crear `apps/api/prisma/migrations/20260922030000_store_inbox/migration.sql`:

```sql
CREATE TABLE "StoreInboxThread" (
  "id" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "merchantId" TEXT NOT NULL,
  "subject" TEXT NOT NULL,
  "customerEmail" TEXT NOT NULL,
  "customerName" TEXT,
  "leadId" TEXT,
  "orderId" TEXT,
  "status" TEXT NOT NULL DEFAULT 'OPEN',
  "unreadForMerchant" BOOLEAN NOT NULL DEFAULT true,
  "lastMessageAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StoreInboxThread_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "StoreInboxMessage" (
  "id" TEXT NOT NULL,
  "threadId" TEXT NOT NULL,
  "direction" TEXT NOT NULL,
  "fromEmail" TEXT NOT NULL,
  "toEmail" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "messageId" TEXT,
  "inReplyTo" TEXT,
  "hadAttachments" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StoreInboxMessage_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "StoreInboxThread_storeId_customerEmail_leadId_orderId_key"
  ON "StoreInboxThread"("storeId", "customerEmail", "leadId", "orderId");
CREATE INDEX "StoreInboxThread_storeId_status_lastMessageAt_idx"
  ON "StoreInboxThread"("storeId", "status", "lastMessageAt");
CREATE UNIQUE INDEX "StoreInboxMessage_messageId_key" ON "StoreInboxMessage"("messageId");
CREATE INDEX "StoreInboxMessage_threadId_createdAt_idx" ON "StoreInboxMessage"("threadId", "createdAt");
CREATE INDEX "StoreInboxMessage_inReplyTo_idx" ON "StoreInboxMessage"("inReplyTo");

ALTER TABLE "StoreInboxThread" ADD CONSTRAINT "StoreInboxThread_storeId_fkey"
  FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StoreInboxMessage" ADD CONSTRAINT "StoreInboxMessage_threadId_fkey"
  FOREIGN KEY ("threadId") REFERENCES "StoreInboxThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;
```

- [ ] **Step 3: Generar el cliente y verificar que compila**

Run: `cd apps/api && npx prisma generate && npx tsc --noEmit -p tsconfig.json`
Expected: sin errores.

- [ ] **Step 4: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations/20260922030000_store_inbox
git commit -m "feat(inbox): add thread and message tables"
```

---

### Task 2: Correlación de hilo

**Files:**
- Create: `apps/api/src/inbox/inbox-correlation.ts`
- Test: `apps/api/src/inbox/inbox-correlation.spec.ts`

**Interfaces:**
- Consumes: nada. Funciones puras, sin base de datos.
- Produce:
  - `parseReferences(header: string | null | undefined): string[]` — devuelve los `Message-ID` del encabezado, sin los `<>`.
  - `htmlToText(html: string): string` — texto plano a partir de HTML.
  - `SPANISH_UNKNOWN_SENDER: string` — copia del rechazo.

- [ ] **Step 1: Escribir los tests que fallan**

Crear `apps/api/src/inbox/inbox-correlation.spec.ts`:

```ts
import { parseReferences, htmlToText } from "./inbox-correlation";

describe("parseReferences", () => {
  it("reads every Message-ID out of a References chain", () => {
    expect(parseReferences("<a@mail.test> <b@mail.test>")).toEqual(["a@mail.test", "b@mail.test"]);
  });
  it("tolerates a missing header", () => {
    expect(parseReferences(null)).toEqual([]);
    expect(parseReferences("   ")).toEqual([]);
  });
  it("ignores text that is not a bracketed id", () => {
    expect(parseReferences("charla suelta <real@mail.test>")).toEqual(["real@mail.test"]);
  });
});

describe("htmlToText", () => {
  it("drops tags and keeps the readable text", () => {
    expect(htmlToText("<p>Hola <b>Ana</b></p>")).toBe("Hola Ana");
  });
  it("removes script and style contents entirely", () => {
    expect(htmlToText("<script>alert(1)</script><p>Hola</p>")).toBe("Hola");
    expect(htmlToText("<style>p{color:red}</style><p>Hola</p>")).toBe("Hola");
  });
  it("turns block breaks into newlines", () => {
    expect(htmlToText("<p>Una</p><p>Dos</p>")).toBe("Una\nDos");
  });
  it("decodes the common entities", () => {
    expect(htmlToText("<p>Caf&eacute; &amp; t&eacute;</p>")).toBe("Café & té");
  });
});
```

- [ ] **Step 2: Correr y ver que falla**

Run: `cd apps/api && npx jest src/inbox/inbox-correlation.spec.ts`
Expected: FAIL, "Cannot find module './inbox-correlation'".

- [ ] **Step 3: Implementar**

Crear `apps/api/src/inbox/inbox-correlation.ts`:

```ts
/** Copy shown when someone with no open thread writes to the inbox address. */
export const SPANISH_UNKNOWN_SENDER = "Remitente sin conversación abierta";

/**
 * Pulls the bracketed ids out of a References or In-Reply-To header. Anything
 * not inside angle brackets is commentary some clients add; it is not an id.
 */
export function parseReferences(header: string | null | undefined): string[] {
  if (!header) return [];
  return [...header.matchAll(/<([^<>]+)>/g)].map((match) => match[1].trim()).filter(Boolean);
}

const ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
  eacute: "é", aacute: "á", iacute: "í", oacute: "ó", uacute: "ú", ntilde: "ñ",
  Eacute: "É", Aacute: "Á", Iacute: "Í", Oacute: "Ó", Uacute: "Ú", Ntilde: "Ñ",
};

/**
 * Inbound HTML is never rendered as HTML anywhere, so it is flattened to text
 * on the way in rather than sanitised on the way out.
 */
export function htmlToText(html: string): string {
  return html
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|li|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&([a-zA-Z]+);/g, (whole, name) => ENTITIES[name] ?? whole)
    .split("\n")
    .map((line) => line.trim())
    .filter((line, index, lines) => line !== "" || (index > 0 && lines[index - 1] !== ""))
    .join("\n")
    .trim();
}
```

- [ ] **Step 4: Correr y ver que pasa**

Run: `cd apps/api && npx jest src/inbox/inbox-correlation.spec.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/inbox/inbox-correlation.ts apps/api/src/inbox/inbox-correlation.spec.ts
git commit -m "feat(inbox): parse reference headers and flatten inbound html"
```

---

### Task 3: Servicio del inbox

**Files:**
- Create: `apps/api/src/inbox/inbox.service.ts`
- Test: `apps/api/src/inbox/inbox.service.spec.ts`

**Interfaces:**
- Consumes: `parseReferences`, `htmlToText` de Task 2. Modelos de Task 1.
- Produce, en la clase `InboxService`:
  - `threadForLead(tx, lead): Promise<{ id: string }>`
  - `threadForOrder(tx, order): Promise<{ id: string }>`
  - `resolveInboundThread(storeId, headers, fromEmail): Promise<{ id: string } | null>`
  - `recordInbound(args): Promise<void>`
  - `listThreads(merchantId, storeId): Promise<ThreadRow[]>`
  - `readThread(merchantId, threadId): Promise<ThreadDetail>`

- [ ] **Step 1: Escribir los tests que fallan**

Crear `apps/api/src/inbox/inbox.service.spec.ts`:

```ts
import { InboxService } from "./inbox.service";

function fakeDb() {
  return {
    storeInboxThread: { findFirst: jest.fn(), findUnique: jest.fn(), upsert: jest.fn(), update: jest.fn() },
    storeInboxMessage: { create: jest.fn(), findFirst: jest.fn(), findMany: jest.fn() },
  };
}

describe("InboxService.resolveInboundThread", () => {
  it("follows In-Reply-To to the thread that sent that message", async () => {
    const db = fakeDb();
    db.storeInboxMessage.findFirst.mockResolvedValue({ threadId: "thread-1" });
    db.storeInboxThread.findUnique.mockResolvedValue({ id: "thread-1", storeId: "store-1" });

    const thread = await new InboxService(db as any).resolveInboundThread(
      "store-1", { inReplyTo: "<sent-1@pagosya>", references: null }, "ana@gmail.test",
    );

    expect(thread).toEqual({ id: "thread-1", storeId: "store-1" });
    expect(db.storeInboxMessage.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { messageId: { in: ["sent-1@pagosya"] } } }),
    );
  });

  it("falls back to the sender's most recent open thread when headers are missing", async () => {
    const db = fakeDb();
    db.storeInboxMessage.findFirst.mockResolvedValue(null);
    db.storeInboxThread.findFirst.mockResolvedValue({ id: "thread-2", storeId: "store-1" });

    const thread = await new InboxService(db as any).resolveInboundThread(
      "store-1", { inReplyTo: null, references: null }, "ANA@gmail.test",
    );

    expect(thread).toEqual({ id: "thread-2", storeId: "store-1" });
    expect(db.storeInboxThread.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { storeId: "store-1", customerEmail: "ana@gmail.test", status: "OPEN" },
      orderBy: { lastMessageAt: "desc" },
    }));
  });

  it("returns null for a sender with no thread, so the message is dropped", async () => {
    const db = fakeDb();
    db.storeInboxMessage.findFirst.mockResolvedValue(null);
    db.storeInboxThread.findFirst.mockResolvedValue(null);

    const thread = await new InboxService(db as any).resolveInboundThread(
      "store-1", { inReplyTo: null, references: null }, "spam@nowhere.test",
    );

    expect(thread).toBeNull();
  });
});

describe("InboxService.recordInbound", () => {
  it("stores the flattened text and marks the thread unread", async () => {
    const db = fakeDb();
    await new InboxService(db as any).recordInbound({
      threadId: "thread-1", fromEmail: "ana@gmail.test", toEmail: "hola@inbound.tienda.test",
      html: "<p>¿Llega a Santa Cruz?</p>", text: null, messageId: "in-1", inReplyTo: "sent-1",
      hadAttachments: false,
    });

    expect(db.storeInboxMessage.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      threadId: "thread-1", direction: "INBOUND", body: "¿Llega a Santa Cruz?",
    }) });
    expect(db.storeInboxThread.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "thread-1" },
      data: expect.objectContaining({ unreadForMerchant: true }),
    }));
  });

  it("prefers the plain-text part when the message carries both", async () => {
    const db = fakeDb();
    await new InboxService(db as any).recordInbound({
      threadId: "thread-1", fromEmail: "ana@gmail.test", toEmail: "hola@inbound.tienda.test",
      html: "<p>version html</p>", text: "version texto", messageId: "in-2", inReplyTo: null,
      hadAttachments: true,
    });

    const data = db.storeInboxMessage.create.mock.calls[0][0].data;
    expect(data.body).toBe("version texto");
    expect(data.hadAttachments).toBe(true);
  });
});
```

- [ ] **Step 2: Correr y ver que falla**

Run: `cd apps/api && npx jest src/inbox/inbox.service.spec.ts`
Expected: FAIL, "Cannot find module './inbox.service'".

- [ ] **Step 3: Implementar**

Crear `apps/api/src/inbox/inbox.service.ts`:

```ts
import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { htmlToText, parseReferences } from "./inbox-correlation";

export interface InboundHeaders { inReplyTo: string | null; references: string | null }

@Injectable()
export class InboxService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * A reply is matched by the id of the message it answers. Clients that drop
   * those headers still reach the right place through the sender's newest open
   * thread, which is why a store only ever has one open thread per address.
   */
  async resolveInboundThread(storeId: string, headers: InboundHeaders, fromEmail: string) {
    const ids = [...parseReferences(headers.inReplyTo), ...parseReferences(headers.references)];
    if (ids.length) {
      const message = await this.prisma.storeInboxMessage.findFirst({
        where: { messageId: { in: ids } },
        orderBy: { createdAt: "desc" },
      });
      if (message) {
        const thread = await this.prisma.storeInboxThread.findUnique({ where: { id: message.threadId } });
        if (thread && thread.storeId === storeId) return thread;
      }
    }
    return this.prisma.storeInboxThread.findFirst({
      where: { storeId, customerEmail: fromEmail.trim().toLowerCase(), status: "OPEN" },
      orderBy: { lastMessageAt: "desc" },
    });
  }

  async recordInbound(args: {
    threadId: string; fromEmail: string; toEmail: string;
    html: string | null; text: string | null;
    messageId: string | null; inReplyTo: string | null; hadAttachments: boolean;
  }) {
    const body = args.text?.trim() || (args.html ? htmlToText(args.html) : "");
    await this.prisma.storeInboxMessage.create({
      data: {
        threadId: args.threadId, direction: "INBOUND",
        fromEmail: args.fromEmail.trim().toLowerCase(), toEmail: args.toEmail.trim().toLowerCase(),
        body, messageId: args.messageId, inReplyTo: args.inReplyTo,
        hadAttachments: args.hadAttachments,
      },
    });
    await this.prisma.storeInboxThread.update({
      where: { id: args.threadId },
      data: { unreadForMerchant: true, lastMessageAt: new Date() },
    });
  }
}
```

- [ ] **Step 4: Correr y ver que pasa**

Run: `cd apps/api && npx jest src/inbox/inbox.service.spec.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Escribir el test de creación de hilos**

Un hilo solo nace de un lead o de un pedido. Añadir a `inbox.service.spec.ts`:

```ts
describe("InboxService.threadForLead", () => {
  it("opens one thread per lead and reuses it on a repeat call", async () => {
    const db = fakeDb();
    db.storeInboxThread.upsert.mockResolvedValue({ id: "thread-1" });

    const thread = await new InboxService(db as any).threadForLead({
      id: "lead-1", storeId: "store-1", merchantId: "m-1",
      customerEmail: "Ana@Gmail.test", customerName: "Ana", message: "¿Llega a Santa Cruz?",
    } as any);

    expect(thread).toEqual({ id: "thread-1" });
    const call = db.storeInboxThread.upsert.mock.calls[0][0];
    expect(call.where).toEqual({ storeId_customerEmail_leadId_orderId: {
      storeId: "store-1", customerEmail: "ana@gmail.test", leadId: "lead-1", orderId: null,
    } });
    expect(call.create.subject).toBe("Consulta desde la tienda");
    expect(call.update).toEqual({});
  });
});

describe("InboxService.threadForOrder", () => {
  it("opens one thread per order, titled with the order id", async () => {
    const db = fakeDb();
    db.storeInboxThread.upsert.mockResolvedValue({ id: "thread-2" });

    await new InboxService(db as any).threadForOrder({
      id: "order-1", storeId: "store-1", merchantId: "m-1",
      customerEmail: "ana@gmail.test", customerName: "Ana",
    } as any);

    const call = db.storeInboxThread.upsert.mock.calls[0][0];
    expect(call.create.orderId).toBe("order-1");
    expect(call.create.subject).toBe("Pedido order-1");
    expect(call.create.unreadForMerchant).toBe(false);
  });
});
```

- [ ] **Step 6: Correr y ver que falla**

Run: `cd apps/api && npx jest src/inbox/inbox.service.spec.ts`
Expected: FAIL, "threadForLead is not a function".

- [ ] **Step 7: Implementar la creación de hilos**

Añadir a `apps/api/src/inbox/inbox.service.ts`:

```ts
  /**
   * The form inquiry is the first message of its own thread: the shopper already
   * wrote something, so the thread starts unread and with their text in it.
   */
  async threadForLead(lead: { id: string; storeId: string; merchantId: string; customerEmail: string; customerName: string | null; message: string | null }) {
    const customerEmail = lead.customerEmail.trim().toLowerCase();
    const thread = await this.prisma.storeInboxThread.upsert({
      where: { storeId_customerEmail_leadId_orderId: { storeId: lead.storeId, customerEmail, leadId: lead.id, orderId: null } },
      create: {
        storeId: lead.storeId, merchantId: lead.merchantId, subject: "Consulta desde la tienda",
        customerEmail, customerName: lead.customerName, leadId: lead.id, unreadForMerchant: true,
      },
      update: {},
    });
    if (lead.message?.trim()) {
      await this.prisma.storeInboxMessage.create({
        data: {
          threadId: thread.id, direction: "INBOUND", fromEmail: customerEmail,
          toEmail: "", body: lead.message.trim(), messageId: `lead.${lead.id}@pagosya`,
          inReplyTo: null, hadAttachments: false,
        },
      });
    }
    return thread;
  }

  /**
   * An order opens a thread so the buyer's reply to their receipt has somewhere
   * to land. Nobody has written yet, so it does not start unread.
   */
  async threadForOrder(order: { id: string; storeId: string; merchantId: string; customerEmail: string; customerName: string | null }) {
    const customerEmail = order.customerEmail.trim().toLowerCase();
    return this.prisma.storeInboxThread.upsert({
      where: { storeId_customerEmail_leadId_orderId: { storeId: order.storeId, customerEmail, leadId: null, orderId: order.id } },
      create: {
        storeId: order.storeId, merchantId: order.merchantId, subject: `Pedido ${order.id}`,
        customerEmail, customerName: order.customerName, orderId: order.id, unreadForMerchant: false,
      },
      update: {},
    });
  }
```

- [ ] **Step 8: Llamarlas donde nacen los leads y los pedidos**

En `apps/api/src/stores/store-checkout.service.ts`, justo después del `await this.emailProvider?.send({...})` del lead (línea ~459), añadir:

```ts
    await this.inbox.threadForLead({ ...lead, storeId: store.id, merchantId: store.merchantId, customerEmail, customerName, message: dto.message ?? null }).catch(() => undefined);
```

En `apps/api/src/payment-intents/payment-intents.service.ts`, dentro del bloque `if (order?.storeId && updated.livemode)` que ya encola el recibo, añadir después de `receiptQueued = ...`:

```ts
          if (updated.customerEmail) await this.inbox.threadForOrder({ id: order.id, storeId: order.storeId, merchantId, customerEmail: updated.customerEmail, customerName: updated.customerName }).catch(() => undefined);
```

Inyectar `InboxService` en ambos servicios por constructor.

- [ ] **Step 9: Correr y ver que pasa**

Run: `cd apps/api && npx jest src/inbox src/stores src/payment-intents`
Expected: PASS, sin regresiones.

- [ ] **Step 10: Commit**

```bash
git add apps/api/src/inbox apps/api/src/stores/store-checkout.service.ts apps/api/src/payment-intents/payment-intents.service.ts
git commit -m "feat(inbox): open a thread from every lead and paid order"
```

---

### Task 4: Webhook de entrada

**Files:**
- Create: `apps/api/src/inbox/inbox-webhook.controller.ts`
- Create: `apps/api/src/inbox/inbox.module.ts`
- Modify: `apps/api/src/app.module.ts`
- Modify: `apps/api/src/config/configuration.ts`
- Test: `apps/api/src/inbox/inbox-webhook.controller.spec.ts`

**Interfaces:**
- Consumes: `InboxService.resolveInboundThread`, `InboxService.recordInbound` de Task 3.
- Produce: `POST /v1/email/inbound`.

**Antes de escribir código:** leer la referencia de firma de webhooks de Resend en `https://resend.com/docs/dashboard/webhooks/introduction` y copiar el esquema exacto de cabeceras. Resend firma con Svix (`svix-id`, `svix-timestamp`, `svix-signature`). Seguir el mismo orden de verificación que `apps/api/src/payment-intents/dlocal-webhook.controller.ts`: firma primero, cuerpo después.

- [ ] **Step 1: Escribir el test que falla**

Crear `apps/api/src/inbox/inbox-webhook.controller.spec.ts`:

```ts
import { UnauthorizedException } from "@nestjs/common";
import { InboxWebhookController } from "./inbox-webhook.controller";

const payload = {
  type: "email.received",
  data: {
    to: ["hola@inbound.tienda.test"], from: "ana@gmail.test",
    subject: "Re: Pedido", message_id: "in-1", in_reply_to: "<sent-1@pagosya>",
    references: null, text: "¿Llega a Santa Cruz?", html: null, attachments: [],
  },
};

function controller(overrides: Record<string, unknown> = {}) {
  const inbox = { resolveInboundThread: jest.fn().mockResolvedValue({ id: "thread-1" }), recordInbound: jest.fn() };
  const stores = { findByInboundAddress: jest.fn().mockResolvedValue({ id: "store-1" }) };
  const verifier = { verify: jest.fn() };
  return { inbox, stores, verifier, subject: new InboxWebhookController(inbox as any, stores as any, verifier as any), ...overrides };
}

describe("InboxWebhookController", () => {
  it("rejects a bad signature and writes nothing", async () => {
    const { subject, verifier, inbox } = controller();
    verifier.verify.mockImplementation(() => { throw new UnauthorizedException(); });

    await expect(subject.receive({}, payload as any)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(inbox.recordInbound).not.toHaveBeenCalled();
  });

  it("drops a message from a sender with no thread", async () => {
    const { subject, inbox } = controller();
    inbox.resolveInboundThread.mockResolvedValue(null);

    await expect(subject.receive({}, payload as any)).resolves.toEqual({ received: true });
    expect(inbox.recordInbound).not.toHaveBeenCalled();
  });

  it("records a reply that belongs to a known thread", async () => {
    const { subject, inbox } = controller();

    await subject.receive({}, payload as any);

    expect(inbox.recordInbound).toHaveBeenCalledWith(expect.objectContaining({
      threadId: "thread-1", fromEmail: "ana@gmail.test", text: "¿Llega a Santa Cruz?",
    }));
  });
});
```

- [ ] **Step 2: Correr y ver que falla**

Run: `cd apps/api && npx jest src/inbox/inbox-webhook.controller.spec.ts`
Expected: FAIL, "Cannot find module './inbox-webhook.controller'".

- [ ] **Step 3: Implementar el controlador**

Crear `apps/api/src/inbox/inbox-webhook.controller.ts`:

```ts
import { Body, Controller, Headers, HttpCode, Post } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { InboxService } from "./inbox.service";
import { InboxStoreResolver } from "./inbox-store-resolver";
import { InboundSignatureVerifier } from "./inbound-signature.verifier";

/**
 * Public on purpose: Resend calls it, not a merchant session. The signature is
 * the only credential, and it is checked before anything is read, the same
 * order the dLocal and Baneco webhooks use.
 */
@ApiTags("internal")
@Controller("v1/email")
export class InboxWebhookController {
  constructor(
    private readonly inbox: InboxService,
    private readonly stores: InboxStoreResolver,
    private readonly verifier: InboundSignatureVerifier,
  ) {}

  @Post("inbound")
  @HttpCode(200)
  async receive(@Headers() headers: Record<string, string>, @Body() payload: {
    type: string;
    data: {
      to: string[]; from: string; subject: string;
      message_id: string | null; in_reply_to: string | null; references: string | null;
      text: string | null; html: string | null; attachments?: unknown[];
    };
  }) {
    this.verifier.verify(headers, payload);
    if (payload.type !== "email.received") return { received: true };

    const recipient = payload.data.to[0] ?? "";
    const store = await this.stores.findByInboundAddress(recipient);
    if (!store) return { received: true };

    const thread = await this.inbox.resolveInboundThread(
      store.id,
      { inReplyTo: payload.data.in_reply_to, references: payload.data.references },
      payload.data.from,
    );
    // No thread means nobody at this store was talking to them. The address is
    // public, so this is the line that keeps the inbox from becoming a spam bin.
    if (!thread) return { received: true };

    await this.inbox.recordInbound({
      threadId: thread.id, fromEmail: payload.data.from, toEmail: recipient,
      html: payload.data.html, text: payload.data.text,
      messageId: payload.data.message_id, inReplyTo: payload.data.in_reply_to,
      hadAttachments: (payload.data.attachments ?? []).length > 0,
    });
    return { received: true };
  }
}
```

- [ ] **Step 4: Escribir las dos dependencias que el controlador consume**

Crear `apps/api/src/inbox/inbox-store-resolver.ts`:

```ts
import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { workspaceMail } from "../email-workspace/email-workspace.config";

/** Maps hola@inbound.<dominio> back to the store that verified that domain. */
@Injectable()
export class InboxStoreResolver {
  constructor(private readonly prisma: PrismaService) {}

  async findByInboundAddress(address: string) {
    const host = address.split("@")[1]?.trim().toLowerCase() ?? "";
    const domain = host.startsWith("inbound.") ? host.slice("inbound.".length) : "";
    if (!domain) return null;
    const row = await this.prisma.storeRetention.findFirst({
      where: { settings: { path: ["emailWorkspace", "domain", "name"], equals: domain } },
      select: { storeId: true },
    });
    if (!row) return null;
    const settings = await this.prisma.storeRetention.findUnique({ where: { storeId: row.storeId } });
    // A domain that lost verification must stop receiving on the store's behalf.
    if (workspaceMail(settings?.settings).domain?.status !== "verified") return null;
    return { id: row.storeId };
  }
}
```

Crear `apps/api/src/inbox/inbound-signature.verifier.ts`. Resend firma con Svix:

```ts
import { Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Svix signs "<id>.<timestamp>.<body>" with a base64 secret and sends one or
 * more space-separated "v1,<sig>" values. Same order as the other webhooks in
 * this codebase: verify before reading anything out of the payload.
 */
@Injectable()
export class InboundSignatureVerifier {
  constructor(private readonly config: ConfigService) {}

  verify(headers: Record<string, string>, payload: unknown) {
    const secret = this.config.get<string>("app.email.inboundSigningSecret");
    if (!secret) throw new UnauthorizedException("Inbound mail is not configured");
    const id = headers["svix-id"], timestamp = headers["svix-timestamp"], signatures = headers["svix-signature"];
    if (!id || !timestamp || !signatures) throw new UnauthorizedException("Missing signature headers");
    // Reject replays of an old capture.
    if (Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) throw new UnauthorizedException("Stale signature");

    const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
    const expected = createHmac("sha256", key).update(`${id}.${timestamp}.${JSON.stringify(payload)}`).digest();
    const ok = signatures.split(" ").some((entry) => {
      const value = entry.split(",")[1];
      if (!value) return false;
      const candidate = Buffer.from(value, "base64");
      return candidate.length === expected.length && timingSafeEqual(candidate, expected);
    });
    if (!ok) throw new UnauthorizedException("Invalid inbound signature");
  }
}
```

En `apps/api/src/config/configuration.ts`, junto a `resendApiKey` (línea 342), añadir:

```ts
      inboundSigningSecret: process.env.RESEND_INBOUND_SIGNING_SECRET ?? "",
```

Crear `apps/api/src/inbox/inbox.module.ts` declarando `InboxService`, `InboxStoreResolver`, `InboundSignatureVerifier`, `InboxWebhookController` e `InboxController`, exportando `InboxService`; e importarlo en `apps/api/src/app.module.ts`.

- [ ] **Step 5: Limitar la tasa del webhook**

El endpoint es público. Añadir sobre `receive`, con el mismo decorador que ya usa `stores-public.controller.ts`:

```ts
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
```

- [ ] **Step 6: Correr y ver que pasa**

Run: `cd apps/api && npx jest src/inbox/inbox-webhook.controller.spec.ts`
Expected: PASS, 3 tests.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/inbox apps/api/src/config/configuration.ts apps/api/src/app.module.ts
git commit -m "feat(inbox): accept signed inbound mail for known threads only"
```

---

### Task 5: Responder desde el panel

**Files:**
- Create: `apps/api/src/inbox/inbox.controller.ts`
- Modify: `apps/api/src/inbox/inbox.service.ts`
- Test: `apps/api/src/inbox/inbox-reply.spec.ts`

**Interfaces:**
- Consumes: `InboxService` de Task 3, `workspaceSender` de `email-workspace.config.ts:43`, y la cola `StoreEmailDelivery` con la columna `replyTo` ya añadida.
- Produce:
  - `GET  /v1/stores/:storeId/inbox` → `ThreadRow[]`
  - `GET  /v1/stores/:storeId/inbox/:threadId` → `{ thread, messages }`
  - `POST /v1/stores/:storeId/inbox/:threadId/reply` con `{ body: string }`

- [ ] **Step 1: Escribir el test que falla**

Crear `apps/api/src/inbox/inbox-reply.spec.ts`:

```ts
import { InboxService } from "./inbox.service";

describe("InboxService.reply", () => {
  function db() {
    return {
      storeInboxThread: { findUnique: jest.fn().mockResolvedValue({
        id: "thread-1", storeId: "store-1", merchantId: "m-1",
        customerEmail: "ana@gmail.test", subject: "Pedido",
      }), update: jest.fn() },
      storeInboxMessage: { create: jest.fn().mockResolvedValue({ id: "msg-1" }) },
      storeRetention: { findUnique: jest.fn().mockResolvedValue({ settings: { emailWorkspace: {
        domain: { name: "tienda.test", senderName: "Tienda", status: "verified" },
      } } }) },
      store: { findUnique: jest.fn().mockResolvedValue({ id: "store-1", name: "Tienda" }) },
      storeEmailDelivery: { upsert: jest.fn() },
    };
  }

  it("queues the reply from the store's verified domain and files it in the thread", async () => {
    const prisma = db();
    await new InboxService(prisma as any).reply("m-1", "thread-1", "Sí, llega en 3 días.");

    const queued = prisma.storeEmailDelivery.upsert.mock.calls[0][0].create;
    expect(queued.email).toBe("ana@gmail.test");
    expect(queued.body).toBe("Sí, llega en 3 días.");
    expect(prisma.storeInboxMessage.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      direction: "OUTBOUND", body: "Sí, llega en 3 días.",
    }) });
    expect(prisma.storeInboxThread.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "thread-1" },
      data: expect.objectContaining({ unreadForMerchant: false }),
    }));
  });

  it("refuses a thread that belongs to another merchant", async () => {
    const prisma = db();
    await expect(new InboxService(prisma as any).reply("otro-merchant", "thread-1", "hola"))
      .rejects.toThrow();
    expect(prisma.storeEmailDelivery.upsert).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Correr y ver que falla**

Run: `cd apps/api && npx jest src/inbox/inbox-reply.spec.ts`
Expected: FAIL, "this.reply is not a function".

- [ ] **Step 3: Implementar `reply` en `InboxService`**

Añadir a `apps/api/src/inbox/inbox.service.ts`:

```ts
  /**
   * The outbound half rides the existing delivery queue, so retries, dedupe and
   * the verified sending domain are already solved. The inbox only records that
   * the message belongs to this conversation.
   */
  async reply(merchantId: string, threadId: string, body: string) {
    const thread = await this.prisma.storeInboxThread.findUnique({ where: { id: threadId } });
    if (!thread || thread.merchantId !== merchantId) throw new NotFoundException("Conversación no encontrada");

    const messageId = `${threadId}.${Date.now()}@pagosya`;
    const retention = await this.prisma.storeRetention.findUnique({ where: { storeId: thread.storeId } });
    const domain = workspaceMail(retention?.settings).domain;
    if (domain?.status !== "verified") throw new BadRequestException("Verifica el dominio de correo de la tienda para responder desde aquí.");
    await this.prisma.storeEmailDelivery.upsert({
      where: { dedupeKey: `inbox:${messageId}` },
      create: {
        storeId: thread.storeId, email: thread.customerEmail, kind: "INBOX_REPLY",
        sourceId: threadId, subject: `Re: ${thread.subject}`, body,
        replyTo: null, dedupeKey: `inbox:${messageId}`,
      },
      update: {},
    });
    await this.prisma.storeInboxMessage.create({
      data: {
        threadId, direction: "OUTBOUND",
        fromEmail: `hola@inbound.${domain.name}`, toEmail: thread.customerEmail,
        body, messageId, inReplyTo: null, hadAttachments: false,
      },
    });
    await this.prisma.storeInboxThread.update({
      where: { id: threadId },
      data: { unreadForMerchant: false, lastMessageAt: new Date() },
    });
  }
```

- [ ] **Step 4: Correr y ver que pasa**

Run: `cd apps/api && npx jest src/inbox/inbox-reply.spec.ts`
Expected: PASS, 2 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/inbox
git commit -m "feat(inbox): reply to a thread from the dashboard"
```

---

### Task 6: Página Inbox del panel

**Files:**
- Modify: `apps/merchant-dashboard/index.html`
- Modify: `apps/merchant-dashboard/src/dashboard.js`
- Test: `apps/merchant-dashboard/tests/store-settings.spec.mjs`

**Interfaces:**
- Consumes: los tres endpoints de Task 5.
- Produce: la vista `inbox` del panel.

- [ ] **Step 1: Escribir el test que falla**

Añadir a `apps/merchant-dashboard/tests/store-settings.spec.mjs`:

```js
test("the inbox lists threads and sends a reply", async ({ page }) => {
  const requests = await openDashboard(page, [store("store_1", "Primera")], ({ path }) => {
    if (path === "/stores/store_1/inbox") return [{
      id: "thread-1", subject: "¿Llega a Santa Cruz?", customerName: "Ana",
      customerEmail: "ana@gmail.test", unreadForMerchant: true,
      lastMessageAt: "2026-09-21T12:00:00.000Z",
    }];
    if (path === "/stores/store_1/inbox/thread-1") return {
      thread: { id: "thread-1", subject: "¿Llega a Santa Cruz?", customerName: "Ana" },
      messages: [{ id: "m1", direction: "INBOUND", body: "¿Llega a Santa Cruz?", createdAt: "2026-09-21T12:00:00.000Z" }],
    };
    return undefined;
  });

  await navigateDashboard(page, "inbox");
  await expect(page.locator("#inboxSectionBody")).toBeVisible();
  await expect(page.locator("#inboxThreads")).toContainText("Ana");
  await page.locator('#inboxThreads [data-thread-id="thread-1"]').click();
  await expect(page.locator("#inboxMessages")).toContainText("¿Llega a Santa Cruz?");

  await page.locator("#inboxReplyBody").fill("Sí, llega en 3 días.");
  await page.getByRole("button", { name: "Enviar respuesta" }).click();

  const sent = requests.find((entry) => entry.path === "/stores/store_1/inbox/thread-1/reply");
  expect(sent.body).toEqual({ body: "Sí, llega en 3 días." });
});
```

- [ ] **Step 2: Correr y ver que falla**

Run: `cd apps/merchant-dashboard && npx playwright test tests/store-settings.spec.mjs -g "inbox lists threads"`
Expected: FAIL, el enlace de navegación `inbox` no existe.

- [ ] **Step 3: Añadir la vista**

En `apps/merchant-dashboard/index.html`, dentro del grupo `data-nav-group="cobrar"`, antes del enlace de Pagos:

```html
<a class="dashboard-nav-button" href="#dashboard-inbox" data-dashboard-view="inbox"><span class="dashboard-nav-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/></svg></span>Inbox</a>
```

Y la página, antes de `id="paymentsSection"`. Es el único bloque de su `data-dashboard-page`, así que `initDashboardSections` la abrirá:

```html
<section class="block" id="inboxSection" data-dashboard-page="inbox">
  <div class="panel">
    <div class="section-head">
      <div>
        <h2>Inbox</h2>
        <p class="finance-scope-chip" id="inboxScopeLabel">Tienda seleccionada</p>
      </div>
    </div>
    <div class="inbox-layout">
      <ul id="inboxThreads" class="inbox-threads"></ul>
      <div class="inbox-conversation">
        <div id="inboxMessages" class="inbox-messages"></div>
        <form id="inboxReplyForm">
          <label for="inboxReplyBody">Tu respuesta</label>
          <textarea id="inboxReplyBody" maxlength="4000" required></textarea>
          <button class="primary" type="submit">Enviar respuesta</button>
        </form>
      </div>
    </div>
  </div>
</section>
```

En `apps/merchant-dashboard/src/dashboard.js`, añadir a `DASHBOARD_VIEW_COPY`:

```js
inbox: ["Inbox", "Responde a tus compradores y a quien escribió por el formulario de tu tienda."],
```

Y el render, junto a `renderPaymentRows`:

```js
  let inboxThreadId = null;

  async function refreshInbox() {
    if (!currentStoreId) return;
    const threads = await api(`/stores/${currentStoreId}/inbox`);
    document.getElementById("inboxScopeLabel").textContent =
      lastStores.find((store) => store.id === currentStoreId)?.name || "Sin tienda seleccionada";
    document.getElementById("inboxThreads").innerHTML = threads.length
      ? threads.map((thread) => `<li><button type="button" data-thread-id="${esc(thread.id)}" class="${thread.unreadForMerchant ? "is-unread" : ""}"><strong>${esc(thread.customerName || thread.customerEmail)}</strong><span>${esc(thread.subject)}</span></button></li>`).join("")
      : `<li class="muted">Todavía no hay conversaciones.</li>`;
  }

  async function openInboxThread(threadId) {
    inboxThreadId = threadId;
    const { messages } = await api(`/stores/${currentStoreId}/inbox/${threadId}`);
    // Inbound bodies are already plain text; esc() keeps them that way on screen.
    document.getElementById("inboxMessages").innerHTML = messages
      .map((message) => `<article class="inbox-message ${message.direction === "INBOUND" ? "is-from-customer" : "is-from-store"}"><p>${esc(message.body)}</p><time>${esc(new Date(message.createdAt).toLocaleString())}</time></article>`)
      .join("");
  }

  document.getElementById("inboxThreads").addEventListener("click", (event) => {
    const button = event.target.closest("[data-thread-id]");
    if (button) void openInboxThread(button.dataset.threadId);
  });

  document.getElementById("inboxReplyForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const field = document.getElementById("inboxReplyBody");
    await api(`/stores/${currentStoreId}/inbox/${inboxThreadId}/reply`, {
      method: "POST", body: JSON.stringify({ body: field.value }),
    });
    field.value = "";
    await openInboxThread(inboxThreadId);
  });
```

Llamar `void refreshInbox();` desde `refresh()`, junto a `renderPaymentRows()`.

- [ ] **Step 4: Correr y ver que pasa**

Run: `cd apps/merchant-dashboard && npx playwright test tests/store-settings.spec.mjs -g "inbox lists threads"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/merchant-dashboard/index.html apps/merchant-dashboard/src/dashboard.js apps/merchant-dashboard/tests/store-settings.spec.mjs
git commit -m "feat(inbox): read and answer conversations from the dashboard"
```
