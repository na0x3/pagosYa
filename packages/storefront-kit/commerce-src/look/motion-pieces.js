  // Motion pieces (owner 2026-10-22): tested animations YAPI may put on photos, badges and decoration with data-pya-motion
  // (float, bob, spin, breathe, bubbles, marquee, pop, zoom). Never text, navigation, cart, selectors or checkout; everything
  // stops with reduced motion and pauses off screen. data-pya-motion-speed="slow|fast" and data-pya-motion-delay="0-600".
  (function motionPieces() {
    const style = document.createElement('style');
    style.setAttribute('data-pagosya-motion-pieces', '');
    style.textContent = `@layer pagosya-motion{
      [data-pya-motion=marquee]{display:flex;width:max-content;white-space:nowrap}
      [data-pya-motion=bubbles]{position:relative;overflow:hidden}
      [data-pya-motion=bubbles]>i[data-pya-bubble]{position:absolute;bottom:-60px;width:var(--s,28px);height:var(--s,28px);border-radius:50%;background:color-mix(in srgb,currentColor 18%,transparent);pointer-events:none}
      @media (prefers-reduced-motion:no-preference){
        [data-pya-motion=float]{animation:pya-float 5s ease-in-out infinite}
        [data-pya-motion=bob]{animation:pya-float 3s ease-in-out infinite}
        [data-pya-motion=spin]{animation:pya-spin 14s linear infinite}
        [data-pya-motion=breathe]{animation:pya-breathe 4.5s ease-in-out infinite}
        [data-pya-motion=marquee]{animation:pya-slide 38s linear infinite}
        [data-pya-motion=pop]{animation:pya-pop .6s cubic-bezier(.34,1.56,.64,1) both}
        [data-pya-motion=zoom]{animation:pya-zoom 22s ease-in-out infinite alternate}
        [data-pya-motion=bubbles]>i[data-pya-bubble]{animation:pya-rise var(--d,9s) linear infinite;animation-delay:var(--w,0s)}
        [data-pya-motion=float][data-pya-motion-speed=slow]{animation-duration:8s}[data-pya-motion=float][data-pya-motion-speed=fast]{animation-duration:3s}
        [data-pya-motion=spin][data-pya-motion-speed=slow]{animation-duration:22s}[data-pya-motion=spin][data-pya-motion-speed=fast]{animation-duration:8s}
        [data-pya-motion=breathe][data-pya-motion-speed=slow]{animation-duration:7s}[data-pya-motion=breathe][data-pya-motion-speed=fast]{animation-duration:3s}
        [data-pya-motion=marquee][data-pya-motion-speed=slow]{animation-duration:60s}[data-pya-motion=marquee][data-pya-motion-speed=fast]{animation-duration:22s}
        [data-pya-motion=zoom][data-pya-motion-speed=slow]{animation-duration:30s}[data-pya-motion=zoom][data-pya-motion-speed=fast]{animation-duration:14s}
        [data-pya-motion][data-pya-offscreen]{animation-play-state:paused}
      }
      :is([data-pagosya-cart],[data-pagosya-checkout],.pya-checkout,nav,header) [data-pya-motion]{animation:none!important}
      @keyframes pya-float{0%,100%{transform:translateY(0) rotate(0)}50%{transform:translateY(-14px) rotate(1.5deg)}}
      @keyframes pya-spin{to{transform:rotate(360deg)}}
      @keyframes pya-breathe{0%,100%{transform:scale(.94);opacity:.75}50%{transform:scale(1.06);opacity:1}}
      @keyframes pya-slide{to{transform:translateX(-50%)}}
      @keyframes pya-pop{from{opacity:0;transform:scale(.6)}to{opacity:1;transform:none}}
      @keyframes pya-zoom{from{transform:scale(1)}to{transform:scale(1.12)}}
      @keyframes pya-rise{0%{transform:translateY(0);opacity:0}10%{opacity:1}100%{transform:translateY(-900px);opacity:0}}
    }`;
    document.head.append(style);
    const reduced = Boolean(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    const SIZES = [22, 40, 16, 30, 20, 46, 18, 28], LEFT = [6, 18, 32, 47, 61, 73, 86, 94];
    const fill = root => root.querySelectorAll('[data-pya-motion=bubbles]').forEach(host => {
      if (reduced || host.querySelector('[data-pya-bubble]')) return;
      SIZES.forEach((size, index) => {
        const bubble = document.createElement('i'); bubble.setAttribute('data-pya-bubble', ''); bubble.setAttribute('aria-hidden', 'true');
        bubble.style.cssText = `--s:${size}px;left:${LEFT[index]}%;--d:${7 + (index % 3) * 2.5}s;--w:-${(index * 1.3).toFixed(1)}s`;
        host.append(bubble);
      });
    });
    const delays = root => root.querySelectorAll('[data-pya-motion-delay]').forEach(el => {
      el.style.animationDelay = Math.max(0, Math.min(600, Number(el.getAttribute('data-pya-motion-delay')) || 0)) + 'ms';
    });
    const observer = typeof IntersectionObserver === 'function'
      ? new IntersectionObserver(entries => entries.forEach(entry => entry.target.toggleAttribute('data-pya-offscreen', !entry.isIntersecting)))
      : null;
    const watch = root => { fill(root); delays(root); if (observer) root.querySelectorAll('[data-pya-motion]').forEach(el => observer.observe(el)); };
    watch(document);
    new MutationObserver(records => records.forEach(record => record.addedNodes.forEach(node => {
      if (node.nodeType === 1 && !node.hasAttribute('data-pya-bubble') && node.parentNode) watch(node.parentNode);
    }))).observe(document.body || document.documentElement, { childList: true, subtree: true });
  })();
