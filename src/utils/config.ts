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

export const DEFAULT_CONFIG: Config = {
  vault: '',
  language: 'tr',
  claudePath: 'claude',
  maxTurns: 3,
  timeout: 60000,
  template: 'default',
  autoRelate: true,
  vaultContext: {
    enabled: true,
    maxTerms: 50,
    fields: ['term', 'category', 'tags', 'summary'],
  },
  confidenceLevels: ['learning', 'familiar', 'mastered'],
  git: {
    enabled: false,
    autoSync: false,
    branch: 'main',
  },
};
