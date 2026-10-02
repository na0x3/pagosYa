import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';

const unsupportedFields = ['background', 'conversation', 'max_output_tokens', 'max_tool_calls', 'metadata', 'moderation', 'multi_agent', 'prompt', 'prompt_cache_retention', 'safety_identifier', 'temperature', 'top_logprobs', 'top_p', 'truncation', 'user', 'previous_response_id', 'prompt_cache_options', 'service_tier'];
const errorResult = (code, status = 502) => ({ status, body: { error: { code, message: `ChatGPT plan: ${code}. No paid API fallback.` } } });
const safeCode = value => typeof value === 'string' && /^[a-z_0-9]{1,100}$/i.test(value) ? value : 'chatgpt_request_failed';

export function planRequest(original) {
  const body = structuredClone(original);
  if (!Array.isArray(body.input) || typeof body.model !== 'string' || !body.model.startsWith('gpt-')) throw new Error('Select an available GPT model for ChatGPT plan usage.');
  for (const key of unsupportedFields) delete body[key];
  body.store = false;
  body.stream = true;
  body.input = body.input.map(item => {
    if (item.role === 'system') item.role = 'developer';
    if (Array.isArray(item.content)) item.content = item.content.map(part => {
      const { prompt_cache_breakpoint, ...content } = part;
      return content;
    });
    return item;
  });
  if (body.tools?.length) {
    if (!body.tools.every(tool => tool.type === 'function' || tool.type === 'custom')) throw new Error('This tool is not supported by the local ChatGPT plan connection.');
    body.tools = [{ type: 'namespace', name: 'yapi', description: 'Yapi local storefront editing tools', tools: body.tools }];
  }
  return body;
}

// Existing Yapi callers expect a completed Responses JSON object. Do not accept
// partial text as success: quota errors can arrive after the stream has started.
export async function completedResponse(response, observe) {
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    return errorResult(safeCode(payload?.error?.code), response.status);
  }
  const contentType = response.headers.get('content-type');
  // Some transports omit Content-Type. Validate SSE framing and its terminal
  // event regardless; never infer success merely from HTTP 200.
  if (!response.body || (contentType && !contentType.includes('text/event-stream'))) return errorResult('chatgpt_stream_missing');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  const completedItems = new Map();
  try {
    while (true) {
      const { value, done } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      let match;
      while ((match = /\r?\n\r?\n/.exec(buffer))) {
        const frame = buffer.slice(0, match.index);
        buffer = buffer.slice(match.index + match[0].length);
        const data = frame.split(/\r?\n/).filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n');
        if (!data || data === '[DONE]') continue;
        const event = JSON.parse(data);
        observe?.(event);
        if (event.type === 'response.output_item.done' && event.item && Number.isSafeInteger(event.output_index)) {
          completedItems.set(event.output_index, event.item);
        }
        if (event.type === 'response.completed' && event.response?.status === 'completed') {
          // The plan transport may omit output from the terminal response.
          // Only finalized items are eligible, and only after completion.
          const output = event.response.output?.length ? event.response.output
            : [...completedItems.entries()].sort(([a], [b]) => a - b).map(([, item]) => item);
          return { status: 200, body: { ...event.response, output } };
        }
        if (['response.failed', 'response.incomplete', 'error'].includes(event.type)) {
          const code = safeCode(event.response?.error?.code ?? event.error?.code ?? event.code ?? (event.type === 'response.incomplete' ? 'chatgpt_response_incomplete' : null));
          return errorResult(code, code.startsWith('subscription_sharing_') ? 429 : 502);
        }
      }
      if (buffer.length > 32 * 1024 * 1024) return errorResult('chatgpt_event_too_large');
      if (done) return errorResult('chatgpt_stream_interrupted');
    }
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
}

export async function startGateway(session, fetchImpl = fetch, observe) {
  const secret = randomBytes(32).toString('base64url');
  const server = createServer(async (req, res) => {
    const send = (status, body) => { if (!res.destroyed) res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }).end(JSON.stringify(body)); };
    // No CORS; exact Host and a per-run credential prevent browser/remote use.
    if (req.headers.host !== `127.0.0.1:${server.address().port}` || req.headers.origin || req.headers.authorization !== `Bearer ${secret}`) { send(403, { error: { code: 'forbidden' } }); return; }
    if (req.method !== 'POST' || req.url !== '/v1/responses') { send(404, { error: { code: 'unsupported_endpoint' } }); return; }
    const controller = new AbortController();
    res.on('close', () => { if (!res.writableEnded) controller.abort(); });
    let stage = 'request';
    try {
      const chunks = []; let bytes = 0;
      for await (const chunk of req) {
        bytes += chunk.length;
        if (bytes > 24 * 1024 * 1024) { send(413, { error: { code: 'request_too_large' } }); return; }
        chunks.push(chunk);
      }
      let body;
      try { body = planRequest(JSON.parse(Buffer.concat(chunks).toString())); }
      catch { send(400, { error: { code: 'unsupported_chatgpt_request' } }); return; }
      stage = 'authentication';
      const token = await session.token();
      stage = 'connection';
      const upstream = await fetchImpl('https://api.openai.com/v1/responses', {
        method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body), signal: AbortSignal.any([controller.signal, AbortSignal.timeout(240_000)]),
      });
      stage = 'stream';
      const result = await completedResponse(upstream, observe);
      send(result.status, result.body);
    } catch (error) {
      // Classify without returning exception text, tokens, URLs or upstream payloads.
      const httpStatus = Number.isInteger(error?.httpStatus) && error.httpStatus >= 400 && error.httpStatus <= 599 ? error.httpStatus : undefined;
      const code = controller.signal.aborted ? 'chatgpt_request_cancelled'
        : error?.name === 'TimeoutError' ? 'chatgpt_request_timeout'
        : stage === 'authentication' ? httpStatus && httpStatus < 500 ? 'chatgpt_authentication_rejected' : 'chatgpt_authentication_unavailable'
        : stage === 'stream' ? 'chatgpt_stream_interrupted' : 'chatgpt_connection_unavailable';
      const result = errorResult(code, code === 'chatgpt_request_cancelled' ? 499 : 503);
      send(result.status, { ...result.body, error: { ...result.body.error, stage, ...(httpStatus ? { upstreamStatus: httpStatus } : {}), retryable: stage === 'authentication' ? Boolean(httpStatus && httpStatus >= 500) : stage !== 'request' } });
    }
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  return { url: `http://127.0.0.1:${server.address().port}/v1/responses`, secret,
    close: () => { server.closeAllConnections(); server.close(); } };
}
