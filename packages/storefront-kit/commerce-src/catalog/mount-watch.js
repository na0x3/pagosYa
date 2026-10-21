  // ---- Catalogue mounts that change (spec 2026-10-21 John Smedley sections) ----
  // A page can switch a mount's category or colour after load (the `explore` section's chips): the catalogue redraws once per
  // change, after the page has finished setting its attributes.
  if (typeof MutationObserver === 'function') {
    let mountRedraw = false;
    new MutationObserver(records => {
      if (mountRedraw || !records.some(record => record.target.matches?.('[data-pagosya-catalog]'))) return;
      mountRedraw = true;
      queueMicrotask(() => { mountRedraw = false; render(); });
    }).observe(document.documentElement, { attributes: true, subtree: true, attributeFilter: ['data-category', 'data-color'] });
  }
