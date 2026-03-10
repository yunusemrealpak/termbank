import { Command } from 'commander';
import chalk from 'chalk';
import fs from 'fs/promises';
import path from 'path';
import matter from 'gray-matter';
import { loadConfig } from '../services/config.service.js';

interface TermRow {
  term: string;
  category: string;
  tags: string;
  confidence: string;
}

export function registerListCommand(program: Command): void {
  program
    .command('list')
    .description('Tüm terimleri listele')
    .option('--tag <tag>', "Tag'a göre filtrele")
    .option('--category <category>', 'Kategoriye göre filtrele')
    .option('--confidence <level>', 'Confidence seviyesine göre filtrele (learning|familiar|mastered)')
    .action(async (options: { tag?: string; category?: string; confidence?: string }) => {
      try {
        const config = await loadConfig();
        if (!config.vault) {
          console.error(chalk.red('Vault path ayarlanmamış.'));
          console.error(chalk.yellow('  termbank config set vault <path>'));
          process.exit(1);
        }

        const termsDir = path.join(config.vault, 'terms');
        let files: string[];
        try {
          files = await fs.readdir(termsDir);
        } catch {
          console.log(chalk.yellow('Vault boş.'));
          return;
        }

        const mdFiles = files.filter(f => f.endsWith('.md'));
        if (mdFiles.length === 0) {
          console.log(chalk.yellow('Vault boş. İlk terimi eklemek için:'));
          console.log(chalk.dim('  termbank add <terim>'));
          return;
        }

        const rows: TermRow[] = [];
        for (const file of mdFiles) {
          const content = await fs.readFile(path.join(termsDir, file), 'utf-8');
          const { data } = matter(content);
          const term = (data.term as string) || path.basename(file, '.md');
          const category = (data.category as string) || '';
          const tags: string[] = Array.isArray(data.tags) ? (data.tags as string[]) : [];
          const confidence = (data.confidence as string) || 'learning';

          if (options.tag && !tags.some(t => t.toLowerCase() === options.tag!.toLowerCase())) {
            continue;
          }
          if (options.category && category.toLowerCase() !== options.category.toLowerCase()) {
            continue;
          }
          if (options.confidence && confidence.toLowerCase() !== options.confidence.toLowerCase()) {
            continue;
          }

          rows.push({ term, category, tags: tags.join(', '), confidence });
        }

        if (rows.length === 0) {
          console.log(chalk.yellow('Filtre koşullarına uyan terim bulunamadı.'));
          return;
        }

        // Column widths
        const w = {
          term: Math.max(5, ...rows.map(r => r.term.length)),
          category: Math.max(8, ...rows.map(r => r.category.length)),
          tags: Math.max(4, Math.min(30, ...rows.map(r => r.tags.length))),
          confidence: 10,
        };

        const pad = (s: string, len: number) => s.slice(0, len).padEnd(len);
        const sep = chalk.dim(
          `${'─'.repeat(w.term)}  ${'─'.repeat(w.category)}  ${'─'.repeat(w.tags)}  ${'─'.repeat(w.confidence)}`,
        );

        console.log();
        console.log(
          `${chalk.bold(pad('Terim', w.term))}  ${chalk.bold(pad('Kategori', w.category))}  ${chalk.bold(pad('Tags', w.tags))}  ${chalk.bold('Confidence')}`,
        );
        console.log(sep);

        for (const row of rows) {
          console.log(
            `${chalk.cyan(pad(row.term, w.term))}  ${chalk.white(pad(row.category, w.category))}  ${chalk.dim(pad(row.tags, w.tags))}  ${colorConfidence(row.confidence)}`,
          );
        }

        console.log(sep);
        console.log(chalk.dim(`\n${rows.length} terim`));
      } catch (err) {
        console.error(chalk.red(`Hata: ${(err as Error).message}`));
        process.exit(1);
      }
    });
}

function colorConfidence(level: string): string {
  switch (level) {
    case 'learning':
      return chalk.yellow(level);
    case 'familiar':
      return chalk.blue(level);
    case 'mastered':
      return chalk.green(level);
    default:
      return chalk.white(level);
  }
}
