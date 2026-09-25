# Component Mode Back, Made Reliable — Implementation Plan (sub-project 1)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** New stores are generated in component mode again, with the motion library (parallax, scroll scenes, marquees, entrances), and fewer of those generations fail.

**Architecture:** Three changes. (1) The type check lists every TypeScript error, with line numbers, so the single bounded AI repair can fix them all at once instead of one. (2) A mechanical repair inserts the platform's plumbing mounts (`CommerceSlots`, `ProductDetail`, `CheckoutDetail`, `Catalog`) when a page lacks them entirely. It runs before validation, so those failures never cost a paid repair. A missing cart button stays with the AI, because where it goes is a design decision. (3) Component mode is the default again: the config default is already `next`, and the local `.env` override goes; a test pins the default.

**Tech Stack:** NestJS API, TypeScript compiler API (`typescript`), esbuild, Jest (ts-jest, `rootDir: src`).

**Spec:** `docs/superpowers/specs/2026-09-24-yapi-unique-stores-design.md` (§1 findings "New stores lost their motion" and "Generation fails often", §3 row 1, §5 failure handling "automatic code fix, then one targeted repair").

## Global Constraints

- Mechanical repairs never change design: they only add platform-owned, prop-less mounts whose markup is fixed by `packages/storefront-kit/kit/ui.tsx` (`CommerceSlots` 549, `Catalog` 898, `ProductDetail` 980, `CheckoutDetail` 982).
- Never insert a mount when the page file already names its hook or its component anywhere in its text. A hook hidden inside `{cond && …}` is invisible to `nextPageMarkup` (it renders expressions as `''`), and inserting a second mount would duplicate it.
- Every automatic repair is recorded in the generation's `autoRepairs` list (`source-generation.service.ts:474`), as the existing HTML autorepair does.
- Design jobs (`execution.candidate`) keep forcing static for stores that are not already in component mode. That rule is unchanged (`source-generation.service.ts:335`).
- Jest paths are relative to `apps/api/src`: `cd apps/api && npx jest storefront-source/<file>`.

## Review Focus

1. A page whose cart mount sits inside a conditional (`{open && <CommerceSlots/>}`) must not get a second mount → Task 2 test.
2. A page with no default-exported JSX return (e.g. `export default Page` pointing at a variable) must be left unchanged and go to AI repair, not crash → Task 2 test.
3. A home page missing `data-cart-open` must still fail validation (design decision, not plumbing) → Task 2 test.
4. More than 8 TypeScript errors must produce a bounded message (first 8 plus a count), not an unbounded prompt → Task 1 test.
5. An existing `import { X } from '@pagosya/ui'` must be extended, not duplicated (a duplicate import is itself a TS error) → Task 2 test.

---

## File Structure

| File | Responsibility |
|---|---|
| `apps/api/src/storefront-source/source-next.ts` (modify) | `checkNextTypes` reports all errors; new exported `repairNextCommerceMounts`. |
| `apps/api/src/storefront-source/source-next.spec.ts` (modify) | Tests for both. |
| `apps/api/src/storefront-source/source-generation.service.ts` (modify, line 576) | Call the new repair and record it. |
| `apps/api/src/config/configuration.spec.ts` (create) | Pins the `next` default. |
| `apps/api/.env` (local, untracked) | Remove `SOURCE_FRAMEWORK=static`. |

---

### Task 1: The type check reports every error, bounded, with line numbers

**Files:**
- Modify: `apps/api/src/storefront-source/source-next.ts:364-386` (`checkNextTypes`)
- Test: `apps/api/src/storefront-source/source-next.spec.ts`

**Interfaces:**
- Produces: the `BadGatewayException` message from `compileNextPreview` becomes one line per error, `TypeScript <file>:<line>: <detail>.`, capped at 8 lines plus `…y N errores más.`

- [ ] **Step 1: Write the failing tests**

Add inside the `describe('Next.js storefront compilation', …)` block in `source-next.spec.ts`:

```ts
  it('lists every TypeScript error with its line so one repair can fix them all', async () => {
    const files = nextStoreFiles();
    files[1].content = files[1].content.replace('export default function Home()', 'const wrongHome: number = "text";\nexport default function Home()');
    files[2].content = files[2].content.replace('export default function Product()', 'const wrongProduct: number = "text";\nexport default function Product()');
    let message = '';
    try { await compileNextPreview(files); } catch (error) { message = (error as Error).message; }
    expect(message).toMatch(/TypeScript components\/home\.tsx:\d+: Type 'string' is not assignable to type 'number'/);
    expect(message).toMatch(/TypeScript components\/product\.tsx:\d+: Type 'string' is not assignable to type 'number'/);
  });
  it('bounds a flood of TypeScript errors to eight lines and a count', async () => {
    const files = nextStoreFiles();
    files[1].content = Array.from({ length: 11 }, (_, i) => `const wrong${i}: number = "x";`).join('\n') + '\n' + files[1].content;
    let message = '';
    try { await compileNextPreview(files); } catch (error) { message = (error as Error).message; }
    expect(message.split('\n').filter(line => line.startsWith('TypeScript '))).toHaveLength(8);
    expect(message).toContain('…y 3 errores más.');
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/api && npx jest storefront-source/source-next.spec.ts -t "TypeScript error"`
Expected: FAIL. Only `home.tsx` appears (the first error), with no `:<line>`.

- [ ] **Step 3: Implement**

In `checkNextTypes`, replace the whole `if (errors.length) { … }` block with:

```ts
  if (errors.length) {
    const describe = (error: ts.Diagnostic) => {
      const fileName = error.file?.fileName.replace(root + '/', '') || '';
      const line = error.file && error.start !== undefined ? `:${error.file.getLineAndCharacterOfPosition(error.start).line + 1}` : '';
      const detail = ts.flattenDiagnosticMessageText(error.messageText, ' ').slice(0, 450);
      const hint = error.code === 2304 && /Cannot find name '(Header|Footer)'/.test(detail)
        ? ' Decláralo en el archivo o impórtalo desde un componente local.'
        : '';
      return `TypeScript ${fileName}${line}: ${detail}${detail.endsWith('.') ? '' : '.'}${hint}`;
    };
    // The single bounded repair only sees this message: list every error (capped) so it can fix them together.
    const shown = errors.slice(0, 8).map(describe);
    throw new BadGatewayException(shown.join('\n') + (errors.length > 8 ? `\n…y ${errors.length - 8} errores más.` : ''));
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/api && npx jest storefront-source/source-next.spec.ts storefront-source/source-validation-error.spec.ts`
Expected: PASS. Merchant-facing wording is produced by `merchantFacingSourceFailure` and is not affected.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/storefront-source/source-next.ts apps/api/src/storefront-source/source-next.spec.ts
git commit -m "fix(yapi): report every TypeScript error so one repair can fix them all"
```

---

### Task 2: Insert missing platform mounts before validation

**Files:**
- Modify: `apps/api/src/storefront-source/source-next.ts` (new export next to `repairNextSharedComponentReferences`, around line 318)
- Modify: `apps/api/src/storefront-source/source-generation.service.ts:576`
- Test: `apps/api/src/storefront-source/source-next.spec.ts`

**Interfaces:**
- Produces: `repairNextCommerceMounts(files: SourceProjectFileDto[], purpose?: SourceSitePurpose): { files: SourceProjectFileDto[]; repairs: string[] }`.
- Consumes: `nextPageMarkup(files, page)` and `SourceSitePurpose` (already in `source-next.ts`).

- [ ] **Step 1: Write the failing tests**

Add `repairNextCommerceMounts` to the import from `./source-next` at the top of `source-next.spec.ts`, and add:

```ts
describe('mechanical commerce mount repair', () => {
  const home = (files: ReturnType<typeof nextStoreFiles>) => files.find(f => f.path === 'components/home.tsx')!;
  const product = (files: ReturnType<typeof nextStoreFiles>) => files.find(f => f.path === 'components/product.tsx')!;

  it('adds CommerceSlots when a page lacks the cart and status mounts, and the result compiles', async () => {
    const files = nextStoreFiles();
    home(files).content = home(files).content.replace('<div data-pagosya-cart hidden/><p data-pagosya-status role="status" aria-live="polite"/>', '');
    const { files: repaired, repairs } = repairNextCommerceMounts(files);
    expect(home(repaired).content).toContain('<CommerceSlots />');
    expect(home(repaired).content).toMatch(/import \{[^}]*\bCommerceSlots\b[^}]*\} from '@pagosya\/ui';/);
    expect(repairs).toEqual(['components/home.tsx: added CommerceSlots']);
    expect(() => validateNextSources(repaired)).not.toThrow();
    await expect(compileNextPreview(repaired)).resolves.toEqual(expect.arrayContaining([expect.objectContaining({ path: '_compiled/home.js' })]));
  });

  it('adds ProductDetail to a product page with no product mount', () => {
    const files = nextStoreFiles();
    product(files).content = product(files).content.replace('<main data-pagosya-product-page/>', '<main/>');
    const { files: repaired } = repairNextCommerceMounts(files);
    expect(product(repaired).content).toContain('<ProductDetail />');
    expect(() => validateNextSources(repaired)).not.toThrow();
  });

  it('extends an existing @pagosya/ui import instead of adding a second one', () => {
    const files = nextStoreFiles();
    home(files).content = "import { Reveal } from '@pagosya/ui';\n" + home(files).content.replace('<div data-pagosya-cart hidden/><p data-pagosya-status role="status" aria-live="polite"/>', '');
    const { files: repaired } = repairNextCommerceMounts(files);
    expect(home(repaired).content.match(/from '@pagosya\/ui'/g)).toHaveLength(1);
    expect(home(repaired).content).toMatch(/import \{ Reveal, CommerceSlots \} from '@pagosya\/ui';/);
  });

  it('never duplicates a mount the page already names, even inside a conditional', () => {
    const files = nextStoreFiles();
    home(files).content = home(files).content.replace('<div data-pagosya-cart hidden/><p data-pagosya-status role="status" aria-live="polite"/>', '{open && <CommerceSlots />}');
    const { files: repaired, repairs } = repairNextCommerceMounts(files);
    expect(home(repaired).content.match(/CommerceSlots \/>/g)).toHaveLength(1);
    expect(repairs).toEqual([]);
  });

  it('leaves a page without a default-exported JSX return unchanged', () => {
    const files = nextStoreFiles();
    home(files).content = 'const Page = () => null; export default Page;';
    const { files: repaired, repairs } = repairNextCommerceMounts(files);
    expect(home(repaired).content).toBe('const Page = () => null; export default Page;');
    expect(repairs).toEqual([]);
  });

  it('does not decide where the cart button goes: a missing data-cart-open still fails', () => {
    const files = nextStoreFiles();
    files[0].content = files[0].content.replace('data-cart-open', 'data-other');
    const { files: repaired } = repairNextCommerceMounts(files);
    expect(() => validateNextSources(repaired)).toThrow('home necesita data-cart-open');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/api && npx jest storefront-source/source-next.spec.ts -t "commerce mount"`
Expected: FAIL, `repairNextCommerceMounts` is not exported.

- [ ] **Step 3: Implement the repair**

Add to `source-next.ts`, directly above `repairNextSharedComponentReferences`:

```ts
/** Platform mounts that carry no design: inserting one never changes how the store looks. */
const COMMERCE_MOUNTS: Record<string, Array<{ hooks: string[]; component: string }>> = {
  home: [{ hooks: ['data-pagosya-catalog'], component: 'Catalog' }, { hooks: ['data-pagosya-cart', 'data-pagosya-status'], component: 'CommerceSlots' }],
  product: [{ hooks: ['data-pagosya-product-page'], component: 'ProductDetail' }, { hooks: ['data-pagosya-cart', 'data-pagosya-status'], component: 'CommerceSlots' }],
  checkout: [{ hooks: ['data-pagosya-checkout-page'], component: 'CheckoutDetail' }, { hooks: ['data-pagosya-status'], component: 'CommerceSlots' }],
};

/** The JSX element or fragment returned by the file's default-exported component, if it has one. */
function defaultExportRoot(source: ts.SourceFile): ts.JsxElement | ts.JsxFragment | undefined {
  const unwrap = (node: ts.Node | undefined): ts.JsxElement | ts.JsxFragment | undefined => {
    let expression = node as ts.Expression | undefined;
    while (expression && ts.isParenthesizedExpression(expression)) expression = expression.expression;
    return expression && (ts.isJsxElement(expression) || ts.isJsxFragment(expression)) ? expression : undefined;
  };
  const returned = (body: ts.Node | undefined): ts.JsxElement | ts.JsxFragment | undefined => {
    if (!body) return undefined;
    if (!ts.isBlock(body)) return unwrap(body);
    for (const statement of body.statements) if (ts.isReturnStatement(statement)) return unwrap(statement.expression);
    return undefined;
  };
  for (const statement of source.statements) {
    const modifiers = ts.canHaveModifiers(statement) ? ts.getModifiers(statement) || [] : [];
    const isDefault = modifiers.some(m => m.kind === ts.SyntaxKind.ExportKeyword) && modifiers.some(m => m.kind === ts.SyntaxKind.DefaultKeyword);
    if (isDefault && ts.isFunctionDeclaration(statement)) return returned(statement.body);
    if (ts.isExportAssignment(statement) && (ts.isArrowFunction(statement.expression) || ts.isFunctionExpression(statement.expression))) return returned(statement.expression.body);
  }
  return undefined;
}

function withUiImport(content: string, names: string[]): string {
  const existing = /import \{([^}]*)\} from '@pagosya\/ui';/.exec(content);
  if (!existing) return `import { ${names.join(', ')} } from '@pagosya/ui';\n${content}`;
  const current = existing[1].split(',').map(name => name.trim()).filter(Boolean);
  const merged = [...current, ...names.filter(name => !current.includes(name))];
  return content.replace(existing[0], `import { ${merged.join(', ')} } from '@pagosya/ui';`);
}

/**
 * Inserts platform-owned commerce mounts a page lacks entirely. They carry no design, so a
 * paid repair round-trip for them buys nothing. The cart button is left to the AI: where it
 * sits is part of the design.
 */
export function repairNextCommerceMounts(files: SourceProjectFileDto[], purpose: SourceSitePurpose = 'shop'): { files: SourceProjectFileDto[]; repairs: string[] } {
  if (purpose !== 'shop') return { files, repairs: [] };
  const repairs: string[] = [];
  let current = files;
  for (const [page, mounts] of Object.entries(COMMERCE_MOUNTS)) {
    const path = `components/${page}.tsx`;
    const file = current.find(f => f.path === path);
    if (!file) continue;
    const markup = nextPageMarkup(current, page);
    const needed = mounts.filter(mount =>
      mount.hooks.some(hook => !new RegExp('<[^>]+\\b' + hook + '(?:\\s|=|>)').test(markup))
      // Named anywhere in the file (even inside a conditional) means it is there; never duplicate it.
      && !file.content.includes(mount.component) && !mount.hooks.some(hook => file.content.includes(hook)));
    if (!needed.length) continue;
    const source = ts.createSourceFile(path, file.content, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const root = defaultExportRoot(source);
    if (!root) continue;
    const at = ts.isJsxElement(root) ? root.closingElement.getStart(source) : root.closingFragment.getStart(source);
    const names = needed.map(mount => mount.component);
    const content = withUiImport(file.content.slice(0, at) + names.map(name => `<${name} />`).join('') + file.content.slice(at), names);
    current = current.map(f => f === file ? { ...f, content } : f);
    repairs.push(`${path}: added ${names.join(', ')}`);
  }
  return { files: current, repairs };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/api && npx jest storefront-source/source-next.spec.ts`
Expected: PASS, including every existing test in the file.

- [ ] **Step 5: Wire it into generation**

In `source-generation.service.ts`, replace line 576:

```ts
            if (useNext) generated.files = repairNextSharedComponentReferences(generated.files);
```

with:

```ts
            if (useNext) {
              generated.files = repairNextSharedComponentReferences(generated.files);
              // Plumbing mounts are inserted in code; a paid repair for them would buy nothing.
              const mounts = repairNextCommerceMounts(generated.files, sitePurpose);
              generated.files = mounts.files;
              autoRepairs.push(...mounts.repairs);
            }
```

Add `repairNextCommerceMounts` to the existing import from `./source-next` (line 25). Check that `sitePurpose` is the variable in scope at that line: it is passed to `validateGeneratedSource(generated.files, sitePurpose)` a few lines below.

- [ ] **Step 6: Run the generation suite**

Run: `cd apps/api && npx jest storefront-source`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/storefront-source/source-next.ts apps/api/src/storefront-source/source-next.spec.ts apps/api/src/storefront-source/source-generation.service.ts
git commit -m "fix(yapi): insert missing platform commerce mounts in code instead of paying for a repair"
```

---

### Task 3: Component mode is the default again

**Files:**
- Create: `apps/api/src/config/configuration.spec.ts`
- Modify (local, untracked): `apps/api/.env:39`

**Interfaces:**
- Consumes: the default export of `apps/api/src/config/configuration.ts` (the factory whose `sourceFramework` is at line 326).

- [ ] **Step 1: Write the test that pins the default**

Read `apps/api/src/config/configuration.ts` first to confirm how it is exported (a `registerAs(...)` factory or a plain function) and where `sourceFramework` sits in the returned object. Then write the test against that exact shape, for example:

```ts
// apps/api/src/config/configuration.spec.ts
import configuration from './configuration';

describe('source framework default', () => {
  const saved = process.env.SOURCE_FRAMEWORK;
  afterEach(() => { if (saved === undefined) delete process.env.SOURCE_FRAMEWORK; else process.env.SOURCE_FRAMEWORK = saved; });

  it('generates new stores in component mode unless static is asked for explicitly', () => {
    delete process.env.SOURCE_FRAMEWORK;
    expect(configuration().app.sourceFramework).toBe('next');
    process.env.SOURCE_FRAMEWORK = 'static';
    expect(configuration().app.sourceFramework).toBe('static');
  });
});
```

If the factory reads other required env vars and throws without them, set the minimum in `beforeEach`, copied from `.env.example`. Record that as a ruling in the ledger.

- [ ] **Step 2: Run it**

Run: `cd apps/api && npx jest config/configuration.spec.ts`
Expected: PASS. The code default is already `next`; this test pins it so it can't silently flip. (This is a characterization test, so its first run is green. Say so in the ledger.)

- [ ] **Step 3: Remove the local override**

In `apps/api/.env`, delete the line `SOURCE_FRAMEWORK=static` (line 39). This file is gitignored, so there's nothing to commit for it. Restart the API so it takes effect.

- [ ] **Step 4: Commit the test**

```bash
git add apps/api/src/config/configuration.spec.ts
git commit -m "test(api): pin component mode as the default for new stores"
```

---

### Task 4: Prove it on real generations (paid; needs the owner's go-ahead)

**Files:** none changed.

- [ ] **Step 1: Ask the owner before spending.** The component-mode benchmark calls the real models. The earlier 16-generation run cost about USD 0.62; this one is 4 first-site generations plus edits, so under USD 1.

- [ ] **Step 2: Run the benchmark in component mode**

Run from the repo root: `pnpm benchmark:source --models auto --cases cafe,shop --repeats 2 --out ../../tmp/component-mode-20260924`
(`scripts/benchmark-source.ts:128` already uses `'next'`.)

- [ ] **Step 3: Read the report**

Open `tmp/component-mode-20260924/REPORT.md` and `results.json`. Record in the ledger:
- how many first generations passed without a repair, and how many needed one;
- whether `autoRepairs` contains `added CommerceSlots` / `ProductDetail`;
- every failure's reason.

Look at the desktop and mobile screenshots and confirm motion components appear in the source (`Parallax`, `Reveal`, `Marquee`, `ScrollScrubHero`, …).
Expected: every run ends with a saved revision, and none fails for a missing mount or on only the first of several TypeScript errors.
