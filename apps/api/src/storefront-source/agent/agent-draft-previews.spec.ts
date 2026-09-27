import { AgentDraftPreviews } from './agent-draft-previews';

describe('AgentDraftPreviews', () => {
  it('keeps the latest compiled draft per store and hands it out only when newer than what the viewer has', () => {
    let now = 1000;
    const previews = new AgentDraftPreviews(() => now);
    expect(previews.get('s')).toEqual({ at: null });
    previews.set('s', [{ path: 'index.html', content: '<h1>1</h1>' }]);
    expect(previews.get('s')).toEqual({ at: 1000, files: [{ path: 'index.html', content: '<h1>1</h1>' }] });
    expect(previews.get('s', 1000)).toEqual({ at: 1000 });
    now = 2000;
    previews.set('s', [{ path: 'index.html', content: '<h1>2</h1>' }]);
    expect(previews.get('s', 1000).files).toEqual([{ path: 'index.html', content: '<h1>2</h1>' }]);
    previews.clear('s');
    expect(previews.get('s')).toEqual({ at: null });
  });
  it('forgets a draft after fifteen minutes', () => {
    let now = 0;
    const previews = new AgentDraftPreviews(() => now);
    previews.set('s', [{ path: 'index.html', content: 'x' }]);
    now = 15 * 60_000 + 1;
    expect(previews.get('s')).toEqual({ at: null });
  });
});
