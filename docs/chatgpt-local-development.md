# Try Yapi using your ChatGPT plan

This opt-in local development mode connects your own eligible ChatGPT Plus/Pro account to Yapi's storefront generator, inventory CSV review, and product-photo interpretation. It uses OpenAI's supported Sign in with ChatGPT flow and the public Responses API. It never reads Codex credentials or browser cookies.

## Connect

1. Run `pnpm chatgpt:login` and open the local **Continue with ChatGPT** link printed in the terminal.
2. Allow ChatGPT plan usage for **Yapi Local**. In [ChatGPT usage settings](https://chatgpt.com/settings/usage), leave credit spending disabled if you only want your included allowance.
3. Run `pnpm chatgpt:models` to see the models available to your account.
4. Optionally verify inference with `pnpm chatgpt:smoke <model-slug>`. This makes three small requests using your plan allowance, checking structured output and the tool-call conversation used by Yapi.

## Run Yapi

Stop the existing development launcher/API on port 3001, then run `pnpm dev:chatgpt`. This starts the development stack and a protected local bridge. Existing non-API services are reused when already running. The launcher refuses to reuse an existing API, preventing an accidental connection to a process using paid credentials.

Select a GPT model supported by both your account and Yapi's model picker. The launcher does not silently substitute models. Companion planning/conversation calls also require their configured GPT models to be available to your account. Use `OPENAI_CONVERSATION_MODEL` and `OPENAI_DESIGN_MODEL` for existing supported model choices where needed.

The API binds to 127.0.0.1 in this mode. Claude, DeepSeek, paid OpenAI credentials and image generation are disabled, including keys in the API's `.env`. The connection stops on errors or limits; it never falls back to paid API usage. Local ChatGPT mode does not impose Yapi credit limits; execution time and step limits and your ChatGPT plan allowance still apply. Other features that require a paid AI key remain unavailable unless explicitly connected to the local bridge.

ChatGPT plan usage supports text/code generation and image inputs. Image generation is not supported by this preview. Model availability and plan limits come from your ChatGPT account. The preview also does not accept `max_output_tokens`; Yapi's prompt budgets remain guidance, not a provider-enforced token ceiling.

## Account and mode management

- `pnpm chatgpt:status`: report whether local credentials exist.
- `pnpm chatgpt:logout`: clear tokens and attempt remote session revocation. Stop the local API launcher first.
- To return to ordinary API mode, stop `pnpm dev:chatgpt` and restart the API normally. No `.env` keys are overwritten.

Credentials and the stable host ID live in the ignored `.yapi-chatgpt/` directory, with owner-only permissions. One command at a time owns the refresh-token session. Sign-out retains the account registration for reconnecting to the same account. This is a single-account local development tool, not a hosted customer login integration.

The bridge translates Yapi requests into streaming Responses requests and only returns success after `response.completed`. It preserves output and usage, namespaces local function tools, propagates cancellation, and rejects incomplete or interrupted streams.

References: [local app integration](https://developers.openai.com/siwc/token-sharing-open-source), [sign-in](https://developers.openai.com/siwc/token-sharing-open-source/sign-in), [preview limitations](https://developers.openai.com/siwc/token-sharing-open-source/preview-limitations).

Run offline checks with `pnpm test:chatgpt`. A real account sign-in and completed inference are still required to verify account eligibility end to end.

If a previously working session reports a connection failure, restart the development launcher with `pnpm dev:chatgpt --skip-setup` after stopping the old launcher. This reuses the prepared database and shared-type build without running migrations. The development stack shuts down when its ChatGPT bridge disappears, so the API cannot keep serving with a dead bridge address.

## Record a run, replay it offline

A real YAPI evaluation takes about 12 minutes of plan allowance. Most changes worth checking happen after the model answers (validators, repairs, header/DNA, compilation, kit CSS, preflight, saving), so `apps/api/scripts/evaluate-yapi-agent.ts` can record a real run once and replay it as often as needed with no model at all.

**Record** a real run with `--record <dir>`. Through the plan launcher (its evaluation runs from `apps/api`, so paths are relative to it):

```sh
node scripts/chatgpt-plan.mjs evaluate --merchant <id> --store <id> --engine agent \
  --suite scripts/fixtures/yapi-everyday-suite.json --record ../../.yapi-evaluation/recordings/everyday-2026-10-13
```

Keep recordings under the ignored `.yapi-evaluation/recordings/`: they hold the store's brief, snapshot and catalogue as sent to the model (credentials are never written). Each recording has `recording.json` (engine, store, model, provider, suite) and one folder per case, `cases/<case>--run<n>/`: `case.json` (brief, snapshot, revision, model), `calls/0001.json`… (each model request and response, in order), `chance.json` (the run's `Math.random` draws and "recent designs" lookups, so a replay draws the same frame, style and sketch) and `outcome.json` (what the real run reported).

**Replay** the same cases with `--replay <dir>`. It makes no model calls, so it needs neither `--i-accept-costs`, the ChatGPT bridge nor port 3001:

```sh
cd apps/api
npx ts-node --transpile-only scripts/evaluate-yapi-agent.ts --replay ../../.yapi-evaluation/recordings/everyday-2026-10-13
```

Store, engine, model, runs and suite come from the recording. Everything after the model runs for real, including writing the candidate generation to the dev database as a real evaluation does, so the database must be running. Every case prints one line in both modes (passed or failed, the reason, code repairs, failed model attempts, duration, and on replay the calls served and the recorded outcome), so two replays, or a replay and its recording, can be compared; `--out`, `--shot` and `--candidate-out` work as usual.

**Recordings go stale.** A replay serves a recorded answer only to the same request: same endpoint, model, response format, tools, prompt and input (ids, dates and clock readings are ignored). When a prompt changes, or the store's revision or catalogue changed since recording, the first call that differs fails the case loudly as `replay_mismatch`, naming the case, the call number and where the request first differs, and no later call is served. That is expected: re-record. A code change that alters a tool result the agent reads back also changes the next request; `--replay-loose` serves such calls anyway and lists them as drift, knowing the recorded answer may no longer fit. A run that asks for fewer calls than recorded passes and reports the unused ones.
