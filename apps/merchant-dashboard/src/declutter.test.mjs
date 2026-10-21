import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const js = readFileSync(new URL('./dashboard.js', import.meta.url), 'utf8');
const navStart = html.indexOf('<nav class="dashboard-nav"');
const nav = html.slice(navStart, html.indexOf('</nav>', navStart));

test('the sidebar has seven section links plus Documentos for full nav', () => {
  const links = [...nav.matchAll(/<a [^>]*data-nav-section="([a-z]+)"[^>]*>/g)];
  assert.deepEqual(links.map(m => m[1]), ['inicio', 'tienda', 'pedidos', 'cobrar', 'dinero', 'clientes', 'ajustes', 'documentos']);
  assert.match(links.at(-1)[0], /data-full-nav-only/);
  assert.doesNotMatch(nav, /dashboard-nav-group/);
});

test('sidebar extras are full-nav only', () => {
  for (const marker of ['class="ai-setup-launch"', 'class="connect-ai-card"', 'class="dashboard-sidebar-foot"', 'class="mobile-nav-hint"', 'class="merchant-store-tabs"']) {
    const tag = html.match(new RegExp(`<[a-z]+ ${marker}[^>]*>`))?.[0] ?? '';
    assert.match(tag, /data-full-nav-only/, marker);
  }
});

test('the header has no kicker and hosts the section pills', () => {
  assert.doesNotMatch(html, /workspace-kicker/);
  assert.match(html, /<nav class="section-tabs" id="sectionTabs" aria-label="Pestañas de la sección" hidden><\/nav>/);
});

test('the router resolves hidden views and titles by section', () => {
  assert.match(js, /const nextView = resolveView\(view, fullNavOn\(\)\);/);
  assert.match(js, /const \{ section, tab: activeTab \} = sectionOf\(nextView, document\.getElementById\("marketingTabs"\)\.dataset\.tab\);/);
  assert.match(js, /document\.getElementById\("workspaceTitle"\)\.textContent = section\.label;/);
  assert.doesNotMatch(js, /DASHBOARD_VIEW_COPY/);
  assert.doesNotMatch(js, /syncNavGroups/);
});

test('pills switch views and marketing tabs; the old marketing tab bar is hidden', () => {
  assert.match(js, /const pill = event\.target\.closest\("\[data-section-view\]"\);/);
  assert.match(js, /if \(tab\) selectMarketingTab\(tab\);/);
  assert.match(html, /<nav class="marketing-tabs" id="marketingTabs" aria-label="Herramientas de marketing" data-tab="emails" hidden>/);
});

test('a hidden marketing tab falls back to Correos', () => {
  assert.match(js, /if \(tab === "logs" && !fullNavOn\(\)\) tab = "emails";/);
});

test('a sidebar link opens its section on the first tab, even after another section used the same view', () => {
  assert.match(js, /const entry = button\.dataset\.navSection \? sectionEntry\(button\.dataset\.navSection\) : null;/);
  assert.match(js, /if \(entry\?\.marketingTab\) selectMarketingTab\(entry\.marketingTab\);/);
});

test('finance detail lives on Dinero; Inicio links to it', () => {
  assert.match(html, /<section class="block" id="financesSection" data-dashboard-page="payouts">/);
  assert.match(html, /<a class="overview-account-link" href="#dashboard-payouts" data-dashboard-view="payouts">Ver tu dinero<\/a>/);
});
