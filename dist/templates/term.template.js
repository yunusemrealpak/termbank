import matter from 'gray-matter';
export function renderTermMarkdown(termData, vaultTerms, attachmentSources, imageFiles) {
    const now = new Date().toISOString();
    const vaultTermNames = new Set(vaultTerms.map(t => t.term.toLowerCase()));
    const frontmatter = {
        term: termData.term,
        category: termData.category,
        tags: termData.tags,
        summary: termData.summary,
        relatedTerms: termData.relatedTerms,
        created: now,
        updated: now,
        confidence: 'learning',
        source: 'claude-cli',
    };
    if (imageFiles && imageFiles.length > 0) {
        frontmatter.imageFiles = imageFiles;
    }
    if (attachmentSources && attachmentSources.length > 0) {
        frontmatter.sources = attachmentSources;
    }
    const sections = [];
    // Title
    sections.push(`# ${termData.term}\n`);
    // Image embeds (right after title, before summary)
    if (imageFiles && imageFiles.length > 0) {
        imageFiles.forEach(f => sections.push(`![[${f}]]`));
        sections.push('');
    }
    // Summary blockquote
    sections.push(`> ${termData.summary}\n`);
    // Turkish equivalent
    if (termData.turkishEquivalent) {
        sections.push(`## Türkçe Karşılık\n\n${termData.turkishEquivalent}\n`);
    }
    // Explanation
    sections.push(`## Açıklama\n\n${termData.explanation}\n`);
    // Examples
    if (termData.examples.length > 0) {
        sections.push('## Örnekler\n');
        termData.examples.forEach((ex, i) => {
            sections.push(`### Örnek ${i + 1}: ${ex.title}\n`);
            sections.push(`${ex.description}\n`);
            if (ex.code) {
                sections.push(`\`\`\`\n${ex.code}\n\`\`\`\n`);
            }
        });
    }
    // Common mistakes
    if (termData.commonMistakes.length > 0) {
        sections.push('## Sık Yapılan Hatalar\n');
        termData.commonMistakes.forEach(m => sections.push(`- ${m}`));
        sections.push('');
    }
    // Related terms with [[wiki-links]]
    if (termData.relatedTerms.length > 0) {
        sections.push('## İlişkili Terimler\n');
        termData.relatedTerms.forEach(rt => {
            const isInVault = vaultTermNames.has(rt.toLowerCase());
            sections.push(`- ${isInVault ? `[[${rt}]]` : rt}`);
        });
        sections.push('');
    }
    // Sources (Claude-suggested + attachment files)
    const allSources = [
        ...termData.sources,
        ...(attachmentSources || []),
    ];
    if (allSources.length > 0) {
        sections.push('## Kaynaklar\n');
        allSources.forEach(s => sections.push(`- ${s}`));
        sections.push('');
    }
    const body = sections.join('\n');
    return matter.stringify(body, frontmatter);
}
//# sourceMappingURL=term.template.js.map