import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Owner 2026-11-16 («change yapi to the new design»): YAPI's panel leaves the charcoal terminal for the dashboard's Clyro glass —
// frosted white over the wash, Onest, ink text, the merchant's words in ink bubbles, the yellow star, an ink send pill.
describe('YAPI panel in the Clyro glass look', () => {
  const css = readFileSync(new URL('./source-yapi-terminal.css', import.meta.url), 'utf8');
  it('keeps nothing of the terminal: no monospace, no lime, no charcoal', () => {
    expect(css).not.toMatch(/--yt-mono|monospace|#d7e35a|#2d2d2d|#232323/);
  });
  it('the panel is frosted glass in Onest and ink over the page wash', () => {
    expect(css).toMatch(/@font-face \{ font-family: "Onest"; src: url\("\/fonts\/onest\.woff2"\)/);
    expect(css).toMatch(/\.studio-shell\.is-yapi-pill \.yapi-dock \{[^}]*background: var\(--yc-glass\);[^}]*backdrop-filter: var\(--yc-blur\);[^}]*color: var\(--yc-ink\);[^}]*font-family: var\(--yc-body\);/);
    // .studio-shell.source-mode (source-workspace-design.css) paints the shell later at the same weight: the wash needs one more class.
    expect(css).toMatch(/\.studio-shell\.source-mode\.is-yapi-pill \{ background: var\(--yc-wash\) fixed; \}/);
  });
  it('the merchant speaks in ink bubbles, YAPI under the yellow star', () => {
    expect(css).toMatch(/\.message--remote-user \{[^}]*background: var\(--yc-ink\);[^}]*color: #fff;/);
    expect(css).toMatch(/\.yapi-mark \{[^}]*background: url\("\/assets\/pagosya-star-yellow\.png"\)/);
  });
  it('the composer is a white glass box with an ink pill to send', () => {
    expect(css).toMatch(/\.yapi-dock \.yapi-pill \{[^}]*background: var\(--yc-glass-strong\);/);
    expect(css).toMatch(/\.yapi-dock \.yapi-pill__send \{[^}]*border-radius: 999px;[^}]*background: var\(--yc-ink\);/);
  });
});
