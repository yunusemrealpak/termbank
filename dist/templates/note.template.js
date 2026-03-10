import matter from 'gray-matter';
export function renderNote(response, existingVaultSlugs, sources, slug) {
    const now = new Date().toISOString();
    const slugSet = new Set(existingVaultSlugs.map(s => s.toLowerCase()));
    // Filter relatedTerms to only those that exist in vault
    const existingRelated = response.relatedTerms.filter(rt => slugSet.has(rt.toLowerCase()));
    const frontmatter = {
        title: response.title,
        type: 'note',
        tags: response.tags,
        summary: response.summary,
        relatedTerms: existingRelated,
        created: now,
        updated: now,
    };
    if (sources.length > 0) {
        frontmatter.sources = sources;
    }
    const sections = [];
    // Title
    sections.push(`# ${response.title}\n`);
    // Summary blockquote
    sections.push(`> ${response.summary}\n`);
    // Content
    sections.push(`## İçerik\n\n${response.content}\n`);
    // Key points
    if (response.keyPoints.length > 0) {
        sections.push('## Önemli Noktalar\n');
        response.keyPoints.forEach(kp => sections.push(`- ${kp}`));
        sections.push('');
    }
    // Related terms with [[wiki-links]]
    if (existingRelated.length > 0) {
        sections.push('## İlişkili Terimler\n');
        existingRelated.forEach(rt => {
            sections.push(`- [[${rt}|${rt}]]`);
        });
        sections.push('');
    }
    // Sources
    if (sources.length > 0) {
        sections.push('## Kaynaklar\n');
        sources.forEach(s => sections.push(`- ${s}`));
        sections.push('');
    }
    const body = sections.join('\n');
    return matter.stringify(body, frontmatter);
}
//# sourceMappingURL=note.template.js.map