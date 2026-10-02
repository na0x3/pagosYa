import './source-code-tree.css';
import { codeLanguage } from './source-code-highlight';
import { escapeHtml as escape, icon } from './studio-ui';
import { listStorePages } from './source-pages';

type File = { path: string; content: string; encoding?: string };

export function codeFileEditable(files: File[], path: string): boolean {
  const file = files.find(file => file.path === path);
  if (!file || file.encoding === 'base64') return false;
  if (!files.some(file => file.path === 'storefront-framework.json')) return true;
  return (path.startsWith('components/') && path.endsWith('.tsx') && path !== 'components/store-data.tsx') || path === 'styles/globals.css';
}

export function codeFileForPage(files: File[], page: string): string {
  return listStorePages(files).find(entry => entry.url === page)?.file
    ?? (files.some(file => file.path === page) ? page : files[0]?.path ?? '');
}

export function renderCodeTree(files: File[], selected: string, locked: boolean): string {
  const branch = (prefix: string): string => {
    const children = new Map<string, boolean>();
    for (const file of files) {
      if (!file.path.startsWith(prefix)) continue;
      const rest = file.path.slice(prefix.length);
      const name = rest.split('/')[0];
      children.set(name, rest.includes('/'));
    }
    return [...children].sort(([a, dirA], [b, dirB]) => Number(dirB) - Number(dirA) || a.localeCompare(b)).map(([name, directory]) => {
      const path = prefix + name;
      if (directory) return `<details ${selected.startsWith(path + '/') || ['components', 'components/auth', 'components/account', 'components/pages', 'components/catalog', 'styles'].includes(path) ? 'open' : ''}><summary><span class="source-folder-icon" aria-hidden="true"></span><span>${escape(name)}</span></summary><div>${branch(path + '/')}</div></details>`;
      const readonly = !codeFileEditable(files, path);
      return `<button type="button" data-code-file="${escape(path)}" title="${escape(path)}${readonly ? ' · Solo lectura' : ''}" ${selected === path ? 'aria-current="true"' : ''} ${locked ? 'disabled' : ''}>${fileBadge(path)}<span class="source-file-name">${escape(name)}</span>${readonly ? `<small aria-label="Solo lectura">${icon('lock')}</small>` : ''}</button>`;
    }).join('');
  };
  return `<nav class="source-code-tree" aria-label="Archivos de la tienda"><div class="source-code-tree-title">Archivos <span>${files.length}</span></div><div class="source-code-tree-root">Tu tienda</div>${branch('')}</nav>`;
}

function fileBadge(path: string): string {
  const extension = path.split('.').at(-1)?.toLowerCase() || '';
  const kind = ['tsx', 'jsx', 'ts', 'js', 'css', 'json', 'html'].includes(extension) ? extension : 'asset';
  const label = ({ tsx: 'TS', jsx: 'JS', ts: 'TS', js: 'JS', css: '#', json: '{}', html: '◇' } as Record<string, string>)[kind] || '·';
  return `<span class="source-file-badge source-file-badge--${kind}" aria-hidden="true">${label}</span>`;
}

export function renderCodeBrowser(files: File[], selected: string, busy: boolean, dirty: boolean): string {
  const editable = codeFileEditable(files, selected);
  const parts = selected.split('/');
  const name = parts.pop() || 'Archivo';
  return `<section class="source-editor source-code-browser">${renderCodeTree(files, selected, busy || dirty)}<div class="source-code-pane"><header><label class="source-code-mobile-picker">Archivo<select id="source-file" ${busy || dirty ? 'disabled' : ''}>${files.map(file => `<option ${file.path === selected ? 'selected' : ''}>${escape(file.path)}</option>`).join('')}</select></label><div class="source-code-path">${fileBadge(selected)}<span>${parts.map(part => `${escape(part)} <span class="source-code-separator">/</span> `).join('')}<strong>${escape(name)}</strong></span></div><span class="source-code-permission">${editable ? 'Editable' : `${icon('lock')} Solo lectura`}</span></header><div class="source-code-surface"><div class="source-code-gutter" aria-hidden="true"><pre data-code-lines></pre></div><div class="source-code-paint" aria-hidden="true"><pre data-code-highlight></pre></div><textarea id="source-code" aria-label="Código del archivo" spellcheck="false" autocapitalize="off" autocomplete="off" wrap="off" maxlength="180000" ${editable ? '' : 'readonly'} ${busy ? 'disabled' : ''}></textarea></div><div class="source-code-actions"><span class="source-code-language">${escape(codeLanguage(selected))}</span>${editable ? `<button id="source-save" class="button button--publish" ${busy || !dirty ? 'disabled' : ''}>Guardar cambios</button><button id="source-discard" class="button" ${busy || !dirty ? 'disabled' : ''}>Descartar edición</button>` : '<p>Archivo de la plataforma o recurso. Disponible para consulta.</p>'}</div></div></section>`;
}
