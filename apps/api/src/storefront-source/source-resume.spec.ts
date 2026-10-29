import { checkpointResumable } from './source-resume';

// Spec 2026-10-29 (agent cost): Andes and Atelier retried their first design from scratch because its brief is rewritten each time.
describe('checkpointResumable', () => {
  const checkpoint = { key: 'old', files: [], requirements: [], firstDesign: true };
  const base = { checkpoint, checkpointKey: 'new', matchingRequest: false, resumeDraft: false, matchingAssets: true, firstDesign: true };
  it('resumes a first design whose brief was written again', () => expect(checkpointResumable(base)).toBe(true));
  it('not with different photos', () => expect(checkpointResumable({ ...base, matchingAssets: false })).toBe(false));
  it('not when the earlier run was not a first design', () => expect(checkpointResumable({ ...base, checkpoint: { ...checkpoint, firstDesign: undefined } })).toBe(false));
  it('not when this run is not a first design', () => expect(checkpointResumable({ ...base, firstDesign: false })).toBe(false));
  it('keeps the earlier rules for every other request', () => {
    const plain = { ...base, firstDesign: false, checkpoint: { key: 'k', files: [], requirements: [] } };
    expect(checkpointResumable({ ...plain, checkpointKey: 'k', matchingAssets: false })).toBe(true);
    expect(checkpointResumable({ ...plain, matchingRequest: true })).toBe(true);
    expect(checkpointResumable({ ...plain, resumeDraft: true })).toBe(true);
    expect(checkpointResumable({ ...plain, resumeDraft: true, matchingAssets: false })).toBe(false);
    expect(checkpointResumable({ ...plain, checkpointKey: 'k', checkpoint: { key: 'k', files: [] } })).toBe(false);
    expect(checkpointResumable({ ...plain, checkpoint: null })).toBe(false);
  });
});
