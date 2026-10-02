import { createHash } from 'node:crypto';
import { ConflictException } from '@nestjs/common';
import { sourceProjectDigest, sourceProjectSnapshot, type SourceProjectSnapshot } from './source-project';
import type { SaveSourceProjectDto } from './dto/save-source-project.dto';

const inputDigest = (input: SaveSourceProjectDto) => createHash('sha256').update(JSON.stringify({ revision: input.revision, label: input.label, snapshot: sourceProjectSnapshot(input) })).digest('hex');

/** Internal capability, never accepted from an HTTP body. Evidence and commit share these exact bytes. */
export type PreparedSourceArtifact = {
  version: 1;
  inputDigest: string;
  digest: string;
  snapshot: SourceProjectSnapshot;
  transformedPaths: string[];
};
export function preparedSourceArtifact(input: SaveSourceProjectDto, prepared: SourceProjectSnapshot): PreparedSourceArtifact {
  const snapshot = structuredClone(prepared);
  const artifact: PreparedSourceArtifact = {
    version: 1, inputDigest: inputDigest(input), digest: sourceProjectDigest(snapshot), snapshot,
    transformedPaths: snapshot.files.filter(file => input.files.find(source => source.path === file.path)?.content !== file.content).map(file => file.path),
  };
  for (const file of snapshot.files) Object.freeze(file);
  Object.freeze(artifact.transformedPaths);
  Object.freeze(snapshot.files); Object.freeze(snapshot.brief); Object.freeze(snapshot);
  return Object.freeze(artifact);
}
export function assertPreparedSource(input: SaveSourceProjectDto, artifact: PreparedSourceArtifact): SourceProjectSnapshot {
  if (artifact.version !== 1 || inputDigest(input) !== artifact.inputDigest || sourceProjectDigest(artifact.snapshot) !== artifact.digest) {
    throw new ConflictException('El diseño cambió después de comprobarse. Vuelve a verificarlo antes de guardar.');
  }
  return structuredClone(artifact.snapshot);
}
