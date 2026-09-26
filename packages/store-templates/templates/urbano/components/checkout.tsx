import { Header, Footer } from './Shell';

export default function Checkout() {
  return <div className="ur">
    <Header />
    <main id="contenido" className="ur-page" data-pagosya-checkout-page />
    <p data-pagosya-status role="status" aria-live="polite" className="ur-status" />
    <Footer />
  </div>;
}
