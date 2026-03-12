#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import matter from 'gray-matter';
import { loadConfig } from '../services/config.service.js';
import {
  termExists,
  noteExists,
  saveTerm,
  saveNote,
  ensureVaultDir,
  ensureNotesDir,
  getVaultContext,
  findSimilarTerms,
  findTermFile,
  readTerm,
  readNote,
  addRelation,
  getAllSlugs,
} from '../services/vault.service.js';
import { renderTermMarkdown } from '../templates/term.template.js';
import { renderNote } from '../templates/note.template.js';
import { safeFilename, slugify } from '../utils/slugify.js';
import type { TermData } from '../utils/types.js';
import type { NoteResponse } from '../templates/note.template.js';

const server = new McpServer({
  name: 'termbank',
  version: '0.1.3',
});

// ── add_term ──────────────────────────────────────────────────────────────────

server.tool(
  'termbank_add_term',
  'Add a term to the termbank vault. Provide as much structured data as possible so the saved entry is useful.',
  {
    term: z.string().describe('Term name (display name, e.g. "Feature Flag")'),
    summary: z.string().optional().describe('One-sentence summary'),
    category: z.string().optional().describe('Category, e.g. "Software Engineering"'),
    tags: z.array(z.string()).optional().describe('Tags list'),
    explanation: z.string().optional().describe('Detailed explanation (markdown supported)'),
    turkish_equivalent: z.string().optional().describe('Turkish equivalent of the term'),
    examples: z
      .array(
        z.object({
          title: z.string(),
          description: z.string(),
          code: z.string().optional(),
        }),
      )
      .optional()
      .describe('Usage examples'),
    related_terms: z.array(z.string()).optional().describe('Related term names'),
    common_mistakes: z.array(z.string()).optional().describe('Common mistakes or misconceptions'),
    sources: z.array(z.string()).optional().describe('Source references'),
    force: z.boolean().optional().describe('Overwrite if term already exists (default: false)'),
  },
  async (args) => {
    const config = await loadConfig();

    if (!config.vault) {
      return {
        content: [
          {
            type: 'text',
            text: 'Vault path is not configured. Run: termbank config set vault <path>',
          },
        ],
        isError: true,
      };
    }

    if (!args.force && (await termExists(config.vault, args.term))) {
      return {
        content: [
          {
            type: 'text',
            text: `"${args.term}" already exists in vault. Use force: true to overwrite.`,
          },
        ],
        isError: true,
      };
    }

    await ensureVaultDir(config.vault);

    const vaultCtx = config.vaultContext.enabled
      ? await getVaultContext(config.vault, config.vaultContext.maxTerms)
      : { terms: [], notes: [], visuals: [] };

    const termData: TermData = {
      term: args.term,
      summary: args.summary ?? '',
      category: args.category ?? 'General',
      tags: args.tags ?? [],
      explanation: args.explanation ?? '',
      turkishEquivalent: args.turkish_equivalent ?? '',
      examples: args.examples ?? [],
      relatedTerms: args.related_terms ?? [],
      commonMistakes: args.common_mistakes ?? [],
      sources: args.sources ?? [],
    };

    const fileName = safeFilename(termData.term);
    const markdown = renderTermMarkdown(termData, vaultCtx.terms);
    const filePath = await saveTerm(config.vault, fileName, markdown);

    // Auto-relate: add back-links to existing vault terms
    if (config.autoRelate && termData.relatedTerms.length > 0) {
      const vaultTermNames = new Set(vaultCtx.terms.map(t => t.term.toLowerCase()));
      const linked = termData.relatedTerms.filter(rt => vaultTermNames.has(rt.toLowerCase()));
      for (const relatedName of linked) {
        await addRelation(config.vault, relatedName, termData.term);
      }
    }

    return {
      content: [
        {
          type: 'text',
          text: `✓ Saved: terms/${fileName}.md\nCategory: ${termData.category}\nTags: ${termData.tags.join(', ') || '(none)'}\nSummary: ${termData.summary || '(none)'}`,
        },
      ],
    };
  },
);

// ── add_note ──────────────────────────────────────────────────────────────────

server.tool(
  'termbank_add_note',
  'Add a note to the termbank vault. Notes are longer-form content about topics, integrations, or decisions.',
  {
    title: z.string().describe('Note title'),
    content: z.string().describe('Main note content (markdown)'),
    summary: z.string().optional().describe('One-sentence summary'),
    tags: z.array(z.string()).optional().describe('Tags list'),
    key_points: z.array(z.string()).optional().describe('Key takeaways'),
    related_terms: z.array(z.string()).optional().describe('Related term/note names'),
    force: z.boolean().optional().describe('Overwrite if note already exists (default: false)'),
  },
  async (args) => {
    const config = await loadConfig();

    if (!config.vault) {
      return {
        content: [
          {
            type: 'text',
            text: 'Vault path is not configured. Run: termbank config set vault <path>',
          },
        ],
        isError: true,
      };
    }

    const slug = safeFilename(args.title);

    if (!args.force && (await noteExists(config.vault, slug))) {
      return {
        content: [
          {
            type: 'text',
            text: `"${args.title}" (${slug}) already exists. Use force: true to overwrite.`,
          },
        ],
        isError: true,
      };
    }

    await ensureNotesDir(config.vault);

    const vaultCtx = await getVaultContext(config.vault, config.vaultContext.maxTerms);
    const allSlugs = getAllSlugs(vaultCtx);

    const noteData: NoteResponse = {
      title: args.title,
      summary: args.summary ?? '',
      tags: args.tags ?? [],
      content: args.content,
      keyPoints: args.key_points ?? [],
      relatedTerms: args.related_terms ?? [],
    };

    const markdown = renderNote(noteData, allSlugs, [], slug);
    const filePath = await saveNote(config.vault, slug, markdown);

    // Auto-relate
    if (config.autoRelate && noteData.relatedTerms.length > 0) {
      const slugSet = new Set(allSlugs.map(s => s.toLowerCase()));
      const linked = noteData.relatedTerms.filter(rt => slugSet.has(rt.toLowerCase()));
      for (const relatedSlug of linked) {
        await addRelation(config.vault, relatedSlug, noteData.title);
      }
    }

    return {
      content: [
        {
          type: 'text',
          text: `✓ Saved: notes/${slug}.md\nTags: ${noteData.tags.join(', ') || '(none)'}\nSummary: ${noteData.summary || '(none)'}`,
        },
      ],
    };
  },
);

// ── search ────────────────────────────────────────────────────────────────────

server.tool(
  'termbank_search',
  'Search for terms and notes in the termbank vault.',
  {
    query: z.string().describe('Search query'),
  },
  async (args) => {
    const config = await loadConfig();

    if (!config.vault) {
      return {
        content: [{ type: 'text', text: 'Vault path is not configured.' }],
        isError: true,
      };
    }

    const words = args.query.toLowerCase().split(/\s+/).filter(w => w.length > 2);

    // Search terms
    const similarTerms = await findSimilarTerms(config.vault, args.query);
    const termLines = similarTerms.map(
      s => `[term] ${s.name} [${s.category}]${s.summary ? ` — ${s.summary}` : ''}`,
    );

    // Search notes via vault context
    const ctx = await getVaultContext(config.vault, 500);
    const matchingNotes = ctx.notes.filter(n => {
      const text = `${n.title} ${n.summary} ${n.tags.join(' ')}`.toLowerCase();
      return words.some(w => text.includes(w));
    });
    const noteLines = matchingNotes.map(
      n => `[note] ${n.title} (id: "${n.slug}")${n.summary ? ` — ${n.summary}` : ''}`,
    );

    const allLines = [...termLines, ...noteLines];

    if (allLines.length === 0) {
      return {
        content: [{ type: 'text', text: `No results found for "${args.query}"` }],
      };
    }

    return {
      content: [
        {
          type: 'text',
          text: `Found ${allLines.length} result(s) for "${args.query}":\n\n${allLines.join('\n')}`,
        },
      ],
    };
  },
);

// ── list ──────────────────────────────────────────────────────────────────────

server.tool(
  'termbank_list',
  'List all terms and notes in the termbank vault.',
  {},
  async () => {
    const config = await loadConfig();

    if (!config.vault) {
      return {
        content: [{ type: 'text', text: 'Vault path is not configured.' }],
        isError: true,
      };
    }

    const ctx = await getVaultContext(config.vault, 500);

    const parts: string[] = [];

    if (ctx.terms.length > 0) {
      const termLines = ctx.terms.map(
        t => `  • ${t.term} [${t.category}]${t.summary ? ` — ${t.summary}` : ''}`,
      );
      parts.push(`Terms (${ctx.terms.length}):\n${termLines.join('\n')}`);
    }

    if (ctx.notes.length > 0) {
      const noteLines = ctx.notes.map(
        n => `  • ${n.title} (id: "${n.slug}")${n.summary ? ` — ${n.summary}` : ''}`,
      );
      parts.push(`Notes (${ctx.notes.length}):\n${noteLines.join('\n')}`);
    }

    if (parts.length === 0) {
      return { content: [{ type: 'text', text: 'Vault is empty.' }] };
    }

    return { content: [{ type: 'text', text: parts.join('\n\n') }] };
  },
);

// ── get_note ──────────────────────────────────────────────────────────────────

server.tool(
  'termbank_get_note',
  'Get the full content of a specific note from the vault. Pass the id value shown in termbank_search or termbank_list results (filename without .md extension).',
  {
    slug: z.string().describe('Note id/filename without .md (e.g. "iOS Legacy Storage UserDefaults ve Keychain Geçiş Stratejileri"). Also accepts the full title.'),
  },
  async (args) => {
    const config = await loadConfig();

    if (!config.vault) {
      return {
        content: [{ type: 'text', text: 'Vault path is not configured.' }],
        isError: true,
      };
    }

    let content: string;
    try {
      content = await readNote(config.vault, args.slug);
    } catch {
      // Try to find slug by matching title from vault context
      const ctx = await getVaultContext(config.vault, 500);
      const match = ctx.notes.find(
        n =>
          n.slug.toLowerCase() === args.slug.toLowerCase() ||
          n.title.toLowerCase() === args.slug.toLowerCase(),
      );
      if (!match) {
        return {
          content: [{ type: 'text', text: `Note "${args.slug}" not found. Use termbank_search or termbank_list to find the correct id.` }],
          isError: true,
        };
      }
      try {
        content = await readNote(config.vault, match.slug);
      } catch {
        return {
          content: [{ type: 'text', text: `Note "${args.slug}" not found.` }],
          isError: true,
        };
      }
    }

    return { content: [{ type: 'text', text: content }] };
  },
);

// ── get_term ──────────────────────────────────────────────────────────────────

server.tool(
  'termbank_get_term',
  'Get the full content of a specific term from the vault.',
  {
    term: z.string().describe('Term name to retrieve'),
  },
  async (args) => {
    const config = await loadConfig();

    if (!config.vault) {
      return {
        content: [{ type: 'text', text: 'Vault path is not configured.' }],
        isError: true,
      };
    }

    const content = await readTerm(config.vault, args.term);

    if (!content) {
      return {
        content: [{ type: 'text', text: `"${args.term}" not found in vault.` }],
        isError: true,
      };
    }

    return { content: [{ type: 'text', text: content }] };
  },
);

// ── update_term ───────────────────────────────────────────────────────────────

/**
 * Replaces the content of a named "## Heading" section in a markdown body.
 * If the section doesn't exist it is appended.
 */
function replaceSection(body: string, heading: string, newContent: string): string {
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`(## ${escaped}\\n)([\\s\\S]*?)(?=\\n## |$)`);
  if (pattern.test(body)) {
    return body.replace(pattern, `$1\n${newContent}\n`);
  }
  return `${body}\n## ${heading}\n\n${newContent}\n`;
}

server.tool(
  'termbank_update_term',
  'Update an existing term in the vault. Only the fields you provide will be changed; everything else is preserved. To replace full content (explanation, examples) use termbank_add_term with force: true instead.',
  {
    term: z.string().describe('Term name to update (must already exist)'),
    summary: z.string().optional().describe('New one-sentence summary'),
    category: z.string().optional().describe('New category'),
    tags: z.array(z.string()).optional().describe('New tags (replaces existing)'),
    explanation: z.string().optional().describe('New explanation text for the Açıklama section'),
    turkish_equivalent: z.string().optional().describe('New Turkish equivalent'),
    related_terms: z.array(z.string()).optional().describe('New related terms (replaces existing)'),
    confidence: z
      .enum(['learning', 'familiar', 'mastered'])
      .optional()
      .describe('Update mastery level'),
  },
  async (args) => {
    const config = await loadConfig();

    if (!config.vault) {
      return {
        content: [{ type: 'text', text: 'Vault path is not configured.' }],
        isError: true,
      };
    }

    const existing = await readTerm(config.vault, args.term);
    if (!existing) {
      return {
        content: [{ type: 'text', text: `"${args.term}" not found in vault.` }],
        isError: true,
      };
    }

    const parsed = matter(existing);

    // Patch frontmatter — only provided fields
    if (args.summary !== undefined) parsed.data.summary = args.summary;
    if (args.category !== undefined) parsed.data.category = args.category;
    if (args.tags !== undefined) parsed.data.tags = args.tags;
    if (args.related_terms !== undefined) parsed.data.relatedTerms = args.related_terms;
    if (args.confidence !== undefined) parsed.data.confidence = args.confidence;
    parsed.data.updated = new Date().toISOString();

    // Patch body sections — only provided fields
    let body = parsed.content;
    if (args.explanation !== undefined) body = replaceSection(body, 'Açıklama', args.explanation);
    if (args.turkish_equivalent !== undefined)
      body = replaceSection(body, 'Türkçe Karşılık', args.turkish_equivalent);
    if (args.related_terms !== undefined) {
      const vaultCtx = await getVaultContext(config.vault, config.vaultContext.maxTerms);
      const vaultTermNames = new Set(vaultCtx.terms.map(t => t.term.toLowerCase()));
      const bullets = args.related_terms
        .map(rt => `- ${vaultTermNames.has(rt.toLowerCase()) ? `[[${rt}]]` : rt}`)
        .join('\n');
      body = replaceSection(body, 'İlişkili Terimler', bullets);
    }

    const finalContent = matter.stringify(body, parsed.data);
    const fileName = (await findTermFile(config.vault, args.term)) ?? safeFilename(args.term);
    await saveTerm(config.vault, fileName, finalContent);

    const updated = Object.keys(args)
      .filter(k => k !== 'term' && args[k as keyof typeof args] !== undefined)
      .join(', ');

    return {
      content: [{ type: 'text', text: `✓ Updated terms/${fileName}.md\nChanged fields: ${updated}` }],
    };
  },
);

// ── update_note ───────────────────────────────────────────────────────────────

server.tool(
  'termbank_update_note',
  'Update an existing note in the vault. Only the fields you provide will be changed; everything else is preserved.',
  {
    slug: z.string().describe('Note id/filename without .md (as shown in termbank_list or termbank_search)'),
    title: z.string().optional().describe('New title'),
    summary: z.string().optional().describe('New one-sentence summary'),
    tags: z.array(z.string()).optional().describe('New tags (replaces existing)'),
    content: z.string().optional().describe('New content for the İçerik section'),
    key_points: z.array(z.string()).optional().describe('New key points (replaces existing)'),
    related_terms: z.array(z.string()).optional().describe('New related terms (replaces existing)'),
  },
  async (args) => {
    const config = await loadConfig();

    if (!config.vault) {
      return {
        content: [{ type: 'text', text: 'Vault path is not configured.' }],
        isError: true,
      };
    }

    // Resolve slug → actual filename via context if needed
    let resolvedSlug = args.slug;
    let existing: string;
    try {
      existing = await readNote(config.vault, resolvedSlug);
    } catch {
      const ctx = await getVaultContext(config.vault, 500);
      const match = ctx.notes.find(
        n =>
          n.slug.toLowerCase() === args.slug.toLowerCase() ||
          n.title.toLowerCase() === args.slug.toLowerCase(),
      );
      if (!match) {
        return {
          content: [
            {
              type: 'text',
              text: `Note "${args.slug}" not found. Use termbank_list to find the correct id.`,
            },
          ],
          isError: true,
        };
      }
      resolvedSlug = match.slug;
      existing = await readNote(config.vault, resolvedSlug);
    }

    const parsed = matter(existing);

    // Patch frontmatter
    if (args.title !== undefined) parsed.data.title = args.title;
    if (args.summary !== undefined) parsed.data.summary = args.summary;
    if (args.tags !== undefined) parsed.data.tags = args.tags;
    if (args.related_terms !== undefined) parsed.data.relatedTerms = args.related_terms;
    parsed.data.updated = new Date().toISOString();

    // Patch body sections
    let body = parsed.content;
    if (args.content !== undefined) body = replaceSection(body, 'İçerik', args.content);
    if (args.key_points !== undefined) {
      const bullets = args.key_points.map(kp => `- ${kp}`).join('\n');
      body = replaceSection(body, 'Önemli Noktalar', bullets);
    }
    if (args.related_terms !== undefined) {
      const allSlugs = getAllSlugs(await getVaultContext(config.vault, 500));
      const slugSet = new Set(allSlugs.map(s => s.toLowerCase()));
      const bullets = args.related_terms
        .map(rt => `- ${slugSet.has(rt.toLowerCase()) ? `[[${rt}|${rt}]]` : rt}`)
        .join('\n');
      body = replaceSection(body, 'İlişkili Terimler', bullets);
    }

    const finalContent = matter.stringify(body, parsed.data);
    await saveNote(config.vault, resolvedSlug, finalContent);

    const updated = Object.keys(args)
      .filter(k => k !== 'slug' && args[k as keyof typeof args] !== undefined)
      .join(', ');

    return {
      content: [{ type: 'text', text: `✓ Updated notes/${resolvedSlug}.md\nChanged fields: ${updated}` }],
    };
  },
);

// ── start ─────────────────────────────────────────────────────────────────────

const transport = new StdioServerTransport();
await server.connect(transport);
