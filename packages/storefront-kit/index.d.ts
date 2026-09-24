/** Directory holding the files copied into every generated storefront. */
export declare const kitDir: string;
/** Absolute path of a kit file, e.g. kitPath('commerce.js') or kitPath('icons', 'cart.svg'). */
export declare function kitPath(...segments: string[]): string;
/** Reads a kit file as UTF-8 text. */
export declare function readKitFile(...segments: string[]): Promise<string>;
/** Synchronous variant for tests and startup code. */
export declare function readKitFileSync(...segments: string[]): string;
