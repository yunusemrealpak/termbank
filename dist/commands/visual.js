import chalk from 'chalk';
import path from 'path';
import fs from 'fs';
import readline from 'readline';
import { loadConfig } from '../services/config.service.js';
import { getVaultContext, visualExists, saveVisual, ensureVisualsDir, addRelation, buildVaultContextBlock, getAllSlugs, copyVisualFile, } from '../services/vault.service.js';
import { queryClaudeCLIForVisual } from '../services/claude.service.js';
import { renderVisual } from '../templates/visual.template.js';
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
export function registerVisualCommand(program) {
    program
        .command('visual')
        .argument('[args...]', 'Görsel başlığı ve @görsel dosyası referansları')
        .description('Görsel ekle ve analiz et. Örn: termbank visual "başlık" @diagram.png')
        .option('-f, --force', 'Mevcut görselin üzerine yaz')
        .action(async (args, options) => {
        try {
            const config = await loadConfig();
            if (!config.vault) {
                console.error(chalk.red('Vault path ayarlanmamış. Önce ayarlayın:'));
                console.error(chalk.yellow('  termbank config set vault <path>'));
                process.exit(1);
            }
            // Parse args
            let parsed;
            try {
                parsed = parseFileArgs(args);
            }
            catch (err) {
                console.error(chalk.red(`Hata: ${err.message}`));
                process.exit(1);
            }
            let title = parsed.title;
            if (!title) {
                title = await promptLine(chalk.bold('Başlık: '));
                if (!title) {
                    console.error(chalk.red('Başlık boş olamaz.'));
                    process.exit(1);
                }
            }
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
            const slug = slugify(title);
            await ensureVisualsDir(config.vault);
            // Duplicate check
            if (!options.force && (await visualExists(config.vault, slug))) {
                console.error(chalk.yellow(`"${title}" (${slug}) görseli zaten mevcut.`));
                console.error(chalk.yellow('Üzerine yazmak için --force kullanın:'));
                console.error(chalk.yellow(`  termbank visual "${title}" --force`));
                process.exit(1);
            }
            // Vault context
            const vaultCtx = await getVaultContext(config.vault, config.vaultContext.maxTerms);
            const vaultContextBlock = config.vaultContext.enabled
                ? buildVaultContextBlock(vaultCtx)
                : '';
            const allSlugs = getAllSlugs(vaultCtx);
            if (vaultCtx.terms.length + vaultCtx.notes.length + vaultCtx.visuals.length > 0) {
                const total = vaultCtx.terms.length + vaultCtx.notes.length + vaultCtx.visuals.length;
                console.log(chalk.dim(`  vault context: ${total} mevcut içerik`));
            }
            // Copy visual files to vault/visuals/
            const visualsDir = path.join(config.vault, 'visuals');
            const copiedFileNames = [];
            const copiedAttachments = [];
            console.log(chalk.dim(`  görseller kopyalanıyor...`));
            for (const attachment of attachments) {
                const destFileName = await copyVisualFile(attachment.absolutePath, visualsDir);
                copiedFileNames.push(destFileName);
                copiedAttachments.push({
                    ...attachment,
                    absolutePath: path.join(visualsDir, destFileName),
                    name: destFileName,
                });
                console.log(chalk.dim(`    ✓ ${attachment.name} → ${destFileName}`));
            }
            const spinner = new Spinner(chalk.blue(`"${title}" görseli için Claude ile analiz ediliyor`));
            spinner.start();
            let visualData;
            try {
                visualData = await queryClaudeCLIForVisual(title, copiedAttachments.map(a => a.absolutePath), copiedFileNames, vaultContextBlock, config);
                spinner.stop(chalk.green('✓ Claude yanıtı alındı'));
            }
            catch (err) {
                spinner.stop();
                throw err;
            }
            const markdown = renderVisual(visualData, allSlugs, copiedFileNames, slug);
            const filePath = await saveVisual(config.vault, slug, markdown);
            console.log(chalk.green(`\n✓ visuals/${slug}.md oluşturuldu`));
            console.log(chalk.dim(`  Dosya: ${filePath}`));
            console.log(`  ${chalk.bold('Tags:')} ${visualData.tags.join(', ')}`);
            console.log(`  ${chalk.bold('Özet:')} ${visualData.summary}`);
            console.log(chalk.dim(`  Görseller: ${copiedFileNames.join(', ')}`));
            // Add back-links to related items that exist in vault
            const existingRelated = visualData.relatedTerms.filter(rt => allSlugs.some(s => s.toLowerCase() === rt.toLowerCase()));
            if (existingRelated.length > 0) {
                console.log(`  ${chalk.bold('Bağlantılar:')} ${existingRelated.map(l => chalk.cyan(`[[${l}]]`)).join(', ')}`);
            }
            if (config.autoRelate && existingRelated.length > 0) {
                let autoLinked = 0;
                for (const relatedSlug of existingRelated) {
                    const wasAdded = await addRelation(config.vault, relatedSlug, visualData.title);
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