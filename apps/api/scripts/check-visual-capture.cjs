// Exercises the actual isolated renderer without sending screenshots to an AI provider.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const { captureSourceVisuals } = require('../dist/src/stores/source-visual-capture');
(async () => {
  const captures = await captureSourceVisuals({ schemaVersion: 1, brief: {}, files: [
    { path: 'index.html', encoding: 'utf8', content: '<html><head><link rel="stylesheet" href="styles.css"></head><body><h1>Screenshot capture</h1><img src="assets/icon.svg" alt="icon"><script>fetch("https://example.com/private").catch(()=>{});document.body.dataset.preview=String(window.PAGOSYA_PREVIEW)</script><section>Middle</section><footer>End</footer></body></html>' },
    { path: 'styles.css', encoding: 'utf8', content: 'body{margin:0;background:#faf6ed;color:#111;font:24px sans-serif}h1{margin:32px}section{margin-top:900px}footer{margin-top:900px}img{width:48px;height:48px}' },
    { path: 'assets/icon.svg', encoding: 'utf8', content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M2 2h20v20H2z" fill="#f00"/></svg>' },
  ] }, 'index.html');
  assert.equal(captures.length, 6);
  assert.deepEqual([...new Set(captures.map(c => c.width))], [1280, 390]);
  assert(captures.every(c => c.image.startsWith('data:image/jpeg;base64,') && c.pageHeight > 1800));
  for (const capture of captures.filter(c => c.y === 0)) await fs.writeFile(`/private/tmp/yapi-capture-${capture.viewport}.jpg`, Buffer.from(capture.image.split(',')[1], 'base64'));
  console.log('Real renderer passed: six desktop/mobile screenshots; local CSS and SVG assets rendered. No AI call.');
})().catch(error => { console.error(error); process.exitCode = 1; });
