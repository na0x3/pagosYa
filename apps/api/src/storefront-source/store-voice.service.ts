import { BadGatewayException, BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SourceProjectsService } from './source-projects.service';
import { SourceGenerationService } from './source-generation.service';
import type { GenerateSourceProjectDto } from './dto/generate-source-project.dto';
import type { SourceProjectSnapshot } from './source-project';
import { ASSUMED_REMOVAL_MAX_CREDITS, assumedFactsView, assumedRemovalInstruction, cleanFactText, withAssumedEdit, withAssumedStatus, type AssumedFactView } from './assumed-facts';
import { pendingAssumptions, readVoice, VOICE_FILE, VOICE_ID } from './store-voice';

const GONE = 'Ese dato ya no está en la tienda. Recarga la revisión.';

/** «Datos que YAPI supuso» (spec 2026-10-14 store voice, part 5): the list, the three actions and the Mi tienda counts. */
@Injectable()
export class StoreVoiceService {
  constructor(private readonly prisma: PrismaService, private readonly projects: SourceProjectsService, private readonly generation: SourceGenerationService) {}

  private checkId(id: string) {
    if (!VOICE_ID.test(id)) throw new BadRequestException('Ese dato no existe.');
  }
  /** The revision being changed, only while it is still the store's current one. */
  private async current(merchantId: string, storeId: string, revision: number): Promise<SourceProjectSnapshot> {
    const current = await this.projects.current(merchantId, storeId);
    if (current.revision !== revision) throw new ConflictException('El proyecto cambió. Recarga la revisión antes de cambiar este dato.');
    return (await this.projects.version(merchantId, storeId, revision)).snapshot as unknown as SourceProjectSnapshot;
  }

  async list(merchantId: string, storeId: string, revision: number): Promise<{ revision: number; facts: AssumedFactView[] }> {
    if (!revision) return { revision, facts: [] };
    const version = await this.projects.version(merchantId, storeId, revision);
    return { revision, facts: assumedFactsView((version.snapshot as unknown as SourceProjectSnapshot).files) };
  }

  /** Confirmar: the fact stays as written, now the merchant's; the next YAPI save moves it to the specifics. No model call. */
  async confirm(merchantId: string, storeId: string, id: string, revision: number) {
    this.checkId(id);
    const snapshot = await this.current(merchantId, storeId, revision);
    const files = withAssumedStatus(snapshot.files, id, 'confirmed');
    if (!files) throw new NotFoundException(GONE);
    return this.projects.save(merchantId, storeId, { revision, label: 'Dato confirmado', brief: snapshot.brief, files });
  }

  /** Editar: every marked copy replaced with the merchant's text in a normal save, and the fact confirmed. No model call. */
  async edit(merchantId: string, storeId: string, id: string, revision: number, text: string) {
    this.checkId(id);
    const clean = cleanFactText(text);
    if (!clean) throw new BadRequestException('Escribe el dato en una línea, sin < ni >, de hasta 160 caracteres.');
    const snapshot = await this.current(merchantId, storeId, revision);
    // Where the old text is stated without the mark: Editar never touches it, it reports it (spec review focus 2).
    const unwrapped = assumedFactsView(snapshot.files).find(fact => fact.id === id)?.unwrapped ?? [];
    const edited = withAssumedEdit(snapshot.files, id, clean);
    if (!edited) throw new NotFoundException(GONE);
    const saved = await this.projects.save(merchantId, storeId, { revision, label: 'Dato corregido', brief: snapshot.brief, files: edited.files });
    return { ...saved, replaced: edited.replaced, unwrapped };
  }

  /** Quitar: a short YAPI edit (the local chat edit path) rewrites each sentence that used the fact; the save drops the entry once
   *  no page marks it (voiceForSave). `removed` says whether that happened. */
  async remove(merchantId: string, storeId: string, id: string, revision: number) {
    this.checkId(id);
    const snapshot = await this.current(merchantId, storeId, revision);
    const fact = assumedFactsView(snapshot.files).find(entry => entry.id === id && entry.status === 'assumed');
    if (!fact) throw new NotFoundException(GONE);
    const dto = { revision, brief: snapshot.brief, model: 'auto', maxCredits: ASSUMED_REMOVAL_MAX_CREDITS, instruction: assumedRemovalInstruction(fact) } as unknown as GenerateSourceProjectDto;
    const result = await this.generation.generate(merchantId, storeId, dto, this.generation.newBudget(ASSUMED_REMOVAL_MAX_CREDITS));
    if ('styleProposal' in result) throw new BadGatewayException('YAPI no pudo quitar el dato. Tu revisión anterior sigue guardada.');
    const after = await this.projects.version(merchantId, storeId, result.revision);
    const still = pendingAssumptions(readVoice((after.snapshot as unknown as SourceProjectSnapshot).files)).some(entry => entry.id === id);
    return { revision: result.revision, label: result.label, removed: !still };
  }

  /** Mi tienda: facts waiting on each store's current revision, read in PostgreSQL (only voice.json travels). Read-only. */
  async pendingCounts(merchantId: string): Promise<{ counts: Record<string, number> }> {
    const rows = await this.prisma.$queryRaw<Array<{ storeId: string; voice: string | null }>>(Prisma.sql`
      SELECT s.id AS "storeId",
        (SELECT f->>'content' FROM jsonb_array_elements(v.snapshot->'files') f WHERE f->>'path' = ${VOICE_FILE} LIMIT 1) AS voice
      FROM "Store" s
      JOIN "StoreSourceProject" p ON p."storeId" = s.id
      JOIN "StoreSourceVersion" v ON v."storeId" = p."storeId" AND v.revision = p.revision
      WHERE s."merchantId" = ${merchantId} AND p.revision > 0
    `);
    const counts: Record<string, number> = {};
    for (const row of rows) {
      const waiting = row.voice ? pendingAssumptions(readVoice([{ path: VOICE_FILE, content: row.voice }])).length : 0;
      if (waiting) counts[row.storeId] = waiting;
    }
    return { counts };
  }
}
