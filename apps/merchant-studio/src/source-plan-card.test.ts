import { describe, expect, it } from 'vitest';
import { planCardOf, planIntro, renderPlanCard } from './source-plan-card';

const message = { id: 'plan1aaaa', metadata: { planKind: 'new', plan: { revision: 0, card: ['Menú con 3 categorías desplegables', '<b>x</b>'] } } };

describe('plan card', () => {
  it('reads the card from the message and knows when it is outdated', () => {
    expect(planCardOf(message, 0)).toEqual({ id: 'plan1aaaa', kind: 'new', lines: ['Menú con 3 categorías desplegables', '<b>x</b>'], outdated: false });
    expect(planCardOf(message, 2)?.outdated).toBe(true);
    expect(planCardOf({ id: 'm', metadata: {} }, 0)).toBeNull();
  });
  it('renders escaped lines and the two buttons; an outdated card has no build button', () => {
    const html = renderPlanCard(planCardOf(message, 0)!, false);
    expect(html).toContain('data-plan-build="plan1aaaa"');
    expect(html).toContain('Construir');
    expect(html).toContain('Cambiar');
    expect(html).toContain('&lt;b&gt;x&lt;/b&gt;');
    expect(renderPlanCard({ ...planCardOf(message, 0)!, kind: 'edit' }, false)).toContain('Hacer cambios');
    expect(renderPlanCard(planCardOf(message, 2)!, false)).not.toContain('data-plan-build');
  });
  it('the message keeps only its first line when the card shows the rest', () => {
    expect(planIntro('Esto es lo que voy a hacer con tu tienda:\n• Menú\nToca «Construir» o dime qué cambiar.')).toBe('Esto es lo que voy a hacer con tu tienda:');
  });
});
