import fs from 'fs';
import { AttachedFile } from '../utils/file-args.js';

const WARN_SIZE_BYTES = 50 * 1024; // 50KB

export function buildAttachmentContext(files: AttachedFile[]): {
  textBlocks: string;
  fileFlags: string[];
} {
  const textParts: string[] = [];
  const fileFlags: string[] = [];

  for (const f of files) {
    if (f.type === 'text') {
      const stat = fs.statSync(f.absolutePath);
      if (stat.size > WARN_SIZE_BYTES) {
        console.warn(
          `Uyarı: "${f.name}" büyük bir metin dosyası (${Math.round(stat.size / 1024)}KB). Prompt token sayısını artırabilir.`,
        );
      }
      const content = fs.readFileSync(f.absolutePath, 'utf-8');
      textParts.push(`<file name="${f.name}">\n${content}\n</file>`);
    } else {
      // image or document — pass via --file flag to Claude CLI
      fileFlags.push('--file', f.absolutePath);
    }
  }

  return {
    textBlocks: textParts.join('\n\n'),
    fileFlags,
  };
}
