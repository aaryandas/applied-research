import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const CONVENTIONAL_SUBJECT =
  /^(feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert)(\([a-z0-9-]+\))?: AR-\d+ .+$/;

export function validateMetadata({ title, subjects }) {
  const errors = [];
  if (!CONVENTIONAL_SUBJECT.test(title))
    errors.push(
      `PR title must match type(scope): AR-NN description; received "${title}"`,
    );
  subjects.forEach((subject, index) => {
    if (!CONVENTIONAL_SUBJECT.test(subject))
      errors.push(
        `commit ${index + 1} must match type(scope): AR-NN description; received "${subject}"`,
      );
  });
  return errors;
}

function commitSubjects(baseSha, headSha) {
  return execFileSync('git', ['log', '--format=%s', `${baseSha}..${headSha}`], {
    encoding: 'utf8',
  })
    .split('\n')
    .map((subject) => subject.trim())
    .filter(Boolean);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const errors = validateMetadata({
    title: process.env.PR_TITLE ?? '',
    subjects: commitSubjects(
      process.env.BASE_SHA ?? '',
      process.env.HEAD_SHA ?? '',
    ),
  });
  if (errors.length) {
    console.error(errors.join('\n'));
    process.exit(1);
  }
  console.log(
    'PR title and commit subjects use conventional AR ticket metadata.',
  );
}
