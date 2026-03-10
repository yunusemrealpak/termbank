import { TermSummary } from '../utils/types.js';
export declare function ensureVaultDir(vaultPath: string): Promise<void>;
export declare function getVaultContext(vaultPath: string, maxTerms?: number): Promise<TermSummary[]>;
export declare function buildVaultContextBlock(terms: TermSummary[]): string;
/**
 * Finds a term's actual filename (without .md) via case-insensitive lookup.
 * Returns null if not found.
 */
export declare function findTermFile(vaultPath: string, searchTerm: string): Promise<string | null>;
export declare function termExists(vaultPath: string, searchTerm: string): Promise<boolean>;
export declare function saveTerm(vaultPath: string, fileName: string, content: string): Promise<string>;
export declare function readTerm(vaultPath: string, searchTerm: string): Promise<string | null>;
/**
 * Adds a [[wiki-link]] entry to a term file (both frontmatter and body section).
 * Returns true if added, false if already existed or file not found.
 */
export declare function addRelation(vaultPath: string, termSearchName: string, relatedTermName: string): Promise<boolean>;
/**
 * Updates specified frontmatter fields without touching the body.
 */
export declare function updateTermFrontmatter(vaultPath: string, searchTerm: string, updates: Record<string, unknown>): Promise<void>;
