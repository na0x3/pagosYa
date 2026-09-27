import { Header, Footer } from './Shell';

export default function Checkout() {
  return <div className="en">
    <Header />
    <main id="contenido" className="en-page" data-pagosya-checkout-page />
    <p data-pagosya-status role="status" aria-live="polite" className="en-status" />
    <Footer />
  </div>;
}
