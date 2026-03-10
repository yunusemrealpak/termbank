import { Command } from 'commander';
import chalk from 'chalk';
import { setConfigValue, getConfigValue, loadConfig } from '../services/config.service.js';

export function registerConfigCommand(program: Command): void {
  const configCmd = program
    .command('config')
    .description('Ayar yönetimi');

  configCmd
    .command('set <key> <value>')
    .description('Bir ayar değerini güncelle')
    .action(async (key: string, value: string) => {
      try {
        await setConfigValue(key, value);
        const saved = await getConfigValue(key);
        console.log(chalk.green(`✓ ${key} = ${JSON.stringify(saved)}`));
      } catch (err) {
        console.error(chalk.red(`Hata: ${(err as Error).message}`));
        process.exit(1);
      }
    });

  configCmd
    .command('get <key>')
    .description('Bir ayar değerini göster')
    .action(async (key: string) => {
      try {
        const value = await getConfigValue(key);
        if (value === undefined) {
          console.log(chalk.yellow(`"${key}" ayarı tanımlı değil.`));
        } else {
          console.log(`${key} = ${JSON.stringify(value)}`);
        }
      } catch (err) {
        console.error(chalk.red(`Hata: ${(err as Error).message}`));
        process.exit(1);
      }
    });

  configCmd
    .command('show')
    .description('Tüm ayarları göster')
    .action(async () => {
      try {
        const config = await loadConfig();
        console.log(JSON.stringify(config, null, 2));
      } catch (err) {
        console.error(chalk.red(`Hata: ${(err as Error).message}`));
        process.exit(1);
      }
    });
}
