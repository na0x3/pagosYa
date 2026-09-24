import ts from 'typescript';
import postcss from 'postcss';
import { parse, type DefaultTreeAdapterMap } from 'parse5';
import { sourceLocationUrl } from './source-location';
import { SourceValidationError } from './source-validation-error';
import type { SourceProjectFileDto } from './dto/save-source-project.dto';

/**
 * The refusals validateNextSources (source-next.ts) already applies to React
 * storefronts, applied to the classic HTML/CSS/JS ones.
 *
 * Those projects arrive two ways: YAPI writes them, and a merchant types into the
 * Código tab of Studio. Neither was inspected, so the sandboxed iframe and its CSP
 * (packages/storefront-preview/src/source-preview.ts) were the only thing between a
 * hostile snippet and a shopper. That containment holds, but it should not stand
 * alone, and it is silent: when it blocks a script the merchant only sees a page
 * that does not work.
 *
 * What is refused is deliberately narrow — turning a string into running code, and
 * markup that pulls executable bytes from somewhere the CSP would refuse anyway.
 * A storefront's own DOM, styles and listeners are left alone. A validator that
 * argues with a merchant about ordinary code only teaches them to stop saving.
 */

/** Replaced with the installed kit on every render (source-runtime.ts), so their stored bytes are not a surface. */
export const LEGACY_RUNTIME_FILES = new Set(['commerce.js', 'config.js', 'privacy.js', 'retention.js', 'video.js', 'motion.js', 'brand.css', 'commerce-pages.css']);

export const legacyAuthoredFile = (path: string) =>
  /\.(?:html|css|js)$/i.test(path) && !path.startsWith('_compiled/') && !LEGACY_RUNTIME_FILES.has(path);

type Problem = { diagnostic: string; merchant: string };
type HtmlNode = DefaultTreeAdapterMap['node'];
type HtmlElement = DefaultTreeAdapterMap['element'];
const isElement = (node: HtmlNode): node is HtmlElement => 'tagName' in node;
// A template's children hang off `content`, not `childNodes`. They are inert until
// something clones them into the page, and the handler comes along when it does.
const children = (node: HtmlNode): HtmlNode[] =>
  [...('childNodes' in node ? node.childNodes : []), ...('content' in node && node.content ? node.content.childNodes : [])];
const elements = (node: HtmlNode): HtmlElement[] =>
  children(node).flatMap(child => [...(isElement(child) ? [child] : []), ...elements(child)]);
const attribute = (node: HtmlElement, name: string) => node.attrs.find(entry => entry.name === name)?.value;
const text = (node: HtmlElement) => node.childNodes.map(child => ('value' in child ? child.value : '')).join('');

/** A destination that leaves the project: another scheme, or a protocol-relative host. */
const remote = (value: string) => /^[a-z][a-z\d+.-]*:/i.test(value.trim()) || value.trim().startsWith('//');
/** Browsers drop control characters inside a scheme, so compare the same string they would. */
const runsCode = (value: string) => /^\s*javascript:/i.test(value.replace(/[\u0000-\u001f]/g, ''));

const STRING_TIMERS = new Set(['setTimeout', 'setInterval']);
const CODE_FROM_STRING = new Set(['eval', 'Function', 'execScript', 'importScripts']);
const DOCUMENT_WRITERS = new Set(['write', 'writeln']);

/** Report the primitives that compile a string, however the call is spelled. */
function scriptProblems(label: string, code: string, problems: Problem[]) {
  const source = ts.createSourceFile(label, code, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const named = (node: ts.Expression): string =>
    ts.isIdentifier(node) ? node.text
      : ts.isPropertyAccessExpression(node) ? node.name.text
      : ts.isElementAccessExpression(node) && ts.isStringLiteralLike(node.argumentExpression) ? node.argumentExpression.text
      : '';
  const report = (call: string, merchant: string) =>
    problems.push({ diagnostic: `${label}: ${call} compiles a string into running code`, merchant: `${label}: no uses ${merchant}.` });
  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node)) {
      const name = named(node.expression);
      const receiver = ts.isPropertyAccessExpression(node.expression) ? node.expression.expression.getText(source) : '';
      if (node.expression.kind === ts.SyntaxKind.ImportKeyword) report('import()', 'imports dinámicos');
      else if (CODE_FROM_STRING.has(name)) report(`${name}()`, `${name}()`);
      else if (DOCUMENT_WRITERS.has(name) && /^(?:document|window\.document)$/.test(receiver)) report(`document.${name}()`, `document.${name}()`);
      else if (STRING_TIMERS.has(name) && node.arguments[0] && ts.isStringLiteralLike(node.arguments[0])) report(`${name}(string)`, `${name}() con una cadena de código`);
    }
    if (ts.isNewExpression(node) && CODE_FROM_STRING.has(named(node.expression))) report(`${named(node.expression)}()`, `${named(node.expression)}()`);
    ts.forEachChild(node, visit);
  };
  visit(source);
}

function pageProblems(path: string, html: string, problems: Problem[]) {
  let nodes: HtmlElement[];
  // A page too malformed to parse is a design problem, not a security one: the
  // preview would not render it either. Never fail a save over it.
  try { nodes = elements(parse(html)); } catch { return; }
  for (const node of nodes) {
    const tag = node.tagName.toLowerCase();
    if (['base', 'object', 'embed'].includes(tag)) {
      problems.push({ diagnostic: `${path}: forbidden <${tag}> element`, merchant: `${path}: el elemento <${tag}> no está permitido.` });
    }
    if (attribute(node, 'srcdoc') !== undefined) {
      problems.push({ diagnostic: `${path}: srcdoc injects executable markup`, merchant: `${path}: srcdoc no está permitido; enlaza una página del proyecto.` });
    }
    if (tag === 'iframe' && !sourceLocationUrl(attribute(node, 'src') || '')) {
      problems.push({ diagnostic: `${path}: iframe src must be a literal Google Maps or OpenStreetMap embed`, merchant: `${path}: un iframe solo puede mostrar un mapa de Google Maps u OpenStreetMap.` });
    }
    if (tag === 'script') {
      const src = attribute(node, 'src');
      const type = (attribute(node, 'type') || '').trim().toLowerCase();
      // Only a block the browser would run is code. JSON-LD and templates are data.
      const executes = !type || type === 'module' || /^(?:text|application)\/(?:x-)?(?:java|ecma)script$/.test(type);
      if (src && remote(src)) problems.push({ diagnostic: `${path}: script loaded from ${src}`, merchant: `${path}: el script ${src} viene de otro sitio; copia el código al proyecto.` });
      if (!src && executes) scriptProblems(path, text(node), problems);
    }
    if (tag === 'link' && /(?:^|\s)stylesheet(?:\s|$)/i.test(attribute(node, 'rel') || '')) {
      const href = attribute(node, 'href');
      if (href && remote(href)) problems.push({ diagnostic: `${path}: stylesheet loaded from ${href}`, merchant: `${path}: la hoja de estilos ${href} viene de otro sitio; copia el CSS al proyecto.` });
    }
    for (const attr of node.attrs) {
      if (/^(?:href|src|action|formaction|xlink:href|ping)$/i.test(attr.name) && runsCode(attr.value)) {
        problems.push({ diagnostic: `${path}: javascript: destination on ${attr.name}`, merchant: `${path}: un enlace javascript: no está permitido.` });
      }
      if (/^on[a-z]+$/i.test(attr.name)) scriptProblems(path, attr.value, problems);
    }
  }
}

function styleProblems(path: string, css: string, problems: Problem[]) {
  try {
    postcss.parse(css).walkAtRules(rule => {
      if (['import', 'plugin', 'config'].includes(rule.name.toLowerCase())) {
        problems.push({ diagnostic: `${path}: @${rule.name} pulls styles from outside the project`, merchant: `${path}: usa CSS y fuentes locales; no se permiten imports ni plugins de estilos.` });
      }
    });
  } catch {
    // Malformed CSS never renders anyway, and the design checks already report it.
  }
}

export function validateLegacySources(files: SourceProjectFileDto[]) {
  const problems: Problem[] = [];
  for (const file of files) {
    if (!file || file.encoding === 'base64' || typeof file.content !== 'string' || !legacyAuthoredFile(file.path)) continue;
    if (/\.html$/i.test(file.path)) pageProblems(file.path, file.content, problems);
    else if (/\.css$/i.test(file.path)) styleProblems(file.path, file.content, problems);
    else scriptProblems(file.path, file.content, problems);
  }
  const seen = new Set<string>();
  const unique = problems.filter(problem => !seen.has(problem.diagnostic) && seen.add(problem.diagnostic));
  if (!unique.length) return;
  const more = unique.length > 8 ? unique.length - 8 : 0;
  throw new SourceValidationError(
    `Legacy source rejected: ${unique.slice(0, 8).map(problem => problem.diagnostic).join('; ')}${more ? `; and ${more} more` : ''}`,
    `${unique.slice(0, 8).map(problem => problem.merchant).join(' ')}${more ? ` Y ${more} problema(s) más.` : ''}`,
  );
}
