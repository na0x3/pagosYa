// Types for TypeScript consumers (Studio in B2, checkout in B3). The runtime is plain ESM in index.mjs.
import type { BlobatarOptions, Expression } from "blobatar";

export type ExpressionName = "idle" | "happy" | "sad" | "mad" | "surprised" | "wink" | "sleepy" | "smug" | "unsure" | "scared" | "love" | "shy" | "sick" | "thinking";
export type BlobShape = "round" | "organic" | "boxy" | "capsule" | "nub" | "cloud" | "droplet" | "hexagon" | "sun" | "triangle";
export type MotionName = "bounce" | "hop" | "shake" | "celebrate" | "talk";
export type AnimationName = "cheer" | "unlock" | "newOrder" | "paymentSuccess" | "paymentFailed" | "waiting" | "talking";

export interface BlobLook { shape?: BlobShape; hue?: number; tone?: number }
export interface BlobRenderOptions { look?: BlobLook; expression?: ExpressionName; title?: string; plate?: boolean; animate?: false | "hover" | "always"; className?: string }
export interface AnimationStep { expression: ExpressionName; hold: number; motion?: MotionName | null }
export interface ResolvedStep { expression: ExpressionName; hold: number; motion: MotionName | null }
export interface RunOptions { loop?: boolean; rest?: ExpressionName; reducedMotion?: boolean }
export interface AnimationIO { apply(step: { expression: ExpressionName; motion: MotionName | null }): void; wait(ms: number): Promise<void>; cancelled(): boolean }
export interface MountOptions { seed: string; look?: BlobLook; expression?: ExpressionName; title?: string; plate?: boolean; animate?: "hover" | "always"; reducedMotion?: boolean }
export interface BlobHandle {
  readonly svg: SVGSVGElement;
  readonly expression: ExpressionName;
  setRest(name: ExpressionName): void;
  play(steps: readonly AnimationStep[], options?: { loop?: boolean; rest?: ExpressionName }): Promise<void>;
  stop(): void;
  destroy(): void;
}

export declare const EXPRESSIONS: Readonly<Record<ExpressionName, Expression>>;
export declare const EXPRESSION_NAMES: readonly ExpressionName[];
export declare const SHAPES: Readonly<Record<BlobShape, number>>;
export declare const MOTIONS: readonly MotionName[];
export declare const ANIMATIONS: Readonly<Record<AnimationName, readonly AnimationStep[]>>;
export declare function blobOptions(options?: { look?: BlobLook; expression?: ExpressionName; plate?: boolean; animate?: false | "hover" | "always" }): BlobatarOptions;
export declare function blobSvg(seed: string, options?: BlobRenderOptions): string;
export declare function blobDataUri(seed: string, options?: { look?: BlobLook; expression?: ExpressionName; plate?: boolean }): string;
export declare function blobCacheSize(): number;
export declare function validateSteps(steps: readonly AnimationStep[]): ResolvedStep[];
export declare function runAnimation(steps: readonly AnimationStep[], options: RunOptions, io: AnimationIO): Promise<void>;
export declare function prefersReducedMotion(): boolean;
export declare function mountBlob(host: HTMLElement, options: MountOptions): BlobHandle;
