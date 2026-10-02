import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planRequest, completedResponse, startGateway } from './transport.mjs';

const event = value => `data: ${JSON.stringify(value)}\r\n\r\n`;
function stream(text, size = 7) {
  const bytes = new TextEncoder().encode(text);
  return new Response(new ReadableStream({ start(controller) {
    for (let i = 0; i < bytes.length; i += size) controller.enqueue(bytes.slice(i, i + size));
    controller.close();
  } }), { headers: { 'Content-Type': 'text/event-stream' } });
}
const completed = { status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: 'Diseño café' }] }], usage: { input_tokens: 3, output_tokens: 4 } };

test('adapts Yapi structured and tool requests without mutating the caller or schema', () => {
  const original = { model: 'gpt-5.6-sol', input: [{ role: 'system', content: [{ type: 'input_text', text: 'Build', prompt_cache_breakpoint: { mode: 'explicit' } }] }],
    max_output_tokens: 6000, temperature: 1, store: true, service_tier: 'default', previous_response_id: 'old',
    text: { format: { type: 'json_schema', schema: { properties: { temperature: { type: 'number' } } } } },
    tools: [{ type: 'function', name: 'finish', parameters: { type: 'object' } }] };
  const adapted = planRequest(original);
  assert.equal(adapted.store, false);
  assert.equal(adapted.stream, true);
  assert.equal(adapted.input[0].role, 'developer');
  assert.equal(adapted.input[0].content[0].prompt_cache_breakpoint, undefined);
  for (const field of ['max_output_tokens', 'temperature', 'service_tier', 'previous_response_id']) assert.equal(adapted[field], undefined);
  assert.deepEqual(adapted.text, original.text);
  assert.equal(adapted.tools[0].type, 'namespace');
  assert.deepEqual(adapted.tools[0].tools, original.tools);
  assert.equal(original.store, true);
  assert.throws(() => planRequest({ ...original, tools: [{ type: 'image_generation' }] }));
  assert.throws(() => planRequest({ ...original, model: 'claude-sonnet-5' }));
});

test('reassembles split UTF-8 SSE and preserves the terminal output and usage', async () => {
  const result = await completedResponse(stream(': heartbeat\r\n\r\n' + event({ type: 'response.output_text.delta', delta: 'partial' }) + event({ type: 'response.completed', response: completed }), 1));
  assert.deepEqual(result, { status: 200, body: completed });
});

test('partial text, late limits, incomplete output and HTTP rejection never become success', async () => {
  const prefix = event({ type: 'response.output_text.delta', delta: 'Looks good' });
  assert.equal((await completedResponse(stream(prefix))).body.error.code, 'chatgpt_stream_interrupted');
  assert.equal((await completedResponse(stream(prefix + event({ type: 'response.incomplete' })))).status, 502);
  const result = await completedResponse(stream(prefix + event({ type: 'response.failed', response: { error: { code: 'subscription_sharing_usage_limit_exceeded' } } })));
  assert.equal(result.status, 429);
  assert.equal(result.body.error.code, 'subscription_sharing_usage_limit_exceeded');
  assert.equal((await completedResponse(Response.json({ error: { code: 'invalid_token' } }, { status: 401 }))).status, 401);
});

test('missing content type still requires a correctly framed completed SSE event', async () => {
  const response = stream(event({ type: 'response.completed', response: completed }));
  response.headers.delete('content-type');
  assert.equal((await completedResponse(response)).status, 200);
  assert.equal((await completedResponse(new Response(null))).status, 502);
});

test('reconstructs finalized tool and text items when the terminal event omits output', async () => {
  const call = { type: 'function_call', name: 'finish', namespace: 'yapi', call_id: 'call1', arguments: '{}' };
  const result = await completedResponse(stream(event({ type: 'response.output_item.done', output_index: 1, item: call })
    + event({ type: 'response.output_item.done', output_index: 0, item: { type: 'reasoning', encrypted_content: 'opaque' } })
    + event({ type: 'response.completed', response: { status: 'completed', output: [], usage: { input_tokens: 10, output_tokens: 5 } } })));
  assert.equal(result.body.output[0].type, 'reasoning');
  assert.deepEqual(result.body.output[1], call);
  assert.equal(result.body.usage.output_tokens, 5);
  assert.equal((await completedResponse(stream(event({ type: 'response.output_item.done', output_index: 0, item: call })))).status, 502);
});

test('gateway authenticates local callers, uses only OAuth, and rejects browser origins and unsupported routes', async () => {
  const requests = [];
  const gateway = await startGateway({ token: async () => 'oauth-test-only' }, async (url, init) => {
    requests.push({ url, init });
    return stream(event({ type: 'response.completed', response: completed }));
  });
  try {
    assert.equal((await fetch(gateway.url, { method: 'POST' })).status, 403);
    const options = { method: 'POST', headers: { Authorization: `Bearer ${gateway.secret}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ model: 'gpt-5.6-sol', input: [{ role: 'user', content: 'Hi' }] }) };
    assert.equal((await fetch(gateway.url, { ...options, headers: { ...options.headers, Origin: 'http://evil.test' } })).status, 403);
    assert.equal((await fetch(gateway.url.replace('responses', 'images/generations'), options)).status, 404);
    const response = await fetch(gateway.url, options);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), completed);
    assert.equal(requests.length, 1);
    assert.equal(requests[0].url, 'https://api.openai.com/v1/responses');
    assert.equal(requests[0].init.headers.Authorization, 'Bearer oauth-test-only');
    assert.equal(JSON.parse(requests[0].init.body).stream, true);
  } finally { gateway.close(); }
});

test('gateway failure does not retry or fall back to paid credentials', async () => {
  let calls = 0;
  const gateway = await startGateway({ token: async () => 'oauth' }, async () => { calls++; throw new Error('offline'); });
  try {
    const response = await fetch(gateway.url, { method: 'POST', headers: { Authorization: `Bearer ${gateway.secret}` }, body: JSON.stringify({ model: 'gpt-5.6-sol', input: [] }) });
    assert.equal(response.status, 503);
    assert.equal(calls, 1);
  } finally { gateway.close(); }
});

test('gateway distinguishes auth, connection, timeout and stream failures without exposing exception text', async () => {
  for (const scenario of [
    { stage: 'authentication', code: 'chatgpt_authentication_unavailable', token: async () => { throw new Error('private-token-do-not-log'); }, upstream: async () => { throw new Error('should not dispatch'); } },
    { stage: 'connection', code: 'chatgpt_connection_unavailable', token: async () => 'oauth', upstream: async () => { throw new Error('private-host-do-not-log'); } },
    { stage: 'connection', code: 'chatgpt_request_timeout', token: async () => 'oauth', upstream: async () => { throw new DOMException('private-timeout-context', 'TimeoutError'); } },
    { stage: 'stream', code: 'chatgpt_stream_interrupted', token: async () => 'oauth', upstream: async () => stream('data: invalid-private-json\n\n') },
  ]) {
    const gateway = await startGateway({ token: scenario.token }, scenario.upstream);
    try {
      const response = await fetch(gateway.url, { method: 'POST', headers: { Authorization: `Bearer ${gateway.secret}` }, body: JSON.stringify({ model: 'gpt-5.6-sol', input: [] }) });
      const body = await response.json();
      assert.equal(body.error.code, scenario.code);
      assert.equal(body.error.stage, scenario.stage);
      assert.equal(JSON.stringify(body).includes('private-'), false);
    } finally { gateway.close(); }
  }
});

test('authorization refresh outages preserve their safe status and do not dispatch inference', async () => {
  for (const status of [400,500]) {
    let calls=0;
    const gateway=await startGateway({token:async()=>{throw Object.assign(new Error('private response'),{httpStatus:status});}},async()=>{calls++;});
    try {
      const response=await fetch(gateway.url,{method:'POST',headers:{Authorization:`Bearer ${gateway.secret}`},body:JSON.stringify({model:'gpt-5.6-terra',input:[]})});
      const body=await response.json();
      assert.equal(body.error.code,status===500?'chatgpt_authentication_unavailable':'chatgpt_authentication_rejected');
      assert.equal(body.error.upstreamStatus,status);assert.equal(body.error.retryable,status===500);assert.equal(calls,0);
      assert.equal(JSON.stringify(body).includes('private response'),false);
    } finally {gateway.close();}
  }
});
