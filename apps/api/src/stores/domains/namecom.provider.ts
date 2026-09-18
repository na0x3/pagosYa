import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { domainCommerceConfig } from './domain-commerce.config';
import { DomainRegistrantDto } from './domain-commerce.dto';

export interface DomainAvailability {
  domainName: string; purchasable: boolean; premium: boolean;
  purchaseType: string; purchasePrice: number; renewalPrice: number;
}
export interface RegistrarDomain {
  domainName: string; expireDate: string; locks?: string[];
  contacts?: { registrant?: { isVerified?: boolean } };
}
export class DomainProviderError extends Error {
  constructor(readonly status: number, readonly provider: string) { super(`${provider} request failed (${status})`); }
}

@Injectable()
export class NamecomProvider {
  constructor(private readonly config: ConfigService) {}
  private async request<T>(path: string, method = 'GET', body?: unknown, key?: string): Promise<T> {
    const c = domainCommerceConfig(this.config);
    if (!c?.token || !c.username) throw new ServiceUnavailableException('El registro de dominios no está configurado.');
    const origin = c.sandbox ? 'https://api.dev.name.com' : 'https://api.name.com';
    const response = await fetch(`${origin}/core/v1${path}`, {
      method, signal: AbortSignal.timeout(20_000),
      headers: { Authorization: `Basic ${Buffer.from(`${c.username}:${c.token}`).toString('base64')}`, 'Content-Type': 'application/json', ...(key ? { 'X-Idempotency-Key': key } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    if (!response.ok) throw new DomainProviderError(response.status, 'registrar');
    return response.json() as Promise<T>;
  }
  async availability(names: string[]) {
    const result = await this.request<{ results: DomainAvailability[] }>('/domains:checkAvailability', 'POST', { domainNames: names, purchaseType: 'registration' });
    if (!Array.isArray(result.results)) throw new DomainProviderError(502, 'registrar');
    return result.results.filter(row => names.includes(row.domainName));
  }
  register(hostname: string, contact: DomainRegistrantDto, price: number, key: string) {
    return this.request<{ domain: RegistrarDomain; order: number; totalPaid: number }>('/domains', 'POST', {
      domain: { domainName: hostname, contacts: { registrant: contact, admin: contact, tech: contact, billing: contact },
        autorenewEnabled: false, locked: true, privacyEnabled: true },
      years: 1, purchaseType: 'registration', purchasePrice: price,
    }, key);
  }
  getDomain(hostname: string) { return this.request<RegistrarDomain>(`/domains/${encodeURIComponent(hostname)}`); }
  async ensureRecord(domain: string, host: string, type: 'CNAME' | 'ANAME' | 'TXT', answer: string) {
    const path = `/domains/${encodeURIComponent(domain)}/records`;
    const records = await this.request<{ records?: Array<{ id: number; host: string; type: string; answer: string }> }>(path);
    const matching = records.records?.filter(r => (r.host || '') === host && r.type === type) || [];
    if (matching.some(r => r.answer.replace(/\.$/, '') === answer.replace(/\.$/, ''))) return;
    // Only these explicitly owned records are changed; unrelated MX/TXT records survive retries.
    await this.request(matching.length ? `${path}/${matching[0].id}` : path, matching.length ? 'PUT' : 'POST', { host, type, answer, ttl: 300, ...(matching.length ? { id: matching[0].id } : {}) });
  }
}
