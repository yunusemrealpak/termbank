export const DEFAULT_CONFIG = {
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
//# sourceMappingURL=config.js.map