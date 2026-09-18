/** Read the final structured message, never an intermediate commentary block.
 * Concatenate content parts within a message before parsing. Source validation
 * still runs separately; incomplete/refused responses must never become a site.
 */
export function sourceResponseJson(body: any): any {
  if (body?.status !== 'completed' || !Array.isArray(body.output)) throw new Error('Incomplete response');
  const messages = body.output.filter((item: any) => item && (!item.type || item.type === 'message') && item.phase !== 'commentary' && Array.isArray(item.content));
  const final = messages.at(-1);
  if (!final || final.content.some((part: any) => part?.type === 'refusal')) throw new Error('Missing structured response');
  const text = final.content.filter((part: any) => part?.type === 'output_text' && typeof part.text === 'string').map((part: any) => part.text).join('').trim();
  const fenced = text.match(/^```(?:json)?\s*\n([\s\S]*?)\n```$/i);
  return JSON.parse(fenced ? fenced[1] : text);
}
