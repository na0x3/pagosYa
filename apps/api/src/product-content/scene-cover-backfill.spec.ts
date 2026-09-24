import { planSceneCover } from './scene-cover-backfill';

const pack = '/v1/uploads/pack.jpg', scene = '/v1/uploads/scene.jpg', other = '/v1/uploads/other.jpg';
const lineage = new Map([[pack, { kind: 'ORIGINAL', parentUrl: null }], [scene, { kind: 'AI_DERIVED', parentUrl: pack }], [other, { kind: 'ORIGINAL', parentUrl: null }]]);

it('moves the scene staged from the current cover to the front, keeping positions aligned', () => {
  expect(planSceneCover({ imageUrls: [pack, other, scene], imagePositions: ['50% 50%', '10% 10%', '30% 70%'] }, lineage))
    .toEqual({ imageUrls: [scene, pack, other], imagePositions: ['30% 70%', '50% 50%', '10% 10%'] });
});
it('leaves products alone when nothing proves the pair', () => {
  expect(planSceneCover({ imageUrls: [scene, pack], imagePositions: [] }, lineage)).toBeNull(); // scene already leads
  expect(planSceneCover({ imageUrls: [other, scene], imagePositions: [] }, lineage)).toBeNull(); // scene of a different photo
  expect(planSceneCover({ imageUrls: [pack, other], imagePositions: [] }, lineage)).toBeNull();
  expect(planSceneCover({ imageUrls: [], imagePositions: [] }, lineage)).toBeNull();
});
it('pads missing positions with the centre rather than shifting a crop onto the wrong photo', () => {
  expect(planSceneCover({ imageUrls: [pack, scene], imagePositions: ['20% 20%'] }, lineage))
    .toEqual({ imageUrls: [scene, pack], imagePositions: ['50% 50%', '20% 20%'] });
  expect(planSceneCover({ imageUrls: [pack, scene], imagePositions: [] }, lineage))
    .toEqual({ imageUrls: [scene, pack], imagePositions: [] });
});
it('matches absolute and relative forms of the same upload', () => {
  expect(planSceneCover({ imageUrls: ['https://api.test' + pack, 'https://api.test' + scene], imagePositions: [] }, lineage))
    .toEqual({ imageUrls: ['https://api.test' + scene, 'https://api.test' + pack], imagePositions: [] });
});
