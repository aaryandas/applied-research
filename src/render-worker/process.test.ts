import { describe, expect, it } from 'vitest';
import { runProcess, safeDiagnostics } from './process.js';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('bounded real child process execution', () => {
  it('uses argv without shell evaluation, drops provider environment, bounds safe diagnostics', async () => {
    process.env.AR_TEST_PROVIDER_SECRET = 'must-not-forward';
    const result = await runProcess({
      command: process.execPath,
      args: [
        '-e',
        'console.log(process.argv[1]); console.error(JSON.stringify([process.env.AR_TEST_PROVIDER_SECRET ?? "absent", process.env.TMPDIR ?? "absent"]))',
        '$(touch /tmp/no-ar-execution)',
      ],
      signal: new AbortController().signal,
      timeoutMs: 3000,
    });
    delete process.env.AR_TEST_PROVIDER_SECRET;
    expect(result.status).toBe('exited');
    expect(result.launch).toBe('started');
    expect(result.stdout.trim()).toBe('$(touch /tmp/no-ar-execution)');
    expect(JSON.parse(result.stderr)).toEqual(['absent', 'absent']);
    expect(safeDiagnostics(result)).toEqual({
      stdout: 'Third-party output withheld.',
      stderr: 'Third-party output withheld.',
    });
    expect(
      safeDiagnostics({ ...result, stdout: 'AR_RENDER_COMPLETE', stderr: '' }),
    ).toEqual({ stdout: 'AR_RENDER_COMPLETE', stderr: '' });
  });
  it('reports unavailable executable and nonzero exit', async () => {
    expect(
      (
        await runProcess({
          command: '/no/ar/program',
          args: [],
          signal: new AbortController().signal,
          timeoutMs: 1000,
        })
      ).status,
    ).toBe('unavailable');
    expect(
      (
        await runProcess({
          command: process.execPath,
          args: ['-e', 'process.exit(7)'],
          signal: new AbortController().signal,
          timeoutMs: 1000,
        })
      ).code,
    ).toBe(7);
  });
  it('kills a real child process group on deadline and bounds diagnostic bytes', async () => {
    const result = await runProcess({
      command: process.execPath,
      args: ['-e', 'setInterval(()=>{},1000)'],
      signal: new AbortController().signal,
      timeoutMs: 40,
    });
    expect(result.status).toBe('timeout');
    const overflow = await runProcess({
      command: process.execPath,
      args: [
        '-e',
        'process.stdout.write("a".repeat(100000));setInterval(()=>{},1000)',
      ],
      signal: new AbortController().signal,
      timeoutMs: 1000,
      maxOutputBytes: 128,
    });
    expect(overflow.status).toBe('output-limit');
    expect(overflow.stdout).toHaveLength(128);
  });
  it('honors pre-start and active cancellation', async () => {
    const controller = new AbortController();
    const pending = runProcess({
      command: process.execPath,
      args: ['-e', 'setInterval(()=>{},1000)'],
      signal: controller.signal,
      timeoutMs: 1000,
    });
    controller.abort();
    expect((await pending).status).toBe('cancelled');
    expect(
      (
        await runProcess({
          command: process.execPath,
          args: [],
          signal: controller.signal,
          timeoutMs: 1000,
        })
      ).status,
    ).toBe('cancelled');
  });
});

it('terminates a real grandchild in the same process group', async () => {
  const result = await runProcess({
    command: process.execPath,
    args: [
      '-e',
      'const {spawn}=require("node:child_process");const child=spawn(process.execPath,["-e","setInterval(()=>{},1000)"],{stdio:"ignore"});console.log(child.pid);setInterval(()=>{},1000)',
    ],
    signal: new AbortController().signal,
    timeoutMs: 150,
  });
  expect(result.status).toBe('timeout');
  const grandchild = Number(result.stdout.trim());
  expect(grandchild).toBeGreaterThan(0);
  await expect
    .poll(() => {
      try {
        process.kill(grandchild, 0);
        return 'running';
      } catch {
        return 'gone';
      }
    })
    .toBe('gone');
});

it('normalizes Docker connection diagnostics without retaining paths or source labels', () => {
  expect(
    safeDiagnostics({
      launch: 'started',
      status: 'exited',
      code: 1,
      stdout: '',
      stderr:
        'failed to connect to the docker API at unix:///private/source-label.sock; check if the daemon is running',
    }),
  ).toEqual({ stdout: '', stderr: 'Cannot connect to the Docker daemon' });
});

it('classifies an existing non-executable file without echoing its path', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'ar-process-access-'));
  const command = join(directory, 'private-label');
  try {
    await writeFile(command, '#!/bin/sh\nexit 0\n', { mode: 0o600 });
    const result = await runProcess({
      command,
      args: [],
      signal: new AbortController().signal,
      timeoutMs: 1000,
    });
    expect(result).toMatchObject({
      status: 'unavailable',
      launch: 'not-started',
      stderr: 'permission denied',
    });
    expect(result.stderr).not.toContain(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
