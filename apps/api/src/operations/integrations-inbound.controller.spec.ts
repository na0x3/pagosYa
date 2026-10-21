import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('IntegrationsInboundController', () => {
  it('is rate limited, so a known connection id cannot be used to burn CPU on argon2 checks (security audit 2026-10-21)', () => {
    const source = readFileSync(join(__dirname, 'integrations-inbound.controller.ts'), 'utf8');
    expect(source).toMatch(/@Throttle\(\{ default: \{ limit: 60, ttl: 60_000 \} \}\)\n@Controller\("v1\/integrations"\)/);
  });
});
