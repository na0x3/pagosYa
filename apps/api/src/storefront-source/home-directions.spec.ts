import { HOME_DIRECTIONS, HOME_MOTION_BRIEF, motionPartsUsed, parseHomeDirection, pickHomeDirection, type HomeDirectionId } from './home-directions';

// Spec 2026-10-30 home writer variety: six page directions picked per store; the animated look by brand mood.
const IDS = Object.keys(HOME_DIRECTIONS) as HomeDirectionId[];
const seeds = (n: number) => Array.from({ length: n }, (_, i) => `store-${i}`);

describe('pickHomeDirection', () => {
  it('is the same for the same store and recent list', () => {
    const input = { seed: 'store-x', recent: ['editorial'] as HomeDirectionId[], fashion: false, mood: 'calm' as const };
    expect(pickHomeDirection(input)).toEqual(pickHomeDirection(input));
  });
  it('never repeats the last three stores\' directions', () => {
    const recent: HomeDirectionId[] = ['editorial', 'lookbook', 'bandas', 'historia'];
    for (const seed of seeds(200)) expect(['editorial', 'lookbook', 'bandas']).not.toContain(pickHomeDirection({ seed, recent, fashion: false }).direction);
  });
  it('with every direction recently used, takes the one used longest ago', () => {
    const recent: HomeDirectionId[] = ['editorial', 'lookbook', 'bandas', 'historia', 'producto', 'manifiesto'];
    expect(pickHomeDirection({ seed: 'store-1', recent: recent.slice(0, 3), fashion: false }).direction).not.toMatch(/^(editorial|lookbook|bandas)$/);
    expect(IDS).toContain(pickHomeDirection({ seed: 'store-1', recent, fashion: false }).direction);
  });
  it('with few recent stores any unused direction can come up, and all six do over many stores', () => {
    const seen = new Set(seeds(300).map(seed => pickHomeDirection({ seed, recent: [], fashion: false }).direction));
    expect([...seen].sort()).toEqual([...IDS].sort());
  });
  it('fashion stores lean to lookbook and editorial', () => {
    const picks = seeds(600).map(seed => pickHomeDirection({ seed, recent: [], fashion: true }).direction);
    expect(picks.filter(id => id === 'lookbook' || id === 'editorial').length / picks.length).toBeGreaterThan(0.4);
  });
  it('bold brands are animated about 3 in 4, calm ones about 1 in 5, and an unknown mood is calm', () => {
    const share = (mood?: 'bold' | 'calm') => seeds(2000).filter(seed => pickHomeDirection({ seed, recent: [], fashion: false, mood }).animated).length / 2000;
    expect(share('bold')).toBeGreaterThan(0.65); expect(share('bold')).toBeLessThan(0.85);
    expect(share('calm')).toBeGreaterThan(0.12); expect(share('calm')).toBeLessThan(0.28);
    expect(share(undefined)).toBe(share('calm'));
  });
});

describe('parseHomeDirection', () => {
  it('reads the saved shape and ignores anything else', () => {
    expect(parseHomeDirection('{"direction":"lookbook","animated":true}')).toEqual({ direction: 'lookbook', animated: true });
    for (const bad of [undefined, '', 'nope', '{"direction":"circus","animated":true}', '{"direction":"lookbook","animated":"yes"}', '[]']) expect(parseHomeDirection(bad)).toBeNull();
  });
});

describe('motionPartsUsed', () => {
  it('finds each motion part the home uses once, and skips comments', () => {
    const home = `import { Marquee, ScrollScale } from '@pagosya/ui';
// <ParallaxStack images={[]} /> is not used yet
<Hero scrollGrow /> <ScrollScale><img /></ScrollScale> <Marquee items={[]} /> <Marquee items={[]} />`;
    expect(motionPartsUsed(home).sort()).toEqual(['Marquee', 'ScrollScale', 'scrollGrow']);
  });
});

describe('the briefs', () => {
  it('each direction names its cover, and the motion brief names the kit parts', () => {
    for (const id of IDS) expect(HOME_DIRECTIONS[id]).toMatch(/Portada:/);
    for (const part of ['ScrollScale', 'ParallaxStack', 'Statement', 'Marquee', 'EntranceGroup', 'ProductShowcase', 'scrollGrow']) expect(HOME_MOTION_BRIEF).toContain(part);
  });
});
