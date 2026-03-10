import chalk from 'chalk';
import fs from 'fs/promises';
import path from 'path';
import matter from 'gray-matter';
import { loadConfig } from '../services/config.service.js';
export function registerListCommand(program) {
    program
        .command('list')
        .description('Vault içeriklerini listele')
        .option('--tag <tag>', "Tag'a göre filtrele")
        .option('--category <category>', 'Kategoriye göre filtrele (sadece term için)')
        .option('--confidence <level>', 'Confidence seviyesine göre filtrele (sadece term için)')
        .option('--type <type>', 'İçerik türüne göre listele (term|note|visual). Varsayılan: term')
        .action(async (options) => {
        try {
            const config = await loadConfig();
            if (!config.vault) {
                console.error(chalk.red('Vault path ayarlanmamış.'));
                console.error(chalk.yellow('  termbank config set vault <path>'));
                process.exit(1);
            }
            const typeFilter = options.type || 'term';
            if (!['term', 'note', 'visual'].includes(typeFilter)) {
                console.error(chalk.red(`Geçersiz tür: "${typeFilter}". Geçerli değerler: term, note, visual`));
                process.exit(1);
            }
            if (typeFilter === 'term') {
                await listTerms(config.vault, options);
            }
            else if (typeFilter === 'note') {
                await listContent(config.vault, 'notes', 'note', options.tag);
            }
            else {
                await listContent(config.vault, 'visuals', 'visual', options.tag);
            }
        }
        catch (err) {
            console.error(chalk.red(`Hata: ${err.message}`));
            process.exit(1);
        }
    });
}
async function listTerms(vaultPath, options) {
    const termsDir = path.join(vaultPath, 'terms');
    let files;
    try {
        files = await fs.readdir(termsDir);
    }
    catch {
        console.log(chalk.yellow('Vault boş.'));
        return;
    }
    const mdFiles = files.filter(f => f.endsWith('.md'));
    if (mdFiles.length === 0) {
        console.log(chalk.yellow('Vault boş. İlk terimi eklemek için:'));
        console.log(chalk.dim('  termbank add <terim>'));
        return;
    }
    const rows = [];
    for (const file of mdFiles) {
        const content = await fs.readFile(path.join(termsDir, file), 'utf-8');
        const { data } = matter(content);
        const term = data.term || path.basename(file, '.md');
        const category = data.category || '';
        const tags = Array.isArray(data.tags) ? data.tags : [];
        const confidence = data.confidence || 'learning';
        if (options.tag && !tags.some(t => t.toLowerCase() === options.tag.toLowerCase())) {
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
    const pad = (s, len) => s.slice(0, len).padEnd(len);
    const sep = chalk.dim(`${'─'.repeat(w.term)}  ${'─'.repeat(w.category)}  ${'─'.repeat(w.tags)}  ${'─'.repeat(w.confidence)}`);
    console.log();
    console.log(`${chalk.bold(pad('Terim', w.term))}  ${chalk.bold(pad('Kategori', w.category))}  ${chalk.bold(pad('Tags', w.tags))}  ${chalk.bold('Confidence')}`);
    console.log(sep);
    for (const row of rows) {
        console.log(`${chalk.cyan(pad(row.term, w.term))}  ${chalk.white(pad(row.category, w.category))}  ${chalk.dim(pad(row.tags, w.tags))}  ${colorConfidence(row.confidence)}`);
    }
    console.log(sep);
    console.log(chalk.dim(`\n${rows.length} terim`));
}
async function listContent(vaultPath, subDir, label, tagFilter) {
    const dir = path.join(vaultPath, subDir);
    let files;
    try {
        files = await fs.readdir(dir);
    }
    catch {
        console.log(chalk.yellow(`${label} dizini boş veya bulunamadı.`));
        return;
    }
    const mdFiles = files.filter(f => f.endsWith('.md'));
    if (mdFiles.length === 0) {
        console.log(chalk.yellow(`${label} dizini boş.`));
        return;
    }
    const rows = [];
    for (const file of mdFiles) {
        const content = await fs.readFile(path.join(dir, file), 'utf-8');
        const { data } = matter(content);
        const name = data.title || path.basename(file, '.md');
        const tags = Array.isArray(data.tags) ? data.tags : [];
        const summary = data.summary || '';
        if (tagFilter && !tags.some(t => t.toLowerCase() === tagFilter.toLowerCase())) {
            continue;
        }
        rows.push({ name, tags: tags.join(', '), summary });
    }
    if (rows.length === 0) {
        console.log(chalk.yellow(`Filtre koşullarına uyan ${label} bulunamadı.`));
        return;
    }
    const w = {
        name: Math.max(5, ...rows.map(r => r.name.length)),
        tags: Math.max(4, Math.min(30, ...rows.map(r => r.tags.length))),
        summary: Math.max(5, Math.min(50, ...rows.map(r => r.summary.length))),
    };
    const pad = (s, len) => s.slice(0, len).padEnd(len);
    const sep = chalk.dim(`${'─'.repeat(w.name)}  ${'─'.repeat(w.tags)}  ${'─'.repeat(w.summary)}`);
    console.log();
    console.log(`${chalk.bold(pad('Başlık', w.name))}  ${chalk.bold(pad('Tags', w.tags))}  ${chalk.bold(pad('Özet', w.summary))}`);
    console.log(sep);
    for (const row of rows) {
        console.log(`${chalk.cyan(pad(row.name, w.name))}  ${chalk.dim(pad(row.tags, w.tags))}  ${chalk.white(pad(row.summary, w.summary))}`);
    }
    console.log(sep);
    console.log(chalk.dim(`\n${rows.length} ${label}`));
}
function colorConfidence(level) {
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
//# sourceMappingURL=list.js.map