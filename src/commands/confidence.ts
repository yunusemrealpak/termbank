import { Command } from 'commander';
import chalk from 'chalk';
import { loadConfig } from '../services/config.service.js';
import { termExists, updateTermFrontmatter } from '../services/vault.service.js';

const VALID_LEVELS = ['learning', 'familiar', 'mastered'];

export function registerConfidenceCommand(program: Command): void {
  program
    .command('confidence <term> <level>')
    .description(`Terimin confidence seviyesini güncelle (${VALID_LEVELS.join(' | ')})`)
    .action(async (term: string, level: string) => {
      try {
        const config = await loadConfig();
        if (!config.vault) {
          console.error(chalk.red('Vault path ayarlanmamış.'));
          console.error(chalk.yellow('  termbank config set vault <path>'));
          process.exit(1);
        }

        if (!VALID_LEVELS.includes(level)) {
          console.error(chalk.red(`Geçersiz seviye: "${level}"`));
          console.error(chalk.yellow(`Geçerli seviyeler: ${VALID_LEVELS.join(', ')}`));
          process.exit(1);
        }

        if (!(await termExists(config.vault, term))) {
          console.error(chalk.red(`"${term}" vault'ta bulunamadı.`));
          process.exit(1);
        }

        await updateTermFrontmatter(config.vault, term, {
          confidence: level,
          updated: new Date().toISOString(),
        });

        const colored =
          level === 'learning'
            ? chalk.yellow(level)
            : level === 'familiar'
              ? chalk.blue(level)
              : chalk.green(level);

        console.log(chalk.green(`✓ ${chalk.cyan(term)} → ${colored}`));
      } catch (err) {
        console.error(chalk.red(`Hata: ${(err as Error).message}`));
        process.exit(1);
      }
    });
}
