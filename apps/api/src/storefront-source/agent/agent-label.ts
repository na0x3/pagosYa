/** The saved revision's name from YAPI's summary (live 2026-10-23: «…usando las fotos reales de sus produ»): its first
 *  sentence, cut at a word with «…» when it is still longer than 80 characters. */
export function agentLabel(summary: string): string {
  const line = summary.trim().split('\n')[0].trim() || 'Cambios de YAPI';
  const sentence = /^(.+?[.!?])(\s|$)/.exec(line)?.[1] ?? line;
  if (sentence.length <= 80) return sentence.replace(/\.$/, '');
  const cut = sentence.slice(0, 80);
  return `${cut.slice(0, cut.lastIndexOf(' ') > 40 ? cut.lastIndexOf(' ') : 80).replace(/[\s,;:·-]+$/, '')}…`;
}

/** What YAPI tells the merchant after an agent run (live 2026-10-23: a run without a summary printed «Cambios de YAPI» and
 *  blank lines). The summary when there is one, the sections when there are any, never an empty line. */
export function agentReport(summary: string, sections: string[], redesign = false): string {
  const said = summary.trim() && summary.trim() !== 'Cambios de YAPI' ? summary.trim() : redesign ? 'Rediseñé tu tienda con un estilo propio para tu marca.' : 'Hice los cambios que pediste.';
  const listed = sections.map(section => section.trim()).filter(Boolean);
  return `${said}\n\n${listed.length ? `${listed.map(section => `• ${section}`).join('\n')}\n\n` : ''}`;
}
