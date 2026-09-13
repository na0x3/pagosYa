import { experimentEvidence } from './source-publishing.service';
const old = new Date(Date.now() - 8 * 86400000);
describe('experiment evidence', () => {
  it('never picks the arm with more raw orders when its conversion rate is lower', () => {
    expect(experimentEvidence({ visitors: 10000, buyers: 300 }, { visitors: 2000, buyers: 200 }, old).winner).toBe('B');
  });
  it('requires duration, visitors, purchases and separated intervals', () => {
    expect(experimentEvidence({ visitors: 1000, buyers: 20 }, { visitors: 1000, buyers: 100 }, new Date()).winner).toBeNull();
    expect(experimentEvidence({ visitors: 100, buyers: 20 }, { visitors: 100, buyers: 60 }, old).winner).toBeNull();
    expect(experimentEvidence({ visitors: 1000, buyers: 10 }, { visitors: 1000, buyers: 100 }, old).winner).toBeNull();
    expect(experimentEvidence({ visitors: 1000, buyers: 30 }, { visitors: 1000, buyers: 32 }, old).winner).toBeNull();
    expect(experimentEvidence({ visitors: 1000, buyers: 20 }, { visitors: 1000, buyers: 100 }, old, new Date(), true).winner).toBeNull();
  });
});
