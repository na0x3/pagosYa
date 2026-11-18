  // One look per menu model (spec 2026-11-15 store menu models), read after STORE_MENU_CSS; everything is keyed on [data-model].
  // Owner 2026-11-16 (Miga Dorada): every colour falls back to the store's own --kit-* tokens (V2 designs never set --store-*), and the
  // stickers menu is see-through page paper, not a colour wall: only the options carry the store's colours.
  const STORE_MENU_MODEL_CSS = `
    .pym-panel[data-model=mega]{padding:28px max(24px,calc((100% - 1280px)/2)) 36px}
    .pym-panel[data-model=mega] .pym-group{display:grid;grid-template-columns:minmax(180px,240px) repeat(3,minmax(0,1fr));gap:16px}
    .pym-panel[data-model=mega] .pym-links{grid-template-columns:1fr;font-size:12px;letter-spacing:.14em;text-transform:uppercase}
    .pym-panel[data-model=mega] .pym-tiles,.pym-panel[data-model=mega] .pym-tiles ul{display:contents}
    .pym-panel[data-model=mega] .pym-tiles-title{display:none}
    .pym-panel[data-model=mega] .pym-tiles a{position:relative;display:block;aspect-ratio:1;overflow:hidden;border-radius:var(--kit-radius,0)}
    .pym-panel[data-model=mega] .pym-tiles img{position:absolute;inset:0;width:100%;height:100%;aspect-ratio:auto;object-fit:cover}
    .pym-panel[data-model=mega] .pym-tile-title{position:absolute;inset:auto 12px 14px;color:#fff;font-family:var(--store-heading-font,var(--kit-display,inherit));font-size:18px;letter-spacing:.08em;text-transform:uppercase;text-shadow:0 2px 12px #0008}
    .pym-panel[data-model=overlay],.pym-panel[data-model=split]{position:fixed;inset:0;max-height:none;z-index:1000;border:0;display:grid;grid-template-columns:minmax(0,1.1fr) minmax(0,1fr);gap:40px;align-items:center;padding:clamp(24px,5vw,72px)}
    .pym-panel[data-model=overlay]{background:var(--store-accent,var(--es-ink,#111));color:var(--store-on-accent,var(--es-paper,#fff))}
    .pym-panel[data-model=overlay] .pym-links a{color:inherit}
    .pym-panel:is([data-model=overlay],[data-model=split],[data-model=drawer]){padding-top:72px}
    .pym-close{display:none}
    .pym-panel[data-model=overlay] .pym-close,.pym-panel[data-model=split] .pym-close,.pym-panel[data-model=drawer] .pym-close,.pym-panel[data-mode=panel] .pym-close{display:grid;place-items:center;position:absolute;top:14px;right:14px;z-index:2;width:44px;height:44px;border:0;border-radius:999px;background:color-mix(in srgb,currentColor 12%,transparent);color:inherit;font:400 28px/1 inherit;cursor:pointer}
    .pym-panel[data-model=overlay] .pym-tabs{grid-column:1/-1}
    .pym-panel[data-model=overlay] .pym-links{grid-template-columns:1fr;gap:4px}
    .pym-panel[data-model=overlay] .pym-links a{font-family:var(--store-heading-font,var(--kit-display,inherit));font-size:clamp(36px,5vw,64px);line-height:1.05;opacity:.55;transition:opacity .2s}
    .pym-panel[data-model=overlay] .pym-links a:is(:hover,:focus-visible){opacity:1;text-decoration:none;color:inherit}
    .pym-panel[data-model=overlay] .pym-tiles{display:none}
    .pym-hero-photo{border-radius:var(--kit-radius-panel,18px);overflow:hidden;aspect-ratio:4/5;max-height:70dvh}
    .pym-hero-photo img{width:100%;height:100%;object-fit:cover;transition:opacity .2s}
    .pym-panel[data-model=overlay] .pym-hero-photo{grid-column:2;grid-row:1 / span 3}
    .pym-panel[data-model=split]{padding:0;gap:0;background:var(--store-surface,var(--kit-paper,var(--store-background,var(--kit-paper,#fff))))}
    .pym-panel[data-model=split] .pym-hero-photo{grid-row:1 / span 3;height:100dvh;max-height:none;aspect-ratio:auto;border-radius:0}
    .pym-panel[data-model=split] .pym-group,.pym-panel[data-model=split] .pym-tabs{grid-column:2;margin-inline:clamp(24px,5vw,64px)}
    .pym-panel[data-model=split] .pym-links a{font-family:var(--store-heading-font,var(--kit-display,inherit));font-size:22px}
    .pym-panel[data-model=split] .pym-tiles{display:none}
    .pym-panel[data-model=drawer]{position:fixed;inset:0 auto 0 0;width:min(440px,88vw);max-height:none;z-index:1000;padding:24px 28px;border-top:0;background:var(--store-foreground,var(--kit-ink,#111));color:var(--store-background,var(--kit-paper,#fff))}
    .pym-panel[data-model=drawer] .pym-group{display:grid;grid-template-rows:1fr auto;gap:24px;min-height:calc(100dvh - 140px)}
    .pym-panel[data-model=drawer] .pym-links{grid-template-columns:1fr;align-content:start}
    .pym-panel[data-model=drawer] .pym-links a{font-family:var(--store-heading-font,var(--kit-display,inherit));font-size:28px;font-style:italic;color:inherit}
    .pym-panel[data-model=drawer] .pym-tiles ul{grid-template-columns:1fr 1fr}.pym-panel[data-model=drawer] .pym-tiles li:nth-child(3){display:none}
    .pym-panel[data-model=dropdown] .pym-group{grid-template-columns:minmax(0,1fr) 200px}.pym-panel[data-model=dropdown] .pym-links{grid-template-columns:1fr}
    .pym-panel[data-model=dropdown] .pym-tiles ul{grid-template-columns:1fr}.pym-panel[data-model=dropdown] .pym-tiles li:nth-child(n+2){display:none}
    .pym-panel[data-model=index] .pym-links{grid-template-columns:1fr;counter-reset:pymi}
    .pym-panel[data-model=index] .pym-links a{display:grid;grid-template-columns:48px minmax(0,1fr) minmax(0,1fr) 110px;align-items:baseline;border-bottom:1px solid color-mix(in srgb,currentColor 14%,transparent);padding:10px 0}
    .pym-panel[data-model=index] .pym-links a::before{counter-increment:pymi;content:counter(pymi,decimal-leading-zero);font-size:12px;opacity:.6}
    .pym-panel[data-model=index] .pym-link-label{font-family:var(--store-heading-font,var(--kit-display,inherit));font-size:22px}
    .pym-panel[data-model=index] .pym-count{text-align:right;font-size:13px;font-variant-numeric:tabular-nums;opacity:.75}
    .pym-note{display:block;font-size:13px;opacity:.7}
    .pym-links a:has(.pym-note){flex-direction:column;align-items:flex-start;justify-content:center;gap:2px}
    .pym-panel[data-model=dropdown]{left:50%;right:auto;transform:translateX(-50%);width:min(620px,94vw);padding:22px 24px;border-radius:0 0 16px 16px;box-shadow:0 22px 40px -22px #0006}
    @media (max-width:860px){
      .pym-panel[data-model=mega] .pym-group{grid-template-columns:1fr}
      .pym-panel[data-model=mega] .pym-tiles{display:block}.pym-panel[data-model=mega] .pym-tiles ul{display:flex;overflow-x:auto;gap:8px}
      .pym-panel[data-model=mega] .pym-tiles li{flex:0 0 140px}
      .pym-panel[data-model=overlay],.pym-panel[data-model=split]{grid-template-columns:1fr;align-content:start;overflow:auto}
      .pym-panel[data-model=overlay] .pym-hero-photo{grid-column:auto;grid-row:auto;order:9;max-height:30dvh;aspect-ratio:16/10}
      .pym-panel[data-model=split] .pym-hero-photo{grid-row:auto;height:34dvh}
      .pym-panel[data-model=split] .pym-group,.pym-panel[data-model=split] .pym-tabs{grid-column:auto}
      .pym-panel[data-model=drawer]{width:100vw}
      .pym-panel[data-model=dropdown] .pym-group{grid-template-columns:minmax(0,1fr) 92px}
      .pym-panel[data-model=index] .pym-links a{grid-template-columns:minmax(0,1fr) auto}
      .pym-panel[data-model=index] .pym-links a::before,.pym-panel[data-model=index] .pym-note{display:none}
    }
    @media (prefers-reduced-motion:reduce){.pym-panel[data-model] *{transition:none!important;animation:none!important}}
    .pym-best ul{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;list-style:none;margin:0;padding:0}
    .pym-best li{display:grid;gap:6px;align-content:start}.pym-best li>a{display:grid;gap:4px;color:inherit;text-decoration:none;font-size:14px}
    .pym-best img{width:100%;aspect-ratio:4/5;object-fit:cover;border-radius:var(--kit-radius,8px)}
    .pym-best-title{margin:0 0 10px;font-size:12px;letter-spacing:.14em;text-transform:uppercase;opacity:.75}
    .pym-add{display:inline-flex;align-items:center;justify-content:center;min-height:44px;border-radius:999px;border:0;background:var(--store-accent,var(--kit-accent,#111));color:var(--store-on-accent,var(--kit-on-accent,#fff));font:inherit;font-weight:600;text-decoration:none;cursor:pointer}
    .pym-panel[data-model=bestsellers] .pym-group{display:grid;grid-template-columns:minmax(160px,220px) minmax(0,1fr);gap:28px}
    .pym-panel[data-model=bestsellers] .pym-links{grid-template-columns:1fr}.pym-panel[data-model=bestsellers] .pym-tiles{display:none}
    .pym-panel[data-model=need] .pym-group{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:20px}
    .pym-need{display:grid;grid-template-columns:56px minmax(0,1fr);gap:4px 12px;align-items:center;padding:12px;border:1px solid color-mix(in srgb,currentColor 14%,transparent);border-radius:14px}
    .pym-need img{grid-row:1 / span 3;width:56px;height:56px;border-radius:50%;object-fit:cover}
    .pym-need-label{font-family:var(--store-heading-font,var(--kit-display,inherit));font-size:18px}.pym-need-from{font-size:12px;opacity:.75}
    .pym-panel[data-model=need] .pym-tiles{display:none}
    .pym-offer{position:relative;display:grid;align-content:end;gap:4px;min-height:200px;margin-bottom:20px;padding:18px;border-radius:14px;overflow:hidden;color:#fff;background:var(--store-accent,var(--kit-accent,#111));text-decoration:none;isolation:isolate}
    .pym-offer img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;z-index:-1;filter:brightness(.62)}
    .pym-offer b{font-family:var(--store-heading-font,var(--kit-display,inherit));font-size:24px;line-height:1.1}
    .pym-search{margin-bottom:16px}.pym-search input{width:100%;height:52px;border:2px solid currentColor;border-radius:999px;padding:0 20px;font:inherit;font-size:16px;background:transparent;color:inherit}
    .pym-popular{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:20px}.pym-popular a{display:inline-flex;align-items:center;min-height:36px;padding:0 14px;border-radius:999px;background:color-mix(in srgb,currentColor 8%,transparent);font-size:13px;color:inherit;text-decoration:none}
    .pym-panel[data-model=search] .pym-tabs,.pym-panel[data-model=search] .pym-tiles{display:none}
    .pym-thumbbar{display:none}
    @media (max-width:860px){
      .pym-thumbbar{position:fixed;left:0;right:0;bottom:0;z-index:900;display:grid;grid-template-columns:repeat(4,1fr);height:64px;padding-bottom:env(safe-area-inset-bottom,0px);background:var(--store-background,var(--kit-paper,#fff));color:var(--store-foreground,var(--kit-ink,#111));border-top:1px solid color-mix(in srgb,currentColor 12%,transparent)}
      .pym-thumbbar a,.pym-thumbbar button{display:grid;place-items:center;min-height:44px;border:0;background:none;color:inherit;font:inherit;font-size:12px;text-decoration:none}
      body{padding-bottom:var(--pym-bottom-bar,0px)}
      [data-pagosya-contact]:not([data-contact-inline]),.pya-wa,[data-pagosya-assistant]{bottom:calc(var(--pym-bottom-bar,0px) + 16px)!important}
      .product-detail__sticky{bottom:var(--pym-bottom-bar,0px)!important}
      .pym-panel[data-model=bestsellers] .pym-group,.pym-panel[data-model=need] .pym-group{grid-template-columns:1fr}
      .pym-best ul{display:flex;overflow-x:auto}.pym-best li{flex:0 0 140px}
    }
    .pym-circles{display:flex;justify-content:center;gap:26px;padding:10px 24px 22px;overflow-x:auto}
    .pym-circles a{display:grid;justify-items:center;gap:8px;color:inherit;text-decoration:none;font-size:14px;flex:none}
    .pym-circles img{width:88px;height:88px;border-radius:50%;object-fit:cover;outline:2px solid transparent;outline-offset:4px}
    .pym-circles a:is(:hover,:focus-visible) img{outline-color:var(--store-accent,var(--kit-accent,currentColor))}
    .pym-rail{display:none}
    .pym-panel[data-model=stickers]{position:fixed;inset:0;max-height:none;z-index:1000;border:0;padding:clamp(24px,6vw,80px);background:color-mix(in srgb,var(--store-background,var(--kit-paper,#fff)) 78%,transparent);-webkit-backdrop-filter:blur(18px);backdrop-filter:blur(18px);color:var(--store-foreground,var(--kit-ink,#111))}
    .pym-panel[data-model=stickers] .pym-links{display:flex;flex-wrap:wrap;gap:18px 22px;align-content:center;min-height:60dvh}
    .pym-panel[data-model=stickers] .pym-links li:nth-child(odd) a{transform:rotate(-5deg)}.pym-panel[data-model=stickers] .pym-links li:nth-child(even) a{transform:rotate(4deg)}
    .pym-panel[data-model=stickers] .pym-links a{display:inline-flex;align-items:center;gap:10px;padding:10px 22px 10px 10px;border:2px solid currentColor;border-radius:999px;background:var(--store-background,var(--kit-paper,#fff));color:var(--store-foreground,var(--kit-ink,#111));box-shadow:5px 5px 0 var(--store-accent,var(--kit-accent,currentColor));font-family:var(--store-heading-font,var(--kit-display,inherit));font-size:clamp(20px,2.6vw,28px);text-decoration:none;transition:transform .2s}
    .pym-panel[data-model=stickers] .pym-links a:is(:hover,:focus-visible){transform:rotate(0) scale(1.05)}
    .pym-sticker-photo img{width:44px;height:44px;border-radius:50%;object-fit:cover;display:block}
    .pym-panel[data-model=stickers] .pym-tiles{display:none}
    body:has(.pym-dock) :is(.pya-wa,[data-pagosya-assistant]){bottom:92px!important}body:has(.pym-dock) .product-detail__sticky{bottom:80px!important}
    .pym-dock{position:fixed;left:50%;bottom:calc(18px + var(--pym-bottom-bar,0px));transform:translateX(-50%);z-index:950;display:flex;gap:6px;padding:6px;border-radius:999px;background:var(--store-foreground,var(--kit-ink,#111));color:var(--store-background,var(--kit-paper,#fff));box-shadow:0 18px 40px -16px #0008}
    .pym-dock button{min-height:44px;padding:0 18px;border:0;border-radius:999px;background:none;color:inherit;font:inherit;font-weight:600;cursor:pointer}
    .pym-dock button[aria-expanded=true],.pym-dock button:hover{background:var(--store-accent,var(--kit-accent,#fff));color:var(--store-on-accent,var(--kit-on-accent,#111))}
    .pym-panel[data-model=dock]{position:fixed;left:50%;right:auto;top:auto;bottom:86px;transform:translateX(-50%);width:min(680px,94vw);max-height:60dvh;border:0;border-radius:22px;box-shadow:0 30px 60px -20px #0009}
    .pym-panel[data-model=dock] .pym-tabs{display:none}
    @media (min-width:1280px){
      .pym-rail{position:fixed;inset:0 auto 0 0;width:200px;display:grid;grid-template-rows:auto 1fr auto;gap:24px;padding:24px 22px;border-right:1px solid color-mix(in srgb,currentColor 12%,transparent);background:var(--store-background,var(--kit-paper,#fff));color:var(--store-foreground,var(--kit-ink,#111));z-index:40;overflow:auto}
      .pym-rail .pym-links{grid-template-columns:1fr;align-content:start}
      body:has(.pym-rail){padding-left:200px}
      [data-store-menu-model=rail] [data-pagosya-store-menu="toggle"]{display:none}
    }
    @media (max-width:860px){.pym-circles{justify-content:flex-start;gap:14px}.pym-circles img{width:64px;height:64px}.pym-dock{left:10px;right:10px;transform:none;justify-content:space-between}}
    @media (prefers-reduced-motion:reduce){.pym-panel[data-model=stickers] .pym-links a{transform:none!important}}`;
