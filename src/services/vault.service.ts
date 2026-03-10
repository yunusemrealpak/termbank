import fs from 'fs/promises';
import path from 'path';
import matter from 'gray-matter';
import { TermSummary } from '../utils/types.js';
import { slugify } from '../utils/slugify.js';

export async function ensureVaultDir(vaultPath: string): Promise<void> {
  const termsDir = path.join(vaultPath, 'terms');
  await fs.mkdir(termsDir, { recursive: true });
}

export async function getVaultContext(
  vaultPath: string,
  maxTerms: number = 50,
): Promise<TermSummary[]> {
  const termsDir = path.join(vaultPath, 'terms');

  let files: string[];
  try {
    files = await fs.readdir(termsDir);
  } catch {
    return [];
  }

  const mdFiles = files.filter(f => f.endsWith('.md')).slice(0, maxTerms);
  const terms: TermSummary[] = [];

  for (const file of mdFiles) {
    try {
      const content = await fs.readFile(path.join(termsDir, file), 'utf-8');
      const { data } = matter(content);

      terms.push({
        term: (data.term as string) || path.basename(file, '.md'),
        category: (data.category as string) || '',
        tags: (data.tags as string[]) || [],
        summary: (data.summary as string) || '',
        relatedTerms: (data.relatedTerms as string[]) || [],
      });
    } catch {
      // Skip unreadable files
    }
  }

  return terms;
}

export function buildVaultContextBlock(terms: TermSummary[]): string {
  if (terms.length === 0) return '';

  const list = terms
    .map(t => `- ${t.term} [${t.category}] (tags: ${t.tags.join(', ')}) → ${t.summary}`)
    .join('\n');

  return `\n\nVault'ta şu anda kayıtlı terimler:\n${list}\n\nYeni terimin relatedTerms alanında SADECE bu listedeki terimleri kullan. Listede olmayan terim önerme.`;
}

/**
 * Finds a term's actual filename (without .md) via case-insensitive lookup.
 * Returns null if not found.
 */
export async function findTermFile(vaultPath: string, searchTerm: string): Promise<string | null> {
  const termsDir = path.join(vaultPath, 'terms');
  let files: string[];
  try {
    files = await fs.readdir(termsDir);
  } catch {
    return null;
  }

  const searchLower = searchTerm.toLowerCase().trim();
  const searchSlug = slugify(searchTerm);

  for (const file of files) {
    if (!file.endsWith('.md')) continue;
    const baseName = path.basename(file, '.md');
    // 1. Exact case-insensitive match  → "Feature Flag" finds "Feature Flag.md"
    // 2. Slug-based match              → "Feature Flag" finds "feature-flag.md" (legacy files)
    if (baseName.toLowerCase() === searchLower || baseName === searchSlug) return baseName;
  }
  return null;
}

export async function termExists(vaultPath: string, searchTerm: string): Promise<boolean> {
  return (await findTermFile(vaultPath, searchTerm)) !== null;
}

export async function saveTerm(
  vaultPath: string,
  fileName: string,
  content: string,
): Promise<string> {
  const filePath = path.join(vaultPath, 'terms', `${fileName}.md`);
  await ensureVaultDir(vaultPath);
  await fs.writeFile(filePath, content, 'utf-8');
  return filePath;
}

export async function readTerm(vaultPath: string, searchTerm: string): Promise<string | null> {
  const fileName = await findTermFile(vaultPath, searchTerm);
  if (!fileName) return null;
  return fs.readFile(path.join(vaultPath, 'terms', `${fileName}.md`), 'utf-8');
}

/**
 * Adds a [[wiki-link]] entry to a term file (both frontmatter and body section).
 * Returns true if added, false if already existed or file not found.
 */
export async function addRelation(
  vaultPath: string,
  termSearchName: string,
  relatedTermName: string,
): Promise<boolean> {
  const fileName = await findTermFile(vaultPath, termSearchName);
  if (!fileName) return false;

  const filePath = path.join(vaultPath, 'terms', `${fileName}.md`);
  const rawContent = await fs.readFile(filePath, 'utf-8');
  const parsed = matter(rawContent);
  const relatedTerms: string[] = Array.isArray(parsed.data.relatedTerms)
    ? (parsed.data.relatedTerms as string[])
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
      if (lines[i].startsWith('-')) lastBulletIdx = i;
      i++;
    }
    lines.splice(lastBulletIdx + 1, 0, `- [[${relatedTermName}]]`);
  } else {
    lines.push('', '## İlişkili Terimler', '', `- [[${relatedTermName}]]`, '');
  }

  const newContent = matter.stringify(lines.join('\n'), parsed.data);
  await fs.writeFile(filePath, newContent, 'utf-8');
  return true;
}

/**
 * Updates specified frontmatter fields without touching the body.
 */
export async function updateTermFrontmatter(
  vaultPath: string,
  searchTerm: string,
  updates: Record<string, unknown>,
): Promise<void> {
  const fileName = await findTermFile(vaultPath, searchTerm);
  if (!fileName) throw new Error(`"${searchTerm}" vault'ta bulunamadı.`);

  const filePath = path.join(vaultPath, 'terms', `${fileName}.md`);
  const rawContent = await fs.readFile(filePath, 'utf-8');
  const parsed = matter(rawContent);
  Object.assign(parsed.data, updates);
  await fs.writeFile(filePath, matter.stringify(parsed.content, parsed.data), 'utf-8');
}
