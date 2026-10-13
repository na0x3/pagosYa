/**
 * The plain-text emails a store can switch on, edited in Correos y marketing › Correos. The buyer's
 * order confirmation is NOT one of them: since 2026-10-13 it is always the store's designed receipt
 * (PaymentIntentsService.sendReceiptEmail). A `templates.ORDER_CONFIRMATION` saved before then stays
 * in the store's JSON and is ignored.
 */
export const EMAIL_TEMPLATES = [
    { id: 'REFUND', name: 'Confirmación de reembolso', group: 'transactional', trigger: 'Cuando se confirma un reembolso', subject: 'Reembolso confirmado · {{store}}', body: 'Hola {{customer}}, se confirmó un reembolso de {{amount}} para tu pedido {{order}}.', supported: true },
    { id: 'SHIPPED', name: 'Pedido enviado', group: 'transactional', trigger: 'Al marcar el pedido como enviado', subject: 'Tu pedido está en camino · {{store}}', body: 'Hola {{customer}}, tu pedido {{order}} ya fue enviado.', supported: true },
    { id: 'WELCOME', name: 'Bienvenida a la comunidad', group: 'transactional', trigger: 'Cuando el cliente se suscribe a la comunidad', subject: '¡Bienvenido a {{store}}!', body: 'Gracias por unirte a nuestra comunidad.', supported: true },
    { id: 'CANCELED', name: 'Pedido cancelado', group: 'transactional', trigger: 'Al cancelar el pedido', subject: 'Pedido {{order}} cancelado · {{store}}', body: 'Hola {{customer}}, tu pedido {{order}} fue cancelado.', supported: true },
    { id: 'DELIVERED', name: 'Pedido entregado', group: 'transactional', trigger: 'Al marcar el pedido como entregado', subject: 'Pedido entregado · {{store}}', body: 'Hola {{customer}}, tu pedido {{order}} fue entregado. Gracias por elegirnos.', supported: true },
    { id: 'GIFT_CARD', name: 'Entrega de tarjeta de regalo', group: 'transactional', trigger: 'Al emitir una tarjeta con correo de destinatario', subject: 'Tienes un regalo de {{store}}', body: 'Hola {{customer}}, recibiste una tarjeta de regalo de {{amount}} para comprar en {{store}}.', supported: true },
    { id: 'SUBSCRIPTION_FAILED', name: 'Pago de suscripción fallido', group: 'transactional', trigger: 'Cuando falla el cobro de una renovación', subject: 'Revisa tu suscripción · {{store}}', body: 'Hola {{customer}}, no se pudo completar el pago de tu suscripción. Revisa tus datos de pago.', supported: true },
    { id: 'SUBSCRIPTION_SKIPPED', name: 'Entrega de suscripción omitida', group: 'transactional', trigger: 'Requiere programación de entregas de suscripción', subject: 'Actualización de tu suscripción · {{store}}', body: 'La próxima entrega de tu suscripción necesita atención.', supported: false },
    { id: 'RECOVERY', name: 'Carrito abandonado', group: 'marketing', trigger: 'Después del tiempo de espera configurado', subject: 'Tu carrito te espera · {{store}}', body: 'Puedes volver para completar tu compra.', supported: true },
    { id: 'REVIEW_REQUEST', name: 'Solicitud de reseña', group: 'marketing', trigger: '24 horas después de la entrega', subject: '¿Cómo estuvo tu compra en {{store}}?', body: 'Cuéntanos cómo fue tu experiencia.', supported: true },
] as const;
export type WorkspaceMail = {
    templates: Record<string, {
        enabled: boolean;
        subject: string;
        body: string;
        enabledAt?: string;
    }>;
    staff: {
        enabled: boolean;
        recipients: Array<{
            email: string;
            events: string[];
        }>;
        enabledAt?: string;
    };
    domain?: {
        id: string;
        name: string;
        senderName: string;
        status: string;
        records: unknown[];
    };
    startedAt?: string;
};
export function workspaceMail(settings: any): WorkspaceMail {
    const value = settings?.emailWorkspace || {};
    return { templates: value.templates || {}, staff: value.staff || { enabled: false, recipients: [] }, domain: value.domain, startedAt: value.startedAt };
}
export function renderEmailText(text: string, values: Record<string, string>) { return text.replace(/\{\{(store|order|customer|amount)\}\}/g, (_, key) => values[key] || ''); }
export function workspaceSender(settings: any) { const domain = workspaceMail(settings).domain; return domain?.status === 'verified' ? `${domain.senderName.replace(/[<>\r\n]/g, '')} <notificaciones@${domain.name}>` : undefined; }
/** The outbox dedupe key for a workspace mail: one row per store, kind, source and recipient. */
export function workspaceDedupeKey(storeId: string, kind: string, sourceId: string, recipient: string) {
    return `workspace:${storeId}:${kind}:${sourceId}:${recipient.toLowerCase()}`;
}
/**
 * The RFC 5322 Message-ID the order receipt is sent with, without angle brackets.
 *
 * A PURE FUNCTION of (storeId, paymentIntentId) on purpose: a retried confirm() recomputes the very
 * same id, which is what the unique index on StoreInboxMessage.messageId wants, and a buyer's reply
 * quoting it resolves to the order's thread (InboxService.resolveInboundThread). The format is the one
 * the plain-text receipt used until 2026-10-13, so replies to receipts sent before then still thread.
 */
export function receiptMessageId(storeId: string, sourceId: string) {
    return `receipt.${storeId}.${sourceId}@pagosya`;
}
/** Transaction-local outbox insertion. An unrelated storefront's settings are never used. */
export async function queueStoreEmail(db: any, storeId: string, key: string, sourceId: string, email: string | null, values: Record<string, string>, buyer?: { email?: string | null; name?: string | null }) {
    if (!storeId || !db.storeRetention?.findUnique)
        return false;
    const row = await db.storeRetention.findUnique({ where: { storeId } }), mail = workspaceMail(row?.settings), template = mail.templates[key];
    const store = db.store?.findUnique ? await db.store.findUnique({ where: { id: storeId }, select: { name: true } }) : null;
    values = { ...values, store: store?.name || values.store };
    const enqueue = async (recipient: string, kind: string, subject: string, body: string, replyTo?: string) => db.storeEmailDelivery.upsert({ where: { dedupeKey: workspaceDedupeKey(storeId, kind, sourceId, recipient) }, create: { storeId, email: recipient.toLowerCase(), kind, sourceId, subject, body, replyTo: replyTo || null, messageIdHeader: null, dedupeKey: workspaceDedupeKey(storeId, kind, sourceId, recipient) }, update: {} });
    let queued = false;
    // Only a template the workspace still offers reaches a buyer. ORDER_CONFIRMATION is called for its
    // team notice alone; the order's inbound Reply-To and Message-ID now travel on the designed receipt.
    if (email && template?.enabled && EMAIL_TEMPLATES.some(item => item.id === key)) {
        await enqueue(email, `WORKSPACE_${key}`, renderEmailText(template.subject, values), renderEmailText(template.body, values) + (values.details ? '\n\n' + values.details : ''));
        queued = true;
    }
    // The team's notices are decided on their own, never by the buyer's template: NEW_ORDER keeps going
    // out although ORDER_CONFIRMATION no longer sends anything to the buyer.
    const staffEvent = key === 'ORDER_CONFIRMATION' ? 'NEW_ORDER' : key === 'REFUND' ? 'REFUND' : null;
    if (staffEvent && mail.staff.enabled)
        for (const recipient of mail.staff.recipients.filter(item => item.events.includes(staffEvent)))
            // Reply on this notification must reach the buyer, not the void:
            // that is the whole answer-from-your-inbox flow.
            await enqueue(recipient.email, `STAFF_${staffEvent}`, `${staffEvent === 'NEW_ORDER' ? 'Nuevo pedido' : 'Reembolso'} · ${values.store}`, `Pedido: ${values.order}\nImporte: ${values.amount}${buyer?.name ? `\nComprador: ${buyer.name}` : ''}${buyer?.email ? `\nCorreo: ${buyer.email}\n\nResponde a este mensaje para escribirle directamente.` : ''}\n\nRevisa los detalles en el panel de tu tienda.`, buyer?.email || undefined);
    return queued;
}
