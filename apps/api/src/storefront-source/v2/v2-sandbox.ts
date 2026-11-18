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
 *  On Linux (production) the same rules come from bubblewrap (spec 2026-11-17 V2 in the chat §7): a read-only root, the work
 *  directory the only writable place, no network namespace, .env files masked and the secrets folders hidden. There is no
 *  unsandboxed fallback. */

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

/** Where bubblewrap lives on the Linux build host (YAPI_SANDBOX_BWRAP overrides). */
const BWRAP = () => process.env.YAPI_SANDBOX_BWRAP || '/usr/bin/bwrap';

/** The command that runs node under the sandbox of this platform: macOS sandbox-exec, or Linux bubblewrap. Pure (the files it
 *  masks are passed in), so both shapes are tested on any machine. */
export function sandboxCommand(platform: NodeJS.Platform, work: string, node: string, nodeArgs: string[], hidden: { files: string[]; dirs: string[] }): { cmd: string; argv: string[] } {
  if (platform === 'darwin') return { cmd: SANDBOX_EXEC, argv: ['-p', sandboxProfile(work), node, ...nodeArgs] };
  if (platform === 'linux') return { cmd: BWRAP(), argv: [
    '--unshare-all', '--die-with-parent', '--new-session',
    '--ro-bind', '/', '/', '--dev', '/dev', '--proc', '/proc', '--tmpfs', '/tmp',
    '--bind', work, work, '--chdir', work,
    // Secrets: every .env masked by an empty file, the secrets folders by an empty tmpfs.
    ...hidden.files.flatMap(file => ['--ro-bind', '/dev/null', file]),
    ...hidden.dirs.flatMap(dir => ['--tmpfs', dir]),
    node, ...nodeArgs,
  ] };
  throw new Error(`v2 sandbox: no sandbox for ${platform}`);
}

/** The .env files and secret folders a sandboxed build must never read (only the ones that exist can be masked). */
export function sandboxSecrets(root: string): { files: string[]; dirs: string[] } {
  const repo = dirname(dirname(root));
  const files = [join(root, '.env'), join(root, '.env.local'), join(root, '.env.production'), join(repo, '.env')].filter(file => existsSync(file));
  const dirs = [join(homedir(), 'pagosya-benchmarks'), join(homedir(), '.ssh')].filter(dir => existsSync(dir));
  return { files, dirs };
}

/** Runs `script args…` with node inside the sandbox, in a fresh temp directory that holds `files` first. */
export async function runSandboxed(script: string, args: string[], files: Record<string, string>, opts: { timeoutMs?: number; heapMb?: number } = {}): Promise<SandboxRun> {
  const tool = process.platform === 'darwin' ? SANDBOX_EXEC : process.platform === 'linux' ? BWRAP() : '';
  if (!tool || !existsSync(tool)) throw new Error(`v2 sandbox: no sandbox on this machine (${process.platform}: ${tool || 'unsupported'})`);
  const work = await realpath(await mkdtemp(join(tmpdir(), 'yapi-v2-')));
  for (const [name, content] of Object.entries(files)) await writeFile(join(work, name), content);
  const started = Date.now();
  return new Promise<SandboxRun>(resolve => {
    const { cmd, argv } = sandboxCommand(process.platform, work, process.execPath, [`--max-old-space-size=${opts.heapMb ?? 768}`, script, ...args], sandboxSecrets(apiRoot()));
    const child = spawn(cmd, argv,
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
