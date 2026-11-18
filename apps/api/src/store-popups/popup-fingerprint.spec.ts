import { popupFingerprint, varietyProblem } from './popup-fingerprint';

const a = { o: '<section><img src="assets/a.webp"><h2>Hola</h2><button data-next>Ok</button></section>' };
const b = { o: '<section><h2>Hola</h2><div><img src="assets/b.webp"></div><button data-next>Ok</button></section>' };

describe('popup fingerprint', () => {
  it('ignores words and images, sees structure', () => {
    expect(popupFingerprint(a, '.x{display:grid}')).toBe(popupFingerprint({ o: a.o.replace('Hola', 'Chau').replace('a.webp', 'z.webp') }, '.x{display:grid}'));
    expect(popupFingerprint(a, '.x{display:grid}')).not.toBe(popupFingerprint(b, '.x{display:grid}'));
    expect(popupFingerprint(a, '.x{display:grid}')).not.toBe(popupFingerprint(a, '.x{display:flex;flex-direction:column}'));
  });
  it('refuses a repeated fingerprint or composition line', () => {
    const fp = popupFingerprint(a, '');
    expect(varietyProblem({ fingerprint: fp, composition: 'Ticket de cupón' }, [{ fingerprint: fp, composition: 'otra' }])).toMatch(/repetida/);
    expect(varietyProblem({ fingerprint: 'x', composition: 'Ticket de cupón a la izquierda' }, [{ fingerprint: 'y', composition: 'ticket de cupon a la izquierda' }])).toMatch(/repetida/);
    expect(varietyProblem({ fingerprint: 'x', composition: 'Póster con botella' }, [{ fingerprint: 'y', composition: 'Hoja inferior' }])).toBeNull();
  });
});
