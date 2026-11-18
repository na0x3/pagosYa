# Rasca y elige — design (2026-11-10)

**Owner:** showed bakeme.pages.dev («that kind of personalization is what i want… the scratch thing that makes you choose options and
etc is something i love… for every store… makes user choose what they are interested on»). Decisions taken by AskUserQuestion (all
the recommended options), examples approved («i like it»): https://claude.ai/artifact/QnmtWdPmBoPYWhVvy3ZSwg (Miga Dorada, Oh Belly,
BOXY; source kept in `examples/rasca-y-elige-2026-11-10/`).

It grows the popup games (docs/superpowers/specs/2026-11-09-popup-games-design.md): today a gold rectangle to scratch, one text
question, email only. Every store gets the same game made with its own things.

## The flow (both games: rasca y gana and ruleta)

1. **Play.** Rasca: the card has the business's shape (cookie with chips, can, bottle, cup, flower, garment, box, bag) painted in the
   store's colours, «RASCA AQUÍ» in its display font. Scratching strokes from the last point (a fast swipe clears a stripe); at 45 %
   cleared the prize shows. «Revelar sin rascar» stays. The ruleta keeps its wheel.
2. **¿Qué te interesa?** The prize on top («10 % OFF en tu primer pedido»), then a question written for the store with 3–6 answers,
   each with an emoji; several can be chosen; «Siguiente» (on with at least one) and «Saltar».
3. **¿Cuál es tu favorito?** 3–6 photo tiles of the store's own products (with photos, not sold out, memberships out). A store of
   one product with options shows its option values that have photos (Oh Belly → its flavours). Fewer than 3 → the step is skipped.
   The question names the store's word: «¿cuál es tu sabor favorito?», «¿qué modelo te gusta más?», else «¿cuál es tu favorito?».
4. **Guarda tu premio.** «Tu favorito: X» chip. The contact the merchant chose: **WhatsApp** (default) or **correo**; one field;
   «Suscribirme y ver X» and «No, gracias: solo ver X». Then the code with «Copiar» and «Ver X».
5. **Va a su favorito.** The popup closes and the page goes to that product: its card on this page (scrolled to, marked), else its
   product page. The favourite is remembered on the device (`pagosya:fav:{slug}`): on later visits its cards carry «Tu favorito»
   and come first in the store's grids.

A step-by-step bar (4 dashes) shows where the shopper is. The floating launcher becomes the shape's drawing + «Rasca y gana».

## Settings (StoreRetention.settings, JSON — no migration)

```ts
popupShape?: 'cookie' | 'can' | 'bottle' | 'cup' | 'flower' | 'garment' | 'box' | 'bag' | null;  // null → a plain card
popupInterests?: { text: string; answers: Array<{ label: string; icon: string }> } | null;      // 3–6 answers, ≤ 28 chars
popupFavourite?: { text: string } | null;                                                         // null → step skipped
popupContact?: 'whatsapp' | 'email';                                                              // default whatsapp
```

`popupQuestion` (one text answer) becomes `popupInterests`; an old store's question is read as interests without icons.

## Server

- `subscribe` takes `phone` (a Bolivian number: 7–8 digits, +591 optional; stored as digits) when the store asks for WhatsApp,
  `interests` (answers of the store's own list only) and `favourite` (`productId` or `productId:option value`, checked against the
  catalogue). The prize code works as today (game token).
- **Migration** (after `pnpm dev:doctor --backup`): `StoreNewsletterSubscriber.email` becomes optional, a subscriber has an email or a
  phone (CHECK), unique per store by phone too; new `favourite String?`. Store emails go only to subscribers with an email.
- The merchant's panel lists each subscriber's WhatsApp or email, interests and favourite, and the most chosen favourites.
  pagosYa does not send WhatsApp messages: the merchant writes to the list.

## YAPI

- Turning a game on (chat or Ajustes) picks the shape from the store's business (the same sector map as the cart icons), writes the
  interests question and answers from what the store sells (one short model call; failure → the step is left out) and the
  favourite question from the store's word for its products.
- Chat edits: «cambia la forma a una lata», «pregunta por WhatsApp / por correo», «quita la pregunta de intereses».

## Hosted (published) stores

The store frame never handles contact data: the WhatsApp number is typed in pagosYa's secure form like the email today; interests and
favourite travel with the subscribe request.

## Out of scope

Sending WhatsApp messages; a shape editor; per-shopper recommendations beyond «Tu favorito» first.

## Tests

Kit (browser): each shape draws and clears by strokes; interests multi-select; favourite tiles from real products and from a
one-product store's options; WhatsApp vs email field; «Ver X» scrolls to and marks the product; a later visit puts it first.
API: phone validation, interests/favourite checked against the store, email-or-phone CHECK, panel lists. YAPI: shape by sector,
interests written, chat ops.
