  const shoppingStyle = document.createElement('style');
  // Kit defaults for the cart, the added notice and the order review: low priority, so the store's own CSS
  // (and its DNA) restyle them. Layered !important declarations still outrank authored ones.
  shoppingStyle.textContent = `@layer pagosya-commerce {
    .cart-drawer{box-sizing:border-box;position:fixed;inset:0 0 0 auto;width:min(760px,max(420px,50vw));max-width:100vw;height:100dvh;max-height:100dvh;margin:0;padding:0;border:0;background:var(--store-background,var(--brand-background,var(--paper,Canvas)));color:var(--store-foreground,var(--brand-foreground,var(--ink,CanvasText)));font:inherit;overflow:auto;overscroll-behavior:contain;transform:translateX(0);transition:transform var(--motion-base,250ms) var(--ease-drawer,cubic-bezier(.32,.72,0,1)),opacity var(--motion-fast,200ms) var(--ease-out,cubic-bezier(.23,1,.32,1)),display var(--motion-base,250ms) allow-discrete,overlay var(--motion-base,250ms) allow-discrete}
    .cart-drawer:not([open]){transform:translateX(100%);opacity:0}
    /* The kit's own dialog keeps its place, size and visibility whatever a design says about .cart-drawer: florart
       2026-10-18 hid its own panel off-screen until its script added body.cart-open, so the kit's cart opened as an
       invisible modal and the page froze. Layered !important outranks every store rule; colours, borders, padding and
       motion stay the store's. Half the screen, the whole width on a phone (owner 2026-10-17). */
    dialog[data-pagosya-drawer]{position:fixed!important;inset:0 0 0 auto!important;box-sizing:border-box!important;width:min(760px,max(420px,50vw))!important;max-width:100vw!important;height:100dvh!important;max-height:100dvh!important;margin:0!important;overflow:auto!important;visibility:visible!important;clip-path:none!important;pointer-events:auto!important}
    dialog[data-pagosya-drawer][open]{display:block!important;opacity:1!important;transform:none!important}
    dialog[data-pagosya-drawer]:not([open]){display:none!important;opacity:0!important;transform:translateX(100%)!important}
    @starting-style{dialog[data-pagosya-drawer][open]{opacity:0!important;transform:translateX(100%)!important}}
    @media(max-width:700px){dialog[data-pagosya-drawer]{width:100vw!important}}
    /* Inside the dialog, the store's cart mount and a template's panel are its content, never a second drawer: Pokeate
       2026-10-18 kept a fixed 440px .cart-runtime panel in styles.css and its cart template was a fixed 50vw aside, so the
       cart drew as two overlapping columns with the text across both. A template is the whole design, so the mount around
       it also gives up its own padding and paint. */
    dialog[data-pagosya-drawer] :is([data-pagosya-cart],[data-cart-panel]){position:relative!important;inset:auto!important;z-index:auto!important;box-sizing:border-box!important;width:auto!important;min-width:0!important;max-width:none!important;height:auto!important;max-height:none!important;margin:0!important;transform:none!important;overflow:visible!important}
    dialog[data-pagosya-drawer][data-template] :is([data-pagosya-cart],[data-cart-panel]){min-height:100dvh!important}
    dialog[data-pagosya-drawer][data-template] [data-pagosya-cart]{padding:0!important;border:0!important;background:transparent!important;box-shadow:none!important}
    /* An added template that positions itself (fixed, absolute) keeps its own place: the DNA notice (a ribbon, a bubble, a
       stamp…) only carries it, with no box, paint or transform of its own, since a transformed carrier re-anchors the
       template's position:fixed to itself (Pokeate 2026-10-18: the card drew 164px above the screen under an empty 29px
       ribbon). The carrier lets clicks through. A template in the flow still sits in the DNA notice and wears its paint. */
    .cart-added[data-template-placed]{padding:0!important;border:0!important;border-radius:0!important;background:transparent!important;box-shadow:none!important;transform:none!important;filter:none!important;pointer-events:none!important}
    .cart-added[data-template-placed]::before{content:none!important}
    .cart-added[data-template-placed]>*{pointer-events:auto}
    /* The cart is a half-screen panel, so it reads in one column (owner 2026-10-17): a store template drawn as a page with a
       side summary stacks inside it. Each declaration is inert on an element that is not a grid or flex container. */
    .cart-drawer :is([data-cart-panel],[data-cart-panel] *):has([data-cart-slot=lines]):has([data-cart-slot=total]){grid-template-columns:minmax(0,1fr)!important;grid-template-rows:none!important;grid-template-areas:none!important;flex-direction:column!important}
    /* A money figure never breaks mid-number («Bs 20,0 / 0» on a phone, FLORZ 2026-10-17). */
    .cart-drawer :is([data-cart-field=line-total],[data-cart-field=unit]){white-space:nowrap!important}
    .cart-drawer :is([data-cart-panel],[data-cart-panel] *):has([data-cart-slot=lines]):has([data-cart-slot=total])>*{grid-column:auto!important;grid-row:auto!important;order:0!important}
    /* The contrast guard's colour: the first layer's !important outranks every stylesheet, and yields while the control is
       hovered or focused so the store's own interactive colours (an inverted hover…) still apply. */
    [data-pagosya-contrast-guard=fixed]:not(:hover):not(:where(:focus-visible)),[data-pagosya-contrast-guard=fixed]:not(:hover):not(:where(:focus-visible)) [data-pagosya-contrast-guard=text]{color:var(--pagosya-contrast-color)!important;-webkit-text-fill-color:var(--pagosya-contrast-color)!important}
    .pagosya-secure-note{margin:12px 0 0;font-size:13px;opacity:.78}
    .pagosya-policies{display:flex;flex-wrap:wrap;gap:4px 16px;margin:12px 0 0}.cart-drawer>.pagosya-policies{padding:0 24px 20px}
    .pagosya-policies button{min-height:32px;padding:0;border:0;background:none;color:inherit;font:inherit;font-size:13px;text-decoration:underline;text-underline-offset:.25em;text-decoration-color:color-mix(in srgb,currentColor 35%,transparent);cursor:pointer}
    .pagosya-info-nav,[data-pagosya-pages]{display:flex;flex-wrap:wrap;gap:4px 16px;margin:16px 0 0}.pagosya-info-nav a,[data-pagosya-pages] a{color:inherit;font:inherit;font-size:13px;text-decoration:underline;text-underline-offset:.25em}
    .pagosya-info{max-width:68ch;line-height:1.7}.pagosya-info__lead{font-size:1.15em}.pagosya-info__list{padding-left:1.2em}.pagosya-info__qa h2{margin:1.4em 0 .3em;font-size:1.05em}
    .pagosya-info__cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:16px;margin:16px 0;padding:0;list-style:none}.pagosya-info__cards a{display:grid;gap:6px;color:inherit;text-decoration:none}.pagosya-info__cards img{width:100%;aspect-ratio:1;object-fit:cover}.pagosya-search{display:flex;flex-wrap:wrap;gap:8px;align-items:end}.pagosya-search label{display:grid;gap:4px;flex:1 1 220px}.pagosya-search input{min-height:44px;padding:0 12px;font:inherit}.pagosya-search button{min-height:44px;padding:0 18px;font:inherit;cursor:pointer}
    .pagosya-policy-dialog{box-sizing:border-box;width:min(640px,calc(100% - 32px));max-height:min(80dvh,720px);margin:auto;padding:0;border:1px solid color-mix(in srgb,currentColor 14%,transparent);border-radius:min(var(--store-radius,12px),16px);background:var(--store-background,var(--brand-background,Canvas));color:var(--store-foreground,var(--brand-foreground,CanvasText));font:inherit;overflow:auto}
    .pagosya-policy-dialog::backdrop{background:#0008}
    /* The store's CSS reset clears borders and button fills after these rules load; the search keeps its own (2026-10-28). */
    form[role=search]{position:relative}
    .pagosya-suggest{position:absolute;z-index:60;top:calc(100% + 8px);left:0;right:0;min-width:280px;max-height:min(70vh,520px);overflow:auto;margin:0;padding:6px;list-style:none;border-radius:14px;background:var(--es-paper,#fff);color:var(--es-ink,inherit);box-shadow:0 18px 50px -18px #0006,0 0 0 1px color-mix(in srgb,currentColor 10%,transparent);text-align:left}
    .pagosya-suggest a{display:flex;align-items:center;gap:12px;padding:8px;border-radius:10px;color:inherit;text-decoration:none;outline:none}
    .pagosya-suggest a:is(:hover,:focus-visible){background:color-mix(in srgb,currentColor 7%,transparent)}
    .pagosya-suggest img,.pagosya-suggest__blank{flex:none;width:44px;height:44px;border-radius:8px;object-fit:cover;background:color-mix(in srgb,currentColor 8%,transparent)}
    .pagosya-suggest strong{display:block;font-size:14px;font-weight:600;line-height:1.3}.pagosya-suggest small{display:block;font-size:13px;opacity:.7}
    .pagosya-suggest__all a{justify-content:center;font-size:13px;font-weight:600;text-decoration:underline;text-underline-offset:.25em}
    .pagosya-info:has(.pagosya-search){max-width:none}
    .pagosya-search{display:flex;flex-wrap:wrap;align-items:flex-end;gap:10px;margin:8px 0 18px}
    .pagosya-search label{display:grid;gap:8px;flex:1 1 320px;font-size:14px;font-weight:600}
    .pagosya-search input{box-sizing:border-box;width:100%;min-height:48px;padding:0 18px!important;border:1px solid color-mix(in srgb,currentColor 22%,transparent)!important;border-radius:999px;background:var(--es-paper,transparent)!important;color:inherit;font:inherit;font-weight:400}
    .pagosya-search input:focus-visible{outline:2px solid var(--es-accent,currentColor);outline-offset:2px}
    .pagosya-search>button{min-height:48px;padding:0 24px!important;border:0;border-radius:999px;background:var(--es-accent,#111)!important;color:var(--es-on-accent,#fff)!important;font:inherit;font-weight:600;cursor:pointer}
    .pagosya-info:has(.pagosya-search) .pagosya-info__cards{grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:24px;padding:0!important;margin-inline:0!important}
    .pagosya-info:has(.pagosya-search) .pagosya-info__cards img{border-radius:var(--es-radius,14px)}
    .pagosya-info:has(.pagosya-search) .pagosya-info__cards strong{font-weight:600;text-decoration:none}
    .pagosya-search__tools{display:grid;gap:12px;margin:0 0 18px}.pagosya-search__row{display:flex;flex-wrap:wrap;align-items:center;gap:8px}
    .pagosya-search__sort>span{margin-right:4px;font-size:13px;font-weight:600;opacity:.7}
    .pagosya-search__chip{display:inline-flex;align-items:center;min-height:36px;padding:0 16px!important;border:1px solid color-mix(in srgb,currentColor 18%,transparent)!important;border-radius:999px;color:inherit;font-size:14px;text-decoration:none!important;white-space:nowrap}
    .pagosya-search__chip:hover{border-color:currentColor!important}
    .pagosya-search__chip[aria-current]{background:var(--es-ink,#111)!important;border-color:var(--es-ink,#111)!important;color:var(--es-paper,#fff)!important}
    .pagosya-policy-dialog header{position:sticky;top:0;display:flex;align-items:center;justify-content:space-between;gap:16px;padding:16px 20px;background:inherit;border-bottom:1px solid color-mix(in srgb,currentColor 12%,transparent)}
    .pagosya-policy-dialog h2{margin:0;font-size:1.2rem;font-family:var(--store-heading-font,inherit)}.pagosya-policy-dialog header button{width:44px;height:44px;border:0;border-radius:50%;background:none;color:inherit;font-size:26px;cursor:pointer}
    .pagosya-policy-dialog div{padding:8px 20px}.pagosya-policy-dialog div p{margin:12px 0;line-height:1.65;max-width:66ch}
    .pagosya-policy-dialog__store{margin:0;padding:0 20px 20px;font-size:13px;opacity:.7}
    .cart-drawer::backdrop{background:#0007}
    @starting-style{.cart-drawer[open]{transform:translateX(100%);opacity:0}}
    .cart-drawer__header{display:flex;align-items:center;justify-content:space-between;gap:24px;padding:24px 32px;border-bottom:1px solid var(--store-border,var(--brand-border,var(--line,#d7d2c7)))}
    .cart-drawer__header h2{font:inherit;font-size:28px;font-weight:700;margin:0}
    .cart-drawer button{font:inherit;cursor:pointer;color:inherit;min-height:44px}
    .cart-drawer__header button{width:44px;border:0;background:transparent;font-size:28px}
    .cart-drawer__body{padding:8px 32px 24px}
    .cart-drawer [data-pagosya-cart]{position:static;inset:auto;width:100%;max-width:none;max-height:none;margin:0;padding:0;border:0;box-shadow:none;background:transparent;color:inherit}
    .cart-drawer .order-items{padding:0;margin:0;list-style:none}
    /* Order lines: photo, then name + line total, option, unit price and stock under it. */
    .order-items .order-item[data-has-image]{display:grid;grid-template-columns:72px minmax(0,1fr);gap:16px;align-items:start}
    .order-items .order-item>.order-item__body{display:block;min-width:0;margin:0}
    /* A store grid drawn for a photo column (78px 1fr) would put a photo-less line's text in that column: span it. */
    .order-items .order-item:not([data-has-image])>.order-item__body{grid-column:1/-1}
    .order-item__photo{display:block;width:72px;height:72px;object-fit:cover;border-radius:10px;background:color-mix(in srgb,currentColor 6%,transparent)}
    .order-item__head{display:flex;justify-content:space-between;align-items:baseline;gap:16px;line-height:1.4;overflow-wrap:anywhere}
    .order-item__head>span{flex:none;white-space:nowrap;font-variant-numeric:tabular-nums}
    .order-item__body>p{margin:4px 0 0;font-size:.875em;line-height:1.45;opacity:.72}
    .order-item__body>.order-item__stock{opacity:1;font-weight:600;color:var(--store-accent,var(--brand-accent,var(--accent,currentColor)))}
    .order-item__unit{white-space:nowrap}.order-item__unit s{margin-left:4px}
    .order-items .order-item .quantity{margin-top:10px}
    .order-savings{display:flex;justify-content:space-between;gap:16px;margin:16px 0 0;font-size:15px}
    /* Spec 2026-11-09 Merman cart: the free-shipping bar, the saving, the frequency choice and the guarantee — in the store's accent. */
    .cart-free{margin:0 0 16px;padding:12px 14px;border-radius:12px;background:color-mix(in srgb,var(--store-accent,var(--brand-accent,var(--accent,#111))) 8%,transparent)}
    .cart-free p{margin:0 0 10px;font-size:14px;line-height:1.4}
    .cart-free__track{position:relative;height:6px;margin-right:26px;border-radius:999px;background:color-mix(in srgb,currentColor 14%,transparent)}
    .cart-free__track span{display:block;height:100%;border-radius:inherit;background:var(--store-accent,var(--brand-accent,var(--accent,#111)));transition:width .4s ease}
    .cart-free__truck{position:absolute;right:-26px;top:50%;transform:translateY(-50%);color:var(--store-accent,var(--brand-accent,var(--accent,currentColor)))}
    .cart-free[data-done] p{font-weight:600}
    .order-item__body>.order-item__save{opacity:1;font-weight:600;font-size:13px;color:var(--store-accent,var(--brand-accent,var(--accent,#0a7a3d)))}
    .order-item__cadence{display:block;margin-top:8px}
    .order-item__cadence select{width:100%;min-height:36px;padding:6px 10px;border:1px solid color-mix(in srgb,currentColor 22%,transparent);border-radius:8px;background:transparent;color:inherit;font:inherit;font-size:13px}
    .cart-guarantee{display:flex;align-items:center;justify-content:center;gap:8px;margin:12px 0 0;font-size:13px;line-height:1.4;text-align:center;opacity:.8}
    .cart-guarantee svg{flex:none}
    .cart-drawer .order-recommendations ul{grid-auto-flow:column;grid-auto-columns:minmax(128px,36%);overflow-x:auto;scroll-snap-type:x mandatory;padding-bottom:6px}
    .cart-drawer .order-recommendations li,.cart-drawer .order-recommendations li:not(:has(img)){grid-template-columns:1fr;align-items:start;scroll-snap-align:start;padding:10px;border:1px solid color-mix(in srgb,currentColor 12%,transparent);border-radius:12px}
    .cart-drawer .order-recommendations li img{width:72px;height:72px;object-fit:cover;border-radius:8px}
    .cart-drawer .order-recommendations li{gap:6px;font-size:13px}.cart-drawer .order-recommendations li :is(button,a){min-height:36px;padding:6px 12px;font-size:13px}
    /* Owner 2026-11-09 (Remolino): «Añadir» was plain text beside a filled «Elegir»; both are pills in the pay button's colour.
       Live Vórtice: a template's Tailwind reset (unlayered) beat this layer, so the pill's colours and shape are !important. */
    .cart-drawer .order-recommendations li :is(button,a){justify-content:center;border:0!important;border-radius:999px!important;background:var(--store-accent,var(--brand-accent,var(--accent,var(--ink,#20211d))))!important;color:var(--store-accent-foreground,var(--brand-accent-foreground,var(--paper,#fff)))!important;font-weight:600;text-decoration:none;cursor:pointer}
    /* «¿Prefieres terminar después?» under the guarantee line: a quiet divider, a small title and an outlined pill — never a second «Pagar». */
    .cart-drawer [data-retention-recovery]{width:auto;margin:20px 0 0;padding:18px 0 0;border:0;border-top:1px solid color-mix(in srgb,currentColor 14%,transparent);background:none;color:inherit;font:inherit}
    .cart-drawer [data-retention-recovery] h3{margin:0 0 6px;font:inherit;font-size:15px;font-weight:600;line-height:1.3}
    .cart-drawer [data-retention-recovery] p{margin:0;font-size:13px;line-height:1.45;opacity:.75;max-width:none}
    .cart-drawer [data-retention-recovery] form{display:grid;gap:10px;max-width:none;margin-top:10px}
    .cart-drawer [data-retention-recovery] .retention-email{gap:6px;font-size:13px}
    .cart-drawer [data-retention-recovery] input[type=email]{min-height:44px;padding:0 16px;border:1px solid color-mix(in srgb,currentColor 22%,transparent)!important;border-radius:999px!important;background:transparent;color:inherit;font-size:14px}
    .cart-drawer [data-retention-recovery] .retention-consent{gap:8px;font-size:12.5px;line-height:1.45;opacity:.8}
    .cart-drawer [data-retention-recovery] input[type=checkbox]{width:16px;height:16px;flex:0 0 16px;margin:1px 0 0}
    .cart-drawer [data-retention-recovery] button{width:100%;min-height:46px;padding:0 20px;border:1px solid currentColor!important;border-radius:999px!important;background:transparent!important;color:inherit!important;font:inherit;font-size:15px;font-weight:600}
    .cart-drawer .checkout-button[data-busy]{opacity:.7;cursor:progress}
    .checkout-review__summary>.checkout-review__count{margin:4px 0 8px;font-size:14px;line-height:1.4;opacity:.7}
    .order-recommendations{margin:20px 0 0}
    .order-recommendations h3{margin:0 0 10px;font-size:15px}
    .order-recommendations ul{display:grid;gap:10px;margin:0;padding:0;list-style:none}
    .order-recommendations li{display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:center;gap:10px}
    .order-recommendations li:not(:has(img)){grid-template-columns:minmax(0,1fr) auto}
    .order-recommendations img{width:48px;height:48px;border-radius:8px;object-fit:cover}
    .order-recommendations li>span{display:grid;overflow-wrap:anywhere}
    .order-recommendations :is(button,a){min-height:44px;padding:0 14px;display:inline-flex;align-items:center}
    .cart-drawer .order-item{padding:24px 0;border-bottom:1px solid var(--store-border,var(--brand-border,var(--line,#d7d2c7)))}
    .cart-drawer .order-item>div:first-child:not(.order-item__body),.cart-drawer .order-total{display:flex;justify-content:space-between;gap:20px;overflow-wrap:anywhere}
    .cart-drawer .quantity{display:flex;align-items:center;gap:16px;margin-top:16px}
    .cart-drawer .quantity button{width:44px;border:1px solid var(--store-border,var(--brand-border,var(--line,#d7d2c7)));background:transparent}
    .cart-drawer .order-total{padding:24px 0;font-size:20px}.cart-drawer .order-empty{padding:40px 0;line-height:1.6}
    .cart-drawer .order-note{font-size:14px;line-height:1.5}
    /* Small kit text keeps normal spacing: a heading's em tracking is inherited as pixels (FLORZ 2026-10-17: -.04em at 66px
       reached the 12px «Vista previa · Sin cobros» as -2.64px and fused the words). A store's own rule still wins. */
    .order-note,[data-pagosya-status],[data-pagosya-checkout-status]{letter-spacing:normal}
    .cart-drawer .checkout-button{display:flex;align-items:center;justify-content:space-between;gap:16px;width:100%;min-height:52px;padding:16px 20px;border:0;background:var(--store-accent,var(--brand-accent,var(--accent,var(--ink,#20211d))));color:var(--store-accent-foreground,var(--brand-accent-foreground,var(--paper,#fff)))}
    .cart-drawer button:disabled{opacity:.5;cursor:default}.cart-drawer>.cart-drawer__continue{display:block!important;position:static!important;float:none!important;box-sizing:border-box!important;width:calc(100% - 64px)!important;max-width:none!important;margin:0 32px 32px!important;padding:10px 0;border:0;background:transparent;text-align:center!important;text-decoration:underline;text-underline-offset:4px}.cart-drawer[data-template]>:is(.cart-drawer__header,.cart-drawer__continue,.pagosya-policies){display:none!important}.cart-drawer[data-template] .cart-drawer__body{padding:0}
    .cart-drawer :focus-visible,.cart-added :focus-visible{outline:3px solid currentColor;outline-offset:3px}
    /* Trust block (pages/policy-links.js renderTrust): emoji points on cards that take the section's own colours and type. */
    :is([data-pagosya-trust],[data-pagosya-trust-section])[hidden]{display:none!important}
    [data-pagosya-trust]{box-sizing:border-box;grid-column:1/-1;flex:1 1 100%;width:100%}
    .pagosya-trust__list{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,210px),1fr));gap:16px;margin:28px 0 0;padding:0;list-style:none}
    .pagosya-trust__item{display:flex;margin:0;padding:0}
    .pagosya-trust__card{box-sizing:border-box;display:flex;flex-direction:column;align-items:flex-start;gap:6px;width:100%;margin:0;padding:22px 20px;border:1px solid color-mix(in srgb,currentColor 16%,transparent);border-radius:var(--kit-radius-panel,16px);background:color-mix(in srgb,currentColor 4%,transparent);color:inherit;font:inherit;text-align:left;text-decoration:none}
    :is(a,button).pagosya-trust__card{cursor:pointer;transition:border-color var(--motion-fast,200ms) ease,transform var(--motion-fast,200ms) ease}
    @media(hover:hover){:is(a,button).pagosya-trust__card:hover{border-color:color-mix(in srgb,currentColor 40%,transparent);transform:translateY(-2px)}}
    .pagosya-trust__emoji{font-size:30px;line-height:1;margin-bottom:8px}
    .pagosya-trust__card strong{font-size:1.05em;line-height:1.3}
    .pagosya-trust__detail{font-size:.95em;line-height:1.5;opacity:.78;overflow-wrap:anywhere}
    .pagosya-trust__card:focus-visible{outline:3px solid currentColor;outline-offset:3px}
    .cart-added{position:fixed;inset:auto 24px 24px auto;z-index:2147483001;display:flex;align-items:center;gap:20px;max-width:min(480px,calc(100vw - 48px));padding:12px 16px;background:var(--store-foreground,var(--brand-foreground,var(--ink,#20211d)));color:var(--store-background,var(--brand-background,var(--paper,#fff)));font:inherit;box-shadow:0 8px 24px #0002;opacity:0;transform:translateY(12px);visibility:hidden;transition:opacity var(--motion-fast,200ms) var(--ease-out,cubic-bezier(.23,1,.32,1)),transform var(--motion-fast,200ms) var(--motion-ease,var(--ease-out,cubic-bezier(.23,1,.32,1))),visibility var(--motion-fast,200ms)}
    .cart-added[data-visible=true]{opacity:1;transform:translateY(0);visibility:visible}.cart-added span{overflow-wrap:anywhere}.cart-added button{flex-shrink:0;min-height:44px;background:transparent;border:0;color:inherit;font:inherit;text-decoration:underline;text-underline-offset:4px}
    @media(max-width:700px){.cart-drawer{width:100vw}.cart-drawer__header{padding:20px}.cart-drawer__body{padding:8px 20px 24px}.cart-drawer>.cart-drawer__continue{width:calc(100% - 40px)!important;margin:0 20px 24px!important}.cart-added{inset:auto 12px 12px;max-width:none;gap:12px}}
    .cart-drawer[data-instant=true],.cart-added[data-instant=true]{transition:none}[data-cart-count]{display:inline-block}
    @media(prefers-reduced-motion:reduce){.cart-drawer,.cart-added{transition:none;transform:none}}
  `;
  shoppingStyle.textContent += `
    @layer pagosya-commerce {
    /* The calm checkout (checkout/shell.js, checkout-shell/shell.css) draws the review; the review must still never take an
       authored fixed drawer's geometry. */
    [data-pagosya-checkout] [data-pagosya-cart][data-checkout-review]{position:static!important;inset:auto!important;z-index:auto;width:100%!important;min-width:0;max-width:none;height:auto!important;min-height:0;max-height:none;margin:0;padding:0;overflow:visible!important;transform:none;box-shadow:none;border:0;background:transparent;color:inherit;opacity:1;visibility:visible}
  }`;
  document.head.append(shoppingStyle);
  let checkoutTrigger = null, checkoutPreviousHash = "", checkoutOverflow = "";
  const inertBeforeCheckout = new Map();
  const checkoutAnswers = new Map();
  const rememberCheckout = panel => panel.querySelectorAll('input[name],textarea[name],select[name]').forEach(field => { if (field.name !== 'shippingZoneId') checkoutAnswers.set(field.name, field.value); });
  document.addEventListener('input', event => { const panel = event.target.closest('[data-checkout-review]'); if (panel) rememberCheckout(panel); });
  document.addEventListener('change', event => { const panel = event.target.closest('[data-checkout-review]'); if (panel) rememberCheckout(panel); });
  function showCheckout(mode = 'review') {
    // Opening the review also changes the hash; preserve fields on that second notification.
    if (!checkoutPage.hidden && checkoutPage.dataset.mode === mode) return;
    checkoutPage.dataset.mode = mode;
    // The calm checkout covers the whole page, an authored checkout page too: what is around it leaves the tab order.
    if (checkoutPage.hidden) { checkoutOverflow = document.documentElement.style.overflow; document.documentElement.style.overflow = "hidden"; inertAround(checkoutPage, inertBeforeCheckout); }
    checkoutPage.hidden = false;
    checkoutPage.classList.add('pya-checkout', 'pya-co--kit');
    const back = fullCheckoutPage && mode === 'review' ? `<a class="pya-co__back" href="index.html">${BACK_ICON} Seguir comprando</a>` : `<button class="pya-co__back" type="button" ${mode === 'done' ? 'data-shell-close' : 'data-checkout-back'}>${BACK_ICON} ${mode === 'payment' ? 'Volver a la entrega' : 'Seguir comprando'}</button>`;
    const heading = mode === 'payment' ? 'Pago de prueba' : mode === 'done' ? '¡Gracias por tu compra!' : 'Revisa tu pedido';
    const note = mode === 'payment' ? 'Puedes completar el recorrido de prueba. No se realizará ningún cobro ni se creará un pedido real.' : preview || config.demo ? 'Vista previa · Sin cobros' : '';
    checkoutPage.innerHTML = `${checkoutBand()}<header class="pya-co__bar">${back}<span class="pya-co__secure">${LOCK_ICON} Pago seguro</span></header><button type="button" class="pya-co__summary-toggle" aria-expanded="false" aria-controls="pya-co-summary" data-shell-summary><span data-shell-summary-label>Ver resumen del pedido</span><strong data-shell-total></strong></button><div class="pya-co__frame"><div class="pya-co__lead">${shellSteps(mode)}<h1 tabindex="-1">${heading}</h1>${note ? `<p class="pya-co__note order-note">${note}</p>` : ''}<p class="pya-co__status" data-pagosya-status role="status" aria-live="polite"></p></div><div data-pagosya-cart data-checkout-review="${mode}"></div></div>`;
    shellAccent(checkoutPage);
    renderCart();
    // Moving focus is for the overlay, which opens over the page. A full checkout page is simply loaded, and
    // scripted focus there paints a keyboard ring around the title for mouse and touch users.
    if (checkoutPage !== fullCheckoutPage || mode !== 'review') checkoutPage.querySelector("h1")?.focus({ preventScroll: true });
    checkoutPage.scrollTop = 0;
  }
  function closeCheckout() {
    if (checkoutPage.hidden) return;
    checkoutPage.hidden = true; checkoutPage.innerHTML = ""; checkoutPage.classList.remove("pya-checkout"); delete checkoutPage.dataset.mode;
    document.documentElement.style.overflow = checkoutOverflow;
    inertBeforeCheckout.forEach((value, element) => { element.inert = value; }); inertBeforeCheckout.clear();
    checkoutTrigger?.focus();
  }
  function openCheckout(button) {
    if (!cart.size || !ready || checkingOut) return;
    track('checkout_started');
    if (cartDrawer.open) { cartDrawer.close(); restoreDrawer(); }
    if (config.checkoutPage && !fullCheckoutPage) { const link = document.createElement('a'); link.href = pageHref(config.checkoutPage); document.body.append(link); link.click(); link.remove(); return; }
    checkoutTrigger = button; checkoutPreviousHash = location.hash;
    showCheckout();
    location.hash = "checkout";
  }
  window.addEventListener("hashchange", () => {
    if (location.hash === "#checkout") showCheckout();
    else if (location.hash === "#pago-de-prueba" && (preview || config.demo)) showCheckout('payment');
    else if (location.hash === "#pedido-de-prueba" && (preview || config.demo)) showCheckout('done');
    else if (fullCheckoutPage) showCheckout();
    else closeCheckout();
  });
  // Runtime-bound product navigation keeps its item ID even if presentation
  // code later normalizes hrefs. Run before the sandbox's document navigation.
  for (const eventName of ['click', 'auxclick']) window.addEventListener(eventName, event => {
    const link = event.target.closest?.('a[data-product-link]');
    const id = link?.closest('[data-custom-product]')?.dataset.productId;
    if (config.productPage && id && products().some(product => product.id === id)) link.href = pageHref(config.productPage, '?id=' + encodeURIComponent(id));
  }, true);
