/**
 * Record & replay for scripts/evaluate-yapi-agent.ts. EVALUATION ONLY: the API never imports this file.
 *
 * A real YAPI build talks to a model for minutes; everything after the answers (validators, repairs, header/DNA,
 * compilation, kit CSS, preflight, saving) is ordinary code. Recording keeps each model exchange of a real run, in
 * order, per case; replay serves those answers back with no network so that code runs for real offline.
 *
 * The seam is the script process's globalThis.fetch, for model providers only (the OpenAI and Anthropic APIs and the
 * local ChatGPT-plan bridge); every other fetch passes through untouched. A run's chance (Math.random draws and the
 * "recent designs" lookups the script pins) is recorded alongside, so a replay draws the same frame, style and sketch.
 *
 * Replay never falls through to a provider: a call the recording does not have (one call too many, or a request that
 * differs from the recorded one) throws a ReplayMismatchError naming the case and the call, and the case is reported
 * as a replay mismatch even when the build recovers from the thrown call. Recordings go stale when prompts change.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const MODEL_HOSTS = new Set(['api.openai.com', 'api.anthropic.com']);
const LOOPBACK = new Set(['127.0.0.1', 'localhost', '[::1]']);
const NULL_BODY_STATUSES = new Set([101, 204, 205, 304]);

/** True for a model provider request: the OpenAI or Anthropic API, or the local ChatGPT-plan bridge (any port). */
export function isModelCall(url: string): boolean {
  let parsed: URL;
  try { parsed = new URL(url); } catch { return false; }
  if (MODEL_HOSTS.has(parsed.hostname)) return true;
  return LOOPBACK.has(parsed.hostname) && /^\/v1\/(responses|messages)$/.test(parsed.pathname);
}

/** What identifies a model call. `input` is kept apart: it is the part a run's own tool results feed back into. */
export type CallFingerprint = { endpoint: string; model: string; format: string; tools: string; instructions: string; input: string };

export type RecordedExchange = {
  index: number;
  startedAt: string;
  durationMs: number;
  request: { method: string; url: string; body?: unknown; bodyText?: string; bodyKind?: string };
  fingerprint: CallFingerprint;
  response?: { status: number; statusText: string; headers: Record<string, string>; body: string };
  error?: { name: string; message: string; code?: string };
};

export type TapeCaseReport = {
  caseId: string; run: number;
  /** Model calls the code made in this case. */
  calls: number;
  /** Replay only: calls in the recording, and how many were never asked for. */
  recorded?: number; unused?: number;
  /** Replay only: calls served whose input differed from the recording (--replay-loose). */
  drift: string[];
  notes: string[];
  /** Replay only: the first call the recording could not serve. Its presence fails the case. */
  mismatch?: string;
  /** Replay only: the outcome the recording run reported for this case. */
  recordedOutcome?: unknown;
};

export class ReplayMismatchError extends Error {
  override name = 'ReplayMismatchError';
}

/** Dates, ids and clock readings change on every run without changing what is asked. */
export function normalizeVolatile(text: string): string {
  return text
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, '<uuid>')
    .replace(/\b\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?/g, '<time>')
    .replace(/\b\d{4}-\d{2}-\d{2}\b/g, '<date>')
    .replace(/\b1\d{12}\b/g, '<ms>')
    .replace(/\bc[a-z0-9]{24}\b/g, '<id>');
}

const digest = (text: string) => createHash('sha256').update(text).digest('hex').slice(0, 16);

/** Long inline data URLs (photos sent to the model) are stored as a digest so recordings stay readable and small. */
function redact(value: unknown): unknown {
  if (typeof value === 'string') return value.startsWith('data:') && value.length > 512 ? `${value.slice(0, value.indexOf(',') + 1 || 40)}<sha256:${digest(value)};chars:${value.length}>` : value;
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, redact(entry)]));
  return value;
}

function endpointOf(method: string, url: string): string {
  try {
    const parsed = new URL(url);
    // The bridge listens on a new port every launch.
    return `${method.toUpperCase()} ${LOOPBACK.has(parsed.hostname) ? 'chatgpt-bridge' : parsed.hostname}${parsed.pathname}`;
  } catch { return `${method.toUpperCase()} ${url}`; }
}

/** The text a field is compared on: redacted, volatile tokens masked. */
function fieldText(value: unknown): string {
  return normalizeVolatile(typeof value === 'string' ? value : JSON.stringify(value ?? null));
}

/** Splits a (redacted) request body into the parts replay compares. */
export function fingerprintOf(method: string, url: string, body: unknown, bodyText?: string): CallFingerprint {
  const endpoint = endpointOf(method, url);
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { endpoint, model: '', format: '', tools: '', instructions: '', input: digest(normalizeVolatile(bodyText ?? '')) };
  const request = body as Record<string, any>;
  const tools = Array.isArray(request.tools) ? request.tools.map((tool: any) => String(tool?.name ?? tool?.type ?? '?')).join(',') : '';
  return {
    endpoint,
    model: String(request.model ?? ''),
    format: String(request.text?.format?.name ?? request.text?.format?.type ?? ''),
    tools,
    instructions: digest(fieldText(request.instructions ?? request.system ?? '')),
    input: digest(fieldText(request.input ?? request.messages ?? '')),
  };
}

const sameCall = (a: CallFingerprint, b: CallFingerprint) => a.endpoint === b.endpoint && a.model === b.model && a.format === b.format && a.tools === b.tools && a.instructions === b.instructions;

/** Where the two texts first part, with a little context either side. */
function firstDifference(recorded: string, now: string): string {
  let at = 0;
  while (at < recorded.length && at < now.length && recorded[at] === now[at]) at++;
  const window = (text: string) => JSON.stringify(text.slice(Math.max(0, at - 40), at + 80));
  return `first difference at character ${at}: recorded ${window(recorded)}, now ${window(now)}`;
}

function describeDifference(recorded: RecordedExchange, now: { fingerprint: CallFingerprint; body: unknown }): string[] {
  const lines: string[] = [];
  const a = recorded.fingerprint, b = now.fingerprint;
  if (a.endpoint !== b.endpoint) lines.push(`endpoint: recorded ${a.endpoint}, now ${b.endpoint}`);
  if (a.model !== b.model) lines.push(`model: recorded ${a.model || '—'}, now ${b.model || '—'}`);
  if (a.format !== b.format) lines.push(`response format: recorded ${a.format || '—'}, now ${b.format || '—'}`);
  if (a.tools !== b.tools) lines.push(`tools: recorded [${a.tools}], now [${b.tools}]`);
  const recordedBody = (recorded.request.body ?? {}) as Record<string, any>, nowBody = (now.body ?? {}) as Record<string, any>;
  if (a.instructions !== b.instructions) lines.push(`instructions (the prompt) changed, ${firstDifference(fieldText(recordedBody.instructions ?? recordedBody.system ?? ''), fieldText(nowBody.instructions ?? nowBody.system ?? ''))}`);
  if (a.input !== b.input) lines.push(`input changed, ${firstDifference(fieldText(recordedBody.input ?? recordedBody.messages ?? recorded.request.bodyText ?? ''), fieldText(nowBody.input ?? nowBody.messages ?? ''))}`);
  return lines;
}

type TapeRequest = { method: string; url: string; body?: unknown; bodyText?: string; bodyKind?: string; signal?: AbortSignal | null };

const urlOf = (input: string | URL | Request) => typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;

/** Reads what a fetch call is asking for. Bodies other than strings (form data) are described, not stored. */
export function describeRequest(input: string | URL | Request, init?: RequestInit): TapeRequest {
  const url = urlOf(input);
  const method = (init?.method ?? (typeof input === 'object' && 'method' in input ? input.method : undefined) ?? 'GET').toUpperCase();
  const signal = init?.signal ?? (typeof input === 'object' && 'signal' in input ? input.signal : undefined);
  const raw = init?.body;
  if (raw === undefined || raw === null) return { method, url, signal };
  if (typeof raw !== 'string') return { method, url, signal, bodyKind: raw?.constructor?.name ?? typeof raw, bodyText: `[${raw?.constructor?.name ?? typeof raw} body]` };
  try { return { method, url, signal, body: redact(JSON.parse(raw)) }; } catch { return { method, url, signal, bodyText: raw }; }
}

const caseFolder = (dir: string, caseId: string, run: number) => join(dir, 'cases', `${caseId.replace(/[^\w.-]+/g, '-')}--run${run}`);
const writeJson = (path: string, value: unknown) => writeFileSync(path, JSON.stringify(value, null, 2), { mode: 0o600 });
const readJson = <T>(path: string): T => JSON.parse(readFileSync(path, 'utf8')) as T;

export function writeRecordingMeta(dir: string, meta: Record<string, unknown>) {
  mkdirSync(dir, { recursive: true });
  writeJson(join(dir, 'recording.json'), { version: 1, ...meta });
}

export function readRecordingMeta<T = Record<string, any>>(dir: string): T {
  const path = join(dir, 'recording.json');
  if (!existsSync(path)) throw new Error(`No recording at ${dir} (missing recording.json). Record one first with --record ${dir}.`);
  return readJson<T>(path);
}

/** The metadata a case was recorded with (its brief, snapshot and revision), without opening it. */
export function readCaseMeta<T = Record<string, any>>(dir: string, caseId: string, run: number): T {
  const path = join(caseFolder(dir, caseId, run), 'case.json');
  if (!existsSync(path)) throw new Error(`No recording for case "${caseId}" run ${run} (expected ${path}). Replay the cases that were recorded, or re-record.`);
  return readJson<T>(path);
}

/** What the recording run reported for a case, so a replay can be compared with it. */
export function writeCaseOutcome(dir: string, caseId: string, run: number, outcome: unknown) {
  writeJson(join(caseFolder(dir, caseId, run), 'outcome.json'), outcome);
}

type ActiveCase = {
  caseId: string; run: number; folder: string; calls: number;
  chance: Record<string, unknown[]>; chanceRead: Record<string, number>;
  exchanges: RecordedExchange[]; consumed: Set<number>;
  drift: string[]; notes: string[]; mismatch?: string; recordedOutcome?: unknown;
};

export type ModelTape = {
  readonly mode: 'record' | 'replay';
  /** Record: writes the case's metadata. Replay: loads the case and returns the metadata it was recorded with. */
  startCase(caseId: string, run: number, meta?: Record<string, unknown>): Record<string, any>;
  /** Record: keeps the run's chance. Replay: reports what was served. */
  finishCase(): TapeCaseReport;
  /** One model call: record runs it for real and keeps it; replay answers from the recording. */
  exchange(request: TapeRequest, real: () => Promise<Response>): Promise<Response>;
  /** A synchronous chance value (Math.random): kept when recording, served back when replaying. */
  chance<T>(kind: string, real: () => T): T;
  /** An asynchronous chance value (a "recent designs" lookup). */
  chanceAsync<T>(kind: string, real: () => Promise<T>): Promise<T>;
};

/**
 * @param options.loose replay: serve a call whose instructions, model, tools and format match the recording even when
 *   its input differs (a changed tool result fed back to the model); the difference is reported as drift.
 */
export function createModelTape(mode: 'record' | 'replay', dir: string, options: { loose?: boolean; log?: (line: string) => void } = {}): ModelTape {
  const log = options.log ?? (line => console.error(line));
  let active: ActiveCase | undefined;
  const label = (current: ActiveCase) => `"${current.caseId}" run ${current.run}`;

  const record = async (current: ActiveCase, request: TapeRequest, real: () => Promise<Response>): Promise<Response> => {
    const index = ++current.calls;
    const started = Date.now();
    const exchange: RecordedExchange = { index, startedAt: new Date(started).toISOString(), durationMs: 0, request: { method: request.method, url: request.url, ...(request.body !== undefined ? { body: request.body } : {}), ...(request.bodyText !== undefined ? { bodyText: request.bodyText } : {}), ...(request.bodyKind ? { bodyKind: request.bodyKind } : {}) }, fingerprint: fingerprintOf(request.method, request.url, request.body, request.bodyText) };
    const keep = () => { exchange.durationMs = Date.now() - started; mkdirSync(join(current.folder, 'calls'), { recursive: true }); writeJson(join(current.folder, 'calls', `${String(index).padStart(4, '0')}.json`), exchange); };
    let response: Response;
    try { response = await real(); }
    catch (error) {
      const cause = (error as { cause?: { code?: string } })?.cause;
      exchange.error = { name: (error as Error)?.name ?? 'Error', message: (error as Error)?.message ?? String(error), ...(cause?.code ? { code: cause.code } : {}) };
      keep();
      throw error;
    }
    try {
      const headers: Record<string, string> = {};
      response.headers.forEach((value, key) => { if (key !== 'set-cookie') headers[key] = value; });
      exchange.response = { status: response.status, statusText: response.statusText, headers, body: await response.clone().text() };
    } catch (error) {
      exchange.error = { name: (error as Error)?.name ?? 'Error', message: `reading the response failed: ${(error as Error)?.message}` };
    }
    keep();
    return response;
  };

  const replay = async (current: ActiveCase, request: TapeRequest): Promise<Response> => {
    const index = ++current.calls;
    if (request.signal?.aborted) throw request.signal.reason ?? new DOMException('This operation was aborted', 'AbortError');
    const fingerprint = fingerprintOf(request.method, request.url, request.body, request.bodyText);
    const describe = `call #${index} (${fingerprint.endpoint}${fingerprint.model ? ` ${fingerprint.model}` : ''}${fingerprint.format ? ` ${fingerprint.format}` : ''})`;
    if (current.mismatch) throw new ReplayMismatchError(`${describe} refused: this replay already stopped. ${current.mismatch}`);
    const pending = current.exchanges.filter(exchange => !current.consumed.has(exchange.index));
    let match = pending.find(exchange => sameCall(exchange.fingerprint, fingerprint) && exchange.fingerprint.input === fingerprint.input);
    if (!match && options.loose) {
      match = pending.find(exchange => sameCall(exchange.fingerprint, fingerprint));
      if (match) current.drift.push(`${describe} served recorded call #${match.index} although its input differs: ${describeDifference(match, { fingerprint, body: request.body }).join('; ')}`);
    }
    if (!match) {
      const nearest = pending.find(exchange => exchange.fingerprint.endpoint === fingerprint.endpoint && exchange.fingerprint.model === fingerprint.model && exchange.fingerprint.format === fingerprint.format) ?? pending[0];
      const why = !pending.length
        ? [`the recording has ${current.exchanges.length} model call${current.exchanges.length === 1 ? '' : 's'} and all were already served; the code asked for one more`]
        : [`closest unserved recorded call is #${nearest.index}`, ...describeDifference(nearest, { fingerprint, body: request.body })];
      current.mismatch = `Replay of case ${label(current)}: ${describe} is not in the recording. ${why.join('; ')}. If prompts, the store or its catalogue changed since recording, re-record with --record.`;
      log(`\n✖ ${current.mismatch}\n`);
      throw new ReplayMismatchError(current.mismatch);
    }
    current.consumed.add(match.index);
    if (match.error) {
      if (match.error.name === 'AbortError' || match.error.name === 'TimeoutError') throw new DOMException(match.error.message, match.error.name);
      throw Object.assign(new Error(match.error.message), { name: match.error.name, ...(match.error.code ? { cause: { code: match.error.code } } : {}) });
    }
    const response = match.response!;
    return new Response(NULL_BODY_STATUSES.has(response.status) ? null : response.body, { status: response.status, statusText: response.statusText, headers: response.headers });
  };

  const nextChance = (current: ActiveCase, kind: string): { found: true; value: unknown } | { found: false } => {
    const values = current.chance[kind] ?? [];
    const at = current.chanceRead[kind] ?? 0;
    if (at < values.length) { current.chanceRead[kind] = at + 1; return { found: true, value: structuredClone(values[at]) }; }
    const note = `${kind}: more draws than recorded (${values.length}); the rest are live`;
    if (!current.notes.includes(note)) current.notes.push(note);
    return { found: false };
  };
  const keepChance = (current: ActiveCase, kind: string, value: unknown) => { (current.chance[kind] ??= []).push(value === undefined ? null : structuredClone(value)); };

  return {
    mode,
    startCase(caseId, run, meta = {}) {
      if (active) throw new Error(`Case "${active.caseId}" run ${active.run} is still open.`);
      const folder = caseFolder(dir, caseId, run);
      const base = { caseId, run, folder, calls: 0, chance: {}, chanceRead: {}, exchanges: [], consumed: new Set<number>(), drift: [], notes: [] };
      if (mode === 'record') {
        mkdirSync(folder, { recursive: true });
        writeJson(join(folder, 'case.json'), { caseId, run, recordedAt: new Date().toISOString(), ...meta });
        active = base;
        return { caseId, run, ...meta };
      }
      const recordedMeta = readCaseMeta(dir, caseId, run);
      const callsDir = join(folder, 'calls');
      const exchanges = existsSync(callsDir) ? readdirSync(callsDir).filter(name => name.endsWith('.json')).sort().map(name => readJson<RecordedExchange>(join(callsDir, name))) : [];
      const chance = existsSync(join(folder, 'chance.json')) ? readJson<Record<string, unknown[]>>(join(folder, 'chance.json')) : {};
      const recordedOutcome = existsSync(join(folder, 'outcome.json')) ? readJson<unknown>(join(folder, 'outcome.json')) : undefined;
      active = { ...base, exchanges, chance, recordedOutcome };
      return recordedMeta;
    },
    finishCase() {
      if (!active) throw new Error('No case is open.');
      const current = active;
      active = undefined;
      if (mode === 'record') {
        writeJson(join(current.folder, 'chance.json'), current.chance);
        return { caseId: current.caseId, run: current.run, calls: current.calls, drift: [], notes: current.notes };
      }
      return { caseId: current.caseId, run: current.run, calls: current.calls, recorded: current.exchanges.length, unused: current.exchanges.length - current.consumed.size, drift: current.drift, notes: current.notes, ...(current.mismatch ? { mismatch: current.mismatch } : {}), ...(current.recordedOutcome !== undefined ? { recordedOutcome: current.recordedOutcome } : {}) };
    },
    exchange(request, real) {
      if (!active) {
        // Outside a case: a recording passes it through; a replay must never reach a provider.
        if (mode === 'record') { log(`Recording: a model call to ${endpointOf(request.method, request.url)} outside any case was not recorded; a replay will refuse it.`); return real(); }
        return Promise.reject(new ReplayMismatchError(`Replay: a model call to ${endpointOf(request.method, request.url)} was made outside any case; it is not in the recording.`));
      }
      return mode === 'record' ? record(active, request, real) : replay(active, request);
    },
    chance(kind, real) {
      const current = active;
      if (!current) return real();
      if (mode === 'replay') { const next = nextChance(current, kind); if (next.found) return next.value as ReturnType<typeof real>; return real(); }
      const value = real();
      keepChance(current, kind, value);
      return value;
    },
    async chanceAsync(kind, real) {
      const current = active;
      if (!current) return real();
      if (mode === 'replay') { const next = nextChance(current, kind); if (next.found) return next.value as Awaited<ReturnType<typeof real>>; return real(); }
      const value = await real();
      keepChance(current, kind, value);
      return value;
    },
  };
}

/**
 * Routes this process's model calls and Math.random through the tape. Non-model fetches go to the original fetch
 * untouched. Returns a function that puts both back.
 */
export function installModelTape(tape: ModelTape, target: { fetch: typeof fetch } = globalThis): () => void {
  const originalFetch = target.fetch;
  const originalRandom = Math.random;
  const taped = ((input: string | URL | Request, init?: RequestInit) => {
    if (!isModelCall(urlOf(input))) return originalFetch(input, init);
    return tape.exchange(describeRequest(input, init), () => originalFetch(input, init));
  }) as typeof fetch;
  target.fetch = taped;
  Math.random = () => tape.chance('Math.random', originalRandom);
  return () => { target.fetch = originalFetch; Math.random = originalRandom; };
}

/** Pins an object's async lookups (the "recent designs" a build avoids) to the tape, by method name. */
export function pinAsyncMethods(tape: ModelTape, target: object, label: string, names: string[]) {
  for (const name of names) {
    const original = (target as Record<string, unknown>)[name];
    if (typeof original !== 'function') continue;
    (target as Record<string, unknown>)[name] = (...args: unknown[]) => tape.chanceAsync(`${label}.${name}`, () => Promise.resolve((original as (...a: unknown[]) => unknown).apply(target, args)));
  }
}
