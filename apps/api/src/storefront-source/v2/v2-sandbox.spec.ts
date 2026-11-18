jest.setTimeout(120_000);

import { createServer, type Server } from 'node:http';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildInSandbox, runSandboxed, sandboxProfile, sandboxCommand } from './v2-sandbox';
import { nextProjectScaffold } from '../source-next';

const probe = (body: string) => ({ 'probe.cjs': `const fs = require('node:fs');\nconst out = {};\n(async () => {\n${body}\n})().finally(() => fs.writeFileSync('out.json', JSON.stringify(out)));` });
const result = (work: string) => JSON.parse(readFileSync(join(work, 'out.json'), 'utf8'));

describe('v2 build sandbox: isolation', () => {
  let server: Server; let port = 0;
  const secretDir = mkdtempSync(join(tmpdir(), 'yapi-v2-secret-'));
  const secretEnv = join(secretDir, '.env');
  beforeAll(async () => {
    writeFileSync(secretEnv, 'OPENAI_API_KEY=sk-should-never-be-read\n');
    server = createServer((_req, res) => res.end('reached')); await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    port = (server.address() as { port: number }).port;
    process.env.YAPI_V2_SANDBOX_SECRET = 'leak';
  });
  afterAll(async () => { delete process.env.YAPI_V2_SANDBOX_SECRET; await new Promise(resolve => server.close(resolve)); rmSync(secretDir, { recursive: true, force: true }); });

  it('gives the child no environment secrets, no .env, no writes outside its folder and no network', async () => {
    const outside = join(secretDir, 'written.txt');
    const run = await runSandboxed('probe.cjs', [], probe(`
      out.env = Object.keys(process.env).sort();
      try { out.dotenv = fs.readFileSync(${JSON.stringify(secretEnv)}, 'utf8'); } catch (e) { out.dotenv = e.code; }
      try { fs.writeFileSync(${JSON.stringify(outside)}, 'x'); out.outside = 'written'; } catch (e) { out.outside = e.code; }
      try { fs.writeFileSync('inside.txt', 'x'); out.inside = 'written'; } catch (e) { out.inside = e.code; }
      try { await fetch('http://127.0.0.1:${port}/'); out.local = 'reached'; } catch (e) { out.local = 'blocked'; }
      try { await fetch('https://example.com/'); out.remote = 'reached'; } catch (e) { out.remote = 'blocked'; }
    `));
    const out = result(run.work);
    rmSync(run.work, { recursive: true, force: true });
    expect(out.env).not.toContain('YAPI_V2_SANDBOX_SECRET');
    expect(out.env.filter((key: string) => !['PATH', 'NODE_ENV', '__CF_USER_TEXT_ENCODING'].includes(key))).toEqual([]);
    expect(out.dotenv).toBe('EPERM');
    expect(out.outside).toBe('EPERM');
    expect(existsSync(outside)).toBe(false);
    expect(out.inside).toBe('written');
    expect(out.local).toBe('blocked');
    expect(out.remote).toBe('blocked');
  });

  it('kills a child that runs past its wall clock', async () => {
    const run = await runSandboxed('probe.cjs', [], probe('await new Promise(() => setInterval(() => {}, 1000));'), { timeoutMs: 1500 });
    rmSync(run.work, { recursive: true, force: true });
    expect(run.timedOut).toBe(true);
    expect(run.ms).toBeLessThan(10_000);
  });

  it('keeps the benchmark secrets folder and ssh keys unreadable in its profile', () => {
    const profile = sandboxProfile('/private/var/folders/x/T/yapi-v2-abc');
    expect(profile).toContain('(deny network*)');
    expect(profile).toContain(join(homedir(), 'pagosya-benchmarks'));
    expect(profile).toContain(join(homedir(), '.ssh'));
    expect(profile).toContain('(subpath "/var/folders/x/T/yapi-v2-abc")');
  });
});

describe('v2 build sandbox: the platform build', () => {
  it('returns the platform validator\'s refusal of a component that imports node modules, as a build error', async () => {
    const files = [
      ...nextProjectScaffold('Prueba').filter(file => file.path !== 'components/home.tsx'),
      { path: 'components/home.tsx', content: "import fs from 'fs';\nexport default function Home() { return <main><h1>{String(fs)}</h1></main>; }" },
    ];
    const brief = { audience: 'Clientes', sitePurpose: 'shop', businessType: 'Tienda en línea', primaryAction: 'Comprar en línea', visualDirection: 'Prueba' };
    const built = await buildInSandbox({ revision: 0, label: 'prueba', brief: brief as never, files } as never);
    expect(built.ok).toBe(false);
    if (!built.ok) { expect(built.kind).toBe('build'); expect(built.error).toMatch(/Import no permitido|fs/); }
  });
});

describe('the Linux build sandbox (spec 2026-11-17 V2 in the chat §7)', () => {
  it('runs node under bubblewrap: read-only root, the work directory writable, no network, secrets masked', () => {
    const { cmd, argv } = sandboxCommand('linux', '/tmp/yapi-v2-x', '/usr/bin/node', ['--max-old-space-size=768', 'child.cjs', 'dist'], { files: ['/app/apps/api/.env'], dirs: ['/home/u/.ssh'] });
    expect(cmd).toMatch(/bwrap$/);
    expect(argv.slice(0, 3)).toEqual(['--unshare-all', '--die-with-parent', '--new-session']);
    expect(argv.join(' ')).toContain('--ro-bind / /');
    expect(argv.join(' ')).toContain('--bind /tmp/yapi-v2-x /tmp/yapi-v2-x --chdir /tmp/yapi-v2-x');
    expect(argv.join(' ')).toContain('--ro-bind /dev/null /app/apps/api/.env');
    expect(argv.join(' ')).toContain('--tmpfs /home/u/.ssh');
    expect(argv.slice(-4)).toEqual(['/usr/bin/node', '--max-old-space-size=768', 'child.cjs', 'dist']);
  });
  it('keeps macOS on sandbox-exec and refuses any other platform', () => {
    expect(sandboxCommand('darwin', '/tmp/w', 'node', ['a.cjs'], { files: [], dirs: [] }).argv[0]).toBe('-p');
    expect(() => sandboxCommand('win32', '/tmp/w', 'node', [], { files: [], dirs: [] })).toThrow(/no sandbox for win32/);
  });
});
