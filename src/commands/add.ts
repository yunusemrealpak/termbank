import { Command } from 'commander';
import chalk from 'chalk';
import readline from 'readline';
import { loadConfig } from '../services/config.service.js';
import {
  getVaultContext,
  termExists,
  saveTerm,
  ensureVaultDir,
  addRelation,
} from '../services/vault.service.js';
import { queryClaudeCLI } from '../services/claude.service.js';
import { syncVault } from '../services/git.service.js';
import { renderTermMarkdown } from '../templates/term.template.js';
import { safeFilename } from '../utils/slugify.js';
import { Spinner } from '../utils/spinner.js';
import { parseFileArgs } from '../utils/file-args.js';

export function registerAddCommand(program: Command): void {
  program
    .command('add')
    .argument('[args...]', 'Terim adı ve/veya @dosya referansları')
    .description('Yeni terim ekle (argümansız = interaktif mod). Örn: termbank add "terim" @file.pdf')
    .option('-f, --force', 'Mevcut terimin üzerine yaz')
    .action(async (args: string[], options: { force?: boolean }) => {
      try {
        const config = await loadConfig();

        if (!config.vault) {
          console.error(chalk.red('Vault path ayarlanmamış. Önce ayarlayın:'));
          console.error(chalk.yellow('  termbank config set vault <path>'));
          process.exit(1);
        }

        // Parse @ file args and extract term
        let parsed: { title?: string; files: import('../utils/file-args.js').AttachedFile[] };
        try {
          parsed = parseFileArgs(args);
        } catch (err) {
          console.error(chalk.red(`Hata: ${(err as Error).message}`));
          process.exit(1);
        }

        // Interactive mode: prompt if no term argument given
        let term = parsed.title;
        if (!term) {
          term = await promptForTerm();
          if (!term) {
            console.error(chalk.red('Terim adı girilmedi.'));
            process.exit(1);
          }
        }

        const attachments = parsed.files;

        // Duplicate check — case-insensitive, by display name
        if (!options.force && (await termExists(config.vault, term))) {
          console.error(chalk.yellow(`"${term}" zaten mevcut.`));
          console.error(chalk.yellow('Üzerine yazmak için --force kullanın:'));
          console.error(chalk.yellow(`  termbank add "${term}" --force`));
          process.exit(1);
        }

        await ensureVaultDir(config.vault);

        const vaultCtx = config.vaultContext.enabled
          ? await getVaultContext(config.vault, config.vaultContext.maxTerms)
          : { terms: [], notes: [], visuals: [] };

        const vaultContext = vaultCtx.terms;

        if (vaultContext.length > 0) {
          console.log(chalk.dim(`  vault context: ${vaultContext.length} mevcut terim`));
        }

        if (attachments.length > 0) {
          console.log(chalk.dim(`  eklenen dosyalar: ${attachments.map(f => f.name).join(', ')}`));
        }

        const spinner = new Spinner(chalk.blue(`"${term}" için Claude ile analiz ediliyor`));
        spinner.start();

        let termData;
        try {
          termData = await queryClaudeCLI(term, config, vaultContext, attachments.length > 0 ? attachments : undefined);
          spinner.stop(chalk.green('✓ Claude yanıtı alındı'));
        } catch (err) {
          spinner.stop();
          throw err;
        }

        // Attachment file names to add as sources
        const attachmentSources = attachments.map(f => f.name);

        // Use Claude's returned display name as filename (preserves casing + spaces)
        const fileName = safeFilename(termData.term);
        const markdown = renderTermMarkdown(termData, vaultContext, attachmentSources.length > 0 ? attachmentSources : undefined);
        const filePath = await saveTerm(config.vault, fileName, markdown);

        console.log(chalk.green(`\n✓ terms/${fileName}.md oluşturuldu`));
        console.log(chalk.dim(`  Dosya: ${filePath}`));
        console.log(`  ${chalk.bold('Kategori:')} ${termData.category}`);
        console.log(`  ${chalk.bold('Tags:')} ${termData.tags.join(', ')}`);
        console.log(`  ${chalk.bold('Özet:')} ${termData.summary}`);

        const vaultTermNames = new Set(vaultContext.map(t => t.term.toLowerCase()));
        const linked = termData.relatedTerms.filter(rt => vaultTermNames.has(rt.toLowerCase()));
        const unlinked = termData.relatedTerms.filter(rt => !vaultTermNames.has(rt.toLowerCase()));

        if (linked.length > 0) {
          console.log(
            `  ${chalk.bold('Bağlantılar:')} ${linked.map(l => chalk.cyan(`[[${l}]]`)).join(', ')}`,
          );
        }
        if (unlinked.length > 0) {
          console.log(`  ${chalk.dim('İlişkili (vault dışı):')} ${unlinked.join(', ')}`);
        }

        // Auto-relate: add bidirectional links to existing vault terms
        if (config.autoRelate && linked.length > 0) {
          let autoLinked = 0;
          for (const relatedName of linked) {
            // termData.term is the display name (e.g. "Feature Flag") — matches the filename
            const wasAdded = await addRelation(config.vault, relatedName, termData.term);
            if (wasAdded) autoLinked++;
          }
          if (autoLinked > 0) {
            console.log(
              chalk.dim(`  Auto-relate: ${autoLinked} mevcut terime ters bağlantı eklendi`),
            );
          }
        }

        // Auto-sync: non-blocking — add succeeds even if sync fails
        if (config.git.enabled && config.git.autoSync) {
          const syncSpinner = new Spinner(chalk.dim('Sync ediliyor'));
          syncSpinner.start();
          try {
            const branch = config.git.branch || 'main';
            const result = await syncVault(config.vault, branch, {
              commitMessage: `Add term: ${fileName}`,
            });
            syncSpinner.stop();
            if (result.pushed) {
              console.log(chalk.dim('  ✓ Sync tamamlandı'));
            }
          } catch (syncErr) {
            syncSpinner.stop();
            console.log(chalk.yellow(`  Sync başarısız (terim kaydedildi): ${(syncErr as Error).message}`));
            console.log(chalk.dim('  Manuel sync için: termbank sync'));
          }
        }
      } catch (err) {
        console.error(chalk.red(`\nHata: ${(err as Error).message}`));
        process.exit(1);
      }
    });
}

function promptForTerm(): Promise<string> {
  return new Promise(resolve => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(chalk.blue('Terim: '), answer => {
      rl.close();
      resolve(answer.trim());
    });
  });
}
