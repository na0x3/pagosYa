import { sourceRequestExecutionPrompt, sourceRequestProfile, sourceRequestProfilePrompt } from './source-request-profile';

describe('natural language request profile', () => {
  it('turns a vague visual request into a complete internal brief', () => {
    const profile = sourceRequestProfile('Hazlo más bonito y profesional', true);
    expect(profile.scope).toBe('visual-refinement');
    expect(profile.visualDomains).toContain('header');
    expect(profile.visualDomains).toContain('footer');
    expect(profile.visualDomains).toContain('responsive');
    expect(profile.preserve).toEqual(expect.arrayContaining(['uploaded photos and confirmed asset roles']));
    expect(sourceRequestProfilePrompt(profile)).toContain('do not ask them for technical design instructions');
  });

  it('keeps narrow requests narrow while adding the relevant supporting surfaces', () => {
    const profile = sourceRequestProfile('Cambia los iconos del footer', true);
    expect(profile.scope).toBe('targeted-visual');
    expect(profile.visualDomains).toEqual(expect.arrayContaining(['icons', 'footer']));
    expect(profile.visualDomains).not.toContain('checkout');
  });

  it('recognizes a complete redesign in normal Spanish or English', () => {
    expect(sourceRequestProfile('Rediseña toda la página usando las mismas fotos', true).scope).toBe('full-redesign');
    expect(sourceRequestProfile('Make the whole site look completely different', true).scope).toBe('full-redesign');
  });

  it('keeps a standalone marquee request scoped to the marquee', () => {
    const profile = sourceRequestProfile('cambia la marquesina,', true);
    expect(profile.scope).toBe('targeted-visual');
    expect(profile.targetedFeature).toBe('marquee');
    expect(profile.visualDomains).toEqual(['motion']);
    expect(sourceRequestProfilePrompt(profile)).toContain('edit only the existing marquee/announcement component');
  });

  it('does not collapse a marquee plus a new section into a marquee-only edit', () => {
    expect(sourceRequestProfile('cambia la marquesina y añade una sección con animaciones', true).targetedFeature).toBeUndefined();
  });

  it('makes the current merchant message authoritative for generation', () => {
    const prompt = sourceRequestExecutionPrompt('Cambia la marquesina a una con patitas y animaciones', true);
    expect(prompt).toContain('CURRENT MERCHANT REQUEST — HIGHEST PRIORITY');
    expect(prompt).toContain('CSS-only changes are not sufficient');
    expect(prompt).toContain('Current request copy:\nCambia la marquesina a una con patitas y animaciones');
  });
});
