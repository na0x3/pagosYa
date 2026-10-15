/** «Datos que YAPI supuso» in the Studio sidebar (spec 2026-10-14 store voice, part 5): each fact YAPI assumed, where it appears,
 *  and Confirmar / Editar / Quitar. Pending facts also become a blocking check row, so publishing waits for them. */
import { escapeHtml as escape } from './studio-ui';
import type { SourceCheck } from './source-checks';
import './source-assumed-facts.css';

export type AssumedFactView = { id: string; text: string; kind: string; status: 'assumed' | 'confirmed'; pages: string[]; unwrapped: string[] };
export const ASSUMED_FACTS_TITLE = 'Datos que YAPI supuso';

/** A page path as a merchant reads it: Inicio for the home, otherwise its name. */
export function pageLabel(path: string): string {
  return path === 'index.html' ? 'Inicio' : path.replace(/^pages\//, '').replace(/\.html$/, '');
}
const waiting = (facts: AssumedFactView[] | null) => (facts ?? []).filter(fact => fact.status === 'assumed');

/** The same words the API's publish gate uses (assumed-facts.ts assumedFactsBlockMessage). */
export function assumedFactsMessage(facts: AssumedFactView[]): string {
  const one = facts.length === 1;
  return `Antes de publicar, confirma, corrige o quita ${one ? 'el dato' : `los ${facts.length} datos`} que YAPI supuso: ${facts.map(fact => `«${fact.text}»`).join(', ')}. ${one ? 'Está' : 'Están'} en «${ASSUMED_FACTS_TITLE}».`;
}

export function assumedFactsCheck(facts: AssumedFactView[] | null): SourceCheck | null {
  const pending = waiting(facts);
  return pending.length ? { label: ASSUMED_FACTS_TITLE, status: 'failed', blocking: true, detail: assumedFactsMessage(pending) } : null;
}

export function renderAssumedFacts(input: { facts: AssumedFactView[] | null; editing: string | null; locked: boolean }): string {
  const facts = input.facts ?? [];
  if (!facts.length) return '';
  const pending = waiting(facts).length;
  const off = input.locked ? ' disabled' : '';
  const row = (fact: AssumedFactView) => {
    const where = fact.pages.length ? `<p class="assumed-facts__pages">En ${fact.pages.map(page => escape(pageLabel(page))).join(', ')}</p>` : '';
    const loose = fact.unwrapped.length ? `<p class="assumed-facts__loose">También aparece sin marcar en ${fact.unwrapped.map(page => escape(pageLabel(page))).join(', ')}.</p>` : '';
    const id = escape(fact.id);
    const actions = fact.status === 'confirmed'
      ? '<span class="assumed-facts__done">Confirmado</span>'
      : input.editing === fact.id
        ? `<form class="assumed-facts__edit" data-fact-form="${id}"><label>Dato correcto<input name="text" maxlength="160" required value="${escape(fact.text)}"></label><button type="submit" class="button button--primary"${off}>Guardar</button><button type="button" class="text-button" data-fact-cancel${off}>Cancelar</button></form>`
        : `<div class="assumed-facts__actions"><button type="button" class="text-button" data-fact-confirm="${id}"${off}>Confirmar</button><button type="button" class="text-button" data-fact-edit="${id}"${off}>Editar</button><button type="button" class="text-button" data-fact-remove="${id}"${off}>Quitar</button></div>`;
    return `<li data-assumed-fact="${id}"><p class="assumed-facts__text">${escape(fact.text)}</p>${where}${loose}${actions}</li>`;
  };
  return `<section class="assumed-facts" aria-labelledby="assumed-facts-title"><h2 id="assumed-facts-title">${ASSUMED_FACTS_TITLE}${pending ? ` <span>${pending} por confirmar</span>` : ''}</h2><p>YAPI escribió estos datos para que tu tienda suene más tuya. Confírmalos, corrígelos o quítalos antes de publicar.</p><ol>${facts.map(row).join('')}</ol></section>`;
}
