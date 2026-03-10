import { Config } from '../utils/config.js';
import { TermData, TermSummary } from '../utils/types.js';
export declare function buildSystemPrompt(config: Config, vaultContext: TermSummary[]): string;
export declare function queryClaudeCLIForUpdate(termName: string, existingContent: string, config: Config, vaultContext: TermSummary[]): Promise<TermData>;
export declare function queryClaudeCLI(term: string, config: Config, vaultContext: TermSummary[]): Promise<TermData>;
