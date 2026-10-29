import { Header, Footer } from './Shell';

export default function Checkout() {
  return <div className="es">
    <Header />
    <main id="contenido" className="es-page" data-pagosya-checkout-page />
    <p data-pagosya-status role="status" aria-live="polite" className="es-status" />
    <Footer />
  </div>;
}
