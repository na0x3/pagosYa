import { validate } from 'class-validator';
import { SendSourceMessageDto } from './dto/send-source-message.dto';
import { savedSourceDesign, validateSourceDesign, validateSourcePresentation } from './source-design';

describe('retired storefront theme compatibility', () => {
  it('accepts bounded legacy metadata for old clients without requiring a preset registry', async () => {
    const dto = Object.assign(new SendSourceMessageDto(), { revision: 0, instruction: 'Crea mi tienda', themeId: 'invented-theme' });
    expect((await validate(dto)).some(error => error.property === 'themeId')).toBe(false);
    dto.themeId = 'print-club';
    expect((await validate(dto)).some(error => error.property === 'themeId')).toBe(false);
  });
  it('reads old revisions while dropping retired theme metadata from design guidance', () => {
    const design = { selected: 0, concepts: ['a', 'b', 'c'].map(name => ({ name, premise: name, opening: name, flow: name, typography: name, imagery: name, mobile: name })) };
    expect(validateSourceDesign(design)).toEqual(design);
    expect(savedSourceDesign([{ path: 'design-direction.json', content: JSON.stringify({ ...design, themeId: 'sunny-market' }) }])).toEqual(design);
    expect(validateSourceDesign({ ...design, themeId: 'unknown' })).toEqual(design);
  });
  it('rejects compressed display tracking and allows the documented floor', () => {
    expect(() => validateSourcePresentation([{ path: 'styles.css', content: '.hero h1 { letter-spacing: -.082em; }' }])).toThrow('espaciado tipográfico');
    expect(() => validateSourcePresentation([{ path: 'styles.css', content: '.hero h1 { letter-spacing: -.04em; }' }])).not.toThrow();
    expect(() => validateSourcePresentation([{ path: 'styles.css', content: '.hero h1 { letter-spacing: -.082em; }' }], [{ path: 'styles.css', content: '.hero h1 { letter-spacing: -.082em; }' }])).not.toThrow();
  });
});
