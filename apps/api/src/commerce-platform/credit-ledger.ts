import { BadRequestException } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
export function creditHash(code: string) { return createHash('sha256').update(code.replace(/[-\s]/g, '').toUpperCase()).digest('hex'); }
export async function creditQuote(tx: Pick<Prisma.TransactionClient, 'storeCredit'>, storeId: string, code: string, currency: string, total: number) {
  const credit = await tx.storeCredit.findFirst({ where: { storeId, codeHash: creditHash(code), active: true } });
  if (!credit || credit.currency !== currency || credit.expiresAt && credit.expiresAt <= new Date() || credit.balance <= 0) throw new BadRequestException('El código de saldo no está disponible para este pedido.');
  return { credit, amount: Math.min(total, credit.balance) };
}
export async function reserveCredit(tx: Prisma.TransactionClient, paymentIntentId: string, storeId: string, code: string, currency: string, total: number) {
  await tx.$queryRaw`SELECT id FROM "StoreCredit" WHERE "storeId" = ${storeId} AND "codeHash" = ${creditHash(code)} FOR UPDATE`;
  const quote = await creditQuote(tx, storeId, code, currency, total);
  await tx.storeCredit.update({ where: { id: quote.credit.id }, data: { balance: { decrement: quote.amount } } });
  await tx.storeCreditReservation.create({ data: { paymentIntentId, creditId: quote.credit.id, amount: quote.amount } });
  await tx.storeCreditEntry.create({ data: { creditId: quote.credit.id, reference: `reserve:${paymentIntentId}`, delta: -quote.amount, kind: 'RESERVE' } });
  return quote.amount;
}
export async function finishCredit(tx: Prisma.TransactionClient, paymentIntentId: string, success: boolean) {
  const reservation = await tx.storeCreditReservation.findUnique({ where: { paymentIntentId } });
  if (!reservation || reservation.status !== 'RESERVED') return;
  const result = await tx.storeCreditReservation.updateMany({ where: { paymentIntentId, status: 'RESERVED' }, data: { status: success ? 'COMMITTED' : 'RELEASED' } });
  if (!result.count) return;
  if (!success) await tx.storeCredit.update({ where: { id: reservation.creditId }, data: { balance: { increment: reservation.amount } } });
  await tx.storeCreditEntry.create({ data: { creditId: reservation.creditId, reference: `${success ? 'commit' : 'release'}:${paymentIntentId}:${randomUUID()}`, delta: success ? 0 : reservation.amount, kind: success ? 'COMMIT' : 'RELEASE' } });
}
export async function refundCredit(tx: Prisma.TransactionClient, paymentIntentId: string, amount: number, reference: string) {
  await tx.$queryRaw`SELECT "paymentIntentId" FROM "StoreCreditReservation" WHERE "paymentIntentId" = ${paymentIntentId} FOR UPDATE`;
  reference = `${reference}:${paymentIntentId}`;
  const prior = await tx.storeCreditEntry.findUnique({ where: { reference } });
  if (prior) { if (prior.delta !== amount) throw new BadRequestException('La referencia ya se usó para otro importe.'); return prior; }
  const r = await tx.storeCreditReservation.findUnique({ where: { paymentIntentId } });
  if (!r || r.status !== 'COMMITTED' || amount > r.amount - r.refundedAmount || amount <= 0) throw new BadRequestException('El reembolso supera el saldo aplicado al pedido.');
  await tx.storeCreditReservation.update({ where: { paymentIntentId }, data: { refundedAmount: { increment: amount } } });
  await tx.storeCredit.update({ where: { id: r.creditId }, data: { balance: { increment: amount } } });
  return tx.storeCreditEntry.create({ data: { creditId: r.creditId, reference, delta: amount, kind: 'REFUND' } });
}

/** Retrying a failed rail payment must reacquire the exact credit amount first. */
export async function ensureCreditReservation(tx: Prisma.TransactionClient, paymentIntentId: string) {
  const reservation = await tx.storeCreditReservation.findUnique({ where: { paymentIntentId } });
  if (!reservation) throw new BadRequestException('El pedido no tiene una reserva de saldo.');
  if (reservation.status === 'RESERVED') return;
  if (reservation.status !== 'RELEASED') throw new BadRequestException('Este saldo ya fue utilizado.');
  await tx.$queryRaw`SELECT id FROM "StoreCredit" WHERE id = ${reservation.creditId} FOR UPDATE`;
  const credit = await tx.storeCredit.findUniqueOrThrow({ where: { id: reservation.creditId } });
  if (!credit.active || credit.expiresAt && credit.expiresAt <= new Date() || credit.balance < reservation.amount) throw new BadRequestException('El saldo cambió. Vuelve a preparar tu pedido.');
  await tx.storeCredit.update({ where: { id: credit.id }, data: { balance: { decrement: reservation.amount } } });
  await tx.storeCreditReservation.update({ where: { paymentIntentId }, data: { status: 'RESERVED' } });
  await tx.storeCreditEntry.create({ data: { creditId: credit.id, reference: `retry:${paymentIntentId}:${randomUUID()}`, delta: -reservation.amount, kind: 'RESERVE' } });
}
