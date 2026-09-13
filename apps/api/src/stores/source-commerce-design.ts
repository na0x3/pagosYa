import { readFile } from 'node:fs/promises';
import { join, posix } from 'node:path';
import type { SourceProjectFileDto } from './dto/save-source-project.dto';

const attribute = (tag: string, name: string) => tag.match(new RegExp(`\\b${name}\\s*=\\s*(["'])(.*?)\\1`, 'i'))?.[2];
const block = (html: string, name: string) => html.match(new RegExp(`<${name}\\b[^>]*>[\\s\\S]*?<\\/${name}>`, 'i'))?.[0];
const normalize = (html: string) => html.replace(/\s+/g, ' ').trim();

/** Share the homepage's design with stock commerce pages; custom page content stays authored. */
export async function withSourceCommerceDesign(files: SourceProjectFileDto[]): Promise<SourceProjectFileDto[]> {
  const home = files.find(file => file.path === 'index.html')?.content;
  if (!home) return files;
  const template = await readFile(join(__dirname, 'source-kit', 'product.html'), 'utf8');
  const homeHead = block(home, 'head') || '';
  const styles = [...homeHead.matchAll(/<link\b[^>]*>/gi)].map(match => match[0]).filter(tag => {
    const href = attribute(tag, 'href');
    return attribute(tag, 'rel') === 'stylesheet' && href && files.some(file => file.path === href.replace(/^\.\//, ''));
  });
  const homeHeader = block(home.split(/<main\b/i)[0], 'header');
  const homeFooter = block(home.split(/<\/main>/i).at(-1)!, 'footer');
  const homeClasses = attribute(home.match(/<body\b[^>]*>/i)?.[0] || '', 'class');
  const routes = new Set(files.map(file => file.path));
  return files.map(file => {
    if (file.path === 'commerce-pages.css') return file.content.trimStart().startsWith('@layer pagosya-commerce') ? file : { ...file, content: `@layer pagosya-commerce {\n${file.content}\n}\n` };
    if (file.path === 'index.html' || !file.path.endsWith('.html') || file.encoding === 'base64') return file;
    if (!/data-pagosya-(?:product|checkout)-page/.test(file.content)) return file;
    const relative = (url: string) => {
      if (/^(?:[a-z][a-z\d+.-]*:|\/)/i.test(url)) return url;
      const [, path, suffix] = url.match(/^([^?#]*)(.*)$/s)!;
      return (posix.relative(posix.dirname(file.path), path || 'index.html') || 'index.html') + suffix;
    };
    const rebase = (html: string) => html.replace(/\b(href|src)\s*=\s*(["'])(.*?)\2/gi, (_match, name, quote, url) => `${name}=${quote}${relative(url)}${quote}`);
    let content = file.content;
    let stockShell = false;
    for (const [name, shared] of [['header', homeHeader], ['footer', homeFooter]] as const) {
      const current = block(content, name), stock = block(template, name);
      if (shared && current && stock && (normalize(current) === normalize(stock) || attribute(current.match(/^<[^>]*>/)![0], 'data-pagosya-shared-shell') === name)) {
        content = content.replace(current, rebase(shared.replace(new RegExp(`<${name}\\b`, 'i'), `<${name} data-pagosya-shared-shell="${name}"`)));
        stockShell = true;
      }
    }
    if (stockShell && homeClasses) content = content.replace(/<body\b[^>]*>/i, tag => {
      const classes = [...new Set(`${attribute(tag, 'class') || ''} ${homeClasses}`.trim().split(/\s+/))].join(' ');
      return /\bclass\s*=/i.test(tag) ? tag.replace(/\bclass\s*=\s*(["']).*?\1/i, `class="${classes}"`) : tag.replace('>', ` class="${classes}">`);
    });
    // Include the same local styles (and fonts) even on older or nested pages.
    const head = block(content, 'head');
    if (head) {
      const linked = [...head.matchAll(/<link\b[^>]*>/gi)].map(match => attribute(match[0], 'href'));
      const missing = styles.filter(tag => {
        const href = attribute(tag, 'href')!;
        return routes.has(href.replace(/^\.\//, '')) && !linked.some(url => url && posix.normalize(posix.join(posix.dirname(file.path), url)) === href.replace(/^\.\//, ''));
      }).map(rebase);
      if (missing.length) content = content.replace(/<\/head>/i, missing.join('\n') + '\n</head>');
    }
    return { ...file, content };
  });
}
