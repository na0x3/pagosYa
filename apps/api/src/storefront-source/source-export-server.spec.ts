import { spawn } from 'node:child_process';
import { copyFileSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { kitPath } from '@pagosya/storefront-kit';

jest.setTimeout(20_000);

describe('exported storefront server', () => {
  it('serves pages with a policy that confines the design to its own origin, the pagosYa API and checkout', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'pagosya-export-'));
    copyFileSync(kitPath('server.mjs'), join(dir, 'server.mjs'));
    writeFileSync(join(dir, 'index.html'), '<!doctype html><title>Tienda</title>');
    writeFileSync(join(dir, 'config.js'), 'window.PAGOSYA_CONFIG = {"apiBaseUrl":"https://api.pagosya.test/v1","checkoutOrigin":"https://pay.pagosya.test"};');
    const port = 40000 + Math.floor(Math.random() * 10000);
    const server = spawn(process.execPath, ['server.mjs'], { cwd: dir, env: { ...process.env, PORT: String(port), HOST: '127.0.0.1' } });
    try {
      await new Promise<void>((resolve, reject) => { server.stdout.on('data', () => resolve()); server.on('exit', code => reject(new Error(`server exited ${code}`))); });
      const page = await fetch(`http://127.0.0.1:${port}/`);
      const csp = page.headers.get('content-security-policy') || '';
      expect(csp).toContain("connect-src 'self' https://api.pagosya.test https://pay.pagosya.test;");
      expect(csp).toContain("object-src 'none'");
      expect(csp).toContain("frame-ancestors 'self'");
      expect(csp).not.toMatch(/connect-src[^;]*\*/);
      expect(page.headers.get('x-frame-options')).toBe('SAMEORIGIN');
      const script = await fetch(`http://127.0.0.1:${port}/config.js`);
      expect(script.headers.get('content-security-policy')).toBeNull();
    } finally { server.kill(); rmSync(dir, { recursive: true, force: true }); }
  });
});
