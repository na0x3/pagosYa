import { escapeHtml } from "./html.mjs";
import { icon } from "./icons.mjs";

// The dashboard's shared controls, styled only in ui-kit.css. Text arguments are escaped here;
// `attrs` (ids, data-*, aria-*, "disabled") and a stat's `value` are markup the caller built with
// every value already escaped.

/** @param {string} attrs */
const extra = (attrs) => (attrs ? ` ${attrs}` : "");

/**
 * Section head: icon box, title, one line, optional count pill (a count of 0 still shows).
 * @param {{ icon: string, title: string, text?: string, id?: string, count?: string | number }} options
 */
export function uiHead(options) {
  const { title, text = "", id = "", count } = options;
  const idAttr = id ? ` id="${escapeHtml(id)}"` : "";
  return `<div class="ui-head"><span class="ui-head-icon">${icon(options.icon)}</span><div class="ui-head-text"><h3${idAttr}>${escapeHtml(title)}</h3>${text ? `<p>${escapeHtml(text)}</p>` : ""}</div>${count === undefined || count === null ? "" : `<span class="ui-count">${escapeHtml(count)}</span>`}</div>`;
}

/**
 * A switch with an icon, a title and one helper line; laid out side by side inside .ui-options.
 * @param {{ title: string, text?: string, icon?: string, attrs?: string, checked?: boolean, disabled?: boolean }} options
 */
export function uiOption(options) {
  const { title, text = "", attrs = "", checked = false, disabled = false } = options;
  return `<label class="ui-option"><input type="checkbox" role="switch" class="ui-switch"${extra(attrs)}${checked ? " checked" : ""}${disabled ? " disabled" : ""}>${options.icon ? `<span class="ui-option-icon">${icon(options.icon)}</span>` : ""}<span class="ui-option-text"><strong>${escapeHtml(title)}</strong>${text ? `<small>${escapeHtml(text)}</small>` : ""}</span></label>`;
}

/**
 * A switch with a short inline label ("Cerrado", "Activo").
 * @param {{ label: string, attrs?: string, checked?: boolean, disabled?: boolean }} options
 */
export function uiSwitch(options) {
  const { label, attrs = "", checked = false, disabled = false } = options;
  return `<label class="ui-inline-switch"><input type="checkbox" role="switch" class="ui-switch"${extra(attrs)}${checked ? " checked" : ""}${disabled ? " disabled" : ""}><span>${escapeHtml(label)}</span></label>`;
}

/**
 * A radio drawn as a card: icon, title, one line. Put several in .ui-choices.
 * @param {{ group: string, value: string, title: string, text?: string, icon?: string, checked?: boolean }} options
 */
export function uiChoice(options) {
  const { group, value, title, text = "", checked = false } = options;
  return `<label class="ui-choice"><input type="radio" name="${escapeHtml(group)}" value="${escapeHtml(value)}"${checked ? " checked" : ""}>${options.icon ? `<span class="ui-choice-icon">${icon(options.icon)}</span>` : ""}<span class="ui-choice-text"><strong>${escapeHtml(title)}</strong>${text ? `<small>${escapeHtml(text)}</small>` : ""}</span></label>`;
}

/**
 * A small radio pill ("7 días", "Formal"). Put several in .ui-pills.
 * @param {{ group: string, value: string, label: string, checked?: boolean }} options
 */
export function uiPill(options) {
  const { group, value, label, checked = false } = options;
  return `<label class="ui-pill"><input type="radio" name="${escapeHtml(group)}" value="${escapeHtml(value)}"${checked ? " checked" : ""}><span>${escapeHtml(label)}</span></label>`;
}

/**
 * One summary figure for a <dl class="ui-stats">: label with a corner icon, then the value markup.
 * @param {{ label: string, value: string, icon?: string, tone?: "" | "warning" | "good" | "attention" }} options
 */
export function uiStat(options) {
  const { label, value, tone = "" } = options;
  return `<div class="ui-stat${tone ? ` is-${tone}` : ""}"><dt><span>${escapeHtml(label)}</span>${options.icon ? icon(options.icon, { size: 16 }) : ""}</dt><dd>${value}</dd></div>`;
}
