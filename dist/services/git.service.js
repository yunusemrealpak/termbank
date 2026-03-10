import { execFile } from 'child_process';
import path from 'path';
function runGit(cwd, args) {
    return new Promise((resolve, reject) => {
        execFile('git', args, { cwd, maxBuffer: 1024 * 1024 }, (err, stdout, stderr) => {
            if (err) {
                const detail = stderr.trim() || err.message;
                if (err.code === 'ENOENT') {
                    reject(new Error('git komutu bulunamadı. Git kurulu ve PATH\'te olduğundan emin olun.'));
                }
                else {
                    reject(new Error(`git ${args[0]} başarısız:\n${detail}`));
                }
            }
            else {
                resolve({ stdout: stdout.trim(), stderr: stderr.trim() });
            }
        });
    });
}
// ---------------------------------------------------------------------------
// Public helpers
// ---------------------------------------------------------------------------
export async function isGitRepo(dir) {
    try {
        await runGit(dir, ['rev-parse', '--git-dir']);
        return true;
    }
    catch {
        return false;
    }
}
export async function getCurrentBranch(dir) {
    const { stdout } = await runGit(dir, ['rev-parse', '--abbrev-ref', 'HEAD']);
    return stdout;
}
/** Returns list of files that would be staged under terms/ */
async function getStagedTermFiles(dir) {
    const { stdout } = await runGit(dir, ['diff', '--cached', '--name-only']);
    return stdout
        .split('\n')
        .filter(f => f.startsWith('terms/') && f.endsWith('.md'));
}
/** Returns true if terms/ has any uncommitted (staged or unstaged) changes */
async function hasTermChanges(dir) {
    const { stdout } = await runGit(dir, ['status', '--porcelain', 'terms/']);
    return stdout.length > 0;
}
// ---------------------------------------------------------------------------
// High-level sync
// ---------------------------------------------------------------------------
export async function syncVault(vaultPath, branch, options = {}) {
    const result = { committed: false, pulled: false, pushed: false };
    if (!(await isGitRepo(vaultPath))) {
        throw new Error(`Vault dizini bir git reposu değil: ${vaultPath}\n` +
            `Git sync için önce vault dizinini bir git reposuna bağlayın:\n` +
            `  cd "${vaultPath}" && git init && git remote add origin <repo-url>`);
    }
    if (!options.pullOnly) {
        // Stage all term file changes (new + modified)
        const hasChanges = await hasTermChanges(vaultPath);
        if (hasChanges) {
            await runGit(vaultPath, ['add', 'terms/']);
            const stagedFiles = await getStagedTermFiles(vaultPath);
            if (stagedFiles.length > 0) {
                const termNames = stagedFiles.map(f => path.basename(f, '.md'));
                const message = options.commitMessage ??
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
//# sourceMappingURL=git.service.js.map