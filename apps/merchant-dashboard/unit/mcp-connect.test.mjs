import assert from "node:assert/strict";
import test from "node:test";
import { mcpEndpoint, mcpClientSnippets } from "../src/mcp-connect.mjs";

test("the MCP endpoint sits under the API base", () => {
  assert.equal(mcpEndpoint("https://api.pagosya.bo/v1/"), "https://api.pagosya.bo/v1/mcp");
  assert.equal(mcpEndpoint("http://localhost:3001/v1"), "http://localhost:3001/v1/mcp");
});

test("each client gets a paste-ready setup with the key", () => {
  const s = mcpClientSnippets("https://api.pagosya.bo/v1/mcp", "mk_live_x");
  assert.match(s.claude, /claude mcp add --transport http pagosya https:\/\/api\.pagosya\.bo\/v1\/mcp --header "Authorization: Bearer mk_live_x"/);
  assert.match(s.codex, /\[mcp_servers\.pagosya\][\s\S]*url = "https:\/\/api\.pagosya\.bo\/v1\/mcp"[\s\S]*Authorization = "Bearer mk_live_x"/);
  assert.deepEqual(JSON.parse(s.cursor), { mcpServers: { pagosya: { url: "https://api.pagosya.bo/v1/mcp", headers: { Authorization: "Bearer mk_live_x" } } } });
});

test("Claude and ChatGPT get a secret connector URL that carries the key", async () => {
  const { mcpConnectorUrl } = await import("../src/mcp-connect.mjs");
  assert.equal(mcpConnectorUrl("https://api.pagosya.bo/v1/mcp", "mk_live_x"), "https://api.pagosya.bo/v1/mcp/k/mk_live_x");
});

test("each guide is numbered steps with a copy box and a first prompt, like the connect dialog", async () => {
  const { renderMcpGuide } = await import("../src/mcp-connect.mjs");
  const claude = renderMcpGuide("claude", { endpoint: "https://api.pagosya.bo/v1/mcp", key: "mk_live_x" });
  assert.match(claude, /<ol class="mcp-steps">/);
  assert.match(claude, /claude\.ai/);
  assert.match(claude, /data-mcp-copy="https:\/\/api\.pagosya\.bo\/v1\/mcp\/k\/mk_live_x"/);
  assert.match(claude, /data-mcp-copy="[^"]*mis tiendas/);
  const chatgpt = renderMcpGuide("chatgpt", { endpoint: "https://api.pagosya.bo/v1/mcp", key: "mk_live_x" });
  assert.match(chatgpt, /ChatGPT/);
  assert.match(chatgpt, /\/k\/mk_live_x/);
  const code = renderMcpGuide("claude-code", { endpoint: "https://api.pagosya.bo/v1/mcp", key: "mk_live_x" });
  assert.match(code, /claude mcp add --transport http pagosya/);
});

test("without a fresh key the guide offers to create the connection instead of showing a secret", async () => {
  const { renderMcpGuide } = await import("../src/mcp-connect.mjs");
  const html = renderMcpGuide("claude", { endpoint: "https://api.pagosya.bo/v1/mcp", key: null });
  assert.match(html, /data-mcp-create-connection/);
  assert.doesNotMatch(html, /\/k\//);
});

test("Claude and ChatGPT explain that a computer-only address cannot be reached from the web", async () => {
  const { renderMcpGuide } = await import("../src/mcp-connect.mjs");
  assert.match(renderMcpGuide("chatgpt", { endpoint: "http://localhost:3001/v1/mcp", key: "mk_live_x" }), /dirección pública/);
  assert.doesNotMatch(renderMcpGuide("cursor", { endpoint: "http://localhost:3001/v1/mcp", key: "mk_live_x" }), /dirección pública/);
});
