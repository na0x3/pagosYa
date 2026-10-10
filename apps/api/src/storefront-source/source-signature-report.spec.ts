import { signatureTellReport } from './source-signature-report';

const files = [
  { path: 'components/home.tsx', content: `<main><section className="reveal"><p className="eyebrow">Hecho cerca</p><h2>Cara A</h2></section><section className="reveal"><h2>Tracklist</h2></section><section className="reveal"><div className="marquee">café · vinilo</div></section></main>` },
  { path: 'styles/globals.css', content: `.eyebrow{font-size:12px;text-transform:uppercase;letter-spacing:.2em} body{font-family:"Space Grotesk",sans-serif} h2{font-family:'Fraunces',serif} .x{font-family:var(--display)}` },
  { path: 'assets/a.webp', content: 'AAAA', encoding: 'base64' as const },
];

it('counts the tells a reviewer would see and checks the signature vocabulary', () => {
  const report = signatureTellReport(files as any, { idea: 'Un disco.', source: '', vocabulary: ['Cara A', 'Cara B', 'Tracklist'], device: '', carries: [] });
  expect(report.eyebrowSections).toBe(1);
  expect(report.marquee).toBe(true);
  expect(report.topRevealClass).toEqual({ name: 'reveal', uses: 3 });
  expect(report.fonts).toEqual(['Space Grotesk', 'Fraunces']);
  expect(report.vocabularyFound).toEqual(['Cara A', 'Tracklist']);
  expect(report.vocabularyMissing).toEqual(['Cara B']);
});

it('reports cleanly without a signature or markup', () => {
  expect(signatureTellReport([], undefined)).toEqual({ eyebrowSections: 0, marquee: false, topRevealClass: null, fonts: [], vocabularyFound: [], vocabularyMissing: [] });
});
