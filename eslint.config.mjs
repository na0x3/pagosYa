// @ts-check
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import globals from "globals";

/**
 * Repo-wide lint. Deliberately NOT a style config: formatting is left alone so
 * this can be adopted without a repo-wide reformat that buries blame history
 * (see docs/CLEAN_CODE_PLAN.md, phase 0).
 *
 * What it does enforce is the class of mistake `tsc` cannot see — above all
 * unawaited promises, which in a Nest service means a write that silently never
 * happens and an error that never reaches a request.
 *
 * apps/matcho-showcase keeps its own Next.js config and is excluded here.
 */
export default tseslint.config(
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/build/**",
      "**/.next/**",
      "**/.wrangler/**",
      "**/test-results/**",
      "**/playwright-report/**",
      "examples/**",
      "graphify-out/**",
      "tmp/**",
      "apps/matcho-showcase/**",
      "apps/merchant-dashboard/public/**",
      "packages/storefront-kit/kit/**",
      "packages/storefront-kit/commerce-src/**",
      "packages/widget-js/tsup.config.ts",
      "**/*.d.ts",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: { allowDefaultProject: ["*.mjs", "*.cjs"] },
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // The bug class this config exists for.
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/await-thenable": "error",
      "@typescript-eslint/no-misused-promises": "error",

      // Everything below is real but pre-existing, and none of it is a live
      // defect. They are warnings so `pnpm lint` is green on errors today and
      // can gate CI immediately as a ratchet — a NEW floating promise fails the
      // build, while the standing backlog stays visible and countable. Promote
      // each to "error" as its count reaches zero.
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unnecessary-type-assertion": "warn",
      "@typescript-eslint/no-base-to-string": "warn",
      "@typescript-eslint/no-redundant-type-constituents": "warn",
      "@typescript-eslint/no-unsafe-enum-comparison": "warn",
      "@typescript-eslint/restrict-plus-operands": "warn",
      "@typescript-eslint/prefer-promise-reject-errors": "warn",
      "@typescript-eslint/no-require-imports": "warn",
      "no-empty": "warn",
      "no-useless-escape": "warn",
      "no-control-regex": "warn",
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unsafe-call": "off",
      "@typescript-eslint/no-unsafe-argument": "off",
      "@typescript-eslint/no-unsafe-return": "off",
      "@typescript-eslint/require-await": "warn",
      "@typescript-eslint/restrict-template-expressions": "off",
      "@typescript-eslint/unbound-method": "off",

      // A `let` declared early so a close handler can clear what is assigned later.
      "prefer-const": ["error", { ignoreReadBeforeAssign: true }],
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrors: "none", ignoreRestSiblings: true },
      ],
    },
  },
  {
    // Plain .js/.mjs: build tooling and browser scripts that belong to no
    // tsconfig, so the type-aware rules cannot run on them at all. Lint them
    // syntactically, with browser and node globals declared.
    files: ["**/*.js", "**/*.mjs", "**/*.cjs"],
    extends: [tseslint.configs.disableTypeChecked],
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
      parserOptions: { projectService: false, project: false },
    },
  },
  {
    // Browser apps pass async functions to addEventListener and setTimeout all
    // the time, and the DOM ignores what a listener returns. Every such site was
    // reviewed on 2026-09-24 and each catches its own errors, so flagging them
    // is noise. The server keeps the full rule: there an ignored promise is a
    // lost write (the idempotency defect). Floating promises stay an error here too.
    files: ["apps/checkout/src/**/*.ts", "apps/merchant-studio/src/**/*.ts", "packages/storefront-preview/src/**/*.ts"],
    rules: {
      "@typescript-eslint/no-misused-promises": ["error", { checksVoidReturn: { arguments: false } }],
    },
  },
  {
    // Specs assert on partially-built fixtures and spy objects; `any` there is
    // a testing convenience, not a type hole in shipped code.
    files: ["**/*.spec.ts", "**/*.test.ts", "**/*.spec.mjs", "**/*.test.mjs", "**/tests/**"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-non-null-assertion": "off",
    },
  },
);
