import { parseArgs } from "node:util";
import { readFile, writeFile } from "node:fs/promises";

const { values, positionals } = parseArgs({ allowPositionals: true, options: {
  store: { type: "string" }, input: { type: "string" }, out: { type: "string" },
  revision: { type: "string" }, target: { type: "string" }, before: { type: "string" }, help: { type: "boolean" },
} });

if (values.help || !positionals.length) {
  console.log(`Independent storefront source projects

Environment: PAGOSYA_API_URL (defaults to http://127.0.0.1:3001/v1)
             PAGOSYA_MERCHANT_TOKEN (dashboard session or merchant secret key)

pnpm storefront:source history --store STORE_ID [--before REVISION]
pnpm storefront:source save --store STORE_ID --input source-project.json
pnpm storefront:source export --store STORE_ID --revision 1 --out storefront.zip
pnpm storefront:source restore --store STORE_ID --target 1 --revision 3

Save input: { revision, label, brief: { businessType, audience, primaryAction,
visualDirection }, files: [{ path, content, encoding?: "utf8" | "base64" }] }.
Restore appends a new revision; it never publishes or rewinds history.
Export writes a new file and refuses to overwrite an existing archive.`);
} else {
  try {
    if (positionals.length !== 1) throw new Error("Choose one action. See --help.");
    const action = positionals[0];
    if (!["history", "save", "export", "restore"].includes(action)) throw new Error("Unknown action. See --help.");
    if (!values.store) throw new Error("--store is required");
    const token = process.env.PAGOSYA_MERCHANT_TOKEN;
    if (!token) throw new Error("PAGOSYA_MERCHANT_TOKEN is required");
    const api = new URL(process.env.PAGOSYA_API_URL || "http://127.0.0.1:3001/v1");
    if (api.username || api.password || api.search || api.hash || (api.protocol !== "https:" && !(api.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(api.hostname)))) {
      throw new Error("Use HTTPS for the API, or HTTP on localhost. URL credentials, queries and fragments are not supported.");
    }
    const revision = (value, minimum = 1) => {
      if (!value || !/^\d+$/.test(value) || !Number.isSafeInteger(Number(value)) || Number(value) < minimum) throw new Error("A valid revision number is required");
      return Number(value);
    };
    let path = `${api.href.replace(/\/$/, "")}/stores/${encodeURIComponent(values.store)}/source-project`;
    const init = { headers: { Authorization: `Bearer ${token}` }, redirect: "error", signal: AbortSignal.timeout(30_000) };
    if (action === "save") {
      if (!values.input) throw new Error("--input is required");
      init.method = "PUT"; init.headers["Content-Type"] = "application/json";
      init.body = JSON.stringify(JSON.parse(await readFile(values.input, "utf8")));
    } else if (action === "restore") {
      path += `/versions/${revision(values.target)}/restore`;
      init.method = "POST"; init.headers["Content-Type"] = "application/json";
      init.body = JSON.stringify({ revision: revision(values.revision, 0) });
    } else if (action === "export") {
      if (!values.out) throw new Error("--out is required");
      path += `/versions/${revision(values.revision)}/export`;
    } else if (values.before) path += `?before=${revision(values.before)}`;
    const response = await fetch(path, init);
    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      throw new Error(`API ${response.status}: ${Array.isArray(payload?.message) ? payload.message.join("; ") : payload?.message || response.statusText}`);
    }
    if (action === "export") {
      if (!response.headers.get("content-type")?.startsWith("application/zip")) throw new Error("API did not return a ZIP archive");
      await writeFile(values.out, Buffer.from(await response.arrayBuffer()), { flag: "wx", mode: 0o600 });
      console.log(`Exported revision ${values.revision} to ${values.out}`);
    } else console.log(JSON.stringify(await response.json(), null, 2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
