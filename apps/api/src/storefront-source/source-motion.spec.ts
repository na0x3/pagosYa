import { BadRequestException } from '@nestjs/common';
import { sourceMotionMode, sourceScrollFeel, requestedSourceMotion, withSourceMotion, withSourceMotionSettings, sourceAsksForRestraint } from './source-motion';

describe('source motion revisions', () => {
  it('interprets explicit motion changes without taking unrelated negatives or history as motion instructions', () => {
    expect(requestedSourceMotion('haz más animaciones, no uses naranja')).toBe('expressive');
    expect(requestedSourceMotion('add more animated characters')).toBe('expressive');
    expect(requestedSourceMotion('quiero que el website se vea mas animado y mas largo')).toBe('expressive');
    expect(requestedSourceMotion('sin animaciones')).toBe('off');
    expect(requestedSourceMotion('menos animaciones')).toBe('subtle');
    expect(requestedSourceMotion('no agregues más animaciones')).toBeUndefined();
    expect(requestedSourceMotion('más animaciones\nPedido actual del comercio:\nCambia el título')).toBeUndefined();
  });
  const files = [
    { path: 'index.html', content: '<h1>Existing design</h1>' },
    { path: 'styles.css', content: 'h1 { color: red; }' },
    { path: 'config.js', content: 'window.PAGOSYA_CONFIG = {"slug":"original","data":{"items":[]}};' },
    { path: 'commerce.js', content: 'window.originalCommerce = true;' },
  ];
  it('preserves authored files and commerce, saves the setting and avoids duplicate runtimes', async () => {
    const subtle = await withSourceMotion(files, 'subtle');
    const off = await withSourceMotion(subtle, 'off');
    expect(off.slice(0, 2)).toEqual(files.slice(0, 2));
    expect(off[2].content).toContain('"slug":"original","data":{"items":[]},"motion":"off"');
    expect(off[3].content).toMatch(/^window.originalCommerce = true;/);
    expect(off[3].content.match(/pagosya-motion:start/g)).toHaveLength(1);
    expect(off.map(f => f.path)).toEqual(files.map(f => f.path));
    expect(sourceMotionMode(off)).toBe('off');
    expect(sourceMotionMode(files)).toBe('subtle');
    expect(sourceMotionMode()).toBe('auto');
    expect(sourceMotionMode(await withSourceMotion(files, 'auto'))).toBe('auto');
    expect(sourceScrollFeel(files)).toBe('soft');
    expect(files[2].content).not.toContain('motion');
  });
  it('persists scroll feel beside motion without duplicating the trusted runtime', async () => {
    const cinematic = await withSourceMotionSettings(files, { motion: 'expressive', scrollFeel: 'cinematic' });
    expect(sourceMotionMode(cinematic)).toBe('expressive');
    expect(sourceScrollFeel(cinematic)).toBe('cinematic');
    expect(cinematic.find(file => file.path === 'config.js')!.content).toContain('"scrollFeel":"cinematic"');
    const native = await withSourceMotionSettings(cinematic, { motion: 'off', scrollFeel: 'native' });
    expect(sourceScrollFeel(native)).toBe('native');
    expect(native.find(file => file.path === 'commerce.js')!.content.match(/pagosya-motion:start/g)).toHaveLength(1);
  });
  it('rejects invalid modes and non-JSON configurations without evaluating scripts', async () => {
    await expect(withSourceMotion(files, 'invalid' as any)).rejects.toThrow(BadRequestException);
    await expect(withSourceMotion(files.map(f => f.path === 'config.js' ? { ...f, content: 'window.PAGOSYA_CONFIG = (() => { throw new Error("executed") })()' } : f), 'off')).rejects.toThrow(BadRequestException);
    await expect(withSourceMotion(files.filter(f => f.path !== 'commerce.js'), 'subtle')).rejects.toThrow(BadRequestException);
    await expect(withSourceMotionSettings(files, { motion: 'auto', scrollFeel: 'elastic' as any })).rejects.toThrow(BadRequestException);
  });
});

describe('sourceAsksForRestraint', () => {
  it('hears a merchant asking for a minimal, sober or quiet look, in Spanish or English', () => {
    for (const text of ['Quiero algo minimalista', 'una tienda sobria y elegante', 'Diseño limpio y discreto', 'muy tranquilo, sin colores fuertes', 'keep it minimal', 'a quiet, understated store'])
      expect(sourceAsksForRestraint(text)).toBe(true);
  });
  it('does not mistake an ordinary brief for a request for restraint', () => {
    for (const text of ['Crear una tienda para el studio de pilates DEFS en Bolivia', 'Cafetería con mucho color', 'Tienda de ropa urbana', ''])
      expect(sourceAsksForRestraint(text)).toBe(false);
  });
});
