import fs from 'fs';
import path from 'path';
import os from 'os';

export interface AttachedFile {
  path: string;        // original @ argument (without @)
  absolutePath: string;
  name: string;        // basename
  type: 'image' | 'document' | 'text';
}

const IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg']);
const DOCUMENT_EXTS = new Set(['.pdf']);

function detectFileType(filePath: string): 'image' | 'document' | 'text' {
  const ext = path.extname(filePath).toLowerCase();
  if (IMAGE_EXTS.has(ext)) return 'image';
  if (DOCUMENT_EXTS.has(ext)) return 'document';
  return 'text';
}

function expandPath(rawPath: string): string {
  if (rawPath.startsWith('~/') || rawPath === '~') {
    return path.join(os.homedir(), rawPath.slice(2));
  }
  return path.resolve(rawPath);
}

export function parseFileArgs(args: string[]): { title?: string; files: AttachedFile[] } {
  let title: string | undefined;
  const files: AttachedFile[] = [];

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
    } else if (title === undefined) {
      title = arg;
    }
  }

  return { title, files };
}
