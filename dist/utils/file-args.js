import fs from 'fs';
import path from 'path';
import os from 'os';
const IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg']);
const DOCUMENT_EXTS = new Set(['.pdf']);
function detectFileType(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    if (IMAGE_EXTS.has(ext))
        return 'image';
    if (DOCUMENT_EXTS.has(ext))
        return 'document';
    return 'text';
}
function expandPath(rawPath) {
    if (rawPath.startsWith('~/') || rawPath === '~') {
        return path.join(os.homedir(), rawPath.slice(2));
    }
    return path.resolve(rawPath);
}
export function parseFileArgs(args) {
    let title;
    const files = [];
    for (const arg of args) {
        if (arg.startsWith('@')) {
            const rawPath = arg.slice(1);
            const absolutePath = expandPath(rawPath);
            if (!fs.existsSync(absolutePath)) {
                throw new Error(`Dosya bulunamadı: ${absolutePath}`);
            }
            files.push({
                path: rawPath,
                absolutePath,
                name: path.basename(absolutePath),
                type: detectFileType(absolutePath),
            });
        }
        else if (title === undefined) {
            title = arg;
        }
    }
    return { title, files };
}
//# sourceMappingURL=file-args.js.map