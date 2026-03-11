import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import matter from 'gray-matter';
import { slugify } from '../utils/slugify.js';
export async function ensureVaultDir(vaultPath) {
    const termsDir = path.join(vaultPath, 'terms');
    await fs.mkdir(termsDir, { recursive: true });
}
export async function ensureNotesDir(vaultPath) {
    const notesDir = path.join(vaultPath, 'notes');
    await fs.mkdir(notesDir, { recursive: true });
}
export async function ensureVisualsDir(vaultPath) {
    const visualsDir = path.join(vaultPath, 'visuals');
    await fs.mkdir(visualsDir, { recursive: true });
}
export async function getVaultContext(vaultPath, maxTerms = 50) {
    const terms = await readTermSummaries(vaultPath, maxTerms);
    const notes = await readNoteSummaries(vaultPath, maxTerms);
    const visuals = await readVisualSummaries(vaultPath, maxTerms);
    return { terms, notes, visuals };
}
async function readTermSummaries(vaultPath, maxTerms) {
    const termsDir = path.join(vaultPath, 'terms');
    let files;
    try {
        files = await fs.readdir(termsDir);
    }
    catch {
        return [];
    }
    const mdFiles = files.filter(f => f.endsWith('.md')).slice(0, maxTerms);
    const terms = [];
    for (const file of mdFiles) {
        try {
            const content = await fs.readFile(path.join(termsDir, file), 'utf-8');
            const { data } = matter(content);
            terms.push({
                term: data.term || path.basename(file, '.md'),
                category: data.category || '',
                tags: data.tags || [],
                summary: data.summary || '',
                relatedTerms: data.relatedTerms || [],
            });
        }
        catch {
            // Skip unreadable files
        }
    }
    return terms;
}
async function readNoteSummaries(vaultPath, maxItems) {
    const notesDir = path.join(vaultPath, 'notes');
    let files;
    try {
        files = await fs.readdir(notesDir);
    }
    catch {
        return [];
    }
    const mdFiles = files.filter(f => f.endsWith('.md')).slice(0, maxItems);
    const notes = [];
    for (const file of mdFiles) {
        try {
            const content = await fs.readFile(path.join(notesDir, file), 'utf-8');
            const { data } = matter(content);
            notes.push({
                slug: path.basename(file, '.md'),
                title: data.title || path.basename(file, '.md'),
                summary: data.summary || '',
                tags: data.tags || [],
            });
        }
        catch {
            // Skip unreadable files
        }
    }
    return notes;
}
async function readVisualSummaries(vaultPath, _maxItems) {
    // vault/visuals/ now contains only image assets (no .md files)
    // Return empty array — visuals are companion docs inside terms/ or notes/
    return [];
}
export function buildVaultContextBlock(context) {
    const parts = [];
    if (context.terms.length > 0) {
        const list = context.terms
            .map(t => `- slug: "${slugify(t.term)}", term: "${t.term}", summary: "${t.summary}"`)
            .join('\n');
        parts.push(`=== TERMS ===\n${list}`);
    }
    if (context.notes.length > 0) {
        const list = context.notes
            .map(n => `- slug: "${n.slug}", title: "${n.title}", summary: "${n.summary}"`)
            .join('\n');
        parts.push(`=== NOTES ===\n${list}`);
    }
    if (parts.length === 0)
        return '';
    return `\n\nVault'ta şu anda kayıtlı içerikler:\n${parts.join('\n\n')}\n\nYeni içeriğin relatedTerms alanında SADECE bu listedeki slug veya terim adlarını kullan.`;
}
/**
 * Builds a simple string context block (for use in claude service prompts).
 */
export function buildVaultContextString(context) {
    return buildVaultContextBlock(context);
}
/**
 * Returns all slugs across all content types for relation checks.
 */
export function getAllSlugs(context) {
    const termSlugs = context.terms.map(t => slugify(t.term));
    const noteSlugs = context.notes.map(n => n.slug);
    return [...termSlugs, ...noteSlugs];
}
/**
 * Finds a term's actual filename (without .md) via case-insensitive lookup.
 * Returns null if not found.
 */
export async function findTermFile(vaultPath, searchTerm) {
    const termsDir = path.join(vaultPath, 'terms');
    let files;
    try {
        files = await fs.readdir(termsDir);
    }
    catch {
        return null;
    }
    const searchLower = searchTerm.toLowerCase().trim();
    const searchSlug = slugify(searchTerm);
    for (const file of files) {
        if (!file.endsWith('.md'))
            continue;
        const baseName = path.basename(file, '.md');
        // 1. Exact case-insensitive match  → "Feature Flag" finds "Feature Flag.md"
        // 2. Slug-based match              → "Feature Flag" finds "feature-flag.md" (legacy files)
        if (baseName.toLowerCase() === searchLower || baseName === searchSlug)
            return baseName;
    }
    return null;
}
export async function termExists(vaultPath, searchTerm) {
    return (await findTermFile(vaultPath, searchTerm)) !== null;
}
export async function saveTerm(vaultPath, fileName, content) {
    const filePath = path.join(vaultPath, 'terms', `${fileName}.md`);
    await ensureVaultDir(vaultPath);
    await fs.writeFile(filePath, content, 'utf-8');
    return filePath;
}
export async function readTerm(vaultPath, searchTerm) {
    const fileName = await findTermFile(vaultPath, searchTerm);
    if (!fileName)
        return null;
    return fs.readFile(path.join(vaultPath, 'terms', `${fileName}.md`), 'utf-8');
}
export async function noteExists(vaultPath, slug) {
    const filePath = path.join(vaultPath, 'notes', `${slug}.md`);
    return fsSync.existsSync(filePath);
}
export async function saveNote(vaultPath, slug, content) {
    await ensureNotesDir(vaultPath);
    const filePath = path.join(vaultPath, 'notes', `${slug}.md`);
    await fs.writeFile(filePath, content, 'utf-8');
    return filePath;
}
export async function readNote(vaultPath, slug) {
    const filePath = path.join(vaultPath, 'notes', `${slug}.md`);
    return fs.readFile(filePath, 'utf-8');
}
export async function visualExists(vaultPath, slug) {
    const filePath = path.join(vaultPath, 'visuals', `${slug}.md`);
    return fsSync.existsSync(filePath);
}
export async function saveVisual(vaultPath, slug, content) {
    await ensureVisualsDir(vaultPath);
    const filePath = path.join(vaultPath, 'visuals', `${slug}.md`);
    await fs.writeFile(filePath, content, 'utf-8');
    return filePath;
}
/**
 * Copies a visual file to the visuals directory with conflict handling.
 * Returns the filename used in the destination (may differ if there was a collision).
 */
export async function copyVisualFile(sourcePath, destDir) {
    await fs.mkdir(destDir, { recursive: true });
    const origName = path.basename(sourcePath);
    const ext = path.extname(origName);
    const base = path.basename(origName, ext);
    let destName = origName;
    let destPath = path.join(destDir, destName);
    let counter = 2;
    while (fsSync.existsSync(destPath)) {
        destName = `${base}-${counter}${ext}`;
        destPath = path.join(destDir, destName);
        counter++;
    }
    await fs.copyFile(sourcePath, destPath);
    return destName;
}
/**
 * Adds a [[wiki-link]] entry to a content file (both frontmatter and body section).
 * Searches terms/, notes/, visuals/ in order.
 * Returns true if added, false if already existed or file not found.
 */
export async function addRelation(vaultPath, targetSlugOrName, relatedDisplayName) {
    // Search in terms/ first
    const termFileName = await findTermFile(vaultPath, targetSlugOrName);
    if (termFileName) {
        const filePath = path.join(vaultPath, 'terms', `${termFileName}.md`);
        return addRelationToFile(filePath, relatedDisplayName);
    }
    // Search in notes/
    const noteSlug = slugify(targetSlugOrName);
    const notePath = path.join(vaultPath, 'notes', `${noteSlug}.md`);
    if (fsSync.existsSync(notePath)) {
        return addRelationToFile(notePath, relatedDisplayName);
    }
    // Also try exact match for notes
    const notePathExact = path.join(vaultPath, 'notes', `${targetSlugOrName}.md`);
    if (fsSync.existsSync(notePathExact)) {
        return addRelationToFile(notePathExact, relatedDisplayName);
    }
    // Search in visuals/
    const visualSlug = slugify(targetSlugOrName);
    const visualPath = path.join(vaultPath, 'visuals', `${visualSlug}.md`);
    if (fsSync.existsSync(visualPath)) {
        return addRelationToFile(visualPath, relatedDisplayName);
    }
    // Also try exact match for visuals
    const visualPathExact = path.join(vaultPath, 'visuals', `${targetSlugOrName}.md`);
    if (fsSync.existsSync(visualPathExact)) {
        return addRelationToFile(visualPathExact, relatedDisplayName);
    }
    return false;
}
async function addRelationToFile(filePath, relatedTermName) {
    const rawContent = await fs.readFile(filePath, 'utf-8');
    const parsed = matter(rawContent);
    const relatedTerms = Array.isArray(parsed.data.relatedTerms)
        ? parsed.data.relatedTerms
        : [];
    if (relatedTerms.some(rt => rt.toLowerCase() === relatedTermName.toLowerCase())) {
        return false;
    }
    parsed.data.relatedTerms = [...relatedTerms, relatedTermName];
    parsed.data.updated = new Date().toISOString();
    const lines = parsed.content.split('\n');
    const sectionIdx = lines.findIndex(l => l.trim() === '## İlişkili Terimler');
    if (sectionIdx !== -1) {
        let lastBulletIdx = sectionIdx;
        let i = sectionIdx + 1;
        while (i < lines.length && !lines[i].startsWith('## ')) {
            if (lines[i].startsWith('-'))
                lastBulletIdx = i;
            i++;
        }
        lines.splice(lastBulletIdx + 1, 0, `- [[${relatedTermName}]]`);
    }
    else {
        lines.push('', '## İlişkili Terimler', '', `- [[${relatedTermName}]]`, '');
    }
    const newContent = matter.stringify(lines.join('\n'), parsed.data);
    await fs.writeFile(filePath, newContent, 'utf-8');
    return true;
}
/**
 * Updates specified frontmatter fields without touching the body.
 */
export async function updateTermFrontmatter(vaultPath, searchTerm, updates) {
    const fileName = await findTermFile(vaultPath, searchTerm);
    if (!fileName)
        throw new Error(`"${searchTerm}" vault'ta bulunamadı.`);
    const filePath = path.join(vaultPath, 'terms', `${fileName}.md`);
    const rawContent = await fs.readFile(filePath, 'utf-8');
    const parsed = matter(rawContent);
    Object.assign(parsed.data, updates);
    await fs.writeFile(filePath, matter.stringify(parsed.content, parsed.data), 'utf-8');
}
//# sourceMappingURL=vault.service.js.map