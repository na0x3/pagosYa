import { Header, Footer, Commerce } from './Shell';

export default function Checkout() {
  return <div className="hi">
    <Header />
    <main id="contenido" className="hi-page hi-page--checkout" data-pagosya-checkout-page />
    <p data-pagosya-status role="status" aria-live="polite" className="hi-status" />
    <Footer />
    <Commerce />
  </div>;
}
