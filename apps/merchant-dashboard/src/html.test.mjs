import assert from "node:assert/strict";
import test from "node:test";
import { escapeHtml } from "./html.mjs";

test("escapes markup and both quote styles", () => {
  assert.equal(escapeHtml(`<img src=x onerror="a('b')">&`), "&lt;img src=x onerror=&quot;a(&#39;b&#39;)&quot;&gt;&amp;");
});

test("renders null and undefined as empty and stringifies numbers", () => {
  assert.equal(escapeHtml(null), "");
  assert.equal(escapeHtml(undefined), "");
  assert.equal(escapeHtml(0), "0");
});
