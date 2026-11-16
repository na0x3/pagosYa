  // One look per menu model (spec 2026-11-15 store menu models), read after STORE_MENU_CSS; everything is keyed on [data-model].
  const STORE_MENU_MODEL_CSS = `
    .pym-panel[data-model=mega]{padding:28px max(24px,calc((100% - 1280px)/2)) 36px}
    .pym-panel[data-model=mega] .pym-group{display:grid;grid-template-columns:minmax(180px,240px) repeat(3,minmax(0,1fr));gap:16px}
    .pym-panel[data-model=mega] .pym-links{grid-template-columns:1fr;font-size:12px;letter-spacing:.14em;text-transform:uppercase}
    .pym-panel[data-model=mega] .pym-tiles,.pym-panel[data-model=mega] .pym-tiles ul{display:contents}
    .pym-panel[data-model=mega] .pym-tiles-title{display:none}
    .pym-panel[data-model=mega] .pym-tiles a{position:relative;display:block;aspect-ratio:1;overflow:hidden;border-radius:var(--kit-radius,0)}
    .pym-panel[data-model=mega] .pym-tiles img{position:absolute;inset:0;width:100%;height:100%;aspect-ratio:auto;object-fit:cover}
    .pym-panel[data-model=mega] .pym-tile-title{position:absolute;inset:auto 12px 14px;color:#fff;font-family:var(--store-heading-font,inherit);font-size:18px;letter-spacing:.08em;text-transform:uppercase;text-shadow:0 2px 12px #0008}
    .pym-panel[data-model=overlay],.pym-panel[data-model=split]{position:fixed;inset:0;max-height:none;z-index:1000;border:0;display:grid;grid-template-columns:minmax(0,1.1fr) minmax(0,1fr);gap:40px;align-items:center;padding:clamp(24px,5vw,72px)}
    .pym-panel[data-model=overlay]{background:var(--store-accent,#111);color:var(--store-on-accent,#fff)}
    .pym-panel[data-model=overlay] .pym-tabs{grid-column:1/-1}
    .pym-panel[data-model=overlay] .pym-links{grid-template-columns:1fr;gap:4px}
    .pym-panel[data-model=overlay] .pym-links a{font-family:var(--store-heading-font,inherit);font-size:clamp(36px,5vw,64px);line-height:1.05;opacity:.55;transition:opacity .2s}
    .pym-panel[data-model=overlay] .pym-links a:is(:hover,:focus-visible){opacity:1;text-decoration:none;color:inherit}
    .pym-panel[data-model=overlay] .pym-tiles{display:none}
    .pym-hero-photo{border-radius:var(--kit-radius-panel,18px);overflow:hidden;aspect-ratio:4/5;max-height:70dvh}
    .pym-hero-photo img{width:100%;height:100%;object-fit:cover;transition:opacity .2s}
    .pym-panel[data-model=overlay] .pym-hero-photo{grid-column:2;grid-row:1 / span 3}
    .pym-panel[data-model=split]{padding:0;gap:0;background:var(--store-surface,var(--store-background,#fff))}
    .pym-panel[data-model=split] .pym-hero-photo{grid-row:1 / span 3;height:100dvh;max-height:none;aspect-ratio:auto;border-radius:0}
    .pym-panel[data-model=split] .pym-group,.pym-panel[data-model=split] .pym-tabs{grid-column:2;margin-inline:clamp(24px,5vw,64px)}
    .pym-panel[data-model=split] .pym-links a{font-family:var(--store-heading-font,inherit);font-size:22px}
    .pym-panel[data-model=split] .pym-tiles{display:none}
    .pym-panel[data-model=drawer]{position:fixed;inset:0 auto 0 0;width:min(440px,88vw);max-height:none;z-index:1000;padding:24px 28px;border-top:0;background:var(--store-foreground,#111);color:var(--store-background,#fff)}
    .pym-panel[data-model=drawer] .pym-group{display:grid;grid-template-rows:1fr auto;gap:24px;min-height:calc(100dvh - 140px)}
    .pym-panel[data-model=drawer] .pym-links{grid-template-columns:1fr;align-content:start}
    .pym-panel[data-model=drawer] .pym-links a{font-family:var(--store-heading-font,inherit);font-size:28px;font-style:italic;color:inherit}
    .pym-panel[data-model=drawer] .pym-tiles ul{grid-template-columns:1fr 1fr}.pym-panel[data-model=drawer] .pym-tiles li:nth-child(3){display:none}
    .pym-panel[data-model=dropdown] .pym-group{grid-template-columns:minmax(0,1fr) 200px}.pym-panel[data-model=dropdown] .pym-links{grid-template-columns:1fr}
    .pym-panel[data-model=dropdown] .pym-tiles ul{grid-template-columns:1fr}.pym-panel[data-model=dropdown] .pym-tiles li:nth-child(n+2){display:none}
    .pym-panel[data-model=index] .pym-links{grid-template-columns:1fr;counter-reset:pymi}
    .pym-panel[data-model=index] .pym-links a{display:grid;grid-template-columns:48px minmax(0,1fr) minmax(0,1fr) 110px;align-items:baseline;border-bottom:1px solid color-mix(in srgb,currentColor 14%,transparent);padding:10px 0}
    .pym-panel[data-model=index] .pym-links a::before{counter-increment:pymi;content:counter(pymi,decimal-leading-zero);font-size:12px;opacity:.6}
    .pym-panel[data-model=index] .pym-link-label{font-family:var(--store-heading-font,inherit);font-size:22px}
    .pym-panel[data-model=index] .pym-count{text-align:right;font-size:13px;font-variant-numeric:tabular-nums;opacity:.75}
    .pym-note{font-size:13px;opacity:.7}
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
    .pym-add{display:inline-flex;align-items:center;justify-content:center;min-height:44px;border-radius:999px;border:0;background:var(--store-accent,#111);color:var(--store-on-accent,#fff);font:inherit;font-weight:600;text-decoration:none;cursor:pointer}
    .pym-panel[data-model=bestsellers] .pym-group{display:grid;grid-template-columns:minmax(160px,220px) minmax(0,1fr);gap:28px}
    .pym-panel[data-model=bestsellers] .pym-links{grid-template-columns:1fr}.pym-panel[data-model=bestsellers] .pym-tiles{display:none}
    .pym-panel[data-model=need] .pym-group{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:20px}
    .pym-need{display:grid;grid-template-columns:56px minmax(0,1fr);gap:4px 12px;align-items:center;padding:12px;border:1px solid color-mix(in srgb,currentColor 14%,transparent);border-radius:14px}
    .pym-need img{grid-row:1 / span 3;width:56px;height:56px;border-radius:50%;object-fit:cover}
    .pym-need-label{font-family:var(--store-heading-font,inherit);font-size:18px}.pym-need-from{font-size:12px;opacity:.75}
    .pym-panel[data-model=need] .pym-tiles{display:none}
    .pym-offer{position:relative;display:grid;align-content:end;gap:4px;min-height:200px;margin-bottom:20px;padding:18px;border-radius:14px;overflow:hidden;color:#fff;background:var(--store-accent,#111);text-decoration:none;isolation:isolate}
    .pym-offer img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;z-index:-1;filter:brightness(.62)}
    .pym-offer b{font-family:var(--store-heading-font,inherit);font-size:24px;line-height:1.1}
    .pym-search{margin-bottom:16px}.pym-search input{width:100%;height:52px;border:2px solid currentColor;border-radius:999px;padding:0 20px;font:inherit;font-size:16px;background:transparent;color:inherit}
    .pym-popular{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:20px}.pym-popular a{display:inline-flex;align-items:center;min-height:36px;padding:0 14px;border-radius:999px;background:color-mix(in srgb,currentColor 8%,transparent);font-size:13px;color:inherit;text-decoration:none}
    .pym-panel[data-model=search] .pym-tabs,.pym-panel[data-model=search] .pym-tiles{display:none}
    .pym-thumbbar{display:none}
    @media (max-width:860px){
      .pym-thumbbar{position:fixed;left:0;right:0;bottom:0;z-index:900;display:grid;grid-template-columns:repeat(4,1fr);height:64px;padding-bottom:env(safe-area-inset-bottom,0px);background:var(--store-background,#fff);color:var(--store-foreground,#111);border-top:1px solid color-mix(in srgb,currentColor 12%,transparent)}
      .pym-thumbbar a,.pym-thumbbar button{display:grid;place-items:center;min-height:44px;border:0;background:none;color:inherit;font:inherit;font-size:12px;text-decoration:none}
      body{padding-bottom:var(--pym-bottom-bar,0px)}
      [data-pagosya-contact]:not([data-contact-inline]),.pagosya-whatsapp{bottom:calc(var(--pym-bottom-bar,0px) + 16px)!important}
      .pym-panel[data-model=bestsellers] .pym-group,.pym-panel[data-model=need] .pym-group{grid-template-columns:1fr}
      .pym-best ul{display:flex;overflow-x:auto}.pym-best li{flex:0 0 140px}
    }`;
