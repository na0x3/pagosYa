  // Design DNA variants (sub-project 5): form becomes per store, behaviour stays platform-owned. Every
  // variant is keyed on :root[data-dna-*] and this element exists only when the store has a DNA, so a
  // store without one renders exactly as before. Surfaces read one shared token set.
  const KIT_BUTTONS = ':where(.menu-add,.checkout-button,[data-pagosya-product] .product-detail__buy,.product-detail__sticky button,.cart-added button,.order-recommendations :is(button,a),.product-detail__bundle-add,[data-pagosya-contact] form>button[type=submit],[data-dna-fields] [data-account-gate] [data-part=submit])';
  const KIT_STEPPERS = ':where(.quantity button,.product-detail__quantity,.product-detail__box-stepper button)';
  /* The product page is platform-owned: its kit styles are unlayered and authored rules on its hooks are released
   * (releaseProductPageStyles), so the DNA reaches its buttons with an unlayered, product-scoped copy of the rules. */
  const PAGE_BUTTONS = '[data-pagosya-product][data-style] :is(.product-detail__buy,.product-detail__sticky button,.product-detail__bundle-add)';
  const PAGE_STEPPERS = '[data-pagosya-product][data-style] :is(.product-detail__quantity,.product-detail__box-stepper button)';
  const dnaForm = (value, tokens) => `:root[data-dna-button=${value}]{${tokens}}`;
  const dnaHover = (buttons, value, declarations) => `@media(hover:hover){:root[data-dna-hover=${value}] ${buttons}:hover:not(:disabled){${declarations}}}:root[data-dna-hover=${value}] ${buttons}:focus-visible{${declarations}}`;
  /* Form, focus, hover and press of a set of buttons (and the shape of their steppers). */
  const dnaButtonRules = (buttons, steppers) => [
    /* Primary pay, checkout and buy buttons (.checkout-button) keep their full size (52px cart, 48px checkout and product) and padding. */
    `:root[data-dna-button] ${buttons}:not(.checkout-button){min-height:44px;padding:var(--kit-btn-pad)}`,
    `:root[data-dna-button] ${buttons}{border:var(--kit-btn-border);border-radius:var(--kit-btn-radius);background:var(--kit-btn-bg);color:var(--kit-btn-fg);text-transform:var(--kit-btn-case);font-variant-caps:var(--kit-btn-caps,normal);letter-spacing:var(--kit-btn-tracking);text-decoration:var(--kit-btn-decor);clip-path:var(--kit-btn-clip);box-shadow:var(--kit-btn-shadow);transition:transform var(--motion-fast,160ms) var(--motion-ease,var(--kit-ease)),box-shadow var(--motion-fast,160ms) var(--kit-ease),background-position var(--motion-slow,480ms) var(--kit-ease),background-size var(--motion-base,240ms) var(--kit-ease),filter var(--motion-fast,160ms)}`,
    `:root[data-dna-button] ${steppers}{border-radius:var(--kit-radius);border-width:max(var(--kit-border),1px)}`,
    /* Hover (and keyboard focus): never the only focus indicator. */
    dnaHover(buttons, 'lift', 'transform:translateY(-2px);box-shadow:var(--kit-btn-shadow),0 8px 18px -8px color-mix(in srgb,currentColor 60%,transparent)'),
    /* Fill: the button's edge fills in with its own text colour. The background never changes, so the text keeps its contrast. */
    dnaHover(buttons, 'fill', 'box-shadow:var(--kit-btn-shadow),inset 0 0 0 .2em currentColor'),
    `:root[data-dna-hover=underline-grow] ${buttons}{background-image:linear-gradient(currentColor,currentColor);background-repeat:no-repeat;background-position:50% calc(100% - .35em);background-size:0 1.5px}`,
    dnaHover(buttons, 'underline-grow', 'background-size:calc(100% - 2em) 1.5px'),
    dnaHover(buttons, 'tilt', 'transform:rotate(-2deg)'),
    `:root[data-dna-hover=shine] ${buttons}{background-image:linear-gradient(110deg,transparent 35%,rgb(255 255 255/.38) 50%,transparent 65%);background-repeat:no-repeat;background-size:260% 100%;background-position:100% 0}`,
    dnaHover(buttons, 'shine', 'background-position:0 0'),
    dnaHover(buttons, 'invert', 'background-color:var(--kit-btn-invert-bg);color:var(--kit-btn-invert-fg)'),
    /* Press. The stamp form rocks a little instead. */
    `:root[data-dna-press] ${buttons}:active:not(:disabled){transform:var(--kit-press)}:root[data-dna-press=sink] ${buttons}:active:not(:disabled){box-shadow:none}`,
    `:root[data-dna-button=stamp] ${buttons}:active:not(:disabled){transform:var(--kit-press) rotate(-2.5deg)}`,
    /* Keyboard focus, last so no hover effect replaces it: an ink ring on a paper halo reads on filled and open
     * forms alike, and the tag notch is dropped so nothing clips the ring. The store's own focus style still wins. */
    `:root[data-dna-button] ${buttons}:focus-visible:not(:disabled){outline:3px solid var(--kit-ink);outline-offset:2px;box-shadow:0 0 0 2px var(--kit-paper),var(--kit-btn-shadow);clip-path:none}`,
  ];
  /* Per-form details of the T2b forms that a token cannot carry: press, the ticket notches (unmasked on focus), weight,
   * and the bubbly form's larger pack icon (the icon's base size sits in the lower pagosya-commerce layer). */
  const TICKET_MASK = 'radial-gradient(circle at 0 50%,#0000 .5em,#000 calc(.5em + .5px)) 0 0/51% 100% no-repeat,radial-gradient(circle at 100% 50%,#0000 .5em,#000 calc(.5em + .5px)) 100% 0/51% 100% no-repeat';
  const dnaIdentityButtonRules = buttons => [
    `:root[data-dna-button=sticker] ${buttons}:active:not(:disabled){transform:translate(3px,3px);box-shadow:1px 1px 0 var(--kit-ink)}`,
    `:root[data-dna-button=ticket] ${buttons}{-webkit-mask:${TICKET_MASK};mask:${TICKET_MASK}}`,
    `:root[data-dna-button=ticket] ${buttons}:focus-visible:not(:disabled){-webkit-mask:none;mask:none}`,
    `:root[data-dna-button=bubbly] ${buttons}{font-weight:700}`,
    `:root[data-dna-button=bubbly] ${buttons}:active:not(:disabled){transform:translateY(2px);box-shadow:inset 0 -1px 0 color-mix(in srgb,#000 18%,transparent)}`,
    `:root[data-dna-button=brutal] ${buttons}{font-weight:800}`,
    `:root[data-dna-button=brutal] ${buttons}:active:not(:disabled){transform:translate(2px,2px)}`,
  ];
  /* Identity frames (T2b): the photos frames apply to, the stamp's perforated edge and the tape's translucent corners. */
  const FRAMED_PHOTOS = ':is(.menu-item :is(.menu-item__image,.menu-item__image-alt),.order-item__photo)';
  const STAMP_MASK = 'radial-gradient(4px,#0000 97%,#000) round -6px -6px/12px 12px,linear-gradient(#000 0 0) no-repeat 50%/calc(100% - 12px) calc(100% - 12px)';
  const TAPE = 'color-mix(in srgb,var(--kit-accent) 40%,transparent)';
  const TAPE_CORNERS = `linear-gradient(135deg,${TAPE} 0 13px,#0000 13px),linear-gradient(225deg,${TAPE} 0 13px,#0000 13px),linear-gradient(45deg,${TAPE} 0 13px,#0000 13px),linear-gradient(315deg,${TAPE} 0 13px,#0000 13px)`;
  const DNA_CSS = [
    /* Tokens. Colours stay the store's own (--store-*, then --brand-*, then legacy names). */
    `:root{--kit-ink:var(--store-foreground,var(--brand-foreground,var(--ink,#20211d)));--kit-paper:var(--store-background,var(--brand-background,var(--paper,#fff)));--kit-accent:var(--store-accent,var(--brand-accent,var(--accent,var(--kit-ink))));--kit-on-accent:var(--store-accent-foreground,var(--brand-accent-foreground,var(--kit-paper)));--kit-surface:var(--store-surface,var(--brand-surface,color-mix(in srgb,var(--kit-ink) 5%,var(--kit-paper))));--kit-line:var(--store-border,var(--brand-border,color-mix(in srgb,var(--kit-ink) 18%,var(--kit-paper))));--kit-radius:var(--store-radius,var(--brand-radius,0px));--kit-radius-panel:var(--kit-radius);--kit-border:1px;--kit-photo-radius:var(--kit-radius);--kit-photo-pad:0px;--kit-photo-bg:transparent;--kit-photo-shadow:none;--kit-ease:var(--motion-ease-settle,cubic-bezier(.23,1,.32,1))}`,
    ...MOTION_CSS,
    ':root[data-dna-radius=none]{--kit-radius:0px;--kit-radius-panel:0px}',
    ':root[data-dna-radius=soft]{--kit-radius:6px;--kit-radius-panel:10px}',
    ':root[data-dna-radius=round]{--kit-radius:14px;--kit-radius-panel:22px}',
    ':root[data-dna-radius=pill]{--kit-radius:999px;--kit-radius-panel:30px}',
    ':root[data-dna-border=none]{--kit-border:0px}:root[data-dna-border=hairline]{--kit-border:1px}:root[data-dna-border=bold]{--kit-border:2.5px}',
    /* Type voice: case and tracking reach open button forms and the kit's panel titles. */
    ':root[data-dna-case=none]{--kit-type-case:none;--kit-type-caps:normal}:root[data-dna-case=upper]{--kit-type-case:uppercase;--kit-type-caps:normal}:root[data-dna-case=small-caps]{--kit-type-case:none;--kit-type-caps:all-small-caps}',
    ':root[data-dna-tracking=tight]{--kit-type-tracking:-.01em}:root[data-dna-tracking=normal]{--kit-type-tracking:.01em}:root[data-dna-tracking=wide]{--kit-type-tracking:.1em}',
    ':root[data-dna-case] :is(.cart-drawer__header h2,.checkout-review__summary h2){font-family:var(--store-heading-font,var(--brand-heading-font,inherit));text-transform:var(--kit-type-case);font-variant-caps:var(--kit-type-caps);letter-spacing:var(--kit-type-tracking)}',
    /* Image framing, for card and cart photos. */
    ':root[data-dna-frame=bleed]{--kit-photo-radius:min(var(--kit-radius),28px);--kit-photo-pad:0px}',
    ':root[data-dna-frame=inset]{--kit-photo-radius:min(var(--kit-radius),24px);--kit-photo-pad:6px;--kit-photo-bg:var(--kit-surface)}',
    ':root[data-dna-frame=rounded]{--kit-photo-radius:18px;--kit-photo-pad:0px}',
    ':root[data-dna-frame=arch]{--kit-photo-radius:999px 999px 8px 8px / 42% 42% 8px 8px;--kit-photo-pad:0px}',
    ':root[data-dna-frame=polaroid]{--kit-photo-radius:2px;--kit-photo-pad:6px 6px 22px;--kit-photo-bg:#fff;--kit-photo-shadow:0 6px 18px -8px #0006}',
    ':root[data-dna-frame=blob]{--kit-photo-radius:58% 42% 55% 45% / 45% 55% 45% 55%;--kit-photo-pad:0px}',
    // A pad mixed toward white nearly vanishes against a light palette (finding 6): --kit-surface already reads as a
    // distinct tint against --kit-paper on any palette, and a hairline ring keeps the perforated edge legible too.
    ':root[data-dna-frame=stamp]{--kit-photo-radius:0px;--kit-photo-pad:8px;--kit-photo-bg:var(--kit-surface);--kit-photo-shadow:inset 0 0 0 1px var(--kit-line)}',
    ':root[data-dna-frame=tape]{--kit-photo-radius:2px;--kit-photo-pad:8px;--kit-photo-bg:color-mix(in srgb,var(--kit-paper) 82%,#fff);--kit-photo-shadow:0 6px 16px -10px #0007}',
    /* Button forms. Filled forms use the store's accent pair; open forms take currentColor, so they read on any card. */
    dnaForm('pill', '--kit-btn-invert-bg:var(--kit-on-accent);--kit-btn-invert-fg:var(--kit-accent);--kit-btn-radius:999px;--kit-btn-border:0 solid transparent;--kit-btn-bg:var(--kit-accent);--kit-btn-fg:var(--kit-on-accent);--kit-btn-case:var(--kit-type-case,none);--kit-btn-caps:var(--kit-type-caps,normal);--kit-btn-tracking:var(--kit-type-tracking,0);--kit-btn-pad:.7em 1.6em;--kit-btn-decor:none;--kit-btn-clip:none;--kit-btn-shadow:0 0 #0000'),
    dnaForm('block', '--kit-btn-invert-bg:var(--kit-paper);--kit-btn-invert-fg:var(--kit-ink);--kit-btn-radius:0px;--kit-btn-border:0 solid transparent;--kit-btn-bg:var(--kit-ink);--kit-btn-fg:var(--kit-paper);--kit-btn-case:uppercase;--kit-btn-tracking:.09em;--kit-btn-pad:.9em 1.5em;--kit-btn-decor:none;--kit-btn-clip:none;--kit-btn-shadow:0 0 #0000'),
    dnaForm('underline', '--kit-btn-invert-bg:var(--kit-ink);--kit-btn-invert-fg:var(--kit-paper);--kit-btn-radius:0px;--kit-btn-border:0 solid transparent;--kit-btn-bg:transparent;--kit-btn-fg:inherit;--kit-btn-case:var(--kit-type-case,none);--kit-btn-caps:var(--kit-type-caps,normal);--kit-btn-tracking:var(--kit-type-tracking,0);--kit-btn-pad:.5em .15em;--kit-btn-decor:none;--kit-btn-clip:none;--kit-btn-shadow:inset 0 -2px 0 currentColor'),
    dnaForm('tag', '--kit-btn-invert-bg:var(--kit-on-accent);--kit-btn-invert-fg:var(--kit-accent);--kit-btn-radius:3px;--kit-btn-border:0 solid transparent;--kit-btn-bg:var(--kit-accent);--kit-btn-fg:var(--kit-on-accent);--kit-btn-case:uppercase;--kit-btn-tracking:.06em;--kit-btn-pad:.7em 1.7em .7em 1.3em;--kit-btn-decor:none;--kit-btn-clip:polygon(0 0,calc(100% - 12px) 0,100% 12px,100% 100%,0 100%);--kit-btn-shadow:0 0 #0000'),
    dnaForm('stamp', '--kit-btn-invert-bg:var(--kit-ink);--kit-btn-invert-fg:var(--kit-paper);--kit-btn-radius:2px;--kit-btn-border:4px double currentColor;--kit-btn-bg:transparent;--kit-btn-fg:inherit;--kit-btn-case:uppercase;--kit-btn-tracking:.16em;--kit-btn-pad:.6em 1.3em;--kit-btn-decor:none;--kit-btn-clip:none;--kit-btn-shadow:0 0 #0000'),
    dnaForm('outline', '--kit-btn-invert-bg:var(--kit-ink);--kit-btn-invert-fg:var(--kit-paper);--kit-btn-radius:var(--kit-radius);--kit-btn-border:1.5px solid currentColor;--kit-btn-bg:transparent;--kit-btn-fg:inherit;--kit-btn-case:var(--kit-type-case,none);--kit-btn-caps:var(--kit-type-caps,normal);--kit-btn-tracking:var(--kit-type-tracking,0);--kit-btn-pad:.7em 1.4em;--kit-btn-decor:none;--kit-btn-clip:none;--kit-btn-shadow:0 0 #0000'),
    dnaForm('ghost', '--kit-btn-invert-bg:var(--kit-ink);--kit-btn-invert-fg:var(--kit-paper);--kit-btn-radius:var(--kit-radius);--kit-btn-border:0 solid transparent;--kit-btn-bg:color-mix(in srgb,currentColor 11%,transparent);--kit-btn-fg:inherit;--kit-btn-case:var(--kit-type-case,none);--kit-btn-caps:var(--kit-type-caps,normal);--kit-btn-tracking:var(--kit-type-tracking,0);--kit-btn-pad:.75em 1.4em;--kit-btn-decor:none;--kit-btn-clip:none;--kit-btn-shadow:0 0 #0000'),
    dnaForm('split', '--kit-btn-invert-bg:var(--kit-on-accent);--kit-btn-invert-fg:var(--kit-accent);--kit-btn-radius:var(--kit-radius);--kit-btn-border:0 solid transparent;--kit-btn-bg:var(--kit-accent);--kit-btn-fg:var(--kit-on-accent);--kit-btn-case:var(--kit-type-case,none);--kit-btn-caps:var(--kit-type-caps,normal);--kit-btn-tracking:var(--kit-type-tracking,0);--kit-btn-pad:.75em 1.2em;--kit-btn-decor:none;--kit-btn-clip:none;--kit-btn-shadow:0 0 #0000'),
    /* Identity libraries (T2b). Sticker: an offset hard shadow in the ink. Ticket: notched ends (a mask, dropped on focus so
     * the ring shows). Bubbly: soft and round with a shaded lip; the pack icon shows a little larger. Brutal: thick ink
     * border on flat accent. All four fill with the store's accent pair, so a pay button reads the way pill does. */
    dnaForm('sticker', '--kit-btn-invert-bg:var(--kit-on-accent);--kit-btn-invert-fg:var(--kit-accent);--kit-btn-radius:min(var(--kit-radius),12px);--kit-btn-border:2px solid var(--kit-ink);--kit-btn-bg:var(--kit-accent);--kit-btn-fg:var(--kit-on-accent);--kit-btn-case:var(--kit-type-case,none);--kit-btn-caps:var(--kit-type-caps,normal);--kit-btn-tracking:var(--kit-type-tracking,0);--kit-btn-pad:.7em 1.5em;--kit-btn-decor:none;--kit-btn-clip:none;--kit-btn-shadow:4px 4px 0 var(--kit-ink)'),
    dnaForm('ticket', '--kit-btn-invert-bg:var(--kit-on-accent);--kit-btn-invert-fg:var(--kit-accent);--kit-btn-radius:4px;--kit-btn-border:0 solid transparent;--kit-btn-bg:var(--kit-accent);--kit-btn-fg:var(--kit-on-accent);--kit-btn-case:uppercase;--kit-btn-tracking:.08em;--kit-btn-pad:.75em 1.8em;--kit-btn-decor:none;--kit-btn-clip:none;--kit-btn-shadow:0 0 #0000'),
    dnaForm('bubbly', '--kit-btn-invert-bg:var(--kit-on-accent);--kit-btn-invert-fg:var(--kit-accent);--kit-btn-radius:999px;--kit-btn-border:0 solid transparent;--kit-btn-bg:var(--kit-accent);--kit-btn-fg:var(--kit-on-accent);--kit-btn-case:none;--kit-btn-tracking:.01em;--kit-btn-pad:.8em 1.7em;--kit-btn-decor:none;--kit-btn-clip:none;--kit-btn-shadow:inset 0 -3px 0 color-mix(in srgb,#000 18%,transparent),0 6px 14px -8px color-mix(in srgb,var(--kit-accent) 70%,transparent)'),
    dnaForm('brutal', '--kit-btn-invert-bg:var(--kit-ink);--kit-btn-invert-fg:var(--kit-paper);--kit-btn-radius:0px;--kit-btn-border:3px solid var(--kit-ink);--kit-btn-bg:var(--kit-accent);--kit-btn-fg:var(--kit-on-accent);--kit-btn-case:uppercase;--kit-btn-tracking:.04em;--kit-btn-pad:.75em 1.4em;--kit-btn-decor:none;--kit-btn-clip:none;--kit-btn-shadow:0 0 #0000'),
    /* Open forms keep a primary pay, checkout or buy button filled with the store's accent pair: it must read as the next step. */
    ':root:is([data-dna-button=underline],[data-dna-button=ghost],[data-dna-button=outline],[data-dna-button=stamp]) :where(.checkout-button,.product-detail__sticky button){--kit-btn-bg:var(--kit-accent);--kit-btn-fg:var(--kit-on-accent);--kit-btn-invert-bg:var(--kit-on-accent);--kit-btn-invert-fg:var(--kit-accent)}',
    /* Split: the price (or the arrow) sits in its own cell. */
    ':root[data-dna-button=split] .checkout-button{display:flex;justify-content:space-between;gap:0}',
    ':root[data-dna-button=split] .checkout-button>svg{box-sizing:content-box;padding-left:1em;margin-left:1em;border-left:1px solid color-mix(in srgb,currentColor 45%,transparent)}',
    ...dnaButtonRules(KIT_BUTTONS, KIT_STEPPERS), ...dnaIdentityButtonRules(KIT_BUTTONS),
    ':root[data-dna-press=squash]{--kit-press:scale(.97,.9)}:root[data-dna-press=sink]{--kit-press:translateY(2px)}:root[data-dna-press=pop]{--kit-press:scale(1.06)}:root[data-dna-press=none]{--kit-press:translate(0)}',
    /* Cart: right drawer (today's place, restyled), bottom sheet, full page or centred card. */
    ':root[data-dna-cart] .cart-drawer{border:0 solid var(--kit-line)}:root[data-dna-cart] .cart-drawer__grip{display:none}',
    ':root[data-dna-cart=drawer] .cart-drawer{inset:0 0 0 auto;width:min(440px,92vw);border-left-width:var(--kit-border);border-radius:var(--kit-radius-panel) 0 0 var(--kit-radius-panel);background:color-mix(in srgb,var(--kit-ink) 3%,var(--kit-paper))}',
    ':root[data-dna-cart=drawer] .cart-drawer:not([open]){transform:translateX(100%);opacity:0}',
    '@starting-style{:root[data-dna-cart=drawer] .cart-drawer[open]{transform:translateX(100%);opacity:0}}',
    ':root[data-dna-cart=sheet] .cart-drawer{inset:auto 0 0 0;margin:0 auto;width:min(760px,100vw);height:auto;max-height:min(88dvh,900px);border-top-width:var(--kit-border);border-radius:var(--kit-radius-panel) var(--kit-radius-panel) 0 0;background:var(--kit-surface);transform:translateY(0)}',
    ':root[data-dna-cart=sheet] .cart-drawer:not([open]){transform:translateY(100%);opacity:0}',
    '@starting-style{:root[data-dna-cart=sheet] .cart-drawer[open]{transform:translateY(100%);opacity:0}}',
    ':root[data-dna-cart=sheet] .cart-drawer__header{position:relative;padding-top:32px}:root[data-dna-cart=sheet] .cart-drawer__grip{display:block;position:absolute;top:12px;left:50%;width:44px;height:5px;border-radius:3px;background:currentColor;opacity:.3;transform:translateX(-50%)}',
    ':root[data-dna-cart=page] .cart-drawer{inset:0;width:100vw;max-width:100vw;height:100dvh;max-height:100dvh;border-radius:0;border-top:var(--kit-border) solid var(--kit-accent);background:var(--kit-surface)}',
    ':root[data-dna-cart=page] .cart-drawer:not([open]){transform:translateY(28px);opacity:0}',
    '@starting-style{:root[data-dna-cart=page] .cart-drawer[open]{transform:translateY(28px);opacity:0}}',
    ':root[data-dna-cart=page] .cart-drawer :is(.cart-drawer__header,.cart-drawer__body),:root[data-dna-cart=page] .cart-drawer>.pagosya-policies{box-sizing:border-box;width:100%;max-width:880px;margin-inline:auto}:root[data-dna-cart=page] .cart-drawer__header{border-bottom-width:max(var(--kit-border),1px)}:root[data-dna-cart=page] .cart-drawer::backdrop{background:var(--kit-surface)}',
    ':root[data-dna-cart=overlay] .cart-drawer{inset:0;margin:auto;width:min(620px,calc(100vw - 32px));height:auto;max-height:min(86dvh,820px);border-width:var(--kit-border);border-radius:var(--kit-radius-panel);background:var(--kit-paper);box-shadow:0 24px 80px -24px #0009}',
    ':root[data-dna-cart=overlay] .cart-drawer:not([open]){transform:scale(.96);opacity:0}',
    '@starting-style{:root[data-dna-cart=overlay] .cart-drawer[open]{transform:scale(.96);opacity:0}}',
    '@media(max-width:700px){:root[data-dna-cart=drawer] .cart-drawer{width:100vw;border-radius:0}:root[data-dna-cart=sheet] .cart-drawer{width:100vw;max-height:92dvh}:root[data-dna-cart=page] .cart-drawer{width:100vw}:root[data-dna-cart=overlay] .cart-drawer{width:calc(100vw - 24px);max-height:calc(100dvh - 24px)}}',
    ':root[data-dna-frame] .order-item__photo{box-sizing:border-box;border-radius:var(--kit-photo-radius);padding:var(--kit-photo-pad);background:var(--kit-photo-bg);box-shadow:var(--kit-photo-shadow)}',
    /* Added to cart: corner toast (restyled), ribbon, bubble under the cart button, inline note, centred stamp. */
    ':root[data-dna-added] .cart-added{box-sizing:border-box;border:var(--kit-border) solid var(--kit-line);flex-wrap:wrap;gap:6px 16px}',
    ':root[data-dna-added=toast] .cart-added{inset:auto 24px 24px auto;width:min(360px,calc(100vw - 48px));padding:14px 16px;border-radius:var(--kit-radius-panel);background:var(--kit-paper);color:var(--kit-ink);box-shadow:0 18px 44px -18px #0008}',
    ':root[data-dna-added=ribbon] .cart-added{inset:0 0 auto 0;width:auto;max-width:none;justify-content:center;padding:14px 24px;border-width:0 0 var(--kit-border);border-radius:0;background:var(--kit-accent);color:var(--kit-on-accent);box-shadow:0 10px 30px -18px #0009}',
    ':root[data-dna-added=ribbon] .cart-added:not([data-visible=true]){transform:translateY(-100%)}',
    ':root[data-dna-added=bubble] .cart-added{inset:var(--added-top,16px) var(--added-right,auto) auto var(--added-left,auto);width:min(300px,calc(100vw - 24px));padding:12px 14px;border-radius:max(var(--kit-radius-panel),8px);background:var(--kit-ink);color:var(--kit-paper);box-shadow:0 14px 34px -14px #0009}',
    ':root[data-dna-added=bubble] .cart-added::before{content:"";position:absolute;top:-7px;left:var(--added-arrow,calc(100% - 36px));width:12px;height:12px;background:inherit;transform:rotate(45deg)}',
    ':root[data-dna-added=bubble] .cart-added:not([data-visible=true]){transform:translateY(-8px) scale(.96)}',
    ':root[data-dna-added=inline] .cart-added{inset:var(--added-top,auto) auto auto var(--added-left,12px);width:min(320px,calc(100vw - 24px));padding:10px 12px;border-radius:min(var(--kit-radius),12px);border-left:4px solid var(--kit-accent);background:var(--kit-surface);color:var(--kit-ink);box-shadow:0 10px 24px -14px #0008}',
    ':root[data-dna-added=inline] .cart-added:not([data-visible=true]){transform:translateY(-6px)}',
    ':root[data-dna-added=stamp] .cart-added{inset:0;margin:auto;width:fit-content;height:fit-content;max-width:calc(100vw - 48px);flex-direction:column;justify-content:center;padding:18px 28px;border:4px double currentColor;border-radius:var(--kit-radius);background:var(--kit-paper);color:var(--kit-ink);text-align:center;text-transform:uppercase;letter-spacing:.12em;box-shadow:0 30px 80px -30px #0009;transform:rotate(-4deg)}',
    ':root[data-dna-added=stamp] .cart-added:not([data-visible=true]){transform:rotate(-4deg) scale(1.12)}',
    '@media(max-width:700px){:root[data-dna-added=toast] .cart-added{inset:auto 12px 12px 12px;width:auto}:root[data-dna-added=ribbon] .cart-added{inset:auto 0 0 0;border-width:var(--kit-border) 0 0}:root[data-dna-added=ribbon] .cart-added:not([data-visible=true]){transform:translateY(100%)}:root[data-dna-added=bubble] .cart-added{left:12px;right:12px;width:auto}}',
    ':root[data-dna-added] .cart-added[data-flip=bottom]{inset:auto 12px 12px 12px;width:auto;margin:0}:root[data-dna-added] .cart-added[data-flip=top]{inset:12px 12px auto 12px;width:auto;margin:0}',
    /* Checkout review: the same fields and actions in four layouts; the order summary becomes a DNA panel. */
    ':root[data-dna-density=airy]{--kit-review-max:680px;--kit-summary-fr:.8fr;--kit-gap:clamp(40px,7vw,112px);--kit-pad:clamp(22px,3.4vw,36px)}:root[data-dna-density=balanced]{--kit-review-max:780px;--kit-summary-fr:1fr;--kit-gap:clamp(32px,5vw,80px);--kit-pad:clamp(18px,3vw,28px)}:root[data-dna-density=dense]{--kit-review-max:920px;--kit-summary-fr:1.3fr;--kit-gap:clamp(20px,3vw,40px);--kit-pad:clamp(14px,2vw,20px)}',
    ':root[data-dna-review] .checkout-review__summary{box-sizing:border-box;padding:var(--kit-pad,clamp(18px,3vw,28px));border:var(--kit-border) solid var(--kit-line);border-radius:var(--kit-radius-panel);background:var(--kit-surface)}',
    ':root[data-dna-review=split] .checkout-review{grid-template-columns:minmax(260px,var(--kit-summary-fr,1fr)) minmax(0,1.35fr);gap:var(--kit-gap,clamp(32px,6vw,96px))}:root[data-dna-review=split] .checkout-review__summary{position:sticky;top:24px}',
    ':root[data-dna-review=stacked] .checkout-review{grid-template-columns:minmax(0,1fr);max-width:var(--kit-review-max,760px);margin-inline:auto;gap:var(--kit-gap,32px)}:root[data-dna-review=stacked] .checkout-review__summary{box-shadow:0 18px 40px -30px #0007}',
    ':root[data-dna-review=ticket] .checkout-review{grid-template-columns:minmax(0,1.35fr) minmax(260px,var(--kit-summary-fr,.9fr));gap:var(--kit-gap,clamp(32px,6vw,96px))}:root[data-dna-review=ticket] .checkout-review__fields{grid-column:1;grid-row:1}',
    ':root[data-dna-review=ticket] .checkout-review__summary{grid-column:2;grid-row:1;position:sticky;top:24px;padding-bottom:40px;border:1.5px dashed color-mix(in srgb,var(--kit-ink) 35%,transparent);border-bottom:0;border-radius:var(--kit-radius) var(--kit-radius) 0 0;background:var(--kit-paper);font-variant-numeric:tabular-nums;-webkit-mask:radial-gradient(circle at 9px 100%,#0000 6px,#000 6.5px) 0 0/18px 100%;mask:radial-gradient(circle at 9px 100%,#0000 6px,#000 6.5px) 0 0/18px 100%;box-shadow:0 1px 0 color-mix(in srgb,var(--kit-ink) 8%,transparent)}',
    ':root[data-dna-review=ticket] .checkout-review__summary h2{text-transform:uppercase;letter-spacing:.14em;font-size:max(13px,.8em)}',
    ':root[data-dna-review=notebook] .checkout-review{grid-template-columns:minmax(0,var(--kit-summary-fr,.85fr)) minmax(0,1.15fr);gap:var(--kit-gap,clamp(28px,5vw,72px))}',
    ':root[data-dna-review=notebook] .checkout-review__summary{padding-left:32px;border:0;border-left:3px double color-mix(in srgb,var(--kit-accent) 70%,transparent);border-radius:0;background:repeating-linear-gradient(var(--kit-paper) 0 31px,color-mix(in srgb,var(--kit-accent) 22%,var(--kit-paper)) 31px 32px)}',
    ':root[data-dna-review=notebook] .checkout-review__summary .order-item{border-bottom-style:dotted}',
    '@media(max-width:700px){:root[data-dna-review] .checkout-review{grid-template-columns:minmax(0,1fr)}:root[data-dna-review] :is(.checkout-review__summary,.checkout-review__fields){grid-column:auto;grid-row:auto;position:static}}',
    '@container(max-width:700px){:root[data-dna-review] .checkout-review{grid-template-columns:minmax(0,1fr)}:root[data-dna-review] :is(.checkout-review__summary,.checkout-review__fields){grid-column:auto;grid-row:auto;position:static}}',
    /* Catalog cards: framing, and how the card previews the product (hover, keyboard focus, long press on touch). */
    ':root[data-dna-frame=bleed]{--kit-photo-round:min(var(--kit-radius),28px)}:root[data-dna-frame=inset]{--kit-photo-round:min(var(--kit-radius),24px)}:root[data-dna-frame=rounded]{--kit-photo-round:18px}:root[data-dna-frame=arch]{--kit-photo-round:50% 50% 8px 8px / 42% 42% 8px 8px}:root[data-dna-frame=polaroid]{--kit-photo-round:2px}',
    ':root[data-dna-frame=blob]{--kit-photo-round:58% 42% 55% 45% / 45% 55% 45% 55%}:root[data-dna-frame=stamp]{--kit-photo-round:0px}:root[data-dna-frame=tape]{--kit-photo-round:2px}',
    ':root[data-dna-frame] .menu-item :is(.menu-item__image,.menu-item__image-alt){box-sizing:border-box;border-radius:var(--kit-photo-radius);padding:var(--kit-photo-pad);background-color:var(--kit-photo-bg);box-shadow:var(--kit-photo-shadow)}',
    `:root[data-dna-frame=stamp] ${FRAMED_PHOTOS}{-webkit-mask:${STAMP_MASK};mask:${STAMP_MASK}}`,
    `:root[data-dna-frame=tape] ${FRAMED_PHOTOS}{background-image:${TAPE_CORNERS};background-repeat:no-repeat;background-size:30px 30px;background-position:0 0,100% 0,0 100%,100% 100%}`,
    ':root[data-dna-card=second-photo] .menu-item__image-alt{position:absolute;z-index:0;top:0;left:0;width:100%;height:auto;object-fit:cover;opacity:0;pointer-events:none;transition:opacity var(--motion-base,320ms) var(--kit-ease)}',
    '@media(hover:hover){:root[data-dna-card=second-photo] .menu-item:hover .menu-item__image-alt{opacity:1}}:root[data-dna-card=second-photo] .menu-item:is(:focus-within,[data-previewing]) .menu-item__image-alt{opacity:1}',
    ':root[data-dna-card=swatch-swap] .menu-item__swatches{position:relative;z-index:2;display:flex;flex-wrap:wrap;gap:4px;margin:4px 0 0}',
    ':root[data-dna-card=swatch-swap] .menu-item__swatches button{display:grid;place-items:center;width:36px;height:36px;min-height:0;margin:0;padding:0;border:0;border-radius:50%;background:none;color:inherit;cursor:pointer}',
    ':root[data-dna-card=swatch-swap] .menu-item__swatches span{display:block;width:22px;height:22px;overflow:hidden;border-radius:50%;background:var(--swatch,transparent);box-shadow:inset 0 0 0 1px color-mix(in srgb,currentColor 28%,transparent)}:root[data-dna-card=swatch-swap] .menu-item__swatches img{display:block;width:100%;height:100%;object-fit:cover}',
    ':root[data-dna-card=swatch-swap] .menu-item__swatches button[aria-pressed=true] span{box-shadow:0 0 0 2px var(--kit-paper),0 0 0 3.5px currentColor}:root[data-dna-card=swatch-swap] .menu-item__swatches button:focus-visible{outline:2px solid currentColor;outline-offset:1px}',
    ':root[data-dna-card=zoom] .menu-item__image{clip-path:inset(0 round var(--kit-photo-round,0px));transition:transform var(--motion-slow,600ms) var(--motion-ease,var(--kit-ease)),clip-path var(--motion-slow,600ms) var(--kit-ease)}',
    '@media(hover:hover){:root[data-dna-card=zoom] .menu-item:hover .menu-item__image{transform:scale(1.08);clip-path:inset(3.7% round var(--kit-photo-round,0px))}}:root[data-dna-card=zoom] .menu-item:focus-within .menu-item__image{transform:scale(1.08);clip-path:inset(3.7% round var(--kit-photo-round,0px))}',
    ':root[data-dna-card=quick-look] .menu-item__quick-look{position:absolute;z-index:3;top:calc(var(--look-top,0px) + 10px);left:calc(var(--look-left,100%) - 10px);right:auto;min-height:36px;margin:0;padding:6px 14px;border:1px solid var(--kit-line);border-radius:999px;background:var(--kit-paper);color:var(--kit-ink);font:inherit;font-size:13px;line-height:1.2;cursor:pointer;opacity:0;transform:translate(-100%,-4px);transition:opacity var(--motion-fast,200ms) var(--kit-ease),transform var(--motion-fast,200ms) var(--motion-ease,var(--kit-ease))}',
    '@media(hover:hover){:root[data-dna-card=quick-look] .menu-item:hover .menu-item__quick-look{opacity:1;transform:translateX(-100%)}}:root[data-dna-card=quick-look] .menu-item:focus-within .menu-item__quick-look{opacity:1;transform:translateX(-100%)}@media(hover:none){:root[data-dna-card=quick-look] .menu-item__quick-look{opacity:1;transform:translateX(-100%)}}',
    ':root[data-dna-card=quick-look] .menu-item__quick-look:focus-visible{outline:3px solid currentColor;outline-offset:2px}',
    ':root[data-dna-card=tilt] .menu-item{transition:transform var(--motion-fast,240ms) var(--kit-ease)}:root[data-dna-card=tilt] .menu-item[data-tilting]{transform:perspective(900px) rotateX(var(--card-tilt-y,0deg)) rotateY(var(--card-tilt-x,0deg))}',
  ];
  const DNA_REDUCED_MOTION = `@media(prefers-reduced-motion:reduce){:root[data-dna-button] ${KIT_BUTTONS},:root[data-dna-cart] .cart-drawer,:root[data-dna-added] .cart-added,:root[data-dna-card] .menu-item,:root[data-dna-card] .menu-item :is(.menu-item__image,.menu-item__image-alt,.menu-item__quick-look){transition:none}:root[data-dna-card=tilt] .menu-item[data-tilting]{transform:none}}`;
  /* Product card DNA (theme plan): each value keys on :root[data-dna-*], so a store without these values renders as before.
   * Only cosmetic parts change; price, stock, option state, quantity and the buy button are never restyled here. */
  const PC = '[data-pagosya-product][data-style]';
  const PRODUCT_CARD_CSS = [
    /* swatch: shape of the option choices. Every shape keeps a 44px target and the same aria-pressed state. */
    `:root[data-dna-swatch=circle] ${PC} .product-detail__swatch{border-radius:50%}:root[data-dna-swatch=circle] ${PC} .product-detail__values:not([data-kind=swatch]) [data-product-option]{min-width:44px;min-height:44px;padding:8px 12px;border-radius:999px}`,
    `:root[data-dna-swatch=square] ${PC} .product-detail__swatch{border-radius:3px}:root[data-dna-swatch=square] ${PC} [data-product-option]{border-radius:2px}:root[data-dna-swatch=square] ${PC} [data-kind=swatch] [data-product-option]{border-radius:0}`,
    `:root[data-dna-swatch=label] ${PC} .product-detail__swatch{display:none}:root[data-dna-swatch=label] ${PC} [data-product-option],:root[data-dna-swatch=label] ${PC} [data-product-option][aria-pressed=true]{min-width:44px;min-height:44px;padding:6px 4px;border:0;border-radius:0;box-shadow:none;background:none;text-decoration:underline;text-decoration-color:transparent;text-underline-offset:7px;text-decoration-thickness:2px}`,
    `:root[data-dna-swatch=label] ${PC} [data-product-option][aria-pressed=true]{text-decoration-color:currentColor;color:var(--pd-ink)}:root[data-dna-swatch=label] ${PC} [data-kind=swatch] .product-detail__option-label{position:static;width:auto;height:auto;overflow:visible;clip-path:none;white-space:normal}`,
    `:root[data-dna-swatch=photo] ${PC} .product-detail__swatch-photo{display:block;width:52px;height:52px;flex:0 0 auto;overflow:hidden;border-radius:var(--pd-radius,8px);box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--pd-ink) 15%,transparent)}:root[data-dna-swatch=photo] ${PC} .product-detail__swatch-photo img{display:block;width:100%;height:100%;object-fit:cover}`,
    `:root[data-dna-swatch=photo] ${PC} [data-product-option]:has(.product-detail__swatch-photo){flex-direction:column;min-width:0;min-height:0;padding:0;border:0;border-radius:0;box-shadow:none;background:none;font-size:11px}:root[data-dna-swatch=photo] ${PC} [aria-pressed=true] .product-detail__swatch-photo{box-shadow:0 0 0 2px var(--pd-paper),0 0 0 3.5px var(--pd-ink)}`,
    /* gallery: rail is today's layout. strip puts the thumbnails in a row under the photo; stack and mosaic show every photo. */
    `:root[data-dna-gallery=strip] ${PC} .product-detail__thumbnails{position:static;display:flex;flex-direction:row;flex-wrap:nowrap;gap:8px;margin-top:10px;overflow-x:auto}:root[data-dna-gallery=strip] ${PC} .product-detail__thumbnails button{flex:0 0 64px;width:64px;height:64px}:root[data-dna-gallery=strip] ${PC} .product-detail__thumbnails img{display:block;width:100%;height:100%;object-fit:cover}`,
    `:root[data-dna-gallery=stack] ${PC} .product-detail__stage,:root[data-dna-gallery=mosaic] ${PC} .product-detail__stage{display:none}:root[data-dna-gallery=stack] ${PC} .product-detail__gallery,:root[data-dna-gallery=mosaic] ${PC} .product-detail__gallery{position:relative}`,
    `:root[data-dna-gallery=stack] ${PC} .product-detail__stack{display:grid;gap:12px}:root[data-dna-gallery=stack] ${PC} .product-detail__stack img{display:block;width:100%;height:auto}`,
    `:root[data-dna-gallery=mosaic] ${PC} .product-detail__stack{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}:root[data-dna-gallery=mosaic] ${PC} .product-detail__stack img{display:block;width:100%;height:100%;object-fit:cover}:root[data-dna-gallery=mosaic] ${PC} .product-detail__stack img:first-child{grid-column:1/-1}`,
    /* blocks: the frame around each content block. */
    `:root[data-dna-blocks=card] ${PC} .product-detail__block{padding:14px;border:1px solid var(--pd-line);border-radius:var(--pd-radius,10px);background:var(--pd-surface,var(--pd-paper));box-shadow:0 6px 18px -12px color-mix(in srgb,var(--pd-ink) 45%,transparent)}`,
    `:root[data-dna-blocks=outline] ${PC} .product-detail__block{padding:12px;border:1.5px solid var(--pd-ink);border-radius:0}`,
    `:root[data-dna-blocks=tape] ${PC} .product-detail__block{position:relative;padding:16px 14px 12px;border:1px solid var(--pd-line);background:var(--pd-surface,var(--pd-paper))}:root[data-dna-blocks=tape] ${PC} .product-detail__block::before{content:"";position:absolute;top:-9px;left:50%;width:72px;height:18px;transform:translateX(-50%) rotate(-2deg);background:color-mix(in srgb,var(--pd-ink) 14%,transparent)}`,
    `:root[data-dna-blocks=ticket] ${PC} .product-detail__block{padding:16px;border:1.5px solid var(--pd-ink);border-radius:8px;outline:1px dashed var(--pd-line);outline-offset:-8px}`,
    /* divider: the rule that opens the blocks section. */
    `:root[data-dna-divider=hairline] ${PC} .product-detail__blocks{margin-top:32px;padding-top:24px;border-top:1px solid var(--pd-line)}`,
    `:root[data-dna-divider=dashed] ${PC} .product-detail__blocks{margin-top:32px;padding-top:24px;border-top:1.5px dashed var(--pd-ink)}`,
    `:root[data-dna-divider=bold] ${PC} .product-detail__blocks{margin-top:32px;padding-top:24px;border-top:3px solid var(--pd-ink)}`,
    /* enter: entrance of the cosmetic parts, only when the shopper allows motion. */
    `@media(prefers-reduced-motion:no-preference){@keyframes pd-enter-fade-up{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:none}}@keyframes pd-enter-slide{from{opacity:0;transform:translateX(-22px)}to{opacity:1;transform:none}}@keyframes pd-enter-pop{from{opacity:0;transform:scale(.94)}to{opacity:1;transform:none}}`
      + [['fade-up'], ['slide'], ['pop']].map(([name]) => `:root[data-dna-enter=${name}] ${PC} :is([data-part=gallery],[data-part=eyebrow],[data-part=title],[data-part=intro],[data-part=highlights],[data-part=blocks]){animation:pd-enter-${name} var(--motion-slow,520ms) var(--motion-ease-settle,ease) both}`).join('') + '}',
  ];
  // Fields: checkout's .order-field controls and the account inputs; checkboxes and radios (terms, delivery choice) keep their look.
  const DRAWN_FIELD = ':is([data-pagosya-checkout] .order-field :is(input,select,textarea),[data-pagosya-cart][data-checkout-review] .order-field :is(input,select,textarea),[data-account-gate] [data-part=input])';
  const DRAWN_TEXT_FIELD = `${DRAWN_FIELD}:not([type=checkbox],[type=radio])`;
  const COMMERCE_DRAW_CSS = [
    `:root[data-dna-fields] ${DRAWN_TEXT_FIELD}{box-sizing:border-box;min-height:48px;font:inherit;color:var(--kit-ink)}`,
    `:root[data-dna-fields] ${DRAWN_FIELD}:focus-visible{outline:2px solid var(--kit-accent);outline-offset:2px}`,
    `:root[data-dna-fields=boxed] ${DRAWN_TEXT_FIELD}{border:1px solid var(--kit-line);border-radius:var(--kit-radius);background:var(--kit-paper);padding:0 14px}`,
    `:root[data-dna-fields=underline] ${DRAWN_TEXT_FIELD}{border:0;border-bottom:2px solid color-mix(in srgb,var(--kit-ink) 55%,var(--kit-paper));border-radius:0;background:transparent;padding:0 2px}`,
    `:root[data-dna-fields=filled] ${DRAWN_TEXT_FIELD}{border:0;border-bottom:2px solid color-mix(in srgb,var(--kit-ink) 40%,var(--kit-paper));border-radius:var(--kit-radius) var(--kit-radius) 0 0;background:color-mix(in srgb,var(--kit-ink) 7%,var(--kit-paper));padding:0 14px}`,
    `:root[data-dna-fields=filled] ${DRAWN_TEXT_FIELD}:focus{border-bottom-color:var(--kit-accent)}`,
    `:root[data-dna-fields=pill] ${DRAWN_TEXT_FIELD}{border:1.5px solid var(--kit-line);border-radius:999px;background:var(--kit-paper);padding:0 18px}`,
    `:root[data-dna-fields] ${DRAWN_FIELD}:is(textarea){min-height:96px;padding-block:12px}:root[data-dna-fields=pill] ${DRAWN_FIELD}:is(textarea){border-radius:22px}`,
    // Steps numbers the review's sections; ticket tears the summary's bottom edge; brand sets a panel beside the page.
    ':root[data-dna-checkout=steps] .checkout-review{counter-reset:checkout-step}',
    ':root[data-dna-checkout=steps] :is(.checkout-review__summary,.checkout-review__fields)>h2::before{counter-increment:checkout-step;content:counter(checkout-step);display:inline-grid;place-items:center;width:1.7em;height:1.7em;margin-right:.5em;border-radius:50%;background:var(--kit-accent);color:var(--kit-on-accent);font-size:.8em;vertical-align:.1em}',
    ':root[data-dna-checkout=ticket] .checkout-review__summary{font-variant-numeric:tabular-nums;-webkit-mask:linear-gradient(black 0 0) top/100% calc(100% - 10px) no-repeat,conic-gradient(from -45deg at bottom,transparent,black 1deg 89deg,transparent 90deg) bottom/20px 10px repeat-x;mask:linear-gradient(black 0 0) top/100% calc(100% - 10px) no-repeat,conic-gradient(from -45deg at bottom,transparent,black 1deg 89deg,transparent 90deg) bottom/20px 10px repeat-x}',
    // The panel sits beside .checkout-page__inner, never inside it: the inner block stays the container the review measures.
    '@media(min-width:1100px){:root[data-dna-checkout=brand] [data-pagosya-checkout]:not([hidden]){display:grid;grid-template-columns:minmax(200px,.36fr) minmax(0,1fr);column-gap:clamp(24px,4vw,56px);align-items:start}:root[data-dna-checkout=brand] [data-pagosya-checkout]:not([hidden])::before{content:"";grid-column:1;grid-row:1;align-self:stretch;min-height:min(70vh,640px);border-radius:var(--kit-radius-panel);background:var(--checkout-panel,color-mix(in srgb,var(--kit-accent) 82%,var(--kit-paper)))}:root[data-dna-checkout=brand] [data-pagosya-checkout]:not([hidden])>.checkout-page__inner{grid-column:2;grid-row:1;width:100%;min-width:0;margin:0}:root[data-dna-checkout=brand] [data-pagosya-checkout] .checkout-review{margin-inline:0}}',
  ].join('\n');
  const DNA_PAGE_CSS = [
    ...PRODUCT_CARD_CSS,
    ...dnaButtonRules(PAGE_BUTTONS, PAGE_STEPPERS), ...dnaIdentityButtonRules(PAGE_BUTTONS),
    ':root[data-dna-button=split] [data-pagosya-product][data-style] .product-detail__buy{display:flex;justify-content:space-between;gap:0}',
    '@media(min-width:481px){:root[data-dna-button=split] [data-pagosya-product][data-style] .product-detail__buy-total:not(:empty){display:inline-block;margin-left:1em;padding-left:1em;border-left:1px solid color-mix(in srgb,currentColor 45%,transparent)}:root[data-dna-button=split] [data-pagosya-product][data-style=dense] .product-detail__buy-total:not(:empty)::before{content:none}}',
  ];
  /* One look per store (spec 2026-10-14). Unlayered, after the DNA styles, before YAPI's guarded CSS: the measured look wins
   * over drawn DNA and YAPI's touches win over both. Colours stay the store's own; protected controls are never selected. */
  const LOOK_FILTERED = ':where(:root:is([data-look-photo=mono],[data-look-photo=sepia],[data-look-photo=duotone],[data-look-photo=grain]))';
  // `caseTarget`: where case and italic go when it differs from `target` (the product title: a preset or YAPI touch styles its
  // case on [data-part=title], which must win over the look, while the kit sets no case of its own there).
  const lookHeadingRules = (target, caseTarget = target) => [
    `:where(:root[data-look-hf]) ${target}{font-family:var(--lk-hf)}`,
    `:where(:root[data-look-hw]) ${target}{font-weight:var(--lk-hw)}`,
    `:where(:root[data-look-hc=upper]) ${caseTarget}{text-transform:uppercase}`,
    `:where(:root[data-look-hc=none]) ${caseTarget}{text-transform:none}`,
    `:where(:root[data-look-ht]) ${target}{letter-spacing:var(--lk-ht)}`,
    `:where(:root[data-look-hi]) ${caseTarget}{font-style:italic}`,
  ];
  const LOOK_BASE_CSS = [
    ':root[data-look]{--lk-ink:var(--store-foreground,var(--brand-foreground,var(--ink,#20211d)));--lk-paper:var(--store-background,var(--brand-background,var(--paper,#fff)));--lk-line:var(--store-border,var(--brand-border,color-mix(in srgb,var(--lk-ink) 16%,var(--lk-paper))))}',
    ':root[data-look-edge=hairline]{--lk-edge:0 0 0 1px var(--lk-line)}:root[data-look-edge=outline]{--lk-edge:0 0 0 2px var(--lk-ink)}:root[data-look-edge=offset]{--lk-edge:5px 5px 0 var(--lk-ink)}:root[data-look-edge=soft]{--lk-edge:0 14px 34px -16px color-mix(in srgb,var(--lk-ink) 55%,transparent)}',
    ':root[data-look-photo=mono]{--lk-filter:grayscale(1)}:root[data-look-photo=sepia]{--lk-filter:sepia(.65) saturate(.85)}:root[data-look-photo=duotone]{--lk-filter:url(#pagosya-look-duotone)}:root[data-look-photo=grain]{--lk-filter:url(#pagosya-look-grain);--lk-grain:url(#pagosya-look-grain)}',
  ];
  const LPC = '[data-pagosya-product][data-style]';
  const LOOK_CHIPS = `${LPC} .product-detail__values:not([data-kind=swatch]) [data-product-option]`;
  const LOOK_PDP_CSS = [
    ...lookHeadingRules(`${LPC} #pagosya-product-title`, `${LPC} [data-part=title]`),
    `:where(:root[data-look-label]) :is(${LPC} [data-part=eyebrow],${LPC} .product-detail__options legend,${LPC} .product-tabs [role=tab],${LPC} .product-detail__badge){text-transform:uppercase;letter-spacing:var(--lk-lt);font-weight:var(--lk-lw)}`,
    `:root[data-look-rc] [data-pagosya-product]{--pd-radius:var(--lk-rc)}`,
    `:where(:root[data-look-rp]) ${LPC} :is(.product-detail__photo,.product-detail__stack img,.product-detail__related img){border-radius:var(--lk-rp)}`,
    `:where(:root[data-look-rp]) ${LPC} .product-detail__stage{border-radius:var(--lk-rp);overflow:hidden}`,
    `:where(:root[data-look-rb]) :is(${LOOK_CHIPS},${LPC} .product-detail__badge,${LPC} .product-detail__navigation button,${LPC} .product-detail__navigation span){border-radius:var(--lk-rb)}`,
    `:where(:root[data-look]) ${LPC} :is(.product-detail__navigation button,.product-detail__navigation span){background:var(--pd-paper);color:var(--pd-ink)}`,
    `:where(:root[data-look-edge]:not([data-look-edge=none])) ${LPC} .product-detail__stage{box-shadow:var(--lk-edge)}`,
    `:where(:root[data-look-edge]:not([data-look-edge=none])) ${LPC} .product-detail__related img{box-shadow:var(--lk-edge)}`,
    `:where(:root[data-look-edge]:not([data-look-edge=none])) ${LPC}[data-style=dense] .product-detail__buybox{border-color:transparent;box-shadow:var(--lk-edge)}`,
    `:where(:root:is([data-look-edge=outline],[data-look-edge=offset]):not([data-dna-swatch=label])) ${LOOK_CHIPS}{box-shadow:var(--lk-edge)}`,
    `:where(:root:is([data-look-edge=outline],[data-look-edge=offset]):not([data-dna-swatch=label])) ${LOOK_CHIPS}[aria-pressed=true]{box-shadow:var(--lk-edge),inset 0 0 0 2px var(--pd-ink)}`,
    `${LOOK_FILTERED} ${LPC} :is(.product-detail__thumbnails img,.product-detail__related img){filter:var(--lk-filter);transition:filter .25s}`,
    `${LOOK_FILTERED} ${LPC} :is(.product-detail__thumbnails button:is(:hover,:focus-visible) img,.product-detail__related li:is(:hover,:focus-within) img){filter:none}`,
    `:where(:root[data-look-photo=grain]) ${LPC} :is(.product-detail__photo,.product-detail__stack img){filter:var(--lk-grain)}`,
    `:where(:root[data-look-photo=polaroid]) ${LPC} .product-detail__stage{padding:12px 12px 40px;background:#fff;box-shadow:0 10px 26px -14px #0007}`,
    `:where(:root[data-look-aspect]) ${LPC} .product-detail__related img{aspect-ratio:var(--lk-aspect)}`,
    `:where(:root[data-look-aspect]) ${LPC}[data-style=dense][data-pagosya-product-page] .product-detail__photo{aspect-ratio:var(--lk-aspect);background:var(--pd-paper)}`,
    `:where(:root[data-look-surface=banded]) ${LPC} .product-detail__related{--pd-ink:var(--lk-paper);--pd-paper:var(--lk-ink);--pd-muted:color-mix(in srgb,var(--pd-ink) 70%,var(--pd-paper));--pd-line:color-mix(in srgb,var(--pd-ink) 22%,var(--pd-paper));--pd-tint:color-mix(in srgb,var(--pd-ink) 10%,var(--pd-paper));background:var(--pd-paper);color:var(--pd-ink);padding:clamp(28px,5vw,64px) clamp(16px,4vw,48px)}`,
    `:where(:root[data-look-surface=tinted]) ${LPC} .product-detail__related{background:var(--pd-tint);padding:clamp(28px,5vw,64px) clamp(16px,4vw,48px)}`,
  ];
  /* Cards, catalog and cart. Only the kit's own cards: a YAPI-authored card ([data-custom-product]) is already the store's look. */
  const LKC = '[data-pagosya-catalog] .menu-item:not([data-custom-product])';
  const LOOK_CART_PHOTO = '.cart-drawer .order-item__photo';
  const LOOK_CARD_PHOTOS = `${LKC} :is(.menu-item__image,.menu-item__image-alt)`;
  const LOOK_EDGED = ':where(:root[data-look-edge]:not([data-look-edge=none]))';
  const LOOK_SURFACE_CSS = [
    ...lookHeadingRules(`:is(.commerce-page-title,[data-pagosya-catalog] .catalog-group__title,${LKC} .menu-item__copy h3,.cart-drawer__header h2)`),
    `:where(:root[data-look-label]) :is([data-pagosya-catalog] .catalog-tabs a,${LKC} .menu-item__badge){text-transform:uppercase;letter-spacing:var(--lk-lt);font-weight:var(--lk-lw)}`,
    `:root[data-look-rp]{--kit-photo-radius:var(--lk-rp)}`,
    `:where(:root[data-look-rp]) :is(${LOOK_CARD_PHOTOS},${LOOK_CART_PHOTO}){border-radius:var(--lk-rp)}`,
    `:where(:root[data-look-rc]) ${LKC}{border-radius:var(--lk-rc)}`,
    `:where(:root[data-look-rb]) :is([data-pagosya-catalog] .catalog-tabs a,${LKC} .menu-item__badge){border-radius:var(--lk-rb)}`,
    `${LOOK_EDGED} :is(${LKC} .menu-item__image,${LOOK_CART_PHOTO}){box-shadow:var(--lk-edge)}`,
    `${LOOK_FILTERED} :is(${LOOK_CARD_PHOTOS},${LOOK_CART_PHOTO}){filter:var(--lk-filter)}`,
    `@media(hover:hover){${LOOK_FILTERED} ${LKC}:hover :is(.menu-item__image,.menu-item__image-alt){filter:none}}`,
    `${LOOK_FILTERED} ${LKC}:focus-within :is(.menu-item__image,.menu-item__image-alt){filter:none}`,
    `:where(:root[data-look-photo=polaroid]) :is(${LKC} .menu-item__image,${LOOK_CART_PHOTO}){box-sizing:border-box;padding:6px 6px 20px;background:#fff;box-shadow:0 6px 18px -8px #0006;border-radius:2px}`,
    `:where(:root[data-look-photo=tight]) ${LKC} .menu-item__image{object-view-box:inset(10%)}`,
    `:where(:root[data-look-aspect]) ${LKC} .menu-item__image{aspect-ratio:var(--lk-aspect)}`,
    `:where(:root[data-look-tilt]) ${LKC}:nth-child(odd) .menu-item__image{rotate:calc(var(--lk-tilt) * -1)}`,
    `:where(:root[data-look-tilt]) ${LKC}:nth-child(even) .menu-item__image{rotate:var(--lk-tilt)}`,
  ];
  if (hasDna) {
    const dnaStyle = document.createElement('style');
    dnaStyle.dataset.pagosyaKit = 'dna';
    // Every variant sits in the pagosya-dna layer: above the kit defaults, below the store's own (unlayered) CSS.
    dnaStyle.textContent = `@layer pagosya-dna {\n${[...DNA_CSS, DNA_REDUCED_MOTION].join('\n')}\n}\n${DNA_PAGE_CSS.join('\n')}`;
    document.head.append(dnaStyle);
    // Drawn checkout layout and field style (spec 2026-10-11 commerce surfaces), unlayered like DNA_PAGE_CSS. The field rules
    // out-rank the account CSS by specificity (it is appended later, on demand), so order does not matter. Only with a draw.
    if (document.documentElement.hasAttribute('data-dna-checkout') || document.documentElement.hasAttribute('data-dna-fields')) {
      const drawStyle = document.createElement('style');
      drawStyle.dataset.pagosyaKit = 'commerce-draw';
      drawStyle.textContent = COMMERCE_DRAW_CSS;
      document.head.append(drawStyle);
    }
  }
  if (LOOK) {
    const lookStyle = document.createElement('style');
    lookStyle.dataset.pagosyaKit = 'look';
    lookStyle.textContent = [...LOOK_BASE_CSS, ...LOOK_PDP_CSS, ...LOOK_SURFACE_CSS].join('\n');
    document.head.append(lookStyle);
    lookFilters();
  }
  /* YAPI's guarded CSS: the API sanitized it (product-theme-css.ts) before it reached config.dna. This check is defence in
   * depth only, a coarse refusal of what the sanitizer never emits; it does not re-implement the sanitizer. It goes after
   * the kit's own styles and the look, so an equally specific theme rule wins. */
  const THEME_CSS_KEYS = [['productCss', 'product-theme'], ['catalogCss', 'catalog-theme'], ['cardCss', 'card-theme'], ['cartCss', 'cart-theme']];
  if (hasDna) for (const [key, name] of THEME_CSS_KEYS) {
    const themeCss = config.dna[key];
    if (typeof themeCss === 'string' && themeCss && themeCss.length <= 16000 && !/@\s*import|url\s*\(|expression\s*\(|<|\\|position\s*:\s*fixed|pointer-events|!\s*important/i.test(themeCss)) {
      const themeStyle = document.createElement('style');
      themeStyle.dataset.pagosyaKit = name;
      themeStyle.textContent = themeCss;
      document.head.append(themeStyle);
    }
  }
