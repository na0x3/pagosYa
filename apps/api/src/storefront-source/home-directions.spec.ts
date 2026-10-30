import { HOME_DIRECTIONS, HOME_FOOTERS, HOME_MOTION_BRIEF, HOME_PLAYFUL_BRIEF, ambientPartsUsed, isPlayfulBusiness, motionPartsUsed, parseHomeDirection, pickHomeDirection, pickHomeFooter, type HomeDirectionId, type HomeFooterId } from './home-directions';

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
    for (const seed of seeds(200)) expect(['editorial', 'lookbook', 'bandas']).not.toContain(pickHomeDirection({ seed, recent, fashion: false, mood: 'bold' }).direction);
  });
  it('with every direction recently used, takes the one used longest ago', () => {
    const recent: HomeDirectionId[] = ['editorial', 'lookbook', 'bandas', 'historia', 'producto', 'manifiesto'];
    expect(pickHomeDirection({ seed: 'store-1', recent: recent.slice(0, 3), fashion: false }).direction).not.toMatch(/^(editorial|lookbook|bandas)$/);
    expect(IDS).toContain(pickHomeDirection({ seed: 'store-1', recent, fashion: false }).direction);
  });
  it('with few recent stores any unused direction can come up, and all six do over many stores', () => {
    const seen = new Set(seeds(300).map(seed => pickHomeDirection({ seed, recent: [], fashion: false, mood: 'bold' }).direction));
    expect([...seen].sort()).toEqual([...IDS].sort());
  });
  it('a calm brand never draws manifiesto or bandas (owner 2026-10-30, BOXY «too shouty»), even with the rest used', () => {
    for (const seed of seeds(300)) expect(['manifiesto', 'bandas']).not.toContain(pickHomeDirection({ seed, recent: [], fashion: false, mood: 'calm' }).direction);
    expect(['manifiesto', 'bandas']).not.toContain(pickHomeDirection({ seed: 'x', recent: ['editorial', 'producto', 'lookbook', 'historia'], fashion: false, mood: 'calm' }).direction);
  });
  it('fashion stores lean to lookbook and editorial', () => {
    const picks = seeds(600).map(seed => pickHomeDirection({ seed, recent: [], fashion: true }).direction);
    expect(picks.filter(id => id === 'lookbook' || id === 'editorial').length / picks.length).toBeGreaterThan(0.4);
  });
  it('a playful store is always animated and counts as bold', () => {
    for (const seed of seeds(200)) expect(pickHomeDirection({ seed, recent: [], fashion: false, mood: 'calm', playful: true })).toMatchObject({ animated: true, playful: true });
    expect(new Set(seeds(300).map(seed => pickHomeDirection({ seed, recent: [], fashion: false, playful: true }).direction))).toContain('bandas');
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
    expect(parseHomeDirection('{"direction":"bandas","animated":true,"footer":"foto","playful":true}')).toEqual({ direction: 'bandas', animated: true, footer: 'foto', playful: true });
    expect(parseHomeDirection('{"direction":"bandas","animated":true,"footer":"circus"}')).toEqual({ direction: 'bandas', animated: true });
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
    for (const id of Object.keys(HOME_FOOTERS)) expect(HOME_FOOTERS[id as HomeFooterId]).toMatch(/^PIE:/);
    for (const part of ['ScrollScale', 'Statement', 'Marquee', 'EntranceGroup', 'Float', 'Sticker', 'Wiggle', 'BounceText']) expect(HOME_MOTION_BRIEF).toContain(part);
    for (const part of ['Float', 'Sticker', 'Wiggle', 'BounceText']) expect(HOME_PLAYFUL_BRIEF).toContain(`<${part}>`);
    // Owner 2026-10-30: parts that need the kit's own stylesheet show unstyled on Esencial, so the brief rules them out.
    expect(HOME_MOTION_BRIEF).toMatch(/No uses Hero, ParallaxStack ni ProductShowcase/);
    // Review 2026-10-30: words stay editable with a double click — literal JSX text, never strings in props.
    expect(HOME_MOTION_BRIEF).toMatch(/texto JSX/);
  });
});

describe('footers and playful stores (owner 2026-10-30)', () => {
  it('the footer idea never repeats the last three stores\' and the playful one is only for playful stores', () => {
    const recent: HomeFooterId[] = ['gigante', 'foto', 'color'];
    for (const seed of seeds(200)) {
      expect(recent).not.toContain(pickHomeFooter(seed, recent, false));
      expect(pickHomeFooter(seed, [], false)).not.toBe('juguete');
    }
    expect(new Set(seeds(300).map(seed => pickHomeFooter(seed, [], true)))).toContain('juguete');
    expect(pickHomeDirection({ seed: 's', recent: [], fashion: false }).footer).toEqual(expect.any(String));
  });
  it('knows fun businesses from two mentions, not one passing word', () => {
    expect(isPlayfulBusiness('Oh Belly, soda prebiótica. Sabores: soda de frutilla, soda de mango')).toBe(true);
    expect(isPlayfulBusiness('Gomitas Dulce Oso: gomitas de fruta y caramelos para fiestas')).toBe(true);
    expect(isPlayfulBusiness('Tienda de juegos de mesa y videojuegos')).toBe(true);
    expect(isPlayfulBusiness('Hoodies BOXY de algodón. No apto para niños menores de 3 años.')).toBe(false);
    expect(isPlayfulBusiness('Juego de sábanas de lino para la casa')).toBe(false);
  });
  it('counts the always-moving parts, and a web address on the line does not hide a part', () => {
    expect(ambientPartsUsed('<Float><img /></Float> <a href="https://x.bo">x</a> <Sticker>Nuevo</Sticker> // <Wiggle>')).toEqual(['Float', 'Sticker']);
    expect(motionPartsUsed('<a href="https://wa.me/1">w</a> <Marquee items={[]} />')).toEqual(['Marquee']);
  });
});
