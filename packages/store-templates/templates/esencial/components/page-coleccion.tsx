// @pagosya-catalog-page — the platform's catalogue page (sort & filter styles 2026-10-21); not counted as a design file.
import Shell from './Shell';

/** Sort & filter styles spec 2026-10-21: one collection inside the store's own header, menu and footer; the kit puts the
 *  collection's name in the title and draws its tabs and products into the mount. */
export default function Coleccion() {
  return <Shell>
    <main id="contenido" className="es-page es-catalog-page">
      <h1 className="es-catalog-page__title" data-collection-title>Colección</h1>
      <section data-pagosya-catalog data-catalog-full data-collection-page />
    </main>
  </Shell>;
}
