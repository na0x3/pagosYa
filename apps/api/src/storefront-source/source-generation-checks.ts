import { BadGatewayException } from "@nestjs/common";
import { Script } from "node:vm";
import postcss, { CssSyntaxError } from "postcss";
import { STATIC_STANDARD_PAGE_PATHS, staticAccountGateProblems } from './source-static-pages';
import { validateSourcePriceClaims } from './source-price-claims';
import { isAuthorableSourcePath } from './source-authorable';
import type { SourceSitePurpose } from './source-site-purpose';
import type { SourceProjectFileDto } from "./dto/save-source-project.dto";

export function sourceMarqueeEditPaths(files: SourceProjectFileDto[]): string[] | undefined {
  const stylesheet = files.find(file => /(?:^|\/)styles(?:\/globals)?\.css$/i.test(file.path))?.path;
  const dedicated = files.filter(file => /(?:marquee|ticker|announcement|banner|pawmarquee)/i.test(file.path));
  const featureFiles = dedicated.length
    ? dedicated
    : files.filter(file => typeof file.content === 'string' && /(?:marquesin|marquee|ticker|announcement|dot-drift|PawMarquee)/i.test(file.content));
  // A new or unnamed marquee still needs the rendered page/component. Limiting
  // the model to CSS is a silent no-op: the revision saves, but nothing visible
  // can appear in the storefront. Keep the scope narrow while always including
  // the existing home surface and its optional behavior file.
  const home = files.find(file => /(?:^|\/)(?:index|home)\.(?:html|tsx)$/i.test(file.path))?.path;
  const behavior = files.find(file => /(?:^|\/)(?:site|home)\.js$/i.test(file.path))?.path;
  const paths = [...featureFiles.map(file => file.path), ...(home ? [home] : []), ...(stylesheet ? [stylesheet] : []), ...(behavior ? [behavior] : [])];
  return paths.length ? [...new Set(paths)] : undefined;
}

/** `previous` is the saved revision an edit starts from: a problem it already had is not this save's to fix (the edit may not
 * even reach that file), so only the problems a save brings in block it (2026-10-12, Pistacho Loco's sign-up page). */
export function validateGeneratedSource(files: SourceProjectFileDto[], purpose: SourceSitePurpose = 'shop', previous: SourceProjectFileDto[] = []): void {
  // The cap bounds what a model writes. The standard pages are the platform's own copies of index.html, so they do not count.
  if (!Array.isArray(files) || files.filter(file => !STATIC_STANDARD_PAGE_PATHS.includes(file?.path)).length > 24) throw new BadGatewayException("La generación no devolvió un proyecto válido.");
  if (purpose === 'shop') validateSourcePriceClaims(files);
  for (const file of files) {
    if (!file || typeof file.content !== "string" || !isAuthorableSourcePath(file.path)) throw new BadGatewayException("La generación intentó cambiar un archivo reservado.");
    if (file.path.endsWith(".js")) {
      try { new Script(file.content, { filename: file.path }); } catch { throw new BadGatewayException(`Error de sintaxis en ${file.path}. Vuelve a generar.`); }
    }
    // A browser drops every rule after an unclosed bracket, string, comment or block, so one typo unstyles the whole store.
    if (file.path.endsWith(".css") && !previous.some(saved => saved.path === file.path && saved.content === file.content)) {
      try { postcss.parse(file.content, { from: file.path }); } catch (error) {
        const where = error instanceof CssSyntaxError ? `línea ${error.line}, columna ${error.column}: ${error.reason}` : 'no se pudo leer';
        throw new BadGatewayException(`Error de sintaxis CSS en ${file.path} (${where}). Cierra cada paréntesis, comilla, comentario y llave.`);
      }
    }
  }
  const savedGateProblems = new Set(staticAccountGateProblems(previous));
  const gateProblems = staticAccountGateProblems(files).filter(problem => !savedGateProblems.has(problem));
  if (gateProblems.length) throw new BadGatewayException(gateProblems.join(' '));
  const html = files.find((f) => f.path === "index.html")?.content || "";
  const missingFiles = ['index.html', 'styles.css', 'site.js'].filter(path => !files.some(f => f.path === path));
  const missingHooks = (purpose === 'shop' ? ['data-pagosya-catalog', 'data-pagosya-cart', 'data-pagosya-status'] : ['data-pagosya-status', 'data-pagosya-contact']).filter(hook => !html.includes(hook));
  if (missingFiles.length || missingHooks.length) throw new BadGatewayException([
    'La propuesta está incompleta.',
    missingFiles.length ? `Faltan archivos: ${missingFiles.join(', ')}.` : '',
    missingHooks.length ? `Faltan contenedores en index.html: ${missingHooks.join(', ')}. Añade cada atributo al elemento correspondiente del HTML.` : '',
  ].filter(Boolean).join(' '));
  for (const [path, hook] of [['product.html', 'data-pagosya-product-page'], ['checkout.html', 'data-pagosya-checkout-page']]) {
    const page = files.find(f => f.path === path)?.content;
    if (page && (!page.includes(hook) || !page.includes('styles.css') || !/src=["']config\.js["']/.test(page) || !/src=["']commerce\.js["']/.test(page) || !/src=["']site\.js["']/.test(page))) {
      throw new BadGatewayException(`La página ${path} necesita el diseño compartido y su conexión al catálogo y pago.`);
    }
  }
  const configAt = html.indexOf('src="config.js"'), commerceAt = html.indexOf('src="commerce.js"');
  if (configAt < 0 || commerceAt < configAt || !html.includes('src="site.js"')) throw new BadGatewayException("La página no conectó los archivos de comercio.");
}
