import { Header, Footer, Commerce } from './Shell';

export default function Checkout() {
  return <div className="pl">
    <Header />
    <main id="contenido" className="pl-page pl-page--checkout" data-pagosya-checkout-page />
    <p data-pagosya-status role="status" aria-live="polite" className="pl-status" />
    <Footer />
    <Commerce />
  </div>;
}
