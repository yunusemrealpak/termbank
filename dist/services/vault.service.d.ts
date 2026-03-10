import { TermSummary } from '../utils/types.js';
export interface NoteSummary {
    slug: string;
    title: string;
    summary: string;
    tags: string[];
}
export interface VisualSummary {
    slug: string;
    title: string;
    summary: string;
    tags: string[];
}
export interface VaultContext {
    terms: TermSummary[];
    notes: NoteSummary[];
    visuals: VisualSummary[];
}
export declare function ensureVaultDir(vaultPath: string): Promise<void>;
export declare function ensureNotesDir(vaultPath: string): Promise<void>;
export declare function ensureVisualsDir(vaultPath: string): Promise<void>;
export declare function getVaultContext(vaultPath: string, maxTerms?: number): Promise<VaultContext>;
export declare function buildVaultContextBlock(context: VaultContext): string;
/**
 * Builds a simple string context block (for use in claude service prompts).
 */
export declare function buildVaultContextString(context: VaultContext): string;
/**
 * Returns all slugs across all content types for relation checks.
 */
export declare function getAllSlugs(context: VaultContext): string[];
/**
 * Finds a term's actual filename (without .md) via case-insensitive lookup.
 * Returns null if not found.
 */
export declare function findTermFile(vaultPath: string, searchTerm: string): Promise<string | null>;
export declare function termExists(vaultPath: string, searchTerm: string): Promise<boolean>;
export declare function saveTerm(vaultPath: string, fileName: string, content: string): Promise<string>;
export declare function readTerm(vaultPath: string, searchTerm: string): Promise<string | null>;
export declare function noteExists(vaultPath: string, slug: string): Promise<boolean>;
export declare function saveNote(vaultPath: string, slug: string, content: string): Promise<string>;
export declare function readNote(vaultPath: string, slug: string): Promise<string>;
export declare function visualExists(vaultPath: string, slug: string): Promise<boolean>;
export declare function saveVisual(vaultPath: string, slug: string, content: string): Promise<string>;
/**
 * Copies a visual file to the visuals directory with conflict handling.
 * Returns the filename used in the destination (may differ if there was a collision).
 */
export declare function copyVisualFile(sourcePath: string, destDir: string): Promise<string>;
/**
 * Adds a [[wiki-link]] entry to a content file (both frontmatter and body section).
 * Searches terms/, notes/, visuals/ in order.
 * Returns true if added, false if already existed or file not found.
 */
export declare function addRelation(vaultPath: string, targetSlugOrName: string, relatedDisplayName: string): Promise<boolean>;
/**
 * Updates specified frontmatter fields without touching the body.
 */
export declare function updateTermFrontmatter(vaultPath: string, searchTerm: string, updates: Record<string, unknown>): Promise<void>;
