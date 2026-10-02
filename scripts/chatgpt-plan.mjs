import { spawn } from 'node:child_process';
import net from 'node:net';
import { fileURLToPath } from 'node:url';
import { lockAccount, signIn, signOut, createSession, readState } from './chatgpt-plan/auth.mjs';
import { startGateway } from './chatgpt-plan/transport.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const command = process.argv[2];
let unlock, gateway, child;
let stopping = false;
async function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  if (child?.pid && child.exitCode === null) {
    try { process.kill(-child.pid, 'SIGTERM'); } catch { child.kill('SIGTERM'); }
  }
  gateway?.close();
  await unlock?.();
  process.exit(code);
}
process.on('SIGINT', () => void stop());
process.on('SIGTERM', () => void stop());

async function ensureApiStopped() {
  const occupied = await new Promise(resolve => {
    const socket = net.createConnection({ host: '127.0.0.1', port: 3001 });
    socket.once('connect', () => { socket.destroy(); resolve(true); });
    socket.once('error', () => resolve(false));
  });
  if (occupied) throw new Error('An API is already running on port 3001. Stop it before pnpm dev:chatgpt so Yapi cannot reuse a paid-API process.');
}

try {
  if (!['login', 'logout', 'status', 'models', 'smoke', 'dev', 'evaluate'].includes(command)) throw new Error('Usage: node scripts/chatgpt-plan.mjs login|logout|status|models|smoke <model>|dev|evaluate <evaluation arguments>');
  if (process.env.NODE_ENV === 'production') throw new Error('ChatGPT plan mode is for local development only.');
  unlock = await lockAccount();
  if (command === 'login') { await signIn(); console.log('Connected. Next: pnpm chatgpt:models'); }
  else if (command === 'logout') await signOut();
  else if (command === 'status') {
    const saved = await readState();
    console.log(saved.access_token ? 'ChatGPT account connected (local credentials present).' : 'Not connected. Run pnpm chatgpt:login.');
    console.log('Manage allowance and credit spending: https://chatgpt.com/settings/usage');
  } else {
    const session = createSession();
    if (command === 'models') {
      const token = await session.token();
      const response = await fetch('https://api.openai.com/v1/models', { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(30_000) });
      if (!response.ok) throw new Error(`Model discovery failed (${response.status}). Reconnect with pnpm chatgpt:login.`);
      const body = await response.json();
      if (!Array.isArray(body.models)) throw new Error('Unexpected ChatGPT model catalog.');
      for (const model of body.models.filter(model => model.visibility === 'list')) console.log(`${model.slug} — ${model.display_name}`);
    } else if (command === 'smoke') {
      const model = process.argv[3];
      if (!model?.startsWith('gpt-')) throw new Error('Specify a model from pnpm chatgpt:models.');
      gateway = await startGateway(session, fetch, process.argv.includes('--diagnostic') ? event => console.log(JSON.stringify({ event: event.type, itemType: event.item?.type, name: event.item?.name, outputCount: event.response?.output?.length, deltaLength: event.delta?.length })) : undefined);
      const request = async body => {
        const response = await fetch(gateway.url, { method: 'POST',
          headers: { Authorization: `Bearer ${gateway.secret}`, 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(90_000),
          body: JSON.stringify({ model, ...body }) });
        const result = await response.json();
        if (!response.ok || result.status !== 'completed') throw new Error(`ChatGPT test failed: ${result.error?.code ?? 'incomplete'}`);
        return result;
      };
      await request({ input: [{ role: 'user', content: 'Return an object with ok set to true.' }], max_output_tokens: 100,
        text: { format: { type: 'json_schema', name: 'connection_check', strict: true, schema: { type: 'object', properties: { ok: { type: 'boolean' } }, required: ['ok'], additionalProperties: false } } } });
      const tools = [{ type: 'function', name: 'connection_check', description: 'Confirm the local connection', parameters: { type: 'object', properties: {}, required: [], additionalProperties: false }, strict: true }];
      const input = [{ role: 'user', content: 'Call connection_check once. After its result, say connected.' }];
      const turn = await request({ input, tools, tool_choice: 'required' });
      const call = turn.output?.find(item => item.type === 'function_call' && item.name === 'connection_check');
      if (!call) throw new Error(`ChatGPT did not return the expected local function call: ${JSON.stringify(turn.output?.map(item => ({ type: item.type, name: item.name, namespace: item.namespace })))}`);
      await request({ input: [...input, ...turn.output, { type: 'function_call_output', call_id: call.call_id, output: 'Connection OK.' }], tools, tool_choice: 'none' });
      console.log('ChatGPT plan verified: structured output, local tool call, and continued conversation. No API key was used.');
    } else if (command === 'evaluate') {
      gateway = await startGateway(session);
      console.log('Evaluating private Yapi candidates using ChatGPT plan allowance. No paid API fallback or publication.');
      child = spawn(process.execPath, ['node_modules/ts-node/dist/bin.js', '--transpile-only', 'scripts/evaluate-yapi-agent.ts', ...process.argv.slice(3), '--i-accept-costs'], {
        cwd: fileURLToPath(new URL('../apps/api/', import.meta.url)), stdio: 'inherit', detached: process.platform !== 'win32',
        env: { ...process.env, NODE_ENV: 'development',
          YAPI_CHATGPT_PLAN_URL: gateway.url, YAPI_CHATGPT_PLAN_SECRET: gateway.secret,
          OPENAI_API_KEY: '', ANTHROPIC_API_KEY: '', DEEPSEEK_API_KEY: '',
          CHECKOUT_ORIGIN: 'http://localhost:5175' },
      });
      child.once('error', error => { console.error(error.message); void stop(1); });
      child.once('exit', code => void stop(code ?? 1));
      await new Promise(() => {});
    } else {
      await ensureApiStopped();
      gateway = await startGateway(session);
      console.log('Yapi Local: ChatGPT plan for store generation. Paid OpenAI, Claude, DeepSeek and image generation are disabled.');
      console.log('Use a GPT model listed by pnpm chatgpt:models. Allowance: https://chatgpt.com/settings/usage');
      child = spawn(process.execPath, ['scripts/dev.mjs', ...(process.argv.includes('--skip-setup') ? ['--skip-setup'] : [])], {
        cwd: root, stdio: 'inherit', detached: process.platform !== 'win32',
        env: { ...process.env, NODE_ENV: 'development',
          YAPI_CHATGPT_PLAN_URL: gateway.url, YAPI_CHATGPT_PLAN_SECRET: gateway.secret,
          OPENAI_API_KEY: '', ANTHROPIC_API_KEY: '', DEEPSEEK_API_KEY: '',
          CHECKOUT_ORIGIN: 'http://localhost:5175' },
      });
      child.once('error', error => { console.error(error.message); void stop(1); });
      child.once('exit', code => void stop(code ?? 1));
      // Keep the gateway and serialized refresh owner alive until the API exits.
      await new Promise(() => {});
    }
  }
  await stop();
} catch (error) { console.error(error.message); await stop(1); }
