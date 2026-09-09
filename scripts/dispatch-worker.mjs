import { spawn } from 'node:child_process';
import {
  appendFileSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from 'node:fs';
const [jobPath] = process.argv.slice(2);
const job = JSON.parse(readFileSync(jobPath, 'utf8'));
const save = () => {
  writeFileSync(`${jobPath}.tmp`, `${JSON.stringify(job, null, 2)}\n`, {
    mode: 0o600,
  });
  renameSync(`${jobPath}.tmp`, jobPath);
};
job.workerPid = process.pid;
job.status = 'running';
job.startedAt = new Date().toISOString();
save();
const options = [
  '--json',
  '-m',
  'gpt-6-astra',
  '-c',
  'model_reasoning_effort="high"',
];
const args = job.resumeThreadId
  ? ['--approve-for-me', 'exec', 'resume', ...options, job.resumeThreadId, '-']
  : ['--approve-for-me', 'exec', ...options, '-C', job.worktree, '-'];
const child = spawn('codex', args, {
  cwd: job.worktree,
  stdio: ['pipe', 'pipe', 'pipe'],
});
let buffer = '';
child.stdout.on('data', (chunk) => {
  appendFileSync(job.logPath, chunk, { mode: 0o600 });
  buffer += chunk;
  let newline;
  while ((newline = buffer.indexOf('\n')) >= 0) {
    const line = buffer.slice(0, newline);
    buffer = buffer.slice(newline + 1);
    try {
      const event = JSON.parse(line);
      if (event.type === 'thread.started' && event.thread_id) {
        job.threadId = event.thread_id;
        save();
      }
    } catch {
      /* Non-JSON diagnostic lines are retained in the private log. */
    }
  }
});
child.stderr.on('data', (chunk) =>
  appendFileSync(job.errorPath, chunk, { mode: 0o600 }),
);
child.on('error', (error) => {
  job.status = 'failed';
  job.error = error.message;
  save();
});
child.on('close', (code) => {
  job.status = code === 0 ? 'completed' : 'failed';
  job.exitCode = code;
  job.completedAt = new Date().toISOString();
  save();
});
child.stdin.end(job.prompt);
