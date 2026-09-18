import { ConfigService } from '@nestjs/config';
import { ServiceUnavailableException } from '@nestjs/common';

export interface DomainCommerceConfig {
  enabled: boolean; sandbox: boolean; username: string; token: string;
  platformMerchantId: string; bobPerUsd: number; markupPercent: number;
  cloudflareToken: string; cloudflareZoneId: string; target: string;
}

export function domainCommerceConfig(config: ConfigService): DomainCommerceConfig {
  return config.get<DomainCommerceConfig>('app.domainCommerce')!;
}

export function assertDomainCommerceReady(config: ConfigService): DomainCommerceConfig {
  const c = domainCommerceConfig(config);
  if (!c?.enabled || !c.username || !c.token || !c.platformMerchantId ||
      !Number.isFinite(c.bobPerUsd) || c.bobPerUsd <= 0 ||
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
