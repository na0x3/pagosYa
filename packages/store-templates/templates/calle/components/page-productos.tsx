// @pagosya-catalog-page — the platform's catalogue page (sort & filter styles 2026-10-21); not counted as a design file.
import Shell from './Shell';

/** Sort & filter styles spec 2026-10-21: the whole catalogue inside the store's own header, menu and footer; the kit draws the
 *  grid, search and filters into the mount. */
export default function Productos() {
  return <Shell>
    <main id="contenido" className="es-page es-catalog-page">
      <h1 className="es-catalog-page__title">Todos los productos</h1>
      <section data-pagosya-catalog data-catalog-full />
    </main>
  </Shell>;
}
