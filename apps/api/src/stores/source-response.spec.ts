import { sourceResponseJson } from './source-response';
const part = (text: string) => ({ type: 'output_text', text });
describe('structured response extraction', () => {
  it('uses the final message after reasoning and commentary, combining its text parts', () => {
    expect(sourceResponseJson({ status: 'completed', output: [
      { type: 'reasoning', content: null },
      { type: 'message', phase: 'commentary', content: [part('Preparando los archivos…')] },
      { type: 'message', phase: 'final_answer', content: [part('{"label":"Café",'), part('"files":[]}')] },
    ] })).toEqual({ label: 'Café', files: [] });
  });
  it('accepts a complete JSON fence without accepting prose or broken JSON', () => {
    expect(sourceResponseJson({ status: 'completed', output: [{ content: [part('```json\n{"label":"Café"}\n```')] }] })).toEqual({ label: 'Café' });
    expect(() => sourceResponseJson({ status: 'completed', output: [{ content: [part('Here is {"label":"Café"}')] }] })).toThrow();
  });
  it.each([
    { status: 'incomplete', output: [{ content: [part('{}')] }] },
    { status: 'completed', output: [{ content: [part('{}')] }, { content: [{ type: 'refusal', refusal: 'No' }] }] },
    { status: 'completed', output: [{ type: 'message', phase: 'commentary', content: [part('{}')] }] },
    { status: 'completed', output: [{ content: [part('{}')] }, { content: [part('{broken')] }] },
  ])('does not use earlier output to hide an incomplete or invalid final answer', body => {
    expect(() => sourceResponseJson(body)).toThrow();
  });
});
