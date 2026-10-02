import hljs from 'highlight.js/lib/core';
import typescript from 'highlight.js/lib/languages/typescript';
import xml from 'highlight.js/lib/languages/xml';
import css from 'highlight.js/lib/languages/css';
import json from 'highlight.js/lib/languages/json';
import { escapeHtml } from './studio-ui';

hljs.registerLanguage('xml', xml);
hljs.registerLanguage('typescript', typescript);
hljs.registerLanguage('css', css);
hljs.registerLanguage('json', json);

export function codeLanguage(path: string): string {
  const extension = path.split('.').at(-1)?.toLowerCase();
  return ({ tsx: 'TSX', jsx: 'JSX', ts: 'TypeScript', js: 'JavaScript', css: 'CSS', json: 'JSON', html: 'HTML', md: 'Markdown' } as Record<string, string>)[extension || ''] || 'Texto';
}

export function highlightCode(content: string, path: string): string {
  const extension = path.split('.').at(-1)?.toLowerCase() || '';
  const language = ({ tsx: 'typescript', jsx: 'typescript', ts: 'typescript', js: 'typescript', css: 'css', json: 'json', html: 'xml' } as Record<string, string>)[extension];
  // Large generated bundles remain readable without blocking typing on a full parse.
  if (!language || content.length > 180000) return escapeHtml(content);
  try { return hljs.highlight(content, { language, ignoreIllegals: true }).value; }
  catch { return escapeHtml(content); }
}

/** The textarea owns editing, selection and undo; the inert layer only supplies color. */
export function mountCodeHighlight(editor: HTMLTextAreaElement, path: string): void {
  const host = editor.closest<HTMLElement>('.source-code-surface');
  const code = host?.querySelector<HTMLElement>('[data-code-highlight]');
  const lines = host?.querySelector<HTMLElement>('[data-code-lines]');
  if (!host || !code || !lines) return;
  const syncScroll = () => {
    code.style.transform = `translate(${-editor.scrollLeft}px, ${-editor.scrollTop}px)`;
    lines.style.transform = `translateY(${-editor.scrollTop}px)`;
  };
  const paint = () => {
    code.innerHTML = highlightCode(editor.value, path) + '\n';
    lines.textContent = Array.from({ length: editor.value.split('\n').length }, (_, i) => i + 1).join('\n');
    syncScroll();
  };
  paint();
  host.classList.add('is-highlighted');
  editor.addEventListener('input', paint);
  editor.addEventListener('scroll', syncScroll, { passive: true });
}
