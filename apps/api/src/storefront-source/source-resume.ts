/** Whether an unfinished run's private checkpoint may be continued by this run. Same request (its digest, the merchant
 *  request key, or «Guardar borrador») as before; spec 2026-10-29 (agent cost) adds a first design retrying a failed first
 *  design, whose brief YAPI writes anew on every attempt. Photos must match except for an identical digest. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- the checkpoint is untyped JSON from the run row
export function checkpointResumable(input: { checkpoint: any; checkpointKey: string; matchingRequest: boolean; resumeDraft: boolean; matchingAssets: boolean; firstDesign: boolean }): boolean {
  const { checkpoint } = input;
  if (!Array.isArray(checkpoint?.files) || !Array.isArray(checkpoint?.requirements)) return false;
  if (checkpoint.key === input.checkpointKey) return true;
  if (!input.matchingAssets) return false;
  return input.matchingRequest || input.resumeDraft || (input.firstDesign && checkpoint.firstDesign === true);
}
