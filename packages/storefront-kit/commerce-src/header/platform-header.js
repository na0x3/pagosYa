  // ---- Platform header (spec 2026-10-13 showcase stores and the header library) ----
  // The platform writes the header (header[data-pagosya-header]); the kit owns how it behaves. One menu: it takes the focus
  // when it opens; Escape, its close button, its backdrop or any choice inside it closes it; Tab stays inside it; and the
  // scroll lock it set always goes back to what the page had (part 1: a lock left behind froze the page).
  function initPlatformHeader() {
    const header = document.querySelector('header[data-pagosya-header]');
    if (!header || header.hasAttribute('data-header-ready')) return;
    header.setAttribute('data-header-ready', '');
    const menu = header.querySelector('[data-pagosya-header-menu]');
    const toggles = [...header.querySelectorAll('[data-pagosya-header-toggle]')];
    const focusable = () => (menu ? [...menu.querySelectorAll('a[href],button:not([disabled])')] : []);
    let lockedFrom = null, opener = null;
    const isOpen = () => Boolean(menu && !menu.hidden);
    const setOpen = (open, returnFocus) => {
      if (!menu || open === isOpen()) return;
      menu.hidden = !open;
      toggles.forEach(toggle => toggle.setAttribute('aria-expanded', String(open)));
      if (open) {
        lockedFrom = document.documentElement.style.overflow;
        document.documentElement.style.overflow = 'hidden';
        (focusable()[0] || menu).focus({ preventScroll: true });
        return;
      }
      document.documentElement.style.overflow = lockedFrom || '';
      lockedFrom = null;
      if (returnFocus) (opener || toggles[0])?.focus({ preventScroll: true });
    };
    toggles.forEach(toggle => toggle.addEventListener('click', () => { opener = toggle; setOpen(!isOpen(), true); }));
    header.querySelector('[data-pagosya-header-close]')?.addEventListener('click', () => setOpen(false, true));
    menu?.addEventListener('click', event => {
      if (event.target === menu) setOpen(false, true);
      else if (event.target.closest('a[href],[data-cart-open],[data-pagosya-account]')) setOpen(false, false);
    });
    menu?.addEventListener('keydown', event => {
      if (event.key !== 'Tab') return;
      const items = focusable();
      if (!items.length) return;
      const first = items[0], last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    });
    document.addEventListener('keydown', event => { if (event.key === 'Escape' && isOpen()) { event.preventDefault(); setOpen(false, true); } });
    window.addEventListener('pagehide', () => setOpen(false, false));
    const shape = header.getAttribute('data-shape');
    if (shape === 'shrinking' || shape === 'reveal') {
      let last = window.scrollY;
      const onScroll = () => {
        const y = window.scrollY;
        // Shrinking moves the page under the bar, so it shrinks past 80px and grows back only near the top: one threshold
        // would toggle by itself (final review, 2026-10-13).
        if (shape === 'shrinking') header.toggleAttribute('data-scrolled', header.hasAttribute('data-scrolled') ? y > 8 : y > 80);
        else header.toggleAttribute('data-hidden', y > 120 && y > last && !isOpen());
        last = y;
      };
      window.addEventListener('scroll', onScroll, { passive: true });
      onScroll();
    }
  }
  initPlatformHeader();
