/* pagosya-video:start */
(() => {
  'use strict';
  if (window.PAGOSYA_VIDEO_LOOP) return;
  window.PAGOSYA_VIDEO_LOOP = true;
  const initialized = new WeakSet();
  const start = video => {
    if (!video.loop) video.loop = true;
    if (initialized.has(video)) return;
    initialized.add(video);
    video.defaultMuted = true;
    video.muted = true;
    video.autoplay = true;
    video.playsInline = true;
    // Autoplay remains available when media loads; explicit pause stays respected.
    video.play().catch(() => {});
  };
  const enable = root => {
    if (root.nodeType !== 1) return;
    if (root.matches('video')) start(root);
    root.querySelectorAll('video').forEach(start);
  };
  enable(document.documentElement);
  new MutationObserver(records => {
    for (const record of records) {
      if (record.type === 'attributes') enable(record.target);
      else record.addedNodes.forEach(enable);
    }
  }).observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['loop'] });
})();
/* pagosya-video:end */
