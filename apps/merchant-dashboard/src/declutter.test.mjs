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

const settings = readFileSync(new URL('./store-settings.mjs', import.meta.url), 'utf8');
const assistant = readFileSync(new URL('./assistant-panel.mjs', import.meta.url), 'utf8');
const emails = readFileSync(new URL('./email-studio-panel.mjs', import.meta.url), 'utf8');

test('Marca, tagline and policy fields are full-nav only', () => {
  assert.match(html, /data-settings-tab="brand" data-full-nav-only>Marca</);
  assert.match(settings, /<div data-full-nav-only><label for="storeTaglineInput">/);
  assert.match(settings, /<div class="store-editor-section-body" data-full-nav-only>\s*\$\{POLICY_FIELDS/);
});

test('with the switch off, saving never sends tagline or policies', () => {
  assert.match(settings, /\.\.\.\(fullNavOn\(\) && \{ tagline: taglineInput\.value\.trim\(\) \|\| null \}\)/);
  assert.match(settings, /\.\.\.\(fullNavOn\(\) && \{ policies: Object\.fromEntries/);
  assert.doesNotMatch(settings, /^\s+tagline: taglineInput/m);
});

test('assistant look and email editors are full-nav only', () => {
  assert.match(assistant, /<section class="assistant-card" data-full-nav-only>\s*\$\{uiHead\(\{ icon: "palette", title: "Apariencia" \}\)\}/);
  assert.match(emails, /contentRoot\.setAttribute\("data-full-nav-only", ""\);/);
  assert.match(emails, /<form class="email-studio-copy" data-copy-form data-full-nav-only novalidate>/);
  assert.match(emails, /data-email-bold data-full-nav-only/);
});
