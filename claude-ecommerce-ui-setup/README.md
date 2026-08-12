# Claude Ecommerce UI Skills

Project-scoped Claude Code skills for a Shopify-style ecommerce platform.

## Included

- `ui-art-director` — visual hierarchy and polish
- `ecommerce-ux` — customer storefront and checkout UX
- `design-system` — consistency, tokens, and reusable components
- `responsive-accessibility` — mobile and accessibility acceptance criteria
- `visual-qa` — browser-based inspection and refinement
- `merchant-dashboard-ux` — seller/admin operational UX

## Install in your project

Copy `.claude` into the root of your repository:

```bash
cp -R .claude /path/to/your/project/
```

Or unzip this package from your project root and copy the folder.

Claude Code can load project skills from `.claude/skills/<skill>/SKILL.md` automatically when relevant. You can also invoke a skill directly, for example:

```text
/ui-art-director
/ecommerce-ux
/visual-qa
```

## Recommended optional tooling

If your project uses shadcn/ui, install its official skill:

```bash
pnpm dlx skills add shadcn/ui
```

Or configure the shadcn MCP server using the current shadcn documentation.

For browser automation with Playwright CLI:

```bash
npm install -g @playwright/cli@latest
playwright-cli install --skills
```

Playwright also publishes a component-testing skill setup via:

```bash
npx playwright init-skills
```

Use only the Playwright setup that matches your testing/browser workflow; you do not need every option.
