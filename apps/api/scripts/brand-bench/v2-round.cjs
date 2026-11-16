// node v2-round.cjs <waveSize> key:storeId … — the V2 prototype on several benchmark stores, a wave at a time (the ChatGPT bridge
// takes a few calls at once): starts each store's run, waits until every run of the wave is DONE or FAILED, prints each attempt as
// it ends, and appends one JSON line per store to examples/brand-bench/v2/rounds.jsonl. Dev only (YAPI_V2_PROTO=1).
const fs = require('node:fs');
const path = require('node:path');
const { API, BENCH, live } = require('./common.cjs');

const [size, ...jobs] = process.argv.slice(2);
if (!Number(size) || !jobs.length) { console.error('usage: node v2-round.cjs <waveSize> key:storeId …'); process.exit(1); }
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const url = id => `${API}/v1/stores/${id}/source-project/v2-prototype`;
const headers = () => ({ authorization: `Bearer ${live().token}`, 'content-type': 'application/json' });
const out = path.join(BENCH, 'v2', 'rounds.jsonl');
fs.mkdirSync(path.dirname(out), { recursive: true });

(async () => {
  for (let i = 0; i < jobs.length; i += Number(size)) {
    const wave = jobs.slice(i, i + Number(size)).map(job => { const [key, id] = job.split(':'); return { key, id, seen: 0, done: false }; });
    for (const store of wave) {
      // No references named: the builder picks the closest real stores of its library for each brand.
      const res = await fetch(url(store.id), { method: 'POST', headers: headers(), body: JSON.stringify({}) });
      console.log(new Date().toTimeString().slice(0, 8), store.key, 'start', res.status);
      if (!res.ok) { store.done = true; fs.appendFileSync(out, JSON.stringify({ key: store.key, storeId: store.id, status: 'NOT_STARTED', http: res.status, at: new Date().toISOString() }) + '\n'); }
    }
    while (wave.some(store => !store.done)) {
      await sleep(20_000);
      for (const store of wave.filter(entry => !entry.done)) {
        const state = await fetch(url(store.id), { headers: headers() }).then(res => res.json()).catch(() => null);
        if (!state) continue;
        for (const attempt of (state.attempts ?? []).slice(store.seen)) console.log(new Date().toTimeString().slice(0, 8), store.key, `attempt ${attempt.attempt} ${attempt.outcome}`, Math.round(attempt.ms / 1000) + 's', (attempt.repairs ?? []).length ? `repairs ${attempt.repairs.length}` : '', attempt.problems.slice(0, 3).join(' | ').slice(0, 300));
        store.seen = (state.attempts ?? []).length;
        if (state.status === 'DONE' || state.status === 'FAILED') {
          store.done = true;
          const ms = Date.now() - Date.parse(state.startedAt);
          console.log(new Date().toTimeString().slice(0, 8), store.key, state.status, state.revision ? `rev ${state.revision}` : '', Math.round(ms / 60e3) + ' min', `$${(state.usd ?? 0).toFixed(2)}`, state.error ? state.error.slice(0, 200) : '');
          fs.appendFileSync(out, JSON.stringify({ key: store.key, storeId: store.id, status: state.status, revision: state.revision ?? null, minutes: Number((ms / 60e3).toFixed(1)), usd: state.usd, references: state.references ?? [],
            attempts: (state.attempts ?? []).map(attempt => ({ outcome: attempt.outcome, seconds: Math.round(attempt.ms / 1000), problems: attempt.problems, repairs: attempt.repairs ?? [] })),
            checks: state.checks ? { rules: state.checks.rules, distanceFromTemplate: state.checks.distanceFromTemplate, shopping: state.checks.shopping } : null, error: state.error ?? null, at: new Date().toISOString() }) + '\n');
        }
      }
    }
  }
  console.log('ALL DONE', new Date().toTimeString().slice(0, 8));
})().catch(error => { console.error(error.message); process.exit(1); });
