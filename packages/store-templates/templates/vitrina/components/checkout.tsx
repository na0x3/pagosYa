import { Header, Footer } from './Shell';

export default function Checkout() {
  return <div className="es">
    <a className="es-skip" href="#contenido">Ir al contenido</a>
    <Header />
    <main id="contenido" className="es-page"><div data-pagosya-checkout-page /></main>
    <p data-pagosya-status role="status" aria-live="polite" className="es-status" />
    <Footer />
  </div>;
}
