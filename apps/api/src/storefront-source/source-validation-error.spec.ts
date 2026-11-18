import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { BadGatewayException, BadRequestException, ConflictException } from '@nestjs/common';
import {
  GENERIC_MERCHANT_FAILURE,
  MODEL_LIMIT_MERCHANT_FAILURE,
  SourceValidationError,
  merchantFacingSourceFailure,
  repairDiagnostic,
} from './source-validation-error';

describe('merchant-facing failure gate', () => {
  it('shows the authored Spanish copy and keeps the diagnostic for the repair', () => {
    const error = new SourceValidationError('Preflight failed: missing local asset assets/x.svg', 'No pude guardar el borrador.');
    expect((merchantFacingSourceFailure(error) as Error).message).toBe('No pude guardar el borrador.');
    expect(repairDiagnostic(error)).toMatch(/assets\/x\.svg/);
  });

  it('replaces a diagnostic that was never written for a merchant', () => {
    const leaked = new BadGatewayException('requested images are absent from the design: assets/image-9eb40d2cb55e.jpg');
    const shown = merchantFacingSourceFailure(leaked) as Error;
    expect(shown.message).toBe('YAPI no pudo terminar este cambio: una foto no quedó bien puesta en el diseño nuevo. Tu tienda sigue como estaba; puedes reintentar.');
    expect(shown.message).not.toMatch(/assets\/|image-/i);
  });

  it('passes merchant copy through unchanged, preserving the exception type', () => {
    const authored = new ConflictException('La generación expiró. Tu revisión anterior sigue guardada.');
    expect(merchantFacingSourceFailure(authored)).toBe(authored);
    const request = new BadRequestException('Antes de publicar, confirma los datos de tu tienda.');
    expect(merchantFacingSourceFailure(request)).toBe(request);
  });

  it('leaves control-flow errors alone so callers can still catch them', () => {
    const abort = new DOMException('This operation was aborted', 'AbortError');
    expect(merchantFacingSourceFailure(abort)).toBe(abort);
  });

  // Owner 2026-11-09 («ni siquiera se puede ver qué pasó»): an un-authored validator says what kind of problem it was, in plain words.
  it('says in plain Spanish what kind of check failed, never the English', () => {
    const shown = (message: string) => (merchantFacingSourceFailure(new BadGatewayException(message)) as Error).message;
    expect(shown('components/home.tsx: an image is missing alt text')).toContain('una foto no quedó bien puesta');
    expect(shown('homepage: missing a primary h1')).toContain('a la página le faltaba su título principal');
    expect(shown('styles.css: do not mask page-wide horizontal overflow')).toContain('no se veía bien en el celular o en la computadora');
    expect(shown('sections[2] must declare data-pagosya-cart')).toContain('el carrito o la compra de prueba no funcionó');
    expect(shown('No se pudo compilar Inicio: Unexpected token (12:4)')).toContain('el código del diseño nuevo tenía un error');
    expect(shown('Hay errores de ejecución en la página.')).toBe('Hay errores de ejecución en la página.');
    for (const text of ['components/home.tsx: an image is missing alt text', 'sections[2] must declare data-pagosya-cart']) expect(shown(text)).not.toMatch(/components\/|tsx|data-pagosya|sections\[/);
    expect(shown('Something odd: {"x":1}')).toBe(GENERIC_MERCHANT_FAILURE);
  });

  it('a validator without merchant copy says its kind too', () => {
    expect(new SourceValidationError('The shared vendor script failed to compile: Unexpected token').merchantMessage).toContain('el código del diseño nuevo tenía un error');
  });
});

/**
 * The runtime gate already stops any diagnostic from reaching a merchant, but a
 * validator that throws one still costs the merchant specific, useful Spanish.
 * This ratchet records what is left to convert. It may only ever go down: adding
 * a new raw diagnostic fails here, so the class cannot grow back one file at a time.
 */
describe('validator diagnostics ratchet', () => {
  const MARKERS = [
    /assets\//i,
    /components\//i,
    /\.(?:html|css|tsx|jsx|js|svg)\b/i,
    /data-pagosya-/i,
    /\b(?:JSX|h1|img|alt text|overflow|selector|schema|viewport)\b/,
    /\b(?:missing|absent|broken|invalid|expected|required|must|do not)\b/i,
    /[[\]{}<>]/,
  ];
  const THROW_SITE = /throw new (?:BadGatewayException|BadRequestException)\(\s*([`'"])((?:[^\\]|\\.)*?)\1/gs;

  const scan = () => {
    const sites: Array<{ file: string; text: string }> = [];
    for (const name of readdirSync(__dirname)) {
      if (!name.endsWith('.ts') || name.endsWith('.spec.ts')) continue;
      const source = readFileSync(join(__dirname, name), 'utf8');
      for (const match of source.matchAll(THROW_SITE)) {
        const text = match[2];
        if (MARKERS.some(marker => marker.test(text))) sites.push({ file: name, text });
      }
    }
    return sites;
  };

  // Lower this number when a validator is converted. Never raise it.
  const BASELINE = 29;

  it('does not add new raw diagnostics thrown as merchant exceptions', () => {
    const sites = scan();
    if (sites.length > BASELINE) {
      const added = sites.map(site => `${site.file}: ${site.text.slice(0, 80)}`).join('\n  ');
      throw new Error(
        `Raw validator diagnostics rose from ${BASELINE} to ${sites.length}.\n` +
          `Throw a SourceValidationError(diagnostic, merchantMessage) instead, so the model keeps the detail and the merchant gets Spanish.\n  ${added}`,
      );
    }
    expect(sites.length).toBeLessThanOrEqual(BASELINE);
  });

  it('keeps the preflight validator fully converted', () => {
    expect(scan().filter(site => site.file === 'source-preflight.ts')).toEqual([]);
  });
});

describe('a model usage limit (stress test 2026-10-21)', () => {
  it('says so instead of «no pudo completar las comprobaciones»', () => {
    const shown = merchantFacingSourceFailure(new Error('subscription_sharing_usage_limit_exceeded: ChatGPT plan: subscription_sharing_usage_limit_exceeded. No paid API fallback.')) as Error;
    expect(shown.message).toBe(MODEL_LIMIT_MERCHANT_FAILURE);
  });
});
