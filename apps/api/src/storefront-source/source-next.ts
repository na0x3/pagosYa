import { extractKitBlock, SOURCE_KIT_CSS_PATH, storeKitLink, validateAuthoredCss, validateStoreKitCss } from './source-kit-css';
import { isSourceMotifFile } from './source-motifs';
import { BadGatewayException } from '@nestjs/common';
import { build } from 'esbuild';
import postcss from 'postcss';
import tailwindcss from 'tailwindcss';
import * as ts from 'typescript';
import { parse } from 'parse5';
import { posix, join } from 'node:path';
import { creativeRuntime, creativeTypes, uiRuntime, SOURCE_CREATIVE_IMPORTS, SOURCE_CREATIVE_TOOLS } from './source-creative';
import { SOURCE_UI_TOOLS } from './source-ui';
import { validateSourcePriceClaims } from './source-price-claims';
import { sourceLocationUrl } from './source-location';
import { validateSourceDesignImplementation, type SourceDesign } from './source-design';
import { type SourceSitePurpose } from './source-site-purpose';
import type { SourceProjectFileDto } from './dto/save-source-project.dto';

export const NEXT_SOURCE_MARKER = 'storefront-framework.json';
export const nextSourceFile = (path: string) => /^components\/(?:[a-zA-Z0-9_-]+\/)*[a-zA-Z0-9_-]+\.tsx$/.test(path) || path === 'styles/globals.css';
export const isNextSource = (files: SourceProjectFileDto[] = []) => files.some(f => f.path === NEXT_SOURCE_MARKER);
export const nextPages = [{ name: 'home', path: 'index.html' }, { name: 'product', path: 'product.html' }, { name: 'checkout', path: 'checkout.html' }] as const;

/** Folders under components/ whose files are standard store pages (spec 2026-09-30-store-page-architecture). The value
 * is the prefix of the URL for a file the table below does not know. */
const STANDARD_PAGE_GROUPS: Record<string, string> = { pages: '', catalog: '', auth: 'acceso-', account: 'cuenta-' };
/** Spanish URL slug of each known page, keyed by `group/file`. */
const STANDARD_PAGE_SLUGS: Record<string, string> = {
  'pages/faq': 'faq', 'pages/shipping': 'envios', 'pages/refund-policy': 'reembolsos', 'pages/privacy': 'privacidad', 'pages/terms': 'terminos',
  'pages/cookies': 'cookies', 'pages/contact': 'contacto', 'pages/about': 'nosotros', 'pages/not-found': '404',
  'catalog/collections': 'colecciones', 'catalog/search': 'buscar',
  'auth/login': 'acceso-ingresar', 'auth/register': 'acceso-registro', 'auth/forgot-password': 'acceso-olvide-mi-contrasena', 'auth/reset-password': 'acceso-restablecer-contrasena',
  'account/orders': 'cuenta-pedidos', 'account/addresses': 'cuenta-direcciones', 'account/profile': 'cuenta-perfil', 'account/downloads': 'cuenta-descargas',
  'account/payment-methods': 'cuenta-metodos-de-pago', 'account/subscriptions': 'cuenta-suscripciones',
};
const STANDARD_PAGE_FILE = /^components\/(pages|catalog|auth|account)\/([a-z][a-z0-9-]{0,47})\.tsx$/;

/** The route of a file in one of the standard page folders, or null for any other file (shared components never route). */
export function standardPageRoute(path: string): { name: string; path: string } | null {
  const match = STANDARD_PAGE_FILE.exec(path);
  if (!match) return null;
  const name = `${match[1]}/${match[2]}`;
  return { name, path: `${STANDARD_PAGE_SLUGS[name] ?? `${STANDARD_PAGE_GROUPS[match[1]]}${match[2]}`}.html` };
}

/** Explicit page-* convention avoids treating shared components as routes; the standard page folders are explicit too. */
export function nextContentPages(files: SourceProjectFileDto[], purpose: SourceSitePurpose = 'shop'): Array<{ name: string; path: string }> {
  const pages = [...nextPages.filter(page => purpose === 'shop' || page.name === 'home' || files.some(file => file.path === `components/${page.name}.tsx`)),
    ...files.filter(file => /^components\/page-(?!index\.|product\.|checkout\.)[a-z][a-z0-9-]{0,47}\.tsx$/.test(file.path))
      .map(file => ({ name: file.path.slice(11, -4), path: file.path.slice(16, -4) + '.html' })),
    ...files.flatMap(file => standardPageRoute(file.path) ?? [])];
  const owners = new Map<string, string>();
  for (const page of pages) {
    const owner = `components/${page.name}.tsx`, other = owners.get(page.path);
    if (other) throw new BadGatewayException(`${other} y ${owner} producen la misma página ${page.path}. Cambia el nombre de uno.`);
    owners.set(page.path, owner);
  }
  return pages;
}

export const SOURCE_NEXT_INSTRUCTIONS = `Generate a real Next.js storefront using React, TypeScript and Tailwind CSS 3. The platform supplies the trusted Next.js Pages Router scaffold, package.json, configuration, runtime and build tooling. Return ONLY components/**/*.tsx and styles/globals.css. Required default-export React components: components/home.tsx, components/product.tsx, components/checkout.tsx. Extract a shared Header, Footer and other reusable pieces into components/. Each page must reuse the same actual shared navigation, typography and brand. Use className with complete literal Tailwind utility names, responsive prefixes, arbitrary values and normal React event handlers/useState/useEffect for interaction. Use styles/globals.css for shared tokens, @font-face, runtime commerce selectors (kit surfaces in its pagosya-kit block) and custom animation. The platform adds @tailwind directives. ${SOURCE_CREATIVE_TOOLS}\n${SOURCE_UI_TOOLS}\nReact and relative component imports are available; do not import remote resources, server modules, Next APIs or CSS from components. Do not output framework configuration, HTML files, site.js, styles.css or compiled bundles. Do not use dangerouslySetInnerHTML, eval, new Function, dynamic imports, script tags or authored fetch calls. Use ordinary anchors with index.html, product.html and checkout.html hrefs, because the same components run in isolated preview and Next.js static exports. The framework supplies document/head/scripts and SEO; components return page content, never html/head/body tags.
The existing PagosYa commerce runtime owns products, prices, cart, checkout, forms, reviews, bundles, loyalty, privacy and payments. Homepage MUST render one empty data-pagosya-catalog mount, an empty hidden data-pagosya-cart mount, data-pagosya-status (role=status aria-live=polite), and a real button with data-cart-open. Product MUST render empty data-pagosya-product-page and data-pagosya-cart mounts, data-pagosya-status, and a real button with data-cart-open (product pages need the same cart access as the homepage). Checkout must render one empty data-pagosya-checkout-page and data-pagosya-status; do not duplicate payment fields/cart markup. The runtime starts after React mounts. Style its menu-item, menu-item__name, menu-item__desc, menu-item__price, menu-add, order-item, order-line, order-field, order-total, order-note, checkout-button, product-page and checkout-page classes in globals.css. It emits pagosya:ready for idempotent decoration; never write into an observed catalog subtree from a MutationObserver. Do not register custom purchase/payment implementations. Never render React children inside these runtime-owned mounts or remove them during unrelated state changes. Style runtime classes in globals.css; Tailwind utilities on the surrounding layout are encouraged. On product pages, let actual product photography lead: allocate roughly half the desktop content width to the main image with thumbnails below, and use full available width above the details on mobile. Keep the entire product visible with object-fit:contain and avoid viewport-height caps that shrink photos in the editor. Start with the product gallery and actual product name, price and purchase action; do not add an oversized generic introductory heading above this mount. Honor explicit merchant layout requests. Homepage and product need usable cart access; all pages need navigation back to index.html. Add the optional contact hook as an empty hidden data-pagosya-contact mount; the runtime owns whether it appears. An optional newsletter block wraps its copy, one real button with data-pagosya-subscribe-open and an empty role=status paragraph in a data-pagosya-subscribe-block element; never add an email input or an onClick to that button, the runtime opens the secure signup form. Every authored intrinsic <img> must include an explicit meaningful alt value, or alt="" plus aria-hidden="true" when purely decorative; a JSX prop spread alone does not satisfy this contract. Location iframes may be normal React JSX with a supported HTTPS map src, title, loading=lazy and responsive sizing. Uploaded assets use literal /assets/... paths. Do not copy reference-site assets or fabricate product photography. Read browser globals only in effects or event handlers so Next.js can prerender the page. Define main and its planned direct section IDs literally in components/home.tsx. For tabs, steps or other multi-view homepages, keep every planned section mounted as a literal direct child of main in plan order and switch views by toggling the hidden attribute, aria attributes or className from state; never wrap planned sections in conditionals, .map(), switch statements or {expressions}. Put runtime hooks in literal JSX with no children; do not hide them behind conditions. Native React/CSS/SVG motion is available with reduced-motion support. Respect the selected motion mode and confirmed brand tokens. Preserve unrelated components and CSS for local edits. A whole-site redesign can replace existing components; legacy HTML supplied during migration is reference material to reconstruct in React while preserving its business content and commerce behavior.
Before returning source, perform a strict TypeScript scope pass: every uppercase JSX tag or referenced component name must be declared in that file or explicitly imported from a returned local components/*.tsx file. Shared Header, Footer and other primitives must have one concrete definition and matching imports in every page that uses them; never rely on a symbol existing in another file implicitly. Do not return a page that would produce Cannot find name, module-not-found or JSX intrinsic-element errors.
Homepage MUST contain exactly one semantic primary h1, either authored directly or supplied by @pagosya/ui Hero, VideoHero, FloatingMedia, ScrollScrubHero or Display with its default as="h1".
Choose the homepage information architecture for this merchant: a narrative landing page, useful catalog, gallery, playful scene or a combination can work. Keep navigation and the primary customer action easy to find. Use anchors for destinations and buttons for actions/state changes. Additional pages are optional when the content earns them. Keep cart access visible on mobile.`;

export function validateNextSources(files: SourceProjectFileDto[], purpose: SourceSitePurpose = 'shop') {
  if (!Array.isArray(files) || files.length > 24) throw new BadGatewayException('El proyecto React debe contener como máximo 24 archivos de diseño.');
  const seen = new Set<string>();
  const missingAlt: string[] = [];
  for (const file of files) {
    // DNA motif drawings are the one non-component output; the sanitiser, not this validator, owns them.
    if (file && typeof file.path === 'string' && isSourceMotifFile(file.path) && typeof file.content === 'string' && file.encoding !== 'base64') continue;
    if (!file || typeof file.path !== 'string' || !nextSourceFile(file.path) || seen.has(file.path.toLowerCase()) || typeof file.content !== 'string' || file.content.length > 180000 || file.encoding === 'base64') throw new BadGatewayException(`Archivo React no permitido: ${file?.path}`);
    seen.add(file.path.toLowerCase());
    if (file.path.endsWith('.css')) {
      const root = postcss.parse(file.content);
      root.walkAtRules(rule => { if (['import', 'plugin', 'config', 'source'].includes(rule.name.toLowerCase())) throw new BadGatewayException('Usa CSS y fuentes locales; no se permiten imports ni plugins de estilos.'); });
      continue;
    }
    const source = ts.createSourceFile(file.path, file.content, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    if (source.referencedFiles.length || source.typeReferenceDirectives.length || source.libReferenceDirectives.length) throw new BadGatewayException('No agregues referencias externas de TypeScript.');
    const visit = (node: ts.Node) => {
      if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
        if (node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
          const specifier = node.moduleSpecifier.text;
          if (!SOURCE_CREATIVE_IMPORTS.includes(specifier) && !specifier.startsWith('./') && !specifier.startsWith('../')) throw new BadGatewayException(`Import no permitido en ${file.path}: ${specifier}. Usa React, Motion, @pagosya/creative, @pagosya/ui o componentes locales.`);
        }
      }
      if (ts.isNewExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'Function') throw new BadGatewayException('No uses evaluación de código.');
      if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
        const tag = node.tagName.getText(source).split('.').at(-1)!;
        // Inspect authored intrinsic images only; trusted UI components own their markup.
        if (node.tagName.getText(source) === 'img') {
          const attribute = (name: string) => node.attributes.properties.find(a => ts.isJsxAttribute(a) && a.name.getText(source) === name) as ts.JsxAttribute | undefined;
          const value = (attr: ts.JsxAttribute | undefined): ts.Expression | undefined => {
            const initial = attr?.initializer;
            let expression = initial && ts.isJsxExpression(initial) ? initial.expression : initial;
            while (expression && ts.isParenthesizedExpression(expression)) expression = expression.expression;
            return expression;
          };
          const alt = value(attribute('alt'));
          const hiddenAttribute = attribute('aria-hidden');
          const hidden = value(hiddenAttribute);
          const role = value(attribute('role'));
          const decorative = Boolean(hiddenAttribute && !hiddenAttribute.initializer) || hidden?.kind === ts.SyntaxKind.TrueKeyword || Boolean(hidden && ts.isStringLiteral(hidden) && hidden.text === 'true')
            || Boolean(role && ts.isStringLiteral(role) && role.text === 'presentation');
          const empty = alt && (ts.isStringLiteral(alt) || ts.isNoSubstitutionTemplateLiteral(alt)) && !alt.text.trim();
          if (!alt || [ts.SyntaxKind.NullKeyword, ts.SyntaxKind.TrueKeyword, ts.SyntaxKind.FalseKeyword].includes(alt.kind)
            || ts.isIdentifier(alt) && alt.text === 'undefined' || empty && !decorative) {
            missingAlt.push(`${file.path}:${source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1}`);
          }
        }
        if (['script', 'html', 'head', 'body', 'object', 'embed', 'base', 'link', 'meta'].includes(tag)) throw new BadGatewayException(`Elemento no permitido: ${tag}`);
        if (tag === 'iframe') {
          const src = node.attributes.properties.find(a => ts.isJsxAttribute(a) && a.name.getText(source) === 'src') as ts.JsxAttribute | undefined;
          if (!src?.initializer || !ts.isStringLiteral(src.initializer) || !sourceLocationUrl(src.initializer.text)) throw new BadGatewayException('El mapa necesita un src literal HTTPS de Google Maps u OpenStreetMap.');
        }
      }
      if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword || ts.isIdentifier(node.expression) && ['require', 'eval', 'Function'].includes(node.expression.text))) throw new BadGatewayException(`No uses imports dinámicos ni evaluación de código en ${file.path}.`);
      if (ts.isJsxAttribute(node) && ['dangerouslySetInnerHTML', 'srcDoc'].includes(node.name.getText(source))) throw new BadGatewayException(`Usa JSX normal en ${file.path}; no insertes HTML ejecutable.`);
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  if (purpose === 'shop') validateSourcePriceClaims(files);
  for (const path of ['components/home.tsx', 'styles/globals.css', ...(purpose === 'shop' ? ['components/product.tsx', 'components/checkout.tsx'] : [])]) if (!files.some(f => f.path === path)) throw new BadGatewayException(`Falta ${path} en el proyecto Next.js.`);
  // Report every missing hook at once; the bounded repair only sees this message.
  const missing: string[] = [];
  for (const page of nextContentPages(files, purpose)) {
    const markup = nextPageMarkup(files, page.name);
    const hooks = purpose !== 'shop' ? (page.name === 'home' ? ['data-pagosya-status', 'data-pagosya-contact'] : ['data-pagosya-status']) : page.name === 'home' ? ['data-pagosya-catalog', 'data-pagosya-cart', 'data-pagosya-status', 'data-cart-open'] : page.name === 'product' ? ['data-pagosya-product-page', 'data-pagosya-cart', 'data-pagosya-status', 'data-cart-open'] : standardPageRoute(`components/${page.name}.tsx`) ? [] : ['data-pagosya-checkout-page', 'data-pagosya-status'];
    for (const hook of hooks) if (!new RegExp('<[^>]+\\b' + hook + '(?:\\s|=|>)').test(markup)) missing.push(`${page.name} necesita ${hook} en JSX visible.`);
  }
  const repairable = [
    ...(missingAlt.length ? [`Añade texto alternativo (alt) a cada imagen indicada: ${missingAlt.join(', ')}. Para imágenes puramente decorativas usa alt="" y aria-hidden="true".`] : []),
    ...(!/<h1\b/i.test(nextPageMarkup(files, 'home')) ? ['home necesita un encabezado principal h1 visible. Usa un h1 directo o un Hero de @pagosya/ui que lo genere.'] : []),
    ...missing,
  ];
  if (repairable.length) throw new BadGatewayException(repairable.join('\n'));
}

/** Virtual path of the trusted `@pagosya/ui` source; its commerce hooks count as page markup. */
const UI_LIBRARY_PATH = 'lib/ui.tsx';

type NextSlot = { children: string; attrs: Array<[string, string]>; childNames: Set<string>; propsNames: Set<string>; spreadNames: Set<string> };

/** Conservative JSX structure inspection, never SSR or evaluation of merchant modules.
 * Literal page structure is required; rendered behavior is checked separately in Studio. */
export function nextPageMarkup(files: SourceProjectFileDto[], name: string): string {
  // A stack, not a seen-set: reused components (tab panels, buttons) render at every use; only recursion stops.
  const active = new Set<string>();
  const loaded = new Map<string, ((exportName: string, children: string, attrs: Array<[string, string]>) => string) | null>();
  const primaryHeadingUiComponents = new Set(['Hero', 'VideoHero', 'FloatingMedia', 'ScrollScrubHero']);
  const uiTypography = (component: string, children: string, attrs: Array<[string, string]>) => {
    if (component !== 'Display' && component !== 'Heading') return null;
    const requested = attrs.find(([attribute]) => attribute === 'as')?.[1];
    const tag = component === 'Display'
      ? (requested === 'h2' || requested === 'p' ? requested : 'h1')
      : (requested === 'h3' || requested === 'p' ? requested : 'h2');
    return `<${tag}>${children}</${tag}>`;
  };
  const renderFile = (path: string, exportName = 'default', children = '', attrs: Array<[string, string]> = []): string => {
    const key = `${path}#${exportName}`;
    if (active.has(key)) return '';
    const typography = path === UI_LIBRARY_PATH ? uiTypography(exportName, children, attrs) : null;
    if (typography !== null) return typography;
    if (!loaded.has(path)) loaded.set(path, loadFile(path));
    const renderExport = loaded.get(path);
    if (!renderExport) return '';
    active.add(key);
    try { return renderExport(exportName, children, attrs); } finally { active.delete(key); }
  };
  const loadFile = (path: string) => {
    const file = path === UI_LIBRARY_PATH ? { path, content: uiRuntime() } : files.find(f => f.path === path);
    if (!file) return null;
    const source = ts.createSourceFile(path, file.content, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const imports = new Map<string, { path: string; exported: string }>();
    const motionTags = new Set<string>();
    const transparent = new Set<string>();
    for (const statement of source.statements) {
      if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier) || statement.moduleSpecifier.text !== 'motion/react') continue;
      const bindings = statement.importClause?.namedBindings;
      if (bindings && ts.isNamedImports(bindings)) for (const binding of bindings.elements) {
        const name = (binding.propertyName || binding.name).text;
        if (['motion', 'm'].includes(name)) motionTags.add(binding.name.text);
        if (['AnimatePresence', 'MotionConfig', 'LayoutGroup', 'LazyMotion'].includes(name)) transparent.add(binding.name.text);
      }
    }
    const declarations = new Map<string, ts.Node>();
    const exports = new Map<string, ts.Node>();
    for (const statement of source.statements) {
      const modifiers = ts.canHaveModifiers(statement) ? ts.getModifiers(statement) || [] : [];
      const flags = (modifiers.some(m => m.kind === ts.SyntaxKind.DefaultKeyword) ? ts.ModifierFlags.Default : 0) | (modifiers.some(m => m.kind === ts.SyntaxKind.ExportKeyword) ? ts.ModifierFlags.Export : 0);
      if (ts.isFunctionDeclaration(statement)) {
        if (statement.name) declarations.set(statement.name.text, statement);
        if (flags & ts.ModifierFlags.Default) exports.set('default', statement);
        else if (statement.name && flags & ts.ModifierFlags.Export) exports.set(statement.name.text, statement);
      }
      if (ts.isVariableStatement(statement)) for (const declaration of statement.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name) && declaration.initializer) {
          declarations.set(declaration.name.text, declaration.initializer);
          if (flags & ts.ModifierFlags.Export) exports.set(declaration.name.text, declaration.initializer);
        }
      }
    }
    for (const statement of source.statements) {
      if (ts.isExportAssignment(statement) && !statement.isExportEquals) {
        const target = ts.isIdentifier(statement.expression) ? declarations.get(statement.expression.text) : statement.expression;
        if (target) exports.set('default', target);
      }
      if (ts.isExportDeclaration(statement) && !statement.moduleSpecifier && statement.exportClause && ts.isNamedExports(statement.exportClause)) {
        for (const entry of statement.exportClause.elements) { const target = declarations.get((entry.propertyName || entry.name).text); if (target) exports.set(entry.name.text, target); }
      }
    }
    for (const statement of source.statements) if (ts.isImportDeclaration(statement) && ts.isStringLiteral(statement.moduleSpecifier) && (statement.moduleSpecifier.text.startsWith('.') || statement.moduleSpecifier.text === '@pagosya/ui')) {
      const base = posix.normalize(posix.join(posix.dirname(path), statement.moduleSpecifier.text));
      const target = statement.moduleSpecifier.text === '@pagosya/ui' ? UI_LIBRARY_PATH : [base, base + '.tsx', base + '/index.tsx'].find(p => files.some(f => f.path === p));
      if (target && statement.importClause?.name) imports.set(statement.importClause.name.text, { path: target, exported: 'default' });
      const bindings = statement.importClause?.namedBindings;
      if (target && bindings && ts.isNamedImports(bindings)) for (const binding of bindings.elements) {
        if (!binding.isTypeOnly) imports.set(binding.name.text, { path: target, exported: (binding.propertyName || binding.name).text });
      }
    }
    const escape = (value: string) => value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;');
    const literalAttrs = (opening: ts.JsxOpeningLikeElement): Array<[string, string]> => opening.attributes.properties.filter(ts.isJsxAttribute).map(a => {
      const value = !a.initializer ? '' : ts.isStringLiteral(a.initializer) ? a.initializer.text : ts.isJsxExpression(a.initializer) && a.initializer.expression && ts.isStringLiteral(a.initializer.expression) ? a.initializer.expression.text : '';
      return [a.name.getText(source), value];
    });
    // Props passed at a call site are only honored where the component structurally forwards them ({children}, {...props}).
    const componentSlot = (component: ts.Node, children: string, attrs: Array<[string, string]>): NextSlot => {
      const slot: NextSlot = { children, attrs, childNames: new Set(), propsNames: new Set(), spreadNames: new Set() };
      let fn: ts.Node | undefined = ts.isCallExpression(component) ? component.arguments[0] : component;
      if (fn && ts.isIdentifier(fn)) fn = declarations.get(fn.text);
      const param = fn && (ts.isFunctionDeclaration(fn) || ts.isArrowFunction(fn) || ts.isFunctionExpression(fn)) ? fn.parameters[0]?.name : undefined;
      if (param && ts.isIdentifier(param)) { slot.propsNames.add(param.text); slot.spreadNames.add(param.text); }
      if (param && ts.isObjectBindingPattern(param)) for (const element of param.elements) {
        if (!ts.isIdentifier(element.name)) continue;
        if (element.dotDotDotToken) slot.spreadNames.add(element.name.text);
        else if ((element.propertyName && ts.isIdentifier(element.propertyName) ? element.propertyName.text : element.name.text) === 'children') slot.childNames.add(element.name.text);
      }
      return slot;
    };
    const isChildren = (expression: ts.Expression, slot: NextSlot): boolean => ts.isParenthesizedExpression(expression) ? isChildren(expression.expression, slot)
      : ts.isIdentifier(expression) ? slot.childNames.has(expression.text)
      : ts.isPropertyAccessExpression(expression) && ts.isIdentifier(expression.expression) && slot.propsNames.has(expression.expression.text) && expression.name.text === 'children';
    const render = (node: ts.Node, slot: NextSlot): string => {
      if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) {
        const opening = ts.isJsxElement(node) ? node.openingElement : node;
        const renderChildren = () => ts.isJsxElement(node) ? node.children.map(child => render(child, slot)).join('') : '';
        let tag = opening.tagName.getText(source);
        const tagAttrs = literalAttrs(opening);
        const typography = path === UI_LIBRARY_PATH && (tag === 'Display' || tag === 'Heading') ? uiTypography(tag, renderChildren(), tagAttrs) : null;
        if (typography !== null) return typography;
        if (transparent.has(tag)) return renderChildren();
        const animated = tag.match(/^([A-Za-z_$][\w$]*)\.([a-z][A-Za-z0-9]*)$/);
        if (animated && motionTags.has(animated[1])) tag = animated[2];
        if (imports.has(tag)) {
          const imported = imports.get(tag)!;
          const rendered = renderFile(imported.path, imported.exported, renderChildren(), tagAttrs);
          return imported.path === UI_LIBRARY_PATH && primaryHeadingUiComponents.has(imported.exported) && !/<h1\b/i.test(rendered)
            ? `<h1></h1>${rendered}`
            : rendered;
        }
        if (/^[A-Z]/.test(tag) && declarations.has(tag)) {
          const localKey = `${path}#local:${tag}`; if (active.has(localKey)) return '';
          const component = declarations.get(tag)!;
          const componentChildren = renderChildren();
          active.add(localKey);
          try { return render(component, componentSlot(component, componentChildren, literalAttrs(opening))); } finally { active.delete(localKey); }
        }
        if (!/^[a-z]/.test(tag)) return '';
        const attrs = tagAttrs;
        if (slot.attrs.length && opening.attributes.properties.some(a => ts.isJsxSpreadAttribute(a) && ts.isIdentifier(a.expression) && slot.spreadNames.has(a.expression.text))) {
          for (const forwarded of slot.attrs) if (!attrs.some(([attrName]) => attrName === forwarded[0])) attrs.push(forwarded);
        }
        const children = renderChildren();
        if (opening.attributes.properties.some(a => ts.isJsxAttribute(a) && /^data-pagosya-(catalog|cart|status|product-page|checkout-page|contact)$/.test(a.name.getText(source))) && ts.isJsxElement(node) && node.children.some(c => !ts.isJsxText(c) || c.text.trim())) throw new BadGatewayException('Los contenedores de comercio deben quedar vacíos; React no debe controlar sus hijos.');
        return `<${tag}${attrs.map(([attrName, value]) => ` ${attrName}="${escape(value)}"`).join('')}>${children}</${tag}>`;
      }
      if (ts.isJsxText(node)) return escape(node.text);
      if (ts.isJsxExpression(node)) {
        const expression = node.expression;
        if (expression && isChildren(expression, slot)) return slot.children;
        if (expression && ts.isBinaryExpression(expression) && [ts.SyntaxKind.BarBarToken, ts.SyntaxKind.QuestionQuestionToken].includes(expression.operatorToken.kind) && isChildren(expression.left, slot)) return slot.children || render(expression.right, slot);
        return ''; // Do not claim other runtime expressions were verified.
      }
      let result = ''; ts.forEachChild(node, child => { result += render(child, slot); }); return result;
    };
    return (exportName: string, children: string, attrs: Array<[string, string]>) => {
      const component = exports.get(exportName);
      return component ? render(component, componentSlot(component, children, attrs)) : '';
    };
  };
  return renderFile(`components/${name}.tsx`);
}

export function validateNextDesign(files: SourceProjectFileDto[], design: SourceDesign, purpose: SourceSitePurpose = 'shop') {
  validateSourceDesignImplementation(design, [{ path: 'index.html', content: nextPageMarkup(files, 'home') }], purpose);
}

const NEXT_SHARED_FALLBACKS: Record<string, string> = {
  Header: `\n\n// PagosYa fallback: the generated page referenced Header without declaring or importing it.\nconst Header = ({ children, ...props }: { children?: any; [key: string]: any }) => (\n  <header {...props}>\n    {children || <a href="index.html">Inicio</a>}\n  </header>\n);\n`,
  Footer: `\n\n// PagosYa fallback: the generated page referenced Footer without declaring or importing it.\nconst Footer = ({ children, ...props }: { children?: any; [key: string]: any }) => (\n  <footer {...props}>\n    {children || <a href="index.html">Volver al inicio</a>}\n  </footer>\n);\n`,
};

function nextSourceBindings(source: ts.SourceFile): Set<string> {
  const bound = new Set<string>();
  const visit = (node: ts.Node) => {
    if (ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node)) {
      if (node.name) bound.add(node.name.text);
    }
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) bound.add(node.name.text);
    if (ts.isImportDeclaration(node)) {
      const clause = node.importClause;
      if (clause?.name) bound.add(clause.name.text);
      const bindings = clause?.namedBindings;
      if (bindings && ts.isNamespaceImport(bindings)) bound.add(bindings.name.text);
      if (bindings && ts.isNamedImports(bindings)) for (const element of bindings.elements) bound.add(element.name.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return bound;
}

function nextComponentExports(source: ts.SourceFile): { defaultExport: boolean; named: Set<string> } {
  const named = new Set<string>(); let defaultExport = false;
  for (const statement of source.statements) {
    const modifiers = ts.canHaveModifiers(statement) ? ts.getModifiers(statement) || [] : [];
    const exported = modifiers.some(modifier => modifier.kind === ts.SyntaxKind.ExportKeyword);
    const isDefault = modifiers.some(modifier => modifier.kind === ts.SyntaxKind.DefaultKeyword);
    if (isDefault) defaultExport = true;
    if (ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement)) {
      if (exported && statement.name && !isDefault) named.add(statement.name.text);
    }
    if (ts.isVariableStatement(statement) && exported) for (const declaration of statement.declarationList.declarations) {
      if (ts.isIdentifier(declaration.name)) named.add(declaration.name.text);
    }
    if (ts.isExportAssignment(statement)) defaultExport = true;
    if (ts.isExportDeclaration(statement) && !statement.moduleSpecifier && statement.exportClause && ts.isNamedExports(statement.exportClause)) {
      for (const element of statement.exportClause.elements) named.add(element.name.text);
    }
  }
  return { defaultExport, named };
}

/**
 * Platform mounts that carry no design: inserting one never changes how the store looks.
 * Only CommerceSlots qualifies (a hidden cart container and a status line). Catalog,
 * ProductDetail and CheckoutDetail render real sections and a <main>; where they go is design,
 * so a page missing them still goes to the AI repair.
 */
const COMMERCE_MOUNTS: Record<string, Array<{ hooks: string[]; component: string }>> = {
  home: [{ hooks: ['data-pagosya-cart', 'data-pagosya-status'], component: 'CommerceSlots' }],
  product: [{ hooks: ['data-pagosya-cart', 'data-pagosya-status'], component: 'CommerceSlots' }],
  checkout: [{ hooks: ['data-pagosya-status'], component: 'CommerceSlots' }],
};

/** The JSX element or fragment returned by the file's default-exported component, if it has one. */
function defaultExportRoot(source: ts.SourceFile): ts.JsxElement | ts.JsxFragment | undefined {
  const unwrap = (node: ts.Node | undefined): ts.JsxElement | ts.JsxFragment | undefined => {
    let expression = node as ts.Expression | undefined;
    while (expression && ts.isParenthesizedExpression(expression)) expression = expression.expression;
    return expression && (ts.isJsxElement(expression) || ts.isJsxFragment(expression)) ? expression : undefined;
  };
  const returned = (body: ts.Node | undefined): ts.JsxElement | ts.JsxFragment | undefined => {
    if (!body) return undefined;
    if (!ts.isBlock(body)) return unwrap(body);
    for (const statement of body.statements) if (ts.isReturnStatement(statement)) return unwrap(statement.expression);
    return undefined;
  };
  for (const statement of source.statements) {
    const modifiers = ts.canHaveModifiers(statement) ? ts.getModifiers(statement) || [] : [];
    const isDefault = modifiers.some(m => m.kind === ts.SyntaxKind.ExportKeyword) && modifiers.some(m => m.kind === ts.SyntaxKind.DefaultKeyword);
    if (isDefault && ts.isFunctionDeclaration(statement)) return returned(statement.body);
    if (ts.isExportAssignment(statement) && (ts.isArrowFunction(statement.expression) || ts.isFunctionExpression(statement.expression))) return returned(statement.expression.body);
  }
  return undefined;
}

/** The page file and every local component it imports, followed transitively. */
function pageComponentFiles(files: SourceProjectFileDto[], pagePath: string): SourceProjectFileDto[] {
  const byPath = new Map(files.map(f => [f.path, f]));
  const seen = new Set<string>(), queue = [pagePath];
  while (queue.length) {
    const path = queue.shift()!;
    const file = byPath.get(path);
    if (!file || seen.has(path)) continue;
    seen.add(path);
    for (const match of file.content.matchAll(/from\s+['"]\.\/([\w-]+)(?:\.tsx)?['"]/g)) queue.push(`components/${match[1]}.tsx`);
  }
  return [...seen].map(path => byPath.get(path)!);
}

function withUiImport(content: string, names: string[]): string {
  const existing = /import \{([^}]*)\} from '@pagosya\/ui';/.exec(content);
  if (!existing) return `import { ${names.join(', ')} } from '@pagosya/ui';\n${content}`;
  const current = existing[1].split(',').map(name => name.trim()).filter(Boolean);
  const merged = [...current, ...names.filter(name => !current.includes(name))];
  return content.replace(existing[0], `import { ${merged.join(', ')} } from '@pagosya/ui';`);
}

/**
 * Inserts platform-owned commerce mounts a page lacks entirely. They carry no design, so a
 * paid repair round-trip for them buys nothing. The cart button is left to the AI: where it
 * sits is part of the design.
 */
export function repairNextCommerceMounts(files: SourceProjectFileDto[], purpose: SourceSitePurpose = 'shop'): { files: SourceProjectFileDto[]; repairs: string[] } {
  if (purpose !== 'shop') return { files, repairs: [] };
  const repairs: string[] = [];
  let current = files;
  for (const [page, mounts] of Object.entries(COMMERCE_MOUNTS)) {
    const path = `components/${page}.tsx`;
    const file = current.find(f => f.path === path);
    if (!file) continue;
    const markup = nextPageMarkup(current, page);
    // A mount named in any component file (even inside a conditional the markup walk cannot see)
    // may already render on this page; never add a second one.
    const componentText = pageComponentFiles(current, path).map(f => f.content).join('\n');
    const needed = mounts.filter(mount =>
      mount.hooks.some(hook => !new RegExp('<[^>]+\\b' + hook + '(?:\\s|=|>)').test(markup))
      && !componentText.includes(mount.component) && !mount.hooks.some(hook => componentText.includes(hook)));
    if (!needed.length) continue;
    const source = ts.createSourceFile(path, file.content, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const root = defaultExportRoot(source);
    if (!root) continue;
    const at = ts.isJsxElement(root) ? root.closingElement.getStart(source) : root.closingFragment.getStart(source);
    const names = needed.map(mount => mount.component);
    const content = withUiImport(file.content.slice(0, at) + names.map(name => `<${name} />`).join('') + file.content.slice(at), names);
    current = current.map(f => f === file ? { ...f, content } : f);
    repairs.push(`${path}: added ${names.join(', ')}`);
  }
  return { files: current, repairs };
}

const COMMERCE_SLOT_ATTRIBUTE = /^data-pagosya-(catalog|cart|status|product-page|checkout-page|contact)$/;

/**
 * Two validator findings with exactly one correct answer, fixed in code instead of spending a paid repair
 * (which can trade one finding for another and exhaust the attempts): an authored <img> with no usable alt
 * is decoration (alt="" aria-hidden="true", as the HTML repair does), and a commerce slot React filled is
 * emptied, because the runtime replaces whatever is inside it.
 */
export function repairNextAuthoredMarkup(files: SourceProjectFileDto[]): { files: SourceProjectFileDto[]; repairs: string[] } {
  const repairs: string[] = [];
  const repaired = files.map(file => {
    if (!file.path.endsWith('.tsx') || typeof file.content !== 'string' || file.encoding === 'base64') return file;
    const source = ts.createSourceFile(file.path, file.content, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const attribute = (node: ts.JsxOpeningLikeElement, name: string) => node.attributes.properties.find(a => ts.isJsxAttribute(a) && a.name.getText(source) === name) as ts.JsxAttribute | undefined;
    const value = (attr: ts.JsxAttribute | undefined): ts.Expression | undefined => {
      const initial = attr?.initializer;
      let expression = initial && ts.isJsxExpression(initial) ? initial.expression : initial;
      while (expression && ts.isParenthesizedExpression(expression)) expression = expression.expression;
      return expression;
    };
    const edits: Array<{ start: number; end: number; text: string }> = [];
    let images = 0, slots = 0;
    const visit = (node: ts.Node) => {
      if (ts.isJsxElement(node) && node.openingElement.attributes.properties.some(a => ts.isJsxAttribute(a) && COMMERCE_SLOT_ATTRIBUTE.test(a.name.getText(source)))
        && node.children.some(c => !ts.isJsxText(c) || c.text.trim())) {
        // Everything inside goes, images included, so there is nothing further to visit.
        edits.push({ start: node.openingElement.end, end: node.closingElement.getStart(source), text: '' });
        slots++;
        return;
      }
      if ((ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) && node.tagName.getText(source) === 'img' && !attribute(node, 'aria-hidden')) {
        // Same finding as validateNextSources. An image that states aria-hidden either way keeps it: aria-hidden={false}
        // claims the image carries meaning, and that finding stays with the AI repair.
        const altAttribute = attribute(node, 'alt');
        const alt = value(altAttribute);
        const role = value(attribute(node, 'role'));
        const presentation = Boolean(role && ts.isStringLiteral(role) && role.text === 'presentation');
        const empty = alt && (ts.isStringLiteral(alt) || ts.isNoSubstitutionTemplateLiteral(alt)) && !alt.text.trim();
        const unusable = alt && ([ts.SyntaxKind.NullKeyword, ts.SyntaxKind.TrueKeyword, ts.SyntaxKind.FalseKeyword].includes(alt.kind) || ts.isIdentifier(alt) && alt.text === 'undefined');
        if (!alt || unusable || empty && !presentation) {
          if (altAttribute && unusable) edits.push({ start: altAttribute.getStart(source), end: altAttribute.end, text: 'alt=""' });
          edits.push({ start: node.attributes.end, end: node.attributes.end, text: `${altAttribute ? '' : ' alt=""'} aria-hidden="true"` });
          images++;
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
    if (!edits.length) return file;
    let content = file.content;
    for (const edit of edits.sort((a, b) => b.start - a.start || b.end - a.end)) content = content.slice(0, edit.start) + edit.text + content.slice(edit.end);
    if (images) repairs.push(`${file.path}: marked ${images} image${images === 1 ? '' : 's'} without alt text as decorative`);
    if (slots) repairs.push(`${file.path}: emptied ${slots} commerce slot${slots === 1 ? '' : 's'}`);
    return { ...file, content };
  });
  return { files: repairs.length ? repaired : files, repairs };
}

/**
 * Repairs omitted local imports and the two shared primitives most likely to
 * be omitted by a compact model response. Unknown missing components still go
 * through the normal AI repair path instead of being hidden.
 */
/**
 * A candidate that imports a name from a local component file which does not export it fails TypeScript, and used to
 * buy a paid repair ("Module './store' has no exported member 'CartButton'"). The name is nearly always a @pagosya/ui
 * component or a component another file exports; the import is pointed there in code. Unknown names stay for the
 * validator to report.
 */
export function repairNextMisdirectedImports(files: SourceProjectFileDto[]): { files: SourceProjectFileDto[]; repairs: string[] } {
  const exportsOf = new Map<string, { defaultExport: boolean; named: Set<string> }>();
  for (const file of files) if (file.path.endsWith('.tsx')) exportsOf.set(file.path, nextComponentExports(ts.createSourceFile(file.path, file.content, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)));
  const uiNamed = nextComponentExports(ts.createSourceFile(UI_LIBRARY_PATH, uiRuntime(), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)).named;
  const repairs: string[] = [];
  const out = files.map(file => {
    if (!file.path.startsWith('components/') || !file.path.endsWith('.tsx')) return file;
    const source = ts.createSourceFile(file.path, file.content, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const edits: { start: number; end: number; text: string }[] = [];
    const toUi: string[] = [];
    const elsewhere = new Map<string, string[]>();
    let uiImport: ts.ImportDeclaration | undefined;
    for (const statement of source.statements) {
      if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
      const spec = statement.moduleSpecifier.text;
      if (spec === '@pagosya/ui') { uiImport ??= statement; continue; }
      if (!spec.startsWith('.')) continue;
      const base = posix.join(posix.dirname(file.path), spec);
      const target = [base + '.tsx', base, base + '/index.tsx'].find(path => exportsOf.has(path));
      const clause = statement.importClause;
      if (!target || !clause?.namedBindings || !ts.isNamedImports(clause.namedBindings) || clause.isTypeOnly) continue;
      const exported = exportsOf.get(target)!;
      const keep: string[] = [];
      let moved = false;
      for (const element of clause.namedBindings.elements) {
        const name = (element.propertyName ?? element.name).text;
        const local = element.name.text;
        if (exported.named.has(name) || element.isTypeOnly) { keep.push(element.getText(source)); continue; }
        const others = [...exportsOf].filter(([path, info]) => path !== target && path !== file.path && info.named.has(name)).map(([path]) => path);
        // A component this store wrote wins over a same-named kit one: that is the one the page means.
        if (others.length === 1) {
          const rel = posix.relative(posix.dirname(file.path), others[0].replace(/\.tsx$/, ''));
          const specifier = rel.startsWith('.') ? rel : `./${rel}`;
          elsewhere.set(specifier, [...(elsewhere.get(specifier) || []), name === local ? name : `${name} as ${local}`]);
          moved = true;
        } else if (uiNamed.has(name)) { toUi.push(name === local ? name : `${name} as ${local}`); moved = true; }
        else keep.push(element.getText(source));
      }
      if (!moved) continue;
      const defaultName = clause.name?.text;
      const parts = [defaultName, keep.length ? `{ ${keep.join(', ')} }` : ''].filter(Boolean);
      edits.push({ start: statement.getStart(source), end: statement.end, text: parts.length ? `import ${parts.join(', ')} from '${spec}';` : '' });
    }
    if (!edits.length) return file;
    const added: string[] = [];
    if (toUi.length) {
      const bindings = uiImport?.importClause?.namedBindings;
      if (uiImport && bindings && ts.isNamedImports(bindings)) {
        const names = [...bindings.elements.map(element => element.getText(source)), ...toUi.filter(name => !bindings.elements.some(element => element.getText(source) === name))];
        const defaultName = uiImport.importClause?.name?.text;
        edits.push({ start: uiImport.getStart(source), end: uiImport.end, text: `import ${defaultName ? `${defaultName}, ` : ''}{ ${names.join(', ')} } from '@pagosya/ui';` });
      } else added.push(`import { ${toUi.join(', ')} } from '@pagosya/ui';`);
    }
    for (const [specifier, names] of elsewhere) added.push(`import { ${names.join(', ')} } from '${specifier}';`);
    let content = file.content;
    for (const edit of edits.sort((a, b) => b.start - a.start)) content = content.slice(0, edit.start) + edit.text + content.slice(edit.end);
    content = content.replace(/^\n+/, '');
    if (added.length) content = `${added.join('\n')}\n${content}`;
    repairs.push(`${file.path}: imports pointed to the files that export them`);
    return { ...file, content };
  });
  return { files: out, repairs };
}

export function repairNextSharedComponentReferences(files: SourceProjectFileDto[]): SourceProjectFileDto[] {
  const candidates = new Map<string, SourceProjectFileDto[]>();
  for (const file of files) {
    if (!file.path.startsWith('components/') || !file.path.endsWith('.tsx')) continue;
    const name = file.path.split('/').at(-1)!.replace(/\.tsx$/, '');
    if (/^[A-Z]/.test(name)) candidates.set(name, [...(candidates.get(name) || []), file]);
  }
  return files.map(file => {
    if (!file.path.endsWith('.tsx')) return file;
    const source = ts.createSourceFile(file.path, file.content, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const used = new Set<string>();
    const bound = nextSourceBindings(source);
    const visit = (node: ts.Node) => {
      if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
        const tag = node.tagName;
        if (ts.isIdentifier(tag) && NEXT_SHARED_FALLBACKS[tag.text]) used.add(tag.text);
        if (ts.isIdentifier(tag) && /^[A-Z]/.test(tag.text)) used.add(tag.text);
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
    const missing = [...used].filter(name => !bound.has(name));
    if (!missing.length) return file;
    const imports: string[] = [], fallbackNames: string[] = [];
    for (const name of missing) {
      const matches = candidates.get(name) || [];
      if (matches.length !== 1 || matches[0].path === file.path) {
        if (NEXT_SHARED_FALLBACKS[name]) fallbackNames.push(name);
        continue;
      }
      const candidate = matches[0];
      const candidateSource = ts.createSourceFile(candidate.path, candidate.content, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
      const exports = nextComponentExports(candidateSource);
      const importPath = posix.relative(posix.dirname(file.path), candidate.path.replace(/\.tsx$/, ''));
      const specifier = importPath.startsWith('.') ? importPath : `./${importPath}`;
      if (exports.defaultExport) imports.push(`import ${name} from '${specifier}';`);
      else if (exports.named.has(name)) imports.push(`import { ${name} } from '${specifier}';`);
      else if (NEXT_SHARED_FALLBACKS[name]) fallbackNames.push(name);
    }
    if (!imports.length && !fallbackNames.length) return file;
    const prefix = imports.length ? `${imports.join('\n')}\n` : '';
    return { ...file, content: prefix + file.content + fallbackNames.map(name => NEXT_SHARED_FALLBACKS[name]).join('') };
  });
}

/** Type-check in memory; TypeScript reads declarations but executes no source. */
function checkNextTypes(files: SourceProjectFileDto[]) {
  const root = join(__dirname, '__storefront__');
  const virtual = new Map([...files.filter(f => f.path.endsWith('.tsx')), { path: 'lib/creative.tsx', content: creativeRuntime() }, { path: 'lib/ui.tsx', content: uiRuntime() }, { path: 'creative.d.ts', content: creativeTypes }].map(f => [join(root, f.path), f.content]));
  const options: ts.CompilerOptions = { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler, jsx: ts.JsxEmit.ReactJSX, strict: true, noEmit: true, skipLibCheck: true, esModuleInterop: true, types: [], baseUrl: root, paths: { '@pagosya/creative': ['lib/creative.tsx'], '@pagosya/ui': ['lib/ui.tsx'] } };
  const host = ts.createCompilerHost(options);
  const read = host.readFile, exists = host.fileExists;
  host.readFile = path => virtual.get(path) ?? read(path);
  host.fileExists = path => virtual.has(path) || exists(path);
  const directoryExists = host.directoryExists;
  host.directoryExists = path => [...virtual.keys()].some(file => file.startsWith(path + '/')) || !!directoryExists?.(path);
  host.getSourceFile = (path, languageVersion) => { const content = host.readFile(path); return content === undefined ? undefined : ts.createSourceFile(path, content, languageVersion, true); };
  const program = ts.createProgram([...virtual.keys()], options, host);
  const errors = ts.getPreEmitDiagnostics(program).filter(d => d.category === ts.DiagnosticCategory.Error);
  if (errors.length) {
    const describe = (error: ts.Diagnostic) => {
      const fileName = error.file?.fileName.replace(root + '/', '') || '';
      const line = error.file && error.start !== undefined ? `:${error.file.getLineAndCharacterOfPosition(error.start).line + 1}` : '';
      const detail = ts.flattenDiagnosticMessageText(error.messageText, ' ').slice(0, 220);
      const hint = error.code === 2304 && /Cannot find name '(Header|Footer)'/.test(detail)
        ? ' Decláralo en el archivo o impórtalo desde un componente local.'
        : '';
      return `TypeScript ${fileName}${line}: ${detail}${detail.endsWith('.') ? '' : '.'}${hint}`;
    };
    // The single bounded repair only sees this message, and the prompt keeps 2,000 characters of it:
    // list as many errors as fit (at most 8) so it can fix them together, then count the rest.
    const shown: string[] = [];
    for (const error of errors.slice(0, 8)) {
      const line = describe(error);
      if (shown.length && shown.join('\n').length + line.length + 1 > 1700) break;
      shown.push(line);
    }
    const rest = errors.length - shown.length;
    throw new BadGatewayException(shown.join('\n') + (rest > 0 ? `\n…y ${rest} errores más.` : ''));
  }
}

/** Compile only. Merchant modules are never imported/evaluated in the API process. */
export async function compileNextPreview(files: SourceProjectFileDto[], purpose: SourceSitePurpose = 'shop'): Promise<SourceProjectFileDto[]> {
  validateNextSources(files, purpose);
  const pages = nextContentPages(files, purpose);
  checkNextTypes(files);
  const authored = files;
  const source = new Map(authored.map(f => [f.path, f.content]));
  source.set('lib/creative.tsx', creativeRuntime());
  source.set('lib/ui.tsx', uiRuntime());
  // The store kit block is served on its own, in its cascade layer (sub-project 7); Tailwind never sees it.
  const globals = extractKitBlock(source.get('styles/globals.css') ?? '');
  const storeKit = globals.block === null ? '' : validateStoreKitCss(globals.block).css;
  // Tailwind may resolve a different PostCSS 8 patch; its plugin uses the same runtime contract.
  const css = await postcss([tailwindcss({ content: authored.filter(f => f.path.endsWith('.tsx')).map(f => ({ raw: f.content, extension: 'tsx' })), corePlugins: { preflight: true } }) as unknown as import('postcss').Plugin])
    .process('@tailwind base;\n@tailwind components;\n@tailwind utilities;\n' + globals.rest, { from: undefined });
  // Tailwind utilities are authored CSS too (`[&_.menu-add]:opacity-0`): the compiled sheet meets the protected-element rules.
  const compiled: SourceProjectFileDto[] = [{ path: 'styles.css', content: validateAuthoredCss(css.css, 'styles.css').css }, { path: 'site.js', content: '/* React components own authored interactions. */' }];
  if (storeKit) compiled.push({ path: SOURCE_KIT_CSS_PATH, content: storeKit });
  for (const page of pages) {
    const entry = `import React from 'react'; import {createRoot} from 'react-dom/client'; import {flushSync} from 'react-dom'; import {CreativeProvider} from '@pagosya/creative'; import Page from './components/${page.name}'; flushSync(()=>createRoot(document.getElementById('pagosya-react-root')).render(React.createElement(CreativeProvider, null, React.createElement(Page))));`;
    try {
      const result = await build({ stdin: { contents: entry, sourcefile: 'preview-entry.tsx', resolveDir: process.cwd(), loader: 'tsx' }, bundle: true, write: false,
        platform: 'browser', charset: 'utf8', format: 'iife', target: 'es2022', jsx: 'automatic', minify: true, define: { 'process.env.NODE_ENV': '"production"' }, logLevel: 'silent',
        plugins: [{ name: 'merchant-components', setup(builder) {
          builder.onResolve({ filter: /.*/ }, args => {
            const entryImport = args.importer.endsWith('preview-entry.tsx');
            if (args.namespace !== 'merchant' && !entryImport) return;
            if (args.path === '@pagosya/creative') return { path: 'lib/creative.tsx', namespace: 'merchant' };
            if (args.path === '@pagosya/ui') return { path: 'lib/ui.tsx', namespace: 'merchant' };
            if (args.namespace === 'merchant' && args.importer === 'lib/creative.tsx' && args.path === 'lottie-web/build/player/lottie_light') return { path: require.resolve(args.path) };
            if (args.namespace === 'merchant' && args.importer === 'lib/ui.tsx' && args.path === 'lenis') return { path: require.resolve(args.path) };
            if (['react', 'react/jsx-runtime', 'motion/react', 'motion'].includes(args.path)) return { path: require.resolve(args.path) };
            if (entryImport && ['react-dom', 'react-dom/client'].includes(args.path)) return { path: require.resolve(args.path) };
            if (!args.path.startsWith('.')) return { errors: [{ text: `Import no permitido: ${args.path}` }] };
            const base = args.namespace === 'merchant' ? posix.dirname(args.importer) : '.';
            const path = posix.normalize(posix.join(base, args.path));
            const resolved = [path, `${path}.tsx`, `${path}/index.tsx`].find(candidate => source.has(candidate));
            return resolved ? { path: resolved, namespace: 'merchant' } : { errors: [{ text: `No existe el componente ${path}` }] };
          });
          builder.onLoad({ filter: /.*/, namespace: 'merchant' }, args => ({ contents: source.get(args.path), loader: 'tsx' }));
        } }],
      });
      compiled.push({ path: `_compiled/${page.name}.js`, content: result.outputFiles[0].text });
    } catch (error: any) {
      throw new BadGatewayException(`No se pudo compilar ${page.name}: ${String(error.errors?.[0]?.text || error.message).slice(0, 450)}`);
    }
    compiled.push({ path: page.path, content: `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title></title><link rel="stylesheet" href="commerce-pages.css"><link rel="stylesheet" href="styles.css">${storeKit ? storeKitLink() : ''}<link rel="stylesheet" href="brand.css"></head><body><div id="pagosya-react-root"></div><script src="config.js" defer></script><script src="_compiled/${page.name}.js" defer></script><script src="commerce.js" defer></script><script src="site.js" defer></script></body></html>` });
  }
  compiled.push({ path: 'source-next-layout.json', content: JSON.stringify(Object.fromEntries(pages.map(page => [page.path, nextPageMarkup(authored, page.name)]))) });
  return compiled;
}

export function nextProjectScaffold(name: string, pages: ReadonlyArray<{ name: string; path: string }> = nextPages): SourceProjectFileDto[] {
  const files: SourceProjectFileDto[] = [
    { path: 'lib/creative.tsx', content: creativeRuntime() },
    { path: 'lib/ui.tsx', content: uiRuntime() },
    { path: 'creative.d.ts', content: creativeTypes },
    { path: NEXT_SOURCE_MARKER, content: JSON.stringify({ framework: 'next', version: 1, preview: 'react-compiled', routes: pages }) },
    { path: 'package.json', content: JSON.stringify({ name: `storefront-${name}`, version: '1.0.0', private: true, scripts: { dev: 'next dev', build: 'next build', start: 'node server.mjs', typecheck: 'tsc --noEmit' }, dependencies: { lenis: '1.3.26', motion: '13.1.1', 'lottie-web': '5.13.0', next: '15.5.25', react: '19.2.6', 'react-dom': '19.2.6' }, devDependencies: { typescript: '^5.6.3', '@types/node': '^20.16.11', '@types/react': '^19.0.0', '@types/react-dom': '^19.0.0', tailwindcss: '3.4.19', postcss: '8.5.25', autoprefixer: '^10.4.20' } }, null, 2) },
    { path: 'next.config.mjs', content: 'export default { output: "export", images: { unoptimized: true }, poweredByHeader: false, experimental: { cpus: 1 } };\n' },
    { path: 'tailwind.config.cjs', content: 'module.exports = { content: ["./components/**/*.tsx", "./pages/**/*.tsx"], theme: { extend: {} }, plugins: [] };\n' },
    { path: 'postcss.config.cjs', content: 'module.exports = { plugins: { tailwindcss: {}, autoprefixer: {} } };\n' },
    { path: 'styles/tailwind.css', content: '@tailwind base;\n@tailwind components;\n@tailwind utilities;\n' },
    { path: 'tsconfig.json', content: JSON.stringify({ compilerOptions: { target: 'ES2022', lib: ['dom', 'dom.iterable', 'esnext'], allowJs: true, skipLibCheck: true, strict: true, noEmit: true, esModuleInterop: true, module: 'esnext', moduleResolution: 'bundler', resolveJsonModule: true, isolatedModules: true, jsx: 'preserve', incremental: true, baseUrl: '.', paths: { '@pagosya/creative': ['./lib/creative.tsx'], '@pagosya/ui': ['./lib/ui.tsx'] } }, include: ['next-env.d.ts', '**/*.ts', '**/*.tsx'], exclude: ['node_modules'] }, null, 2) },
    { path: 'next-env.d.ts', content: '/// <reference types="next" />\n/// <reference types="next/image-types/global" />\n' },
    { path: 'pages/_app.tsx', content: `import type { AppProps } from 'next/app';\nimport '../styles/tailwind.css';\nimport '../styles/globals.css';\nexport default function App({ Component, pageProps }: AppProps) { return <Component {...pageProps} />; }\n` },
    { path: 'pages/_document.tsx', content: `import { Html, Head, Main, NextScript } from 'next/document';\nexport default function Document() { return <Html lang="es"><Head><link rel="stylesheet" href="/commerce-pages.css"/><link rel="stylesheet" href="/brand.css"/></Head><body><script src="/config.js"/><Main/><NextScript/></body></Html>; }\n` },
    { path: 'lib/commerce.tsx', content: `import { useEffect, type ComponentType } from 'react';\nimport { CreativeProvider } from './creative';\nexport function withCommerce(Content: ComponentType) { return function StorefrontPage() { useEffect(() => { if (document.querySelector('script[data-pagosya-runtime]')) return; const script = document.createElement('script'); script.src = '/commerce.js'; script.dataset.pagosyaRuntime = 'true'; document.body.append(script); }, []); return <CreativeProvider><Content/></CreativeProvider>; }; }\n` },
    { path: 'README.md', content: '# Next.js storefront\n\nRun npm install, then npm run dev. npm run typecheck validates TypeScript; npm run build exports the website to out/. Serve out/ with a static host (for example npx serve out).\n\nEdit components/*.tsx and styles/globals.css. The same React components and Tailwind rules power the PagosYa preview. Export uses Next.js Pages Router with prerendered pages and client-side commerce. Use normal links to index.html, product.html and checkout.html; React owns the page layout and the PagosYa runtime owns the empty commerce mounts.\n\nProducts, orders, stock and payments use your PagosYa API. Configure its allowed storefront origin for your deployed domain. No merchant credentials or database are included.\n' },
  ];
  for (const page of pages) files.push({ path: `pages/${page.path.replace(/\.html$/, '')}.tsx`, content: `import Page from '../components/${page.name}';\nimport { withCommerce } from '../lib/commerce';\nexport default withCommerce(Page);\n` });
  return files;
}

/** Export source + trusted Next tooling, not the separate Studio preview bundles. */
export function nextProjectExport(files: SourceProjectFileDto[], name: string): SourceProjectFileDto[] {
  const pages = nextContentPages(files, 'service');
  const heads: Record<string, Array<{ tag: string; attrs: Record<string, string>; text?: string }>> = {};
  for (const page of pages) {
    const doc = parse(files.find(f => f.path === page.path)?.content || '');
    const html: any = doc.childNodes.find((n: any) => n.tagName === 'html');
    const head = html?.childNodes.find((n: any) => n.tagName === 'head');
    heads[page.name] = (head?.childNodes || []).filter((n: any) => ['title', 'meta', 'link'].includes(n.tagName) && (n.tagName !== 'link' || n.attrs?.some((a: any) => a.name === 'rel' && a.value === 'canonical'))).map((n: any) => ({ tag: n.tagName, attrs: Object.fromEntries((n.attrs || []).map((a: any) => [a.name === 'charset' ? 'charSet' : a.name, a.value])), ...(n.tagName === 'title' ? { text: n.childNodes?.map((c: any) => c.value || '').join('') } : {}) }));
  }
  const metadata = { path: 'lib/seo.tsx', content: `import Head from 'next/head'; import { createElement } from 'react';\nconst heads: Record<string, Array<{tag: string; attrs: Record<string,string>; text?: string}>> = ${JSON.stringify(heads)};\nexport default function Seo({page}: {page:string}) { return <Head>{(heads[page] || []).map((item,i) => createElement(item.tag, {...item.attrs,key:i}, item.text))}</Head>; }\n` };
  return [...files.filter(f => nextSourceFile(f.path)).map(f => f.path.endsWith('.css') ? { ...f, content: f.content.replace(/url\(\s*(["']?)(?:\.\/)?assets\//g, 'url($1/assets/') } : f), ...nextProjectScaffold(name, pages).map(f => /^pages\/(?!_)[a-zA-Z0-9_-]+\.tsx$/.test(f.path) ? { ...f, content: f.content.replace('export default withCommerce(Page);', `import Seo from '../lib/seo';\nconst Content = withCommerce(Page);\nexport default function Storefront() { return <><Seo page="${pages.find(page => 'pages/' + page.path.replace(/\.html$/, '.tsx') === f.path)?.name || 'home'}"/><Content/></>; }`) } : f), metadata, ...files.filter(f => f.path === 'server.mjs').map(f => ({ ...f, content: f.content.replaceAll('dist/index.html', 'out/index.html').replaceAll('resolve(root, "dist")', 'resolve(root, "out")') })), ...files.filter(f => f.path.startsWith('assets/') || ['config.js', 'commerce.js', 'commerce-pages.css', 'brand.css', 'robots.txt', 'sitemap.xml', 'llms.txt'].includes(f.path)).map(f => ({ ...f, path: `public/${f.path}` }))];
}
