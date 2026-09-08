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
const root = await mkdtemp(join(evidence, 'probe-'));
const receipt = {};
try {
  const worker = await AnimationRenderWorker.create({ temporaryRoot: root });
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
    temporaryRoot: root,
    timeoutMs: 1000,
  });
  receipt.timeout = await deadline.render(JSON.stringify(LINEAR_EXAMPLE));
  assert.equal(receipt.timeout.reason, 'timeout');
  await deadline.close();
  const broken = await AnimationRenderWorker.create({
    temporaryRoot: root,
    docker: '/no/ar/docker',
  });
  receipt.unavailable = await broken.render(JSON.stringify(LINEAR_EXAMPLE));
  assert.equal(receipt.unavailable.status, 'failed');
  assert.equal(receipt.unavailable.reason, 'runtime');
  assert.equal(receipt.unavailable.diagnostics.stderr, 'Executable not found');
  await broken.close();
  // A real Docker CLI pointed at a nonexistent private socket, without changing any context/daemon.
  const offlineSocket = `unix://${root}/absent.sock`;
  const disconnected = await AnimationRenderWorker.create({
    temporaryRoot: root,
    run: (request) =>
      runProcess(
        request.command === 'docker'
          ? {
              ...request,
              args: ['--host', offlineSocket, ...request.args.slice(2)],
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
      ffprobe: 'ffprobe',
      ffmpeg: 'ffmpeg',
    }),
  );
  receipt.truncatedActualMp4 = 'rejected';
  const containers = await runProcess({
    command: 'docker',
    args: [
      '--context',
      'orbstack',
      'ps',
      '-a',
      '--filter',
      'name=ar-manim-',
      '--format',
      '{{.Names}}',
    ],
    signal: new AbortController().signal,
    timeoutMs: 5000,
  });
  assert.equal(containers.code, 0);
  assert.equal(containers.stdout.trim(), '');
  receipt.remainingContainers = [];
  await writeFile(
    join(evidence, 'runtime-probes.json'),
    JSON.stringify(receipt, null, 2),
  );
  console.log(JSON.stringify(receipt));
} finally {
  await rm(root, { recursive: true, force: true });
}
