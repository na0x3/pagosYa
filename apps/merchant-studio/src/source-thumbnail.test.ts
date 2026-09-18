// @vitest-environment jsdom
import { afterEach, it, expect, vi } from 'vitest';
afterEach(()=>{sessionStorage.clear();history.replaceState({},'', '/');vi.unstubAllGlobals();vi.resetModules();});
it('loads a thumbnail through the dashboard API base with its merchant session',async()=>{
  history.replaceState({},'', '/studio/?thumbnail=1&store=store-b&revision=3');
  sessionStorage.setItem('pagosya_merchant_api_base','http://localhost:3001/v1');sessionStorage.setItem('pagosya_merchant_session','fixture-session');
  const fetch=vi.fn().mockResolvedValue({ok:true,status:200,json:async()=>({revision:3,snapshot:{schemaVersion:1,brief:{},files:[{path:'index.html',content:'<h1>Store B</h1>'}]}})});vi.stubGlobal('fetch',fetch);
  const {mountSourceThumbnail}=await import('./source-thumbnail');const app=document.createElement('div');await mountSourceThumbnail(app);
  expect(fetch.mock.calls[0][0]).toBe('http://localhost:3001/v1/stores/store-b/source-project/versions/3');
  expect(fetch.mock.calls[0][1].headers.get('Authorization')).toBe('Bearer fixture-session');
  expect(app.querySelector('iframe')?.srcdoc).toContain('Store B');expect(app.querySelector('iframe')?.getAttribute('sandbox')).toBe('allow-scripts');
});
