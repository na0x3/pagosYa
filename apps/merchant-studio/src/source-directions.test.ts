import { describe, expect, it } from 'vitest';
import { renderDirectionChoices } from './source-directions';

const retro = { id: 'retro-americana', name: 'Retro americana', description: 'Titulares gigantes', palette: { background: '#f6ecd6', surface: '#efd9a7', ink: '#2b1d14', accent: '#b5441b' }, fonts: { display: 'bebas-neue', text: 'rubik' } };

describe('design direction cards', () => {
  it('show a mini preview in the direction’s own palette and name its fonts', () => {
    const html = renderDirectionChoices([retro], false);
    expect(html).toContain('data-direction-choice="retro-americana"');
    expect(html).toContain('data-direction-name="Retro americana"');
    expect(html).toContain('background:#f6ecd6');
    expect(html).toContain('#b5441b');
    expect(html).toContain('Bebas Neue');
    expect(html).toContain('Titulares gigantes');
  });
  it('never inject a colour or text that is not what it claims to be', () => {
    const html = renderDirectionChoices([{ ...retro, name: '<img src=x>', palette: { ...retro.palette, background: 'red;background:url(x)' } }], true);
    expect(html).not.toContain('<img src=x>');
    expect(html).not.toContain('url(x)');
    expect(html).toContain('disabled');
  });
});
