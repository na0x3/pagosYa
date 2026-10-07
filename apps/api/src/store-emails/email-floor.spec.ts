import { DEFAULT_EMAIL_COPY, loadFloorKit } from './email-copy-defaults';
import { EMAIL_BLOCK_TYPES, EMAIL_COPY_FIELDS, EMAIL_TYPES, type EmailCopyField } from './email-kit-contract';
import { cleanCopyValue } from './email-kit-validate';

describe('the floor kit', () => {
  it('validates and carries every block type', async () => {
    const floor = await loadFloorKit();
    expect(floor.layout).toContain('data-email-content');
    expect(Object.keys(floor.blocks).sort()).toEqual([...EMAIL_BLOCK_TYPES].sort());
  });

  it('uses brand tokens with fallbacks, so a store without a kit still gets its colours', async () => {
    expect((await loadFloorKit()).blocks.button).toMatch(/var\(--brand-accent,\s*#/);
  });

  it('has default wording for every email type and field, within the caps and the wording rules', () => {
    for (const type of EMAIL_TYPES) for (const field of Object.keys(EMAIL_COPY_FIELDS) as EmailCopyField[]) {
      const value = DEFAULT_EMAIL_COPY[type][field];
      expect(value.length).toBeGreaterThan(0);
      expect(cleanCopyValue(field, value)).toEqual({ value, repairs: [] });
    }
  });
});

describe('the floor layout', () => {
  it('has header links, social icons, address and policy links', async () => {
    const { layout } = await loadFloorKit();
    for (const slot of ['data-nav-link', 'data-social', 'data-social-icon', 'data-store-address', 'data-policy-link']) expect(layout).toContain(slot);
  });
});
