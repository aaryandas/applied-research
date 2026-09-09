import { evidenceDirectory } from './evidence-paths.mjs';
import assert from 'node:assert/strict';
import {
  copyFile,
  mkdtemp,
  open,
  readdir,
  rm,
  writeFile,
} from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const evidence = await evidenceDirectory(process.argv[2]);
const moduleUrl = (name) =>
  pathToFileURL(join(evidence, 'compiled/render-worker', name)).href;
const { AnimationRenderWorker } = await import(moduleUrl('worker.js'));
const { LINEAR_EXAMPLE } = await import(moduleUrl('fixtures.js'));
const { verifyMedia } = await import(moduleUrl('media.js'));
const { runProcess } = await import(moduleUrl('process.js'));
const { resolveTrustedWorkerRuntime, workerCreateOptions, dockerCliArgs } =
  await import(moduleUrl('trusted-runtime.js'));
const runtime = await resolveTrustedWorkerRuntime(process.argv.slice(3));
const workerRuntime = workerCreateOptions(runtime);
const root = await mkdtemp(join(evidence, 'probe-'));
const receipt = {};
try {
  const worker = await AnimationRenderWorker.create({
    ...workerRuntime,
    temporaryRoot: root,
  });
  const cancel = new AbortController();
  const rendering = worker.render(
    JSON.stringify(LINEAR_EXAMPLE),
    cancel.signal,
  );
  const queuedCancel = new AbortController();
  const queued = worker.render(
    JSON.stringify(LINEAR_EXAMPLE),
    queuedCancel.signal,
  );
  queuedCancel.abort();
  const timer = setTimeout(() => cancel.abort(), 2500);
  receipt.queuedCancellation = await queued;
  receipt.activeCancellation = await rendering;
  clearTimeout(timer);
  assert.equal(receipt.queuedCancellation.status, 'cancelled');
  assert.equal(receipt.activeCancellation.status, 'cancelled');
  await worker.close();
  const deadline = await AnimationRenderWorker.create({
    ...workerRuntime,
    temporaryRoot: root,
    timeoutMs: 1000,
  });
  receipt.timeout = await deadline.render(JSON.stringify(LINEAR_EXAMPLE));
  assert.equal(receipt.timeout.reason, 'timeout');
  await deadline.close();
  const broken = await AnimationRenderWorker.create({
    ...workerRuntime,
    temporaryRoot: root,
    docker: '/no/ar/docker',
  });
  receipt.unavailable = await broken.render(JSON.stringify(LINEAR_EXAMPLE));
  assert.equal(receipt.unavailable.status, 'failed');
  assert.equal(receipt.unavailable.reason, 'runtime');
  assert.equal(receipt.unavailable.diagnostics.stderr, 'Executable not found');
  await broken.close();
  // Point only at a nonexistent private socket. Docker rejects --context together
  // with --host ("conflicting options") before any daemon connection is attempted.
  const offlineSocket = `unix://${root}/absent.sock`;
  const disconnected = await AnimationRenderWorker.create({
    ...workerRuntime,
    temporaryRoot: root,
    run: (request) =>
      runProcess(
        request.command === runtime.docker
          ? {
              ...request,
              args: [
                '--host',
                offlineSocket,
                ...(request.args[0] === '--context'
                  ? request.args.slice(2)
                  : request.args),
              ],
            }
          : request,
      ),
  });
  receipt.daemonUncertain = await disconnected.render(
    JSON.stringify(LINEAR_EXAMPLE),
  );
  assert.equal(receipt.daemonUncertain.status, 'failed');
  assert.equal(receipt.daemonUncertain.reason, 'cleanup');
  assert.match(
    receipt.daemonUncertain.diagnostics.stderr,
    /Cannot connect to the Docker daemon/,
  );
  await disconnected.close();
  assert.deepEqual(await readdir(root), []);
  const damaged = await mkdtemp(join(root, 'damaged-'));
  const path = join(damaged, 'artifact.mp4');
  await copyFile(join(evidence, 'renders/linear-shear.mp4'), path);
  const file = await open(path, 'r+');
  await file.truncate(1024);
  await file.close();
  await assert.rejects(
    verifyMedia(damaged, new AbortController().signal, {
      run: runProcess,
      ffprobe: runtime.ffprobe,
      ffmpeg: runtime.ffmpeg,
    }),
  );
  receipt.truncatedActualMp4 = 'rejected';
  const containers = await runProcess({
    command: runtime.docker,
    args: dockerCliArgs(runtime.dockerContext, [
      'ps',
      '-a',
      '--filter',
      'name=ar-manim-',
      '--format',
      '{{.Names}}',
    ]),
    signal: new AbortController().signal,
    timeoutMs: 5000,
  });
  assert.equal(containers.code, 0);
  assert.equal(containers.stdout.trim(), '');
  receipt.remainingContainers = [];
  receipt.runtime = {
    docker: runtime.docker,
    dockerContext: runtime.dockerContext,
    ffmpeg: runtime.ffmpeg,
    ffprobe: runtime.ffprobe,
  };
  await writeFile(
    join(evidence, 'runtime-probes.json'),
    JSON.stringify(receipt, null, 2),
  );
  console.log(JSON.stringify(receipt));
} finally {
  await rm(root, { recursive: true, force: true });
}
