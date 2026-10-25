  const variantPhotos = v => (Array.isArray(v?.imageUrls) && v.imageUrls.length ? v.imageUrls : [v?.imageUrl]).map(safeUrl).filter(Boolean);
  const galleryImages = (p) => {
    const sources = [
      ...(Array.isArray(p?.imageUrls) ? p.imageUrls : []),
      ...(typeof p?.imageUrl === "string" ? [p.imageUrl] : []),
      ...(Array.isArray(p?.variants) ? p.variants.flatMap(variantPhotos) : []),
    ];
    return [...new Set(sources.map(safeUrl).filter(Boolean))];
  };
  const imagePosition = (p, url) => {
    const index = (Array.isArray(p.imageUrls) ? p.imageUrls : []).findIndex(value => safeUrl(value) === url);
    const value = index >= 0 ? p.imagePositions?.[index] : null;
    return typeof value === 'string' && /^(?:100|[0-9]{1,2})(?:\.\d+)?% (?:100|[0-9]{1,2})(?:\.\d+)?%$/.test(value) ? value : '50% 50%';
  };
  const detailStyle = document.createElement("style");
  detailStyle.dataset.pagosyaKit = 'product';
  // Cascade order (sub-project 5 review): kit defaults < the store's DNA < the store's own CSS, which is unlayered
  // and therefore wins over both. The contact base sits under the DNA so the DNA button form reaches its submit.
  detailStyle.textContent = `
    @layer pagosya-commerce, pagosya-contact-base, pagosya-dna;
    .menu-item__badge{position:absolute;top:10px;left:10px;z-index:2;max-width:calc(100% - 20px);padding:4px 10px;border-radius:999px;background:var(--store-accent,var(--brand-accent,var(--accent,#111)));color:var(--store-accent-foreground,var(--brand-accent-foreground,#fff));font-size:12px;font-weight:600;line-height:1.25;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;pointer-events:none}
    .menu-item{position:relative}.menu-item:not([data-custom-product]) .menu-item__details{position:absolute;inset:0;z-index:1;width:100%;height:100%;margin:0;padding:0;border:0;border-radius:inherit;background:transparent;box-shadow:none;cursor:pointer;color:inherit}
    .menu-item .menu-item__details:focus-visible{outline:3px solid currentColor;outline-offset:-4px}.menu-item:not([data-custom-product]) .menu-add{position:relative;inset:auto;z-index:2}
    [data-pagosya-categories][hidden],[data-product-field][hidden],[data-product-media][hidden],[data-product-link][hidden],[data-pagosya-cart][hidden]{display:none!important}
    [data-cart-slot][hidden],[data-cart-field][hidden],[data-added-field][hidden]{display:none!important}
    [data-pagosya-status]:empty{width:0!important;height:0!important;min-width:0!important;min-height:0!important;margin:0!important;padding:0!important;border:0!important;overflow:hidden!important;box-shadow:none!important}
    /* Default catalog cards: framed photos and a photo grid when the store's CSS leaves them unstyled. Authored rules still win. */
    @layer pagosya-commerce {
      .menu-item:not([data-custom-product]) button.menu-add[data-product]{width:auto;height:auto;min-width:44px;min-height:44px;padding:10px 14px;border-radius:var(--store-radius,var(--brand-radius,0px));font:inherit}
      .menu-item__original{margin-inline-start:.15em;font-size:.82em;font-weight:400;opacity:.7;white-space:nowrap}
      .menu-item:not([data-custom-product]) .menu-item__image{display:block;width:100%;height:auto;aspect-ratio:4/5;object-fit:cover}
      [data-pagosya-catalog][data-pagosya-grid],[data-pagosya-catalog] .catalog-group__items{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,220px),1fr));gap:16px;align-items:stretch}
      [data-pagosya-grid]>.menu-item:not([data-custom-product]),[data-pagosya-catalog] .catalog-group__items>.menu-item:not([data-custom-product]){display:flex;flex-direction:column;gap:8px}
      [data-pagosya-grid]>.menu-item:not([data-custom-product]) .menu-item__copy :is(h3,p),[data-pagosya-catalog] .catalog-group__items>.menu-item:not([data-custom-product]) .menu-item__copy :is(h3,p){margin:0}
      [data-pagosya-grid]>.menu-item:not([data-custom-product]) .menu-item__copy p,[data-pagosya-catalog] .catalog-group__items>.menu-item:not([data-custom-product]) .menu-item__copy p{margin-top:2px;opacity:.8}
      /* A card's size never depends on its copy: descriptions stop at a fixed line count and price and action sit on the card's bottom edge, so a row of cards stays even. */
      .menu-item:not([data-custom-product]) .menu-item__copy p,.menu-item[data-custom-product] .menu-item__description{display:-webkit-box;-webkit-line-clamp:var(--pagosya-description-lines,2);line-clamp:var(--pagosya-description-lines,2);-webkit-box-orient:vertical;overflow:hidden;overflow-wrap:anywhere}
      [data-pagosya-grid]>.menu-item:not([data-custom-product]) .menu-item__copy,[data-pagosya-catalog] .catalog-group__items>.menu-item:not([data-custom-product]) .menu-item__copy{flex:1 1 auto}
      [data-pagosya-grid]>.menu-item:not([data-custom-product]) .menu-add,[data-pagosya-catalog] .catalog-group__items>.menu-item:not([data-custom-product]) .menu-add{align-self:flex-start}
      /* Arrangement chrome: group headings, the "see all" link, and the collection tab row. */
      [data-pagosya-catalog] .catalog-group__title{margin:24px 0 12px;font-family:var(--store-heading-font,var(--brand-heading-font,var(--font-heading,inherit)));font-size:1.05rem}
      [data-pagosya-catalog] .catalog-group:first-child .catalog-group__title{margin-top:0}
      [data-pagosya-catalog] .catalog-more{display:inline-block;padding:12px 0;text-decoration:underline}
      [data-pagosya-catalog] .catalog-tabs{display:flex;flex-wrap:wrap;gap:12px;margin:0 0 16px}
      [data-pagosya-catalog] .catalog-tabs a[aria-current="page"]{text-decoration:none}
    }
    /* Product page: shared commerce DOM; style selects a presentation and stores supply tokens. */
    [data-pagosya-product]{--pd-ink:var(--store-foreground,var(--brand-foreground,var(--ink,#302c2a)));--pd-paper:var(--store-background,var(--brand-background,var(--paper,#fffdfb)));--pd-surface:var(--store-surface,var(--brand-surface,var(--pd-paper)));--pd-accent:var(--store-accent,var(--brand-accent,var(--accent,var(--pd-ink))));--pd-on-accent:var(--store-accent-foreground,var(--brand-accent-foreground,var(--pd-paper)));--pd-muted:color-mix(in srgb,var(--pd-ink) 64%,var(--pd-paper));--pd-line:var(--store-border,var(--brand-border,color-mix(in srgb,var(--pd-ink) 16%,var(--pd-paper))));--pd-tint:color-mix(in srgb,var(--pd-accent) 7%,var(--pd-paper));--pd-alert:var(--store-danger,var(--brand-danger,#b3261e));--pd-radius:min(var(--store-radius,var(--brand-radius,0px)),6px);--pd-heading:var(--store-heading-font,var(--brand-heading-font,var(--font-heading,inherit)));--pd-body:var(--store-body-font,var(--brand-body-font,var(--font-body,inherit)));box-sizing:border-box;color:var(--pd-ink);background:var(--pd-paper);font-family:var(--pd-body)}
    [data-pagosya-product] *{box-sizing:border-box}
    [data-pagosya-product] [hidden]{display:none!important}
    dialog[data-pagosya-product]{width:min(1040px,calc(100% - 32px));max-width:none;max-height:calc(100dvh - 32px);margin:auto;padding:0;border:1px solid var(--pd-line);border-radius:var(--pd-radius);box-shadow:0 16px 64px #0003;overflow:auto;overscroll-behavior:contain}
    dialog[data-pagosya-product]::backdrop{background:#0009}
    [data-pagosya-product][data-pagosya-product-page]{display:block;width:100%;max-width:1440px;max-height:none;margin:0 auto;padding:0;border:0;border-radius:0;box-shadow:none;overflow:visible}
    [data-pagosya-product][data-style] :is(button,a){font:inherit;cursor:pointer}
    [data-pagosya-product][data-style] button:disabled{opacity:.5;cursor:default}
    [data-pagosya-product][data-style] :is(button,a,[tabindex]):focus-visible{outline:2px solid var(--pd-accent);outline-offset:3px}
    [data-pagosya-product][data-style] .product-detail__close{position:sticky;top:12px;z-index:3;display:grid;place-items:center;width:44px;height:44px;margin:12px 12px -56px auto;padding:0;border:1px solid var(--pd-line);border-radius:50%;background:var(--pd-paper);color:inherit;font-size:26px;line-height:1}
    [data-pagosya-product][data-style] .product-detail__layout{display:grid;grid-template-columns:minmax(0,1.12fr) minmax(0,1fr);align-items:start}
    /* dna.media=right mirrors the ficha on desktop: copy first, gallery second. story-led is a single
     * column and mobile stacks photo-first, so both keep their order. */
    @media(min-width:900px){
      :root[data-dna-media=right] [data-pagosya-product][data-style]:not([data-style=story-led]) .product-detail__layout:not([data-no-images])>.product-detail__gallery{order:2}
      :root[data-dna-media=right] [data-pagosya-product][data-style]:not([data-style=story-led]) .product-detail__layout:not([data-no-images])>.product-detail__copy{order:1}
    }
    [data-pagosya-product][data-style] .product-detail__layout[data-no-images]{grid-template-columns:minmax(0,1fr)}
    /* Gallery: the photo fills its column; dense pages overlay thumbnails and a plain counter, editorial pages use dots. */
    [data-pagosya-product][data-style] .product-detail__gallery{position:relative;min-width:0;margin:0;padding:0;border-radius:0;background:var(--pd-tint)}
    [data-pagosya-product][data-style] .product-detail__decor{display:none}
    [data-pagosya-product][data-style][data-pagosya-product-page] .product-detail__gallery{position:sticky;top:0}
    [data-pagosya-product][data-style] .product-detail__stage{position:relative;min-width:0}
    [data-pagosya-product][data-style] .product-detail__badge{position:absolute;top:14px;left:14px;z-index:2;max-width:calc(100% - 28px);padding:6px 12px;border-radius:999px;background:var(--pd-accent,#111);color:var(--pd-on-accent,#fff);font-size:13px;font-weight:600;line-height:1.2;letter-spacing:.02em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;pointer-events:none}
    [data-pagosya-product][data-style] .product-detail__photo{display:block;width:100%;height:min(calc(100dvh - 64px),760px);min-height:420px;max-height:none;margin:0;object-fit:cover;border:0;border-radius:0;background:var(--pd-tint);touch-action:pan-y}
    dialog[data-pagosya-product][data-style] .product-detail__photo{height:min(calc(100dvh - 34px),640px);min-height:360px}
    [data-pagosya-product][data-style] .product-detail__navigation{position:absolute;right:16px;bottom:22px;display:flex;align-items:center;gap:8px;margin:0;padding:0;border:0;border-radius:0;background:none;box-shadow:none;font-size:12px;font-variant-numeric:tabular-nums;color:#1c1917}
    /* Gallery controls sit on any photo: solid white chips with a soft shadow, never tinted by the store palette. */
    [data-pagosya-product][data-style] .product-detail__navigation span{order:-1;padding:5px 10px;border-radius:999px;background:#fff;color:#1c1917;font-weight:600;line-height:1;box-shadow:0 1px 3px rgb(0 0 0/.18)}
    [data-pagosya-product][data-style] .product-detail__navigation button{display:grid;place-items:center;width:36px;height:36px;min-height:0;padding:0;border:0;border-radius:50%;background:#fff;color:#1c1917;font-size:15px;line-height:1;box-shadow:0 1px 3px rgb(0 0 0/.22)}
    [data-pagosya-product][data-style] .product-detail__thumbnails{position:absolute;left:16px;bottom:16px;display:flex;gap:8px;max-width:calc(100% - 170px);margin:0;padding:2px;overflow-x:auto;border-radius:0;background:none}
    [data-pagosya-product][data-style] .product-detail__thumbnails button{flex:0 0 56px;width:56px;height:56px;padding:0;border:2px solid #fff;border-radius:max(var(--pd-radius),8px);overflow:hidden;background:var(--pd-tint);box-shadow:0 1px 3px rgb(0 0 0/.22);opacity:.86}
    [data-pagosya-product][data-style] .product-detail__thumbnails button[aria-pressed=true]{opacity:1;outline:2px solid var(--pd-ink);outline-offset:1px}
    [data-pagosya-product][data-style] .product-detail__thumbnails img{display:block;width:100%;height:100%;object-fit:cover}
    [data-pagosya-product][data-style=editorial] .product-detail__navigation{display:none}
    [data-pagosya-product][data-style=editorial] .product-detail__thumbnails{left:50%;bottom:14px;max-width:calc(100% - 32px);gap:0;padding:0;border-radius:0;background:none;transform:translateX(-50%)}
    [data-pagosya-product][data-style=editorial] .product-detail__thumbnails button,[data-pagosya-product][data-style=editorial] .product-detail__thumbnails button[aria-pressed=true]{display:grid;place-items:center;flex:0 0 28px;width:28px;height:28px;border-radius:50%;background:none;outline:0;border:0;box-shadow:none;opacity:1}
    [data-pagosya-product][data-style=editorial] .product-detail__thumbnails button::before{content:"";width:6px;height:6px;border-radius:3px;background:#ffffffa6;box-shadow:0 0 0 1px #00000026;transition:width .2s}
    [data-pagosya-product][data-style=editorial] .product-detail__thumbnails button[aria-pressed=true]::before{width:18px;background:#fff}
    [data-pagosya-product][data-style=editorial] .product-detail__thumbnails img{display:none}
    /* Desktop product pages show every photo, so a styled scene is seen without guessing that dots can be clicked; phones keep swipe and dots. */
    @media(min-width:900px){
      [data-pagosya-product][data-style=editorial][data-pagosya-product-page] .product-detail__gallery[data-rail]{background:none}
      [data-pagosya-product][data-style=editorial][data-pagosya-product-page] .product-detail__gallery[data-rail] .product-detail__photo{height:min(calc(100dvh - 148px),676px)}
      [data-pagosya-product][data-style=editorial][data-pagosya-product-page] .product-detail__gallery[data-rail] .product-detail__thumbnails{position:static;display:flex;gap:10px;max-width:none;margin:0;padding:12px clamp(16px,2vw,24px) 0;overflow-x:auto;background:none;transform:none}
      [data-pagosya-product][data-style=editorial][data-pagosya-product-page] .product-detail__gallery[data-rail] .product-detail__thumbnails button{display:block;flex:0 0 72px;width:72px;height:72px;padding:0;border-radius:var(--pd-radius);overflow:hidden;background:var(--pd-tint);outline:1px solid color-mix(in srgb,var(--pd-ink) 10%,transparent);outline-offset:0;opacity:.72;transition:opacity .2s}
      [data-pagosya-product][data-style=editorial][data-pagosya-product-page] .product-detail__gallery[data-rail] .product-detail__thumbnails button:hover{opacity:1}
      [data-pagosya-product][data-style=editorial][data-pagosya-product-page] .product-detail__gallery[data-rail] .product-detail__thumbnails button[aria-pressed=true]{opacity:1;outline:1.5px solid var(--pd-ink);outline-offset:2px}
      [data-pagosya-product][data-style=editorial][data-pagosya-product-page] .product-detail__gallery[data-rail] .product-detail__thumbnails button::before{content:none}
      [data-pagosya-product][data-style=editorial][data-pagosya-product-page] .product-detail__gallery[data-rail] .product-detail__thumbnails img{display:block;width:100%;height:100%;object-fit:cover}
      [data-pagosya-product][data-style][data-pagosya-product-page] .product-detail__copy:not([data-split]){padding:0 0 0 clamp(40px,4.4vw,72px)}
    }
    [data-pagosya-product][data-style] .product-detail__empty{display:grid;min-height:220px;place-items:center;color:inherit}
    [data-pagosya-product][data-style] .product-detail__blocks{display:grid;gap:24px;padding:24px;color:var(--pd-ink);background:var(--pd-paper)}
    [data-pagosya-product][data-style] .product-detail__block{min-width:0;margin:0;padding:16px;border:1px solid var(--pd-line);border-radius:var(--pd-radius);background:var(--pd-surface);overflow-wrap:anywhere}
    [data-pagosya-product][data-style] .product-detail__block [data-part=block-media]{display:block;width:100%;height:auto;border-radius:var(--pd-radius)}
    [data-pagosya-product][data-style] .product-detail__block :is(figcaption,h3){margin:12px 0;line-height:1.5;color:var(--pd-ink)}
    [data-pagosya-product][data-style] .product-detail__compare{position:relative;isolation:isolate;overflow:hidden;border-radius:var(--pd-radius);background:var(--pd-tint)}
    [data-pagosya-product][data-style] .pd-compare__before{display:block;width:100%;height:auto}
    [data-pagosya-product][data-style] .pd-compare__after{position:absolute;inset:0;width:100%;height:100%;object-fit:contain;clip-path:inset(0 0 0 var(--pd-compare))}
    [data-pagosya-product][data-style] .pd-compare__label{position:absolute;bottom:8px;max-width:45%;padding:4px 8px;background:var(--pd-paper);color:var(--pd-ink);border-radius:var(--pd-radius)}
    [data-pagosya-product][data-style] .pd-compare__label--before{left:8px}
    [data-pagosya-product][data-style] .pd-compare__label--after{right:8px}
    [data-pagosya-product][data-style] .pd-compare__range{display:block;width:100%;min-height:44px;margin:8px 0 0;accent-color:var(--pd-accent)}
    [data-pagosya-product][data-style] .pd-compare__range:focus-visible{outline:2px solid var(--pd-accent);outline-offset:3px}
    /* Purchase column */
    [data-pagosya-product][data-style] .product-detail__copy{align-self:start;min-width:0;width:100%;max-width:620px;margin:0;padding:clamp(28px,4vw,56px)}
    dialog[data-pagosya-product][data-style] .product-detail__copy{padding:44px 32px 28px}
    [data-pagosya-product][data-style][data-pagosya-product-page] .product-detail__copy[data-split]{max-width:1200px;margin:0 auto}
    @media(min-width:900px){
      [data-pagosya-product][data-style][data-pagosya-product-page] .product-detail__copy[data-split]{display:grid;grid-template-columns:minmax(0,1.15fr) minmax(300px,.85fr);grid-template-rows:auto 1fr;column-gap:clamp(40px,6vw,96px);align-items:start}
      [data-pagosya-product][data-style][data-pagosya-product-page] .product-detail__summary{grid-column:1;grid-row:1}
      [data-pagosya-product][data-style][data-pagosya-product-page] .product-detail__details{grid-column:1;grid-row:2}
      [data-pagosya-product][data-style][data-pagosya-product-page] .product-detail__buybox{grid-column:2;grid-row:1 / span 2;position:sticky;top:24px;padding:clamp(20px,2.4vw,32px);border:1px solid var(--pd-line);border-radius:var(--pd-radius);background:var(--pd-surface)}
    }
    [data-pagosya-product][data-style] .product-detail__breadcrumb{display:flex;flex-wrap:nowrap;min-width:0;align-items:center;gap:4px 10px;margin:0 0 18px;font-size:12px;line-height:1.4;color:var(--pd-muted)}
    [data-pagosya-product][data-style] .product-detail__breadcrumb a{display:inline-flex;align-items:center;min-height:32px;color:inherit;text-underline-offset:4px}
    [data-pagosya-product][data-style] .product-detail__breadcrumb>span:last-child{min-width:0;max-width:28ch;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    [data-pagosya-product][data-style] .product-detail__eyebrow{margin:0 0 10px;font-size:11px;font-weight:600;letter-spacing:.14em;text-transform:uppercase;color:var(--pd-muted);overflow-wrap:anywhere}
    [data-pagosya-product][data-style] #pagosya-product-title{margin:0 0 12px;font-family:var(--pd-heading);font-size:clamp(32px,3.4vw,46px);font-weight:380;line-height:1.18;letter-spacing:-.02em;text-wrap:balance;overflow-wrap:anywhere}
    [data-pagosya-product][data-style=editorial] #pagosya-product-title[data-length=long]{font-size:clamp(28px,2.7vw,38px)}
    [data-pagosya-product][data-style=dense] #pagosya-product-title{margin-bottom:10px;font-family:var(--pd-body);font-size:clamp(24px,2.3vw,30px);font-weight:650;line-height:1.12;letter-spacing:-.025em}
    [data-pagosya-product][data-style=dense] #pagosya-product-title[data-length=long]{font-size:clamp(22px,2vw,26px)}
    [data-pagosya-product][data-style] .product-detail__rating{display:flex;align-items:center;gap:8px;margin:-2px 0 12px;font-size:13px}
    [data-pagosya-product][data-style] .product-detail__rating a{display:inline-flex;align-items:center;gap:8px;min-height:32px;color:inherit;text-underline-offset:4px}
    [data-pagosya-product][data-style] .product-detail__stars{--rating:0;display:inline-block;white-space:nowrap;letter-spacing:1px;line-height:1;background:linear-gradient(90deg,var(--pd-accent) calc(var(--rating) * 20%),color-mix(in srgb,var(--pd-ink) 22%,transparent) 0);-webkit-background-clip:text;background-clip:text;color:transparent}
    [data-pagosya-product][data-style] .product-detail__pricing{display:flex;align-items:baseline;flex-wrap:wrap;gap:6px 12px;margin:0 0 14px}
    [data-pagosya-product][data-style] .product-detail__price{margin:0;font-size:17px;font-weight:400;letter-spacing:0;font-variant-numeric:tabular-nums}
    [data-pagosya-product][data-style] .product-detail__original{font-size:.9em;color:var(--pd-muted)}
    [data-pagosya-product][data-style] .product-detail__saving{padding:3px 7px;border-radius:var(--pd-radius);background:var(--pd-tint);color:var(--pd-accent);font-size:11px;font-weight:700;letter-spacing:.04em;text-transform:uppercase}
    [data-pagosya-product][data-style=dense] .product-detail__pricing{padding-bottom:14px;border-bottom:1px solid var(--pd-line)}
    [data-pagosya-product][data-style=dense] .product-detail__price{font-size:30px;font-weight:700;letter-spacing:-.03em}
    [data-pagosya-product][data-style=dense] .product-detail__original{font-size:16px}
    [data-pagosya-product][data-style] .product-detail__intro{max-width:52ch;margin:0 0 20px;font-size:14.5px;line-height:1.6;color:var(--pd-muted);white-space:pre-line;overflow-wrap:anywhere}
    [data-pagosya-product][data-style=dense] .product-detail__intro{margin:12px 0 14px}
    [data-pagosya-product][data-style] .product-detail__chips{display:flex;flex-wrap:wrap;gap:6px;margin:0 0 18px;padding:0;list-style:none}
    [data-pagosya-product][data-style] .product-detail__chips li{padding:5px 8px;border:1px solid var(--pd-line);border-radius:var(--pd-radius);background:var(--pd-surface);font-size:10.5px;font-weight:600;letter-spacing:.06em;text-transform:uppercase}
    [data-pagosya-product][data-style] :is(.product-detail__sr,.product-detail__review-score){position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap}
    /* Choices: pills by default, swatch circles for colors, radio rows for priced dense choices. */
    [data-pagosya-product][data-style] .product-detail__options{display:grid;gap:18px;margin:0 0 20px;padding:18px 0 0;border-top:1px solid var(--pd-line)}
    [data-pagosya-product][data-style=dense] .product-detail__options{padding-top:4px;border-top:0}
    [data-pagosya-product][data-style] .product-detail__options fieldset{min-width:0;margin:0;padding:0;border:0}
    [data-pagosya-product][data-style] .product-detail__options legend{display:flex;align-items:baseline;gap:8px;margin:0 0 10px;padding:0;font-size:11px;font-weight:600;letter-spacing:.14em;text-transform:uppercase;overflow-wrap:anywhere}
    [data-pagosya-product][data-style=dense] .product-detail__options legend{font-size:12.5px;letter-spacing:0;text-transform:none}
    [data-pagosya-product][data-style] [data-product-selection]{font-size:13px;font-weight:400;letter-spacing:0;text-transform:none;color:var(--pd-muted)}
    [data-pagosya-product][data-style] .product-detail__values{display:flex;flex-wrap:wrap;gap:8px}
    [data-pagosya-product][data-style] [data-product-option]{display:inline-flex;align-items:center;justify-content:center;gap:6px;min-width:44px;min-height:40px;max-width:100%;padding:8px 16px;border:1px solid var(--pd-line);border-radius:999px;background:transparent;color:inherit;font-size:13.5px;line-height:1.2;overflow-wrap:anywhere;transition:border-color .15s,box-shadow .15s}
    [data-pagosya-product][data-style=dense] [data-product-option]{border-radius:var(--pd-radius)}
    [data-pagosya-product][data-style] [data-product-option]:hover:not(:disabled){border-color:color-mix(in srgb,var(--pd-ink) 55%,var(--pd-paper))}
    [data-pagosya-product][data-style] [data-product-option][aria-pressed=true]{border-color:var(--pd-ink);box-shadow:inset 0 0 0 1px var(--pd-ink)}
    [data-pagosya-product][data-style] [data-product-option]:disabled{opacity:.45;text-decoration:line-through}
    [data-pagosya-product][data-style] [data-product-option][data-option-delta]::after{content:attr(data-option-delta);color:var(--pd-muted);font-size:.85em;white-space:nowrap}
    [data-pagosya-product][data-style] .product-detail__values[data-kind=swatch]{gap:14px}
    [data-pagosya-product][data-style] [data-kind=swatch] [data-product-option],[data-pagosya-product][data-style] [data-kind=swatch] [data-product-option][aria-pressed=true]{flex-direction:column;gap:6px;min-width:0;min-height:0;padding:0;border:0;border-radius:0;box-shadow:none;background:none;font-size:11px;color:var(--pd-muted)}
    [data-pagosya-product][data-style] [data-kind=swatch] [data-product-option][aria-pressed=true]{color:var(--pd-ink)}
    [data-pagosya-product][data-style] .product-detail__swatch{display:block;width:22px;height:22px;flex:0 0 auto;border-radius:50%;background:var(--swatch);box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--pd-ink) 15%,transparent)}
    [data-pagosya-product][data-style] [data-kind=swatch] .product-detail__swatch{width:34px;height:34px}
    [data-pagosya-product][data-style=editorial] [data-kind=swatch] .product-detail__swatch{width:28px;height:28px}
    [data-pagosya-product][data-style=editorial] [data-kind=swatch] .product-detail__option-label{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap}
    [data-pagosya-product][data-style] [data-kind=swatch] [aria-pressed=true] .product-detail__swatch{box-shadow:0 0 0 2px var(--pd-paper),0 0 0 3.5px var(--pd-ink)}
    [data-pagosya-product][data-style=dense] .product-detail__values[data-priced]:not([data-kind=swatch]){display:grid;grid-template-columns:minmax(0,1fr);gap:7px}
    [data-pagosya-product][data-style=dense] [data-priced]:not([data-kind=swatch]) [data-product-option]{display:grid;grid-template-columns:16px minmax(0,1fr) auto;justify-content:stretch;gap:12px;width:100%;min-height:48px;padding:10px 14px;background:var(--pd-surface);font-size:14px;text-align:left}
    [data-pagosya-product][data-style=dense] [data-priced]:not([data-kind=swatch]) [data-product-option]::before{content:"";box-sizing:border-box;width:16px;height:16px;border:1.5px solid color-mix(in srgb,var(--pd-ink) 45%,var(--pd-paper));border-radius:50%}
    [data-pagosya-product][data-style=dense] [data-priced]:not([data-kind=swatch]) [data-product-option][aria-pressed=true]::before{border-color:var(--pd-ink);background:radial-gradient(circle,var(--pd-ink) 0 3.5px,transparent 4px)}
    [data-pagosya-product][data-style=dense] [data-priced]:not([data-kind=swatch]) [data-product-option][data-option-price]::after{content:attr(data-option-price);font-size:14px;font-weight:600;color:var(--pd-ink);font-variant-numeric:tabular-nums;white-space:nowrap}
    [data-pagosya-product][data-style=dense] [data-priced]:not([data-kind=swatch]) [data-product-option]:disabled::after{text-decoration:line-through}
    /* Compra única vs. suscripción: a grouped card between the options and the purchase row. The
     * runtime only renders it when the product carries cadences, so these rules idle otherwise.
     * flow-root, not grid: a rendered legend never joins grid flow, so it would straddle the border.
     * The legend floats full-width to sit inside the card, and the rest clears it. Spacing is on
     * margin-top so the two notes, which the runtime hides until they apply, leave no gap behind. */
    [data-pagosya-product][data-style] .product-detail__membership{display:grid;gap:8px;min-width:0;margin:0 0 18px;padding:14px 16px;border:1px solid var(--pd-line);border-radius:var(--pd-radius);background:var(--pd-tint)}
    [data-pagosya-product][data-style] .product-detail__membership legend{padding:0;font-size:12px;font-weight:600;letter-spacing:.12em;text-transform:uppercase;color:var(--pd-muted)}
    [data-pagosya-product][data-style] .product-detail__membership label{display:flex;align-items:center;gap:10px;min-height:44px;margin:0;font-size:15px;cursor:pointer}
    [data-pagosya-product][data-style] .product-detail__membership label strong{margin-left:auto;font-variant-numeric:tabular-nums}
    [data-pagosya-product][data-style] .product-detail__membership input[type=radio]{flex:none;width:18px;height:18px;margin:0;accent-color:var(--pd-accent)}
    [data-pagosya-product][data-style] .product-detail__membership-note{margin:10px 0 0;font-size:13px;line-height:1.5;color:var(--pd-muted)}
    [data-pagosya-product][data-style] .product-detail__subscription{display:flow-root;min-width:0;margin:0 0 18px;padding:14px 16px;border:1px solid var(--pd-line);border-radius:var(--pd-radius);background:var(--pd-tint)}
    [data-pagosya-product][data-style] .product-detail__subscription>:not(legend){clear:both}
    [data-pagosya-product][data-style] .product-detail__subscription legend{float:left;width:100%;margin:0 0 10px;padding:0;font-size:12px;font-weight:600;letter-spacing:.12em;text-transform:uppercase;color:var(--pd-muted)}
    [data-pagosya-product][data-style] .product-detail__subscription label{display:flex;align-items:center;gap:10px;min-height:44px;margin:0;font-size:15px;cursor:pointer}
    [data-pagosya-product][data-style] .product-detail__subscription input[type=radio]{flex:none;width:18px;height:18px;margin:0;accent-color:var(--pd-accent)}
    [data-pagosya-product][data-style] .product-detail__subscription select{width:100%;min-height:44px;margin:8px 0 0;padding:10px 12px;border:1px solid var(--pd-line);border-radius:var(--pd-radius);background:var(--pd-paper);color:inherit;font:inherit}
    [data-pagosya-product][data-style] .product-detail__subscription select:disabled{opacity:.5;cursor:default}
    [data-pagosya-product][data-style] .product-detail__subscription-price{margin:12px 0 0;font-size:15px;font-weight:600;color:var(--pd-ink);font-variant-numeric:tabular-nums}
    [data-pagosya-product][data-style] .product-detail__subscription-conflict{margin:8px 0 0;font-size:14px;line-height:1.5;color:var(--pd-alert)}
    [data-pagosya-product][data-style] .product-detail__subscription p:not([class]){margin:10px 0 0;font-size:13px;line-height:1.5;color:var(--pd-muted)}
    [data-pagosya-product][data-style=dense] .product-detail__subscription{padding:0;border:0;border-radius:0;background:none}
    /* Quantity and action share one row; the live total rides on the dense action. */
    [data-pagosya-product][data-style] .product-detail__purchase{display:grid;grid-template-columns:auto minmax(0,1fr);align-items:stretch;gap:10px;margin:22px 0 12px}
    [data-pagosya-product][data-style] .product-detail__quantity{display:flex;align-items:center;justify-content:space-between;min-width:118px;border:1px solid var(--pd-line);border-radius:var(--pd-radius);overflow:hidden}
    [data-pagosya-product][data-style] .product-detail__quantity button{width:40px;min-height:46px;padding:0;border:0;background:transparent;color:inherit;font-size:18px}
    [data-pagosya-product][data-style] .product-detail__quantity output{min-width:24px;text-align:center;font-size:14px;font-variant-numeric:tabular-nums}
    [data-pagosya-product][data-style] .product-detail__subtotal{grid-column:1 / -1;grid-row:2;font-size:13px;color:var(--pd-muted)}
    [data-pagosya-product][data-style] .product-detail__subtotal:empty{display:none}
    [data-pagosya-product][data-style] .product-detail__buy{display:flex;align-items:center;justify-content:center;gap:0;width:100%;min-height:48px;margin:0;padding:12px 20px;border:0;border-radius:var(--pd-radius);background:var(--pd-accent);color:var(--pd-on-accent);font-size:12px;font-weight:600;letter-spacing:.14em;text-transform:uppercase;text-decoration:none;white-space:nowrap;transition:filter .15s}
    [data-pagosya-product][data-style] .product-detail__buy:hover:not(:disabled){filter:brightness(.92)}
    [data-pagosya-product][data-style] .product-detail__buy-total{white-space:nowrap;font-variant-numeric:tabular-nums}
    [data-pagosya-product][data-style=editorial] .product-detail__buy-total{display:none}
    [data-pagosya-product][data-style=conversion] .product-detail__buy-total{display:inline}
    [data-pagosya-product][data-style=conversion] .product-detail__buy{white-space:normal;text-wrap:balance}
    [data-pagosya-product][data-style=conversion] .product-detail__gallery:has(>.product-detail__tiles)>:is(.product-detail__stage,.product-detail__thumbnails){grid-column:1}
    [data-pagosya-product][data-style=conversion] .product-detail__gallery:has(>.product-detail__tiles)>.product-detail__tiles{grid-column:2;grid-row:1/span 2}
    @media(max-width:480px){[data-pagosya-product][data-style=conversion] .product-detail__purchase{grid-template-columns:minmax(0,1fr)}[data-pagosya-product][data-style=conversion] .product-detail__quantity{justify-self:start;width:136px}}
    [data-pagosya-product][data-style=conversion] .product-detail__buy-total:not(:empty)::before{content:"·";margin:0 10px}
    [data-pagosya-product][data-style=conversion] .product-detail__gallery:has(>.product-detail__tiles){display:grid;grid-template-columns:minmax(0,1fr) 120px;gap:12px;align-items:start;background:none}
    [data-pagosya-product] .product-detail__tiles{display:grid;gap:12px;margin:0;padding:0;list-style:none}
    [data-pagosya-product] .product-detail__tiles li{display:grid;justify-items:center;align-content:center;gap:8px;aspect-ratio:1;min-width:0;padding:10px 6px;border-radius:var(--pd-radius,14px);background:var(--pd-tint);color:var(--pd-ink);text-align:center;font-size:13px;line-height:1.2;overflow-wrap:anywhere}
    [data-pagosya-product] .product-detail__tiles .pd-icon{width:34px;height:34px;color:var(--pd-accent)}
    [data-pagosya-product] .product-detail__checks{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin:14px 0;padding:0;list-style:none}
    [data-pagosya-product] .product-detail__checks li{display:flex;align-items:center;gap:8px;min-width:0;padding:10px 12px;border-radius:var(--pd-radius,10px);background:var(--pd-tint);color:var(--pd-ink);font-size:14px;line-height:1.25;overflow-wrap:anywhere}
    [data-pagosya-product] .product-detail__checks li:last-child:nth-child(odd){grid-column:1/-1}
    [data-pagosya-product] .product-detail__checks li:only-child{padding:0;background:none}
    [data-pagosya-product] .product-detail__check{flex:0 0 20px;width:20px;height:20px}
    [data-pagosya-product] .product-detail__check circle{fill:var(--pd-accent)}
    [data-pagosya-product] .product-detail__check path{fill:none;stroke:var(--pd-on-accent,#fff);stroke-width:2.2;stroke-linecap:round;stroke-linejoin:round}
    [data-pagosya-product][data-style=dense] .product-detail__buy{min-height:50px;font-size:15px;letter-spacing:0;text-transform:none}
    [data-pagosya-product][data-style=dense] .product-detail__buy-total:not(:empty)::before{content:"—";margin:0 8px}
    /* Narrow phones keep the action on one line; the price above already shows the total. */
    @media(max-width:480px){[data-pagosya-product][data-style=dense] .product-detail__buy-total{display:none}}
    [data-pagosya-product][data-style] .product-detail__status{min-height:20px;margin:0;font-size:13px;line-height:1.5;color:var(--pd-muted)}
    [data-pagosya-product][data-style] .product-detail__assurances{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,max(140px,calc((100% - 36px) / 3))),1fr));gap:12px 18px;margin:16px 0 0;padding:14px 0 0;border:0;border-top:1px solid var(--pd-line);border-radius:0;list-style:none}
    [data-pagosya-product][data-style=dense] .product-detail__assurances{margin-top:16px;padding:0;border:0}
    [data-pagosya-product][data-style] .product-detail__assurances li{display:flex;align-items:center;gap:10px;min-width:0;font-size:12px;line-height:1.4}
    [data-pagosya-product][data-style] .product-detail__assurances svg{flex:0 0 20px;color:var(--pd-ink)}
    [data-pagosya-product][data-style=dense] .product-detail__assurances svg{flex-basis:24px;width:24px;height:24px}
    [data-pagosya-product][data-style] .product-detail__assurances strong{display:block;font-size:12.5px;font-weight:600}
    [data-pagosya-product][data-style] .product-detail__assurances span{display:block;color:var(--pd-muted);overflow-wrap:anywhere}
    [data-pagosya-product][data-style] .product-detail__assurances button{display:flex;align-items:center;gap:10px;min-height:40px;margin:0;padding:0;border:0;background:transparent;color:inherit;font-size:inherit;text-align:left}
    [data-pagosya-product][data-style] .product-detail__assurances button strong{text-decoration:underline;text-decoration-color:var(--pd-line);text-underline-offset:4px}
    /* Details, related products and verified reviews use only published catalog data. */
    [data-pagosya-product][data-style] .product-tabs{display:flex;gap:24px;margin:28px 0 16px;border-bottom:1px solid var(--pd-line)}
    [data-pagosya-product][data-style] .product-tabs button{min-height:44px;margin:0 0 -1px;padding:8px 0;border:0;border-bottom:2px solid transparent;background:transparent;color:var(--pd-muted);font-size:13px}
    [data-pagosya-product][data-style] .product-tabs button[aria-selected=true]{border-bottom-color:var(--pd-ink);color:var(--pd-ink)}
    [data-pagosya-product][data-style] [role=tabpanel]{font-size:14px;line-height:1.6}
    [data-pagosya-product][data-style] .product-delivery-list{margin:0 0 12px;padding-left:18px;overflow-wrap:anywhere}
    [data-pagosya-product][data-style] .product-delivery-list li{margin-bottom:14px}
    [data-pagosya-product][data-style] .product-detail__specs{margin:0 0 16px;padding:0}
    [data-pagosya-product][data-style] .product-detail__specs div{display:flex;justify-content:space-between;gap:16px;padding:10px 0;border-bottom:1px solid var(--pd-line)}
    [data-pagosya-product][data-style] .product-detail__specs dt{color:var(--pd-muted)}
    [data-pagosya-product][data-style] .product-detail__specs dd{margin:0;text-align:right;font-weight:600;overflow-wrap:anywhere}
    [data-pagosya-product][data-style] .product-detail__facts{margin:0;padding:0;list-style:none}
    [data-pagosya-product][data-style] .product-detail__facts li{padding:10px 0;border-bottom:1px solid var(--pd-line)}
    [data-pagosya-product][data-style] .product-detail__fact{display:flex;justify-content:space-between;gap:16px}
    [data-pagosya-product][data-style] .product-detail__fact span:first-child{color:var(--pd-muted)}
    [data-pagosya-product][data-style] .product-detail__fact span:last-child{text-align:right;font-weight:600;overflow-wrap:anywhere}
    [data-pagosya-product][data-style] :is(.product-detail__related,.product-detail__reviews):not([hidden]){display:grid;gap:20px;margin:clamp(40px,6vw,72px) clamp(16px,4vw,56px) 0;padding-top:clamp(24px,4vw,40px);border-top:1px solid var(--pd-line)}
    [data-pagosya-product][data-style] :is(.product-detail__related,.product-detail__reviews) h2{margin:0;font-family:var(--pd-heading);font-size:clamp(22px,2.4vw,28px);font-weight:400;line-height:1.2}
    [data-pagosya-product][data-style] .product-detail__related ul{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,160px),1fr));gap:20px 16px;margin:0;padding:0;list-style:none}
    [data-pagosya-product][data-style] .product-detail__related a{display:grid;gap:6px;color:inherit;text-decoration:none}
    [data-pagosya-product][data-style] .product-detail__related img{display:block;width:100%;aspect-ratio:1;object-fit:cover;border-radius:var(--pd-radius);background:var(--pd-tint)}
    [data-pagosya-product][data-style] .product-detail__related a:hover .product-detail__related-name{text-decoration:underline;text-underline-offset:4px}
    [data-pagosya-product][data-style] .product-detail__box{margin:0 0 16px;padding:0;border:0;min-width:0}
    [data-pagosya-product][data-style] .product-detail__box legend{display:flex;gap:8px;align-items:baseline;margin:0 0 4px;font-weight:600}
    [data-pagosya-product][data-style] [data-box-progress]{font-weight:400;color:var(--pd-muted);font-variant-numeric:tabular-nums}
    [data-pagosya-product][data-style] .product-detail__box-help{margin:0 0 10px;font-size:14px;color:var(--pd-muted)}
    [data-pagosya-product][data-style] .product-detail__box ul{display:grid;gap:8px;margin:0;padding:0;list-style:none}
    [data-pagosya-product][data-style] .product-detail__box li{display:grid;grid-template-columns:48px minmax(0,1fr) auto;align-items:center;gap:12px;padding:8px;border:1px solid var(--pd-line);border-radius:12px}
    [data-pagosya-product][data-style] .product-detail__box li[data-unavailable]{opacity:.55}
    [data-pagosya-product][data-style] .product-detail__box img,[data-pagosya-product][data-style] .product-detail__box-photo{width:48px;height:48px;border-radius:8px;object-fit:cover;background:var(--pd-line)}
    [data-pagosya-product][data-style] .product-detail__box-name{display:grid;overflow-wrap:anywhere;font-weight:600}
    [data-pagosya-product][data-style] .product-detail__box-name small{font-weight:400;color:var(--pd-muted)}
    [data-pagosya-product][data-style] .product-detail__box-stepper{display:inline-flex;align-items:center;gap:6px}
    [data-pagosya-product][data-style] .product-detail__box-stepper button{min-width:44px;min-height:44px;border:1px solid var(--pd-line);border-radius:999px;background:transparent;color:inherit;font-size:18px}
    [data-pagosya-product][data-style] .product-detail__box-stepper button:disabled{opacity:.4}
    [data-pagosya-product][data-style] .product-detail__box-stepper output{min-width:2ch;text-align:center;font-variant-numeric:tabular-nums}
    [data-pagosya-product][data-style] .product-detail__bundles{display:grid;gap:12px;margin:clamp(32px,5vw,56px) 0 0}
    [data-pagosya-product][data-style] .product-detail__bundles h2{margin:0;font-family:var(--pd-heading);font-size:clamp(20px,2.4vw,26px)}
    [data-pagosya-product][data-style] .product-detail__bundles article{display:grid;gap:10px;padding:18px 20px;border:1px solid var(--pd-line);border-radius:20px;background:color-mix(in srgb,var(--pd-accent) 6%,var(--pd-paper))}
    [data-pagosya-product][data-style] .product-detail__bundles h3{margin:0;font-size:16px}
    [data-pagosya-product][data-style] .product-detail__bundles p{margin:0;overflow-wrap:anywhere}
    /* Owner 2026-10-22: bundle buttons are round and friendly in every store — never the store's square, stamp or ticket form. */
    [data-pagosya-product][data-style] .product-detail__bundle-links{display:flex;flex-wrap:wrap;gap:6px}
    [data-pagosya-product][data-style] .product-detail__bundle-links a{display:inline-flex;align-items:center;min-height:32px;padding:0 12px;border:1px solid var(--pd-line);border-radius:999px;background:var(--pd-paper);color:inherit;font-size:13px;text-decoration:none;transition:border-color .2s ease}
    [data-pagosya-product][data-style] .product-detail__bundle-links a:hover{border-color:var(--pd-ink)}
    [data-pagosya-product][data-style] .product-detail__bundles .product-detail__bundle-add{justify-self:start;display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:44px;margin-top:4px;padding:0 22px;border:0;border-radius:999px;background:var(--pd-accent);color:var(--pd-on-accent);box-shadow:none;font:inherit;font-size:15px;font-weight:600;letter-spacing:0;text-transform:none;cursor:pointer;transition:transform .2s ease,filter .2s ease;-webkit-mask:none;mask:none;clip-path:none}
    [data-pagosya-product][data-style] .product-detail__bundles .product-detail__bundle-add:hover{transform:translateY(-1px);filter:brightness(.95)}
    [data-pagosya-product][data-style] .product-detail__bundles .product-detail__bundle-add:active{transform:scale(.97)}
    [data-pagosya-product][data-style] .product-detail__bundles .product-detail__bundle-add:focus-visible{outline:2px solid var(--pd-ink);outline-offset:3px}
    [data-pagosya-product][data-style] .product-detail__related-name{font-weight:600;overflow-wrap:anywhere}
    [data-pagosya-product][data-style] .product-detail__related-price{font-size:14px;color:var(--pd-muted);font-variant-numeric:tabular-nums}
    [data-pagosya-product][data-style] .product-detail__reviews-summary{display:flex;align-items:center;gap:10px;margin:0}
    [data-pagosya-product][data-style] .product-detail__review-list{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,280px),1fr));gap:16px}
    [data-pagosya-product][data-style] .product-detail__review-list article{padding:18px;border:1px solid var(--pd-line);border-radius:var(--pd-radius);background:var(--pd-surface)}
    @media(min-width:900px){ :root[data-dna-review=split] [data-pagosya-product][data-style] .product-detail__review-list{display:grid;grid-template-columns:1fr 1fr;gap:12px} }
    :root[data-dna-review=ticket] [data-pagosya-product][data-style] .product-detail__review-list article{border-style:dashed;border-radius:2px}
    :root[data-dna-review=notebook] [data-pagosya-product][data-style] .product-detail__review-list article{border-width:0 0 1px;border-radius:0;background:transparent;padding:14px 2px}
    [data-pagosya-product][data-style] .product-detail__related-note{margin:-6px 0 14px;font-size:13px;opacity:.7}
    [data-pagosya-product][data-style] .product-detail__review-list p{margin:0;line-height:1.55;overflow-wrap:anywhere}
    [data-pagosya-product][data-style] .product-detail__review-list .product-detail__review-meta{display:flex;align-items:center;gap:10px;margin:0 0 8px;font-size:13px}
    [data-pagosya-product][data-style] :is(.product-detail__sticky,.product-detail__sticky-space){display:none}
    @media(max-width:899px){
      [data-pagosya-product][data-style] .product-detail__layout{grid-template-columns:minmax(0,1fr)}
      [data-pagosya-product][data-style=conversion] .product-detail__gallery:has(>.product-detail__tiles){grid-template-columns:minmax(0,1fr) 28%;gap:8px}
      [data-pagosya-product] .product-detail__tiles{gap:8px}
      [data-pagosya-product] .product-detail__tiles li{gap:6px;padding:8px 4px;font-size:11px}
      [data-pagosya-product] .product-detail__tiles .pd-icon{width:26px;height:26px}
      [data-pagosya-product][data-style][data-pagosya-product-page] .product-detail__gallery{position:relative}
      [data-pagosya-product][data-style] .product-detail__photo,dialog[data-pagosya-product][data-style] .product-detail__photo{height:auto;min-height:0;max-height:72dvh;aspect-ratio:4/5}
      [data-pagosya-product][data-style] .product-detail__navigation{display:none}
      [data-pagosya-product][data-style] .product-detail__thumbnails{left:50%;bottom:14px;max-width:calc(100% - 32px);gap:0;padding:0;border-radius:0;background:none;transform:translateX(-50%)}
      [data-pagosya-product][data-style] .product-detail__thumbnails button,[data-pagosya-product][data-style] .product-detail__thumbnails button[aria-pressed=true]{display:grid;place-items:center;flex:0 0 28px;width:28px;height:28px;border-radius:50%;background:none;outline:0;border:0;box-shadow:none;opacity:1}
      [data-pagosya-product][data-style] .product-detail__thumbnails button::before{content:"";width:6px;height:6px;border-radius:3px;background:#ffffffa6;box-shadow:0 0 0 1px #00000026;transition:width .2s}
      [data-pagosya-product][data-style] .product-detail__thumbnails button[aria-pressed=true]::before{width:18px;background:#fff}
      [data-pagosya-product][data-style] .product-detail__thumbnails img{display:none}
      [data-pagosya-product][data-style] .product-detail__copy,dialog[data-pagosya-product][data-style] .product-detail__copy{max-width:none;padding:22px 16px 28px}
    }
    @media(max-width:640px){
      [data-pagosya-product][data-style] .product-detail__sticky:not([hidden]){position:fixed;left:0;right:0;bottom:0;z-index:40;display:flex;align-items:center;gap:12px;padding:10px 16px calc(10px + env(safe-area-inset-bottom,0px));border-top:1px solid var(--pd-line);background:var(--pd-paper);color:var(--pd-ink);box-shadow:0 -6px 24px #0000001a}
      [data-pagosya-product][data-style] .product-detail__sticky>div{flex:1;min-width:0;font-size:13px;line-height:1.3}
      [data-pagosya-product][data-style] .product-detail__sticky strong{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      [data-pagosya-product][data-style] .product-detail__sticky button{flex:0 0 auto;min-height:44px;padding:10px 18px;border:0;border-radius:var(--pd-radius);background:var(--pd-accent);color:var(--pd-on-accent);font-weight:700}
      [data-pagosya-product][data-style] .product-detail__sticky-space:not([hidden]){display:block;height:72px}
    }
    /* Approved highlights: one small looping motion each, paused off screen and stopped for reduced motion. */
    [data-pagosya-product][data-style] .product-detail__highlights{display:grid;gap:12px 18px;margin:0 0 20px;padding:0;list-style:none}
    [data-pagosya-product][data-style] .product-detail__highlights li{display:flex;align-items:center;gap:10px;min-width:0;font-size:12px;line-height:1.35}
    [data-pagosya-product][data-style] .product-detail__highlights strong{display:block;font-size:12.5px;font-weight:600}
    [data-pagosya-product][data-style] .product-long{max-width:1200px;margin:0 auto;padding:0 clamp(20px,4vw,48px)}
    [data-pagosya-product][data-style] .product-long>section{margin:clamp(48px,7vw,96px) 0}
    [data-pagosya-product][data-style] .product-long h2{margin:0 0 20px;font-family:var(--store-heading-font,inherit);font-size:clamp(26px,3.2vw,40px);line-height:1.1}
    [data-pagosya-product][data-style] .product-long__features ul{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:20px;margin:0;padding:0;list-style:none}
    [data-pagosya-product][data-style] .product-long__features li{display:grid;gap:6px;padding:20px;border:1px solid var(--store-border,rgba(0,0,0,.12));border-radius:var(--store-radius,12px)}
    [data-pagosya-product][data-style] .product-long__features svg{width:32px;height:32px;color:var(--store-accent,currentColor)}
    [data-pagosya-product][data-style] .product-long__story{display:grid;gap:14px;max-width:760px;font-size:18px;line-height:1.55}
    [data-pagosya-product][data-style] .product-long__details{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:20px}
    [data-pagosya-product][data-style] .product-long__details img{width:100%;aspect-ratio:4/5;object-fit:cover;border-radius:var(--store-radius,12px)}
    [data-pagosya-product][data-style] .product-long__details figcaption{display:grid;gap:4px;margin-top:10px}
    [data-pagosya-product][data-style] .product-long__versus table{width:100%;border-collapse:collapse}
    [data-pagosya-product][data-style] .product-long__versus th,[data-pagosya-product][data-style] .product-long__versus td{padding:14px 12px;border-bottom:1px solid var(--store-border,rgba(0,0,0,.12));text-align:center}
    [data-pagosya-product][data-style] .product-long__versus th[scope=row]{text-align:left;font-weight:500}
    [data-pagosya-product][data-style] .product-long__mark[data-yes=true]{color:var(--store-accent,currentColor)}
    [data-pagosya-product][data-style] .product-long__faq details{border-bottom:1px solid var(--store-border,rgba(0,0,0,.12));padding:16px 0}
    [data-pagosya-product][data-style] .product-long__faq summary{cursor:pointer;font-weight:600}
    [data-pagosya-product][data-style] .product-long__buy{display:grid;justify-items:center;gap:8px;margin:clamp(32px,5vw,64px) 0;text-align:center}
    [data-pagosya-product][data-style] .product-long__buy .checkout-button{min-width:min(100%,360px)}
    [data-pagosya-product][data-style] .product-detail__highlights span{display:block;color:var(--pd-muted);overflow-wrap:anywhere}
    [data-pagosya-product][data-style] .pd-icon{flex:0 0 26px;width:26px;height:26px;overflow:visible;color:var(--pd-ink)}
    [data-pagosya-product][data-style=editorial] .product-detail__highlights{grid-template-columns:repeat(auto-fit,minmax(min(100%,120px),1fr));gap:16px 10px;margin:0 0 22px;padding:18px 0;border-top:1px solid var(--pd-line);border-bottom:1px solid var(--pd-line)}
    [data-pagosya-product][data-style=editorial] .product-detail__highlights li{flex-direction:column;gap:8px;text-align:center}
    [data-pagosya-product][data-style=editorial] .product-detail__highlights strong{font-size:10.5px;font-weight:600;letter-spacing:.12em;text-transform:uppercase}
    [data-pagosya-product][data-style=editorial] .pd-icon{flex-basis:28px;width:28px;height:28px}
    [data-pagosya-product][data-style=dense] .product-detail__highlights{grid-template-columns:repeat(auto-fit,minmax(min(100%,140px),1fr));margin:16px 0 0}
    /* Image-led: large uncropped photograph beside a compact purchase column.
       Story-led: an expansive photograph followed by a readable single-column product story.
       Both use the same controls, stock, variants and checkout as the established presentations. */
    [data-pagosya-product]:is([data-style=image-led],[data-style=story-led]) .product-detail__stage{width:fit-content;max-width:100%;margin-inline:auto}
    [data-pagosya-product]:is([data-style=image-led],[data-style=story-led]) .product-detail__photo{width:auto;height:auto;max-width:100%;max-height:min(calc(100dvh - 64px),760px);min-height:0;aspect-ratio:auto;object-fit:contain}
    [data-pagosya-product]:is([data-style=image-led],[data-style=story-led]) .product-detail__thumbnails{position:static;max-width:100%;gap:10px;padding:12px 4px;margin:0;background:none;transform:none;border-radius:0}
    [data-pagosya-product]:is([data-style=image-led],[data-style=story-led]) .product-detail__thumbnails button,[data-pagosya-product]:is([data-style=image-led],[data-style=story-led]) .product-detail__thumbnails button[aria-pressed=true]{display:block;flex:0 0 64px;width:64px;height:64px;min-height:44px;border-radius:var(--pd-radius);background:var(--pd-tint);outline:1px solid var(--pd-line);outline-offset:-1px}
    [data-pagosya-product]:is([data-style=image-led],[data-style=story-led]) .product-detail__thumbnails button[aria-pressed=true]{outline:2px solid var(--pd-accent);outline-offset:-2px}
    [data-pagosya-product]:is([data-style=image-led],[data-style=story-led]) .product-detail__thumbnails button::before{content:none}
    [data-pagosya-product]:is([data-style=image-led],[data-style=story-led]) .product-detail__thumbnails img{display:block;width:100%;height:100%;object-fit:contain}
    [data-pagosya-product]:is([data-style=image-led],[data-style=story-led]) .product-detail__navigation{display:none}
    [data-pagosya-product]:is([data-style=image-led],[data-style=story-led]) [data-product-option]{min-height:44px}
    [data-pagosya-product]:is([data-style=image-led],[data-style=story-led]) .product-detail__buy{white-space:normal;flex-wrap:wrap;gap:4px 12px;padding-inline:16px;letter-spacing:.08em}
    [data-pagosya-product]:is([data-style=image-led],[data-style=story-led]) .product-detail__quantity{min-width:136px}
    [data-pagosya-product]:is([data-style=image-led],[data-style=story-led]) .product-detail__quantity button{width:44px}
    [data-pagosya-product][data-style=story-led][data-pagosya-product-page] .product-detail__gallery{position:relative}
    [data-pagosya-product]:is([data-style=image-led],[data-style=story-led]) .product-detail__thumbnails{justify-content:center}
    [data-pagosya-product][data-style=story-led][data-pagosya-product-page] .product-detail__layout{grid-template-columns:minmax(0,1fr)}
    [data-pagosya-product][data-style=story-led][data-pagosya-product-page] .product-detail__copy{width:100%;max-width:760px;margin-inline:auto;padding:clamp(28px,5vw,64px) 20px}
    [data-pagosya-product][data-style=story-led] .product-detail__intro{max-width:none;font-size:16px;line-height:1.75}
    [data-pagosya-product][data-style=story-led] .product-detail__highlights{padding-block:20px;border-block:1px solid var(--pd-line);grid-template-columns:repeat(auto-fit,minmax(min(100%,180px),1fr))}
    @media(min-width:900px){
      [data-pagosya-product][data-style=image-led][data-pagosya-product-page] .product-detail__layout:not([data-no-images]){grid-template-columns:minmax(0,1.55fr) minmax(320px,1fr);gap:clamp(24px,3vw,48px)}
      [data-pagosya-product][data-style=image-led][data-pagosya-product-page] .product-detail__copy:not([data-split]){padding:24px clamp(24px,3vw,48px) 24px 0;position:sticky;top:24px}
      [data-pagosya-product][data-style=story-led][data-pagosya-product-page] .product-detail__photo{max-height:56dvh}
      [data-pagosya-product][data-style=story-led] #pagosya-product-title{font-size:clamp(40px,4.5vw,60px)}
    }
    @media(max-width:899px){
      [data-pagosya-product]:is([data-style=image-led],[data-style=story-led]) .product-detail__stage{width:100%}
      [data-pagosya-product]:is([data-style=image-led],[data-style=story-led]) .product-detail__photo{width:100%;height:auto;aspect-ratio:auto;min-height:0;max-height:none}
      [data-pagosya-product][data-style=story-led][data-pagosya-product-page] .product-detail__copy{padding:24px 16px 32px}
    }
    @media(max-width:480px){
      [data-pagosya-product]:is([data-style=image-led],[data-style=story-led]) .product-detail__purchase{grid-template-columns:minmax(0,1fr)}
      [data-pagosya-product]:is([data-style=image-led],[data-style=story-led]) .product-detail__quantity{justify-self:start;width:136px}
    }
    /* Structural product families: use the same live controls in different reading hierarchies. */
    [data-pagosya-product][data-style] .product-detail__summary,[data-pagosya-product][data-style] .product-detail__buybox,[data-pagosya-product][data-style] .product-detail__details{min-width:0}
    [data-pagosya-product][data-style=story-led][data-pagosya-product-page] .product-detail__layout>.product-detail__summary{width:100%;max-width:1000px;padding:24px clamp(16px,4vw,56px);margin:0 auto;box-sizing:border-box}
    [data-pagosya-product][data-style=story-led][data-pagosya-product-page] .product-detail__copy[data-story]{max-width:1200px;box-sizing:border-box}
    [data-pagosya-product][data-style=dense][data-pagosya-product-page] .product-detail__buybox{padding:24px;border:1px solid var(--pd-line);border-radius:var(--pd-radius);background:var(--pd-surface)}
    [data-pagosya-product][data-style=dense][data-pagosya-product-page] .product-detail__buybox .product-detail__purchase{grid-template-columns:minmax(0,1fr)}
    [data-pagosya-product][data-style=dense][data-pagosya-product-page] .product-detail__buybox .product-detail__quantity{justify-self:start;width:136px}
    [data-pagosya-product][data-style=dense][data-pagosya-product-page] .product-detail__photo{object-fit:contain;height:auto;min-height:0;aspect-ratio:1/1}
    @media(min-width:900px){
      [data-pagosya-product][data-style=dense][data-pagosya-product-page] .product-detail__layout:not([data-no-images]){grid-template-columns:minmax(0,1fr) minmax(0,1.5fr);gap:32px}
      [data-pagosya-product][data-style=dense][data-pagosya-product-page] .product-detail__copy[data-split]{padding:0;grid-template-columns:minmax(0,1fr);gap:24px}
      [data-pagosya-product][data-style=dense][data-pagosya-product-page] .product-detail__copy[data-split]>div{grid-column:auto;grid-row:auto;position:static}
      [data-pagosya-product][data-style=dense][data-pagosya-product-page] .product-detail__layout[data-no-images] .product-detail__copy[data-split]{grid-template-columns:minmax(0,1fr) minmax(300px,.8fr);column-gap:48px}
      [data-pagosya-product][data-style=dense][data-pagosya-product-page] .product-detail__layout[data-no-images] .product-detail__buybox{grid-column:2;grid-row:1 / span 2}
      [data-pagosya-product][data-style=dense][data-pagosya-product-page] .product-detail__layout[data-no-images] .product-detail__details{grid-column:1}
      [data-pagosya-product][data-style=story-led][data-pagosya-product-page] .product-detail__copy[data-story] .product-detail__details{grid-row:1 / span 2}
      [data-pagosya-product][data-style=image-led][data-pagosya-product-page] .product-detail__layout:not([data-no-images]){grid-template-columns:minmax(0,1.9fr) minmax(300px,1fr)}
      [data-pagosya-product][data-style=image-led][data-pagosya-product-page] .product-detail__layout[data-no-images] #pagosya-product-title{font-size:clamp(40px,5vw,72px);line-height:1.1}
    }
    @media(min-width:1200px){
      [data-pagosya-product][data-style=dense][data-pagosya-product-page] .product-detail__layout:not([data-no-images]){grid-template-columns:minmax(0,1fr) minmax(0,1.8fr)}
      [data-pagosya-product][data-style=dense][data-pagosya-product-page] .product-detail__copy[data-split]{grid-template-columns:minmax(0,1fr) minmax(280px,1fr)}
      [data-pagosya-product][data-style=dense][data-pagosya-product-page] .product-detail__copy[data-split] .product-detail__buybox{grid-column:2;grid-row:1 / span 2;position:sticky;top:24px}
      [data-pagosya-product][data-style=dense][data-pagosya-product-page] .product-detail__copy[data-split] .product-detail__details{grid-column:1}
    }
    @media(max-width:899px){
      [data-pagosya-product][data-style][data-pagosya-product-page] .product-detail__copy[data-split]{display:flex;flex-direction:column;gap:24px;box-sizing:border-box}
      [data-pagosya-product][data-style][data-pagosya-product-page] .product-detail__copy[data-split]>div{width:100%;box-sizing:border-box}
    }
    @keyframes pd-roll{0%,100%{transform:translateX(-1.5px)}50%{transform:translateX(1.5px)}}
    @keyframes pd-drip{0%,55%{transform:translateY(0);opacity:1}75%{transform:translateY(2px);opacity:.55}100%{transform:translateY(0);opacity:1}}
    @keyframes pd-sweep{0%,100%{transform:rotate(-8deg)}50%{transform:rotate(8deg)}}
    @keyframes pd-spin{0%{transform:rotate(0)}100%{transform:rotate(360deg)}}
    @keyframes pd-settle{0%,100%{transform:translateY(0)}50%{transform:translateY(1px)}}
    @keyframes pd-stream{0%,100%{transform:translateY(-1px);opacity:.75}50%{transform:translateY(1px);opacity:1}}
    @keyframes pd-bob{0%,100%{transform:translateY(0)}50%{transform:translateY(-1.5px)}}
    @keyframes pd-tick{0%,100%{transform:rotate(0)}50%{transform:rotate(10deg)}}
    @keyframes pd-flicker{0%,58%,68%,100%{opacity:1}62%{opacity:.45}}
    @keyframes pd-fill{0%,100%{opacity:.5;transform:scaleX(.6)}50%{opacity:1;transform:scaleX(1)}}
    @keyframes pd-nudge{0%,100%{transform:translateX(-1px)}50%{transform:translateX(1px)}}
    @keyframes pd-pulse{0%,100%{opacity:.7}50%{opacity:1}}
    @keyframes pd-glow{0%,100%{opacity:.75}50%{opacity:1}}
    @keyframes pd-sway{0%,100%{transform:rotate(-3.5deg)}50%{transform:rotate(3.5deg)}}
    @keyframes pd-rays{0%,100%{transform:rotate(0);opacity:.8}50%{transform:rotate(12deg);opacity:1}}
    @keyframes pd-drum{0%{transform:rotate(0)}100%{transform:rotate(360deg)}}
    @keyframes pd-twinkle{0%,100%{opacity:.6;transform:scale(.92)}50%{opacity:1;transform:scale(1)}}
    @keyframes pd-wave{0%,100%{transform:rotate(-6deg)}50%{transform:rotate(6deg)}}
    @keyframes pd-snip{0%,100%{transform:rotate(-4deg)}50%{transform:rotate(4deg)}}
    @keyframes pd-steam{0%,100%{transform:translateY(0);opacity:.55}50%{transform:translateY(-2px);opacity:1}}
    @keyframes pd-tilt{0%,100%{transform:rotate(-4deg)}50%{transform:rotate(4deg)}}
    @keyframes pd-beat{0%,100%{transform:scale(1)}30%{transform:scale(1.08)}60%{transform:scale(.98)}}
    @keyframes pd-draw{0%{stroke-dasharray:1;stroke-dashoffset:1}60%,100%{stroke-dasharray:1;stroke-dashoffset:0}}
    [data-pagosya-product][data-style] .pd-icon>*{transform-box:fill-box;transform-origin:center}
    [data-pagosya-product][data-style] :is(.pd-roll,.pd-sweep,.pd-spin,.pd-settle,.pd-bob,.pd-flicker,.pd-nudge,.pd-pulse,.pd-glow,.pd-sway,.pd-twinkle,.pd-wave,.pd-snip,.pd-tilt,.pd-beat)>*{animation:var(--pd-motion) var(--pd-duration,2.4s) ease-in-out infinite}
    [data-pagosya-product][data-style] .pd-roll>*{--pd-motion:pd-roll}
    [data-pagosya-product][data-style] .pd-sweep>*{--pd-motion:pd-sweep;--pd-duration:2.8s}
    [data-pagosya-product][data-style] .pd-spin>*{--pd-motion:pd-spin;--pd-duration:6s;animation-timing-function:linear}
    [data-pagosya-product][data-style] .pd-settle>*{--pd-motion:pd-settle;--pd-duration:3s}
    [data-pagosya-product][data-style] .pd-bob>*{--pd-motion:pd-bob;--pd-duration:2.6s}
    [data-pagosya-product][data-style] .pd-flicker>*{--pd-motion:pd-flicker;--pd-duration:2.6s}
    [data-pagosya-product][data-style] .pd-nudge>*{--pd-motion:pd-nudge;--pd-duration:2.4s}
    [data-pagosya-product][data-style] .pd-pulse>*{--pd-motion:pd-pulse;--pd-duration:2.2s}
    [data-pagosya-product][data-style] .pd-glow>*{--pd-motion:pd-glow;--pd-duration:2.8s}
    [data-pagosya-product][data-style] .pd-sway>*{--pd-motion:pd-sway;--pd-duration:2.8s}
    [data-pagosya-product][data-style] .pd-twinkle>*{--pd-motion:pd-twinkle;--pd-duration:2.4s}
    [data-pagosya-product][data-style] .pd-wave>*{--pd-motion:pd-wave;--pd-duration:2.4s}
    [data-pagosya-product][data-style] .pd-snip>*{--pd-motion:pd-snip;--pd-duration:2.2s}
    [data-pagosya-product][data-style] .pd-tilt>*{--pd-motion:pd-tilt;--pd-duration:3s}
    [data-pagosya-product][data-style] .pd-beat>*{--pd-motion:pd-beat;--pd-duration:1.8s}
    [data-pagosya-product][data-style] .pd-drip>*{animation:pd-drip 2.6s ease-in-out infinite}
    [data-pagosya-product][data-style] .pd-stream>*{animation:pd-stream 2.2s ease-in-out infinite}
    [data-pagosya-product][data-style] .pd-tick .pd-hand{animation:pd-tick 2.6s ease-in-out infinite}
    [data-pagosya-product][data-style] .pd-fill .pd-level{animation:pd-fill 2.8s ease-in-out infinite}
    [data-pagosya-product][data-style] .pd-rays .pd-rays,[data-pagosya-product][data-style] .pd-rays>*{animation:pd-rays 3s ease-in-out infinite}
    [data-pagosya-product][data-style] .pd-drum .pd-drum{animation:pd-drum 6s linear infinite}
    [data-pagosya-product][data-style] .pd-steam .pd-steam{animation:pd-steam 2.6s ease-in-out infinite}
    [data-pagosya-product][data-style] :is(.pd-draw) :is(.pd-check){pathLength:1;animation:pd-draw 3.2s ease-in-out infinite}
    [data-pagosya-product][data-style][data-highlights-paused] .pd-icon,[data-pagosya-product][data-style][data-highlights-paused] .pd-icon *{animation-play-state:paused}
    /* Atelier (2026-10-19): the product page of the owner's Amboras references. Breadcrumb and stars, a provenance eyebrow
       on a hairline, a large tight title with an italic subtitle, the price on a rule, options as hairline pills named in
       tracked small caps, purchase choices as cards, a wide tracked call to action carrying the total, a centred trust row.
       Motion is one 0.18 s standard ease on hover; nothing bounces. */
    /* The fashion product page (2026-10-21, the John Smedley references): info left, photos right, round sizes, colour bars. */
    [data-pagosya-product][data-style=fashion] .product-detail__layout{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:0;align-items:stretch}
    [data-pagosya-product][data-style=fashion] .product-detail__layout>.product-detail__gallery{order:2;background:color-mix(in srgb,var(--pd-ink) 6%,var(--pd-paper))}
    [data-pagosya-product][data-style=fashion] .product-detail__photo{height:min(calc(100dvh - 64px),880px);object-fit:contain;background:transparent}
    [data-pagosya-product][data-style=fashion] .product-detail__copy{display:flex;flex-direction:column;gap:14px;padding:clamp(24px,4vw,56px) clamp(20px,3vw,48px)}
    [data-pagosya-product][data-style=fashion] [data-part=title]{order:0;margin:0;font:400 clamp(30px,3.2vw,44px)/1.1 var(--pd-heading);letter-spacing:-.01em}
    [data-pagosya-product][data-style=fashion] .product-detail__eyebrow{order:1;margin:-6px 0 0;font:400 15px/1.4 var(--pd-body);letter-spacing:0;text-transform:none;color:var(--pd-ink)}
    [data-pagosya-product][data-style=fashion] .product-detail__copy>:not([data-part=title],.product-detail__eyebrow){order:2}
    [data-pagosya-product][data-style=fashion] .product-detail__intro{display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:4;overflow:hidden;margin:0;font:400 18px/1.55 var(--pd-heading)}
    [data-pagosya-product][data-style=fashion] .product-detail__intro[data-expanded]{display:block}
    [data-pagosya-product][data-style=fashion] .product-detail__more{align-self:flex-start;padding:0;border:0;background:none;font:inherit;font-size:14px;text-decoration:underline;text-underline-offset:3px;cursor:pointer;color:inherit}
    [data-pagosya-product][data-style=fashion] .product-detail__values:not([data-kind=swatch]) button{position:relative;min-width:56px;min-height:56px;padding:0 14px;border:1px dashed color-mix(in srgb,var(--pd-ink) 55%,transparent);border-radius:999px;background:transparent;color:var(--pd-ink)}
    [data-pagosya-product][data-style=fashion] .product-detail__values:not([data-kind=swatch]) button[aria-pressed=true]{border-style:solid;border-color:var(--pd-ink);background:var(--pd-ink);color:var(--pd-paper)}
    [data-pagosya-product][data-style=fashion] .product-detail__values:not([data-kind=swatch]) button:disabled{opacity:.45;background:linear-gradient(to top right,transparent calc(50% - .5px),currentColor calc(50% - .5px),currentColor calc(50% + .5px),transparent calc(50% + .5px))}
    [data-pagosya-product][data-style=fashion] .product-detail__values[data-kind=swatch]{display:flex;gap:4px}
    [data-pagosya-product][data-style=fashion] .product-detail__values[data-kind=swatch] button{position:relative;flex:1;height:22px;min-height:0;padding:0;border:0;border-radius:0;background:none}
    [data-pagosya-product][data-style=fashion] .product-detail__values[data-kind=swatch] .product-detail__swatch{display:block;width:100%;height:100%;border-radius:0}
    [data-pagosya-product][data-style=fashion] .product-detail__values[data-kind=swatch] .product-detail__option-label{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}
    [data-pagosya-product][data-style=fashion] .product-detail__values[data-kind=swatch] button[aria-pressed=true]{box-shadow:inset 0 -3px 0 var(--pd-ink)}
    [data-pagosya-product][data-style=fashion] .product-detail__buy{width:100%;min-height:56px;border:0;border-radius:0;background:var(--pd-ink);color:var(--pd-paper);font:500 16px/1 var(--pd-body);letter-spacing:0;text-transform:none}
    [data-pagosya-product][data-style=fashion] .product-detail__buy-total:not(:empty)::before{content:"·";margin:0 10px}
    [data-pagosya-product][data-style=fashion] .product-detail__buy:disabled .product-detail__buy-total{display:none}
    /* «También te puede gustar»: the kit's related list, dressed like the fashion card (tinted 4:5 panel, name and price). */
    [data-pagosya-product][data-style=fashion] .product-detail__related img{width:100%;aspect-ratio:4/5;object-fit:cover;border-radius:0;background:color-mix(in srgb,var(--pd-ink) 6%,var(--pd-paper))}
    [data-pagosya-product][data-style=fashion] .product-detail__related h2{font:400 clamp(26px,2.6vw,36px)/1.15 var(--pd-heading);padding-top:18px;border-top:1px solid var(--pd-ink)}
    @media(max-width:820px){
      [data-pagosya-product][data-style=fashion] .product-detail__layout{grid-template-columns:1fr}
      [data-pagosya-product][data-style=fashion] .product-detail__layout>.product-detail__gallery{order:0}
      [data-pagosya-product][data-style=fashion] .product-detail__photo{height:auto;aspect-ratio:4/5}
    }
    [data-pagosya-product][data-style=atelier] .product-detail__copy{display:flex;flex-direction:column;gap:14px;padding:clamp(24px,4vw,56px)}
    [data-pagosya-product][data-style=atelier] .product-detail__copy>.product-detail__breadcrumb{order:-3;margin:0;font-size:12px;font-style:italic;letter-spacing:.02em;color:var(--pd-muted)}
    [data-pagosya-product][data-style=atelier] .product-detail__copy>.product-detail__rating{order:-2;margin:0;font-size:13px}
    [data-pagosya-product][data-style=atelier] .product-detail__copy>.product-detail__eyebrow{order:-1}
    [data-pagosya-product][data-style=atelier] .product-detail__stars{color:var(--pd-accent);letter-spacing:.12em}
    [data-pagosya-product][data-style=atelier] .product-detail__eyebrow{display:flex;align-items:center;gap:12px;margin:0;font:600 11px/1.4 var(--pd-body);letter-spacing:.22em;text-transform:uppercase;color:var(--pd-accent)}
    [data-pagosya-product][data-style=atelier] .product-detail__eyebrow::before{content:"";flex:0 0 28px;height:1px;background:currentColor;opacity:.6}
    [data-pagosya-product][data-style=atelier] [data-part=title]{margin:0;font-family:var(--pd-heading);font-size:clamp(34px,4.4vw,58px);line-height:1.02;letter-spacing:-.02em;text-wrap:balance}
    [data-pagosya-product][data-style=atelier] [data-part=title][data-length=long]{font-size:clamp(28px,3.4vw,44px)}
    [data-pagosya-product][data-style=atelier] .product-detail__subtitle{margin:-4px 0 0;font-family:var(--pd-heading);font-style:italic;font-size:18px;line-height:1.4;color:var(--pd-muted)}
    [data-pagosya-product][data-style=atelier] .product-detail__pricing{display:flex;flex-wrap:wrap;align-items:baseline;gap:12px;padding-bottom:18px;border-bottom:1px solid var(--pd-line)}
    [data-pagosya-product][data-style=atelier] .product-detail__price{font-family:var(--pd-heading);font-size:clamp(24px,2.4vw,32px);font-weight:700;letter-spacing:-.01em}
    [data-pagosya-product][data-style=atelier] .product-detail__original{font-size:15px;color:var(--pd-muted)}
    [data-pagosya-product][data-style=atelier] .product-detail__intro{margin:0;font-size:15px;line-height:1.65;color:var(--pd-muted)}
    [data-pagosya-product][data-style=atelier] :is(.product-detail__options fieldset,.product-detail__subscription){margin:0 0 4px;padding:0;border:0}
    [data-pagosya-product][data-style=atelier] :is(.product-detail__options,.product-detail__subscription) legend{margin-bottom:10px;padding:0;font:600 11px/1.4 var(--pd-body);letter-spacing:.18em;text-transform:uppercase;color:var(--pd-ink)}
    [data-pagosya-product][data-style=atelier] .product-detail__options legend span{font-weight:400;letter-spacing:.04em;text-transform:none;color:var(--pd-muted)}
    [data-pagosya-product][data-style=atelier] .product-detail__options legend span:not(:empty)::before{content:"— "}
    [data-pagosya-product][data-style=atelier] .product-detail__values{display:flex;flex-wrap:wrap;gap:8px}
    [data-pagosya-product][data-style=atelier] .product-detail__values:not([data-kind=swatch]) button{min-height:40px;padding:8px 18px;border:1px solid var(--pd-line);border-radius:999px;background:transparent;color:var(--pd-ink);font-size:13px;letter-spacing:.02em;transition:border-color .18s cubic-bezier(.4,0,.2,1),background-color .18s cubic-bezier(.4,0,.2,1),color .18s cubic-bezier(.4,0,.2,1)}
    [data-pagosya-product][data-style=atelier] .product-detail__values:not([data-kind=swatch]) button:hover{border-color:var(--pd-ink)}
    [data-pagosya-product][data-style=atelier] .product-detail__values:not([data-kind=swatch]) button[aria-pressed=true]{border-color:var(--pd-accent);background:var(--pd-accent);color:var(--pd-on-accent)}
    [data-pagosya-product][data-style=atelier] .product-detail__values[data-kind=swatch] button[aria-pressed=true]{box-shadow:0 0 0 2px var(--pd-paper),0 0 0 3px var(--pd-accent)}
    [data-pagosya-product][data-style=atelier] .product-detail__subscription label{display:flex;align-items:center;gap:12px;padding:14px 16px;border:1px solid var(--pd-line);border-radius:var(--pd-radius);cursor:pointer;transition:border-color .18s cubic-bezier(.4,0,.2,1)}
    [data-pagosya-product][data-style=atelier] .product-detail__subscription label:has(input:checked){border-color:var(--pd-accent);box-shadow:inset 0 0 0 1px var(--pd-accent)}
    [data-pagosya-product][data-style=atelier] .product-detail__purchase{display:grid;grid-template-columns:auto minmax(0,1fr);gap:10px;margin-top:6px}
    [data-pagosya-product][data-style=atelier] .product-detail__quantity{min-height:56px;border:1px solid var(--pd-line);border-radius:var(--pd-radius)}
    [data-pagosya-product][data-style=atelier] .product-detail__buy{width:100%;min-height:56px;border:0;border-radius:var(--pd-radius);background:var(--pd-accent);color:var(--pd-on-accent);font:700 13px/1.2 var(--pd-body);letter-spacing:.16em;text-transform:uppercase;white-space:normal;text-wrap:balance;transition:filter .18s cubic-bezier(.4,0,.2,1),transform .18s cubic-bezier(.4,0,.2,1)}
    [data-pagosya-product][data-style=atelier] .product-detail__buy:hover:not(:disabled){filter:brightness(1.08)}
    [data-pagosya-product][data-style=atelier] .product-detail__buy:active:not(:disabled){transform:translateY(1px)}
    [data-pagosya-product][data-style=atelier] .product-detail__buy-total{display:inline}
    [data-pagosya-product][data-style=atelier] .product-detail__buy-total:not(:empty)::before{content:"—";margin:0 10px}
    [data-pagosya-product][data-style=atelier] .product-detail__assurances{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:12px;margin:8px 0 0;padding:18px 0 0;border-top:1px solid var(--pd-line);list-style:none}
    [data-pagosya-product][data-style=atelier] .product-detail__assurances li{display:flex;flex-direction:column;align-items:center;gap:6px;text-align:center}
    [data-pagosya-product][data-style=atelier] .product-detail__assurances li>button{display:flex;flex-direction:column;align-items:center;gap:6px;padding:0;border:0;background:none;color:inherit;text-align:center}
    [data-pagosya-product][data-style=atelier] .product-detail__assurances li div{display:grid;gap:2px}
    [data-pagosya-product][data-style=atelier] .product-detail__assurances strong{font-size:12px;font-weight:600}
    [data-pagosya-product][data-style=atelier] .product-detail__assurances span{font-size:11px;color:var(--pd-muted)}
    [data-pagosya-product][data-style=atelier] [data-product-count]{position:static;font:500 12px/1 var(--pd-body);letter-spacing:.08em}
    [data-pagosya-product][data-style=atelier] .product-detail__thumbnails button[aria-pressed=true]{outline:1px solid var(--pd-ink);outline-offset:2px}
    /* The atelier card (2026-10-19, the Amboras references): a clean photo that zooms inside its own frame, the name in the
     * heading font, a quiet price, and one tracked full-width «Agregar» with a bag. Inside the DNA layer, more specific than
     * its card rules; the store's own CSS still wins. */
    @layer pagosya-dna {
      [data-pagosya-catalog] .menu-item[data-anatomy=atelier]:not([data-custom-product]){display:flex;flex-direction:column;gap:0;padding:0;border:0;background:transparent;box-shadow:none}
      [data-pagosya-catalog] .menu-item[data-anatomy=atelier] .menu-item__image{aspect-ratio:4/5;object-fit:cover;border-radius:var(--store-radius,0px);clip-path:inset(0);transition:transform .5s cubic-bezier(.4,0,.2,1),clip-path .5s cubic-bezier(.4,0,.2,1)}
      @media(hover:hover){[data-pagosya-catalog] .menu-item[data-anatomy=atelier]:hover .menu-item__image{transform:scale(1.04);clip-path:inset(1.92%)}}
      [data-pagosya-catalog] .menu-item[data-anatomy=atelier] .menu-item__copy{margin-top:16px}
      [data-pagosya-catalog] .menu-item[data-anatomy=atelier] .menu-item__copy h3{margin:0;font-family:var(--store-heading-font,inherit);font-size:15px;font-weight:600;line-height:1.3;letter-spacing:-.01em;text-transform:none}
      [data-pagosya-catalog] .menu-item[data-anatomy=atelier] .menu-item__copy p{display:none}
      [data-pagosya-catalog] .menu-item[data-anatomy=atelier] .menu-item__price{margin-top:6px;font-size:14px;font-weight:500;opacity:.78}
      [data-pagosya-catalog] .menu-item[data-anatomy=atelier] .menu-add{display:inline-flex;align-items:center;justify-content:center;gap:10px;align-self:stretch;width:100%;min-height:46px;margin-top:16px;padding:0 16px;border:1px solid currentColor;border-radius:var(--store-radius,0px);background:transparent;color:inherit;font:600 11px/1 var(--store-body-font,inherit);letter-spacing:.16em;text-transform:uppercase;transition:background-color .18s cubic-bezier(.4,0,.2,1),color .18s cubic-bezier(.4,0,.2,1)}
      [data-pagosya-catalog] .menu-item[data-anatomy=atelier] .menu-add:not(:disabled):hover{background:var(--store-foreground,#111);color:var(--store-background,#fff)}
      [data-pagosya-catalog] .menu-item[data-anatomy=atelier] .menu-add:disabled{opacity:.45}
    }
    /* The fashion card (2026-10-21, the John Smedley references). Inside the DNA layer; the store's own CSS still wins. */
    @layer pagosya-dna {
      [data-pagosya-catalog] .menu-item[data-anatomy=fashion]{display:flex;flex-direction:column;gap:0;padding:0;border:0;background:transparent;box-shadow:none}
      [data-pagosya-catalog] .menu-item[data-anatomy=fashion] .menu-item__panel{position:relative;aspect-ratio:4/5;overflow:hidden;border-radius:var(--store-radius,0px);background:color-mix(in srgb,var(--store-foreground,#111) 6%,var(--store-background,#fff))}
      [data-pagosya-catalog] .menu-item[data-anatomy=fashion] .menu-item__image{width:100%;height:100%;aspect-ratio:auto;object-fit:cover;transition:opacity .3s ease}
      [data-pagosya-catalog] .menu-item[data-anatomy=fashion] .menu-item__tag{position:absolute;top:12px;left:12px;z-index:2;max-width:calc(100% - 24px);margin:0;padding:4px 8px;border-radius:2px;background:color-mix(in srgb,var(--store-background,#fff) 88%,transparent);font:400 13px/1.3 var(--store-body-font,inherit);color:var(--store-foreground,#111);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      @media(max-width:600px){[data-pagosya-catalog] .menu-item[data-anatomy=fashion] .menu-item__tag{top:8px;left:8px;max-width:calc(100% - 16px);padding:3px 6px;font-size:11px}}
      [data-pagosya-catalog] .menu-item[data-anatomy=fashion] .menu-item__bars{position:absolute;left:0;right:0;bottom:0;z-index:3;display:flex;gap:2px;opacity:0;transition:opacity .2s ease}
      [data-pagosya-catalog] .menu-item[data-anatomy=fashion] .menu-item__bars button{flex:1;height:12px;min-height:0;margin:0;padding:0;border:0;border-radius:0;background:var(--swatch);cursor:pointer}
      @media(hover:hover){[data-pagosya-catalog] .menu-item[data-anatomy=fashion]:is(:hover,:focus-within) .menu-item__bars{opacity:1}}
      @media(hover:none){[data-pagosya-catalog] .menu-item[data-anatomy=fashion] .menu-item__bars{display:none}}
      [data-pagosya-catalog] .menu-item[data-anatomy=fashion] .menu-item__row{display:flex;flex-wrap:wrap;align-items:baseline;justify-content:space-between;gap:4px 16px;margin-top:14px}
      [data-pagosya-catalog] .menu-item[data-anatomy=fashion] .menu-item__name{margin:0;font:400 17px/1.3 var(--store-heading-font,inherit);letter-spacing:0;text-transform:none}
      [data-pagosya-catalog] .menu-item[data-anatomy=fashion] .menu-item__price{margin:0;font:400 15px/1.3 var(--store-body-font,inherit);white-space:nowrap}
      [data-pagosya-catalog] .menu-item[data-anatomy=fashion] .menu-item__price del{margin-left:8px;opacity:.6}
      [data-pagosya-catalog] .menu-item[data-anatomy=fashion] .menu-item__colors{margin:2px 0 0;font:400 14px/1.3 var(--store-body-font,inherit);opacity:.72}
      [data-pagosya-catalog] .menu-item[data-anatomy=fashion] .menu-item__panel:has([data-product-zoom]) .menu-item__bars{right:56px}
      @media(prefers-reduced-motion:reduce){[data-pagosya-catalog] .menu-item[data-anatomy=fashion] :is(.menu-item__image,.menu-item__bars){transition:none}}
    }
    /* The badge base rule is unlayered, so this one is too, at the base's own specificity (later wins; store CSS still wins). */
    :where(.menu-item[data-anatomy=atelier]) .menu-item__badge{top:12px;left:12px;padding:5px 8px;border-radius:0;background:var(--store-background,#fff);color:var(--store-foreground,#111);font-size:10px;font-weight:700;letter-spacing:.14em;text-transform:uppercase}
    /* A YAPI page template's slot with nothing visible in it (no related products, no reviews yet) takes no room: its own
     * borders and padding drew an empty band on Pulso Studio (2026-10-19). Reviews that arrive later show it again. */
    [data-pagosya-product] [data-product-page-root] [data-product-slot]:not(:has(> :not([hidden]))){display:none!important}
    /* Story steps (2026-10-19, pawfectt.com): a tall section whose stage sticks; the photo and the copy swap as it travels. */
    [data-pagosya-product] .product-steps{position:relative;height:calc(var(--steps,3) * 64vh + 40vh)}
    [data-pagosya-product] .product-steps__stage{position:sticky;top:96px;display:grid;grid-template-columns:minmax(0,1.05fr) minmax(0,1fr);gap:clamp(32px,6vw,96px);align-items:center}
    [data-pagosya-product] .product-steps__frame{width:min(100%,calc((100vh - 220px) * .8));justify-self:end}
    [data-pagosya-product] .product-steps__media{position:relative;aspect-ratio:4/5;overflow:hidden;border-radius:var(--pd-radius,4px);background:var(--pd-surface,transparent)}
    [data-pagosya-product] .product-steps__media img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;opacity:0;transform:scale(1.04);transition:opacity .5s cubic-bezier(.4,0,.2,1),transform .9s cubic-bezier(.4,0,.2,1)}
    [data-pagosya-product] .product-steps__media img[data-active]{opacity:1;transform:none}
    [data-pagosya-product] .product-steps__caption{display:flex;justify-content:space-between;gap:16px;margin:16px 0 10px;font-size:11px;font-weight:600;letter-spacing:.18em;text-transform:uppercase;color:var(--pd-muted)}
    [data-pagosya-product] .product-steps__caption span:first-child{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    [data-pagosya-product] .product-steps__progress{display:block;height:1px;background:var(--pd-line,rgba(0,0,0,.14))}
    [data-pagosya-product] .product-steps__progress span{display:block;width:var(--step-progress,0);height:100%;background:var(--pd-accent,currentColor);transition:width .5s cubic-bezier(.4,0,.2,1)}
    [data-pagosya-product] .product-steps__pills{display:flex;gap:8px;margin:0 0 clamp(28px,4vw,44px)}
    [data-pagosya-product] .product-steps__pills button{display:grid;place-items:center;width:44px;height:44px;padding:0;border:1px solid var(--pd-line,rgba(0,0,0,.18));border-radius:999px;background:transparent;color:var(--pd-muted);font:600 12px/1 var(--pd-body,inherit);letter-spacing:.04em;cursor:pointer;transition:background-color .18s cubic-bezier(.4,0,.2,1),color .18s cubic-bezier(.4,0,.2,1),border-color .18s cubic-bezier(.4,0,.2,1)}
    [data-pagosya-product] .product-steps__pills button[aria-pressed=true]{border-color:var(--pd-accent,currentColor);background:var(--pd-accent,currentColor);color:var(--pd-on-accent,#fff)}
    [data-pagosya-product] .product-steps__pills button:focus-visible{outline:2px solid var(--pd-accent,currentColor);outline-offset:3px}
    [data-pagosya-product] .product-steps__list{display:grid;margin:0;padding:0;list-style:none}
    [data-pagosya-product] .product-steps__step{grid-area:1/1;opacity:0;visibility:hidden;transform:translateY(12px);transition:opacity .45s cubic-bezier(.4,0,.2,1),transform .45s cubic-bezier(.4,0,.2,1),visibility 0s .45s}
    [data-pagosya-product] .product-steps__step[data-active]{opacity:1;visibility:visible;transform:none;transition-delay:0s}
    [data-pagosya-product] .product-steps__photo{display:none}
    [data-pagosya-product] .product-steps .product-steps__eyebrow{margin:0 0 14px;color:var(--pd-accent,currentColor);font-size:11px;font-weight:700;letter-spacing:.22em;text-transform:uppercase}
    [data-pagosya-product] .product-steps__step h3{margin:0 0 18px;font-family:var(--pd-heading,inherit);font-size:clamp(28px,3.2vw,44px);line-height:1.06;letter-spacing:-.02em}
    [data-pagosya-product] .product-steps__step p:not(.product-steps__eyebrow){max-width:44ch;margin:0;padding-top:18px;border-top:1px solid var(--pd-line,rgba(0,0,0,.12));color:var(--pd-muted);font-size:16px;line-height:1.65}
    @media(max-width:760px){[data-pagosya-product] .product-steps{height:auto}[data-pagosya-product] .product-steps__stage{position:static;grid-template-columns:1fr}[data-pagosya-product] .product-steps__frame,[data-pagosya-product] .product-steps__pills{display:none}[data-pagosya-product] .product-steps__list{gap:44px}[data-pagosya-product] .product-steps__step{grid-area:auto;opacity:1;visibility:visible;transform:none}[data-pagosya-product] .product-steps__photo{display:block;width:100%;aspect-ratio:4/5;margin:0 0 20px;object-fit:cover;border-radius:var(--pd-radius,4px)}}
    /* Atelier reviews (pawfectt.com): the score column on the left, the reviews on hairlines on the right. */
    @media(min-width:900px){[data-pagosya-product][data-style=atelier] .product-detail__reviews:not([hidden]){grid-template-columns:minmax(220px,.75fr) 2fr;column-gap:clamp(40px,7vw,112px);align-items:start}[data-pagosya-product][data-style=atelier] .product-detail__reviews>h2,[data-pagosya-product][data-style=atelier] .product-detail__reviews-summary{grid-column:1}[data-pagosya-product][data-style=atelier] .product-detail__review-list{grid-column:2;grid-row:1/span 3}}
    [data-pagosya-product][data-style=atelier] .product-detail__reviews>h2{font-weight:600;letter-spacing:-.02em}
    [data-pagosya-product][data-style=atelier] .product-detail__reviews-summary{display:grid;grid-template-columns:auto 1fr;align-items:center;gap:6px 14px}
    [data-pagosya-product][data-style=atelier] .product-detail__reviews-summary>span:last-child{grid-column:1/-1;color:var(--pd-muted);font-size:13px}
    [data-pagosya-product][data-style=atelier] .product-detail__reviews-average{font-family:var(--pd-heading,inherit);font-size:clamp(44px,5vw,64px);font-weight:600;line-height:1;letter-spacing:-.03em}
    [data-pagosya-product][data-style=atelier] .product-detail__review-list{display:grid;grid-template-columns:1fr;gap:0}
    [data-pagosya-product][data-style=atelier] .product-detail__review-list article{padding:24px 0;border:0;border-top:1px solid var(--pd-line,rgba(0,0,0,.12));border-radius:0;background:transparent}
    [data-pagosya-product][data-style=atelier] .product-detail__review-list article:last-child{border-bottom:1px solid var(--pd-line,rgba(0,0,0,.12))}
    [data-pagosya-product][data-style=atelier] .product-detail__review-list p:not(.product-detail__review-meta){max-width:68ch;color:var(--pd-muted);line-height:1.65}
    [data-pagosya-product][data-style=atelier] .product-detail__review-verified{margin-left:auto;color:var(--pd-muted);font-size:11px;font-weight:600;letter-spacing:.14em;text-transform:uppercase}
    [data-pagosya-product][data-style=atelier] [data-reveal]:not([data-revealed]){opacity:0;transform:translateY(12px)}
    [data-pagosya-product][data-style=atelier] [data-reveal]{transition:opacity .6s cubic-bezier(.4,0,.2,1),transform .6s cubic-bezier(.4,0,.2,1)}
    /* Atelier long page: features as a hairline list, the FAQ with a drawn +, one quiet repeated buy. */
    [data-pagosya-product][data-style=atelier] .product-long h2{letter-spacing:-.02em}
    /* Even rows (Lana Andina's six features wrapped five and one): two or four per row when that is the count, else three. */
    [data-pagosya-product][data-style=atelier] .product-long__features ul{--cols:3;grid-template-columns:repeat(var(--cols),minmax(0,1fr));gap:0;border-top:1px solid var(--pd-line,rgba(0,0,0,.12))}
    [data-pagosya-product][data-style=atelier] .product-long__features ul[data-count="2"]{--cols:2}
    [data-pagosya-product][data-style=atelier] .product-long__features ul[data-count="4"]{--cols:4}
    [data-pagosya-product][data-style=atelier] .product-long__features li{gap:10px;padding:28px;border:0;border-left:1px solid var(--pd-line,rgba(0,0,0,.12));border-bottom:1px solid var(--pd-line,rgba(0,0,0,.12));border-radius:0;align-content:start}
    [data-pagosya-product][data-style=atelier] .product-long__features ul:not([data-count="2"],[data-count="4"]) li:nth-child(3n+1),[data-pagosya-product][data-style=atelier] .product-long__features ul[data-count="2"] li:nth-child(2n+1),[data-pagosya-product][data-style=atelier] .product-long__features ul[data-count="4"] li:first-child{padding-left:0;border-left:0}
    [data-pagosya-product][data-style=atelier] .product-long__features svg{width:26px;height:26px;margin-bottom:6px}
    [data-pagosya-product][data-style=atelier] .product-long__features strong{font-family:var(--pd-heading,inherit);font-size:18px;letter-spacing:-.01em}
    [data-pagosya-product][data-style=atelier] .product-long__features span{color:var(--pd-muted);line-height:1.6}
    [data-pagosya-product][data-style=atelier] .product-long__faq{max-width:880px}
    [data-pagosya-product][data-style=atelier] .product-long__faq details{padding:0;border-bottom:1px solid var(--pd-line,rgba(0,0,0,.12))}
    [data-pagosya-product][data-style=atelier] .product-long__faq details:first-of-type{border-top:1px solid var(--pd-line,rgba(0,0,0,.12))}
    [data-pagosya-product][data-style=atelier] .product-long__faq summary{position:relative;display:block;padding:22px 44px 22px 0;font-family:var(--pd-heading,inherit);font-size:18px;font-weight:600;list-style:none}
    [data-pagosya-product][data-style=atelier] .product-long__faq summary::-webkit-details-marker{display:none}
    [data-pagosya-product][data-style=atelier] .product-long__faq summary::before,[data-pagosya-product][data-style=atelier] .product-long__faq summary::after{content:"";position:absolute;top:50%;right:4px;width:14px;height:1.5px;background:currentColor;transition:transform .2s cubic-bezier(.4,0,.2,1)}
    [data-pagosya-product][data-style=atelier] .product-long__faq summary::after{transform:rotate(90deg)}
    [data-pagosya-product][data-style=atelier] .product-long__faq details[open] summary::after{transform:rotate(0)}
    [data-pagosya-product][data-style=atelier] .product-long__faq details p{max-width:64ch;margin:0;padding:0 0 22px;color:var(--pd-muted);line-height:1.65}
    [data-pagosya-product][data-style=atelier] .product-long__buy .checkout-button{width:auto;min-width:min(100%,320px);min-height:56px;padding:0 40px;font-size:12px;letter-spacing:.16em;text-transform:uppercase}
    [data-pagosya-product][data-style=atelier] .product-long__buy p{color:var(--pd-muted);font-size:13px}
    @media(max-width:900px){[data-pagosya-product][data-style=atelier] .product-long__features ul[data-count]{--cols:2}[data-pagosya-product][data-style=atelier] .product-long__features ul[data-count] li{padding:24px 20px 24px 0;border-left:0}}
    @media(max-width:640px){[data-pagosya-product][data-style=atelier] .product-long__features ul[data-count]{--cols:1}[data-pagosya-product][data-style=atelier] .product-long__features ul[data-count] li{padding:22px 0}}
    @media(max-width:640px){[data-pagosya-product][data-style=atelier] .product-detail__copy{padding:20px}[data-pagosya-product][data-style=atelier] .product-detail__assurances{grid-template-columns:minmax(0,1fr)}[data-pagosya-product][data-style=atelier] .product-detail__assurances li{flex-direction:row;text-align:left}}
    [data-pagosya-product] .offer-squares{display:grid;gap:8px;margin:4px 0 8px}
    [data-pagosya-product] .offer-squares__label{margin:0;font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:var(--pd-muted)}
    [data-pagosya-product] .offer-squares__group{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,104px),1fr));gap:12px 8px;padding-top:6px}
    [data-pagosya-product] .offer-squares[data-offer-layout=rows] .offer-squares__group{grid-template-columns:1fr}
    [data-pagosya-product] .offer-squares{--offer-warm:#ffb27a}
    [data-pagosya-product] .offer-square{position:relative;display:grid;gap:2px;justify-items:center;align-content:start;min-width:0;overflow-wrap:anywhere;padding:16px 10px 12px;border:1.5px solid color-mix(in srgb,var(--pd-accent) 22%,var(--pd-line));border-radius:18px;background:color-mix(in srgb,var(--offer-warm) 9%,var(--pd-surface));color:var(--pd-ink);font:inherit;text-align:center;cursor:pointer;transition:transform .16s ease,box-shadow .16s ease,background-color .16s ease}
    [data-pagosya-product] .offer-square:hover{transform:translateY(-1px);box-shadow:0 8px 18px -12px color-mix(in srgb,var(--pd-accent) 60%,transparent)}
    [data-pagosya-product] .offer-squares[data-offer-layout=rows] .offer-square{grid-template-columns:minmax(0,1fr) auto;justify-items:start;text-align:left;padding:14px 16px;border-radius:16px}
    [data-pagosya-product] .offer-squares[data-offer-layout=rows] .offer-square__total{grid-column:2;grid-row:1;justify-self:end}
    [data-pagosya-product] .offer-square[aria-checked=true]{border:2px solid var(--pd-accent);background:color-mix(in srgb,var(--pd-accent) 12%,color-mix(in srgb,var(--offer-warm) 16%,var(--pd-surface)));box-shadow:0 10px 22px -14px color-mix(in srgb,var(--pd-accent) 70%,transparent)}
    [data-pagosya-product] .offer-square:focus-visible{outline:2px solid var(--pd-accent);outline-offset:2px}
    @media (prefers-reduced-motion:reduce){[data-pagosya-product] .offer-square{transition:none}[data-pagosya-product] .offer-square:hover{transform:none}}
    [data-pagosya-product] .offer-square__title{font-weight:700}
    [data-pagosya-product] .offer-square__total{font-size:1.15em;font-weight:800}
    [data-pagosya-product] .offer-square__regular,[data-pagosya-product] .offer-square__line{font-size:12px;opacity:.75}
    [data-pagosya-product] .offer-square__save{margin-top:4px;padding:2px 9px;border-radius:99px;background:color-mix(in srgb,var(--offer-warm) 22%,var(--pd-surface));color:color-mix(in srgb,var(--pd-accent) 72%,#6b3410);font-size:11px;font-weight:700}
    [data-pagosya-product] .offer-square__tag{position:absolute;top:-9px;left:50%;transform:translateX(-50%);max-width:calc(100% - 8px);padding:2px 8px;border-radius:99px;background:var(--pd-accent);color:var(--pd-on-accent);font-size:10px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    [data-pagosya-product] .offer-squares[data-offer-layout=rows] .offer-square__tag{left:auto;right:12px;transform:none}
    [data-pagosya-product] [data-subscription-choice][data-offer-driven]>:is(legend,label,select){position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}
    @media(prefers-reduced-motion:reduce){[data-pagosya-product] .pd-icon *{animation:none!important}}
    @media(prefers-reduced-motion:reduce){[data-pagosya-product] *,[data-pagosya-product] *::before{transition:none!important;scroll-behavior:auto!important}}
  `;
  document.head.append(detailStyle);
