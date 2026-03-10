export interface SyncResult {
    committed: boolean;
    pulled: boolean;
    pushed: boolean;
    commitMessage?: string;
    newTerms?: string[];
    error?: string;
}
export declare function isGitRepo(dir: string): Promise<boolean>;
export declare function getCurrentBranch(dir: string): Promise<string>;
export declare function syncVault(vaultPath: string, branch: string, options?: {
    pullOnly?: boolean;
    commitMessage?: string;
}): Promise<SyncResult>;
