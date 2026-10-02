/// <reference lib="dom" />
import type { AgentRequirement, RequirementEvidence, ValidationProfile } from './agent-task';

/** Serialized into the isolated browser. No imports or closure state may be used inside this function. */
export function evaluateRequirements(input: { requirements: Array<AgentRequirement & { imagePaths: string[] }>; entry: string; width: number; profile: ValidationProfile }): RequirementEvidence[] {
  const visible = (el: Element) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }); };
  const pathOf = (src: string) => { try { return new URL(src, location.href).pathname.replace(/^\//, ''); } catch { return ''; } };
  return input.requirements.filter(r => r.page === input.entry && r.check !== 'navigation' && (r.profile || 'normal') === input.profile).map(r => {
    let passed = false, observed = '', kind: 'requirement' | 'checker-error' = 'requirement';
    try {
      const nodes = Array.from(document.querySelectorAll(r.selector || 'body'));
      const shown = nodes.filter(visible);
      const text = shown.map(el => (el as HTMLElement).innerText || '').join(' ').toLocaleLowerCase();
      if (r.check === 'text' || r.check === 'absent_text') { observed = text.slice(0, 300); passed = r.check === 'text' ? text.includes(r.expected.toLocaleLowerCase()) : !text.includes(r.expected.toLocaleLowerCase()); }
      if (r.check === 'element') { observed = String(shown.length); passed = shown.length >= Number(r.expected); }
      if (r.check === 'image') {
        const images = nodes.flatMap(el => el.tagName === 'IMG' ? [el as HTMLImageElement] : Array.from(el.querySelectorAll('img'))).filter(visible);
        const missing = r.imagePaths.filter(path => !images.some(img => img.naturalWidth > 0 && pathOf(img.currentSrc || img.src) === path));
        passed = !missing.length; observed = missing.length ? 'Imágenes ausentes o no visibles: ' + missing.join(', ') : r.imagePaths.join(', ');
      }
      if (r.check === 'video') {
        const videos = nodes.flatMap(el => el.tagName === 'VIDEO' ? [el as HTMLVideoElement] : Array.from(el.querySelectorAll('video'))).filter(visible);
        passed = videos.some(video => pathOf(video.currentSrc || video.src) === r.expected.replace(/^\//, '') && video.readyState >= 2 && video.videoWidth > 0 && !video.error);
        observed = videos.map(v => `${pathOf(v.currentSrc || v.src)} readyState=${v.readyState} width=${v.videoWidth} error=${v.error?.code || 0}`).join('; ') || 'Ningún video visible';
      }
      if (r.check === 'video-paused') {
        const videos = nodes.flatMap(el => el.tagName === 'VIDEO' ? [el as HTMLVideoElement] : Array.from(el.querySelectorAll('video'))).filter(video => [video.currentSrc, video.getAttribute('src') || '', ...Array.from(video.querySelectorAll('source')).map(source => source.src)].some(src => src && pathOf(src) === r.expected.replace(/^\//, '')));
        passed = videos.length > 0 && videos.every(video => video.paused);
        observed = videos.map(video => `paused=${video.paused}`).join('; ') || 'No existe el video esperado';
      }
      if (r.check === 'style') {
        const colon = r.expected.indexOf(':'), property = r.expected.slice(0, colon).trim(), expected = r.expected.slice(colon + 1).trim();
        if (colon < 1 || !CSS.supports(property, expected)) throw new Error('Valor CSS inválido');
        const values = shown.map(el => {
          const actual = getComputedStyle(el).getPropertyValue(property).trim();
          // :root has no parentElement. Resolve its expected value in place and
          // restore the exact inline style before evaluating any other check.
          if (el === document.documentElement) {
            const inline = el.getAttribute('style');
            try {
              (el as HTMLElement).style.setProperty(property, expected, 'important');
              return { actual, expected: getComputedStyle(el).getPropertyValue(property).trim() };
            } finally {
              if (inline === null) el.removeAttribute('style');
              else el.setAttribute('style', inline);
            }
          }
          // Resolve expected CSS in the same inherited context (hex/rgb, named colors, lengths).
          const probe = el.cloneNode(false) as HTMLElement;
          probe.removeAttribute('id'); probe.style.setProperty(property, expected, 'important');
          el.parentElement!.appendChild(probe);
          let canonical: string;
          try { canonical = getComputedStyle(probe).getPropertyValue(property).trim(); } finally { probe.remove(); }
          return { actual, expected: canonical };
        });
        passed = values.some(v => {
          if (v.actual === v.expected) return true;
          if (property !== 'font-family') return false;
          const family = (value: string) => value.split(',')[0].trim().replace(/^['"]|['"]$/g, '').toLowerCase();
          const actual = family(v.actual), expected = family(v.expected);
          // An unused fallback does not change a loaded first-choice font. Never equate different primary families.
          let loaded = false;
          document.fonts.forEach(face => { if (family(face.family) === expected && face.status === 'loaded') loaded = true; });
          return actual === expected && (loaded || ['serif','sans-serif','monospace','system-ui','cursive','fantasy'].includes(expected));
        }); observed = JSON.stringify(values);
      }
      if (r.check === 'layout') {
        if (r.expected === 'no-overflow') { observed = `${document.documentElement.scrollWidth}/${innerWidth}`; passed = document.documentElement.scrollWidth <= innerWidth + 2; }
        else if (r.expected === 'viewport-cover') { passed = shown.some(el => { const b = el.getBoundingClientRect(); return b.width >= innerWidth - 2 && b.height >= innerHeight - 2; }); observed = shown.map(el => { const b = el.getBoundingClientRect(); return `${Math.round(b.width)}x${Math.round(b.height)} viewport=${innerWidth}x${innerHeight}`; }).join('; '); }
        else throw new Error('Comprobación de composición desconocida');
      }
    } catch (error) { kind = 'checker-error'; observed = (error as Error).message.slice(0, 300); }
    return { id: r.id, page: input.entry, width: input.width, profile: input.profile, passed, kind, expected: r.expected, observed, detail: `${passed ? 'Cumple' : kind === 'checker-error' ? 'Comprobación inválida' : 'No cumple'}: ${r.description} (${r.selector || 'body'}; esperado ${r.expected}; observado ${observed || 'sin coincidencias'})` };
  });
}
