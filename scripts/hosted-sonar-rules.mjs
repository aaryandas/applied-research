export function changedLines(patch) {
  const added = new Set();
  let line = 0;
  for (const row of patch.split('\n')) {
    const hunk = row.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
    if (hunk) {
      line = Number(hunk[1]);
      continue;
    }
    if (row.startsWith('+')) {
      added.add(line);
      line++;
    } else if (row.startsWith(' ')) line++;
  }
  return added;
}

export function findingsOnDiff(findings, files) {
  const changed = new Map();
  for (const file of files) {
    if (
      !/^src\/.*\.(?:[cm]?[jt]sx?|css|html|json)$/.test(file.filename) ||
      file.status === 'removed'
    )
      continue;
    if (typeof file.patch !== 'string')
      throw new Error(`Missing complete diff for ${file.filename}`);
    const lines = changedLines(file.patch);
    if (Number.isInteger(file.additions) && lines.size !== file.additions)
      throw new Error(`Truncated diff for ${file.filename}`);
    changed.set(file.filename, lines);
  }
  return findings.filter((finding) => {
    const path = finding.component.slice(finding.component.indexOf(':') + 1);
    const lines = changed.get(path);
    if (!lines) return false;
    const start = finding.line ?? finding.textRange?.startLine;
    const end = finding.textRange?.endLine ?? start;
    return (
      start === undefined ||
      [...lines].some((line) => line >= start && line <= end)
    );
  });
}

export function validateAnalysis(evidence) {
  return (
    /^[a-f0-9]{40}$/.test(evidence.sha) &&
    evidence.task.status === 'SUCCESS' &&
    typeof evidence.task.analysisId === 'string' &&
    evidence.task.analysisId === evidence.analysis?.key &&
    evidence.analysis.revision === evidence.sha &&
    evidence.gate.status === 'OK' &&
    evidence.findings.length === 0
  );
}
import {
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
} from 'node:fs';
import { join } from 'node:path';

export function rejectSymlinks(directory) {
  if (lstatSync(directory).isSymbolicLink())
    throw new Error('Candidate scanner inputs cannot be symlinks');
  for (const name of readdirSync(directory)) {
    const path = join(directory, name);
    const stat = lstatSync(path);
    if (stat.isSymbolicLink())
      throw new Error('Candidate scanner inputs cannot be symlinks');
    if (stat.isDirectory()) rejectSymlinks(path);
  }
}

export function stageCoverage({ candidate, coveragePath }) {
  // Download outside both checkouts first: a candidate coverage symlink must
  // never redirect artifact extraction over the trusted credentialed scripts.
  rejectSymlinks(coveragePath);
  const report = join(coveragePath, 'lcov.info');
  if (!lstatSync(report).isFile())
    throw new Error('Coverage must be a regular lcov.info file');
  const destination = join(candidate, 'coverage');
  if (existsSync(destination)) rejectSymlinks(destination);
  mkdirSync(destination, { recursive: true });
  copyFileSync(report, join(destination, 'lcov.info'));
}
