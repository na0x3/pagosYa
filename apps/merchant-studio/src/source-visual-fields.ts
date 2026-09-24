/**
 * The shape the visual editor exchanges with the api. It sits in its own
 * module because `api.ts` returns it and `source-direct-editor.ts` renders
 * it — declaring it in either one makes the pair circular.
 */
export type VisualField = { id: string; path: string; label: string; kind: 'text' | 'image' | 'color' | 'select'; value: string; options?: string[]; optionLabels?: Record<string, string> };
export type VisualFields = { revision: number; fields: VisualField[] };
