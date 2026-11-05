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
  it('accepts a local current page and rejects traversal and external URLs', () => {
    expect(errors(SendSourceMessageDto, { ...message, currentPage: 'acceso-ingresar.html' })).toEqual([]);
    for (const currentPage of ['../index.html', 'https://example.com', 'index.html?secret=1']) expect(errors(GenerateSourceProjectDto, { ...generate, currentPage })).not.toEqual([]);
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

import { SourceViewingDto } from './source-selection.dto';
const area = { points: [0, 0, 100, 0, 100, 100], rect: { x: 0, y: 0, width: 100, height: 100 }, sections: [{ page: 'home', at: 1, label: 'Hola' }], texts: ['Hola'], photos: ['/v1/uploads/a.jpg'], parts: ['menu'], width: 1280, height: 720, pageQuery: 'producto.html?id=abc' };
describe('pointing (spec 2026-11-05 point-at)', () => {
  it('accepts a template address, a circle and a viewing', () => {
    expect(errors(SourceSelectionDto, { sectionId: 'lb-1', at: 1, page: 'about' })).toEqual([]);
    expect(errors(SourceSelectionDto, { sectionId: 'lb-1', area })).toEqual([]);
    expect(errors(SourceViewingDto, { page: 'faq', at: 2, sectionId: 'lb-2' })).toEqual([]);
    expect(errors(SendSourceMessageDto, { revision: 1, instruction: 'agrega una pregunta aquí', viewing: { page: 'faq', at: 2 } })).toEqual([]);
  });
  it.each([
    { at: 41, page: 'home' }, { at: 1, page: 'blog' },
    { area: { ...area, points: Array(130).fill(1) } }, { area: { ...area, points: [1, 'x', 2, 2, 3, 3] } }, { area: { ...area, texts: Array(13).fill('x') } },
    { area: { ...area, texts: ['x'.repeat(201)] } }, { area: { ...area, photos: Array(7).fill('/a.jpg') } }, { area: { ...area, photos: ['javascript:alert(1)'] } },
    { area: { ...area, parts: ['body'] } }, { area: { ...area, width: 279 } }, { area: { ...area, height: 100 } }, { area: { ...area, pageQuery: '../etc.html' } }, { area: { ...area, sections: Array(4).fill(area.sections[0]) } },
  ])('refuses %j', extra => { expect(errors(SourceSelectionDto, { sectionId: 'lb-1', ...extra })).not.toEqual([]); });
  it('refuses a viewing on an unknown page', () => { expect(errors(SourceViewingDto, { page: 'blog' })).not.toEqual([]); });
});
