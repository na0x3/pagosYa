// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { collectStoreResources } from './source-library';
import type { SourceSnapshot } from './source-preview';
const snapshot = (files: SourceSnapshot['files']): SourceSnapshot => ({schemaVersion:1,brief:{businessType:'',audience:'',primaryAction:'',visualDirection:''},files});
describe('store resource library', () => {
  it('includes saved, referenced, inline and catalog media, with deduplicated uses', () => {
    const result = collectStoreResources(snapshot([
      {path:'assets/cover.webp',encoding:'base64',content:'AAAA'},
      {path:'assets/unused.mp4',encoding:'base64',content:'AAAA'},
      {path:'index.html',content:'<title>Inicio</title><h1>Suéteres suaves</h1><img src="assets/cover.webp"><svg viewBox="0 0 24 24"><path d="M0 0"/></svg>'},
      {path:'pages/about.html',content:'<img src="../assets/cover.webp"><p>Hecho en Bolivia</p><script>SECRET_SCRIPT</script>'},
    ]), {items:[{name:'Azul',imageUrls:['/v1/uploads/a.webp'],variants:[{imageUrl:'https://cdn.example.test/blue.webp'}]}]}, {});
    expect(result.media).toHaveLength(5);
    expect(result.media.find(item=>item.name==='cover.webp')?.uses).toEqual(['index.html','pages/about.html']);
    expect(result.media.some(item=>item.kind==='video')).toBe(true);
    expect(result.media.some(item=>item.kind==='icon')).toBe(true);
    expect(result.media.find(item=>item.name==='Azul')?.url).toContain('/v1/uploads/a.webp');
    expect(result.pages[0].text).toContain('Suéteres suaves');
    expect(JSON.stringify(result.pages)).not.toContain('SECRET_SCRIPT');
  });
  it('handles stores without a source design and excludes unsafe URLs', () => {
    const result = collectStoreResources(undefined,{items:[{name:'Producto',imageUrls:['javascript:alert(1)','https://example.test/a.png']}]},{logoUrl:'https://example.test/logo.svg'});
    expect(result.media).toHaveLength(2); expect(result.pages).toEqual([]);
  });
  it('collects backgrounds and configured section images', () => {
    const result = collectStoreResources(snapshot([{path:'style.css',content:'main{background:url(https://example.test/bg.webp)}'},{path:'config.js',content:'window.PAGOSYA_CONFIG = {"data":{"sections":[{"imageUrl":"https://example.test/section.webp"}]}};'}]),{},{});
    expect(result.media.map(item=>item.url)).toEqual(['https://example.test/bg.webp','https://example.test/section.webp']);
  });
});
