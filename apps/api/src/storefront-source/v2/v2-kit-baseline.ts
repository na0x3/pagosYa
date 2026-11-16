import postcss from 'postcss';

/** V2 prototype, live 2026-11-14 (Oh Belly V2: payment logos drawn full-width, «Combina» photos page-wide): the kit draws some
 *  product-page parts (payments, pairs, gallery thumbs) with no size of their own — until now only a template's sheet sized them
 *  (Esencial «product page duo»). Every V2 store gets that sizing as a baseline: the same rules, but with zero specificity (:where)
 *  so any rule the design writes wins, and generic --kit-* tokens the design sets in :root (with safe fallbacks). Not a template
 *  layer: no colours, fonts or layout of a theme — only the sizes and structure of parts the platform draws. */
export const V2_KIT_BASELINE = `/* v2:kit-baseline — sizes of the parts the platform draws; the design's own rules win (zero specificity) */
:where([data-product-slot]) :where(img, svg, video){max-width:100%;height:auto}
:where([data-part=payments]){display:grid;justify-items:start;gap:8px;margin:4px 0}
:where([data-part=payments]) :where(p){margin:0;font-size:12.5px;opacity:.7}
:where([data-part=payment-logos]){display:flex;flex-wrap:wrap;gap:6px}
:where([data-part=payment-logos]) :where(svg, img){width:38px;height:24px;border-radius:4px;box-shadow:0 0 0 1px color-mix(in srgb,var(--kit-ink,currentColor) 14%,transparent)}
:where(.pym-pay){display:grid;gap:10px;margin:0;padding:0;list-style:none}
:where(.pym-pay) :where(li){display:grid;gap:2px}
:where(.pym-pay) :where(strong){font-weight:600}
:where(.pym-pay) :where(span){font-size:.92em;opacity:.75}
:where(.pym-pay__note){margin:8px 0 0;font-size:12.5px;opacity:.7}
:where([data-part=pairs]){display:grid;gap:14px;margin:0}
:where([data-part=pairs]) :where(h2){margin:0;font-size:13px;line-height:1.2;letter-spacing:.14em;text-transform:uppercase}
:where([data-part=pairs]) :where(ul){display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,300px),1fr));gap:10px;margin:0;padding:0;list-style:none}
:where([data-part=pair]){display:grid;grid-template-columns:64px minmax(0,1fr) auto;align-items:center;gap:12px;padding:10px 12px 10px 10px;border-radius:var(--kit-radius,14px);background:var(--kit-paper,transparent);box-shadow:0 0 0 1px var(--kit-line,color-mix(in srgb,currentColor 12%,transparent))}
:where([data-part=pair-photo]){display:block;width:64px;height:64px;border-radius:calc(var(--kit-radius,14px) - 4px);overflow:hidden;background:var(--kit-muted,color-mix(in srgb,currentColor 6%,transparent))}
:where([data-part=pair-photo]) :where(img){width:100%;height:100%;object-fit:contain}
:where([data-part=pair-copy]){display:grid;gap:3px;min-width:0}
:where([data-part=pair-copy]) :where(a){overflow:hidden;color:inherit;font-weight:600;font-size:14.5px;line-height:1.25;text-decoration:none;text-overflow:ellipsis;white-space:nowrap}
:where([data-part=pair-copy]) :where(span){white-space:nowrap;font-size:14px;font-variant-numeric:tabular-nums;opacity:.8}
:where([data-part=pair-add]){display:inline-flex;align-items:center;justify-content:center;min-height:36px;padding:0 14px;border:0;border-radius:999px;background:var(--kit-accent,currentColor);color:var(--kit-on-accent,#fff);font-size:13px;font-weight:600;line-height:1;text-decoration:none;cursor:pointer}
:where([data-part=pair-add]:disabled){opacity:.45;cursor:default}
:where([data-part=thumbs]){display:flex;gap:8px;flex-wrap:wrap}
:where([data-part=thumb]){flex:none;width:56px;height:56px;padding:0;border:2px solid transparent;border-radius:calc(var(--kit-radius,14px) - 4px);overflow:hidden;background:transparent;cursor:pointer}
:where([data-part=thumb][aria-pressed="true"]){border-color:var(--kit-ink,currentColor)}
:where([data-part=thumb]) :where(img){width:100%;height:100%;object-fit:cover}
/* Live 2026-11-14 (Pawby, Cuadrízate V2: a column of page-wide cards): the kit draws product cards straight into the mount, and
   only a template's sheet laid them out. A chosen set (data-products / data-category) is a grid by default; the full catalogue page
   keeps the kit's own layout. */
:where([data-pagosya-catalog]:not([data-catalog-full])){display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,220px),1fr));gap:clamp(16px,2vw,28px);align-items:start}
:where(.menu-item){display:grid;gap:8px;min-width:0}
:where(.menu-item) :where(img){display:block;width:100%;max-width:100%;height:auto}
:where(.spotlight) :where(img){max-width:100%;height:auto}
/* /v2:kit-baseline */
`;

/** The platform's product card (owner 2026-11-14: «keep the inside of the product cards and let the AI style the other things; if
 *  the user asks for it he gets it restyled»). Live 2026-11-14, every V2 store restyled the kit's card its own way and most broke it:
 *  a lone «+» stretched into a page-wide pill (Oh Belly, Pawby, rhode), the name set one letter per line (NOA), photos with a grey
 *  band under them and one card per row (Cuadrízate). The card and its grid are the platform's: photo 4:5, name, price, add — in the
 *  design's colours through the --kit-* tokens it sets in :root. It sits after the design's sheet, whose card rules are taken out. */
export const V2_CARD_SHEET = `/* v2:cards — the platform's product card; colours from the design's --kit-* tokens */
/* Owner 2026-11-14 («product cards are a little small and uneven»: Gramiyaa's 4 cards sat in 5 columns, Meat House ended 3 + 2): the
   cards always fill the row — 4 to a row (3 for 3, 5, 6 or 9 products), a short last row centred — and every card is as tall as its
   row, its button at the bottom. */
[data-pagosya-catalog]:not([data-catalog-full]){--cat-cols:4;--cat-gap:clamp(14px,1.6vw,24px);display:flex;flex-wrap:wrap;justify-content:center;align-items:stretch;gap:clamp(22px,2.4vw,36px) var(--cat-gap)}
[data-pagosya-catalog]:not([data-catalog-full]) > .menu-item{flex:0 0 calc((100% - (var(--cat-cols) - 1) * var(--cat-gap)) / var(--cat-cols));max-width:calc((100% - (var(--cat-cols) - 1) * var(--cat-gap)) / var(--cat-cols))}
[data-pagosya-catalog]:not([data-catalog-full]):has(> .menu-item:nth-child(3)):not(:has(> .menu-item:nth-child(4))),[data-pagosya-catalog]:not([data-catalog-full]):has(> .menu-item:nth-child(5)):not(:has(> .menu-item:nth-child(7))),[data-pagosya-catalog]:not([data-catalog-full]):has(> .menu-item:nth-child(9)):not(:has(> .menu-item:nth-child(10))){--cat-cols:3}
@media (max-width:900px){[data-pagosya-catalog]:not([data-catalog-full]){--cat-cols:3}}
@media (max-width:600px){[data-pagosya-catalog]:not([data-catalog-full]){--cat-cols:2;--cat-gap:12px;gap:22px 12px}}
/* Owner 2026-11-14 (Oh Belly r6: one small card alone in a wide empty section): one or two products show big, side by side. */
[data-pagosya-catalog]:not([data-catalog-full]):not(:has(> .menu-item:nth-child(3))) > .menu-item{flex:0 1 420px;max-width:420px}
[data-pagosya-catalog]:not([data-catalog-full]) > .menu-item[data-product-id]{display:flex;flex-direction:column;gap:4px}
[data-pagosya-catalog]:not([data-catalog-full]) > .menu-item[data-product-id] > .menu-item__price{margin-bottom:8px}
[data-pagosya-catalog]:not([data-catalog-full]) > .menu-item[data-product-id] > .menu-add{margin-top:auto}
.menu-item[data-product-id]{position:relative;display:grid;grid-template-columns:minmax(0,1fr) auto;align-content:start;column-gap:10px;row-gap:4px;min-width:0;margin:0;padding:var(--kit-card-pad,0);border:0;border-radius:var(--kit-card-radius,var(--kit-radius,12px));background:var(--kit-card-bg,none);box-shadow:none;color:var(--kit-ink,inherit);text-align:left;writing-mode:horizontal-tb}
.menu-item[data-product-id] > *{grid-column:1;min-width:0}
.menu-item[data-product-id] .menu-item__details{position:absolute;inset:0;z-index:1;border:0;background:none;padding:0;cursor:pointer}
.menu-item[data-product-id] .menu-item__image,.menu-item[data-product-id] .menu-item__panel{grid-column:1/-1;margin:0 0 8px}
.menu-item[data-product-id] .menu-item__image{display:block;width:100%;height:auto;aspect-ratio:var(--kit-card-ratio,4/5);object-fit:cover;border-radius:var(--kit-card-radius,var(--kit-radius,12px));background:var(--kit-muted,color-mix(in srgb,currentColor 6%,transparent));transition:transform .5s cubic-bezier(.2,.7,.2,1)}
@media (hover:hover) and (prefers-reduced-motion:no-preference){.menu-item[data-product-id]:hover .menu-item__image{transform:scale(1.03)}}
.menu-item[data-product-id] .menu-item__panel{position:relative}
.menu-item[data-product-id] .menu-item__panel .menu-item__image{margin:0}
.menu-item[data-product-id] .menu-item__image-alt{position:absolute;top:0;left:0;width:100%;height:auto;aspect-ratio:var(--kit-card-ratio,4/5);object-fit:cover;border-radius:var(--kit-card-radius,var(--kit-radius,12px));opacity:0;transition:opacity .3s ease;pointer-events:none}
@media (hover:hover){.menu-item[data-product-id]:hover .menu-item__image-alt{opacity:1}}
.menu-item[data-product-id] .menu-item__badge,.menu-item[data-product-id] .menu-item__tag,.menu-item[data-product-id] .menu-item__best{position:absolute;top:10px;left:10px;z-index:2;margin:0;padding:4px 9px;border-radius:999px;background:var(--kit-paper,#fff);color:var(--kit-ink,#111);font-size:11.5px;font-weight:600;line-height:1.2;letter-spacing:.02em}
.menu-item[data-product-id] .menu-item__copy{display:grid;gap:3px;margin:0}
.menu-item[data-product-id] .menu-item__eyebrow{margin:0;font-size:11px;letter-spacing:.1em;text-transform:uppercase;opacity:.65}
.menu-item[data-product-id] :is(.menu-item__copy h3,.menu-item__name){margin:0;font-family:var(--kit-card-font,inherit);font-size:var(--kit-card-name,15px);font-weight:600;line-height:1.3;letter-spacing:0;text-transform:var(--kit-card-case,none);white-space:normal;word-break:normal;overflow-wrap:break-word;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.menu-item[data-product-id] .menu-item__copy > p:not([class]){margin:0;font-size:13px;line-height:1.4;opacity:.7;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.menu-item[data-product-id] :is(.menu-item__points,.menu-item__deal,.menu-item__colors,.menu-item__options){margin:0;padding:0;list-style:none;font-size:12.5px;line-height:1.35;opacity:.75}
.menu-item[data-product-id] .menu-item__price{margin:2px 0 0;font-size:14.5px;font-weight:600;font-variant-numeric:tabular-nums}
.menu-item[data-product-id] .menu-item__original{margin-left:6px;font-weight:400;opacity:.55}
.menu-item[data-product-id] .menu-item__save{justify-self:start;margin:2px 0 0;padding:2px 8px;border-radius:999px;background:var(--kit-accent,currentColor);color:var(--kit-on-accent,#fff);font-size:11.5px;font-weight:600}
.menu-item[data-product-id] .menu-item__row{display:flex;justify-content:space-between;align-items:baseline;gap:10px}
.menu-item[data-product-id] .menu-item__row .menu-item__price{margin:0;white-space:nowrap}
.menu-item[data-product-id] :is(.menu-item__chips,.menu-item__swatches){display:flex;flex-wrap:wrap;gap:6px;margin:4px 0 0}
.menu-item[data-product-id] .menu-item__chips > span:not([data-swatch]){padding:2px 8px;border:1px solid var(--kit-line,color-mix(in srgb,currentColor 20%,transparent));border-radius:999px;font-size:11.5px}
.menu-item[data-product-id] [data-swatch]{width:14px;height:14px;border-radius:50%;background:var(--swatch);box-shadow:0 0 0 1px color-mix(in srgb,currentColor 20%,transparent)}
.menu-item[data-product-id] .menu-item__bars{position:absolute;left:10px;right:10px;bottom:10px;z-index:2;display:flex;gap:4px}
.menu-item[data-product-id] .menu-item__bars > button{flex:1;height:4px;padding:0;border:0;border-radius:2px;background:var(--swatch)}
.menu-item[data-product-id] .menu-item__quick-look{display:none}
.menu-item[data-product-id] .sold-out{font-size:12px;font-weight:600;opacity:.7}
/* Owner 2026-11-14 («the buy button is not that great»: a black bar under every card made the grid a wall of bars): a light outlined
   pill that fills with the store's ink on hover. */
.menu-item[data-product-id] > .menu-add{position:relative;z-index:2;grid-column:1/-1;display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:40px;margin:10px 0 0;padding:0 16px;border:1px solid color-mix(in srgb,var(--kit-ink,#111) 30%,transparent);border-radius:var(--kit-button-radius,999px);background:transparent;color:var(--kit-ink,#111);font:inherit;font-size:13px;font-weight:600;letter-spacing:.02em;text-decoration:none;text-transform:none;cursor:pointer;transition:background-color .2s,color .2s,border-color .2s}
@media (hover:hover){.menu-item[data-product-id] > .menu-add:not(:disabled):hover{background:var(--kit-ink,#111);border-color:var(--kit-ink,#111);color:var(--kit-paper,#fff)}}
/* Owner 2026-11-14 (NOA r6: «Elegir opciones» pills next to small «+» circles in one grid): every card's button is the same pill —
   the kit's «+» reads «Agregar». */
/* The kit turns a «+» it finds decorated into the word «Añadir» (cards.js): a hidden marker asks for that word, so the label is
   the kit's own and never doubled (live NOA r8: «Añadir Agregar»). */
.menu-item[data-product-id] > .menu-add[data-add]:not(:has(span))::before{content:"+";display:none}
.menu-item[data-product-id] > .menu-add:disabled{opacity:.45;cursor:default}
.menu-item[data-product-id] > .menu-add svg{width:18px;height:18px}
/* The buy box's insides are the platform's too (live 2026-11-14: NOA and BOXY drew sizes as page-wide stacked bars; Cuadrízate and
   Remolino put a grey band under the main photo). The design places and frames the slots; these parts keep one shape. */
.product-detail__values{display:flex;flex-wrap:wrap;gap:8px;margin:6px 0 0}
.product-detail__values > [data-part=swatch]{display:inline-flex;align-items:center;justify-content:center;gap:6px;width:auto;min-width:46px;min-height:40px;margin:0;padding:0 14px;border:1px solid var(--kit-line,color-mix(in srgb,currentColor 22%,transparent));border-radius:999px;background:transparent;color:inherit;font:inherit;font-size:14px;line-height:1;cursor:pointer}
.product-detail__values > [data-part=swatch][aria-pressed="true"]{border-color:var(--kit-ink,currentColor);background:var(--kit-ink,#111);color:var(--kit-paper,#fff)}
.product-detail__values[data-kind=swatch] > [data-part=swatch]{min-width:0;width:36px;height:36px;min-height:0;padding:3px}
.product-detail__values[data-kind=swatch] > [data-part=swatch][aria-pressed="true"]{background:transparent;box-shadow:0 0 0 2px var(--kit-ink,currentColor)}
.product-detail__stage{position:relative;background:none}
/* The buy row (owner 2026-11-14 «the buy button is not that great»): a quantity pill beside one confident button in the store's accent,
   the total inside it. */
.product-detail__purchase{display:flex;gap:10px;align-items:stretch;margin:20px 0 0}
.product-detail__quantity{display:inline-flex;flex:none;align-items:center;gap:2px;height:54px;padding:0 6px;border:1px solid var(--kit-line,color-mix(in srgb,currentColor 22%,transparent));border-radius:999px}
.product-detail__quantity > button{width:40px;height:40px;padding:0;border:0;border-radius:50%;background:none;color:inherit;font:inherit;font-size:18px;line-height:1;cursor:pointer}
.product-detail__quantity > button:disabled{opacity:.35;cursor:default}
.product-detail__quantity > output{min-width:26px;text-align:center;font-weight:600;font-variant-numeric:tabular-nums}
.product-detail__purchase > .product-detail__buy{flex:1;display:inline-flex;align-items:center;justify-content:center;gap:10px;min-height:54px;margin:0;padding:0 26px;border:0;border-radius:999px;background:var(--kit-accent,var(--kit-ink,#111));color:var(--kit-on-accent,#fff);font:inherit;font-size:15px;font-weight:600;letter-spacing:.01em;text-transform:none;cursor:pointer;box-shadow:0 10px 24px -14px color-mix(in srgb,var(--kit-accent,#111) 80%,transparent);transition:transform .15s,filter .2s}
@media (hover:hover){.product-detail__purchase > .product-detail__buy:not(:disabled):hover{filter:brightness(1.07)}}
.product-detail__purchase > .product-detail__buy:not(:disabled):active{transform:scale(.98)}
.product-detail__purchase > .product-detail__buy:disabled{opacity:.5;cursor:default;box-shadow:none}
.product-detail__buy-total{font-weight:500;opacity:.85}
.product-detail__stage > .product-detail__photo{display:block;width:100%;height:auto;max-height:none;aspect-ratio:4/5;object-fit:cover;border-radius:var(--kit-radius,12px)}
/* Owner 2026-11-14 (NOA, Meat House V2: a featured card beside an empty half): the kit lays a featured product out as the card beside
   the design's own words; a mount that holds only the card shows the card alone, at a card's width. */
[data-pagosya-spotlight]:not(:has(> :not(.spotlight))){display:block;width:100%;max-width:420px}
/* /v2:cards */
`;

const CARD_SELECTOR = /\.menu-item|\.menu-add|\[data-product-id|\bdata-pagosya-catalog\b|\.product-detail__(values|photo|stage|purchase|quantity|buy)\b|\[data-part=["']?swatch/;

/** The header's action icons (search · profile · cart) are the platform's too unless the merchant asked for their own. */
// Only how the icons look: the design keeps where it places them (live round 4: NOA's icons fell to a second row once the design's
// .ui-nav__action layout rules were taken out).
const ICON_SELECTOR = /\.ui-nav__(icon|word)\b/;

/** The design's sheet without the rules that restyle the product card or its grid (a rule naming other things keeps them). */
export function withoutCardRules(css: string, selector: RegExp = CARD_SELECTOR): string {
  try {
    const root = postcss.parse(css);
    root.walkRules(rule => {
      const kept = rule.selectors.filter(entry => !selector.test(entry));
      if (kept.length === rule.selectors.length) return;
      if (kept.length) rule.selectors = kept; else rule.remove();
    });
    root.walkAtRules(atRule => { if (atRule.nodes && !atRule.nodes.length) atRule.remove(); });
    return root.toString();
  } catch { return css; }
}

/** The design's sheet with the baseline in front and, unless the merchant asked for their own cards, the platform's card after it
 *  (once). */
/** The header is NavShell's frame (owner 2026-11-14 «the header is messy»: the design's own fixed height and position fought the
 *  platform's sticky bar): the design keeps its colours, letters and borders on .ui-nav / header, never their height or position. */
const HEADER_FRAME = /\.ui-nav(?![\w-])|(?:^|[\s>+~])header\b/;
const FRAME_PROPS = /^(height|min-height|max-height|position|top|inset)$/;
export function withoutHeaderFrame(css: string): string {
  try {
    const root = postcss.parse(css);
    root.walkRules(rule => { if (rule.selectors.some(entry => HEADER_FRAME.test(entry))) rule.walkDecls(decl => { if (FRAME_PROPS.test(decl.prop)) decl.remove(); }); });
    return root.toString();
  } catch { return css; }
}

export function withKitBaseline(css: string, ownCards = false, ownIcons = false): string {
  if (css.includes('v2:kit-baseline')) return css;
  const design = withoutHeaderFrame(ownIcons ? css : withoutCardRules(css, ICON_SELECTOR));
  return ownCards ? `${V2_KIT_BASELINE}\n${design}` : `${V2_KIT_BASELINE}\n${withoutCardRules(design)}\n${V2_CARD_SHEET}`;
}

/** Owner 2026-11-14 («i would like the cart to be more decorated on the inside», «depends on the store»): the cart drawer dressed in
 *  the store's own tokens — the store's name over «Tu pedido» in its display letter, lines as soft cards with bigger photos, the
 *  subtotal in a box, one big pay button in the store's accent — and a look the direction picks per store: a colour band, one of the
 *  store's photos, or tinted paper with dashed rules like a receipt. The cart's suggestion buttons read --store-accent (overlay.js),
 *  which a V2 design never sets: inside the drawer it is the design's accent. */
export const V2_CART_LOOKS = ['band', 'photo', 'paper'] as const;
export type V2CartLook = typeof V2_CART_LOOKS[number];
const CART_BASE = `dialog.cart-drawer[data-pagosya-drawer]{--store-accent:var(--kit-accent,#111);--store-accent-foreground:var(--kit-on-accent,#fff)}
dialog.cart-drawer[data-pagosya-drawer]:not([data-template]){padding:0;background:var(--kit-paper,#fff);color:var(--kit-ink,#111)}
dialog.cart-drawer[data-pagosya-drawer]:not([data-template]) > :is(.cart-drawer__body,.cart-drawer__continue,.pagosya-policies){margin-inline:clamp(18px,4vw,30px)}
dialog.cart-drawer[data-pagosya-drawer]:not([data-template]) > .cart-drawer__header{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:0 0 18px;padding:22px clamp(18px,4vw,30px)}
dialog.cart-drawer[data-pagosya-drawer] .cart-drawer__header h2{margin:0;font-family:var(--kit-display,inherit);font-size:clamp(20px,2vw,24px);line-height:1.1}
dialog.cart-drawer[data-pagosya-drawer] .cart-drawer__header h2::before{content:var(--cart-store,"");display:block;margin:0 0 4px;font-family:var(--kit-text,inherit);font-size:11px;font-weight:600;letter-spacing:.16em;text-transform:uppercase;opacity:.75}
dialog.cart-drawer[data-pagosya-drawer] .cart-drawer__header [data-cart-close]{width:38px;height:38px;border-radius:50%;border:1px solid currentColor;background:transparent;color:inherit;font-size:20px;line-height:1;opacity:.85}
dialog.cart-drawer[data-pagosya-drawer] .order-items{display:grid;gap:10px;margin:0;padding:0}
dialog.cart-drawer[data-pagosya-drawer] .order-item{align-items:center;gap:14px;padding:12px;border:0;border-radius:var(--kit-radius,14px);background:color-mix(in srgb,var(--kit-ink,#111) 5%,var(--kit-paper,#fff))}
dialog.cart-drawer[data-pagosya-drawer] .order-item__photo{width:80px;height:80px;flex:none;object-fit:cover;border-radius:calc(var(--kit-radius,14px) - 4px);background:var(--kit-paper,#fff)}
dialog.cart-drawer[data-pagosya-drawer] .order-recommendations h3{margin:22px 0 10px;font-family:var(--kit-display,inherit);font-size:17px}
dialog.cart-drawer[data-pagosya-drawer] .order-recommendations img{border-radius:calc(var(--kit-radius,14px) - 4px)}
dialog.cart-drawer[data-pagosya-drawer] .order-recommendations button{background:transparent;color:var(--kit-ink,#111);border:1px solid color-mix(in srgb,var(--kit-ink,#111) 30%,transparent);min-height:38px}
dialog.cart-drawer[data-pagosya-drawer] .order-total{margin:22px 0 0;padding:16px 18px;border:1px solid var(--kit-line,color-mix(in srgb,currentColor 15%,transparent));border-bottom:0;border-radius:var(--kit-radius,14px) var(--kit-radius,14px) 0 0;background:color-mix(in srgb,var(--kit-ink,#111) 3%,var(--kit-paper,#fff))}
dialog.cart-drawer[data-pagosya-drawer] .order-note{margin:0;padding:0 18px 16px;border:1px solid var(--kit-line,color-mix(in srgb,currentColor 15%,transparent));border-top:0;border-radius:0 0 var(--kit-radius,14px) var(--kit-radius,14px);background:color-mix(in srgb,var(--kit-ink,#111) 3%,var(--kit-paper,#fff));font-size:12.5px;opacity:.8}
dialog.cart-drawer[data-pagosya-drawer] .checkout-button{display:flex;align-items:center;justify-content:center;gap:10px;width:100%;min-height:56px;margin:16px 0 0;padding:0 24px;border:0;border-radius:999px;background:var(--kit-accent,#111);color:var(--kit-on-accent,#fff);font-weight:600;font-size:15.5px;letter-spacing:.01em;box-shadow:0 12px 26px -16px color-mix(in srgb,var(--kit-accent,#111) 85%,transparent)}
dialog.cart-drawer[data-pagosya-drawer] .checkout-button svg{stroke:currentColor}
dialog.cart-drawer[data-pagosya-drawer] .cart-guarantee{justify-content:center;margin:12px 0 0;font-size:12.5px;opacity:.85}`;
const CART_LOOK: Record<V2CartLook, string> = {
  band: `dialog.cart-drawer[data-pagosya-drawer]:not([data-template]) > .cart-drawer__header{background:var(--kit-accent,#111);color:var(--kit-on-accent,#fff)}`,
  photo: `dialog.cart-drawer[data-pagosya-drawer]:not([data-template]) > .cart-drawer__header{min-height:150px;align-items:flex-end;color:#fff;background:linear-gradient(to top,rgba(0,0,0,.62),rgba(0,0,0,.08)),var(--cart-photo,none) center/cover no-repeat,var(--kit-ink,#111)}`,
  paper: `dialog.cart-drawer[data-pagosya-drawer]:not([data-template]){background:color-mix(in srgb,var(--kit-accent,#111) 7%,var(--kit-paper,#fff));border-left:3px solid var(--kit-accent,#111)}
dialog.cart-drawer[data-pagosya-drawer]:not([data-template]) > .cart-drawer__header{border-bottom:1px dashed color-mix(in srgb,var(--kit-ink,#111) 35%,transparent);margin-bottom:8px}
dialog.cart-drawer[data-pagosya-drawer] .order-items{gap:0}
dialog.cart-drawer[data-pagosya-drawer] .order-item{background:none;border-radius:0;padding:14px 0;border-bottom:1px dashed color-mix(in srgb,var(--kit-ink,#111) 30%,transparent)}
dialog.cart-drawer[data-pagosya-drawer] :is(.order-total,.order-note){background:none;border-style:dashed}`,
};
const cssString = (text: string) => `"${text.replace(/["\\\n]/g, ' ').slice(0, 60)}"`;
/** The cart sheet for one store: its name, its look and (for «photo») the store photo shown at the top. */
export function v2CartSheet(look: string | undefined, storeName: string, photo?: string): string {
  const chosen: V2CartLook = (V2_CART_LOOKS as readonly string[]).includes(look ?? '') ? look as V2CartLook : 'band';
  const image = chosen === 'photo' && /^assets\/[\w.-]+\.(?:jpe?g|png|webp)$/.test(photo ?? '') ? `--cart-photo:url(${photo});` : '';
  return `/* v2:cart (${chosen}) */\n:root{--cart-store:${cssString(storeName.toUpperCase())};${image}}\n${CART_BASE}\n${CART_LOOK[image || chosen !== 'photo' ? chosen : 'band']}\n/* /v2:cart */\n`;
}
