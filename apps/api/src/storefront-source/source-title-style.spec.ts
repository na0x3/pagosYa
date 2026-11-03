import { contrastRatio } from './sketch/sketch-schema';
import { TITLE_STYLES, libraryTitleStyle, nextTitleStyle, readTitleAsk, titleColours } from './source-title-style';

describe('title styles (spec 2026-11-03 chunky colour titles)', () => {
  it('names a catalogue font, a colour count and the underline per style', () => {
    expect(TITLE_STYLES).toEqual({
      burbuja: { font: 'baloo-2', colours: 4, underline: true }, redonda: { font: 'fredoka', colours: 2, underline: true },
      firme: { font: 'archivo-black', colours: 2, underline: false }, poster: { font: 'anton', colours: 3, underline: false },
    });
  });
});

describe('titleColours', () => {
  const page = { paper: '#f6f4ee', ink: '#1d1d1b', accentInk: '#5d7a2e', deep: '#2f3d18' };
  it('keeps readable goods colours after the accent, darkening a light one, at most four', () => {
    const colours = titleColours({ ...page, extras: ['#e8c9a0', '#2f6db5', '#c0392b', '#8e44ad'] });
    expect(colours[0]).toBe('#5d7a2e');
    expect(colours.length).toBe(4);
    for (const colour of colours) expect(contrastRatio(colour, page.paper)).toBeGreaterThanOrEqual(3);
  });
  it('counts near-duplicates once', () => {
    expect(titleColours({ ...page, extras: ['#5e7b2f', '#5c792d'] })).toEqual(['#5d7a2e', '#2f3d18']);
  });
  it('gives exactly accent-ink and ink when the photos have no goods colour (Review Focus 2)', () => {
    expect(titleColours({ paper: page.paper, ink: page.ink, accentInk: page.accentInk, extras: [] })).toEqual(['#5d7a2e', '#1d1d1b']);
  });
});

describe('libraryTitleStyle', () => {
  it('reads the answer, defaults to redonda, and a playful business is always burbuja', () => {
    expect(libraryTitleStyle({ titleStyle: 'firme' }, false)).toBe('firme');
    expect(libraryTitleStyle({ titleStyle: 'nope' }, false)).toBe('redonda');
    expect(libraryTitleStyle(null, false)).toBe('redonda');
    expect(libraryTitleStyle({ titleStyle: 'firme' }, true)).toBe('burbuja');
  });
});

describe('readTitleAsk / nextTitleStyle', () => {
  it('reads the three asks only when they are the whole request (Review Focus 4)', () => {
    expect(readTitleAsk('títulos más tranquilos')).toBe('calmer');
    expect(readTitleAsk('haz los títulos más divertidos por favor')).toBe('livelier');
    expect(readTitleAsk('cambia los títulos')).toBe('other');
    expect(readTitleAsk('un título más divertido y cambia el precio')).toBeNull();
    expect(readTitleAsk('hazla más colorida')).toBeNull();
  });
  it('moves one step along burbuja → redonda → firme, and «other» picks a different style', () => {
    expect(nextTitleStyle('burbuja', 'calmer')).toBe('redonda');
    expect(nextTitleStyle('redonda', 'calmer')).toBe('firme');
    expect(nextTitleStyle('firme', 'calmer')).toBe('firme');
    expect(nextTitleStyle('firme', 'livelier')).toBe('redonda');
    expect(nextTitleStyle('redonda', 'livelier')).toBe('burbuja');
    expect(nextTitleStyle(undefined, 'livelier')).toBe('burbuja');
    expect(nextTitleStyle('redonda', 'other')).not.toBe('redonda');
  });
});
