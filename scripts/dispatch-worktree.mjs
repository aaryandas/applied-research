import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export function addClaimWorktree({ repository, claim, baseSha }) {
  const git = (args) =>
    execFileSync('git', args, {
      cwd: repository,
      encoding: 'utf8',
      stdio: 'pipe',
      timeout: 30_000,
    }).trim();
  let branchExists = false;
  try {
    git(['show-ref', '--verify', '--quiet', `refs/heads/${claim.branch}`]);
    branchExists = true;
  } catch (error) {
    if (error.status !== 1) throw error;
  }
  mkdirSync(dirname(claim.worktree), { recursive: true });
  if (branchExists) {
    // Reattach the claim's existing branch without resetting its saved work.
    const originalBase = git(['merge-base', baseSha, claim.branch]);
    git(['worktree', 'add', claim.worktree, claim.branch]);
    return originalBase;
  }
  git(['worktree', 'add', '-b', claim.branch, claim.worktree, baseSha]);
  return baseSha;
}
