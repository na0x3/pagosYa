import { BadRequestException, ConflictException } from '@nestjs/common';
import { ArrayMaxSize, IsArray, IsBoolean } from 'class-validator';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { kitPath } from '@pagosya/storefront-kit';
import type { PrismaService } from '../prisma/prisma.service';
import { sourceProjectDigest, type SourceProjectSnapshot } from './source-project';

export class SourceCheckResultDto {
  @IsBoolean({ message: 'El resultado debe indicar si la comprobación pasó.' })
  passed!: boolean;

  @IsArray({ message: 'Los hallazgos deben ser una lista.' })
  @ArrayMaxSize(1000, { message: 'La comprobación admite hasta 1000 hallazgos.' })
  findings!: unknown[];
}

export function boundedSourceFindings(findings: unknown) {
  if (!Array.isArray(findings) || findings.length > 1000 || Buffer.byteLength(JSON.stringify(findings), 'utf8') > 65536) {
    throw new BadRequestException('Los hallazgos deben ser una lista de hasta 1000 elementos y 64 KiB.');
  }
  return findings;
}

/** Hash the same concatenation served as commerce.js by currentSourceRuntime, never authored code. */
export async function sourceRuntimeDigest() {
  const commerce = (await Promise.all(['privacy.js', 'commerce.js', 'retention.js'].map(name => readFile(kitPath(name), 'utf8')))).join('\n');
  return createHash('sha256').update(commerce).digest('hex');
}

export async function requireSourceChecks(prisma: PrismaService, storeId: string, revision: number, snapshot: SourceProjectSnapshot) {
  const result = await prisma.sourceCheckResult.findFirst({
    where: { storeId, revision, passed: true, snapshotDigest: sourceProjectDigest(snapshot), runtimeDigest: await sourceRuntimeDigest() },
    select: { id: true },
  });
  if (!result) throw new ConflictException('Revisa la tienda en escritorio y móvil antes de publicarla.');
}
