import { Announce, Header, Footer, Commerce } from './Shell';

export default function Checkout() {
  return <div className="ru">
    <Announce />
    <Header />
    <main id="contenido" className="ru-page ru-page--checkout" data-pagosya-checkout-page />
    <p data-pagosya-status role="status" aria-live="polite" className="ru-status" />
    <Footer />
    <Commerce />
  </div>;
}
