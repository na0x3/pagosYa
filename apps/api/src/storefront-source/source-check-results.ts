import { BadRequestException, ConflictException } from '@nestjs/common';
import { ArrayMaxSize, IsArray, IsBoolean } from 'class-validator';
import { currentSourceRuntimeBundle } from './source-runtime';
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

/** Checks and publications identify the same complete trusted runtime bundle. */
export async function sourceRuntimeDigest() {
  return (await currentSourceRuntimeBundle()).digest;
}

export async function requireSourceChecks(prisma: PrismaService, storeId: string, revision: number, snapshot: SourceProjectSnapshot, runtimeDigest?: string) {
  const result = await prisma.sourceCheckResult.findFirst({
    where: { storeId, revision, passed: true, snapshotDigest: sourceProjectDigest(snapshot), runtimeDigest: runtimeDigest ?? await sourceRuntimeDigest() },
    select: { id: true },
  });
  if (!result) throw new ConflictException('Revisa la tienda en escritorio y móvil antes de publicarla.');
}
