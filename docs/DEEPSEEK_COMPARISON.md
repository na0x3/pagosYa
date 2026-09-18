# DeepSeek alongside OpenAI

YAPI's source editor supports DeepSeek Flash, Pro and Flash Vision (experimental), alongside the existing GPT choices. Select a model under **Modelo**. An explicit selection applies to interpretation, source generation and its repair; it persists in this browser across reloads. **Auto · OpenAI** retains the existing GPT routing. There is no fallback to a different provider.

Set `DEEPSEEK_API_KEY` in `apps/api/.env`, or in the API server's environment, and restart the API. Keys stay on the server; never put them in frontend environment variables. `DEEPSEEK_ENABLED=false` disables this integration independently of OpenAI. DeepSeek can run without an OpenAI key. This covers source-editor conversation and site generation; other features such as image generation and brand import retain their existing integrations.

Requests use DeepSeek's stateless Responses endpoint with the same prompts, JSON schema, source validation, revision protection and shared request budget as OpenAI. OpenAI-specific cache options are removed. DeepSeek uses non-thinking mode for code generation and repair, and low reasoning for chat. Its Responses API maps medium to high; even low reasoning consumed 7,799–9,576 of a 12,000-token allowance in live trials, leaving insufficient room to finish the files. Both diagnostic trials are retained. Per-attempt receipts now retain reasoning effort and provider-reported reasoning token counts when available. Selected text models reject image attachments before a paid call; choose Flash Vision to interpret uploaded pixels. Existing bundled site images remain available in source context without being resent as new attachments.

Pricing checked September 9, 2026, in [DeepSeek's official table](https://api-docs.deepseek.com/quick_start/pricing/): conservative peak estimates per million tokens are Flash/Vision $0.44 input, $0.014 cached input, $1.32 output; Pro $1.32/$0.044/$3.96. Off-peak invoices can be lower. OpenAI's long-context and cache-write premiums do not apply to DeepSeek. Costs include reasoning output and failed attempts where usage is available; unknown usage stays unknown. Credit limits are estimates, not a guarantee on the provider invoice.

## Repeatable comparison

From the repository root:

```sh
# No API calls: show models, requests and estimated budget.
pnpm benchmark:source --dry-run

# Small comparison: identical café brief + title edit for Terra and Flash.
# Four requests, each with an estimated 25-credit ($0.25) limit including repair.
pnpm benchmark:source --models deepseek-v4-flash,gpt-5.6-terra --cases cafe --max-credits 25 --out ../../tmp/deepseek-comparison-20260909

# Recheck existing output without further generation charges.
pnpm benchmark:source --models deepseek-v4-flash,gpt-5.6-terra --cases cafe --out ../../tmp/deepseek-comparison-20260909 --recheck
```

Each run uses synthetic business data and in-memory persistence. It does not edit merchant sites or create real payments. Chromium blocks outbound requests and exercises a simulated checkout. All required API keys are checked before the first generation. The benchmark calls the production source generator directly; conversation is covered separately by service tests, and its cost is not included in this benchmark.

The output folder contains `REPORT.md`, `results.json`, `comparison.html`, generated source and screenshots. Review brief fidelity, typography, layout, useful content, mobile usability and preservation of design after the title edit. Compare cost including repairs, generation time and functional results. A single café example is an initial observation, not a reliable model ranking. `--cases cafe,shop --repeats 3` broadens coverage and costs more. `--create-only` omits edits. Rechecks write separate verification artifacts and retain original measurements.

## Local results — September 9, 2026

The same café brief and title edit passed the corrected desktop/mobile commerce checks for both models. DeepSeek Flash's tuned non-thinking generation plus edit cost an estimated **$0.0163**, including its successful-run repair; GPT Terra cost **$0.1008**. Generation took 43.1s / 1.9s for Flash and 47.4s / 2.3s for Terra (create / edit). Both edits changed only index.html among authored source files.

Visual review favored Terra's initial editorial composition, typography and catalog layout. Flash produced a simpler usable storefront, with an empty contact section and some unsupported business claims that need review. Flash is useful for inexpensive routine edits; this one sample does not establish a general ranking. Pro and Vision were not tested live.

Total live testing estimate: **$0.1877**, including $0.0690 in failed reasoning-mode diagnostics and $0.0016 for a successful 4.6-second DeepSeek chat interpretation. The first browser harness accidentally selected a hidden cart quantity button; it now scopes add controls to the catalog. Rechecks incurred no API charges and preserved the original measurements.

Local artifacts: [side-by-side screenshots](../tmp/deepseek-vs-gpt-20260909/comparison.html), [report](../tmp/deepseek-vs-gpt-20260909/REPORT.md), [all measurements](../tmp/deepseek-vs-gpt-20260909/measurements.json). Raw experiments remain in the three dated DeepSeek comparison folders under tmp/.

Validation: 109 API regression tests across eight related suites; 14 Chromium editor tests; API and standalone/embedded studio builds. The changed non-thinking generation policy also passed its 38-test generation/policy rerun. API health returned 200 after restarting the local server, and the live dashboard shows the DeepSeek choices.
