/** YAPI may rewrite the store's shopper policies: the standard policy pages read them from Ajustes, so a draft never
 * hard-codes them. YAPI's choice waits on the toolbox, shows in the draft's config.js, and is written to Ajustes when
 * the run saves — the same as the merchant editing it there. */
import { SAFE_TEXT_PATTERN } from '../common/validation/safe-text.decorator';
import { STORE_POLICY_KEYS, storePolicies, type StorePolicies } from '../stores/store-presentation';

export const AGENT_POLICY_KINDS = STORE_POLICY_KEYS;
export type AgentPolicyKind = typeof STORE_POLICY_KEYS[number];
/** A policy's new text, or null to remove it; a kind left out is untouched. */
export type PendingPolicies = Partial<Record<AgentPolicyKind, string | null>>;

/** What Ajustes would refuse in a policy text, in plain Spanish, or null. */
export function policyTextProblem(text: string): string | null {
  if (text.length > 6000) return 'La política supera 6000 caracteres; resúmela.';
  if (!SAFE_TEXT_PATTERN.test(text)) return 'La política contiene caracteres invisibles o de dirección de texto; escríbela como texto simple.';
  return null;
}

/** The store's policies after YAPI's changes, normalised exactly as Ajustes saves them. */
export function mergeAgentPolicies(current: unknown, pending: PendingPolicies): StorePolicies {
  const merged: Record<string, unknown> = { ...storePolicies(current) };
  for (const [kind, text] of Object.entries(pending)) merged[kind] = text ?? '';
  return storePolicies(merged);
}

/** The draft's config.js with the pending policies, so previews and screenshots show the new text. */
export function snapshotWithPolicies<S extends { files: Array<{ path: string; content: string }> }>(snapshot: S, pending: PendingPolicies): S {
  if (!Object.keys(pending).length) return snapshot;
  return { ...snapshot, files: snapshot.files.map(file => {
    if (file.path !== 'config.js') return file;
    const match = file.content.match(/^\s*window\.PAGOSYA_CONFIG\s*=\s*([\s\S]*?);?\s*$/);
    if (!match) return file;
    try {
      const config = JSON.parse(match[1]);
      const data = config.data && typeof config.data === 'object' ? config.data : {};
      return { ...file, content: `window.PAGOSYA_CONFIG = ${JSON.stringify({ ...config, data: { ...data, policies: mergeAgentPolicies(data.policies, pending) } })};` };
    } catch { return file; }
  }) };
}
