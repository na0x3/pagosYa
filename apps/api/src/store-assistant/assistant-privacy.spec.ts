import { ASSISTANT_PRIVACY_PARAGRAPH, withAssistantPrivacy } from './assistant-privacy';

describe('assistant privacy paragraph', () => {
  it('adds the paragraph once when enabled and removes exactly it when disabled', () => {
    const on = withAssistantPrivacy({ privacy: 'Cuidamos tus datos.' }, true);
    expect(on.privacy).toBe(`Cuidamos tus datos.\n\n${ASSISTANT_PRIVACY_PARAGRAPH}`);
    expect(withAssistantPrivacy(on, true).privacy).toBe(on.privacy);
    expect(withAssistantPrivacy(on, false).privacy).toBe('Cuidamos tus datos.');
  });

  it('creates a privacy text when the store has none, and never exceeds 6000 characters', () => {
    expect(withAssistantPrivacy({}, true).privacy).toBe(ASSISTANT_PRIVACY_PARAGRAPH);
    expect(withAssistantPrivacy(withAssistantPrivacy({}, true), false).privacy).toBeUndefined();
    const long = 'x'.repeat(5990);
    expect(withAssistantPrivacy({ privacy: long }, true).privacy).toBe(long);
  });
});
