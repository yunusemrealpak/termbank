import chalk from 'chalk';
import matter from 'gray-matter';
import { loadConfig } from '../services/config.service.js';
import { getVaultContext, termExists, readTerm, saveTerm, findTermFile, } from '../services/vault.service.js';
import { queryClaudeCLIForUpdate } from '../services/claude.service.js';
import { renderTermMarkdown } from '../templates/term.template.js';
import { safeFilename } from '../utils/slugify.js';
import { Spinner } from '../utils/spinner.js';
export function registerUpdateCommand(program) {
    program
        .command('update <term>')
        .description('Mevcut terimi Claude ile zenginleştir/güncelle')
        .action(async (term) => {
        try {
            const config = await loadConfig();
            if (!config.vault) {
                console.error(chalk.red('Vault path ayarlanmamış.'));
                console.error(chalk.yellow('  termbank config set vault <path>'));
                process.exit(1);
            }
            if (!(await termExists(config.vault, term))) {
                console.error(chalk.red(`"${term}" vault'ta bulunamadı.`));
                process.exit(1);
            }
            const existingContent = await readTerm(config.vault, term);
            if (!existingContent) {
                console.error(chalk.red(`"${term}" okunamadı.`));
                process.exit(1);
            }
            const parsed = matter(existingContent);
            const createdAt = parsed.data.created || new Date().toISOString();
            const confidence = parsed.data.confidence || 'learning';
            const vaultContext = config.vaultContext.enabled
                ? await getVaultContext(config.vault, config.vaultContext.maxTerms)
                : [];
            const spinner = new Spinner(chalk.blue(`"${term}" güncelleniyor`));
            spinner.start();
            let updatedData;
            try {
                updatedData = await queryClaudeCLIForUpdate(term, existingContent, config, vaultContext);
                spinner.stop(chalk.green('✓ Claude yanıtı alındı'));
            }
            catch (err) {
                spinner.stop();
                throw err;
            }
            const newMarkdown = renderTermMarkdown(updatedData, vaultContext);
            const newParsed = matter(newMarkdown);
            newParsed.data.created = createdAt;
            newParsed.data.confidence = confidence;
            newParsed.data.updated = new Date().toISOString();
            const finalContent = matter.stringify(newParsed.content, newParsed.data);
            // Keep the existing filename (don't rename on update)
            const existingFileName = (await findTermFile(config.vault, term)) ?? safeFilename(updatedData.term);
            await saveTerm(config.vault, existingFileName, finalContent);
            console.log(chalk.green(`✓ terms/${existingFileName}.md güncellendi`));
            console.log(`  ${chalk.bold('Kategori:')} ${updatedData.category}`);
            console.log(`  ${chalk.bold('Tags:')} ${updatedData.tags.join(', ')}`);
            console.log(`  ${chalk.bold('Özet:')} ${updatedData.summary}`);
            console.log(`  ${chalk.dim(`Confidence korundu: ${confidence}`)}`);
        }
        catch (err) {
            console.error(chalk.red(`Hata: ${err.message}`));
            process.exit(1);
        }
    });
}
//# sourceMappingURL=update.js.map