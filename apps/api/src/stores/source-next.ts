import { BadGatewayException } from '@nestjs/common';
import { build } from 'esbuild';
import postcss from 'postcss';
import tailwindcss from 'tailwindcss';
import * as ts from 'typescript';
import { parse } from 'parse5';
import { posix, join } from 'node:path';
import { creativeRuntime, creativeTypes, SOURCE_CREATIVE_IMPORTS, SOURCE_CREATIVE_TOOLS } from './source-creative';
import { sourceLocationUrl } from './source-location';
import { validateSourceDesignImplementation, type SourceDesign } from './source-design';
import type { SourceProjectFileDto } from './dto/save-source-project.dto';

export const NEXT_SOURCE_MARKER = 'storefront-framework.json';
export const nextSourceFile = (path: string) => /^components\/(?:[a-zA-Z0-9_-]+\/)*[a-zA-Z0-9_-]+\.tsx$/.test(path) || path === 'styles/globals.css';
export const isNextSource = (files: SourceProjectFileDto[] = []) => files.some(f => f.path === NEXT_SOURCE_MARKER);
export const nextPages = [{ name: 'home', path: 'index.html' }, { name: 'product', path: 'product.html' }, { name: 'checkout', path: 'checkout.html' }] as const;

export const SOURCE_NEXT_INSTRUCTIONS = `Generate a real Next.js storefront using React, TypeScript and Tailwind CSS 3. The platform supplies the trusted Next.js Pages Router scaffold, package.json, configuration, runtime and build tooling. Return ONLY components/**/*.tsx and styles/globals.css. Required default-export React components: components/home.tsx, components/product.tsx, components/checkout.tsx. Extract a shared Header, Footer and other reusable pieces into components/. Each page must reuse the same actual shared navigation, typography and brand. Use className with complete literal Tailwind utility names, responsive prefixes, arbitrary values and normal React event handlers/useState/useEffect for interaction. Use styles/globals.css for shared tokens, @font-face, runtime commerce selectors and custom animation. The platform adds @tailwind directives. ${SOURCE_CREATIVE_TOOLS} React and relative component imports are available; do not import remote resources, server modules, Next APIs or CSS from components. Do not output framework configuration, HTML files, site.js, styles.css or compiled bundles. Do not use dangerouslySetInnerHTML, eval, new Function, dynamic imports, script tags or authored fetch calls. Use ordinary anchors with index.html, product.html and checkout.html hrefs, because the same components run in isolated preview and Next.js static exports. The framework supplies document/head/scripts and SEO; components return page content, never html/head/body tags.
The existing PagosYa commerce runtime owns products, prices, cart, checkout, forms, reviews, bundles, loyalty, privacy and payments. Homepage MUST render one empty data-pagosya-catalog mount, an empty hidden data-pagosya-cart mount, data-pagosya-status (role=status aria-live=polite), and a real button with data-cart-open. Product must render empty data-pagosya-product-page and data-pagosya-cart mounts plus data-pagosya-status. Checkout must render one empty data-pagosya-checkout-page and data-pagosya-status; do not duplicate payment fields/cart markup. The runtime starts after React mounts. Style its menu-item, menu-item__name, menu-item__desc, menu-item__price, menu-add, order-item, order-line, order-field, order-total, order-note, checkout-button, product-page and checkout-page classes in globals.css. It emits pagosya:ready for idempotent decoration; never write into an observed catalog subtree from a MutationObserver. Do not register custom purchase/payment implementations. Never render React children inside these runtime-owned mounts or remove them during unrelated state changes. Style runtime classes in globals.css; Tailwind utilities on the surrounding layout are encouraged. Homepage and product need usable cart access; all pages need navigation back to index.html. Add the optional contact hook as an empty hidden data-pagosya-contact mount; the runtime owns whether it appears. Location iframes may be normal React JSX with a supported HTTPS map src, title, loading=lazy and responsive sizing. Uploaded assets use literal /assets/... paths. Do not copy reference-site assets or fabricate product photography. Read browser globals only in effects or event handlers so Next.js can prerender the page. Define main and its planned direct section IDs literally in components/home.tsx. Put runtime hooks in literal JSX with no children; do not hide them behind conditions. Native React/CSS/SVG motion is available with reduced-motion support. Respect the selected motion mode and confirmed brand tokens. Preserve unrelated components and CSS for local edits. A whole-site redesign can replace existing components; legacy HTML supplied during migration is reference material to reconstruct in React while preserving its business content and commerce behavior.
Before returning source, perform a strict TypeScript scope pass: every uppercase JSX tag or referenced component name must be declared in that file or explicitly imported from a returned local components/*.tsx file. Shared Header, Footer and other primitives must have one concrete definition and matching imports in every page that uses them; never rely on a symbol existing in another file implicitly. Do not return a page that would produce Cannot find name, module-not-found or JSX intrinsic-element errors.
Choose the homepage information architecture for this merchant: a narrative landing page, useful catalog, gallery, playful scene or a combination can work. Keep navigation and the primary customer action easy to find. Use anchors for destinations and buttons for actions/state changes. Additional pages are optional when the content earns them. Keep cart access visible on mobile.`;

export function validateNextSources(files: SourceProjectFileDto[]) {
  if (!Array.isArray(files) || files.length > 24) throw new BadGatewayException('El proyecto React debe contener como máximo 24 archivos de diseño.');
  const seen = new Set<string>();
  for (const file of files) {
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
          if (!SOURCE_CREATIVE_IMPORTS.includes(specifier) && !specifier.startsWith('./') && !specifier.startsWith('../')) throw new BadGatewayException(`Import no permitido en ${file.path}: ${specifier}. Usa React, Motion, @pagosya/creative o componentes locales.`);
        }
      }
      if (ts.isNewExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'Function') throw new BadGatewayException('No uses evaluación de código.');
      if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
        const tag = node.tagName.getText(source).split('.').at(-1)!;
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
  for (const path of ['components/home.tsx', 'components/product.tsx', 'components/checkout.tsx', 'styles/globals.css']) if (!files.some(f => f.path === path)) throw new BadGatewayException(`Falta ${path} en el proyecto Next.js.`);
  for (const page of nextPages) {
    const markup = nextPageMarkup(files, page.name);
    const hooks = page.name === 'home' ? ['data-pagosya-catalog', 'data-pagosya-cart', 'data-pagosya-status', 'data-cart-open'] : page.name === 'product' ? ['data-pagosya-product-page', 'data-pagosya-cart', 'data-pagosya-status', 'data-cart-open'] : ['data-pagosya-checkout-page', 'data-pagosya-status'];
    for (const hook of hooks) if (!new RegExp('<[^>]+\\b' + hook + '(?:\\s|=|>)').test(markup)) throw new BadGatewayException(`${page.name} necesita ${hook} en JSX visible.`);
  }
}

/** Conservative JSX structure inspection, never SSR or evaluation of merchant modules.
 * Literal page structure is required; rendered behavior is checked separately in Studio. */
export function nextPageMarkup(files: SourceProjectFileDto[], name: string): string {
  const seen = new Set<string>();
  const renderFile = (path: string, exportName = 'default'): string => {
    const key = `${path}#${exportName}`;
    if (seen.has(key)) return '';
    seen.add(key);
    const file = files.find(f => f.path === path);
    if (!file) return '';
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
    for (const statement of source.statements) if (ts.isImportDeclaration(statement) && ts.isStringLiteral(statement.moduleSpecifier) && statement.moduleSpecifier.text.startsWith('.')) {
      const base = posix.normalize(posix.join(posix.dirname(path), statement.moduleSpecifier.text));
      const target = [base, base + '.tsx', base + '/index.tsx'].find(p => files.some(f => f.path === p));
      if (target && statement.importClause?.name) imports.set(statement.importClause.name.text, { path: target, exported: 'default' });
      const bindings = statement.importClause?.namedBindings;
      if (target && bindings && ts.isNamedImports(bindings)) for (const binding of bindings.elements) {
        if (!binding.isTypeOnly) imports.set(binding.name.text, { path: target, exported: (binding.propertyName || binding.name).text });
      }
    }
    const escape = (value: string) => value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;');
    const render = (node: ts.Node): string => {
      if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) {
        const opening = ts.isJsxElement(node) ? node.openingElement : node;
        let tag = opening.tagName.getText(source);
        if (transparent.has(tag)) return ts.isJsxElement(node) ? node.children.map(render).join('') : '';
        const animated = tag.match(/^([A-Za-z_$][\w$]*)\.([a-z][A-Za-z0-9]*)$/);
        if (animated && motionTags.has(animated[1])) tag = animated[2];
        if (imports.has(tag)) { const imported = imports.get(tag)!; return renderFile(imported.path, imported.exported); }
        if (/^[A-Z]/.test(tag) && declarations.has(tag)) {
          const localKey = `${path}#local:${tag}`; if (seen.has(localKey)) return ''; seen.add(localKey);
          return render(declarations.get(tag)!);
        }
        if (!/^[a-z]/.test(tag)) return '';
        const attrs = opening.attributes.properties.filter(ts.isJsxAttribute).map(a => {
          const value = !a.initializer ? '' : ts.isStringLiteral(a.initializer) ? a.initializer.text : ts.isJsxExpression(a.initializer) && a.initializer.expression && ts.isStringLiteral(a.initializer.expression) ? a.initializer.expression.text : '';
          return ` ${a.name.getText(source)}="${escape(value)}"`;
        }).join('');
        const children = ts.isJsxElement(node) ? node.children.map(render).join('') : '';
        if (opening.attributes.properties.some(a => ts.isJsxAttribute(a) && /^data-pagosya-(catalog|cart|status|product-page|checkout-page|contact)$/.test(a.name.getText(source))) && ts.isJsxElement(node) && node.children.some(c => !ts.isJsxText(c) || c.text.trim())) throw new BadGatewayException('Los contenedores de comercio deben quedar vacíos; React no debe controlar sus hijos.');
        return `<${tag}${attrs}>${children}</${tag}>`;
      }
      if (ts.isJsxText(node)) return escape(node.text);
      if (ts.isJsxExpression(node)) return ''; // Do not claim runtime expressions were verified.
      let result = ''; ts.forEachChild(node, child => { result += render(child); }); return result;
    };
    const component = exports.get(exportName);
    return component ? render(component) : '';
  };
  return renderFile(`components/${name}.tsx`);
}

export function validateNextDesign(files: SourceProjectFileDto[], design: SourceDesign) {
  validateSourceDesignImplementation(design, [{ path: 'index.html', content: nextPageMarkup(files, 'home') }]);
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
 * Repairs omitted local imports and the two shared primitives most likely to
 * be omitted by a compact model response. Unknown missing components still go
 * through the normal AI repair path instead of being hidden.
 */
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
  const virtual = new Map([...files.filter(f => f.path.endsWith('.tsx')), { path: 'lib/creative.tsx', content: creativeRuntime() }, { path: 'creative.d.ts', content: creativeTypes }].map(f => [join(root, f.path), f.content]));
  const options: ts.CompilerOptions = { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler, jsx: ts.JsxEmit.ReactJSX, strict: true, noEmit: true, skipLibCheck: true, esModuleInterop: true, types: [], baseUrl: root, paths: { '@pagosya/creative': ['lib/creative.tsx'] } };
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
    const error = errors[0];
    const fileName = error.file?.fileName.replace(root + '/', '') || '';
    const detail = ts.flattenDiagnosticMessageText(error.messageText, ' ').slice(0, 450);
    const hint = error.code === 2304 && /Cannot find name '(Header|Footer)'/.test(detail)
      ? ' Decláralo en el archivo o impórtalo desde un componente local.'
      : '';
    throw new BadGatewayException(`TypeScript ${fileName}: ${detail}${detail.endsWith('.') ? '' : '.'}${hint}`);
  }
}

/** Compile only. Merchant modules are never imported/evaluated in the API process. */
export async function compileNextPreview(files: SourceProjectFileDto[]): Promise<SourceProjectFileDto[]> {
  validateNextSources(files);
  checkNextTypes(files);
  const authored = files;
  const source = new Map(authored.map(f => [f.path, f.content]));
  source.set('lib/creative.tsx', creativeRuntime());
  // Tailwind may resolve a different PostCSS 8 patch; its plugin uses the same runtime contract.
  const css = await postcss([tailwindcss({ content: authored.filter(f => f.path.endsWith('.tsx')).map(f => ({ raw: f.content, extension: 'tsx' })), corePlugins: { preflight: true } }) as unknown as import('postcss').Plugin])
    .process('@tailwind base;\n@tailwind components;\n@tailwind utilities;\n' + source.get('styles/globals.css'), { from: undefined });
  const compiled: SourceProjectFileDto[] = [{ path: 'styles.css', content: css.css }, { path: 'site.js', content: '/* React components own authored interactions. */' }];
  for (const page of nextPages) {
    const entry = `import React from 'react'; import {createRoot} from 'react-dom/client'; import {flushSync} from 'react-dom'; import {CreativeProvider} from '@pagosya/creative'; import Page from './components/${page.name}'; flushSync(()=>createRoot(document.getElementById('pagosya-react-root')).render(React.createElement(CreativeProvider, null, React.createElement(Page))));`;
    try {
      const result = await build({ stdin: { contents: entry, sourcefile: 'preview-entry.tsx', resolveDir: process.cwd(), loader: 'tsx' }, bundle: true, write: false,
        platform: 'browser', charset: 'utf8', format: 'iife', target: 'es2022', jsx: 'automatic', minify: true, define: { 'process.env.NODE_ENV': '"production"' }, logLevel: 'silent',
        plugins: [{ name: 'merchant-components', setup(builder) {
          builder.onResolve({ filter: /.*/ }, args => {
            const entryImport = args.importer.endsWith('preview-entry.tsx');
            if (args.namespace !== 'merchant' && !entryImport) return;
            if (args.path === '@pagosya/creative') return { path: 'lib/creative.tsx', namespace: 'merchant' };
            if (args.namespace === 'merchant' && args.importer === 'lib/creative.tsx' && args.path === 'lottie-web/build/player/lottie_light') return { path: require.resolve(args.path) };
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
    compiled.push({ path: page.path, content: `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title></title><link rel="stylesheet" href="commerce-pages.css"><link rel="stylesheet" href="styles.css"><link rel="stylesheet" href="brand.css"></head><body><div id="pagosya-react-root"></div><script src="config.js" defer></script><script src="_compiled/${page.name}.js" defer></script><script src="commerce.js" defer></script><script src="site.js" defer></script></body></html>` });
  }
  compiled.push({ path: 'source-next-layout.json', content: JSON.stringify(Object.fromEntries(nextPages.map(page => [page.path, nextPageMarkup(authored, page.name)]))) });
  return compiled;
}

export function nextProjectScaffold(name: string): SourceProjectFileDto[] {
  const files: SourceProjectFileDto[] = [
    { path: 'lib/creative.tsx', content: creativeRuntime() },
    { path: 'creative.d.ts', content: creativeTypes },
    { path: NEXT_SOURCE_MARKER, content: JSON.stringify({ framework: 'next', version: 1, preview: 'react-compiled', routes: nextPages }) },
    { path: 'package.json', content: JSON.stringify({ name: `storefront-${name}`, version: '1.0.0', private: true, scripts: { dev: 'next dev', build: 'next build', start: 'node server.mjs', typecheck: 'tsc --noEmit' }, dependencies: { motion: '13.1.1', 'lottie-web': '5.13.0', next: '15.5.25', react: '19.2.6', 'react-dom': '19.2.6' }, devDependencies: { typescript: '^5.6.3', '@types/node': '^20.16.11', '@types/react': '^19.0.0', '@types/react-dom': '^19.0.0', tailwindcss: '3.4.19', postcss: '8.5.25', autoprefixer: '^10.4.20' } }, null, 2) },
    { path: 'next.config.mjs', content: 'export default { output: "export", images: { unoptimized: true }, poweredByHeader: false, experimental: { cpus: 1 } };\n' },
    { path: 'tailwind.config.cjs', content: 'module.exports = { content: ["./components/**/*.tsx", "./pages/**/*.tsx"], theme: { extend: {} }, plugins: [] };\n' },
    { path: 'postcss.config.cjs', content: 'module.exports = { plugins: { tailwindcss: {}, autoprefixer: {} } };\n' },
    { path: 'styles/tailwind.css', content: '@tailwind base;\n@tailwind components;\n@tailwind utilities;\n' },
    { path: 'tsconfig.json', content: JSON.stringify({ compilerOptions: { target: 'ES2022', lib: ['dom', 'dom.iterable', 'esnext'], allowJs: true, skipLibCheck: true, strict: true, noEmit: true, esModuleInterop: true, module: 'esnext', moduleResolution: 'bundler', resolveJsonModule: true, isolatedModules: true, jsx: 'preserve', incremental: true, baseUrl: '.', paths: { '@pagosya/creative': ['./lib/creative.tsx'] } }, include: ['next-env.d.ts', '**/*.ts', '**/*.tsx'], exclude: ['node_modules'] }, null, 2) },
    { path: 'next-env.d.ts', content: '/// <reference types="next" />\n/// <reference types="next/image-types/global" />\n' },
    { path: 'pages/_app.tsx', content: `import type { AppProps } from 'next/app';\nimport '../styles/tailwind.css';\nimport '../styles/globals.css';\nexport default function App({ Component, pageProps }: AppProps) { return <Component {...pageProps} />; }\n` },
    { path: 'pages/_document.tsx', content: `import { Html, Head, Main, NextScript } from 'next/document';\nexport default function Document() { return <Html lang="es"><Head><link rel="stylesheet" href="/commerce-pages.css"/><link rel="stylesheet" href="/brand.css"/></Head><body><script src="/config.js"/><Main/><NextScript/></body></Html>; }\n` },
    { path: 'lib/commerce.tsx', content: `import { useEffect, type ComponentType } from 'react';\nimport { CreativeProvider } from './creative';\nexport function withCommerce(Content: ComponentType) { return function StorefrontPage() { useEffect(() => { if (document.querySelector('script[data-pagosya-runtime]')) return; const script = document.createElement('script'); script.src = '/commerce.js'; script.dataset.pagosyaRuntime = 'true'; document.body.append(script); }, []); return <CreativeProvider><Content/></CreativeProvider>; }; }\n` },
    { path: 'README.md', content: '# Next.js storefront\n\nRun npm install, then npm run dev. npm run typecheck validates TypeScript; npm run build exports the website to out/. Serve out/ with a static host (for example npx serve out).\n\nEdit components/*.tsx and styles/globals.css. The same React components and Tailwind rules power the PagosYa preview. Export uses Next.js Pages Router with prerendered pages and client-side commerce. Use normal links to index.html, product.html and checkout.html; React owns the page layout and the PagosYa runtime owns the empty commerce mounts.\n\nProducts, orders, stock and payments use your PagosYa API. Configure its allowed storefront origin for your deployed domain. No merchant credentials or database are included.\n' },
  ];
  for (const page of nextPages) files.push({ path: `pages/${page.name === 'home' ? 'index' : page.name}.tsx`, content: `import Page from '../components/${page.name}';\nimport { withCommerce } from '../lib/commerce';\nexport default withCommerce(Page);\n` });
  return files;
}

/** Export source + trusted Next tooling, not the separate Studio preview bundles. */
export function nextProjectExport(files: SourceProjectFileDto[], name: string): SourceProjectFileDto[] {
  const heads: Record<string, Array<{ tag: string; attrs: Record<string, string>; text?: string }>> = {};
  for (const page of nextPages) {
    const doc = parse(files.find(f => f.path === page.path)?.content || '');
    const html: any = doc.childNodes.find((n: any) => n.tagName === 'html');
    const head = html?.childNodes.find((n: any) => n.tagName === 'head');
    heads[page.name] = (head?.childNodes || []).filter((n: any) => ['title', 'meta', 'link'].includes(n.tagName) && (n.tagName !== 'link' || n.attrs?.some((a: any) => a.name === 'rel' && a.value === 'canonical'))).map((n: any) => ({ tag: n.tagName, attrs: Object.fromEntries((n.attrs || []).map((a: any) => [a.name === 'charset' ? 'charSet' : a.name, a.value])), ...(n.tagName === 'title' ? { text: n.childNodes?.map((c: any) => c.value || '').join('') } : {}) }));
  }
  const metadata = { path: 'lib/seo.tsx', content: `import Head from 'next/head'; import { createElement } from 'react';\nconst heads: Record<string, Array<{tag: string; attrs: Record<string,string>; text?: string}>> = ${JSON.stringify(heads)};\nexport default function Seo({page}: {page:string}) { return <Head>{(heads[page] || []).map((item,i) => createElement(item.tag, {...item.attrs,key:i}, item.text))}</Head>; }\n` };
  return [...files.filter(f => nextSourceFile(f.path)).map(f => f.path.endsWith('.css') ? { ...f, content: f.content.replace(/url\(\s*(["']?)(?:\.\/)?assets\//g, 'url($1/assets/') } : f), ...nextProjectScaffold(name).map(f => /^pages\/(index|product|checkout)\.tsx$/.test(f.path) ? { ...f, content: f.content.replace('export default withCommerce(Page);', `import Seo from '../lib/seo';\nconst Content = withCommerce(Page);\nexport default function Storefront() { return <><Seo page="${f.path === 'pages/index.tsx' ? 'home' : f.path.slice(6, -4)}"/><Content/></>; }`) } : f), metadata, ...files.filter(f => f.path === 'server.mjs').map(f => ({ ...f, content: f.content.replaceAll('dist/index.html', 'out/index.html').replaceAll('resolve(root, "dist")', 'resolve(root, "out")') })), ...files.filter(f => f.path.startsWith('assets/') || ['config.js', 'commerce.js', 'commerce-pages.css', 'brand.css', 'robots.txt', 'sitemap.xml', 'llms.txt'].includes(f.path)).map(f => ({ ...f, path: `public/${f.path}` }))];
}
