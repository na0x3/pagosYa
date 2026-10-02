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
