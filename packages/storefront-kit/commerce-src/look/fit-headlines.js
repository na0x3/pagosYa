  // A headline never splits a word (2026-10-16, baek's Nosotros: «NUESTR / A HISTORI / A»). The layout baseline lets h1/h2
  // break inside a word rather than spill sideways, and a model that sets 11rem in a narrow column gets exactly that. When a
  // word does not fit its line, the headline steps down in size until every word is whole, never below 55% of its authored
  // size: a single word wider than a phone still breaks, as the baseline intends. A size the store set inline is never touched.
  const FIT_MIN = .55;
  const fitWords = /[^\s\-‐–—/]{2,}/g;
  function splitsWord(heading) {
    const walker = document.createTreeWalker(heading, NodeFilter.SHOW_TEXT);
    const range = document.createRange();
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      for (const match of node.data.matchAll(fitWords)) {
        range.setStart(node, match.index); range.setEnd(node, match.index + match[0].length);
        const lines = new Set(Array.from(range.getClientRects()).filter(rect => rect.width > 0).map(rect => Math.round(rect.top)));
        if (lines.size > 1) return true;
      }
    }
    return false;
  }
  function fitHeadline(heading) {
    if (heading.closest('[data-pagosya-fit="off"]')) return;
    // A size this left behind is taken back first, so a wider window gets the authored size again.
    if (heading.hasAttribute('data-pagosya-fit') && heading.style.fontSize === heading.getAttribute('data-pagosya-fit')) heading.style.removeProperty('font-size');
    heading.removeAttribute('data-pagosya-fit');
    if (heading.style.fontSize || !heading.getClientRects().length || !splitsWord(heading)) return;
    const authored = parseFloat(getComputedStyle(heading).fontSize);
    if (!authored) return;
    for (let size = authored * .94; size >= authored * FIT_MIN; size *= .94) {
      heading.style.fontSize = `${size.toFixed(2)}px`;
      heading.setAttribute('data-pagosya-fit', heading.style.fontSize);
      if (!splitsWord(heading)) return;
    }
  }
  function fitHeadlines() {
    Array.from(document.querySelectorAll('h1,h2')).slice(0, 80).forEach(fitHeadline);
  }
  // Some embedded browsers (and jsdom) have no animation frames: a timer stands in rather than throwing on every page.
  const nextFrame = typeof requestAnimationFrame === 'function' ? requestAnimationFrame : callback => setTimeout(callback, 16);
  const cancelFrame = typeof cancelAnimationFrame === 'function' ? cancelAnimationFrame : clearTimeout;
  let fitFrame = 0;
  const scheduleFit = () => { cancelFrame(fitFrame); fitFrame = nextFrame(fitHeadlines); };
  addEventListener('resize', scheduleFit, { passive: true });
  document.addEventListener('pagosya:ready', scheduleFit);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(scheduleFit, scheduleFit);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', scheduleFit, { once: true }); else scheduleFit();
