export interface SourceFile { path: string; content: string; encoding?: "utf8" | "base64" }
export interface SourceSnapshot { schemaVersion: number; brief: { businessType: string; audience: string; primaryAction: string; visualDirection: string }; files: SourceFile[] }

const mediaTypes: Record<string, string> = { html: "text/html", css: "text/css", js: "text/javascript", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", avif: "image/avif", gif: "image/gif", ttf: "font/ttf", woff: "font/woff", woff2: "font/woff2" };
function base64(value: string): string { const bytes = new TextEncoder().encode(value); let binary = ""; for (const byte of bytes) binary += String.fromCharCode(byte); return btoa(binary); }

/** Inline a static revision into an opaque-origin iframe. Never inject source into Studio's DOM. */
export function sourcePreviewDocument(snapshot: SourceSnapshot, page = "index.html"): string {
  const entry = snapshot.files.find((file) => file.path === page && file.encoding !== "base64");
  if (!entry) throw new Error("Esta revisión no incluye la página seleccionada.");
  const files = new Map(snapshot.files.map((file) => [file.path, file]));
  const data = (file: SourceFile, content?: string) => `data:${mediaTypes[file.path.split(".").pop() || ""] || "application/octet-stream"};base64,${content !== undefined ? base64(content) : file.encoding === "base64" ? file.content : base64(file.content)}`;
  const resolve = (path: string, base = page): SourceFile | undefined => {
    if (/^(?:[a-z]+:|\/\/|#)/i.test(path)) return undefined;
    const url = new URL(path, `https://source.invalid/${base}`);
    return files.get(decodeURIComponent(url.pathname.slice(1)));
  };
  const substituteAssets = (content: string, base: string) => content.replace(/url\(\s*(["']?)([^"')]+)\1\s*\)/g, (_match, _quote, path: string) => {
    const file = resolve(path, base); return file ? `url("${data(file)}")` : 'url("")';
  });
  const doc = new DOMParser().parseFromString(entry.content, "text/html");
  doc.querySelectorAll("base,iframe,object,embed,meta[http-equiv],link[rel=preload],link[rel=prefetch]").forEach((el) => el.remove());
  doc.querySelectorAll("script").forEach((el) => {
    const src = el.getAttribute("src");
    if (!src) return; // Inline scripts remain confined to the opaque sandbox.
    const file = resolve(src);
    if (!file || !file.path.endsWith(".js")) { el.remove(); return; }
    let content = file.content;
    if (file.path === "config.js") {
      for (const asset of snapshot.files.filter((f) => f.encoding === "base64")) content = content.split(JSON.stringify(asset.path)).join(JSON.stringify(data(asset)));
    }
    el.src = data(file, content); el.removeAttribute("integrity"); el.removeAttribute("crossorigin");
  });
  doc.querySelectorAll("link[rel=stylesheet]").forEach((el) => {
    const file = resolve(el.getAttribute("href") || "");
    if (!file) { el.remove(); return; }
    el.setAttribute("href", data(file, substituteAssets(file.content, file.path)));
  });
  doc.querySelectorAll("style").forEach((el) => { el.textContent = substituteAssets(el.textContent || "", page); });
  doc.querySelectorAll("[style]").forEach((el) => el.setAttribute("style", substituteAssets(el.getAttribute("style") || "", page)));
  doc.querySelectorAll("img,source").forEach((el) => {
    el.removeAttribute("srcset");
    const file = resolve(el.getAttribute("src") || "");
    if (file) el.setAttribute("src", data(file));
    else if (!el.getAttribute("src")?.startsWith("data:")) el.removeAttribute("src");
  });
  doc.querySelectorAll("a").forEach((el) => { if (!el.getAttribute("href")?.startsWith("#")) { el.removeAttribute("href"); el.removeAttribute("target"); } });
  const policy = doc.createElement("meta"); policy.httpEquiv = "Content-Security-Policy";
  policy.content = "default-src 'none'; script-src 'unsafe-inline' data:; style-src 'unsafe-inline' data:; img-src data: blob:; font-src data:; connect-src 'none'; frame-src 'none'; worker-src 'none'; form-action 'none'; base-uri 'none'; object-src 'none'";
  doc.head.prepend(policy);
  const flag = doc.createElement("script"); flag.textContent = "window.PAGOSYA_PREVIEW=true;"; policy.after(flag);
  return "<!doctype html>" + doc.documentElement.outerHTML;
}
