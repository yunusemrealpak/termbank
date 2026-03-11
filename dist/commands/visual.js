import chalk from 'chalk';
import path from 'path';
import fs from 'fs';
import readline from 'readline';
import { loadConfig } from '../services/config.service.js';
import { getVaultContext, ensureVisualsDir, addRelation, buildVaultContextBlock, getAllSlugs, copyVisualFile, termExists, saveTerm, noteExists, saveNote, } from '../services/vault.service.js';
import { queryClaudeCLIForVisualTerm, queryClaudeCLIForVisualNote, } from '../services/claude.service.js';
import { renderTermMarkdown } from '../templates/term.template.js';
import { renderNote } from '../templates/note.template.js';
import { slugify } from '../utils/slugify.js';
import { Spinner } from '../utils/spinner.js';
import { parseFileArgs } from '../utils/file-args.js';
const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg']);
function listImagesInCwd() {
    return fs.readdirSync(process.cwd()).filter(f => {
        const ext = path.extname(f).toLowerCase();
        return IMAGE_EXTENSIONS.has(ext);
    });
}
async function promptLine(question) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    return new Promise(resolve => {
        rl.question(question, answer => {
            rl.close();
            resolve(answer.trim());
        });
    });
}
async function pickImagesInteractively() {
    const images = listImagesInCwd();
    if (images.length === 0) {
        console.log(chalk.yellow('Mevcut dizinde görsel dosyası bulunamadı.'));
        console.log(chalk.dim('Görsel yolunu manuel girin veya komutu çalıştırdığınız dizinde görsel dosyaları olduğundan emin olun.'));
        return [];
    }
    console.log(chalk.bold('\nMevcut dizindeki görseller:'));
    images.forEach((img, i) => {
        console.log(`  ${chalk.cyan(String(i + 1).padStart(2))}. @${img}`);
    });
    const input = await promptLine(chalk.bold('\nSeçim') + chalk.dim(' (virgülle ayırın, örn: 1,3): '));
    if (!input)
        return [];
    const selected = [];
    for (const part of input.split(',')) {
        const n = parseInt(part.trim(), 10);
        if (!isNaN(n) && n >= 1 && n <= images.length) {
            selected.push(path.resolve(process.cwd(), images[n - 1]));
        }
    }
    return selected;
}
async function promptDocType() {
    const answer = await promptLine(chalk.bold('\nBu görsel ne olarak kaydedilsin?\n') +
        `  ${chalk.cyan('1')}. Terim ${chalk.dim('(vault/terms/)')}\n` +
        `  ${chalk.cyan('2')}. Not ${chalk.dim('(vault/notes/)')}\n` +
        chalk.bold('Seçim [1/2]: '));
    if (answer === '2')
        return 'note';
    return 'term';
}
export function registerVisualCommand(program) {
    program
        .command('visual')
        .argument('[args...]', 'Görsel başlığı ve @görsel dosyası referansları')
        .description('Görsel analiz et ve term/not olarak kaydet. Örn: termbank visual --type term @diagram.png')
        .option('-f, --force', 'Mevcut içeriğin üzerine yaz')
        .option('--type <type>', 'Belge türü: term veya note')
        .option('--title <title>', 'Belge başlığı (verilmezse Claude görselden çıkarır)')
        .action(async (args, options) => {
        try {
            const config = await loadConfig();
            if (!config.vault) {
                console.error(chalk.red('Vault path ayarlanmamış. Önce ayarlayın:'));
                console.error(chalk.yellow('  termbank config set vault <path>'));
                process.exit(1);
            }
            // Parse args for @ file references
            let parsed;
            try {
                parsed = parseFileArgs(args);
            }
            catch (err) {
                console.error(chalk.red(`Hata: ${err.message}`));
                process.exit(1);
            }
            // Title: --title flag > parsed title > null (Claude will infer)
            const title = options.title ?? parsed.title ?? null;
            let attachments = parsed.files;
            if (attachments.length === 0) {
                // Interactive file picker
                const selectedPaths = await pickImagesInteractively();
                if (selectedPaths.length === 0) {
                    console.error(chalk.red('En az bir görsel seçilmeli.'));
                    process.exit(1);
                }
                attachments = selectedPaths.map(p => ({
                    path: p,
                    absolutePath: p,
                    name: path.basename(p),
                    type: 'image',
                }));
            }
            // Warn about non-image files but continue
            const nonImages = attachments.filter(f => f.type !== 'image');
            if (nonImages.length > 0) {
                console.warn(chalk.yellow(`Uyarı: Görsel olmayan dosyalar tespit edildi: ${nonImages.map(f => f.name).join(', ')}. Bu dosyalar yine de işlenecek.`));
            }
            // Determine doc type: --type flag or interactive prompt
            let docType;
            if (options.type === 'term' || options.type === 'note') {
                docType = options.type;
            }
            else if (options.type) {
                console.error(chalk.red(`Geçersiz --type değeri: "${options.type}". "term" veya "note" olmalı.`));
                process.exit(1);
            }
            else {
                docType = await promptDocType();
            }
            // Ensure visuals dir exists and copy image files
            await ensureVisualsDir(config.vault);
            const visualsDir = path.join(config.vault, 'visuals');
            const copiedFileNames = [];
            const copiedAbsolutePaths = [];
            console.log(chalk.dim(`  görseller kopyalanıyor...`));
            for (const attachment of attachments) {
                const destFileName = await copyVisualFile(attachment.absolutePath, visualsDir);
                copiedFileNames.push(destFileName);
                copiedAbsolutePaths.push(path.join(visualsDir, destFileName));
                console.log(chalk.dim(`    ✓ ${attachment.name} → ${destFileName}`));
            }
            // Vault context
            const vaultCtx = await getVaultContext(config.vault, config.vaultContext.maxTerms);
            const vaultContextBlock = config.vaultContext.enabled
                ? buildVaultContextBlock(vaultCtx)
                : '';
            const allSlugs = getAllSlugs(vaultCtx);
            const total = vaultCtx.terms.length + vaultCtx.notes.length;
            if (total > 0) {
                console.log(chalk.dim(`  vault context: ${total} mevcut içerik`));
            }
            const spinnerLabel = title
                ? `"${title}" görseli için Claude ile analiz ediliyor`
                : 'Görsel Claude ile analiz ediliyor';
            const spinner = new Spinner(chalk.blue(spinnerLabel));
            spinner.start();
            let slug;
            let markdown;
            let displayTitle;
            let relatedTerms;
            let tags;
            let summary;
            let filePath;
            if (docType === 'term') {
                let termData;
                try {
                    termData = await queryClaudeCLIForVisualTerm(title, copiedAbsolutePaths, copiedFileNames, vaultContextBlock, config);
                    spinner.stop(chalk.green('✓ Claude yanıtı alındı'));
                }
                catch (err) {
                    spinner.stop();
                    throw err;
                }
                slug = slugify(termData.term);
                displayTitle = termData.term;
                relatedTerms = termData.relatedTerms;
                tags = termData.tags;
                summary = termData.summary;
                // Duplicate check
                if (!options.force && (await termExists(config.vault, termData.term))) {
                    console.error(chalk.yellow(`"${termData.term}" (${slug}) terimi zaten mevcut.`));
                    console.error(chalk.yellow('Üzerine yazmak için --force kullanın:'));
                    console.error(chalk.yellow(`  termbank visual --force ...`));
                    process.exit(1);
                }
                markdown = renderTermMarkdown(termData, vaultCtx.terms, [], copiedFileNames);
                filePath = await saveTerm(config.vault, slug, markdown);
                console.log(chalk.green(`\n✓ terms/${slug}.md oluşturuldu`));
            }
            else {
                let noteData;
                try {
                    noteData = await queryClaudeCLIForVisualNote(title, copiedAbsolutePaths, copiedFileNames, vaultContextBlock, config);
                    spinner.stop(chalk.green('✓ Claude yanıtı alındı'));
                }
                catch (err) {
                    spinner.stop();
                    throw err;
                }
                slug = slugify(noteData.title);
                displayTitle = noteData.title;
                relatedTerms = noteData.relatedTerms;
                tags = noteData.tags;
                summary = noteData.summary;
                // Duplicate check
                if (!options.force && (await noteExists(config.vault, slug))) {
                    console.error(chalk.yellow(`"${noteData.title}" (${slug}) notu zaten mevcut.`));
                    console.error(chalk.yellow('Üzerine yazmak için --force kullanın:'));
                    console.error(chalk.yellow(`  termbank visual --force ...`));
                    process.exit(1);
                }
                markdown = renderNote(noteData, allSlugs, [], slug, copiedFileNames);
                filePath = await saveNote(config.vault, slug, markdown);
                console.log(chalk.green(`\n✓ notes/${slug}.md oluşturuldu`));
            }
            console.log(chalk.dim(`  Dosya: ${filePath}`));
            console.log(`  ${chalk.bold('Tags:')} ${tags.join(', ')}`);
            console.log(`  ${chalk.bold('Özet:')} ${summary}`);
            console.log(chalk.dim(`  Görseller: ${copiedFileNames.join(', ')}`));
            // Add back-links to related items that exist in vault
            const existingRelated = relatedTerms.filter(rt => allSlugs.some(s => s.toLowerCase() === rt.toLowerCase()));
            if (existingRelated.length > 0) {
                console.log(`  ${chalk.bold('Bağlantılar:')} ${existingRelated.map(l => chalk.cyan(`[[${l}]]`)).join(', ')}`);
            }
            if (config.autoRelate && existingRelated.length > 0) {
                let autoLinked = 0;
                for (const relatedSlug of existingRelated) {
                    const wasAdded = await addRelation(config.vault, relatedSlug, displayTitle);
                    if (wasAdded)
                        autoLinked++;
                }
                if (autoLinked > 0) {
                    console.log(chalk.dim(`  Auto-relate: ${autoLinked} mevcut içeriğe ters bağlantı eklendi`));
                }
            }
        }
        catch (err) {
            console.error(chalk.red(`\nHata: ${err.message}`));
            process.exit(1);
        }
    });
}
//# sourceMappingURL=visual.js.map