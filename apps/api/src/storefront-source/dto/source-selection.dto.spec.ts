import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { SourceSelectionDto } from './source-selection.dto';
import { SendSourceMessageDto } from './send-source-message.dto';
import { GenerateSourceProjectDto } from './generate-source-project.dto';

const errors = (cls: new () => object, value: object) => validateSync(plainToInstance(cls, value) as object, { whitelist: true, forbidNonWhitelisted: true });

describe('SourceSelectionDto', () => {
  it.each(['hero', 'menu-del-dia', 'a', 'a'.repeat(48)])('accepts the section id %s', sectionId => {
    expect(errors(SourceSelectionDto, { sectionId })).toEqual([]);
  });
  it.each(['Hero', 'Hero!', '1hero', '-hero', 'a'.repeat(49), '', 'hé', 'a b', '../x'])('rejects the section id %j', sectionId => {
    expect(errors(SourceSelectionDto, { sectionId })).not.toEqual([]);
  });
  it('rejects a missing or non-text section id and unknown fields', () => {
    expect(errors(SourceSelectionDto, {})).not.toEqual([]);
    expect(errors(SourceSelectionDto, { sectionId: 5 })).not.toEqual([]);
    expect(errors(SourceSelectionDto, { sectionId: 'hero', extra: 1 })).not.toEqual([]);
  });
});

describe('selection on the request bodies', () => {
  const message = { revision: 1, instruction: 'hazlo más grande' };
  const generate = { revision: 1, instruction: 'hazlo más grande', brief: { businessType: 'x', audience: 'y', primaryAction: 'z', visualDirection: 'w' } };

  it('is optional: a body without it is valid, as before', () => {
    expect(errors(SendSourceMessageDto, message)).toEqual([]);
    expect(errors(GenerateSourceProjectDto, generate)).toEqual([]);
  });
  it('accepts a well-formed selection on both bodies', () => {
    expect(errors(SendSourceMessageDto, { ...message, selection: { sectionId: 'hero' } })).toEqual([]);
    expect(errors(GenerateSourceProjectDto, { ...generate, selection: { sectionId: 'hero' } })).toEqual([]);
  });
  it('rejects a malformed selection on both bodies', () => {
    expect(errors(SendSourceMessageDto, { ...message, selection: { sectionId: 'Hero!' } })).not.toEqual([]);
    expect(errors(GenerateSourceProjectDto, { ...generate, selection: { sectionId: 'x'.repeat(60) } })).not.toEqual([]);
  });
});
