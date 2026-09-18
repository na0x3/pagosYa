import { designAssessmentInstructions, designCaptureFailures } from './source-design-evaluator';
import { knownDesignSpend } from './source-design-job.worker';
import type { VisualCapture } from './source-visual-capture';
describe('Design evidence and provider accounting', () => {
  const capture = (viewport: 'desktop' | 'mobile', width: number): VisualCapture => ({ viewport, width, height: 844, y: 0, pageHeight: 844, state: 'initial', image: 'data:image/jpeg;base64,AA==', readiness: { fontsLoaded: true, missingImages: 0, scrollWidth: width } });
  it('rejects incomplete, unloaded and overflowing capture sets independently of taste', () => {
    expect(designCaptureFailures([])).not.toEqual([]);
    const desktop = capture('desktop', 1280), mobile = capture('mobile', 390);
    expect(designCaptureFailures([desktop, mobile])).toEqual([]);
    expect(designCaptureFailures([desktop, { ...mobile, readiness: { fontsLoaded: false, missingImages: 1, scrollWidth: 700 } }])).toHaveLength(2);
  });
  it('counts failed attempts with known usage and never assumes unknown attempts are free', () => {
    expect(knownDesignSpend([{ status: 'FAILED', usage: { providerMicroUsd: 20000 } }, { status: 'COMPLETED', usage: { providerMicroUsd: 30000 } }])).toBe(50000);
    expect(knownDesignSpend([{ usage: { providerMicroUsd: 1000 } }, { usage: null }])).toBeNull();
    expect(knownDesignSpend([])).toBeNull();
    expect(knownDesignSpend([{ usage: { providerMicroUsd: -1 } }])).toBeNull();
  });
  it('fails product pages whose purchase is below the fold, whose title wraps too far or whose choices overflow', () => {
    const desktop = capture('desktop', 1280), mobile = capture('mobile', 390);
    const good = { buyBottom: 700, titleLines: 2, overflowingChoices: 0 };
    expect(designCaptureFailures([{ ...desktop, product: good }, { ...mobile, product: { ...good, buyBottom: 1400, titleLines: 3 } }])).toEqual([]);
    expect(designCaptureFailures([{ ...desktop, product: { buyBottom: 900, titleLines: 3, overflowingChoices: 1 } }, mobile])).toEqual([
      'desktop: el botón de compra no se ve sin desplazarse.',
      'desktop: el nombre del producto ocupa demasiadas líneas.',
      'desktop: hay opciones con texto cortado.',
    ]);
    expect(designCaptureFailures([{ ...desktop, product: { ...good, buyBottom: null } }, { ...mobile, product: { ...good, titleLines: 4 } }])).toEqual(['mobile: el nombre del producto ocupa demasiadas líneas.']);
  });
});
describe('Design assessment instructions', () => {
  it('adds the purchase-page checklist only for product pages', () => {
    expect(designAssessmentInstructions(true, false)).toContain('página de producto');
    expect(designAssessmentInstructions(true, true)).toContain('Compara A y B');
    expect(designAssessmentInstructions(false, false)).not.toContain('página de producto');
    expect(designAssessmentInstructions(true, false)).toContain('Nunca pidas reseñas');
  });
});
