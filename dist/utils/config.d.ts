export interface VaultContextConfig {
    enabled: boolean;
    maxTerms: number;
    fields: string[];
}
export interface GitConfig {
    enabled: boolean;
    autoSync: boolean;
    branch: string;
}
export interface Config {
    vault: string;
    language: string;
    claudePath: string;
    maxTurns: number;
    timeout: number;
    template: string;
    autoRelate: boolean;
    vaultContext: VaultContextConfig;
    confidenceLevels: string[];
    git: GitConfig;
}
export declare const DEFAULT_CONFIG: Config;
