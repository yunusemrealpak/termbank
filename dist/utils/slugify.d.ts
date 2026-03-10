export declare function slugify(text: string): string;
/**
 * Converts a term name to a safe filename, preserving original casing and spaces.
 * Only removes characters that are illegal on Windows/Mac/Linux filesystems.
 */
export declare function safeFilename(term: string): string;
