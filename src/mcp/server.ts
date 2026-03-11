#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
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

// ── start ─────────────────────────────────────────────────────────────────────

const transport = new StdioServerTransport();
await server.connect(transport);
