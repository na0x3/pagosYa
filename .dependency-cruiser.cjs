/**
 * Architecture rules for the monorepo. Run with `pnpm check:boundaries`.
 * Known violations live in `.dependency-cruiser-known-violations.json` and are
 * burned down by the clean code plan (docs/CLEAN_CODE_PLAN.md); new ones fail.
 */
module.exports = {
  forbidden: [
    {
      name: 'no-cross-app-imports',
      comment: 'An app must not reach into another app\'s source. Share code through a workspace package in packages/.',
      severity: 'error',
      from: { path: '^apps/([^/]+)/' },
      to: { path: '^apps/', pathNot: '^apps/$1/' },
    },
    {
      name: 'packages-stay-independent-of-apps',
      comment: 'Packages are shared building blocks; they must not depend on any app.',
      severity: 'error',
      from: { path: '^packages/' },
      to: { path: '^apps/' },
    },
    {
      name: 'no-circular',
      comment: 'Circular imports make modules impossible to understand or test in isolation.',
      severity: 'error',
      from: {},
      to: { circular: true },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    exclude: { path: '(^|/)(node_modules|dist|build|test-results|graphify-out|\\.next|\\.wrangler)/|^apps/merchant-dashboard/public/studio/' },
    tsPreCompilationDeps: true,
    enhancedResolveOptions: { exportsFields: ['exports'], conditionNames: ['import', 'require', 'node', 'default'], extensions: ['.ts', '.tsx', '.js', '.mjs', '.cjs', '.jsx', '.d.ts'] },
  },
};
