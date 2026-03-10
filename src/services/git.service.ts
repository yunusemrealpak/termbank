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

/** Returns list of files that would be staged under terms/ */
async function getStagedTermFiles(dir: string): Promise<string[]> {
  const { stdout } = await runGit(dir, ['diff', '--cached', '--name-only']);
  return stdout
    .split('\n')
    .filter(f => f.startsWith('terms/') && f.endsWith('.md'));
}

/** Returns true if terms/ has any uncommitted (staged or unstaged) changes */
async function hasTermChanges(dir: string): Promise<boolean> {
  const { stdout } = await runGit(dir, ['status', '--porcelain', 'terms/']);
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
    // Stage all term file changes (new + modified)
    const hasChanges = await hasTermChanges(vaultPath);
    if (hasChanges) {
      await runGit(vaultPath, ['add', 'terms/']);

      const stagedFiles = await getStagedTermFiles(vaultPath);
      if (stagedFiles.length > 0) {
        const termNames = stagedFiles.map(f => path.basename(f, '.md'));
        const message =
          options.commitMessage ??
          (termNames.length === 1
            ? `Add term: ${termNames[0]}`
            : `Add terms: ${termNames.join(', ')}`);

        await runGit(vaultPath, ['commit', '-m', message]);
        result.committed = true;
        result.commitMessage = message;
        result.newTerms = termNames;
      }
    }
  }

  // Pull with rebase — rebase keeps history clean for term-only repos
  await runGit(vaultPath, ['pull', '--rebase', 'origin', branch]);
  result.pulled = true;

  if (!options.pullOnly) {
    await runGit(vaultPath, ['push', 'origin', branch]);
    result.pushed = true;
  }

  return result;
}
