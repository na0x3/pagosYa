import { ConfigService } from '@nestjs/config';
import { ServiceUnavailableException } from '@nestjs/common';

export interface DomainCommerceConfig {
  enabled: boolean; sandbox: boolean; username: string; token: string;
  platformMerchantId: string; bobPerUsd: number; markupPercent: number;
  cloudflareToken: string; cloudflareZoneId: string; target: string;
  /** Which DolarApi quote feeds the live rate: 'oficial' (default) or 'binance'. */
  fxSource?: 'oficial' | 'binance';
}

export function domainCommerceConfig(config: ConfigService): DomainCommerceConfig {
  return config.get<DomainCommerceConfig>('app.domainCommerce')!;
}

/**
 * `rate` is the effective BOB/USD (live, else env); omitted, the configured value is used.
 * `skipRate` is for fulfilment of already-priced orders: everything else is still checked.
 */
export function assertDomainCommerceReady(config: ConfigService, rate?: number, options: { skipRate?: boolean } = {}): DomainCommerceConfig {
  const base = domainCommerceConfig(config);
  const c = rate === undefined || !base ? base : { ...base, bobPerUsd: rate };
  if (!c?.enabled || !c.username || !c.token || !c.platformMerchantId ||
      (!options.skipRate && (!Number.isFinite(c.bobPerUsd) || c.bobPerUsd <= 0)) ||
      !Number.isFinite(c.markupPercent) || c.markupPercent < 0 ||
      (c.sandbox && config.get('app.banecoQr.enabled')) ||
      (!c.sandbox && (!c.cloudflareToken || !c.cloudflareZoneId || !c.target || !config.get('app.banecoQr.enabled')))) {
    throw new ServiceUnavailableException('La compra de dominios todavía no está disponible. Puedes conectar un dominio que ya tengas.');
  }
  return c;
}

export function domainPrice(usd: number, config: DomainCommerceConfig): number {
  const amount = Math.ceil(usd * config.bobPerUsd * (1 + config.markupPercent / 100) * 100);
  if (!Number.isFinite(usd) || usd <= 0 || !Number.isSafeInteger(amount) || amount <= 0 || amount > 100_000_000) {
    throw new ServiceUnavailableException('No pudimos confirmar el precio del dominio.');
  }
  return amount;
}
