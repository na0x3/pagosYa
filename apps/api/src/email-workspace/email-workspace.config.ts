export const EMAIL_TEMPLATES = [
    { id: 'ORDER_CONFIRMATION', name: 'Confirmación de pedido', group: 'transactional', trigger: 'Después de confirmar el pago', subject: 'Pedido {{order}} confirmado · {{store}}', body: 'Hola {{customer}}, tu pago de {{amount}} fue confirmado. Gracias por comprar en {{store}}.', supported: true },
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
/** The outbox dedupe key for a workspace mail. Exported because the inbox has to
 * find the receipt row again after the payment transaction commits, and two
 * hand-built copies of this string would drift the first time it changed. */
export function workspaceDedupeKey(storeId: string, kind: string, sourceId: string, recipient: string) {
    return `workspace:${storeId}:${kind}:${sourceId}:${recipient.toLowerCase()}`;
}
/**
 * The RFC 5322 Message-ID the order receipt is sent with, without angle brackets.
 *
 * A PURE FUNCTION of values both sides already hold, on purpose. The receipt is
 * queued inside the payment's $transaction; the inbox thread is opened after
 * that transaction commits (see payment-intents.service.ts, which explains at
 * length why it must not move back inside). So the two halves cannot pass a
 * generated id to each other without plumbing a value across that boundary.
 * Deriving it from (storeId, sourceId) instead means each side computes the
 * same string independently, and a retried confirm() recomputes the very same
 * one — which is exactly what the unique index on StoreInboxMessage.messageId
 * and the outbox dedupe key both want.
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
    const enqueue = async (recipient: string, kind: string, subject: string, body: string, replyTo?: string, messageIdHeader?: string) => db.storeEmailDelivery.upsert({ where: { dedupeKey: workspaceDedupeKey(storeId, kind, sourceId, recipient) }, create: { storeId, email: recipient.toLowerCase(), kind, sourceId, subject, body, replyTo: replyTo || null, messageIdHeader: messageIdHeader || null, dedupeKey: workspaceDedupeKey(storeId, kind, sourceId, recipient) }, update: {} });
    let queued = false;
    if (email && template?.enabled) {
        // The buyer's receipt is the ONLY thing most order threads ever contain,
        // so it is the message their reply answers. Sent with Reply-To on the
        // store's inbound address it comes back to us and lands in that thread;
        // sent without, it goes to the merchant's personal mailbox and the
        // thread this order opened stays empty forever. Same two fields the
        // dashboard's own reply sets — one path, not two.
        //
        // Only when the domain is verified. Without it there is no inbound
        // address to name and no inbox to receive anything, so the receipt must
        // keep behaving exactly as it did before.
        const inbound = mail.domain?.status === 'verified'
            ? { replyTo: `hola@inbound.${mail.domain.name}`, messageIdHeader: receiptMessageId(storeId, sourceId) }
            : { replyTo: undefined, messageIdHeader: undefined };
        await enqueue(email, `WORKSPACE_${key}`, renderEmailText(template.subject, values), renderEmailText(template.body, values) + (values.details ? '\n\n' + values.details : ''), key === 'ORDER_CONFIRMATION' ? inbound.replyTo : undefined, key === 'ORDER_CONFIRMATION' ? inbound.messageIdHeader : undefined);
        queued = true;
    }
    const staffEvent = key === 'ORDER_CONFIRMATION' ? 'NEW_ORDER' : key === 'REFUND' ? 'REFUND' : null;
    if (staffEvent && mail.staff.enabled)
        for (const recipient of mail.staff.recipients.filter(item => item.events.includes(staffEvent)))
            // Reply on this notification must reach the buyer, not the void:
            // that is the whole answer-from-your-inbox flow.
            await enqueue(recipient.email, `STAFF_${staffEvent}`, `${staffEvent === 'NEW_ORDER' ? 'Nuevo pedido' : 'Reembolso'} · ${values.store}`, `Pedido: ${values.order}\nImporte: ${values.amount}${buyer?.name ? `\nComprador: ${buyer.name}` : ''}${buyer?.email ? `\nCorreo: ${buyer.email}\n\nResponde a este mensaje para escribirle directamente.` : ''}\n\nRevisa los detalles en el panel de tu tienda.`, buyer?.email || undefined);
    return queued;
}
