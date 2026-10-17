import { STOREFRONT_PAGES } from '@pagosya/shared-types';
import { SOURCE_STATIC_ACCOUNT_PAGES, staticAccountGateProblems, staticStandardPagePaths, withShowcaseAccountPages, withStaticStandardPages, withStaticNavSlot, withRefreshedStaticStandardPages } from './source-static-pages';
import { validateLegacySources } from './source-legacy';
import { validateGeneratedSource } from './source-generation.service';

/** The shape a Sep-5 authored store actually has, modelled on the store generated on 2026-10-06:
 *  a head with its own stylesheet, then header / main / footer, then the three runtime scripts. */
const authored = `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <link rel="stylesheet" href="styles.css">
<title>teidns — movimiento</title></head>
<body>
  <header class="site-header" id="inicio"><nav class="main-nav" aria-label="Navegación principal"><a href="index.html">teidns</a></nav></header>
  <main id="contenido">
    <section class="hero"><h1>Movimiento con guía</h1></section>
    <div data-pagosya-catalog></div><div data-pagosya-cart hidden></div><p data-pagosya-status role="status" aria-live="polite"></p>
  </main>
  <footer class="site-footer"><p>teidns</p></footer>
  <script src="config.js" defer></script>
  <script src="commerce.js" defer></script>
  <script src="site.js" defer></script>
</body>
</html>`;

const store = () => [{ path: 'index.html', content: authored }, { path: 'styles.css', content: '.hero{}' }, { path: 'site.js', content: '/* */' }];

it('adds every standard page the React side offers, at the URLs the runtime links to', () => {
  const { files, added } = withStaticStandardPages(store());
  // The same set, so a merchant is not offered different pages depending on how their store was built.
  expect(added.slice().sort()).toEqual(STOREFRONT_PAGES.filter(page => page.kind || page.owner === 'account').map(page => page.url).sort());
  expect(added).toContain('cookies.html');
  expect(added).toContain('privacidad.html');
  expect(added).toContain('terminos.html');
  // commerce.js fills the mount by kind; with the wrong kind the page renders "no disponible".
  expect(files.find(file => file.path === 'cookies.html')!.content).toContain('data-pagosya-page="cookies"');
  expect(files.find(file => file.path === 'colecciones.html')!.content).toContain('data-pagosya-page="collections"');
});

it('keeps the store own head, header, footer and runtime scripts on every page it writes', () => {
  const cookies = withStaticStandardPages(store()).files.find(file => file.path === 'cookies.html')!.content;
  // This is what reusing <Shell> buys the React side: a standard page cannot drift from the approved design.
  expect(cookies).toContain('<link rel="stylesheet" href="styles.css">');
  expect(cookies).toContain('class="site-header"');
  expect(cookies).toContain('class="site-footer"');
  expect(cookies).toContain('<script src="config.js" defer></script>');
  expect(cookies).toContain('<script src="commerce.js" defer></script>');
  // The homepage's own content does not come along, or every page would repeat the hero and the catalog.
  expect(cookies).not.toContain('Movimiento con guía');
  expect(cookies).not.toContain('data-pagosya-catalog');
  expect(cookies).toContain('<main id="contenido">');
  // Its own title, not the homepage's.
  expect(cookies).toContain('<title>Cookies</title>');
});

it('gives the footer the nav slot the runtime fills, on the pages that already existed too', () => {
  const { files, slotAdded } = withStaticStandardPages(store());
  expect(slotAdded).toBe(true);
  // commerce.js:1236 fills this with the information links plus the account link, which is how a shopper
  // reaches login on an authored store without the store drawing a single form field.
  for (const path of ['index.html', 'cookies.html', 'contacto.html']) {
    expect(files.find(file => file.path === path)!.content).toContain('data-pagosya-pages');
  }
});

it('passes the static validator that every authored save runs', () => {
  // A page this writes goes through the same save path as the merchant's own edits.
  expect(() => validateLegacySources(withStaticStandardPages(store()).files)).not.toThrow();
});

it('is idempotent, and leaves a page the store already wrote alone', () => {
  const once = withStaticStandardPages(store());
  const twice = withStaticStandardPages(once.files);
  expect(twice.added).toEqual([]);
  expect(twice.slotAdded).toBe(false);
  expect(twice.files.map(file => file.path).sort()).toEqual(once.files.map(file => file.path).sort());
  // One slot per footer, however many times it runs.
  expect(twice.files.find(file => file.path === 'index.html')!.content.match(/data-pagosya-pages/g)).toHaveLength(1);

  const own = [...store(), { path: 'contacto.html', content: '<main>mi propia página</main>' }];
  const result = withStaticStandardPages(own);
  expect(result.added).not.toContain('contacto.html');
  expect(result.files.find(file => file.path === 'contacto.html')!.content).toContain('mi propia página');
});

it('declines rather than guesses when the authored markup is ambiguous', () => {
  // Two footers: the slot could land inside the wrong one, so no page gets one.
  expect(withStaticNavSlot('<footer>a</footer><footer>b</footer>')).toBeNull();
  expect(withStaticNavSlot('<p>no footer</p>')).toBeNull();
  // Two mains: there is no single region to stand in for, so no page is written from it.
  expect(withStaticStandardPages([{ path: 'index.html', content: '<footer>f</footer><main>a</main><main>b</main>' }]).added).toEqual([]);
  // A store with no homepage has no shell to build from.
  expect(withStaticStandardPages([{ path: 'styles.css', content: '' }]).added).toEqual([]);
});

// Authored stores had no login page at all: the Studio's page menu lists a store's HTML files, and only React stores
// were given the account gates. The Studio swaps `[data-account-gate] .ui-container` for the trusted form; a published
// store keeps the button, which commerce.js points at the account app by its data-pagosya-account view.
it('adds the login and account gates in the store own shell', () => {
  const { files, added } = withStaticStandardPages(store());
  expect(added).toEqual(expect.arrayContaining(['acceso-ingresar.html', 'acceso-registro.html', 'cuenta-pedidos.html', 'cuenta-perfil.html']));
  const login = files.find(file => file.path === 'acceso-ingresar.html')!.content;
  expect(login).toContain('<section class="ui-account-gate" data-account-gate="login">');
  expect(login).toMatch(/data-account-gate="login">[\s\S]*<div class="ui-container">[\s\S]*data-pagosya-account="login"/);
  expect(login).toContain('<title>Ingresar</title>');
  expect(login).toContain('class="site-header"');
  expect(login).not.toContain('data-pagosya-catalog');
  expect(files.find(file => file.path === 'cuenta-pedidos.html')!.content).toContain('data-account-gate="orders"');
});

// 2026-10-12: asked for a prettier sign-up form, YAPI rebuilt the register page's fallback card around the button. The
// runtime wiped it and drew the real form in the narrow first column of the authored grid.
describe('account gates the runtime fills', () => {
  const withRegister = (gate: string) => {
    const { files } = withStaticStandardPages(store());
    return files.map(file => file.path === 'acceso-registro.html' ? { ...file, content: file.content.replace(/<section class="ui-account-gate"[\s\S]*<\/section>/, gate) } : file);
  };
  it('accepts the platform gate and decoration around its slot', () => {
    expect(staticAccountGateProblems(withStaticStandardPages(store()).files)).toEqual([]);
    expect(staticAccountGateProblems(withRegister('<section class="ui-account-gate register-gate" data-account-gate="register"><aside class="perks"><ul><li>Pedidos</li></ul></aside><div class="ui-container"><h1>Crea tu cuenta</h1><p>Hola</p><a class="ui-button" href="#" data-pagosya-account="register">Crear cuenta</a></div></section>'))).toEqual([]);
  });
  it('refuses authored markup inside the slot, and a page that lost its gate', () => {
    const files = withRegister('<section class="ui-account-gate" data-account-gate="register"><div class="ui-container register-shell"><aside class="register-intro"><p>MI CUENTA</p></aside><div class="register-card"><h1>Crea tu cuenta</h1><a data-pagosya-account="register">Crear cuenta</a></div></div></section>');
    expect(staticAccountGateProblems(files)).toEqual([expect.stringMatching(/^acceso-registro\.html puso <aside>, <div> dentro de \[data-account-gate\] \.ui-container.*\[data-part=…\]/)]);
    expect(() => validateGeneratedSource(files, 'shop')).toThrow('acceso-registro.html puso <aside>, <div>');
    expect(staticAccountGateProblems(withRegister('<section class="signup"><h1>Crea tu cuenta</h1></section>'))).toEqual([expect.stringContaining('acceso-registro.html perdió <section data-account-gate="register">')]);
  });
  it('tells a static generation how to restyle the drawn form', () => {
    expect(SOURCE_STATIC_ACCOUNT_PAGES).toContain('acceso-registro.html');
    expect(SOURCE_STATIC_ACCOUNT_PAGES).toContain('[data-account-gate] [data-part=account|media|card|title|lead|notice|form|field|label|input|hint|error|submit|link]');
  });
});

// The 24-file cap bounds what a model writes; 19 platform pages on top of an authored project must not trip it.
it('keeps a full authored project with its standard pages under the generated-file cap', () => {
  const extra = Array.from({ length: 8 }, (_, index) => ({ path: `extra-${index}.css`, content: '.x{}' }));
  const { files } = withStaticStandardPages([...store(), ...extra]);
  expect(files.length).toBeGreaterThan(24);
  expect(() => validateGeneratedSource(files, 'shop')).not.toThrow();
  // The model's own files still count.
  expect(() => validateGeneratedSource([...files, ...Array.from({ length: 14 }, (_, index) => ({ path: `more-${index}.css`, content: '.x{}' }))], 'shop')).toThrow(/proyecto válido/);
});

describe('standard pages follow the current home shell', () => {
  // Huerta Viva (2026-10-09): the standard pages were copied once from a header whose links had been stripped;
  // fixing index.html later never reached them, so 16 pages kept a dead menu and footer.
  it('rebuilds an untouched platform copy from the current index.html', () => {
    const first = withStaticStandardPages(store()).files;
    const fixedNav = authored.replace('<a href="index.html">teidns</a>', '<a href="index.html">teidns</a><a href="nosotros.html">Nosotros</a>');
    const next = withStaticStandardPages(first.map(file => (file.path === 'index.html' ? { ...file, content: fixedNav } : file)));
    const terms = next.files.find(file => file.path === 'terminos.html')!.content;
    expect(terms).toContain('<a href="nosotros.html">Nosotros</a>');
    expect(next.refreshed).toContain('terminos.html');
    expect(next.added).toEqual([]);
  });

  it('keeps a standard page someone authored', () => {
    const first = withStaticStandardPages(store()).files;
    const own = first.map(file => (file.path === 'nosotros.html' ? { ...file, content: file.content.replace(/<main([^>]*)>[\s\S]*<\/main>/, '<main$1><h1>Nuestra huerta</h1></main>') } : file));
    const next = withStaticStandardPages(own.map(file => (file.path === 'index.html' ? { ...file, content: file.content.replace('teidns</a>', 'teidns</a><a href="faq.html">FAQ</a>') } : file)));
    expect(next.files.find(file => file.path === 'nosotros.html')!.content).toContain('<h1>Nuestra huerta</h1>');
    expect(next.refreshed).not.toContain('nosotros.html');
  });

  it('reports nothing when the copies already match the shell', () => {
    const once = withStaticStandardPages(store()).files;
    const twice = withStaticStandardPages(once);
    expect(twice.refreshed).toEqual([]);
    expect(twice.files.map(file => file.content)).toEqual(once.map(file => file.content));
  });
});

describe('in-page anchors on standard pages', () => {
  const homepage = authored
    .replace('<a href="index.html">teidns</a></nav>', `<a href="index.html">teidns</a><a href="#catalogo">Catálogo</a><a href='#elegir'>Cómo elegir</a><a href="#" data-pagosya-account="login">Ingresar</a><a href="#site-menu">Menú</a><a href="https://example.com/#x">Fuera</a></nav><button aria-controls="site-menu">m</button><div id="site-menu"></div>`)
    .replace('</footer>', '<a href="#encontrarnos">Encontrarnos</a></footer>');
  const build = () => withStaticStandardPages([{ path: 'index.html', content: homepage }]).files;

  it('points header and footer section links at the homepage when the section is gone', () => {
    const nosotros = build().find(file => file.path === 'nosotros.html')!.content;
    expect(nosotros).toContain('href="index.html#catalogo"');
    expect(nosotros).toContain(`href='index.html#elegir'`);
    expect(nosotros).toContain('href="index.html#encontrarnos"');
    expect(nosotros).not.toContain('href="#catalogo"');
  });

  it('leaves a bare # link, an anchor whose id is still on the page, and other links alone', () => {
    const nosotros = build().find(file => file.path === 'nosotros.html')!.content;
    expect(nosotros).toContain('href="#" data-pagosya-account="login"');
    expect(nosotros).toContain('href="#site-menu"');
    expect(nosotros).toContain('href="https://example.com/#x"');
    expect(nosotros).toContain('href="index.html"');
  });

  it('leaves index.html itself untouched', () => {
    const index = build().find(file => file.path === 'index.html')!.content;
    expect(index).toContain('href="#catalogo"');
    expect(index).toContain('href="#encontrarnos"');
    expect(index).not.toContain('index.html#');
  });

  it('fixes a refreshed copy of an older standard page too', () => {
    const first = build();
    const stale = first.map(file => file.path === 'nosotros.html' ? { ...file, content: file.content.replace('href="index.html#catalogo"', 'href="#catalogo"') } : file);
    const out = withStaticStandardPages(stale);
    expect(out.refreshed).toContain('nosotros.html');
    expect(out.files.find(file => file.path === 'nosotros.html')!.content).toContain('href="index.html#catalogo"');
  });
});

describe('a showcase gets only the pages a business that does not sell needs (spec 2026-10-13)', () => {
  const SHOWCASE = ['nosotros.html', 'contacto.html', 'faq.html', 'privacidad.html', 'terminos.html', 'cookies.html', '404.html'];

  it('adds Nosotros, Contacto, Preguntas frecuentes, the policies and 404, and nothing a shop needs', () => {
    const { files, added } = withStaticStandardPages(store(), 'service');
    expect(added).toEqual(SHOWCASE);
    for (const path of ['buscar.html', 'colecciones.html', 'envios.html', 'reembolsos.html', 'acceso-ingresar.html', 'cuenta-pedidos.html']) expect(files.some(file => file.path === path)).toBe(false);
    expect(files.find(file => file.path === 'faq.html')!.content).toContain('data-pagosya-page="faq"');
  });

  it('is the same set for every purpose that is not a shop, and the full set for a shop', () => {
    for (const purpose of ['service', 'portfolio', 'editorial']) expect(staticStandardPagePaths(purpose)).toEqual(SHOWCASE);
    expect(staticStandardPagePaths('shop')).toEqual(expect.arrayContaining([...SHOWCASE, 'buscar.html', 'acceso-ingresar.html', 'envios.html']));
    expect(staticStandardPagePaths()).toEqual(staticStandardPagePaths('shop'));
  });
});

// Live 2026-10-15 (store pz2zcl3k): the home closed <main> after its hero, so its classes, video and location sections sat
// between </main> and the footer, and every standard page (404, login, privacy…) repeated them, autoplaying videos included.
it('never copies home sections that sit between </main> and the footer onto the standard pages', () => {
  const stray = authored.replace('</main>\n  <footer', '</main>\n  <section id="ritual" data-nav-label="Primera clase"><video data-ambient-video></video><section id="dentro"></section></section>\n  <div data-pagosya-cart-outside></div>\n  <footer');
  const { files } = withStaticStandardPages([{ path: 'index.html', content: stray }, { path: 'styles.css', content: '' }]);
  const privacy = files.find(file => file.path === 'privacidad.html')!.content;
  expect(privacy).not.toContain('id="ritual"');
  expect(privacy).not.toContain('<video');
  expect(privacy).toContain('data-pagosya-cart-outside');
  expect(privacy).toContain('<footer class="site-footer">');
  // The home itself keeps what it authored.
  expect(files.find(file => file.path === 'index.html')!.content).toContain('id="ritual"');
});

// Live 2026-10-16 (store pz2zcl3k): its cart drawer is authored inside the stray catalog section, so dropping the section
// took the store's own drawer (and its «Tu reserva» label) off every standard page.
it('keeps the cart a stray home section carries when it drops the section', () => {
  const stray = authored.replace('</main>\n  <footer', '</main>\n  <section id="clases"><h2>Clases</h2><aside data-pagosya-cart hidden aria-label="Tu reserva"><p>Vacía</p></aside></section>\n  <footer');
  const { files } = withStaticStandardPages([{ path: 'index.html', content: stray }, { path: 'styles.css', content: '' }]);
  const privacy = files.find(file => file.path === 'privacidad.html')!.content;
  expect(privacy).not.toContain('id="clases"');
  expect(privacy).not.toContain('<h2>Clases</h2>');
  expect(privacy).toContain('<aside data-pagosya-cart hidden aria-label="Tu reserva"><p>Vacía</p></aside>');
  expect(privacy.indexOf('data-pagosya-cart')).toBeLessThan(privacy.indexOf('<footer'));
});

// Live 2026-10-16 (store pz2zcl3k): pages built before the stray-section fix kept the copied home sections, because only a
// generation or «Agregar páginas» rebuilt them. Every save now refreshes the copies the platform still owns, and nothing else.
describe('refreshing the standard pages on every save', () => {
  const stray = authored.replace('</main>\n  <footer', '</main>\n  <section id="ritual"><video></video></section>\n  <footer');
  const built = withStaticStandardPages([{ path: 'index.html', content: stray }, { path: 'styles.css', content: '' }]).files;
  const stale = (path: string) => built.find(file => file.path === path)!.content.replace('<footer', '<section id="ritual"><video></video></section>\n  <footer');

  it('rebuilds a platform copy from the current home, leaving authored pages, missing pages and other files alone', () => {
    const authoredPage = stale('faq.html').replace(/<div data-pagosya-page="faq"><\/div>/, '<h1>Preguntas propias</h1>');
    const files = [
      ...built.filter(file => !['privacidad.html', 'faq.html', 'cookies.html'].includes(file.path)),
      { path: 'privacidad.html', content: stale('privacidad.html') },
      { path: 'faq.html', content: authoredPage },
    ];
    const refreshed = withRefreshedStaticStandardPages(files, 'shop');
    expect(refreshed.find(file => file.path === 'privacidad.html')!.content).toBe(built.find(file => file.path === 'privacidad.html')!.content);
    expect(refreshed.find(file => file.path === 'faq.html')!.content).toBe(authoredPage);
    expect(refreshed.some(file => file.path === 'cookies.html')).toBe(false);
    expect(refreshed.map(file => file.path)).toEqual(files.map(file => file.path));
  });

  it('returns the same files when nothing is stale, and leaves a store without index.html alone', () => {
    expect(withRefreshedStaticStandardPages(built, 'shop')).toEqual(built);
    const noIndex = [{ path: 'privacidad.html', content: stale('privacidad.html') }];
    expect(withRefreshedStaticStandardPages(noIndex, 'shop')).toEqual(noIndex);
  });
});

// baek (tholhejh), 2026-10-16: a showcase whose merchant asked for the account button needs the sign-in pages a shop has,
// or «Mi cuenta» leads nowhere (YAPI had written its own acceso-ingresar.html).
describe('a showcase with the account button gets the account pages (2026-10-16)', () => {
  const config = (header: object) => ({ path: 'config.js', content: `window.PAGOSYA_CONFIG = ${JSON.stringify({ slug: 'baek', header })};\n` });
  const ACCOUNT = ['acceso-ingresar.html', 'acceso-registro.html', 'acceso-olvide-mi-contrasena.html', 'acceso-restablecer-contrasena.html'];

  it('adds the account pages and nothing else at save, only when config.js turns the button on', () => {
    const files = [...store(), config({ account: true })];
    const saved = withShowcaseAccountPages(files, 'service');
    expect(saved.slice(0, files.length)).toEqual(files);
    expect(saved.slice(files.length).map(file => file.path)).toEqual(expect.arrayContaining(ACCOUNT));
    expect(saved.some(file => file.path === 'nosotros.html' || file.path === 'buscar.html')).toBe(false);
    expect(saved.find(file => file.path === 'acceso-ingresar.html')!.content).toContain('data-account-gate');
    expect(withShowcaseAccountPages([...store(), config({ account: false })], 'service')).toHaveLength(store().length + 1);
    expect(withShowcaseAccountPages(store(), 'service')).toEqual(store());
    expect(withShowcaseAccountPages(files, 'shop')).toBe(files);
  });

  it('leaves an account page the store already has, and lists the account pages among the showcase pages', () => {
    const own = { path: 'acceso-ingresar.html', content: '<main><section data-account-gate="login">propia</section></main>' };
    const saved = withShowcaseAccountPages([...store(), config({ account: true }), own], 'service');
    expect(saved.filter(file => file.path === 'acceso-ingresar.html')).toEqual([own]);
    expect(staticStandardPagePaths('service', true)).toEqual(expect.arrayContaining([...ACCOUNT, 'nosotros.html']));
    expect(staticStandardPagePaths('service', true)).not.toContain('buscar.html');
  });
});
