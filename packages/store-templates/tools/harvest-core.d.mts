export interface HarvestFile { path: string; content: string }
export interface HarvestFinding { path: string; line: number; kind: 'brand' | 'asset' | 'id'; text: string }
export declare function harvestFiles(input: { files: HarvestFile[]; brand: string[]; replacements: Record<string, string> }): { files: HarvestFile[]; findings: HarvestFinding[] };
