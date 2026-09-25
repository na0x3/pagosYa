/* eslint-disable @typescript-eslint/no-explicit-any */
// Test-only: shared by the business-documents specs (D0 and D1).

/**
 * A small in-memory stand-in for the Prisma calls the service makes, with the
 * schema's unique constraints, so versioning, numbering and once-only events
 * are tested as behaviour rather than as call shapes.
 */
export type Row = Record<string, any>;
export const unique = () => Object.assign(new Error("Unique constraint failed"), { code: "P2002" });
let seq = 0;
export const id = (prefix: string) => `c${prefix}${String(++seq).padStart(22, "0")}`;

export function matches(row: Row, where: Row = {}): boolean {
  return Object.entries(where).every(([key, condition]) => {
    if (key === "OR") return (condition as Row[]).some((branch) => matches(row, branch));
    if (key === "AND") return (condition as Row[]).every((branch) => matches(row, branch));
    if (condition && typeof condition === "object" && !(condition instanceof Date)) {
      const value = row[key];
      const checks: boolean[] = [];
      if ("in" in condition) checks.push(condition.in.includes(value));
      if ("notIn" in condition) checks.push(!condition.notIn.includes(value));
      if ("not" in condition) checks.push((value ?? null) !== (condition.not ?? null));
      if ("lt" in condition) checks.push(value != null && value < condition.lt);
      if ("lte" in condition) checks.push(value != null && value <= condition.lte);
      if ("gt" in condition) checks.push(value != null && value > condition.gt);
      if ("gte" in condition) checks.push(value != null && value >= condition.gte);
      if ("contains" in condition) checks.push(typeof value === "string" && value.toLowerCase().includes(String(condition.contains).toLowerCase()));
      if ("equals" in condition && "path" in condition) checks.push((value ?? {})[condition.path[0]] === condition.equals);
      if (checks.length) return checks.every(Boolean);
    }
    return (row[key] ?? null) === (condition ?? null);
  });
}

export class FakePrisma {
  stores: Row[] = [];
  customers: Row[] = [];
  paymentLinks: Row[] = [];
  documents: Row[] = [];
  items: Row[] = [];
  versions: Row[] = [];
  events: Row[] = [];

  private withIncludes(doc: Row, include: Row = {}) {
    const result: Row = { ...doc };
    if (include.items) result.items = this.items.filter((item) => item.documentId === doc.id).sort((a, b) => a.position - b.position);
    if (include.versions) result.versions = this.versions.filter((v) => v.documentId === doc.id).sort((a, b) => a.version - b.version);
    if (include.events) result.events = this.events.filter((e) => e.documentId === doc.id && matches(e, include.events.where ?? {}));
    return result;
  }

  private saveDocument(doc: Row) {
    if (doc.number != null && this.documents.some((other) => other.id !== doc.id && other.storeId === doc.storeId && other.kind === doc.kind && other.number === doc.number)) throw unique();
  }

  store = {
    findFirst: async ({ where }: Row) => this.stores.find((store) => matches(store, where)) ?? null,
    findUnique: async ({ where }: Row) => this.stores.find((store) => store.id === where.id) ?? null,
  };
  businessCustomer = {
    findFirst: async ({ where }: Row) => this.customers.find((row) => matches(row, where)) ?? null,
    findMany: async ({ where, take }: Row) => this.customers.filter((row) => matches(row, where)).slice(0, take ?? undefined),
  };
  merchants: Row[] = [];
  merchant = { findUnique: async ({ where }: Row) => this.merchants.find((row) => row.id === where.id) ?? null };
  paymentLink = {
    count: async ({ where }: Row) => this.paymentLinks.filter((row) => matches(row, where)).length,
    findMany: async ({ where, take }: Row) => this.paymentLinks.filter((row) => matches(row, where)).slice(0, take ?? undefined),
  };
  categories: Row[] = [];
  category = { findMany: async ({ where, take }: Row) => this.categories.filter((row) => matches(row, where)).slice(0, take ?? undefined) };
  businessDocument = {
    create: async ({ data }: Row) => {
      const { items, events, ...fields } = data;
      const doc = { id: id("doc"), number: null, status: "DRAFT", currency: "BOB", customerName: null, customerEmail: null, customerPhone: null, customerDocument: null, businessCustomerId: null, dueAt: null, validUntil: null, currentVersion: 0, sentAt: null, viewedAt: null, voidedAt: null, paidAt: null, paymentIntentId: null, autoReminders: true, createdAt: new Date(), updatedAt: new Date(), content: [], ...fields };
      this.documents.push(doc);
      (items?.create ?? []).forEach((item: Row) => this.items.push({ id: id("item"), documentId: doc.id, paymentLinkId: null, ...item }));
      (events?.create ?? []).forEach((event: Row) => this.events.push({ id: id("evt"), documentId: doc.id, at: new Date(), dedupeKey: null, ...event }));
      return { ...doc };
    },
    findFirst: async ({ where, include }: Row) => {
      const doc = this.documents.find((row) => matches(row, where));
      return doc ? this.withIncludes(doc, include) : null;
    },
    findUnique: async ({ where, include }: Row) => {
      const doc = this.documents.find((row) => row.id === where.id);
      return doc ? this.withIncludes(doc, include) : null;
    },
    findMany: async ({ where, include, take, orderBy, cursor, skip }: Row) => {
      let rows = this.documents.filter((row) => matches(row, where));
      // Newest first, ties broken by id (ids grow with creation), like the service's orderBy.
      if (orderBy) rows = [...rows].sort((a, b) => (b.createdAt - a.createdAt) || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0));
      if (cursor) rows = rows.slice(Math.max(0, rows.findIndex((row) => row.id === cursor.id)) + (skip ?? 0));
      return rows.slice(0, take ?? undefined).map((doc) => this.withIncludes(doc, include));
    },
    count: async ({ where }: Row) => this.documents.filter((row) => matches(row, where)).length,
    groupBy: async ({ by, where, _count, _sum }: Row) => {
      const groups = new Map<string, Row[]>();
      for (const row of this.documents.filter((candidate) => matches(candidate, where))) {
        const key = JSON.stringify((by as string[]).map((field) => row[field]));
        groups.set(key, [...(groups.get(key) ?? []), row]);
      }
      return [...groups.entries()].map(([key, rows]) => ({
        ...Object.fromEntries((by as string[]).map((field, index) => [field, JSON.parse(key)[index]])),
        ...(_count && { _count: { _all: rows.length } }),
        ...(_sum && { _sum: Object.fromEntries(Object.keys(_sum).map((field) => [field, rows.reduce((total, row) => total + (row[field] ?? 0), 0)])) }),
      }));
    },
    update: async ({ where, data }: Row) => {
      const doc = this.documents.find((row) => row.id === where.id)!;
      const next = { ...doc, ...data, updatedAt: new Date() };
      this.saveDocument(next);
      Object.assign(doc, next);
      return { ...doc };
    },
    updateMany: async ({ where, data }: Row) => {
      const rows = this.documents.filter((row) => matches(row, where));
      rows.forEach((row) => this.saveDocument({ ...row, ...data }));
      rows.forEach((row) => Object.assign(row, data));
      return { count: rows.length };
    },
    delete: async ({ where }: Row) => {
      this.documents = this.documents.filter((row) => row.id !== where.id);
      this.items = this.items.filter((row) => row.documentId !== where.id);
      this.events = this.events.filter((row) => row.documentId !== where.id);
    },
    aggregate: async ({ where }: Row) => ({ _max: { number: Math.max(0, ...this.documents.filter((row) => matches(row, where)).map((row) => row.number ?? 0)) || null } }),
  };
  businessDocumentItem = {
    findMany: async ({ where }: Row) => this.items.filter((row) => matches(row, where)).sort((a, b) => a.position - b.position),
    deleteMany: async ({ where }: Row) => { this.items = this.items.filter((row) => row.documentId !== where.documentId); },
    createMany: async ({ data }: Row) => { data.forEach((item: Row) => this.items.push({ id: id("item"), paymentLinkId: null, ...item })); },
  };
  businessDocumentVersion = {
    findUnique: async ({ where }: Row) => this.versions.find((v) => v.documentId === where.documentId_version.documentId && v.version === where.documentId_version.version) ?? null,
    create: async ({ data }: Row) => {
      if (this.versions.some((v) => v.documentId === data.documentId && v.version === data.version)) throw unique();
      const version = { id: id("ver"), createdAt: new Date(), ...data };
      this.versions.push(version);
      return version;
    },
  };
  businessDocumentEvent = {
    createMany: async ({ data, skipDuplicates }: Row) => {
      let count = 0;
      for (const row of data as Row[]) {
        const duplicate = row.dedupeKey && this.events.some((e) => e.documentId === row.documentId && e.dedupeKey === row.dedupeKey);
        if (duplicate && !skipDuplicates) throw unique();
        if (duplicate) continue;
        this.events.push({ id: id("evt"), at: new Date(), dedupeKey: null, ipAddress: null, userAgent: null, ...row });
        count += 1;
      }
      return { count };
    },
    findMany: async ({ where: { document, ...where } }: Row) => this.events.filter((event) => matches(event, where)
      && (!document || matches(this.documents.find((doc) => doc.id === event.documentId) ?? {}, document))),
    findFirst: async ({ where: { document, ...where }, orderBy }: Row) => {
      const rows = this.events.filter((event) => matches(event, where)
        && (!document || matches(this.documents.find((doc) => doc.id === event.documentId) ?? {}, document)));
      if (orderBy?.at === "desc") rows.sort((a, b) => b.at - a.at);
      return rows[0] ?? null;
    },
    create: async ({ data }: Row) => {
      if (data.dedupeKey && this.events.some((e) => e.documentId === data.documentId && e.dedupeKey === data.dedupeKey)) throw unique();
      const event = { id: id("evt"), at: new Date(), dedupeKey: null, ipAddress: null, userAgent: null, ...data };
      this.events.push(event);
      return event;
    },
    count: async ({ where }: Row) => this.events.filter((event) =>
      (where.type === undefined || (typeof where.type === "string" ? event.type === where.type : where.type.in.includes(event.type)))
      && (!where.documentId || event.documentId === where.documentId)
      && (!where.data?.path || (event.data ?? {})[where.data.path[0]] === where.data.equals)
      && (!where.at?.gte || event.at >= where.at.gte)
      && (!where.document?.storeId || this.documents.find((doc) => doc.id === event.documentId)?.storeId === where.document.storeId)).length,
  };
  paymentIntents: Row[] = [];
  paymentIntent = {
    findUnique: async ({ where }: Row) => this.paymentIntents.find((row) => row.id === where.id) ?? null,
    findMany: async ({ where, take }: Row) => this.paymentIntents.filter((row) => matches(row, where)).slice(0, take ?? undefined),
    update: async ({ where, data }: Row) => {
      const row = this.paymentIntents.find((candidate) => candidate.id === where.id)!;
      Object.assign(row, data);
      return { ...row };
    },
    updateMany: async ({ where, data }: Row) => {
      const rows = this.paymentIntents.filter((row) => matches(row, where));
      rows.forEach((row) => Object.assign(row, data));
      return { count: rows.length };
    },
  };
  inboxThreads: Row[] = [];
  inboxMessages: Row[] = [];
  storeInboxThread = {
    findFirst: async ({ where }: Row) => this.inboxThreads.find((row) => matches(row, where)) ?? null,
    create: async ({ data }: Row) => {
      const row = { id: id("thr"), status: "OPEN", unreadForMerchant: true, lastMessageAt: new Date(), createdAt: new Date(), leadId: null, orderId: null, ...data };
      this.inboxThreads.push(row);
      return { ...row };
    },
    update: async ({ where, data }: Row) => {
      const row = this.inboxThreads.find((candidate) => candidate.id === where.id)!;
      Object.assign(row, data);
      return { ...row };
    },
  };
  storeInboxMessage = {
    create: async ({ data }: Row) => {
      if (data.messageId && this.inboxMessages.some((row) => row.messageId === data.messageId)) throw unique();
      const row = { id: id("msg"), createdAt: new Date(), ...data };
      this.inboxMessages.push(row);
      return { ...row };
    },
  };
  /** Raw SQL the service ran (the row locks), as text. */
  rawQueries: string[] = [];
  /** PaymentIntent rows another transaction holds (a checkout being confirmed or captured). */
  lockedIntents = new Set<string>();
  /** Runs when a PaymentIntent row lock is taken: lets a test commit a change "just before" it. */
  onIntentLock?: (intentId: string) => void;
  $queryRaw = async (strings: TemplateStringsArray | { strings?: string[] }, ...values: unknown[]) => {
    const sql = Array.isArray(strings) ? strings.join("?") : String((strings as { strings?: string[] }).strings?.join("?") ?? strings);
    this.rawQueries.push(sql);
    if (/"PaymentIntent"/.test(sql) && /SKIP LOCKED|NOWAIT/.test(sql)) {
      const intentId = String(values[0]);
      this.onIntentLock?.(intentId);
      const row = this.paymentIntents.find((candidate) => candidate.id === intentId);
      return row && !this.lockedIntents.has(intentId) ? [{ id: intentId }] : [];
    }
    return [];
  };
  $transaction = async (fn: (tx: this) => Promise<unknown>) => fn(this);
}

