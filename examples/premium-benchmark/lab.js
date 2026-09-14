const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const names = { food: 'Mesa Clara', apparel: 'Trama', beauty: 'Bruma', technical: 'Punto', home: 'Pliegue', single: 'Aire' };
const states = { UNCHANGED: 'Review retained the original', FAILED: 'Review stopped; original retained', APPLIED: 'Verified repair saved', RETAINED_BASELINE: 'Candidate rejected; original retained', INTERRUPTED: 'Review interrupted' };
fetch('results.json').then(r => r.json()).then(results => {
  const completed = results.filter(r => r.status === 'completed');
  const checks = completed.flatMap(r => r.shopping || []);
  document.querySelector('#metrics').innerHTML = [[`${completed.length} / 36`, 'stores generated'], [checks.filter(c => c.status === 'passed').length, 'simulated purchase checks passed'], [new Set(completed.map(r => r.fixture)).size, 'catalog types generated']].map(([n,s]) => `<div><strong>${n}</strong><span>${s}</span></div>`).join('');
  function draw() {
    const category = document.querySelector('#category').value;
    const pairs = [...new Set(results.filter(r => category === 'all' ? r.status === 'completed' : r.fixture === category).map(r => `${r.fixture}-${r.repeat}`))];
    document.querySelector('#studies-list').innerHTML = pairs.map(pair => {
      const rows = results.filter(r => `${r.fixture}-${r.repeat}` === pair), first = rows[0];
      return `<article class="study"><div class="study-title"><h3>${names[first.fixture]}</h3><span>${escape(first.fixture)} · repetition ${first.repeat}</span></div><div class="pair">${['baseline','candidate'].map(arm => {
        const r = rows.find(r => r.arm === arm); if (!r || r.status !== 'completed') return `<div class="work"><div class="work-heading"><strong>${arm === 'baseline' ? 'Generation only' : 'Generation + review'}</strong></div><div class="unavailable">${r?.status === 'failed' ? 'Generation did not complete.' : 'Run stopped or not started.'}<br>The OpenAI balance interrupted this experiment.</div></div>`;
        const cover = r.captures?.find(c => c.viewport === 'desktop' && c.y === 0), mobile = r.captures?.find(c => c.viewport === 'mobile' && c.y === 0);
        const passed = r.shopping?.filter(c => c.status === 'passed').length || 0, total = r.shopping?.length || 0;
        const site = `${r.id}/${r.job?.status === 'APPLIED' ? 'reviewed' : 'site'}/index.html`;
        return `<div class="work"><div class="work-heading"><strong>${arm === 'baseline' ? 'Generation only' : 'Generation + review'}</strong><span class="badge">${passed}/${total} purchase checks</span></div>${cover ? `<a class="preview" href="${site}" target="_blank" rel="noopener"><img loading="lazy" width="1280" height="844" src="${r.id}/${cover.path}" alt="${escape(names[r.fixture])}, ${arm} storefront"></a>` : '<div class="unavailable">Capture unavailable</div>'}<p class="detail">${escape(r.job ? states[r.job.status] || r.job.status : 'Original generated design')} · desktop and mobile evidence</p><nav><a href="${site}" target="_blank" rel="noopener">Explore store ↗</a>${mobile ? `<a href="${r.id}/${mobile.path}" target="_blank" rel="noopener">Mobile capture ↗</a>` : ''}<a href="${r.id}/evidence.json">Original evidence ↗</a>${r.remediation ? `<a href="${r.id}/corrected/index.html" target="_blank" rel="noopener">Corrected demo · 4/4 checks ↗</a>` : ''}</nav></div>`;
      }).join('')}</div></article>`;
    }).join('');
  }
  document.querySelector('#category').addEventListener('change', draw); draw();
}).catch(() => { document.querySelector('#studies-list').textContent = 'Evidence is not available yet. Refresh after collection finishes.'; });
