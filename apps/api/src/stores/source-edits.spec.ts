import { applySourceEdits, SourceEditConflict } from './source-edits';
const previous = [
  { path: 'index.html', content: '<header>Marca</header><main>Catálogo</main><footer>Contacto</footer>' },
  { path: 'styles.css', content: ':root { --brand: green; }\nheader { color: var(--brand); }' },
  { path: 'site.js', content: 'document.title = "Marca";' },
];

describe('local source edits', () => {
  it('adds compact CSS and guarded JS without matching or rewriting existing styles', () => {
    const result = applySourceEdits(previous, { edits: [], files: [], appends: [
      { path: 'styles.css', content: '.story { color: blue; }' },
      { path: 'site.js', content: '(() => { document.querySelector(".story")?.classList.add("ready"); })();' },
    ] });
    expect(result[0]).toEqual(previous[0]);
    expect(result[1].content).toBe(previous[1].content + '\n.story { color: blue; }\n');
    expect(result[2].content.startsWith(previous[2].content)).toBe(true);
  });
  it('rejects malformed, duplicate, binary and reserved append targets atomically', () => {
    const before = JSON.stringify(previous);
    for (const appends of [{}, [{path:'commerce.js',content:'alert(1)'}], [{path:'styles.css',content:''}], [{path:'styles.css',content:'a'}, {path:'styles.css',content:'b'}]]) {
      expect(() => applySourceEdits(previous, { edits: [], files: [], appends })).toThrow();
    }
    expect(() => applySourceEdits([{path:'site.js',content:'bytes',encoding:'base64'}], { edits: [], files: [], appends:[{path:'site.js',content:'test'}] })).toThrow();
    expect(JSON.stringify(previous)).toBe(before);
  });
  it('provides the exact intermediate source and edit index for a targeted repair', () => {
    try {
      applySourceEdits(previous, { edits: [
        { path: 'index.html', search: 'Catálogo', replacement: 'Tortas' },
        { path: 'index.html', search: 'missing', replacement: 'Texto' },
      ], files: [] });
      throw new Error('Expected conflict');
    } catch (error) {
      expect(error).toBeInstanceOf(SourceEditConflict);
      expect((error as SourceEditConflict).diagnostic).toMatchObject({ path: 'index.html', editIndex: 1, reason: 'missing', currentContent: '<header>Marca</header><main>Tortas</main><footer>Contacto</footer>' });
      expect(previous[0].content).toContain('Catálogo');
    }
  });
  it('allows only authorized redesign files and preserves omitted source', () => {
    const output = { edits: [], files: [{ path: 'styles.css', content: 'body { color: blue; }' }] };
    expect(() => applySourceEdits(previous, output)).toThrow('existente');
    const updated = applySourceEdits(previous, output, { replaceablePaths: ['styles.css'] });
    expect(updated[0]).toEqual(previous[0]);
    expect(updated[2]).toEqual(previous[2]);
    expect(updated[1].content).toContain('blue');
    expect(() => applySourceEdits(previous, { edits: [], files: [previous[1]] }, { replaceablePaths: ['styles.css'] })).toThrow('ningún cambio');
    expect(() => applySourceEdits(previous, { edits: [], files: [output.files[0], output.files[0]] }, { replaceablePaths: ['styles.css'] })).toThrow();
  });
  it('allows unchanged source explicitly while retaining patch validation', () => {
    const result = applySourceEdits(previous, { edits: [], files: [] }, { allowUnchanged: true });
    expect(result).toEqual(previous);
    expect(result[0]).not.toBe(previous[0]);
    expect(() => applySourceEdits(previous, { files: [] }, { allowUnchanged: true })).toThrow('puntuales');
    expect(() => applySourceEdits(previous, { edits: [{ path: 'index.html', search: previous[0].content, replacement: 'New homepage' }], files: [] }, { allowUnchanged: true })).toThrow('por completo');
  });
  it('rejects edits outside a targeted feature scope', () => {
    expect(() => applySourceEdits(previous, {
      edits: [{ path: 'index.html', search: 'Catálogo', replacement: 'Nuevo' }],
      files: [],
    }, { allowedEditPaths: ['components/PawMarquee.tsx', 'styles.css'] })).toThrow('alcance autorizado');
  });
  it('preserves every byte outside a requested change and carries omitted files forward', () => {
    const before = JSON.stringify(previous);
    const result = applySourceEdits(previous, { edits: [{ path: 'index.html', search: '<main>Catálogo</main>', replacement: '<main>Catálogo <a href="pages/checkout.html">Mi pedido</a></main>' }], files: [{ path: 'pages/checkout.html', content: '<h1>Mi pedido</h1>' }] });
    expect(result[0].content).toBe('<header>Marca</header><main>Catálogo <a href="pages/checkout.html">Mi pedido</a></main><footer>Contacto</footer>');
    expect(result.slice(1, 3)).toEqual(previous.slice(1));
    expect(result[3].path).toBe('pages/checkout.html');
    expect(JSON.stringify(previous)).toBe(before);
  });
  it('rejects complete rewrites, duplicate new paths and missing patch output', () => {
    expect(() => applySourceEdits(previous, { edits: [{ path: 'index.html', search: previous[0].content, replacement: 'A new homepage' }], files: [] })).toThrow('por completo');
    expect(() => applySourceEdits(previous, { edits: [], files: [{ path: 'STYLES.CSS', content: 'body{}' }] })).toThrow('existente');
    expect(() => applySourceEdits(previous, { files: previous })).toThrow('puntuales');
  });
  it('rejects ambiguous, nonexistent, reserved and empty replacements without mutating the original', () => {
    const before = JSON.stringify(previous);
    for (const edit of [
      { path: 'index.html', search: 'a', replacement: 'b' },
      { path: 'index.html', search: 'missing', replacement: 'b' },
      { path: 'commerce.js', search: 'missing', replacement: 'b' },
      { path: 'index.html', search: '', replacement: 'b' },
    ]) expect(() => applySourceEdits(previous, { edits: [edit], files: [] })).toThrow();
    expect(JSON.stringify(previous)).toBe(before);
    expect(() => applySourceEdits(previous, { edits: [], files: [] })).toThrow('ningún cambio');
  });
});
