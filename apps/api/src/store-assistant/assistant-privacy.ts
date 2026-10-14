import type { StorePolicies } from '../stores/store-presentation';

export const ASSISTANT_PRIVACY_PARAGRAPH =
  'Asistente automático: si usas el chat de esta tienda, guardamos tus mensajes durante 90 días para responderte y mejorar la atención. ' +
  'El texto de la conversación se procesa con un proveedor de inteligencia artificial y no se usa para entrenar modelos. ' +
  'Si dejas tu correo o teléfono, la tienda lo usará solo para contestarte.';

/** Adds or removes exactly the assistant paragraph; a merchant's own wording is never touched. */
export function withAssistantPrivacy(policies: StorePolicies, enabled: boolean): StorePolicies {
  const current = policies.privacy ?? '';
  const has = current.includes(ASSISTANT_PRIVACY_PARAGRAPH);
  if (enabled && !has) {
    const next = current ? `${current}\n\n${ASSISTANT_PRIVACY_PARAGRAPH}` : ASSISTANT_PRIVACY_PARAGRAPH;
    return next.length > 6000 ? policies : { ...policies, privacy: next };
  }
  if (!enabled && has) {
    const next = current.replace(`\n\n${ASSISTANT_PRIVACY_PARAGRAPH}`, '').replace(ASSISTANT_PRIVACY_PARAGRAPH, '').trim();
    const { privacy: _dropped, ...rest } = policies;
    return next ? { ...rest, privacy: next } : rest;
  }
  return policies;
}
