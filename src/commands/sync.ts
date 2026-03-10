import { Command } from 'commander';
import chalk from 'chalk';
import { loadConfig } from '../services/config.service.js';
import { syncVault, getCurrentBranch, isGitRepo } from '../services/git.service.js';
import { Spinner } from '../utils/spinner.js';

export function registerSyncCommand(program: Command): void {
  program
    .command('sync')
    .description("Vault'u GitHub ile senkronize et (pull + commit + push)")
    .option('--pull-only', 'Sadece çek, commit/push yapma')
    .action(async (options: { pullOnly?: boolean }) => {
      try {
        const config = await loadConfig();

        if (!config.vault) {
          console.error(chalk.red('Vault path ayarlanmamış.'));
          console.error(chalk.yellow('  termbank config set vault <path>'));
          process.exit(1);
        }

        if (!config.git.enabled) {
          console.error(chalk.yellow('Git sync devre dışı. Aktif etmek için:'));
          console.error(chalk.dim('  termbank config set git.enabled true'));
          console.error(chalk.dim('  termbank config set git.branch main'));
          process.exit(1);
        }

        if (!(await isGitRepo(config.vault))) {
          console.error(chalk.red(`Vault bir git reposu değil: ${config.vault}`));
          console.error(chalk.yellow('Vault dizinini git reposuna bağlayın:'));
          console.error(chalk.dim(`  cd "${config.vault}"`));
          console.error(chalk.dim('  git init'));
          console.error(chalk.dim('  git remote add origin <repo-url>'));
          process.exit(1);
        }

        // Resolve branch: config value or auto-detect current branch
        const branch =
          config.git.branch || (await getCurrentBranch(config.vault));

        const action = options.pullOnly ? 'çekiliyor' : 'senkronize ediliyor';
        const spinner = new Spinner(chalk.blue(`Vault ${action}`));
        spinner.start();

        let result;
        try {
          result = await syncVault(config.vault, branch, { pullOnly: options.pullOnly });
          spinner.stop();
        } catch (err) {
          spinner.stop();
          throw err;
        }

        if (result.committed) {
          console.log(chalk.green(`✓ Commit: ${result.commitMessage}`));
          if (result.newTerms && result.newTerms.length > 0) {
            result.newTerms.forEach(t => console.log(chalk.dim(`  + ${t}.md`)));
          }
        } else if (!options.pullOnly) {
          console.log(chalk.dim('  Commit yok — paylaşılmamış değişiklik bulunamadı'));
        }

        if (result.pulled) {
          console.log(chalk.green('✓ Pull tamamlandı'));
        }

        if (result.pushed) {
          console.log(chalk.green('✓ Push tamamlandı'));
        }

        if (options.pullOnly) {
          console.log(chalk.dim('  (sadece pull — push yapılmadı)'));
        }
      } catch (err) {
        console.error(chalk.red(`\nSync hatası: ${(err as Error).message}`));
        console.error(chalk.yellow('\nManüel çözüm için:'));
        console.error(chalk.dim(`  cd "${(await loadConfig()).vault}"`));
        console.error(chalk.dim('  git status'));
        process.exit(1);
      }
    });
}
