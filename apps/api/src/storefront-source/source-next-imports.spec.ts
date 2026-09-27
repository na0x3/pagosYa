import { repairNextMisdirectedImports } from './source-next';

/** A candidate that imports a name from a local file that does not export it fails TypeScript and used to buy a paid
 * repair. The name usually lives in @pagosya/ui or in another component; the import is fixed in code instead. */
describe('misdirected component imports', () => {
  const store = { path: 'components/store.tsx', content: "export const tokens = { ink: '#111' };\nexport default function Store() { return null; }" };
  const shared = { path: 'components/Shared.tsx', content: 'export function Badge() { return <span />; }' };

  it('moves @pagosya/ui components imported from a local file to @pagosya/ui, keeping what that file does export', () => {
    const home = { path: 'components/home.tsx', content: "import Store, { tokens, CartButton, CommerceSlots } from './store';\nexport default function Home() { return <main><CartButton /><CommerceSlots /></main>; }" };
    const { files, repairs } = repairNextMisdirectedImports([store, home]);
    const fixed = files.find(f => f.path === 'components/home.tsx')!.content;
    expect(fixed).toContain("import Store, { tokens } from './store';");
    expect(fixed).toMatch(/import \{ CartButton, CommerceSlots \} from '@pagosya\/ui';/);
    expect(repairs).toHaveLength(1);
  });

  it('merges into an existing @pagosya/ui import and points a name exported by exactly one other component there', () => {
    const home = { path: 'components/home.tsx', content: "import { Reveal } from '@pagosya/ui';\nimport { Parallax, Badge } from './store';\nexport default function Home() { return <main><Reveal><Badge /></Reveal><Parallax>x</Parallax></main>; }" };
    const fixed = repairNextMisdirectedImports([store, shared, home]).files.find(f => f.path === 'components/home.tsx')!.content;
    expect(fixed).toMatch(/import \{ Reveal, Parallax \} from '@pagosya\/ui';/);
    expect(fixed).toContain("import { Badge } from './Shared';");
    expect(fixed).not.toContain("from './store'");
  });

  it('leaves correct imports and unknown names alone', () => {
    const home = { path: 'components/home.tsx', content: "import { tokens, Mystery } from './store';\nexport default function Home() { return <main />; }" };
    const { files, repairs } = repairNextMisdirectedImports([store, home]);
    expect(files.find(f => f.path === 'components/home.tsx')!.content).toBe(home.content);
    expect(repairs).toEqual([]);
  });
});
