import matter from 'gray-matter';
export function renderVisual(response, existingVaultSlugs, imageFileNames, slug) {
    const now = new Date().toISOString();
    const slugSet = new Set(existingVaultSlugs.map(s => s.toLowerCase()));
    // Filter relatedTerms to only those that exist in vault
    const existingRelated = response.relatedTerms.filter(rt => slugSet.has(rt.toLowerCase()));
    const frontmatter = {
        title: response.title,
        type: 'visual',
        tags: response.tags,
        summary: response.summary,
        relatedTerms: existingRelated,
        imageFiles: imageFileNames,
        created: now,
        updated: now,
    };
    const sections = [];
    // Title
    sections.push(`# ${response.title}\n`);
    // Image embeds
    for (const imgFile of imageFileNames) {
        sections.push(`![[${imgFile}]]`);
    }
    sections.push('');
    // Summary blockquote
    sections.push(`> ${response.summary}\n`);
    // Analysis
    sections.push(`## Analiz\n\n${response.analysis}\n`);
    // Detected concepts
    if (response.detectedConcepts.length > 0) {
        sections.push('## Tespit Edilen Kavramlar\n');
        response.detectedConcepts.forEach(c => sections.push(`- ${c}`));
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
    const body = sections.join('\n');
    return matter.stringify(body, frontmatter);
}
//# sourceMappingURL=visual.template.js.map