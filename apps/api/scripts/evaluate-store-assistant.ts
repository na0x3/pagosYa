/**
 * Store assistant quality eval (spec 2026-10-13-store-assistant-design §5).
 * npx ts-node --transpile-only scripts/evaluate-store-assistant.ts --store <id> --suite scripts/fixtures/store-assistant-suite.json [--record <dir> | --replay <dir>] [--i-accept-costs]
 * Live runs call the model; --replay runs offline from a recording. The preview conversations it creates are deleted at the end.
 */
import 'reflect-metadata';
import { readFileSync } from 'node:fs';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { createModelTape, installModelTape } from '../src/storefront-source/evaluation-tape';
import { foldText } from '../src/store-assistant/assistant-text';
import { StoreAssistantService } from '../src/store-assistant/store-assistant.service';

type Case = { id: string; question: string; mustInclude: string[]; mustNotInclude: string[]; expectHandoff?: boolean };
type Row = { id: string; correct: boolean; guarded: boolean; handoff: boolean; reply: string };
const arg = (name: string) => { const i = process.argv.indexOf(`--${name}`); return i >= 0 ? process.argv[i + 1] : undefined; };

async function main() {
  const storeId = arg('store'), suitePath = arg('suite'), record = arg('record'), replay = arg('replay');
  if (!storeId || !suitePath) throw new Error('Usa --store <id> --suite <archivo>.');
  if (record && replay) throw new Error('Usa --record o --replay, no los dos.');
  if (!replay && !process.argv.includes('--i-accept-costs')) throw new Error('Una corrida en vivo usa el modelo: agrega --i-accept-costs.');
  const suite: Case[] = JSON.parse(readFileSync(suitePath, 'utf8'));
  const tape = record ? createModelTape('record', record) : replay ? createModelTape('replay', replay) : null;
  const restore = tape ? installModelTape(tape) : () => {};
  const rows: Row[] = [];
  const created: string[] = [];
  let app: Awaited<ReturnType<typeof NestFactory.createApplicationContext>> | null = null;
  let prisma: PrismaService | null = null;
  try {
    app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
    const db = app.get(PrismaService);
    prisma = db;
    const chat = app.get(StoreAssistantService);
    const store = await chat.loadTurnStore(storeId);
    const assistant = await db.storeAssistant.findUnique({ where: { storeId } });
    if (!store || !assistant) throw new Error('La tienda no existe o no tiene el asistente configurado.');
    for (const c of suite) {
      tape?.startCase(c.id, 1);
      let result;
      try {
        result = await chat.converse({ store, assistant, conversation: null, message: c.question, ipHash: 'eval', preview: true, now: new Date() });
      } finally {
        tape?.finishCase();
      }
      if (result.conversationId) created.push(result.conversationId);
      const reply = result.reply ?? { text: '', blocks: [] };
      const seen = foldText([reply.text, ...reply.blocks.flatMap((b) => b.type === 'products' ? b.items.map((i) => `${i.name} ${i.price}`) : [])].join(' '));
      const guarded = reply.text.startsWith('Te muestro el producto') || reply.text.startsWith('Prefiero no darte');
      const handoff = reply.blocks.some((b) => b.type === 'handoff');
      const correct = c.mustInclude.every((s) => seen.includes(foldText(s))) && !c.mustNotInclude.some((s) => seen.includes(foldText(s))) && (!c.expectHandoff || handoff);
      rows.push({ id: c.id, correct, guarded, handoff, reply: reply.text.slice(0, 80) });
    }
  } finally {
    // Preview conversations are removed even when a case throws; the tape is always put back.
    restore();
    if (prisma && created.length) await prisma.assistantConversation.deleteMany({ where: { id: { in: created } } });
  }
  console.table(rows);
  const factual = rows.filter((r) => !suite.find((c) => c.id === r.id)!.expectHandoff);
  const share = factual.filter((r) => r.correct).length / Math.max(1, factual.length);
  const handoffOk = suite.filter((c) => c.expectHandoff).every((c) => rows.find((r) => r.id === c.id)!.handoff);
  console.log(`correctas ${(share * 100).toFixed(0)}% (meta ≥ 90%), intentos de inventar bloqueados ${rows.filter((r) => r.guarded).length}, pases a la tienda ${handoffOk ? 'ok' : 'FALLAN'}`);
  await app?.close();
  process.exit(share >= 0.9 && handoffOk ? 0 : 1);
}

main().catch((error) => { console.error((error as Error).message); process.exit(1); });
