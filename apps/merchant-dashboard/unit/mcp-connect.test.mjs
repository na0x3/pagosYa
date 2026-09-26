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
