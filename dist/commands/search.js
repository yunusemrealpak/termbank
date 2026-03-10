import chalk from 'chalk';
import fs from 'fs/promises';
import path from 'path';
import matter from 'gray-matter';
import { loadConfig } from '../services/config.service.js';
export function registerSearchCommand(program) {
    program
        .command('search <keyword>')
        .description("Vault'da terim ara")
        .action(async (keyword) => {
        try {
            const config = await loadConfig();
            if (!config.vault) {
                console.error(chalk.red('Vault path ayarlanmamış.'));
                console.error(chalk.yellow('  termbank config set vault <path>'));
                process.exit(1);
            }
            const termsDir = path.join(config.vault, 'terms');
            let files;
            try {
                files = await fs.readdir(termsDir);
            }
            catch {
                console.log(chalk.yellow('Vault boş veya erişilemiyor.'));
                return;
            }
            const mdFiles = files.filter(f => f.endsWith('.md'));
            const results = [];
            const regex = new RegExp(escapeRegex(keyword), 'gi');
            for (const file of mdFiles) {
                const content = await fs.readFile(path.join(termsDir, file), 'utf-8');
                const { data, content: body } = matter(content);
                const term = data.term || path.basename(file, '.md');
                const category = data.category || '';
                // Check frontmatter fields first
                const frontmatterText = [
                    term,
                    category,
                    Array.isArray(data.tags) ? data.tags.join(' ') : '',
                    data.summary || '',
                ].join(' ');
                if (regex.test(frontmatterText)) {
                    results.push({
                        term,
                        category,
                        snippet: data.summary || '',
                        matchedField: getMatchedFrontmatterField(keyword, data),
                    });
                    continue;
                }
                // Check body content line by line
                const lines = body.split('\n');
                for (const line of lines) {
                    if (regex.test(line)) {
                        results.push({
                            term,
                            category,
                            snippet: line.trim().slice(0, 100),
                            matchedField: 'içerik',
                        });
                        break;
                    }
                }
            }
            if (results.length === 0) {
                console.log(chalk.yellow(`"${keyword}" için sonuç bulunamadı.`));
                return;
            }
            console.log(chalk.bold(`\n${results.length} sonuç:\n`));
            for (const r of results) {
                console.log(`${chalk.cyan(r.term)}  ${chalk.dim(`[${r.category}]`)}  ${chalk.dim(`(${r.matchedField})`)}`);
                if (r.snippet) {
                    console.log(`  ${chalk.white(r.snippet)}`);
                }
                console.log();
            }
        }
        catch (err) {
            console.error(chalk.red(`Hata: ${err.message}`));
            process.exit(1);
        }
    });
}
function escapeRegex(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
function getMatchedFrontmatterField(keyword, data) {
    const re = new RegExp(escapeRegex(keyword), 'i');
    if (re.test(data.term || ''))
        return 'terim';
    if (re.test(data.summary || ''))
        return 'özet';
    if (re.test(data.category || ''))
        return 'kategori';
    if (Array.isArray(data.tags) && data.tags.some(t => re.test(t)))
        return 'tags';
    return 'frontmatter';
}
//# sourceMappingURL=search.js.map