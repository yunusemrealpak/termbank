import { Command } from 'commander';
import chalk from 'chalk';
import { loadConfig } from '../services/config.service.js';
import {
  getVaultContext,
  noteExists,
  saveNote,
  ensureNotesDir,
  addRelation,
  buildVaultContextBlock,
  getAllSlugs,
} from '../services/vault.service.js';
import { queryClaudeCLIForNote } from '../services/claude.service.js';
import { renderNote } from '../templates/note.template.js';
import { safeFilename } from '../utils/slugify.js';
import { Spinner } from '../utils/spinner.js';
import { parseFileArgs } from '../utils/file-args.js';

export function registerNoteCommand(program: Command): void {
  program
    .command('note')
    .argument('[args...]', 'Not başlığı ve/veya @dosya referansları')
    .description('Yeni not oluştur. Örn: termbank note "başlık" @file.md')
    .option('-f, --force', 'Mevcut notun üzerine yaz')
    .action(async (args: string[], options: { force?: boolean }) => {
      try {
        const config = await loadConfig();

        if (!config.vault) {
          console.error(chalk.red('Vault path ayarlanmamış. Önce ayarlayın:'));
          console.error(chalk.yellow('  termbank config set vault <path>'));
          process.exit(1);
        }

        // Parse args
        let parsed: { title?: string; files: import('../utils/file-args.js').AttachedFile[] };
        try {
          parsed = parseFileArgs(args);
        } catch (err) {
          console.error(chalk.red(`Hata: ${(err as Error).message}`));
          process.exit(1);
        }

        const title = parsed.title;
        if (!title) {
          console.error(chalk.red('Not başlığı gerekli. Örn: termbank note "başlık"'));
          process.exit(1);
        }

        const attachments = parsed.files;
        const slug = safeFilename(title);

        await ensureNotesDir(config.vault);

        // Duplicate check
        if (!options.force && (await noteExists(config.vault, slug))) {
          console.error(chalk.yellow(`"${title}" (${slug}) notu zaten mevcut.`));
          console.error(chalk.yellow('Üzerine yazmak için --force kullanın:'));
          console.error(chalk.yellow(`  termbank note "${title}" --force`));
          process.exit(1);
        }

        // Vault context
        const vaultCtx = await getVaultContext(config.vault, config.vaultContext.maxTerms);
        const vaultContextBlock = config.vaultContext.enabled
          ? buildVaultContextBlock(vaultCtx)
          : '';
        const allSlugs = getAllSlugs(vaultCtx);

        if (vaultCtx.terms.length + vaultCtx.notes.length + vaultCtx.visuals.length > 0) {
          const total = vaultCtx.terms.length + vaultCtx.notes.length + vaultCtx.visuals.length;
          console.log(chalk.dim(`  vault context: ${total} mevcut içerik`));
        }

        if (attachments.length > 0) {
          console.log(chalk.dim(`  eklenen dosyalar: ${attachments.map(f => f.name).join(', ')}`));
        }

        const spinner = new Spinner(chalk.blue(`"${title}" notu için Claude ile analiz ediliyor`));
        spinner.start();

        let noteData;
        try {
          noteData = await queryClaudeCLIForNote(
            title,
            vaultContextBlock,
            config,
            attachments.length > 0 ? attachments : undefined,
          );
          spinner.stop(chalk.green('✓ Claude yanıtı alındı'));
        } catch (err) {
          spinner.stop();
          throw err;
        }

        const sources = attachments.map(f => f.name);
        const markdown = renderNote(noteData, allSlugs, sources, slug);
        const filePath = await saveNote(config.vault, slug, markdown);

        console.log(chalk.green(`\n✓ notes/${slug}.md oluşturuldu`));
        console.log(chalk.dim(`  Dosya: ${filePath}`));
        console.log(`  ${chalk.bold('Tags:')} ${noteData.tags.join(', ')}`);
        console.log(`  ${chalk.bold('Özet:')} ${noteData.summary}`);

        // Add back-links to related terms that exist in vault
        const existingRelated = noteData.relatedTerms.filter(rt =>
          allSlugs.some(s => s.toLowerCase() === rt.toLowerCase()),
        );

        if (existingRelated.length > 0) {
          console.log(
            `  ${chalk.bold('Bağlantılar:')} ${existingRelated.map(l => chalk.cyan(`[[${l}]]`)).join(', ')}`,
          );
        }

        if (config.autoRelate && existingRelated.length > 0) {
          let autoLinked = 0;
          for (const relatedSlug of existingRelated) {
            const wasAdded = await addRelation(config.vault, relatedSlug, noteData.title);
            if (wasAdded) autoLinked++;
          }
          if (autoLinked > 0) {
            console.log(
              chalk.dim(`  Auto-relate: ${autoLinked} mevcut içeriğe ters bağlantı eklendi`),
            );
          }
        }
      } catch (err) {
        console.error(chalk.red(`\nHata: ${(err as Error).message}`));
        process.exit(1);
      }
    });
}
