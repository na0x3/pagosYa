// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { closeBocetoMenu, openBocetoMenu } from './boceto-menu';

afterEach(() => closeBocetoMenu());

it('draws items with shortcuts, greys disabled ones, runs and closes on click', () => {
  const run = vi.fn(), never = vi.fn();
  const menu = openBocetoMenu(document, 20, 30, [{ label: 'Copiar', shortcut: '⌘C', run }, 'separator', { label: 'Pegar aquí', disabled: true, run: never }]);
  const items = [...menu.querySelectorAll('.bct-menu__item')] as HTMLElement[];
  expect(items.map(item => item.textContent)).toEqual(['Copiar⌘C', 'Pegar aquí']);
  expect(menu.querySelectorAll('.bct-menu__sep')).toHaveLength(1);
  items[1].click(); expect(never).not.toHaveBeenCalled();
  items[0].click(); expect(run).toHaveBeenCalledOnce();
  expect(document.querySelector('.bct-menu')).toBeNull();
});

it('opens submenus, closes on Esc and outside press, and a second menu replaces the first', () => {
  const pick = vi.fn();
  const menu = openBocetoMenu(document, 0, 0, [{ label: 'Giro', items: [{ label: '8°', run: pick }] }]);
  (menu.querySelector('.bct-menu--sub .bct-menu__item') as HTMLElement).click();
  expect(pick).toHaveBeenCalledOnce();
  openBocetoMenu(document, 0, 0, [{ label: 'A' }]);
  openBocetoMenu(document, 0, 0, [{ label: 'B' }]);
  expect(document.querySelectorAll('.bct-menu:not(.bct-menu--sub)')).toHaveLength(1);
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  expect(document.querySelector('.bct-menu')).toBeNull();
  openBocetoMenu(document, 0, 0, [{ label: 'C' }]);
  document.body.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
  expect(document.querySelector('.bct-menu')).toBeNull();
});
