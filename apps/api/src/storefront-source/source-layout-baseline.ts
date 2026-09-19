import type { SourceProjectFileDto } from './dto/save-source-project.dto';

export const SOURCE_LAYOUT_BASELINE_MARKER = '/* pagosya-layout-baseline:start */';

/**
 * Platform-owned CSS safety net shared by every storefront generation and
 * runtime preview. It prevents common intrinsic-size collisions without
 * hiding page-wide overflow, so authored layouts remain visible and honest.
 */
export const SOURCE_LAYOUT_BASELINE = `${SOURCE_LAYOUT_BASELINE_MARKER}
:where(html, body) {
  max-width: 100%;
}
:where(*, *::before, *::after) {
  box-sizing: border-box;
}
:where(body, main, header, footer, nav, section, article, aside, form, fieldset, figure, div) {
  min-width: 0;
}
:where(img, svg, video, canvas, iframe) {
  max-width: 100%;
}
:where(img, video, canvas) {
  height: auto;
}
:where(h1, h2, h3, h4, h5, h6, p, li, dt, dd, blockquote, figcaption, a, button, label) {
  overflow-wrap: anywhere;
}
:where(input, select, textarea, button) {
  max-width: 100%;
  font: inherit;
}
:where([class*="grid"], [class*="flex"]) > * {
  min-width: 0;
}
@media (max-width: 767px) {
  :where(pre, table) {
    max-width: 100%;
  }
  :where(pre) {
    overflow: auto;
  }
  :where(table) {
    display: block;
    overflow-x: auto;
  }
}
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.001ms !important;
    animation-iteration-count: 1 !important;
    scroll-behavior: auto !important;
    transition-duration: 0.001ms !important;
  }
}
/* pagosya-layout-baseline:end */
`;

const stylesheet = (path: string) => /(?:^|\/)styles(?:\/globals)?\.css$/i.test(path);

/** Add the same responsive floor to legacy, static and React storefronts. */
export function applySourceLayoutBaseline(files: SourceProjectFileDto[]): SourceProjectFileDto[] {
  return files.map(file => {
    if (!stylesheet(file.path) || file.encoding === 'base64') return file;
    if (file.content.includes(SOURCE_LAYOUT_BASELINE_MARKER)) return file;
    return { ...file, content: SOURCE_LAYOUT_BASELINE + file.content.trimStart() };
  });
}
