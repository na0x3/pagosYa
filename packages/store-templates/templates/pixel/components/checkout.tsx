import { Header, Footer } from './Shell';

export default function Checkout() {
  return <div className="px">
    <Header />
    <main id="contenido" className="px-page" data-pagosya-checkout-page />
    <p data-pagosya-status role="status" aria-live="polite" className="px-status" />
    <Footer />
  </div>;
}
