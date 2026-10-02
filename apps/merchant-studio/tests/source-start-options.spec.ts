import { finishedChatJob } from './source-chat-job-fixture';
import { expect, test } from '@playwright/test';

test('a new store offers scratch creation and sends that choice without a template', async ({ page }) => {
  let request: any;
  await page.addInitScript(() => sessionStorage.setItem('pagosya_merchant_session', 'test-session'));
  await page.route('**/api/v1/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if ((path.endsWith('/chat-jobs') && route.request().method() === 'POST')) {
      request = route.request().postDataJSON();
      await route.fulfill({ json: finishedChatJob({ userMessage: { id: 'u', role: 'USER', content: request.instruction }, assistantMessage: { id: 'a', role: 'ASSISTANT', content: '¿Qué venderá tu tienda?' } }) });
      return;
    }
    await route.fulfill({ json: path.endsWith('/stores') ? [{ id: 's', name: 'Nueva', slug: 'nueva' }]
      : path.endsWith('/source-project') ? { revision: 0, versions: [] }
      : path.endsWith('/conversation') ? { messages: [] }
      : path.endsWith('/catalog') ? { items: [], categories: [] }
      : path.endsWith('/draft-preview') ? { at: null }
      : {} });
  });
  await page.goto('/?source=1');
  await expect(page.getByRole('button', { name: 'Elegir una plantilla', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Crear desde cero', exact: true }).click();
  await expect(page.getByText('¿Qué venderá tu tienda?', { exact: true })).toBeVisible();
  expect(request.instruction).toContain('desde cero, sin usar plantillas');
  expect(request.revision).toBe(0);
  expect(request.templateId).toBeUndefined();
});
