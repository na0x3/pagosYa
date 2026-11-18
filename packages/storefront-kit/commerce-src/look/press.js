  // Every button answers a touch (owner 2026-11-07: «cuando los botones se toquen algo pase alguna animación… en general todos
  // los botones»): a short squeeze that springs back, played whole even on a quick tap, and a ring that grows out of it. It uses the
  // separate `scale` property and the outline, so a button's own transform, hover lift and shadow still apply. Nothing moves with
  // reduced motion.
  (function pressFeedback() {
    if (document.querySelector('style[data-pagosya-press]')) return;
    const PRESSABLE = 'button,[role=button],input[type=submit],input[type=button],a[class*="btn"],a[class*="button"],a[class*="cta"],a[class*="chip"],.pya-launcher';
    const style = document.createElement('style');
    style.setAttribute('data-pagosya-press', '');
    style.textContent = `@layer pagosya-motion{
      @media (prefers-reduced-motion:no-preference){
        .pya-pressed{animation:pya-press .36s cubic-bezier(.3,1.5,.5,1),pya-press-ring .5s ease-out}
        .pya-pressed.pya-pressed--big{animation:pya-press-big .36s cubic-bezier(.3,1.5,.5,1),pya-press-ring .5s ease-out}
      }
      @keyframes pya-press{0%{scale:1}28%{scale:.93}100%{scale:1}}
      @keyframes pya-press-big{0%{scale:1}28%{scale:.985}100%{scale:1}}
      @keyframes pya-press-ring{0%{outline:2px solid color-mix(in srgb,var(--kit-accent,var(--es-accent,currentColor)) 55%,transparent);outline-offset:0}100%{outline:2px solid transparent;outline-offset:9px}}
    }`;
    (document.head || document.documentElement).append(style);
    const play = target => {
      const el = target instanceof Element ? target.closest(PRESSABLE) : null;
      if (!el || el.matches(':disabled,[aria-disabled=true]')) return;
      const box = el.getBoundingClientRect();
      // A whole card or a full-width bar only nods: squeezing something that big would jolt the page.
      el.classList.toggle('pya-pressed--big', box.width > 480 || box.height > 160);
      el.classList.remove('pya-pressed');
      void el.offsetWidth;
      el.classList.add('pya-pressed');
    };
    document.addEventListener('pointerdown', event => { if (event.button === 0) play(event.target); }, { capture: true, passive: true });
    // Enter or Space on a focused button clicks without a pointer (detail 0): it answers the same way.
    document.addEventListener('click', event => { if (event.detail === 0) play(event.target); }, true);
    document.addEventListener('animationend', event => {
      if (event.animationName === 'pya-press-ring' && event.target instanceof Element) event.target.classList.remove('pya-pressed', 'pya-pressed--big');
    }, true);
  })();
