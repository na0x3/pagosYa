import { describe, expect, it } from 'vitest';
import { needsAnswer, renderExit, renderHistory, renderPill } from './source-yapi-pill-view';

describe('pill markup', () => {
  it('is the composer the Studio already binds, with the plus menu, history and the spinning star', () => {
    const html = renderPill({ busy: false, spin: 'spin', attachments: '', menuOpen: true, logo: '/logo.png', selectionLabel: 'Sección de marcas' });
    expect(html).toContain('data-composer');
    expect(html).toContain('id="agent-command"');
    expect(html).toContain('placeholder="¿Qué quieres crear o mejorar?"');
    expect(html).toContain('data-action="open-upload"');
    expect(html).toContain('data-composer-action="create-product"');
    expect(html).toContain('data-yapi-history-open');
    expect(html).toContain('Enviar');
    expect(html).toContain('is-spin');
    expect(html).toContain('Sobre: Sección de marcas');
    expect(html).not.toMatch(/Modelo|navegará|Rediseñar sitio|Mejorar el móvil/);
  });
  it('escapes the selection label and disables while busy', () => {
    const html = renderPill({ busy: true, spin: 'idle', attachments: '', menuOpen: false, logo: '/l.png', selectionLabel: '<b>x</b>' });
    expect(html).toContain('&lt;b&gt;x&lt;/b&gt;');
    expect(html).toMatch(/<textarea[^>]*disabled/);
  });
  it('exit and history', () => {
    expect(renderExit()).toContain('aria-label="Salir del diseño"');
    expect(renderHistory(false, '<p>hola</p>')).toMatch(/hidden/);
    expect(renderHistory(true, '<p>hola</p>')).toContain('<p>hola</p>');
  });
});

describe('which YAPI messages need an answer', () => {
  const m = (metadata: Record<string, unknown>) => ({ id: 'x', role: 'ASSISTANT', metadata });
  it('cards, questions and kept requests stay; plain replies do not', () => {
    expect(needsAnswer(m({ plan: { revision: 2, card: ['a'] }, planKind: 'new' }), 2)).toBe(true);
    expect(needsAnswer(m({ plan: { revision: 1, card: ['a'] }, planKind: 'new' }), 2)).toBe(false);
    expect(needsAnswer(m({ clarification: { options: [{ label: 'Sí', value: 'sí' }] } }), 2)).toBe(true);
    expect(needsAnswer(m({ failed: true, pendingRequest: { instruction: 'x' } }), 2)).toBe(true);
    expect(needsAnswer(m({ suggestions: [{ id: 's', title: 'T', instruction: 'i', kind: 'design' }] }), 2)).toBe(true);
    expect(needsAnswer(m({ styleProposal: { generationId: 'g' } }), 2)).toBe(true);
    expect(needsAnswer(m({ sourceRevision: 3 }), 2)).toBe(false);
    expect(needsAnswer({ id: 'u', role: 'USER', metadata: {} }, 2)).toBe(false);
  });
});
