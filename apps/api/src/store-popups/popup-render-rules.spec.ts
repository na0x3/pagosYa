import { checkPopupRender, type PopupMeasure } from './popup-render';

const box = (x: number, y: number, width: number, height: number, visible = true) => ({ x, y, width, height, visible });
const good = (width = 1280, height = 800): PopupMeasure => ({ width, height, dialogOpen: true, scrollWidth: width,
  boxes: { dialog: box(10, 10, width - 20, 700), close: box(width - 60, 20, 44, 44), photo: box(10, 10, width / 2, 300), title: box(20, 320, width / 2, 60),
    email: box(20, 400, width / 2, 46), consent: box(20, 460, width / 2, 40), submit: box(20, 520, 200, 48) },
  contrast: { title: 9, emailLabel: 8 }, titleOverPhoto: false });

describe('popup render rules', () => {
  it('passes a readable popup with its photo', () => { expect(checkPopupRender([good(), good(390, 844)])).toEqual([]); });
  it('names what is wrong and at which width', () => {
    const phone = good(390, 844);
    phone.boxes.photo = box(12, 100, 366, 90);
    phone.boxes.email = box(12, 900, 366, 46);
    phone.scrollWidth = 420;
    phone.contrast.title = 2.1;
    phone.titleOverPhoto = true;
    phone.boxes.close = null;
    const problems = checkPopupRender([good(), phone]);
    expect(problems).toEqual(expect.arrayContaining([
      'at 390px the photo is missing or under 120px tall', 'at 390px the email field is outside the screen', 'at 390px the page scrolls sideways',
      'at 390px the title contrast is under 4.5:1', 'at 390px the title sits on the photo without a panel', 'at 390px the close button is hidden']));
    expect(problems.every(problem => problem.startsWith('at 390px'))).toBe(true);
  });
  it('treats a title on a gradient or picture as unreadable, and a popup that never opened as failed', () => {
    const desktop = good(); desktop.contrast.title = null;
    expect(checkPopupRender([desktop])).toContain('at 1280px the title has no flat background colour');
    expect(checkPopupRender([{ ...good(), dialogOpen: false }])).toEqual(['at 1280px the popup did not open']);
  });
  it('accepts a published store popup without the email field', () => {
    const hosted = good(390, 844); hosted.boxes.email = null; hosted.contrast.emailLabel = null;
    expect(checkPopupRender([hosted])).toEqual([]);
  });
});

describe('popup render rules — legibility (owner 2026-11-09: DooBoo «letters are not legible»)', () => {
  it('refuses text under 12px and the design\'s own words laid on the photo', () => {
    const desktop = good();
    desktop.smallText = ['CUADERNO DE SABORES (9px)'];
    desktop.unreadableWords = ['DOOBOO GELATO'];
    expect(checkPopupRender([desktop])).toEqual([
      'at 1280px text is under 12px: CUADERNO DE SABORES (9px)', 'at 1280px these words are not on a flat readable colour: DOOBOO GELATO']);
  });
});
