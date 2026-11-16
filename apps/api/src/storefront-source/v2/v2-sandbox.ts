import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import type { SourceProjectSnapshot } from '../source-project';
import type { SaveSourceProjectDto } from '../dto/save-source-project.dto';

/** V2 prototype build sandbox (docs/superpowers/specs/2026-11-14-v2-prototype-design.md §4): model-written source is validated and
 *  compiled by the platform's own prepare(), but in a child process under macOS `sandbox-exec` — no network, no writes outside its
 *  own temp directory, no reads of .env files or the benchmark secrets folder, an empty environment, a heap cap and a wall clock.
 *  Production needs a container worker instead (V2 §7); there is no unsandboxed fallback here. */

export type SandboxRun = { code: number | null; signal: NodeJS.Signals | null; ms: number; timedOut: boolean; stdout: string; stderr: string; work: string };
export type SandboxBuild = { ok: true; snapshot: SourceProjectSnapshot; ms: number } | { ok: false; kind: 'build' | 'timeout' | 'crash'; error: string; ms: number };

const SANDBOX_EXEC = '/usr/bin/sandbox-exec';
const quote = (value: string) => `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;

/** apps/api, found from this file whether it runs from src (tests) or dist (the API). */
export function apiRoot(from = __dirname): string {
  let dir = from;
  for (let i = 0; i < 8; i++) {
    if (existsSync(join(dir, 'scripts', 'v2-sandbox-child.cjs'))) return dir;
    dir = dirname(dir);
  }
  throw new Error('v2 sandbox: apps/api not found');
}

/** The seatbelt profile: everything a build reads is allowed (node, esbuild's binary, node_modules, the kit), but no network, no
 *  writes except the work directory, and never the secrets. */
export function sandboxProfile(work: string): string {
  const writable = [...new Set([work, work.startsWith('/private/') ? work.slice('/private'.length) : `/private${work}`])];
  return `(version 1)(allow default)(deny network*)(deny file-write*)(allow file-write* ${writable.map(dir => `(subpath ${quote(dir)})`).join(' ')} (literal "/dev/null"))`
    + `(deny file-read* (regex #"/\\.env(\\..*)?$") (subpath ${quote(join(homedir(), 'pagosya-benchmarks'))}) (subpath ${quote(join(homedir(), '.ssh'))}))`;
}

/** Runs `script args…` with node inside the sandbox, in a fresh temp directory that holds `files` first. */
export async function runSandboxed(script: string, args: string[], files: Record<string, string>, opts: { timeoutMs?: number; heapMb?: number } = {}): Promise<SandboxRun> {
  if (process.platform !== 'darwin' || !existsSync(SANDBOX_EXEC)) throw new Error('v2 sandbox: sandbox-exec is not available on this machine');
  const work = await realpath(await mkdtemp(join(tmpdir(), 'yapi-v2-')));
  for (const [name, content] of Object.entries(files)) await writeFile(join(work, name), content);
  const started = Date.now();
  return new Promise<SandboxRun>(resolve => {
    const child = spawn(SANDBOX_EXEC, ['-p', sandboxProfile(work), process.execPath, `--max-old-space-size=${opts.heapMb ?? 768}`, script, ...args],
      { cwd: work, env: { PATH: '/usr/bin:/bin', NODE_ENV: 'production' }, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '', timedOut = false;
    child.stdout.on('data', chunk => { stdout = (stdout + chunk).slice(-20_000); });
    child.stderr.on('data', chunk => { stderr = (stderr + chunk).slice(-20_000); });
    const timer = setTimeout(() => { timedOut = true; child.kill('SIGKILL'); }, opts.timeoutMs ?? 120_000);
    child.on('close', (code, signal) => { clearTimeout(timer); resolve({ code, signal, ms: Date.now() - started, timedOut, stdout, stderr, work }); });
  });
}

/** prepare() on model-written files, in the sandbox. The snapshot that comes back is the one that is checked and saved. */
export async function buildInSandbox(input: SaveSourceProjectDto, opts: { timeoutMs?: number; heapMb?: number } = {}): Promise<SandboxBuild> {
  const root = apiRoot();
  const run = await runSandboxed(join(root, 'scripts', 'v2-sandbox-child.cjs'), [join(root, 'dist', 'src')], { 'in.json': JSON.stringify(input) }, opts);
  try {
    if (run.timedOut) return { ok: false, kind: 'timeout', error: `la compilación pasó de ${Math.round((opts.timeoutMs ?? 120_000) / 1000)} s`, ms: run.ms };
    const out = await readFile(join(run.work, 'out.json'), 'utf8').then(text => JSON.parse(text) as { ok: boolean; snapshot?: SourceProjectSnapshot; error?: string }).catch(() => null);
    if (!out) return { ok: false, kind: 'crash', error: (run.stderr || `exit ${run.code ?? run.signal}`).slice(-1500), ms: run.ms };
    return out.ok && out.snapshot ? { ok: true, snapshot: out.snapshot, ms: run.ms } : { ok: false, kind: 'build', error: out.error ?? 'error desconocido', ms: run.ms };
  } finally {
    await rm(run.work, { recursive: true, force: true });
  }
}
