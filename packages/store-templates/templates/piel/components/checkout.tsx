import { Header, Footer } from './Shell';

export default function Checkout() {
  return <div className="pi">
    <Header />
    <main id="contenido" className="pi-page" data-pagosya-checkout-page />
    <p data-pagosya-status role="status" aria-live="polite" className="pi-status" />
    <Footer />
  </div>;
}
