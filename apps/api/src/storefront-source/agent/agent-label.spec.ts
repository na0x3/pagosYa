import { agentLabel, agentReport } from './agent-label';

it('never cuts a word: the first sentence, or a word boundary with «…»', () => {
  const live = 'Añadí ocho entradas visuales en marquesina para comparar las marcas de goodProtein, usando las fotos reales de sus productos y el mismo fondo de la tienda. El catálogo conserva tarjetas.';
  const label = agentLabel(live);
  expect(label.length).toBeLessThanOrEqual(81);
  expect(label.endsWith('…')).toBe(true);
  expect(live.startsWith(label.slice(0, -1))).toBe(true);
  expect(live.charAt(label.length - 1)).toMatch(/[\s,]/);
  expect(agentLabel('Cambié el título de la portada. También ajusté el botón.')).toBe('Cambié el título de la portada');
  expect(agentLabel('')).toBe('Cambios de YAPI');
});

it('reports in plain words when the run left no summary, and never prints empty lines', () => {
  expect(agentReport('Cambios de YAPI', [], true)).toBe('Rediseñé tu tienda con un estilo propio para tu marca.\n\n');
  expect(agentReport('', [])).toBe('Hice los cambios que pediste.\n\n');
  expect(agentReport('Puse una sección por marca.', ['Portada', ' ', 'Marcas'])).toBe('Puse una sección por marca.\n\n• Portada\n• Marcas\n\n');
});
