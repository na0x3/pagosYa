export type VariantDraft = { id?: string; name: string; amount: string; stock?: string; legacySharedStock?: boolean; stockDirty?: boolean; imageDirty?: boolean; options?: Array<{name: string; value: string}>; imageUrl?: string };
export type VariantInput = {id?: string; name: string; amount: number; stock?: number | null; options?: Array<{name: string; value: string}>; imageUrl?: string | null};
export type EditorConfig = {variants?: VariantDraft[]; onChange?: (rows: VariantDraft[]) => void; photos?: () => string[]; basePrice?: () => string};
declare global {
  var PagosYaProductOptions: {
    MAX_GROUPS: number; MAX_VARIANTS: number;
    combinations(groups: Array<{name: string; values: string[]}>, previous?: VariantDraft[], price?: string): VariantDraft[];
    serialize(rows: VariantDraft[]): VariantInput[];
    mount(host: HTMLElement, config?: {variants?: VariantDraft[]; onChange?: (rows: VariantDraft[]) => void; photos?: () => string[]; basePrice?: () => string}): {values(): VariantInput[]; refreshPhotos(): void};
  };
}
