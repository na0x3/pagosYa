import { mkdir, readFile, writeFile, readdir, lstat, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { Script } from "node:vm";

// This build copies static browser files. It never evaluates storefront scripts.
const root = dirname(fileURLToPath(import.meta.url));
const allowed = /\.(html|css|js|json|png|jpe?g|webp|avif|gif|ico|woff2?|ttf|otf)$/i;
async function copy(directory, relative = "") {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (["dist", "node_modules"].includes(entry.name) || entry.name.startsWith(".")) continue;
    const path = join(directory, entry.name);
    if ((await lstat(path)).isSymbolicLink()) throw new Error("Symlinks are not supported");
    const destination = join(root, "dist", relative, entry.name);
    if (entry.isDirectory()) { await copy(path, join(relative, entry.name)); continue; }
    if (!allowed.test(entry.name) || entry.name === "package.json" || entry.name === "pagosya-project.json") continue;
    const bytes = await readFile(path);
    if (entry.name.endsWith(".js")) new Script(bytes.toString("utf8"), { filename: path });
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, bytes);
  }
}
await readFile(join(root, "index.html"));
await rm(join(root, "dist"), { recursive: true, force: true });
await copy(root);
console.log("Static storefront built in dist/");
