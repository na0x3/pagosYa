import Shell from './Shell';

/** Sort & filter styles spec 2026-10-21: one collection inside the store's own header, menu and footer; the kit draws the
 *  collection's name, its tabs and its products into the mount. */
export default function Coleccion() {
  return <Shell>
    <main id="contenido" className="es-page es-catalog-page">
      <h1 className="es-catalog-page__title">Colección</h1>
      <section data-pagosya-catalog data-catalog-full data-collection-page />
    </main>
  </Shell>;
}
