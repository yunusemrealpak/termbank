import chalk from 'chalk';
import matter from 'gray-matter';
import { loadConfig } from '../services/config.service.js';
import { termExists, readTerm, addRelation } from '../services/vault.service.js';
export function registerRelateCommand(program) {
    program
        .command('relate <term1> <term2>')
        .description('İki terim arasında çift yönlü ilişki kur')
        .action(async (term1, term2) => {
        try {
            const config = await loadConfig();
            if (!config.vault) {
                console.error(chalk.red('Vault path ayarlanmamış.'));
                console.error(chalk.yellow('  termbank config set vault <path>'));
                process.exit(1);
            }
            if (!(await termExists(config.vault, term1))) {
                console.error(chalk.red(`"${term1}" vault'ta bulunamadı.`));
                process.exit(1);
            }
            if (!(await termExists(config.vault, term2))) {
                console.error(chalk.red(`"${term2}" vault'ta bulunamadı.`));
                process.exit(1);
            }
            // Use display names from frontmatter for wiki-links
            const name1 = await getDisplayName(config.vault, term1);
            const name2 = await getDisplayName(config.vault, term2);
            const added1 = await addRelation(config.vault, term1, name2);
            const added2 = await addRelation(config.vault, term2, name1);
            if (!added1 && !added2) {
                console.log(chalk.yellow(`${chalk.cyan(name1)} ↔ ${chalk.cyan(name2)} zaten ilişkili.`));
                return;
            }
            console.log(chalk.green(`✓ İlişki kuruldu: ${chalk.cyan(name1)} ↔ ${chalk.cyan(name2)}`));
            if (!added1)
                console.log(chalk.dim(`  ${name1} zaten ${name2}'yi bağlıyordu`));
            if (!added2)
                console.log(chalk.dim(`  ${name2} zaten ${name1}'yi bağlıyordu`));
        }
        catch (err) {
            console.error(chalk.red(`Hata: ${err.message}`));
            process.exit(1);
        }
    });
}
async function getDisplayName(vaultPath, searchTerm) {
    const content = await readTerm(vaultPath, searchTerm);
    if (!content)
        return searchTerm;
    const { data } = matter(content);
    return data.term || searchTerm;
}
//# sourceMappingURL=relate.js.map