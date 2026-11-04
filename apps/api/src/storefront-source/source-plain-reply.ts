/* Fix 6 (2026-11-02, goodProtein #12 request 8: «**9 productos**» reached the chat as raw asterisks): the YAPI chat shows plain text,
 * so a model reply loses its markdown — bold and italics keep their words, headings and list marks become plain lines. */
export function plainReply(text: string): string {
  return text
    .replace(/\*\*([^*\n]+)\*\*/g, '$1')
    .replace(/__([^_\n]+)__/g, '$1')
    .replace(/(^|[\s(«])\*([^*\n]+)\*(?=[\s).,;:!?»]|$)/g, '$1$2')
    .replace(/`([^`\n]+)`/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^\s*[-*]\s+/gm, '• ')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, '$1 ($2)');
}
