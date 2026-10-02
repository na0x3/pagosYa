// Only geometry crosses this boundary. The trusted parent owns the form and its inputs.
(() => {
  const start = () => {
    const gate = document.querySelector('[data-account-gate]');
    const container = gate?.querySelector('.ui-container');
    if (!gate || !container) return;
    const view = gate.getAttribute('data-account-gate');
    let attached = false, queued = false;
    const report = () => {
      queued = false;
      const r = container.getBoundingClientRect();
      parent.postMessage({type:'pagosya:account-slot', view, rect:{left:r.left,top:r.top,width:r.width,height:r.height}}, '*');
    };
    const schedule = () => { if (!queued) { queued = true; requestAnimationFrame(report); } };
    window.addEventListener('message', event => {
      if (event.source !== parent) return;
      if (event.data?.type === 'pagosya:account-scroll' && Number.isFinite(event.data.delta)) { window.scrollBy(0, Math.max(-1000,Math.min(1000,event.data.delta))); return; }
      if (event.data?.type !== 'pagosya:account-slot-size') return;
      const height = event.data.height;
      if (!Number.isFinite(height) || height < 200 || height > 2000) return;
      if (attached && container.style.height === height + 'px') return;
      if (!attached) { attached = true; [...container.children].forEach(child => { child.hidden = true; child.style.setProperty('display','none','important'); }); }
      container.style.height = height + 'px';
      schedule();
    });
    window.addEventListener('resize', schedule);
    window.addEventListener('scroll', schedule, true);
    new ResizeObserver(schedule).observe(document.body);
    schedule();
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
