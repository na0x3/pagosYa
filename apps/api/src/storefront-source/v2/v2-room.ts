/** Live 2026-11-18 (Fishwife copy): an imported store's design fills its photo room on purpose (catalogue photos bundled up to
 *  ~5.5 MB), so the V2 copy's cut-outs, the site's artwork and its pages passed the 8 MiB source limit. Before the copy is written,
 *  the biggest catalogue photos that only data points at (config.js, the design's JSON, the static index) go back to being links to
 *  their uploads — the preview and the published store load those as well. A photo a page or stylesheet draws stays bundled. */
type SourceFile = { path: string; content: string; encoding?: 'utf8' | 'base64' };

const BUNDLED = /^assets\/image-([a-f0-9]{12})\.(?:png|jpe?g|webp)$/;
const CODE = /\.(?:tsx?|jsx?|css)$/;
const size = (file: SourceFile) => Buffer.byteLength(file.content, file.encoding === 'base64' ? 'base64' : 'utf8');

/** uploads: a bundled photo's 12-character name → its upload path (/v1/uploads/…), found by hashing the store's catalogue uploads. */
export function makeRoom(files: SourceFile[], uploads: Map<string, string>, apiOrigin: string, budget: number): { files: SourceFile[]; moved: string[] } {
  const counted = (list: SourceFile[]) => list.filter(file => !file.path.startsWith('_compiled/')).reduce((total, file) => total + size(file), 0);
  let total = counted(files);
  if (total <= budget) return { files, moved: [] };
  const text = files.filter(file => file.encoding !== 'base64');
  const candidates = files
    .filter(file => BUNDLED.test(file.path) && uploads.has(BUNDLED.exec(file.path)![1]))
    .filter(file => !text.some(other => other.path !== 'config.js' && CODE.test(other.path) && other.content.includes(file.path)))
    .sort((a, b) => size(b) - size(a));
  const moved: string[] = [];
  for (const file of candidates) {
    if (total <= budget) break;
    moved.push(file.path);
    total -= size(file);
  }
  if (!moved.length) return { files, moved };
  const links = new Map(moved.map(path => [path, `${apiOrigin.replace(/\/$/, '')}${uploads.get(BUNDLED.exec(path)![1])}`]));
  const out = files.filter(file => !links.has(file.path)).map(file => {
    if (file.encoding === 'base64') return file;
    let content = file.content;
    for (const [path, href] of links) if (content.includes(path)) content = content.split(path).join(href);
    return content === file.content ? file : { ...file, content };
  });
  return { files: out, moved };
}
