import { readWordmark, sanitizeWordmark, withWordmarkTemplate, WORDMARK_DIRECTION } from './source-wordmark';

// POKEATE (owner's Sep-8 store): YAPI lettered the name itself, POKE in ink and ATE in red with a spade after it.
const POKEATE = 'POKE<span class="wm-red">ATE</span><span class="wm-suit">♠</span>';

describe('sanitizeWordmark', () => {
  it('keeps spans with class names and the letters of the store name, plus symbols', () => {
    expect(sanitizeWordmark(POKEATE, 'Pokeate')).toBe(POKEATE);
    expect(sanitizeWordmark('<strong>Café</strong> <em class="wm-b">Buna</em>', 'Café Buna')).toBe('<strong>Café</strong> <em class="wm-b">Buna</em>');
  });
  it('refuses lettering that does not spell the store name', () => {
    expect(sanitizeWordmark('POKER<span>ATE</span>', 'Pokeate')).toBeUndefined();
    expect(sanitizeWordmark('Otra tienda', 'Pokeate')).toBeUndefined();
    expect(sanitizeWordmark('', 'Pokeate')).toBeUndefined();
  });
  it('drops every attribute but class, and any element outside the lettering set', () => {
    expect(sanitizeWordmark('<span class="a" style="color:red" onclick="x()">POKE</span><img src="x.png"><script>alert(1)</script>ATE', 'Pokeate')).toBe('<span class="a">POKE</span>ATE');
    expect(sanitizeWordmark('<a href="https://evil.test">POKEATE</a>', 'Pokeate')).toBe('POKEATE');
    expect(sanitizeWordmark('<span class="ok bad!name">POKEATE</span>', 'Pokeate')).toBe('<span class="ok">POKEATE</span>');
  });
  it('refuses runaway markup', () => {
    expect(sanitizeWordmark(`<span>${'<span>'.repeat(60)}POKEATE${'</span>'.repeat(60)}</span>`, 'Pokeate')).toBeUndefined();
  });
});

describe('readWordmark', () => {
  it('reads the lettering from a template, or from the element a style card hero marked', () => {
    expect(readWordmark(`<body><main></main><template data-pagosya-wordmark>${POKEATE}</template></body>`, 'Pokeate')).toBe(POKEATE);
    expect(readWordmark(`<header><a><span class="pyh-wordmark" data-pagosya-wordmark>${POKEATE}</span></a></header>`, 'Pokeate')).toBe(POKEATE);
    expect(readWordmark('<body>Pokeate</body>', 'Pokeate')).toBeUndefined();
  });
});

describe('withWordmarkTemplate', () => {
  const page = '<html><body><header data-pagosya-header></header><main></main></body></html>';
  it('writes the lettering into index.html once, before </body>, and replaces an older one', () => {
    const once = withWordmarkTemplate(page, POKEATE);
    expect(once).toContain(`<template data-pagosya-wordmark>${POKEATE}</template></body>`);
    expect(withWordmarkTemplate(once, POKEATE)).toBe(once);
    expect(withWordmarkTemplate(once, 'POKEATE').match(/data-pagosya-wordmark/g)).toHaveLength(1);
  });
});

describe('WORDMARK_DIRECTION', () => {
  it('tells the author where the lettering goes and that it must spell the name', () => {
    expect(WORDMARK_DIRECTION).toContain('<template data-pagosya-wordmark>');
    expect(WORDMARK_DIRECTION).toContain('.pyh-wordmark');
    expect(WORDMARK_DIRECTION).toMatch(/exact letters of the store name/);
  });
});
