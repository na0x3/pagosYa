import { SOURCE_SHOPPING_FLOW } from './source-shopping-flow';
import { ANALYTICS_TRACK_LABELS } from '../store-analytics/store-analytics.constants';

describe('shopping flow prompt', () => {
  it('asks YAPI to tag primary calls to action with the allow-listed data-track labels, and only those', () => {
    const line = SOURCE_SHOPPING_FLOW.split('\n').find(text => text.includes('data-track'));
    expect(line).toBeDefined();
    const labels = [...line!.matchAll(/`([a-z-]+)`/g)].map(match => match[1]);
    expect(labels).toEqual([...ANALYTICS_TRACK_LABELS]);
    expect(line!.length).toBeLessThan(420);
  });
});
