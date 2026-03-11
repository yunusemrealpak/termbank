import { execFile } from 'child_process';
import path from 'path';

export interface SyncResult {
  committed: boolean;
  pulled: boolean;
  pushed: boolean;
  commitMessage?: string;
  newTerms?: string[];
  error?: string;
}

// ---------------------------------------------------------------------------
// Low-level git runner
// ---------------------------------------------------------------------------

interface ExecResult {
  stdout: string;
  stderr: string;
}

function runGit(cwd: string, args: string[]): Promise<ExecResult> {
  return new Promise((resolve, reject) => {
    execFile('git', args, { cwd, maxBuffer: 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) {
        const detail = stderr.trim() || err.message;
        if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
          reject(new Error('git komutu bulunamadı. Git kurulu ve PATH\'te olduğundan emin olun.'));
        } else {
          reject(new Error(`git ${args[0]} başarısız:\n${detail}`));
        }
      } else {
        resolve({ stdout: stdout.trim(), stderr: stderr.trim() });
      }
    });
  });
}

// ---------------------------------------------------------------------------
// Public helpers
// ---------------------------------------------------------------------------

export async function isGitRepo(dir: string): Promise<boolean> {
  try {
    await runGit(dir, ['rev-parse', '--git-dir']);
    return true;
  } catch {
    return false;
  }
}

export async function getCurrentBranch(dir: string): Promise<string> {
  const { stdout } = await runGit(dir, ['rev-parse', '--abbrev-ref', 'HEAD']);
  return stdout;
}

const VAULT_CONTENT_DIRS = ['terms/', 'notes/', 'visuals/'];

/** Returns list of .md files staged under terms/, notes/, or visuals/ */
async function getStagedContentFiles(dir: string): Promise<string[]> {
  const { stdout } = await runGit(dir, ['diff', '--cached', '--name-only']);
  return stdout
    .split('\n')
    .filter(f => VAULT_CONTENT_DIRS.some(d => f.startsWith(d)) && f.endsWith('.md'));
}

/** Returns true if working tree has any uncommitted changes */
async function hasAnyChanges(dir: string): Promise<boolean> {
  const { stdout } = await runGit(dir, ['status', '--porcelain']);
  return stdout.length > 0;
}

// ---------------------------------------------------------------------------
// High-level sync
// ---------------------------------------------------------------------------

export async function syncVault(
  vaultPath: string,
  branch: string,
  options: { pullOnly?: boolean; commitMessage?: string } = {},
): Promise<SyncResult> {
  const result: SyncResult = { committed: false, pulled: false, pushed: false };

  if (!(await isGitRepo(vaultPath))) {
    throw new Error(
      `Vault dizini bir git reposu değil: ${vaultPath}\n` +
      `Git sync için önce vault dizinini bir git reposuna bağlayın:\n` +
      `  cd "${vaultPath}" && git init && git remote add origin <repo-url>`,
    );
  }

  if (!options.pullOnly) {
    // Stage everything in the vault (content + Obsidian metadata, plugins, etc.)
    const hasChanges = await hasAnyChanges(vaultPath);
    if (hasChanges) {
      await runGit(vaultPath, ['add', '-A']);

      const contentFiles = await getStagedContentFiles(vaultPath);
      let message = options.commitMessage;
      if (!message) {
        if (contentFiles.length === 1) {
          const [file] = contentFiles;
          const dirLabel = VAULT_CONTENT_DIRS.find(d => file.startsWith(d))!.replace('/', '');
          const name = path.basename(file, '.md');
          message = `Add ${dirLabel.replace(/s$/, '')}: ${name}`;
        } else if (contentFiles.length > 1) {
          const counts = VAULT_CONTENT_DIRS.map(d => ({
            label: d.replace('/', ''),
            n: contentFiles.filter(f => f.startsWith(d)).length,
          })).filter(c => c.n > 0);
          message = `Sync vault: ${counts.map(c => `${c.n} ${c.label}`).join(', ')}`;
        } else {
          message = 'chore: sync vault';
        }
      }

      await runGit(vaultPath, ['commit', '-m', message]);
      result.committed = true;
      result.commitMessage = message;
      result.newTerms = contentFiles.map(f => path.basename(f, '.md'));
    }
  }

  // Pull with rebase — everything is committed so no stash needed
  await runGit(vaultPath, ['pull', '--rebase', 'origin', branch]);
  result.pulled = true;

  if (!options.pullOnly) {
    await runGit(vaultPath, ['push', 'origin', branch]);
    result.pushed = true;
  }

  return result;
}
