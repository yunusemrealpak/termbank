import chalk from 'chalk';
import readline from 'readline';
import { loadConfig } from '../services/config.service.js';
import { getVaultContext, termExists, saveTerm, ensureVaultDir, addRelation, } from '../services/vault.service.js';
import { queryClaudeCLI } from '../services/claude.service.js';
import { syncVault } from '../services/git.service.js';
import { renderTermMarkdown } from '../templates/term.template.js';
import { safeFilename } from '../utils/slugify.js';
import { Spinner } from '../utils/spinner.js';
export function registerAddCommand(program) {
    program
        .command('add [term]')
        .description('Yeni terim ekle (argümansız = interaktif mod)')
        .option('-f, --force', 'Mevcut terimin üzerine yaz')
        .action(async (termArg, options) => {
        try {
            const config = await loadConfig();
            if (!config.vault) {
                console.error(chalk.red('Vault path ayarlanmamış. Önce ayarlayın:'));
                console.error(chalk.yellow('  termbank config set vault <path>'));
                process.exit(1);
            }
            // Interactive mode: prompt if no term argument given
            let term = termArg;
            if (!term) {
                term = await promptForTerm();
                if (!term) {
                    console.error(chalk.red('Terim adı girilmedi.'));
                    process.exit(1);
                }
            }
            // Duplicate check — case-insensitive, by display name
            if (!options.force && (await termExists(config.vault, term))) {
                console.error(chalk.yellow(`"${term}" zaten mevcut.`));
                console.error(chalk.yellow('Üzerine yazmak için --force kullanın:'));
                console.error(chalk.yellow(`  termbank add "${term}" --force`));
                process.exit(1);
            }
            await ensureVaultDir(config.vault);
            const vaultContext = config.vaultContext.enabled
                ? await getVaultContext(config.vault, config.vaultContext.maxTerms)
                : [];
            if (vaultContext.length > 0) {
                console.log(chalk.dim(`  vault context: ${vaultContext.length} mevcut terim`));
            }
            const spinner = new Spinner(chalk.blue(`"${term}" için Claude ile analiz ediliyor`));
            spinner.start();
            let termData;
            try {
                termData = await queryClaudeCLI(term, config, vaultContext);
                spinner.stop(chalk.green('✓ Claude yanıtı alındı'));
            }
            catch (err) {
                spinner.stop();
                throw err;
            }
            // Use Claude's returned display name as filename (preserves casing + spaces)
            const fileName = safeFilename(termData.term);
            const markdown = renderTermMarkdown(termData, vaultContext);
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
                console.log(`  ${chalk.bold('Bağlantılar:')} ${linked.map(l => chalk.cyan(`[[${l}]]`)).join(', ')}`);
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
                    if (wasAdded)
                        autoLinked++;
                }
                if (autoLinked > 0) {
                    console.log(chalk.dim(`  Auto-relate: ${autoLinked} mevcut terime ters bağlantı eklendi`));
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
                }
                catch (syncErr) {
                    syncSpinner.stop();
                    console.log(chalk.yellow(`  Sync başarısız (terim kaydedildi): ${syncErr.message}`));
                    console.log(chalk.dim('  Manuel sync için: termbank sync'));
                }
            }
        }
        catch (err) {
            console.error(chalk.red(`\nHata: ${err.message}`));
            process.exit(1);
        }
    });
}
function promptForTerm() {
    return new Promise(resolve => {
        const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
        rl.question(chalk.blue('Terim: '), answer => {
            rl.close();
            resolve(answer.trim());
        });
    });
}
//# sourceMappingURL=add.js.map