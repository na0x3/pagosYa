import { createHomeReviewer, HOME_REVIEW_PROBLEMS, HOME_REVIEW_TOOL, readHomeReview } from './home-writer-review';

const call = (args: unknown) => ({ calls: [{ name: 'report', arguments: JSON.stringify(args), callId: 'c1' }] });

describe('home writer review (spec 2026-11-04 §5)', () => {
  it('reads each problem as one line: what, where, how to fix', () => {
    expect(readHomeReview(call({ problemas: [{ problema: HOME_REVIEW_PROBLEMS[0], donde: 'portada', arreglo: 'oscurece la foto o mueve el texto' }] })))
      .toEqual([`${HOME_REVIEW_PROBLEMS[0]} — portada: oscurece la foto o mueve el texto`]);
  });
  it('no report call, bad JSON or an unknown problem kind reads as no problems', () => {
    expect(readHomeReview({ calls: [], text: 'Se ve bien.' })).toEqual([]);
    expect(readHomeReview({ calls: [{ name: 'report', arguments: '{oops', callId: 'c' }] })).toEqual([]);
    expect(readHomeReview(call({ problemas: [{ problema: 'me gusta más azul', donde: 'pie', arreglo: 'azul' }] }))).toEqual([]);
  });
  it('sends both captures as images with the report tool and the review instructions', async () => {
    const model = jest.fn().mockResolvedValue(call({ problemas: [] }));
    expect(await createHomeReviewer(model)(['data:image/jpeg;base64,AAA', 'data:image/jpeg;base64,BBB'])).toEqual([]);
    const input = model.mock.calls[0][0];
    expect(input.tools).toEqual([HOME_REVIEW_TOOL]);
    expect(input.transcript[0].content.filter((part: any) => part.type === 'input_image').map((part: any) => part.image_url)).toEqual(['data:image/jpeg;base64,AAA', 'data:image/jpeg;base64,BBB']);
  });
});
