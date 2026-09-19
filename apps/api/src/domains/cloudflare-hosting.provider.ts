import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { domainCommerceConfig } from './domain-commerce.config';
import { DomainProviderError } from './namecom.provider';

export interface HostedDomain {
  id: string; hostname: string; status: string;
  ownership_verification?: { type: string; name: string; value: string };
  ssl?: { status: string; validation_records?: Array<{ txt_name?: string; txt_value?: string }> };
}
@Injectable()
export class CloudflareHostingProvider {
  constructor(private readonly config: ConfigService) {}
  private async request<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
    const c = domainCommerceConfig(this.config);
    const response = await fetch(`https://api.cloudflare.com/client/v4/zones/${encodeURIComponent(c.cloudflareZoneId)}/custom_hostnames${path}`, {
      method, signal: AbortSignal.timeout(20_000), headers: { Authorization: `Bearer ${c.cloudflareToken}`, 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    if (!response.ok) throw new DomainProviderError(response.status, 'hosting');
    const result = await response.json() as { success: boolean; result: T };
    if (!result.success) throw new DomainProviderError(502, 'hosting');
    return result.result;
  }
  async ensure(hostname: string, id?: string | null) {
    if (id) return this.request<HostedDomain>(`/${encodeURIComponent(id)}`);
    const rows = await this.request<HostedDomain[]>(`?hostname=${encodeURIComponent(hostname)}`);
    const existing = rows.find(row => row.hostname === hostname);
    return existing || this.request<HostedDomain>('', 'POST', { hostname, ssl: { method: 'txt', type: 'dv', settings: { min_tls_version: '1.2' } } });
  }
}
