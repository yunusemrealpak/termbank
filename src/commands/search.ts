import { Command } from 'commander';
import chalk from 'chalk';
import fs from 'fs/promises';
import path from 'path';
import matter from 'gray-matter';
import { loadConfig } from '../services/config.service.js';

type ContentType = 'term' | 'note' | 'visual';

interface SearchResult {
  name: string;
  contentType: ContentType;
  category: string;
  snippet: string;
  matchedField: string;
}

export function registerSearchCommand(program: Command): void {
  program
    .command('search <keyword>')
    .description("Vault'da tüm içerikleri ara (terms, notes, visuals)")
    .option('--type <type>', 'İçerik türüne göre filtrele (term|note|visual)')
    .action(async (keyword: string, options: { type?: string }) => {
      try {
        const config = await loadConfig();
        if (!config.vault) {
          console.error(chalk.red('Vault path ayarlanmamış.'));
          console.error(chalk.yellow('  termbank config set vault <path>'));
          process.exit(1);
        }

        const typeFilter = options.type as ContentType | undefined;
        if (typeFilter && !['term', 'note', 'visual'].includes(typeFilter)) {
          console.error(chalk.red(`Geçersiz tür: "${typeFilter}". Geçerli değerler: term, note, visual`));
          process.exit(1);
        }

        const regex = new RegExp(escapeRegex(keyword), 'gi');
        const results: SearchResult[] = [];

        // Search terms
        if (!typeFilter || typeFilter === 'term') {
          const termResults = await searchInDir(
            path.join(config.vault, 'terms'),
            'term',
            regex,
            keyword,
          );
          results.push(...termResults);
        }

        // Search notes
        if (!typeFilter || typeFilter === 'note') {
          const noteResults = await searchInDir(
            path.join(config.vault, 'notes'),
            'note',
            regex,
            keyword,
          );
          results.push(...noteResults);
        }

        // Search visuals
        if (!typeFilter || typeFilter === 'visual') {
          const visualResults = await searchInDir(
            path.join(config.vault, 'visuals'),
            'visual',
            regex,
            keyword,
          );
          results.push(...visualResults);
        }

        if (results.length === 0) {
          console.log(chalk.yellow(`"${keyword}" için sonuç bulunamadı.`));
          return;
        }

        console.log(chalk.bold(`\n${results.length} sonuç:\n`));
        for (const r of results) {
          const typeLabel = chalk.dim(`[${r.contentType}]`);
          const categoryLabel = r.category ? chalk.dim(`[${r.category}]`) : '';
          console.log(
            `${chalk.cyan(r.name)}  ${typeLabel}  ${categoryLabel}  ${chalk.dim(`(${r.matchedField})`)}`,
          );
          if (r.snippet) {
            console.log(`  ${chalk.white(r.snippet)}`);
          }
          console.log();
        }
      } catch (err) {
        console.error(chalk.red(`Hata: ${(err as Error).message}`));
        process.exit(1);
      }
    });
}

async function searchInDir(
  dir: string,
  contentType: ContentType,
  regex: RegExp,
  keyword: string,
): Promise<SearchResult[]> {
  let files: string[];
  try {
    files = await fs.readdir(dir);
  } catch {
    return [];
  }

  const mdFiles = files.filter(f => f.endsWith('.md'));
  const results: SearchResult[] = [];

  for (const file of mdFiles) {
    const content = await fs.readFile(path.join(dir, file), 'utf-8');
    const { data, content: body } = matter(content);

    // Determine display name based on content type
    let displayName: string;
    if (contentType === 'term') {
      displayName = (data.term as string) || path.basename(file, '.md');
    } else {
      displayName = (data.title as string) || path.basename(file, '.md');
    }

    const category = (data.category as string) || '';

    // Check frontmatter fields first
    const frontmatterText = [
      displayName,
      category,
      Array.isArray(data.tags) ? (data.tags as string[]).join(' ') : '',
      (data.summary as string) || '',
    ].join(' ');

    // Reset regex lastIndex before each use
    regex.lastIndex = 0;
    if (regex.test(frontmatterText)) {
      results.push({
        name: displayName,
        contentType,
        category,
        snippet: (data.summary as string) || '',
        matchedField: getMatchedFrontmatterField(keyword, data, contentType),
      });
      continue;
    }

    // Check body content line by line
    const lines = body.split('\n');
    for (const line of lines) {
      regex.lastIndex = 0;
      if (regex.test(line)) {
        results.push({
          name: displayName,
          contentType,
          category,
          snippet: line.trim().slice(0, 100),
          matchedField: 'içerik',
        });
        break;
      }
    }
  }

  return results;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function getMatchedFrontmatterField(
  keyword: string,
  data: Record<string, unknown>,
  contentType: ContentType,
): string {
  const re = new RegExp(escapeRegex(keyword), 'i');
  const nameField = contentType === 'term' ? 'term' : 'title';
  if (re.test((data[nameField] as string) || '')) return contentType === 'term' ? 'terim' : 'başlık';
  if (re.test((data.summary as string) || '')) return 'özet';
  if (re.test((data.category as string) || '')) return 'kategori';
  if (Array.isArray(data.tags) && (data.tags as string[]).some(t => re.test(t))) return 'tags';
  return 'frontmatter';
}
