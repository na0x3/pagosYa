import { describe, expect, it } from 'vitest';
import { MERCHANT_FAILURE_FALLBACK, merchantSafeText, readsAsDiagnostic } from './source-merchant-copy';

describe('merchantSafeText', () => {
  it('drops the leaked diagnostic that reached a merchant and keeps the reassurance', () => {
    // The exact message this guard exists for, as it was stored in the thread.
    const stored =
      'La revisión no pasó el preflight automático: requested images are absent from the design: '
      + 'assets/image-9eb40d2cb55e.jpg, assets/image-5aa1b3a03642.jpg. Display these actual local images; '
      + 'do not replace them with illustrations or treat them as reference-only '
      + 'Tu mensaje y los archivos quedaron guardados; no necesitas volver a adjuntarlos. '
      + 'Un nuevo intento puede consumir créditos de IA.';
    const shown = merchantSafeText(stored);
    expect(shown).not.toMatch(/assets\/|\.jpg|preflight|absent|illustrations/i);
    expect(shown).toContain('No pude completar tu pedido.');
    expect(shown).toContain('Un nuevo intento puede consumir créditos de IA.');
  });

  it('does not tell the merchant twice that their message was kept', () => {
    // The server appends its own reassurance to every failure, so the fallback's
    // copy of it would be the second one the merchant reads, in other words.
    const shown = merchantSafeText(
      'requested images are absent from the design: assets/image-9eb40d2cb55e.jpg. '
      + 'Tu mensaje y los archivos quedaron guardados; no necesitas volver a adjuntarlos.',
    );
    expect(shown).toBe('No pude completar tu pedido. Tu mensaje y los archivos quedaron guardados; no necesitas volver a adjuntarlos.');
    expect(shown.match(/no necesitas volver a adjuntarlos/g)).toHaveLength(1);
  });

  it('keeps the whole fallback when the surviving text offers no reassurance', () => {
    expect(merchantSafeText('components/home.tsx: missing alt text. Vuelve a intentarlo en unos minutos.'))
      .toBe(`${MERCHANT_FAILURE_FALLBACK} Vuelve a intentarlo en unos minutos.`);
  });

  it('leaves authored merchant copy exactly as written', () => {
    for (const authored of [
      'Guardé los cambios de tu tienda «Horizonte». Revisa el aspecto del sitio a la derecha.',
      'El proveedor de IA no tiene saldo o cuota disponible.',
      'YAPI armó un borrador que no pasó las comprobaciones automáticas, así que no lo guardé. Tu revisión anterior sigue intacta.',
      '¿Qué estilo y colores quieres para tu marca?',
      'Antes de publicar, confirma los datos de tu tienda.',
    ]) {
      expect(merchantSafeText(authored)).toBe(authored);
    }
  });

  it('falls back when every sentence is a diagnostic', () => {
    expect(merchantSafeText('components/home.tsx: an image is missing alt text')).toBe(MERCHANT_FAILURE_FALLBACK);
    expect(merchantSafeText('TypeError: cannot read properties of undefined')).toBe(MERCHANT_FAILURE_FALLBACK);
    expect(merchantSafeText('   ')).toBe(MERCHANT_FAILURE_FALLBACK);
  });

  it("uses the caller's fallback when one is supplied", () => {
    expect(merchantSafeText('homepage: missing a primary h1', 'No se pudo comprobar.')).toBe('No se pudo comprobar.');
  });

  it('recognises diagnostics by path, English wording, markup and error names', () => {
    for (const diagnostic of [
      'styles/globals.css: do not mask page-wide horizontal overflow',
      'sections[2] must declare data-pagosya-cart',
      'requested images are absent from the design',
      'La solicitud falló con status 502',
      'BadGatewayException',
    ]) {
      expect(readsAsDiagnostic(diagnostic)).toBe(true);
    }
  });

  it('does not mistake ordinary Spanish for a diagnostic', () => {
    for (const authored of [
      'Cambios guardados. Comprobación del navegador pendiente…',
      'Encontré 3 comprobaciones con errores.',
      'El carrito no abre al pulsar «Pedido».',
      'Tu revisión anterior sigue guardada.',
    ]) {
      expect(readsAsDiagnostic(authored)).toBe(false);
    }
  });
});
